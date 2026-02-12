import { HTTP_TIMEOUT_MS, INNERTUBE_CONFIG_TTL_MS, TV_DEFAULT_CLIENT_VERSION, USER_AGENT } from "../constants";
import type { InnertubeConfig, TvInnertubeConfig } from "../types";
import { decodeEscapedText } from "../utils/text";
import { sendHttpRequest } from "../bridge/httpBridge";

let innertubeConfigCache: InnertubeConfig | null = null;
let tvInnertubeConfigCache: TvInnertubeConfig | null = null;
let innertubeConfigPromise: Promise<InnertubeConfig> | null = null;
let tvInnertubeConfigPromise: Promise<TvInnertubeConfig> | null = null;

function parseInnertubeConfig(homepageHtml: string): InnertubeConfig {
    const apiKeyMatch = homepageHtml.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
    const clientVersionMatch = homepageHtml.match(/"INNERTUBE_CONTEXT_CLIENT_VERSION":"([^"]+)"/);
    const visitorDataMatch = homepageHtml.match(/"VISITOR_DATA":"([^"]+)"/);

    const apiKey = apiKeyMatch ? decodeEscapedText(apiKeyMatch[1]) : "";
    const clientVersion = clientVersionMatch ? decodeEscapedText(clientVersionMatch[1]) : "";
    const visitorData = visitorDataMatch ? decodeEscapedText(visitorDataMatch[1]) : "";

    if (!apiKey || !clientVersion) {
        throw new Error("Could not resolve InnerTube configuration from homepage response.");
    }

    return {
        apiKey,
        clientVersion,
        visitorData: visitorData || undefined,
        fetchedAt: Date.now()
    };
}

export async function getInnertubeConfig(): Promise<InnertubeConfig> {
    if (innertubeConfigCache && Date.now() - innertubeConfigCache.fetchedAt < INNERTUBE_CONFIG_TTL_MS) {
        return innertubeConfigCache;
    }

    if (innertubeConfigPromise) {
        return innertubeConfigPromise;
    }

    innertubeConfigPromise = (async (): Promise<InnertubeConfig> => {
        const response = await sendHttpRequest(
            {
                method: "GET",
                url: "https://www.youtube.com/?hl=en",
                headers: {
                    "Accept-Language": "en-US,en;q=0.9",
                    "User-Agent": USER_AGENT
                }
            },
            HTTP_TIMEOUT_MS
        );

        if (!response.ok || !response.text) {
            throw new Error(`Homepage request failed with status ${response.statusCode}`);
        }

        innertubeConfigCache = parseInnertubeConfig(response.text);
        return innertubeConfigCache;
    })();

    try {
        return await innertubeConfigPromise;
    } finally {
        innertubeConfigPromise = null;
    }
}

export async function getTvInnertubeConfig(): Promise<TvInnertubeConfig> {
    if (tvInnertubeConfigCache && Date.now() - tvInnertubeConfigCache.fetchedAt < INNERTUBE_CONFIG_TTL_MS) {
        return tvInnertubeConfigCache;
    }

    if (tvInnertubeConfigPromise) {
        return tvInnertubeConfigPromise;
    }

    tvInnertubeConfigPromise = (async (): Promise<TvInnertubeConfig> => {
        const webConfig = await getInnertubeConfig();
        tvInnertubeConfigCache = {
            apiKey: webConfig.apiKey,
            clientVersion: TV_DEFAULT_CLIENT_VERSION,
            visitorData: webConfig.visitorData,
            fetchedAt: Date.now()
        };
        return tvInnertubeConfigCache;
    })();

    try {
        return await tvInnertubeConfigPromise;
    } finally {
        tvInnertubeConfigPromise = null;
    }
}

export { parseInnertubeConfig };
