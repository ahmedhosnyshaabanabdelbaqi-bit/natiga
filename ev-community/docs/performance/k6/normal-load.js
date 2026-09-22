// k6 scenario: normal member traffic (browse, search, member dashboard, garage, orders, stations list)
// Run: k6 run -e BASE_URL=http://localhost:8000 -e MEMBER_EMAIL=... -e MEMBER_PASSWORD=... normal-load.js
import http from 'k6/http';
import { check, group, sleep } from 'k6';

export const options = {
    scenarios: {
        ramp_100: { executor: 'ramping-vus', startVUs: 0, stages: [{ duration: '2m', target: 100 }, { duration: '5m', target: 100 }, { duration: '1m', target: 0 }] },
        ramp_250: { executor: 'ramping-vus', startVUs: 0, startTime: '9m', stages: [{ duration: '3m', target: 250 }, { duration: '5m', target: 250 }, { duration: '1m', target: 0 }] },
    },
    thresholds: {
        http_req_failed: ['rate<0.01'],
        'http_req_duration{kind:public}': ['p(95)<300'],
        'http_req_duration{kind:auth}': ['p(95)<500', 'p(99)<1000'],
    },
};

const BASE = __ENV.BASE_URL;

function csrfFrom(html) {
    const m = html.match(/name="csrf-token" content="([^"]+)"/);
    return m ? m[1] : '';
}

export function setup() {
    const jar = http.cookieJar();
    const loginPage = http.get(`${BASE}/login`);
    const token = csrfFrom(loginPage.body);
    const res = http.post(`${BASE}/login`, { email: __ENV.MEMBER_EMAIL, password: __ENV.MEMBER_PASSWORD, _token: token }, { redirects: 0 });
    check(res, { 'login redirected': (r) => r.status === 302 });
    return { cookies: jar.cookiesForURL(BASE) };
}

export default function (data) {
    group('public', () => {
        check(http.get(`${BASE}/ar`, { tags: { kind: 'public' } }), { 'home 200': (r) => r.status === 200 });
        check(http.get(`${BASE}/ar/store?search=brake`, { tags: { kind: 'public' } }), { 'store 200': (r) => r.status === 200 });
        check(http.get(`${BASE}/ar/charging-stations?governorate=CAI`, { tags: { kind: 'public' } }), { 'stations 200': (r) => r.status === 200 });
    });
    group('member', () => {
        const jar = http.cookieJar();
        for (const [name, values] of Object.entries(data.cookies)) jar.set(BASE, name, values[0]);
        for (const path of ['/account', '/account/garage', '/account/orders', '/account/payments', '/account/notifications']) {
            check(http.get(`${BASE}${path}`, { tags: { kind: 'auth' }, headers: { 'X-Inertia': 'true', 'X-Inertia-Version': '' } }), { [`${path} ok`]: (r) => r.status === 200 || r.status === 409 });
        }
    });
    sleep(Math.random() * 3 + 1);
}
