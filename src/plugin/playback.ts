import type { PlayItemPayload } from "../shared/messages";

const { mpv } = iina as any;

export function handlePlayItem(data: PlayItemPayload): boolean {
    if (!data || !data.url || !data.videoId) {
        return false;
    }

    const url = String(data.url);
    mpv.command("loadfile", [url, "replace"]);

    return true;
}
