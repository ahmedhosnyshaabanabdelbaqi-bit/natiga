/**
 * Pannellum multires tile plan (same layout as Pannellum's generate.py):
 *   <basePath>/<level>/<face><row>_<col>.jpg   level 1 = coarsest
 *   <basePath>/fallback/<face>.jpg              for devices without WebGL tiles
 * and the config passed to the viewer:
 *   { path: "/%l/%s%y_%x", fallbackPath: "/fallback/%s", extension: "jpg",
 *     tileResolution, maxLevel, cubeResolution }
 * Pure — unit tested.
 */
import type { CubeFace } from './cubemap';
import { FALLBACK_FACE_SIZE, MULTIRES_MAX_SOURCE_WIDTH, TILE_RESOLUTION } from './media-rules';

export interface MultiresLevel {
  level: number;
  /** Face edge length at this level (px). */
  size: number;
  /** Tiles per row / column at this level. */
  tiles: number;
}

export interface MultiresPlan {
  cubeResolution: number;
  tileResolution: number;
  maxLevel: number;
  levels: MultiresLevel[];
  fallbackSize: number;
}

export interface MultiresConfig {
  path: string;
  fallbackPath: string;
  extension: 'jpg';
  tileResolution: number;
  maxLevel: number;
  cubeResolution: number;
}

/**
 * Plan for an equirectangular source `width` px wide: cube edge ≈ width / π
 * (multiple of 8, like generate.py), levels until a face fits in one tile,
 * cube edge rounded so every level has an integer size.
 */
export function planMultires(width: number, tileResolution = TILE_RESOLUTION): MultiresPlan {
  const source = Math.min(width, MULTIRES_MAX_SOURCE_WIDTH);
  let cube = Math.max(8, Math.floor(source / Math.PI / 8) * 8);
  let levels = Math.max(1, Math.ceil(Math.log2(cube / tileResolution)) + 1);
  if (levels >= 2 && Math.round(cube / 2 ** (levels - 2)) === tileResolution) levels -= 1;
  const unit = 2 ** (levels - 1);
  cube = Math.max(unit, Math.floor(cube / unit) * unit);
  const out: MultiresLevel[] = [];
  for (let level = 1; level <= levels; level++) {
    const size = cube / 2 ** (levels - level);
    out.push({ level, size, tiles: Math.ceil(size / tileResolution) });
  }
  return {
    cubeResolution: cube,
    tileResolution,
    maxLevel: levels,
    levels: out,
    fallbackSize: Math.min(FALLBACK_FACE_SIZE, cube),
  };
}

export function multiresConfig(plan: MultiresPlan): MultiresConfig {
  return {
    path: '/%l/%s%y_%x',
    fallbackPath: '/fallback/%s',
    extension: 'jpg',
    tileResolution: plan.tileResolution,
    maxLevel: plan.maxLevel,
    cubeResolution: plan.cubeResolution,
  };
}

/** Relative path (under the tiles prefix) of one tile. */
export function tilePath(level: number, face: CubeFace, row: number, col: number): string {
  return `${level}/${face}${row}_${col}.jpg`;
}

export function fallbackPath(face: CubeFace): string {
  return `fallback/${face}.jpg`;
}

/** Total number of tiles of a plan (all faces, all levels). */
export function tileCount(plan: MultiresPlan): number {
  return plan.levels.reduce((sum, l) => sum + 6 * l.tiles * l.tiles, 0);
}

/** Crop rectangles of the tiles of one face at one level. */
export function tileRects(
  level: MultiresLevel,
  tileResolution: number,
): { row: number; col: number; left: number; top: number; width: number; height: number }[] {
  const out = [];
  for (let row = 0; row < level.tiles; row++) {
    for (let col = 0; col < level.tiles; col++) {
      const left = col * tileResolution;
      const top = row * tileResolution;
      out.push({
        row,
        col,
        left,
        top,
        width: Math.min(tileResolution, level.size - left),
        height: Math.min(tileResolution, level.size - top),
      });
    }
  }
  return out;
}
