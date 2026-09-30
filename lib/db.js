'use strict';
/* ============================================================
   SQLite data layer (better-sqlite3) – schema, CRUD, derived stats
   ============================================================ */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const C = require('./config');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'tracker.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/* ------------------------------------------------------------------ schema */
db.exec(`
CREATE TABLE IF NOT EXISTS works (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_name TEXT NOT NULL,
  work_name_mr TEXT DEFAULT '',
  est_number TEXT DEFAULT '',
  est_year TEXT DEFAULT '',
  work_type TEXT DEFAULT '',
  nature_of_work TEXT DEFAULT '',
  head_of_account TEXT DEFAULT '',
  head_desc TEXT DEFAULT '',
  head_type TEXT DEFAULT '',
  fund_source TEXT DEFAULT '',
  scheme_name TEXT DEFAULT '',
  financial_year TEXT DEFAULT '',
  taluka TEXT DEFAULT '',
  village TEXT DEFAULT '',
  district TEXT DEFAULT 'Nashik',
  circle TEXT DEFAULT '',
  division TEXT DEFAULT '',
  sub_division TEXT DEFAULT '',
  section TEXT DEFAULT '',
  user_department TEXT DEFAULT '',
  sanctioning_authority TEXT DEFAULT '',
  aa_number TEXT DEFAULT '',
  aa_date TEXT DEFAULT '',
  aa_amount REAL DEFAULT 0,
  ts_number TEXT DEFAULT '',
  ts_date TEXT DEFAULT '',
  ts_amount REAL DEFAULT 0,
  est_amount REAL DEFAULT 0,
  revised_est_number TEXT DEFAULT '',
  revised_est_amount REAL DEFAULT 0,
  budget_head TEXT DEFAULT '',
  budget_provision REAL DEFAULT 0,
  tender_type TEXT DEFAULT '',
  tender_number TEXT DEFAULT '',
  tender_date TEXT DEFAULT '',
  agreement_number TEXT DEFAULT '',
  agreement_date TEXT DEFAULT '',
  contractor_name TEXT DEFAULT '',
  contractor_class TEXT DEFAULT '',
  contractor_contact TEXT DEFAULT '',
  wo_number TEXT DEFAULT '',
  wo_date TEXT DEFAULT '',
  wo_amount REAL DEFAULT 0,
  site_handover_date TEXT DEFAULT '',
  target_date TEXT DEFAULT '',
  extended_target_date TEXT DEFAULT '',
  physical_progress REAL DEFAULT 0,
  financial_progress REAL DEFAULT 0,
  amount_paid REAL DEFAULT 0,
  work_status TEXT DEFAULT 'Estimate under Preparation',
  bill_status TEXT DEFAULT 'Not Submitted',
  utility_connection TEXT DEFAULT 'Not Applied',
  quality_inspection TEXT DEFAULT 'Not Required',
  mb_status TEXT DEFAULT 'Pending',
  sd_status TEXT DEFAULT 'Pending',
  is_delayed INTEGER DEFAULT 0,
  delay_reason TEXT DEFAULT '',
  stalled INTEGER DEFAULT 0,
  stalled_reason TEXT DEFAULT '',
  priority TEXT DEFAULT 'Medium',
  remarks TEXT DEFAULT '',
  lat TEXT DEFAULT '', lng TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime')),
  is_deleted INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id INTEGER NOT NULL,
  bill_type TEXT DEFAULT 'R.A. Bill No. 1',
  bill_number TEXT DEFAULT '',
  bill_date TEXT DEFAULT '',
  submitted_date TEXT DEFAULT '',
  amount REAL DEFAULT 0,
  paid_amount REAL DEFAULT 0,
  paid_date TEXT DEFAULT '',
  status TEXT DEFAULT 'Pending at Section',
  voucher_number TEXT DEFAULT '',
  treasury_ref TEXT DEFAULT '',
  objection TEXT DEFAULT '',
  remarks TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id INTEGER NOT NULL,
  name TEXT DEFAULT '',
  planned_date TEXT DEFAULT '',
  actual_date TEXT DEFAULT '',
  status TEXT DEFAULT 'Not Started',
  responsible TEXT DEFAULT '',
  remarks TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id INTEGER NOT NULL,
  name TEXT DEFAULT '',
  status TEXT DEFAULT 'Pending',
  ref_number TEXT DEFAULT '',
  date TEXT DEFAULT '',
  file_name TEXT DEFAULT '',
  remarks TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id INTEGER NOT NULL,
  note TEXT DEFAULT '',
  author TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS progress_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id INTEGER NOT NULL,
  date TEXT DEFAULT '',
  physical REAL DEFAULT 0,
  financial REAL DEFAULT 0,
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT DEFAULT '', entity TEXT DEFAULT '', entity_id TEXT DEFAULT '',
  detail TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY, value TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_works_taluka ON works(taluka);
CREATE INDEX IF NOT EXISTS ix_works_status ON works(work_status);
CREATE INDEX IF NOT EXISTS ix_bills_work ON bills(work_id);
CREATE INDEX IF NOT EXISTS ix_mile_work ON milestones(work_id);
`);

