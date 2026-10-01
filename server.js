'use strict';
/* ============================================================
   PWD Electrical Works – Progress Tracker  |  Express server
   REST API + PDF/Excel report endpoints + import engine
   ============================================================ */
const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');

const D = require('./lib/db');
const A = require('./lib/agg');
const C = require('./lib/config');
const PDF = require('./lib/pdf');
const XLSX = require('./lib/xlsx');
const SEED = require('./lib/seed');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

/* ================================================================= AUTH
   Single/multi-user login with scrypt-hashed password + in-memory sessions.
   Default first-run credentials: admin / admin123  (change in Settings ▸ Security) */
const SESSIONS = new Map();           /* token -> { user, exp } */
const SESS_HOURS = 12;
const hashPw = (pw, salt) => crypto.scryptSync(String(pw), salt, 64).toString('hex');
function storePw(pw) { const salt = crypto.randomBytes(16).toString('hex'); D.setSetting('auth_hash', salt + '$' + hashPw(pw, salt)); }
function verifyPw(pw) {
  const stored = D.getSetting('auth_hash', '');
  const [salt, hash] = stored.split('$');
  if (!salt || !hash) return false;
  const h = hashPw(pw, salt);
  return h.length === hash.length && crypto.timingSafeEqual(Buffer.from(h), Buffer.from(hash));
}
const sessToken = (req) => { const m = /(?:^|;\s*)pwd_sid=([^;]+)/.exec(req.headers.cookie || ''); return m && m[1]; };
function authInit() {
  if (!D.getSetting('auth_hash')) { storePw('admin123'); D.setSetting('auth_user', 'admin'); D.setSetting('auth_default', '1'); }
}
authInit();
app.use('/api', (req, res, next) => {
  const open = req.path === '/login' || req.path === '/logout' || req.path === '/session' || req.path === '/health';
  if (open) return next();
  const t = sessToken(req); const sess = t && SESSIONS.get(t);
  if (!sess || sess.exp < Date.now()) {
    if (t) SESSIONS.delete(t);
    return res.status(401).json({ ok: false, error: 'Not logged in – please sign in' });
  }
  req.session = sess; next();
});
app.post('/api/login', (req, res) => {
  const { username = '', password = '' } = req.body || {};
  const user = D.getSetting('auth_user', 'admin');
  if (String(username).trim() !== user || !verifyPw(password)) { D.log('LOGIN-FAIL', 'auth', '', `Failed login attempt for "${username}"`); return bad(res, 'Invalid username or password', 401); }
  const token = crypto.randomBytes(24).toString('hex');
  SESSIONS.set(token, { user, exp: Date.now() + SESS_HOURS * 3600e3 });
  res.setHeader('Set-Cookie', `pwd_sid=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESS_HOURS * 3600}`);
  D.log('LOGIN', 'auth', '', `Signed in: ${user}`);
  ok(res, { user });
});
app.post('/api/logout', (req, res) => {
  const t = sessToken(req); if (t) SESSIONS.delete(t);
  res.setHeader('Set-Cookie', 'pwd_sid=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0');
  D.log('LOGOUT', 'auth', '', 'Signed out');
  ok(res, null, { message: 'Signed out' });
});
app.get('/api/session', (req, res) => {
  const t = sessToken(req); const sess = t && SESSIONS.get(t);
  if (!sess || sess.exp < Date.now()) return res.status(401).json({ ok: false, error: 'No session' });
  ok(res, { user: sess.user, default_password: D.getSetting('auth_default', '1') === '1' });
});
app.put('/api/auth', (req, res) => {
  const { current = '', username, password } = req.body || {};
  if (!verifyPw(current)) return bad(res, 'Current password is incorrect', 403);
  if (username !== undefined && String(username).trim()) D.setSetting('auth_user', String(username).trim());
  if (password !== undefined && String(password).length) {
    if (String(password).length < 6) return bad(res, 'New password must be at least 6 characters');
    storePw(password); D.setSetting('auth_default', '0');
  }
  SESSIONS.clear();
  D.log('AUTH-CHANGE', 'auth', '', 'Login credentials updated (all sessions signed out)');
  ok(res, null, { message: 'Credentials updated – please sign in again' });
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const BACKUP_DIR = path.join(__dirname, 'data', 'backups');
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

const ok = (res, data, extra) => res.json(Object.assign({ ok: true }, extra || {}, data ? { data } : {}));
const bad = (res, msg, code = 400) => res.status(code).json({ ok: false, error: msg });
const wrap = (fn) => (req, res) => { try { const r = fn(req, res); if (r && r.catch) r.catch(e => { console.error(e); bad(res, e.message, e.status || 500); }); } catch (e) { console.error(e); bad(res, e.message, e.status || 500); } };

const num = (v) => { if (v === '' || v === null || v === undefined) return 0; const x = Number(String(v).replace(/[,₹\s]/g, '')); return Number.isFinite(x) ? x : 0; };
const pct = (v) => { const x = num(v); return Math.max(0, Math.min(100, x)); };
const dte = (v) => { if (!v) return ''; if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10); const s = String(v).trim(); if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10); const d = new Date(s); return isNaN(d) ? s.slice(0, 10) : d.toISOString().slice(0, 10); };

