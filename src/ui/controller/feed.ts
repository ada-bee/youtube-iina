import { MESSAGE_NAMES } from "../../shared/messages";
import {
    CHANNEL_BROWSE_MAX_PAGES,
    FEED_EMPTY_NO_FAVORITES_TEXT,
    FEED_FETCH_CONCURRENCY,
    FEED_ITEMS_LIMIT,
    HOME_EMPTY_TEXT,
    HOME_ITEMS_LIMIT
} from "../constants";
import { feedEmptyState, feedFavoritesList, feedStatus } from "../dom";
import {
    fetchChannelFeedFromInnertube,
    fetchLoggedInHomeFeed,
    fetchLoggedInSubscriptionsFeed as fetchLoggedInSubscriptionsFeedFromInnertube
} from "../innertube/feedBrowse";
import {
    buildFinalFilteredFeedItems as buildFinalFilteredFeedItemsFromMetadata,
    getVideoMetadataFromCache as getVideoMetadataFromCacheFromMetadata,
} from "../innertube/metadata";
import { renderFeed as renderFeedView } from "../render/feed";
import { state } from "../state";
import { persistVideoMetadataCacheToStorage as persistVideoMetadataMapToStorage } from "../storage/videoMetaCache";
import type {
    ChannelFeedResult,
    FeedVideoItem,
    SearchVideoResult,
    VideoMetadata
} from "../types";
import {
    getPublishedTimestamp,
    resolveFeedItemPresentation as resolveFeedItemPresentationFromPresentation,
    resolveSearchVideoPresentation as resolveSearchVideoPresentationFromPresentation,
    type FeedItemPresentation
} from "./feedPresentation";
import { mapWithConcurrency } from "../utils/async";

interface FeedControllerDependencies {
    updateActiveViewLoadingIndicators: () => void;
    getValidTvAccessToken: () => Promise<string>;
    refreshTvAccessToken: () => Promise<string>;
}

export interface FeedController {
    refreshFeed: () => Promise<void>;
    renderFeed: () => void;
    playFeedItem: (item: FeedVideoItem) => void;
    resolveFeedItemPresentation: (item: FeedVideoItem) => FeedItemPresentation;
    resolveSearchVideoPresentation: (video: SearchVideoResult, metadata: VideoMetadata | null) => {
        thumbnailUrl: string;
        durationLabel: string;
        channelLine: string;
        statsLine: string;
    };
    getVideoMetadataFromCache: (videoId: string) => VideoMetadata | null;
    buildFinalFilteredFeedItems: (items: FeedVideoItem[], limit: number) => Promise<FeedVideoItem[]>;
    fetchLoggedInSubscriptionsFeed: () => Promise<FeedVideoItem[]>;
}

