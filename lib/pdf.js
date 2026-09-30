'use strict';
/* ============================================================
   PDF report generator (PDFKit) – government-style statements
   Supports Devanagari (Noto Sans Devanagari) + Latin (DejaVu Sans)
   ============================================================ */
const PDFDocument = require('pdfkit');
const path = require('path');
const D = require('./db');
const A = require('./agg');
const C = require('./config');

const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
const F = {
  reg: path.join(FONT_DIR, 'NotoSansDevanagari-Regular.ttf'),
  bold: path.join(FONT_DIR, 'NotoSansDevanagari-Bold.ttf'),
  dv: path.join(FONT_DIR, 'DejaVuSans.ttf'),
  dvb: path.join(FONT_DIR, 'DejaVuSans-Bold.ttf'),
};
const NAVY = '#12314f', ACCENT = '#b3541e', LIGHT = '#eef2f7', GREY = '#5a6673', RED = '#b3261e',
      AMBER = '#a06a00', GREEN = '#1b6b34', BORDER = '#b9c4d0';

/* ---------- formatting ---------- */
const today = D.today;
const inr = (v, dec = 2) => {
  const x = Number(v) || 0;
  return x.toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
};
const lakh = (v) => `${inr((Number(v) || 0) / 100000, 2)}`;
const inr0 = (v) => inr(v, 0);
const inLakh = (v) => (Number(v) || 0) / 100000;
const dt = (s) => (s ? String(s).split('T')[0].split('-').reverse().join('-') : '—');
const trim = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const hasDeva = (s) => /[\u0900-\u097F]/.test(String(s || ''));
/* split a string into consecutive Devanagari / non-Devanagari runs */
function mixedRuns(str) {
  const out = []; let cur = '', dev = null;
  for (const ch of String(str)) {
    const d = /[\u0900-\u097F]/.test(ch);
    if (dev === null) { dev = d; cur = ch; }
    else if (d === dev) cur += ch;
    else { out.push({ t: cur, deva: dev }); cur = ch; dev = d; }
  }
  if (cur) out.push({ t: cur, deva: dev });
  return out;
}
const stamp = () => {
  const d = new Date();
  return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};
const pageOf = () => `Generated on ${stamp()}`;

/* ---------- document factory ---------- */
function createDoc(landscape = true, title = '') {
  const doc = new PDFDocument({
    size: 'A4', layout: landscape ? 'landscape' : 'portrait',
    margins: { top: 42, bottom: 46, left: 34, right: 34 },
    info: { Title: title, Author: C.APP.office, Creator: C.APP.nameShort, Subject: title },
    bufferPages: true,
  });
  doc.__fonts = {
    set(kind, size) {
      const deva = this.deva;
      doc.font(deva ? (kind === 'b' ? F.bold : F.reg) : (kind === 'b' ? F.dvb : F.dv)).fontSize(size);
      return doc;
    },
    deva: false,
    /* PDFKit requires x/y as *positional* args – options.x/options.y are ignored */
    text(str, opts = {}) {
      const { x, y, ...rest } = opts;
      const s = str === null || str === undefined ? '' : String(str);
      if (rest.color) { doc.fillColor(rest.color); delete rest.color; }
      const rs = mixedRuns(s);
      if (rs.length <= 1) {
        this.deva = hasDeva(s);
        this.set(rest.bold ? 'b' : 'r', rest.size || 9);
        if (x === undefined && y === undefined) return doc.text(s, rest);
        return doc.text(s, x === undefined ? null : x, y === undefined ? null : y, rest);
      }
      /* mixed Devanagari + Latin */
      const size = rest.size || 9;
      const measure = (run) => {
        this.deva = run.deva; this.set(rest.bold ? 'b' : 'r', size);
        return doc.widthOfString(run.t);
      };
      if (rest.align === 'center' || rest.align === 'right') {
        /* single line: place runs back-to-back at a computed origin so the
           combined string is centred / right-aligned as one unit */
        const widths = rs.map(measure);
        const total = widths.reduce((a, b) => a + b, 0);
        const boxW = rest.width || 0;
        let cx = rest.align === 'center' ? (x || 0) + Math.max(0, (boxW - total) / 2) : (x || 0) + Math.max(0, boxW - total);
        rs.forEach((run, i) => {
          this.deva = run.deva; this.set(rest.bold ? 'b' : 'r', size);
          doc.text(run.t, cx, y === undefined ? null : y, { lineBreak: false, width: widths[i] + 2 });
          cx += widths[i];
        });
        this.deva = hasDeva(s);
        return doc;
      }
      /* left-aligned: one flowing paragraph with continued runs (wraps properly) */
      const noEllipsis = Object.assign({}, rest, { ellipsis: false, lineBreak: true });
      delete noEllipsis.height;
      rs.forEach((run, i) => {
        this.deva = run.deva;
        this.set(rest.bold ? 'b' : 'r', size);
        const o = Object.assign({}, noEllipsis, { continued: i < rs.length - 1 });
        if (i === 0) doc.text(run.t, x === undefined ? null : x, y === undefined ? null : y, o);
        else doc.text(run.t, o);
      });
      this.deva = hasDeva(s);
      return doc;
    },
  };
  return doc;
}

function letterhead(doc, lh, title, subtitle) {
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  let y = doc.page.margins.top - 6;
  doc.save();
  doc.rect(0, 0, doc.page.width, 8).fill(NAVY);
  doc.__fonts.text(lh.line1, { x: doc.page.margins.left, y, size: 8.5, bold: true, align: 'center', width: w, color: GREY });
  y += 13;
  doc.__fonts.text(lh.line2, { x: doc.page.margins.left, y, size: 15, bold: true, align: 'center', width: w, color: NAVY });
  y += 21;
  doc.__fonts.text(lh.line3, { x: doc.page.margins.left, y, size: 10.5, align: 'center', width: w, color: NAVY });
  y += 15;
  doc.__fonts.text(lh.line4, { x: doc.page.margins.left, y, size: 8.5, align: 'center', width: w, color: GREY });
  y += 14;
  doc.moveTo(doc.page.margins.left, y).lineTo(doc.page.margins.left + w, y).lineWidth(1.6).stroke(ACCENT);
  y += 8;
  doc.__fonts.text(title, { x: doc.page.margins.left, y, size: 12.5, bold: true, align: 'center', width: w, color: '#000000' });
  y += 18;
  if (subtitle) {
    doc.__fonts.text(subtitle, { x: doc.page.margins.left, y, size: 9, align: 'center', width: w, color: GREY });
    y += 14;
  }
  doc.restore();
  doc.y = y + 2;
  return doc;
}

function metaBar(doc, lines) {
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const boxH = 12 + lines.length * 11;
  if (doc.y + boxH > doc.page.height - doc.page.margins.bottom - 30) doc.addPage();
  const y = doc.y;
  doc.save().rect(doc.page.margins.left, y, w, boxH).fillAndStroke('#f7f9fc', BORDER).restore();
  lines.forEach((ln, i) => {
    doc.__fonts.text(ln, { x: doc.page.margins.left + 6, y: y + 5 + i * 11, size: 8, color: GREY });
  });
  doc.y = y + boxH + 8;
}

/* ---------- table engine ---------- */
/**
 * cols: [{h:'Header', w:widthPts, align:'l'|'r'|'c', fmt:(row)=>value, bold:bool, wrap:bool, color:(row)=>hex}]
 */
