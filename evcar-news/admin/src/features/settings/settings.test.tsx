import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { makeSession, makeUser } from '@/test/fixtures';
import { json, mockFetch } from '@/test/mockFetch';
import { renderApp } from '@/test/render';
import {
  homeSectionsValue,
  isValidTileTemplate,
  normalizeSettings,
  sampleTileUrl,
  type SettingRecord,
} from './api';

/** Rows shaped like the real GET /admin/settings (backend SettingDto). */
const row = (key: string, value: unknown, extra: Partial<SettingRecord> = {}): SettingRecord => ({
  key,
  value,
  isPublic: true,
  description: `${key} setting`,
  isDefault: false,
  warnings: [],
  updatedAt: '2026-09-01T00:00:00.000Z',
  updatedById: null,
  ...extra,
});

const settingsRows: SettingRecord[] = [
  row('branding', {
    appName: 'EV Car News',
    logoUrl: null,
    primaryColor: '#0A5CFF',
    accentColor: '#00C2E0',
  }),
  row('defaults', { defaultLanguage: 'ar', defaultMarket: 'EG', languages: ['ar', 'en'] }),
  row('home.sections', [
    { key: 'latest_news', enabled: true, order: 1 },
    { key: 'interior_tours', enabled: true, order: 2 },
    { key: 'nearby_stations', enabled: false, order: 3 },
  ]),
  row('features', { tripPlanner: false, community: true }),
  row(
    'map',
    { tileUrlTemplate: null, attribution: null, maxZoom: 19 },
    { warnings: ['osm_public_tile_usage_policy'] },
  ),
  row('share', {
    baseUrl: 'https://evcar.news',
    paths: { article: '/n/{slug}', car: '/cars/{slug}', comparison: '/compare/{shareId}' },
    defaultImageUrl: null,
    language: 'auto',
  }),
  row(
    'legal',
    { privacyUrl: null, termsUrl: null },
    { warnings: ['privacy_url_missing', 'terms_url_missing'], isDefault: true },
  ),
  row(
    'app_links',
    {
      androidPackage: 'news.evcar.app',
      androidSha256CertFingerprints: [],
      iosTeamId: null,
      iosBundleId: 'news.evcar.app',
      paths: ['/n/*', '/cars/*', '/compare/*'],
    },
    { isPublic: false },
  ),
];

const echo = (key: string) => (call: { body: unknown }) => json(200, { data: row(key, call.body) });

function setup(permissions = ['settings.read', 'settings.write']) {
  return mockFetch({
    'POST /auth/refresh': json(200, makeSession(makeUser({ permissions }))),
    'GET /admin/settings': json(200, { data: settingsRows }),
    'PUT /admin/settings/home-sections': echo('home.sections'),
    'PUT /admin/settings/branding': echo('branding'),
    'PATCH /admin/settings/features': echo('features'),
    'PUT /admin/settings/map': echo('map'),
    'PUT /admin/settings/share': echo('share'),
    'PUT /admin/settings/app-links': echo('app_links'),
    'POST /admin/settings/map/reset': json(200, { data: row('map', {}) }),
    'POST /admin/settings/branding/logo': json(200, {
      data: row('branding', { logoUrl: 'http://localhost:3000/media/branding/logo-abc.png' }),
    }),
  });
}

