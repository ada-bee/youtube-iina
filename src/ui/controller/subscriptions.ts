import { SUBSCRIPTIONS_EMPTY_TEXT, SUBSCRIPTIONS_ITEMS_LIMIT } from "../constants";
import { subscriptionsEmptyState, subscriptionsList, subscriptionsStatus } from "../dom";
import { describeFeedFetchFailure } from "../innertube/feedBrowse";
import { renderSubscriptions as renderSubscriptionsView } from "../render/subscriptions";
import { state } from "../state";
import type { FeedFetchResult, FeedVideoItem } from "../types";

interface SubscriptionsControllerDependencies {
    updateActiveViewLoadingIndicators: () => void;
    playFeedItem: (item: FeedVideoItem) => void;
    resolveFeedItemPresentation: (item: FeedVideoItem) => {
        title: string;
        thumbnailUrl: string;
        durationLabel: string;
        channelLine: string;
        statsLine: string;
    };
    fetchLoggedInSubscriptionsFeed: () => Promise<FeedFetchResult>;
    buildFinalFilteredFeedItems: (items: FeedVideoItem[], limit: number) => Promise<FeedVideoItem[]>;
}

export interface SubscriptionsController {
    renderSubscriptions: () => void;
    refreshSubscriptions: () => Promise<void>;
}

export function createSubscriptionsController(dependencies: SubscriptionsControllerDependencies): SubscriptionsController {
    const renderSubscriptions = (): void => {
        renderSubscriptionsView({
            appMode: state.appMode,
            subscriptionsState: state.subscriptionsState,
            elements: {
                list: subscriptionsList,
                emptyState: subscriptionsEmptyState,
                status: subscriptionsStatus
            },
            subscriptionsEmptyText: SUBSCRIPTIONS_EMPTY_TEXT,
            signInEmptyText: "Sign in to load subscriptions.",
            onUpdateLoadingIndicators: dependencies.updateActiveViewLoadingIndicators,
            onPlayItem: dependencies.playFeedItem,
            resolveItemPresentation: dependencies.resolveFeedItemPresentation
        });
    };

    const refreshSubscriptions = async (): Promise<void> => {
        const refreshId = ++state.subscriptionsRefreshSequence;

        if (state.appMode !== "logged_in") {
            state.subscriptionsState.isLoading = false;
            state.subscriptionsState.items = [];
            state.subscriptionsState.status = "Sign in to load subscriptions.";
            state.subscriptionsState.warning = "";
            renderSubscriptions();
            return;
        }

        state.subscriptionsState.isLoading = true;
        state.subscriptionsState.warning = "";
        state.subscriptionsState.status = "";
        state.subscriptionsState.items = [];
        renderSubscriptions();

        try {
            const subscriptionsResult = await dependencies.fetchLoggedInSubscriptionsFeed();
            const items = await dependencies.buildFinalFilteredFeedItems(subscriptionsResult.items, SUBSCRIPTIONS_ITEMS_LIMIT);
            if (refreshId !== state.subscriptionsRefreshSequence) {
                return;
            }

            state.subscriptionsState.isLoading = false;
            state.subscriptionsState.items = items;
            if (subscriptionsResult.failureReason) {
                const statusCodeSuffix = Number.isFinite(subscriptionsResult.statusCode)
                    ? ` (HTTP ${subscriptionsResult.statusCode})`
                    : "";
                state.subscriptionsState.status = `Could not load subscriptions: ${describeFeedFetchFailure(subscriptionsResult.failureReason, "Request failed.")}${statusCodeSuffix}`;
            } else if (subscriptionsResult.items.length > 0 && items.length === 0) {
                state.subscriptionsState.status = "No playable subscription videos available.";
            } else {
                state.subscriptionsState.status = items.length > 0 ? "" : SUBSCRIPTIONS_EMPTY_TEXT;
            }
            state.subscriptionsState.warning = "";
            renderSubscriptions();
        } catch (error) {
            if (refreshId !== state.subscriptionsRefreshSequence) {
                return;
            }

            state.subscriptionsState.isLoading = false;
            state.subscriptionsState.items = [];
            state.subscriptionsState.warning = "";
            state.subscriptionsState.status = `Could not load subscriptions: ${error instanceof Error ? error.message : String(error)}`;
            renderSubscriptions();
        }
    };

    return {
        renderSubscriptions,
        refreshSubscriptions
    };
}
