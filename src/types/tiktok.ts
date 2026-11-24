export type TikTokErrorCode =
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "UPSTREAM_BLOCKED"
  | "INVALID_URL"
  | "PRIVATE_ACCOUNT"
  | "REGION_LOCKED"
  | "INTERNAL_ERROR";

export interface TikTokAuthor {
  id: string;
  uniqueId: string;
  nickname: string;
  avatarUrl: string;
  verified: boolean;
  signature?: string;
}

export interface TikTokMusic {
  id: string;
  title: string;
  authorName: string;
  coverUrl?: string;
  duration?: number;
  original?: boolean;
}

export interface TikTokStats {
  playCount: number;
  diggCount: number;
  commentCount: number;
  shareCount: number;
  collectCount?: number;
}

export interface TikTokVideoItem {
  id: string;
  canonicalUrl: string;
  description: string;
  createTime: number;
  duration: number;
  width?: number;
  height?: number;
  coverUrl: string;
  dynamicCoverUrl?: string;
  playUrl: string;
  downloadUrl: string;
  hasStream: boolean;
  isOEmbedFallback?: boolean;
  author: TikTokAuthor;
  music?: TikTokMusic;
  stats: TikTokStats;
  hashtags: string[];
}

export interface TikTokUserProfile {
  id: string;
  uniqueId: string;
  nickname: string;
  avatarUrl: string;
  bio: string;
  verified: boolean;
  privateAccount: boolean;
  followerCount: number;
  followingCount: number;
  heartCount: number;
  videoCount: number;
  videos: TikTokVideoItem[];
  partial?: boolean;
}

export interface TikTokResolveResult {
  type: "video" | "profile" | "hashtag" | "trending";
  query: string;
  video?: TikTokVideoItem;
  profile?: TikTokUserProfile;
  videos?: TikTokVideoItem[];
  source: "rehydration" | "oembed" | "cache";
  warning?: string;
}

export interface ApiErrorResponse {
  ok: false;
  code: TikTokErrorCode;
  message: string;
  retryable: boolean;
  details?: string;
}

export interface ApiSuccessResponse<T> {
  ok: true;
  data: T;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
