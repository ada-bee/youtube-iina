import {
    AUTH_REQUEST_TIMEOUT_MS,
    TV_OAUTH_FALLBACK_CLIENT,
    TV_OAUTH_PRIMARY_CLIENT,
    TV_USER_AGENT
} from "../constants";
import { sendHttpRequest } from "../bridge/httpBridge";
import type {
    DeviceCodeRequestResult,
    TvOAuthCache,
    TvOAuthClientIdentity,
    TvOAuthTokens
} from "../types";
import { createPseudoUuid } from "../utils/ids";
import { asObject, asString } from "../utils/json";

let inFlightAccessTokenRefreshPromise: Promise<string> | null = null;

function parseIsoTimestamp(value: string): number {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : 0;
}

export function isTvTokenExpired(tokens: TvOAuthTokens, leewayMs: number = 30_000): boolean {
    const expiryTimestamp = parseIsoTimestamp(tokens.expiryDate);
    if (!expiryTimestamp) {
        return true;
    }
    return Date.now() + leewayMs >= expiryTimestamp;
}

export function resolveTvOAuthClientIdentity(tvAuthCache: TvOAuthCache | null): TvOAuthClientIdentity {
    if (tvAuthCache?.client?.clientId && tvAuthCache.client.clientSecret) {
        return tvAuthCache.client;
    }

    return TV_OAUTH_PRIMARY_CLIENT;
}

export async function requestTvDeviceCode(identity: TvOAuthClientIdentity): Promise<DeviceCodeRequestResult> {
    let activeIdentity = identity;
    let response = await sendHttpRequest(
        {
            method: "POST",
            url: "https://www.youtube.com/o/oauth2/device/code",
            headers: {
                "Content-Type": "application/json",
                "User-Agent": TV_USER_AGENT
            },
            body: {
                client_id: identity.clientId,
                scope: "http://gdata.youtube.com https://www.googleapis.com/auth/youtube-paid-content",
                device_id: createPseudoUuid(),
                device_model: "ytlr::"
            }
        },
        AUTH_REQUEST_TIMEOUT_MS
    );

    if ((!response.ok || !response.text) && identity.clientId === TV_OAUTH_PRIMARY_CLIENT.clientId) {
        response = await sendHttpRequest(
            {
                method: "POST",
                url: "https://www.youtube.com/o/oauth2/device/code",
                headers: {
                    "Content-Type": "application/json",
                    "User-Agent": TV_USER_AGENT
                },
                body: {
                    client_id: TV_OAUTH_FALLBACK_CLIENT.clientId,
                    scope: "http://gdata.youtube.com https://www.googleapis.com/auth/youtube-paid-content",
                    device_id: createPseudoUuid(),
                    device_model: "ytlr::"
                }
            },
            AUTH_REQUEST_TIMEOUT_MS
        );

        if (response.ok && response.text) {
            activeIdentity = TV_OAUTH_FALLBACK_CLIENT;
        }
    }

    if (!response.ok || !response.text) {
        const reason = response.error || response.reason || "unknown error";
        throw new Error(`Could not request TV device code (${response.statusCode}: ${reason})`);
    }

    const payload = asObject(JSON.parse(response.text));
    if (!payload) {
        throw new Error("Invalid TV device-code response.");
    }

    const deviceCode = asString(payload.device_code).trim();
    const userCode = asString(payload.user_code).trim();
    const verificationUrl = asString(payload.verification_url).trim() || "https://youtube.com/activate";
    const expiresIn = Number(payload.expires_in);
    const interval = Number(payload.interval);

    if (!deviceCode || !userCode || !Number.isFinite(expiresIn) || !Number.isFinite(interval)) {
        throw new Error("Incomplete TV device-code response.");
    }

    return {
        identity: activeIdentity,
        deviceCode: {
            device_code: deviceCode,
            user_code: userCode,
            verification_url: verificationUrl,
            expires_in: expiresIn,
            interval
        }
    };
}

