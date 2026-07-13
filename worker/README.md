# Servd outreach render worker

Optional standalone service that stitches each personalized phone **intro** with a
pre-baked **tail** (solution + CTA) into one vertical MP4. The Servd app works
without it (it falls back to the raw personalized intro as the deliverable); deploy
this to get the stitched intro+tail output with **zero app changes**.

## 1. Pre-bake the tail once (locally) and upload it

The solution + CTA clip never changes — bake it once to the canonical spec and
upload it to Storage as `assets/tail.mp4` in the `outreach-videos` bucket.

```bash
ffmpeg -i solution.mp4 -i cta.mp4 \
  -filter_complex "\
    [0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v0];\
    [1:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v1];\
    [v0][0:a][v1][1:a]concat=n=2:v=1:a=1[v][a]" \
  -map "[v]" -map "[a]" -c:v libx264 -pix_fmt yuv420p -c:a aac -ar 48000 -ac 2 \
  -movflags +faststart tail.mp4
# then upload tail.mp4 to bucket "outreach-videos" at path assets/tail.mp4
```

## 2. Deploy (Railway or Render)

New service → deploy this folder via the Dockerfile. Set env vars:

```
SUPABASE_URL=                 # same project URL as the app
SUPABASE_SERVICE_ROLE_KEY=    # service role key (server-only)
WORKER_SHARED_SECRET=         # any long random string
STORAGE_BUCKET=outreach-videos
```

Note the public URL, then set on the **Servd app**:

```
WORKER_URL=https://<your-worker-url>
WORKER_SHARED_SECRET=<same as above>
```

## 3. Endpoints

- `POST /render` `{ "video_id": "..." }` with header `x-worker-secret: <secret>` → `202`, renders async.
- `GET /health` → `{ ok: true }`.

Renders complete in seconds because the heavy tail is pre-baked; the worker only
normalizes the short intro and concatenates.