function drawTable(doc, colsIn, rows, opt = {}) {
  const fs = opt.fontSize || 7.6;
  const headH = opt.headH || 26;
  const pad = 3.2;
  const startX = doc.page.margins.left;
  const bottomLimit = () => doc.page.height - doc.page.margins.bottom - 34;
  /* fit columns to the printable width so tables never bleed off the page */
  const availW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  let cols = colsIn;
  const rawW = colsIn.reduce((a, c) => a + c.w, 0);
  if (rawW > availW) { const sc = availW / rawW; cols = colsIn.map(c => Object.assign({}, c, { w: Math.floor(c.w * sc) })); }
  const totalW = cols.reduce((a, c) => a + c.w, 0);

  const drawHead = (y) => {
    doc.save();
    doc.rect(startX, y, totalW, headH).fill(NAVY);
    let x = startX;
    cols.forEach(c => {
      doc.__fonts.text(c.h, { x: x + pad, y: y + 4, size: fs + 0.2, bold: true, width: c.w - pad * 2, height: headH - 6,
        align: c.align === 'r' ? 'right' : (c.align === 'c' ? 'center' : 'left'), color: '#ffffff', ellipsis: true });
      x += c.w;
    });
    doc.restore();
    return y + headH;
  };

  const measure = (row, idx) => {
    let h = fs + 6;
    cols.forEach(c => {
      const v = c.fmt ? c.fmt(row, idx) : (row[c.k] ?? '');
      const s2 = v === null || v === undefined ? '' : String(v);
      const lines = doc.font(hasDeva(s2) ? F.reg : F.dv).fontSize(fs).heightOfString(s2, { width: c.w - pad * 2 });
      h = Math.max(h, lines + 5);
    });
    return Math.min(h, opt.maxRowH || 70);
  };

  let y = drawHead(doc.y);
  let pageRows = 0;

  rows.forEach((row, idx) => {
    const rh = measure(row, idx);
    if (y + rh > bottomLimit()) {
      doc.addPage();
      if (opt.repeatTitle) {
        letterhead(doc, opt.lh, opt.repeatTitle, opt.repeatSubtitle);
      }
      y = drawHead(doc.y);
      pageRows = 0;
    }
    /* banding */
    const band = row.__band || (idx % 2 === 0 ? '#ffffff' : '#f5f8fc');
    const bg = row.__group ? '#e3ebf4' : band;
    doc.save().rect(startX, y, totalW, rh).fill(bg).restore();
    if (row.__group) doc.save().rect(startX, y, 3, rh).fill(ACCENT).restore();
    let x = startX;
    cols.forEach(c => {
      const v = c.fmt ? c.fmt(row, idx) : (row[c.k] ?? '');
      const s2 = v === null || v === undefined ? '' : String(v);
      const col = (c.color && c.color(row)) || (row.__group ? NAVY : '#16202b');
      doc.save();
      doc.rect(startX, y, totalW, rh).clip();
      doc.__fonts.text(s2, { x: x + pad, y: y + 2.6, size: fs, width: c.w - pad * 2, height: rh - 4,
        align: c.align === 'r' ? 'right' : (c.align === 'c' ? 'center' : 'left'), color: col,
        bold: !!(c.bold || row.__group), ellipsis: !c.wrap, lineBreak: !!c.wrap });
      doc.restore();
      x += c.w;
    });
    /* cell borders */
    doc.save().rect(startX, y, totalW, rh).lineWidth(0.4).stroke('#dfe6ee').restore();
    let bx = startX;
    cols.slice(0, -1).forEach(c => { bx += c.w; doc.save().moveTo(bx, y).lineTo(bx, y + rh).lineWidth(0.3).stroke('#e6ebf1').restore(); });
    y += rh; pageRows++;
  });

  /* totals row */
  if (opt.totalsRow) {
    if (y + 18 > bottomLimit()) { doc.addPage(); y = drawHead(doc.y); }
    const rh = 18;
    doc.save().rect(startX, y, totalW, rh).fill('#dce6f1').restore();
    let x = startX;
    opt.totalsRow.forEach((cell, i) => {
      doc.__fonts.text(cell === null || cell === undefined ? '' : String(cell), {
        x: x + pad, y: y + 5, size: fs + 0.3, bold: true, width: cols[i].w - pad * 2,
        align: cols[i].align === 'r' ? 'right' : (cols[i].align === 'c' ? 'center' : 'left'), color: NAVY });
      x += cols[i].w;
    });
    doc.save().rect(startX, y, totalW, rh).lineWidth(0.6).stroke(NAVY).restore();
    y += rh;
  }
  doc.y = y + 10;
  return doc;
}

function kpiStrip(doc, kpis) {
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const bw = w / kpis.length;
  const y = doc.y, h = 40;
  kpis.forEach((k, i) => {
    const x = doc.page.margins.left + i * bw;
    doc.save().rect(x + 1, y, bw - 2, h).fillAndStroke('#f7f9fc', k.color || BORDER).restore();
    doc.save().rect(x + 1, y, 3, h).fill(k.color || NAVY).restore();
    doc.__fonts.text(k.label.toUpperCase(), { x: x + 9, y: y + 5, size: 6.6, color: GREY, width: bw - 14 });
    doc.__fonts.text(k.value, { x: x + 9, y: y + 15, size: 13, bold: true, color: k.color || NAVY, width: bw - 14 });
    if (k.sub) doc.__fonts.text(k.sub, { x: x + 9, y: y + 31, size: 6.6, color: GREY, width: bw - 14 });
  });
  doc.y = y + h + 12;
}

function sectionTitle(doc, text) {
  const y = doc.y;
  doc.save().rect(doc.page.margins.left, y, 3.5, 13).fill(ACCENT).restore();
  doc.__fonts.text(text, { x: doc.page.margins.left + 8, y: y + 1, size: 10.5, bold: true, color: NAVY });
  doc.y = y + 18;
}

function note(doc, text, color = GREY) {
  doc.__fonts.text(text, { x: doc.page.margins.left, y: doc.y, size: 8, color, width: doc.page.width - doc.page.margins.left - doc.page.margins.right });
  doc.y += 6;
}

function signatureBlock(doc, lh, extra = []) {
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const need = 80 + extra.length * 12;
  if (doc.y + need > doc.page.height - doc.page.margins.bottom) doc.addPage();
  extra.forEach(t => note(doc, t, GREY));
  doc.y += 14;
  const y = doc.y;
  const halves = [lh.signLeft, lh.signRight];
  halves.forEach((txt, i) => {
    const x = doc.page.margins.left + i * (w / 2);
    doc.save().moveTo(x + 40, y + 44).lineTo(x + 200, y + 44).lineWidth(0.7).stroke('#8c97a3').restore();
    String(txt || '').split('\n').forEach((line, j) => {
      doc.__fonts.text(line, { x: x + 40, y: y + 48 + j * 11, size: j === 0 ? 8.4 : 7.8, bold: j === 0, color: j === 0 ? NAVY : GREY });
    });
  });
  doc.y = y + 80;
}

function footerSetup(doc, lh) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    /* temporarily shrink the bottom margin so the footer (in the margin band)
       does not trip PDFKit's automatic page-break and spawn blank pages */
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 4;
    const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const y = doc.page.height - 26;
    doc.save();
    doc.moveTo(doc.page.margins.left, y - 6).lineTo(doc.page.margins.left + w, y - 6).lineWidth(0.5).stroke(BORDER);
    doc.__fonts.text(`${C.APP.nameShort} • ${C.APP.office}, ${C.APP.district}`, { x: doc.page.margins.left, y, size: 7, color: GREY });
    doc.__fonts.text(`${pageOf()}   •   Page ${i - range.start + 1} of ${range.count}`, { x: doc.page.margins.left, y, size: 7, color: GREY, align: 'right', width: w });
    doc.restore();
    doc.page.margins.bottom = savedBottom;
  }
}

/* ---------- column presets ---------- */
const colSNo = (w = 22) => ({ h: 'Sr.', w, align: 'c', fmt: (r, i) => i + 1 });
const colAmt = (h, w, f) => ({ h, w, align: 'r', fmt: f });

function standardCols(units = 'Rs') {
  const sc = units === 'lakh'
    ? { aa: (r) => lakh(r.aa_amount), est: (r) => lakh(r.est_amount), paid: (r) => lakh(r.amount_paid), bal: (r) => lakh(r.balance_amount), bud: (r) => lakh(r.budget_provision) }
    : { aa: (r) => inr0(r.aa_amount), est: (r) => inr0(r.est_amount), paid: (r) => inr0(r.amount_paid), bal: (r) => inr0(r.balance_amount), bud: (r) => inr0(r.budget_provision) };
  const unit = units === 'lakh' ? ' (₹ Lakh)' : ' (₹)';
  return { sc, unit };
}

const RAGCOL = { RED: RED, AMBER: AMBER, GREEN: GREEN };

/* ---------- filter description ---------- */
function filterText(f, ctx) {
  const parts = [];
  const map = { taluka: 'Taluka', division: 'Division', sub_division: 'Sub-Division', section: 'Section',
    head: 'Head of Account', nature: 'Nature of Work', fund: 'Fund Source', status: 'Work Status',
    bill_status: 'Bill Status', fy: 'Financial Year', year: 'Estimate Year', contractor: 'Contractor',
    priority: 'Priority', rag: 'RAG' };
  Object.keys(map).forEach(k => { if (f[k] && f[k] !== 'ALL') parts.push(`${map[k]}: ${f[k]}`); });
  if (f.q) parts.push(`Search: "${f.q}"`);
  if (f.delayed === '1') parts.push('Only delayed works');
  if (f.stalled === '1') parts.push('Only stalled works');
  return parts.length ? parts.join('  |  ') : 'All works (no filter applied)';
}

/* ============================================================
   REPORTS
   ============================================================ */
function prepare(type, f) {
  const lh = Object.assign({}, C.DEFAULT_LETTERHEAD, D.getJSON('letterhead', C.DEFAULT_LETTERHEAD));
  let all = D.getAllFull();
  if (f && f.id) {
    const ids = String(f.id).split(',').map(x => Number(x.trim())).filter(Boolean);
    all = all.filter(w => ids.includes(w.id));
  }
  if (f && f.ids) {
    const ids = String(f.ids).split(',').map(x => Number(x.trim())).filter(Boolean);
    if (ids.length) all = all.filter(w => ids.includes(w.id));
  }
  const rows = A.applyFilters(all, f);
  const t = A.totals(rows);
  return { lh, all, rows, t, f, units: (f.units === 'lakh' || rows.some(r => r.effective_amount > 50000000)) ? (f.units || 'Rs') : (f.units || 'Rs') };
}

function kpisFor(t) {
  return [
    { label: 'Total Works', value: String(t.count), sub: `${t.ongoing} ongoing • ${t.completed} completed`, color: NAVY },
    { label: 'Est / AA Amount', value: `₹ ${lakh(t.est_amount)}`, sub: `AA ₹ ${lakh(t.aa_amount)} lakh`, color: '#1f5f8b' },
    { label: 'Amount Paid', value: `₹ ${lakh(t.paid)}`, sub: `Financial progress ${t.avg_financial}%`, color: GREEN },
    { label: 'Balance Amount', value: `₹ ${lakh(t.balance)}`, sub: `Pending bills ₹ ${lakh(t.bills_pending_amount)} lakh`, color: ACCENT },
    { label: 'Avg. Physical', value: `${t.avg_physical}%`, sub: `${t.not_started} not started`, color: '#6a4bb5' },
    { label: 'Delayed / Stalled', value: `${t.delayed} / ${t.stalled}`, sub: 'Needs immediate review', color: RED },
  ];
}

