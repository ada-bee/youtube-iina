import type { JsonObject, SearchChannelResult, SearchVideoResult } from "../types";
import { isValidYouTubeVideoId } from "../utils/ids";
import { asObject, asString } from "../utils/json";
import { extractText, extractThumbnailUrl } from "../utils/text";
import {
    buildFallbackThumbnailUrl,
    extractChannelHandle,
    isLikelyAdVideoRenderer,
    isLikelyShortOrLiveVideoRenderer
} from "./common";

function parseChannelRenderer(renderer: JsonObject): SearchChannelResult | null {
    const channelId = asString(renderer.channelId)
        || asString(asObject(asObject(renderer.navigationEndpoint)?.browseEndpoint)?.browseId);
    const title = extractText(renderer.title).trim();
    const channelThumbnailSupportedRenderers = asObject(renderer.channelThumbnailSupportedRenderers);
    const thumbnailSource = extractThumbnailUrl(renderer.thumbnail)
        || extractThumbnailUrl(asObject(channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer)?.thumbnail)
        || extractThumbnailUrl(asObject(channelThumbnailSupportedRenderers?.channelThumbnailWithNavigationEndpointRenderer)?.thumbnail);
    const channelHandle = extractChannelHandle(renderer);
    const thumbnailUrl = thumbnailSource || "";

    if (!channelId || !title) {
        return null;
    }

    return {
        channelId,
        title,
        thumbnailUrl,
        channelHandle
    };
}

function parseVideoRenderer(renderer: JsonObject): SearchVideoResult | null {
    const videoId = asString(renderer.videoId).trim();
    const title = extractText(renderer.title).trim();
    const channelTitle = extractText(renderer.longBylineText) || extractText(renderer.ownerText) || "Unknown channel";
    const thumbnailUrl = extractThumbnailUrl(renderer.thumbnail)
        || buildFallbackThumbnailUrl(videoId);
    const publishedText = extractText(renderer.publishedTimeText).trim();
    if (!videoId || !title) {
        return null;
    }

    if (!isValidYouTubeVideoId(videoId)) {
        return null;
    }

    if (isLikelyAdVideoRenderer(renderer, title, channelTitle, [publishedText])) {
        return null;
    }

    if (isLikelyShortOrLiveVideoRenderer(renderer)) {
        return null;
    }

    return {
        videoId,
        title,
        channelTitle,
        thumbnailUrl,
        publishedText
    };
}

function collectSearchRenderers(node: unknown, channels: SearchChannelResult[], videos: SearchVideoResult[]): void {
    const objectNode = asObject(node);
    if (!objectNode) {
        return;
    }

    const channelRenderer = asObject(objectNode.channelRenderer);
    if (channelRenderer) {
        const channel = parseChannelRenderer(channelRenderer);
        if (channel) {
            channels.push(channel);
        }
    }

    const videoRenderer = asObject(objectNode.videoRenderer);
    if (videoRenderer) {
        const video = parseVideoRenderer(videoRenderer);
        if (video) {
            videos.push(video);
        }
    }

    Object.values(objectNode).forEach((value) => {
        if (Array.isArray(value)) {
            value.forEach((entry) => {
                collectSearchRenderers(entry, channels, videos);
            });
            return;
        }

        if (value && typeof value === "object") {
            collectSearchRenderers(value, channels, videos);
        }
    });
}

export function parseSearchResponse(payload: unknown): { channels: SearchChannelResult[]; videos: SearchVideoResult[] } {
    const channels: SearchChannelResult[] = [];
    const videos: SearchVideoResult[] = [];

    collectSearchRenderers(payload, channels, videos);

    const uniqueChannels = new Map<string, SearchChannelResult>();
    channels.forEach((channel) => {
        if (!uniqueChannels.has(channel.channelId)) {
            uniqueChannels.set(channel.channelId, channel);
        }
    });

    const uniqueVideos = new Map<string, SearchVideoResult>();
    videos.forEach((video) => {
        if (!uniqueVideos.has(video.videoId)) {
            uniqueVideos.set(video.videoId, video);
        }
    });

    return {
        channels: [...uniqueChannels.values()],
        videos: [...uniqueVideos.values()]
    };
}