/* ------------------------------------------------------------------ helpers */
const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const s = (v) => (v === null || v === undefined) ? '' : String(v).trim();

function setSetting(key, value) {
  db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .run(key, typeof value === 'string' ? value : JSON.stringify(value));
}
function getSetting(key, def = '') {
  const r = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  return r ? r.value : def;
}
function getJSON(key, def) { try { return JSON.parse(getSetting(key, JSON.stringify(def))); } catch { return def; } }
function log(action, entity, entity_id, detail) {
  db.prepare('INSERT INTO logs(action,entity,entity_id,detail) VALUES(?,?,?,?)').run(action, entity, String(entity_id || ''), s(detail).slice(0, 800));
}

/* ------------------------------------------------------------------ masters */
function masters() {
  const m = {};
  const defs = {
    talukas: C.TALUKAS, circles: C.CIRCLES, divisions: C.DIVISIONS, sub_divisions: C.SUBDIVISIONS,
    sections: C.SECTIONS, heads: C.HEADS_OF_ACCOUNT.map(h => `${h.code} – ${h.desc}`),
    nature: C.NATURE_OF_WORK, funds: C.FUND_SOURCES, contractors: [], user_departments: [
      'Zilla Parishad, Nashik', 'Panchayat Samiti', 'Nagar Parishad', 'Municipal Corporation',
      'Health Services', 'School Education', 'Higher Education', 'Tribal Dept.', 'Social Justice',
      'Water Supply Dept.', 'Irrigation Dept.', 'Police Dept.', 'Revenue Dept.', 'Agriculture Dept.',
      'PWD (Electrical)', 'Other',
    ],
  };
  for (const [k, d] of Object.entries(defs)) m[k] = getJSON('m_' + k, d);
  m.work_status = C.WORK_STATUS.map(x => x.v);
  m.bill_status = C.BILL_STATUS.map(x => x.v);
  m.bill_types = C.BILL_TYPES;
  m.milestones = C.MILESTONES;
  m.documents = C.DOCUMENTS;
  m.utility = C.UTILITY_CONNECTION;
  m.quality = C.QUALITY_INSPECTION;
  m.headList = C.HEADS_OF_ACCOUNT;
  m.tender_types = ['Open e-Tender', 'Limited Tender', 'Nomination / Nominee Contractor', 'Panel Rate Contract',
                    'Departmental (Labour + Material)', 'GeM / Online Purchase', 'Single Tender (Emergency)'];
  m.priorities = ['High', 'Medium', 'Low'];
  m.sd_status = ['Pending', 'Received', 'Refunded', 'Forfeited', 'Not Applicable'];
  m.contractor_class = ['Class-I', 'Class-II', 'Class-III', 'Class-IV', 'Registered (Electrical)', 'Departmental', 'N/A'];
  return m;
}

/* ------------------------------------------------------------------ derived fields */
function today() { return new Date().toISOString().slice(0, 10); }
function daysBetween(a, b) {
  if (!a || !b) return null;
  const d1 = new Date(a), d2 = new Date(b);
  if (isNaN(d1) || isNaN(d2)) return null;
  return Math.round((d2 - d1) / 86400000);
}

/** Effective estimate amount: Revised est > AA amount > TS(est) amount */
function effectiveAmount(w) {
  if (n(w.revised_est_amount) > 0) return n(w.revised_est_amount);
  if (n(w.aa_amount) > 0) return n(w.aa_amount);
  if (n(w.est_amount) > 0) return n(w.est_amount);
  return n(w.ts_amount);
}