/* ---------- 1. Work progress statement ---------- */
function progress(p) {
  const { rows, t, f, lh } = p;
  const u = f.units || 'Rs';
  const { sc, unit } = standardCols(u);
  const doc = createDoc(u === 'Rs' ? true : true, 'Work Progress Statement');
  letterhead(doc, lh, 'WORK PROGRESS STATEMENT – ELECTRICAL WORKS (काम प्रगती अहवाल)',
    `${C.APP.office}, ${C.APP.district} District  •  As on ${dt(today())}`);
  kpiStrip(doc, kpisFor(t));
  metaBar(doc, [`Filters  ▸  ${filterText(f)}`, `Amounts in ${u === 'lakh' ? '₹ Lakh' : '₹ (Rupees)'}  •  Records: ${rows.length}  •  Source: ${C.APP.nameShort} database`]);

  const cols = [colSNo(20),
    { h: 'Work Name', w: 152, wrap: true, fmt: r => r.work_name },
    { h: 'Est. No.', w: 66, wrap: true, fmt: r => r.est_number },
    { h: 'Taluka', w: 56, fmt: r => r.taluka },
    { h: 'Head of Account', w: 66, wrap: true, fmt: r => r.head_of_account },
    { h: 'AA Amount' + unit, w: 70, align: 'r', fmt: sc.aa },
    { h: 'Est. (TS) Amt' + unit, w: 70, align: 'r', fmt: sc.est },
    { h: 'Paid' + unit, w: 66, align: 'r', fmt: sc.paid },
    { h: 'Balance' + unit, w: 66, align: 'r', fmt: sc.bal },
    { h: 'Phy.%', w: 34, align: 'c', fmt: r => r.physical_progress + '%' },
    { h: 'Work Status', w: 82, wrap: true, fmt: r => r.work_status },
    { h: 'Bill Status', w: 80, wrap: true, fmt: r => r.bill_status_auto, color: r => r.bill_pending_days > 60 ? RED : (r.bill_pending_days > 30 ? AMBER : '#16202b') },
    { h: 'Target', w: 52, align: 'c', fmt: r => dt(r.effective_target) },
    { h: 'RAG', w: 34, align: 'c', fmt: r => r.rag, color: r => RAGCOL[r.rag] || '#000' },
  ];
  const ordered = orderRows(rows, f);
  if (f.group === 'taluka') {
    const grouped = [];
    A.groupBy(ordered, r => r.taluka).forEach((list, k) => {
      const gt = A.totals(list);
      grouped.push({ __group: true, work_name: `TALUKA: ${k}  (${list.length} works)`, est_number: '', taluka: '', head_of_account: '', aa_amount: gt.aa_amount, est_amount: gt.est_amount, amount_paid: gt.paid, balance_amount: gt.balance, physical_progress: gt.avg_physical, work_status: '', bill_status_auto: '', effective_target: '', rag: '' });
      list.forEach(x => grouped.push(x));
    });
    drawTable(doc, cols, grouped, { repeatTitle: 'WORK PROGRESS STATEMENT – ELECTRICAL WORKS', repeatSubtitle: '(continued)', lh, fontSize: 7.2 });
  } else {
    drawTable(doc, cols, ordered, { repeatTitle: 'WORK PROGRESS STATEMENT – ELECTRICAL WORKS', repeatSubtitle: '(continued)', lh, fontSize: 7.2 });
  }

  sectionTitle(doc, 'SUMMARY / एकूण सारांश');
  const sumCols = [{ k: 'a', h: 'Particulars', w: 250 }, { k: 'b', h: 'Count', w: 70, align: 'c' },
  { k: 'c', h: 'AA Amount' + unit, w: 100, align: 'r', fmt: r => f2(r.c) },
  { k: 'd', h: 'Est. (TS) Amount' + unit, w: 100, align: 'r', fmt: r => f2(r.d) },
  { k: 'e', h: 'Paid' + unit, w: 100, align: 'r', fmt: r => f2(r.e) },
  { k: 'g', h: 'Balance' + unit, w: 100, align: 'r', fmt: r => f2(r.g) },
  { k: 'h', h: 'Avg. Phy. %', w: 70, align: 'c', fmt: r => `${A.round2(r.h || 0)}%` }];
  const f2 = u === 'lakh' ? lakh : inr;
  const sumRows = [
    { a: 'Total selected works', b: t.count, c: t.aa_amount, d: t.est_amount, e: t.paid, g: t.balance, h: t.avg_physical },
    { a: '– Completed (100%)', b: t.completed, c: A.totals(rows.filter(r => r.physical_progress >= 100)).aa_amount, d: A.totals(rows.filter(r => r.physical_progress >= 100)).est_amount, e: A.totals(rows.filter(r => r.physical_progress >= 100)).paid, g: A.totals(rows.filter(r => r.physical_progress >= 100)).balance, h: A.totals(rows.filter(r => r.physical_progress >= 100)).avg_physical },
    { a: '– Ongoing', b: t.ongoing, c: A.totals(rows.filter(r => r.physical_progress > 0 && r.physical_progress < 100)).aa_amount, d: A.totals(rows.filter(r => r.physical_progress > 0 && r.physical_progress < 100)).est_amount, e: A.totals(rows.filter(r => r.physical_progress > 0 && r.physical_progress < 100)).paid, g: A.totals(rows.filter(r => r.physical_progress > 0 && r.physical_progress < 100)).balance, h: A.totals(rows.filter(r => r.physical_progress > 0 && r.physical_progress < 100)).avg_physical },
    { a: '– Not started', b: t.not_started, c: A.totals(rows.filter(r => !r.physical_progress)).aa_amount, d: A.totals(rows.filter(r => !r.physical_progress)).est_amount, e: A.totals(rows.filter(r => !r.physical_progress)).paid, g: A.totals(rows.filter(r => !r.physical_progress)).balance, h: A.totals(rows.filter(r => !r.physical_progress)).avg_physical },
    { a: '– Delayed', b: t.delayed, c: A.totals(rows.filter(r => r.is_delayed)).aa_amount, d: A.totals(rows.filter(r => r.is_delayed)).est_amount, e: A.totals(rows.filter(r => r.is_delayed)).paid, g: A.totals(rows.filter(r => r.is_delayed)).balance, h: A.totals(rows.filter(r => r.is_delayed)).avg_physical },
    { a: '– Stalled / Stayed', b: t.stalled, c: A.totals(rows.filter(r => r.stalled)).aa_amount, d: A.totals(rows.filter(r => r.stalled)).est_amount, e: A.totals(rows.filter(r => r.stalled)).paid, g: A.totals(rows.filter(r => r.stalled)).balance, h: A.totals(rows.filter(r => r.stalled)).avg_physical },
  ];
  drawTable(doc, sumCols, sumRows, { fontSize: 8, totalsRow: null });
  note(doc, `RAG legend:  RED = delayed / stalled / bill pending > 60 days   •   AMBER = risk of delay or bill pending 30-60 days   •   GREEN = on track.`);
  note(doc, `Unpaid bills: ${t.unpaid_bills}   |   Bill amount pending: ₹ ${f2(t.bills_pending_amount)}${u === 'lakh' ? ' lakh' : ''}   |   Revised estimate amount: ₹ ${f2(t.revised_amount)}${u === 'lakh' ? ' lakh' : ''}`);
  signatureBlock(doc, lh, ['Note: This is a computer generated statement produced by the Work Progress Tracker. Figures are as on the date of generation.']);
  footerSetup(doc, lh);
  return doc;
}

function orderRows(rows, f) {
  const by = f.sort || 'taluka';
  const dir = f.dir === 'desc' ? -1 : 1;
  const key = {
    taluka: r => (r.taluka || '') + '|' + r.work_name,
    amount: r => -r.effective_amount,
    status: r => (C.WORK_STATUS.find(s => s.v === r.work_status) || {}).order || 99,
    target: r => r.effective_target || '9999',
    delay: r => -r.delay_days,
    name: r => r.work_name,
    head: r => r.head_of_account,
    contractor: r => r.contractor_name,
  }[by] || (r => r.id);
  return [...rows].sort((a, b) => {
    const ka = key(a), kb = key(b);
    return (typeof ka === 'number' ? ka - kb : String(ka).localeCompare(String(kb))) * dir;
  });
}

