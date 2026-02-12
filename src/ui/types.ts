export type ViewName = "feed" | "subscriptions" | "search" | "favorites";
export type AppMode = "anonymous" | "logged_in";

export interface UiFeatureFlags {
    enableSponsorBlock: boolean;
    enableWatchStatusSyncSignedIn: boolean;
    enableWatchStatusLocalAnonymous: boolean;
    includeLivestreams: boolean;
}

export interface UiSettings {
    schemaVersion: number;
    featureFlags: UiFeatureFlags;
}

export interface FavoriteChannel {
    channelId: string;
    title: string;
    thumbnailUrl: string;
    channelHandle?: string;
    addedAt: string;
}

export interface SearchChannelResult {
    channelId: string;
    title: string;
    thumbnailUrl: string;
    channelHandle: string;
}

export interface SearchVideoResult {
    videoId: string;
    title: string;
    channelTitle: string;
    thumbnailUrl: string;
    publishedText: string;
}

export interface InnertubeConfig {
    apiKey: string;
    clientVersion: string;
    visitorData?: string;
    fetchedAt: number;
}

export interface TvInnertubeConfig {
    apiKey: string;
    clientVersion: string;
    visitorData?: string;
    fetchedAt: number;
}

export interface TvOAuthClientIdentity {
    clientId: string;
    clientSecret: string;
}

export interface TvOAuthTokens {
    accessToken: string;
    refreshToken: string;
    expiryDate: string;
}

export interface TvOAuthCache {
    client: TvOAuthClientIdentity;
    tokens: TvOAuthTokens;
}

export interface DeviceCodeResponse {
    device_code: string;
    user_code: string;
    verification_url?: string;
    expires_in: number;
    interval: number;
}

export interface DeviceCodeRequestResult {
    identity: TvOAuthClientIdentity;
    deviceCode: DeviceCodeResponse;
}

export interface SearchState {
    query: string;
    isLoading: boolean;
    channels: SearchChannelResult[];
    videos: SearchVideoResult[];
    status: string;
}

export interface FeedVideoItem {
    videoId: string;
    title: string;
    published: string;
    channelTitle: string;
    thumbnailUrl: string;
    viewCountText?: string;
}

export interface VideoMetadata {
    schemaVersion?: number;
    fetchedAt: number;
    title?: string;
    channelTitle?: string;
    thumbnailUrl?: string;
    durationSeconds?: number;
    isShortForm?: boolean;
    viewCountText?: string;
    likeCountText?: string;
}

export type VideoMetadataCacheMap = Record<string, VideoMetadata>;

export interface FeedState {
    isLoading: boolean;
    items: FeedVideoItem[];
    status: string;
    warning: string;
}

export interface ChannelFeedResult {
    channelId: string;
    items: FeedVideoItem[];
    hadError: boolean;
}

export type JsonObject = Record<string, unknown>;
