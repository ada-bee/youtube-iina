import type { JsonObject } from "../types";

export function asObject(value: unknown): JsonObject | null {
    if (!value || typeof value !== "object") {
        return null;
    }
    return value as JsonObject;
}

export function asString(value: unknown): string {
    return typeof value === "string" ? value : "";
}

export function asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}
