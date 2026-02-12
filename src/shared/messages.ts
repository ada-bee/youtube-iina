export const MESSAGE_NAMES = {
    PlayItem: "playItem",
    OpenExternalUrl: "openExternalUrl",
    HttpRequest: "httpRequest",
    HttpResponse: "httpResponse",
    ReportWatchStatusRequest: "reportWatchStatusRequest",
    ReportWatchStatusResponse: "reportWatchStatusResponse",
    PlaybackLifecycleEvent: "playbackLifecycleEvent",
    PlaybackPositionEvent: "playbackPositionEvent",
    RequestSettingsSync: "requestSettingsSync",
    SettingsSync: "settingsSync"
} as const;

export type MessageName = typeof MESSAGE_NAMES[keyof typeof MESSAGE_NAMES];

export interface PlayItemPayload {
    videoId: string;
    url: string;
}

export interface OpenExternalUrlPayload {
    url: string;
}

export interface HttpRequestPayload {
    id: string;
    url: string;
    method?: "GET" | "POST";
    headers?: Record<string, string>;
    body?: unknown;
}

export interface HttpResponsePayload {
    id: string;
    ok: boolean;
    statusCode: number;
    reason?: string;
    text?: string;
    error?: string;
}

export type WatchStatusSource = "anonymous" | "logged_in";
export type WatchStatusTrigger = "interval" | "ended" | "manual";

export interface ReportWatchStatusRequestPayload {
    requestId: string;
    videoId: string;
    source: WatchStatusSource;
    trigger: WatchStatusTrigger;
    positionSeconds?: number;
    durationSeconds?: number;
    watchedPercent?: number;
}

export interface ReportWatchStatusResponsePayload {
    requestId: string;
    accepted: boolean;
    deferred: boolean;
    error?: string;
}

export type PlaybackLifecycleEventType = "file-loaded" | "play" | "pause" | "resume" | "ended" | "stopped";

export interface PlaybackLifecycleEventPayload {
    event: PlaybackLifecycleEventType;
    path?: string;
    videoId?: string;
    observedAt: string;
}

export interface PlaybackPositionEventPayload {
    videoId?: string;
    positionSeconds: number;
    durationSeconds?: number;
    isPaused?: boolean;
    observedAt: string;
}

export interface RequestSettingsSyncPayload {
    requestId: string;
}

export interface SettingsSyncPayload {
    requestId: string;
    schemaVersion: number;
    featureFlags?: {
        enableSponsorBlock?: boolean;
        enableWatchStatusSyncSignedIn?: boolean;
        enableWatchStatusLocalAnonymous?: boolean;
        includeLivestreams?: boolean;
    };
}

export interface UiToPluginMessagePayloads {
    playItem: PlayItemPayload;
    openExternalUrl: OpenExternalUrlPayload;
    httpRequest: HttpRequestPayload;
    reportWatchStatusRequest: ReportWatchStatusRequestPayload;
    requestSettingsSync: RequestSettingsSyncPayload;
}

export interface PluginToUiMessagePayloads {
    httpResponse: HttpResponsePayload;
    reportWatchStatusResponse: ReportWatchStatusResponsePayload;
    playbackLifecycleEvent: PlaybackLifecycleEventPayload;
    playbackPositionEvent: PlaybackPositionEventPayload;
    settingsSync: SettingsSyncPayload;
}

export type MessagePayloads = UiToPluginMessagePayloads & PluginToUiMessagePayloads;

export type UiToPluginMessageName = keyof UiToPluginMessagePayloads;
export type PluginToUiMessageName = keyof PluginToUiMessagePayloads;

export type MessagePayload<Name extends MessageName> = MessagePayloads[Name];
