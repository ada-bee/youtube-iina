import type { FeedVideoItem, SearchVideoResult, VideoMetadata } from "../types";
import { formatHumanReadableViews } from "../utils/format";

export interface FeedItemPresentation {
    title: string;
    thumbnailUrl: string;
    durationLabel: string;
    channelLine: string;
    statsLine: string;
}

export interface SearchVideoPresentation {
    thumbnailUrl: string;
    durationLabel: string;
    channelLine: string;
    statsLine: string;
}

function parseRelativeAgeToTimestamp(value: string): number {
    const trimmed = value.trim();
    if (!trimmed) {
        return 0;
    }

    const normalized = trimmed
        .replace(/^streamed\s+/i, "")
        .replace(/^premiered\s+/i, "")
        .trim()
        .toLowerCase();

    if (!normalized) {
        return 0;
    }

    if (normalized === "today" || normalized === "just now") {
        return Date.now();
    }

    if (normalized === "yesterday") {
        return Date.now() - (24 * 60 * 60 * 1000);
    }

    const match = normalized.match(/(\d+)\s*(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|months?|mos?|mo|years?|yrs?|y)\s*ago/i);
    if (!match?.[1] || !match[2]) {
        return 0;
    }

    const quantity = Number.parseInt(match[1], 10);
    if (!Number.isFinite(quantity) || quantity <= 0) {
        return 0;
    }

    const unit = match[2].toLowerCase();
    const unitSeconds = unit.startsWith("s")
        ? 1
        : unit.startsWith("m") && unit !== "mo" && !unit.startsWith("mos") && !unit.startsWith("month")
            ? 60
            : unit.startsWith("h")
                ? 60 * 60
                : unit.startsWith("d")
                    ? 60 * 60 * 24
                    : unit.startsWith("w")
                        ? 60 * 60 * 24 * 7
                        : unit.startsWith("mo") || unit.startsWith("month")
                            ? 60 * 60 * 24 * 30
                            : 60 * 60 * 24 * 365;

    return Date.now() - (quantity * unitSeconds * 1000);
}

export function getPublishedTimestamp(published: string): number {
    const timestamp = Date.parse(published);
    if (Number.isFinite(timestamp)) {
        return timestamp;
    }
    return parseRelativeAgeToTimestamp(published);
}

function formatPublishedText(published: string): string {
    const timestamp = getPublishedTimestamp(published);
    if (timestamp === 0) {
        return "";
    }
    return new Date(timestamp).toLocaleString();
}

function formatRelativeAge(published: string): string {
    const timestamp = getPublishedTimestamp(published);
    if (!timestamp) {
        return "";
    }

    const deltaSeconds = Math.floor((Date.now() - timestamp) / 1000);
    if (deltaSeconds < 10) {
        return "just now";
    }
    if (deltaSeconds < 60) {
        return `${deltaSeconds}s ago`;
    }

    const units = [
        { seconds: 60, suffix: "m" },
        { seconds: 60 * 60, suffix: "h" },
        { seconds: 60 * 60 * 24, suffix: "d" },
        { seconds: 60 * 60 * 24 * 7, suffix: "w" },
        { seconds: 60 * 60 * 24 * 30, suffix: "mo" },
        { seconds: 60 * 60 * 24 * 365, suffix: "y" }
    ];

    for (let index = units.length - 1; index >= 0; index -= 1) {
        const unit = units[index];
        if (deltaSeconds >= unit.seconds) {
            const value = Math.floor(deltaSeconds / unit.seconds);
            return `${value}${unit.suffix} ago`;
        }
    }

    return "";
}

function formatDuration(durationSeconds: number): string {
    const total = Math.max(0, Math.floor(durationSeconds));
    if (total <= 0) {
        return "";
    }

    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;

    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function buildFeedStatsLine(item: FeedVideoItem, metadata: VideoMetadata | null): string {
    const views = formatHumanReadableViews(metadata?.viewCountText || item.viewCountText || "");
    const age = formatRelativeAge(item.published) || formatPublishedText(item.published);

    return [views, age]
        .map((value) => value.trim())
        .filter(Boolean)
        .join(" • ");
}

function buildSearchVideoStatsLine(video: SearchVideoResult, metadata: VideoMetadata | null): string {
    const views = formatHumanReadableViews(metadata?.viewCountText || "");
    const age = formatRelativeAge(video.publishedText) || formatPublishedText(video.publishedText) || video.publishedText.trim();

    return [views, age]
        .map((value) => value.trim())
        .filter(Boolean)
        .join(" • ");
}

export function resolveFeedItemPresentation(itemData: FeedVideoItem, metadata: VideoMetadata | null): FeedItemPresentation {
    const resolvedDurationSeconds = metadata?.durationSeconds || 0;
    return {
        title: metadata?.title || itemData.title,
        thumbnailUrl: metadata?.thumbnailUrl || itemData.thumbnailUrl,
        durationLabel: resolvedDurationSeconds > 0 ? formatDuration(resolvedDurationSeconds) : "",
        channelLine: (metadata?.channelTitle || itemData.channelTitle || "").trim(),
        statsLine: buildFeedStatsLine(itemData, metadata)
    };
}

export function resolveSearchVideoPresentation(video: SearchVideoResult, metadata: VideoMetadata | null): SearchVideoPresentation {
    const resolvedDurationSeconds = metadata?.durationSeconds || 0;
    return {
        thumbnailUrl: metadata?.thumbnailUrl || video.thumbnailUrl,
        durationLabel: resolvedDurationSeconds > 0 ? formatDuration(resolvedDurationSeconds) : "",
        channelLine: (metadata?.channelTitle || video.channelTitle || "Unknown channel").trim(),
        statsLine: buildSearchVideoStatsLine(video, metadata)
    };
}
