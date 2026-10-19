// Alternative to loadtest.mjs (cookie mode only; run mint-sessions.mjs first):
//   k6 run -e BASE_URL=https://staging.example -e COOKIES_FILE=cookies.json tests/load/load.k6.js
//   (or docker run --rm -i -v "$PWD/tests/load:/s" grafana/k6 run -e BASE_URL=... -e COOKIES_FILE=/s/cookies.json - < tests/load/load.k6.js)
import http from 'k6/http';
import { sleep } from 'k6';
import { Counter } from 'k6/metrics';
const c429 = new Counter('http_429');
const data = JSON.parse(open(__ENV.COOKIES_FILE || 'cookies.json'));
const BASE = __ENV.BASE_URL;
// "already submitted" (400) on later iterations of a VU is expected: mark 400 as non-failure only for submit.
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 299 }));
export const options = {
  stages: [{ duration: '2m', target: 1500 }, { duration: '3m', target: 1500 }, { duration: '30s', target: 0 }],
  thresholds: { http_req_duration: ['p(95)<1000'], http_req_failed: ['rate==0'] },
};
const get = (p, ck) => { const r = http.get(BASE + p, { headers: { cookie: ck } }); if (r.status === 429) c429.add(1); return r; };
export default function () {
  const ck = data.students[(__VU - 1) % data.students.length];
  if (__VU % 100 < 2) {
    get('/api/reports/dashboard', data.cc[0]);
    if (data.reportSessionId) get('/api/reports/' + data.reportSessionId, data.cc[0]);
    return sleep(5);
  }
  get('/auth/whoami', ck); sleep(1);
  get('/api/sessions', ck); sleep(1);
  const f = get('/api/sessions/' + data.sessionId, ck);
  const qs = f.json('questions') || [];
  const answers = {};
  qs.forEach((q) => { answers[q.id] = q.kind === 'choice' ? q.options[0] : 'load test'; });
  const s = http.post(BASE + '/api/feedback/submit', JSON.stringify({ session_id: data.sessionId, answers }),
    { headers: { cookie: ck, 'content-type': 'application/json' }, responseCallback: http.expectedStatuses({ min: 200, max: 299 }, 400) });
  if (s.status === 429) c429.add(1);
  sleep(5);
}
