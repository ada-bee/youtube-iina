import {
    feedLoadingIndicator,
    searchInput,
    searchLoadingIndicator,
    subscriptionsLoadingIndicator,
    tabs,
    views
} from "../dom";
import {
    updateActiveViewLoadingIndicators as updateActiveViewLoadingIndicatorsView
} from "../render/common";
import { state } from "../state";
import type { ViewName } from "../types";

export interface NavigationController {
    getActiveView: () => ViewName;
    setActiveView: (view: ViewName) => void;
    updateActiveViewLoadingIndicators: () => void;
}

export function createNavigationController(): NavigationController {
    const getActiveView = (): ViewName => {
        return state.activeView;
    };

    const updateActiveViewLoadingIndicators = (): void => {
        updateActiveViewLoadingIndicatorsView(
            {
                activeView: getActiveView(),
                isFeedLoading: state.feedState.isLoading,
                isSubscriptionsLoading: state.subscriptionsState.isLoading,
                isSearchLoading: state.searchState.isLoading
            },
            {
                feedLoadingIndicator,
                subscriptionsLoadingIndicator,
                searchLoadingIndicator
            }
        );
    };

    const setActiveView = (viewName: ViewName): void => {
        let normalizedViewName = viewName;
        if (viewName === "subscriptions" && state.appMode !== "logged_in") {
            normalizedViewName = "feed";
        }
        if (viewName === "favorites" && state.appMode === "logged_in") {
            normalizedViewName = "feed";
        }

        state.activeView = normalizedViewName;

        tabs.forEach((tab) => {
            const isActive = tab.dataset.view === normalizedViewName;
            tab.classList.toggle("is-active", isActive);
        });

        views.forEach((view) => {
            const isActive = view.dataset.view === normalizedViewName;
            view.classList.toggle("is-active", isActive);
        });

        if (normalizedViewName === "search" && searchInput) {
            searchInput.focus();
        }

        updateActiveViewLoadingIndicators();
    };

    return {
        getActiveView,
        setActiveView,
        updateActiveViewLoadingIndicators
    };
}
