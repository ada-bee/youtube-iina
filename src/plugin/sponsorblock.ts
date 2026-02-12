import { createPlaybackMonitor, type PlaybackSnapshot } from "./playbackMonitor";

const SPONSORBLOCK_API_BASE_URL = "https://sponsor.ajay.app";

const SPONSORBLOCK_ENABLED_PREF_KEY = "sponsorBlockEnabled";
const SPONSOR_SEGMENT_ACTION_PREF_KEY = "sponsorSegmentAction";
const SELF_PROMO_SEGMENT_ACTION_PREF_KEY = "selfPromoSegmentAction";
const PREVIEW_SEGMENT_ACTION_PREF_KEY = "previewSegmentAction";

const SEGMENT_CATEGORIES = ["sponsor", "selfpromo", "preview"] as const;

const DEFAULT_SPONSORBLOCK_ENABLED = false;
const DEFAULT_SEGMENT_ACTIONS: Record<SegmentCategory, SegmentAction> = {
    sponsor: "ask",
    selfpromo: "ignore",
    preview: "ignore"
};

const SEGMENT_FETCH_RETRY_MS = 12_000;
const OVERLAY_MESSAGE_NAME = "sponsorblock-skip-segment";
const REWIND_OVERLAY_DURATION_MS = 8_000;
const SEGMENT_QUERY_PARAMS = SEGMENT_CATEGORIES
    .map((category) => `category=${encodeURIComponent(category)}`)
    .join("&");

const CATEGORY_DISPLAY_NAME: Record<SegmentCategory, string> = {
    sponsor: "Sponsor",
    selfpromo: "Self Promotion",
    preview: "Preview"
};

const CATEGORY_BUTTON_CLASS_NAME: Record<SegmentCategory, string> = {
    sponsor: "skip-button--sponsor",
    selfpromo: "skip-button--selfpromo",
    preview: "skip-button--preview"
};

const REWIND_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" aria-hidden="true"><path d="M860-240 500-480l360-240v480Zm-400 0L100-480l360-240v480Zm-80-240Zm400 0Zm-400 90v-180l-136 90 136 90Zm400 0v-180l-136 90 136 90Z"/></svg>`;
const SKIP_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" aria-hidden="true"><path d="M100-240v-480l360 240-360 240Zm400 0v-480l360 240-360 240ZM180-480Zm400 0Zm-400 90 136-90-136-90v180Zm400 0 136-90-136-90v180Z"/></svg>`;

const SKIP_OVERLAY_STYLE = `
    .skip-overlay {
        position: fixed;
        right: 120px;
        bottom: 120px;
        z-index: 1000;
    }

    .skip-button {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 15px;
        font-weight: 700;
        line-height: 1.15;
        padding: 8px 16px;
        min-width: 170px;
        background: #ffffff;
        color: #000000;
        border: 1px solid rgba(0, 0, 0, 0.12);
        border-radius: 999px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
        cursor: pointer;
    }

    .skip-button-content {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
    }

    .skip-button-title {
        font-size: 15px;
        font-weight: 700;
        margin: 0;
    }

    .skip-button-subtitle {
        font-size: 11px;
        font-weight: 600;
        margin-top: 2px;
        opacity: 0.78;
    }

    .skip-button-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-left: 12px;
        color: rgba(0, 0, 0, 0.72);
    }

    .skip-button-icon svg {
        width: 44px;
        height: 44px;
        display: block;
        fill: currentColor;
    }

    .skip-button--sponsor {
        background: #b8f59d;
    }

    .skip-button--selfpromo {
        background: #ffe788;
    }

    .skip-button--preview {
        background: #9fdcff;
    }

    .skip-button:active {
        transform: scale(0.98);
    }
`;

type SegmentAction = "ignore" | "ask" | "skip";
type SegmentCategory = (typeof SEGMENT_CATEGORIES)[number];
type OverlayAction = "skip" | "rewind";

interface SponsorBlockSegment {
    uuid: string;
    startSeconds: number;
    endSeconds: number;
    category: SegmentCategory;
}

interface SponsorBlockApiSegment {
    segment?: unknown;
    UUID?: unknown;
    category?: unknown;
}

interface RewindOverlayOffer {
    segment: SponsorBlockSegment;
    expiresAt: number;
}

interface SponsorBlockControllerDependencies {
    console: {
        error: (...args: unknown[]) => void;
    };
    mpv: {
        getString: (name: string) => string;
        getNumber: (name: string) => number;
        getFlag: (name: string) => boolean;
        set: (name: string, value: number) => void;
    };
    http: {
        get: (url: string, options?: unknown) => Promise<{
            statusCode: number;
            reason?: string;
            text?: string;
        }>;
    };
    overlay: {
        simpleMode: () => void;
        setStyle: (style: string) => void;
        setContent: (content: string) => void;
        setClickable: (enabled: boolean) => void;
        show: () => void;
        hide: () => void;
        onMessage: (name: string, callback: () => void) => void;
    };
    preferences: {
        get: (key: string) => unknown;
    };
}

