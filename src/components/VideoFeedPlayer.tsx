"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  BadgeCheck,
  Bookmark,
  ChevronDown,
  ChevronUp,
  Download,
  Heart,
  MessageCircle,
  Music2,
  Pause,
  Play,
  RefreshCw,
  Share2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { formatCompactNumber, formatDuration, formatTimestamp } from "@/lib/format";
import type { TikTokVideoItem } from "@/types/tiktok";

const PLAYBACK_RATES = [1, 1.5, 2] as const;

interface VideoFeedPlayerProps {
  videos: TikTokVideoItem[];
  initialIndex?: number;
  onSelectHashtag?: (tag: string) => void;
  onRetry?: () => void;
}

interface SingleVideoSlideProps {
  video: TikTokVideoItem;
  isActive: boolean;
  muted: boolean;
  playbackRate: number;
  onToggleMute: () => void;
  onCyclePlaybackRate: () => void;
  onSelectHashtag?: (tag: string) => void;
  onRetry?: () => void;
}

function SingleVideoSlide({
  video,
  isActive,
  muted,
  playbackRate,
  onToggleMute,
  onCyclePlaybackRate,
  onSelectHashtag,
  onRetry,
}: SingleVideoSlideProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(video.duration || 0);
  const [streamError, setStreamError] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = muted;
  }, [muted]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.playbackRate = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !video.hasStream) return;

    if (isActive) {
      const playPromise = el.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => setIsPlaying(true))
          .catch(() => setIsPlaying(false));
      }
    } else {
      el.pause();
      setIsPlaying(false);
    }
  }, [isActive, video.hasStream]);

  const togglePlayPause = useCallback(() => {
    const el = videoRef.current;
    if (!el || !video.hasStream) return;
    if (el.paused) {
      el.play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    } else {
      el.pause();
      setIsPlaying(false);
    }
  }, [video.hasStream]);

  const handleSeek = (nextTime: number) => {
    const el = videoRef.current;
    if (!el || !Number.isFinite(nextTime)) return;
    el.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const handleCopyCanonical = async () => {
    try {
      await navigator.clipboard.writeText(video.canonicalUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <article
      aria-label={`Video by @${video.author.uniqueId}`}
      className="flex h-full w-full snap-start snap-always flex-col items-center justify-center lg:flex-row lg:gap-8 lg:px-6"
    >
      {/* 9:16 Video Stage */}
      <div className="relative flex h-full w-full max-w-[440px] shrink-0 items-center justify-center overflow-hidden bg-black sm:rounded-2xl sm:border sm:border-white/10 lg:h-[82dvh] lg:max-h-[820px] lg:w-auto lg:aspect-[9/16]">
        {video.hasStream && !streamError ? (
          <>
            <video
              ref={videoRef}
              src={video.playUrl}
              poster={video.coverUrl || undefined}
              playsInline
              loop
              preload={isActive ? "auto" : "metadata"}
              muted={muted}
              onClick={togglePlayPause}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onLoadedMetadata={(e) => {
                if (Number.isFinite(e.currentTarget.duration)) {
                  setDuration(e.currentTarget.duration);
                }
              }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onError={() => setStreamError(true)}
              className="h-full w-full cursor-pointer object-contain"
            />

            {/* Center Play Indicator when paused */}
            {!isPlaying && (
              <button
                type="button"
                onClick={togglePlayPause}
                aria-label="Play video"
                className="absolute inset-0 m-auto flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white backdrop-blur-md transition hover:scale-105 hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                <Play className="ml-1 h-7 w-7 fill-white" />
              </button>
            )}
          </>
        ) : (
          <div className="relative flex h-full w-full flex-col items-center justify-center bg-[#121216] p-6 text-center">
            {video.coverUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={video.coverUrl}
                alt={video.description || "TikTok video preview"}
                className="absolute inset-0 h-full w-full object-cover opacity-35 blur-[2px]"
              />
            )}
            <div className="relative z-10 max-w-xs space-y-3 rounded-2xl border border-white/15 bg-black/75 p-5 backdrop-blur-md">
              <AlertCircle className="mx-auto h-8 w-8 text-amber-400" />
              <p className="text-sm font-medium text-white">
                {streamError
                  ? "Video stream failed to load through proxy."
                  : "Preview-only mode (oEmbed fallback)."}
              </p>
              <p className="text-xs text-zinc-400">
                TikTok temporarily throttled direct stream extraction for this item.
              </p>
              {onRetry && (
                <button
                  type="button"
                  onClick={() => {
                    setStreamError(false);
                    onRetry();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-400 px-3.5 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Retry Full Stream</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Top Floating Controls */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-3">
          <span className="pointer-events-auto rounded-full border border-white/10 bg-black/45 px-2.5 py-1 font-mono text-[11px] text-zinc-200 backdrop-blur-md">
            Proxied
          </span>

          <div className="pointer-events-auto flex items-center gap-2">
            {video.hasStream && (
              <button
                type="button"
                onClick={onCyclePlaybackRate}
                aria-label={`Playback speed ${playbackRate}x. Click to change.`}
                className="rounded-full border border-white/15 bg-black/45 px-2.5 py-1.5 font-mono text-xs font-medium text-white backdrop-blur-md transition hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                {playbackRate}x
              </button>
            )}

            <button
              type="button"
              onClick={onToggleMute}
              aria-label={muted ? "Unmute video" : "Mute video"}
              className="rounded-full border border-white/15 bg-black/45 p-2 text-white backdrop-blur-md transition hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              {muted ? (
                <VolumeX className="h-4 w-4 text-rose-400" />
              ) : (
                <Volume2 className="h-4 w-4 text-cyan-400" />
              )}
            </button>
          </div>
        </div>

        {/* Bottom Glass Overlay (Mobile info + Scrubber) */}
        <div className="safe-pb pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-4 pt-12 pb-3">
          {/* Mobile Metadata Overlay (hidden on lg where side panel shows) */}
          <div className="pointer-events-auto mb-3 space-y-2 lg:hidden">
            <div className="flex items-center justify-between gap-3">
              <Link
                href={`/user/${encodeURIComponent(video.author.uniqueId)}`}
                className="flex min-w-0 items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 rounded-lg"
              >
                {video.author.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={video.author.avatarUrl}
                    alt={video.author.nickname}
                    className="h-9 w-9 shrink-0 rounded-full border border-white/20 object-cover"
                  />
                ) : (
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/20 bg-zinc-800 text-xs font-bold">
                    {video.author.nickname.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="truncate text-sm font-semibold text-white">
                      @{video.author.uniqueId}
                    </span>
                    {video.author.verified && (
                      <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
                    )}
                  </div>
                  <p className="truncate text-xs text-zinc-300">
                    {video.author.nickname}
                  </p>
                </div>
              </Link>

              {video.downloadUrl && (
                <a
                  href={video.downloadUrl}
                  download
                  aria-label="Download MP4"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/15 bg-black/50 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md transition hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                >
                  <Download className="h-3.5 w-3.5 text-cyan-400" />
                  <span>MP4</span>
                </a>
              )}
            </div>

            {video.description && (
              <p className="line-clamp-2 text-xs leading-relaxed text-zinc-200">
                {video.description}
              </p>
            )}
          </div>

          {/* Scrubber & Play/Pause Bar */}
          {video.hasStream && (
            <div className="pointer-events-auto flex items-center gap-2.5">
              <button
                type="button"
                onClick={togglePlayPause}
                aria-label={isPlaying ? "Pause video" : "Play video"}
                className="rounded-lg p-1 text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                {isPlaying ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </button>

              <input
                type="range"
                min={0}
                max={duration > 0 ? duration : 100}
                step={0.1}
                value={Math.min(currentTime, duration || 100)}
                onChange={(e) => handleSeek(Number(e.target.value))}
                aria-label="Seek video timeline"
                className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/25 accent-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              />

              <span className="shrink-0 font-mono text-[11px] text-zinc-300">
                {formatDuration(currentTime)} / {formatDuration(duration)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Desktop Theater Flanking Metadata Panel */}
      <aside className="hidden w-full max-w-sm flex-col justify-between space-y-5 rounded-2xl border border-white/10 bg-[#121216] p-6 lg:flex lg:max-h-[82dvh] lg:overflow-y-auto">
        <div className="space-y-5">
          {/* Creator Header */}
          <Link
            href={`/user/${encodeURIComponent(video.author.uniqueId)}`}
            className="group flex items-center gap-3 rounded-xl p-1.5 -m-1.5 transition hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            {video.author.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={video.author.avatarUrl}
                alt={video.author.nickname}
                className="h-12 w-12 shrink-0 rounded-full border border-white/15 object-cover"
              />
            ) : (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/15 bg-zinc-800 text-base font-bold text-zinc-300">
                {video.author.nickname.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-semibold text-white group-hover:text-cyan-300">
                  {video.author.nickname}
                </span>
                {video.author.verified && (
                  <BadgeCheck className="h-4 w-4 shrink-0 text-cyan-400" />
                )}
              </div>
              <p className="truncate font-mono text-xs text-zinc-400">
                @{video.author.uniqueId}
              </p>
            </div>
          </Link>

          {/* Caption */}
          {video.description && (
            <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-200">
              {video.description}
            </p>
          )}

          {/* Hashtags */}
          {video.hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {video.hashtags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onSelectHashtag?.(`#${tag}`)}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-cyan-300 transition hover:border-cyan-400/40 hover:bg-cyan-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}

          {/* Audio Info */}
          {video.music && (
            <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
              <Music2
                className="h-4 w-4 shrink-0 text-cyan-400"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-zinc-200">
                  {video.music.title}
                </p>
                <p className="truncate text-[11px] text-zinc-400">
                  {video.music.authorName}
                </p>
              </div>
            </div>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-2.5 border-y border-white/10 py-4">
            <div className="flex items-center gap-2 text-xs text-zinc-300">
              <Heart className="h-4 w-4 text-rose-400" aria-hidden="true" />
              <span className="font-mono font-medium">
                {formatCompactNumber(video.stats.diggCount)}
              </span>
              <span className="text-zinc-500">likes</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-300">
              <MessageCircle
                className="h-4 w-4 text-cyan-400"
                aria-hidden="true"
              />
              <span className="font-mono font-medium">
                {formatCompactNumber(video.stats.commentCount)}
              </span>
              <span className="text-zinc-500">comments</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-300">
              <Share2 className="h-4 w-4 text-zinc-400" aria-hidden="true" />
              <span className="font-mono font-medium">
                {formatCompactNumber(video.stats.shareCount)}
              </span>
              <span className="text-zinc-500">shares</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-300">
              <Bookmark className="h-4 w-4 text-amber-400" aria-hidden="true" />
              <span className="font-mono font-medium">
                {formatCompactNumber(video.stats.playCount)}
              </span>
              <span className="text-zinc-500">views</span>
            </div>
          </div>

          {video.createTime > 0 && (
            <p className="text-xs text-zinc-500">
              Posted {formatTimestamp(video.createTime)}
            </p>
          )}
        </div>

        {/* Actions & Keyboard Hints */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center gap-2">
            {video.downloadUrl && (
              <a
                href={video.downloadUrl}
                download
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 active:scale-[0.98]"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                <span>Download MP4</span>
              </a>
            )}
            <button
              type="button"
              onClick={handleCopyCanonical}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-xs font-medium text-zinc-200 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              {copiedLink ? "Copied!" : "Copy Link"}
            </button>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px] text-zinc-500">
            Shortcuts: <kbd className="font-mono text-zinc-300">Space</kbd>{" "}
            play/pause · <kbd className="font-mono text-zinc-300">M</kbd> mute ·{" "}
            <kbd className="font-mono text-zinc-300">↑/↓</kbd> navigate
          </div>
        </div>
      </aside>
    </article>
  );
}

export function VideoFeedPlayer({
  videos,
  initialIndex = 0,
  onSelectHashtag,
  onRetry,
}: VideoFeedPlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [muted, setMuted] = useState(true);
  const [rateIndex, setRateIndex] = useState(0);

  const playbackRate = PLAYBACK_RATES[rateIndex] ?? 1;

  const scrollToIndex = useCallback(
    (nextIndex: number) => {
      const clamped = Math.max(0, Math.min(videos.length - 1, nextIndex));
      setActiveIndex(clamped);
      const container = containerRef.current;
      if (container) {
        const slide = container.children[clamped] as HTMLElement | undefined;
        slide?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },
    [videos.length]
  );

  useEffect(() => {
    setActiveIndex(initialIndex);
  }, [initialIndex, videos]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        scrollToIndex(activeIndex + 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        scrollToIndex(activeIndex - 1);
      } else if (e.key.toLowerCase() === "m") {
        e.preventDefault();
        setMuted((prev) => !prev);
      } else if (e.code === "Space") {
        e.preventDefault();
        const container = containerRef.current;
        const activeSlide = container?.children[activeIndex];
        const videoEl = activeSlide?.querySelector("video");
        if (videoEl) {
          if (videoEl.paused) {
            void videoEl.play();
          } else {
            videoEl.pause();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, scrollToIndex]);

  const handleScroll = () => {
    const container = containerRef.current;
    if (!container) return;
    const height = container.clientHeight;
    if (height <= 0) return;
    const index = Math.round(container.scrollTop / height);
    if (index !== activeIndex && index >= 0 && index < videos.length) {
      setActiveIndex(index);
    }
  };

  if (videos.length === 0) return null;

  return (
    <div className="relative w-full">
      {videos.length > 1 && (
        <div className="mb-3 flex items-center justify-between px-1 text-xs text-zinc-400">
          <span className="font-mono">
            Video {activeIndex + 1} of {videos.length}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={activeIndex === 0}
              onClick={() => scrollToIndex(activeIndex - 1)}
              aria-label="Previous video"
              className="rounded-lg border border-white/10 bg-[#121216] p-1.5 text-zinc-300 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:opacity-40"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={activeIndex >= videos.length - 1}
              onClick={() => scrollToIndex(activeIndex + 1)}
              aria-label="Next video"
              className="rounded-lg border border-white/10 bg-[#121216] p-1.5 text-zinc-300 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:opacity-40"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-[82dvh] w-full snap-y snap-mandatory overflow-y-auto scroll-smooth"
      >
        {videos.map((video, index) => (
          <SingleVideoSlide
            key={`${video.id}-${index}`}
            video={video}
            isActive={index === activeIndex}
            muted={muted}
            playbackRate={playbackRate}
            onToggleMute={() => setMuted((prev) => !prev)}
            onCyclePlaybackRate={() =>
              setRateIndex((prev) => (prev + 1) % PLAYBACK_RATES.length)
            }
            onSelectHashtag={onSelectHashtag}
            onRetry={onRetry}
          />
        ))}
      </div>
    </div>
  );
}
