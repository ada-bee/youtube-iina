const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

const DEFAULT_MONITOR_INTERVAL_MS = 350;

export interface PlaybackSnapshot {
    path: string;
    videoId?: string;
    positionSeconds?: number;
    durationSeconds?: number;
    isPaused?: boolean;
    observedAt: string;
}

interface PlaybackMonitorDependencies {
    mpv: {
        getString: (name: string) => string;
        getNumber: (name: string) => number;
        getFlag: (name: string) => boolean;
    };
    intervalMs?: number;
    onTick?: (snapshot: PlaybackSnapshot) => void;
    onVideoChange?: (snapshot: PlaybackSnapshot, previousVideoId?: string) => void;
}

export interface PlaybackMonitor {
    start: () => void;
    stop: () => void;
    getLatestSnapshot: () => PlaybackSnapshot;
}

function toFiniteNumber(value: unknown): number | undefined {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return undefined;
    }

    return value;
}

function getCurrentPath(mpv: PlaybackMonitorDependencies["mpv"]): string {
    try {
        return String(mpv.getString("path") || "").trim();
    } catch {
        return "";
    }
}

function getPlaybackPositionSeconds(mpv: PlaybackMonitorDependencies["mpv"]): number | undefined {
    try {
        return toFiniteNumber(mpv.getNumber("time-pos"));
    } catch {
        return undefined;
    }
}

function getDurationSeconds(mpv: PlaybackMonitorDependencies["mpv"]): number | undefined {
    try {
        return toFiniteNumber(mpv.getNumber("duration"));
    } catch {
        return undefined;
    }
}

function getPausedState(mpv: PlaybackMonitorDependencies["mpv"]): boolean | undefined {
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

function buildSnapshot(mpv: PlaybackMonitorDependencies["mpv"]): PlaybackSnapshot {
    const path = getCurrentPath(mpv);

    return {
        path,
        videoId: extractVideoIdFromPath(path),
        positionSeconds: getPlaybackPositionSeconds(mpv),
        durationSeconds: getDurationSeconds(mpv),
        isPaused: getPausedState(mpv),
        observedAt: new Date().toISOString()
    };
}

export function createPlaybackMonitor(dependencies: PlaybackMonitorDependencies): PlaybackMonitor {
    const intervalMs = Math.max(100, Math.floor(dependencies.intervalMs || DEFAULT_MONITOR_INTERVAL_MS));
    let timer: ReturnType<typeof setInterval> | null = null;
    let previousVideoId: string | undefined;
    let latestSnapshot = buildSnapshot(dependencies.mpv);

    const poll = (): void => {
        latestSnapshot = buildSnapshot(dependencies.mpv);
        dependencies.onTick?.(latestSnapshot);

        if (latestSnapshot.videoId === previousVideoId) {
            return;
        }

        const lastVideoId = previousVideoId;
        previousVideoId = latestSnapshot.videoId;
        dependencies.onVideoChange?.(latestSnapshot, lastVideoId);
    };

    const start = (): void => {
        if (timer !== null) {
            return;
        }

        previousVideoId = latestSnapshot.videoId;
        dependencies.onTick?.(latestSnapshot);
        if (latestSnapshot.videoId) {
            dependencies.onVideoChange?.(latestSnapshot, undefined);
        }

        timer = setInterval(() => {
            poll();
        }, intervalMs);
    };

    const stop = (): void => {
        if (timer === null) {
            return;
        }

        clearInterval(timer);
        timer = null;
    };

    const getLatestSnapshot = (): PlaybackSnapshot => {
        latestSnapshot = buildSnapshot(dependencies.mpv);
        return latestSnapshot;
    };

    return {
        start,
        stop,
        getLatestSnapshot
    };
}
