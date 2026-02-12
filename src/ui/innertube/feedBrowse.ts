import {
    CHANNEL_BROWSE_MAX_PAGES,
    CHANNEL_PREFETCH_TARGET,
    CHANNEL_VIDEOS_TAB_PARAMS_CANDIDATES,
    FEED_ITEMS_PER_CHANNEL,
    FEED_TIMEOUT_MS,
    HOME_ITEMS_LIMIT,
    HOME_PREFETCH_TARGET,
    LOGGED_IN_BROWSE_MAX_PAGES,
    SUBSCRIPTIONS_ITEMS_LIMIT,
    SUBSCRIPTIONS_PREFETCH_TARGET,
    TV_CLIENT_NAME,
    TV_CLIENT_NAME_ID,
    TV_DEFAULT_CLIENT_VERSION,
    TV_USER_AGENT
} from "../constants";
import { sendHttpRequest } from "../bridge/httpBridge";
import { getInnertubeConfig, getTvInnertubeConfig } from "./config";
import {
    buildInnertubeUrl,
    buildWebClientContext,
    buildWebInnertubeHeaders
} from "./request";
import {
    createEmptyFeedParseDiagnostics,
    dedupeFeedItems,
    mergeFeedParseDiagnostics
} from "../parsers/common";
import { parseFeedItemsFromBrowseResponse } from "../parsers/feed";
import type {
    FeedFetchFailureReason,
    FeedFetchResult,
    FeedParseDiagnostics,
    JsonObject,
    TvInnertubeConfig
} from "../types";
import { asObject, asString } from "../utils/json";

interface FetchLoggedInBrowseFeedDependencies {
    isTvAuthAvailable: () => boolean;
    getValidTvAccessToken: () => Promise<string>;
    refreshTvAccessToken: () => Promise<string>;
}

interface PageFetchResult {
    payload?: unknown;
    failureReason?: FeedFetchFailureReason;
    statusCode?: number;
}

function buildTvInnertubeHeaders(config: TvInnertubeConfig, accessToken: string): Record<string, string> {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Origin": "https://www.youtube.com",
        "Referer": "https://www.youtube.com/tv",
        "User-Agent": TV_USER_AGENT,
        "Accept-Language": "en-US,en;q=0.9",
        "X-Youtube-Client-Name": TV_CLIENT_NAME_ID,
        "X-Youtube-Client-Version": config.clientVersion || TV_DEFAULT_CLIENT_VERSION,
        "Authorization": `Bearer ${accessToken}`
    };

    if (config.visitorData) {
        headers["X-Goog-Visitor-Id"] = config.visitorData;
    }

    return headers;
}

function buildTvClientContext(config: TvInnertubeConfig): JsonObject {
    return {
        clientName: TV_CLIENT_NAME,
        clientVersion: config.clientVersion || TV_DEFAULT_CLIENT_VERSION,
        hl: "en",
        gl: "US"
    };
}

function collectContinuationTokens(node: unknown, tokens: Set<string>): void {
    const objectNode = asObject(node);
    if (!objectNode) {
        return;
    }

    const continuationCommand = asObject(objectNode.continuationCommand);
    const continuation = asString(continuationCommand?.token).trim()
        || asString(asObject(objectNode.nextContinuationData)?.continuation).trim()
        || asString(asObject(asObject(objectNode.continuationEndpoint)?.continuationCommand)?.token).trim();
    if (continuation) {
        tokens.add(continuation);
    }

    Object.values(objectNode).forEach((value) => {
        if (Array.isArray(value)) {
            value.forEach((entry) => {
                collectContinuationTokens(entry, tokens);
            });
            return;
        }

        if (value && typeof value === "object") {
            collectContinuationTokens(value, tokens);
        }
    });
}

function extractFirstContinuationToken(payload: unknown): string {
    const tokens = new Set<string>();
    collectContinuationTokens(payload, tokens);
    for (const token of tokens) {
        return token;
    }
    return "";
}

function hasAnyRejectedItems(diagnostics: FeedParseDiagnostics): boolean {
    return Object.values(diagnostics.rejectedByReason).some((count) => (count || 0) > 0);
}