function computeWork(w, bills = [], milestones = []) {
  const out = Object.assign({}, w);
  const aa = n(w.aa_amount), est = n(w.est_amount) || n(w.ts_amount), rev = n(w.revised_est_amount);
  const eff = effectiveAmount(w);
  const paidFromBills = bills.reduce((a, b) => a + n(b.paid_amount), 0);
  const paid = n(w.amount_paid) > 0 ? n(w.amount_paid) : paidFromBills;

  out.aa_amount = aa; out.est_amount = est; out.ts_amount = est; out.effective_amount = eff;
  out.amount_paid = paid;
  out.balance_amount = Math.max(0, eff - paid);
  out.paid_pct = eff > 0 ? +(paid / eff * 100).toFixed(2) : 0;
  out.financial_progress = n(w.financial_progress) > 0 ? n(w.financial_progress) : out.paid_pct;
  out.physical_progress = n(w.physical_progress);

  /* deviation / savings */
  out.deviation = +(rev > 0 ? rev - aa : 0).toFixed(2);
  out.deviation_pct = (rev > 0 && aa > 0) ? +((rev - aa) / aa * 100).toFixed(2) : 0;

  /* bills aggregate */
  const submitted = bills.filter(b => s(b.bill_number) || n(b.amount) > 0);
  const unpaid = submitted.filter(b => b.status !== 'Paid / Disbursed' && n(b.amount) - n(b.paid_amount) > 0);
  const oldestUnpaid = unpaid.map(b => b.submitted_date || b.bill_date).filter(Boolean).sort()[0];
  out.bill_count = submitted.length;
  out.bills_submitted_amount = +submitted.reduce((a, b) => a + n(b.amount), 0).toFixed(2);
  out.bills_paid_amount = +submitted.reduce((a, b) => a + n(b.paid_amount), 0).toFixed(2);
  out.bills_pending_amount = +(out.bills_submitted_amount - out.bills_paid_amount).toFixed(2);
  out.unpaid_bill_count = unpaid.length;
  out.bill_pending_days = oldestUnpaid ? Math.max(0, daysBetween(oldestUnpaid, today())) : 0;

  /* auto bill status (if no manual override chosen by user = 'AUTO') */
  let billStatus = s(w.bill_status);
  if (!billStatus || billStatus === 'AUTO' || billStatus === '') {
    if (submitted.length === 0) billStatus = 'Not Submitted';
    else if (unpaid.length === 0) billStatus = 'Paid / Disbursed';
    else {
      const st = unpaid.map(b => b.status);
      const order = C.BILL_STATUS.reduce((m, x) => (m[x.v] = x.order, m), {});
      st.sort((a, b) => (order[a] ?? 99) - (order[b] ?? 99));
      billStatus = st[0];
    }
  }
  out.bill_status_auto = billStatus;

  /* delay & ageing */
  const effTarget = s(w.extended_target_date) || s(w.target_date);
  out.effective_target = effTarget;
  const isClosed = ['Completed & Fully Paid', 'Cancelled / Dropped'].includes(s(w.work_status));
  out.days_to_target = effTarget ? daysBetween(today(), effTarget) : null;
  out.delay_days = (effTarget && !isClosed && out.physical_progress < 100)
    ? Math.max(0, daysBetween(effTarget, today()) - C.RULES.completionGraceDays) : 0;
  out.is_delayed = out.delay_days > 0 ? 1 : 0;
  out.work_order_age_days = w.wo_date ? Math.max(0, daysBetween(w.wo_date, today())) : null;
  out.stalled = n(w.stalled) || (['Stalled / Stopped', 'Administered / Stayed', 'Litigation / Court Case'].includes(s(w.work_status)) ? 1 : 0);

  /* RAG rating */
  let rag = 'GREEN', reasons = [];
  if (out.stalled) { rag = 'RED'; reasons.push('Stalled / Stayed'); }
  else if (isClosed) { rag = 'GREEN'; reasons.push('Closed'); }
  else {
    if (out.is_delayed) { rag = 'RED'; reasons.push(`Delayed by ${out.delay_days} days`); }
    else if (out.days_to_target !== null && out.days_to_target < 30 && out.physical_progress < 75) { rag = 'AMBER'; reasons.push('Target within 30 days, progress < 75%'); }
    if (out.bill_pending_days > C.RULES.billPendingAlertDays) { rag = 'RED'; reasons.push(`Bill pending ${out.bill_pending_days} days`); }
    else if (out.bill_pending_days > C.RULES.billPendingWarnDays && rag !== 'RED') { rag = 'AMBER'; reasons.push(`Bill pending ${out.bill_pending_days} days`); }
    if (out.physical_progress - out.financial_progress > C.RULES.physicalGapRed && rag !== 'RED') { rag = 'AMBER'; reasons.push('Financial lag behind physical'); }
    if (!out.wo_number && eff && s(w.work_status).match(/Tender|Awarded/i)) { rag = 'AMBER'; reasons.push('Work order not recorded'); }
  }
  if (!rag || rag === 'GREEN') reasons.push('On track');
  out.rag = rag; out.rag_reasons = reasons.join('; ');

  /* milestone counts */
  const total = milestones.length;
  const done = milestones.filter(m => m.status === 'Completed').length;
  const overdue = milestones.filter(m => m.status !== 'Completed' && m.planned_date && m.planned_date < today()).length;
  out.ms_total = total; out.ms_done = done; out.ms_overdue = overdue;
  out.ms_pct = total ? +(done / total * 100).toFixed(1) : null;

  /* auto work-status suggestion */
  out.suggested_status = suggestStatus(w, out);
  return out;
}

