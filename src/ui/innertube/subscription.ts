import {
    FEED_TIMEOUT_MS,
    TV_CLIENT_NAME,
    TV_CLIENT_NAME_ID,
    TV_DEFAULT_CLIENT_VERSION,
    TV_USER_AGENT
} from "../constants";
import { sendHttpRequest } from "../bridge/httpBridge";
import { getTvInnertubeConfig } from "./config";
import { buildInnertubeUrl } from "./request";
import { normalizeInnertubeApiPath, parseChannelSubscriptionDetails } from "../parsers/subscription";
import type { InnertubeCommand, JsonObject, TvInnertubeConfig } from "../types";
import { asString } from "../utils/json";

export interface SubscriptionRequestDependencies {
    isTvAuthAvailable: () => boolean;
    getValidTvAccessToken: () => Promise<string>;
    refreshTvAccessToken: () => Promise<string>;
}

export interface ChannelSubscriptionState {
    isSubscribed: boolean | null;
    subscribeCommand?: InnertubeCommand;
    unsubscribeCommand?: InnertubeCommand;
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

async function sendSignedInTvInnertubeRequest(
    endpoint: string,
    body: JsonObject,
    dependencies: SubscriptionRequestDependencies
): Promise<unknown> {
    if (!dependencies.isTvAuthAvailable()) {
        throw new Error("Sign in to manage subscriptions.");
    }

    const config = await getTvInnertubeConfig();
    const normalizedEndpoint = normalizeInnertubeApiPath(endpoint);
    if (!normalizedEndpoint) {
        throw new Error("Invalid InnerTube endpoint.");
    }

    const executeRequest = async (accessToken: string) => {
        return sendHttpRequest(
            {
                method: "POST",
                url: buildInnertubeUrl(normalizedEndpoint, config.apiKey),
                headers: buildTvInnertubeHeaders(config, accessToken),
                body: {
                    context: {
                        client: buildTvClientContext(config)
                    },
                    ...body
                }
            },
            FEED_TIMEOUT_MS
        );
    };

    let response = await executeRequest(await dependencies.getValidTvAccessToken());
    if ((response.statusCode === 401 || response.statusCode === 403) && dependencies.isTvAuthAvailable()) {
        response = await executeRequest(await dependencies.refreshTvAccessToken());
    }

    if (!response.ok || !response.text) {
        const statusCodeSuffix = Number.isFinite(response.statusCode)
            ? ` (HTTP ${response.statusCode})`
            : "";
        throw new Error(`Request failed${statusCodeSuffix}`);
    }

    try {
        return JSON.parse(response.text);
    } catch {
        throw new Error("Could not parse YouTube response.");
    }
}

export async function fetchChannelSubscriptionState(
    channelId: string,
    dependencies: SubscriptionRequestDependencies
): Promise<ChannelSubscriptionState> {
    const normalizedChannelId = channelId.trim();
    if (!normalizedChannelId) {
        return {
            isSubscribed: null
        };
    }

    const payload = await sendSignedInTvInnertubeRequest(
        "browse",
        { browseId: normalizedChannelId },
        dependencies
    );

    return parseChannelSubscriptionDetails(payload, normalizedChannelId);
}

export async function executeChannelSubscriptionCommand(
    command: InnertubeCommand,
    dependencies: SubscriptionRequestDependencies
): Promise<ChannelSubscriptionState> {
    const apiPath = normalizeInnertubeApiPath(command.apiPath);
    if (!apiPath) {
        throw new Error("Missing subscription command endpoint.");
    }

    const payload = await sendSignedInTvInnertubeRequest(
        apiPath,
        command.payload as JsonObject,
        dependencies
    );

    const channelIds = Array.isArray(command.payload.channelIds)
        ? command.payload.channelIds
        : [];
    const targetChannelId = asString(channelIds[0]).trim();

    return parseChannelSubscriptionDetails(payload, targetChannelId);
}