/* ---------------- normalisation of a work payload ---------------- */
function normalise(p, existing = {}) {
  const w = Object.assign({}, existing);
  const set = (k, v) => { if (v !== undefined) w[k] = v; };
  const STR = ['work_name', 'work_name_mr', 'est_number', 'est_year', 'work_type', 'nature_of_work', 'head_desc', 'head_type',
    'scheme_name', 'village', 'district', 'circle', 'user_department', 'sanctioning_authority', 'aa_number', 'ts_number',
    'revised_est_number', 'budget_head', 'tender_type', 'tender_number', 'agreement_number', 'contractor_name', 'contractor_class',
    'contractor_contact', 'wo_number', 'delay_reason', 'stalled_reason', 'remarks', 'lat', 'lng', 'mb_status', 'sd_status',
    'fund_source', 'division', 'sub_division', 'section', 'priority'];
  STR.forEach(k => { if (p[k] !== undefined) w[k] = String(p[k]).trim(); });

  ['taluka', 'head_of_account', 'work_status', 'bill_status', 'utility_connection', 'quality_inspection', 'financial_year']
    .forEach(k => { if (p[k] !== undefined) w[k] = String(p[k]).trim(); });

  const NUMS = ['aa_amount', 'ts_amount', 'est_amount', 'revised_est_amount', 'budget_provision', 'wo_amount',
    'physical_progress', 'financial_progress', 'amount_paid'];
  NUMS.forEach(k => { if (p[k] !== undefined) w[k] = num(p[k]); });
  ['physical_progress', 'financial_progress'].forEach(k => { if (w[k] !== undefined) w[k] = pct(w[k]); });
  const DATES = ['aa_date', 'ts_date', 'tender_date', 'agreement_date', 'wo_date', 'site_handover_date',
    'target_date', 'extended_target_date'];
  DATES.forEach(k => { if (p[k] !== undefined) w[k] = dte(p[k]); });
  ['stalled', 'is_delayed'].forEach(k => { if (p[k] !== undefined) w[k] = p[k] === true || p[k] === 1 || p[k] === '1' || p[k] === 'Yes' || p[k] === 'yes' ? 1 : 0; });

  /* automation: estimate amount mirrors TS amount */
  if (p.est_amount === undefined && p.ts_amount !== undefined) w.est_amount = num(p.ts_amount);
  if (p.ts_amount === undefined && p.est_amount !== undefined) w.ts_amount = num(p.est_amount);
  if (p.aa_amount === undefined && !w.aa_amount && w.est_amount) w.aa_amount = w.est_amount;
  /* head description auto-fill */
  if (w.head_of_account) {
    const h = C.HEADS_OF_ACCOUNT.find(x => x.code === String(w.head_of_account).trim());
    if (h) { w.head_desc = h.desc; w.head_type = h.type; if (!w.budget_head) w.budget_head = h.code; }
  }
  if (!w.district) w.district = C.APP.district;
  if (!w.est_year && w.financial_year) w.est_year = w.financial_year;
  return w;
}

function validate(w) {
  const errs = [];
  if (!w.work_name || String(w.work_name).trim().length < 3) errs.push('Work name is required (min 3 characters).');
  if (w.physical_progress < 0 || w.physical_progress > 100) errs.push('Physical progress must be 0-100.');
  ['aa_amount', 'est_amount', 'ts_amount', 'wo_amount', 'amount_paid'].forEach(k => { if (num(w[k]) < 0) errs.push(`${k} cannot be negative.`); });
  if (w.target_date && w.wo_date && w.target_date < w.wo_date) errs.push('Target date is earlier than work order date.');
  if (w.aa_date && w.ts_date && w.aa_date < w.ts_date) errs.push('AA date is earlier than TS date.');
  return errs;
}

/* ================================================================= API: meta */
app.get('/api/meta', wrap((req, res) => {
  const m = D.masters();
  ok(res, {
    app: C.APP, masters: m, rules: C.RULES, reports: C.REPORTS,
    letterhead: D.getJSON('letterhead', C.DEFAULT_LETTERHEAD),
    counts: {
      works: D.db.prepare('SELECT COUNT(*) c FROM works WHERE COALESCE(is_deleted,0)=0').get().c,
      bills: D.db.prepare('SELECT COUNT(*) c FROM bills').get().c,
      milestones: D.db.prepare('SELECT COUNT(*) c FROM milestones').get().c,
      deleted: D.db.prepare('SELECT COUNT(*) c FROM works WHERE COALESCE(is_deleted,0)=1').get().c,
    },
    years: D.db.prepare("SELECT DISTINCT COALESCE(NULLIF(financial_year,''), est_year) y FROM works WHERE is_deleted=0 AND y<>'' ORDER BY y").all().map(r => r.y),
  });
}));

/* ================================================================= API: works */
app.get('/api/works', wrap((req, res) => {
  const rows = A.applyFilters(D.getAllFull(), req.query);
  const sorted = rows.sort((a, b) => {
    const by = req.query.sort || 'taluka', dir = req.query.dir === 'desc' ? -1 : 1;
    const key = { taluka: r => (r.taluka || 'zzz') + '|' + r.work_name, amount: r => -r.effective_amount,
      status: r => (C.WORK_STATUS.find(s => s.v === r.work_status) || {}).order || 99, target: r => r.effective_target || '9999',
      delay: r => -r.delay_days, name: r => r.work_name, head: r => r.head_of_account, contractor: r => r.contractor_name,
      paid: r => -r.amount_paid, id: r => r.id }[by] || (r => r.id);
    const ka = key(a), kb = key(b);
    return (typeof ka === 'number' ? ka - kb : String(ka).localeCompare(String(kb))) * dir;
  });
  const grouped = {};
  sorted.forEach(w => { const k = w.taluka || '— Not assigned —'; (grouped[k] = grouped[k] || []).push(w); });
  ok(res, { works: sorted, grouped, totals: A.totals(sorted), count: sorted.length });
}));

app.get('/api/works/:id', wrap((req, res) => {
  const w = D.getWorkFull(req.params.id);
  if (!w) return bad(res, 'Work not found', 404);
  ok(res, {
    work: w, bills: D.getBills(w.id), milestones: D.getMilestones(w.id),
    documents: D.getDocuments(w.id), notes: D.getNotes(w.id), progress: D.getProgressLog(w.id),
  });
}));

app.post('/api/works', wrap((req, res) => {
  const p = req.body || {};
  const w = normalise(p, {});
  const errs = validate(w);
  if (errs.length) return bad(res, errs.join(' '));
  /* duplicate estimate number check */
  if (w.est_number) {
    const dup = D.db.prepare('SELECT id,work_name FROM works WHERE est_number=? AND COALESCE(is_deleted,0)=0').get(w.est_number);
    if (dup && !p.allow_duplicate) return bad(res, `Estimate number "${w.est_number}" already exists (ID ${dup.id}: ${dup.work_name}). Send allow_duplicate=true to override.`, 409);
  }
  D.WORK_FIELDS.forEach(f => { if (w[f] === undefined) w[f] = null; });
  const id = D.insertWork(w);
  if (p.auto_checklist !== false) { D.seedMilestones(id); D.seedDocuments(id); }
  if (Array.isArray(p.bills)) p.bills.forEach(b => D.addBill(Object.assign({}, b, { work_id: id, amount: num(b.amount), paid_amount: num(b.paid_amount) })));
  if (Array.isArray(p.milestones)) p.milestones.forEach(m => D.addMilestone(Object.assign({}, m, { work_id: id })));
  const rec = D.recompute(id);
  D.log('CREATE', 'work', id, `Created "${w.work_name}" (Est ${w.est_number || '—'}, ₹ ${w.aa_amount || 0})`);
  ok(res, D.getWorkFull(id), { message: `Work saved with ID ${id}` });
}));

