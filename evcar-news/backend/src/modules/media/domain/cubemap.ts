/**
 * Equirectangular → cube faces for Pannellum "multires" panoramas.
 *
 * Pannellum's multires format (see its generate.py / libpannellum.js) uses
 * six cube faces f, r, b, l, u, d, each split into tiles per level. Face
 * orientation matches libpannellum's cube geometry (front = yaw 0, right =
 * yaw +90°, up face: top edge towards the back, down face: top edge towards
 * the front). Pure pixel math on raw RGB buffers — unit tested.
 *
 * Coordinates: x = right, y = up, z = forward (yaw 0). Yaw grows to the
 * right, pitch grows upwards; the equirectangular centre column is yaw 0 and
 * its left edge yaw −180°.
 */
import type { RawFrame } from './panorama-checks';

export type CubeFace = 'f' | 'r' | 'b' | 'l' | 'u' | 'd';
export const CUBE_FACES: readonly CubeFace[] = ['f', 'r', 'b', 'l', 'u', 'd'];

/**
 * Direction (not normalised) of the point (a, b) of a face, where a runs
 * left → right and b top → bottom, both in [−1, 1].
 */
export function faceDirection(face: CubeFace, a: number, b: number): [number, number, number] {
  switch (face) {
    case 'f':
      return [a, -b, 1];
    case 'r':
      return [1, -b, -a];
    case 'b':
      return [-a, -b, -1];
    case 'l':
      return [-1, -b, a];
    case 'u':
      return [a, 1, b];
    case 'd':
      return [a, -1, -b];
  }
}

const RAD = 180 / Math.PI;

/** Yaw / pitch (degrees) of a direction. */
export function directionToYawPitch(x: number, y: number, z: number): [number, number] {
  return [Math.atan2(x, z) * RAD, Math.atan2(y, Math.hypot(x, z)) * RAD];
}

/** Continuous pixel coordinates (u, v) of yaw / pitch in a W×H equirectangular image. */
export function yawPitchToPixel(
  yaw: number,
  pitch: number,
  width: number,
  height: number,
): [number, number] {
  return [((yaw + 180) / 360) * width - 0.5, ((90 - pitch) / 180) * height - 0.5];
}

/**
 * Renders one cube face of `size`×`size` px (raw RGB, 3 channels) from an
 * equirectangular frame with bilinear sampling (horizontal wrap-around,
 * vertical clamp).
 */
export function renderCubeFace(src: RawFrame, face: CubeFace, size: number): Buffer {
  const { data, width: W, height: H, channels: C } = src;
  const out = Buffer.allocUnsafe(size * size * 3);
  const kx = W / (2 * Math.PI);
  const ky = H / Math.PI;
  let o = 0;
  for (let j = 0; j < size; j++) {
    const b = (2 * (j + 0.5)) / size - 1;
    for (let i = 0; i < size; i++) {
      const a = (2 * (i + 0.5)) / size - 1;
      const [x, y, z] = faceDirection(face, a, b);
      const lon = Math.atan2(x, z); // −π..π
      const lat = Math.atan2(y, Math.sqrt(x * x + z * z)); // −π/2..π/2
      const u = (lon + Math.PI) * kx - 0.5;
      const v = (Math.PI / 2 - lat) * ky - 0.5;
      let u0 = Math.floor(u);
      const fu = u - u0;
      let v0 = Math.floor(v);
      const fv = v - v0;
      let u1 = u0 + 1;
      let v1 = v0 + 1;
      // wrap horizontally, clamp vertically
      u0 = ((u0 % W) + W) % W;
      u1 = ((u1 % W) + W) % W;
      if (v0 < 0) v0 = 0;
      if (v1 < 0) v1 = 0;
      if (v0 >= H) v0 = H - 1;
      if (v1 >= H) v1 = H - 1;
      const p00 = (v0 * W + u0) * C;
      const p10 = (v0 * W + u1) * C;
      const p01 = (v1 * W + u0) * C;
      const p11 = (v1 * W + u1) * C;
      const w00 = (1 - fu) * (1 - fv);
      const w10 = fu * (1 - fv);
      const w01 = (1 - fu) * fv;
      const w11 = fu * fv;
      for (let c = 0; c < 3; c++) {
        const cc = C >= 3 ? c : 0;
        out[o++] =
          data[p00 + cc] * w00 + data[p10 + cc] * w10 + data[p01 + cc] * w01 + data[p11 + cc] * w11 +
          0.5;
      }
    }
  }
  return out;
}
