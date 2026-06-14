/**
 * Classifies a menu-item video URL so the player knows how to render it:
 *  - youtube/vimeo → lazy iframe embed (privacy-friendly, user-initiated play)
 *  - file          → native <video> (uploaded mp4/webm or a direct link)
 * Pure + testable.
 */
export type VideoSource =
  | { kind: "youtube" | "vimeo"; embedUrl: string }
  | { kind: "file"; url: string };

export function parseVideoSource(url: string): VideoSource {
  const yt =
    url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) {
    return { kind: "youtube", embedUrl: `https://www.youtube-nocookie.com/embed/${yt[1]}` };
  }
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) {
    return { kind: "vimeo", embedUrl: `https://player.vimeo.com/video/${vimeo[1]}` };
  }
  return { kind: "file", url };
}
