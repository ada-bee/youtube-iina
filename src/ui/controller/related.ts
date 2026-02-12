import type { PlaybackLifecycleEventPayload } from "../../shared/messages";
import {
    RELATED_EMPTY_TEXT,
    RELATED_IDLE_TEXT,
    RELATED_ITEMS_LIMIT
} from "../constants";
import {
    relatedEmptyState,
    relatedList,
    relatedStatus
} from "../dom";
import {
    describeFeedFetchFailure,
    fetchRelatedFeed
} from "../innertube/feedBrowse";
import { renderRelated as renderRelatedView } from "../render/related";
import { state } from "../state";
import type {
    FeedVideoItem,
    ViewName
} from "../types";

interface RelatedControllerDependencies {
    updateActiveViewLoadingIndicators: () => void;
    playFeedItem: (item: FeedVideoItem) => void;
    resolveFeedItemPresentation: (item: FeedVideoItem) => {
        title: string;
        thumbnailUrl: string;
        durationLabel: string;
        channelLine: string;
        statsLine: string;
    };
    buildFinalFilteredFeedItems: (items: FeedVideoItem[], limit: number) => Promise<FeedVideoItem[]>;
    getValidTvAccessToken: () => Promise<string>;
    refreshTvAccessToken: () => Promise<string>;
    setActiveView: (view: ViewName) => void;
    renderModeTabs: () => void;
}

export interface RelatedController {
    renderRelated: () => void;
    refreshRelated: () => Promise<void>;
    handlePlaybackLifecycleEvent: (payload: PlaybackLifecycleEventPayload) => void;
}

export function createRelatedController(dependencies: RelatedControllerDependencies): RelatedController {
    const renderRelated = (): void => {
        renderRelatedView({
            relatedState: state.relatedState,
            elements: {
                list: relatedList,
                emptyState: relatedEmptyState,
                status: relatedStatus
            },
            relatedIdleText: RELATED_IDLE_TEXT,
            relatedEmptyText: RELATED_EMPTY_TEXT,
            onUpdateLoadingIndicators: dependencies.updateActiveViewLoadingIndicators,
            onPlayItem: dependencies.playFeedItem,
            resolveItemPresentation: dependencies.resolveFeedItemPresentation
        });
    };

    const refreshRelated = async (): Promise<void> => {
        const playbackVideoId = state.currentPlaybackVideoId.trim();
        const refreshId = ++state.relatedRefreshSequence;

        if (!playbackVideoId) {
            state.relatedState.isLoading = false;
            state.relatedState.items = [];
            state.relatedState.warning = "";
            state.relatedState.status = RELATED_IDLE_TEXT;
            renderRelated();
            return;
        }

        state.relatedState.isLoading = true;
        state.relatedState.warning = "";
        state.relatedState.status = "";
        state.relatedState.items = [];
        renderRelated();

        try {
            const relatedResult = await fetchRelatedFeed(
                playbackVideoId,
                state.appMode === "logged_in"
                    ? {
                        isTvAuthAvailable: () => Boolean(state.tvAuthCache),
                        getValidTvAccessToken: dependencies.getValidTvAccessToken,
                        refreshTvAccessToken: dependencies.refreshTvAccessToken
                    }
                    : undefined
            );

            const withoutCurrentVideo = relatedResult.items.filter((item) => item.videoId !== playbackVideoId);
            const items = await dependencies.buildFinalFilteredFeedItems(withoutCurrentVideo, RELATED_ITEMS_LIMIT);
            if (refreshId !== state.relatedRefreshSequence) {
                return;
            }

            state.relatedState.isLoading = false;
            state.relatedState.items = items;
            state.relatedState.warning = "";
            if (relatedResult.failureReason) {
                const statusCodeSuffix = Number.isFinite(relatedResult.statusCode)
                    ? ` (HTTP ${relatedResult.statusCode})`
                    : "";
                state.relatedState.status = `Could not load related videos: ${describeFeedFetchFailure(relatedResult.failureReason, "Request failed.")}${statusCodeSuffix}`;
            } else if (relatedResult.items.length > 0 && items.length === 0) {
                state.relatedState.status = "No playable related videos available.";
            } else {
                state.relatedState.status = items.length > 0 ? "" : RELATED_EMPTY_TEXT;
            }

            renderRelated();
        } catch (error) {
            if (refreshId !== state.relatedRefreshSequence) {
                return;
            }

            state.relatedState.isLoading = false;
            state.relatedState.items = [];
            state.relatedState.warning = "";
            state.relatedState.status = `Could not load related videos: ${error instanceof Error ? error.message : String(error)}`;
            renderRelated();
        }
    };

    const handlePlaybackLifecycleEvent = (payload: PlaybackLifecycleEventPayload): void => {
        const videoId = String(payload?.videoId || "").trim();
        if (!videoId) {
            return;
        }

        if (videoId === state.currentPlaybackVideoId) {
            return;
        }

        state.currentPlaybackVideoId = videoId;
        dependencies.renderModeTabs();
        dependencies.setActiveView("related");
        void refreshRelated();
    };

    return {
        renderRelated,
        refreshRelated,
        handlePlaybackLifecycleEvent
    };
}
