import { MESSAGE_NAMES } from "../../shared/messages";
import {
    SEARCH_CHANNELS_LIMIT,
    SEARCH_IDLE_STATUS_TEXT,
    SEARCH_TIMEOUT_MS,
    SEARCH_VIDEOS_LIMIT
} from "../constants";
import {
    channelsEmptyState,
    channelsList,
    searchInput,
    videosEmptyState,
    videosList,
    searchStatus
} from "../dom";
import { getInnertubeConfig } from "../innertube/config";
import {
    buildInnertubeUrl,
    buildWebClientContext,
    buildWebInnertubeHeaders
} from "../innertube/request";
import {
    executeChannelSubscriptionCommand,
    fetchChannelSubscriptionState
} from "../innertube/subscription";
import { parseSearchResponse as parseSearchResponseFromParser } from "../parsers/search";
import { mapFeedItemsToSearchVideos, mapSearchVideosToFeedItems } from "./videoAdapters";
import {
    renderSearchResults as renderSearchResultsView,
    type SearchVideoPresentation
} from "../render/search";
import { state } from "../state";
import { persistFavoritesToStorage as persistFavoritesListToStorage } from "../storage/favorites";
import type {
    FavoriteChannel,
    FeedVideoItem,
    InnertubeCommand,
    SearchChannelResult,
    SearchVideoResult,
    VideoMetadata,
    ViewName
} from "../types";
import { normalizeChannelHandle } from "../utils/text";
import { sendHttpRequest } from "../bridge/httpBridge";
import { mapWithConcurrency } from "../utils/async";

interface SearchControllerDependencies {
    updateActiveViewLoadingIndicators: () => void;
    refreshFeed: () => Promise<void>;
    refreshSubscriptions: () => Promise<void>;
    getValidTvAccessToken: () => Promise<string>;
    refreshTvAccessToken: () => Promise<string>;
    renderFavorites: () => void;
    setActiveView: (view: ViewName) => void;
    buildFinalFilteredFeedItems: (items: FeedVideoItem[], limit: number) => Promise<FeedVideoItem[]>;
    getVideoMetadataFromCache: (videoId: string) => VideoMetadata | null;
    resolveSearchVideoPresentation: (video: SearchVideoResult, metadata: VideoMetadata | null) => SearchVideoPresentation;
}

export interface SearchController {
    setSearchStatus: (text: string) => void;
    renderSearchResults: () => void;
    performSearch: (query: string) => Promise<void>;
    playVideo: (video: SearchVideoResult) => void;
    isFavoriteChannel: (channelId: string) => boolean;
    toggleFavorite: (channel: SearchChannelResult) => void;
    removeFavorite: (channelId: string) => void;
    openFavoriteInExternalBrowser: (favorite: FavoriteChannel) => void;
    goHomeAndRefresh: () => Promise<void>;
}