export interface SponsorBlockController {
    start: () => void;
    stop: () => void;
}

function toFiniteNumber(value: unknown): number | undefined {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return undefined;
    }

    return value;
}

function normalizeAction(value: unknown): SegmentAction {
    if (value === "ignore" || value === "ask" || value === "skip") {
        return value;
    }

    return "ignore";
}

function isSegmentCategory(value: unknown): value is SegmentCategory {
    return value === "sponsor" || value === "selfpromo" || value === "preview";
}

function getSegmentActionPreferenceKey(category: SegmentCategory): string {
    if (category === "sponsor") {
        return SPONSOR_SEGMENT_ACTION_PREF_KEY;
    }

    if (category === "selfpromo") {
        return SELF_PROMO_SEGMENT_ACTION_PREF_KEY;
    }

    return PREVIEW_SEGMENT_ACTION_PREF_KEY;
}

function isSponsorBlockEnabled(preferences: SponsorBlockControllerDependencies["preferences"]): boolean {
    const rawValue = preferences.get(SPONSORBLOCK_ENABLED_PREF_KEY);
    if (rawValue === undefined || rawValue === null) {
        return DEFAULT_SPONSORBLOCK_ENABLED;
    }

    return rawValue === true;
}

function getSegmentAction(
    preferences: SponsorBlockControllerDependencies["preferences"],
    category: SegmentCategory
): SegmentAction {
    const rawValue = preferences.get(getSegmentActionPreferenceKey(category));
    if (rawValue === undefined || rawValue === null || String(rawValue).trim() === "") {
        return DEFAULT_SEGMENT_ACTIONS[category];
    }

    return normalizeAction(rawValue);
}

function getSegmentActions(preferences: SponsorBlockControllerDependencies["preferences"]): Record<SegmentCategory, SegmentAction> {
    return {
        sponsor: getSegmentAction(preferences, "sponsor"),
        selfpromo: getSegmentAction(preferences, "selfpromo"),
        preview: getSegmentAction(preferences, "preview")
    };
}

function hasManagedSegmentTypes(actions: Record<SegmentCategory, SegmentAction>): boolean {
    return SEGMENT_CATEGORIES.some((category) => actions[category] !== "ignore");
}

function getSegmentKey(segment: SponsorBlockSegment): string {
    if (segment.uuid) {
        return `${segment.category}:${segment.uuid}`;
    }

    return `${segment.category}:${segment.startSeconds.toFixed(3)}-${segment.endSeconds.toFixed(3)}`;
}

function isSegmentActive(segment: SponsorBlockSegment, positionSeconds: number): boolean {
    return positionSeconds >= segment.startSeconds && positionSeconds < segment.endSeconds;
}

function findActiveManagedSegment(
    segments: SponsorBlockSegment[],
    positionSeconds: number,
    actions: Record<SegmentCategory, SegmentAction>
): SponsorBlockSegment | undefined {
    return segments.find((segment) => {
        return actions[segment.category] !== "ignore" && isSegmentActive(segment, positionSeconds);
    });
}

function normalizeSponsorBlockSegment(value: unknown): SponsorBlockSegment | undefined {
    const source = value as SponsorBlockApiSegment;
    if (!isSegmentCategory(source?.category)) {
        return undefined;
    }

    if (!Array.isArray(source.segment) || source.segment.length < 2) {
        return undefined;
    }

    const startSeconds = toFiniteNumber(source.segment[0]);
    const endSeconds = toFiniteNumber(source.segment[1]);
    if (startSeconds === undefined || endSeconds === undefined || endSeconds <= startSeconds) {
        return undefined;
    }

    return {
        uuid: typeof source.UUID === "string" ? source.UUID : "",
        startSeconds,
        endSeconds,
        category: source.category
    };
}

function renderOverlayButton(segment: SponsorBlockSegment, action: OverlayAction): string {
    const buttonClassName = CATEGORY_BUTTON_CLASS_NAME[segment.category];
    const subtitle = CATEGORY_DISPLAY_NAME[segment.category];
    const title = action === "rewind" ? "Rewind" : "Skip Segment";
    const icon = action === "rewind" ? REWIND_ICON_SVG : SKIP_ICON_SVG;

    return `
        <div class="skip-overlay">
            <button class="skip-button ${buttonClassName}" data-clickable onclick="iina.postMessage('${OVERLAY_MESSAGE_NAME}')" type="button">
                <span class="skip-button-content">
                    <span class="skip-button-title">${title}</span>
                    <span class="skip-button-subtitle">${subtitle}</span>
                </span>
                <span class="skip-button-icon">${icon}</span>
            </button>
        </div>
    `;
}

