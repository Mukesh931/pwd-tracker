'use strict';
/* ============================================================
   EXCEL report generator (ExcelJS)
   – styled workbooks, live formulas, conditional formatting,
     data validation dropdowns, frozen panes, autofilters
   ============================================================ */
const ExcelJS = require('exceljs');
const D = require('./db');
const A = require('./agg');
const C = require('./config');

const NAVY = 'FF12314F', ACCENT = 'FFB3541E', LIGHT = 'FFEEF2F7', BAND = 'FFF6F9FC',
      RED = 'FFB3261E', GREEN = 'FF1B6B34', AMBER = 'FFA06A00', BORDER = 'FFBFCBD8', GREY = 'FF5A6673';

const thin = { style: 'thin', color: { argb: BORDER } };
const box = { top: thin, left: thin, bottom: thin, right: thin };
const NUM = '#,##0.00';
const NUM0 = '#,##0';
const PCT = '0.0"%"';

function styleHeader(row, height = 32) {
  row.height = height;
  row.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9, name: 'Calibri' };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    c.border = box;
  });
}

function bandBody(ws, firstRow, lastRow, bandCols) {
  for (let r = firstRow; r <= lastRow; r++) {
    const row = ws.getRow(r);
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      if (bandCols && col > bandCols) return;
      cell.border = box;
      cell.font = Object.assign({ size: 9, name: 'Calibri' }, cell.font || {});
      cell.alignment = Object.assign({ vertical: 'middle', wrapText: cell.alignment && cell.alignment.wrapText }, cell.alignment || {});
      if ((r - firstRow) % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND } };
    });
  }
}

function titleBlock(ws, title, subtitle, ncols) {
  ws.mergeCells(1, 1, 1, Math.max(2, ncols));
  const c = ws.getCell(1, 1);
  c.value = title;
  c.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' }, name: 'Calibri' };
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(1).height = 26;
  ws.mergeCells(2, 1, 2, Math.max(2, ncols));
  const c2 = ws.getCell(2, 1);
  c2.value = subtitle;
  c2.font = { size: 9, color: { argb: GREY }, italic: true, name: 'Calibri' };
  c2.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true };
  ws.getRow(2).height = 18;
}

function addSheet(wb, name, title, subtitle, headers, widths, opts = {}) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', xSplit: opts.xSplit || 0, ySplit: opts.ySplit || 3 }] });
  titleBlock(ws, title, subtitle, headers.length);
  const hr = ws.getRow(3);
  headers.forEach((h, i) => { hr.getCell(i + 1).value = h; });
  styleHeader(hr, opts.headerH || 34);
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: headers.length } };
  return ws;
}

function totalRow(ws, r, cells, ncols) {
  const row = ws.getRow(r);
  cells.forEach((v, i) => { if (v !== undefined && v !== null) row.getCell(i + 1).value = v; });
  for (let i = 1; i <= ncols; i++) {
    const c = row.getCell(i);
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } };
    c.font = { bold: true, size: 9.5, color: { argb: NAVY }, name: 'Calibri' };
    c.border = { top: { style: 'medium', color: { argb: NAVY } }, bottom: { style: 'medium', color: { argb: NAVY } }, left: thin, right: thin };
  }
  row.height = 20;
}

/* ---------- shared column model for the master ledger ---------- */
const LEDGER_HEADERS = ['Sr.', 'ID', 'Work Name', 'Est. No.', 'Est. Year', 'Taluka', 'Village / Place', 'District',
  'Division', 'Sub-Division', 'Section', 'Head of Account', 'Head Description', 'Head Type', 'Nature of Work',
  'Fund Source', 'Scheme', 'User Dept.', 'Sanctioning Authority', 'TS No.', 'TS Date', 'Est./TS Amount (₹)',
  'AA No.', 'AA Date', 'AA Amount (₹)', 'Revised Est. No.', 'Revised Est. Amount (₹)', 'Budget Head',
  'Budget Provision (₹)', 'Tender No.', 'Tender Date', 'Contractor / Agency', 'Class', 'W.O. No.', 'W.O. Date',
  'W.O. Amount (₹)', 'Target Date', 'Ext. Target', 'Physical %', 'Amount Paid (₹)', 'Financial %',
  'Balance (₹)  [auto]', 'Utilisation % [auto]', 'Days to Target [auto]', 'Delay Days [auto]', 'Work Status',
  'Bill Status', 'Bills Pending (₹)', 'Unpaid Bills', 'Utility Connection', 'Quality Inspection', 'MB Status',
  'SD Status', 'RAG [auto]', 'Priority', 'Stalled', 'Stalled / Delay Reason', 'Remarks', 'Created', 'Updated'];
const LEDGER_W = [5, 5, 46, 20, 9, 13, 15, 9, 26, 28, 24, 14, 40, 10, 26, 22, 16, 20, 30, 20, 11, 16, 20, 11, 16, 16, 16, 14, 16, 18, 11, 34, 10, 20, 11, 15, 11, 11, 9, 15, 9, 15, 11, 10, 9, 26, 22, 15, 8, 20, 20, 12, 14, 9, 9, 8, 34, 34, 16, 16];

function ledgerRow(w, i) {
  return [i + 1, w.id, w.work_name, w.est_number, w.est_year || w.financial_year, w.taluka, w.village, w.district,
    w.division, w.sub_division, w.section, w.head_of_account, w.head_desc, w.head_type, w.nature_of_work,
    w.fund_source, w.scheme_name, w.user_department, w.sanctioning_authority, w.ts_number, w.ts_date, w.est_amount,
    w.aa_number, w.aa_date, w.aa_amount, w.revised_est_number, w.revised_est_amount, w.budget_head, w.budget_provision,
    w.tender_number, w.tender_date, w.contractor_name, w.contractor_class, w.wo_number, w.wo_date, w.wo_amount,
    w.target_date, w.extended_target_date, w.physical_progress, w.amount_paid, w.financial_progress,
    { formula: `IF(AB{r}>0,AB{r},IF(Y{r}>0,Y{r},IF(V{r}>0,V{r},0))}-AN{r}` },
    { formula: `IFERROR(AN{r}/IF(AB{r}>0,AB{r},IF(Y{r}>0,Y{r},V{r}))*100,0)` },
    { formula: `IF(AL{r}="","",AL{r}-TODAY())` },
    { formula: `IF(OR(AK{r}="",AM{r}>=100),"",MAX(0,IF(AL{r}="",TODAY()-AK{r},TODAY()-AL{r})-${C.RULES.completionGraceDays}))` },
    w.work_status, w.bill_status_auto, w.bills_pending_amount, w.unpaid_bill_count, w.utility_connection,
    w.quality_inspection, w.mb_status, w.sd_status, w.rag, w.priority, w.stalled ? 'Yes' : 'No',
    w.stalled_reason || w.delay_reason || w.rag_reasons, w.remarks, w.created_at, w.updated_at];
}
/* column letters used above: V=22 est, Y=25 aa, AB=28? -> mapped below */
function ledgerFormulas(r) {
  return {
    balance: `IF(AA${r}>0,AA${r},IF(Y${r}>0,Y${r},IF(V${r}>0,V${r},0)))-AN${r}`,
    util: `IFERROR(AN${r}/IF(AA${r}>0,AA${r},IF(Y${r}>0,Y${r},V${r}))*100,0)`,
    daysToTarget: `IF(AL${r}="","",AL${r}-TODAY())`,
    delay: `IF(OR(AK${r}="",AM${r}>=100),"",MAX(0,IF(AL${r}="",TODAY()-AK${r},TODAY()-AL${r})-${C.RULES.completionGraceDays}))`,
  };
}

