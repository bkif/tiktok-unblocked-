import type {
  TikTokAuthor,
  TikTokMusic,
  TikTokStats,
  TikTokUserProfile,
  TikTokVideoItem,
} from "@/types/tiktok";
import { buildProxyStreamUrl } from "./security";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRecord(obj: UnknownRecord, key: string): UnknownRecord | null {
  const val = obj[key];
  return isRecord(val) ? val : null;
}

function getString(obj: UnknownRecord, key: string, fallback = ""): string {
  const val = obj[key];
  if (typeof val === "string") return val;
  if (typeof val === "number" && Number.isFinite(val)) return String(val);
  return fallback;
}

function getNumber(obj: UnknownRecord, key: string, fallback = 0): number {
  const val = obj[key];
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (typeof val === "string") {
    const parsed = Number(val);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function getBoolean(obj: UnknownRecord, key: string, fallback = false): boolean {
  const val = obj[key];
  return typeof val === "boolean" ? val : fallback;
}

function getFirstStringFromArray(arr: unknown): string {
  if (!Array.isArray(arr)) return "";
  for (const item of arr) {
    if (typeof item === "string" && item.trim().length > 0) {
      return item.trim();
    }
  }
  return "";
}

function extractScriptJson(html: string, scriptId: string): UnknownRecord | null {
  const escapedId = scriptId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `<script[^>]*id=["']${escapedId}["'][^>]*>([\\s\\S]*?)<\\/script>`,
    "i"
  );
  const match = html.match(regex);
  if (!match?.[1]) return null;
  try {
    const parsed: unknown = JSON.parse(match[1].trim());
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function extractHashtags(description: string, textExtra?: unknown): string[] {
  const tags = new Set<string>();

  if (Array.isArray(textExtra)) {
    for (const entry of textExtra) {
      if (isRecord(entry)) {
        const name = getString(entry, "hashtagName").trim();
        if (name) tags.add(name);
      }
    }
  }

  const matches = description.match(/#([\p{L}\p{N}_]+)/gu);
  if (matches) {
    for (const m of matches) {
      const cleaned = m.slice(1).trim();
      if (cleaned) tags.add(cleaned);
    }
  }

  return Array.from(tags).slice(0, 20);
}

function selectBestVideoUrl(videoObj: UnknownRecord): string {
  // Prefer bitrateInfo highest quality PlayAddr, then playAddr, then downloadAddr
  const bitrateInfo = videoObj["bitrateInfo"];
  if (Array.isArray(bitrateInfo)) {
    let bestUrl = "";
    let bestBitrate = -1;
    for (const entry of bitrateInfo) {
      if (!isRecord(entry)) continue;
      const bitrate = getNumber(entry, "Bitrate", 0);
      const playAddr = getRecord(entry, "PlayAddr");
      if (playAddr) {
        const candidate =
          getFirstStringFromArray(playAddr["UrlList"]) || getString(playAddr, "Url");
        if (candidate && bitrate >= bestBitrate) {
          bestBitrate = bitrate;
          bestUrl = candidate;
        }
      }
    }
    if (bestUrl) return bestUrl;
  }

  const directPlayAddr = videoObj["playAddr"];
  if (typeof directPlayAddr === "string" && directPlayAddr) {
    return directPlayAddr;
  }
  if (isRecord(directPlayAddr)) {
    const candidate =
      getFirstStringFromArray(directPlayAddr["urlList"]) ||
      getFirstStringFromArray(directPlayAddr["UrlList"]) ||
      getString(directPlayAddr, "url");
    if (candidate) return candidate;
  }

  const downloadAddr = videoObj["downloadAddr"];
  if (typeof downloadAddr === "string" && downloadAddr) {
    return downloadAddr;
  }
  if (isRecord(downloadAddr)) {
    const candidate =
      getFirstStringFromArray(downloadAddr["urlList"]) ||
      getFirstStringFromArray(downloadAddr["UrlList"]) ||
      getString(downloadAddr, "url");
    if (candidate) return candidate;
  }

  return "";
}

export function normalizeVideoItem(
  itemStruct: UnknownRecord,
  fallbackAuthor?: TikTokAuthor
): TikTokVideoItem | null {
  const id = getString(itemStruct, "id");
  if (!id) return null;

  const desc = getString(itemStruct, "desc");
  const createTime = getNumber(itemStruct, "createTime", 0);

  const authorObj = getRecord(itemStruct, "author");
  const uniqueId =
    (authorObj && getString(authorObj, "uniqueId")) ||
    fallbackAuthor?.uniqueId ||
    "unknown";
  const nickname =
    (authorObj && getString(authorObj, "nickname")) ||
    fallbackAuthor?.nickname ||
    uniqueId;
  const rawAvatar =
    (authorObj &&
      (getString(authorObj, "avatarLarger") ||
        getString(authorObj, "avatarMedium") ||
        getString(authorObj, "avatarThumb"))) ||
    "";

  const author: TikTokAuthor = {
    id: (authorObj && getString(authorObj, "id")) || fallbackAuthor?.id || "",
    uniqueId,
    nickname,
    avatarUrl: rawAvatar
      ? buildProxyStreamUrl(rawAvatar)
      : fallbackAuthor?.avatarUrl || "",
    verified:
      (authorObj && getBoolean(authorObj, "verified")) ||
      fallbackAuthor?.verified ||
      false,
    signature:
      (authorObj && getString(authorObj, "signature")) ||
      fallbackAuthor?.signature,
  };

  const videoObj = getRecord(itemStruct, "video") ?? {};
  const duration = getNumber(videoObj, "duration", 0);
  const width = getNumber(videoObj, "width", 0) || undefined;
  const height = getNumber(videoObj, "height", 0) || undefined;

  const rawCover =
    getString(videoObj, "originCover") ||
    getString(videoObj, "cover") ||
    getString(videoObj, "dynamicCover");
  const rawDynamicCover = getString(videoObj, "dynamicCover");
  const rawPlayUrl = selectBestVideoUrl(videoObj);

  const playUrl = buildProxyStreamUrl(rawPlayUrl);
  const downloadUrl = buildProxyStreamUrl(rawPlayUrl, {
    download: true,
    filename: `tiktok_${uniqueId}_${id}.mp4`,
  });

  const musicObj = getRecord(itemStruct, "music");
  let music: TikTokMusic | undefined;
  if (musicObj) {
    const musicCover =
      getString(musicObj, "coverLarge") ||
      getString(musicObj, "coverMedium") ||
      getString(musicObj, "coverThumb");
    music = {
      id: getString(musicObj, "id"),
      title: getString(musicObj, "title", "Original Sound"),
      authorName: getString(musicObj, "authorName", nickname),
      coverUrl: musicCover ? buildProxyStreamUrl(musicCover) : undefined,
      duration: getNumber(musicObj, "duration", 0) || undefined,
      original: getBoolean(musicObj, "original", false),
    };
  }

  const statsObj = getRecord(itemStruct, "stats") ?? {};
  const stats: TikTokStats = {
    playCount: getNumber(statsObj, "playCount", 0),
    diggCount: getNumber(statsObj, "diggCount", 0),
    commentCount: getNumber(statsObj, "commentCount", 0),
    shareCount: getNumber(statsObj, "shareCount", 0),
    collectCount: getNumber(statsObj, "collectCount", 0) || undefined,
  };

  const canonicalUrl = `https://www.tiktok.com/@${uniqueId}/video/${id}`;

  return {
    id,
    canonicalUrl,
    description: desc,
    createTime,
    duration,
    width,
    height,
    coverUrl: buildProxyStreamUrl(rawCover),
    dynamicCoverUrl: rawDynamicCover
      ? buildProxyStreamUrl(rawDynamicCover)
      : undefined,
    playUrl,
    downloadUrl,
    hasStream: Boolean(playUrl),
    author,
    music,
    stats,
    hashtags: extractHashtags(desc, itemStruct["textExtra"]),
  };
}

export interface ParsedTikTokPage {
  video?: TikTokVideoItem;
  profile?: TikTokUserProfile;
  videos: TikTokVideoItem[];
  statusCode?: number;
  statusMsg?: string;
}

export function parseTikTokHtml(html: string): ParsedTikTokPage {
  const videos: TikTokVideoItem[] = [];
  let video: TikTokVideoItem | undefined;
  let profile: TikTokUserProfile | undefined;
  let statusCode: number | undefined;
  let statusMsg: string | undefined;

  // 1. Try __UNIVERSAL_DATA_FOR_REHYDRATION__
  const universalData = extractScriptJson(
    html,
    "__UNIVERSAL_DATA_FOR_REHYDRATION__"
  );
  if (universalData) {
    const defaultScope = getRecord(universalData, "__DEFAULT_SCOPE__");
    if (defaultScope) {
      // Video detail
      const videoDetail = getRecord(defaultScope, "webapp.video-detail");
      if (videoDetail) {
        statusCode = getNumber(videoDetail, "statusCode", 0);
        statusMsg = getString(videoDetail, "statusMsg") || undefined;
        const itemInfo = getRecord(videoDetail, "itemInfo");
        const itemStruct = itemInfo ? getRecord(itemInfo, "itemStruct") : null;
        if (itemStruct) {
          const normalized = normalizeVideoItem(itemStruct);
          if (normalized) {
            video = normalized;
            videos.push(normalized);
          }
        }
      }

      // User detail
      const userDetail = getRecord(defaultScope, "webapp.user-detail");
      if (userDetail) {
        if (statusCode === undefined) {
          statusCode = getNumber(userDetail, "statusCode", 0);
          statusMsg = getString(userDetail, "statusMsg") || undefined;
        }
        const userInfo = getRecord(userDetail, "userInfo");
        const userObj = userInfo ? getRecord(userInfo, "user") : null;
        const statsObj = userInfo ? getRecord(userInfo, "stats") : null;

        if (userObj) {
          const rawAvatar =
            getString(userObj, "avatarLarger") ||
            getString(userObj, "avatarMedium") ||
            getString(userObj, "avatarThumb");
          const uniqueId = getString(userObj, "uniqueId");
          const nickname = getString(userObj, "nickname", uniqueId);
          const id = getString(userObj, "id");
          const verified = getBoolean(userObj, "verified");
          const bio = getString(userObj, "signature");

          const authorFallback: TikTokAuthor = {
            id,
            uniqueId,
            nickname,
            avatarUrl: buildProxyStreamUrl(rawAvatar),
            verified,
            signature: bio,
          };

          const itemList = userDetail["itemList"];
          const profileVideos: TikTokVideoItem[] = [];
          if (Array.isArray(itemList)) {
            for (const rawItem of itemList) {
              if (!isRecord(rawItem)) continue;
              const normalized = normalizeVideoItem(rawItem, authorFallback);
              if (normalized) {
                profileVideos.push(normalized);
                videos.push(normalized);
              }
            }
          }

          profile = {
            id,
            uniqueId,
            nickname,
            avatarUrl: buildProxyStreamUrl(rawAvatar),
            bio,
            verified,
            privateAccount: getBoolean(userObj, "privateAccount", false),
            followerCount: statsObj ? getNumber(statsObj, "followerCount", 0) : 0,
            followingCount: statsObj ? getNumber(statsObj, "followingCount", 0) : 0,
            heartCount: statsObj
              ? getNumber(statsObj, "heartCount", 0) ||
                getNumber(statsObj, "heart", 0)
              : 0,
            videoCount: statsObj ? getNumber(statsObj, "videoCount", 0) : 0,
            videos: profileVideos,
          };
        }
      }

      // Challenge / hashtag or explore list
      const challengeDetail =
        getRecord(defaultScope, "webapp.challenge-detail") ||
        getRecord(defaultScope, "webapp.explore-detail");
      if (challengeDetail) {
        const itemList = challengeDetail["itemList"];
        if (Array.isArray(itemList)) {
          for (const rawItem of itemList) {
            if (!isRecord(rawItem)) continue;
            const normalized = normalizeVideoItem(rawItem);
            if (normalized) videos.push(normalized);
          }
        }
      }
    }
  }

  // 2. Fallback to SIGI_STATE
  if (!video && videos.length === 0) {
    const sigiState = extractScriptJson(html, "SIGI_STATE");
    if (sigiState) {
      const itemModule = getRecord(sigiState, "ItemModule");
      if (itemModule) {
        for (const value of Object.values(itemModule)) {
          if (!isRecord(value)) continue;
          const normalized = normalizeVideoItem(value);
          if (normalized) {
            videos.push(normalized);
            if (!video) video = normalized;
          }
        }
      }

      const userModule = getRecord(sigiState, "UserModule");
      if (userModule && !profile) {
        const users = getRecord(userModule, "users");
        const statsMap = getRecord(userModule, "stats");
        if (users) {
          const firstUserEntry = Object.values(users).find(isRecord);
          if (firstUserEntry) {
            const uniqueId = getString(firstUserEntry, "uniqueId");
            const statsObj = statsMap ? getRecord(statsMap, uniqueId) : null;
            const rawAvatar =
              getString(firstUserEntry, "avatarLarger") ||
              getString(firstUserEntry, "avatarMedium") ||
              getString(firstUserEntry, "avatarThumb");
            profile = {
              id: getString(firstUserEntry, "id"),
              uniqueId,
              nickname: getString(firstUserEntry, "nickname", uniqueId),
              avatarUrl: buildProxyStreamUrl(rawAvatar),
              bio: getString(firstUserEntry, "signature"),
              verified: getBoolean(firstUserEntry, "verified"),
              privateAccount: getBoolean(firstUserEntry, "privateAccount", false),
              followerCount: statsObj ? getNumber(statsObj, "followerCount", 0) : 0,
              followingCount: statsObj ? getNumber(statsObj, "followingCount", 0) : 0,
              heartCount: statsObj
                ? getNumber(statsObj, "heartCount", 0) ||
                  getNumber(statsObj, "heart", 0)
                : 0,
              videoCount: statsObj ? getNumber(statsObj, "videoCount", 0) : 0,
              videos,
            };
          }
        }
      }
    }
  }

  return {
    video,
    profile,
    videos,
    statusCode,
    statusMsg,
  };
}

export function parseOEmbedPayload(
  payload: unknown,
  canonicalUrl: string,
  videoId: string
): TikTokVideoItem | null {
  if (!isRecord(payload)) return null;

  const title = getString(payload, "title");
  const authorName = getString(payload, "author_name", "TikTok Creator");
  const authorUrl = getString(payload, "author_url");
  const thumbnailUrl = getString(payload, "thumbnail_url");
  const width = getNumber(payload, "thumbnail_width", 0) || undefined;
  const height = getNumber(payload, "thumbnail_height", 0) || undefined;

  let uniqueId = "creator";
  if (authorUrl) {
    const match = authorUrl.match(/\/@([a-zA-Z0-9._-]+)/);
    if (match?.[1]) uniqueId = match[1];
  }

  return {
    id: videoId || "oembed",
    canonicalUrl,
    description: title,
    createTime: 0,
    duration: 0,
    width,
    height,
    coverUrl: buildProxyStreamUrl(thumbnailUrl),
    playUrl: "",
    downloadUrl: "",
    hasStream: false,
    isOEmbedFallback: true,
    author: {
      id: "",
      uniqueId,
      nickname: authorName,
      avatarUrl: "",
      verified: false,
    },
    stats: {
      playCount: 0,
      diggCount: 0,
      commentCount: 0,
      shareCount: 0,
    },
    hashtags: extractHashtags(title),
  };
}
