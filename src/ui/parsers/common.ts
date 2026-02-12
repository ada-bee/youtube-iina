import {
    AD_KEY_MARKER_PATTERN,
    AD_TEXT_MARKER_PATTERN,
    LIVE_ENDPOINT_PATH_MARKER_PATTERN,
    SHORTS_ENDPOINT_KEY_MARKER_PATTERN,
    SHORTS_ENDPOINT_PATH_MARKER_PATTERN,
    SHORTS_ENDPOINT_SERIALIZED_MARKER_PATTERN
} from "../constants";
import type {
    FeedParseDiagnostics,
    FeedParseRejectReason,
    FeedVideoItem,
    JsonObject
} from "../types";
import { asArray, asObject, asString } from "../utils/json";
import { extractText, normalizeChannelHandle } from "../utils/text";

export function extractChannelHandle(renderer: JsonObject): string {
    const browseEndpoint = asObject(asObject(renderer.navigationEndpoint)?.browseEndpoint);
    const webCommandMetadata = asObject(asObject(asObject(renderer.navigationEndpoint)?.commandMetadata)?.webCommandMetadata);

    const candidates = [
        extractText(renderer.subtitle).trim(),
        extractText(renderer.shortBylineText).trim(),
        extractText(renderer.ownerText).trim(),
        asString(renderer.handle).trim(),
        asString(browseEndpoint?.canonicalBaseUrl).trim(),
        asString(webCommandMetadata?.url).trim()
    ];

    for (const candidate of candidates) {
        const handle = normalizeChannelHandle(candidate);
        if (handle) {
            return handle;
        }
    }

    return "";
}

export function extractTileMetadataLineTexts(value: unknown): string[] {
    const lines = asArray(value);
    if (lines.length === 0) {
        return [];
    }

    return lines
        .map((line) => {
            const lineRenderer = asObject(asObject(line)?.lineRenderer);
            const items = asArray(lineRenderer?.items);
            const segments = items
                .map((item) => {
                    const lineItemRenderer = asObject(asObject(item)?.lineItemRenderer);
                    const text = extractText(lineItemRenderer?.text).trim();
                    if (text) {
                        return text;
                    }
                    const badgeLabel = extractText(asObject(lineItemRenderer?.badge)?.metadataBadgeRenderer).trim();
                    return badgeLabel;
                })
                .map((part) => part.trim())
                .filter(Boolean);

            return segments.join(" ").replace(/\s+•\s+/g, " • ").trim();
        })
        .map((lineText) => lineText.trim())
        .filter(Boolean);
}

function extractMetadataBadgeTexts(value: unknown): string[] {
    const badges = asArray(value);
    if (badges.length === 0) {
        return [];
    }

    return badges
        .flatMap((metadataBadge) => {
            const metadataBadgeRenderer = asObject(asObject(metadataBadge)?.metadataBadgeRenderer);
            if (!metadataBadgeRenderer) {
                return [];
            }
            return [
                extractText(metadataBadgeRenderer.label).trim(),
                extractText(metadataBadgeRenderer.tooltip).trim(),
                asString(metadataBadgeRenderer.style).trim()
            ];
        })
        .filter(Boolean);
}

function hasAdMarkerText(value: string): boolean {
    return AD_TEXT_MARKER_PATTERN.test(value.trim());
}

function hasAdMarkerKey(renderer: JsonObject): boolean {
    return Object.keys(renderer).some((key) => AD_KEY_MARKER_PATTERN.test(key));
}

function isLikelyShortOrLiveEndpoint(endpoint: JsonObject | null): boolean {
    if (!endpoint) {
        return false;
    }

    if (Object.keys(endpoint).some((key) => SHORTS_ENDPOINT_KEY_MARKER_PATTERN.test(key))) {
        return true;
    }

    const webCommandMetadata = asObject(asObject(endpoint.commandMetadata)?.webCommandMetadata);
    const watchEndpoint = asObject(endpoint.watchEndpoint);
    const endpointSignals = [
        asString(webCommandMetadata?.url).trim(),
        asString(webCommandMetadata?.webPageType).trim(),
        asString(webCommandMetadata?.apiUrl).trim(),
        asString(watchEndpoint?.playerParams).trim()
    ]
        .map((text) => text.trim())
        .filter(Boolean)
        .join(" ");

    const serializedEndpoint = JSON.stringify(endpoint);
    if (serializedEndpoint) {
        if (SHORTS_ENDPOINT_PATH_MARKER_PATTERN.test(serializedEndpoint)) {
            return true;
        }

        if (LIVE_ENDPOINT_PATH_MARKER_PATTERN.test(serializedEndpoint)) {
            return true;
        }

        if (SHORTS_ENDPOINT_SERIALIZED_MARKER_PATTERN.test(serializedEndpoint)) {
            return true;
        }
    }

    if (SHORTS_ENDPOINT_PATH_MARKER_PATTERN.test(endpointSignals)) {
        return true;
    }

    return LIVE_ENDPOINT_PATH_MARKER_PATTERN.test(endpointSignals);
}