/* ---------- 2. Taluka-wise summary ---------- */
function talukaSummary(p) {
  const { rows, t, f, lh } = p;
  const u = f.units || 'lakh';
  const { sc, unit } = standardCols(u);
  const doc = createDoc(true, 'Taluka-wise Summary');
  letterhead(doc, lh, 'TALUKA-WISE SUMMARY OF ELECTRICAL WORKS (तालुका निहाय सारांश)',
    `${C.APP.district} District  •  Amounts in ₹ Lakh  •  As on ${dt(today())}`);
  kpiStrip(doc, kpisFor(t));
  metaBar(doc, [`Filters  ▸  ${filterText(f)}`, `Talukas: ${new Set(rows.map(r => r.taluka)).size}  •  Works: ${rows.length}`]);

  const g = A.groupSummary(rows, r => r.taluka).sort((a, b) => a.key.localeCompare(b.key));
  const cols = [colSNo(24), { h: 'Taluka (तालुका)', w: 110, wrap: true, fmt: r => r.key },
    { h: 'Works', w: 44, align: 'c', fmt: r => r.count },
    { h: 'Completed', w: 56, align: 'c', fmt: r => r.completed },
    { h: 'Ongoing', w: 48, align: 'c', fmt: r => r.ongoing },
    { h: 'Not started', w: 58, align: 'c', fmt: r => r.not_started },
    { h: 'Delayed', w: 48, align: 'c', fmt: r => r.delayed, color: r => r.delayed ? RED : '#16202b' },
    { h: 'AA Amount (₹ Lakh)', w: 78, align: 'r', fmt: r => lakh(r.aa_amount) },
    { h: 'Est/TS Amount (₹ Lakh)', w: 84, align: 'r', fmt: r => lakh(r.est_amount) },
    { h: 'Budget Prov. (₹ Lakh)', w: 84, align: 'r', fmt: r => lakh(r.budget_provision) },
    { h: 'Paid (₹ Lakh)', w: 74, align: 'r', fmt: r => lakh(r.paid), color: () => GREEN },
    { h: 'Balance (₹ Lakh)', w: 78, align: 'r', fmt: r => lakh(r.balance), color: () => ACCENT },
    { h: 'Bills Pending (₹ Lakh)', w: 84, align: 'r', fmt: r => lakh(r.bills_pending_amount) },
    { h: 'Avg. Phy.%', w: 52, align: 'c', fmt: r => r.avg_physical + '%' },
    { h: 'Financial %', w: 54, align: 'c', fmt: r => r.avg_financial + '%' }];
  drawTable(doc, cols, g, { repeatTitle: 'TALUKA-WISE SUMMARY OF ELECTRICAL WORKS', repeatSubtitle: '(continued)', lh,
    totalsRow: ['', 'GRAND TOTAL', t.count, t.completed, t.ongoing, t.not_started, t.delayed, lakh(t.aa_amount), lakh(t.est_amount), lakh(t.budget_provision), lakh(t.paid), lakh(t.balance), lakh(t.bills_pending_amount), t.avg_physical + '%', t.avg_financial + '%'] });

  /* work-status matrix per taluka */
  doc.addPage();
  letterhead(doc, lh, 'TALUKA × WORK STATUS MATRIX', 'Number of works per taluka by stage');
  const statuses = C.WORK_STATUS.map(s => s.v);
  const used = statuses.filter(s => rows.some(r => r.work_status === s));
  const mrows = g.map(x => {
    const o = { key: x.key };
    used.forEach(s => { o[s] = rows.filter(r => r.taluka === x.key && r.work_status === s).length || ''; });
    o.__total = x.count;
    return o;
  });
  const colW = Math.min(78, Math.max(50, Math.floor(700 / Math.max(1, used.length))));
  const mcolsFinal = [{ h: 'Taluka', w: 104, fmt: r => r.key }]
    .concat(used.map(s => ({ h: s, w: colW, align: 'c', wrap: true, fmt: r => r[s] })))
    .concat([{ h: 'Total', w: 46, align: 'c', fmt: r => r.__total, bold: true }]);
  const totRow = ['GRAND TOTAL'].concat(used.map(s => rows.filter(r => r.work_status === s).length)).concat([t.count]);
  drawTable(doc, mcolsFinal, mrows, { fontSize: 7.2, totalsRow: totRow, lh, repeatTitle: 'TALUKA × WORK STATUS MATRIX', repeatSubtitle: '(continued)' });
  note(doc, 'Tip: The Excel version of this report includes live SUM formulas so totals recalculate when you edit rows.');
  signatureBlock(doc, lh);
  footerSetup(doc, lh);
  return doc;
}

/* ---------- 3. Bill status ---------- */
function billsPdf(p) {
  const { rows, f, lh, t } = p;
  const doc = createDoc(true, 'Bill Status Report');
  letterhead(doc, lh, 'BILL STATUS REPORT (बिल स्थिती अहवाल)', `${C.APP.office}, ${C.APP.district}  •  As on ${dt(today())}`);
  const reg = A.billRegister(rows);
  const totalAmt = A.sum(reg, r => r.amount), totalPaid = A.sum(reg, r => r.paid_amount), totalPend = A.sum(reg, r => r.pending);
  kpiStrip(doc, [
    { label: 'Total Bills', value: String(reg.length), sub: `${rows.length} works covered`, color: NAVY },
    { label: 'Bill Amount', value: `₹ ${lakh(totalAmt)}`, sub: 'lakh', color: '#1f5f8b' },
    { label: 'Paid', value: `₹ ${lakh(totalPaid)}`, sub: 'lakh', color: GREEN },
    { label: 'Pending', value: `₹ ${lakh(totalPend)}`, sub: 'lakh', color: ACCENT },
    { label: 'Unpaid Bills', value: String(reg.filter(r => r.status !== 'Paid / Disbursed').length), sub: 'requiring action', color: RED },
    { label: 'Max Ageing', value: String(reg.reduce((m, r) => Math.max(m, r.ageing_days), 0)), sub: 'days', color: '#6a4bb5' },
  ]);
  metaBar(doc, [`Filters  ▸  ${filterText(f)}`, 'Ageing is counted from bill submission date for unpaid bills.']);

  const cols = [colSNo(20), { h: 'Work Name', w: 165, wrap: true, fmt: r => r.work_name },
    { h: 'Taluka', w: 60, fmt: r => r.taluka }, { h: 'Contractor', w: 110, wrap: true, fmt: r => trim(r.contractor, 34) },
    { h: 'Bill Type', w: 82, wrap: true, fmt: r => r.bill_type }, { h: 'Bill No.', w: 76, wrap: true, fmt: r => r.bill_number },
    { h: 'Submitted', w: 56, align: 'c', fmt: r => dt(r.submitted_date) },
    { h: 'Bill Amt (₹)', w: 70, align: 'r', fmt: r => inr0(r.amount) },
    { h: 'Paid (₹)', w: 70, align: 'r', fmt: r => inr0(r.paid_amount), color: () => GREEN },
    { h: 'Pending (₹)', w: 70, align: 'r', fmt: r => inr0(r.pending), color: r => r.pending > 0 ? ACCENT : GREY },
    { h: 'Status', w: 104, wrap: true, fmt: r => r.status, color: r => r.status === 'Paid / Disbursed' ? GREEN : (r.status === 'Objection Raised' || r.status === 'Rejected / Returned' ? RED : AMBER) },
    { h: 'Ageing (days)', w: 56, align: 'c', fmt: r => r.ageing_days || '—', color: r => r.ageing_days > 60 ? RED : (r.ageing_days > 30 ? AMBER : '#16202b') },
    { h: 'Voucher / TRN', w: 84, wrap: true, fmt: r => [r.voucher_number, r.treasury_ref].filter(Boolean).join(' / ') || '—' },
    { h: 'Objection', w: 100, wrap: true, fmt: r => r.objection || '—' }];
  const filtered = f.bill_status && f.bill_status !== 'ALL' ? reg.filter(r => r.status === f.bill_status) : reg;
  const grouped = [];
  A.groupBy(filtered, r => r.taluka).forEach((list, k) => {
    const st = A.sum(list, r => r.amount), sp = A.sum(list, r => r.paid_amount);
    grouped.push({ __group: true, work_name: `TALUKA: ${k}  (${list.length} bills)`, amount: st, paid_amount: sp, pending: st - sp });
    list.forEach(x => grouped.push(x));
  });
  drawTable(doc, cols, grouped, { repeatTitle: 'BILL STATUS REPORT', repeatSubtitle: '(continued)', lh, fontSize: 7.2,
    totalsRow: ['', 'GRAND TOTAL', '', '', '', '', '', inr0(totalAmt), inr0(totalPaid), inr0(totalPend), '', '', '', ''] });

  /* status-wise summary */
  sectionTitle(doc, 'BILL STATUS-WISE SUMMARY');
  const srows = C.BILL_STATUS.map(s => s.v).map(v => {
    const list = filtered.filter(r => r.status === v);
    return { key: v, count: list.length, amount: A.sum(list, r => r.amount), paid: A.sum(list, r => r.paid_amount), pending: A.sum(list, r => r.pending) };
  }).filter(x => x.count);
  drawTable(doc, [{ k: 'key', h: 'Bill Status', w: 180 }, { h: 'No. of Bills', w: 70, align: 'c', fmt: r => r.count },
    { h: 'Bill Amount (₹)', w: 96, align: 'r', fmt: r => inr0(r.amount) }, { h: 'Paid (₹)', w: 96, align: 'r', fmt: r => inr0(r.paid) },
    { h: 'Pending (₹)', w: 96, align: 'r', fmt: r => inr0(r.pending), color: () => ACCENT }], srows, { fontSize: 8,
      totalsRow: ['TOTAL', filtered.length, inr(totalAmt), inr(totalPaid), inr(totalPend)] });
  signatureBlock(doc, lh);
  footerSetup(doc, lh);
  return doc;
}

