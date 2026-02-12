import type { FavoriteChannel } from "../types";
import {
    createChannelMetaLine,
    createFavoriteToggleButton,
    createThumbnailElement,
    setElementVisibility
} from "./common";

export interface FavoritesRenderElements {
    list: HTMLUListElement | null;
    emptyState: HTMLElement | null;
}

export interface FavoritesRenderDependencies {
    favorites: FavoriteChannel[];
    elements: FavoritesRenderElements;
    onToggleFavorite: (channelId: string) => void;
    onOpenChannel: (favorite: FavoriteChannel) => void;
}

export function renderFavorites(dependencies: FavoritesRenderDependencies): void {
    const { favorites, elements, onToggleFavorite, onOpenChannel } = dependencies;
    const { list, emptyState } = elements;

    if (!list || !emptyState) {
        return;
    }

    list.replaceChildren();

    if (favorites.length === 0) {
        setElementVisibility(emptyState, true);
        setElementVisibility(list, false);
        return;
    }

    setElementVisibility(emptyState, false);
    setElementVisibility(list, true);

    favorites.forEach((favorite) => {
        const item = document.createElement("li");
        item.className = "yt-item yt-item-channel-row";

        item.append(createThumbnailElement(favorite.thumbnailUrl, `${favorite.title} thumbnail`));

        const content = document.createElement("div");
        content.className = "yt-item-content";

        const title = document.createElement("p");
        title.className = "yt-item-title yt-item-title-channel";
        title.textContent = favorite.title;

        const meta = createChannelMetaLine({
            channelId: favorite.channelId,
            channelHandle: favorite.channelHandle,
            onOpenChannel: () => {
                onOpenChannel(favorite);
            }
        });

        content.append(title, meta);

        const actions = document.createElement("div");
        actions.className = "yt-item-actions";

        const favoriteToggleButton = createFavoriteToggleButton({
            isFavorite: true,
            onToggle: () => {
                onToggleFavorite(favorite.channelId);
            }
        });

        actions.append(favoriteToggleButton);
        item.append(content, actions);
        list.append(item);
    });
}
