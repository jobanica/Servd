/**
 * Servd outreach render worker — a small standalone Node + FFmpeg service.
 *
 * POST /render  { video_id }   (header: x-worker-secret)  -> 202, renders async
 * GET  /health
 *
 * Per job: download the phone's intro + assets/tail.mp4 from Storage, normalize
 * the intro to the canonical spec, concat intro+tail into one vertical MP4,
 * upload final/{id}.mp4, and flip outreach_videos.status to ready (or failed).
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WORKER_SHARED_SECRET,
 *      STORAGE_BUCKET (default "outreach-videos").
 *
 * FFmpeg must be on PATH (installed at the OS layer — see Dockerfile).
 */
const http = require("http");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const PORT = process.env.PORT || 8080;
const BUCKET = process.env.STORAGE_BUCKET || "outreach-videos";
const SECRET = process.env.WORKER_SHARED_SECRET || "";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${err.slice(-800)}`))));
    p.on("error", reject);
  });
}

async function download(storagePath, dest) {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error || !data) throw new Error(`download ${storagePath}: ${error?.message ?? "missing"}`);
  const buf = Buffer.from(await data.arrayBuffer());
  fs.writeFileSync(dest, buf);
}

async function setStatus(id, fields) {
  await supabase.from("outreach_videos").update({ ...fields, updatedAt: new Date().toISOString() }).eq("id", id);
}

const V = "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30";

async function render(id) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `outreach-${id}-`));
  const intro = path.join(dir, "intro_in");
  const introNorm = path.join(dir, "intro_norm.mp4");
  const tail = path.join(dir, "tail.mp4");
  const final = path.join(dir, "final.mp4");
  try {
    await setStatus(id, { status: "rendering", errorMessage: null });
    await download(`intro/${id}`, intro);
    await download("assets/tail.mp4", tail);

    // Normalize the phone intro to the canonical spec (absorbs mp4 vs webm).
    await run("ffmpeg", [
      "-y", "-i", intro,
      "-vf", V,
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", "48000", "-ac", "2",
      "-movflags", "+faststart", introNorm,
    ]);

    // Filter-based concat (re-encodes; tolerant of differing inputs).
    await run("ffmpeg", [
      "-y", "-i", introNorm, "-i", tail,
      "-filter_complex", "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]",
      "-map", "[v]", "-map", "[a]",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", "48000", "-ac", "2",
      "-movflags", "+faststart", final,
    ]);

    const bytes = fs.readFileSync(final);
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(`final/${id}.mp4`, bytes, { contentType: "video/mp4", upsert: true });
    if (upErr) throw new Error(`upload final: ${upErr.message}`);

    await setStatus(id, { status: "ready", finalPath: `final/${id}.mp4`, errorMessage: null });
  } catch (e) {
    console.error(`render ${id} failed:`, e.message);
    await setStatus(id, { status: "failed", errorMessage: String(e.message).slice(0, 500) }).catch(() => {});
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ ok: true }));
  }
  if (req.method === "POST" && req.url === "/render") {
    if (!SECRET || req.headers["x-worker-secret"] !== SECRET) {
      res.writeHead(401);
      return res.end("unauthorized");
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let id;
      try {
        id = JSON.parse(body || "{}").video_id;
      } catch {
        /* ignore */
      }
      if (!id) {
        res.writeHead(400);
        return res.end("missing video_id");
      }
      // Idempotency: skip if already done.
      supabase
        .from("outreach_videos")
        .select("status")
        .eq("id", id)
        .single()
        .then(({ data }) => {
          if (data && data.status === "ready") return;
          render(id); // fire-and-forget
        });
      res.writeHead(202);
      res.end("accepted");
    });
    return;
  }
  res.writeHead(404);
  res.end("not found");
});

server.listen(PORT, () => console.log(`outreach worker on :${PORT}`));
