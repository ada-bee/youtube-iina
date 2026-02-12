import type { FeedVideoItem, JsonObject } from "../types";
import { formatHumanReadableViews } from "../utils/format";
import { isValidYouTubeVideoId } from "../utils/ids";
import { asObject, asString } from "../utils/json";
import { extractText, extractThumbnailUrl } from "../utils/text";
import {
    buildFallbackThumbnailUrl,
    dedupeFeedItems,
    extractTileMetadataLineTexts,
    isLikelyAdVideoRenderer,
    isLikelyShortOrLiveVideoRenderer,
    isLikelyVideoThumbnailUrl
} from "./common";

function parseFeedVideoFromRenderer(renderer: JsonObject): FeedVideoItem | null {
    const contentType = asString(renderer.contentType).trim();
    if (contentType && !/VIDEO/i.test(contentType)) {
        return null;
    }

    const tileHeaderRenderer = asObject(asObject(renderer.header)?.tileHeaderRenderer);
    const tileMetadataRenderer = asObject(asObject(renderer.metadata)?.tileMetadataRenderer);
    const watchEndpoint = asObject(asObject(renderer.navigationEndpoint)?.watchEndpoint)
        || asObject(asObject(renderer.onSelectCommand)?.watchEndpoint);
    const watchEndpointVideoId = asString(watchEndpoint?.videoId).trim();
    const tileLines = extractTileMetadataLineTexts(tileMetadataRenderer?.lines);
    const tileStatsLine = tileLines.find((line) => /views?/i.test(line)) || "";
    const tileChannelLine = tileLines.find((line) => !/views?/i.test(line) && line !== "•") || "";

    const rendererVideoId = asString(renderer.videoId).trim();
    const contentId = asString(renderer.contentId).trim();
    const videoId = rendererVideoId || watchEndpointVideoId || contentId;
    const title = extractText(renderer.title).trim()
        || extractText(renderer.headline).trim()
        || extractText(renderer.videoTitle).trim()
        || extractText(tileMetadataRenderer?.title).trim();
    const channelTitle = extractText(renderer.longBylineText).trim()
        || extractText(renderer.shortBylineText).trim()
        || extractText(renderer.ownerText).trim()
        || extractText(renderer.subtitle).trim()
        || extractText(renderer.bylineText).trim()
        || tileChannelLine
        || "Unknown channel";
    const thumbnailSourceUrl = extractThumbnailUrl(renderer.thumbnail)
        || extractThumbnailUrl(renderer.avatar)
        || extractThumbnailUrl(asObject(renderer.thumbnailRenderer)?.thumbnail)
        || extractThumbnailUrl(tileHeaderRenderer?.thumbnail);
    const thumbnailUrl = thumbnailSourceUrl || (videoId ? buildFallbackThumbnailUrl(videoId) : "");
    const rawViewCountText = extractText(renderer.shortViewCountText).trim() || extractText(renderer.viewCountText).trim();
    const viewCountText = formatHumanReadableViews(rawViewCountText || tileStatsLine);
    const publishedText = extractText(renderer.publishedTimeText).trim()
        || extractText(renderer.publishedText).trim()
        || extractText(renderer.metadataText).trim()
        || tileStatsLine
        || new Date().toISOString();

    if (isLikelyAdVideoRenderer(renderer, title, channelTitle, [publishedText, rawViewCountText, ...tileLines])) {
        return null;
    }

    if (isLikelyShortOrLiveVideoRenderer(renderer)) {
        return null;
    }

    if (!videoId || !title) {
        return null;
    }

    if (!isValidYouTubeVideoId(videoId)) {
        return null;
    }

    if (!isValidYouTubeVideoId(watchEndpointVideoId) || watchEndpointVideoId !== videoId) {
        return null;
    }

    if (!thumbnailSourceUrl || !isLikelyVideoThumbnailUrl(thumbnailSourceUrl)) {
        return null;
    }

    return {
        videoId,
        title,
        published: publishedText,
        channelTitle,
        thumbnailUrl,
        viewCountText: viewCountText || undefined
    };
}

function collectFeedVideoRenderers(node: unknown, videos: FeedVideoItem[]): void {
    const objectNode = asObject(node);
    if (!objectNode) {
        return;
    }

    const parsedSelf = parseFeedVideoFromRenderer(objectNode);
    if (parsedSelf) {
        videos.push(parsedSelf);
    }

    Object.values(objectNode).forEach((value) => {
        if (Array.isArray(value)) {
            value.forEach((entry) => {
                collectFeedVideoRenderers(entry, videos);
            });
            return;
        }

        if (value && typeof value === "object") {
            collectFeedVideoRenderers(value, videos);
        }
    });
}

export function parseFeedItemsFromBrowseResponse(payload: unknown): FeedVideoItem[] {
    const videos: FeedVideoItem[] = [];
    collectFeedVideoRenderers(payload, videos);
    return dedupeFeedItems(videos);
}