/* ---------- 4. Target vs achievement ---------- */
function targets(p) {
  const { rows, f, lh, t } = p;
  const doc = createDoc(true, 'Target vs Achievement');
  letterhead(doc, lh, 'TARGET vs ACHIEVEMENT STATEMENT (लक्ष्य व पूर्तता)', `${C.APP.office}, ${C.APP.district}  •  As on ${dt(today())}`);
  kpiStrip(doc, kpisFor(t));
  metaBar(doc, [`Filters  ▸  ${filterText(f)}`, 'Physical target = 100% by target date. Financial target = amount paid against effective estimate.']);
  const cols = [colSNo(20), { h: 'Work Name', w: 170, wrap: true, fmt: r => r.work_name },
    { h: 'Est. No.', w: 76, wrap: true, fmt: r => r.est_number }, { h: 'Taluka', w: 58, fmt: r => r.taluka },
    { h: 'W.O. Date', w: 56, align: 'c', fmt: r => dt(r.wo_date) },
    { h: 'Target Date', w: 58, align: 'c', fmt: r => dt(r.target_date) },
    { h: 'Extended Target', w: 62, align: 'c', fmt: r => dt(r.extended_target_date) },
    { h: 'Days Left', w: 46, align: 'c', fmt: r => r.days_to_target === null ? '—' : (r.days_to_target < 0 ? `${Math.abs(r.days_to_target)} over` : r.days_to_target), color: r => r.days_to_target === null ? GREY : (r.days_to_target < 0 ? RED : (r.days_to_target < 30 ? AMBER : GREEN)) },
    { h: 'Phy. Target', w: 46, align: 'c', fmt: () => '100%' },
    { h: 'Phy. Achv.', w: 46, align: 'c', fmt: r => r.physical_progress + '%', color: r => r.physical_progress >= 100 ? GREEN : (r.physical_progress >= 60 ? AMBER : RED) },
    { h: 'Fin. Target (₹)', w: 70, align: 'r', fmt: r => inr0(r.effective_amount) },
    { h: 'Fin. Achv. (₹)', w: 70, align: 'r', fmt: r => inr0(r.amount_paid) },
    { h: 'Fin. %', w: 44, align: 'c', fmt: r => r.financial_progress + '%' },
    { h: 'Delay (days)', w: 52, align: 'c', fmt: r => r.delay_days || '—', color: r => r.delay_days ? RED : GREEN },
    { h: 'Status', w: 96, wrap: true, fmt: r => r.work_status }];
  const ordered = orderRows(rows, Object.assign({}, f, { sort: f.sort || 'target' }));
  drawTable(doc, cols, ordered, { repeatTitle: 'TARGET vs ACHIEVEMENT STATEMENT', repeatSubtitle: '(continued)', lh, fontSize: 7.2,
    totalsRow: ['', `TOTAL – ${ordered.length} WORKS`, '', '', '', '', '', '', '', t.avg_physical + '%', inr0(t.est_amount), inr0(t.paid), t.avg_financial + '%', `${t.delayed} delayed`, ''] });
  sectionTitle(doc, 'MONTH-WISE TARGET SCHEDULE (works due for completion)');
  const byMonth = new Map();
  rows.forEach(r => { const k = (r.effective_target || '').slice(0, 7); if (k) { byMonth.set(k, (byMonth.get(k) || 0) + 1); } });
  const mrows = [...byMonth.keys()].sort().map(k => ({ key: k, count: byMonth.get(k), amount: A.sum(rows.filter(r => (r.effective_target || '').slice(0, 7) === k), r => r.effective_amount), done: rows.filter(r => (r.effective_target || '').slice(0, 7) === k && r.physical_progress >= 100).length }));
  drawTable(doc, [{ h: 'Target Month', w: 90, fmt: r => r.key }, { h: 'Works Due', w: 70, align: 'c', fmt: r => r.count },
    { h: 'Physically Completed', w: 110, align: 'c', fmt: r => r.done }, { h: 'Balance Works', w: 90, align: 'c', fmt: r => r.count - r.done },
    { h: 'Involved Amount (₹)', w: 120, align: 'r', fmt: r => inr(r.amount) }], mrows, { fontSize: 8 });
  signatureBlock(doc, lh);
  footerSetup(doc, lh);
  return doc;
}

/* ---------- 5. Delayed / stalled ---------- */
function delays(p) {
  const { rows, f, lh } = p;
  const doc = createDoc(true, 'Delayed / Stalled Works');
  letterhead(doc, lh, 'DELAYED, STALLED & CRITICAL WORKS LIST', `${C.APP.office}, ${C.APP.district}  •  As on ${dt(today())}`);
  const list = rows.filter(r => r.is_delayed || r.stalled || r.bill_pending_days > C.RULES.billPendingAlertDays || r.rag === 'RED')
    .sort((a, b) => (b.delay_days - a.delay_days) || (b.bills_pending_amount - a.bills_pending_amount));
  const t = A.totals(list);
  kpiStrip(doc, [
    { label: 'Critical Works', value: String(list.length), sub: 'RED category', color: RED },
    { label: 'Delayed', value: String(list.filter(r => r.is_delayed).length), sub: 'beyond target date', color: ACCENT },
    { label: 'Stalled / Stayed', value: String(list.filter(r => r.stalled).length), sub: 'work stopped', color: '#6a4bb5' },
    { label: 'Amount Involved', value: `₹ ${lakh(t.est_amount)}`, sub: 'lakh', color: NAVY },
    { label: 'Paid so far', value: `₹ ${lakh(t.paid)}`, sub: 'lakh', color: GREEN },
    { label: 'Max Delay', value: String(list.reduce((m, r) => Math.max(m, r.delay_days), 0)), sub: 'days', color: RED },
  ]);
  metaBar(doc, [`Filters  ▸  ${filterText(f)}`, `Rules: delay = target date passed by more than ${C.RULES.completionGraceDays} days grace; bill alert = unpaid beyond ${C.RULES.billPendingAlertDays} days.`]);
  const cols = [colSNo(20), { h: 'Work Name', w: 170, wrap: true, fmt: r => r.work_name }, { h: 'Est. No.', w: 76, wrap: true, fmt: r => r.est_number },
    { h: 'Taluka', w: 58, fmt: r => r.taluka }, { h: 'Contractor', w: 110, wrap: true, fmt: r => trim(r.contractor_name, 34) },
    { h: 'Target', w: 56, align: 'c', fmt: r => dt(r.effective_target) }, { h: 'Delay (days)', w: 52, align: 'c', fmt: r => r.delay_days || '—', color: r => r.delay_days > 180 ? RED : (r.delay_days ? AMBER : GREY) },
    { h: 'Phy.%', w: 40, align: 'c', fmt: r => r.physical_progress + '%' },
    { h: 'AA Amt (₹)', w: 70, align: 'r', fmt: r => inr0(r.aa_amount) }, { h: 'Paid (₹)', w: 70, align: 'r', fmt: r => inr0(r.amount_paid) },
    { h: 'Bills Pending (₹)', w: 74, align: 'r', fmt: r => inr0(r.bills_pending_amount), color: r => r.bills_pending_amount ? ACCENT : GREY },
    { h: 'Bill Ageing', w: 52, align: 'c', fmt: r => r.bill_pending_days ? r.bill_pending_days + ' d' : '—', color: r => r.bill_pending_days > 60 ? RED : GREY },
    { h: 'Work Status', w: 96, wrap: true, fmt: r => r.work_status },
    { h: 'Reason / Remarks', w: 150, wrap: true, fmt: r => r.stalled_reason || r.delay_reason || r.rag_reasons }];
  drawTable(doc, cols, list, { repeatTitle: 'DELAYED, STALLED & CRITICAL WORKS LIST', repeatSubtitle: '(continued)', lh, fontSize: 7.2,
    totalsRow: ['', `TOTAL – ${list.length} WORKS`, '', '', '', '', '', t.avg_physical + '%', inr0(t.aa_amount), inr0(t.paid), inr0(t.bills_pending_amount), '', '', ''] });
  note(doc, 'Recommended action: issue show-cause / recovery notice, review time extension proposals and expedite pending bills at Division & Treasury level.');
  signatureBlock(doc, lh);
  footerSetup(doc, lh);
  return doc;
}

