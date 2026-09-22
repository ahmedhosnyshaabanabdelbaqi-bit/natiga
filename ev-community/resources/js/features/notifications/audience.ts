/** Audience params as stored on a campaign, turned into form strings (member numbers one per line). */
export function audienceParamsToStrings(
    params: Record<string, unknown> | undefined,
): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [name, value] of Object.entries(params ?? {})) {
        if (Array.isArray(value)) {
            out[name] = value
                .filter(
                    (v): v is string | number =>
                        typeof v === 'string' || typeof v === 'number',
                )
                .map(String)
                .join('\n');
        } else if (
            typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'boolean'
        ) {
            out[name] = String(value);
        }
    }
    return out;
}
