import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { makeSession, makeUser } from '@/test/fixtures';
import { errorBody, json, mockFetch } from '@/test/mockFetch';
import { renderApp } from '@/test/render';
import { integrationHealth, normalizeIntegrations, type IntegrationStatus } from './api';

// Shapes copied from the real GET /admin/system/integrations and /jobs responses.
const item = (i: Partial<IntegrationStatus> & Pick<IntegrationStatus, 'id' | 'type' | 'name'>) =>
  ({ configured: true, enabled: true, checkable: false, ...i }) satisfies IntegrationStatus;

const integrations = {
  items: [
    item({
      id: 'storage.local',
      type: 'storage',
      name: 'local',
      checkable: true,
      notes: ['Files are stored on this server’s disk.'],
      lastSuccessAt: '2026-09-24T10:00:00Z',
    }),
    item({
      id: 'stations.open_charge_map',
      type: 'stations',
      name: 'open_charge_map',
      configured: false,
      enabled: false,
      reason: 'OCM_API_KEY is not set.',
      attribution: '© Open Charge Map contributors',
    }),
    item({
      id: 'mail.smtp',
      type: 'mail',
      name: 'smtp',
      checkable: true,
      lastError: 'ECONNREFUSED',
      lastErrorAt: '2026-09-24T11:00:00Z',
      lastSuccessAt: '2026-09-20T00:00:00Z',
    }),
    item({
      id: 'push.fcm',
      type: 'push',
      name: 'fcm',
      configured: false,
      enabled: false,
      reason: 'FCM_SERVICE_ACCOUNT_JSON is not set.',
    }),
  ],
  capabilities: {
    routing: false,
    geocoding: false,
    assistant: false,
    push: false,
    liveAvailability: false,
    stationsSync: false,
  },
  note: 'Last success/error are tracked per API instance since its start.',
};

const counts = (failed: number) => ({
  waiting: 2,
  active: 1,
  completed: 10,
  failed,
  delayed: 0,
  prioritized: 0,
  'waiting-children': 0,
});

function setup(extra: Record<string, unknown> = {}, permissions?: string[]) {
  return mockFetch({
    'POST /auth/refresh': json(200, makeSession(makeUser(permissions ? { permissions } : {}))),
    'GET /admin/system/integrations': json(200, { data: integrations }),
    'GET /admin/system/jobs': json(200, {
      data: {
        redis: 'up',
        workersEnabledHere: true,
        queues: [
          { name: 'media-processing', counts: counts(3), isPaused: false, workers: 1 },
          { name: 'imports', counts: counts(0), isPaused: true, workers: 0 },
        ],
      },
    }),
    'GET /admin/system/jobs/media-processing': json(200, {
      data: [
        {
          id: '9',
          name: 'tiles',
          queue: 'media-processing',
          state: 'failed',
          attemptsMade: 3,
          maxAttempts: 3,
          progress: {},
          failedReason: 'corrupt image',
          createdAt: null,
          processedAt: null,
          finishedAt: '2026-09-24T09:00:00Z',
          delayUntil: null,
        },
      ],
      meta: { page: 1, pageSize: 5, total: 1, totalPages: 1 },
    }),
    'POST /admin/system/integrations/storage.local/check': json(200, {
      data: { ok: true, latencyMs: 9.4 },
    }),
    ...extra,
  });
}

describe('System page', () => {
  it('shows each provider state with its reason, notes and attribution', async () => {
    setup();
    renderApp('/system');
    const ocm = await screen.findByTestId('integration-stations.open_charge_map');
    expect(within(ocm).getByText('Not configured')).toBeInTheDocument();
    expect(within(ocm).getByText('OCM_API_KEY is not set.')).toBeInTheDocument();
    expect(within(ocm).getByText(/© Open Charge Map contributors/)).toBeInTheDocument();
    expect(within(ocm).getByText('Open Charge Map')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('integration-mail.smtp')).getByText('Failing'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('integration-storage.local')).getByText('Configured'),
    ).toBeInTheDocument();
    // Capabilities are spelled out (not colour only).
    expect(screen.getByText(/Live charger availability: not available/)).toBeInTheDocument();
  });

  it('lists queues with counts, paused state and the latest failures', async () => {
    const m = setup();
    renderApp('/system');
    expect(await screen.findByText('corrupt image')).toBeInTheDocument();
    expect(screen.getByText('Paused')).toBeInTheDocument();
    // Failures are only fetched for queues that report some.
    expect(m.callsTo('GET', '/admin/system/jobs/media-processing')[0]!.search.get('state')).toBe(
      'failed',
    );
    expect(m.callsTo('GET', '/admin/system/jobs/imports')).toHaveLength(0);
  });

  it('runs a live check for checkable providers', async () => {
    const m = setup();
    renderApp('/system');
    const user = userEvent.setup();
    const card = await screen.findByTestId('integration-storage.local');
    await user.click(within(card).getByRole('button', { name: 'Run check' }));
    await waitFor(() =>
      expect(m.callsTo('POST', '/admin/system/integrations/storage.local/check')).toHaveLength(1),
    );
    expect(await within(card).findByText('Check passed (9 ms)')).toBeInTheDocument();
    // Not offered for unconfigured / non-checkable providers.
    expect(
      within(screen.getByTestId('integration-stations.open_charge_map')).queryByRole('button', {
        name: 'Run check',
      }),
    ).not.toBeInTheDocument();
  });

  it('warns when Redis is down and shows counts as unknown', async () => {
    setup({
      'GET /admin/system/jobs': json(200, {
        data: {
          redis: 'down',
          workersEnabledHere: true,
          queues: [{ name: 'imports', counts: null, isPaused: null, workers: null }],
        },
      }),
    });
    renderApp('/system');
    expect(await screen.findByText(/Redis is unreachable/)).toBeInTheDocument();
  });

  it('surfaces API errors instead of empty data', async () => {
    setup({
      'GET /admin/system/jobs': json(403, errorBody('FORBIDDEN', 'You do not have permission.')),
    });
    renderApp('/system');
    expect(await screen.findByText('You do not have permission.')).toBeInTheDocument();
  });
});

