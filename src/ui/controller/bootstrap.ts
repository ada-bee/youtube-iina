import { ensureHttpBridgeListener, setHttpBridgeApi } from "../bridge/httpBridge";
import { UI_SETTINGS_SCHEMA_VERSION } from "../constants";
import { favoritesEmptyState, favoritesList } from "../dom";
import { renderFavorites as renderFavoritesView } from "../render/favorites";
import { setUiSettings, state } from "../state";
import { createAuthController, type AuthController } from "./auth";
import { createEventsController } from "./events";
import { createFeedController } from "./feed";
import { createHookController } from "./hooks";
import { createNavigationController } from "./navigation";
import { createRelatedController } from "./related";
import { createSearchController, type SearchController } from "./search";
import { createSubscriptionsController } from "./subscriptions";

export function initializeSidebar(): void {
    setHttpBridgeApi(state.iinaApi);

    const navigationController = createNavigationController();

    let authController: AuthController | null = null;

    const feedController = createFeedController({
        updateActiveViewLoadingIndicators: navigationController.updateActiveViewLoadingIndicators,
        getValidTvAccessToken: () => {
            if (!authController) {
                return Promise.reject(new Error("Auth controller unavailable."));
            }
            return authController.getValidTvAccessToken();
        },
        refreshTvAccessToken: () => {
            if (!authController) {
                return Promise.reject(new Error("Auth controller unavailable."));
            }
            return authController.refreshTvAccessToken();
        }
    });

    const subscriptionsController = createSubscriptionsController({
        updateActiveViewLoadingIndicators: navigationController.updateActiveViewLoadingIndicators,
        playFeedItem: feedController.playFeedItem,
        resolveFeedItemPresentation: feedController.resolveFeedItemPresentation,
        fetchLoggedInSubscriptionsFeed: feedController.fetchLoggedInSubscriptionsFeed,
        buildFinalFilteredFeedItems: feedController.buildFinalFilteredFeedItems
    });

    let searchController: SearchController | null = null;

    const renderFavorites = (): void => {
        renderFavoritesView({
            favorites: state.favorites,
            elements: {
                list: favoritesList,
                emptyState: favoritesEmptyState
            },
            onToggleFavorite: (channelId: string) => {
                searchController?.removeFavorite(channelId);
            },
            onOpenChannel: (favorite) => {
                searchController?.openFavoriteInExternalBrowser(favorite);
            }
        });
    };

    searchController = createSearchController({
        updateActiveViewLoadingIndicators: navigationController.updateActiveViewLoadingIndicators,
        refreshFeed: feedController.refreshFeed,
        refreshSubscriptions: subscriptionsController.refreshSubscriptions,
        renderFavorites,
        setActiveView: navigationController.setActiveView,
        buildFinalFilteredFeedItems: feedController.buildFinalFilteredFeedItems,
        getVideoMetadataFromCache: feedController.getVideoMetadataFromCache,
        resolveSearchVideoPresentation: feedController.resolveSearchVideoPresentation
    });

    authController = createAuthController({
        renderFeed: feedController.renderFeed,
        renderSubscriptions: subscriptionsController.renderSubscriptions,
        refreshFeed: feedController.refreshFeed,
        refreshSubscriptions: subscriptionsController.refreshSubscriptions,
        getActiveView: navigationController.getActiveView,
        setActiveView: navigationController.setActiveView
    });

    const relatedController = createRelatedController({
        updateActiveViewLoadingIndicators: navigationController.updateActiveViewLoadingIndicators,
        playFeedItem: feedController.playFeedItem,
        resolveFeedItemPresentation: feedController.resolveFeedItemPresentation,
        buildFinalFilteredFeedItems: feedController.buildFinalFilteredFeedItems,
        getValidTvAccessToken: authController.getValidTvAccessToken,
        refreshTvAccessToken: authController.refreshTvAccessToken,
        setActiveView: navigationController.setActiveView,
        renderModeTabs: authController.renderModeTabs
    });

    const eventsController = createEventsController({
        setActiveView: navigationController.setActiveView,
        performSearch: searchController.performSearch,
        startTvLoginFlow: authController.startTvLoginFlow,
        logoutTvAuth: authController.logoutTvAuth,
        goHomeAndRefresh: searchController.goHomeAndRefresh
    });

    const hookController = createHookController({
        iinaApi: state.iinaApi,
        onPlaybackLifecycleEvent: relatedController.handlePlaybackLifecycleEvent,
        onSettingsSync: (payload) => {
            const flags = payload.featureFlags;
            const currentFlags = state.uiSettings.featureFlags;
            const nextSettings = {
                schemaVersion: Number.isFinite(payload.schemaVersion) ? payload.schemaVersion : UI_SETTINGS_SCHEMA_VERSION,
                featureFlags: {
                    enableSponsorBlock: flags?.enableSponsorBlock === true,
                    enableWatchStatusSyncSignedIn: flags?.enableWatchStatusSyncSignedIn !== false,
                    enableWatchStatusLocalAnonymous: flags?.enableWatchStatusLocalAnonymous !== false,
                    includeLivestreams: flags?.includeLivestreams === true
                }
            };

            const didChange = JSON.stringify(currentFlags) !== JSON.stringify(nextSettings.featureFlags);
            if (!setUiSettings(nextSettings)) {
                return;
            }

            if (!didChange) {
                return;
            }

            void feedController.refreshFeed();
            void subscriptionsController.refreshSubscriptions();
        }
    });

    eventsController.bindTabEvents();
    eventsController.bindSearchEvents();
    ensureHttpBridgeListener();
    hookController.bind();
    hookController.requestSettingsSync();

    authController.renderAuthUi();
    authController.renderModeTabs();
    renderFavorites();
    feedController.renderFeed();
    subscriptionsController.renderSubscriptions();
    relatedController.renderRelated();
    searchController.renderSearchResults();
    searchController.setSearchStatus(state.searchState.status);

    navigationController.setActiveView(navigationController.getActiveView());
    void authController.initializeAuthState();
}
