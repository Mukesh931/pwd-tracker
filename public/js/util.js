/* ==========================================================================
   util.js – formatting, DOM helpers, API client, toasts, modals
   ========================================================================== */
(function (global) {
  'use strict';

  /* ---------------- number / currency ---------------- */
  const round = (x, d = 2) => { const p = Math.pow(10, d); return Math.round((Number(x) || 0) * p) / p; };

  function fmtNum(v, dec = 2) {
    const x = Number(v);
    if (!isFinite(x)) return '—';
    return x.toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }
  function fmtCompact(v) {
    const x = Number(v) || 0, a = Math.abs(x);
    if (a >= 1e7) return '₹' + round(x / 1e7, 2) + ' Cr';
    if (a >= 1e5) return '₹' + round(x / 1e5, 2) + ' L';
    if (a >= 1e3) return '₹' + round(x / 1e3, 1) + ' K';
    return '₹' + round(x, 0);
  }
  const fmtLakh = (v, dec = 2) => fmtNum((Number(v) || 0) / 100000, dec);
  const fmtCr = (v, dec = 2) => fmtNum((Number(v) || 0) / 10000000, dec);

  function amtWords(num) {
    num = Math.abs(Number(num) || 0);
    if (num === 0) return 'Zero Rupees Only';
    const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
      'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const two = (n) => n < 20 ? a[n] : b[Math.floor(n / 10)] + (n % 10 ? ' ' + a[n % 10] : '');
    const three = (n) => (n > 99 ? a[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + two(n % 100) : '') : two(n));
    const intPart = Math.floor(num), frac = Math.round((num - intPart) * 100);
    const units = [[1e7, 'Crore'], [1e5, 'Lakh'], [1e3, 'Thousand']];
    let out = [], rest = intPart;
    units.forEach(([d, name]) => { if (rest >= d) { out.push(three(Math.floor(rest / d)) + ' ' + name); rest = rest % d; } });
    if (rest) out.push(three(rest));
    let s = out.join(' ') + ' Rupees';
    if (frac) s += ' and ' + two(frac) + ' Paise';
    return s + ' Only';
  }

  /* ---------------- dates ---------------- */
  const today = () => new Date().toISOString().slice(0, 10);
  function fmtDate(s) {
    if (!s) return '—';
    const str = String(s).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    const [y, m, d] = str.split('-');
    return `${d}-${m}-${y}`;
  }
  function daysBetween(a, b) {
    if (!a || !b) return null;
    const d1 = new Date(String(a).slice(0, 10)), d2 = new Date(String(b).slice(0, 10));
    if (isNaN(d1) || isNaN(d2)) return null;
    return Math.round((d2 - d1) / 86400000);
  }
  const relDays = (n) => n === null || n === undefined ? '—' : (n < 0 ? `${Math.abs(n)} d ago` : n === 0 ? 'today' : `in ${n} d`);

  /* ---------------- DOM ---------------- */
  function el(tag, attrs = {}, children = []) {
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value') n.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'selected') n[k] = !!v;
      else n.setAttribute(k, v);
    });
    (Array.isArray(children) ? children : [children]).forEach(c => {
      if (c === null || c === undefined || c === false) return;
      n.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
    return n;
  }
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (s) => String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); return n; };

  /* ---------------- toasts ---------------- */
  function toast(msg, kind = '', ms = 3600) {
    const box = $('#toasts'); if (!box) return;
    const t = el('div', { class: 'toast ' + kind, html: msg });
    box.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = '.3s'; setTimeout(() => t.remove(), 320); }, ms);
  }

  /* ---------------- loader ---------------- */
  let loaderN = 0;
  function loading(on, txt) {
    const l = $('#loader'); if (!l) return;
    loaderN += on ? 1 : -1; loaderN = Math.max(0, loaderN);
    if (txt) $('#loaderTxt').textContent = txt;
    l.classList.toggle('hidden', loaderN === 0);
  }

  /* ---------------- modal ---------------- */
  let modalOnClose = null;
  function modal(title, bodyNode, footButtons = [], opts = {}) {
    const m = $('#modal');
    $('#modalTitle').innerHTML = title;
    clear($('#modalBody')).appendChild(bodyNode);
    const foot = clear($('#modalFoot'));
    footButtons.forEach(b => {
      foot.appendChild(el('button', { class: 'btn ' + (b.cls || ''), text: b.label, onclick: () => b.onClick && b.onClick(closeModal) }));
    });
    if (!footButtons.length) foot.appendChild(el('button', { class: 'btn', text: 'Close', onclick: closeModal }));
    m.classList.remove('hidden');
    if (opts.width) $('.modal-card').style.width = opts.width;
    modalOnClose = opts.onClose || null;
    return m;
  }
  function closeModal() { $('#modal').classList.add('hidden'); $('.modal-card').style.width = ''; if (modalOnClose) { const f = modalOnClose; modalOnClose = null; f(); } }
  function confirmBox(title, msg, onYes, yesLabel = 'Yes, proceed', cls = 'red') {
    modal(title, el('div', { html: `<div style="font-size:13.5px;line-height:1.6">${msg}</div>` }), [
      { label: 'Cancel', cls: 'ghost', onClick: closeModal },
      { label: yesLabel, cls, onClick: (c) => { c(); onYes(); } },
    ], { width: 'min(520px,94vw)' });
  }

  /* ---------------- API ---------------- */
  async function api(url, opts = {}) {
    const o = Object.assign({ headers: {} }, opts);
    if (o.body && typeof o.body !== 'string' && !(o.body instanceof FormData)) {
      o.body = JSON.stringify(o.body); o.headers['Content-Type'] = 'application/json';
    }
    const r = await fetch(url, o);
    const ct = r.headers.get('content-type') || '';
    let data = ct.includes('application/json') ? await r.json() : await r.text();
    if (!r.ok) {
      const msg = (data && data.error) || `Request failed (${r.status})`;
      const e = new Error(msg); e.status = r.status; e.data = data; throw e;
    }
    return data;
  }
  const get = (u) => api(u);
  const post = (u, b) => api(u, { method: 'POST', body: b || {} });
  const put = (u, b) => api(u, { method: 'PUT', body: b || {} });
  const del = (u) => api(u, { method: 'DELETE' });

  function download(url, filename) {
    const a = document.createElement('a');
    a.href = url; if (filename) a.download = filename;
    a.target = '_blank'; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
  }
  async function downloadBlob(url, filename, label) {
    loading(true, label || 'Preparing file…');
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('Download failed: ' + r.status);
      const b = await r.blob();
      const u = URL.createObjectURL(b);
      download(u, filename);
      setTimeout(() => URL.revokeObjectURL(u), 20000);
      toast(`✓ ${filename} downloaded`, 'ok');
    } catch (e) { toast('✗ ' + e.message, 'err', 6000); }
    finally { loading(false); }
  }

  /* ---------------- misc ---------------- */
  function debounce(fn, ms = 250) { let t; return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); }; }
  function qs(obj) {
    const p = new URLSearchParams();
    Object.entries(obj || {}).forEach(([k, v]) => { if (v !== '' && v !== null && v !== undefined && v !== 'ALL') p.set(k, v); });
    const s = p.toString(); return s ? '?' + s : '';
  }
  function parseNumInput(v) {
    if (v === '' || v === null || v === undefined) return 0;
    let s = String(v).trim().toLowerCase().replace(/[₹,\s]/g, '');
    let mult = 1;
    if (s.endsWith('cr')) { mult = 1e7; s = s.slice(0, -2); }
    else if (s.endsWith('l') || s.endsWith('lh') || s.endsWith('lakh')) { mult = 1e5; s = s.replace(/(lakh|lh|l)$/, ''); }
    else if (s.endsWith('k')) { mult = 1e3; s = s.slice(0, -1); }
    const n = Number(s);
    return isFinite(n) ? round(n * mult, 2) : 0;
  }
  function csvEscape(v) { const s = String(v === null || v === undefined ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function tableToCsv(headers, rows) {
    return [headers.map(csvEscape).join(',')].concat(rows.map(r => r.map(csvEscape).join(','))).join('\n');
  }
  function saveCsv(filename, csv) {
    const b = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const u = URL.createObjectURL(b); download(u, filename); setTimeout(() => URL.revokeObjectURL(u), 8000);
  }
  function printView(title) {
    const w = window.open('', '_blank');
    if (!w) { window.print(); return; }
    w.document.write(`<html><head><title>${esc(title || 'Report')}</title>
      <link rel="stylesheet" href="css/app.css">
      <style>body{background:#fff}#sidebar,#topbar,#footbar,.filter-bar,.no-print{display:none!important}
      .tbl-wrap{max-height:none;overflow:visible}.card{box-shadow:none}
      @page{size:A4 landscape;margin:9mm}</style></head><body>${$('#view').innerHTML}</body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 700);
  }
  const ragBadge = (r) => `<span class="badge b-${r === 'RED' ? 'red' : r === 'AMBER' ? 'amber' : 'green'}">${esc(r)}</span>`;
  const progressCell = (v, cls) => {
    const p = Math.max(0, Math.min(100, Number(v) || 0));
    const c = cls || (p >= 100 ? 'g' : p >= 50 ? 'a' : 'r');
    return `<div class="pcell"><div class="pbar"><i class="${c}" style="width:${p}%"></i></div><b>${round(p, 1)}%</b></div>`;
  };
  function statusBadge(s) {
    const map = {
      'Completed & Fully Paid': 'b-green', 'Physically Completed': 'b-green', 'Completed – Final Bill Pending': 'b-teal',
      'In Progress': 'b-blue', 'Progress – 50% to 89%': 'b-blue', 'Sanctioned – Tender Stage': 'b-violet',
      'Tender Awarded – WO Pending': 'b-violet', 'Administrative Approval (AA) Awaited': 'b-amber',
      'Technical Sanction (TS) Awaited': 'b-amber', 'Estimate under Preparation': 'b-grey',
      'Stalled / Stopped': 'b-red', 'Administered / Stayed': 'b-red', 'Litigation / Court Case': 'b-red',
      'Cancelled / Dropped': 'b-grey',
    };
    return `<span class="badge ${map[s] || 'b-grey'}">${esc(s || '—')}</span>`;
  }
  function billBadge(s) {
    const good = ['Paid / Disbursed', 'Nil Bill / No Bill Due'];
    const bad = ['Objection Raised', 'Rejected / Returned'];
    const cls = good.includes(s) ? 'b-green' : bad.includes(s) ? 'b-red' : s === 'Not Submitted' ? 'b-grey' : 'b-amber';
    return `<span class="badge ${cls}">${esc(s || '—')}</span>`;
  }

  global.U = {
    round, fmtNum, fmtCompact, fmtLakh, fmtCr, amtWords, today, fmtDate, daysBetween, relDays,
    el, $, $$, esc, clear, toast, loading, modal, closeModal, confirmBox,
    api, get, post, put, del, download, downloadBlob, debounce, qs, parseNumInput,
    csvEscape, tableToCsv, saveCsv, printView, ragBadge, progressCell, statusBadge, billBadge,
  };
})(window);