function finalizeFeedFetchResult(
    items: ReturnType<typeof dedupeFeedItems>,
    diagnostics: FeedParseDiagnostics,
    failureReason?: FeedFetchFailureReason,
    statusCode?: number
): FeedFetchResult {
    const deduped = dedupeFeedItems(items);
    const parseEmpty = deduped.length === 0 && hasAnyRejectedItems(diagnostics);
    return {
        items: deduped,
        diagnostics,
        failureReason: failureReason || (parseEmpty ? "parse_empty" : undefined),
        statusCode
    };
}

async function collectFeedItemsFromBrowsePages(
    fetchPage: (continuation?: string) => Promise<PageFetchResult>,
    prefetchTarget: number,
    maxPages: number
): Promise<FeedFetchResult> {
    const target = Math.max(1, prefetchTarget);
    const pageBudget = Math.max(1, maxPages);
    const collected = [] as ReturnType<typeof dedupeFeedItems>;
    const diagnostics = createEmptyFeedParseDiagnostics();
    const seenContinuationTokens = new Set<string>();
    let continuation = "";

    for (let pageIndex = 0; pageIndex < pageBudget; pageIndex += 1) {
        const pageResult = await fetchPage(continuation || undefined);
        if (!pageResult.payload) {
            return finalizeFeedFetchResult(collected, diagnostics, pageResult.failureReason || "unknown_error", pageResult.statusCode);
        }

        const pageParseResult = parseFeedItemsFromBrowseResponse(pageResult.payload);
        mergeFeedParseDiagnostics(diagnostics, pageParseResult.diagnostics);
        if (pageParseResult.items.length > 0) {
            collected.push(...pageParseResult.items);
        }

        const deduped = dedupeFeedItems(collected);
        collected.length = 0;
        collected.push(...deduped);
        if (collected.length >= target) {
            break;
        }

        const nextContinuation = extractFirstContinuationToken(pageResult.payload);
        if (!nextContinuation || seenContinuationTokens.has(nextContinuation)) {
            break;
        }
        seenContinuationTokens.add(nextContinuation);
        continuation = nextContinuation;
    }

    return finalizeFeedFetchResult(collected, diagnostics);
}

async function sendTvInnertubeRequest(
    endpoint: string,
    body: JsonObject,
    timeoutMs: number,
    dependencies: FetchLoggedInBrowseFeedDependencies
): Promise<PageFetchResult> {
    if (!dependencies.isTvAuthAvailable()) {
        return {
            failureReason: "auth_required"
        };
    }

    let config: TvInnertubeConfig;
    try {
        config = await getTvInnertubeConfig();
    } catch {
        return {
            failureReason: "unknown_error"
        };
    }

    const executeRequest = async (accessToken: string) => {
        return sendHttpRequest(
            {
                method: "POST",
                url: buildInnertubeUrl(endpoint, config.apiKey),
                headers: buildTvInnertubeHeaders(config, accessToken),
                body: {
                    context: {
                        client: buildTvClientContext(config)
                    },
                    ...body
                }
            },
            timeoutMs
        );
    };

    let response: Awaited<ReturnType<typeof sendHttpRequest>>;
    try {
        response = await executeRequest(await dependencies.getValidTvAccessToken());
    } catch {
        return {
            failureReason: "unknown_error"
        };
    }

    if ((response.statusCode === 401 || response.statusCode === 403) && dependencies.isTvAuthAvailable()) {
        try {
            response = await executeRequest(await dependencies.refreshTvAccessToken());
        } catch {
            return {
                failureReason: "auth_required",
                statusCode: response.statusCode
            };
        }
    }

    if (!response.ok || !response.text) {
        return {
            failureReason: response.statusCode === 401 || response.statusCode === 403 ? "auth_required" : "http_error",
            statusCode: response.statusCode
        };
    }

    try {
        return {
            payload: JSON.parse(response.text)
        };
    } catch {
        return {
            failureReason: "json_parse_error",
            statusCode: response.statusCode
        };
    }
}

