"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Radio,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { ProfileHeader } from "@/components/ProfileHeader";
import { SearchBar } from "@/components/SearchBar";
import { VideoFeedPlayer } from "@/components/VideoFeedPlayer";
import { VideoGrid } from "@/components/VideoGrid";
import type { ApiResponse, TikTokResolveResult } from "@/types/tiktok";

export default function HomePage() {
  const [activeQuery, setActiveQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<TikTokResolveResult | null>(null);
  const [error, setError] = useState<{
    message: string;
    code?: string;
    retryable?: boolean;
  } | null>(null);
  const [selectedVideoIndex, setSelectedVideoIndex] = useState<number | null>(
    null
  );

  const runResolve = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setActiveQuery(trimmed);
    setIsLoading(true);
    setError(null);
    setSelectedVideoIndex(null);

    try {
      const res = await fetch(
        `/api/resolve?q=${encodeURIComponent(trimmed)}`,
        {
          method: "GET",
          headers: { Accept: "application/json" },
        }
      );
      const payload = (await res.json()) as ApiResponse<TikTokResolveResult>;

      if (!payload.ok) {
        setResult(null);
        setError({
          message: payload.message,
          code: payload.code,
          retryable: payload.retryable,
        });
        return;
      }

      setResult(payload.data);
      if (payload.data.type === "video") {
        setSelectedVideoIndex(0);
      }
    } catch {
      setResult(null);
      setError({
        message: "Network error while contacting the proxy gateway.",
        retryable: true,
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const videos = result?.videos ?? (result?.video ? [result.video] : []);

  return (
    <div className="flex min-h-dvh flex-col bg-[#09090B]">
      {/* Top Navigation */}
      <header className="safe-pt sticky top-0 z-30 border-b border-white/[0.08] bg-[#09090B]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link
            href="/"
            onClick={() => {
              setResult(null);
              setError(null);
              setActiveQuery("");
              setSelectedVideoIndex(null);
            }}
            className="flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 rounded-lg"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-400/10">
              <Radio className="h-4 w-4 text-cyan-400" aria-hidden="true" />
            </div>
            <div>
              <span className="text-sm font-bold tracking-tight text-white sm:text-base">
                PrismTok
              </span>
              <span className="ml-2 hidden rounded-full border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[10px] text-zinc-400 sm:inline-block">
                PROXY GATEWAY
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <ShieldCheck
              className="h-4 w-4 text-emerald-400"
              aria-hidden="true"
            />
            <span className="hidden sm:inline">Account-Free · Zero Trackers</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
        <section
          aria-label="Search and resolve TikTok content"
          className="mx-auto w-full max-w-3xl space-y-4"
        >
          {!result && !isLoading && (
            <div className="space-y-2 text-center sm:py-4">
              <h1 className="text-2xl font-bold tracking-tight text-white sm:text-4xl">
                Watch TikTok Without Login Walls
              </h1>
              <p className="mx-auto max-w-xl text-sm text-zinc-400 sm:text-base">
                Paste any TikTok link, short URL, or{" "}
                <span className="font-mono text-zinc-200">@username</span>. All
                metadata and video streams are proxied server-side.
              </p>
            </div>
          )}

          <SearchBar
            initialQuery={activeQuery}
            isLoading={isLoading}
            onSearch={runResolve}
            compact={Boolean(result)}
          />
        </section>

        {/* Loading Skeleton */}
        {isLoading && (
          <section
            aria-label="Loading TikTok content"
            className="mx-auto flex w-full max-w-4xl flex-col items-center gap-6 lg:flex-row lg:items-start lg:justify-center"
          >
            <div className="skeleton-shimmer aspect-[9/16] w-full max-w-[380px] rounded-2xl border border-white/10" />
            <div className="hidden w-full max-w-sm space-y-4 rounded-2xl border border-white/10 bg-[#121216] p-6 lg:block">
              <div className="flex items-center gap-3">
                <div className="skeleton-shimmer h-12 w-12 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton-shimmer h-4 w-32 rounded" />
                  <div className="skeleton-shimmer h-3 w-24 rounded" />
                </div>
              </div>
              <div className="skeleton-shimmer h-20 w-full rounded-xl" />
              <div className="skeleton-shimmer h-10 w-full rounded-xl" />
            </div>
          </section>
        )}

        {/* Error State */}
        {!isLoading && error && (
          <section
            role="alert"
            className="mx-auto w-full max-w-xl rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-center"
          >
            <AlertTriangle
              className="mx-auto mb-3 h-8 w-8 text-rose-400"
              aria-hidden="true"
            />
            <h2 className="text-base font-semibold text-white">
              {error.code === "NOT_FOUND"
                ? "Content Unavailable"
                : error.code === "RATE_LIMITED"
                  ? "Upstream Rate Limit"
                  : "Could Not Resolve Content"}
            </h2>
            <p className="mt-1.5 text-sm text-zinc-300">{error.message}</p>
            {error.retryable && activeQuery && (
              <button
                type="button"
                onClick={() => runResolve(activeQuery)}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Try Again</span>
              </button>
            )}
          </section>
        )}

        {/* Warning Banner (e.g. oEmbed fallback or partial profile) */}
        {!isLoading && result?.warning && (
          <div
            role="status"
            className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-xs text-amber-200"
          >
            <span>{result.warning}</span>
            <button
              type="button"
              onClick={() => runResolve(activeQuery)}
              className="shrink-0 rounded-lg border border-amber-300/30 bg-amber-400/15 px-2.5 py-1 font-medium text-amber-100 transition hover:bg-amber-400/25"
            >
              Retry
            </button>
          </div>
        )}

        {/* Active Player Mode */}
        {!isLoading && result && selectedVideoIndex !== null && videos.length > 0 && (
          <section aria-label="Video player" className="w-full space-y-4">
            {result.type !== "video" && (
              <button
                type="button"
                onClick={() => setSelectedVideoIndex(null)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#121216] px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back to Grid</span>
              </button>
            )}

            <VideoFeedPlayer
              videos={videos}
              initialIndex={selectedVideoIndex}
              onSelectHashtag={(tag) => runResolve(tag)}
              onRetry={() => runResolve(activeQuery)}
            />
          </section>
        )}

        {/* Profile / Hashtag / Trending Grid */}
        {!isLoading && result && selectedVideoIndex === null && (
          <section aria-label="Results" className="w-full space-y-6">
            {result.profile && <ProfileHeader profile={result.profile} />}

            {videos.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-zinc-200">
                    {result.type === "profile"
                      ? "Public Videos"
                      : result.type === "hashtag"
                        ? `Videos for ${result.query}`
                        : "Trending Videos"}
                  </h2>
                  <span className="font-mono text-xs text-zinc-500">
                    {videos.length} items
                  </span>
                </div>
                <VideoGrid
                  videos={videos}
                  onSelectVideo={(idx) => setSelectedVideoIndex(idx)}
                />
              </div>
            ) : (
              result.profile &&
              !result.profile.privateAccount && (
                <div className="rounded-2xl border border-white/10 bg-[#121216] p-8 text-center text-sm text-zinc-400">
                  No public videos were returned in this response.
                </div>
              )
            )}
          </section>
        )}

        {/* Empty State Highlights */}
        {!isLoading && !result && !error && (
          <section
            aria-label="Gateway capabilities"
            className="mx-auto mt-4 grid w-full max-w-4xl grid-cols-1 gap-3 sm:grid-cols-3"
          >
            <div className="rounded-2xl border border-white/[0.08] bg-[#121216] p-4">
              <Sparkles
                className="mb-2 h-4 w-4 text-cyan-400"
                aria-hidden="true"
              />
              <h2 className="text-sm font-semibold text-white">
                Short-Link Expansion
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                Resolves <span className="font-mono">vm.tiktok.com</span> and{" "}
                <span className="font-mono">vt.tiktok.com</span> links server-side
                with zero client tracking.
              </p>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-[#121216] p-4">
              <ShieldCheck
                className="mb-2 h-4 w-4 text-emerald-400"
                aria-hidden="true"
              />
              <h2 className="text-sm font-semibold text-white">
                Range-Proxied Streams
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                Video bytes and thumbnails flow through{" "}
                <span className="font-mono">/api/stream</span> with HTTP Range
                support for instant scrubbing.
              </p>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-[#121216] p-4">
              <Radio
                className="mb-2 h-4 w-4 text-rose-400"
                aria-hidden="true"
              />
              <h2 className="text-sm font-semibold text-white">
                Shareable Profiles
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                Visit <span className="font-mono">/user/username</span> directly
                to browse any creator&apos;s public feed.
              </p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
