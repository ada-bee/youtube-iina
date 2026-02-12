import { loadTvAuthCacheFromStorage } from "./storage/authCache";
import { SEARCH_IDLE_STATUS_TEXT } from "./constants";
import { loadFavoritesFromStorage } from "./storage/favorites";
import {
    loadUiSettingsFromStorage,
    persistUiSettingsToStorage
} from "./storage/settings";
import { loadVideoMetadataCacheFromStorage } from "./storage/videoMetaCache";
import type {
    AppMode,
    DeviceCodeResponse,
    FavoriteChannel,
    FeedState,
    SearchState,
    UiSettings,
    TvOAuthCache,
    VideoMetadataCacheMap,
    ViewName
} from "./types";

export interface UiState {
    iinaApi: typeof iina | undefined;
    favorites: FavoriteChannel[];
    feedRefreshSequence: number;
    subscriptionsRefreshSequence: number;
    appMode: AppMode;
    activeView: ViewName;
    authPending: boolean;
    authStatusMessage: string;
    authPanelState: DeviceCodeResponse | null;
    authPollTimer: number | null;
    authSyncInProgress: boolean;
    tvAuthCache: TvOAuthCache | null;
    uiSettings: UiSettings;
    videoMetadataCacheByVideoId: VideoMetadataCacheMap;
    searchState: SearchState;
    feedState: FeedState;
    subscriptionsState: FeedState;
}

export const state: UiState = {
    iinaApi: (globalThis as { iina?: typeof iina }).iina,
    favorites: loadFavoritesFromStorage(),
    feedRefreshSequence: 0,
    subscriptionsRefreshSequence: 0,
    appMode: "anonymous",
    activeView: "feed",
    authPending: false,
    authStatusMessage: "",
    authPanelState: null,
    authPollTimer: null,
    authSyncInProgress: false,
    tvAuthCache: loadTvAuthCacheFromStorage(),
    uiSettings: loadUiSettingsFromStorage(),
    videoMetadataCacheByVideoId: loadVideoMetadataCacheFromStorage(),
    searchState: {
        query: "",
        isLoading: false,
        channels: [],
        videos: [],
        status: SEARCH_IDLE_STATUS_TEXT
    },
    feedState: {
        isLoading: false,
        items: [],
        status: "",
        warning: ""
    },
    subscriptionsState: {
        isLoading: false,
        items: [],
        status: "",
        warning: ""
    }
};

export function setUiSettings(uiSettings: UiSettings): boolean {
    const didPersist = persistUiSettingsToStorage(uiSettings);
    if (!didPersist) {
        return false;
    }

    state.uiSettings = loadUiSettingsFromStorage();
    return true;
}