/* ---------- 6. Utilisation ---------- */
function utilisation(p) {
  const { rows, f, lh, t } = p;
  const doc = createDoc(true, 'Fund Utilisation Statement');
  letterhead(doc, lh, 'FUND UTILISATION STATEMENT (निधी वापर सारांश)', `${C.APP.office}, ${C.APP.district}  •  FY-wise & Head-wise  •  As on ${dt(today())}`);
  kpiStrip(doc, kpisFor(t));
  metaBar(doc, [`Filters  ▸  ${filterText(f)}`, 'Utilisation % = amount paid ÷ effective estimate (AA / revised estimate).']);
  sectionTitle(doc, 'A) FUND SOURCE / SCHEME WISE');
  const fs1 = A.groupSummary(rows, r => r.fund_source || '— Not specified —');
  drawTable(doc, [{ h: 'Fund Source / Scheme', w: 200, wrap: true, fmt: r => r.key }, { h: 'Works', w: 50, align: 'c', fmt: r => r.count },
    { h: 'Budget Provision (₹)', w: 100, align: 'r', fmt: r => inr(r.budget_provision) }, { h: 'AA / Sanctioned (₹)', w: 100, align: 'r', fmt: r => inr(r.aa_amount) },
    { h: 'Est. Amount (₹)', w: 100, align: 'r', fmt: r => inr(r.est_amount) }, { h: 'Utilised / Paid (₹)', w: 100, align: 'r', fmt: r => inr(r.paid), color: () => GREEN },
    { h: 'Balance (₹)', w: 100, align: 'r', fmt: r => inr(r.balance), color: () => ACCENT }, { h: 'Utilisation %', w: 62, align: 'c', fmt: r => r.avg_financial + '%', color: r => r.avg_financial >= 80 ? GREEN : (r.avg_financial >= 50 ? AMBER : RED) }],
    fs1, { fontSize: 7.6, totalsRow: ['TOTAL', t.count, inr(t.budget_provision), inr(t.aa_amount), inr(t.est_amount), inr(t.paid), inr(t.balance), t.avg_financial + '%'],
      repeatTitle: 'FUND UTILISATION STATEMENT', repeatSubtitle: '(continued)', lh });

  sectionTitle(doc, 'B) FINANCIAL YEAR WISE');
  const fy = A.groupSummary(rows, r => r.financial_year || r.est_year || '—').sort((a, b) => a.key.localeCompare(b.key));
  drawTable(doc, [{ h: 'Financial Year', w: 90, fmt: r => r.key }, { h: 'Works', w: 50, align: 'c', fmt: r => r.count },
    { h: 'AA Amount (₹)', w: 100, align: 'r', fmt: r => inr(r.aa_amount) }, { h: 'Est. Amount (₹)', w: 100, align: 'r', fmt: r => inr(r.est_amount) },
    { h: 'Paid (₹)', w: 100, align: 'r', fmt: r => inr(r.paid) }, { h: 'Balance (₹)', w: 100, align: 'r', fmt: r => inr(r.balance) },
    { h: 'Utilisation %', w: 70, align: 'c', fmt: r => r.avg_financial + '%' }, { h: 'Completed', w: 60, align: 'c', fmt: r => r.completed }],
    fy, { fontSize: 8, totalsRow: ['TOTAL', t.count, inr(t.aa_amount), inr(t.est_amount), inr(t.paid), inr(t.balance), t.avg_financial + '%', t.completed] });

  sectionTitle(doc, 'C) TALUKA WISE UTILISATION');
  const tl = A.groupSummary(rows, r => r.taluka).sort((a, b) => a.key.localeCompare(b.key));
  drawTable(doc, [{ h: 'Taluka', w: 100, wrap: true, fmt: r => r.key }, { h: 'Works', w: 46, align: 'c', fmt: r => r.count },
    { h: 'Sanctioned (₹ Lakh)', w: 90, align: 'r', fmt: r => lakh(r.est_amount) }, { h: 'Utilised (₹ Lakh)', w: 90, align: 'r', fmt: r => lakh(r.paid) },
    { h: 'Balance (₹ Lakh)', w: 90, align: 'r', fmt: r => lakh(r.balance) }, { h: 'Utilisation %', w: 66, align: 'c', fmt: r => r.avg_financial + '%', color: r => r.avg_financial >= 80 ? GREEN : (r.avg_financial >= 50 ? AMBER : RED) },
    { h: 'Remarks', w: 160, wrap: true, fmt: r => r.avg_financial < 40 ? 'Low utilisation – review required' : (r.delayed ? `${r.delayed} delayed works` : 'Satisfactory') }],
    tl, { fontSize: 7.8, totalsRow: ['GRAND TOTAL', t.count, lakh(t.est_amount), lakh(t.paid), lakh(t.balance), t.avg_financial + '%', ''] });
  signatureBlock(doc, lh);
  footerSetup(doc, lh);
  return doc;
}

/* ---------- 7. Head of account ---------- */
function headwise(p) {
  const { rows, f, lh, t } = p;
  const doc = createDoc(true, 'Head of Account Summary');
  letterhead(doc, lh, 'HEAD OF ACCOUNT WISE SUMMARY (मुख्य लेखाशीर्ष निहाय सारांश)', `${C.APP.office}, ${C.APP.district}  •  As on ${dt(today())}`);
  kpiStrip(doc, kpisFor(t));
  metaBar(doc, [`Filters  ▸  ${filterText(f)}`, 'Heads as per Maharashtra Budget Manual (Major Head 2059 – Public Works etc.).']);
  const g = A.groupSummary(rows, r => r.head_of_account || '— Not specified —');
  const cols = [colSNo(22), { h: 'Head of Account', w: 92, wrap: true, fmt: r => r.key },
    { h: 'Description', w: 190, wrap: true, fmt: r => (C.HEADS_OF_ACCOUNT.find(h => h.code === r.key) || {}).desc || '' },
    { h: 'Type', w: 50, align: 'c', fmt: r => (C.HEADS_OF_ACCOUNT.find(h => h.code === r.key) || {}).type || '' },
    { h: 'Works', w: 42, align: 'c', fmt: r => r.count }, { h: 'Completed', w: 52, align: 'c', fmt: r => r.completed },
    { h: 'AA Amount (₹)', w: 84, align: 'r', fmt: r => inr0(r.aa_amount) }, { h: 'Est. Amount (₹)', w: 84, align: 'r', fmt: r => inr0(r.est_amount) },
    { h: 'Paid (₹)', w: 84, align: 'r', fmt: r => inr0(r.paid), color: () => GREEN }, { h: 'Balance (₹)', w: 84, align: 'r', fmt: r => inr0(r.balance), color: () => ACCENT },
    { h: 'Util. %', w: 46, align: 'c', fmt: r => r.avg_financial + '%' }];
  drawTable(doc, cols, g, { repeatTitle: 'HEAD OF ACCOUNT WISE SUMMARY', repeatSubtitle: '(continued)', lh, fontSize: 7.4,
    totalsRow: ['', 'GRAND TOTAL', '', '', t.count, t.completed, inr(t.aa_amount), inr(t.est_amount), inr(t.paid), inr(t.balance), t.avg_financial + '%'] });

  /* head x taluka matrix */
  doc.addPage();
  letterhead(doc, lh, 'HEAD OF ACCOUNT × TALUKA MATRIX', 'Number of works and sanctioned amount (₹ Lakh)');
  const tals = [...new Set(rows.map(r => r.taluka))].sort();
  const heads = g.map(x => x.key);
  const mcols = [{ h: 'Head of Account', w: 96, wrap: true, fmt: r => r.key }].concat(
    tals.map(tl => ({ h: tl, w: Math.max(44, Math.min(64, 620 / Math.max(1, tals.length))), align: 'c', fmt: r => r[tl] === undefined ? '' : r[tl] })),
    [{ h: 'Total', w: 52, align: 'c', fmt: r => r.__total, bold: true }]);
  const mrows = heads.map(h => {
    const o = { key: h, __total: '' };
    tals.forEach(tl => {
      const list = rows.filter(r => (r.head_of_account || '— Not specified —') === h && r.taluka === tl);
      o[tl] = list.length ? `${list.length} / ${lakh(A.sum(list, r => r.effective_amount))}` : '';
    });
    const all = rows.filter(r => (r.head_of_account || '— Not specified —') === h);
    o.__total = `${all.length} / ${lakh(A.sum(all, r => r.effective_amount))}`;
    return o;
  });
  drawTable(doc, mcols, mrows, { fontSize: 6.8, lh, repeatTitle: 'HEAD OF ACCOUNT × TALUKA MATRIX', repeatSubtitle: '(works / ₹ Lakh)',
    totalsRow: ['TOTAL'].concat(tals.map(tl => { const l = rows.filter(r => r.taluka === tl); return `${l.length} / ${lakh(A.sum(l, r => r.effective_amount))}`; })).concat([`${t.count} / ${lakh(t.est_amount)}`]) });
  signatureBlock(doc, lh);
  footerSetup(doc, lh);
  return doc;
}

/* ---------- 8. Contractor ---------- */
function contractorReport(p) {
  const { rows, f, lh } = p;
  const doc = createDoc(true, 'Contractor Performance');
  letterhead(doc, lh, 'CONTRACTOR / AGENCY WISE PERFORMANCE', `${C.APP.office}, ${C.APP.district}  •  As on ${dt(today())}`);
  const list = rows.filter(r => r.contractor_name);
  const g = A.groupSummary(list, r => r.contractor_name);
  kpiStrip(doc, [
    { label: 'Contractors', value: String(g.length), sub: 'with awarded works', color: NAVY },
    { label: 'Works Awarded', value: String(list.length), sub: `of ${rows.length} total`, color: '#1f5f8b' },
    { label: 'Contract Value', value: `₹ ${lakh(A.sum(list, r => r.wo_amount))}`, sub: 'lakh', color: ACCENT },
    { label: 'Completed', value: String(list.filter(r => r.physical_progress >= 100).length), sub: 'works', color: GREEN },
    { label: 'Delayed', value: String(list.filter(r => r.is_delayed).length), sub: 'works', color: RED },
    { label: 'Avg. Progress', value: `${A.totals(list).avg_physical}%`, sub: 'physical', color: '#6a4bb5' },
  ]);
  metaBar(doc, [`Filters  ▸  ${filterText(f)}`]);
  const cols = [colSNo(22), { h: 'Contractor / Agency', w: 160, wrap: true, fmt: r => r.key },
    { h: 'Works', w: 44, align: 'c', fmt: r => r.count }, { h: 'Talukas', w: 110, wrap: true, fmt: r => [...new Set(rows.filter(x => x.contractor_name === r.key).map(x => x.taluka))].join(', ') },
    { h: 'W.O. Amount (₹)', w: 84, align: 'r', fmt: r => inr0(A.sum(rows.filter(x => x.contractor_name === r.key), x => x.wo_amount)) },
    { h: 'AA Amount (₹)', w: 84, align: 'r', fmt: r => inr0(r.aa_amount) },
    { h: 'Paid (₹)', w: 84, align: 'r', fmt: r => inr0(r.paid), color: () => GREEN },
    { h: 'Balance (₹)', w: 84, align: 'r', fmt: r => inr0(r.balance), color: () => ACCENT },
    { h: 'Completed', w: 56, align: 'c', fmt: r => r.completed }, { h: 'Delayed', w: 48, align: 'c', fmt: r => r.delayed, color: r => r.delayed ? RED : GREY },
    { h: 'Stalled', w: 46, align: 'c', fmt: r => r.stalled, color: r => r.stalled ? RED : GREY },
    { h: 'Avg. Phy.%', w: 56, align: 'c', fmt: r => r.avg_physical + '%' }];
  drawTable(doc, cols, g, { repeatTitle: 'CONTRACTOR / AGENCY WISE PERFORMANCE', repeatSubtitle: '(continued)', lh, fontSize: 7.4,
    totalsRow: ['', `TOTAL – ${g.length} CONTRACTORS`, list.length, '', inr(A.sum(list, r => r.wo_amount)), inr(A.totals(list).aa_amount), inr(A.totals(list).paid), inr(A.totals(list).balance), A.totals(list).completed, A.totals(list).delayed, A.totals(list).stalled, A.totals(list).avg_physical + '%'] });

  doc.addPage();
  letterhead(doc, lh, 'WORK-WISE CONTRACTOR SCHEDULE', 'Detail of works per contractor');
  const wcols = [colSNo(20), { h: 'Contractor', w: 130, wrap: true, fmt: r => trim(r.contractor_name, 38) }, { h: 'Class', w: 44, align: 'c', fmt: r => r.contractor_class },
    { h: 'Work Name', w: 170, wrap: true, fmt: r => r.work_name }, { h: 'Taluka', w: 56, fmt: r => r.taluka },
    { h: 'W.O. No. / Date', w: 96, wrap: true, fmt: r => `${r.wo_number || '—'}\n${dt(r.wo_date)}` },
    { h: 'Target', w: 54, align: 'c', fmt: r => dt(r.effective_target) }, { h: 'Phy.%', w: 38, align: 'c', fmt: r => r.physical_progress + '%' },
    { h: 'W.O. Amt (₹)', w: 70, align: 'r', fmt: r => inr0(r.wo_amount) }, { h: 'Paid (₹)', w: 70, align: 'r', fmt: r => inr0(r.amount_paid) },
    { h: 'Bill Status', w: 90, wrap: true, fmt: r => r.bill_status_auto }, { h: 'RAG', w: 32, align: 'c', fmt: r => r.rag, color: r => RAGCOL[r.rag] }];
  const byCon = [];
  g.forEach(x => {
    byCon.push({ __group: true, contractor_name: x.key, work_name: `${x.count} works • ₹ ${lakh(x.est_amount)} lakh sanctioned • ${x.completed} completed` });
    rows.filter(r => r.contractor_name === x.key).sort((a, b) => (a.taluka || '').localeCompare(b.taluka || '')).forEach(r => byCon.push(r));
  });
  drawTable(doc, wcols, byCon, { repeatTitle: 'WORK-WISE CONTRACTOR SCHEDULE', repeatSubtitle: '(continued)', lh, fontSize: 7 });
  signatureBlock(doc, lh);
  footerSetup(doc, lh);
  return doc;
}

