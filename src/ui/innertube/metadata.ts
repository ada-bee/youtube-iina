import {
    HTTP_TIMEOUT_MS,
    META_FETCH_CONCURRENCY,
    VIDEO_META_CACHE_TTL_MS,
    VIDEO_META_SCHEMA_VERSION
} from "../constants";
import { sendHttpRequest } from "../bridge/httpBridge";
import { getInnertubeConfig } from "./config";
import {
    buildInnertubeUrl,
    buildWebClientContext,
    buildWebInnertubeHeaders
} from "./request";
import {
    parseVideoMetadataResponse
} from "../parsers/metadata";
import type { FeedVideoItem, VideoMetadata, VideoMetadataCacheMap } from "../types";

interface FetchVideoMetadataResult {
    metadata: VideoMetadata | null;
    didUpdateCache: boolean;
}

const inFlightMetadataRequestsByVideoId = new Map<string, Promise<FetchVideoMetadataResult>>();

export function isVideoMetadataFresh(metadata: VideoMetadata): boolean {
    return Date.now() - metadata.fetchedAt < VIDEO_META_CACHE_TTL_MS;
}

export function getVideoMetadataFromCache(cacheByVideoId: VideoMetadataCacheMap, videoId: string): VideoMetadata | null {
    const metadata = cacheByVideoId[videoId];
    if (!metadata) {
        return null;
    }
    return metadata;
}

export function setVideoMetadataInCache(
    cacheByVideoId: VideoMetadataCacheMap,
    videoId: string,
    metadata: VideoMetadata
): void {
    cacheByVideoId[videoId] = {
        schemaVersion: VIDEO_META_SCHEMA_VERSION,
        ...metadata,
        fetchedAt: Date.now()
    };
}

export async function fetchVideoMetadata(
    videoId: string,
    cacheByVideoId: VideoMetadataCacheMap
): Promise<FetchVideoMetadataResult> {
    if (!videoId) {
        return {
            metadata: null,
            didUpdateCache: false
        };
    }

    const cached = getVideoMetadataFromCache(cacheByVideoId, videoId);
    if (cached && isVideoMetadataFresh(cached)) {
        return {
            metadata: cached,
            didUpdateCache: false
        };
    }

    const inFlight = inFlightMetadataRequestsByVideoId.get(videoId);
    if (inFlight) {
        return inFlight;
    }

    const requestPromise = (async (): Promise<FetchVideoMetadataResult> => {
        try {
            const config = await getInnertubeConfig();
            const headers = buildWebInnertubeHeaders(config);
            const webContext = buildWebClientContext(config);

            const response = await sendHttpRequest(
                {
                    method: "POST",
                    url: buildInnertubeUrl("player", config.apiKey),
                    headers,
                    body: {
                        context: {
                            client: webContext
                        },
                        videoId
                    }
                },
                HTTP_TIMEOUT_MS
            );

            if (!response.ok || !response.text) {
                return {
                    metadata: cached || null,
                    didUpdateCache: false
                };
            }

            const parsedPayload = JSON.parse(response.text);
            const parsedMetadata = parseVideoMetadataResponse(parsedPayload, videoId);
            if (!parsedMetadata) {
                return {
                    metadata: cached || null,
                    didUpdateCache: false
                };
            }

            setVideoMetadataInCache(cacheByVideoId, videoId, parsedMetadata);
            return {
                metadata: parsedMetadata,
                didUpdateCache: true
            };
        } catch {
            return {
                metadata: cached || null,
                didUpdateCache: false
            };
        }
    })();

    inFlightMetadataRequestsByVideoId.set(videoId, requestPromise);
    try {
        return await requestPromise;
    } finally {
        inFlightMetadataRequestsByVideoId.delete(videoId);
    }
}

async function enrichChunk(
    chunk: FeedVideoItem[],
    cacheByVideoId: VideoMetadataCacheMap
): Promise<FetchVideoMetadataResult[]> {
    return Promise.all(chunk.map((item) => fetchVideoMetadata(item.videoId, cacheByVideoId)));
}

export async function buildFinalFilteredFeedItems(
    items: FeedVideoItem[],
    limit: number,
    cacheByVideoId: VideoMetadataCacheMap,
    persistCache: () => void
): Promise<FeedVideoItem[]> {
    if (items.length === 0 || limit <= 0) {
        return [];
    }

    const target = Math.min(limit, items.length);
    const chunkSize = Math.min(Math.max(META_FETCH_CONCURRENCY, 1), items.length);
    const finalItems: FeedVideoItem[] = [];
    let didUpdateCache = false;

    for (let index = 0; index < items.length && finalItems.length < target; index += chunkSize) {
        const chunk = items.slice(index, index + chunkSize);
        const chunkMetadata = await enrichChunk(chunk, cacheByVideoId);

        for (let chunkIndex = 0; chunkIndex < chunk.length && finalItems.length < target; chunkIndex += 1) {
            const metadata = chunkMetadata[chunkIndex];
            if (metadata.didUpdateCache) {
                didUpdateCache = true;
            }

            if (!metadata.metadata || metadata.metadata.isShortForm) {
                continue;
            }

            finalItems.push({
                ...chunk[chunkIndex]
            });
        }
    }

    if (didUpdateCache) {
        persistCache();
    }

    return finalItems;
}
