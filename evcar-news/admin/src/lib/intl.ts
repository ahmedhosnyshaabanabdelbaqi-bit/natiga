/** Lists from the browser's Intl data (no hard-coded tables). */

function supported(kind: 'currency' | 'timeZone'): string[] {
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] })
      .supportedValuesOf;
    return typeof fn === 'function' ? fn(kind) : [];
  } catch {
    return [];
  }
}

export function currencyCodes(): string[] {
  return supported('currency');
}

export function timeZones(): string[] {
  return supported('timeZone');
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function currencyName(code: string, lang: string): string {
  try {
    return new Intl.DisplayNames([lang], { type: 'currency' }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function regionName(code: string, lang: string): string {
  try {
    return new Intl.DisplayNames([lang], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}
