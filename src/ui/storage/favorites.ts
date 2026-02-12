import { FAVORITES_STORAGE_KEY } from "../constants";
import type { FavoriteChannel } from "../types";
import { asObject, asString } from "../utils/json";
import { normalizeChannelHandle } from "../utils/text";

export function loadFavoritesFromStorage(): FavoriteChannel[] {
    try {
        const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
        if (!raw) {
            return [];
        }

        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return [];
        }

        const sanitized: FavoriteChannel[] = [];
        parsed.forEach((item) => {
            const objectItem = asObject(item);
            if (!objectItem) {
                return;
            }

            const channelId = asString(objectItem.channelId).trim();
            const title = asString(objectItem.title).trim();
            const thumbnailUrl = asString(objectItem.thumbnailUrl).trim();
            const channelHandle = normalizeChannelHandle(asString(objectItem.channelHandle));
            const addedAt = asString(objectItem.addedAt).trim() || new Date().toISOString();
            if (!channelId || !title) {
                return;
            }

            if (sanitized.some((favorite) => favorite.channelId === channelId)) {
                return;
            }

            sanitized.push({ channelId, title, thumbnailUrl, channelHandle, addedAt });
        });

        return sanitized;
    } catch {
        return [];
    }
}

export function persistFavoritesToStorage(favorites: FavoriteChannel[]): boolean {
    try {
        localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
        return true;
    } catch {
        return false;
    }
}
