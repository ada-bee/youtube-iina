import type { AppMode, FeedState, FeedVideoItem } from "../types";
import {
    renderPlayableVideoList,
    setElementVisibility,
    type VideoListItemPresentation
} from "./common";

export type SubscriptionsItemPresentation = VideoListItemPresentation;

export interface SubscriptionsRenderElements {
    list: HTMLUListElement | null;
    emptyState: HTMLElement | null;
    status: HTMLElement | null;
}

export interface SubscriptionsRenderDependencies {
    appMode: AppMode;
    subscriptionsState: FeedState;
    elements: SubscriptionsRenderElements;
    subscriptionsEmptyText: string;
    signInEmptyText: string;
    onUpdateLoadingIndicators: () => void;
    onPlayItem: (item: FeedVideoItem) => void;
    resolveItemPresentation: (item: FeedVideoItem) => SubscriptionsItemPresentation;
}

export function renderSubscriptions(dependencies: SubscriptionsRenderDependencies): void {
    const {
        appMode,
        subscriptionsState,
        elements,
        subscriptionsEmptyText,
        signInEmptyText,
        onUpdateLoadingIndicators,
        onPlayItem,
        resolveItemPresentation
    } = dependencies;

    const { list, emptyState, status } = elements;
    if (!list || !emptyState) {
        return;
    }

    if (appMode !== "logged_in") {
        list.replaceChildren();
        onUpdateLoadingIndicators();
        if (status) {
            status.hidden = true;
            status.textContent = "";
            status.classList.remove("yt-status-warning");
        }
        emptyState.textContent = signInEmptyText;
        setElementVisibility(emptyState, true);
        setElementVisibility(list, false);
        return;
    }

    renderPlayableVideoList({
        state: subscriptionsState,
        list,
        emptyState,
        status,
        defaultEmptyText: subscriptionsEmptyText,
        onUpdateLoadingIndicators,
        onPlayItem,
        resolveItemPresentation,
        emptyChannelFallback: "Unknown channel"
    });
}