app.put('/api/works/:id', wrap((req, res) => {
  const id = req.params.id;
  const cur = D.getWork(id);
  if (!cur) return bad(res, 'Work not found', 404);
  const w = normalise(req.body || {}, cur);
  const errs = validate(w);
  if (errs.length) return bad(res, errs.join(' '));
  delete w.id; delete w.created_at; delete w.updated_at;
  D.updateWork(id, w);
  D.recompute(id);
  D.log('UPDATE', 'work', id, `Updated "${w.work_name}"`);
  ok(res, D.getWorkFull(id), { message: 'Work updated' });
}));

app.post('/api/works/:id/quick', wrap((req, res) => {
  const id = req.params.id; const cur = D.getWork(id);
  if (!cur) return bad(res, 'Work not found', 404);
  const patch = {};
  ['physical_progress', 'work_status', 'bill_status', 'amount_paid', 'utility_connection', 'quality_inspection',
    'mb_status', 'sd_status', 'target_date', 'extended_target_date', 'remarks', 'priority'].forEach(k => {
    if (req.body[k] !== undefined) patch[k] = ['physical_progress', 'amount_paid'].includes(k) ? num(req.body[k]) : req.body[k];
  });
  if (patch.physical_progress !== undefined) patch.physical_progress = pct(patch.physical_progress);
  if (patch.target_date !== undefined) patch.target_date = dte(patch.target_date);
  if (patch.extended_target_date !== undefined) patch.extended_target_date = dte(patch.extended_target_date);
  if (!Object.keys(patch).length) return bad(res, 'Nothing to update');
  /* log progress history automatically */
  if (patch.physical_progress !== undefined) {
    D.addProgress({ work_id: id, date: D.today(), physical: patch.physical_progress, financial: cur.financial_progress, note: 'Quick update from dashboard/ledger' });
  }
  D.updateWork(id, patch);
  D.recompute(id);
  D.log('QUICK', 'work', id, `Quick update: ${JSON.stringify(patch).slice(0, 300)}`);
  ok(res, D.getWorkFull(id), { message: 'Updated' });
}));

app.delete('/api/works/:id', wrap((req, res) => {
  const id = req.params.id; const w = D.getWork(id);
  if (!w) return bad(res, 'Work not found', 404);
  if (req.query.hard === '1') { D.purgeWork(id); D.log('HARD-DELETE', 'work', id, `Purged "${w.work_name}"`); return ok(res, null, { message: 'Permanently deleted' }); }
  D.softDelete(id, 1); D.log('SOFT-DELETE', 'work', id, `Moved to recycle bin: "${w.work_name}"`);
  ok(res, null, { message: 'Moved to recycle bin (restore from Settings ▸ Data)' });
}));
app.post('/api/works/:id/restore', wrap((req, res) => {
  D.softDelete(req.params.id, 0); D.log('RESTORE', 'work', req.params.id, 'Restored from recycle bin');
  ok(res, D.getWorkFull(req.params.id), { message: 'Restored' });
}));
app.post('/api/works/recycle/empty', wrap((req, res) => {
  const rows = D.db.prepare('SELECT id FROM works WHERE is_deleted=1').all();
  rows.forEach(r => D.purgeWork(r.id));
  D.log('EMPTY-BIN', 'works', '', `Purged ${rows.length} deleted works`);
  ok(res, null, { message: `${rows.length} record(s) purged`, deleted: rows.length });
}));
app.get('/api/recycle', wrap((req, res) => {
  ok(res, { works: D.db.prepare('SELECT id,work_name,est_number,taluka,aa_amount,updated_at FROM works WHERE is_deleted=1 ORDER BY updated_at DESC').all() });
}));

/* ================================================================= API: bulk */
app.post('/api/bulk', wrap((req, res) => {
  const { ids = [], patch = {}, action = 'update' } = req.body || {};
  if (!ids.length) return bad(res, 'No records selected');
  let done = 0;
  ids.forEach(id => {
    const cur = D.getWork(id); if (!cur) return;
    if (action === 'delete') { D.softDelete(id, 1); D.log('BULK-DELETE', 'work', id, cur.work_name); done++; return; }
    if (action === 'status') { D.updateWork(id, { work_status: patch.work_status }); D.log('BULK-STATUS', 'work', id, `${cur.work_name} → ${patch.work_status}`); done++; return; }
    if (action === 'bill_status') { D.updateWork(id, { bill_status: patch.bill_status }); done++; return; }
    if (action === 'target') { D.updateWork(id, { extended_target_date: dte(patch.extended_target_date) }); D.log('BULK-TARGET', 'work', id, `${cur.work_name} target → ${patch.extended_target_date}`); done++; return; }
    if (action === 'checklist') { D.seedMilestones(id); D.seedDocuments(id); done++; return; }
    const p = normalise(patch, cur); delete p.id; delete p.created_at; delete p.updated_at;
    D.updateWork(id, p); D.recompute(id); done++;
  });
  ok(res, null, { message: `${done} record(s) updated`, updated: done });
}));

app.post('/api/recompute', wrap((req, res) => {
  const n = D.recomputeAll();
  D.log('RECOMPUTE', 'works', '', `Recalculated ${n} works`);
  ok(res, null, { message: `Recalculated derived fields for ${n} works`, recalculated: n });
}));

/* ================================================================= API: children */
function childRouter(name, get, add, upd, del) {
  app.get(`/api/works/:id/${name}`, wrap((req, res) => ok(res, { items: get(req.params.id) })));
  app.post(`/api/works/:id/${name}`, wrap((req, res) => {
    const body = Object.assign({}, req.body, { work_id: Number(req.params.id) });
    if (body.amount !== undefined) body.amount = num(body.amount);
    if (body.paid_amount !== undefined) body.paid_amount = num(body.paid_amount);
    ['bill_date', 'submitted_date', 'paid_date', 'planned_date', 'actual_date', 'date'].forEach(k => { if (body[k] !== undefined) body[k] = dte(body[k]); });
    const id = add(body);
    D.recompute(req.params.id);
    D.log('ADD', name, id, `Added ${name} to work ${req.params.id}`);
    ok(res, { id, items: get(req.params.id) }, { message: `${name} added` });
  }));
}
childRouter('bills', D.getBills, D.addBill, D.updateBill, D.deleteBill);
childRouter('milestones', D.getMilestones, D.addMilestone, D.updateMilestone, D.deleteMilestone);
childRouter('documents', D.getDocuments, D.addDocument, D.updateDocument, D.deleteDocument);

