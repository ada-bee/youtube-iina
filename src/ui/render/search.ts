import type { SearchChannelResult, SearchState, SearchVideoResult, VideoMetadata } from "../types";
import {
    createChannelMetaLine,
    createFavoriteToggleButton,
    createPlayableVideoListItem,
    createThumbnailElement,
    setElementVisibility
} from "./common";

export interface SearchVideoPresentation {
    thumbnailUrl: string;
    durationLabel: string;
    channelLine: string;
    statsLine: string;
}

export interface SearchRenderElements {
    channelsList: HTMLUListElement | null;
    videosList: HTMLUListElement | null;
    channelsEmptyState: HTMLElement | null;
    videosEmptyState: HTMLElement | null;
}

export interface SearchRenderDependencies {
    searchState: SearchState;
    isLoggedIn: boolean;
    elements: SearchRenderElements;
    onUpdateLoadingIndicators: () => void;
    onOpenChannel: (channel: SearchChannelResult) => void;
    onToggleFavorite: (channel: SearchChannelResult) => void;
    isFavoriteChannel: (channelId: string) => boolean;
    onPlayVideo: (video: SearchVideoResult) => void;
    getVideoMetadataFromCache: (videoId: string) => VideoMetadata | null;
    resolveVideoPresentation: (video: SearchVideoResult, metadata: VideoMetadata | null) => SearchVideoPresentation;
}

export function renderSearchResults(dependencies: SearchRenderDependencies): void {
    const {
        searchState,
        isLoggedIn,
        elements,
        onUpdateLoadingIndicators,
        onOpenChannel,
        onToggleFavorite,
        isFavoriteChannel,
        onPlayVideo,
        getVideoMetadataFromCache,
        resolveVideoPresentation
    } = dependencies;

    const { channelsList, videosList, channelsEmptyState, videosEmptyState } = elements;
    if (!channelsList || !videosList || !channelsEmptyState || !videosEmptyState) {
        return;
    }

    onUpdateLoadingIndicators();

    channelsList.replaceChildren();
    videosList.replaceChildren();

    if (searchState.channels.length === 0) {
        setElementVisibility(channelsEmptyState, Boolean(searchState.query) && !searchState.isLoading);
        setElementVisibility(channelsList, false);
    } else {
        setElementVisibility(channelsEmptyState, false);
        setElementVisibility(channelsList, true);

        searchState.channels.forEach((channel) => {
            const item = document.createElement("li");
            item.className = "yt-item yt-item-channel-row";

            item.append(createThumbnailElement(channel.thumbnailUrl, `${channel.title} thumbnail`));

            const content = document.createElement("div");
            content.className = "yt-item-content";

            const title = document.createElement("p");
            title.className = "yt-item-title yt-item-title-channel";
            title.textContent = channel.title;

            const meta = createChannelMetaLine({
                channelId: channel.channelId,
                channelHandle: channel.channelHandle,
                onOpenChannel: () => {
                    onOpenChannel(channel);
                }
            });

            content.append(title, meta);

            const actions = document.createElement("div");
            actions.className = "yt-item-actions";

            const alreadyFavorite = isFavoriteChannel(channel.channelId);
            const favoriteButton = createFavoriteToggleButton({
                isFavorite: alreadyFavorite,
                onToggle: () => {
                    onToggleFavorite(channel);
                },
                inactiveLabel: isLoggedIn ? "Subscribe" : "Favourite",
                activeLabel: isLoggedIn ? "Subscribed" : "Favourited"
            });

            actions.append(favoriteButton);
            item.append(content, actions);
            channelsList.append(item);
        });
    }

    if (searchState.videos.length === 0) {
        setElementVisibility(videosEmptyState, Boolean(searchState.query) && !searchState.isLoading);
        setElementVisibility(videosList, false);
    } else {
        setElementVisibility(videosEmptyState, false);
        setElementVisibility(videosList, true);

        searchState.videos.forEach((video) => {
            const metadata = getVideoMetadataFromCache(video.videoId);
            const presentation = resolveVideoPresentation(video, metadata);

            const item = createPlayableVideoListItem({
                title: video.title,
                presentation,
                itemClassName: "yt-item-feed-layout",
                onPlay: () => {
                    onPlayVideo(video);
                }
            });
            videosList.append(item);
        });
    }
}
