import { CONNECTOR_TYPES } from '../../cli/seed-data/reference';

export interface ConnectorTypeRef {
  code: string;
  nameEn?: string;
  aliases: readonly string[];
  supportsAc: boolean;
  supportsDc: boolean;
}

export function normalizeConnectorName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Maps provider connector names (e.g. Open Charge Map "CCS (Type 2)") to
 * connector_types.code using the reference aliases. Unknown names map to
 * null so the importer can flag them for review instead of guessing.
 * Build it from the connector_types table (admin-editable aliases) when
 * possible; `default()` uses the seeded reference data.
 */
export class ConnectorTypeIndex {
  private readonly byName = new Map<string, ConnectorTypeRef>();
  private readonly byCode = new Map<string, ConnectorTypeRef>();

  constructor(types: readonly ConnectorTypeRef[]) {
    for (const t of types) {
      this.byCode.set(t.code, t);
      for (const name of [t.code, t.nameEn ?? '', ...t.aliases]) {
        if (name) this.byName.set(normalizeConnectorName(name), t);
      }
    }
  }

  static default(): ConnectorTypeIndex {
    return new ConnectorTypeIndex(
      CONNECTOR_TYPES.map((c) => ({
        code: c.code,
        nameEn: c.nameEn,
        aliases: c.aliases,
        supportsAc: c.supportsAc,
        supportsDc: c.supportsDc,
      })),
    );
  }

  resolve(name: string | null | undefined): ConnectorTypeRef | null {
    if (!name) return null;
    return this.byName.get(normalizeConnectorName(name)) ?? null;
  }

  get(code: string): ConnectorTypeRef | null {
    return this.byCode.get(code) ?? null;
  }
}