app.put('/api/bills/:id', wrap((req, res) => {
  const b = D.db.prepare('SELECT * FROM bills WHERE id=?').get(req.params.id); if (!b) return bad(res, 'Bill not found', 404);
  const body = Object.assign({}, req.body);
  ['bill_date', 'submitted_date', 'paid_date'].forEach(k => { if (body[k] !== undefined) body[k] = dte(body[k]); });
  ['amount', 'paid_amount'].forEach(k => { if (body[k] !== undefined) body[k] = num(body[k]); });
  D.updateBill(req.params.id, body); D.recompute(b.work_id);
  D.log('UPDATE', 'bill', req.params.id, `Bill ${body.bill_number || b.bill_number} updated`);
  ok(res, { items: D.getBills(b.work_id), work: D.getWorkFull(b.work_id) }, { message: 'Bill updated' });
}));
app.delete('/api/bills/:id', wrap((req, res) => {
  const b = D.db.prepare('SELECT * FROM bills WHERE id=?').get(req.params.id); if (!b) return bad(res, 'Bill not found', 404);
  D.deleteBill(req.params.id); D.recompute(b.work_id); D.log('DELETE', 'bill', req.params.id, '');
  ok(res, { items: D.getBills(b.work_id), work: D.getWorkFull(b.work_id) }, { message: 'Bill deleted' });
}));

app.put('/api/milestones/:id', wrap((req, res) => {
  const m = D.db.prepare('SELECT * FROM milestones WHERE id=?').get(req.params.id); if (!m) return bad(res, 'Milestone not found', 404);
  const body = Object.assign({}, req.body);
  ['planned_date', 'actual_date'].forEach(k => { if (body[k] !== undefined) body[k] = dte(body[k]); });
  if (body.status === 'Completed' && !body.actual_date) body.actual_date = D.today();
  D.updateMilestone(req.params.id, body); D.recompute(m.work_id);
  ok(res, { items: D.getMilestones(m.work_id), work: D.getWorkFull(m.work_id) }, { message: 'Milestone updated' });
}));
app.delete('/api/milestones/:id', wrap((req, res) => {
  const m = D.db.prepare('SELECT * FROM milestones WHERE id=?').get(req.params.id); if (!m) return bad(res, 'Milestone not found', 404);
  D.deleteMilestone(req.params.id); D.recompute(m.work_id);
  ok(res, { items: D.getMilestones(m.work_id) }, { message: 'Milestone deleted' });
}));
app.post('/api/works/:id/milestones/auto', wrap((req, res) => {
  D.seedMilestones(req.params.id, req.body && req.body.names ? req.body.names : undefined);
  ok(res, { items: D.getMilestones(req.params.id) }, { message: 'Standard milestone checklist added' });
}));

app.put('/api/documents/:id', wrap((req, res) => {
  const d = D.db.prepare('SELECT * FROM documents WHERE id=?').get(req.params.id); if (!d) return bad(res, 'Document not found', 404);
  const body = Object.assign({}, req.body);
  if (body.date !== undefined) body.date = dte(body.date);
  D.updateDocument(req.params.id, body);
  ok(res, { items: D.getDocuments(d.work_id) }, { message: 'Document updated' });
}));
app.delete('/api/documents/:id', wrap((req, res) => {
  const d = D.db.prepare('SELECT * FROM documents WHERE id=?').get(req.params.id); if (!d) return bad(res, 'Document not found', 404);
  D.deleteDocument(req.params.id);
  ok(res, { items: D.getDocuments(d.work_id) }, { message: 'Document deleted' });
}));
app.post('/api/works/:id/documents/auto', wrap((req, res) => {
  D.seedDocuments(req.params.id);
  ok(res, { items: D.getDocuments(req.params.id) }, { message: 'Standard document checklist added' });
}));

app.get('/api/works/:id/notes', wrap((req, res) => ok(res, { items: D.getNotes(req.params.id) })));
app.post('/api/works/:id/notes', wrap((req, res) => {
  if (!req.body.note) return bad(res, 'Note text required');
  D.addNote({ work_id: req.params.id, note: req.body.note, author: req.body.author || '' });
  D.log('NOTE', 'work', req.params.id, req.body.note.slice(0, 200));
  ok(res, { items: D.getNotes(req.params.id) }, { message: 'Remark added' });
}));
app.delete('/api/notes/:id', wrap((req, res) => { D.deleteNote(req.params.id); ok(res, null, { message: 'Remark deleted' }); }));

app.get('/api/works/:id/progress', wrap((req, res) => ok(res, { items: D.getProgressLog(req.params.id) })));
app.post('/api/works/:id/progress', wrap((req, res) => {
  D.addProgress({ work_id: req.params.id, date: dte(req.body.date) || D.today(), physical: pct(req.body.physical), financial: pct(req.body.financial), note: req.body.note || '' });
  if (req.body.apply_to_work) D.updateWork(req.params.id, { physical_progress: pct(req.body.physical), financial_progress: pct(req.body.financial) });
  D.recompute(req.params.id);
  ok(res, { items: D.getProgressLog(req.params.id), work: D.getWorkFull(req.params.id) }, { message: 'Progress point added' });
}));
app.delete('/api/progress/:id', wrap((req, res) => {
  const p = D.db.prepare('SELECT * FROM progress_log WHERE id=?').get(req.params.id);
  D.deleteProgress(req.params.id);
  if (p) D.recompute(p.work_id);
  ok(res, null, { message: 'Progress point deleted' });
}));