export function createFeedController(dependencies: FeedControllerDependencies): FeedController {
    const persistVideoMetadataCacheToStorage = (): void => {
        persistVideoMetadataMapToStorage(state.videoMetadataCacheByVideoId);
    };

    const getVideoMetadataFromCache = (videoId: string): VideoMetadata | null => {
        return getVideoMetadataFromCacheFromMetadata(state.videoMetadataCacheByVideoId, videoId);
    };

    const buildFinalFilteredFeedItems = async (items: FeedVideoItem[], limit: number): Promise<FeedVideoItem[]> => {
        return buildFinalFilteredFeedItemsFromMetadata(items, limit, state.videoMetadataCacheByVideoId, persistVideoMetadataCacheToStorage);
    };

    const loadChannelFeed = async (channelId: string): Promise<ChannelFeedResult> => {
        try {
            const items = await fetchChannelFeedFromInnertube(channelId);
            return {
                channelId,
                items,
                hadError: false
            };
        } catch {
            return {
                channelId,
                items: [],
                hadError: true
            };
        }
    };

    const mergeFeedItems = (channelResults: ChannelFeedResult[]): FeedVideoItem[] => {
        const deduped = new Map<string, FeedVideoItem>();

        channelResults.forEach((result) => {
            result.items.forEach((item) => {
                if (!deduped.has(item.videoId)) {
                    deduped.set(item.videoId, item);
                }
            });
        });

        return [...deduped.values()]
            .sort((left, right) => {
                const dateDelta = getPublishedTimestamp(right.published) - getPublishedTimestamp(left.published);
                if (dateDelta !== 0) {
                    return dateDelta;
                }
                return left.videoId.localeCompare(right.videoId);
            })
            .slice(0, FEED_ITEMS_LIMIT);
    };

    const resolveFeedItemPresentation = (itemData: FeedVideoItem): FeedItemPresentation => {
        const metadata = getVideoMetadataFromCache(itemData.videoId);
        return resolveFeedItemPresentationFromPresentation(itemData, metadata);
    };

    const resolveSearchVideoPresentation = (video: SearchVideoResult, metadata: VideoMetadata | null): {
        thumbnailUrl: string;
        durationLabel: string;
        channelLine: string;
        statsLine: string;
    } => {
        return resolveSearchVideoPresentationFromPresentation(video, metadata);
    };

    const renderFeed = (): void => {
        renderFeedView({
            appMode: state.appMode,
            favoritesCount: state.favorites.length,
            feedState: state.feedState,
            elements: {
                list: feedFavoritesList,
                emptyState: feedEmptyState,
                status: feedStatus
            },
            feedEmptyNoFavoritesText: FEED_EMPTY_NO_FAVORITES_TEXT,
            defaultEmptyText: "No recent uploads found for your channels.",
            onUpdateLoadingIndicators: dependencies.updateActiveViewLoadingIndicators,
            onPlayItem: playFeedItem,
            resolveItemPresentation: resolveFeedItemPresentation
        });
    };

    const playFeedItem = (item: FeedVideoItem): void => {
        if (!state.iinaApi || typeof state.iinaApi.postMessage !== "function") {
            return;
        }

        state.iinaApi.postMessage(MESSAGE_NAMES.PlayItem, {
            videoId: item.videoId,
            url: `https://www.youtube.com/watch?v=${item.videoId}`
        });
    };

    const fetchLoggedInSubscriptionsFeed = async (): Promise<FeedVideoItem[]> => {
        return fetchLoggedInSubscriptionsFeedFromInnertube({
            isTvAuthAvailable: () => Boolean(state.tvAuthCache),
            getValidTvAccessToken: dependencies.getValidTvAccessToken,
            refreshTvAccessToken: dependencies.refreshTvAccessToken
        });
    };

    const refreshFeed = async (): Promise<void> => {
        const refreshId = ++state.feedRefreshSequence;

        if (state.appMode === "logged_in") {
            state.feedState.isLoading = true;
            state.feedState.warning = "";
            state.feedState.status = "";
            state.feedState.items = [];
            renderFeed();

            try {
                const initialItems = await fetchLoggedInHomeFeed({
                    isTvAuthAvailable: () => Boolean(state.tvAuthCache),
                    getValidTvAccessToken: dependencies.getValidTvAccessToken,
                    refreshTvAccessToken: dependencies.refreshTvAccessToken
                });
                const items = await buildFinalFilteredFeedItems(initialItems, HOME_ITEMS_LIMIT);
                if (refreshId !== state.feedRefreshSequence) {
                    return;
                }

                state.feedState.items = items;
                state.feedState.isLoading = false;
                state.feedState.warning = "";
                state.feedState.status = items.length > 0 ? "" : HOME_EMPTY_TEXT;

                renderFeed();
            } catch (error) {
                if (refreshId !== state.feedRefreshSequence) {
                    return;
                }

                state.feedState.isLoading = false;
                state.feedState.items = [];
                state.feedState.warning = "";
                state.feedState.status = `Could not load home recommendations: ${error instanceof Error ? error.message : String(error)}`;
                renderFeed();
            }
            return;
        }

        const favoriteChannelIds = [...new Set<string>(
            state.favorites
                .map((favorite) => favorite.channelId.trim())
                .filter((channelId): channelId is string => channelId.length > 0)
        )];

        if (favoriteChannelIds.length === 0) {
            state.feedState.isLoading = false;
            state.feedState.items = [];
            state.feedState.status = "";
            state.feedState.warning = "";
            renderFeed();
            return;
        }

        state.feedState.isLoading = true;
        state.feedState.warning = "";
        state.feedState.status = "";
        state.feedState.items = [];
        renderFeed();

        let channelResults: ChannelFeedResult[] = [];
        try {
            channelResults = await mapWithConcurrency(favoriteChannelIds, FEED_FETCH_CONCURRENCY, loadChannelFeed);
        } catch {
            if (refreshId !== state.feedRefreshSequence) {
                return;
            }

            state.feedState.isLoading = false;
            state.feedState.items = [];
            state.feedState.status = "Could not load latest uploads.";
            state.feedState.warning = "";
            renderFeed();
            return;
        }

        if (refreshId !== state.feedRefreshSequence) {
            return;
        }

        const mergedItems = mergeFeedItems(channelResults);
        const filteredItems = await buildFinalFilteredFeedItems(mergedItems, FEED_ITEMS_LIMIT);
        if (refreshId !== state.feedRefreshSequence) {
            return;
        }
        const failedWithoutCacheCount = channelResults.filter((result) => result.hadError && result.items.length === 0).length;

        state.feedState.items = filteredItems;
        state.feedState.isLoading = false;
        state.feedState.status = filteredItems.length > 0
            ? ""
            : "No recent uploads found for your channels.";

        if (failedWithoutCacheCount > 0) {
            state.feedState.warning = `Could not load ${failedWithoutCacheCount} channel${failedWithoutCacheCount === 1 ? "" : "s"}.`;
        } else {
            state.feedState.warning = "";
        }

        renderFeed();
    };

    return {
        refreshFeed,
        renderFeed,
        playFeedItem,
        resolveFeedItemPresentation,
        resolveSearchVideoPresentation,
        getVideoMetadataFromCache,
        buildFinalFilteredFeedItems,
        fetchLoggedInSubscriptionsFeed
    };
}
