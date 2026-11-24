"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, Radio, RefreshCw } from "lucide-react";
import { ProfileHeader } from "@/components/ProfileHeader";
import { VideoFeedPlayer } from "@/components/VideoFeedPlayer";
import { VideoGrid } from "@/components/VideoGrid";
import type { ApiResponse, TikTokUserProfile } from "@/types/tiktok";

export default function UserProfilePage() {
  const params = useParams<{ username: string }>();
  const router = useRouter();
  const rawUsername = params?.username ?? "";
  const username = decodeURIComponent(rawUsername).replace(/^@+/, "");

  const [profile, setProfile] = useState<TikTokUserProfile | null>(null);
  const [warning, setWarning] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<{
    message: string;
    retryable?: boolean;
  } | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const loadProfile = useCallback(async () => {
    if (!username) return;
    setIsLoading(true);
    setError(null);
    setSelectedIndex(null);

    try {
      const res = await fetch(
        `/api/profile/${encodeURIComponent(username)}`,
        {
          method: "GET",
          headers: { Accept: "application/json" },
        }
      );
      const payload = (await res.json()) as ApiResponse<{
        profile: TikTokUserProfile;
        warning?: string;
      }>;

      if (!payload.ok) {
        setProfile(null);
        setError({
          message: payload.message,
          retryable: payload.retryable,
        });
        return;
      }

      setProfile(payload.data.profile);
      setWarning(payload.data.warning);
    } catch {
      setProfile(null);
      setError({
        message: "Network error while loading creator profile.",
        retryable: true,
      });
    } finally {
      setIsLoading(false);
    }
  }, [username]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  return (
    <div className="flex min-h-dvh flex-col bg-[#09090B]">
      <header className="safe-pt sticky top-0 z-30 border-b border-white/[0.08] bg-[#09090B]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#121216] px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Home</span>
            </Link>
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-cyan-400" aria-hidden="true" />
              <span className="font-mono text-sm font-semibold text-white">
                @{username}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void loadProfile()}
            disabled={isLoading}
            aria-label="Refresh profile"
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`}
            />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
        {isLoading && (
          <div className="space-y-6">
            <div className="skeleton-shimmer h-48 w-full rounded-2xl border border-white/10" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {Array.from({ length: 8 }).map((_, idx) => (
                <div
                  key={idx}
                  className="skeleton-shimmer aspect-[9/16] w-full rounded-xl border border-white/10"
                />
              ))}
            </div>
          </div>
        )}

        {!isLoading && error && (
          <section
            role="alert"
            className="mx-auto mt-8 w-full max-w-lg rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-center"
          >
            <AlertTriangle
              className="mx-auto mb-3 h-8 w-8 text-rose-400"
              aria-hidden="true"
            />
            <h1 className="text-base font-semibold text-white">
              Unable to Load @{username}
            </h1>
            <p className="mt-1.5 text-sm text-zinc-300">{error.message}</p>
            <div className="mt-4 flex items-center justify-center gap-2">
              {error.retryable && (
                <button
                  type="button"
                  onClick={() => void loadProfile()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Retry</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => router.push("/")}
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/10"
              >
                Back to Search
              </button>
            </div>
          </section>
        )}

        {!isLoading && warning && (
          <div
            role="status"
            className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-xs text-amber-200"
          >
            {warning}
          </div>
        )}

        {!isLoading && profile && selectedIndex !== null && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setSelectedIndex(null)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#121216] px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to @{profile.uniqueId} Grid</span>
            </button>
            <VideoFeedPlayer
              videos={profile.videos}
              initialIndex={selectedIndex}
              onRetry={() => void loadProfile()}
            />
          </div>
        )}

        {!isLoading && profile && selectedIndex === null && (
          <div className="space-y-6">
            <ProfileHeader profile={profile} showProfileLink={false} />
            {profile.videos.length > 0 ? (
              <VideoGrid
                videos={profile.videos}
                onSelectVideo={(idx) => setSelectedIndex(idx)}
              />
            ) : (
              <div className="rounded-2xl border border-white/10 bg-[#121216] p-8 text-center text-sm text-zinc-400">
                {profile.privateAccount
                  ? "This account is private."
                  : "No public videos available to display."}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
