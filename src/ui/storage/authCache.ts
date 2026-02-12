import { TV_OAUTH_STORAGE_KEY } from "../constants";
import type { TvOAuthCache } from "../types";
import { asObject, asString } from "../utils/json";

function parseIsoTimestamp(value: string): number {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : 0;
}

export function loadTvAuthCacheFromStorage(): TvOAuthCache | null {
    try {
        const raw = localStorage.getItem(TV_OAUTH_STORAGE_KEY);
        if (!raw) {
            return null;
        }

        const parsed = asObject(JSON.parse(raw));
        if (!parsed) {
            return null;
        }

        const client = asObject(parsed.client);
        const tokens = asObject(parsed.tokens);
        if (!client || !tokens) {
            return null;
        }

        const clientId = asString(client.clientId).trim();
        const clientSecret = asString(client.clientSecret).trim();
        const accessToken = asString(tokens.accessToken).trim();
        const refreshToken = asString(tokens.refreshToken).trim();
        const expiryDate = asString(tokens.expiryDate).trim();
        if (!clientId || !clientSecret || !accessToken || !refreshToken || parseIsoTimestamp(expiryDate) <= 0) {
            return null;
        }

        return {
            client: {
                clientId,
                clientSecret
            },
            tokens: {
                accessToken,
                refreshToken,
                expiryDate
            }
        };
    } catch {
        return null;
    }
}

export function persistTvAuthCacheToStorage(tvAuthCache: TvOAuthCache | null): void {
    if (!tvAuthCache) {
        localStorage.removeItem(TV_OAUTH_STORAGE_KEY);
        return;
    }

    localStorage.setItem(TV_OAUTH_STORAGE_KEY, JSON.stringify(tvAuthCache));
}

export function clearTvAuthCacheFromStorage(): void {
    localStorage.removeItem(TV_OAUTH_STORAGE_KEY);
}
