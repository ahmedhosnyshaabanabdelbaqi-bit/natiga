import {
  createTheme,
  darken,
  lighten,
  type MantineColorsTuple,
  type MantineThemeOverride,
} from '@mantine/core';
import type { BrandingConfig } from '@/api/types';

/** Electric blue / cyan identity (ARCHITECTURE §6), overridable from Settings → Branding. */
export const DEFAULT_BRANDING: BrandingConfig = {
  appName: 'EV Car News',
  logoUrl: null,
  primaryColor: '#0A5CFF',
  accentColor: '#00C2E0',
};

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
}

/** Builds a 10-shade Mantine palette with the given colour at index 6. */
export function colorTuple(hex: string): MantineColorsTuple {
  return [
    lighten(hex, 0.92),
    lighten(hex, 0.8),
    lighten(hex, 0.64),
    lighten(hex, 0.48),
    lighten(hex, 0.32),
    lighten(hex, 0.16),
    hex,
    darken(hex, 0.12),
    darken(hex, 0.24),
    darken(hex, 0.36),
  ];
}

export function resolveBranding(branding?: Partial<BrandingConfig> | null): BrandingConfig {
  return {
    appName: branding?.appName?.trim() || DEFAULT_BRANDING.appName,
    logoUrl: branding?.logoUrl || null,
    primaryColor: isHexColor(branding?.primaryColor)
      ? branding.primaryColor
      : DEFAULT_BRANDING.primaryColor,
    accentColor: isHexColor(branding?.accentColor)
      ? branding.accentColor
      : DEFAULT_BRANDING.accentColor,
  };
}

export const FONT_FAMILY =
  '"IBM Plex Sans Arabic", system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Arabic", Tahoma, sans-serif';

export function buildTheme(branding?: Partial<BrandingConfig> | null): MantineThemeOverride {
  const b = resolveBranding(branding);
  return createTheme({
    primaryColor: 'brand',
    primaryShade: { light: 6, dark: 5 },
    colors: {
      brand: colorTuple(b.primaryColor),
      accent: colorTuple(b.accentColor),
    },
    fontFamily: FONT_FAMILY,
    headings: { fontFamily: FONT_FAMILY, fontWeight: '700' },
    defaultRadius: 'md',
    cursorType: 'pointer',
    respectReducedMotion: true,
  });
}