export async function exchangeTvDeviceCode(identity: TvOAuthClientIdentity, deviceCode: string): Promise<TvOAuthTokens | null> {
    const response = await sendHttpRequest(
        {
            method: "POST",
            url: "https://www.youtube.com/o/oauth2/token",
            headers: {
                "Content-Type": "application/json",
                "User-Agent": TV_USER_AGENT
            },
            body: {
                client_id: identity.clientId,
                client_secret: identity.clientSecret,
                code: deviceCode,
                grant_type: "http://oauth.net/grant_type/device/1.0"
            }
        },
        AUTH_REQUEST_TIMEOUT_MS
    );

    if (!response.ok || !response.text) {
        throw new Error(`Token exchange failed (${response.statusCode})`);
    }

    const payload = asObject(JSON.parse(response.text));
    if (!payload) {
        throw new Error("Invalid token response.");
    }

    const errorCode = asString(payload.error).trim();
    if (errorCode) {
        if (errorCode === "authorization_pending" || errorCode === "slow_down") {
            return null;
        }
        if (errorCode === "expired_token") {
            throw new Error("Login code expired. Please login again.");
        }
        if (errorCode === "access_denied") {
            throw new Error("Login was denied.");
        }
        throw new Error(`Token exchange error: ${errorCode}`);
    }

    const accessToken = asString(payload.access_token).trim();
    const refreshToken = asString(payload.refresh_token).trim();
    const expiresIn = Number(payload.expires_in);

    if (!accessToken || !refreshToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
        throw new Error("Invalid token payload.");
    }

    return {
        accessToken,
        refreshToken,
        expiryDate: new Date(Date.now() + expiresIn * 1000).toISOString()
    };
}

export async function refreshTvAccessToken(tvAuthCache: TvOAuthCache | null, persistTvAuthCache: () => void): Promise<string> {
    if (!tvAuthCache) {
        throw new Error("Not logged in.");
    }

    if (inFlightAccessTokenRefreshPromise) {
        return inFlightAccessTokenRefreshPromise;
    }

    inFlightAccessTokenRefreshPromise = (async (): Promise<string> => {
        const response = await sendHttpRequest(
            {
                method: "POST",
                url: "https://www.youtube.com/o/oauth2/token",
                headers: {
                    "Content-Type": "application/json",
                    "User-Agent": TV_USER_AGENT
                },
                body: {
                    client_id: tvAuthCache.client.clientId,
                    client_secret: tvAuthCache.client.clientSecret,
                    refresh_token: tvAuthCache.tokens.refreshToken,
                    grant_type: "refresh_token"
                }
            },
            AUTH_REQUEST_TIMEOUT_MS
        );

        if (!response.ok || !response.text) {
            throw new Error(`Token refresh failed (${response.statusCode})`);
        }

        const payload = asObject(JSON.parse(response.text));
        if (!payload) {
            throw new Error("Invalid refresh response.");
        }

        const accessToken = asString(payload.access_token).trim();
        const expiresIn = Number(payload.expires_in);
        if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
            throw new Error("Invalid refresh payload.");
        }

        tvAuthCache.tokens.accessToken = accessToken;
        tvAuthCache.tokens.expiryDate = new Date(Date.now() + expiresIn * 1000).toISOString();
        persistTvAuthCache();
        return tvAuthCache.tokens.accessToken;
    })();

    try {
        return await inFlightAccessTokenRefreshPromise;
    } finally {
        inFlightAccessTokenRefreshPromise = null;
    }
}

export async function getValidTvAccessToken(tvAuthCache: TvOAuthCache | null, persistTvAuthCache: () => void): Promise<string> {
    if (!tvAuthCache) {
        throw new Error("Not logged in.");
    }

    if (isTvTokenExpired(tvAuthCache.tokens)) {
        return refreshTvAccessToken(tvAuthCache, persistTvAuthCache);
    }

    return tvAuthCache.tokens.accessToken;
}

export async function revokeTvAccessToken(accessToken: string): Promise<void> {
    try {
        await sendHttpRequest(
            {
                method: "POST",
                url: `https://www.youtube.com/o/oauth2/revoke?token=${encodeURIComponent(accessToken)}`,
                headers: {
                    "User-Agent": TV_USER_AGENT
                }
            },
            AUTH_REQUEST_TIMEOUT_MS
        );
    } catch {
    }
}
