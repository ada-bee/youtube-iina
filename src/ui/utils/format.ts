export function normalizePositiveInteger(value: unknown): number | undefined {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return undefined;
    }

    return Math.floor(numeric);
}

export function normalizeLikeCountText(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
        return "";
    }

    if (/likes?/i.test(trimmed)) {
        return trimmed;
    }

    if (/^[0-9][0-9.,\sKMkmB]+$/.test(trimmed)) {
        return `${trimmed} likes`;
    }

    return "";
}

export function normalizeViewCountText(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
        return "";
    }

    if (/views?/i.test(trimmed)) {
        return trimmed;
    }

    if (/^[0-9][0-9.,\sKMkmB]+$/.test(trimmed)) {
        return `${trimmed} views`;
    }

    return "";
}

export function formatCompactCount(value: number): string {
    const absValue = Math.abs(value);
    if (absValue < 1000) {
        return `${Math.round(value)}`;
    }

    const units = [
        { value: 1_000_000_000, suffix: "B" },
        { value: 1_000_000, suffix: "M" },
        { value: 1_000, suffix: "K" }
    ];

    for (const unit of units) {
        if (absValue >= unit.value) {
            const compact = value / unit.value;
            const rounded = compact >= 100 ? Math.round(compact) : Math.round(compact * 10) / 10;
            const integerLike = Math.abs(rounded - Math.trunc(rounded)) < 0.001;
            return `${integerLike ? Math.trunc(rounded) : rounded}${unit.suffix}`;
        }
    }

    return `${Math.round(value)}`;
}

export function formatHumanReadableViews(rawValue: string): string {
    const normalized = normalizeViewCountText(rawValue);
    if (!normalized) {
        return "";
    }

    const compactMatch = normalized.match(/([0-9]+(?:[.,][0-9]+)?)\s*([KMB])\s*views?/i);
    if (compactMatch?.[1] && compactMatch[2]) {
        const compactBase = Number.parseFloat(compactMatch[1].replace(",", "."));
        if (!Number.isFinite(compactBase)) {
            return normalized;
        }

        const suffix = compactMatch[2].toUpperCase();
        const multiplier = suffix === "B"
            ? 1_000_000_000
            : suffix === "M"
                ? 1_000_000
                : 1_000;
        const compact = formatCompactCount(compactBase * multiplier);
        return `${compact} views`;
    }

    const numberMatch = normalized.match(/([0-9][0-9.,\s]*)(?=\s*views?\b)/i);
    if (!numberMatch?.[1]) {
        return normalized;
    }

    const integerPart = numberMatch[1].replace(/[\s.,]/g, "");
    const parsedNumber = Number.parseInt(integerPart, 10);
    if (!Number.isFinite(parsedNumber)) {
        return normalized;
    }

    const compact = formatCompactCount(parsedNumber);
    return `${compact} views`;
}