describe('Settings page', () => {
  it('reorders and hides home sections, then saves { sections } to /home-sections', async () => {
    const m = setup();
    renderApp('/settings?tab=home');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Move 360° interior tours up' }));
    await user.click(screen.getByRole('switch', { name: /Hidden/ }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(m.callsTo('PUT', '/admin/settings/home-sections')).toHaveLength(1));
    expect(m.callsTo('PUT', '/admin/settings/home-sections')[0]!.body).toEqual({
      sections: [
        { key: 'interior_tours', enabled: true, order: 1 },
        { key: 'latest_news', enabled: true, order: 2 },
        { key: 'nearby_stations', enabled: true, order: 3 },
      ],
    });
  });

  it('saves name and colours in one PUT of the whole branding value', async () => {
    const m = setup();
    renderApp('/settings?tab=branding');
    const user = userEvent.setup();
    const name = await screen.findByLabelText(/App name/);
    await user.clear(name);
    await user.type(name, 'EV Car News Beta');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(m.callsTo('PUT', '/admin/settings/branding')).toHaveLength(1));
    expect(m.callsTo('PUT', '/admin/settings/branding')[0]!.body).toEqual({
      appName: 'EV Car News Beta',
      logoUrl: null,
      primaryColor: '#0A5CFF',
      accentColor: '#00C2E0',
    });
  });

  it('uploads a logo as multipart form data', async () => {
    const m = setup();
    const { container } = renderApp('/settings?tab=branding');
    const user = userEvent.setup();
    await screen.findByRole('button', { name: 'Upload logo' });
    const input = container.ownerDocument.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(
      input,
      new File([new Uint8Array([137, 80, 78, 71])], 'logo.png', { type: 'image/png' }),
    );
    await waitFor(() => expect(m.callsTo('POST', '/admin/settings/branding/logo')).toHaveLength(1));
    const body = m.callsTo('POST', '/admin/settings/branding/logo')[0]!.rawBody;
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get('file')).toBeInstanceOf(File);
  });

  it('shows server-side validation errors on the field', async () => {
    mockFetch({
      'POST /auth/refresh': json(200, makeSession(makeUser())),
      'GET /admin/settings': json(200, { data: settingsRows }),
      'PUT /admin/settings/branding': json(422, {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Some fields are invalid.',
          details: [{ field: 'appName', constraints: { maxLength: 'appName is too long' } }],
          requestId: 'r1',
        },
      }),
    });
    renderApp('/settings?tab=branding');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/App name/), '!');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('appName is too long')).toBeInTheDocument();
  });

  it('warns about low colour contrast', async () => {
    setup();
    renderApp('/settings?tab=branding');
    expect(await screen.findByText(/Low contrast with white text/)).toBeInTheDocument();
  });

  it('PATCHes feature flags with the merged value', async () => {
    const m = setup();
    renderApp('/settings?tab=features');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('switch', { name: /Trip planner/ }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(m.callsTo('PATCH', '/admin/settings/features')).toHaveLength(1));
    expect(m.callsTo('PATCH', '/admin/settings/features')[0]!.body).toEqual({
      tripPlanner: true,
      community: true,
    });
  });

  it('requires attribution when a tile server is configured, shows server warnings', async () => {
    const m = setup();
    renderApp('/settings?tab=map');
    const user = userEvent.setup();
    expect(await screen.findByText(/No tile server configured/)).toBeInTheDocument();
    expect(screen.getByText(/public OpenStreetMap tile server is configured/)).toBeInTheDocument();
    await user.type(
      screen.getByLabelText(/Tile URL template/),
      'https://tiles.example.com/{{z}/{{x}/{{y}.png',
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText('Attribution is required when a tile server is set'),
    ).toBeInTheDocument();
    expect(m.callsTo('PUT', '/admin/settings/map')).toHaveLength(0);
  });

  it('restores a default after confirmation', async () => {
    const m = setup();
    renderApp('/settings?tab=map');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Restore default' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Restore default' }));
    await waitFor(() => expect(m.callsTo('POST', '/admin/settings/map/reset')).toHaveLength(1));
  });

  it('keeps the rest of the share value when changing the base URL', async () => {
    const m = setup();
    renderApp('/settings?tab=share');
    const user = userEvent.setup();
    const base = await screen.findByLabelText(/Base URL|Share base/i);
    await user.clear(base);
    await user.type(base, 'https://www.evcar.news');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(m.callsTo('PUT', '/admin/settings/share')).toHaveLength(1));
    expect(m.callsTo('PUT', '/admin/settings/share')[0]!.body).toMatchObject({
      baseUrl: 'https://www.evcar.news',
      paths: { article: '/n/{slug}' },
      language: 'auto',
    });
  });

  it('edits app links: validates fingerprints and sends upper-case lists', async () => {
    const m = setup();
    renderApp('/settings?tab=appLinks');
    const user = userEvent.setup();
    const fp = await screen.findByLabelText(/SHA-256 fingerprints/);
    await user.type(fp, 'not-a-fingerprint');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/must be a SHA-256 fingerprint/)).toBeInTheDocument();
    await user.clear(fp);
    const valid = Array.from({ length: 32 }, (_, i) => (i + 10).toString(16).padStart(2, '0'));
    // 95 characters: paste instead of typing key by key (slow on a busy machine).
    await user.click(fp);
    await user.paste(valid.join(':'));
    await user.type(screen.getByLabelText(/Apple team id/), 'ABCDE12345');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(m.callsTo('PUT', '/admin/settings/app-links')).toHaveLength(1));
    expect(m.callsTo('PUT', '/admin/settings/app-links')[0]!.body).toEqual({
      androidPackage: 'news.evcar.app',
      androidSha256CertFingerprints: [valid.join(':').toUpperCase()],
      iosTeamId: 'ABCDE12345',
      iosBundleId: 'news.evcar.app',
      paths: ['/n/*', '/cars/*', '/compare/*'],
    });
  });

  it('is read-only without settings.write', async () => {
    setup(['settings.read']);
    renderApp('/settings?tab=branding');
    expect(await screen.findByText(/Read-only: changing settings requires/)).toBeInTheDocument();
    expect(await screen.findByLabelText(/App name/)).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Upload logo' })).not.toBeInTheDocument();
  });
});

describe('settings helpers', () => {
  it('indexes SettingDto rows by key', () => {
    expect(normalizeSettings([row('a', 1)]).a?.value).toBe(1);
    expect(normalizeSettings({ b: { x: 1 } })).toEqual({});
  });
  it('reads home sections from bare arrays or { sections }', () => {
    const map = normalizeSettings([
      row('home.sections', {
        sections: [
          { key: 'b', order: 2 },
          { key: 'a', order: 1, enabled: false },
        ],
      }),
    ]);
    expect(homeSectionsValue(map)).toEqual([
      { key: 'a', enabled: false, order: 1 },
      { key: 'b', enabled: true, order: 2 },
    ]);
  });
  it('validates tile templates like the API', () => {
    expect(isValidTileTemplate('https://tile.openstreetmap.org/{z}/{x}/{y}.png')).toBe(true);
    expect(isValidTileTemplate('http://tiles.local/{z}/{x}/{y}.png')).toBe(true);
    expect(isValidTileTemplate('ftp://tiles.local/{z}/{x}/{y}.png')).toBe(false);
    expect(isValidTileTemplate('https://tiles.example.com/{z}/{x}.png')).toBe(false);
    expect(sampleTileUrl('https://{s}.tile.example/{z}/{x}/{y}{r}.png')).toBe(
      'https://a.tile.example/3/4/3.png',
    );
  });
});
