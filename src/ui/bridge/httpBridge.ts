import type { HttpRequestPayload, HttpResponsePayload } from "../../shared/messages";

import { MESSAGE_NAMES } from "../../shared/messages";
import { HTTP_TIMEOUT_MS } from "../constants";

type PendingHttpRequest = {
    resolve: (payload: HttpResponsePayload) => void;
    timeoutId: number;
};

let iinaApi: typeof iina | undefined = (globalThis as { iina?: typeof iina }).iina;
const pendingHttpRequests = new Map<string, PendingHttpRequest>();
let nextHttpRequestId = 1;
let isHttpBridgeListenerBound = false;

export function setHttpBridgeApi(nextApi: typeof iina | undefined): void {
    iinaApi = nextApi;
}

export function ensureHttpBridgeListener(): void {
    if (isHttpBridgeListenerBound) {
        return;
    }

    if (!iinaApi || typeof iinaApi.onMessage !== "function") {
        return;
    }

    iinaApi.onMessage(MESSAGE_NAMES.HttpResponse, (payload: HttpResponsePayload) => {
        if (!payload || typeof payload.id !== "string") {
            return;
        }

        const pendingRequest = pendingHttpRequests.get(payload.id);
        if (!pendingRequest) {
            return;
        }

        pendingHttpRequests.delete(payload.id);
        clearTimeout(pendingRequest.timeoutId);
        pendingRequest.resolve(payload);
    });

    isHttpBridgeListenerBound = true;
}

export function sendHttpRequest(
    request: Omit<HttpRequestPayload, "id">,
    timeoutMs: number = HTTP_TIMEOUT_MS
): Promise<HttpResponsePayload> {
    const activeApi = iinaApi;
    if (!activeApi || typeof activeApi.postMessage !== "function") {
        return Promise.reject(new Error("IINA message bridge is unavailable in this context."));
    }

    const requestId = `http-${Date.now()}-${nextHttpRequestId}`;
    nextHttpRequestId += 1;

    return new Promise<HttpResponsePayload>((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
            pendingHttpRequests.delete(requestId);
            reject(new Error(`Request timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        pendingHttpRequests.set(requestId, { resolve, timeoutId });

        try {
            activeApi.postMessage(MESSAGE_NAMES.HttpRequest, {
                id: requestId,
                ...request
            });
        } catch (error) {
            pendingHttpRequests.delete(requestId);
            clearTimeout(timeoutId);
            reject(error instanceof Error ? error : new Error(String(error)));
        }
    });
}
