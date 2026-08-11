"use client";

import { useState } from "react";

/**
 * A click-to-load video facade.
 *
 * The embed is NOT rendered until someone taps play. A YouTube iframe pulls
 * roughly a megabyte of script before anyone has asked to watch anything, and
 * on the phone-in-a-Facebook-browser this page is built for, that megabyte is
 * paid for in people who leave before the hero finishes painting.
 *
 * Until then it's a poster and a play button: same shape, same layout, no cost.
 */
export function LazyVideo({
  src,
  poster,
  title = "How to create your restaurant preview",
}: {
  src: string;
  poster?: string;
  title?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const embed = toEmbedUrl(src);
  const isFile = /\.(mp4|webm|mov)(\?|$)/i.test(src);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-tile border border-plum-ink/10 bg-plum-ink shadow-lg">
      {!playing ? (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label="Play the video"
          className="group absolute inset-0 h-full w-full"
        >
          {poster ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={poster}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="absolute inset-0 bg-brand-gradient opacity-90" />
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-plum-ink/25">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/95 shadow-xl transition group-active:scale-95">
              <svg viewBox="0 0 24 24" className="ml-1 h-7 w-7 fill-plum-ink" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </span>
        </button>
      ) : isFile ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video src={src} poster={poster} controls autoPlay playsInline className="h-full w-full" />
      ) : (
        <iframe
          src={embed}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="h-full w-full"
        />
      )}
    </div>
  );
}

/**
 * Normalizes the configured URL to something embeddable, so the founder can
 * paste whatever YouTube gave them (watch link, share link, or embed) and have
 * it work. Anything unrecognized is passed through untouched.
 */
export function toEmbedUrl(src: string): string {
  const autoplay = "autoplay=1&rel=0&playsinline=1";
  const yt = src.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{6,})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}?${autoplay}`;
  const vimeo = src.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}?autoplay=1`;
  return src;
}
