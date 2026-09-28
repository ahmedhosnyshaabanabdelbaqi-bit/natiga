/**
 * Public visibility rule of interior tours, kept free of Nest classes so the
 * vehicles module (car pages) can apply exactly the same rule as the tours
 * API without a circular module import.
 */
import type { Prisma } from '../../../generated/prisma/client';
import { ContentStatus, MediaStatus } from '../../../generated/prisma/enums';
import { todayUtc } from '../../media/domain/licenses';
import { PUBLIC_VARIANT_WHERE } from '../../vehicles/common/visibility';

/** A file that must not be shown: deleted, unprocessed, unlicensed or licence not valid today. */
function unusableAsset(today: Date): Prisma.MediaAssetWhereInput {
  return {
    OR: [
      { deletedAt: { not: null } },
      { status: { not: MediaStatus.ready } },
      { licenseId: null },
      { license: { validUntil: { lt: today } } },
      { license: { validFrom: { gt: today } } },
    ],
  };
}

/**
 * Published, not deleted, of a public trim, and every scene panorama and
 * hotspot file usable today (licence dates are time-dependent, so they are
 * checked here in addition to the database publishing rules).
 */
export function publicTourWhere(today: Date = todayUtc()): Prisma.InteriorTourWhereInput {
  const bad = unusableAsset(today);
  return {
    status: ContentStatus.published,
    deletedAt: null,
    initialSceneId: { not: null },
    variant: PUBLIC_VARIANT_WHERE,
    scenes: {
      some: {},
      none: { OR: [{ asset: bad }, { hotspots: { some: { mediaAsset: bad } } }] },
    },
  };
}
