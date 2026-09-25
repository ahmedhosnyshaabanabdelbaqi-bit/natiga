/**
 * Station ↔ vehicle compatibility (REQUIREMENTS §11):
 * - only structured, source-backed inlet data of the trim IN the market is
 *   used (variant_market_inlets), and only with reliability `verified` or
 *   `manufacturer_claim`;
 * - a connector is compatible only when an inlet has the same connector type
 *   code AND the same current (AC/DC) — a similar-looking plug is not proof,
 *   and adapters are never assumed or recommended;
 * - usable power = min(connector max, inlet max), null when either is unknown.
 */
export const USABLE_INLET_RELIABILITIES = ['verified', 'manufacturer_claim'] as const;

export interface InletLike {
  connectorTypeCode: string;
  currentType: 'AC' | 'DC';
  maxPowerKw: number | null;
  reliability: string;
}

export interface ConnectorLike {
  connectorTypeCode: string;
  currentType: 'AC' | 'DC';
  maxPowerKw: number | null;
}

export interface ConnectorCompatibility {
  compatible: boolean;
  maxUsablePowerKw: number | null;
}

export function isUsableInlet(inlet: Pick<InletLike, 'reliability'>): boolean {
  return (USABLE_INLET_RELIABILITIES as readonly string[]).includes(inlet.reliability);
}

export function usableInlets<T extends InletLike>(inlets: readonly T[]): T[] {
  return inlets.filter(isUsableInlet);
}

export function matchingInlet<T extends InletLike>(
  connector: ConnectorLike,
  inlets: readonly T[],
): T | undefined {
  return inlets.find(
    (i) =>
      isUsableInlet(i) &&
      i.connectorTypeCode === connector.connectorTypeCode &&
      i.currentType === connector.currentType,
  );
}

export function connectorCompatibility(
  connector: ConnectorLike,
  inlets: readonly InletLike[],
): ConnectorCompatibility {
  const inlet = matchingInlet(connector, inlets);
  if (!inlet) return { compatible: false, maxUsablePowerKw: null };
  const a = connector.maxPowerKw;
  const b = inlet.maxPowerKw;
  return {
    compatible: true,
    maxUsablePowerKw: a !== null && b !== null ? Math.min(a, b) : null,
  };
}

/** (code, current) pairs of usable inlets, for SQL filtering. */
export function inletPairs(inlets: readonly InletLike[]): { code: string; current: 'AC' | 'DC' }[] {
  const seen = new Set<string>();
  const out: { code: string; current: 'AC' | 'DC' }[] = [];
  for (const i of usableInlets(inlets)) {
    const key = `${i.connectorTypeCode}|${i.currentType}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ code: i.connectorTypeCode, current: i.currentType });
  }
  return out;
}
