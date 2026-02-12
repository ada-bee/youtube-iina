import { MAX_VIDEO_META_CACHE_ENTRIES, VIDEO_META_CACHE_STORAGE_KEY, VIDEO_META_SCHEMA_VERSION } from "../constants";
import type { VideoMetadata, VideoMetadataCacheMap } from "../types";
import { normalizePositiveInteger } from "../utils/format";
import { asObject, asString } from "../utils/json";

export function loadVideoMetadataCacheFromStorage(): VideoMetadataCacheMap {
    try {
        const raw = localStorage.getItem(VIDEO_META_CACHE_STORAGE_KEY);
        if (!raw) {
            return {};
        }

        const parsed = asObject(JSON.parse(raw));
        if (!parsed) {
            return {};
        }

        const cache: VideoMetadataCacheMap = {};
        Object.entries(parsed).forEach(([videoId, value]) => {
            const entry = asObject(value);
            if (!videoId || !entry) {
                return;
            }

            const fetchedAt = Number(entry.fetchedAt);
            if (!Number.isFinite(fetchedAt)) {
                return;
            }

            const schemaVersion = Number(entry.schemaVersion || 0);
            if (!Number.isFinite(schemaVersion) || schemaVersion < VIDEO_META_SCHEMA_VERSION) {
                return;
            }

            const durationSeconds = normalizePositiveInteger(entry.durationSeconds);

            const title = asString(entry.title).trim() || undefined;
            const channelTitle = asString(entry.channelTitle).trim() || undefined;
            const thumbnailUrl = asString(entry.thumbnailUrl).trim() || undefined;
            const isShortForm = entry.isShortForm === true;
            const viewCountText = asString(entry.viewCountText).trim() || undefined;
            const likeCountText = asString(entry.likeCountText).trim() || undefined;

            cache[videoId] = {
                schemaVersion,
                fetchedAt,
                title,
                channelTitle,
                thumbnailUrl,
                durationSeconds,
                isShortForm,
                viewCountText,
                likeCountText
            };
        });

        return cache;
    } catch {
        return {};
    }
}

export function persistVideoMetadataCacheToStorage(videoMetadataCacheByVideoId: VideoMetadataCacheMap): void {
    try {
        const entries = (Object.entries(videoMetadataCacheByVideoId) as Array<[string, VideoMetadata]>)
            .sort((left, right) => right[1].fetchedAt - left[1].fetchedAt)
            .slice(0, MAX_VIDEO_META_CACHE_ENTRIES);
        const compactCache: VideoMetadataCacheMap = {};
        entries.forEach(([videoId, value]) => {
            compactCache[videoId] = value;
        });
        localStorage.setItem(VIDEO_META_CACHE_STORAGE_KEY, JSON.stringify(compactCache));
    } catch {
    }
}
