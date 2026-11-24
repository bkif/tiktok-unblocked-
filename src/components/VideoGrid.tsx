"use client";

import { Play } from "lucide-react";
import { formatCompactNumber, formatDuration } from "@/lib/format";
import type { TikTokVideoItem } from "@/types/tiktok";

interface VideoGridProps {
  videos: TikTokVideoItem[];
  onSelectVideo: (index: number) => void;
}

export function VideoGrid({ videos, onSelectVideo }: VideoGridProps) {
  if (videos.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {videos.map((video, index) => (
        <button
          key={`${video.id}-${index}`}
          type="button"
          onClick={() => onSelectVideo(index)}
          aria-label={`Play video: ${video.description || video.id}`}
          className="group relative aspect-[9/16] w-full overflow-hidden rounded-xl border border-white/10 bg-[#121216] text-left transition hover:border-cyan-400/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
        >
          {video.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={video.coverUrl}
              alt={video.description || "TikTok video cover"}
              loading="lazy"
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-zinc-900 text-xs text-zinc-500">
              No preview
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/20" />

          {video.duration > 0 && (
            <span className="absolute top-2 right-2 rounded-md bg-black/65 px-1.5 py-0.5 font-mono text-[10px] text-zinc-200 backdrop-blur-sm">
              {formatDuration(video.duration)}
            </span>
          )}

          <div className="absolute inset-x-0 bottom-0 space-y-1 p-2.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-white">
              <Play className="h-3.5 w-3.5 fill-white" aria-hidden="true" />
              <span className="font-mono">
                {formatCompactNumber(video.stats.playCount)}
              </span>
            </div>
            {video.description && (
              <p className="line-clamp-2 text-[11px] leading-snug text-zinc-300">
                {video.description}
              </p>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