export function createSearchController(dependencies: SearchControllerDependencies): SearchController {
    let searchRequestSequence = 0;

    const setSearchStatus = (text: string): void => {
        state.searchState.status = text;
        if (searchStatus) {
            searchStatus.textContent = text;
            searchStatus.hidden = text.trim().length === 0;
        }
    };

    const isFavoriteChannel = (channelId: string): boolean => {
        if (state.appMode === "logged_in") {
            return state.searchState.channels.some((channel) => channel.channelId === channelId && channel.isSubscribed === true);
        }

        return state.favorites.some((favorite) => favorite.channelId === channelId);
    };

    const subscriptionFallbackCommand = (channelId: string, subscribe: boolean): InnertubeCommand => {
        return {
            apiPath: subscribe ? "subscription/subscribe" : "subscription/unsubscribe",
            payload: {
                channelIds: [channelId]
            }
        };
    };

    const updateSearchChannelById = (
        channelId: string,
        updater: (channel: SearchChannelResult) => SearchChannelResult
    ): SearchChannelResult | null => {
        let updatedChannel: SearchChannelResult | null = null;
        state.searchState.channels = state.searchState.channels.map((channel) => {
            if (channel.channelId !== channelId) {
                return channel;
            }

            updatedChannel = updater(channel);
            return updatedChannel;
        });
        return updatedChannel;
    };

    const fetchSearchChannelSubscriptionState = async (channel: SearchChannelResult): Promise<SearchChannelResult> => {
        const normalizedChannelId = channel.channelId.trim();
        if (!normalizedChannelId || state.appMode !== "logged_in") {
            return channel;
        }

        try {
            const subscriptionState = await fetchChannelSubscriptionState(
                normalizedChannelId,
                {
                    isTvAuthAvailable: () => Boolean(state.tvAuthCache),
                    getValidTvAccessToken: dependencies.getValidTvAccessToken,
                    refreshTvAccessToken: dependencies.refreshTvAccessToken
                }
            );

            return {
                ...channel,
                isSubscribed: subscriptionState.isSubscribed === true,
                subscribeCommand: subscriptionState.subscribeCommand,
                unsubscribeCommand: subscriptionState.unsubscribeCommand
            };
        } catch {
            return {
                ...channel,
                isSubscribed: false,
                subscribeCommand: channel.subscribeCommand,
                unsubscribeCommand: channel.unsubscribeCommand
            };
        }
    };

    const resolveSearchChannelsSubscriptionState = async (
        channels: SearchChannelResult[]
    ): Promise<SearchChannelResult[]> => {
        if (state.appMode !== "logged_in" || channels.length === 0) {
            return channels;
        }

        return mapWithConcurrency(channels, 3, fetchSearchChannelSubscriptionState);
    };

    const resolveSubscriptionCommand = async (
        channel: SearchChannelResult,
        subscribe: boolean
    ): Promise<{ channel: SearchChannelResult; command: InnertubeCommand }> => {
        if (state.appMode !== "logged_in") {
            throw new Error("Sign in to manage subscriptions.");
        }

        const existingCommand = subscribe ? channel.subscribeCommand : channel.unsubscribeCommand;
        if (existingCommand) {
            return { channel, command: existingCommand };
        }

        const hydrated = await fetchSearchChannelSubscriptionState(channel);
        updateSearchChannelById(channel.channelId, () => hydrated);

        const hydratedCommand = subscribe ? hydrated.subscribeCommand : hydrated.unsubscribeCommand;
        if (hydratedCommand) {
            return { channel: hydrated, command: hydratedCommand };
        }

        return {
            channel: hydrated,
            command: subscriptionFallbackCommand(channel.channelId, subscribe)
        };
    };

    const toggleSubscription = async (channel: SearchChannelResult): Promise<void> => {
        const currentChannel = state.searchState.channels.find((entry) => entry.channelId === channel.channelId) || channel;
        const currentlySubscribed = currentChannel.isSubscribed === true;
        const shouldSubscribe = !currentlySubscribed;

        const { channel: channelForAction, command } = await resolveSubscriptionCommand(currentChannel, shouldSubscribe);

        const actionResult = await executeChannelSubscriptionCommand(
            command,
            {
                isTvAuthAvailable: () => Boolean(state.tvAuthCache),
                getValidTvAccessToken: dependencies.getValidTvAccessToken,
                refreshTvAccessToken: dependencies.refreshTvAccessToken
            }
        );

        const nextSubscribed = actionResult.isSubscribed === null
            ? shouldSubscribe
            : actionResult.isSubscribed;

        updateSearchChannelById(channelForAction.channelId, (entry) => ({
            ...entry,
            isSubscribed: nextSubscribed,
            subscribeCommand: actionResult.subscribeCommand || entry.subscribeCommand,
            unsubscribeCommand: actionResult.unsubscribeCommand || entry.unsubscribeCommand
        }));

        renderSearchResults();
        await Promise.all([dependencies.refreshFeed(), dependencies.refreshSubscriptions()]);
    };

    const persistFavoritesToStorage = (): void => {
        const didPersist = persistFavoritesListToStorage(state.favorites);
        if (!didPersist) {
            setSearchStatus("Could not save favorites to local storage.");
        }
    };

    const playVideo = (video: SearchVideoResult): void => {
        if (!state.iinaApi || typeof state.iinaApi.postMessage !== "function") {
            return;
        }

        state.iinaApi.postMessage(MESSAGE_NAMES.PlayItem, {
            videoId: video.videoId,
            url: `https://www.youtube.com/watch?v=${video.videoId}`
        });
    };

    const openChannelWithIdentityInExternalBrowser = (channelId: string, channelHandle?: string): void => {
        const handle = normalizeChannelHandle(channelHandle ?? "");
        const url = handle
            ? `https://www.youtube.com/${handle}`
            : `https://www.youtube.com/channel/${encodeURIComponent(channelId)}`;

        if (!state.iinaApi || typeof state.iinaApi.postMessage !== "function") {
            if (typeof window !== "undefined" && typeof window.open === "function") {
                window.open(url, "_blank", "noopener,noreferrer");
            }
            return;
        }

        state.iinaApi.postMessage(MESSAGE_NAMES.OpenExternalUrl, { url });
    };

    const openChannelInExternalBrowser = (channel: SearchChannelResult): void => {
        openChannelWithIdentityInExternalBrowser(channel.channelId, channel.channelHandle);
    };

    const openFavoriteInExternalBrowser = (favorite: FavoriteChannel): void => {
        openChannelWithIdentityInExternalBrowser(favorite.channelId, favorite.channelHandle);
    };

    const addFavorite = (channel: SearchChannelResult): void => {
        if (!channel.channelId || !channel.title || isFavoriteChannel(channel.channelId)) {
            return;
        }

        state.favorites = [
            {
                channelId: channel.channelId,
                title: channel.title,
                thumbnailUrl: channel.thumbnailUrl,
                channelHandle: normalizeChannelHandle(channel.channelHandle),
                addedAt: new Date().toISOString()
            },
            ...state.favorites
        ];
        persistFavoritesToStorage();
        void dependencies.refreshFeed();
        dependencies.renderFavorites();
        renderSearchResults();
    };

    const toggleFavorite = (channel: SearchChannelResult): void => {
        if (state.appMode === "logged_in") {
            void toggleSubscription(channel).catch((error) => {
                const message = error instanceof Error ? error.message : String(error);
                setSearchStatus(`Could not update subscription: ${message}`);
            });
            return;
        }

        if (isFavoriteChannel(channel.channelId)) {
            removeFavorite(channel.channelId);
            return;
        }
        addFavorite(channel);
    };

    const buildFinalSearchVideos = async (videos: SearchVideoResult[]): Promise<SearchVideoResult[]> => {
        if (videos.length === 0) {
            return [];
        }

        const feedLikeItems = mapSearchVideosToFeedItems(videos);
        const finalizedFeedItems = await dependencies.buildFinalFilteredFeedItems(feedLikeItems, videos.length);
        return mapFeedItemsToSearchVideos(finalizedFeedItems, videos);
    };

    const removeFavorite = (channelId: string): void => {
        const initialLength = state.favorites.length;
        state.favorites = state.favorites.filter((favorite) => favorite.channelId !== channelId);
        if (state.favorites.length === initialLength) {
            return;
        }
        persistFavoritesToStorage();
        void dependencies.refreshFeed();
        dependencies.renderFavorites();
        renderSearchResults();
    };

    const renderSearchResults = (): void => {
        renderSearchResultsView({
            searchState: state.searchState,
            isLoggedIn: state.appMode === "logged_in",
            elements: {
                channelsList,
                videosList,
                channelsEmptyState,
                videosEmptyState
            },
            onUpdateLoadingIndicators: dependencies.updateActiveViewLoadingIndicators,
            onOpenChannel: openChannelInExternalBrowser,
            onToggleFavorite: toggleFavorite,
            isFavoriteChannel,
            onPlayVideo: playVideo,
            getVideoMetadataFromCache: dependencies.getVideoMetadataFromCache,
            resolveVideoPresentation: dependencies.resolveSearchVideoPresentation
        });
    };

    const performSearch = async (query: string): Promise<void> => {
        const normalizedQuery = query.trim();
        const requestId = ++searchRequestSequence;

        if (!normalizedQuery) {
            state.searchState.query = "";
            state.searchState.channels = [];
            state.searchState.videos = [];
            state.searchState.isLoading = false;
            setSearchStatus(SEARCH_IDLE_STATUS_TEXT);
            renderSearchResults();
            return;
        }

        if (!state.iinaApi) {
            setSearchStatus("Search is available only inside IINA sidebar runtime.");
            return;
        }

        state.searchState.query = normalizedQuery;
        state.searchState.isLoading = true;
        setSearchStatus("");
        renderSearchResults();

        try {
            const config = await getInnertubeConfig();
            const headers = buildWebInnertubeHeaders(config);

            const response = await sendHttpRequest(
                {
                    method: "POST",
                    url: buildInnertubeUrl("search", config.apiKey),
                    headers,
                    body: {
                        context: {
                            client: buildWebClientContext(config)
                        },
                        query: normalizedQuery
                    }
                },
                SEARCH_TIMEOUT_MS
            );

            if (!response.ok || !response.text) {
                throw new Error(`Search request failed with status ${response.statusCode}`);
            }

            const responseJson: unknown = JSON.parse(response.text);
            const parsed = parseSearchResponseFromParser(responseJson);
            const limitedChannels = parsed.channels.slice(0, SEARCH_CHANNELS_LIMIT);
            const channelsWithSubscriptionState = await resolveSearchChannelsSubscriptionState(limitedChannels);
            const limitedVideos = parsed.videos.slice(0, SEARCH_VIDEOS_LIMIT);
            const finalizedVideos = await buildFinalSearchVideos(limitedVideos);

            if (requestId !== searchRequestSequence) {
                return;
            }

            state.searchState.channels = channelsWithSubscriptionState;
            state.searchState.videos = finalizedVideos;
            setSearchStatus("");
        } catch (error) {
            if (requestId !== searchRequestSequence) {
                return;
            }

            state.searchState.channels = [];
            state.searchState.videos = [];

            const message = error instanceof Error ? error.message : String(error);
            setSearchStatus(`Search failed: ${message}`);
        } finally {
            if (requestId !== searchRequestSequence) {
                return;
            }

            state.searchState.isLoading = false;
            renderSearchResults();
        }
    };

    const goHomeAndRefresh = async (): Promise<void> => {
        dependencies.setActiveView("feed");

        if (searchInput) {
            searchInput.value = "";
        }
        state.searchState.query = "";
        state.searchState.channels = [];
        state.searchState.videos = [];
        state.searchState.isLoading = false;
        setSearchStatus(SEARCH_IDLE_STATUS_TEXT);
        renderSearchResults();

        if (state.appMode === "logged_in") {
            await Promise.all([dependencies.refreshFeed(), dependencies.refreshSubscriptions()]);
            return;
        }

        await dependencies.refreshFeed();
    };

    return {
        setSearchStatus,
        renderSearchResults,
        performSearch,
        playVideo,
        isFavoriteChannel,
        toggleFavorite,
        removeFavorite,
        openFavoriteInExternalBrowser,
        goHomeAndRefresh
    };
}
