/*
 * EV Car News brand mark — single source of truth for the app icon, the
 * adaptive icon (Android 8+), the themed/monochrome icon (Android 13+), the
 * splash logo and the web icons. Mirrored in Dart by
 * `lib/shared/widgets/app_mark.dart` (same path data).
 *
 * Motif: a charging plug (two prongs + head with a lightning bolt) whose
 * cable becomes a road running towards the viewer, with a dashed centre line.
 * The bolt and the dashes are cut out (even-odd), so the background shows
 * through. Brand colours: electric blue #0A5CFF → deep cyan #0077BE, with a
 * bright cyan #00C2E0 glow.
 *
 * Geometry: one outline on a 1024 × 1024 canvas centred on (512, 512).
 */
'use strict';

/** Plug + road silhouette (single outline, no self-overlap). */
const OUTLINE =
  'M422 260 H426 V176 A26 26 0 0 1 478 176 V260 H546 V176 A26 26 0 0 1 598 176 V260 H602 ' +
  'A70 70 0 0 1 672 330 V400 A70 70 0 0 1 602 470 H560 L568 520 L760 850 Q770 872 746 872 ' +
  'H278 Q254 872 264 850 L456 520 L464 470 H422 A70 70 0 0 1 352 400 V330 A70 70 0 0 1 422 260 Z';

/** Lightning bolt inside the plug head (cut out). */
const BOLT = 'M524 290 L462 380 L504 380 L486 444 L564 346 L520 346 L564 290 Z';

/** Road centre-line dashes, larger towards the viewer (cut out). */
const DASHES = [
  'M506 560 H518 L520 606 H504 Z',
  'M503 652 H521 L524 722 H500 Z',
  'M499 770 H525 L529 852 H495 Z',
];

/** Full path data, fill-rule even-odd. */
const PATH = [OUTLINE, BOLT, ...DASHES].join(' ');

const BLUE = '#0A5CFF';
const DEEP_CYAN = '#0077BE';
const CYAN = '#00C2E0';

function backgroundSvg(rounded) {
  const rx = rounded ? ` rx="${rounded}"` : '';
  return `<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${BLUE}"/><stop offset="1" stop-color="${DEEP_CYAN}"/>
  </linearGradient>
  <radialGradient id="glow" cx="0.5" cy="0.78" r="0.6">
    <stop offset="0" stop-color="${CYAN}" stop-opacity="0.6"/><stop offset="1" stop-color="${CYAN}" stop-opacity="0"/>
  </radialGradient>
</defs>
<rect width="1024" height="1024"${rx} fill="url(#bg)"/>
<rect width="1024" height="1024"${rx} fill="url(#glow)"/>`;
}

/**
 * @param {object} o
 * @param {number} [o.size] output px
 * @param {number} [o.scale] mark scale around the centre (1 = 722 px tall)
 * @param {number} [o.rounded] corner radius of the background (0 = square)
 * @param {boolean} [o.background] draw the brand background
 * @param {string} [o.fill] mark colour
 */
function iconSvg({ size = 1024, scale = 0.82, rounded = 0, background = true, fill = '#FFFFFF' } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
${background ? backgroundSvg(rounded) : ''}
<g transform="translate(512 512) scale(${scale}) translate(-512 -512)">
  <path d="${PATH}" fill="${fill}" fill-rule="evenodd"/>
</g>
</svg>`;
}

module.exports = { OUTLINE, BOLT, DASHES, PATH, BLUE, DEEP_CYAN, CYAN, iconSvg };
