import {
    authPanel,
    authPanelCode,
    authPanelUrl,
    authStatus,
    authToggleButton,
    favoritesTab,
    feedTab,
    subscriptionsTab
} from "../dom";
import { state } from "../state";
import {
    clearTvAuthCacheFromStorage,
    persistTvAuthCacheToStorage as persistTvAuthCacheRecordToStorage
} from "../storage/authCache";
import type { AppMode, ViewName } from "../types";
import {
    exchangeTvDeviceCode,
    getValidTvAccessToken as getValidTvAccessTokenOrRefresh,
    requestTvDeviceCode,
    resolveTvOAuthClientIdentity,
    refreshTvAccessToken as refreshTvAccessTokenByRefreshToken,
    revokeTvAccessToken
} from "../auth/tvOAuth";
import {
    renderAuthUi as renderAuthUiView,
    renderModeTabs as renderModeTabsView
} from "../render/auth";

interface AuthControllerDependencies {
    renderFeed: () => void;
    renderSubscriptions: () => void;
    refreshFeed: () => Promise<void>;
    refreshSubscriptions: () => Promise<void>;
    getActiveView: () => ViewName;
    setActiveView: (view: ViewName) => void;
}

export interface AuthController {
    renderAuthUi: () => void;
    renderModeTabs: () => void;
    setAppMode: (mode: AppMode) => Promise<void>;
    startTvLoginFlow: () => Promise<void>;
    logoutTvAuth: () => Promise<void>;
    initializeAuthState: () => Promise<void>;
    refreshTvAccessToken: () => Promise<string>;
    getValidTvAccessToken: () => Promise<string>;
}

export function createAuthController(dependencies: AuthControllerDependencies): AuthController {
    const persistTvAuthCacheToStorage = (): void => {
        persistTvAuthCacheRecordToStorage(state.tvAuthCache);
    };

    const clearTvAuthCache = (): void => {
        state.tvAuthCache = null;
        clearTvAuthCacheFromStorage();
    };

    const setAuthStatus = (text: string): void => {
        state.authStatusMessage = text;
        if (authStatus) {
            authStatus.textContent = text;
        }
    };

    const stopAuthPolling = (): void => {
        if (state.authPollTimer !== null) {
            window.clearInterval(state.authPollTimer);
            state.authPollTimer = null;
        }
    };

    const renderAuthUi = (): void => {
        renderAuthUiView(
            {
                appMode: state.appMode,
                authPending: state.authPending,
                authStatusMessage: state.authStatusMessage,
                authPanelState: state.authPanelState
            },
            {
                authToggleButton,
                authStatus,
                authPanel,
                authPanelCode,
                authPanelUrl
            }
        );
    };

    const renderModeTabs = (): void => {
        renderModeTabsView({
            appMode: state.appMode,
            elements: {
                feedTab,
                subscriptionsTab,
                favoritesTab
            },
            getActiveView: dependencies.getActiveView,
            setActiveView: dependencies.setActiveView
        });
    };

    const setAppMode = async (mode: AppMode): Promise<void> => {
        state.appMode = mode;
        renderModeTabs();
        renderAuthUi();
        dependencies.renderFeed();
        dependencies.renderSubscriptions();

        if (mode === "logged_in") {
            await Promise.all([dependencies.refreshFeed(), dependencies.refreshSubscriptions()]);
            return;
        }

        await dependencies.refreshFeed();
    };

    const refreshTvAccessToken = (): Promise<string> => {
        return refreshTvAccessTokenByRefreshToken(state.tvAuthCache, persistTvAuthCacheToStorage);
    };

    const getValidTvAccessToken = (): Promise<string> => {
        return getValidTvAccessTokenOrRefresh(state.tvAuthCache, persistTvAuthCacheToStorage);
    };

    const startTvLoginFlow = async (): Promise<void> => {
        if (state.authPending) {
            return;
        }

        state.authPending = true;
        state.authPanelState = null;
        stopAuthPolling();
        setAuthStatus("Starting login...");
        renderAuthUi();

        try {
            const clientIdentity = resolveTvOAuthClientIdentity(state.tvAuthCache);
            const requested = await requestTvDeviceCode(clientIdentity);
            const activeIdentity = requested.identity;
            const deviceCode = requested.deviceCode;
            const expiresAt = Date.now() + deviceCode.expires_in * 1000;

            state.authPanelState = deviceCode;
            setAuthStatus("");
            renderAuthUi();

            state.authPollTimer = window.setInterval(async () => {
                if (state.authSyncInProgress) {
                    return;
                }

                if (Date.now() >= expiresAt) {
                    stopAuthPolling();
                    state.authPending = false;
                    state.authPanelState = null;
                    setAuthStatus("Login code expired. Please try again.");
                    renderAuthUi();
                    return;
                }

                state.authSyncInProgress = true;
                try {
                    const tokens = await exchangeTvDeviceCode(activeIdentity, deviceCode.device_code);
                    if (!tokens) {
                        return;
                    }

                    stopAuthPolling();
                    state.tvAuthCache = {
                        client: activeIdentity,
                        tokens
                    };
                    persistTvAuthCacheToStorage();
                    state.authPanelState = null;
                    state.authPending = false;
                    setAuthStatus("");
                    renderAuthUi();
                    await setAppMode("logged_in");
                } catch (error) {
                    stopAuthPolling();
                    state.authPending = false;
                    state.authPanelState = null;
                    setAuthStatus(`Login failed: ${error instanceof Error ? error.message : String(error)}`);
                    renderAuthUi();
                } finally {
                    state.authSyncInProgress = false;
                }
            }, Math.max(1, deviceCode.interval) * 1000);
        } catch (error) {
            state.authPending = false;
            state.authPanelState = null;
            setAuthStatus(`Login failed: ${error instanceof Error ? error.message : String(error)}`);
            renderAuthUi();
        }
    };

    const logoutTvAuth = async (): Promise<void> => {
        stopAuthPolling();
        state.authPending = true;
        state.authPanelState = null;
        renderAuthUi();

        const accessToken = state.tvAuthCache?.tokens.accessToken || "";
        clearTvAuthCache();
        setAuthStatus("");

        await setAppMode("anonymous");

        if (accessToken) {
            void revokeTvAccessToken(accessToken);
        }

        state.authPending = false;
        renderAuthUi();
    };

    const initializeAuthState = async (): Promise<void> => {
        renderModeTabs();
        renderAuthUi();

        if (!state.tvAuthCache) {
            setAuthStatus("");
            await setAppMode("anonymous");
            return;
        }

        try {
            await getValidTvAccessToken();
            setAuthStatus("");
            await setAppMode("logged_in");
        } catch {
            clearTvAuthCache();
            setAuthStatus("");
            await setAppMode("anonymous");
        }

        renderAuthUi();
    };

    return {
        renderAuthUi,
        renderModeTabs,
        setAppMode,
        startTvLoginFlow,
        logoutTvAuth,
        initializeAuthState,
        refreshTvAccessToken,
        getValidTvAccessToken
    };
}