/* ---------- 9. Milestones ---------- */
function milestonesPdf(p) {
  const { rows, f, lh } = p;
  const doc = createDoc(true, 'Milestone Deadlines');
  letterhead(doc, lh, 'MILESTONE SCHEDULE & DEADLINES', `${C.APP.office}, ${C.APP.district}  •  As on ${dt(today())}`);
  const all = A.milestoneTracker(rows);
  const overdue = all.filter(m => m.flag === 'OVERDUE').sort((a, b) => b.overdue_days - a.overdue_days);
  const due = all.filter(m => m.flag === 'DUE SOON').sort((a, b) => a.days_left - b.days_left);
  kpiStrip(doc, [
    { label: 'Total Milestones', value: String(all.length), sub: `${rows.length} works`, color: NAVY },
    { label: 'Completed', value: String(all.filter(m => m.status === 'Completed').length), sub: 'achieved', color: GREEN },
    { label: 'Overdue', value: String(overdue.length), sub: 'past planned date', color: RED },
    { label: 'Due in 30 days', value: String(due.length), sub: 'upcoming deadline', color: AMBER },
    { label: 'Max Overdue', value: String(overdue.reduce((m, x) => Math.max(m, x.overdue_days), 0)), sub: 'days', color: RED },
    { label: 'In Progress', value: String(all.filter(m => m.status === 'In Progress').length), sub: 'milestones', color: '#1f5f8b' },
  ]);
  metaBar(doc, [`Filters  ▸  ${filterText(f)}`, 'Milestones are auto-generated for each work from the standard PWD electrical works checklist (editable per work).']);
  sectionTitle(doc, 'A) OVERDUE MILESTONES – IMMEDIATE ACTION REQUIRED');
  const cols = [colSNo(20), { h: 'Work Name', w: 190, wrap: true, fmt: r => r.work_name }, { h: 'Est. No.', w: 80, wrap: true, fmt: r => r.est_number },
    { h: 'Taluka', w: 60, fmt: r => r.taluka }, { h: 'Milestone', w: 150, wrap: true, fmt: r => r.milestone },
    { h: 'Planned Date', w: 62, align: 'c', fmt: r => dt(r.planned_date) }, { h: 'Overdue (days)', w: 62, align: 'c', fmt: r => r.overdue_days, color: () => RED },
    { h: 'Status', w: 74, fmt: r => r.status }, { h: 'Responsible', w: 90, wrap: true, fmt: r => r.responsible || '—' }, { h: 'Remarks', w: 130, wrap: true, fmt: r => r.remarks || '' }];
  drawTable(doc, cols, overdue, { repeatTitle: 'OVERDUE MILESTONES', repeatSubtitle: '(continued)', lh, fontSize: 7.4 });
  sectionTitle(doc, 'B) MILESTONES DUE WITHIN 30 DAYS');
  const cols2 = cols.map(c => c.h === 'Overdue (days)' ? { h: 'Days Left', w: 56, align: 'c', fmt: r => r.days_left, color: () => AMBER } : c);
  drawTable(doc, cols2, due, { repeatTitle: 'MILESTONES DUE WITHIN 30 DAYS', repeatSubtitle: '(continued)', lh, fontSize: 7.4 });
  sectionTitle(doc, 'C) MILESTONE COMPLETION BY TYPE');
  const byName = new Map();
  all.forEach(m => { if (!byName.has(m.milestone)) byName.set(m.milestone, []); byName.get(m.milestone).push(m); });
  const mrows = [...byName.entries()].map(([k, v]) => ({ key: k, total: v.length, done: v.filter(x => x.status === 'Completed').length, over: v.filter(x => x.flag === 'OVERDUE').length }));
  drawTable(doc, [{ h: 'Milestone', w: 220, wrap: true, fmt: r => r.key }, { h: 'Total', w: 60, align: 'c', fmt: r => r.total },
    { h: 'Completed', w: 70, align: 'c', fmt: r => r.done, color: () => GREEN }, { h: 'Overdue', w: 60, align: 'c', fmt: r => r.over, color: r => r.over ? RED : GREY },
    { h: 'Pending', w: 60, align: 'c', fmt: r => r.total - r.done }, { h: 'Completion %', w: 80, align: 'c', fmt: r => Math.round(r.done / r.total * 100) + '%' }],
    mrows, { fontSize: 7.8 });
  signatureBlock(doc, lh);
  footerSetup(doc, lh);
  return doc;
}