export function createSponsorBlockController(dependencies: SponsorBlockControllerDependencies): SponsorBlockController {
    let isStarted = false;
    let overlayInitialized = false;
    let overlayVisible = false;
    let overlaySegmentKey = "";
    let overlayAction: OverlayAction | undefined;

    let sponsorBlockEnabled = DEFAULT_SPONSORBLOCK_ENABLED;
    let segmentActions = { ...DEFAULT_SEGMENT_ACTIONS };
    let lastSettingsRefreshAt = 0;

    let currentVideoId = "";
    let currentSegments: SponsorBlockSegment[] = [];
    let activeAskSegment: SponsorBlockSegment | undefined;
    let rewindOverlayOffer: RewindOverlayOffer | undefined;

    let isFetchInFlight = false;
    let nextFetchAttemptAt = 0;
    let lastFetchVideoId = "";
    const autoSkippedSegmentKeys = new Set<string>();

    const hideOverlay = (): void => {
        activeAskSegment = undefined;
        if (!overlayVisible) {
            overlayAction = undefined;
            return;
        }

        dependencies.overlay.hide();
        dependencies.overlay.setClickable(false);
        overlayVisible = false;
        overlaySegmentKey = "";
        overlayAction = undefined;
    };

    const clearRewindOverlayOffer = (): void => {
        rewindOverlayOffer = undefined;
    };

    const showOverlay = (segment: SponsorBlockSegment, action: OverlayAction): void => {
        const segmentKey = getSegmentKey(segment);
        const content = renderOverlayButton(segment, action);
        const needsContentRefresh = !overlayVisible || overlaySegmentKey !== segmentKey || overlayAction !== action;

        dependencies.overlay.simpleMode();
        dependencies.overlay.setStyle(SKIP_OVERLAY_STYLE);
        if (needsContentRefresh) {
            dependencies.overlay.setContent(content);
            overlaySegmentKey = segmentKey;
            overlayAction = action;
        }

        if (!overlayVisible) {
            dependencies.overlay.setClickable(true);
            dependencies.overlay.show();
            overlayVisible = true;
        }

        if (!overlayInitialized) {
            dependencies.overlay.onMessage(OVERLAY_MESSAGE_NAME, () => {
                if (overlayAction === "rewind") {
                    const rewindSegment = rewindOverlayOffer?.segment;
                    if (!rewindSegment) {
                        return;
                    }

                    dependencies.mpv.set("time-pos", Math.max(0, rewindSegment.startSeconds));
                    clearRewindOverlayOffer();
                    hideOverlay();
                    return;
                }

                if (!activeAskSegment || overlayAction !== "skip") {
                    return;
                }

                const target = Math.max(0, activeAskSegment.endSeconds + 0.25);
                dependencies.mpv.set("time-pos", target);
                hideOverlay();
            });
            overlayInitialized = true;
        }
    };

    const refreshSettings = (): void => {
        const now = Date.now();
        if (now - lastSettingsRefreshAt < 1000) {
            return;
        }

        lastSettingsRefreshAt = now;
        sponsorBlockEnabled = isSponsorBlockEnabled(dependencies.preferences);
        segmentActions = getSegmentActions(dependencies.preferences);

        if (!sponsorBlockEnabled || !hasManagedSegmentTypes(segmentActions)) {
            clearRewindOverlayOffer();
            hideOverlay();
            return;
        }

        if (activeAskSegment && segmentActions[activeAskSegment.category] !== "ask") {
            hideOverlay();
        }
    };

    const resetVideoState = (nextVideoId: string): void => {
        currentVideoId = nextVideoId;
        currentSegments = [];
        activeAskSegment = undefined;
        clearRewindOverlayOffer();
        lastFetchVideoId = "";
        nextFetchAttemptAt = 0;
        autoSkippedSegmentKeys.clear();
        hideOverlay();
    };

    const fetchSegmentsForVideo = async (videoId: string): Promise<void> => {
        if (!videoId || isFetchInFlight) {
            return;
        }

        const now = Date.now();
        if (now < nextFetchAttemptAt) {
            return;
        }

        isFetchInFlight = true;
        const url = `${SPONSORBLOCK_API_BASE_URL}/api/skipSegments?videoID=${encodeURIComponent(videoId)}&${SEGMENT_QUERY_PARAMS}&service=YouTube`;
        try {
            const response = await dependencies.http.get(url, {
                headers: {
                    Accept: "application/json"
                },
                params: {},
                data: ""
            });

            if (response.statusCode === 404) {
                if (currentVideoId === videoId) {
                    currentSegments = [];
                }
                lastFetchVideoId = videoId;
                nextFetchAttemptAt = 0;
                return;
            }

            if (response.statusCode < 200 || response.statusCode >= 300) {
                throw new Error(`HTTP ${response.statusCode} ${response.reason || ""}`.trim());
            }

            const rawText = typeof response.text === "string" ? response.text : "[]";
            const rawPayload = JSON.parse(rawText);
            const rawSegments = Array.isArray(rawPayload) ? rawPayload : [];

            const segments = rawSegments
                .map((segment) => normalizeSponsorBlockSegment(segment))
                .filter((segment): segment is SponsorBlockSegment => Boolean(segment))
                .sort((left, right) => left.startSeconds - right.startSeconds);

            if (currentVideoId === videoId) {
                currentSegments = segments;
            }

            lastFetchVideoId = videoId;
            nextFetchAttemptAt = 0;
        } catch (error) {
            dependencies.console.error(
                `YouTube: SponsorBlock fetch failed for ${videoId}: ${error instanceof Error ? error.message : String(error)}`
            );
            if (currentVideoId === videoId) {
                currentSegments = [];
            }
            lastFetchVideoId = "";
            nextFetchAttemptAt = Date.now() + SEGMENT_FETCH_RETRY_MS;
        } finally {
            isFetchInFlight = false;
        }
    };

    const shouldLoadSegments = (): boolean => {
        return sponsorBlockEnabled && hasManagedSegmentTypes(segmentActions);
    };

    const maybeAutoSkip = (activeSegment: SponsorBlockSegment): boolean => {
        const segmentKey = getSegmentKey(activeSegment);
        if (autoSkippedSegmentKeys.has(segmentKey)) {
            return false;
        }

        autoSkippedSegmentKeys.add(segmentKey);
        const target = Math.max(0, activeSegment.endSeconds + 0.25);
        dependencies.mpv.set("time-pos", target);
        return true;
    };

    const showRewindOffer = (segment: SponsorBlockSegment): void => {
        rewindOverlayOffer = {
            segment,
            expiresAt: Date.now() + REWIND_OVERLAY_DURATION_MS
        };
        showOverlay(segment, "rewind");
    };

    const updateRewindOfferVisibility = (): boolean => {
        if (!rewindOverlayOffer) {
            return false;
        }

        if (Date.now() >= rewindOverlayOffer.expiresAt) {
            clearRewindOverlayOffer();
            if (overlayAction === "rewind") {
                hideOverlay();
            }
            return false;
        }

        showOverlay(rewindOverlayOffer.segment, "rewind");
        return true;
    };

    const handleVideoChange = (snapshot: PlaybackSnapshot): void => {
        refreshSettings();
        const videoId = snapshot.videoId || "";
        if (videoId === currentVideoId) {
            return;
        }

        resetVideoState(videoId);
        if (!videoId || !shouldLoadSegments()) {
            return;
        }

        void fetchSegmentsForVideo(videoId);
    };

    const handleTick = (snapshot: PlaybackSnapshot): void => {
        refreshSettings();

        if (!sponsorBlockEnabled) {
            return;
        }

        const videoId = snapshot.videoId || "";
        if (!videoId) {
            resetVideoState("");
            return;
        }

        if (videoId !== currentVideoId) {
            resetVideoState(videoId);
        }

        if (!shouldLoadSegments()) {
            clearRewindOverlayOffer();
            hideOverlay();
            return;
        }

        if (lastFetchVideoId !== videoId && !isFetchInFlight) {
            void fetchSegmentsForVideo(videoId);
        }

        const positionSeconds = snapshot.positionSeconds;
        if (positionSeconds === undefined) {
            hideOverlay();
            return;
        }

        const activeSegment = findActiveManagedSegment(currentSegments, positionSeconds, segmentActions);
        if (!activeSegment) {
            if (!updateRewindOfferVisibility()) {
                hideOverlay();
            }
            return;
        }

        const segmentAction = segmentActions[activeSegment.category];
        if (segmentAction === "ask") {
            activeAskSegment = activeSegment;
            showOverlay(activeSegment, "skip");
            return;
        }

        if (segmentAction === "skip") {
            const didAutoSkip = maybeAutoSkip(activeSegment);
            if (didAutoSkip) {
                showRewindOffer(activeSegment);
                return;
            }
        }

        if (!updateRewindOfferVisibility()) {
            hideOverlay();
        }
    };

    const monitor = createPlaybackMonitor({
        mpv: dependencies.mpv,
        intervalMs: 350,
        onVideoChange: handleVideoChange,
        onTick: handleTick
    });

    const start = (): void => {
        if (isStarted) {
            return;
        }

        isStarted = true;
        refreshSettings();
        monitor.start();
    };

    const stop = (): void => {
        if (!isStarted) {
            return;
        }

        isStarted = false;
        monitor.stop();
        resetVideoState("");
    };

    return {
        start,
        stop
    };
}
