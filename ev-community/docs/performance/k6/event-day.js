// k6 scenario: pickup-event day — 50 concurrent operational sessions scanning QR codes, searching members,
// checking payment eligibility and confirming deliveries against a dedicated TEST event with demo orders.
// Requires a staging environment. Never point this at production.
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
    scenarios: { operators: { executor: 'constant-vus', vus: 50, duration: '10m' } },
    thresholds: { http_req_failed: ['rate<0.005'], http_req_duration: ['p(95)<1000'] },
};

const BASE = __ENV.BASE_URL;
const EVENT = __ENV.EVENT_ID; // public id of the test event
const TOKENS = (__ENV.PICKUP_TOKENS || '').split(','); // pickup QR tokens exported from the demo generator

function csrfFrom(html) {
    const m = html.match(/name="csrf-token" content="([^"]+)"/);
    return m ? m[1] : '';
}

export function setup() {
    const jar = http.cookieJar();
    const page = http.get(`${BASE}/admin/login`);
    const token = csrfFrom(page.body);
    http.post(`${BASE}/login`, { email: __ENV.STAFF_EMAIL, password: __ENV.STAFF_PASSWORD, portal: 'admin', _token: token }, { redirects: 0 });
    const dash = http.get(`${BASE}/admin/dashboard`);
    return { cookies: jar.cookiesForURL(BASE), csrf: csrfFrom(dash.body) };
}

export default function (data) {
    const jar = http.cookieJar();
    for (const [name, values] of Object.entries(data.cookies)) jar.set(BASE, name, values[0]);
    const headers = { 'X-CSRF-TOKEN': data.csrf, 'X-Inertia': 'true', 'X-Requested-With': 'XMLHttpRequest' };

    check(http.get(`${BASE}/admin/events/${EVENT}/operations`, { headers }), { 'ops dashboard': (r) => r.status === 200 });
    check(http.get(`${BASE}/admin/members?search=EV-00${Math.floor(Math.random() * 9000) + 1000}`, { headers }), { 'member search': (r) => r.status === 200 });

    const token = TOKENS[Math.floor(Math.random() * TOKENS.length)];
    if (token) {
        const scan = http.post(`${BASE}/admin/deliveries/scan`, JSON.stringify({ token, event_id: EVENT }), { headers: { ...headers, 'Content-Type': 'application/json' } });
        // 200 = ready items shown, 409 = already delivered by another operator (expected under concurrency), never 500
        check(scan, { 'scan handled': (r) => [200, 409, 422].includes(r.status) });
    }
    sleep(1);
}
