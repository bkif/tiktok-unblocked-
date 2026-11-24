"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  ClipboardPaste,
  Clock,
  Flame,
  Hash,
  Loader2,
  Search,
  User,
  X,
} from "lucide-react";

const HISTORY_STORAGE_KEY = "prismtok_recent_queries_v1";
const MAX_HISTORY_ITEMS = 8;

interface SearchBarProps {
  initialQuery?: string;
  isLoading: boolean;
  onSearch: (query: string) => void;
  compact?: boolean;
}

function validateInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Paste a TikTok video URL, @username, or #hashtag.";
  }
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const parsed = new URL(trimmed);
      const host = parsed.hostname.toLowerCase();
      const allowed =
        host === "tiktok.com" ||
        host.endsWith(".tiktok.com") ||
        host.endsWith(".tiktokv.com") ||
        host.endsWith(".musical.ly");
      if (!allowed) {
        return "Only TikTok domains (tiktok.com, vm.tiktok.com, vt.tiktok.com) are supported.";
      }
      return null;
    } catch {
      return "Please enter a valid URL.";
    }
  }
  return null;
}

export function SearchBar({
  initialQuery = "",
  isLoading,
  onSearch,
  compact = false,
}: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [clipboardError, setClipboardError] = useState<string | null>(null);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setHistory(
            parsed.filter((item): item is string => typeof item === "string")
          );
        }
      }
    } catch {
      // Ignore storage read errors in restricted environments
    }
  }, []);

  const persistHistory = (next: string[]) => {
    setHistory(next);
    try {
      window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage write errors
    }
  };

  const submitQuery = (raw: string) => {
    const trimmed = raw.trim();
    const err = validateInput(trimmed);
    if (err) {
      setValidationError(err);
      return;
    }
    setValidationError(null);
    setClipboardError(null);

    const updatedHistory = [
      trimmed,
      ...history.filter((item) => item !== trimmed),
    ].slice(0, MAX_HISTORY_ITEMS);
    persistHistory(updatedHistory);
    onSearch(trimmed);
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    submitQuery(query);
  };

  const handlePasteClipboard = async () => {
    setClipboardError(null);
    if (!navigator.clipboard?.readText) {
      setClipboardError("Clipboard access is unavailable in this browser.");
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      const trimmed = text.trim();
      if (!trimmed) {
        setClipboardError("Clipboard is empty.");
        return;
      }
      setQuery(trimmed);
      submitQuery(trimmed);
    } catch {
      setClipboardError("Allow clipboard permission or paste directly with Ctrl+V.");
    }
  };

  const handleRemoveHistory = (item: string) => {
    persistHistory(history.filter((h) => h !== item));
  };

  return (
    <div className="w-full space-y-3">
      <form
        onSubmit={handleSubmit}
        className="relative flex w-full items-center gap-2 rounded-2xl border border-white/10 bg-[#121216] p-1.5 shadow-lg shadow-black/40 transition-colors focus-within:border-cyan-400/60"
        role="search"
        aria-label="TikTok URL or creator lookup"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5 pl-3">
          <Search
            className="h-4 w-4 shrink-0 text-zinc-400"
            aria-hidden="true"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (validationError) setValidationError(null);
            }}
            placeholder="Paste TikTok link (vm.tiktok.com/...), @username, or #hashtag"
            aria-label="TikTok URL, username, or hashtag"
            className="w-full min-w-0 bg-transparent py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none sm:text-base"
            disabled={isLoading}
          />
          {query && !isLoading && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setValidationError(null);
              }}
              aria-label="Clear search input"
              className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={handlePasteClipboard}
          disabled={isLoading}
          title="Paste from clipboard"
          aria-label="Paste TikTok URL from clipboard"
          className="hidden items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:inline-flex"
        >
          <ClipboardPaste className="h-3.5 w-3.5 text-cyan-400" />
          <span>Paste</span>
        </button>

        <button
          type="submit"
          disabled={isLoading}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#121216] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              <span>Resolving</span>
            </>
          ) : (
            <span>Go</span>
          )}
        </button>
      </form>

      {(validationError || clipboardError) && (
        <p
          role="alert"
          className="px-1 text-xs font-medium text-rose-400"
        >
          {validationError ?? clipboardError}
        </p>
      )}

      {!compact && (
        <div className="flex flex-wrap items-center gap-2 px-1">
          <span className="text-xs font-medium text-zinc-500">Quick try:</span>
          <button
            type="button"
            disabled={isLoading}
            onClick={() => {
              setQuery("trending");
              submitQuery("trending");
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-zinc-300 transition hover:border-rose-400/40 hover:bg-rose-500/10 hover:text-rose-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:opacity-50"
          >
            <Flame className="h-3 w-3 text-rose-400" aria-hidden="true" />
            <span>Trending</span>
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={() => {
              setQuery("@tiktok");
              submitQuery("@tiktok");
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-zinc-300 transition hover:border-cyan-400/40 hover:bg-cyan-500/10 hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:opacity-50"
          >
            <User className="h-3 w-3 text-cyan-400" aria-hidden="true" />
            <span>@tiktok</span>
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={() => {
              setQuery("#coding");
              submitQuery("#coding");
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-zinc-300 transition hover:border-cyan-400/40 hover:bg-cyan-500/10 hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:opacity-50"
          >
            <Hash className="h-3 w-3 text-cyan-400" aria-hidden="true" />
            <span>#coding</span>
          </button>
        </div>
      )}

      {history.length > 0 && !compact && (
        <div className="flex flex-wrap items-center gap-2 px-1">
          <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
            <Clock className="h-3 w-3" aria-hidden="true" />
            Recent:
          </span>
          {history.map((item) => (
            <div
              key={item}
              className="group inline-flex max-w-[220px] items-center rounded-full border border-white/10 bg-[#121216] text-xs text-zinc-300 transition hover:border-white/20"
            >
              <button
                type="button"
                disabled={isLoading}
                onClick={() => {
                  setQuery(item);
                  submitQuery(item);
                }}
                className="truncate py-1 pl-3 pr-1.5 text-left hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:opacity-50"
                title={item}
              >
                {item}
              </button>
              <button
                type="button"
                onClick={() => handleRemoveHistory(item)}
                aria-label={`Remove ${item} from recent history`}
                className="rounded-full p-1 pr-2 text-zinc-500 transition hover:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
