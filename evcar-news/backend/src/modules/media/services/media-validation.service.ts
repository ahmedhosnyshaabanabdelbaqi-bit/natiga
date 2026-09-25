import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { STORAGE_PROVIDER, type StorageProvider } from '../../../providers';
import {
  IMAGE_LIMITS,
  isTwoToOne,
  KIND_RULES,
  PANORAMA_LIMITS,
  SHARP_PIXEL_LIMIT,
  type UploadKind,
} from '../domain/media-rules';
import {
  measurePanorama,
  panoramaWarnings,
  parseGPano,
  type GPanoInfo,
  type PanoramaMeasures,
  type ValidationProblem,
  type ValidationWarning,
} from '../domain/panorama-checks';

/** Result of validating a stored upload; saved in media_assets.metadata.validation. */
export interface ValidationReport {
  version: 1;
  checkedAt: string;
  ok: boolean;
  problems: ValidationProblem[];
  warnings: ValidationWarning[];
  sniffedMime: string | null;
  declaredMime: string | null;
  format: string | null;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  sha256: string;
  measures: PanoramaMeasures | null;
  gpano: GPanoInfo | null;
}

export interface ValidateInput {
  key: string;
  kind: UploadKind;
  declaredMime: string | null;
  expectedBytes: number;
  expectedSha256: string | null;
  maxBytes: number;
}

const SNIFF_BYTES = 64 * 1024;

const P = {
  sizeMismatch: (actual: number, expected: number): ValidationProblem => ({
    code: 'size_mismatch',
    message: {
      ar: 'حجم الملف المستلم لا يطابق الحجم المعلن.',
      en: 'The received file size does not match the declared size.',
    },
    data: { actual, expected },
  }),
  checksum: (): ValidationProblem => ({
    code: 'checksum_mismatch',
    message: {
      ar: 'بصمة SHA-256 للملف لا تطابق البصمة المرسلة؛ ربما تلف الملف أثناء الرفع.',
      en: 'The SHA-256 of the file does not match the one sent; the file may have been corrupted in transit.',
    },
  }),
  unsupported: (kind: string, sniffed: string | null): ValidationProblem => ({
    code: 'unsupported_type',
    message: {
      ar: `نوع الملف الفعلي (${sniffed ?? 'غير معروف'}) غير مقبول لهذا النوع من الوسائط.`,
      en: `The actual file type (${sniffed ?? 'unknown'}) is not accepted for ${kind} files.`,
    },
    data: { sniffedMime: sniffed, accepted: KIND_RULES[kind as UploadKind]?.mimes ?? [] },
  }),
  corrupt: (): ValidationProblem => ({
    code: 'corrupt',
    message: {
      ar: 'تعذر فك ترميز الصورة؛ الملف تالف أو ناقص.',
      en: 'The image could not be decoded; the file is corrupt or truncated.',
    },
  }),
  animated: (): ValidationProblem => ({
    code: 'animated',
    message: {
      ar: 'الصور المتحركة أو متعددة الصفحات غير مقبولة.',
      en: 'Animated or multi-page images are not accepted.',
    },
  }),
  notTwoToOne: (width: number, height: number): ValidationProblem => ({
    code: 'not_2_to_1',
    message: {
      ar: `أبعاد البانوراما ${width}×${height} ليست بنسبة 2:1 (Equirectangular كاملة 360°×180°).`,
      en: `The panorama is ${width}×${height}, not a 2:1 frame (a full 360°×180° equirectangular image).`,
    },
    data: { width, height },
  }),
  tooSmall: (width: number, height: number, minWidth: number): ValidationProblem => ({
    code: 'too_small',
    message: {
      ar: `الصورة صغيرة جدًا (${width}×${height})؛ الحد الأدنى للعرض ${minWidth} بكسل.`,
      en: `The image is too small (${width}×${height}); the minimum width is ${minWidth} px.`,
    },
    data: { width, height, minWidth },
  }),
  tooLarge: (width: number, height: number): ValidationProblem => ({
    code: 'too_large_dimensions',
    message: {
      ar: `أبعاد الصورة كبيرة جدًا (${width}×${height}).`,
      en: `The image dimensions are too large (${width}×${height}).`,
    },
    data: {
      width,
      height,
      maxWidth: PANORAMA_LIMITS.maxWidth,
      maxPixels: IMAGE_LIMITS.maxPixels,
    },
  }),
};

