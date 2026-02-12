import { asArray, asObject, asString } from "./json";

export function decodeEscapedText(value: string): string {
    return value
        .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
        .replace(/\\\//g, "/");
}

export function extractText(value: unknown): string {
    const direct = asString(value);
    if (direct) {
        return direct;
    }

    const objectValue = asObject(value);
    if (!objectValue) {
        return "";
    }

    const simpleText = asString(objectValue.simpleText);
    if (simpleText) {
        return simpleText;
    }

    const runs = asArray(objectValue.runs);
    if (runs.length === 0) {
        return "";
    }

    return runs
        .map((run) => {
            const runObject = asObject(run);
            return runObject ? asString(runObject.text) : "";
        })
        .join("")
        .trim();
}

export function extractThumbnailUrl(value: unknown): string {
    const objectValue = asObject(value);
    if (!objectValue) {
        return "";
    }

    const thumbnails = asArray(objectValue.thumbnails);
    for (let index = thumbnails.length - 1; index >= 0; index -= 1) {
        const thumbnail = asObject(thumbnails[index]);
        const rawUrl = thumbnail ? asString(thumbnail.url).trim() : "";
        const url = rawUrl.startsWith("//")
            ? `https:${rawUrl}`
            : rawUrl.replace(/^http:\/\//i, "https://");
        if (url) {
            return url;
        }
    }

    return "";
}

export function normalizeChannelHandle(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
        return "";
    }

    const match = trimmed.match(/@([A-Za-z0-9._-]+)/);
    if (!match?.[1]) {
        return "";
    }

    return `@${match[1]}`;
}
