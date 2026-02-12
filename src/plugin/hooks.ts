import type { PlaybackLifecycleEventType } from "../shared/messages";

import { MESSAGE_NAMES } from "../shared/messages";

const POSITION_EVENT_INTERVAL_MS = 1200;
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

interface PlaybackHookDependencies {
    event: {
        on: (eventName: string, callback: () => void) => string;
    };
    mpv: {
        getString: (name: string) => string;
        getNumber: (name: string) => number;
        getFlag: (name: string) => boolean;
    };
    sidebar: {
        postMessage: (name: string, payload: unknown) => void;
    };
}

function toFiniteNumber(value: unknown): number | undefined {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return undefined;
    }

    return value;
}

function getCurrentPath(mpv: PlaybackHookDependencies["mpv"]): string {
    try {
        return String(mpv.getString("path") || "").trim();
    } catch {
        return "";
    }
}

function getPlaybackPositionSeconds(mpv: PlaybackHookDependencies["mpv"]): number | undefined {
    try {
        return toFiniteNumber(mpv.getNumber("time-pos"));
    } catch {
        return undefined;
    }
}

function getDurationSeconds(mpv: PlaybackHookDependencies["mpv"]): number | undefined {
    try {
        return toFiniteNumber(mpv.getNumber("duration"));
    } catch {
        return undefined;
    }
}

function getPausedState(mpv: PlaybackHookDependencies["mpv"]): boolean | undefined {
    try {
        const value = mpv.getFlag("pause");
        return typeof value === "boolean" ? value : undefined;
    } catch {
        return undefined;
    }
}

function extractVideoIdFromPath(pathValue: string): string | undefined {
    const rawPath = pathValue.trim();
    if (!rawPath) {
        return undefined;
    }

    const hostMatch = rawPath.match(/^https?:\/\/([^/?#]+)/i);
    if (!hostMatch) {
        return undefined;
    }

    const host = hostMatch[1].toLowerCase();
    const afterHost = rawPath.slice(hostMatch[0].length);
    const pathOnly = afterHost.split("?")[0].split("#")[0] || "/";

    if (host === "youtu.be") {
        const candidate = pathOnly.replace(/^\/+/, "").split("/")[0] || "";
        return VIDEO_ID_PATTERN.test(candidate) ? candidate : undefined;
    }

    if (!host.endsWith("youtube.com")) {
        return undefined;
    }

    if (pathOnly === "/watch") {
        const videoIdMatch = rawPath.match(/[?&]v=([A-Za-z0-9_-]{11})(?:[&#]|$)/);
        const candidate = videoIdMatch?.[1] || "";
        return VIDEO_ID_PATTERN.test(candidate) ? candidate : undefined;
    }

    const shortsMatch = pathOnly.match(/^\/shorts\/([A-Za-z0-9_-]{11})(?:\/|$)/);
    if (shortsMatch?.[1] && VIDEO_ID_PATTERN.test(shortsMatch[1])) {
        return shortsMatch[1];
    }

    const embedMatch = pathOnly.match(/^\/embed\/([A-Za-z0-9_-]{11})(?:\/|$)/);
    if (embedMatch?.[1] && VIDEO_ID_PATTERN.test(embedMatch[1])) {
        return embedMatch[1];
    }

    const directIdMatch = pathOnly.match(/^\/([A-Za-z0-9_-]{11})(?:\/|$)/);
    if (directIdMatch?.[1] && VIDEO_ID_PATTERN.test(directIdMatch[1])) {
        return directIdMatch[1];
    }

    if (VIDEO_ID_PATTERN.test(rawPath)) {
        return rawPath;
    }

    if (rawPath.includes("watch?v=")) {
        const videoIdMatch = rawPath.match(/watch\?v=([A-Za-z0-9_-]{11})(?:[&#]|$)/);
        const candidate = videoIdMatch?.[1] || "";
        if (VIDEO_ID_PATTERN.test(candidate)) {
            return candidate;
        }
    }

    if (rawPath.includes("youtu.be/")) {
        const shortMatch = rawPath.match(/youtu\.be\/([A-Za-z0-9_-]{11})(?:[/?#]|$)/);
        const candidate = shortMatch?.[1] || "";
        if (VIDEO_ID_PATTERN.test(candidate)) {
            return candidate;
        }
    }

    if (rawPath.includes("shorts/")) {
        const shortIdMatch = rawPath.match(/shorts\/([A-Za-z0-9_-]{11})(?:[/?#]|$)/);
        const candidate = shortIdMatch?.[1] || "";
        if (VIDEO_ID_PATTERN.test(candidate)) {
            return candidate;
        }
    }

    if (rawPath.includes("embed/")) {
        const embedIdMatch = rawPath.match(/embed\/([A-Za-z0-9_-]{11})(?:[/?#]|$)/);
        const candidate = embedIdMatch?.[1] || "";
        if (VIDEO_ID_PATTERN.test(candidate)) {
            return candidate;
        }
    }

    if (pathOnly.endsWith(".png")) {
        return undefined;
    }

    return undefined;
}

function postLifecycleEvent(
    sidebar: PlaybackHookDependencies["sidebar"],
    mpv: PlaybackHookDependencies["mpv"],
    eventType: PlaybackLifecycleEventType
): void {
    const path = getCurrentPath(mpv);
    sidebar.postMessage(MESSAGE_NAMES.PlaybackLifecycleEvent, {
        event: eventType,
        path: path || undefined,
        videoId: extractVideoIdFromPath(path),
        observedAt: new Date().toISOString()
    });
}

function postPositionEvent(sidebar: PlaybackHookDependencies["sidebar"], mpv: PlaybackHookDependencies["mpv"]): void {
    const path = getCurrentPath(mpv);
    const positionSeconds = getPlaybackPositionSeconds(mpv);
    if (positionSeconds === undefined) {
        return;
    }

    sidebar.postMessage(MESSAGE_NAMES.PlaybackPositionEvent, {
        videoId: extractVideoIdFromPath(path),
        positionSeconds,
        durationSeconds: getDurationSeconds(mpv),
        isPaused: getPausedState(mpv),
        observedAt: new Date().toISOString()
    });
}

export function installPlaybackHookScaffolding(dependencies: PlaybackHookDependencies): void {
    let lastPositionEventAt = 0;

    dependencies.event.on("mpv.file-loaded", () => {
        postLifecycleEvent(dependencies.sidebar, dependencies.mpv, "file-loaded");
        postPositionEvent(dependencies.sidebar, dependencies.mpv);
    });

    dependencies.event.on("iina.file-started", () => {
        postLifecycleEvent(dependencies.sidebar, dependencies.mpv, "play");
    });

    dependencies.event.on("mpv.pause.changed", () => {
        const paused = getPausedState(dependencies.mpv) === true;
        postLifecycleEvent(dependencies.sidebar, dependencies.mpv, paused ? "pause" : "resume");
        postPositionEvent(dependencies.sidebar, dependencies.mpv);
    });

    dependencies.event.on("mpv.end-file", () => {
        postLifecycleEvent(dependencies.sidebar, dependencies.mpv, "ended");
        postPositionEvent(dependencies.sidebar, dependencies.mpv);
    });

    dependencies.event.on("mpv.time-pos.changed", () => {
        const now = Date.now();
        if (now - lastPositionEventAt < POSITION_EVENT_INTERVAL_MS) {
            return;
        }

        lastPositionEventAt = now;
        postPositionEvent(dependencies.sidebar, dependencies.mpv);
    });

    dependencies.event.on("iina.window-will-close", () => {
        postLifecycleEvent(dependencies.sidebar, dependencies.mpv, "stopped");
    });
}