function writeLedger(ws, rows) {
  rows.forEach((w, i) => {
    const r = i + 4;
    const vals = ledgerRow(w, i);
    const row = ws.getRow(r);
    const f = ledgerFormulas(r);
    vals.forEach((v, ci) => {
      const cell = row.getCell(ci + 1);
      if (v && typeof v === 'object' && v.formula) {
        const key = ['balance', 'util', 'daysToTarget', 'delay'][ci - 41];
        cell.value = { formula: f[key] || v.formula.replace(/\{r\}/g, r) };
      } else cell.value = v === '' ? null : v;
    });
    /* number formats */
    [22, 25, 27, 29, 36, 40, 42, 48].forEach(c => { row.getCell(c).numFmt = NUM; });
    [39, 41, 43].forEach(c => { row.getCell(c).numFmt = PCT; });
    [21, 24, 31, 35, 37, 38, 59, 60].forEach(c => { row.getCell(c).numFmt = 'dd-mm-yyyy'; });
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(2).alignment = { horizontal: 'center' };
    row.getCell(3).alignment = { wrapText: true, vertical: 'middle' };
  });
  const last = rows.length + 3;
  bandBody(ws, 4, last, LEDGER_HEADERS.length);
  const tr = last + 1;
  totalRow(ws, tr, ['GRAND TOTAL', '', `${rows.length} works`, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
    { formula: `SUBTOTAL(109,V4:V${last})` }, '', '', { formula: `SUBTOTAL(109,Y4:Y${last})` }, '', { formula: `SUBTOTAL(109,AA4:AA${last})` }, '',
    { formula: `SUBTOTAL(109,AC4:AC${last})` }, '', '', '', '', '', { formula: `SUBTOTAL(109,AJ4:AJ${last})` }, '', '',
    { formula: `ROUND(AVERAGE(AM4:AM${last}),1)` }, { formula: `SUBTOTAL(109,AN4:AN${last})` }, { formula: `ROUND(AVERAGE(AO4:AO${last}),1)` },
    { formula: `SUBTOTAL(109,AP4:AP${last})` }, '', '', '', { formula: `SUBTOTAL(109,AV4:AV${last})` }, { formula: `SUBTOTAL(9,AW4:AW${last})` }, '', '', '', '', '', '', '', ''], LEDGER_HEADERS.length);
  [22, 25, 27, 29, 36, 40, 42, 48].forEach(c => ws.getRow(tr).getCell(c).numFmt = NUM);

  /* conditional formatting */
  ws.addConditionalFormatting({
    ref: `AM4:AM${last}`,
    rules: [
      { type: 'cellIs', operator: 'greaterThanOrEqual', formulae: ['100'], style: { font: { color: { argb: GREEN }, bold: true } }, priority: 1 },
      { type: 'cellIs', operator: 'between', formulae: ['50', '99.99'], style: { font: { color: { argb: AMBER } } }, priority: 2 },
      { type: 'cellIs', operator: 'lessThan', formulae: ['50'], style: { font: { color: { argb: RED } } }, priority: 3 },
      { type: 'dataBar', cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 100 }], color: { argb: 'FF4C86C6' }, priority: 4 },
    ],
  });
  ws.addConditionalFormatting({
    ref: `AR4:AR${last}`,
    rules: [
      { type: 'containsText', operator: 'containsText', text: 'RED', formulae: [`NOT(ISERROR(SEARCH("RED",AR4)))`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFF8D7DA' } }, font: { color: { argb: RED }, bold: true } }, priority: 1 },
      { type: 'containsText', operator: 'containsText', text: 'AMBER', formulae: [`NOT(ISERROR(SEARCH("AMBER",AR4)))`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFF3CD' } }, font: { color: { argb: AMBER }, bold: true } }, priority: 2 },
      { type: 'containsText', operator: 'containsText', text: 'GREEN', formulae: [`NOT(ISERROR(SEARCH("GREEN",AR4)))`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFD4EDDA' } }, font: { color: { argb: GREEN }, bold: true } }, priority: 3 },
    ],
  });
  ws.addConditionalFormatting({
    ref: `AS4:AS${last}`,
    rules: [{ type: 'cellIs', operator: 'greaterThan', formulae: ['0'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFF8D7DA' } }, font: { color: { argb: RED }, bold: true } }, priority: 1 }],
  });
  ws.addConditionalFormatting({
    ref: `AU4:AU${last}`,
    rules: [{ type: 'cellIs', operator: 'greaterThan', formulae: ['0'], style: { font: { color: { argb: RED }, bold: true } }, priority: 1 }],
  });
  /* dropdown validation */
  const m = D.masters();
  const dv = (col, list) => {
    for (let r = 4; r <= last; r++) {
      ws.getCell(`${col}${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${list.join(',').slice(0, 240)}"`] };
    }
  };
  dv('F', m.talukas.slice(0, 30));
  dv('AT', m.work_status);
  dv('AU', m.bill_status);
  dv('AS', ['High', 'Medium', 'Low']);
  return { last, totalRow: tr };
}

/* ---------- Dashboard sheet ---------- */
function dashboardSheet(wb, rows, t, ledRef) {
  const ws = wb.addWorksheet('Dashboard', { views: [{ showGridLines: false }], properties: { tabColor: { argb: NAVY } } });
  ws.columns = [{ width: 3 }, { width: 34 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 18 }, { width: 18 }];
  const put = (r, c, v, opt = {}) => { const cell = ws.getCell(r, c); cell.value = v; Object.assign(cell, {}); if (opt.font) cell.font = opt.font; if (opt.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opt.fill } }; if (opt.nf) cell.numFmt = opt.nf; if (opt.al) cell.alignment = opt.al; if (opt.border) cell.border = box; return cell; };
  ws.mergeCells('B2:I2');
  put(2, 2, 'PWD ELECTRICAL WORKS – DASHBOARD  /  विद्युत कामांचा प्रगती आढावा', { font: { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }, fill: NAVY, al: { vertical: 'middle', indent: 1 } });
  ws.getRow(2).height = 30;
  ws.mergeCells('B3:I3');
  put(3, 2, `${C.APP.office}, ${C.APP.district} District  •  Generated ${new Date().toLocaleString('en-IN')}  •  All figures are live formulas linked to the Master Ledger sheet`, { font: { size: 9, italic: true, color: { argb: GREY } }, al: { vertical: 'middle', indent: 1 } });

  const kpis = [
    ['Total Works', t.count, NUM0, NAVY], ['Est./TS Amount (₹)', t.est_amount, NUM, 'FF1F5F8B'],
    ['AA Amount (₹)', t.aa_amount, NUM, 'FF1F5F8B'], ['Amount Paid (₹)', t.paid, NUM, GREEN],
    ['Balance (₹)', t.balance, NUM, ACCENT], ['Utilisation %', t.avg_financial, PCT, 'FF6A4BB5'],
    ['Avg. Physical %', t.avg_physical, PCT, 'FF6A4BB5'], ['Delayed Works', t.delayed, NUM0, RED],
    ['Stalled Works', t.stalled, NUM0, RED], ['Pending Bills (₹)', t.bills_pending_amount, NUM, ACCENT],
    ['Unpaid Bill Count', t.unpaid_bills, NUM0, AMBER], ['Completed Works', t.completed, NUM0, GREEN],
  ];
  let r = 5;
  for (let i = 0; i < kpis.length; i += 4) {
    kpis.slice(i, i + 4).forEach((k, j) => {
      const c0 = 2 + j * 2;
      ws.mergeCells(r, c0, r, c0 + 1);
      put(r, c0, k[0].toUpperCase(), { font: { bold: true, size: 8, color: { argb: GREY } }, fill: LIGHT, al: { vertical: 'middle', indent: 1 }, border: true });
      ws.mergeCells(r + 1, c0, r + 1, c0 + 1);
      put(r + 1, c0, k[1], { font: { bold: true, size: 16, color: { argb: k[3] } }, al: { vertical: 'middle', horizontal: 'center' }, nf: k[2], border: true });
      ws.getRow(r + 1).height = 24;
    });
    r += 3;
  }

  /* status-wise (formula driven) */
  r += 1;
  ws.mergeCells(r, 2, r, 9);
  put(r, 2, 'WORK STATUS WISE POSITION', { font: { bold: true, size: 11, color: { argb: 'FFFFFFFF' } }, fill: ACCENT, al: { vertical: 'middle', indent: 1 } });
  r++;
  ['Work Status', 'No. of Works', 'Est./TS Amount (₹)', 'AA Amount (₹)', 'Paid (₹)', 'Balance (₹)', 'Avg. Physical %', 'Utilisation %'].forEach((h, i) => put(r, 2 + i, h, { font: { bold: true, size: 9, color: { argb: 'FFFFFFFF' } }, fill: NAVY, al: { vertical: 'middle', horizontal: 'center', wrapText: true }, border: true }));
  ws.getRow(r).height = 26;
  const statusStart = r + 1;
  C.WORK_STATUS.map(s => s.v).filter(s => rows.some(x => x.work_status === s)).forEach(s => {
    r++;
    put(r, 2, s, { font: { size: 9 }, border: true });
    put(r, 3, { formula: `COUNTIF(${ledRef}!$AU$4:$AU$100000,$B${r})` }, { nf: NUM0, al: { horizontal: 'center' }, border: true, font: { size: 9 } });
    put(r, 4, { formula: `SUMIF(${ledRef}!$AU$4:$AU$100000,$B${r},${ledRef}!$V$4:$V$100000)` }, { nf: NUM, border: true, font: { size: 9 } });
    put(r, 5, { formula: `SUMIF(${ledRef}!$AU$4:$AU$100000,$B${r},${ledRef}!$Y$4:$Y$100000)` }, { nf: NUM, border: true, font: { size: 9 } });
    put(r, 6, { formula: `SUMIF(${ledRef}!$AU$4:$AU$100000,$B${r},${ledRef}!$AN$4:$AN$100000)` }, { nf: NUM, border: true, font: { size: 9 } });
    put(r, 7, { formula: `F${r}`, }, {});
    put(r, 7, { formula: `D${r}-F${r}` }, { nf: NUM, border: true, font: { size: 9 } });
    put(r, 8, { formula: `IFERROR(AVERAGEIF(${ledRef}!$AU$4:$AU$100000,$B${r},${ledRef}!$AM$4:$AM$100000),0)` }, { nf: PCT, al: { horizontal: 'center' }, border: true, font: { size: 9 } });
    put(r, 9, { formula: `IFERROR(F${r}/D${r}*100,0)` }, { nf: PCT, al: { horizontal: 'center' }, border: true, font: { size: 9 } });
  });
  r++;
  totalRow(ws, r, [undefined, 'TOTAL', { formula: `SUM(C${statusStart}:C${r - 1})` }, { formula: `SUM(D${statusStart}:D${r - 1})` }, { formula: `SUM(E${statusStart}:E${r - 1})` }, { formula: `SUM(F${statusStart}:F${r - 1})` }, { formula: `SUM(G${statusStart}:G${r - 1})` }, { formula: `IFERROR(AVERAGE(H${statusStart}:H${r - 1}),0)` }, { formula: `IFERROR(F${r}/D${r}*100,0)` }], 9);
  [4, 5, 6, 7].forEach(c => ws.getCell(r, c).numFmt = NUM);
  ws.getCell(r, 3).numFmt = NUM0;

  /* taluka-wise */
  r += 2;
  ws.mergeCells(r, 2, r, 9);
  put(r, 2, 'TALUKA WISE SUMMARY (तालुका निहाय सारांश)', { font: { bold: true, size: 11, color: { argb: 'FFFFFFFF' } }, fill: ACCENT, al: { vertical: 'middle', indent: 1 } });
  r++;
  ['Taluka', 'No. of Works', 'Est./TS Amount (₹)', 'AA Amount (₹)', 'Paid (₹)', 'Balance (₹)', 'Avg. Physical %', 'Utilisation %'].forEach((h, i) => put(r, 2 + i, h, { font: { bold: true, size: 9, color: { argb: 'FFFFFFFF' } }, fill: NAVY, al: { vertical: 'middle', horizontal: 'center', wrapText: true }, border: true }));
  ws.getRow(r).height = 26;
  const talStart = r + 1;
  const tals = [...new Set(rows.map(x => x.taluka))].sort();
  tals.forEach(s => {
    r++;
    put(r, 2, s, { font: { size: 9 }, border: true });
    put(r, 3, { formula: `COUNTIF(${ledRef}!$F$4:$F$100000,$B${r})` }, { nf: NUM0, al: { horizontal: 'center' }, border: true, font: { size: 9 } });
    put(r, 4, { formula: `SUMIF(${ledRef}!$F$4:$F$100000,$B${r},${ledRef}!$V$4:$V$100000)` }, { nf: NUM, border: true, font: { size: 9 } });
    put(r, 5, { formula: `SUMIF(${ledRef}!$F$4:$F$100000,$B${r},${ledRef}!$Y$4:$Y$100000)` }, { nf: NUM, border: true, font: { size: 9 } });
    put(r, 6, { formula: `SUMIF(${ledRef}!$F$4:$F$100000,$B${r},${ledRef}!$AN$4:$AN$100000)` }, { nf: NUM, border: true, font: { size: 9 } });
    put(r, 7, { formula: `D${r}-F${r}` }, { nf: NUM, border: true, font: { size: 9 } });
    put(r, 8, { formula: `IFERROR(AVERAGEIF(${ledRef}!$F$4:$F$100000,$B${r},${ledRef}!$AM$4:$AM$100000),0)` }, { nf: PCT, al: { horizontal: 'center' }, border: true, font: { size: 9 } });
    put(r, 9, { formula: `IFERROR(F${r}/D${r}*100,0)` }, { nf: PCT, al: { horizontal: 'center' }, border: true, font: { size: 9 } });
  });
  r++;
  totalRow(ws, r, [undefined, 'GRAND TOTAL', { formula: `SUM(C${talStart}:C${r - 1})` }, { formula: `SUM(D${talStart}:D${r - 1})` }, { formula: `SUM(E${talStart}:E${r - 1})` }, { formula: `SUM(F${talStart}:F${r - 1})` }, { formula: `SUM(G${talStart}:G${r - 1})` }, { formula: `IFERROR(AVERAGE(H${talStart}:H${r - 1}),0)` }, { formula: `IFERROR(F${r}/D${r}*100,0)` }], 9);
  [4, 5, 6, 7].forEach(c => ws.getCell(r, c).numFmt = NUM);

  /* head of account */
  r += 2;
  ws.mergeCells(r, 2, r, 9);
  put(r, 2, 'HEAD OF ACCOUNT WISE (मुख्य लेखाशीर्ष निहाय)', { font: { bold: true, size: 11, color: { argb: 'FFFFFFFF' } }, fill: ACCENT, al: { vertical: 'middle', indent: 1 } });
  r++;
  ['Head of Account', 'Description', 'No. of Works', 'Est./TS Amount (₹)', 'AA Amount (₹)', 'Paid (₹)', 'Balance (₹)', 'Utilisation %'].forEach((h, i) => put(r, 2 + i, h, { font: { bold: true, size: 9, color: { argb: 'FFFFFFFF' } }, fill: NAVY, al: { vertical: 'middle', horizontal: 'center', wrapText: true }, border: true }));
  ws.getRow(r).height = 26;
  const headStart = r + 1;
  A.groupSummary(rows, x => x.head_of_account).forEach(h => {
    r++;
    const desc = (C.HEADS_OF_ACCOUNT.find(z => z.code === h.key) || {}).desc || '';
    put(r, 2, h.key, { font: { size: 9 }, border: true });
    put(r, 3, desc, { font: { size: 8, color: { argb: GREY } }, border: true, al: { wrapText: true } });
    put(r, 4, { formula: `COUNTIF(${ledRef}!$L$4:$L$100000,$B${r})` }, { nf: NUM0, al: { horizontal: 'center' }, border: true, font: { size: 9 } });
    put(r, 5, { formula: `SUMIF(${ledRef}!$L$4:$L$100000,$B${r},${ledRef}!$V$4:$V$100000)` }, { nf: NUM, border: true, font: { size: 9 } });
    put(r, 6, { formula: `SUMIF(${ledRef}!$L$4:$L$100000,$B${r},${ledRef}!$Y$4:$Y$100000)` }, { nf: NUM, border: true, font: { size: 9 } });
    put(r, 7, { formula: `SUMIF(${ledRef}!$L$4:$L$100000,$B${r},${ledRef}!$AN$4:$AN$100000)` }, { nf: NUM, border: true, font: { size: 9 } });
    put(r, 8, { formula: `E${r}-G${r}` }, { nf: NUM, border: true, font: { size: 9 } });
    put(r, 9, { formula: `IFERROR(G${r}/E${r}*100,0)` }, { nf: PCT, al: { horizontal: 'center' }, border: true, font: { size: 9 } });
  });
  r++;
  totalRow(ws, r, [undefined, 'GRAND TOTAL', '', { formula: `SUM(D${headStart}:D${r - 1})` }, { formula: `SUM(E${headStart}:E${r - 1})` }, { formula: `SUM(F${headStart}:F${r - 1})` }, { formula: `SUM(G${headStart}:G${r - 1})` }, { formula: `SUM(H${headStart}:H${r - 1})` }, { formula: `IFERROR(G${r}/E${r}*100,0)` }], 9);
  [5, 6, 7, 8].forEach(c => ws.getCell(r, c).numFmt = NUM);

  /* bill status */
  r += 2;
  ws.mergeCells(r, 2, r, 9);
  put(r, 2, 'BILL STATUS WISE (बिल स्थिती निहाय)', { font: { bold: true, size: 11, color: { argb: 'FFFFFFFF' } }, fill: ACCENT, al: { vertical: 'middle', indent: 1 } });
  r++;
  ['Bill Status', 'No. of Works', 'Bills Pending (₹)', 'Unpaid Bills', '', '', '', ''].forEach((h, i) => put(r, 2 + i, h, { font: { bold: true, size: 9, color: { argb: 'FFFFFFFF' } }, fill: NAVY, al: { vertical: 'middle', horizontal: 'center', wrapText: true }, border: true }));
  const bStart = r + 1;
  C.BILL_STATUS.map(s => s.v).filter(s => rows.some(x => x.bill_status_auto === s)).forEach(s => {
    r++;
    put(r, 2, s, { font: { size: 9 }, border: true });
    put(r, 3, { formula: `COUNTIF(${ledRef}!$AV$4:$AV$100000,$B${r})` }, { nf: NUM0, al: { horizontal: 'center' }, border: true, font: { size: 9 } });
    put(r, 4, { formula: `SUMIF(${ledRef}!$AV$4:$AV$100000,$B${r},${ledRef}!$AW$4:$AW$100000)` }, { nf: NUM, border: true, font: { size: 9 } });
    put(r, 5, { formula: `SUMIF(${ledRef}!$AV$4:$AV$100000,$B${r},${ledRef}!$AX$4:$AX$100000)` }, { nf: NUM0, border: true, font: { size: 9 } });
  });
  r++;
  totalRow(ws, r, [undefined, 'TOTAL', { formula: `SUM(C${bStart}:C${r - 1})` }, { formula: `SUM(D${bStart}:D${r - 1})` }, { formula: `SUM(E${bStart}:E${r - 1})` }], 9);
  ws.getCell(r, 4).numFmt = NUM;
  return ws;
}

/* ============================================================
   WORKBOOK BUILDERS
   ============================================================ */
function prepare(f) {
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
  return { all, rows, t: A.totals(rows), f, m: D.masters(), sub: filterSub(f) };
}
function filterSub(f) {
  const parts = [];
  const map = { taluka: 'Taluka', division: 'Division', sub_division: 'Sub-Division', section: 'Section', head: 'Head of Account', nature: 'Nature of Work', fund: 'Fund Source', status: 'Work Status', bill_status: 'Bill Status', fy: 'FY', year: 'Est. Year', contractor: 'Contractor', priority: 'Priority', rag: 'RAG' };
  Object.keys(map).forEach(k => { if (f[k] && f[k] !== 'ALL') parts.push(`${map[k]}=${f[k]}`); });
  if (f.q) parts.push(`search="${f.q}"`);
  if (f.delayed === '1') parts.push('delayed only');
  if (f.stalled === '1') parts.push('stalled only');
  return parts.length ? parts.join('  |  ') : 'All works (no filter)';
}
function orderRows(rows, f) {
  const by = f.sort || 'taluka', dir = f.dir === 'desc' ? -1 : 1;
  const key = {
    taluka: r => (r.taluka || '') + '|' + r.work_name, amount: r => -r.effective_amount,
    status: r => (C.WORK_STATUS.find(s => s.v === r.work_status) || {}).order || 99,
    target: r => r.effective_target || '9999', delay: r => -r.delay_days, name: r => r.work_name,
    head: r => r.head_of_account, contractor: r => r.contractor_name,
  }[by] || (r => r.id);
  return [...rows].sort((a, b) => { const ka = key(a), kb = key(b); return (typeof ka === 'number' ? ka - kb : String(ka).localeCompare(String(kb))) * dir; });
}

function newWb(title) {
  const wb = new ExcelJS.Workbook();
  wb.creator = C.APP.nameShort; wb.company = C.APP.office; wb.title = title;
  wb.created = new Date(); wb.modified = new Date();
  return wb;
}

/* ---- 1. Master ledger workbook ---- */
async function ledgerWb(p) {
  const wb = newWb('Master Ledger');
  const rows = orderRows(p.rows, p.f);
  const wsL = wb.addWorksheet('Master Ledger', { views: [{ state: 'frozen', xSplit: 3, ySplit: 3 }], properties: { tabColor: { argb: NAVY } } });
  titleBlock(wsL, 'MASTER LEDGER – ELECTRICAL WORKS (काम नोंदवही)', `${C.APP.office}, ${C.APP.district}  •  ${p.sub}  •  Generated ${new Date().toLocaleString('en-IN')}  •  Columns [auto] contain live formulas`, LEDGER_HEADERS.length);
  const hr = wsL.getRow(3);
  LEDGER_HEADERS.forEach((h, i) => hr.getCell(i + 1).value = h);
  styleHeader(hr, 40);
  LEDGER_W.forEach((w, i) => wsL.getColumn(i + 1).width = w);
  wsL.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: LEDGER_HEADERS.length } };
  writeLedger(wsL, rows);

  const t = p.t;
  dashboardSheet(wb, rows, t, "'Master Ledger'");
  wb.getWorksheet('Dashboard').views = [{ showGridLines: false, state: 'frozen', ySplit: 3 }];
  /* move dashboard to first position */
  wb.worksheets.unshift(wb.worksheets.pop());

  /* taluka summary sheet */
  const wsT = addSheet(wb, 'Taluka Summary', 'TALUKA WISE SUMMARY (तालुका निहाय सारांश)', `Live SUMIF/COUNTIF formulas referencing Master Ledger  •  ${p.sub}`,
    ['Taluka', 'Works', 'Completed', 'Ongoing', 'Not started', 'Delayed', 'Stalled', 'Est./TS Amt (₹)', 'AA Amt (₹)', 'Budget Prov. (₹)', 'Paid (₹)', 'Balance (₹)', 'Bills Pending (₹)', 'Unpaid Bills', 'Avg Phy %', 'Utilisation %'],
    [16, 8, 11, 9, 11, 9, 9, 16, 16, 16, 16, 16, 15, 11, 10, 12]);
  const L = "'Master Ledger'";
  const tals = [...new Set(rows.map(r => r.taluka))].sort();
  tals.forEach((k, i) => {
    const r = i + 4, g = A.totals(rows.filter(x => x.taluka === k));
    const row = wsT.getRow(r);
    row.getCell(1).value = k;
    row.getCell(2).value = { formula: `COUNTIF(${L}!$F$4:$F$100000,$A${r})` };
    row.getCell(3).value = { formula: `COUNTIFS(${L}!$F$4:$F$100000,$A${r},${L}!$AM$4:$AM$100000,">=100")` };
    row.getCell(4).value = { formula: `COUNTIFS(${L}!$F$4:$F$100000,$A${r},${L}!$AM$4:$AM$100000,">0",${L}!$AM$4:$AM$100000,"<100")` };
    row.getCell(5).value = { formula: `COUNTIFS(${L}!$F$4:$F$100000,$A${r},${L}!$AM$4:$AM$100000,0)` };
    row.getCell(6).value = { formula: `COUNTIFS(${L}!$F$4:$F$100000,$A${r},${L}!$AS$4:$AS$100000,">0")` };
    row.getCell(7).value = { formula: `COUNTIFS(${L}!$F$4:$F$100000,$A${r},${L}!$AS$4:$AS$100000,"Yes")` };
    row.getCell(8).value = { formula: `SUMIF(${L}!$F$4:$F$100000,$A${r},${L}!$V$4:$V$100000)` };
    row.getCell(9).value = { formula: `SUMIF(${L}!$F$4:$F$100000,$A${r},${L}!$Y$4:$Y$100000)` };
    row.getCell(10).value = { formula: `SUMIF(${L}!$F$4:$F$100000,$A${r},${L}!$AC$4:$AC$100000)` };
    row.getCell(11).value = { formula: `SUMIF(${L}!$F$4:$F$100000,$A${r},${L}!$AN$4:$AN$100000)` };
    row.getCell(12).value = { formula: `H${r}-K${r}` };
    row.getCell(13).value = { formula: `SUMIF(${L}!$F$4:$F$100000,$A${r},${L}!$AV$4:$AV$100000)` };
    row.getCell(14).value = { formula: `SUMIF(${L}!$F$4:$F$100000,$A${r},${L}!$AW$4:$AW$100000)` };
    row.getCell(15).value = { formula: `IFERROR(AVERAGEIF(${L}!$F$4:$F$100000,$A${r},${L}!$AM$4:$AM$100000),0)` };
    row.getCell(16).value = { formula: `IFERROR(K${r}/H${r}*100,0)` };
  });
  const lastT = tals.length + 3;
  bandBody(wsT, 4, lastT, 16);
  [8, 9, 10, 11, 12, 13].forEach(c => wsT.getColumn(c).numFmt = NUM);
  [15, 16].forEach(c => wsT.getColumn(c).numFmt = PCT);
  totalRow(wsT, lastT + 1, [
    'GRAND TOTAL', { formula: `SUM(B4:B${lastT})` }, { formula: `SUM(C4:C${lastT})` }, { formula: `SUM(D4:D${lastT})` },
    { formula: `SUM(E4:E${lastT})` }, { formula: `SUM(F4:F${lastT})` }, { formula: `SUM(G4:G${lastT})` },
    { formula: `SUM(H4:H${lastT})` }, { formula: `SUM(I4:I${lastT})` }, { formula: `SUM(J4:J${lastT})` },
    { formula: `SUM(K4:K${lastT})` }, { formula: `SUM(L4:L${lastT})` }, { formula: `SUM(M4:M${lastT})` },
    { formula: `SUM(N4:N${lastT})` }, { formula: `IFERROR(AVERAGE(O4:O${lastT}),0)` }, { formula: `IFERROR(K${lastT + 1}/H${lastT + 1}*100,0)` }], 16);
  [8, 9, 10, 11, 12, 13].forEach(c => wsT.getRow(lastT + 1).getCell(c).numFmt = NUM);

  /* head of account sheet */
  const wsH = addSheet(wb, 'Head of Account', 'HEAD OF ACCOUNT SUMMARY (मुख्य लेखाशीर्ष निहाय)', 'Grouped by Major/Minor Head with live formulas',
    ['Head of Account', 'Description', 'Type', 'Works', 'Est./TS Amt (₹)', 'AA Amt (₹)', 'Paid (₹)', 'Balance (₹)', 'Utilisation %', 'Avg Phy %'],
    [16, 46, 11, 8, 16, 16, 16, 16, 12, 10]);
  const heads = A.groupSummary(rows, x => x.head_of_account);
  heads.forEach((h, i) => {
    const r = i + 4, meta = C.HEADS_OF_ACCOUNT.find(z => z.code === h.key) || {};
    wsH.getRow(r).getCell(1).value = h.key;
    wsH.getRow(r).getCell(2).value = meta.desc || '';
    wsH.getRow(r).getCell(3).value = meta.type || '';
    wsH.getRow(r).getCell(4).value = { formula: `COUNTIF(${L}!$L$4:$L$100000,$A${r})` };
    wsH.getRow(r).getCell(5).value = { formula: `SUMIF(${L}!$L$4:$L$100000,$A${r},${L}!$V$4:$V$100000)` };
    wsH.getRow(r).getCell(6).value = { formula: `SUMIF(${L}!$L$4:$L$100000,$A${r},${L}!$Y$4:$Y$100000)` };
    wsH.getRow(r).getCell(7).value = { formula: `SUMIF(${L}!$L$4:$L$100000,$A${r},${L}!$AN$4:$AN$100000)` };
    wsH.getRow(r).getCell(8).value = { formula: `E${r}-G${r}` };
    wsH.getRow(r).getCell(9).value = { formula: `IFERROR(G${r}/E${r}*100,0)` };
    wsH.getRow(r).getCell(10).value = { formula: `IFERROR(AVERAGEIF(${L}!$L$4:$L$100000,$A${r},${L}!$AM$4:$AM$100000),0)` };
  });
  const lastH = heads.length + 3;
  bandBody(wsH, 4, lastH, 10);
  [5, 6, 7, 8].forEach(c => wsH.getColumn(c).numFmt = NUM);
  [9, 10].forEach(c => wsH.getColumn(c).numFmt = PCT);
  totalRow(wsH, lastH + 1, ['GRAND TOTAL', '', '', { formula: `SUM(D4:D${lastH})` }, { formula: `SUM(E4:E${lastH})` }, { formula: `SUM(F4:F${lastH})` }, { formula: `SUM(G4:G${lastH})` }, { formula: `SUM(H4:H${lastH})` }, { formula: `IFERROR(G${lastH + 1}/E${lastH + 1}*100,0)` }, { formula: `IFERROR(AVERAGE(J4:J${lastH}),0)` }], 10);
  [5, 6, 7, 8].forEach(c => wsH.getRow(lastH + 1).getCell(c).numFmt = NUM);

  /* bills sheet */
  billSheet(wb, rows, p);
  /* milestones sheet */
  milestoneSheet(wb, rows, p);
  /* masters sheet */
  masterSheet(wb, p.m);

  wb.eachSheet(ws => { ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } }; ws.headerFooter = { oddFooter: '&L' + C.APP.nameShort + ' &C&"Calibri"&8Generated ' + new Date().toLocaleString('en-IN') + ' &RPage &P of &N' }; });
  return wb;
}

function billSheet(wb, rows, p, standalone) {
  const reg = A.billRegister(rows);
  const ws = addSheet(wb, 'Bill Register', 'BILL REGISTER & STATUS (बिल नोंद व स्थिती)',
    `${p.sub}  •  Ageing column is a live formula  •  ${reg.length} bills`,
    ['Sr.', 'Work ID', 'Work Name', 'Est. No.', 'Taluka', 'Division', 'Sub-Division', 'Contractor', 'AA Amt (₹)', 'Est. Amt (₹)',
      'Bill Type', 'Bill No.', 'Bill Date', 'Submitted Date', 'Bill Amount (₹)', 'Paid Amount (₹)', 'Pending (₹) [auto]', 'Paid Date',
      'Bill Status', 'Ageing (days) [auto]', 'Voucher No.', 'Treasury Ref.', 'Objection', 'Remarks'],
    [5, 7, 44, 20, 13, 26, 28, 32, 15, 15, 20, 20, 12, 12, 15, 15, 15, 12, 24, 12, 14, 16, 30, 30]);
  reg.forEach((b, i) => {
    const r = i + 4, row = ws.getRow(r);
    [i + 1, b.work_id, b.work_name, b.est_number, b.taluka, b.division, b.sub_division, b.contractor, b.aa_amount, b.est_amount,
      b.bill_type, b.bill_number, b.bill_date || null, b.submitted_date || null, b.amount, b.paid_amount,
      { formula: `O${r}-P${r}` }, b.paid_date || null, b.status,
      { formula: `IF(S${r}="Paid / Disbursed","",IF(OR(M${r}="",N${r}=""),"",TODAY()-IF(N${r}="",M${r},N${r})))` },
      b.voucher_number, b.treasury_ref, b.objection, b.remarks].forEach((v, ci) => { row.getCell(ci + 1).value = v === '' ? null : v; });
    [9, 10, 15, 16, 17].forEach(c => row.getCell(c).numFmt = NUM);
    [13, 14, 18].forEach(c => row.getCell(c).numFmt = 'dd-mm-yyyy');
  });
  const last = reg.length + 3;
  bandBody(ws, 4, last, 24);
  totalRow(ws, last + 1, ['TOTAL', '', `${reg.length} bills`, '', '', '', '', '', { formula: `SUM(I4:I${last})` }, { formula: `SUM(J4:J${last})` }, '', '', '', '', { formula: `SUM(O4:O${last})` }, { formula: `SUM(P4:P${last})` }, { formula: `SUM(Q4:Q${last})` }, '', '', '', '', '', '', ''], 24);
  [9, 10, 15, 16, 17].forEach(c => ws.getRow(last + 1).getCell(c).numFmt = NUM);
  ws.addConditionalFormatting({
    ref: `T4:T${last}`,
    rules: [
      { type: 'cellIs', operator: 'greaterThan', formulae: [String(C.RULES.billPendingAlertDays)], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFF8D7DA' } }, font: { color: { argb: RED }, bold: true } }, priority: 1 },
      { type: 'cellIs', operator: 'between', formulae: [String(C.RULES.billPendingWarnDays), String(C.RULES.billPendingAlertDays)], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFF3CD' } }, font: { color: { argb: AMBER }, bold: true } }, priority: 2 },
    ],
  });
  ws.addConditionalFormatting({
    ref: `S4:S${last}`,
    rules: [
      { type: 'containsText', operator: 'containsText', text: 'Paid', formulae: [`NOT(ISERROR(SEARCH("Paid",S4)))`], style: { font: { color: { argb: GREEN }, bold: true } }, priority: 3 },
      { type: 'containsText', operator: 'containsText', text: 'Objection', formulae: [`NOT(ISERROR(SEARCH("Objection",S4)))`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFF8D7DA' } }, font: { color: { argb: RED }, bold: true } }, priority: 4 },
    ],
  });
  const m = D.masters();
  for (let r = 4; r <= last; r++) {
    ws.getCell(`K${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${m.bill_types.join(',').slice(0, 240)}"`] };
    ws.getCell(`S${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${m.bill_status.join(',').slice(0, 240)}"`] };
  }
  return ws;
}

function milestoneSheet(wb, rows, p) {
  const ms = A.milestoneTracker(rows);
  const ws = addSheet(wb, 'Milestone Tracker', 'MILESTONE TRACKER (टप्पा निहाय नियोजन)',
    `${p.sub}  •  Days left / overdue are live formulas  •  ${ms.length} milestones`,
    ['Sr.', 'Work ID', 'Work Name', 'Est. No.', 'Taluka', 'Milestone', 'Planned Date', 'Actual Date', 'Status',
      'Days Left [auto]', 'Overdue Days [auto]', 'Flag [auto]', 'Responsible', 'Remarks'],
    [5, 7, 44, 20, 13, 30, 12, 12, 14, 11, 12, 12, 18, 30]);
  ms.forEach((m, i) => {
    const r = i + 4, row = ws.getRow(r);
    [i + 1, m.work_id, m.work_name, m.est_number, m.taluka, m.milestone, m.planned_date || null, m.actual_date || null, m.status,
      { formula: `IF(I${r}="Completed","",IF(G${r}="","",G${r}-TODAY()))` },
      { formula: `IF(I${r}="Completed","",IF(G${r}="","",MAX(0,TODAY()-G${r})))` },
      { formula: `IF(I${r}="Completed","DONE",IF(G${r}="","SCHEDULED",IF(K${r}>0,"OVERDUE",IF(J${r}<=30,"DUE SOON","SCHEDULED"))))` },
      m.responsible, m.remarks].forEach((v, ci) => { row.getCell(ci + 1).value = v === '' ? null : v; });
    [7, 8].forEach(c => row.getCell(c).numFmt = 'dd-mm-yyyy');
  });
  const last = ms.length + 3;
  bandBody(ws, 4, last, 14);
  ws.addConditionalFormatting({
    ref: `L4:L${last}`,
    rules: [
      { type: 'containsText', operator: 'containsText', text: 'OVERDUE', formulae: [`NOT(ISERROR(SEARCH("OVERDUE",L4)))`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFF8D7DA' } }, font: { color: { argb: RED }, bold: true } }, priority: 1 },
      { type: 'containsText', operator: 'containsText', text: 'DUE SOON', formulae: [`NOT(ISERROR(SEARCH("DUE SOON",L4)))`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFF3CD' } }, font: { color: { argb: AMBER }, bold: true } }, priority: 2 },
      { type: 'containsText', operator: 'containsText', text: 'DONE', formulae: [`NOT(ISERROR(SEARCH("DONE",L4)))`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFD4EDDA' } }, font: { color: { argb: GREEN }, bold: true } }, priority: 3 },
    ],
  });
  for (let r = 4; r <= last; r++) ws.getCell(`I${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Not Started,In Progress,Completed,Delayed,Not Applicable"'] };
  totalRow(ws, last + 1, ['TOTAL', '', `${ms.length} milestones`, '', '', '', '', '', '', '', { formula: `SUMIF(L4:L${last},"OVERDUE",K4:K${last})` }, { formula: `COUNTIF(L4:L${last},"OVERDUE")&" overdue / "&COUNTIF(L4:L${last},"DONE")&" done"` }, '', ''], 14);
  return ws;
}

function masterSheet(wb, m) {
  const ws = wb.addWorksheet('Masters', { views: [{ state: 'frozen', ySplit: 3 }] });
  titleBlock(ws, 'MASTER LISTS (used for dropdowns & validation)', 'Edit these in Settings inside the application; they are exported here for reference.', 10);
  const cols = [['Talukas', m.talukas], ['Work Status', m.work_status], ['Bill Status', m.bill_status], ['Head of Account', m.heads],
    ['Nature of Work', m.nature], ['Fund Source', m.funds], ['Divisions', m.divisions], ['Sub-Divisions', m.sub_divisions],
    ['Sections', m.sections], ['Milestones', m.milestones]];
  cols.forEach((c, i) => {
    ws.getColumn(i + 1).width = i === 3 ? 60 : 28;
    ws.getCell(3, i + 1).value = c[0];
    c[1].forEach((v, j) => { ws.getCell(4 + j, i + 1).value = v; });
  });
  styleHeader(ws.getRow(3), 24);
  const maxLen = Math.max(...cols.map(c => c[1].length));
  bandBody(ws, 4, 3 + maxLen, cols.length);
  return ws;
}

/* ---- 2. taluka excel ---- */
async function talukaXl(p) {
  const wb = newWb('Taluka Summary');
  const rows = orderRows(p.rows, p.f);
  const wsL = wb.addWorksheet('Works Data', { views: [{ state: 'frozen', xSplit: 3, ySplit: 3 }] });
  const heads = ['Sr.', 'Work Name', 'Est No.', 'Taluka', 'Head of Account', 'AA Amount', 'Est/TS Amount', 'Amount Paid', 'Balance [auto]', 'Physical %', 'Work Status', 'Bill Status', 'Target Date', 'Delayed', 'Stalled', 'RAG'];
  titleBlock(wsL, 'WORKS DATA (source for summary sheets)', p.sub, heads.length);
  heads.forEach((h, i) => wsL.getRow(3).getCell(i + 1).value = h);
  styleHeader(wsL.getRow(3), 30);
  [5, 48, 20, 14, 16, 16, 16, 16, 16, 10, 26, 22, 12, 9, 9, 9].forEach((w, i) => wsL.getColumn(i + 1).width = w);
  rows.forEach((w, i) => {
    const r = i + 4, row = wsL.getRow(r);
    [i + 1, w.work_name, w.est_number, w.taluka, w.head_of_account, w.aa_amount, w.est_amount, w.amount_paid,
      { formula: `G${r}-H${r}` }, w.physical_progress, w.work_status, w.bill_status_auto, w.effective_target || null,
      w.is_delayed ? 'Yes' : 'No', w.stalled ? 'Yes' : 'No', w.rag].forEach((v, ci) => row.getCell(ci + 1).value = v === '' ? null : v);
    [6, 7, 8, 9].forEach(c => row.getCell(c).numFmt = NUM);
    row.getCell(10).numFmt = PCT; row.getCell(13).numFmt = 'dd-mm-yyyy';
  });
  const last = rows.length + 3;
  bandBody(wsL, 4, last, heads.length);
  wsL.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: heads.length } };
  totalRow(wsL, last + 1, ['TOTAL', `${rows.length} works`, '', '', '', { formula: `SUBTOTAL(109,F4:F${last})` }, { formula: `SUBTOTAL(109,G4:G${last})` }, { formula: `SUBTOTAL(109,H4:H${last})` }, { formula: `SUBTOTAL(109,I4:I${last})` }, { formula: `ROUND(AVERAGE(J4:J${last}),1)` }, '', '', '', { formula: `COUNTIF(N4:N${last},"Yes")` }, { formula: `COUNTIF(O4:O${last},"Yes")` }, ''], heads.length);
  [6, 7, 8, 9].forEach(c => wsL.getRow(last + 1).getCell(c).numFmt = NUM);

  /* taluka summary with formulas */
  const ws = addSheet(wb, 'Taluka Summary', 'TALUKA WISE SUMMARY (तालुका निहाय सारांश)', `Live COUNTIF / SUMIF against 'Works Data'  •  ${p.sub}`,
    ['Sr.', 'Taluka', 'Works', 'Completed', 'Ongoing', 'Not Started', 'Delayed', 'Stalled', 'AA Amount (₹)', 'Est/TS Amount (₹)', 'Paid (₹)', 'Balance (₹)', 'Utilisation %', 'Avg Physical %'],
    [5, 18, 8, 11, 9, 11, 9, 9, 18, 18, 18, 18, 12, 13]);
  const tals = [...new Set(rows.map(r => r.taluka))].sort();
  const L = "'Works Data'";
  tals.forEach((k, i) => {
    const r = i + 4, row = ws.getRow(r);
    row.getCell(1).value = i + 1;
    row.getCell(2).value = k;
    row.getCell(3).value = { formula: `COUNTIF(${L}!$D$4:$D$100000,$B${r})` };
    row.getCell(4).value = { formula: `COUNTIFS(${L}!$D$4:$D$100000,$B${r},${L}!$J$4:$J$100000,">=100")` };
    row.getCell(5).value = { formula: `COUNTIFS(${L}!$D$4:$D$100000,$B${r},${L}!$J$4:$J$100000,">0",${L}!$J$4:$J$100000,"<100")` };
    row.getCell(6).value = { formula: `COUNTIFS(${L}!$D$4:$D$100000,$B${r},${L}!$J$4:$J$100000,0)` };
    row.getCell(7).value = { formula: `COUNTIFS(${L}!$D$4:$D$100000,$B${r},${L}!$N$4:$N$100000,"Yes")` };
    row.getCell(8).value = { formula: `COUNTIFS(${L}!$D$4:$D$100000,$B${r},${L}!$O$4:$O$100000,"Yes")` };
    row.getCell(9).value = { formula: `SUMIF(${L}!$D$4:$D$100000,$B${r},${L}!$F$4:$F$100000)` };
    row.getCell(10).value = { formula: `SUMIF(${L}!$D$4:$D$100000,$B${r},${L}!$G$4:$G$100000)` };
    row.getCell(11).value = { formula: `SUMIF(${L}!$D$4:$D$100000,$B${r},${L}!$H$4:$H$100000)` };
    row.getCell(12).value = { formula: `J${r}-K${r}` };
    row.getCell(13).value = { formula: `IFERROR(K${r}/J${r}*100,0)` };
    row.getCell(14).value = { formula: `IFERROR(AVERAGEIF(${L}!$D$4:$D$100000,$B${r},${L}!$J$4:$J$100000),0)` };
  });
  const lastS = tals.length + 3;
  bandBody(ws, 4, lastS, 14);
  [9, 10, 11, 12].forEach(c => ws.getColumn(c).numFmt = NUM);
  [13, 14].forEach(c => ws.getColumn(c).numFmt = PCT);
  ws.addConditionalFormatting({ ref: `M4:M${lastS}`, rules: [{ type: 'dataBar', cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 100 }], color: { argb: 'FF4C86C6' }, priority: 1 }] });
  ws.addConditionalFormatting({ ref: `N4:N${lastS}`, rules: [{ type: 'dataBar', cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 100 }], color: { argb: 'FF7FB069' }, priority: 1 }] });
  totalRow(ws, lastS + 1, ['', 'GRAND TOTAL', { formula: `SUM(C4:C${lastS})` }, { formula: `SUM(D4:D${lastS})` }, { formula: `SUM(E4:E${lastS})` }, { formula: `SUM(F4:F${lastS})` }, { formula: `SUM(G4:G${lastS})` }, { formula: `SUM(H4:H${lastS})` }, { formula: `SUM(I4:I${lastS})` }, { formula: `SUM(J4:J${lastS})` }, { formula: `SUM(K4:K${lastS})` }, { formula: `SUM(L4:L${lastS})` }, { formula: `IFERROR(K${lastS + 1}/J${lastS + 1}*100,0)` }, { formula: `IFERROR(AVERAGE(N4:N${lastS}),0)` }], 14);
  [9, 10, 11, 12].forEach(c => ws.getRow(lastS + 1).getCell(c).numFmt = NUM);

  /* head-wise */
  const wsH = addSheet(wb, 'Head of Account', 'HEAD OF ACCOUNT WISE (मुख्य लेखाशीर्ष निहाय)', 'Live formulas against Works Data',
    ['Sr.', 'Head of Account', 'Description', 'Works', 'AA Amount (₹)', 'Est/TS Amount (₹)', 'Paid (₹)', 'Balance (₹)', 'Utilisation %'],
    [5, 16, 52, 8, 18, 18, 18, 18, 12]);
  const hh = A.groupSummary(rows, x => x.head_of_account);
  hh.forEach((h, i) => {
    const r = i + 4, row = wsH.getRow(r), meta = C.HEADS_OF_ACCOUNT.find(z => z.code === h.key) || {};
    row.getCell(1).value = i + 1; row.getCell(2).value = h.key; row.getCell(3).value = meta.desc || '';
    row.getCell(4).value = { formula: `COUNTIF(${L}!$E$4:$E$100000,$B${r})` };
    row.getCell(5).value = { formula: `SUMIF(${L}!$E$4:$E$100000,$B${r},${L}!$F$4:$F$100000)` };
    row.getCell(6).value = { formula: `SUMIF(${L}!$E$4:$E$100000,$B${r},${L}!$G$4:$G$100000)` };
    row.getCell(7).value = { formula: `SUMIF(${L}!$E$4:$E$100000,$B${r},${L}!$H$4:$H$100000)` };
    row.getCell(8).value = { formula: `F${r}-G${r}` };
    row.getCell(9).value = { formula: `IFERROR(G${r}/F${r}*100,0)` };
  });
  const lastH = hh.length + 3;
  bandBody(wsH, 4, lastH, 9);
  [5, 6, 7, 8].forEach(c => wsH.getColumn(c).numFmt = NUM);
  wsH.getColumn(9).numFmt = PCT;
  totalRow(wsH, lastH + 1, ['', 'GRAND TOTAL', '', { formula: `SUM(D4:D${lastH})` }, { formula: `SUM(E4:E${lastH})` }, { formula: `SUM(F4:F${lastH})` }, { formula: `SUM(G4:G${lastH})` }, { formula: `SUM(H4:H${lastH})` }, { formula: `IFERROR(G${lastH + 1}/F${lastH + 1}*100,0)` }], 9);
  [5, 6, 7, 8].forEach(c => wsH.getRow(lastH + 1).getCell(c).numFmt = NUM);

  /* taluka x status pivot-ready */
  const wsP = addSheet(wb, 'Taluka x Status', 'TALUKA × WORK STATUS MATRIX', 'Pivot-ready counts (static values – refresh from app)',
    ['Taluka', ...C.WORK_STATUS.map(s => s.v).filter(s => rows.some(r => r.work_status === s)), 'Total'],
    [18, ...C.WORK_STATUS.map(s => s.v).filter(s => rows.some(r => r.work_status === s)).map(() => 14), 9]);
  const usedS = C.WORK_STATUS.map(s => s.v).filter(s => rows.some(r => r.work_status === s));
  tals.forEach((k, i) => {
    const r = i + 4, row = wsP.getRow(r);
    row.getCell(1).value = k;
    usedS.forEach((s, j) => { row.getCell(2 + j).value = rows.filter(x => x.taluka === k && x.work_status === s).length || null; });
    row.getCell(2 + usedS.length).value = rows.filter(x => x.taluka === k).length;
  });
  const lastP = tals.length + 3;
  bandBody(wsP, 4, lastP, usedS.length + 2);
  totalRow(wsP, lastP + 1, ['GRAND TOTAL', ...usedS.map(s => rows.filter(x => x.work_status === s).length), rows.length], usedS.length + 2);
  pageSetupAll(wb);
  return wb;
}

function pageSetupAll(wb) {
  wb.eachSheet(ws => {
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
    ws.headerFooter = { oddFooter: '&L' + C.APP.nameShort + ' &C&8Generated ' + new Date().toLocaleString('en-IN') + ' &RPage &P of &N' };
  });
}

/* ---- 3. headwise excel ---- */
async function headwiseXl(p) { const wb = await talukaXl(p); wb.eachSheet(ws => { if (['Works Data', 'Taluka Summary', 'Taluka x Status'].includes(ws.name)) wb.removeWorksheet(ws.id); }); pageSetupAll(wb); return wb; }

/* ---- 4. bills excel ---- */
async function billsXl(p) { const wb = newWb('Bill Register'); billSheet(wb, orderRows(p.rows, p.f), p, true);
  const reg = A.billRegister(p.rows);
  const ws = addSheet(wb, 'Status Summary', 'BILL STATUS WISE SUMMARY', 'Counts & amounts per status',
    ['Bill Status', 'No. of Bills', 'Bill Amount (₹)', 'Paid (₹)', 'Pending (₹)', 'Max Ageing (days)'], [26, 12, 18, 18, 18, 16]);
  C.BILL_STATUS.map(s => s.v).filter(v => reg.some(r => r.status === v)).forEach((v, i) => {
    const r = i + 4, list = reg.filter(x => x.status === v), row = ws.getRow(r);
    row.getCell(1).value = v; row.getCell(2).value = list.length;
    row.getCell(3).value = A.sum(list, x => x.amount); row.getCell(4).value = A.sum(list, x => x.paid_amount);
    row.getCell(5).value = { formula: `C${r}-D${r}` }; row.getCell(6).value = list.reduce((m, x) => Math.max(m, x.ageing_days), 0);
    [3, 4, 5].forEach(c => row.getCell(c).numFmt = NUM);
  });
  const last = ws.rowCount;
  bandBody(ws, 4, last, 6);
  totalRow(ws, last + 1, ['TOTAL', { formula: `SUM(B4:B${last})` }, { formula: `SUM(C4:C${last})` }, { formula: `SUM(D4:D${last})` }, { formula: `SUM(E4:E${last})` }, { formula: `MAX(F4:F${last})` }], 6);
  [3, 4, 5].forEach(c => ws.getRow(last + 1).getCell(c).numFmt = NUM);
  pageSetupAll(wb); return wb;
}

/* ---- 5. targets excel ---- */
async function targetsXl(p) {
  const wb = newWb('Target Monitoring');
  const rows = orderRows(p.rows, Object.assign({}, p.f, { sort: p.f.sort || 'target' }));
  const ws = addSheet(wb, 'Target Monitoring', 'TARGET vs ACHIEVEMENT (लक्ष्य व पूर्तता)', `${p.sub}  •  Days left, variance and delay columns are live formulas`,
    ['Sr.', 'Work Name', 'Est. No.', 'Taluka', 'Head of Account', 'Contractor', 'W.O. Date', 'Target Date', 'Extended Target',
      'Effective Target [auto]', 'Days Left [auto]', 'Physical Target %', 'Physical Achieved %', 'Physical Variance [auto]',
      'Financial Target (₹)', 'Financial Achieved (₹)', 'Financial Variance (₹) [auto]', 'Financial %', 'Delay Days [auto]', 'Work Status', 'RAG'],
    [5, 46, 20, 13, 15, 32, 12, 12, 12, 13, 11, 11, 12, 12, 17, 17, 17, 10, 11, 26, 9]);
  rows.forEach((w, i) => {
    const r = i + 4, row = ws.getRow(r);
    [i + 1, w.work_name, w.est_number, w.taluka, w.head_of_account, w.contractor_name, w.wo_date || null, w.target_date || null, w.extended_target_date || null,
      { formula: `IF(I${r}="",H${r},I${r})` },
      { formula: `IF(J${r}="","",J${r}-TODAY())` }, 100, w.physical_progress, { formula: `M${r}-L${r}` },
      w.effective_amount, w.amount_paid, { formula: `P${r}-O${r}` }, w.financial_progress,
      { formula: `IF(OR(J${r}="",M${r}>=100),0,MAX(0,TODAY()-J${r}-${C.RULES.completionGraceDays}))` },
      w.work_status, w.rag].forEach((v, ci) => row.getCell(ci + 1).value = v === '' ? null : v);
    [15, 16, 17].forEach(c => row.getCell(c).numFmt = NUM);
    [7, 8, 9, 10].forEach(c => row.getCell(c).numFmt = 'dd-mm-yyyy');
    [12, 13, 14, 18].forEach(c => row.getCell(c).numFmt = PCT);
  });
  const last = rows.length + 3;
  bandBody(ws, 4, last, 21);
  ws.addConditionalFormatting({ ref: `K4:K${last}`, rules: [
    { type: 'cellIs', operator: 'lessThan', formulae: ['0'], style: { font: { color: { argb: RED }, bold: true }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFF8D7DA' } } }, priority: 1 },
    { type: 'cellIs', operator: 'between', formulae: ['0', '30'], style: { font: { color: { argb: AMBER }, bold: true } }, priority: 2 }] });
  ws.addConditionalFormatting({ ref: `M4:M${last}`, rules: [{ type: 'dataBar', cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 100 }], color: { argb: 'FF7FB069' }, priority: 1 }] });
  ws.addConditionalFormatting({ ref: `S4:S${last}`, rules: [{ type: 'cellIs', operator: 'greaterThan', formulae: ['0'], style: { font: { color: { argb: RED }, bold: true } }, priority: 1 }] });
  const t = p.t;
  totalRow(ws, last + 1, ['TOTAL', `${rows.length} works`, '', '', '', '', '', '', '', '', '', '', { formula: `ROUND(AVERAGE(M4:M${last}),1)` }, '', { formula: `SUBTOTAL(109,O4:O${last})` }, { formula: `SUBTOTAL(109,P4:P${last})` }, { formula: `SUM(Q4:Q${last})` }, { formula: `ROUND(AVERAGE(R4:R${last}),1)` }, { formula: `COUNTIF(U4:U${last},"RED")&" RED"` }, '', ''], 21);
  [15, 16, 17].forEach(c => ws.getRow(last + 1).getCell(c).numFmt = NUM);
  pageSetupAll(wb); return wb;
}

/* ---- 6. milestone excel ---- */
async function milestoneXl(p) { const wb = newWb('Milestone Tracker'); milestoneSheet(wb, orderRows(p.rows, p.f), p); pageSetupAll(wb); return wb; }

/* ---- 7. contractor excel ---- */
async function contractorXl(p) {
  const wb = newWb('Contractor Register');
  const rows = p.rows.filter(r => r.contractor_name);
  const ws = addSheet(wb, 'Contractor Register', 'CONTRACTOR / AGENCY REGISTER', `${p.sub}  •  ${rows.length} awarded works`,
    ['Sr.', 'Contractor / Agency', 'Class', 'Contact', 'Work Name', 'Est. No.', 'Taluka', 'W.O. No.', 'W.O. Date', 'Target Date',
      'W.O. Amount (₹)', 'AA Amount (₹)', 'Paid (₹)', 'Balance (₹) [auto]', 'Physical %', 'Work Status', 'Bill Status', 'Delayed', 'RAG'],
    [5, 34, 12, 14, 46, 20, 13, 20, 12, 12, 16, 16, 16, 16, 10, 26, 22, 9, 9]);
  const byCon = A.groupSummary(rows, r => r.contractor_name);
  let i = 0;
  byCon.forEach(g => {
    rows.filter(r => r.contractor_name === g.key).sort((a, b) => (a.taluka || '').localeCompare(b.taluka || '')).forEach(w => {
      const r = i + 4, row = ws.getRow(r);
      [++i, w.contractor_name, w.contractor_class, w.contractor_contact, w.work_name, w.est_number, w.taluka, w.wo_number, w.wo_date || null,
        w.effective_target || null, w.wo_amount, w.aa_amount, w.amount_paid, { formula: `K${r}-M${r}` }, w.physical_progress,
        w.work_status, w.bill_status_auto, w.is_delayed ? 'Yes' : 'No', w.rag].forEach((v, ci) => row.getCell(ci + 1).value = v === '' ? null : v);
      [11, 12, 13, 14].forEach(c => row.getCell(c).numFmt = NUM);
      row.getCell(15).numFmt = PCT; [9, 10].forEach(c => row.getCell(c).numFmt = 'dd-mm-yyyy');
    });
  });
  const last = rows.length + 3;
  bandBody(ws, 4, last, 19);
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: 19 } };
  totalRow(ws, last + 1, ['TOTAL', `${byCon.length} contractors`, '', '', `${rows.length} works`, '', '', '', '', '', { formula: `SUBTOTAL(109,K4:K${last})` }, { formula: `SUBTOTAL(109,L4:L${last})` }, { formula: `SUBTOTAL(109,M4:M${last})` }, { formula: `SUM(N4:N${last})` }, { formula: `ROUND(AVERAGE(O4:O${last}),1)` }, '', '', { formula: `COUNTIF(R4:R${last},"Yes")` }, { formula: `COUNTIF(S4:S${last},"RED")&" RED"` }], 19);
  [11, 12, 13, 14].forEach(c => ws.getRow(last + 1).getCell(c).numFmt = NUM);
  /* summary */
  const ws2 = addSheet(wb, 'Contractor Summary', 'CONTRACTOR WISE SUMMARY', 'Static aggregation with utilisation formula',
    ['Sr.', 'Contractor / Agency', 'Works', 'Completed', 'Delayed', 'W.O. Amount (₹)', 'AA Amount (₹)', 'Paid (₹)', 'Balance (₹)', 'Avg Physical %', 'Utilisation %'],
    [5, 36, 8, 11, 9, 18, 18, 18, 18, 12, 12]);
  byCon.forEach((g, k) => {
    const r = k + 4, row = ws2.getRow(r);
    [k + 1, g.key, g.count, g.completed, g.delayed, A.sum(rows.filter(x => x.contractor_name === g.key), x => x.wo_amount), g.aa_amount, g.paid,
      { formula: `F${r}-H${r}` }, g.avg_physical, { formula: `IFERROR(H${r}/F${r}*100,0)` }].forEach((v, ci) => row.getCell(ci + 1).value = v);
    [6, 7, 8, 9].forEach(c => row.getCell(c).numFmt = NUM);
    [10, 11].forEach(c => row.getCell(c).numFmt = PCT);
  });
  const last2 = byCon.length + 3;
  bandBody(ws2, 4, last2, 11);
  totalRow(ws2, last2 + 1, ['', 'GRAND TOTAL', { formula: `SUM(C4:C${last2})` }, { formula: `SUM(D4:D${last2})` }, { formula: `SUM(E4:E${last2})` }, { formula: `SUM(F4:F${last2})` }, { formula: `SUM(G4:G${last2})` }, { formula: `SUM(H4:H${last2})` }, { formula: `SUM(I4:I${last2})` }, { formula: `ROUND(AVERAGE(J4:J${last2}),1)` }, { formula: `IFERROR(H${last2 + 1}/F${last2 + 1}*100,0)` }], 11);
  [6, 7, 8, 9].forEach(c => ws2.getRow(last2 + 1).getCell(c).numFmt = NUM);
  pageSetupAll(wb); return wb;
}

/* ---- 8. delay excel ---- */
async function delayXl(p) {
  const wb = newWb('Delayed Works');
  const rows = p.rows.filter(r => r.is_delayed || r.stalled || r.bill_pending_days > C.RULES.billPendingAlertDays || r.rag === 'RED')
    .sort((a, b) => (b.delay_days - a.delay_days) || (b.bills_pending_amount - a.bills_pending_amount));
  const ws = addSheet(wb, 'Delayed & Critical', 'DELAYED, STALLED & CRITICAL WORKS', `${p.sub}  •  ${rows.length} works flagged`,
    ['Sr.', 'Work Name', 'Est. No.', 'Taluka', 'Sub-Division', 'Contractor', 'Target Date', 'Days Overdue [auto]', 'Physical %',
      'AA Amount (₹)', 'Paid (₹)', 'Balance (₹) [auto]', 'Bills Pending (₹)', 'Bill Ageing (days)', 'Work Status', 'Bill Status', 'Stalled', 'Reason / Remarks'],
    [5, 46, 20, 13, 28, 32, 12, 13, 10, 16, 16, 16, 15, 13, 26, 22, 9, 40]);
  rows.forEach((w, i) => {
    const r = i + 4, row = ws.getRow(r);
    [i + 1, w.work_name, w.est_number, w.taluka, w.sub_division, w.contractor_name, w.effective_target || null,
      { formula: `IF(OR(G${r}="",I${r}>=100),0,MAX(0,TODAY()-G${r}-${C.RULES.completionGraceDays}))` },
      w.physical_progress, w.aa_amount, w.amount_paid, { formula: `J${r}-K${r}` }, w.bills_pending_amount, w.bill_pending_days,
      w.work_status, w.bill_status_auto, w.stalled ? 'Yes' : 'No', w.stalled_reason || w.delay_reason || w.rag_reasons]
      .forEach((v, ci) => row.getCell(ci + 1).value = v === '' ? null : v);
    [10, 11, 12, 13].forEach(c => row.getCell(c).numFmt = NUM);
    row.getCell(9).numFmt = PCT; row.getCell(7).numFmt = 'dd-mm-yyyy';
  });
  const last = rows.length + 3;
  bandBody(ws, 4, last, 18);
  ws.addConditionalFormatting({ ref: `H4:H${last}`, rules: [
    { type: 'cellIs', operator: 'greaterThan', formulae: ['180'], style: { font: { color: { argb: RED }, bold: true }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFF8D7DA' } } }, priority: 1 },
    { type: 'cellIs', operator: 'between', formulae: ['1', '180'], style: { font: { color: { argb: AMBER }, bold: true } }, priority: 2 }] });
  const t = A.totals(rows);
  totalRow(ws, last + 1, ['TOTAL', `${rows.length} works`, '', '', '', '', '', { formula: `MAX(H4:H${last})&" max"` }, { formula: `ROUND(AVERAGE(I4:I${last}),1)` }, { formula: `SUBTOTAL(109,J4:J${last})` }, { formula: `SUBTOTAL(109,K4:K${last})` }, { formula: `SUM(L4:L${last})` }, { formula: `SUM(M4:M${last})` }, '', '', '', { formula: `COUNTIF(Q4:Q${last},"Yes")&" stalled"` }, ''], 18);
  [10, 11, 12, 13].forEach(c => ws.getRow(last + 1).getCell(c).numFmt = NUM);
  pageSetupAll(wb); return wb;
}

/* ---- 9. utilisation excel ---- */
async function utilXl(p) {
  const wb = newWb('Utilisation');
  const rows = p.rows;
  const mk = (name, title, keyFn, groupLabel) => {
    const g = A.groupSummary(rows, keyFn);
    const ws = addSheet(wb, name, title, `${p.sub}  •  Utilisation % is a live formula`,
      [groupLabel, 'Works', 'Completed', 'Delayed', 'Budget Provision (₹)', 'AA Amount (₹)', 'Est/TS Amount (₹)', 'Paid (₹)', 'Balance (₹) [auto]', 'Utilisation % [auto]', 'Remarks'],
      [40, 8, 11, 9, 18, 18, 18, 18, 18, 13, 34]);
    g.forEach((x, i) => {
      const r = i + 4, row = ws.getRow(r);
      row.getCell(1).value = x.key; row.getCell(2).value = x.count; row.getCell(3).value = x.completed; row.getCell(4).value = x.delayed;
      row.getCell(5).value = x.budget_provision; row.getCell(6).value = x.aa_amount; row.getCell(7).value = x.est_amount; row.getCell(8).value = x.paid;
      row.getCell(9).value = { formula: `G${r}-H${r}` };
      row.getCell(10).value = { formula: `IFERROR(H${r}/G${r}*100,0)` };
      row.getCell(11).value = { formula: `IF(J${r}>=80,"Satisfactory",IF(J${r}>=50,"Moderate – review","Low utilisation – action required"))` };
      [5, 6, 7, 8, 9].forEach(c => row.getCell(c).numFmt = NUM);
      row.getCell(10).numFmt = PCT;
    });
    const last = g.length + 3;
    bandBody(ws, 4, last, 11);
    totalRow(ws, last + 1, ['GRAND TOTAL', { formula: `SUM(B4:B${last})` }, { formula: `SUM(C4:C${last})` }, { formula: `SUM(D4:D${last})` }, { formula: `SUM(E4:E${last})` }, { formula: `SUM(F4:F${last})` }, { formula: `SUM(G4:G${last})` }, { formula: `SUM(H4:H${last})` }, { formula: `SUM(I4:I${last})` }, { formula: `IFERROR(H${last + 1}/G${last + 1}*100,0)` }, ''], 11);
    [5, 6, 7, 8, 9].forEach(c => ws.getRow(last + 1).getCell(c).numFmt = NUM);
    ws.addConditionalFormatting({ ref: `J4:J${last}`, rules: [{ type: 'dataBar', cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 100 }], color: { argb: 'FF4C86C6' }, priority: 1 }] });
    return ws;
  };
  mk('By Fund Source', 'FUND SOURCE / SCHEME WISE UTILISATION (निधी स्रोत निहाय)', r => r.fund_source || '— Not specified —', 'Fund Source / Scheme');
  mk('By Financial Year', 'FINANCIAL YEAR WISE UTILISATION', r => r.financial_year || r.est_year || '—', 'Financial Year');
  mk('By Taluka', 'TALUKA WISE UTILISATION (तालुका निहाय)', r => r.taluka || '—', 'Taluka');
  mk('By Head of Account', 'HEAD OF ACCOUNT WISE UTILISATION (लेखाशीर्ष निहाय)', r => r.head_of_account || '—', 'Head of Account');
  mk('By Division', 'DIVISION / SUB-DIVISION WISE', r => r.sub_division || r.division || '—', 'Sub-Division');
  pageSetupAll(wb); return wb;
}

/* ---- dispatcher ---- */
const BUILDERS = {
  ledger: ledgerWb, taluka_xl: talukaXl, headwise_xl: headwiseXl, bills_xl: billsXl,
  targets_xl: targetsXl, milestone_xl: milestoneXl, contractor_xl: contractorXl,
  delay_xl: delayXl, util_xl: utilXl,
};

async function buildExcel(type, filters = {}, res) {
  const b = BUILDERS[type];
  if (!b) { const e = new Error('Unknown Excel report type: ' + type); e.status = 400; throw e; }
  const wb = await b(prepare(filters));
  const fname = `${type}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  if (res) {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    await wb.xlsx.write(res); res.end(); return null;
  }
  return await wb.xlsx.writeBuffer();
}

module.exports = { buildExcel, BUILDERS, prepare };
