import type { TvOAuthClientIdentity } from "./types";

export const FAVORITES_STORAGE_KEY = "yt-favorites-v1";
export const VIDEO_META_CACHE_STORAGE_KEY = "yt-video-meta-cache-v1";
export const TV_OAUTH_STORAGE_KEY = "yt-tv-oauth-v1";
export const UI_SETTINGS_STORAGE_KEY = "yt-ui-settings-v1";

export const VIDEO_META_SCHEMA_VERSION = 3;
export const UI_SETTINGS_SCHEMA_VERSION = 1;
export const INNERTUBE_CONFIG_TTL_MS = 10 * 60 * 1000;
export const VIDEO_META_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export const HTTP_TIMEOUT_MS = 25000;
export const SEARCH_TIMEOUT_MS = 30000;
export const FEED_TIMEOUT_MS = 25000;
export const AUTH_REQUEST_TIMEOUT_MS = 90000;

export const FEED_ITEMS_PER_CHANNEL = 5;
export const FEED_ITEMS_LIMIT = 20;
export const FEED_FETCH_CONCURRENCY = 3;
export const META_FETCH_CONCURRENCY = 3;
export const CHANNEL_VIDEOS_TAB_PARAMS_CANDIDATES = ["EgZ2aWRlb3M=", "EgZ2aWRlb3M%3D"] as const;
export const MAX_VIDEO_META_CACHE_ENTRIES = 1000;

export const HOME_ITEMS_LIMIT = 20;
export const SUBSCRIPTIONS_ITEMS_LIMIT = 20;
export const HOME_PREFETCH_TARGET = 40;
export const SUBSCRIPTIONS_PREFETCH_TARGET = 60;
export const CHANNEL_PREFETCH_TARGET = 20;
export const LOGGED_IN_BROWSE_MAX_PAGES = 4;
export const CHANNEL_BROWSE_MAX_PAGES = 4;

export const FEED_EMPTY_NO_FAVORITES_TEXT = "No videos yet. Add channels to build your feed.";
export const HOME_EMPTY_TEXT = "No home recommendations available.";
export const SUBSCRIPTIONS_EMPTY_TEXT = "No subscription videos available.";
export const SEARCH_IDLE_STATUS_TEXT = "Search YouTube for channels and videos.";
export const SEARCH_CHANNELS_LIMIT = 3;
export const SEARCH_VIDEOS_LIMIT = 20;

export const AD_TEXT_MARKER_PATTERN = /\b(ad(?:vertisement)?|promoted|sponsored)\b/i;
export const AD_KEY_MARKER_PATTERN = /(^ad($|[A-Z_])|adSlot|adBadge|displayAd|inFeedAd|promoted|sponsor|masthead|whyThisAd)/i;
export const SHORTS_ENDPOINT_PATH_MARKER_PATTERN = /\/shorts\//i;
export const LIVE_ENDPOINT_PATH_MARKER_PATTERN = /\/live\//i;
export const SHORTS_ENDPOINT_KEY_MARKER_PATTERN = /(reel|shorts)/i;
export const SHORTS_ENDPOINT_SERIALIZED_MARKER_PATTERN = /(reelWatchEndpoint|shorts|shortForm)/i;
export const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_7_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
export const TV_USER_AGENT = "Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version";
export const TV_CLIENT_NAME = "TVHTML5";
export const TV_CLIENT_NAME_ID = "7";
export const TV_DEFAULT_CLIENT_VERSION = "7.20250219.14.00";

export const TV_OAUTH_PRIMARY_CLIENT: TvOAuthClientIdentity = {
    clientId: "861556708454-d6dlm3lh05idd8npek18k6be8ba3oc68.apps.googleusercontent.com",
    clientSecret: "SboVhoG9s0rNafixCSGGKXAT"
};

export const TV_OAUTH_FALLBACK_CLIENT: TvOAuthClientIdentity = {
    clientId: "861556708454-912i5jlic99ecvu3ro5kqirg0hldli5t.apps.googleusercontent.com",
    clientSecret: "ju2WuMJMOjilz_h_1dPgFdeU"
};
