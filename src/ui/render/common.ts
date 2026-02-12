import type { FeedState, FeedVideoItem, ViewName } from "../types";
import { normalizeChannelHandle } from "../utils/text";

export interface LoadingIndicatorState {
    activeView: ViewName;
    isFeedLoading: boolean;
    isSubscriptionsLoading: boolean;
    isSearchLoading: boolean;
}

export interface LoadingIndicatorElements {
    feedLoadingIndicator: HTMLElement | null;
    subscriptionsLoadingIndicator: HTMLElement | null;
    searchLoadingIndicator: HTMLElement | null;
}

export function setElementVisibility(element: HTMLElement | null, visible: boolean): void {
    if (!element) {
        return;
    }
    element.hidden = !visible;
}

export interface ChannelMetaLineDependencies {
    channelId: string;
    channelHandle?: string;
    onOpenChannel: () => void;
}

export function createChannelMetaLine(dependencies: ChannelMetaLineDependencies): HTMLParagraphElement {
    const { channelId, channelHandle, onOpenChannel } = dependencies;

    const meta = document.createElement("p");
    meta.className = "yt-item-meta";

    const handle = normalizeChannelHandle(channelHandle ?? "");
    if (!handle) {
        meta.textContent = channelId;
        return meta;
    }

    const handleLink = document.createElement("a");
    handleLink.href = `https://www.youtube.com/${handle}`;
    handleLink.className = "yt-channel-handle-link";
    handleLink.textContent = handle;
    handleLink.target = "_blank";
    handleLink.rel = "noopener noreferrer";
    handleLink.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onOpenChannel();
    });

    meta.append(handleLink);
    return meta;
}

export interface FavoriteToggleButtonDependencies {
    isFavorite: boolean;
    onToggle: () => void;
}

export function createFavoriteToggleButton(dependencies: FavoriteToggleButtonDependencies): HTMLButtonElement {
    const { isFavorite, onToggle } = dependencies;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "yt-favorite-toggle";
    button.classList.toggle("is-favorited", isFavorite);
    button.textContent = isFavorite ? "Favourited" : "Favourite";
    button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle();
    });

    return button;
}

export function updateActiveViewLoadingIndicators(
    state: LoadingIndicatorState,
    elements: LoadingIndicatorElements
): void {
    setElementVisibility(elements.feedLoadingIndicator, state.activeView === "feed" && state.isFeedLoading);
    setElementVisibility(
        elements.subscriptionsLoadingIndicator,
        state.activeView === "subscriptions" && state.isSubscriptionsLoading
    );
    setElementVisibility(elements.searchLoadingIndicator, state.activeView === "search" && state.isSearchLoading);
}

export function createThumbnailElement(url: string, alt: string): HTMLElement {
    if (!url) {
        const placeholder = document.createElement("div");
        placeholder.className = "yt-item-thumb";
        return placeholder;
    }

    const image = document.createElement("img");
    image.className = "yt-item-thumb";
    image.src = url;
    image.alt = alt;
    image.loading = "lazy";
    return image;
}

export function createPlayableThumbnailWrapper(
    url: string,
    alt: string,
    durationLabel?: string
): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "yt-item-thumb-wrapper";
    wrapper.append(createThumbnailElement(url, alt));

    const playOverlay = document.createElement("div");
    playOverlay.className = "yt-play-overlay";
    playOverlay.textContent = "\u25B6";
    wrapper.append(playOverlay);

    if (durationLabel) {
        const duration = document.createElement("span");
        duration.className = "yt-thumb-duration";
        duration.textContent = durationLabel;
        wrapper.append(duration);
    }

    return wrapper;
}

export function makeCardPlayable(element: HTMLElement, onActivate: () => void): void {
    element.classList.add("yt-item-playable");
    element.tabIndex = 0;
    element.setAttribute("role", "button");
    element.addEventListener("click", () => {
        onActivate();
    });
    element.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
            return;
        }
        event.preventDefault();
        onActivate();
    });
}

