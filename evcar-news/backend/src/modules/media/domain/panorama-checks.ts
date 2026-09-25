/**
 * Checks of an uploaded 360° panorama (REQUIREMENTS §9: "نسبة 2:1 وحدها ليست
 * دليلًا على صلاحية الصورة"). A 2:1 frame is necessary but proves nothing:
 * the heuristics below flag images that are probably NOT a full
 * equirectangular panorama (a flat photo padded or stretched to 2:1, a
 * partial pano, an up-scaled or synthetic image) so the editor must look
 * at it and confirm explicitly. They never reject by themselves.
 *
 * Pure functions over a downscaled RGB frame — unit tested.
 */
import type { Bilingual } from '../../../common/validation/messages';
import { PANORAMA_LIMITS } from './media-rules';

export type WarningSeverity = 'warning' | 'info';

export interface ValidationWarning {
  code: string;
  severity: WarningSeverity;
  message: Bilingual;
  data?: Record<string, unknown>;
}

export interface ValidationProblem {
  code: string;
  message: Bilingual;
  data?: Record<string, unknown>;
}

/** A raw interleaved RGB(A) frame. */
export interface RawFrame {
  data: Uint8Array;
  width: number;
  height: number;
  channels: number;
}

export interface PanoramaMeasures {
  /** Mean |left column − right column| luminance difference (0..255) — the 360° seam. */
  seamDiff: number;
  /** Std-dev of the luminance along the first / last row (a real pano converges to one point). */
  topRowStd: number;
  bottomRowStd: number;
  /** Std-dev of the whole top / bottom 6 % strips (padding / letterbox detection). */
  topStripStd: number;
  bottomStripStd: number;
  /** Std-dev of the left / right 3 % strips (pillarbox detection). */
  leftStripStd: number;
  rightStripStd: number;
}

function luma(frame: RawFrame, x: number, y: number): number {
  const i = (y * frame.width + x) * frame.channels;
  if (frame.channels < 3) return frame.data[i];
  return 0.2126 * frame.data[i] + 0.7152 * frame.data[i + 1] + 0.0722 * frame.data[i + 2];
}

function std(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / values.length;
  return Math.sqrt(variance);
}

