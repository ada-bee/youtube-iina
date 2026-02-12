import type { AppMode, DeviceCodeResponse, ViewName } from "../types";

export interface AuthRenderElements {
    authToggleButton: HTMLButtonElement | null;
    authStatus: HTMLElement | null;
    authPanel: HTMLElement | null;
    authPanelCode: HTMLInputElement | null;
    authPanelUrl: HTMLAnchorElement | null;
}

export interface AuthRenderState {
    appMode: AppMode;
    authPending: boolean;
    authStatusMessage: string;
    authPanelState: DeviceCodeResponse | null;
}

export interface ModeTabsElements {
    feedTab: HTMLButtonElement | null;
    subscriptionsTab: HTMLButtonElement | null;
    favoritesTab: HTMLButtonElement | null;
}

export interface ModeTabsDependencies {
    appMode: AppMode;
    elements: ModeTabsElements;
    getActiveView: () => ViewName;
    setActiveView: (view: ViewName) => void;
}

export function renderAuthUi(state: AuthRenderState, elements: AuthRenderElements): void {
    if (elements.authToggleButton) {
        elements.authToggleButton.disabled = state.authPending;
        const authAction = state.appMode === "logged_in" ? "Logout" : "Login";
        elements.authToggleButton.setAttribute("aria-label", authAction);
        elements.authToggleButton.title = authAction;
        elements.authToggleButton.classList.toggle("is-logged-in", state.appMode === "logged_in");
    }

    if (elements.authStatus) {
        elements.authStatus.textContent = state.authStatusMessage;
        elements.authStatus.hidden = !state.authStatusMessage.trim();
    }

    if (elements.authPanelCode) {
        const authCode = state.authPanelState?.user_code || "-";
        elements.authPanelCode.value = authCode;
        elements.authPanelCode.size = Math.max(4, authCode.length + 1);
    }

    if (elements.authPanelUrl) {
        const verificationUrl = state.authPanelState?.verification_url || "https://youtube.com/activate";
        const normalizedVerificationUrl = verificationUrl.startsWith("http")
            ? verificationUrl
            : `https://${verificationUrl.replace(/^\/+/, "")}`;
        const verificationUrlDisplay = normalizedVerificationUrl
            .replace(/^https?:\/\//, "")
            .replace(/^www\./, "");

        elements.authPanelUrl.href = normalizedVerificationUrl;
        elements.authPanelUrl.target = "_blank";
        elements.authPanelUrl.rel = "noopener noreferrer";
        const linkText = elements.authPanelUrl.querySelector<HTMLElement>(".yt-auth-panel-link-text");
        if (linkText) {
            linkText.textContent = verificationUrlDisplay;
        }
    }

    if (elements.authPanel) {
        elements.authPanel.hidden = !state.authPanelState;
    }
}

export function renderModeTabs(dependencies: ModeTabsDependencies): void {
    const { appMode, elements, getActiveView, setActiveView } = dependencies;
    const isLoggedIn = appMode === "logged_in";

    if (elements.feedTab) {
        elements.feedTab.textContent = isLoggedIn ? "Home" : "Feed";
    }

    if (elements.subscriptionsTab) {
        elements.subscriptionsTab.textContent = "Subscriptions";
        elements.subscriptionsTab.hidden = !isLoggedIn;
    }

    if (elements.favoritesTab) {
        elements.favoritesTab.textContent = "Channels";
        elements.favoritesTab.hidden = isLoggedIn;
    }

    const currentView = getActiveView();
    if (currentView === "subscriptions" && !isLoggedIn) {
        setActiveView("feed");
        return;
    }

    if (currentView === "favorites" && isLoggedIn) {
        setActiveView("feed");
    }
}
