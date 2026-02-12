import type { AppMode, FeedState, FeedVideoItem } from "../types";
import {
    renderPlayableVideoList,
    setElementVisibility,
    type VideoListItemPresentation
} from "./common";

export type FeedItemPresentation = VideoListItemPresentation;

export interface FeedRenderElements {
    list: HTMLUListElement | null;
    emptyState: HTMLElement | null;
    status: HTMLElement | null;
}

export interface FeedRenderDependencies {
    appMode: AppMode;
    favoritesCount: number;
    feedState: FeedState;
    elements: FeedRenderElements;
    feedEmptyNoFavoritesText: string;
    defaultEmptyText: string;
    onUpdateLoadingIndicators: () => void;
    onPlayItem: (item: FeedVideoItem) => void;
    resolveItemPresentation: (item: FeedVideoItem) => FeedItemPresentation;
}

export function renderFeed(dependencies: FeedRenderDependencies): void {
    const {
        appMode,
        favoritesCount,
        feedState,
        elements,
        feedEmptyNoFavoritesText,
        defaultEmptyText,
        onUpdateLoadingIndicators,
        onPlayItem,
        resolveItemPresentation
    } = dependencies;

    const { list, emptyState, status } = elements;
    if (!list || !emptyState) {
        return;
    }

    if (appMode === "anonymous" && favoritesCount === 0) {
        list.replaceChildren();
        onUpdateLoadingIndicators();
        emptyState.textContent = feedEmptyNoFavoritesText;
        if (status) {
            status.hidden = true;
            status.textContent = "";
            status.classList.remove("yt-status-warning");
        }
        setElementVisibility(emptyState, true);
        setElementVisibility(list, false);
        return;
    }

    renderPlayableVideoList({
        state: feedState,
        list,
        emptyState,
        status,
        defaultEmptyText,
        onUpdateLoadingIndicators,
        onPlayItem,
        resolveItemPresentation
    });
}