export function isLikelyAdVideoRenderer(
    renderer: JsonObject,
    title: string,
    channelTitle: string,
    supplementalSignals: string[] = []
): boolean {
    if (hasAdMarkerKey(renderer)) {
        return true;
    }

    const adSignalTexts = [
        title,
        channelTitle,
        ...supplementalSignals,
        extractText(renderer.badgeText).trim(),
        extractText(renderer.adBadge).trim(),
        ...extractMetadataBadgeTexts(renderer.badges),
        ...extractMetadataBadgeTexts(renderer.ownerBadges),
        ...extractMetadataBadgeTexts(renderer.metadataBadges)
    ]
        .map((text) => text.trim())
        .filter(Boolean);

    return adSignalTexts.some((text) => hasAdMarkerText(text));
}

export function hasTruthyFlag(value: unknown): boolean {
    return value === true;
}

export function isLikelyVideoThumbnailUrl(value: string): boolean {
    return /^https?:\/\/[^/]*ytimg\.com\//i.test(value.trim());
}

export function isLikelyShortOrLiveVideoRenderer(renderer: JsonObject): boolean {
    const navigationEndpoint = asObject(renderer.navigationEndpoint);
    const onSelectCommand = asObject(renderer.onSelectCommand);

    const hasLiveFlag = hasTruthyFlag(renderer.isLive)
        || hasTruthyFlag(renderer.isLiveNow)
        || hasTruthyFlag(renderer.isUpcoming)
        || Boolean(asObject(renderer.upcomingEventData));

    if (hasLiveFlag) {
        return true;
    }

    if (isLikelyShortOrLiveEndpoint(navigationEndpoint) || isLikelyShortOrLiveEndpoint(onSelectCommand)) {
        return true;
    }

    const serializedRenderer = JSON.stringify(renderer);
    if (serializedRenderer) {
        if (SHORTS_ENDPOINT_PATH_MARKER_PATTERN.test(serializedRenderer)) {
            return true;
        }

        if (LIVE_ENDPOINT_PATH_MARKER_PATTERN.test(serializedRenderer)) {
            return true;
        }

        if (SHORTS_ENDPOINT_SERIALIZED_MARKER_PATTERN.test(serializedRenderer)) {
            return true;
        }
    }

    return false;
}

export function dedupeFeedItems(items: FeedVideoItem[]): FeedVideoItem[] {
    const deduped = new Map<string, FeedVideoItem>();
    items.forEach((item) => {
        if (!deduped.has(item.videoId)) {
            deduped.set(item.videoId, item);
        }
    });
    return [...deduped.values()];
}

export function buildFallbackThumbnailUrl(videoId: string): string {
    return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export function createEmptyFeedParseDiagnostics(): FeedParseDiagnostics {
    return {
        totalVisitedNodes: 0,
        acceptedItems: 0,
        rejectedByReason: {}
    };
}

export function incrementFeedRejectReason(
    diagnostics: FeedParseDiagnostics,
    reason: FeedParseRejectReason
): void {
    const current = diagnostics.rejectedByReason[reason] || 0;
    diagnostics.rejectedByReason[reason] = current + 1;
}

export function mergeFeedParseDiagnostics(
    target: FeedParseDiagnostics,
    source: FeedParseDiagnostics
): void {
    target.totalVisitedNodes += source.totalVisitedNodes;
    target.acceptedItems += source.acceptedItems;

    Object.entries(source.rejectedByReason).forEach(([reason, count]) => {
        if (!count) {
            return;
        }
        const typedReason = reason as FeedParseRejectReason;
        target.rejectedByReason[typedReason] = (target.rejectedByReason[typedReason] || 0) + count;
    });
}