/* ================================================================= API: analytics */
app.get('/api/dashboard', wrap((req, res) => {
  const rows = A.applyFilters(D.getAllFull(), req.query);
  ok(res, { dashboard: A.dashboard(rows, D.getAllFull()), totals: A.totals(rows), count: rows.length });
}));
app.get('/api/alerts', wrap((req, res) => {
  const rows = A.applyFilters(D.getAllFull(), req.query);
  ok(res, { alerts: A.alerts(rows) });
}));
app.get('/api/bills', wrap((req, res) => {
  const rows = A.applyFilters(D.getAllFull(), req.query);
  let reg = A.billRegister(rows);
  if (req.query.only_unpaid === '1') reg = reg.filter(r => r.status !== 'Paid / Disbursed' && r.pending > 0);
  const totals = { count: reg.length, amount: A.sum(reg, r => r.amount), paid: A.sum(reg, r => r.paid_amount), pending: A.sum(reg, r => r.pending), maxAgeing: reg.reduce((m, r) => Math.max(m, r.ageing_days), 0) };
  ok(res, { bills: reg, totals });
}));
app.get('/api/milestones', wrap((req, res) => {
  const rows = A.applyFilters(D.getAllFull(), req.query);
  let ms = A.milestoneTracker(rows);
  if (req.query.flag && req.query.flag !== 'ALL') ms = ms.filter(m => m.flag === req.query.flag);
  if (req.query.due_days) ms = ms.filter(m => m.days_left !== null && m.days_left <= Number(req.query.due_days));
  const counts = { total: ms.length, overdue: ms.filter(m => m.flag === 'OVERDUE').length, due: ms.filter(m => m.flag === 'DUE SOON').length, done: ms.filter(m => m.flag === 'DONE').length };
  ok(res, { milestones: ms, counts });
}));
app.get('/api/groups/:dim', wrap((req, res) => {
  const rows = A.applyFilters(D.getAllFull(), req.query);
  const dim = req.params.dim;
  const keyFn = {
    taluka: r => r.taluka, head: r => r.head_of_account, division: r => r.division,
    sub_division: r => r.sub_division, section: r => r.section, status: r => r.work_status,
    bill_status: r => r.bill_status_auto, nature: r => r.nature_of_work, fund: r => r.fund_source,
    contractor: r => r.contractor_name || '(Not awarded)', fy: r => r.financial_year || r.est_year,
    utility: r => r.utility_connection, quality: r => r.quality_inspection, rag: r => r.rag,
    priority: r => r.priority, mb: r => r.mb_status, sd: r => r.sd_status, user_department: r => r.user_department,
  }[dim];
  if (!keyFn) return bad(res, 'Unknown grouping dimension: ' + dim, 404);
  const g = A.groupSummary(rows, keyFn);
  if (['taluka', 'division', 'sub_division', 'section', 'fy'].includes(dim)) g.sort((a, b) => a.key.localeCompare(b.key));
  ok(res, { groups: g, totals: A.totals(rows) });
}));

/* ================================================================= API: settings / masters */
app.get('/api/settings', wrap((req, res) => {
  ok(res, {
    letterhead: D.getJSON('letterhead', C.DEFAULT_LETTERHEAD),
    rules: D.getJSON('rules', C.RULES),
    masters: D.masters(),
    recycle: D.db.prepare('SELECT COUNT(*) c FROM works WHERE COALESCE(is_deleted,0)=1').get().c,
    auth: { user: D.getSetting('auth_user', 'admin'), default_password: D.getSetting('auth_default', '1') === '1' },
  });
}));
app.put('/api/settings', wrap((req, res) => {
  const { letterhead, rules, masters } = req.body || {};
  if (letterhead) D.setSetting('letterhead', Object.assign({}, C.DEFAULT_LETTERHEAD, letterhead));
  if (rules) D.setSetting('rules', rules);
  if (masters) Object.entries(masters).forEach(([k, v]) => { if (Array.isArray(v)) D.setSetting('m_' + k, v); });
  D.log('SETTINGS', 'settings', '', 'Settings/masters updated');
  ok(res, { letterhead: D.getJSON('letterhead', C.DEFAULT_LETTERHEAD), rules: D.getJSON('rules', C.RULES), masters: D.masters() }, { message: 'Settings saved' });
}));
app.get('/api/logs', wrap((req, res) => ok(res, { logs: D.getLogs(Number(req.query.limit) || 400) })));

/* ================================================================= API: backup / restore */
app.get('/api/backup', wrap((req, res) => {
  const dump = {
    app: C.APP, exported_at: new Date().toISOString(),
    works: D.db.prepare('SELECT * FROM works').all(),
    bills: D.db.prepare('SELECT * FROM bills').all(),
    milestones: D.db.prepare('SELECT * FROM milestones').all(),
    documents: D.db.prepare('SELECT * FROM documents').all(),
    notes: D.db.prepare('SELECT * FROM notes').all(),
    progress_log: D.db.prepare('SELECT * FROM progress_log').all(),
    settings: D.db.prepare('SELECT * FROM settings').all(),
  };
  const fname = `pwd_tracker_backup_${new Date().toISOString().slice(0, 10)}.json`;
  if (req.query.save === '1') {
    fs.writeFileSync(path.join(BACKUP_DIR, fname), JSON.stringify(dump, null, 1));
    D.log('BACKUP', 'db', '', `Saved ${fname}`);
    return ok(res, null, { message: `Backup saved on server: data/backups/${fname}`, file: fname });
  }
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
  res.send(JSON.stringify(dump, null, 1));
}));
app.get('/api/backups', wrap((req, res) => {
  const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json')).map(f => ({
    name: f, size: fs.statSync(path.join(BACKUP_DIR, f)).size, mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtime,
  })).sort((a, b) => b.mtime - a.mtime);
  ok(res, { backups: files });
}));
app.post('/api/restore', wrap((req, res) => {
  const file = req.body.file ? path.join(BACKUP_DIR, path.basename(req.body.file)) : null;
  let data;
  if (req.body.json) data = typeof req.body.json === 'string' ? JSON.parse(req.body.json) : req.body.json;
  else if (file && fs.existsSync(file)) data = JSON.parse(fs.readFileSync(file, 'utf8'));
  else return bad(res, 'Provide either "file" (server backup name) or "json" payload');
  const clear = req.body.mode !== 'merge';
  const tx = D.db.transaction(() => {
    if (clear) ['bills', 'milestones', 'documents', 'notes', 'progress_log', 'works'].forEach(t => D.db.prepare(`DELETE FROM ${t}`).run());
    const wIns = D.db.prepare(`INSERT INTO works(${D.WORK_FIELDS.join(',')},id) VALUES(${D.WORK_FIELDS.map(() => '?').join(',')},?)`);
    (data.works || []).forEach(w => wIns.run(...D.WORK_FIELDS.map(f => (w[f] === undefined ? null : w[f])), w.id));
    const ins = (tbl, cols) => D.db.prepare(`INSERT INTO ${tbl}(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`);
    (data.bills || []).forEach(b => ins('bills', ['id', 'work_id', 'bill_type', 'bill_number', 'bill_date', 'submitted_date', 'amount', 'paid_amount', 'paid_date', 'status', 'voucher_number', 'treasury_ref', 'objection', 'remarks']).run(b.id, b.work_id, b.bill_type, b.bill_number, b.bill_date, b.submitted_date, b.amount, b.paid_amount, b.paid_date, b.status, b.voucher_number, b.treasury_ref, b.objection, b.remarks));
    (data.milestones || []).forEach(m => ins('milestones', ['id', 'work_id', 'name', 'planned_date', 'actual_date', 'status', 'responsible', 'remarks']).run(m.id, m.work_id, m.name, m.planned_date, m.actual_date, m.status, m.responsible, m.remarks));
    (data.documents || []).forEach(d => ins('documents', ['id', 'work_id', 'name', 'status', 'ref_number', 'date', 'file_name', 'remarks']).run(d.id, d.work_id, d.name, d.status, d.ref_number, d.date, d.file_name, d.remarks));
    (data.notes || []).forEach(n => ins('notes', ['id', 'work_id', 'note', 'author']).run(n.id, n.work_id, n.note, n.author));
    (data.progress_log || []).forEach(p => ins('progress_log', ['id', 'work_id', 'date', 'physical', 'financial', 'note']).run(p.id, p.work_id, p.date, p.physical, p.financial, p.note));
    (data.settings || []).forEach(s => D.setSetting(s.key, s.value));
  });
  tx(); D.recomputeAll();
  D.log('RESTORE', 'db', '', `Restored ${(data.works || []).length} works (mode=${req.body.mode || 'replace'})`);
  ok(res, null, { message: `Restored ${(data.works || []).length} works`, restored: (data.works || []).length });
}));

