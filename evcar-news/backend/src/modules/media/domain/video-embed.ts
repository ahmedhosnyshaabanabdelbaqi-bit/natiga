/**
 * Licensed external videos for hotspots (REQUIREMENTS §8 "فيديو مرخّص"):
 * only a fixed allow-list of embed hosts is accepted and every accepted
 * link is normalised to the provider's privacy-friendly embed URL, so the
 * app's viewer only ever loads https://www.youtube-nocookie.com/embed/<id>
 * or https://player.vimeo.com/video/<id>. Pure — unit tested.
 */

export type EmbedProvider = 'youtube' | 'vimeo';

export interface EmbedVideo {
  provider: EmbedProvider;
  videoId: string;
  /** Normalised embed URL (the only URL the apps load). */
  embedUrl: string;
  /** Normalised watch URL (attribution / "open in app"). */
  watchUrl: string;
}

export const EMBED_ORIGINS = ['https://www.youtube-nocookie.com', 'https://player.vimeo.com'];

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{6,12}$/;

/** Parses a YouTube / Vimeo link; null for anything else (wrong host, http, odd ids...). */
export function parseEmbedVideo(raw: string): EmbedVideo | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);
  let yt: string | null = null;
  if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(host)) {
    if (parts[0] === 'watch') yt = url.searchParams.get('v');
    else if (['embed', 'shorts', 'live'].includes(parts[0]) && parts.length === 2) yt = parts[1];
  } else if (host === 'youtu.be' && parts.length === 1) {
    yt = parts[0];
  } else if (host === 'www.youtube-nocookie.com' && parts[0] === 'embed' && parts.length === 2) {
    yt = parts[1];
  }
  if (yt !== null) {
    if (!YT_ID.test(yt)) return null;
    return {
      provider: 'youtube',
      videoId: yt,
      embedUrl: `https://www.youtube-nocookie.com/embed/${yt}`,
      watchUrl: `https://www.youtube.com/watch?v=${yt}`,
    };
  }
  let vimeo: string | null = null;
  if (['vimeo.com', 'www.vimeo.com'].includes(host) && parts.length === 1) vimeo = parts[0];
  else if (host === 'player.vimeo.com' && parts[0] === 'video' && parts.length === 2) {
    vimeo = parts[1];
  }
  if (vimeo !== null && VIMEO_ID.test(vimeo)) {
    return {
      provider: 'vimeo',
      videoId: vimeo,
      embedUrl: `https://player.vimeo.com/video/${vimeo}`,
      watchUrl: `https://vimeo.com/${vimeo}`,
    };
  }
  return null;
}

/** Re-checks a stored embed URL before serving it (defence in depth). */
export function isAllowedEmbedUrl(url: string): boolean {
  const parsed = parseEmbedVideo(url);
  return parsed !== null && parsed.embedUrl === url;
}
