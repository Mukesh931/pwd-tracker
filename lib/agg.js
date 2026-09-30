'use strict';
/* ============================================================
   Aggregation / analytics engine – dashboard, summaries, alerts
   ============================================================ */
const D = require('./db');
const C = require('./config');

const sum = (arr, f) => arr.reduce((a, x) => a + (Number(f(x)) || 0), 0);
const round2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
const today = D.today;

/* ---------------- filtering ----------------
   f = { q, taluka, division, sub_division, section, head, nature, fund, status, bill_status,
         fy, year, priority, rag, delayed, stalled, contractor, amountMin, amountMax, targetFrom, targetTo } */
function applyFilters(rows, f = {}) {
  const q = (f.q || '').trim().toLowerCase();
  return rows.filter(w => {
    if (q) {
      const hay = [w.work_name, w.est_number, w.aa_number, w.ts_number, w.wo_number, w.tender_number,
        w.contractor_name, w.village, w.taluka, w.head_of_account, w.head_desc, w.scheme_name, w.division,
        w.sub_division, w.section, w.fund_source, w.nature_of_work, w.work_status, w.bill_status, String(w.id)]
        .join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    const eq = (key, val) => !val || val === 'ALL' || String(w[key]) === String(val);
    if (!eq('taluka', f.taluka)) return false;
    if (!eq('division', f.division)) return false;
    if (!eq('sub_division', f.sub_division)) return false;
    if (!eq('section', f.section)) return false;
    if (!eq('head_of_account', f.head)) return false;
    if (!eq('nature_of_work', f.nature)) return false;
    if (!eq('fund_source', f.fund)) return false;
    if (!eq('work_status', f.status)) return false;
    if (!eq('contractor_name', f.contractor)) return false;
    if (!eq('priority', f.priority)) return false;
    if (!eq('rag', f.rag)) return false;
    if (!eq('financial_year', f.fy)) return false;
    if (!eq('est_year', f.year)) return false;
    const bs = f.bill_status;
    if (bs && bs !== 'ALL' && String(w.bill_status_auto) !== String(bs)) return false;
    if (f.delayed === '1' && !w.is_delayed) return false;
    if (f.stalled === '1' && !w.stalled) return false;
    if (f.amountMin && w.effective_amount < Number(f.amountMin)) return false;
    if (f.amountMax && w.effective_amount > Number(f.amountMax)) return false;
    if (f.targetFrom && (!w.effective_target || w.effective_target < f.targetFrom)) return false;
    if (f.targetTo && (!w.effective_target || w.effective_target > f.targetTo)) return false;
    return true;
  });
}

function totals(rows) {
  const est = sum(rows, w => w.effective_amount);
  const paid = sum(rows, w => w.amount_paid);
  const phys = sum(rows, w => w.physical_progress);
  return {
    count: rows.length,
    est_amount: round2(est),
    aa_amount: round2(sum(rows, w => w.aa_amount)),
    ts_amount: round2(sum(rows, w => w.est_amount || w.ts_amount)),
    revised_amount: round2(sum(rows, w => w.revised_est_amount)),
    wo_amount: round2(sum(rows, w => w.wo_amount)),
    budget_provision: round2(sum(rows, w => w.budget_provision)),
    paid: round2(paid),
    balance: round2(Math.max(0, est - paid)),
    bills_pending_amount: round2(sum(rows, w => w.bills_pending_amount)),
    unpaid_bills: sum(rows, w => w.unpaid_bill_count),
    avg_physical: rows.length ? round2(phys / rows.length) : 0,
    avg_financial: est > 0 ? round2(paid / est * 100) : 0,
    completed: rows.filter(w => w.physical_progress >= 100).length,
    delayed: rows.filter(w => w.is_delayed).length,
    stalled: rows.filter(w => w.stalled).length,
    ongoing: rows.filter(w => w.physical_progress > 0 && w.physical_progress < 100).length,
    not_started: rows.filter(w => !w.physical_progress && w.physical_progress !== 100).length,
  };
}

function groupBy(rows, keyFn) {
  const map = new Map();
  rows.forEach(w => {
    const k = keyFn(w) || '— Not specified —';
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(w);
  });
  return map;
}

function groupSummary(rows, keyFn, sortField = 'est_amount') {
  const out = [];
  for (const [k, list] of groupBy(rows, keyFn)) {
    const t = totals(list);
    out.push(Object.assign({ key: k, label: k }, t));
  }
  out.sort((a, b) => (b[sortField] || 0) - (a[sortField] || 0));
  return out;
}

/* ---------------- dashboard ---------------- */
function dashboard(rows, allRows) {
  const t = totals(rows);
  const rag = { RED: 0, AMBER: 0, GREEN: 0 };
  rows.forEach(w => { rag[w.rag] = (rag[w.rag] || 0) + 1; });

  const stageOrder = C.WORK_STATUS.map(s => s.v);
  const stage = stageOrder.map(v => ({ label: v, count: rows.filter(w => w.work_status === v).length }))
    .filter(x => x.count > 0);

  const billStatus = C.BILL_STATUS.map(s => s.v).map(v => ({
    label: v, count: rows.filter(w => w.bill_status_auto === v).length,
    amount: round2(sum(rows.filter(w => w.bill_status_auto === v), w => w.bills_pending_amount)),
  })).filter(x => x.count > 0);

  const taluka = groupSummary(rows, w => w.taluka).sort((a, b) => a.key.localeCompare(b.key));
  const head = groupSummary(rows, w => w.head_of_account);
  const nature = groupSummary(rows, w => w.nature_of_work);
  const fund = groupSummary(rows, w => w.fund_source);
  const division = groupSummary(rows, w => w.division);
  const contractor = groupSummary(rows, w => w.contractor_name || '(Not awarded)').filter(x => x.key !== '(Not awarded)');
  const utility = C.UTILITY_CONNECTION.map(v => ({ label: v, count: rows.filter(w => w.utility_connection === v).length })).filter(x => x.count);
  const quality = C.QUALITY_INSPECTION.map(v => ({ label: v, count: rows.filter(w => w.quality_inspection === v).length })).filter(x => x.count);
  const mb = ['Pending', 'In Progress', 'Completed', 'Not Required'].map(v => ({ label: v, count: rows.filter(w => w.mb_status === v).length })).filter(x => x.count);
  const sd = ['Pending', 'Received', 'Refunded', 'Forfeited', 'Not Applicable'].map(v => ({ label: v, count: rows.filter(w => w.sd_status === v).length })).filter(x => x.count);

  /* S-curve: cumulative paid per month (from bill paid dates) */
  const monthly = new Map();
  rows.forEach(w => {
    D.getBills(w.id).forEach(b => {
      if (b.paid_date && Number(b.paid_amount) > 0) {
        const k = b.paid_date.slice(0, 7);
        monthly.set(k, (monthly.get(k) || 0) + Number(b.paid_amount));
      }
    });
  });
  const months = [...monthly.keys()].sort();
  let cum = 0;
  const scurve = months.map(m => { cum += monthly.get(m); return { label: m, value: round2(monthly.get(m)), cumulative: round2(cum) }; });

  /* physical S-curve from progress_log */
  const pmap = new Map();
  rows.forEach(w => D.getProgressLog(w.id).forEach(p => {
    const k = (p.date || '').slice(0, 7);
    if (!k) return;
    if (!pmap.has(k)) pmap.set(k, []);
    pmap.get(k).push(Number(p.physical) || 0);
  }));
  const pmonths = [...pmap.keys()].sort();
  const pcurve = pmonths.map(m => {
    const arr = pmap.get(m);
    return { label: m, value: round2(sum(arr, x => x) / arr.length) };
  });

  return {
    totals: t, rag, stage, billStatus, taluka, head, nature, fund, division, contractor,
    utility, quality, mb, sd, scurve, pcurve, alerts: alerts(rows), generated_at: new Date().toLocaleString('en-IN'),
  };
}

/* ---------------- alerts / reminders ---------------- */
function alerts(rows) {
  const A = { overdue_target: [], stalled: [], bill_overdue: [], milestone_due: [], milestone_overdue: [],
              target_soon: [], wo_pending: [], final_bill_pending: [], budget_short: [], data_gaps: [] };
  const t = today();
  rows.forEach(w => {
    if (w.stalled) A.stalled.push(w);
    if (w.is_delayed) A.overdue_target.push(w);
    if (w.bill_pending_days > C.RULES.billPendingAlertDays && w.bills_pending_amount > 0) A.bill_overdue.push(w);
    if (w.days_to_target !== null && w.days_to_target >= 0 && w.days_to_target <= 30 && w.physical_progress < 100) A.target_soon.push(w);
    if (!w.wo_number && w.contractor_name) A.wo_pending.push(w);
    if (w.physical_progress >= 100 && w.balance_amount > 0 && !['Completed & Fully Paid', 'Cancelled / Dropped'].includes(w.work_status)) A.final_bill_pending.push(w);
    if (w.aa_amount > 0 && w.budget_provision > 0 && w.budget_provision < w.aa_amount) A.budget_short.push(w);
    const gaps = [];
    if (!w.est_number) gaps.push('Est No.');
    if (!w.head_of_account) gaps.push('Head of Account');
    if (!w.taluka) gaps.push('Taluka');
    if (!w.aa_number && w.aa_amount) gaps.push('AA Order No.');
    if (!w.target_date && w.wo_number) gaps.push('Target date');
    if (gaps.length) A.data_gaps.push({ w, gaps: gaps.join(', ') });
    /* milestones */
    D.getMilestones(w.id).forEach(m => {
      if (m.status === 'Completed') return;
      if (!m.planned_date) return;
      if (m.planned_date < t) A.milestone_overdue.push({ work: w, m, days: D.daysBetween(m.planned_date, t) });
      else if (D.daysBetween(t, m.planned_date) <= 45) A.milestone_due.push({ work: w, m, days: D.daysBetween(t, m.planned_date) });
    });
  });
  const cnt = Object.fromEntries(Object.entries(A).map(([k, v]) => [k, v.length]));
  cnt.total = Object.values(cnt).reduce((a, b) => a + b, 0);
  return { items: A, counts: cnt };
}

/* ---------------- bill register ---------------- */
function billRegister(rows) {
  const out = [];
  rows.forEach(w => {
    D.getBills(w.id).forEach(b => {
      const pending = round2(Number(b.amount) - Number(b.paid_amount));
      const ageingFrom = b.submitted_date || b.bill_date;
      out.push({
        work_id: w.id, work_name: w.work_name, est_number: w.est_number, taluka: w.taluka,
        division: w.division, sub_division: w.sub_division, contractor: w.contractor_name,
        aa_amount: w.aa_amount, est_amount: w.est_amount, effective_amount: w.effective_amount,
        bill_id: b.id, bill_type: b.bill_type, bill_number: b.bill_number, bill_date: b.bill_date,
        submitted_date: b.submitted_date, amount: Number(b.amount), paid_amount: Number(b.paid_amount),
        paid_date: b.paid_date, pending, status: b.status, voucher_number: b.voucher_number,
        treasury_ref: b.treasury_ref, objection: b.objection, remarks: b.remarks,
        ageing_days: ageingFrom && b.status !== 'Paid / Disbursed' ? Math.max(0, D.daysBetween(ageingFrom, today())) : 0,
      });
    });
  });
  out.sort((a, b) => (a.taluka || '').localeCompare(b.taluka || '') || a.work_id - b.work_id);
  return out;
}

/* ---------------- milestone tracker ---------------- */
function milestoneTracker(rows) {
  const out = [];
  rows.forEach(w => D.getMilestones(w.id).forEach(m => {
    const overdue = m.status !== 'Completed' && m.planned_date && m.planned_date < today();
    out.push({
      work_id: w.id, work_name: w.work_name, est_number: w.est_number, taluka: w.taluka,
      milestone: m.name, planned_date: m.planned_date, actual_date: m.actual_date, status: m.status,
      responsible: m.responsible, remarks: m.remarks,
      days_left: m.planned_date ? D.daysBetween(today(), m.planned_date) : null,
      overdue_days: overdue ? D.daysBetween(m.planned_date, today()) : 0,
      flag: m.status === 'Completed' ? 'DONE' : overdue ? 'OVERDUE' : (m.planned_date && D.daysBetween(today(), m.planned_date) <= 30 ? 'DUE SOON' : 'SCHEDULED'),
    });
  }));
  return out;
}

/* ---------------- head-of-account summary ---------------- */
function headSummary(rows) {
  return groupSummary(rows, w => (w.head_of_account ? `${w.head_of_account} – ${w.head_desc || ''}` : '— Head not specified —'));
}

module.exports = { applyFilters, totals, groupBy, groupSummary, dashboard, alerts, billRegister, milestoneTracker, headSummary, sum, round2 };
