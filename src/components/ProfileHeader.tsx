"use client";

import Link from "next/link";
import { BadgeCheck, ExternalLink, Lock, Share2, Check } from "lucide-react";
import { useState } from "react";
import { formatCompactNumber } from "@/lib/format";
import type { TikTokUserProfile } from "@/types/tiktok";

interface ProfileHeaderProps {
  profile: TikTokUserProfile;
  showProfileLink?: boolean;
}

export function ProfileHeader({
  profile,
  showProfileLink = true,
}: ProfileHeaderProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyShareLink = async () => {
    const shareUrl = `${window.location.origin}/user/${encodeURIComponent(
      profile.uniqueId
    )}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <section
      aria-label={`Profile for ${profile.nickname}`}
      className="w-full rounded-2xl border border-white/10 bg-[#121216] p-5 sm:p-6"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-white/15 bg-zinc-900 sm:h-24 sm:w-24">
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatarUrl}
                alt={`${profile.nickname} avatar`}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-zinc-500">
                {profile.nickname.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>

          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-bold tracking-tight text-white sm:text-2xl">
                {profile.nickname}
              </h1>
              {profile.verified && (
                <BadgeCheck
                  className="h-5 w-5 shrink-0 text-cyan-400"
                  aria-label="Verified creator"
                />
              )}
              {profile.privateAccount && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-0.5 text-xs font-medium text-amber-300">
                  <Lock className="h-3 w-3" aria-hidden="true" />
                  Private
                </span>
              )}
            </div>

            <p className="font-mono text-sm text-zinc-400">
              @{profile.uniqueId}
            </p>

            {profile.bio && (
              <p className="max-w-xl whitespace-pre-line text-sm leading-relaxed text-zinc-300">
                {profile.bio}
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleCopyShareLink}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 active:scale-[0.98]"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Share2 className="h-3.5 w-3.5 text-cyan-400" />
                <span>Share</span>
              </>
            )}
          </button>

          {showProfileLink && (
            <Link
              href={`/user/${encodeURIComponent(profile.uniqueId)}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs font-medium text-cyan-300 transition hover:bg-cyan-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              <span>Permalink</span>
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 sm:grid-cols-4">
        <div className="rounded-xl bg-white/[0.03] px-3 py-2.5">
          <dt className="text-xs text-zinc-500">Followers</dt>
          <dd className="mt-0.5 font-mono text-base font-semibold text-white">
            {formatCompactNumber(profile.followerCount)}
          </dd>
        </div>
        <div className="rounded-xl bg-white/[0.03] px-3 py-2.5">
          <dt className="text-xs text-zinc-500">Following</dt>
          <dd className="mt-0.5 font-mono text-base font-semibold text-white">
            {formatCompactNumber(profile.followingCount)}
          </dd>
        </div>
        <div className="rounded-xl bg-white/[0.03] px-3 py-2.5">
          <dt className="text-xs text-zinc-500">Likes</dt>
          <dd className="mt-0.5 font-mono text-base font-semibold text-white">
            {formatCompactNumber(profile.heartCount)}
          </dd>
        </div>
        <div className="rounded-xl bg-white/[0.03] px-3 py-2.5">
          <dt className="text-xs text-zinc-500">Videos</dt>
          <dd className="mt-0.5 font-mono text-base font-semibold text-white">
            {formatCompactNumber(profile.videoCount)}
          </dd>
        </div>
      </dl>
    </section>
  );
}
