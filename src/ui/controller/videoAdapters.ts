import type { FeedVideoItem, SearchVideoResult } from "../types";

export function mapSearchVideosToFeedItems(videos: SearchVideoResult[]): FeedVideoItem[] {
    return videos.map((video) => ({
        videoId: video.videoId,
        title: video.title,
        published: video.publishedText,
        channelTitle: video.channelTitle,
        thumbnailUrl: video.thumbnailUrl
    }));
}

export function mapFeedItemsToSearchVideos(
    items: FeedVideoItem[],
    sourceVideos: SearchVideoResult[]
): SearchVideoResult[] {
    const videoById = new Map(sourceVideos.map((video) => [video.videoId, video]));

    return items
        .map((item) => videoById.get(item.videoId))
        .filter((video): video is SearchVideoResult => Boolean(video));
}