/* ---------- 10. Work dossier ---------- */
function dossier(p) {
  const { rows, lh } = p;
  const doc = createDoc(false, 'Work Dossier');
  const list = rows.length ? rows : [];
  letterhead(doc, lh, 'WORK DOSSIER – COMPLETE RECORD (कामाची संपूर्ण माहिती)', `${list.length} work(s)  •  ${C.APP.office}, ${C.APP.district}`);
  metaBar(doc, ['One section per work: administrative details, financials, bills, milestones, documents and audit trail.']);

  list.forEach((w, wi) => {
    if (wi > 0) doc.addPage();
    const x = doc.page.margins.left, W = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    doc.save().rect(x, doc.y, W, 26).fill('#e8eef6').restore();
    doc.save().rect(x, doc.y, 3.5, 26).fill(ACCENT).restore();
    doc.__fonts.text(`${wi + 1}. ${w.work_name}`, { x: x + 9, y: doc.y + 3, size: 11, bold: true, color: NAVY, width: W - 120 });
    doc.__fonts.text(`RAG: ${w.rag}`, { x: x + W - 110, y: doc.y + 4, size: 9, bold: true, color: RAGCOL[w.rag] || '#000', align: 'right', width: 100 });
    doc.__fonts.text(`ID ${w.id} • Est. ${w.est_number || '—'}`, { x: x + W - 110, y: doc.y + 15, size: 7.4, color: GREY, align: 'right', width: 100 });
    doc.y += 32;

    const twoCol = (title, pairs) => {
      sectionTitle(doc, title);
      const y0 = doc.y; const colw = W / 2;
      const lineH = (str, wpx, size, bold) => {
        const deva = hasDeva(str);
        doc.font(deva ? (bold ? F.bold : F.reg) : (bold ? F.dvb : F.dv)).fontSize(size);
        return doc.heightOfString(str, { width: wpx });
      };
      const draw = (pairs2, xoff) => {
        let y = y0;
        pairs2.forEach(([k, v]) => {
          const val = v === '' || v === null || v === undefined ? '—' : String(v);
          const h = Math.max(lineH(k, 116, 7.6, false), lineH(val, colw - 128, 7.8, false));
          if (y + h > doc.page.height - doc.page.margins.bottom - 40) { /* keep block on one page */ }
          doc.__fonts.text(k, { x: x + xoff, y, size: 7.6, color: GREY, width: 116 });
          doc.__fonts.text(val, { x: x + xoff + 120, y, size: 7.8, color: '#101820', width: colw - 128, lineBreak: true });
          y += h + 3.4;
        });
        return y;
      };
      const half = Math.ceil(pairs.length / 2);
      const y1 = draw(pairs.slice(0, half), 4);
      const y2 = draw(pairs.slice(half), colw + 4);
      doc.y = Math.max(y1, y2) + 4;
      if (doc.y > doc.page.height - doc.page.margins.bottom - 60) doc.addPage();
    };

    twoCol('1. WORK & LOCATION DETAILS', [
      ['Work Name (मराठी)', w.work_name_mr], ['Nature of Work', w.nature_of_work], ['Work Type', w.work_type],
      ['Taluka', w.taluka], ['Village / Place', w.village], ['District', w.district], ['Circle', w.circle],
      ['Division', w.division], ['Sub-Division', w.sub_division], ['Section', w.section],
      ['User Department', w.user_department], ['Priority', w.priority],
    ]);
    twoCol('2. HEAD OF ACCOUNT & FUND', [
      ['Head of Account', w.head_of_account], ['Head Description', w.head_desc], ['Head Type', w.head_type],
      ['Budget Head', w.budget_head], ['Fund Source', w.fund_source], ['Scheme Name', w.scheme_name],
      ['Financial Year', w.financial_year], ['Estimate Year', w.est_year], ['Budget Provision', `₹ ${inr(w.budget_provision)}`],
    ]);
    twoCol('3. SANCTION & ESTIMATE', [
      ['Estimate Number', w.est_number], ['Estimate Amount (TS)', `₹ ${inr(w.est_amount)}`],
      ['TS Number / Date', `${w.ts_number || '—'} / ${dt(w.ts_date)}`], ['Sanctioning Authority', w.sanctioning_authority],
      ['AA Number / Date', `${w.aa_number || '—'} / ${dt(w.aa_date)}`], ['AA Amount', `₹ ${inr(w.aa_amount)}`],
      ['Revised Est. No.', w.revised_est_number], ['Revised Est. Amount', w.revised_est_amount ? `₹ ${inr(w.revised_est_amount)}` : '—'],
      ['Effective Amount', `₹ ${inr(w.effective_amount)}`], ['Deviation', w.deviation ? `₹ ${inr(w.deviation)} (${w.deviation_pct}%)` : 'Nil'],
    ]);
    twoCol('4. TENDER, AGREEMENT & CONTRACTOR', [
      ['Tender Type', w.tender_type], ['Tender No. / Date', `${w.tender_number || '—'} / ${dt(w.tender_date)}`],
      ['Contractor / Agency', w.contractor_name], ['Contractor Class', w.contractor_class], ['Contact', w.contractor_contact],
      ['Agreement No. / Date', `${w.agreement_number || '—'} / ${dt(w.agreement_date)}`],
      ['Work Order No. / Date', `${w.wo_number || '—'} / ${dt(w.wo_date)}`], ['Work Order Amount', w.wo_amount ? `₹ ${inr(w.wo_amount)}` : '—'],
      ['Site Handover Date', dt(w.site_handover_date)], ['Security Deposit', w.sd_status],
    ]);
    twoCol('5. PROGRESS & STATUS', [
      ['Work Status', w.work_status], ['Bill Status', w.bill_status_auto], ['Physical Progress', `${w.physical_progress}%`],
      ['Financial Progress', `${w.financial_progress}%`], ['Amount Paid', `₹ ${inr(w.amount_paid)}`],
      ['Balance Amount', `₹ ${inr(w.balance_amount)}`], ['Target Date', dt(w.target_date)],
      ['Extended Target', dt(w.extended_target_date)], ['Delay', w.is_delayed ? `${w.delay_days} days beyond target` : 'Not delayed'],
      ['Stalled', w.stalled ? `Yes – ${w.stalled_reason}` : 'No'], ['Utility Connection', w.utility_connection],
      ['Quality Inspection', w.quality_inspection], ['MB Status', w.mb_status], ['RAG Reason', w.rag_reasons],
    ]);

    sectionTitle(doc, '6. BILL DETAILS');
    const bills = D.getBills(w.id);
    if (!bills.length) note(doc, 'No bills recorded for this work.');
    else drawTable(doc, [{ h: 'Bill Type', w: 92, wrap: true, fmt: r => r.bill_type }, { h: 'Bill No.', w: 76, wrap: true, fmt: r => r.bill_number },
      { h: 'Submitted', w: 56, align: 'c', fmt: r => dt(r.submitted_date) }, { h: 'Amount (₹)', w: 66, align: 'r', fmt: r => inr0(r.amount) },
      { h: 'Paid (₹)', w: 66, align: 'r', fmt: r => inr0(r.paid_amount) }, { h: 'Pending (₹)', w: 66, align: 'r', fmt: r => inr0(r.amount - r.paid_amount) },
      { h: 'Paid Date', w: 56, align: 'c', fmt: r => dt(r.paid_date) }, { h: 'Status', w: 92, wrap: true, fmt: r => r.status },
      { h: 'Voucher / TRN', w: 84, wrap: true, fmt: r => [r.voucher_number, r.treasury_ref].filter(Boolean).join(' / ') || '—' }],
      bills, { fontSize: 7.4, totalsRow: ['TOTAL', '', '', inr0(A.sum(bills, b => b.amount)), inr0(A.sum(bills, b => b.paid_amount)), inr0(A.sum(bills, b => b.amount - b.paid_amount)), '', '', ''] });

    sectionTitle(doc, '7. MILESTONES');
    const ms = D.getMilestones(w.id);
    drawTable(doc, [{ h: 'Milestone', w: 170, wrap: true, fmt: r => r.name }, { h: 'Planned', w: 62, align: 'c', fmt: r => dt(r.planned_date) },
      { h: 'Actual', w: 62, align: 'c', fmt: r => dt(r.actual_date) }, { h: 'Status', w: 78, fmt: r => r.status, color: r => r.status === 'Completed' ? GREEN : (r.planned_date && r.planned_date < today() ? RED : AMBER) },
      { h: 'Responsible', w: 100, wrap: true, fmt: r => r.responsible || '—' }], ms, { fontSize: 7.4 });

    sectionTitle(doc, '8. DOCUMENT CHECKLIST');
    const docs = D.getDocuments(w.id);
    const dcols = [];
    for (let i = 0; i < 4; i++) dcols.push({ h: `Document ${i + 1}`, w: (W - 8) / 4, wrap: true, fmt: r => r[i] ? `${r[i].name}: ${r[i].status}${r[i].ref_number ? ' (' + r[i].ref_number + ')' : ''}` : '' });
    const drows = [];
    for (let i = 0; i < docs.length; i += 4) drows.push([docs[i], docs[i + 1], docs[i + 2], docs[i + 3]]);
    drawTable(doc, dcols, drows, { fontSize: 7.2 });

    sectionTitle(doc, '9. PROGRESS HISTORY & REMARKS');
    const pl = D.getProgressLog(w.id);
    if (pl.length) drawTable(doc, [{ h: 'Date', w: 70, align: 'c', fmt: r => dt(r.date) }, { h: 'Physical %', w: 60, align: 'c', fmt: r => r.physical },
      { h: 'Financial %', w: 64, align: 'c', fmt: r => r.financial }, { h: 'Note', w: 240, wrap: true, fmt: r => r.note }], pl, { fontSize: 7.4 });
    D.getNotes(w.id).forEach(nn => note(doc, `• ${nn.created_at} – ${nn.note} ${nn.author ? '(' + nn.author + ')' : ''}`, GREY));
    if (w.remarks) note(doc, `Remarks: ${w.remarks}`, '#101820');
  });
  doc.addPage();
  letterhead(doc, lh, 'CERTIFICATE / प्रमाणपत्र', 'Declaration for submission to higher office');
  const W2 = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const tt = A.totals(list);
  const lines = [
    'It is certified that the information furnished in this dossier has been compiled from the records maintained in this office',
    `and verified against the measurement books, bill registers and sanction orders. Total ${tt.count} work(s) are covered.`,
    '',
    `Total estimate / AA amount           :  ₹ ${inr(tt.est_amount)}`,
    `Total amount paid                       :  ₹ ${inr(tt.paid)}`,
    `Balance amount payable              :  ₹ ${inr(tt.balance)}`,
    `Average physical progress          :  ${tt.avg_physical} %`,
    `Works completed (100%)             :  ${tt.completed}`,
    `Works delayed / stalled               :  ${tt.delayed} / ${tt.stalled}`,
    '',
    `Date  : ${dt(today())}                                                                                Place : ${C.APP.district}`,
  ];
  lines.forEach(l => { doc.__fonts.text(l, { x: doc.page.margins.left, y: doc.y, size: 9.4, width: W2 }); doc.y += 14; });
  signatureBlock(doc, lh);
  footerSetup(doc, lh);
  return doc;
}

/* ---------- dispatcher ---------- */
const BUILDERS = {
  progress, taluka_sum: talukaSummary, bills_pdf: billsPdf, targets, delays,
  util: utilisation, headwise, contractor: contractorReport, milestones: milestonesPdf, dossier,
};

function buildPdf(type, filters = {}, res) {
  const p = prepare(type, filters);
  const builder = BUILDERS[type];
  if (!builder) { const e = new Error('Unknown PDF report type: ' + type); e.status = 400; throw e; }
  const doc = builder(p);
  const fname = `${type}_${new Date().toISOString().slice(0, 10)}.pdf`;
  if (res) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fname}"`);
    doc.pipe(res); doc.end(); return null;
  }
  return doc;
}

module.exports = { buildPdf, inr, lakh, dt, prepare, BUILDERS };