function declaredMismatch(declared: string, sniffed: string): ValidationWarning {
  return {
    code: 'declared_type_mismatch',
    severity: 'info',
    message: {
      ar: `النوع المعلن (${declared}) يختلف عن النوع الفعلي (${sniffed}); اعتُمد النوع الفعلي.`,
      en: `The declared type (${declared}) differs from the actual type (${sniffed}); the actual type is used.`,
    },
    data: { declared, sniffed },
  };
}

/**
 * Validates an uploaded file where it is stored (REQUIREMENTS §9 "تحقق من
 * الصيغة والحجم والأبعاد والملفات التالفة"): size, SHA-256, MIME type
 * sniffed from the magic bytes (the declared type is never trusted), full
 * decode with sharp (corrupt / truncated files are refused), dimensions and
 * the 2:1 frame of panoramas, plus the heuristics of panorama-checks.ts
 * (warnings the editor must acknowledge — 2:1 alone proves nothing).
 */
@Injectable()
export class MediaValidationService {
  private readonly logger = new Logger(MediaValidationService.name);

  constructor(@Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider) {}

  async validate(input: ValidateInput): Promise<ValidationReport> {
    const report: ValidationReport = {
      version: 1,
      checkedAt: new Date().toISOString(),
      ok: false,
      problems: [],
      warnings: [],
      sniffedMime: null,
      declaredMime: input.declaredMime,
      format: null,
      width: null,
      height: null,
      sizeBytes: 0,
      sha256: '',
      measures: null,
      gpano: null,
    };
    const head = await this.storage.head(input.key);
    report.sizeBytes = head?.size ?? 0;
    if (!head || head.size !== input.expectedBytes) {
      report.problems.push(P.sizeMismatch(head?.size ?? 0, input.expectedBytes));
      return report;
    }

    const visual = input.kind === 'image' || input.kind === 'panorama';
    let buffer: Buffer | null = null;
    let sniffBytes: Buffer;
    if (visual) {
      buffer = await this.storage.getBuffer(input.key, input.maxBytes);
      report.sha256 = createHash('sha256').update(buffer).digest('hex');
      sniffBytes = buffer.subarray(0, SNIFF_BYTES);
    } else {
      const streamed = await this.hashAndHead(input.key);
      report.sha256 = streamed.sha256;
      sniffBytes = streamed.head;
    }
    if (input.expectedSha256 && input.expectedSha256.toLowerCase() !== report.sha256) {
      report.problems.push(P.checksum());
      return report;
    }

    const sniffed = await fileTypeFromBuffer(sniffBytes).catch(() => undefined);
    report.sniffedMime = sniffed?.mime ?? null;
    if (!sniffed || !KIND_RULES[input.kind].mimes.includes(sniffed.mime)) {
      report.problems.push(P.unsupported(input.kind, report.sniffedMime));
      return report;
    }
    if (input.declaredMime && input.declaredMime.toLowerCase() !== sniffed.mime) {
      report.warnings.push(declaredMismatch(input.declaredMime, sniffed.mime));
    }

    if (visual && buffer) {
      await this.validateImage(buffer, input.kind, report);
    } else if (input.kind === 'video') {
      report.format = sniffed.ext;
      report.warnings.push({
        code: 'video_not_transcoded',
        severity: 'info',
        message: {
          ar: 'يُعرض الفيديو كما رُفع (لا يوجد تحويل صيغة على الخادم)؛ استخدم MP4 (H.264/AAC) لأفضل توافق.',
          en: 'The video is served as uploaded (no server-side transcoding); use MP4 (H.264/AAC) for the best compatibility.',
        },
      });
    } else {
      report.format = sniffed.ext;
    }
    report.ok = report.problems.length === 0;
    return report;
  }