function suggestStatus(w, d) {
  const cur = s(w.work_status);
  if (['Cancelled / Dropped', 'Litigation / Court Case', 'Administered / Stayed', 'Stalled / Stopped'].includes(cur)) return cur;
  if (!d.effective_amount && !w.aa_number && !w.ts_number) return 'Estimate under Preparation';
  if (w.ts_number && !w.aa_number) return 'Administrative Approval (AA) Awaited';
  if (w.aa_number && !w.tender_number && !w.contractor_name) return 'Sanctioned – Tender Stage';
  if (w.contractor_name && !w.wo_number) return 'Tender Awarded – WO Pending';
  if (w.wo_number && d.physical_progress >= 100) {
    return d.balance_amount <= 0 ? 'Completed & Fully Paid' : 'Completed – Final Bill Pending';
  }
  if (w.wo_number && d.physical_progress >= 50) return 'Progress – 50% to 89%';
  if (w.wo_number && d.physical_progress > 0) return 'In Progress';
  if (w.wo_number) return 'In Progress';
  return cur || 'Estimate under Preparation';
}

/** Re-derive financial progress / paid / bill status and persist (automation engine) */
function recompute(id) {
  const w = getWork(id);
  if (!w) return null;
  const bills = getBills(id);
  const paidFromBills = bills.reduce((a, b) => a + n(b.paid_amount), 0);
  const eff = effectiveAmount(w);
  const fin = eff > 0 ? +(paidFromBills / eff * 100).toFixed(2) : 0;
  const patch = {};
  if (bills.length) patch.amount_paid = +paidFromBills.toFixed(2);
  if (bills.length) patch.financial_progress = fin;
  if (!s(w.bill_status) || w.bill_status === 'AUTO') patch.bill_status = computeWork(w, bills, getMilestones(id)).bill_status_auto;
  const d = computeWork(Object.assign({}, w, patch), bills, getMilestones(id));
  patch.is_delayed = d.is_delayed;
  patch.updated_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const keys = Object.keys(patch);
  if (keys.length) {
    db.prepare(`UPDATE works SET ${keys.map(k => k + '=?').join(',')}, updated_at=datetime('now','localtime') WHERE id=?`)
      .run(...keys.map(k => patch[k]), id);
  }
  return getWork(id);
}

function recomputeAll() {
  const ids = db.prepare('SELECT id FROM works WHERE COALESCE(is_deleted,0)=0').all().map(r => r.id);
  ids.forEach(recompute);
  return ids.length;
}

/* ------------------------------------------------------------------ CRUD: works */
const WORK_FIELDS = db.prepare("PRAGMA table_info(works)").all().map(c => c.name)
  .filter(c => !['id', 'created_at', 'updated_at'].includes(c));

function listWorks({ includeDeleted = false } = {}) {
  const q = includeDeleted ? 'SELECT * FROM works ORDER BY id'
                           : 'SELECT * FROM works WHERE COALESCE(is_deleted,0)=0 ORDER BY id';
  return db.prepare(q).all();
}