describe('Dashboard', () => {
  const overview = {
    generatedAt: '2026-09-25T07:40:53.702Z',
    environment: 'development',
    counts: {
      users: 2,
      articles: { draft: 3, published: 10 },
      vehicles: { brands: {}, models: {}, variants: {} },
      stationsByPublication: {},
      stationsBySource: {},
      tours: {},
      media: {},
      openStationReports: 1,
      pendingReviews: 0,
      pendingComments: 0,
      demoRows: { articles: 1, stations: 0, variants: 0, prices: 0 },
    },
    staleData: {
      thresholds: {
        stationVerificationDays: 180,
        priceAgeDays: 180,
        rssSuccessHours: 48,
        mediaStuckHours: 1,
      },
      stationsNotRecentlyVerified: 0,
      pricesOutdated: 2,
      specsUnverified: 0,
      rssFeedsFailing: 0,
      mediaStuck: 0,
    },
    jobs: { redis: 'up', failedJobs: 0, queues: [] },
    imports: { running: 0, failedLast7Days: 0, recent: [] },
    integrations: { total: 4, notConfigured: ['stations.open_charge_map', 'push.fcm'] },
    warnings: ['outdated_prices'],
  };
  const health = {
    status: 'ok',
    version: '0.1.0',
    environment: 'development',
    uptimeSeconds: 90061,
    timestamp: '2026-09-25T07:40:53.702Z',
    checks: {
      database: { status: 'up', latencyMs: 2.3 },
      redis: { status: 'up', latencyMs: 1.1 },
      storage: { status: 'down', error: 'EACCES' },
    },
  };

  it('renders the real overview: health, totals with breakdown, freshness, warnings, demo rows', async () => {
    setup({
      'GET /admin/system/overview': json(200, { data: overview }),
      'GET /health': json(200, { data: health }),
    });
    renderApp('/');
    expect(await screen.findByText('0.1.0')).toBeInTheDocument();
    expect(screen.getByText('1d 1h 1m')).toBeInTheDocument();
    expect(screen.getByText(/Storage: down/)).toBeInTheDocument();
    // Number + unit are wrapped in LRI…PDI so they stay in order inside RTL text.
    expect(screen.getByText(/Database: up · \u20662 ms\u2069/)).toBeInTheDocument();
    expect(await screen.findByText('Some current prices are old.')).toBeInTheDocument();
    expect(screen.getByText(/Demo rows \(is_demo\).*articles: 1/)).toBeInTheDocument();
    expect(screen.getByText('draft 3 · published 10')).toBeInTheDocument();
    expect(screen.getByText('current prices older than 180 days')).toBeInTheDocument();
    // Integrations summary uses the items list.
    expect(await screen.findByText('push.fcm')).toBeInTheDocument();
  });

  it('shows only what the role may read', async () => {
    setup({}, ['integrations.read']);
    renderApp('/');
    expect(await screen.findByText('push.fcm')).toBeInTheDocument();
    expect(screen.queryByText('System overview')).not.toBeInTheDocument();
  });
});

describe('system helpers', () => {
  it('normalises the IntegrationsDto and sorts by type', () => {
    const r = normalizeIntegrations(integrations);
    expect(r.items.map((i) => i.id)).toEqual([
      'mail.smtp',
      'push.fcm',
      'stations.open_charge_map',
      'storage.local',
    ]);
    expect(r.capabilities?.routing).toBe(false);
    expect(normalizeIntegrations(null)).toEqual({ items: [], capabilities: null, note: null });
  });
  it('derives health from configuration and last success/error', () => {
    const base = item({ id: 'x.y', type: 'x', name: 'y' });
    expect(integrationHealth(base)).toBe('ok');
    expect(integrationHealth({ ...base, configured: false })).toBe('not_configured');
    expect(integrationHealth({ ...base, enabled: false })).toBe('disabled');
    expect(
      integrationHealth({
        ...base,
        lastError: 'x',
        lastErrorAt: '2026-01-02',
        lastSuccessAt: '2026-01-01',
      }),
    ).toBe('error');
    expect(
      integrationHealth({
        ...base,
        lastError: 'x',
        lastErrorAt: '2026-01-01',
        lastSuccessAt: '2026-01-02',
      }),
    ).toBe('ok');
  });
});
