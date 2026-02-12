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
import { dedupeFeedItems } from "../parsers/common";
import { parseFeedItemsFromBrowseResponse } from "../parsers/feed";
import type {
    FeedVideoItem,
    JsonObject,
    TvInnertubeConfig
} from "../types";
import { asObject, asString } from "../utils/json";

interface FetchLoggedInBrowseFeedDependencies {
    isTvAuthAvailable: () => boolean;
    getValidTvAccessToken: () => Promise<string>;
    refreshTvAccessToken: () => Promise<string>;
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

async function collectFeedItemsFromBrowsePages(
    fetchPage: (continuation?: string) => Promise<unknown>,
    prefetchTarget: number,
    maxPages: number
): Promise<FeedVideoItem[]> {
    const target = Math.max(1, prefetchTarget);
    const pageBudget = Math.max(1, maxPages);
    const collected: FeedVideoItem[] = [];
    const seenContinuationTokens = new Set<string>();
    let continuation = "";

    for (let pageIndex = 0; pageIndex < pageBudget; pageIndex += 1) {
        const payload = await fetchPage(continuation || undefined);
        const pageItems = parseFeedItemsFromBrowseResponse(payload);
        if (pageItems.length > 0) {
            collected.push(...pageItems);
        }

        const deduped = dedupeFeedItems(collected);
        collected.length = 0;
        collected.push(...deduped);
        if (collected.length >= target) {
            break;
        }

        const nextContinuation = extractFirstContinuationToken(payload);
        if (!nextContinuation || seenContinuationTokens.has(nextContinuation)) {
            break;
        }
        seenContinuationTokens.add(nextContinuation);
        continuation = nextContinuation;
    }

    return dedupeFeedItems(collected);
}

async function sendTvInnertubeRequest(
    endpoint: string,
    body: JsonObject,
    timeoutMs: number,
    dependencies: FetchLoggedInBrowseFeedDependencies
): Promise<unknown> {
    if (!dependencies.isTvAuthAvailable()) {
        throw new Error("Not logged in.");
    }

    const config = await getTvInnertubeConfig();

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

    let response = await executeRequest(await dependencies.getValidTvAccessToken());
    if ((response.statusCode === 401 || response.statusCode === 403) && dependencies.isTvAuthAvailable()) {
        response = await executeRequest(await dependencies.refreshTvAccessToken());
    }

    if (!response.ok || !response.text) {
        throw new Error(`Request to /${endpoint} failed with status ${response.statusCode}`);
    }

    return JSON.parse(response.text);
}

export async function fetchLoggedInHomeFeed(dependencies: FetchLoggedInBrowseFeedDependencies): Promise<FeedVideoItem[]> {
    const items = await collectFeedItemsFromBrowsePages(
        (continuation?: string) => sendTvInnertubeRequest(
            "browse",
            continuation ? { continuation } : { browseId: "FEwhat_to_watch" },
            FEED_TIMEOUT_MS,
            dependencies
        ),
        Math.max(HOME_PREFETCH_TARGET, HOME_ITEMS_LIMIT),
        LOGGED_IN_BROWSE_MAX_PAGES
    );
    return items.slice(0, HOME_ITEMS_LIMIT);
}

export async function fetchLoggedInSubscriptionsFeed(dependencies: FetchLoggedInBrowseFeedDependencies): Promise<FeedVideoItem[]> {
    const items = await collectFeedItemsFromBrowsePages(
        (continuation?: string) => sendTvInnertubeRequest(
            "browse",
            continuation ? { continuation } : { browseId: "FEsubscriptions" },
            FEED_TIMEOUT_MS,
            dependencies
        ),
        Math.max(SUBSCRIPTIONS_PREFETCH_TARGET, SUBSCRIPTIONS_ITEMS_LIMIT),
        LOGGED_IN_BROWSE_MAX_PAGES
    );
    return items.slice(0, SUBSCRIPTIONS_ITEMS_LIMIT);
}

export async function fetchChannelFeedFromInnertube(channelId: string): Promise<FeedVideoItem[]> {
    const config = await getInnertubeConfig();
    const headers = buildWebInnertubeHeaders(config);

    for (const params of CHANNEL_VIDEOS_TAB_PARAMS_CANDIDATES) {
        const parsed = await collectFeedItemsFromBrowsePages(
            async (continuation?: string) => {
                const response = await sendHttpRequest(
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

                if (!response.ok || !response.text) {
                    throw new Error(`Channel feed request failed (${response.statusCode})`);
                }

                return JSON.parse(response.text);
            },
            CHANNEL_PREFETCH_TARGET,
            CHANNEL_BROWSE_MAX_PAGES
        );

        const sliced = parsed.slice(0, FEED_ITEMS_PER_CHANNEL);
        if (sliced.length > 0) {
            return sliced;
        }
    }

    return [];
}