function region(frame: RawFrame, x0: number, y0: number, x1: number, y1: number): number[] {
  const out: number[] = [];
  const stepX = Math.max(1, Math.floor((x1 - x0) / 256));
  const stepY = Math.max(1, Math.floor((y1 - y0) / 256));
  for (let y = y0; y < y1; y += stepY) {
    for (let x = x0; x < x1; x += stepX) out.push(luma(frame, x, y));
  }
  return out;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Measures used by the warnings (frame = the panorama downscaled, e.g. 1024×512). */
export function measurePanorama(frame: RawFrame): PanoramaMeasures {
  const { width: w, height: h } = frame;
  // Seam: compare the outermost columns, ignoring the 10 % rows near the poles.
  const y0 = Math.floor(h * 0.1);
  const y1 = Math.max(y0 + 1, Math.ceil(h * 0.9));
  let seam = 0;
  for (let y = y0; y < y1; y++) seam += Math.abs(luma(frame, 0, y) - luma(frame, w - 1, y));
  const strip = Math.max(1, Math.round(h * 0.06));
  const side = Math.max(1, Math.round(w * 0.03));
  return {
    seamDiff: round2(seam / (y1 - y0)),
    topRowStd: round2(std(region(frame, 0, 0, w, 1))),
    bottomRowStd: round2(std(region(frame, 0, h - 1, w, h))),
    topStripStd: round2(std(region(frame, 0, 0, w, strip))),
    bottomStripStd: round2(std(region(frame, 0, h - strip, w, h))),
    leftStripStd: round2(std(region(frame, 0, 0, side, h))),
    rightStripStd: round2(std(region(frame, w - side, 0, w, h))),
  };
}

/** Thresholds (luminance 0..255), chosen conservatively: they only raise warnings. */
export const THRESHOLDS = {
  /** Left/right edges of a 360° image are the same meridian. */
  seamDiff: 28,
  /** First/last row of an equirectangular image is a single point (zenith / nadir). */
  poleRowStd: 22,
  /** A strip this flat is padding (letterbox / pillarbox), not scenery. */
  uniformStd: 2.5,
  /** Bytes per pixel below which a JPEG/WebP is suspiciously simple (flat / synthetic / up-scaled). */
  minBytesPerPixel: 0.03,
} as const;

export interface PanoramaWarningInput {
  width: number;
  height: number;
  sizeBytes: number;
  measures: PanoramaMeasures | null;
  gpano: GPanoInfo | null;
}

/** Warnings an editor must acknowledge before the panorama can be published. */
export function panoramaWarnings(input: PanoramaWarningInput): ValidationWarning[] {
  const out: ValidationWarning[] = [];
  const { width, height, sizeBytes, measures: m, gpano } = input;
  if (width < PANORAMA_LIMITS.recommendedWidth) {
    out.push({
      code: 'low_resolution',
      severity: 'warning',
      message: {
        ar: `دقة منخفضة (${width}×${height}). يُنصح بـ 4096×2048 على الأقل لمقصورة سيارة.`,
        en: `Low resolution (${width}×${height}). At least 4096×2048 is recommended for a car interior.`,
      },
      data: { width, height, recommendedWidth: PANORAMA_LIMITS.recommendedWidth },
    });
  }
  const bpp = sizeBytes / Math.max(1, width * height);
  if (bpp < THRESHOLDS.minBytesPerPixel) {
    out.push({
      code: 'tiny_file',
      severity: 'warning',
      message: {
        ar: 'حجم الملف صغير جدًا بالنسبة لأبعاده؛ قد تكون الصورة مكبّرة أو مصطنعة أو شبه فارغة.',
        en: 'The file is very small for its dimensions; the image may be up-scaled, synthetic or mostly empty.',
      },
      data: { bytesPerPixel: round2(bpp * 1000) / 1000 },
    });
  }
  if (m) {
    if (m.seamDiff > THRESHOLDS.seamDiff) {
      out.push({
        code: 'seam_mismatch',
        severity: 'warning',
        message: {
          ar: 'الحافتان اليسرى واليمنى لا تتطابقان؛ قد لا تكون الصورة بانوراما 360° كاملة.',
          en: 'The left and right edges do not match; the image may not be a full 360° panorama.',
        },
        data: { seamDiff: m.seamDiff },
      });
    }
    if (m.topRowStd > THRESHOLDS.poleRowStd || m.bottomRowStd > THRESHOLDS.poleRowStd) {
      out.push({
        code: 'poles_not_converging',
        severity: 'warning',
        message: {
          ar: 'أعلى الصورة أو أسفلها لا يتقارب إلى نقطة واحدة كما في صورة Equirectangular حقيقية؛ قد تكون صورة عادية مُمدّدة.',
          en: 'The top or bottom edge does not converge to a single point like a real equirectangular image; it may be a stretched flat photo.',
        },
        data: { topRowStd: m.topRowStd, bottomRowStd: m.bottomRowStd },
      });
    }
    const topFlat = m.topStripStd < THRESHOLDS.uniformStd;
    const bottomFlat = m.bottomStripStd < THRESHOLDS.uniformStd;
    const leftFlat = m.leftStripStd < THRESHOLDS.uniformStd;
    const rightFlat = m.rightStripStd < THRESHOLDS.uniformStd;
    if ((topFlat && bottomFlat) || (leftFlat && rightFlat)) {
      out.push({
        code: 'uniform_borders',
        severity: 'warning',
        message: {
          ar: 'حواف الصورة بلون موحّد (هوامش)؛ غالبًا صورة عادية وُضعت داخل إطار 2:1.',
          en: 'The image has uniform borders (padding); it is probably a flat photo placed in a 2:1 frame.',
        },
        data: {
          topStripStd: m.topStripStd,
          bottomStripStd: m.bottomStripStd,
          leftStripStd: m.leftStripStd,
          rightStripStd: m.rightStripStd,
        },
      });
    }
  }
  if (gpano?.projectionType && gpano.projectionType !== 'equirectangular') {
    out.push({
      code: 'gpano_projection',
      severity: 'warning',
      message: {
        ar: `بيانات الصورة تصف إسقاطًا "${gpano.projectionType}" وليس Equirectangular.`,
        en: `The image metadata declares a "${gpano.projectionType}" projection, not equirectangular.`,
      },
      data: { projectionType: gpano.projectionType },
    });
  }
  if (gpano && gpano.isPartial) {
    out.push({
      code: 'gpano_partial',
      severity: 'warning',
      message: {
        ar: 'بيانات الصورة تشير إلى بانوراما جزئية (مقصوصة) وليست 360°×180° كاملة.',
        en: 'The image metadata describes a partial (cropped) panorama, not a full 360°×180° one.',
      },
      data: { ...gpano },
    });
  }
  if (!gpano) {
    out.push({
      code: 'gpano_missing',
      severity: 'info',
      message: {
        ar: 'لا توجد بيانات GPano في الملف (ليست إلزامية، لكن معظم برامج التجميع تضيفها).',
        en: 'The file carries no GPano metadata (optional, but most stitching tools add it).',
      },
    });
  }
  return out;
}

// --- XMP GPano ---------------------------------------------------------------

export interface GPanoInfo {
  projectionType: string | null;
  fullWidth: number | null;
  fullHeight: number | null;
  croppedWidth: number | null;
  croppedHeight: number | null;
  croppedLeft: number | null;
  croppedTop: number | null;
  isPartial: boolean;
}

function xmpValue(xmp: string, name: string): string | null {
  // Attribute form GPano:Name="value" or element form <GPano:Name>value</GPano:Name>.
  const attr = new RegExp(`GPano:${name}\\s*=\\s*"([^"]{0,100})"`).exec(xmp);
  if (attr) return attr[1].trim();
  const el = new RegExp(`<GPano:${name}>([^<]{0,100})</GPano:${name}>`).exec(xmp);
  return el ? el[1].trim() : null;
}

function xmpInt(xmp: string, name: string): number | null {
  const v = xmpValue(xmp, name);
  if (v === null || !/^\d{1,6}$/.test(v)) return null;
  return Number(v);
}

/** Parses the GPano fields of an XMP packet (null when there are none). */
export function parseGPano(xmp: Buffer | string | null | undefined): GPanoInfo | null {
  if (!xmp) return null;
  const text = (typeof xmp === 'string' ? xmp : xmp.toString('utf8')).slice(0, 200_000);
  if (!text.includes('GPano:')) return null;
  const projection = xmpValue(text, 'ProjectionType');
  const info: GPanoInfo = {
    projectionType: projection ? projection.toLowerCase() : null,
    fullWidth: xmpInt(text, 'FullPanoWidthPixels'),
    fullHeight: xmpInt(text, 'FullPanoHeightPixels'),
    croppedWidth: xmpInt(text, 'CroppedAreaImageWidthPixels'),
    croppedHeight: xmpInt(text, 'CroppedAreaImageHeightPixels'),
    croppedLeft: xmpInt(text, 'CroppedAreaLeftPixels'),
    croppedTop: xmpInt(text, 'CroppedAreaTopPixels'),
    isPartial: false,
  };
  info.isPartial =
    (info.fullWidth !== null && info.croppedWidth !== null && info.croppedWidth < info.fullWidth) ||
    (info.fullHeight !== null &&
      info.croppedHeight !== null &&
      info.croppedHeight < info.fullHeight);
  return info;
}

// --- editor visual confirmation ---------------------------------------------

export interface VisualCheck {
  confirmedAt: string;
  confirmedById: string | null;
  note: string | null;
  acknowledgedWarnings: string[];
}

/** Codes of warnings that must be acknowledged explicitly (severity "warning"). */
export function warningsToAcknowledge(warnings: ValidationWarning[]): string[] {
  return [...new Set(warnings.filter((w) => w.severity === 'warning').map((w) => w.code))];
}

/** Warning codes still unacknowledged by a confirmation (empty = complete). */
export function unacknowledged(warnings: ValidationWarning[], acknowledged: string[]): string[] {
  const given = new Set(acknowledged);
  return warningsToAcknowledge(warnings).filter((c) => !given.has(c));
}
