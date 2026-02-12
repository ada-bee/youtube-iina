import type {
    PlaybackLifecycleEventPayload,
    SettingsSyncPayload
} from "../../shared/messages";

import { MESSAGE_NAMES } from "../../shared/messages";

interface HookControllerDependencies {
    iinaApi: typeof iina | undefined;
    onSettingsSync?: (payload: SettingsSyncPayload) => void;
    onPlaybackLifecycleEvent?: (payload: PlaybackLifecycleEventPayload) => void;
}

export interface HookController {
    bind: () => void;
    requestSettingsSync: () => void;
}

function shouldBindHooks(iinaApi: typeof iina | undefined): iinaApi is typeof iina {
    return !!iinaApi
        && typeof iinaApi.onMessage === "function"
        && typeof iinaApi.postMessage === "function";
}

function makeRequestId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

export function createHookController(dependencies: HookControllerDependencies): HookController {
    let isBound = false;

    const bind = (): void => {
        if (isBound) {
            return;
        }

        if (!shouldBindHooks(dependencies.iinaApi)) {
            return;
        }

        dependencies.iinaApi.onMessage(MESSAGE_NAMES.SettingsSync, (payload: SettingsSyncPayload) => {
            dependencies.onSettingsSync?.(payload);
        });

        dependencies.iinaApi.onMessage(MESSAGE_NAMES.PlaybackLifecycleEvent, (payload: PlaybackLifecycleEventPayload) => {
            dependencies.onPlaybackLifecycleEvent?.(payload);
        });

        isBound = true;
    };

    const requestSettingsSync = (): void => {
        if (!shouldBindHooks(dependencies.iinaApi)) {
            return;
        }

        dependencies.iinaApi.postMessage(MESSAGE_NAMES.RequestSettingsSync, {
            requestId: makeRequestId("settings-sync")
        });
    };

    return {
        bind,
        requestSettingsSync
    };
}