  private async validateImage(
    buffer: Buffer,
    kind: UploadKind,
    report: ValidationReport,
  ): Promise<void> {
    const opts = { failOn: 'error' as const, limitInputPixels: SHARP_PIXEL_LIMIT };
    let meta: sharp.Metadata;
    try {
      meta = await sharp(buffer, opts).metadata();
    } catch (err) {
      const message = (err as Error).message ?? '';
      if (/pixel limit/i.test(message)) {
        report.problems.push(P.tooLarge(0, 0));
      } else {
        report.problems.push(P.corrupt());
      }
      return;
    }
    report.format = meta.format ?? null;
    if ((meta.pages ?? 1) > 1) {
      report.problems.push(P.animated());
      return;
    }
    const rotated = (meta.orientation ?? 1) >= 5;
    const width = (rotated ? meta.height : meta.width) ?? 0;
    const height = (rotated ? meta.width : meta.height) ?? 0;
    report.width = width || null;
    report.height = height || null;

    if (kind === 'panorama') {
      if (width < PANORAMA_LIMITS.minWidth) {
        report.problems.push(P.tooSmall(width, height, PANORAMA_LIMITS.minWidth));
      } else if (width > PANORAMA_LIMITS.maxWidth) {
        report.problems.push(P.tooLarge(width, height));
      }
      if (!isTwoToOne(width, height)) report.problems.push(P.notTwoToOne(width, height));
    } else {
      if (width < IMAGE_LIMITS.minWidth || height < IMAGE_LIMITS.minHeight) {
        report.problems.push(P.tooSmall(width, height, IMAGE_LIMITS.minWidth));
      } else if (width * height > IMAGE_LIMITS.maxPixels) {
        report.problems.push(P.tooLarge(width, height));
      }
    }
    if (report.problems.length > 0) return;

    // Full decode (catches truncated / corrupt pixel data that metadata() does not read).
    let frame: { data: Buffer; info: sharp.OutputInfo };
    try {
      const pipeline = sharp(buffer, opts).rotate().removeAlpha().toColourspace('srgb');
      frame =
        kind === 'panorama'
          ? await pipeline
              .resize(1024, 512, { fit: 'fill', kernel: 'cubic' })
              .raw()
              .toBuffer({ resolveWithObject: true })
          : await pipeline
              .resize({ width: 256, withoutEnlargement: true })
              .raw()
              .toBuffer({ resolveWithObject: true });
    } catch (err) {
      this.logger.debug(`decode failed: ${(err as Error).message}`);
      report.problems.push(P.corrupt());
      return;
    }
    if (kind === 'panorama') {
      report.gpano = parseGPano(meta.xmp);
      report.measures = measurePanorama({
        data: frame.data,
        width: frame.info.width,
        height: frame.info.height,
        channels: frame.info.channels,
      });
      report.warnings.push(
        ...panoramaWarnings({
          width,
          height,
          sizeBytes: report.sizeBytes,
          measures: report.measures,
          gpano: report.gpano,
        }),
      );
    }
  }

  /** Streams an object once: SHA-256 of everything + the first bytes for sniffing. */
  private async hashAndHead(key: string): Promise<{ sha256: string; head: Buffer }> {
    const { stream } = await this.storage.get(key);
    const hash = createHash('sha256');
    const chunks: Buffer[] = [];
    let kept = 0;
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      hash.update(chunk);
      if (kept < SNIFF_BYTES) {
        chunks.push(chunk.subarray(0, SNIFF_BYTES - kept));
        kept += Math.min(chunk.length, SNIFF_BYTES - kept);
      }
    }
    return { sha256: hash.digest('hex'), head: Buffer.concat(chunks) };
  }
}