export interface VideoListItemPresentation {
    title: string;
    thumbnailUrl: string;
    durationLabel: string;
    channelLine: string;
    statsLine: string;
}

export interface PlayableVideoItemPresentation {
    thumbnailUrl: string;
    durationLabel: string;
    channelLine: string;
    statsLine: string;
}

export interface PlayableVideoListItemDependencies {
    title: string;
    presentation: PlayableVideoItemPresentation;
    onPlay: () => void;
    itemClassName?: string;
    emptyChannelFallback?: string;
}

export function createPlayableVideoListItem(dependencies: PlayableVideoListItemDependencies): HTMLLIElement {
    const {
        title,
        presentation,
        onPlay,
        itemClassName = "",
        emptyChannelFallback = ""
    } = dependencies;

    const item = document.createElement("li");
    const classes = ["yt-item", itemClassName.trim()]
        .filter(Boolean)
        .join(" ");
    item.className = classes;
    makeCardPlayable(item, onPlay);

    const safeTitle = title.trim() || "Unknown title";
    const safeChannelLine = presentation.channelLine.trim() || emptyChannelFallback || "Unknown channel";

    const thumbWrapper = createPlayableThumbnailWrapper(
        presentation.thumbnailUrl,
        `${safeTitle} thumbnail`,
        presentation.durationLabel
    );
    item.append(thumbWrapper);

    const content = document.createElement("div");
    content.className = "yt-item-content";

    const titleElement = document.createElement("p");
    titleElement.className = "yt-item-title yt-item-title-video";
    titleElement.textContent = safeTitle;

    const channel = document.createElement("p");
    channel.className = "yt-item-meta yt-item-channel";
    channel.textContent = safeChannelLine;

    const stats = document.createElement("p");
    stats.className = "yt-item-meta yt-item-stats";
    stats.textContent = presentation.statsLine || " ";

    content.append(titleElement, channel, stats);
    item.append(content);

    return item;
}

export interface RenderPlayableVideoListDependencies {
    state: FeedState;
    list: HTMLUListElement | null;
    emptyState: HTMLElement | null;
    status: HTMLElement | null;
    defaultEmptyText: string;
    onUpdateLoadingIndicators: () => void;
    onPlayItem: (item: FeedVideoItem) => void;
    resolveItemPresentation: (item: FeedVideoItem) => VideoListItemPresentation;
    emptyChannelFallback?: string;
}

export function renderPlayableVideoList(dependencies: RenderPlayableVideoListDependencies): void {
    const {
        state,
        list,
        emptyState,
        status,
        defaultEmptyText,
        onUpdateLoadingIndicators,
        onPlayItem,
        resolveItemPresentation,
        emptyChannelFallback = ""
    } = dependencies;

    if (!list || !emptyState) {
        return;
    }

    list.replaceChildren();
    onUpdateLoadingIndicators();

    if (status) {
        const statusText = (state.warning || state.status || "").trim();
        status.hidden = !statusText;
        status.textContent = statusText;
        status.classList.toggle("yt-status-warning", Boolean(state.warning));
    }

    if (state.items.length === 0) {
        if (state.isLoading) {
            setElementVisibility(emptyState, false);
            setElementVisibility(list, false);
            return;
        }

        emptyState.textContent = state.status || defaultEmptyText;
        setElementVisibility(emptyState, true);
        setElementVisibility(list, false);
        return;
    }

    setElementVisibility(emptyState, false);
    setElementVisibility(list, true);

    state.items.forEach((itemData) => {
        const presentation = resolveItemPresentation(itemData);
        const item = createPlayableVideoListItem({
            title: presentation.title,
            presentation,
            emptyChannelFallback,
            onPlay: () => {
                onPlayItem(itemData);
            }
        });
        list.append(item);
    });
}