app.post('/api/seed', wrap((req, res) => {
  const r = SEED.seedIfEmpty({ force: req.body && req.body.force === true });
  ok(res, r, { message: r.seeded ? `Loaded ${r.seeded} sample works` : (r.message || 'Nothing to do') });
}));
app.post('/api/reset', wrap((req, res) => {
  ['bills', 'milestones', 'documents', 'notes', 'progress_log', 'works'].forEach(t => D.db.prepare(`DELETE FROM ${t}`).run());
  D.log('RESET', 'db', '', 'All work data cleared');
  ok(res, null, { message: 'All data cleared. The database is now empty.' });
}));

/* ================================================================= API: reports */
app.get('/api/reports', wrap((req, res) => ok(res, { reports: C.REPORTS })));

app.get('/api/report/pdf/:type', wrap((req, res) => {
  const f = Object.assign({}, req.query);
  PDF.buildPdf(req.params.type, f, res);
  D.log('REPORT-PDF', req.params.type, '', `Filters: ${JSON.stringify(f).slice(0, 250)}`);
}));
app.get('/api/report/excel/:type', wrap(async (req, res) => {
  const f = Object.assign({}, req.query);
  await XLSX.buildExcel(req.params.type, f, res);
  D.log('REPORT-XLSX', req.params.type, '', `Filters: ${JSON.stringify(f).slice(0, 250)}`);
}));

