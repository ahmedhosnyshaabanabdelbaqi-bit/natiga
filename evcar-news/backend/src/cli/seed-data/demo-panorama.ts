import sharp from 'sharp';

/**
 * Synthetic equirectangular 2:1 test panorama for the DEMO 360° tour only.
 * It is a generated grid (yaw/pitch lines every 15°, direction labels, a
 * floor/sky split and a large "DEMO — not a real car interior" banner in
 * English and Arabic), never a photo: REQUIREMENTS §8 allows a clearly
 * labelled demo panorama to test the viewer as long as it is not attributed
 * to a real car. Deterministic output (same bytes for the same scene).
 */
export type DemoPanoramaScene = 'driver' | 'rear';

export const DEMO_PANORAMA_SIZE = { width: 4096, height: 2048 } as const;
export const DEMO_PANORAMA_PREVIEW = { width: 1024, height: 512 } as const;
export const DEMO_PANORAMA_RENDITION = { width: 2048, height: 1024 } as const;

const PALETTE: Record<DemoPanoramaScene, { sky: string; floor: string; accent: string }> = {
  driver: { sky: '#0A5CFF', floor: '#12305F', accent: '#00C2E0' },
  rear: { sky: '#3D2C8D', floor: '#1C1440', accent: '#F4B400' },
};

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function demoPanoramaSvg(scene: DemoPanoramaScene): string {
  const { width: w, height: h } = DEMO_PANORAMA_SIZE;
  const p = PALETTE[scene];
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">`,
    `<stop offset="0" stop-color="${p.sky}" stop-opacity="0.55"/><stop offset="1" stop-color="${p.sky}"/>`,
    `</linearGradient></defs>`,
    `<rect x="0" y="0" width="${w}" height="${h / 2}" fill="url(#sky)"/>`,
    `<rect x="0" y="${h / 2}" width="${w}" height="${h / 2}" fill="${p.floor}"/>`,
  );
  // Grid every 15° (yaw: 24 columns, pitch: 12 rows).
  for (let i = 0; i <= 24; i++) {
    const x = (w / 24) * i;
    parts.push(
      `<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="#FFFFFF" stroke-opacity="${i % 6 === 0 ? 0.7 : 0.25}" stroke-width="${i % 6 === 0 ? 6 : 3}"/>`,
    );
  }
  for (let j = 0; j <= 12; j++) {
    const y = (h / 12) * j;
    parts.push(
      `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="#FFFFFF" stroke-opacity="${j === 6 ? 0.9 : 0.25}" stroke-width="${j === 6 ? 8 : 3}"/>`,
    );
  }
  // Direction labels at yaw -180 / -90 / 0 / 90 (x = (yaw + 180) / 360 * w).
  // The back (yaw ±180°) is split by the seam: one copy on each edge.
  const labels: [number, string, 'start' | 'middle' | 'end'][] = [
    [24, 'BACK / الخلف', 'start'],
    [w - 24, 'BACK / الخلف', 'end'],
    [w / 4, 'LEFT / اليسار', 'middle'],
    [w / 2, 'FRONT / الأمام', 'middle'],
    [(w * 3) / 4, 'RIGHT / اليمين', 'middle'],
  ];
  for (const [x, text, anchor] of labels) {
    parts.push(
      `<text x="${x}" y="${h / 2 - 40}" font-family="DejaVu Sans, sans-serif" font-size="64" font-weight="bold" fill="${p.accent}" text-anchor="${anchor}">${escapeXml(text)}</text>`,
    );
  }
  const banner = [
    `DEMO · synthetic test panorama (${scene} scene)`,
    'NOT a real car interior',
    'بانوراما تجريبية اصطناعية (Demo)',
    'ليست مقصورة سيارة حقيقية',
  ];
  for (const [i, text] of banner.entries()) {
    for (const x of [w / 4, (w * 3) / 4]) {
      parts.push(
        `<text x="${x}" y="${h / 2 + 150 + i * 80}" font-family="DejaVu Sans, sans-serif" font-size="56" fill="#FFFFFF" text-anchor="middle">${escapeXml(text)}</text>`,
      );
    }
  }
  // Large geometric "DEMO" marks (visible even without any font installed).
  for (const x of [w / 8, (w * 5) / 8]) {
    parts.push(
      `<rect x="${x}" y="${h / 2 + 500}" width="${w / 4}" height="160" rx="24" fill="none" stroke="${p.accent}" stroke-width="16"/>`,
      `<rect x="${x + 40}" y="${h / 2 + 540}" width="${w / 4 - 80}" height="80" fill="${p.accent}" fill-opacity="0.35"/>`,
    );
  }
  parts.push('</svg>');
  return parts.join('');
}

export interface DemoPanoramaFiles {
  original: Buffer;
  preview: Buffer;
  rendition: Buffer;
}

/** Renders the original (4096×2048), the fast preview (1024×512) and a 2048 rendition. */
export async function renderDemoPanorama(scene: DemoPanoramaScene): Promise<DemoPanoramaFiles> {
  const png = await sharp(Buffer.from(demoPanoramaSvg(scene)))
    .png()
    .toBuffer();
  const jpeg = (width: number, height: number, quality: number) =>
    sharp(png).resize(width, height).jpeg({ quality, mozjpeg: true }).toBuffer();
  const [original, preview, rendition] = await Promise.all([
    jpeg(DEMO_PANORAMA_SIZE.width, DEMO_PANORAMA_SIZE.height, 82),
    jpeg(DEMO_PANORAMA_PREVIEW.width, DEMO_PANORAMA_PREVIEW.height, 60),
    jpeg(DEMO_PANORAMA_RENDITION.width, DEMO_PANORAMA_RENDITION.height, 75),
  ]);
  return { original, preview, rendition };
}
