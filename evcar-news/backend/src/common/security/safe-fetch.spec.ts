import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isPublicUnicastAddress, SafeFetcher, SafeFetchError, type Resolver } from './safe-fetch';

describe('isPublicUnicastAddress', () => {
  it.each([
    '127.0.0.1',
    '127.255.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254', // cloud metadata
    '100.64.0.1', // CGNAT
    '100.100.100.200', // Alibaba metadata (CGNAT range)
    '0.0.0.0',
    '0.1.2.3',
    '224.0.0.1',
    '255.255.255.255',
    '192.0.2.1',
    '198.18.0.1',
    '240.0.0.1',
    '::',
    '::1',
    'fe80::1',
    'fc00::1',
    'fd00:ec2::254', // AWS IPv6 metadata
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.1',
    '64:ff9b::a00:1', // NAT64
    '2002:7f00:1::', // 6to4 of 127.0.0.1
    '2001::1', // Teredo
    '2001:db8::1',
    'ff02::1',
    '::7f00:1', // IPv4-compatible ::127.0.0.1 (::/96)
    '::127.0.0.1',
    '::a9fe:a9fe', // ::169.254.169.254
    '::a00:1', // ::10.0.0.1
    '::808:808', // even ::8.8.8.8 is not a routable IPv6 address
    '100::1', // discard-only
    '3fff::1', // documentation prefix 3fff::/20 (RFC 9637)
    '4000::1', // outside 2000::/3
    'not-an-ip',
  ])('blocks %s', (address) => {
    expect(isPublicUnicastAddress(address)).toBe(false);
  });

  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '151.101.1.69',
    '2606:4700:4700::1111',
    '2a00:1450:4001:80b::200e',
    '::ffff:8.8.8.8',
  ])('allows %s', (address) => {
    expect(isPublicUnicastAddress(address)).toBe(true);
  });
});

function mapResolver(map: Record<string, string[]>): Resolver {
  return (hostname) => {
    const addrs = map[hostname];
    if (!addrs) return Promise.reject(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }));
    return Promise.resolve(
      addrs.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })),
    );
  };
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(SafeFetchError);
  await expect(promise).rejects.toMatchObject({ code });
}

describe('SafeFetcher URL/address validation (default policy)', () => {
  const fetcher = new SafeFetcher({
    timeoutMs: 2000,
    maxBytes: 1024,
    maxRedirects: 3,
    userAgent: 'test',
    resolver: mapResolver({
      'private.example': ['10.0.0.5'],
      'mixed.example': ['93.184.216.34', '127.0.0.1'],
      'metadata.example': ['169.254.169.254'],
      'v6local.example': ['::1'],
    }),
  });
  afterAll(() => fetcher.close());

  it('rejects non-https URLs', async () => {
    await expectCode(fetcher.fetch('http://example.com/feed'), 'PROTOCOL_NOT_ALLOWED');
    await expectCode(fetcher.fetch('file:///etc/passwd'), 'PROTOCOL_NOT_ALLOWED');
    await expectCode(fetcher.fetch('gopher://example.com'), 'PROTOCOL_NOT_ALLOWED');
  });

  it('rejects invalid URLs, credentials and non-443 ports', async () => {
    await expectCode(fetcher.fetch('not a url'), 'INVALID_URL');
    await expectCode(fetcher.fetch('https://user:pw@example.com/'), 'CREDENTIALS_IN_URL');
    await expectCode(fetcher.fetch('https://example.com:8443/'), 'PORT_NOT_ALLOWED');
  });

  it('rejects localhost-style host names', async () => {
    await expectCode(fetcher.fetch('https://localhost/'), 'HOST_NOT_ALLOWED');
    await expectCode(fetcher.fetch('https://printer.local/'), 'HOST_NOT_ALLOWED');
    await expectCode(fetcher.fetch('https://api.internal/'), 'HOST_NOT_ALLOWED');
  });

  it.each([
    'https://127.0.0.1/',
    'https://2130706433/', // decimal 127.0.0.1
    'https://0x7f.0.0.1/', // hex
    'https://127.1/',
    'https://[::1]/',
    'https://[::ffff:127.0.0.1]/',
    'https://169.254.169.254/latest/meta-data/',
    'https://10.0.0.1/',
    'https://[fd00:ec2::254]/',
  ])('rejects IP literal %s', async (url) => {
    await expectCode(fetcher.fetch(url), 'BLOCKED_ADDRESS');
  });

  it('rejects host names that resolve to private addresses (any record)', async () => {
    await expectCode(fetcher.fetch('https://private.example/'), 'BLOCKED_ADDRESS');
    await expectCode(fetcher.fetch('https://mixed.example/'), 'BLOCKED_ADDRESS');
    await expectCode(fetcher.fetch('https://metadata.example/'), 'BLOCKED_ADDRESS');
    await expectCode(fetcher.fetch('https://v6local.example/'), 'BLOCKED_ADDRESS');
  });

  it('reports DNS failures', async () => {
    await expectCode(fetcher.fetch('https://does-not-exist.example/'), 'DNS_FAILED');
  });

  it('assertUrlAllowed validates without fetching', async () => {
    await expect(fetcher.assertUrlAllowed('https://private.example/x')).rejects.toMatchObject({
      code: 'BLOCKED_ADDRESS',
    });
  });

  it('rejects IPv4-compatible IPv6 literals (the URL parser rewrites [::127.0.0.1] to [::7f00:1])', async () => {
    for (const url of [
      'https://[::127.0.0.1]/',
      'https://[::7f00:1]/',
      'https://[::169.254.169.254]/',
    ]) {
      await expect(fetcher.assertUrlAllowed(url)).rejects.toMatchObject({
        code: 'BLOCKED_ADDRESS',
      });
    }
  });
});