function getWorkFull(id) {
  const w = db.prepare('SELECT * FROM works WHERE id=?').get(id);
  if (!w) return null;
  return computeWork(w, getBills(id), getMilestones(id));
}
function getWork(id) { return db.prepare('SELECT * FROM works WHERE id=?').get(id); }

function getAllFull() {
  const works = listWorks();
  const bills = db.prepare('SELECT * FROM bills').all();
  const ms = db.prepare('SELECT * FROM milestones').all();
  const byId = new Map();
  works.forEach(w => byId.set(w.id, []));
  bills.forEach(b => byId.has(b.work_id) && byId.get(b.work_id).push(b));
  const msById = new Map();
  works.forEach(w => msById.set(w.id, []));
  ms.forEach(m => msById.has(m.work_id) && msById.get(m.work_id).push(m));
  return works.map(w => computeWork(w, byId.get(w.id) || [], msById.get(w.id) || []));
}

const NUM_COLS = ['aa_amount','ts_amount','est_amount','revised_est_amount','budget_provision','wo_amount',
  'physical_progress','financial_progress','amount_paid','stalled','is_delayed','is_deleted'];
const TEXT_COLS = WORK_FIELDS.filter(f => !NUM_COLS.includes(f));

function insertWork(data) {
  const row = {};
  WORK_FIELDS.forEach(f => { row[f] = data[f] !== undefined ? data[f] : null; });
  row.is_deleted = 0;
  /* numeric / status columns must never be NULL – keep DB defaults semantics */
  ['aa_amount','ts_amount','est_amount','revised_est_amount','budget_provision','wo_amount',
   'physical_progress','financial_progress','amount_paid'].forEach(k => { if (row[k] === null || row[k] === undefined || row[k] === '') row[k] = 0; });
  /* every TEXT column defaults to '' so exports never show blank/NULL artefacts */
  TEXT_COLS.forEach(k => { if (row[k] === null || row[k] === undefined) row[k] = ''; });
  if (!row.district) row.district = 'Nashik';
  const cols = Object.keys(row);
  const info = db.prepare(`INSERT INTO works(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`).run(...cols.map(c => row[c]));
  return info.lastInsertRowid;
}
function updateWork(id, data) {
  const cols = Object.keys(data).filter(c => WORK_FIELDS.includes(c));
  if (!cols.length) return 0;
  db.prepare(`UPDATE works SET ${cols.map(c => c + '=?').join(',')} WHERE id=?`).run(...cols.map(c => data[c]), id);
  return 1;
}
function softDelete(id, flag = 1) { db.prepare('UPDATE works SET is_deleted=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?').run(flag ? 1 : 0, id); }
function purgeWork(id) {
  db.prepare('DELETE FROM bills WHERE work_id=?').run(id);
  db.prepare('DELETE FROM milestones WHERE work_id=?').run(id);
  db.prepare('DELETE FROM documents WHERE work_id=?').run(id);
  db.prepare('DELETE FROM notes WHERE work_id=?').run(id);
  db.prepare('DELETE FROM progress_log WHERE work_id=?').run(id);
  db.prepare('DELETE FROM works WHERE id=?').run(id);
}

/* ------------------------------------------------------------------ CRUD: children */
function getBills(workId) { return db.prepare('SELECT * FROM bills WHERE work_id=? ORDER BY COALESCE(submitted_date,bill_date,id)').all(workId); }
function getAllBills() { return db.prepare('SELECT * FROM bills ORDER BY id DESC').all(); }
function addBill(b) {
  const cols = ['work_id', 'bill_type', 'bill_number', 'bill_date', 'submitted_date', 'amount', 'paid_amount', 'paid_date', 'status', 'voucher_number', 'treasury_ref', 'objection', 'remarks'];
  const info = db.prepare(`INSERT INTO bills(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`)
    .run(...cols.map(c => b[c] !== undefined ? b[c] : null));
  return info.lastInsertRowid;
}
function updateBill(id, b) {
  const cols = Object.keys(b).filter(c => c !== 'id' && c !== 'created_at');
  if (!cols.length) return;
  db.prepare(`UPDATE bills SET ${cols.map(c => c + '=?').join(',')} WHERE id=?`).run(...cols.map(c => b[c]), id);
}
function deleteBill(id) { db.prepare('DELETE FROM bills WHERE id=?').run(id); }

