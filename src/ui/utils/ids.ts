import { YOUTUBE_VIDEO_ID_PATTERN } from "../constants";

export function isValidYouTubeVideoId(videoId: string): boolean {
    return YOUTUBE_VIDEO_ID_PATTERN.test(videoId.trim());
}

export function createPseudoUuid(): string {
    const hex = "0123456789abcdef";
    const segments = [8, 4, 4, 4, 12];
    return segments
        .map((segmentLength) => {
            let segment = "";
            for (let index = 0; index < segmentLength; index += 1) {
                const randomIndex = Math.floor(Math.random() * hex.length);
                segment += hex[randomIndex];
            }
            return segment;
        })
        .join("-");
}
