/* Persistent smoke test — run with the server up:  node tests/smoke.js
   Covers: auth guard, Jalgaon-only masters, expanded heads of account,
   letterhead defaults, seed data district, work create/detail/delete,
   and a jsdom SPA run (login page has NO credentials hint; ＋New Work
   opens #/workform/new; Save Work navigates to the detail page). */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const BASE = process.env.BASE || 'http://localhost:3000';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* cookie-jar fetch wrapper */
function makeJar() { const jar = new Map(); return {
  header() { return jar.size ? [...jar].map(([k, v]) => k + '=' + v).join('; ') : ''; },
  absorb(res) { const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    sc.forEach(c => { const kv = c.split(';')[0]; const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); }); },
  clear() { jar.clear(); },
}; }
async function api(jar, method, p, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (jar.header()) headers.Cookie = jar.header();
  const res = await fetch(BASE + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  jar.absorb(res);
  let json = null; try { json = await res.json(); } catch (e) {}
  return { status: res.status, json };
}

async function waitFor(fn, ms = 15000, label = '') {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch (e) {} await sleep(150); }
  throw new Error('timeout waiting for: ' + label);
}

(async () => {
  console.log('— API checks —');
  const jar = makeJar();
  let r = await api(jar, 'GET', '/api/health');
  ok(r.json && r.json.ok, 'GET /api/health');

  r = await api(jar, 'POST', '/api/login', { username: 'admin', password: 'admin123' });
  ok(r.json && r.json.ok, 'login admin/admin123');

  r = await api(jar, 'GET', '/api/meta');
  const meta = r.json.data;
  ok(meta.app.district === 'Jalgaon', 'APP district = Jalgaon');
  ok(/Sub-Division Jalgaon/.test(meta.app.office), 'APP office = Sub-Division Jalgaon');
  const JALGAON_TALUKAS = ['Jalgaon', 'Bhusawal', 'Chalisgaon', 'Pachora', 'Amalner', 'Raver', 'Savda', 'Erandol',
    'Dharangaon', 'Parola', 'Muktainagar', 'Jamner', 'Bhadgaon', 'Chopda', 'Bodvad'];
  ok(meta.masters.talukas.length === 15 && meta.masters.talukas.every(t => JALGAON_TALUKAS.includes(t)),
    'talukas = 15, Jalgaon district only');
  ok(meta.masters.sub_divisions.length === 2 && meta.masters.sub_divisions.every(x => /Jalgaon|Bhusawal/.test(x)),
    'sub-divisions = Jalgaon + Bhusawal only');
  ok(meta.masters.divisions.length && meta.masters.divisions.every(x => x.includes('Dhule')), 'divisions all Dhule');
  ok(meta.masters.heads.length >= 38, 'heads of account >= 38 (BEAMS-style list)');
  ok(meta.masters.heads.some(h => h.startsWith('2059 02 800')) && meta.masters.heads.some(h => h.startsWith('5452')),
    'heads include 2059 02 800 and 5452 capital heads');
  ok(/जळगाव/.test(meta.letterhead.line2), 'letterhead Marathi line mentions जळगाव');
  ok(/Sub-Division Jalgaon/.test(meta.letterhead.line3), 'letterhead English line = Sub-Division Jalgaon');
  ok(/Sub-Divisional Engineer/.test(meta.letterhead.signLeft) && /Division, Dhule/.test(meta.letterhead.signRight),
    'letterhead signatures (SDE Jalgaon / EE Dhule)');

  r = await api(jar, 'GET', '/api/works?limit=500');
  const d = r.json.data; const arr = Array.isArray(d) ? d : (d.works || d.items || []);
  ok(arr.length > 0, 'seeded works present (' + arr.length + ')');
  ok(arr.every(w => w.district === 'Jalgaon'), 'every seeded work district = Jalgaon');
  ok(arr.every(w => (w.division || '').includes('Dhule')), 'every seeded work division = Dhule');
  ok(arr.every(w => JALGAON_TALUKAS.includes(w.taluka)), 'every seeded work taluka in Jalgaon district');

  r = await api(jar, 'POST', '/api/works', {
    work_name: 'Smoke test Jalgaon work', est_number: 'Est/SMOKE/A' + Date.now(), est_year: '2025-26',
    taluka: 'Jalgaon', village: 'Palodhi', district: 'Jalgaon',
    division: 'P.W. Electrical Division, Dhule', sub_division: 'P.W. Electrical Sub-Division, Jalgaon',
    head_of_account: '2059 02 105', nature_of_work: 'New Building Electrification',
    fund_source: 'State Plan (Annual Plan)', est_amount: 1000000,
  });
  const wid = r.json && r.json.ok ? (r.json.data.id || (r.json.data.work && r.json.data.work.id)) : null;
  ok(wid, 'POST /api/works creates work (id=' + wid + ')');
  r = await api(jar, 'GET', '/api/works/' + wid);
  ok(r.json && r.json.ok && r.json.data.work && r.json.data.work.work_name === 'Smoke test Jalgaon work', 'GET /api/works/:id detail');
  r = await api(jar, 'DELETE', '/api/works/' + wid);
  ok(r.json && r.json.ok, 'DELETE /api/works/:id');

  const jar2 = makeJar();
  r = await api(jar2, 'GET', '/api/works');
  ok(r.status === 401, 'unauthenticated /api/works → 401');

  console.log('— SPA checks (jsdom) —');
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const dom = new JSDOM(html, { url: BASE + '/', runScripts: 'dangerously', pretendToBeVisual: true });
  const win = dom.window;
  win.confirm = () => true; win.alert = () => {};
  const sjar = makeJar();
  win.fetch = async (url, opts = {}) => {
    const u = String(url).startsWith('http') ? String(url) : BASE + String(url).replace(/^\./, '');
    const headers = Object.assign({}, opts.headers || {});
    if (sjar.header()) headers.Cookie = sjar.header();
    const res = await fetch(u, { method: opts.method || 'GET', headers, body: opts.body, redirect: 'manual' });
    sjar.absorb(res);
    return res;
  };
  /* load SPA scripts manually (jsdom won't fetch relative srcs) */
  for (const f of ['public/js/util.js', 'public/js/charts.js', 'public/js/app.js']) {
    const code = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    win.eval(code);
  }

  /* login page must NOT show credentials hint */
  await waitFor(() => win.document.querySelector('#view form input[name="username"], #view input[type="password"]'), 10000, 'login form');
  const bodyText = win.document.body.textContent;
  ok(!/admin123/.test(bodyText) && !/First-run default/.test(bodyText), 'login page shows NO username/password hint');
  ok(!win.document.querySelector('.login-hint'), 'no .login-hint element on login page');
  ok(/Sub-Division Jalgaon/.test(bodyText), 'login page subtitle mentions Sub-Division Jalgaon');

  /* log in */
  const uIn = win.document.querySelector('#loginUser');
  const pIn = win.document.querySelector('#loginPass');
  uIn.value = 'admin'; pIn.value = 'admin123';
  uIn.dispatchEvent(new win.Event('input', { bubbles: true }));
  pIn.dispatchEvent(new win.Event('input', { bubbles: true }));
  const form = win.document.querySelector('#loginForm');
  form.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => !win.document.querySelector('input[type="password"]') || /Dashboard|Add Work/i.test(win.document.body.textContent), 15000, 'dashboard after login');
  ok(/Dashboard|Works|Add/i.test(win.document.body.textContent), 'dashboard rendered after login');

  /* ＋ New Work → form */
  win.location.hash = '#/workform/new';
  win.dispatchEvent(new win.HashChangeEvent('hashchange'));
  await waitFor(() => /Add New Work/.test(win.document.body.textContent), 15000, 'Add New Work form');
  ok(/Add New Work/.test(win.document.body.textContent), 'New Work form opens at #/workform/new');

  /* fill minimum fields and save */
  const setField = (name, val) => {
    const el = win.document.querySelector(`[name="${name}"], #f_${name}, [data-field="${name}"]`);
    if (!el) return false;
    el.value = val;
    el.dispatchEvent(new win.Event('input', { bubbles: true }));
    el.dispatchEvent(new win.Event('change', { bubbles: true }));
    return true;
  };
  ok(setField('work_name', 'E2E smoke work, Jalgaon'), 'fill work_name');
  setField('est_number', 'Est/SMOKE/E2E-' + Date.now()); setField('est_year', '2025-26');
  setField('taluka', 'Jalgaon'); setField('village', 'Khirdi'); setField('district', 'Jalgaon');
  setField('division', 'P.W. Electrical Division, Dhule');
  setField('sub_division', 'P.W. Electrical Sub-Division, Jalgaon');
  setField('section', 'P.W. Section, Jalgaon City');
  setField('est_amount', '1200000');
  const saveBtn = [...win.document.querySelectorAll('button')].find(b => /Save Work/i.test(b.textContent) && !/Another/i.test(b.textContent));
  ok(saveBtn, 'Save Work button present');
  saveBtn.click();
  await waitFor(() => /^#\/work\/\d+/.test(win.location.hash), 20000, 'navigation to detail after save');
  ok(/^#\/work\/\d+/.test(win.location.hash), 'Save Work navigates to detail (' + win.location.hash + ')');
  await waitFor(() => /E2E smoke work/.test(win.document.body.textContent), 10000, 'detail shows saved work');
  ok(/E2E smoke work, Jalgaon/.test(win.document.body.textContent), 'detail page shows the saved work');
  ok(/Dhule/.test(win.document.body.textContent), 'detail page shows Dhule division');

  /* dashboard regressions: donut full-ring, taluka table element, blank-status stage */
  const donutHtml = win.eval("Charts.donut([{label:'solo',value:5}],{})");
  ok(/fill-rule="evenodd"/.test(donutHtml), 'single-segment donut draws full ring (even-odd path)');
  ok(!/A95,95 0 1 1 61\.2/.test(donutHtml) && /100%/.test(donutHtml), 'full-ring carries 100% label');
  const multiHtml = win.eval("Charts.donut([{label:'a',value:8,color:'#1b6b34'},{label:'b',value:2,color:'#f2b134'},{label:'c',value:16,color:'#b3261e'}],{})");
  const firstD = (multiHtml.match(/d="([^"]+)"/) || [])[1] || '';
  ok(/^M[\d.\-]+,[\d.\-]+ A95,95 0 [01] 1 /.test(firstD), 'multi-segment donut: outer edge is an arc, not a chord');
  ok((firstD.match(/A95,95/g) || []).length === 1 && (firstD.match(/A/g) || []).length === 2, 'each segment: exactly one outer arc + one inner arc');
  const r2m = await api(jar, 'POST', '/api/works', { work_name: 'Blank status work', est_number: 'Est/SMOKE/B' + Date.now(), est_year: '2025-26', taluka: 'Jalgaon', village: 'Khirdi', district: 'Jalgaon', est_amount: 500000 });
  const bwid = r2m.json && r2m.json.ok ? (r2m.json.data.id || (r2m.json.data.work && r2m.json.data.work.id)) : null;
  const rd = await api(jar, 'GET', '/api/dashboard');
  const dd = rd.json && (rd.json.data.dashboard || rd.json.data);
  const stageNS = dd && dd.stage && dd.stage.find(s => s.label === 'Estimate under Preparation');
  ok(stageNS && stageNS.count >= 1, 'blank work_status lands in first life-cycle stage bucket');
  win.location.hash = '#/'; win.dispatchEvent(new win.HashChangeEvent('hashchange'));
  await waitFor(() => /Taluka Summary Table/.test(win.document.body.textContent), 15000, 'dashboard render');
  ok(!/\[object HTMLDivElement\]/.test(win.document.body.textContent), 'no [object HTMLDivElement] leak on dashboard');
  const sumTbl = [...win.document.querySelectorAll('.card')].find(c => /Taluka Summary Table/.test(c.textContent));
  ok(sumTbl && sumTbl.querySelector('table.tbl tbody tr'), 'taluka summary table renders rows');
  if (bwid) await api(jar, 'DELETE', '/api/works/' + bwid);

  /* cleanup the e2e work */
  const id = Number((win.location.hash.match(/#\/work\/(\d+)/) || [])[1]);
  if (id) await api(jar, 'DELETE', '/api/works/' + id);

  win.close();
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('SMOKE CRASH:', e.message); process.exit(2); });