function mapFeedFailureToMessage(reason: FeedFetchFailureReason | undefined, fallback: string): string {
    if (!reason) {
        return "";
    }

    switch (reason) {
        case "auth_required":
            return "Sign in again to refresh this view.";
        case "json_parse_error":
            return "Could not parse YouTube response.";
        case "parse_empty":
            return "Could not find playable videos in YouTube response.";
        case "http_error":
            return fallback;
        default:
            return fallback;
    }
}

export function describeFeedFetchFailure(reason: FeedFetchFailureReason | undefined, fallback: string): string {
    return mapFeedFailureToMessage(reason, fallback);
}

export async function fetchLoggedInHomeFeed(dependencies: FetchLoggedInBrowseFeedDependencies): Promise<FeedFetchResult> {
    const result = await collectFeedItemsFromBrowsePages(
        (continuation?: string) => sendTvInnertubeRequest(
            "browse",
            continuation ? { continuation } : { browseId: "FEwhat_to_watch" },
            FEED_TIMEOUT_MS,
            dependencies
        ),
        Math.max(HOME_PREFETCH_TARGET, HOME_ITEMS_LIMIT),
        LOGGED_IN_BROWSE_MAX_PAGES
    );
    return {
        ...result,
        items: result.items.slice(0, HOME_ITEMS_LIMIT)
    };
}

export async function fetchLoggedInSubscriptionsFeed(dependencies: FetchLoggedInBrowseFeedDependencies): Promise<FeedFetchResult> {
    const result = await collectFeedItemsFromBrowsePages(
        (continuation?: string) => sendTvInnertubeRequest(
            "browse",
            continuation ? { continuation } : { browseId: "FEsubscriptions" },
            FEED_TIMEOUT_MS,
            dependencies
        ),
        Math.max(SUBSCRIPTIONS_PREFETCH_TARGET, SUBSCRIPTIONS_ITEMS_LIMIT),
        LOGGED_IN_BROWSE_MAX_PAGES
    );
    return {
        ...result,
        items: result.items.slice(0, SUBSCRIPTIONS_ITEMS_LIMIT)
    };
}

export async function fetchChannelFeedFromInnertube(channelId: string): Promise<FeedFetchResult> {
    let config: Awaited<ReturnType<typeof getInnertubeConfig>>;
    try {
        config = await getInnertubeConfig();
    } catch {
        return {
            items: [],
            diagnostics: createEmptyFeedParseDiagnostics(),
            failureReason: "unknown_error"
        };
    }

    const headers = buildWebInnertubeHeaders(config);
    let bestResult: FeedFetchResult = {
        items: [],
        diagnostics: createEmptyFeedParseDiagnostics(),
    };

    for (const params of CHANNEL_VIDEOS_TAB_PARAMS_CANDIDATES) {
        const parsed = await collectFeedItemsFromBrowsePages(
            async (continuation?: string): Promise<PageFetchResult> => {
                let response: Awaited<ReturnType<typeof sendHttpRequest>>;
                try {
                    response = await sendHttpRequest(
                        {
                            method: "POST",
                            url: buildInnertubeUrl("browse", config.apiKey),
                            headers,
                            body: {
                                context: {
                                    client: buildWebClientContext(config)
                                },
                                ...(continuation
                                    ? { continuation }
                                    : {
                                        browseId: channelId,
                                        params
                                    })
                            }
                        },
                        FEED_TIMEOUT_MS
                    );
                } catch {
                    return {
                        failureReason: "unknown_error"
                    };
                }

                if (!response.ok || !response.text) {
                    return {
                        failureReason: "http_error",
                        statusCode: response.statusCode
                    };
                }

                try {
                    return {
                        payload: JSON.parse(response.text)
                    };
                } catch {
                    return {
                        failureReason: "json_parse_error",
                        statusCode: response.statusCode
                    };
                }
            },
            CHANNEL_PREFETCH_TARGET,
            CHANNEL_BROWSE_MAX_PAGES
        );

        const slicedItems = parsed.items.slice(0, FEED_ITEMS_PER_CHANNEL);
        if (slicedItems.length > 0) {
            return {
                ...parsed,
                items: slicedItems
            };
        }

        bestResult = parsed;
    }

    return bestResult;
}