/* ================================================================= API: CSV export (fast path) */
app.get('/api/export/csv', wrap((req, res) => {
  const rows = A.applyFilters(D.getAllFull(), req.query);
  const cols = [['Work Name', r => r.work_name], ['Est No', r => r.est_number], ['Taluka', r => r.taluka], ['Village', r => r.village],
    ['Head of Account', r => r.head_of_account], ['Head Description', r => r.head_desc], ['Nature of Work', r => r.nature_of_work],
    ['Fund Source', r => r.fund_source], ['Division', r => r.division], ['Sub-Division', r => r.sub_division], ['Section', r => r.section],
    ['AA No', r => r.aa_number], ['AA Date', r => r.aa_date], ['AA Amount', r => r.aa_amount], ['TS No', r => r.ts_number], ['TS Date', r => r.ts_date],
    ['Est/TS Amount', r => r.est_amount], ['Revised Est Amount', r => r.revised_est_amount], ['Budget Provision', r => r.budget_provision],
    ['Contractor', r => r.contractor_name], ['WO No', r => r.wo_number], ['WO Date', r => r.wo_date], ['WO Amount', r => r.wo_amount],
    ['Target Date', r => r.target_date], ['Ext Target', r => r.extended_target_date], ['Physical %', r => r.physical_progress],
    ['Financial %', r => r.financial_progress], ['Amount Paid', r => r.amount_paid], ['Balance', r => r.balance_amount],
    ['Work Status', r => r.work_status], ['Bill Status', r => r.bill_status_auto], ['Bills Pending', r => r.bills_pending_amount],
    ['Unpaid Bills', r => r.unpaid_bill_count], ['Bill Ageing Days', r => r.bill_pending_days], ['Delay Days', r => r.delay_days],
    ['Utility Connection', r => r.utility_connection], ['Quality Inspection', r => r.quality_inspection], ['MB Status', r => r.mb_status],
    ['SD Status', r => r.sd_status], ['RAG', r => r.rag], ['Priority', r => r.priority], ['Remarks', r => r.remarks]];
  const esc = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const csv = [cols.map(c => esc(c[0])).join(',')].concat(rows.map(r => cols.map(c => esc(c[1](r))).join(','))).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="works_export_${D.today()}.csv"`);
  res.send('\ufeff' + csv);
}));

/* ================================================================= API: import */
const ALIASES = {
  work_name: ['work name', 'name of work', 'workname', 'कामाचे नाव', 'work', 'name'],
  work_name_mr: ['work name marathi', 'मराठी नाव', 'name in marathi'],
  est_number: ['est number', 'est no', 'estimate number', 'estimate no', 'अंदाज क्र', 'अंदाजपत्रक क्र', 'अंदाज पत्रक क्रमांक', 'est. no', 'est.no', 'estimate'],
  est_year: ['est year', 'estimate year', 'year'],
  financial_year: ['financial year', 'fy', 'वित्तीय वर्ष'],
  taluka: ['taluka', 'तालुका', 'tal'],
  village: ['village', 'place', 'गाव', 'location'],
  district: ['district', 'जिल्हा'],
  division: ['division', 'विभाग'], sub_division: ['sub division', 'sub-division', 'subdiv', 'उपविभाग'],
  section: ['section', 'मंडळ'],
  head_of_account: ['head of account', 'account head', 'लेखाशीर्ष', 'लेखाशिर्षक', 'लेखा शिर्षक', 'लेखाशीर्षक', 'hoa', 'budget head code', 'head code'],
  head_desc: ['head description', 'head desc', 'description of head'],
  nature_of_work: ['nature of work', 'nature', 'category', 'कामाचे स्वरूप', 'work category'],
  fund_source: ['fund source', 'fund', 'scheme source', 'निधी स्रोत', 'source of fund'],
  scheme_name: ['scheme name', 'scheme', 'योजना'],
  aa_number: ['aa number', 'aa no', 'administrative approval no', 'aa order no'],
  aa_date: ['aa date', 'administrative approval date', 'aa order date'],
  aa_amount: ['aa amount', 'administrative approval amount', 'aa amt', 'sanctioned amount', 'aa amount (rs)', 'aa', 'प्रशासकीय मान्यता रक्कम'],
  ts_number: ['ts number', 'ts no', 'technical sanction no'],
  ts_date: ['ts date', 'technical sanction date'],
  ts_amount: ['ts amount', 'est amount', 'estimate amount', 'technical sanction amount', 'est amount (ts amount)', 'ts'],
  est_amount: ['est amount', 'estimate amount', 'ts amount', 'est. amount', 'अंदाज रक्कम', 'रक्कम'],
  revised_est_amount: ['revised est amount', 'revised estimate', 'revised amount'],
  revised_est_number: ['revised est number', 'revised est no'],
  budget_provision: ['budget provision', 'budget', 'provision', 'निधी तरतूद'],
  user_department: ['user department', 'user dept', 'department'],
  sanctioning_authority: ['sanctioning authority', 'sanction authority', 'competent authority'],
  contractor_name: ['contractor', 'contractor name', 'agency', 'agency name', 'कंत्राटदार', 'कंत्राटदार नाव'],
  contractor_class: ['contractor class', 'class'], contractor_contact: ['contractor contact', 'contact', 'mobile'],
  tender_number: ['tender number', 'tender no', 'nit no'], tender_date: ['tender date'],
  wo_number: ['work order number', 'wo number', 'wo no', 'work order no'],
  wo_date: ['work order date', 'wo date'], wo_amount: ['work order amount', 'wo amount', 'contract amount'],
  target_date: ['target date', 'completion date', 'target', 'लक्ष्य दिनांक', 'पूर्णता दिनांक'],
  extended_target_date: ['extended target', 'extended target date', 'revised target'],
  physical_progress: ['physical progress', 'physical %', 'phy %', 'physical', 'भौतिक प्रगती', 'प्रगती', 'टक्केवारी'],
  financial_progress: ['financial progress', 'financial %', 'fin %', 'financial'],
  amount_paid: ['amount paid', 'paid amount', 'expenditure', 'खर्च', 'देय रक्कम'],
  work_status: ['work status', 'status of work', 'कामाची स्थिती', 'स्थिती'],
  bill_status: ['bill status', 'status of bill', 'बिल स्थिती', 'देयक स्थिती'],
  utility_connection: ['utility connection', 'mseb connection', 'connection status'],
  quality_inspection: ['quality inspection', 'inspection', 'qc status'],
  mb_status: ['mb status', 'measurement book status'], sd_status: ['sd status', 'security deposit'],
  priority: ['priority'], remarks: ['remarks', 'remark', 'note', 'observation'],
  stalled_reason: ['stalled reason', 'reason for stall', 'delay reason'],
  delay_reason: ['delay reason', 'reason of delay'],
};

const normHeader = (h) => String(h || '').toLowerCase()
  .replace(/[^a-z0-9\u0900-\u097F\s]/g, ' ')   /* keep Devanagari incl. matras */
  .replace(/\s+/g, ' ').trim();
let ALIAS_NORM = null;
function aliasNorm() {
  if (!ALIAS_NORM) ALIAS_NORM = Object.entries(ALIASES).map(([f, list]) => [f, list.map(normHeader)]);
  return ALIAS_NORM;
}
function matchHeader(h) {
  const norm = normHeader(h);
  if (!norm) return null;
  for (const [field, list] of aliasNorm()) if (list.some(a => a && a === norm)) return field;
  for (const [field, list] of aliasNorm()) if (list.some(a => a && (norm.includes(a) || a.includes(norm)))) return field;
  const snake = norm.replace(/ /g, '_');
  if (D.WORK_FIELDS.includes(snake)) return snake;
  return null;
}

function parseDelimited(text, delim) {
  const rows = []; let cur = [], field = '', q = false;
  const d = delim === 'auto' ? (text.split('\n')[0].includes('\t') ? '\t' : ',') : delim;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === d) { cur.push(field); field = ''; }
    else if (ch === '\n') { cur.push(field); field = ''; if (cur.some(x => String(x).trim() !== '')) rows.push(cur); cur = []; }
    else if (ch !== '\r') field += ch;
  }
  cur.push(field); if (cur.some(x => String(x).trim() !== '')) rows.push(cur);
  return { rows, delim: d };
}

async function sheetToRows(buf, isXls) {
  if (isXls) { const { rows, delim } = parseDelimited(buf.toString('utf8'), 'auto'); return rows; }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  const out = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const vals = [];
    row.eachCell({ includeEmpty: true }, (cell, ci) => {
      let v = cell.value;
      if (v && typeof v === 'object') { if (v.result !== undefined) v = v.result; else if (v.richText) v = v.richText.map(t => t.text).join(''); else if (v.text) v = v.text; else if (v instanceof Date) v = v.toISOString().slice(0, 10); }
      vals[ci - 1] = v === null || v === undefined ? '' : v;
    });
    out.push(vals);
  });
  return out;
}

app.post('/api/import/preview', upload.single('file'), wrap(async (req, res) => {
  let grid;
  if (req.body.text) { grid = parseDelimited(req.body.text, req.body.delim || 'auto').rows; }
  else if (req.file) { grid = await sheetToRows(req.file.buffer, /\.(csv|txt|tsv)$/i.test(req.file.originalname || '')); }
  else return bad(res, 'Provide a file (xlsx/csv) or pasted text');
  if (grid.length < 2) return bad(res, 'No data rows found (need a header row plus at least one data row)');

  /* detect header row within first 12 rows */
  let hIdx = 0, best = -1;
  for (let i = 0; i < Math.min(12, grid.length); i++) {
    const score = grid[i].filter(h => matchHeader(h)).length;
    if (score > best) { best = score; hIdx = i; }
  }
  const header = grid[hIdx].map(h => String(h === null || h === undefined ? '' : h).trim());
  const mapping = header.map(matchHeader);
  const data = grid.slice(hIdx + 1).filter(r => r.some(c => String(c === null || c === undefined ? '' : c).trim() !== ''));
  const rows = data.map((r, i) => {
    const o = { __line: hIdx + i + 2, __raw: r };
    mapping.forEach((f, ci) => { if (f) o[f] = r[ci] === undefined ? '' : r[ci]; });
    return o;
  });
  /* validation preview */
  const errs = [];
  rows.forEach(r => {
    const w = normalise(r, {});
    const e = validate(w);
    if (e.length) errs.push({ line: r.__line, errors: e, work_name: r.work_name });
    r.__normalised = w;
  });
  ok(res, {
    header, mapping, headerRow: hIdx + 1, rows, errorCount: errs.length, errors: errs.slice(0, 60),
    unmapped: header.filter((h, i) => h && !mapping[i]),
    matched: header.filter((h, i) => mapping[i]).length, total: rows.length,
  });
}));

app.post('/api/import/commit', wrap((req, res) => {
  const { rows = [], mapping = [], mode = 'create', checklist = true } = req.body || {};
  if (!rows.length) return bad(res, 'No rows to import');
  const fields = (mapping && mapping.length ? mapping : Object.keys(rows[0]).filter(k => D.WORK_FIELDS.includes(k)));
  let created = 0, updated = 0, skipped = 0; const messages = [];
  const tx = D.db.transaction(() => {
    rows.forEach((r, i) => {
      const src = r.__normalised || r;
      const data = {};
      if (fields && fields.length && Array.isArray(fields)) {
        fields.forEach((f, ci) => { if (f && src[f] !== undefined) data[f] = src[f]; });
      } else Object.assign(data, src);
      delete data.__line; delete data.__raw; delete data.__normalised;
      const w = normalise(data, {});
      const errs = validate(w);
      if (errs.length) { skipped++; messages.push(`Row ${i + 1} (${w.work_name || 'no name'}): ${errs.join(' ')}`); return; }
      if (mode === 'update' && w.est_number) {
        const ex = D.db.prepare('SELECT id FROM works WHERE est_number=? AND COALESCE(is_deleted,0)=0').get(w.est_number);
        if (ex) { delete w.id; D.updateWork(ex.id, w); D.recompute(ex.id); updated++; return; }
      }
      if (mode !== 'update' && w.est_number) {
        const ex = D.db.prepare('SELECT id FROM works WHERE est_number=? AND COALESCE(is_deleted,0)=0').get(w.est_number);
        if (ex && mode !== 'duplicate') {
          delete w.id; D.updateWork(ex.id, w); D.recompute(ex.id); updated++;
          messages.push(`Row ${i + 1}: estimate ${w.est_number} already existed → updated instead of creating`);
          return;
        }
      }
      D.WORK_FIELDS.forEach(f => { if (w[f] === undefined) w[f] = null; });
      const id = D.insertWork(w);
      if (checklist) { D.seedMilestones(id); D.seedDocuments(id); }
      D.recompute(id); created++;
    });
  });
  tx();
  D.log('IMPORT', 'works', '', `Import: created=${created} updated=${updated} skipped=${skipped}`);
  ok(res, null, { message: `Import finished — ${created} created, ${updated} updated, ${skipped} skipped`, created, updated, skipped, messages: messages.slice(0, 60) });
}));

app.get('/api/import/template.csv', wrap((req, res) => {
  const cols = ['work_name', 'est_number', 'est_year', 'taluka', 'village', 'head_of_account', 'nature_of_work', 'fund_source',
    'division', 'sub_division', 'section', 'aa_number', 'aa_date', 'aa_amount', 'ts_number', 'ts_date', 'est_amount',
    'contractor_name', 'wo_number', 'wo_date', 'wo_amount', 'target_date', 'physical_progress', 'amount_paid',
    'work_status', 'bill_status', 'priority', 'remarks'];
  const pretty = { work_name: 'Work Name', est_number: 'Est No', est_year: 'Est Year', taluka: 'Taluka', village: 'Village',
    head_of_account: 'Head of Account', nature_of_work: 'Nature of Work', fund_source: 'Fund Source', division: 'Division',
    sub_division: 'Sub Division', section: 'Section', aa_number: 'AA No', aa_date: 'AA Date', aa_amount: 'AA Amount',
    ts_number: 'TS No', ts_date: 'TS Date', est_amount: 'Est Amount', contractor_name: 'Contractor', wo_number: 'WO No',
    wo_date: 'WO Date', wo_amount: 'WO Amount', target_date: 'Target Date', physical_progress: 'Physical Progress',
    amount_paid: 'Amount Paid', work_status: 'Work Status', bill_status: 'Bill Status', priority: 'Priority', remarks: 'Remarks' };
  const sample = ['Electrification of ZP School Building, Jalgaon', 'Est/EE-ELEC/25-26/001', '2025-26', 'Jalgaon', 'Palodhi',
    '2059 02 105', 'New Building Electrification', 'State Plan (Annual Plan)', 'P.W. Electrical Division, Dhule',
    'P.W. Electrical Sub-Division, Jalgaon', 'P.W. Section, Jalgaon City', 'AA/25-26/EE/ELEC/101', '2025-05-12', 2500000,
    'TS/25-26/EE/ELEC/101', '2025-04-02', 2500000, 'M/s Shree Eka Electricals, Jalgaon', 'WO/25-26/EE/ELEC/101',
    '2025-06-20', 2450000, '2026-06-19', 45, 900000, 'In Progress', 'Pending at Division', 'High', ''];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="import_template.csv"');
  res.send('\ufeff' + cols.map(c => pretty[c]).join(',') + '\n' + sample.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',') + '\n');
}));

/* ================================================================= health */
app.get('/api/health', wrap((req, res) => ok(res, {
  status: 'ok', version: C.APP.version, db: D.DB_PATH,
  works: D.db.prepare('SELECT COUNT(*) c FROM works WHERE is_deleted=0').get().c,
  uptime: Math.round(process.uptime()), time: new Date().toISOString(),
})));
/* API 404 + error handler */
app.use('/api', (req, res) => res.status(404).json({ ok: false, error: 'Unknown API endpoint: ' + req.method + ' ' + req.originalUrl }));
app.use((err, req, res, next) => {
  console.error('[error]', err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ ok: false, error: err.message || 'Server error' });
});

/* SPA fallback – any non-API GET renders the app shell */
app.get('/*splat', (req, res, next) => {
  if (String(req.path).startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ---------------- boot ---------------- */
(function boot() {
  const r = SEED.seedIfEmpty({});
  if (r.seeded) console.log(`[seed] ${r.seeded} sample works created.`);
  D.recomputeAll();
  D.setSetting('installed_at', D.getSetting('installed_at') || new Date().toISOString());
  app.listen(PORT, HOST, () => {
    console.log(`\n  ${C.APP.name}`);
    console.log(`  v${C.APP.version}  •  listening on http://${HOST}:${PORT}`);
    console.log(`  database: ${D.DB_PATH}\n`);
  });
})();
