import { Logger } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import { ConnectorTypeIndex } from './connector-type-index';
import type { StationSource, StationSourceKey } from './station-source.types';

const INDEX_TTL_MS = 5 * 60_000;

/**
 * All station sources by key (inject with STATION_SOURCES). The stations
 * module uses `get('ocm')` for syncs and `list()` for the admin screen.
 */
export class StationSourceRegistry {
  private readonly sources = new Map<string, StationSource>();

  constructor(sources: StationSource[]) {
    for (const s of sources) this.sources.set(s.key, s);
  }

  list(): StationSource[] {
    return [...this.sources.values()];
  }

  get(key: StationSourceKey): StationSource | undefined {
    return this.sources.get(key);
  }

  syncable(): StationSource[] {
    return this.list().filter((s) => s.supportsSync);
  }
}

/**
 * Loads connector types (with admin-editable aliases) from the database,
 * cached for 5 minutes; falls back to the seeded reference aliases when the
 * table cannot be read.
 */
export function connectorTypeIndexLoader(prisma: PrismaService): () => Promise<ConnectorTypeIndex> {
  const logger = new Logger('ConnectorTypeIndex');
  let cached: { index: ConnectorTypeIndex; at: number } | undefined;
  return async () => {
    if (cached && Date.now() - cached.at < INDEX_TTL_MS) return cached.index;
    try {
      const rows = await prisma.connectorType.findMany({
        where: { isActive: true },
        select: { code: true, nameEn: true, aliases: true, supportsAc: true, supportsDc: true },
      });
      const index = rows.length > 0 ? new ConnectorTypeIndex(rows) : ConnectorTypeIndex.default();
      cached = { index, at: Date.now() };
      return index;
    } catch (err) {
      logger.warn(`Using reference connector aliases: ${(err as Error).message}`);
      return ConnectorTypeIndex.default();
    }
  };
}
