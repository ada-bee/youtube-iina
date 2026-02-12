import { authPanelUrl, authToggleButton, homeRefreshButton, searchForm, searchInput, tabs } from "../dom";
import { MESSAGE_NAMES } from "../../shared/messages";
import { state } from "../state";
import type { ViewName } from "../types";

interface EventsControllerDependencies {
    setActiveView: (view: ViewName) => void;
    performSearch: (query: string) => Promise<void>;
    startTvLoginFlow: () => Promise<void>;
    logoutTvAuth: () => Promise<void>;
    goHomeAndRefresh: () => Promise<void>;
}

export interface EventsController {
    bindTabEvents: () => void;
    bindSearchEvents: () => void;
}

export function createEventsController(dependencies: EventsControllerDependencies): EventsController {
    const bindTabEvents = (): void => {
        tabs.forEach((tab) => {
            tab.addEventListener("click", () => {
                const viewName = tab.dataset.view;
                if (viewName === "feed" || viewName === "subscriptions" || viewName === "favorites" || viewName === "related") {
                    dependencies.setActiveView(viewName);
                }
            });
        });
    };

    const bindSearchEvents = (): void => {
        if (searchForm && searchInput) {
            searchForm.addEventListener("submit", (event) => {
                event.preventDefault();
                dependencies.setActiveView("search");
                void dependencies.performSearch(searchInput.value);
            });
        }

        if (authToggleButton) {
            authToggleButton.addEventListener("click", () => {
                if (state.appMode === "logged_in") {
                    void dependencies.logoutTvAuth();
                    return;
                }
                void dependencies.startTvLoginFlow();
            });
        }

        if (homeRefreshButton) {
            homeRefreshButton.addEventListener("click", () => {
                void dependencies.goHomeAndRefresh();
            });
        }

        if (authPanelUrl) {
            authPanelUrl.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                const href = authPanelUrl.href;
                if (!href) {
                    return;
                }

                if (state.iinaApi && typeof state.iinaApi.postMessage === "function") {
                    state.iinaApi.postMessage(MESSAGE_NAMES.OpenExternalUrl, { url: href });
                    return;
                }

                if (typeof window !== "undefined" && typeof window.open === "function") {
                    window.open(href, "_blank", "noopener,noreferrer");
                }
            });
        }
    };

    return {
        bindTabEvents,
        bindSearchEvents
    };
}
