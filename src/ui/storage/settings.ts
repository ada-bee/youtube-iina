import { UI_SETTINGS_SCHEMA_VERSION, UI_SETTINGS_STORAGE_KEY } from "../constants";
import type { UiFeatureFlags, UiSettings } from "../types";
import { asObject } from "../utils/json";

const DEFAULT_FEATURE_FLAGS: UiFeatureFlags = {
    enableSponsorBlock: false,
    enableWatchStatusSyncSignedIn: true,
    enableWatchStatusLocalAnonymous: true,
    includeLivestreams: false
};

const DEFAULT_UI_SETTINGS: UiSettings = {
    schemaVersion: UI_SETTINGS_SCHEMA_VERSION,
    featureFlags: { ...DEFAULT_FEATURE_FLAGS }
};

function sanitizeFeatureFlags(value: unknown): UiFeatureFlags {
    const candidate = asObject(value);
    return {
        enableSponsorBlock: candidate?.enableSponsorBlock === true,
        enableWatchStatusSyncSignedIn: candidate?.enableWatchStatusSyncSignedIn !== false,
        enableWatchStatusLocalAnonymous: candidate?.enableWatchStatusLocalAnonymous !== false,
        includeLivestreams: candidate?.includeLivestreams === true
    };
}

function normalizeUiSettings(value: unknown): UiSettings {
    const candidate = asObject(value);
    const nestedFeatureFlags = asObject(candidate?.featureFlags);
    const featureFlagsSource = nestedFeatureFlags || candidate;

    return {
        schemaVersion: UI_SETTINGS_SCHEMA_VERSION,
        featureFlags: sanitizeFeatureFlags(featureFlagsSource)
    };
}

export function getDefaultUiSettings(): UiSettings {
    return {
        schemaVersion: DEFAULT_UI_SETTINGS.schemaVersion,
        featureFlags: { ...DEFAULT_UI_SETTINGS.featureFlags }
    };
}

export function loadUiSettingsFromStorage(): UiSettings {
    try {
        const raw = localStorage.getItem(UI_SETTINGS_STORAGE_KEY);
        if (!raw) {
            return getDefaultUiSettings();
        }

        const parsed = JSON.parse(raw);
        const normalized = normalizeUiSettings(parsed);
        const parsedObject = asObject(parsed);
        const parsedSchemaVersion = Number(parsedObject?.schemaVersion);
        const requiresMigration = !Number.isFinite(parsedSchemaVersion) || parsedSchemaVersion < UI_SETTINGS_SCHEMA_VERSION;
        if (requiresMigration || JSON.stringify(parsed) !== JSON.stringify(normalized)) {
            persistUiSettingsToStorage(normalized);
        }

        return normalized;
    } catch {
        return getDefaultUiSettings();
    }
}

export function persistUiSettingsToStorage(uiSettings: UiSettings): boolean {
    try {
        const normalized = normalizeUiSettings(uiSettings);
        localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
        return true;
    } catch {
        return false;
    }
}