function hasOpenssl(): boolean {
  try {
    execFileSync('openssl', ['version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const describeTls = hasOpenssl() ? describe : describe.skip;
if (!hasOpenssl()) {
  console.warn('openssl not found: skipping SafeFetcher HTTPS integration tests');
}

describeTls('SafeFetcher against a local HTTPS server', () => {
  let dir: string;
  let server: Server;
  let port: number;
  let fetcher: SafeFetcher;
  const HOST = 'safe-fetch.test';
  const INTERNAL = 'internal.test';
  const OTHER = 'other-origin.test';

  beforeAll(async () => {
    // Throwaway self-signed certificate generated for this test run only.
    dir = mkdtempSync(join(tmpdir(), 'evcar-safefetch-'));
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-sha256',
        '-days',
        '1',
        '-keyout',
        join(dir, 'key.pem'),
        '-out',
        join(dir, 'cert.pem'),
        '-subj',
        `/CN=${HOST}`,
        '-addext',
        `subjectAltName=DNS:${HOST},DNS:${INTERNAL},DNS:${OTHER}`,
      ],
      { stdio: 'ignore' },
    );
    const key = readFileSync(join(dir, 'key.pem'));
    const cert = readFileSync(join(dir, 'cert.pem'));

    server = createServer({ key, cert }, (req, res) => {
      const base = `https://${HOST}:${port}`;
      if (req.url === '/echo') {
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          res.writeHead(200, { 'content-type': 'application/json' }).end(
            JSON.stringify({
              host: req.headers.host,
              method: req.method,
              headers: req.headers,
              body: Buffer.concat(chunks).toString('utf8'),
            }),
          );
        });
        return;
      }
      switch (req.url) {
        case '/redirect-other-302':
          res.writeHead(302, { location: `https://${OTHER}:${port}/echo` }).end();
          return;
        case '/redirect-other-307':
          res.writeHead(307, { location: `https://${OTHER}:${port}/echo` }).end();
          return;
        case '/redirect-same-307':
          res.writeHead(307, { location: '/echo' }).end();
          return;
        case '/ok':
          res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
          return;
        case '/redirect-ok':
          res.writeHead(302, { location: '/ok' }).end();
          return;
        case '/redirect-internal':
          res.writeHead(302, { location: `https://${INTERNAL}:${port}/ok` }).end();
          return;
        case '/redirect-metadata':
          res.writeHead(301, { location: 'https://169.254.169.254/latest/meta-data/' }).end();
          return;
        case '/redirect-http':
          res.writeHead(302, { location: `http://${HOST}:${port}/ok` }).end();
          return;
        case '/loop':
          res.writeHead(302, { location: `${base}/loop` }).end();
          return;
        case '/big-declared':
          res.writeHead(200, { 'content-length': String(4096) }).end(Buffer.alloc(4096));
          return;
        case '/big-chunked':
          res.writeHead(200);
          for (let i = 0; i < 8; i++) res.write(Buffer.alloc(1024));
          res.end();
          return;
        case '/slow':
          // Never responds.
          return;
        default:
          res.writeHead(404).end('nope');
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;

    fetcher = new SafeFetcher({
      timeoutMs: 1500,
      maxBytes: 2048,
      maxRedirects: 3,
      userAgent: 'EVCarNewsBot/test',
      allowedPorts: [port],
      ca: cert,
      // Test policy: only the local test server is "public"; everything else,
      // including 10.0.0.0/8 used by INTERNAL, stays blocked.
      addressPolicy: (address) => address === '127.0.0.1',
      resolver: mapResolver({
        [HOST]: ['127.0.0.1'],
        [INTERNAL]: ['10.0.0.7'],
        [OTHER]: ['127.0.0.1'],
      }),
    });
  });

  afterAll(async () => {
    await fetcher?.close();
    server?.closeAllConnections();
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('fetches an allowed URL', async () => {
    const res = await fetcher.fetch(`https://${HOST}:${port}/ok`);
    expect(res.status).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(res.contentType).toBe('application/json');
  });

  it('follows safe redirects and reports them', async () => {
    const res = await fetcher.fetch(`https://${HOST}:${port}/redirect-ok`);
    expect(res.status).toBe(200);
    expect(res.url).toBe(`https://${HOST}:${port}/ok`);
    expect(res.redirects).toEqual([`https://${HOST}:${port}/ok`]);
  });

  it('re-validates every redirect hop', async () => {
    await expectCode(fetcher.fetch(`https://${HOST}:${port}/redirect-internal`), 'BLOCKED_ADDRESS');
    await expectCode(
      fetcher.fetch(`https://${HOST}:${port}/redirect-metadata`),
      'PORT_NOT_ALLOWED',
    );
    await expectCode(
      fetcher.fetch(`https://${HOST}:${port}/redirect-http`),
      'PROTOCOL_NOT_ALLOWED',
    );
  });

  describe('credentials never follow a redirect to another origin', () => {
    const secrets = {
      'X-API-Key': 'OCM-SECRET-KEY',
      Authorization: 'Bearer FCM-ACCESS-TOKEN',
      Cookie: 'sid=1',
      'Proxy-Authorization': 'Basic eDp5',
      'X-Custom-Secret': 's3cr3t',
      'Accept-Language': 'ar',
    };
    type Echo = { host: string; method: string; headers: Record<string, string>; body: string };

    it('drops auth headers on a cross-origin 302 (GET)', async () => {
      const res = await fetcher.fetch(`https://${HOST}:${port}/redirect-other-302`, {
        headers: secrets,
      });
      const echo = res.json<Echo>();
      expect(echo.host).toBe(`${OTHER}:${port}`);
      for (const h of [
        'x-api-key',
        'authorization',
        'cookie',
        'proxy-authorization',
        'x-custom-secret',
      ]) {
        expect(echo.headers[h]).toBeUndefined();
      }
      expect(echo.headers['accept-language']).toBe('ar');
    });

    it('turns a cross-origin 307 POST into a GET without body or secrets', async () => {
      const res = await fetcher.fetch(`https://${HOST}:${port}/redirect-other-307`, {
        method: 'POST',
        headers: { ...secrets, 'content-type': 'application/json' },
        body: '{"message":"secret payload"}',
      });
      const echo = res.json<Echo>();
      expect(echo.method).toBe('GET');
      expect(echo.body).toBe('');
      expect(echo.headers.authorization).toBeUndefined();
      expect(echo.headers['x-api-key']).toBeUndefined();
      expect(echo.headers['content-type']).toBeUndefined();
    });

    it('keeps method, body and headers on a same-origin 307', async () => {
      const res = await fetcher.fetch(`https://${HOST}:${port}/redirect-same-307`, {
        method: 'POST',
        headers: { Authorization: 'Bearer same-origin', 'content-type': 'application/json' },
        body: '{"a":1}',
      });
      const echo = res.json<Echo>();
      expect(echo).toMatchObject({ method: 'POST', body: '{"a":1}' });
      expect(echo.headers.authorization).toBe('Bearer same-origin');
    });

    it('maxRedirects: 0 refuses any redirect', async () => {
      await expectCode(
        fetcher.fetch(`https://${HOST}:${port}/redirect-same-307`, { maxRedirects: 0 }),
        'TOO_MANY_REDIRECTS',
      );
    });
  });

  it('limits redirects', async () => {
    await expectCode(fetcher.fetch(`https://${HOST}:${port}/loop`), 'TOO_MANY_REDIRECTS');
  });

  it('limits response size (declared and streamed)', async () => {
    await expectCode(fetcher.fetch(`https://${HOST}:${port}/big-declared`), 'RESPONSE_TOO_LARGE');
    await expectCode(fetcher.fetch(`https://${HOST}:${port}/big-chunked`), 'RESPONSE_TOO_LARGE');
  });

  it('times out', async () => {
    await expectCode(fetcher.fetch(`https://${HOST}:${port}/slow`, { timeoutMs: 300 }), 'TIMEOUT');
  });

  it('returns non-2xx statuses to the caller unless asked to throw', async () => {
    const res = await fetcher.fetch(`https://${HOST}:${port}/missing`);
    expect(res.status).toBe(404);
    await expectCode(
      fetcher.fetch(`https://${HOST}:${port}/missing`, { throwOnHttpError: true }),
      'NETWORK_ERROR',
    );
  });
});