function getMilestones(workId) { return db.prepare('SELECT * FROM milestones WHERE work_id=? ORDER BY COALESCE(planned_date,id)').all(workId); }
function addMilestone(m) {
  const cols = ['work_id', 'name', 'planned_date', 'actual_date', 'status', 'responsible', 'remarks'];
  return db.prepare(`INSERT INTO milestones(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`).run(...cols.map(c => m[c] !== undefined ? m[c] : null)).lastInsertRowid;
}
function updateMilestone(id, m) {
  const cols = Object.keys(m).filter(c => c !== 'id' && c !== 'created_at');
  if (!cols.length) return;
  db.prepare(`UPDATE milestones SET ${cols.map(c => c + '=?').join(',')} WHERE id=?`).run(...cols.map(c => m[c]), id);
}
function deleteMilestone(id) { db.prepare('DELETE FROM milestones WHERE id=?').run(id); }
/** Auto-create the standard milestone checklist for a work */
function seedMilestones(workId, names = C.MILESTONES) {
  const ex = db.prepare('SELECT name FROM milestones WHERE work_id=?').all(workId).map(r => r.name);
  const ins = db.prepare('INSERT INTO milestones(work_id,name,status) VALUES(?,?,?)');
  names.forEach(nm => { if (!ex.includes(nm)) ins.run(workId, nm, 'Not Started'); });
}

function getDocuments(workId) { return db.prepare('SELECT * FROM documents WHERE work_id=? ORDER BY id').all(workId); }
function addDocument(d) {
  const cols = ['work_id', 'name', 'status', 'ref_number', 'date', 'file_name', 'remarks'];
  return db.prepare(`INSERT INTO documents(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`).run(...cols.map(c => d[c] !== undefined ? d[c] : null)).lastInsertRowid;
}
function updateDocument(id, d) {
  const cols = Object.keys(d).filter(c => c !== 'id' && c !== 'created_at');
  if (!cols.length) return;
  db.prepare(`UPDATE documents SET ${cols.map(c => c + '=?').join(',')} WHERE id=?`).run(...cols.map(c => d[c]), id);
}
function deleteDocument(id) { db.prepare('DELETE FROM documents WHERE id=?').run(id); }
function seedDocuments(workId, names = C.DOCUMENTS) {
  const ex = db.prepare('SELECT name FROM documents WHERE work_id=?').all(workId).map(r => r.name);
  const ins = db.prepare('INSERT INTO documents(work_id,name,status) VALUES(?,?,?)');
  names.forEach(nm => { if (!ex.includes(nm)) ins.run(workId, nm, 'Pending'); });
}

function getNotes(workId) { return db.prepare('SELECT * FROM notes WHERE work_id=? ORDER BY id DESC').all(workId); }
function addNote(x) { return db.prepare('INSERT INTO notes(work_id,note,author) VALUES(?,?,?)').run(x.work_id, x.note, x.author || '').lastInsertRowid; }
function deleteNote(id) { db.prepare('DELETE FROM notes WHERE id=?').run(id); }

function getProgressLog(workId) { return db.prepare('SELECT * FROM progress_log WHERE work_id=? ORDER BY date,id').all(workId); }
function addProgress(p) { return db.prepare('INSERT INTO progress_log(work_id,date,physical,financial,note) VALUES(?,?,?,?,?)').run(p.work_id, p.date || today(), n(p.physical), n(p.financial), p.note || '').lastInsertRowid; }
function deleteProgress(id) { db.prepare('DELETE FROM progress_log WHERE id=?').run(id); }

function getLogs(limit = 300) { return db.prepare('SELECT * FROM logs ORDER BY id DESC LIMIT ?').all(limit); }

module.exports = {
  db, DB_PATH, n, s, today, daysBetween, effectiveAmount, computeWork, suggestStatus,
  recompute, recomputeAll, masters, setSetting, getSetting, getJSON, log,
  WORK_FIELDS, listWorks, getAllFull, getWork, getWorkFull, insertWork, updateWork, softDelete, purgeWork,
  getBills, getAllBills, addBill, updateBill, deleteBill,
  getMilestones, addMilestone, updateMilestone, deleteMilestone, seedMilestones,
  getDocuments, addDocument, updateDocument, deleteDocument, seedDocuments,
  getNotes, addNote, deleteNote, getProgressLog, addProgress, deleteProgress, getLogs,
};
