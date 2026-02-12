import type { FeedState, FeedVideoItem } from "../types";
import {
    renderPlayableVideoList,
    setElementVisibility,
    type VideoListItemPresentation
} from "./common";

export type RelatedItemPresentation = VideoListItemPresentation;

export interface RelatedRenderElements {
    list: HTMLUListElement | null;
    emptyState: HTMLElement | null;
    status: HTMLElement | null;
}

export interface RelatedRenderDependencies {
    relatedState: FeedState;
    elements: RelatedRenderElements;
    relatedIdleText: string;
    relatedEmptyText: string;
    onUpdateLoadingIndicators: () => void;
    onPlayItem: (item: FeedVideoItem) => void;
    resolveItemPresentation: (item: FeedVideoItem) => RelatedItemPresentation;
}

export function renderRelated(dependencies: RelatedRenderDependencies): void {
    const {
        relatedState,
        elements,
        relatedIdleText,
        relatedEmptyText,
        onUpdateLoadingIndicators,
        onPlayItem,
        resolveItemPresentation
    } = dependencies;

    const { list, emptyState, status } = elements;
    if (!list || !emptyState) {
        return;
    }

    if (!relatedState.items.length && !relatedState.isLoading && relatedState.status === relatedIdleText) {
        list.replaceChildren();
        onUpdateLoadingIndicators();
        if (status) {
            status.hidden = true;
            status.textContent = "";
            status.classList.remove("yt-status-warning");
        }
        emptyState.textContent = relatedIdleText;
        setElementVisibility(emptyState, true);
        setElementVisibility(list, false);
        return;
    }

    renderPlayableVideoList({
        state: relatedState,
        list,
        emptyState,
        status,
        defaultEmptyText: relatedEmptyText,
        onUpdateLoadingIndicators,
        onPlayItem,
        resolveItemPresentation,
        emptyChannelFallback: "Unknown channel"
    });
}
