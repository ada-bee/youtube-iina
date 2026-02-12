import type {
    HttpRequestPayload,
    OpenExternalUrlPayload,
    PlayItemPayload,
    ReportWatchStatusRequestPayload,
    RequestSettingsSyncPayload
} from "../shared/messages";

import { MESSAGE_NAMES } from "../shared/messages";
import { installPlaybackHookScaffolding } from "./hooks";
import { handlePlayItem } from "./playback";

const { console, event, sidebar, global, http, utils, mpv } = iina as any;

const SHOW_SIDEBAR_DELAY_MS = 300;
const MAX_HTTP_RESPONSE_TEXT = 120000;
const YOUTUBE_SPLASH_FILENAME = "YouTube.png";
const UI_SETTINGS_SCHEMA_VERSION = 1;

const DEFAULT_PLUGIN_FEATURE_FLAGS = {
    enableSponsorBlock: false,
    enableWatchStatusSyncSignedIn: true,
    enableWatchStatusLocalAnonymous: true,
    includeLivestreams: false
} as const;

function isSplashPath(pathValue: string): boolean {
    return pathValue.includes(YOUTUBE_SPLASH_FILENAME);
}

function shouldTruncateResponse(url: string, method: string): boolean {
    if (method === "POST" && url.includes("/youtubei/")) {
        return false;
    }
    return true;
}

function postSettingsSyncResponse(requestId: string): void {
    sidebar.postMessage(MESSAGE_NAMES.SettingsSync, {
        requestId,
        schemaVersion: UI_SETTINGS_SCHEMA_VERSION,
        featureFlags: DEFAULT_PLUGIN_FEATURE_FLAGS
    });
}

console.log("YouTube: Plugin loaded");

let windowReady = false;
let pendingShowSidebar = false;
let sidebarVisible = false;

function getSidebarVisibility(): boolean {
    const sidebarWithVisibility = sidebar as typeof sidebar & { isVisible?: () => boolean };
    if (typeof sidebarWithVisibility.isVisible === "function") {
        return sidebarWithVisibility.isVisible();
    }

    return sidebarVisible;
}

function showSidebarWithNotification(): void {
    sidebar.show();
    sidebarVisible = true;
    global.postMessage("sidebarShown", {});
}

function showSidebarWithDelay(): void {
    setTimeout(() => {
        showSidebarWithNotification();
    }, SHOW_SIDEBAR_DELAY_MS);
}

function hideSidebar(): void {
    sidebar.hide();
    sidebarVisible = false;
}

function toggleSidebarFromHotkey(): void {
    if (!windowReady) {
        pendingShowSidebar = true;
        return;
    }

    if (getSidebarVisibility()) {
        console.log("YouTube: Sidebar already open, hiding it");
        hideSidebar();
        return;
    }

    showSidebarWithDelay();
}

global.onMessage("showYouTubeSidebar", () => {
    console.log("YouTube: Received showYouTubeSidebar message");
    toggleSidebarFromHotkey();
});

event.on("iina.window-loaded", () => {
    console.log("YouTube: Window loaded");

    sidebar.loadFile("ui/sidebar.html");

    installPlaybackHookScaffolding({
        event,
        mpv,
        sidebar
    });

    event.on("mpv.file-loaded", () => {
        const path = String(mpv.getString("path") || "");
        if (!isSplashPath(path)) {
            return;
        }

        console.log("YouTube: Splash loaded, showing sidebar");
        showSidebarWithNotification();
    });

    sidebar.onMessage(MESSAGE_NAMES.PlayItem, (data: PlayItemPayload) => {
        console.log("YouTube: Received playItem");

        if (!data) {
            return;
        }

        const played = handlePlayItem(data);
        if (!played) {
            return;
        }

        hideSidebar();
    });

    sidebar.onMessage(MESSAGE_NAMES.OpenExternalUrl, (data: OpenExternalUrlPayload) => {
        const url = String(data?.url || "").trim();
        if (!url) {
            return;
        }

        const opened = utils.open(url);
        if (!opened) {
            console.error(`YouTube: Failed to open external URL: ${url}`);
        }
    });

    sidebar.onMessage(MESSAGE_NAMES.HttpRequest, async (data: HttpRequestPayload) => {
        if (!data || !data.id || !data.url) {
            return;
        }

        const requestId = String(data.id);
        const url = String(data.url);
        const method = (data.method || "GET").toUpperCase();

        const options = {
            headers: data.headers ?? {},
            params: {},
            data: data.body ?? ""
        };

        try {
            console.log("YouTube: HTTP request starting:", method, url);
            let response;
            if (method === "POST") {
                response = await http.post(url, options);
            } else {
                response = await http.get(url, options);
            }

            console.log("YouTube: HTTP response:", response.statusCode, response.reason);

            const responseText = typeof response.text === "string" ? response.text : "";
            const shouldTruncate = shouldTruncateResponse(url, method);
            const textWasTruncated = shouldTruncate && responseText.length > MAX_HTTP_RESPONSE_TEXT;
            const safeText = textWasTruncated ? responseText.slice(0, MAX_HTTP_RESPONSE_TEXT) : responseText;
            if (textWasTruncated) {
                console.log(`YouTube: HTTP response text truncated from ${responseText.length} to ${safeText.length}`);
            }

            sidebar.postMessage(MESSAGE_NAMES.HttpResponse, {
                id: requestId,
                ok: response.statusCode >= 200 && response.statusCode < 300,
                statusCode: response.statusCode,
                reason: response.reason,
                text: safeText
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`YouTube: HTTP request failed: ${message}`);
            console.error(`YouTube: HTTP request url: ${url}`);
            sidebar.postMessage(MESSAGE_NAMES.HttpResponse, {
                id: requestId,
                ok: false,
                statusCode: 0,
                reason: "error",
                error: message
            });
        }
    });

    sidebar.onMessage(MESSAGE_NAMES.ReportWatchStatusRequest, (data: ReportWatchStatusRequestPayload) => {
        const requestId = String(data?.requestId || `watch-${Date.now()}`);
        if (!data?.videoId) {
            sidebar.postMessage(MESSAGE_NAMES.ReportWatchStatusResponse, {
                requestId,
                accepted: false,
                deferred: true,
                error: "Missing videoId"
            });
            return;
        }

        sidebar.postMessage(MESSAGE_NAMES.ReportWatchStatusResponse, {
            requestId,
            accepted: false,
            deferred: true
        });
    });

    sidebar.onMessage(MESSAGE_NAMES.RequestSettingsSync, (data: RequestSettingsSyncPayload) => {
        const requestId = String(data?.requestId || `settings-${Date.now()}`);
        postSettingsSyncResponse(requestId);
    });

    windowReady = true;
    global.postMessage("playerReady", {});

    if (pendingShowSidebar) {
        console.log("YouTube: Showing sidebar (pending request)");
        showSidebarWithDelay();
        pendingShowSidebar = false;
    }

    console.log("YouTube: Ready");
});
