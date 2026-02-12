import type { InnertubeCommand } from "../types";
import { asArray, asObject, asString } from "../utils/json";

interface ChannelSubscriptionParseAccumulator {
    subscribedFlags: boolean[];
    subscribeCommands: InnertubeCommand[];
    unsubscribeCommands: InnertubeCommand[];
}

function commandMatchesTargetChannel(command: InnertubeCommand, targetChannelId?: string): boolean {
    const normalizedTarget = (targetChannelId || "").trim();
    if (!normalizedTarget) {
        return true;
    }

    const channelIdsRaw = command.payload.channelIds;
    const channelIds = Array.isArray(channelIdsRaw)
        ? channelIdsRaw.map((entry) => asString(entry).trim()).filter(Boolean)
        : [];

    if (channelIds.length === 0) {
        return true;
    }

    return channelIds.includes(normalizedTarget);
}

function selectBestCommand(commands: InnertubeCommand[], targetChannelId?: string): InnertubeCommand | undefined {
    for (const command of commands) {
        if (commandMatchesTargetChannel(command, targetChannelId)) {
            return command;
        }
    }

    return commands[0];
}

export function normalizeInnertubeApiPath(rawPath: string): string {
    let normalized = rawPath.trim();
    if (!normalized) {
        return "";
    }

    normalized = normalized.replace(/^https?:\/\/[^/]+/i, "");
    normalized = normalized.replace(/^\/+youtubei\/v1\//, "");
    normalized = normalized.replace(/^youtubei\/v1\//, "");
    normalized = normalized.replace(/^\/+/, "");
    return normalized;
}

function parseInnertubeCommandFromEndpoint(
    endpoint: unknown,
    fallbackApiPath: string,
    targetChannelId?: string
): InnertubeCommand | null {
    const endpointObject = asObject(endpoint);
    if (!endpointObject) {
        return null;
    }

    const commandMetadata = asObject(endpointObject.commandMetadata);
    const webCommandMetadata = asObject(commandMetadata?.webCommandMetadata);
    const endpointApiPath = asString(webCommandMetadata?.apiUrl).trim();
    const apiPath = normalizeInnertubeApiPath(endpointApiPath || fallbackApiPath);
    if (!apiPath) {
        return null;
    }

    const payload: Record<string, unknown> = {};
    const channelIds = asArray(endpointObject.channelIds)
        .map((entry) => asString(entry).trim())
        .filter(Boolean);
    const singleChannelId = asString(endpointObject.channelId).trim();
    if (channelIds.length > 0) {
        payload.channelIds = channelIds;
    } else if (singleChannelId) {
        payload.channelIds = [singleChannelId];
    } else if (targetChannelId?.trim()) {
        payload.channelIds = [targetChannelId.trim()];
    }

    const params = asString(endpointObject.params).trim();
    if (params) {
        payload.params = params;
    }

    const siloName = asString(endpointObject.siloName).trim();
    if (siloName) {
        payload.siloName = siloName;
    }

    const clientFeature = asString(endpointObject.clientFeature).trim();
    if (clientFeature) {
        payload.clientFeature = clientFeature;
    }

    const botguardResponse = asString(endpointObject.botguardResponse).trim();
    if (botguardResponse) {
        payload.botguardResponse = botguardResponse;
    }

    return {
        apiPath,
        payload
    };
}

function collectChannelSubscriptionDetails(
    node: unknown,
    accumulator: ChannelSubscriptionParseAccumulator,
    targetChannelId?: string
): void {
    const objectNode = asObject(node);
    if (!objectNode) {
        return;
    }

    if (typeof objectNode.subscribed === "boolean") {
        accumulator.subscribedFlags.push(objectNode.subscribed);
    }

    const subscribeCommand = parseInnertubeCommandFromEndpoint(
        objectNode.subscribeEndpoint,
        "subscription/subscribe",
        targetChannelId
    );
    if (subscribeCommand) {
        accumulator.subscribeCommands.push(subscribeCommand);
    }

    const unsubscribeCommand = parseInnertubeCommandFromEndpoint(
        objectNode.unsubscribeEndpoint,
        "subscription/unsubscribe",
        targetChannelId
    );
    if (unsubscribeCommand) {
        accumulator.unsubscribeCommands.push(unsubscribeCommand);
    }

    Object.values(objectNode).forEach((value) => {
        if (Array.isArray(value)) {
            value.forEach((entry) => {
                collectChannelSubscriptionDetails(entry, accumulator, targetChannelId);
            });
            return;
        }

        if (value && typeof value === "object") {
            collectChannelSubscriptionDetails(value, accumulator, targetChannelId);
        }
    });
}

export function parseChannelSubscriptionDetails(
    node: unknown,
    targetChannelId?: string
): {
    isSubscribed: boolean | null;
    subscribeCommand?: InnertubeCommand;
    unsubscribeCommand?: InnertubeCommand;
} {
    const accumulator: ChannelSubscriptionParseAccumulator = {
        subscribedFlags: [],
        subscribeCommands: [],
        unsubscribeCommands: []
    };

    collectChannelSubscriptionDetails(node, accumulator, targetChannelId);

    const subscribeCommand = selectBestCommand(accumulator.subscribeCommands, targetChannelId);
    const unsubscribeCommand = selectBestCommand(accumulator.unsubscribeCommands, targetChannelId);

    let isSubscribed: boolean | null = null;
    if (accumulator.subscribedFlags.length > 0) {
        isSubscribed = accumulator.subscribedFlags[accumulator.subscribedFlags.length - 1];
    } else if (unsubscribeCommand && !subscribeCommand) {
        isSubscribed = true;
    } else if (subscribeCommand && !unsubscribeCommand) {
        isSubscribed = false;
    }

    return {
        isSubscribed,
        subscribeCommand,
        unsubscribeCommand
    };
}
