import { SHORTS_ENDPOINT_PATH_MARKER_PATTERN } from "../constants";
import type { JsonObject, VideoMetadata } from "../types";
import { normalizeLikeCountText, normalizePositiveInteger, normalizeViewCountText } from "../utils/format";
import { asArray, asObject, asString } from "../utils/json";
import { decodeEscapedText, extractText, extractThumbnailUrl } from "../utils/text";
import { buildFallbackThumbnailUrl, hasTruthyFlag } from "./common";

function extractLikeCountFromVideoActions(actions: unknown): string {
    const actionsArray = asArray(actions);
    for (const action of actionsArray) {
        const actionObj = asObject(action);
        if (!actionObj) {
            continue;
        }
        const segmented = asObject(actionObj.segmentedLikeDislikeButtonViewModel);
        const likeButton = asObject(segmented?.likeButtonViewModel);
        const likeStatusEntity = asObject(likeButton?.likeButtonViewModel);
        const likeCountEntityKey = asString(likeStatusEntity?.likeStatusEntityKey);
        if (likeCountEntityKey) {
            const candidate = likeCountEntityKey.match(/:([0-9][0-9,.KMkmB]*)$/);
            if (candidate && candidate[1]) {
                return `${candidate[1]} likes`;
            }
        }
    }
    return "";
}

export function parseLikeCountFromNextResponseText(responseText: string): string {
    const matcher = /"label":"([^"]*likes?)"/ig;
    let match: RegExpExecArray | null = null;
    while ((match = matcher.exec(responseText)) !== null) {
        const decoded = decodeEscapedText(match[1]);
        if (/[0-9]/.test(decoded)) {
            const normalized = normalizeLikeCountText(decoded);
            if (normalized) {
                return normalized;
            }
        }
    }
    return "";
}

export function parseViewCountFromNextResponseText(responseText: string): string {
    const matcher = /"label":"([^"]*views?)"/ig;
    let match: RegExpExecArray | null = null;
    while ((match = matcher.exec(responseText)) !== null) {
        const decoded = decodeEscapedText(match[1]);
        if (/[0-9]/.test(decoded)) {
            const normalized = normalizeViewCountText(decoded);
            if (normalized) {
                return normalized;
            }
        }
    }
    return "";
}

export function parseVideoMetadataResponse(payload: unknown, fallbackVideoId: string): VideoMetadata | null {
    const root = asObject(payload);
    if (!root) {
        return null;
    }

    const videoDetails = asObject(root.videoDetails);
    const microformat = asObject(asObject(root.microformat)?.playerMicroformatRenderer);
    const playability = asObject(root.playabilityStatus);

    const durationSeconds = normalizePositiveInteger(asString(videoDetails?.lengthSeconds)) || 0;

    const title = asString(videoDetails?.title).trim()
        || extractText(microformat?.title).trim()
        || undefined;
    const channelTitle = asString(videoDetails?.author).trim()
        || extractText(microformat?.ownerChannelName).trim()
        || undefined;

    let thumbnailUrl = extractThumbnailUrl(videoDetails?.thumbnail);
    if (!thumbnailUrl) {
        thumbnailUrl = extractThumbnailUrl(microformat?.thumbnail);
    }
    if (!thumbnailUrl && fallbackVideoId) {
        thumbnailUrl = buildFallbackThumbnailUrl(fallbackVideoId);
    }

    const basicLikeCount = asString(videoDetails?.shortDescription).match(/([0-9][0-9,.KMkmB]*)\s+likes?/i)?.[1] || "";
    const fromActions = extractLikeCountFromVideoActions(root.frameworkUpdates);
    const likeCountText = normalizeLikeCountText(fromActions || basicLikeCount);
    const viewCountText = normalizeViewCountText(asString(videoDetails?.viewCount).trim());
    const isShortsEligible = hasTruthyFlag(videoDetails?.isShortsEligible) || hasTruthyFlag(microformat?.isShortsEligible);
    const canonicalUrl = asString(microformat?.urlCanonical).trim()
        || asString(microformat?.canonicalUrl).trim()
        || asString(microformat?.url).trim();
    const microformatSerialized = microformat ? JSON.stringify(microformat) : "";
    const isShortCanonicalPath = SHORTS_ENDPOINT_PATH_MARKER_PATTERN.test(canonicalUrl)
        || Boolean(microformatSerialized && SHORTS_ENDPOINT_PATH_MARKER_PATTERN.test(microformatSerialized));
    const isShortForm = isShortsEligible || isShortCanonicalPath;
    const isPlayable = asString(playability?.status).toUpperCase() !== "ERROR";
    if (!isPlayable && !title && !durationSeconds && !thumbnailUrl) {
        return null;
    }

    return {
        fetchedAt: Date.now(),
        title,
        channelTitle,
        thumbnailUrl: thumbnailUrl || undefined,
        durationSeconds: durationSeconds > 0 ? durationSeconds : undefined,
        isShortForm,
        viewCountText: viewCountText || undefined,
        likeCountText: likeCountText || undefined
    };
}
