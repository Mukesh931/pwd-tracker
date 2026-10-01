/* ==========================================================================
   app.js – PWD Electrical Works Progress Tracker (front-end application)
   ========================================================================== */
(function (global) {
  'use strict';
  const U = global.U, { el, $, $$, esc, clear, toast, loading, modal, closeModal, confirmBox } = U;
  const Ch = global.Charts;

  /* ==================== STATE ==================== */
  const S = {
    meta: null, masters: null, letterhead: null, rules: null, reports: {},
    works: [], grouped: {}, totals: null, dash: null,
    filters: {},
    ledger: { group: 'taluka', page: 1, per: 60, sort: 'taluka', dir: 'asc', sel: new Set(), cols: null },
    route: { view: 'dashboard', param: null },
    form: { data: {}, bills: [], milestones: [], documents: [], errors: [] },
    billFilters: { status: '', onlyUnpaid: 1, taluka: '' },
    msFilters: { flag: 'ALL', taluka: '' },
    history: JSON.parse(localStorage.getItem('rep_history') || '[]'),
    drafts: JSON.parse(localStorage.getItem('form_draft') || '{}'),
  };
  const DEF_COLS = ['sel', 'sno', 'work_name', 'est_number', 'taluka', 'head_of_account', 'aa_amount', 'est_amount',
    'paid', 'balance', 'physical', 'work_status', 'bill_status', 'target', 'delay', 'rag', 'actions'];
  S.ledger.cols = JSON.parse(localStorage.getItem('ledger_cols') || 'null') || DEF_COLS;
  const saveCols = () => localStorage.setItem('ledger_cols', JSON.stringify(S.ledger.cols));

  const arrList = (x) => Array.isArray(x) ? x
    : (typeof x === 'string' && x.trim() ? x.split(/\n+|,+/).map(t => t.trim()).filter(Boolean) : []);
  const M = () => {
    const m = Object.assign({}, S.masters || {});
    Object.keys(m).forEach(k => { m[k] = arrList(m[k]); });
    return m;
  };
  const setFilters = (f) => { S.filters = Object.assign({}, f); };
  const fqs = () => U.qs(S.filters);

  /* ==================== LOGIN ==================== */
  function renderLogin() {
    document.body.classList.add('noauth');
    const host = $('#view') || $('#main');
    host.innerHTML = '';
    const wrap = el('div', { class: 'login-wrap' });
    wrap.innerHTML = `
      <form class="login-card" id="loginForm">
        <div class="login-em">🏛</div>
        <b class="login-t1">सार्वजनिक बांधकाम विभाग (विद्युत) – उपविभाग जळगाव (विभाग धुळे)</b>
        <span class="login-t2">Public Works Department (Electrical), Sub-Division Jalgaon</span>
        <span class="login-t3">Work Progress Tracker — sign in / साइन इन करा</span>
        <label>Username / वापरकर्ता<input id="loginUser" autocomplete="username" required></label>
        <label>Password / पासवर्ड<input id="loginPass" type="password" autocomplete="current-password" required></label>
        <div id="loginErr" class="login-err hidden"></div>
        <button class="btn primary" id="loginBtn" type="submit">Sign in / प्रवेश करा</button>
      </form>`;
    host.appendChild(wrap);
    $('#loginForm').onsubmit = async (e) => {
      e.preventDefault();
      const errEl = $('#loginErr'); errEl.classList.add('hidden');
      $('#loginBtn').disabled = true;
      try {
        const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: $('#loginUser').value, password: $('#loginPass').value }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Login failed');
        document.body.classList.remove('noauth');
        await boot();
      } catch (er) { errEl.textContent = er.message; errEl.classList.remove('hidden'); }
      const btnAgain = $('#loginBtn'); if (btnAgain) btnAgain.disabled = false;
    };
    setTimeout(() => { const u = $('#loginUser'); if (u) u.focus(); }, 60);
  }

  /* ==================== BOOT ==================== */
  async function boot() {
    loading(true, 'Loading application…');
    try {
      const ses = await fetch('/api/session').then(r => (r.ok ? r.json() : null)).catch(() => null);
      if (!ses || !ses.data || !ses.data.user) { loading(false); renderLogin(); return; }
      S.user = ses.data.user; S.defaultPw = ses.data.default_password;
      const meta = await U.get('/api/meta');
      S.meta = meta.data; S.masters = meta.data.masters; S.letterhead = meta.data.letterhead;
      S.rules = meta.data.rules; S.reports = meta.data.reports;
      $('#dbPill').innerHTML = `● <span>${meta.data.counts.works} works • connected</span>`;
      bindGlobal();
      window.addEventListener('hashchange', route);
      if (!location.hash) location.hash = '#/dashboard';
      route();
    } catch (e) {
      loading(false);
      $('#view').innerHTML = `<div class="card"><div class="card-b"><div class="empty">
        <span class="e-i">⚠</span><b>Could not reach the server</b><br><span class="small">${esc(e.message)}</span><br><br>
        <button class="btn primary" onclick="location.reload()">Retry</button></div></div></div>`;
      return;
    }
    loading(false);
    footRight();
  }

  function footRight() {
    const t = S.totals;
    $('#footRight').innerHTML = t
      ? `${t.count} works • Est/TS ₹ ${U.fmtLakh(t.est_amount)} L • Paid ₹ ${U.fmtLakh(t.paid)} L • Balance ₹ ${U.fmtLakh(t.balance)} L`
      : '';
  }

  /* ==================== ROUTER ==================== */
  const VIEWS = {
    dashboard: vDashboard, works: vWorks, work: vWorkDetail, workform: vWorkForm, bills: vBills,
    milestones: vMilestones, alerts: vAlerts, reports: vReports, import: vImport, settings: vSettings,
    logs: vLogs, help: vHelp,
  };
  const TITLES = {
    dashboard: 'Dashboard – Overall Progress', works: 'Works Ledger (तालुका निहाय)', work: 'Work Detail',
    workform: 'Add / Edit Work', bills: 'Bills & Payments', milestones: 'Milestone Tracker',
    alerts: 'Alerts & Reminders', reports: 'Reports – PDF & Excel', import: 'Import Data',
    settings: 'Settings, Masters & Data', logs: 'Audit Log', help: 'Help, Guide & Shortcuts',
  };

  async function route() {
    const h = (location.hash || '#/dashboard').replace(/^#\//, '');
    const [view, param] = h.split('/');
    S.route = { view: view || 'dashboard', param: param ? decodeURIComponent(param) : null };
    $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.view === S.route.view ||
      (S.route.view === 'work' && a.dataset.view === 'works') ||
      (S.route.view === 'workform' && a.dataset.view === 'workform' && S.route.param === 'new')));
    $('#crumb').textContent = TITLES[S.route.view] || 'Dashboard';
    const fn = VIEWS[S.route.view] || vDashboard;
    renderFilterBar();
    try { await fn(S.route.param); }
    catch (e) {
      console.error(e);
      $('#view').innerHTML = `<div class="card"><div class="card-b"><div class="empty"><span class="e-i">⚠</span>
        <b>This screen could not be displayed</b><br><span class="small mono">${esc(e.message)}</span><br><br>
        <button class="btn primary" onclick="location.reload()">Reload page</button>
        <button class="btn" onclick="window.dispatchEvent(new HashChangeEvent('hashchange'))">Retry</button></div></div></div>`;
    }
    $('#view').scrollTop = 0; window.scrollTo(0, 0);
  }
  const go = (h) => { location.hash = h; };
  window.addEventListener('error', (e) => { try { toast('⚠ ' + (e.message || 'Unexpected error – please note what you clicked'), 'err'); } catch (_) {} });
  window.addEventListener('unhandledrejection', (e) => { try { toast('⚠ ' + ((e.reason && e.reason.message) || 'Unexpected error – please note what you clicked'), 'err'); } catch (_) {} });

  /* ==================== FILTER BAR ==================== */
  function renderFilterBar() {
    const bar = $('#filterBar'); clear(bar);
    const needs = ['dashboard', 'works', 'bills', 'milestones', 'alerts', 'reports'].includes(S.route.view);
    if (!needs) { bar.style.display = 'none'; return; }
    bar.style.display = '';
    const m = M();
    const add = (label, key, options, extra = {}) => {
      const sel = el('select', Object.assign({
        onchange: (e) => { S.filters[key] = e.target.value; onFilterChange(); },
      }, extra));
      sel.appendChild(el('option', { value: 'ALL', text: 'All' }));
      (options || []).forEach(o => {
        const v = typeof o === 'string' ? o : o.v;
        sel.appendChild(el('option', { value: v, text: typeof o === 'string' ? o : o.label, selected: String(S.filters[key] || 'ALL') === String(v) }));
      });
      bar.appendChild(el('div', { class: 'fld' }, [el('label', { text: label }), sel]));
    };
    add('Taluka (तालुका)', 'taluka', m.talukas);
    add('Division', 'division', m.divisions);
    add('Sub-Division', 'sub_division', m.sub_divisions);
    add('Head of Account', 'head', (m.headList || []).map(h => ({ v: h.code, label: h.code })));
    add('Nature of Work', 'nature', m.nature);
    add('Fund Source', 'fund', m.funds);
    add('Work Status', 'status', m.work_status);
    add('Bill Status', 'bill_status', m.bill_status);
    add('Priority', 'priority', m.priorities);
    add('RAG', 'rag', ['RED', 'AMBER', 'GREEN']);
    add('Financial Year', 'fy', S.meta.years);
    /* quick chips */
    const chips = el('div', { class: 'btn-row', style: { gap: '5px' } });
    [['Delayed only', 'delayed'], ['Stalled only', 'stalled']].forEach(([lab, k]) => {
      chips.appendChild(el('button', {
        class: 'btn tiny ' + (S.filters[k] === '1' ? 'accent' : 'ghost'), text: lab,
        onclick: () => { S.filters[k] = S.filters[k] === '1' ? '' : '1'; onFilterChange(); },
      }));
    });
    chips.appendChild(el('button', { class: 'btn tiny ghost', text: '✕ Clear filters', onclick: () => { setFilters({}); onFilterChange(); } }));
    bar.appendChild(el('div', { class: 'fld' }, [el('label', { text: 'Quick' }), chips]));
    /* active filter chips */
    const active = Object.entries(S.filters).filter(([k, v]) => v && v !== 'ALL');
    if (active.length) {
      const row = el('div', { style: { width: '100%', display: 'flex', gap: '6px', flexWrap: 'wrap', paddingTop: '2px' } });
      active.forEach(([k, v]) => row.appendChild(el('span', {
        class: 'chip', html: `${esc(k)}: <b>${esc(v)}</b> <button title="remove">×</button>`,
        onclick: (e) => { if (e.target.tagName === 'BUTTON' || true) { delete S.filters[k]; onFilterChange(); } },
      })));
      bar.appendChild(row);
    }
  }

  const onFilterChange = U.debounce(async () => { renderFilterBar(); await route(); }, 120);

  /* ==================== DATA LOADERS ==================== */
  async function loadWorks() {
    const r = await U.get('/api/works' + fqs() + (fqs() ? '&' : '?') + U.qs({ sort: S.ledger.sort, dir: S.ledger.dir }));
    S.works = r.data.works; S.grouped = r.data.grouped; S.totals = r.data.totals;
    $('#navCount').textContent = S.totals.count;
    $('#navBills').textContent = S.totals.unpaid_bills;
    footRight();
    return r.data;
  }
  async function loadDash() {
    const r = await U.get('/api/dashboard' + fqs());
    S.dash = r.data.dashboard; S.totals = r.data.totals;
    $('#navAlerts').textContent = S.dash.alerts.counts.total;
    return r.data;
  }
  async function refreshMeta() {
    const meta = await U.get('/api/meta');
    S.meta = meta.data; S.masters = meta.data.masters; S.letterhead = meta.data.letterhead;
    S.rules = meta.data.rules; S.reports = meta.data.reports;
    $('#dbPill').innerHTML = `● <span>${meta.data.counts.works} works • connected</span>`;
  }

  /* ==================== VIEW: DASHBOARD ==================== */
  async function vDashboard() {
    const v = clear($('#view'));
    loading(true, 'Building dashboard…');
    const [{ dashboard: d }] = await Promise.all([loadDash(), loadWorks()]);
    loading(false);
    const t = S.totals;

    /* KPI row */
    const kpis = [
      { l: 'Total Works', v: t.count, s: `${t.ongoing} ongoing • ${t.completed} completed • ${t.not_started} not started`, c: '' },
      { l: 'Est / TS Amount', v: '₹ ' + U.fmtLakh(t.est_amount), s: `Lakh • AA ₹ ${U.fmtLakh(t.aa_amount)} L`, c: 'k-teal' },
      { l: 'Amount Paid', v: '₹ ' + U.fmtLakh(t.paid), s: `Lakh • Utilisation ${t.avg_financial}%`, c: 'k-green' },
      { l: 'Balance Amount', v: '₹ ' + U.fmtLakh(t.balance), s: `Lakh • Pending bills ₹ ${U.fmtLakh(t.bills_pending_amount)} L`, c: 'k-amber' },
      { l: 'Avg. Physical Progress', v: t.avg_physical + '%', s: `${d.rag.GREEN} green • ${d.rag.AMBER} amber • ${d.rag.RED} red`, c: 'k-violet' },
      { l: 'Delayed / Stalled', v: `${t.delayed} / ${t.stalled}`, s: `${t.unpaid_bills} unpaid bills pending`, c: 'k-red' },
    ];
    const kg = el('div', { class: 'grid g6', style: { marginBottom: '13px' } });
    kpis.forEach(k => kg.appendChild(el('div', { class: 'kpi ' + k.c, html: `<div class="k-l">${esc(k.l)}</div><div class="k-v">${esc(String(k.v))}</div><div class="k-s">${esc(k.s)}</div>` })));
    v.appendChild(kg);

    /* row: gauges + S-curve */
    const r1 = el('div', { class: 'grid', style: { gridTemplateColumns: '340px 1fr', marginBottom: '13px' } });
    r1.appendChild(card('Physical vs Financial Progress', 'average of selected works', `
      <div style="display:flex;gap:6px;justify-content:space-around">
        ${Ch.gauge(t.avg_physical, { label: 'PHYSICAL' })}
        ${Ch.gauge(t.avg_financial, { label: 'FINANCIAL' })}
      </div>
      <div class="stat-line"><span>Works physically completed</span><b>${t.completed} / ${t.count}</b></div>
      <div class="stat-line"><span>Works in progress</span><b>${t.ongoing}</b></div>
      <div class="stat-line"><span>Works not started</span><b>${t.not_started}</b></div>
      <div class="stat-line"><span>Utilisation (paid ÷ estimate)</span><b>${t.avg_financial}%</b></div>`));
    r1.appendChild(card('Financial S-Curve – Cumulative Expenditure', 'month-wise payments from bill register',
      Ch.line([{
        label: 'Cumulative paid (₹ Lakh)', color: '#2b608f', area: true,
        points: d.scurve.map(p => ({ x: p.label, y: U.round(p.cumulative / 100000, 2) })),
      }, {
        label: 'Monthly paid (₹ Lakh)', color: '#b3541e', dash: true,
        points: d.scurve.map(p => ({ x: p.label, y: U.round(p.value / 100000, 2) })),
      }], { yFmt: (x) => U.fmtNum(x, 1) }) + `<div class="stat-line" style="margin-top:8px"><span>Total disbursed in period</span><b>₹ ${U.fmtLakh(d.scurve.reduce((a, b) => a + b.value, 0))} L</b></div>`));
    v.appendChild(r1);

    /* row: RAG donut + status donut + bill status */
    const r2 = el('div', { class: 'grid g3', style: { marginBottom: '13px' } });
    r2.appendChild(card('RAG Health Indicator', 'auto-computed risk rating',
      Ch.donut([{ label: 'GREEN – on track', value: d.rag.GREEN, color: '#1b6b34' },
        { label: 'AMBER – at risk', value: d.rag.AMBER, color: '#f2b134' },
        { label: 'RED – critical', value: d.rag.RED, color: '#b3261e' }], { centreLabel: 'WORKS', centreValue: t.count })));
    r2.appendChild(card('Work Status Distribution', 'life-cycle stage',
      Ch.donut(d.stage.map((s, i) => ({ label: s.label, value: s.count, color: Ch.PAL[i % Ch.PAL.length] })), { centreLabel: 'STAGES', centreValue: d.stage.length })));
    r2.appendChild(card('Bill Status Position', 'count of works per bill status',
      Ch.donut(d.billStatus.map((s, i) => ({ label: s.label, value: s.count, color: Ch.PAL[(i + 3) % Ch.PAL.length] })), { centreLabel: 'BILL STATES', centreValue: d.billStatus.length }) +
      `<div class="stat-line"><span>Amount stuck in pending bills</span><b>₹ ${U.fmtLakh(t.bills_pending_amount)} L</b></div>`));
    v.appendChild(r2);

    /* row: taluka analysis */
    const r3 = el('div', { class: 'grid g2', style: { marginBottom: '13px' } });
    r3.appendChild(card('Taluka-wise Analysis', 'sanctioned ₹ Lakh • stacked by completion stage',
      Ch.hbar(d.taluka.map(x => ({
        label: x.key, amount: x.est_amount,
        parts: [
          { label: 'Completed', value: x.completed, color: '#1b6b34' },
          { label: 'Ongoing', value: x.ongoing, color: '#2b608f' },
          { label: 'Not started', value: x.not_started, color: '#c8d3de' },
          { label: 'Delayed/Stalled', value: x.delayed + x.stalled, color: '#b3261e' },
        ],
      })), { legendParts: [{ label: 'Completed', color: '#1b6b34' }, { label: 'Ongoing', color: '#2b608f' }, { label: 'Not started', color: '#c8d3de' }, { label: 'Delayed/Stalled', color: '#b3261e' }], fmt: (r, tot) => tot + ' works' })));
    r3.appendChild(card('Taluka-wise Amount (₹ Lakh)', 'sanctioned vs paid vs balance',
      Ch.hbar(d.taluka.slice().sort((a, b) => b.est_amount - a.est_amount).map(x => ({
        label: x.key,
        parts: [{ label: 'Paid', value: U.round(x.paid / 1e5, 2), color: '#1b6b34' }, { label: 'Balance', value: U.round(x.balance / 1e5, 2), color: '#f2b134' }],
      })), { legendParts: [{ label: 'Paid', color: '#1b6b34' }, { label: 'Balance', color: '#f2b134' }], fmt: (r, tot) => '₹' + U.fmtNum(tot, 1) + 'L' })));
    v.appendChild(r3);

    /* row: head of account + nature */
    const r4 = el('div', { class: 'grid g2', style: { marginBottom: '13px' } });
    r4.appendChild(card('Head of Account (मुख्य लेखाशीर्ष)', 'works & sanctioned amount per head', tblFromGroups(d.head.slice(0, 14), 'Head of Account', true)));
    r4.appendChild(card('Nature of Work', 'category-wise position', tblFromGroups(d.nature.slice(0, 14), 'Nature of Work', false)));
    v.appendChild(r4);

    /* row: heat matrix */
    v.appendChild(card('Taluka × Status Heat Matrix', 'number of works — darker = more works',
      heatMatrix(d.taluka.map(x => x.key), d.stage.map(s => s.label))));

    /* row: alerts summary + top lists */
    const r5 = el('div', { class: 'grid g2' });
    const al = d.alerts.counts;
    r5.appendChild(card('Alerts & Reminders', 'auto-generated from tracking rules', `
      <div class="grid g2" style="gap:8px">
        ${alertTile('Overdue target', al.overdue_target, 'red')}
        ${alertTile('Bill pending > 60 days', al.bill_overdue, 'red')}
        ${alertTile('Stalled / stayed works', al.stalled, 'red')}
        ${alertTile('Overdue milestones', al.milestone_overdue, 'amber')}
        ${alertTile('Milestones due ≤ 45 days', al.milestone_due, 'amber')}
        ${alertTile('Target within 30 days', al.target_soon, 'blue')}
        ${alertTile('Final bill pending', al.final_bill_pending, 'amber')}
        ${alertTile('Data gaps to fill', al.data_gaps, 'blue')}
      </div>
      <div class="btn-row" style="margin-top:10px">
        <button class="btn primary sm" onclick="location.hash='#/alerts'">Open Alerts Centre →</button>
        <button class="btn sm" onclick="APP.exportPdf('delays')">⤓ Delayed Works PDF</button>
      </div>`, null, { bodyClass: '' }));

    const top = S.works.slice().sort((a, b) => b.effective_amount - a.effective_amount).slice(0, 12);
    const tb = el('table', { class: 'tbl' });
    tb.innerHTML = `<thead><tr><th>Work (highest value)</th><th>Taluka</th><th class="num">Est/TS ₹</th><th>Phy.</th><th>Status</th></tr></thead>`;
    const tbody = el('tbody');
    top.forEach(w => tbody.appendChild(el('tr', {
      html: `<td><span class="wname" data-go="#/work/${w.id}">${esc(w.work_name)}</span><div class="wsub">${esc(w.est_number || '')} • ${esc(w.head_of_account || '')}</div></td>
        <td>${esc(w.taluka)}</td><td class="num">${U.fmtNum(w.effective_amount)}</td>
        <td>${U.progressCell(w.physical_progress)}</td><td>${U.statusBadge(w.work_status)}</td>`,
    })));
    tb.appendChild(tbody);
    r5.appendChild(card('Top 12 Works by Value', 'click a work to open its dossier', '', tb));
    v.appendChild(r5);

    /* quick summary table of talukas */
    v.appendChild(card('Taluka Summary Table', 'sortable — click any row to open the filtered ledger', '', talukaTable(d.taluka)));
    bindGo(v);
  }

  function alertTile(label, count, kind) {
    return `<div class="kpi k-${kind}" style="padding:8px 10px;box-shadow:none"><div class="k-l">${esc(label)}</div><div class="k-v" style="font-size:17px">${count || 0}</div></div>`;
  }
  function card(title, sub, bodyHtml, bodyNode, opts = {}) {
    const c = el('div', { class: 'card' });
    c.appendChild(el('div', { class: 'card-h', html: `<b>${esc(title)}</b><span class="sub">${esc(sub || '')}</span><span class="grow"></span>${opts.headExtra || ''}` }));
    const b = el('div', { class: 'card-b' + (opts.bodyClass === '' ? '' : '') });
    if (bodyNode) b.appendChild(bodyNode); else if (bodyHtml) b.innerHTML = bodyHtml;
    c.appendChild(b);
    if (opts.foot) c.appendChild(el('div', { class: 'pager', html: opts.foot }));
    return c;
  }
  function tblFromGroups(groups, label, withAmount) {
    if (!groups.length) return `<div class="empty small">No data</div>`;
    let h = `<table class="tbl"><thead><tr><th>${esc(label)}</th><th class="num">Works</th>
      ${withAmount ? '<th class="num">Est ₹ L</th>' : ''}<th class="num">Paid ₹ L</th><th class="num">Bal ₹ L</th><th class="num">Util %</th></tr></thead><tbody>`;
    groups.forEach(g => {
      h += `<tr><td title="${esc(g.label)}">${esc(g.label)}</td><td class="num">${g.count}</td>
        ${withAmount ? `<td class="num">${U.fmtLakh(g.est_amount)}</td>` : ''}
        <td class="num">${U.fmtLakh(g.paid)}</td><td class="num">${U.fmtLakh(g.balance)}</td>
        <td class="num" style="color:${g.avg_financial >= 80 ? 'var(--green)' : g.avg_financial >= 50 ? 'var(--amber)' : 'var(--red)'}">${g.avg_financial}%</td></tr>`;
    });
    return h + '</tbody></table>';
  }
  function heatMatrix(talukas, statuses) {
    const map = {};
    S.works.forEach(w => { map[w.taluka + '|' + w.work_status] = (map[w.taluka + '|' + w.work_status] || 0) + 1; });
    const used = statuses.filter(s => S.works.some(w => w.work_status === s));
    return Ch.heat(talukas, used, (r, c) => map[r + '|' + c] || 0);
  }
  function talukaTable(tal) {
    const wrap = el('div', { class: 'tbl-wrap', style: { maxHeight: '420px' } });
    const tb = el('table', { class: 'tbl' });
    tb.innerHTML = `<thead><tr><th>#</th><th>Taluka (तालुका)</th><th class="num">Works</th><th class="num">Completed</th>
      <th class="num">Ongoing</th><th class="num">Not started</th><th class="num">Delayed</th><th class="num">AA ₹ L</th>
      <th class="num">Est/TS ₹ L</th><th class="num">Paid ₹ L</th><th class="num">Balance ₹ L</th><th class="num">Bills Pend ₹ L</th>
      <th class="num">Phy %</th><th class="num">Util %</th><th></th></tr></thead>`;
    const body = el('tbody');
    tal.forEach((g, i) => {
      body.appendChild(el('tr', {
        html: `<td class="ctr">${i + 1}</td><td><b>${esc(g.key)}</b></td><td class="num">${g.count}</td>
          <td class="num">${g.completed}</td><td class="num">${g.ongoing}</td><td class="num">${g.not_started}</td>
          <td class="num" style="color:${g.delayed ? 'var(--red)' : ''}">${g.delayed}</td>
          <td class="num">${U.fmtLakh(g.aa_amount)}</td><td class="num">${U.fmtLakh(g.est_amount)}</td>
          <td class="num" style="color:var(--green)">${U.fmtLakh(g.paid)}</td><td class="num" style="color:var(--accent)">${U.fmtLakh(g.balance)}</td>
          <td class="num">${U.fmtLakh(g.bills_pending_amount)}</td>
          <td class="num">${U.round(g.avg_physical, 1)}</td><td class="num">${g.avg_financial}</td>
          <td class="ctr"><button class="btn tiny ghost" data-taluka="${esc(g.key)}">Open →</button></td>`,
      }));
    });
    tb.appendChild(body);
    const T = S.totals;
    tb.appendChild(el('tfoot', {
      html: `<tr><td></td><td>GRAND TOTAL</td><td class="num">${T.count}</td><td class="num">${T.completed}</td>
        <td class="num">${T.ongoing}</td><td class="num">${T.not_started}</td><td class="num">${T.delayed}</td>
        <td class="num">${U.fmtLakh(T.aa_amount)}</td><td class="num">${U.fmtLakh(T.est_amount)}</td>
        <td class="num">${U.fmtLakh(T.paid)}</td><td class="num">${U.fmtLakh(T.balance)}</td>
        <td class="num">${U.fmtLakh(T.bills_pending_amount)}</td><td class="num">${U.round(T.avg_physical, 1)}</td><td class="num">${T.avg_financial}</td><td></td></tr>`,
    }));
    wrap.appendChild(tb);
    setTimeout(() => $$('[data-taluka]', wrap).forEach(b => b.onclick = () => { S.filters.taluka = b.dataset.taluka; go('#/works'); onFilterChange(); }), 0);
    return wrap;
  }
  function bindGo(root) {
    $$('[data-go]', root || document).forEach(n => n.addEventListener('click', (e) => { e.preventDefault(); go(n.dataset.go); }));
  }

  /* ==================== VIEW: WORKS LEDGER ==================== */
  const COLS = {
    sel: { h: '', w: 30, cls: 'ctr' },
    sno: { h: 'Sr.', w: 40, cls: 'ctr' },
    id: { h: 'ID', w: 44, cls: 'ctr' },
    work_name: { h: 'Work Name / Est No', w: 300, sort: 'name' },
    est_number: { h: 'Est. No.', w: 130, sort: 'name' },
    taluka: { h: 'Taluka', w: 100, sort: 'taluka' },
    village: { h: 'Village', w: 110 },
    sub_division: { h: 'Sub-Division', w: 180 },
    section: { h: 'Section', w: 150 },
    head_of_account: { h: 'Head of Account', w: 120, sort: 'head' },
    head_desc: { h: 'Head Description', w: 240 },
    nature_of_work: { h: 'Nature of Work', w: 170 },
    fund_source: { h: 'Fund Source', w: 150 },
    aa_number: { h: 'AA No.', w: 130 },
    aa_date: { h: 'AA Date', w: 90, cls: 'ctr' },
    aa_amount: { h: 'AA Amount ₹', w: 110, cls: 'num', sort: 'amount' },
    ts_number: { h: 'TS No.', w: 120 },
    ts_date: { h: 'TS Date', w: 90, cls: 'ctr' },
    est_amount: { h: 'Est (TS) Amount ₹', w: 120, cls: 'num', sort: 'amount' },
    revised_est_amount: { h: 'Revised Est ₹', w: 110, cls: 'num' },
    budget_provision: { h: 'Budget Prov. ₹', w: 110, cls: 'num' },
    contractor_name: { h: 'Contractor', w: 190, sort: 'contractor' },
    wo_number: { h: 'W.O. No.', w: 130 },
    wo_date: { h: 'W.O. Date', w: 90, cls: 'ctr' },
    wo_amount: { h: 'W.O. Amount ₹', w: 110, cls: 'num' },
    target: { h: 'Target Date', w: 96, cls: 'ctr', sort: 'target' },
    days_left: { h: 'Days Left', w: 78, cls: 'ctr' },
    physical: { h: 'Physical Progress', w: 150, sort: 'amount' },
    financial: { h: 'Financial %', w: 82, cls: 'num' },
    paid: { h: 'Paid ₹', w: 110, cls: 'num', sort: 'paid' },
    balance: { h: 'Balance ₹', w: 110, cls: 'num' },
    work_status: { h: 'Work Status', w: 170, sort: 'status' },
    bill_status: { h: 'Bill Status', w: 160 },
    bills_pending: { h: 'Bills Pending ₹', w: 110, cls: 'num' },
    bill_age: { h: 'Bill Ageing', w: 84, cls: 'ctr' },
    delay: { h: 'Delay (days)', w: 84, cls: 'ctr', sort: 'delay' },
    utility: { h: 'Utility Conn.', w: 130 },
    quality: { h: 'Quality Insp.', w: 150 },
    mb: { h: 'MB', w: 90 },
    sd: { h: 'SD', w: 90 },
    rag: { h: 'RAG', w: 62, cls: 'ctr' },
    priority: { h: 'Priority', w: 76, cls: 'ctr' },
    remarks: { h: 'Remarks', w: 200 },
    actions: { h: 'Actions', w: 132, cls: 'ctr' },
  };

  function cellHtml(w, key, i) {
    switch (key) {
      case 'sel': return `<input type="checkbox" class="rowSel" data-id="${w.id}" ${S.ledger.sel.has(w.id) ? 'checked' : ''}>`;
      case 'sno': return String(i + 1);
      case 'id': return String(w.id);
      case 'work_name': return `<span class="wname" data-go="#/work/${w.id}">${esc(w.work_name)}</span>
        <div class="wsub">${esc(w.est_number || '')}${w.contractor_name ? ' • ' + esc(w.contractor_name) : ''}${w.village ? ' • ' + esc(w.village) : ''}</div>`;
      case 'est_number': return esc(w.est_number || '—');
      case 'taluka': return esc(w.taluka || '—');
      case 'village': return esc(w.village || '—');
      case 'sub_division': case 'section': return esc(w[key] || '—');
      case 'head_of_account': return `<span title="${esc(w.head_desc || '')}">${esc(w.head_of_account || '—')}</span>`;
      case 'head_desc': return esc(w.head_desc || '—');
      case 'nature_of_work': case 'fund_source': return esc(w[key] || '—');
      case 'aa_number': return esc(w.aa_number || '—');
      case 'ts_number': return esc(w.ts_number || '—');
      case 'wo_number': return esc(w.wo_number || '—');
      case 'contractor_name': return esc(w.contractor_name || '—');
      case 'aa_date': case 'ts_date': case 'wo_date': return U.fmtDate(w[key]);
      case 'aa_amount': return U.fmtNum(w.aa_amount);
      case 'est_amount': return U.fmtNum(w.est_amount);
      case 'revised_est_amount': return w.revised_est_amount ? U.fmtNum(w.revised_est_amount) : '—';
      case 'budget_provision': return U.fmtNum(w.budget_provision);
      case 'wo_amount': return w.wo_amount ? U.fmtNum(w.wo_amount) : '—';
      case 'target': return `<span title="Extended: ${U.fmtDate(w.extended_target_date)}">${U.fmtDate(w.effective_target)}</span>`;
      case 'days_left': return w.days_to_target === null ? '—' : `<b style="color:${w.days_to_target < 0 ? 'var(--red)' : w.days_to_target < 30 ? 'var(--amber)' : 'var(--green)'}">${U.relDays(w.days_to_target)}</b>`;
      case 'physical': return `<input type="number" class="inline-edit ie-phys" data-id="${w.id}" min="0" max="100" step="1" value="${U.round(w.physical_progress, 1)}" title="Type a new % and press Enter to save">`;
      case 'financial': return U.round(w.financial_progress, 1) + '%';
      case 'paid': return U.fmtNum(w.amount_paid);
      case 'balance': return `<b style="color:var(--accent)">${U.fmtNum(w.balance_amount)}</b>`;
      case 'work_status': return `<select class="inline-sel ie-status" data-id="${w.id}" title="Change and it saves instantly">${(M().work_status || []).map(s => `<option ${s === w.work_status ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>`;
      case 'bill_status': return `<select class="inline-sel ie-bill" data-id="${w.id}">${(M().bill_status || []).map(s => `<option ${s === w.bill_status_auto ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
        ${w.bill_pending_days > 30 ? `<div class="wsub" style="color:var(--red)">${w.bill_pending_days} d pending</div>` : ''}`;
      case 'bills_pending': return w.bills_pending_amount ? U.fmtNum(w.bills_pending_amount) : '—';
      case 'bill_age': return w.bill_pending_days ? `<span class="badge ${w.bill_pending_days > 60 ? 'b-red' : 'b-amber'}">${w.bill_pending_days} d</span>` : '—';
      case 'delay': return w.is_delayed ? `<span class="badge b-red">${w.delay_days} d</span>` : '<span class="badge b-green">On time</span>';
      case 'utility': return esc(w.utility_connection || '—');
      case 'quality': return esc(w.quality_inspection || '—');
      case 'mb': return esc(w.mb_status || '—');
      case 'sd': return esc(w.sd_status || '—');
      case 'rag': return `<span title="${esc(w.rag_reasons)}">${U.ragBadge(w.rag)}</span>`;
      case 'priority': return `<span class="badge ${w.priority === 'High' ? 'b-red' : w.priority === 'Medium' ? 'b-amber' : 'b-grey'}">${esc(w.priority || '—')}</span>`;
      case 'remarks': return esc(w.remarks || '');
      case 'actions': return `<div class="btn-row" style="gap:3px;justify-content:center">
          <button class="btn tiny ghost" data-act="open" data-id="${w.id}" title="Open dossier">▸</button>
          <button class="btn tiny ghost" data-act="edit" data-id="${w.id}" title="Edit">✎</button>
          <button class="btn tiny ghost" data-act="pdf" data-id="${w.id}" title="Download this work's PDF dossier">⤓</button>
          <button class="btn tiny ghost" data-act="del" data-id="${w.id}" title="Move to recycle bin">🗑</button></div>`;
      default: return esc(w[key]);
    }
  }

  function ledgerRows() {
    const L = S.ledger;
    let rows = S.works;
    if (L.group === 'none') return [{ type: 'rows', rows }];
    const out = [];
    const groups = {};
    rows.forEach(w => { const k = w[L.group] || '— Not specified —'; (groups[k] = groups[k] || []).push(w); });
    Object.keys(groups).sort((a, b) => L.group === 'amount' ? 0 : a.localeCompare(b)).forEach(k => {
      const list = groups[k];
      out.push({ type: 'group', key: k, rows: list, totals: aggTotals(list) });
      out.push({ type: 'rows', rows: list });
    });
    return out;
  }
  function aggTotals(list) {
    const s = (f) => list.reduce((a, b) => a + (Number(f(b)) || 0), 0);
    return { count: list.length, aa: s(w => w.aa_amount), est: s(w => w.est_amount), paid: s(w => w.amount_paid), bal: s(w => w.balance_amount), bp: s(w => w.bills_pending_amount), phy: list.length ? U.round(s(w => w.physical_progress) / list.length, 1) : 0 };
  }

  async function vWorks() {
    const v = clear($('#view'));
    loading(true, 'Loading works…');
    await loadWorks();
    loading(false);
    const L = S.ledger, T = S.totals;

    /* toolbar */
    const tb = el('div', { class: 'card' });
    tb.appendChild(el('div', { class: 'card-h', html: `<b>Works Ledger</b>
      <span class="sub">${T.count} works matching current filters • grouped by <b>${esc(L.group)}</b> • inline editing enabled for Physical %, Work Status &amp; Bill Status</span>
      <span class="grow"></span>` }));
    const bar = el('div', { class: 'card-b', style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' } });
    const grpSel = el('select', { class: 'inline-sel', style: { maxWidth: '190px' }, onchange: (e) => { L.group = e.target.value; vWorks(); } },
      [['taluka', 'Taluka (तालुका)'], ['sub_division', 'Sub-Division'], ['division', 'Division'], ['section', 'Section'],
        ['head_of_account', 'Head of Account'], ['work_status', 'Work Status'], ['bill_status_auto', 'Bill Status'],
        ['contractor_name', 'Contractor'], ['nature_of_work', 'Nature of Work'], ['none', 'No grouping (flat list)']]
        .map(([vv, lab]) => el('option', { value: vv, text: 'Group by: ' + lab, selected: L.group === vv })));
    bar.appendChild(el('div', { class: 'fld' }, [el('label', { text: 'Arrangement' }), grpSel]));

    const colBtn = el('button', { class: 'btn sm', text: '⚏ Columns', onclick: openColumnPicker });
    const exp = el('div', { class: 'btn-row' }, [
      el('button', { class: 'btn sm primary', text: '⤓ PDF Statement', onclick: () => exportPdf('progress') }),
      el('button', { class: 'btn sm green', text: '⤓ Excel Workbook', onclick: () => exportXlsx('ledger') }),
      el('button', { class: 'btn sm', text: '⤓ CSV', onclick: exportCsv }),
      el('button', { class: 'btn sm', text: '⎙ Print', onclick: () => U.printView('Works Ledger') }),
      el('button', { class: 'btn sm', text: '⤓ Taluka PDF', onclick: () => exportPdf('taluka_sum') }),
      el('button', { class: 'btn sm', text: '⤓ Taluka Excel', onclick: () => exportXlsx('taluka_xl') }),
    ]);
    bar.appendChild(colBtn); bar.appendChild(el('div', { class: 'grow' })); bar.appendChild(exp);
    tb.appendChild(bar);

    /* bulk action bar */
    const bulk = el('div', { class: 'card-b', id: 'bulkBar', style: { display: 'none', gap: '8px', flexWrap: 'wrap', alignItems: 'center', borderTop: '1px solid var(--line)', background: 'var(--amber-bg)' } });
    bulk.appendChild(el('b', { class: 'small', id: 'bulkCount', text: '0 selected' }));
    const bs = (M().work_status || []);
    bulk.appendChild(el('select', { class: 'inline-sel', id: 'bulkStatus' }, bs.map(s => el('option', { value: s, text: s }))));
    bulk.appendChild(el('button', { class: 'btn sm', text: 'Apply work status', onclick: () => bulkAction('status') }));
    const bb = (M().bill_status || []);
    bulk.appendChild(el('select', { class: 'inline-sel', id: 'bulkBill' }, bb.map(s => el('option', { value: s, text: s }))));
    bulk.appendChild(el('button', { class: 'btn sm', text: 'Apply bill status', onclick: () => bulkAction('bill_status') }));
    bulk.appendChild(el('input', { type: 'date', class: 'inline-sel', id: 'bulkTarget', title: 'Extended target date' }));
    bulk.appendChild(el('button', { class: 'btn sm', text: 'Set extended target', onclick: () => bulkAction('target') }));
    bulk.appendChild(el('button', { class: 'btn sm', text: '＋ Add checklists', onclick: () => bulkAction('checklist'), title: 'Add standard milestone + document checklist' }));
    bulk.appendChild(el('button', { class: 'btn sm red', text: '🗑 Delete selected', onclick: () => bulkAction('delete') }));
    bulk.appendChild(el('div', { class: 'grow' }));
    bulk.appendChild(el('button', { class: 'btn sm ghost', text: 'Clear selection', onclick: () => { L.sel.clear(); vWorks(); } }));
    tb.appendChild(bulk);
    v.appendChild(tb);

    /* table */
    const cols = L.cols.filter(c => COLS[c]);
    const wrap = el('div', { class: 'tbl-wrap', style: { maxHeight: 'calc(100vh - 330px)' } });
    const tbl = el('table', { class: 'tbl', id: 'ledgerTbl' });
    const thead = el('thead');
    const hr = el('tr');
    cols.forEach(c => {
      const cd = COLS[c];
      const th = el('th', { class: cd.cls || '', style: { minWidth: cd.w + 'px' }, html: esc(cd.h) + (cd.sort ? '<span class="sortind">↕</span>' : '') });
      if (cd.sort) th.onclick = () => { L.dir = L.sort === cd.sort && L.dir === 'asc' ? 'desc' : 'asc'; L.sort = cd.sort; vWorks(); };
      if (c === 'sel') th.innerHTML = `<input type="checkbox" id="selAll" title="Select all on this page">`;
      hr.appendChild(th);
    });
    thead.appendChild(hr); tbl.appendChild(thead);
    const tbody = el('tbody');
    let sr = 0;
    ledgerRows().forEach(seg => {
      if (seg.type === 'group') {
        const gtr = el('tr', { class: 'grp-row' });
        let cells = `<td colspan="${cols.indexOf('work_name') >= 0 ? 2 : 1}"></td>`;
        const gt = seg.totals;
        cols.forEach((c, i) => {
          if (i === 0) { gtr.appendChild(el('td', { html: `<b>▾ ${esc(seg.key)}</b><span class="grp-meta">${gt.count} works</span>` })); return; }
          let val = '';
          if (c === 'aa_amount') val = U.fmtNum(gt.aa);
          else if (c === 'est_amount') val = U.fmtNum(gt.est);
          else if (c === 'paid') val = U.fmtNum(gt.paid);
          else if (c === 'balance') val = U.fmtNum(gt.bal);
          else if (c === 'bills_pending') val = U.fmtNum(gt.bp);
          else if (c === 'physical') val = gt.phy + '%';
          gtr.appendChild(el('td', { class: COLS[c].cls || '', html: val }));
        });
        tbody.appendChild(gtr);
      } else {
        seg.rows.forEach(w => {
          const tr = el('tr', { class: S.ledger.sel.has(w.id) ? 'sel' : '', dataset: { id: w.id } });
          cols.forEach(c => tr.appendChild(el('td', { class: COLS[c].cls || '', html: cellHtml(w, c, sr++) })));
          tbody.appendChild(tr);
        });
      }
    });
    tbl.appendChild(tbody);
    /* footer totals */
    const tfoot = el('tfoot'); const ftr = el('tr');
    cols.forEach((c, i) => {
      let val = '';
      if (i === 0) val = `GRAND TOTAL (${T.count})`;
      else if (c === 'aa_amount') val = U.fmtNum(T.aa_amount);
      else if (c === 'est_amount') val = U.fmtNum(T.est_amount);
      else if (c === 'paid') val = U.fmtNum(T.paid);
      else if (c === 'balance') val = U.fmtNum(T.balance);
      else if (c === 'bills_pending') val = U.fmtNum(T.bills_pending_amount);
      else if (c === 'physical') val = U.round(T.avg_physical, 1) + '%';
      else if (c === 'financial') val = T.avg_financial + '%';
      else if (c === 'delay') val = T.delayed + ' delayed';
      ftr.appendChild(el('td', { class: COLS[c].cls || '', html: val }));
    });
    tfoot.appendChild(ftr); tbl.appendChild(tfoot);
    wrap.appendChild(tbl);
    const tcard = el('div', { class: 'card' }); tcard.appendChild(wrap);
    /* pager */
    tcard.appendChild(el('div', { class: 'pager', html: `<span>Showing ${T.count} works</span><span class="grow"></span>
      <span class="small muted">Inline edit: Physical %, Work Status, Bill Status save instantly • Ctrl+F opens browser find</span>` }));
    v.appendChild(tcard);

    /* events */
    setTimeout(() => {
      const sa = $('#selAll');
      if (sa) sa.onchange = (e) => {
        $$('.rowSel', tbl).forEach(cb => { cb.checked = e.target.checked; const id = Number(cb.dataset.id); e.target.checked ? L.sel.add(id) : L.sel.delete(id); cb.closest('tr').classList.toggle('sel', e.target.checked); });
        updateBulk();
      };
      $$('.rowSel', tbl).forEach(cb => cb.onchange = (e) => {
        const id = Number(cb.dataset.id);
        e.target.checked ? L.sel.add(id) : L.sel.delete(id);
        cb.closest('tr').classList.toggle('sel', e.target.checked); updateBulk();
      });
      $$('.ie-phys', tbl).forEach(inp => inp.addEventListener('change', async (e) => {
        const id = inp.dataset.id, val = U.round(Math.max(0, Math.min(100, Number(inp.value) || 0)), 1);
        try {
          await U.post(`/api/works/${id}/quick`, { physical_progress: val });
          toast(`✓ Physical progress of work #${id} set to ${val}%`, 'ok'); await loadWorks(); renderTableOnly();
        } catch (err) { toast('✗ ' + err.message, 'err'); }
      }));
      $$('.ie-status', tbl).forEach(sel2 => sel2.addEventListener('change', async () => {
        try { await U.post(`/api/works/${sel2.dataset.id}/quick`, { work_status: sel2.value }); toast('✓ Work status updated', 'ok'); await loadWorks(); renderTableOnly(); }
        catch (e) { toast('✗ ' + e.message, 'err'); }
      }));
      $$('.ie-bill', tbl).forEach(sel2 => sel2.addEventListener('change', async () => {
        try { await U.post(`/api/works/${sel2.dataset.id}/quick`, { bill_status: sel2.value }); toast('✓ Bill status updated', 'ok'); await loadWorks(); renderTableOnly(); }
        catch (e) { toast('✗ ' + e.message, 'err'); }
      }));
      $$('[data-act]', tbl).forEach(b => b.onclick = async () => {
        const id = b.dataset.id, act = b.dataset.act;
        if (act === 'open') go(`#/work/${id}`);
        else if (act === 'edit') go(`#/work/${id}/edit`);
        else if (act === 'pdf') exportPdf('dossier', { id });
        else if (act === 'del') confirmBox('Move to recycle bin?', `Work <b>${esc((S.works.find(w => w.id == id) || {}).work_name || '')}</b> will be moved to the recycle bin. You can restore it later from <b>Settings ▸ Data</b>.`, async () => {
          try { const r = await U.del('/api/works/' + id); toast('✓ ' + r.message, 'ok'); await loadWorks(); vWorks(); } catch (e) { toast('✗ ' + e.message, 'err'); }
        }, 'Move to bin', 'red');
      });
      bindGo(tbl);
      updateBulk();
    }, 0);

    function updateBulk() {
      const n = L.sel.size;
      bulk.style.display = n ? 'flex' : 'none';
      $('#bulkCount').textContent = `${n} work${n === 1 ? '' : 's'} selected`;
    }
    function renderTableOnly() { vWorks(); }
  }

  async function bulkAction(action) {
    const ids = [...S.ledger.sel];
    if (!ids.length) return toast('Select at least one work', 'warn');
    const patch = {};
    if (action === 'status') patch.work_status = $('#bulkStatus').value;
    if (action === 'bill_status') patch.bill_status = $('#bulkBill').value;
    if (action === 'target') { patch.extended_target_date = $('#bulkTarget').value; if (!patch.extended_target_date) return toast('Pick a date first', 'warn'); }
    const labels = { delete: 'delete (move to bin)', status: 'apply work status', bill_status: 'apply bill status', target: 'set extended target', checklist: 'add standard checklists' };
    if (action === 'delete') {
      confirmBox('Delete selected works?', `${ids.length} work(s) will be moved to the recycle bin.`, async () => {
        try { const r = await U.post('/api/bulk', { ids, action }); toast('✓ ' + r.message, 'ok'); S.ledger.sel.clear(); await loadWorks(); vWorks(); }
        catch (e) { toast('✗ ' + e.message, 'err'); }
      });
      return;
    }
    loading(true, 'Applying bulk update…');
    try {
      const r = await U.post('/api/bulk', { ids, action, patch });
      toast(`✓ ${r.message} (${labels[action]})`, 'ok');
      S.ledger.sel.clear(); await loadWorks(); vWorks();
    } catch (e) { toast('✗ ' + e.message, 'err', 6000); } finally { loading(false); }
  }

  function openColumnPicker() {
    const body = el('div');
    body.appendChild(el('div', { class: 'small muted', style: { marginBottom: '8px' }, text: 'Choose the columns to display in the Works Ledger. Your selection is remembered on this device.' }));
    const grid = el('div', { class: 'check-list' });
    Object.keys(COLS).forEach(k => {
      if (k === 'sel') return;
      const id = 'col_' + k;
      grid.appendChild(el('label', { class: 'check-item', html: `<input type="checkbox" id="${id}" value="${k}" ${S.ledger.cols.includes(k) ? 'checked' : ''}> <span>${esc(COLS[k].h)}</span>` }));
    });
    body.appendChild(grid);
    const presets = el('div', { class: 'btn-row', style: { marginTop: '10px' } });
    [['Minimal', ['sel', 'sno', 'work_name', 'taluka', 'aa_amount', 'est_amount', 'physical', 'work_status', 'actions']],
      ['Finance focus', ['sel', 'sno', 'work_name', 'est_number', 'taluka', 'head_of_account', 'aa_amount', 'est_amount', 'paid', 'balance', 'financial', 'bill_status', 'bills_pending', 'actions']],
      ['Monitoring focus', ['sel', 'sno', 'work_name', 'taluka', 'contractor_name', 'wo_date', 'target', 'days_left', 'physical', 'delay', 'rag', 'work_status', 'actions']],
      ['Full (all columns)', Object.keys(COLS)]].forEach(([lab, cols]) => {
      presets.appendChild(el('button', {
        class: 'btn sm ghost', text: lab, onclick: () => {
          S.ledger.cols = cols; saveCols(); closeModal(); vWorks(); toast('✓ Column preset applied', 'ok');
        },
      }));
    });
    body.appendChild(presets);
    modal('Customise Ledger Columns', body, [
      { label: 'Reset to default', cls: 'ghost', onClick: () => { S.ledger.cols = DEF_COLS.slice(); saveCols(); closeModal(); vWorks(); } },
      { label: 'Save columns', cls: 'primary', onClick: () => { S.ledger.cols = ['sel'].concat($$('input:checked', grid).map(i => i.value)); saveCols(); closeModal(); vWorks(); toast('✓ Columns saved', 'ok'); } },
    ], { width: 'min(880px,96vw)' });
  }

  /* ==================== VIEW: WORK FORM ==================== */
  async function vWorkForm(param) {
    const v = clear($('#view'));
    const isEdit = param && param !== 'new';
    let data = {}, bills = [], milestones = [], documents = [];
    if (isEdit) {
      loading(true, 'Loading work…');
      const id = param === 'edit' ? null : param;
      const r = await U.get('/api/works/' + id);
      loading(false);
      data = r.data.work; bills = r.data.bills; milestones = r.data.milestones; documents = r.data.documents;
    } else {
      data = Object.assign({ district: 'Jalgaon', work_status: '', bill_status: 'Not Submitted', physical_progress: 0,
        priority: 'Medium', utility_connection: 'Not Applied', quality_inspection: 'Not Required', mb_status: 'Pending',
        sd_status: 'Pending', est_year: (S.meta.years || []).slice(-1)[0] || '2025-26', financial_year: '' }, S.drafts || {});
    }
    S.form = { data, bills, milestones, documents, errors: [], id: data.id, isEdit };
    renderForm(v);
  }

  function field(label, name, type, opts = {}) {
    const f = el('div', { class: 'f ' + (opts.span || 'c3') });
    const lab = el('label', { html: esc(label) + (opts.req ? ' <span class="req">*</span>' : '') });
    f.appendChild(lab);
    let input;
    if (opts.options) {
      input = el('select', { name, id: 'f_' + name });
      input.appendChild(el('option', { value: '', text: opts.placeholder || '— select —' }));
      opts.options.forEach(o => input.appendChild(el('option', { value: typeof o === 'string' ? o : o.v, text: typeof o === 'string' ? o : o.label, selected: String(S.form.data[name] || '') === String(typeof o === 'string' ? o : o.v) })));
    } else if (type === 'textarea') {
      input = el('textarea', { name, id: 'f_' + name, rows: opts.rows || 2 });
      input.value = S.form.data[name] || '';
    } else {
      input = el('input', { type: type || 'text', name, id: 'f_' + name, placeholder: opts.placeholder || '', step: opts.step, min: opts.min, max: opts.max });
      input.value = S.form.data[name] !== undefined && S.form.data[name] !== null ? S.form.data[name] : '';
      if (opts.list) input.setAttribute('list', opts.list);
    }
    if (opts.oninput) input.addEventListener('input', opts.oninput);
    if (opts.onchange) input.addEventListener('change', opts.onchange);
    f.appendChild(input);
    if (opts.hint) f.appendChild(el('span', { class: 'hint', html: opts.hint }));
    return f;
  }
  function secHead(n, title, extra) {
    return el('div', { class: 'section-head', html: `<span class="sh-no">${n}</span><b>${esc(title)}</b><span class="grow"></span>${extra || ''}` });
  }
  function datalists() {
    const m = M();
    const dl = (id, list) => el('datalist', { id }, (list || []).map(x => el('option', { value: x })));
    const frag = document.createDocumentFragment();
    frag.appendChild(dl('dl_taluka', m.talukas));
    const W = Array.isArray(S.works) ? S.works : [];
    frag.appendChild(dl('dl_village', [...new Set(W.map(w => w.village).filter(Boolean))]));
    frag.appendChild(dl('dl_division', m.divisions));
    frag.appendChild(dl('dl_sub', m.sub_divisions));
    frag.appendChild(dl('dl_section', m.sections));
    frag.appendChild(dl('dl_nature', m.nature));
    frag.appendChild(dl('dl_fund', m.funds));
    frag.appendChild(dl('dl_contractor', m.contractors && m.contractors.length ? m.contractors : [...new Set(W.map(w => w.contractor_name).filter(Boolean))]));
    frag.appendChild(dl('dl_userdept', m.user_departments));
    frag.appendChild(dl('dl_head', m.heads));
    return frag;
  }

  function renderForm(v) {
    const m = M();
    const f = S.form;
    const bar = el('div', { class: 'card' });
    bar.appendChild(el('div', { class: 'card-h', html: `<b>${f.isEdit ? 'Edit Work #' + f.id : 'Add New Work'}</b>
      <span class="sub">Fields marked <span style="color:var(--red)">*</span> are mandatory. Amounts accept <span class="mono">25L</span>, <span class="mono">2.5cr</span>, <span class="mono">2500000</span>. Derived fields are computed automatically.</span><span class="grow"></span>` }));
    const acts = el('div', { class: 'card-b', style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } });
    acts.appendChild(el('button', { class: 'btn primary', text: f.isEdit ? '💾 Save Changes' : '💾 Save Work', onclick: () => saveWork() }));
    if (!f.isEdit) acts.appendChild(el('button', { class: 'btn', text: '💾 Save & Add Another', onclick: () => saveWork(true) }));
    acts.appendChild(el('button', { class: 'btn ghost', text: '⤓ Load Draft', onclick: loadDraft }));
    acts.appendChild(el('button', { class: 'btn ghost', text: '✎ Save Draft (browser)', onclick: saveDraft }));
    acts.appendChild(el('button', { class: 'btn ghost', text: '↺ Reset Form', onclick: () => { S.form.data = {}; S.form.bills = []; renderForm(clear($('#view'))); } }));
    acts.appendChild(el('div', { class: 'grow' }));
    if (f.isEdit) {
      acts.appendChild(el('button', { class: 'btn', text: '◂ Back to Dossier', onclick: () => go('#/work/' + f.id) }));
      acts.appendChild(el('button', { class: 'btn red', text: '🗑 Delete Work', onclick: () => confirmBox('Delete this work?', 'It will be moved to the recycle bin.', async () => { await U.del('/api/works/' + f.id); toast('✓ Moved to recycle bin', 'ok'); go('#/works'); }, 'Move to bin') }));
    } else acts.appendChild(el('button', { class: 'btn', text: 'Cancel', onclick: () => go('#/works') }));
    bar.appendChild(acts);
    v.appendChild(bar);

    const form = el('form', { class: 'card', onsubmit: (e) => { e.preventDefault(); saveWork(); } });
    form.appendChild(el('div', { class: 'card-h', html: '<b>Work Details</b><span class="sub">complete record – administrative, financial &amp; progress</span>' }));
    const g = el('div', { class: 'card-b' });
    const fg = el('div', { class: 'form-grid' });
    const D = f.data;
    const gv = (k, def = '') => D[k] !== undefined && D[k] !== null ? D[k] : def;

    /* --- 1 Basic --- */
    fg.appendChild(secHead(1, 'Work Identification'));
    fg.appendChild(field('Name of Work (कामाचे नाव)', 'work_name', 'text', { span: 'c8', req: true, placeholder: 'e.g. Electrification of ZP School Building at Jalgaon' }));
    fg.appendChild(field('Estimate Number (अंदाज क्र.)', 'est_number', 'text', { span: 'c4', placeholder: 'Est/EE-ELEC/25-26/001', hint: 'Duplicate estimate numbers are blocked automatically' }));
    fg.appendChild(field('Work Name in Marathi', 'work_name_mr', 'text', { span: 'c5' }));
    fg.appendChild(field('Estimate Year', 'est_year', 'text', { span: 'c2', list: 'dl_year', placeholder: '2025-26' }));
    fg.appendChild(field('Financial Year', 'financial_year', 'text', { span: 'c2', list: 'dl_year', placeholder: '2025-26' }));
    fg.appendChild(field('Priority', 'priority', 'select', { span: 'c3', options: m.priorities, placeholder: 'Medium' }));

    /* --- 2 Location --- */
    fg.appendChild(secHead(2, 'Location & Office Hierarchy'));
    fg.appendChild(field('Taluka (तालुका)', 'taluka', 'text', { span: 'c3', req: true, list: 'dl_taluka', placeholder: 'e.g. Jalgaon' }));
    fg.appendChild(field('Village / Place', 'village', 'text', { span: 'c3', list: 'dl_village' }));
    fg.appendChild(field('District', 'district', 'text', { span: 'c2', list: 'dl_district' }));
    fg.appendChild(field('Circle', 'circle', 'text', { span: 'c2', list: 'dl_circle' }));
    fg.appendChild(field('Division', 'division', 'text', { span: 'c2', list: 'dl_division' }));
    fg.appendChild(field('Sub-Division', 'sub_division', 'text', { span: 'c3', list: 'dl_sub' }));
    fg.appendChild(field('Section', 'section', 'text', { span: 'c3', list: 'dl_section' }));
    fg.appendChild(field('User Department', 'user_department', 'text', { span: 'c3', list: 'dl_userdept' }));
    fg.appendChild(field('GPS Latitude', 'lat', 'text', { span: 'c2', placeholder: '19.9975' }));
    fg.appendChild(field('GPS Longitude', 'lng', 'text', { span: 'c2', placeholder: '73.7898' }));

    /* --- 3 Head of account --- */
    fg.appendChild(secHead(3, 'Head of Account, Nature & Fund (लेखाशीर्ष व निधी)'));
    const headSel = el('select', { id: 'f_head_of_account', name: 'head_of_account', onchange: onHeadChange });
    headSel.appendChild(el('option', { value: '', text: '— select Head of Account —' }));
    (m.headList || []).forEach(h => headSel.appendChild(el('option', { value: h.code, text: `${h.code} – ${h.desc}`, selected: gv('head_of_account') === h.code })));
    const hf = el('div', { class: 'f c5' }, [el('label', { html: 'Head of Account (मुख्य लेखाशीर्ष)' }), headSel]);
    fg.appendChild(hf);
    fg.appendChild(field('Head Description', 'head_desc', 'text', { span: 'c5', hint: 'Auto-filled from the master list' }));
    fg.appendChild(field('Head Type', 'head_type', 'text', { span: 'c2' }));
    fg.appendChild(field('Budget Head', 'budget_head', 'text', { span: 'c3' }));
    fg.appendChild(field('Nature of Work', 'nature_of_work', 'text', { span: 'c4', list: 'dl_nature' }));
    fg.appendChild(field('Work Type', 'work_type', 'text', { span: 'c2', list: 'dl_worktype' }));
    fg.appendChild(field('Fund Source (निधी स्रोत)', 'fund_source', 'text', { span: 'c3', list: 'dl_fund' }));
    fg.appendChild(field('Scheme Name', 'scheme_name', 'text', { span: 'c4' }));
    fg.appendChild(field('Budget Provision ₹', 'budget_provision', 'number', { span: 'c3', step: '0.01', hint: '<span id="budWords"></span>' }));

    /* --- 4 Sanctions --- */
    fg.appendChild(secHead(4, 'Estimate, Technical Sanction (TS) & Administrative Approval (AA)'));
    fg.appendChild(field('TS Number', 'ts_number', 'text', { span: 'c3' }));
    fg.appendChild(field('TS Date', 'ts_date', 'date', { span: 'c2' }));
    fg.appendChild(field('Estimate / TS Amount ₹', 'est_amount', 'text', {
      span: 'c3', req: true, placeholder: '2500000 or 25L', inputmode: 'decimal',
      oninput: U.debounce(onAmountInput, 400), hint: '<span id="estWords"></span>',
    }));
    fg.appendChild(field('Sanctioning Authority', 'sanctioning_authority', 'text', { span: 'c4', list: 'dl_authority' }));
    fg.appendChild(field('AA Number', 'aa_number', 'text', { span: 'c3' }));
    fg.appendChild(field('AA Date', 'aa_date', 'date', { span: 'c2' }));
    fg.appendChild(field('AA Amount ₹', 'aa_amount', 'text', { span: 'c3', placeholder: 'defaults to estimate amount', oninput: U.debounce(onAmountInput, 400), hint: '<span id="aaWords"></span>' }));
    fg.appendChild(field('Revised Est. Number', 'revised_est_number', 'text', { span: 'c3' }));
    fg.appendChild(field('Revised Est. Amount ₹', 'revised_est_amount', 'text', { span: 'c3', oninput: U.debounce(onAmountInput, 400), hint: '<span id="revWords"></span> Deviation is computed automatically' }));

    /* --- 5 Tender --- */
    fg.appendChild(secHead(5, 'Tender, Agreement, Work Order & Contractor'));
    fg.appendChild(field('Tender Type', 'tender_type', 'text', { span: 'c3', list: 'dl_tender' }));
    fg.appendChild(field('Tender / NIT Number', 'tender_number', 'text', { span: 'c3' }));
    fg.appendChild(field('Tender Date', 'tender_date', 'date', { span: 'c2' }));
    fg.appendChild(field('Contractor / Agency', 'contractor_name', 'text', { span: 'c4', list: 'dl_contractor' }));
    fg.appendChild(field('Contractor Class', 'contractor_class', 'text', { span: 'c2', list: 'dl_class' }));
    fg.appendChild(field('Contractor Contact', 'contractor_contact', 'text', { span: 'c2' }));
    fg.appendChild(field('Agreement Number', 'agreement_number', 'text', { span: 'c3' }));
    fg.appendChild(field('Agreement Date', 'agreement_date', 'date', { span: 'c2' }));
    fg.appendChild(field('Work Order Number', 'wo_number', 'text', { span: 'c3' }));
    fg.appendChild(field('Work Order Date', 'wo_date', 'date', { span: 'c2' }));
    fg.appendChild(field('Work Order Amount ₹', 'wo_amount', 'text', { span: 'c3', oninput: U.debounce(onAmountInput, 400) }));
    fg.appendChild(field('Site Handover Date', 'site_handover_date', 'date', { span: 'c3' }));
    fg.appendChild(field('Security Deposit (SD)', 'sd_status', 'select', { span: 'c2', options: m.sd_status }));

    /* --- 6 Targets & progress --- */
    fg.appendChild(secHead(6, 'Target, Progress & Payments'));
    fg.appendChild(field('Target / Completion Date', 'target_date', 'date', { span: 'c3' }));
    fg.appendChild(field('Extended Target Date', 'extended_target_date', 'date', { span: 'c3', hint: 'If a time extension was granted' }));
    fg.appendChild(field('Physical Progress %', 'physical_progress', 'number', { span: 'c2', min: 0, max: 100, step: '0.5' }));
    fg.appendChild(field('Amount Paid ₹', 'amount_paid', 'text', { span: 'c2', oninput: U.debounce(onAmountInput, 400), hint: 'Auto-summed from bills if left blank' }));
    fg.appendChild(field('Financial Progress %', 'financial_progress', 'number', { span: 'c2', min: 0, max: 100, step: '0.1', hint: 'Auto = paid ÷ estimate' }));

    /* --- 7 Status --- */
    fg.appendChild(secHead(7, 'Status Flags (auto-derived where possible)'));
    fg.appendChild(field('Work Status', 'work_status', 'select', { span: 'c4', options: m.work_status, placeholder: '— auto-suggest —', hint: '<span id="statusSuggest"></span>' }));
    fg.appendChild(field('Bill Status', 'bill_status', 'select', { span: 'c4', options: m.bill_status, placeholder: 'AUTO (from bills)' }));
    fg.appendChild(field('Utility / MSEB Connection', 'utility_connection', 'select', { span: 'c4', options: m.utility }));
    fg.appendChild(field('Quality Inspection', 'quality_inspection', 'select', { span: 'c4', options: m.quality }));
    fg.appendChild(field('Measurement Book (MB) Status', 'mb_status', 'text', { span: 'c4', list: 'dl_mb' }));
    fg.appendChild(el('div', { class: 'f c3' }, [el('label', { text: 'Stalled / Stayed' }), (() => {
      const s = el('select', { id: 'f_stalled', name: 'stalled' }, [el('option', { value: '0', text: 'No – work running', selected: !gv('stalled') }), el('option', { value: '1', text: 'Yes – stalled/stayed', selected: !!gv('stalled') })]);
      return s;
    })()]));
    fg.appendChild(field('Stalled Reason', 'stalled_reason', 'text', { span: 'c5' }));
    fg.appendChild(field('Delay Reason', 'delay_reason', 'text', { span: 'c4' }));
    fg.appendChild(field('Remarks / Observations', 'remarks', 'textarea', { span: 'c12', rows: 2 }));

    g.appendChild(fg);
    form.appendChild(g);

    /* --- derived preview panel --- */
    const dp = el('div', { class: 'card-b', id: 'derivedPanel', style: { borderTop: '1px solid var(--line)', background: 'var(--panel-2)' } });
    form.appendChild(dp);
    v.appendChild(form);

    /* --- bills & milestones quick entry (edit mode) --- */
    if (f.isEdit) {
      v.appendChild(billsEditor(f.id, f.bills));
      v.appendChild(milestoneEditor(f.id, f.milestones));
    } else {
      v.appendChild(el('div', { class: 'card', html: `<div class="card-b small muted">💡 After saving, the <b>standard milestone checklist (20 stages)</b> and <b>document checklist (18 documents)</b> are added automatically. You can then record bills, milestones and progress from the work's dossier page.</div>` }));
    }

    /* extra datalists */
    const dls = datalists();
    ['dl_year', 'dl_district', 'dl_circle', 'dl_authority', 'dl_tender', 'dl_class', 'dl_mb', 'dl_worktype'].forEach(id => {
      const list = {
        dl_year: (S.meta.years || []).concat(['2024-25', '2025-26', '2026-27']),
        dl_district: ['Jalgaon', 'Dhule', 'Nashik', 'Nandurbar', 'Ahmednagar', 'Pune'],
        dl_circle: m.circles || ['P.W. Circle, Nashik'],
        dl_authority: ['Executive Engineer, P.W. Electrical Division, Dhule', 'Superintending Engineer, P.W. Circle, Nashik', 'Chief Engineer (Electrical), Pune', 'Collector, Jalgaon', 'CEO, Zilla Parishad, Jalgaon'],
        dl_tender: m.tender_types, dl_class: m.contractor_class, dl_mb: ['Pending', 'In Progress', 'Completed', 'Not Required'],
        dl_worktype: ['Buildings', 'Roads & Bridges', 'Water Supply / Rural', 'Irrigation', 'Other'],
      }[id] || [];
      dls.appendChild(el('datalist', { id }, [...new Set(list)].map(x => el('option', { value: x }))));
    });
    v.appendChild(dls);
    updateDerived();
    $('#f_work_name').focus();
  }

  function collectForm() {
    const data = {};
    $$('#view form [name]').forEach(inp => {
      const k = inp.name;
      let val = inp.value;
      if (['aa_amount', 'est_amount', 'ts_amount', 'revised_est_amount', 'wo_amount', 'budget_provision', 'amount_paid'].includes(k)) val = U.parseNumInput(val);
      if (['physical_progress', 'financial_progress'].includes(k)) val = U.round(Number(val) || 0, 2);
      if (k === 'stalled') val = val === '1' ? 1 : 0;
      data[k] = val;
    });
    return data;
  }

  function onHeadChange(e) {
    const code = e.target.value;
    const h = (M().headList || []).find(x => x.code === code);
    if (h) { $('#f_head_desc').value = h.desc; $('#f_head_type').value = h.type; if (!$('#f_budget_head').value) $('#f_budget_head').value = h.code; }
    updateDerived();
  }
  function onAmountInput() { updateDerived(); }

  function updateDerived() {
    const d = collectForm();
    const est = U.parseNumInput(d.est_amount), aa = U.parseNumInput(d.aa_amount), rev = U.parseNumInput(d.revised_est_amount);
    const paid = U.parseNumInput(d.amount_paid);
    const eff = rev || aa || est;
    const setWords = (id, val) => { const n = document.getElementById(id); if (n) n.innerHTML = val ? `<b>${esc(U.amtWords(val))}</b> &nbsp;<span class="muted">(₹ ${U.fmtNum(val)} = ${U.fmtLakh(val)} Lakh)</span>` : ''; };
    setWords('estWords', est); setWords('aaWords', aa); setWords('revWords', rev); setWords('budWords', U.parseNumInput(d.budget_provision));
    /* auto default AA = estimate */
    const aaInp = $('#f_aa_amount');
    if (aaInp && !aaInp.value.trim() && est) aaInp.placeholder = `auto: ${U.fmtNum(est)} (same as estimate)`;
    const bal = Math.max(0, eff - paid);
    const util = eff ? U.round(paid / eff * 100, 2) : 0;
    const dev = rev && aa ? U.round(rev - aa, 2) : 0;
    const dp = $('#derivedPanel');
    if (dp) {
      dp.innerHTML = `<div class="grid g6">
        ${dstat('Effective Amount', '₹ ' + U.fmtNum(eff), rev ? 'Revised estimate in force' : (aa ? 'AA amount' : 'Estimate / TS amount'))}
        ${dstat('Amount Paid', '₹ ' + U.fmtNum(paid), 'from bills or manual entry')}
        ${dstat('Balance Payable', '₹ ' + U.fmtNum(bal), 'effective − paid')}
        ${dstat('Utilisation', util + '%', 'paid ÷ effective amount')}
        ${dstat('Deviation', dev ? '₹ ' + U.fmtNum(dev) : 'Nil', rev ? `Revised vs AA (${aa ? U.round((rev - aa) / aa * 100, 2) : 0}%)` : 'no revised estimate')}
        ${dstat('Physical', U.round(Number(d.physical_progress) || 0, 1) + '%', Number(d.physical_progress) >= 100 ? 'work completed' : 'recorded progress')}
      </div>
      <div class="small muted" style="margin-top:8px">⚙ Automation: <b>AA amount</b> defaults to the estimate amount • <b>head description/type</b> auto-fill from the selected Head of Account • <b>financial progress</b> is recalculated from bills • <b>bill status</b>, <b>delay days</b> and the <b>RAG rating</b> are derived automatically on save.</div>`;
    }
    const sg = $('#statusSuggest');
    if (sg) {
      const s = suggestStatusClient(d, { effective_amount: eff, physical_progress: Number(d.physical_progress) || 0, balance_amount: bal });
      sg.innerHTML = `Suggested from the data: <b>${esc(s)}</b> ${d.work_status && d.work_status !== s ? `<a href="#" id="applySuggest">apply</a>` : ''}`;
      const a = $('#applySuggest'); if (a) a.onclick = (e) => { e.preventDefault(); $('#f_work_status').value = s; updateDerived(); };
    }
  }
  function dstat(l, v, s) { return `<div class="kpi" style="box-shadow:none;padding:8px 10px"><div class="k-l">${esc(l)}</div><div class="k-v" style="font-size:15px">${esc(String(v))}</div><div class="k-s">${esc(s)}</div></div>`; }
  function suggestStatusClient(d, x) {
    const cur = d.work_status;
    if (['Cancelled / Dropped', 'Litigation / Court Case', 'Administered / Stayed', 'Stalled / Stopped'].includes(cur)) return cur;
    if (!x.effective_amount && !d.aa_number && !d.ts_number) return 'Estimate under Preparation';
    if (d.ts_number && !d.aa_number) return 'Administrative Approval (AA) Awaited';
    if (d.aa_number && !d.tender_number && !d.contractor_name) return 'Sanctioned – Tender Stage';
    if (d.contractor_name && !d.wo_number) return 'Tender Awarded – WO Pending';
    if (d.wo_number && x.physical_progress >= 100) return x.balance_amount <= 0 ? 'Completed & Fully Paid' : 'Completed – Final Bill Pending';
    if (d.wo_number && x.physical_progress >= 50) return 'Progress – 50% to 89%';
    if (d.wo_number) return 'In Progress';
    return cur || 'Estimate under Preparation';
  }

  function saveDraft() { localStorage.setItem('form_draft', JSON.stringify(collectForm())); toast('✓ Draft saved in this browser', 'ok'); }
  function loadDraft() {
    const d = JSON.parse(localStorage.getItem('form_draft') || '{}');
    if (!Object.keys(d).length) return toast('No draft found', 'warn');
    S.form.data = Object.assign({}, S.form.data, d); renderForm(clear($('#view'))); toast('✓ Draft loaded into the form', 'ok');
  }

  async function saveWork(again) {
    const data = collectForm();
    if (!data.work_name || data.work_name.trim().length < 3) { toast('✗ Work name is required', 'err'); $('#f_work_name').focus(); return; }
    if (!data.taluka) { toast('✗ Taluka is required (works are arranged taluka-wise)', 'err'); $('#f_taluka').focus(); return; }
    loading(true, 'Saving work…');
    try {
      let r;
      if (S.form.isEdit) r = await U.put('/api/works/' + S.form.id, data);
      else r = await U.post('/api/works', Object.assign({ auto_checklist: true }, data));
      loading(false);
      toast('✓ ' + r.message, 'ok');
      localStorage.removeItem('form_draft');
      await refreshMeta(); await loadWorks();
      if (again && !S.form.isEdit) { S.form = { data: { district: 'Jalgaon', taluka: data.taluka, division: data.division, sub_division: data.sub_division, section: data.section, head_of_account: data.head_of_account, head_desc: data.head_desc, head_type: data.head_type, fund_source: data.fund_source, est_year: data.est_year, financial_year: data.financial_year, priority: 'Medium', bill_status: 'Not Submitted' }, bills: [], milestones: [], documents: [], errors: [], isEdit: false }; renderForm(clear($('#view'))); toast('Form cleared for the next entry (common fields retained)', 'ok'); }
      else go('#/work/' + ((r.data && (r.data.id || (r.data.work && r.data.work.id))) || ''));
    } catch (e) {
      loading(false);
      if (e.status === 409) {
        confirmBox('Duplicate estimate number', esc(e.message) + '<br><br>Save it anyway as a separate record?', async () => {
          try { const r2 = await U.post('/api/works', Object.assign(collectForm(), { allow_duplicate: true })); toast('✓ ' + r2.message, 'ok'); go('#/work/' + ((r2.data && (r2.data.id || (r2.data.work && r2.data.work.id))) || '')); }
          catch (e2) { toast('✗ ' + e2.message, 'err', 6000); }
        }, 'Save anyway', 'accent');
      } else toast('✗ ' + e.message, 'err', 7000);
    }
  }

  /* ---------- bills editor (used in form & dossier) ---------- */
  function billsEditor(workId, bills) {
    const c = el('div', { class: 'card' });
    c.appendChild(el('div', { class: 'card-h', html: `<b>Bills &amp; Payments (बिल व देयक)</b><span class="sub">amounts feed physical/financial progress automatically</span><span class="grow"></span>
      <button class="btn sm primary" id="addBillBtn">＋ Add Bill</button>` }));
    const b = el('div', { class: 'card-b tight' });
    const tbl = el('table', { class: 'tbl' });
    tbl.innerHTML = `<thead><tr><th>#</th><th>Bill Type</th><th>Bill No.</th><th>Submitted</th><th class="num">Amount ₹</th>
      <th class="num">Paid ₹</th><th class="num">Pending ₹</th><th>Paid Date</th><th>Status</th><th>Voucher / TRN</th><th>Objection</th><th></th></tr></thead>`;
    const tb = el('tbody');
    let render = () => {
      clear(tb);
      bills.forEach((bl, i) => {
        const tr = el('tr');
        tr.innerHTML = `<td class="ctr">${i + 1}</td>
          <td><select class="inline-sel bd" data-k="bill_type" style="max-width:170px">${(M().bill_types || []).map(t => `<option ${t === bl.bill_type ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></td>
          <td><input class="inline-edit bd" data-k="bill_number" style="width:110px;text-align:left" value="${esc(bl.bill_number || '')}"></td>
          <td><input type="date" class="inline-edit bd" data-k="submitted_date" style="width:120px" value="${esc((bl.submitted_date || '').slice(0, 10))}"></td>
          <td><input type="number" step="0.01" class="inline-edit bd" data-k="amount" value="${U.round(bl.amount, 2)}"></td>
          <td><input type="number" step="0.01" class="inline-edit bd" data-k="paid_amount" value="${U.round(bl.paid_amount, 2)}"></td>
          <td class="num">${U.fmtNum(bl.amount - bl.paid_amount)}</td>
          <td><input type="date" class="inline-edit bd" data-k="paid_date" style="width:120px" value="${esc((bl.paid_date || '').slice(0, 10))}"></td>
          <td><select class="inline-sel bd" data-k="status">${(M().bill_status || []).map(s => `<option ${s === bl.status ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></td>
          <td><input class="inline-edit bd" data-k="voucher_number" style="width:90px;text-align:left" value="${esc(bl.voucher_number || '')}">
              <input class="inline-edit bd" data-k="treasury_ref" style="width:90px;text-align:left;margin-top:2px" value="${esc(bl.treasury_ref || '')}"></td>
          <td><input class="inline-edit bd" data-k="objection" style="width:150px;text-align:left" value="${esc(bl.objection || '')}"></td>
          <td class="ctr nowrap"><button class="btn tiny green" data-b="paid" title="Mark fully paid today">✓ Paid</button>
            <button class="btn tiny" data-b="save">💾</button> <button class="btn tiny red" data-b="del">🗑</button></td>`;
        $$('[data-b]', tr).forEach(btn => btn.onclick = async () => {
          const patch = {};
          $$('.bd', tr).forEach(inp => patch[inp.dataset.k] = ['amount', 'paid_amount'].includes(inp.dataset.k) ? Number(inp.value) || 0 : inp.value);
          if (btn.dataset.b === 'paid') { patch.paid_amount = patch.amount; patch.paid_date = U.today(); patch.status = 'Paid / Disbursed'; }
          try {
            if (btn.dataset.b === 'del') { await U.del('/api/bills/' + bl.id); bills = bills.filter(x => x.id !== bl.id); toast('✓ Bill deleted', 'ok'); }
            else { const r = await U.put('/api/bills/' + bl.id, patch); bills = r.data.items; toast('✓ Bill saved – work totals recalculated', 'ok'); }
            render(); if (S.route.view === 'work') refreshDetailTotals();
          } catch (e) { toast('✗ ' + e.message, 'err'); }
        });
        tb.appendChild(tr);
      });
      if (!bills.length) tb.appendChild(el('tr', { html: `<td colspan="12"><div class="empty small"><span class="e-i">₹</span>No bills recorded yet – click “＋ Add Bill”.</div></td>` }));
    };
    tbl.appendChild(tb);
    const tf = el('tfoot');
    tf.innerHTML = `<tr><td colspan="4">TOTAL</td><td class="num" id="btAmt">—</td><td class="num" id="btPaid">—</td><td class="num" id="btPend">—</td><td colspan="5"></td></tr>`;
    tbl.appendChild(tf);
    b.appendChild(tbl); c.appendChild(b);
    const updTot = () => {
      $('#btAmt').textContent = U.fmtNum(bills.reduce((a, x) => a + Number(x.amount || 0), 0));
      $('#btPaid').textContent = U.fmtNum(bills.reduce((a, x) => a + Number(x.paid_amount || 0), 0));
      $('#btPend').textContent = U.fmtNum(bills.reduce((a, x) => a + Number(x.amount || 0) - Number(x.paid_amount || 0), 0));
    };
    render(); updTot();
    const oldRender = render;
    render = () => { oldRender(); updTot(); };
    $('#addBillBtn', c).onclick = async () => {
      const nb = bills.length + 1;
      try {
        const r = await U.post(`/api/works/${workId}/bills`, {
          bill_type: nb === 1 ? 'R.A. Bill No. 1' : `R.A. Bill No. ${Math.min(nb, 8)}`, bill_number: '',
          submitted_date: U.today(), amount: 0, paid_amount: 0, status: 'Pending at Section',
        });
        bills = r.data.items; render(); toast('✓ New bill row added – fill the amount', 'ok');
      } catch (e) { toast('✗ ' + e.message, 'err'); }
    };
    return c;
  }

  /* ---------- milestone editor ---------- */
  function milestoneEditor(workId, list) {
    const c = el('div', { class: 'card' });
    c.appendChild(el('div', { class: 'card-h', html: `<b>Milestones / Work Stages (टप्पे)</b><span class="sub">overdue stages are flagged automatically</span><span class="grow"></span>
      <button class="btn sm" id="msAuto">↺ Re-add Standard Checklist</button><button class="btn sm primary" id="msAdd">＋ Add Milestone</button>` }));
    const b = el('div', { class: 'card-b tight' });
    const tbl = el('table', { class: 'tbl' });
    tbl.innerHTML = `<thead><tr><th>#</th><th>Milestone</th><th>Planned</th><th>Actual</th><th>Status</th><th>Responsible</th><th>Remarks</th><th>Flag</th><th></th></tr></thead>`;
    const tb = el('tbody');
    const render = () => {
      clear(tb);
      list.forEach((m, i) => {
        const overdue = m.status !== 'Completed' && m.planned_date && m.planned_date < U.today();
        const tr = el('tr');
        tr.innerHTML = `<td class="ctr">${i + 1}</td>
          <td><input class="inline-edit md" data-k="name" style="width:200px;text-align:left" list="dl_ms" value="${esc(m.name || '')}"></td>
          <td><input type="date" class="inline-edit md" data-k="planned_date" style="width:124px" value="${esc((m.planned_date || '').slice(0, 10))}"></td>
          <td><input type="date" class="inline-edit md" data-k="actual_date" style="width:124px" value="${esc((m.actual_date || '').slice(0, 10))}"></td>
          <td><select class="inline-sel md" data-k="status">${['Not Started', 'In Progress', 'Completed', 'Delayed', 'Not Applicable'].map(s => `<option ${s === m.status ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></td>
          <td><input class="inline-edit md" data-k="responsible" style="width:130px;text-align:left" value="${esc(m.responsible || '')}"></td>
          <td><input class="inline-edit md" data-k="remarks" style="width:160px;text-align:left" value="${esc(m.remarks || '')}"></td>
          <td class="ctr">${m.status === 'Completed' ? '<span class="badge b-green">DONE</span>' : overdue ? `<span class="badge b-red">${U.daysBetween(m.planned_date, U.today())} d late</span>` : (m.planned_date && U.daysBetween(U.today(), m.planned_date) <= 30 ? '<span class="badge b-amber">due soon</span>' : '<span class="badge b-grey">scheduled</span>')}</td>
          <td class="ctr nowrap"><button class="btn tiny green" data-m="done" title="Mark completed today">✓</button>
            <button class="btn tiny" data-m="save">💾</button> <button class="btn tiny red" data-m="del">🗑</button></td>`;
        $$('[data-m]', tr).forEach(btn => btn.onclick = async () => {
          const patch = {};
          $$('.md', tr).forEach(inp => patch[inp.dataset.k] = inp.value);
          if (btn.dataset.m === 'done') { patch.status = 'Completed'; patch.actual_date = U.today(); }
          try {
            if (btn.dataset.m === 'del') { await U.del('/api/milestones/' + m.id); list = list.filter(x => x.id !== m.id); toast('✓ Milestone deleted', 'ok'); }
            else { const r = await U.put('/api/milestones/' + m.id, patch); list = r.data.items; toast('✓ Milestone saved', 'ok'); }
            render();
          } catch (e) { toast('✗ ' + e.message, 'err'); }
        });
        tb.appendChild(tr);
      });
      if (!list.length) tb.appendChild(el('tr', { html: `<td colspan="9"><div class="empty small"><span class="e-i">◷</span>No milestones yet.</div></td>` }));
    };
    tbl.appendChild(tb); b.appendChild(tbl); c.appendChild(b);
    render();
    $('#msAdd', c).onclick = async () => {
      try { const r = await U.post(`/api/works/${workId}/milestones`, { name: 'New milestone', status: 'Not Started' }); list = r.data.items; render(); }
      catch (e) { toast('✗ ' + e.message, 'err'); }
    };
    $('#msAuto', c).onclick = async () => {
      try { const r = await U.post(`/api/works/${workId}/milestones/auto`, {}); list = r.data.items; render(); toast('✓ Standard checklist merged (existing entries kept)', 'ok'); }
      catch (e) { toast('✗ ' + e.message, 'err'); }
    };
    c.appendChild(el('datalist', { id: 'dl_ms' }, (M().milestones || []).map(x => el('option', { value: x }))));
    return c;
  }

  /* ==================== VIEW: WORK DETAIL ==================== */
  let DET = null;
  async function vWorkDetail(param) {
    const v = clear($('#view'));
    if (!param) return go('#/works');
    if (param === 'new') return go('#/workform/new');
    const id = param.replace('/edit', '');
    if (param.endsWith('/edit')) return go('#/workform/' + id);
    loading(true, 'Opening dossier…');
    let r;
    try { r = await U.get('/api/works/' + id); } catch (e) { loading(false); return v.appendChild(el('div', { class: 'card', html: `<div class="card-b"><div class="empty"><span class="e-i">⚠</span>${esc(e.message)}<br><br><button class="btn primary" onclick="location.hash='#/works'">Back to ledger</button></div></div>` })); }
    loading(false);
    DET = r.data;
    renderDetail(v);
  }
  function refreshDetailTotals() { if (S.route.view === 'work' && DET) renderDetail(clear($('#view'))); }

  function renderDetail(v) {
    const w = DET.work, m = M();
    /* header */
    const head = el('div', { class: 'detail-head' });
    head.innerHTML = `<div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap">
      <div style="flex:1;min-width:280px">
        <h2>${esc(w.work_name)}</h2>
        <div class="dh-sub"><span>🆔 Work #${w.id}</span><span>📄 Est: <b>${esc(w.est_number || '—')}</b></span>
          <span>📍 ${esc(w.taluka || '—')} Taluka${w.village ? ', ' + esc(w.village) : ''}</span>
          <span>🏛 ${esc(w.sub_division || w.division || '—')}</span></div>
        <div class="dh-badges">${U.ragBadge(w.rag)} ${U.statusBadge(w.work_status)} ${U.billBadge(w.bill_status_auto)}
          ${w.is_delayed ? `<span class="badge b-red">Delayed ${w.delay_days} d</span>` : ''}
          ${w.stalled ? `<span class="badge b-red">Stalled</span>` : ''}
          <span class="badge">${esc(w.priority || 'Medium')} priority</span></div>
      </div>
      <div class="btn-row" style="justify-content:flex-end">
        <button class="btn gold sm" id="dEdit">✎ Edit Work</button>
        <button class="btn sm" id="dPdf">⤓ PDF Dossier</button>
        <button class="btn sm" id="dPrint">⎙ Print</button>
        <button class="btn sm" id="dQuick">⚡ Quick Update</button>
        <button class="btn sm red" id="dDel">🗑 Delete</button>
      </div></div>
      <div class="grid g6" style="gap:8px;margin-top:12px">
        ${dhKpi('Est / TS Amount', '₹ ' + U.fmtNum(w.est_amount), U.fmtLakh(w.est_amount) + ' Lakh')}
        ${dhKpi('AA Amount', '₹ ' + U.fmtNum(w.aa_amount), w.aa_number ? esc(w.aa_number) : 'AA order pending')}
        ${dhKpi('Amount Paid', '₹ ' + U.fmtNum(w.amount_paid), 'Utilisation ' + U.round(w.financial_progress, 1) + '%')}
        ${dhKpi('Balance', '₹ ' + U.fmtNum(w.balance_amount), w.unpaid_bill_count + ' unpaid bill(s)')}
        ${dhKpi('Physical', U.round(w.physical_progress, 1) + '%', w.days_to_target !== null ? 'Target ' + U.fmtDate(w.effective_target) + ' (' + U.relDays(w.days_to_target) + ')' : 'No target date')}
        ${dhKpi('RAG Reason', w.rag, esc(w.rag_reasons))}
      </div>`;
    v.appendChild(head);

    /* tabs */
    const tabs = el('div', { class: 'tabs' });
    const panes = el('div');
    const TABS = [['overview', 'Overview'], ['bills', `Bills (${DET.bills.length})`], ['milestones', `Milestones (${DET.milestones.length})`],
      ['documents', `Documents (${DET.documents.length})`], ['progress', `Progress Log (${DET.progress.length})`], ['notes', `Remarks (${DET.notes.length})`], ['audit', 'Record Info']];
    TABS.forEach(([k, lab], i) => tabs.appendChild(el('button', { class: i === 0 ? 'active' : '', text: lab, onclick: (e) => { $$('button', tabs).forEach(b => b.classList.remove('active')); e.target.classList.add('active'); showPane(k); } })));
    v.appendChild(tabs); v.appendChild(panes);

    function showPane(k) {
      clear(panes);
      if (k === 'overview') panes.appendChild(overviewPane(w));
      else if (k === 'bills') panes.appendChild(billsEditor(w.id, DET.bills));
      else if (k === 'milestones') panes.appendChild(msPane(w));
      else if (k === 'documents') panes.appendChild(docPane(w));
      else if (k === 'progress') panes.appendChild(progPane(w));
      else if (k === 'notes') panes.appendChild(notePane(w));
      else panes.appendChild(auditPane(w));
    }
    showPane('overview');

    $('#dEdit').onclick = () => go('#/workform/' + w.id);
    $('#dPdf').onclick = () => exportPdf('dossier', { id: w.id });
    $('#dPrint').onclick = () => U.printView(w.work_name);
    $('#dDel').onclick = () => confirmBox('Move to recycle bin?', `Work <b>${esc(w.work_name)}</b> will be moved to the recycle bin.`, async () => {
      await U.del('/api/works/' + w.id); toast('✓ Moved to recycle bin', 'ok'); go('#/works');
    }, 'Move to bin');
    $('#dQuick').onclick = () => quickUpdate(w);
  }
  function dhKpi(l, val, sub) { return `<div style="background:rgba(255,255,255,.12);border-radius:9px;padding:7px 10px">
    <div style="font-size:9.5px;letter-spacing:.5px;text-transform:uppercase;color:#b9cde0;font-weight:700">${esc(l)}</div>
    <div style="font-size:16px;font-weight:700;margin-top:2px">${String(val)}</div>
    <div style="font-size:10.5px;color:#c8d8e8;margin-top:1px">${String(sub)}</div></div>`; }

  function infoBlock(title, pairs) {
    const g = el('div', { class: 'info-grid', style: { marginBottom: '12px' } });
    pairs.forEach(([k, val]) => g.appendChild(el('div', { class: 'ig', html: `<span>${esc(k)}</span><b>${val === '' || val === null || val === undefined ? '<span class="muted">—</span>' : esc(String(val))}</b>` })));
    const c = el('div', { class: 'card' });
    c.appendChild(el('div', { class: 'card-h', html: `<b>${esc(title)}</b>` }));
    const b = el('div', { class: 'card-b' }); b.appendChild(g); c.appendChild(b);
    return c;
  }

  function overviewPane(w) {
    const wrap = el('div');
    const g = el('div', { class: 'grid g2', style: { marginBottom: '13px' } });
    g.appendChild(el('div', { class: 'card', html: `<div class="card-h"><b>Physical Progress</b></div><div class="card-b" style="display:flex;gap:8px;align-items:center">
      ${Ch.gauge(w.physical_progress, { label: 'PHYSICAL', size: 140 })}
      <div style="flex:1">
        <div class="stat-line"><span>Milestones completed</span><b>${w.ms_done || 0} / ${w.ms_total || 0}</b></div>
        <div class="stat-line"><span>Milestones overdue</span><b style="color:${w.ms_overdue ? 'var(--red)' : ''}">${w.ms_overdue || 0}</b></div>
        <div class="stat-line"><span>MB status</span><b>${esc(w.mb_status || '—')}</b></div>
        <div class="stat-line"><span>Quality inspection</span><b>${esc(w.quality_inspection || '—')}</b></div>
        <div class="stat-line"><span>Utility connection</span><b>${esc(w.utility_connection || '—')}</b></div>
      </div></div>` }));
    g.appendChild(el('div', { class: 'card', html: `<div class="card-h"><b>Financial Position</b></div><div class="card-b" style="display:flex;gap:8px;align-items:center">
      ${Ch.gauge(w.financial_progress, { label: 'FINANCIAL', size: 140 })}
      <div style="flex:1">
        <div class="stat-line"><span>Estimate / TS amount</span><b>₹ ${U.fmtNum(w.est_amount)}</b></div>
        <div class="stat-line"><span>AA amount</span><b>₹ ${U.fmtNum(w.aa_amount)}</b></div>
        <div class="stat-line"><span>Revised estimate</span><b>${w.revised_est_amount ? '₹ ' + U.fmtNum(w.revised_est_amount) : '—'}</b></div>
        <div class="stat-line"><span>Work order amount</span><b>${w.wo_amount ? '₹ ' + U.fmtNum(w.wo_amount) : '—'}</b></div>
        <div class="stat-line"><span>Paid / Balance</span><b style="color:var(--green)">₹ ${U.fmtNum(w.amount_paid)}</b> / <b style="color:var(--accent)">₹ ${U.fmtNum(w.balance_amount)}</b></div>
        <div class="stat-line"><span>Amount in words</span><b class="small">${esc(U.amtWords(w.effective_amount))}</b></div>
      </div></div>` }));
    wrap.appendChild(g);

    const c1 = infoBlock('1 • Work, Location & Office', [
      ['Name of Work', w.work_name], ['Work Name (Marathi)', w.work_name_mr], ['Estimate No.', w.est_number],
      ['Estimate Year', w.est_year], ['Financial Year', w.financial_year], ['Nature of Work', w.nature_of_work],
      ['Work Type', w.work_type], ['Taluka', w.taluka], ['Village / Place', w.village], ['District', w.district],
      ['Circle', w.circle], ['Division', w.division], ['Sub-Division', w.sub_division], ['Section', w.section],
      ['User Department', w.user_department], ['Priority', w.priority],
    ]);
    const c2 = infoBlock('2 • Head of Account & Fund', [
      ['Head of Account', w.head_of_account], ['Head Description', w.head_desc], ['Head Type', w.head_type],
      ['Budget Head', w.budget_head], ['Fund Source', w.fund_source], ['Scheme Name', w.scheme_name],
      ['Budget Provision', w.budget_provision ? '₹ ' + U.fmtNum(w.budget_provision) : '—'],
      ['Sanctioning Authority', w.sanctioning_authority],
    ]);
    const c3 = infoBlock('3 • Sanction, Tender & Contract', [
      ['TS Number', w.ts_number], ['TS Date', U.fmtDate(w.ts_date)], ['Estimate / TS Amount', '₹ ' + U.fmtNum(w.est_amount)],
      ['AA Number', w.aa_number], ['AA Date', U.fmtDate(w.aa_date)], ['AA Amount', '₹ ' + U.fmtNum(w.aa_amount)],
      ['Revised Est. No.', w.revised_est_number], ['Revised Amount', w.revised_est_amount ? '₹ ' + U.fmtNum(w.revised_est_amount) : '—'],
      ['Tender Type', w.tender_type], ['Tender No.', w.tender_number], ['Tender Date', U.fmtDate(w.tender_date)],
      ['Contractor / Agency', w.contractor_name], ['Contractor Class', w.contractor_class], ['Contact', w.contractor_contact],
      ['Agreement No.', w.agreement_number], ['Agreement Date', U.fmtDate(w.agreement_date)],
      ['Work Order No.', w.wo_number], ['Work Order Date', U.fmtDate(w.wo_date)],
      ['Work Order Amount', w.wo_amount ? '₹ ' + U.fmtNum(w.wo_amount) : '—'], ['Site Handover', U.fmtDate(w.site_handover_date)],
      ['Security Deposit', w.sd_status],
    ]);
    const c4 = infoBlock('4 • Target, Status & Flags', [
      ['Target Date', U.fmtDate(w.target_date)], ['Extended Target', U.fmtDate(w.extended_target_date)],
      ['Days to Target', w.days_to_target === null ? '—' : U.relDays(w.days_to_target)], ['Delay', w.is_delayed ? w.delay_days + ' days beyond target' : 'Not delayed'],
      ['Work Status', w.work_status], ['Bill Status', w.bill_status_auto], ['Bills Pending', w.bills_pending_amount ? '₹ ' + U.fmtNum(w.bills_pending_amount) : '—'],
      ['Oldest Unpaid Bill', w.bill_pending_days ? w.bill_pending_days + ' days' : '—'], ['Stalled', w.stalled ? 'Yes – ' + (w.stalled_reason || '') : 'No'],
      ['Utility Connection', w.utility_connection], ['Quality Inspection', w.quality_inspection], ['MB Status', w.mb_status],
      ['RAG Rating', w.rag + ' – ' + w.rag_reasons], ['Remarks', w.remarks],
    ]);
    const gg = el('div', { class: 'grid g2' });
    gg.appendChild(c1); gg.appendChild(c2); wrap.appendChild(gg);
    const gg2 = el('div', { class: 'grid g2' }); gg2.appendChild(c3); gg2.appendChild(c4); wrap.appendChild(gg2);

    /* S curve of this work */
    const pts = DET.progress.length ? DET.progress : [];
    wrap.appendChild(el('div', { class: 'card', html: `<div class="card-h"><b>Progress Trend (S-curve)</b><span class="sub">from recorded progress log</span></div>
      <div class="card-b">${Ch.line([{ label: 'Physical %', color: '#2b608f', area: true, points: pts.map(p => ({ x: (p.date || '').slice(0, 7), y: p.physical })) },
        { label: 'Financial %', color: '#1b6b34', points: pts.map(p => ({ x: (p.date || '').slice(0, 7), y: p.financial })) }])}</div>` }));
    return wrap;
  }

  function msPane(w) {
    const wrap = el('div');
    wrap.appendChild(milestoneEditor(w.id, DET.milestones));
    /* timeline */
    const tl = el('div', { class: 'timeline' });
    const sorted = DET.milestones.slice().sort((a, b) => (a.planned_date || '9999').localeCompare(b.planned_date || '9999'));
    sorted.forEach(mn => {
      const late = mn.status !== 'Completed' && mn.planned_date && mn.planned_date < U.today();
      const soon = mn.status !== 'Completed' && mn.planned_date && U.daysBetween(U.today(), mn.planned_date) <= 30;
      tl.appendChild(el('div', { class: 'tl-item ' + (mn.status === 'Completed' ? 'done' : late ? 'late' : soon ? 'soon' : ''), html: `
        <div class="tl-t">${esc(mn.name)} ${mn.status === 'Completed' ? '<span class="badge b-green">done</span>' : late ? '<span class="badge b-red">overdue</span>' : soon ? '<span class="badge b-amber">due soon</span>' : ''}</div>
        <div class="tl-d">Planned ${U.fmtDate(mn.planned_date)} ${mn.actual_date ? ' • Actual ' + U.fmtDate(mn.actual_date) : ''} ${mn.responsible ? ' • ' + esc(mn.responsible) : ''} ${mn.remarks ? ' • ' + esc(mn.remarks) : ''}</div>` }));
    });
    wrap.appendChild(el('div', { class: 'card', html: '<div class="card-h"><b>Milestone Timeline</b></div><div class="card-b"></div>' }));
    $('.card-b', wrap.lastChild).appendChild(tl);
    return wrap;
  }

  function docPane(w) {
    const c = el('div', { class: 'card' });
    c.appendChild(el('div', { class: 'card-h', html: `<b>Document Checklist (कागदपत्रे)</b><span class="sub">track availability of every record</span><span class="grow"></span>
      <button class="btn sm" id="docAuto">↺ Re-add Standard Checklist</button><button class="btn sm primary" id="docAdd">＋ Add Document</button>` }));
    const b = el('div', { class: 'card-b tight' });
    const tbl = el('table', { class: 'tbl' });
    tbl.innerHTML = `<thead><tr><th>#</th><th>Document</th><th>Status</th><th>Reference No.</th><th>Date</th><th>File</th><th>Remarks</th><th></th></tr></thead>`;
    const tb = el('tbody');
    let list = DET.documents;
    const render = () => {
      clear(tb);
      list.forEach((d, i) => {
        const tr = el('tr');
        tr.innerHTML = `<td class="ctr">${i + 1}</td>
          <td><input class="inline-edit dd" data-k="name" style="width:230px;text-align:left" list="dl_doc" value="${esc(d.name || '')}"></td>
          <td><select class="inline-sel dd" data-k="status">${['Pending', 'Received', 'Not Required', 'Expired', 'Under Process'].map(s => `<option ${s === d.status ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></td>
          <td><input class="inline-edit dd" data-k="ref_number" style="width:140px;text-align:left" value="${esc(d.ref_number || '')}"></td>
          <td><input type="date" class="inline-edit dd" data-k="date" style="width:124px" value="${esc((d.date || '').slice(0, 10))}"></td>
          <td><input class="inline-edit dd" data-k="file_name" style="width:120px;text-align:left" placeholder="scan/file name" value="${esc(d.file_name || '')}"></td>
          <td><input class="inline-edit dd" data-k="remarks" style="width:150px;text-align:left" value="${esc(d.remarks || '')}"></td>
          <td class="ctr nowrap"><button class="btn tiny" data-d="save">💾</button> <button class="btn tiny red" data-d="del">🗑</button></td>`;
        $$('[data-d]', tr).forEach(btn => btn.onclick = async () => {
          const patch = {}; $$('.dd', tr).forEach(inp => patch[inp.dataset.k] = inp.value);
          try {
            if (btn.dataset.d === 'del') { await U.del('/api/documents/' + d.id); list = list.filter(x => x.id !== d.id); toast('✓ Deleted', 'ok'); }
            else { const r = await U.put('/api/documents/' + d.id, patch); list = r.data.items; DET.documents = list; toast('✓ Document saved', 'ok'); }
            render();
          } catch (e) { toast('✗ ' + e.message, 'err'); }
        });
        tb.appendChild(tr);
      });
      const rec = list.filter(d => d.status === 'Received').length;
      tb.appendChild(el('tr', { html: `<td colspan="8" class="small muted" style="padding:8px">📎 ${rec} of ${list.length} documents received (${list.length ? U.round(rec / list.length * 100, 0) : 0}% completeness).</td>` }));
    };
    tbl.appendChild(tb); b.appendChild(tbl); c.appendChild(b);
    render();
    $('#docAdd', c).onclick = async () => { const r = await U.post(`/api/works/${w.id}/documents`, { name: 'New document', status: 'Pending' }); list = r.data.items; DET.documents = list; render(); };
    $('#docAuto', c).onclick = async () => { const r = await U.post(`/api/works/${w.id}/documents/auto`, {}); list = r.data.items; DET.documents = list; render(); toast('✓ Standard checklist merged', 'ok'); };
    c.appendChild(el('datalist', { id: 'dl_doc' }, (M().documents || []).map(x => el('option', { value: x }))));
    return c;
  }

  function progPane(w) {
    const wrap = el('div');
    const c = el('div', { class: 'card' });
    c.appendChild(el('div', { class: 'card-h', html: '<b>Add Progress Point</b><span class="sub">builds the S-curve; optionally updates the work record</span>' }));
    const b = el('div', { class: 'card-b' });
    const fg = el('div', { class: 'form-grid' });
    fg.appendChild(field2('Date', 'p_date', 'date', U.today(), 'c2'));
    fg.appendChild(field2('Physical %', 'p_phys', 'number', w.physical_progress, 'c2'));
    fg.appendChild(field2('Financial %', 'p_fin', 'number', U.round(w.financial_progress, 1), 'c2'));
    fg.appendChild(field2('Note', 'p_note', 'text', '', 'c4'));
    const cb = el('label', { class: 'check-item', style: { gridColumn: 'span 2', alignSelf: 'end' }, html: `<input type="checkbox" id="p_apply" checked> <span>Also update the work record</span>` });
    fg.appendChild(cb);
    b.appendChild(fg);
    b.appendChild(el('div', { class: 'btn-row', style: { marginTop: '9px' } }, [el('button', { class: 'btn primary', text: '＋ Save Progress Point', onclick: savePoint })]));
    c.appendChild(b); wrap.appendChild(c);

    async function savePoint() {
      try {
        const r = await U.post(`/api/works/${w.id}/progress`, { date: $('#p_date').value, physical: $('#p_phys').value, financial: $('#p_fin').value, note: $('#p_note').value, apply_to_work: $('#p_apply').checked });
        DET.progress = r.data.items; if (r.data.work) DET.work = r.data.work;
        toast('✓ Progress recorded', 'ok'); refreshDetailTotals();
      } catch (e) { toast('✗ ' + e.message, 'err'); }
    }

    const t = el('div', { class: 'card' });
    t.appendChild(el('div', { class: 'card-h', html: '<b>Progress History</b>' }));
    const tb2 = el('div', { class: 'card-b tight' });
    const tbl = el('table', { class: 'tbl' });
    tbl.innerHTML = `<thead><tr><th>#</th><th>Date</th><th class="num">Physical %</th><th class="num">Financial %</th><th>Note</th><th></th></tr></thead>`;
    const body = el('tbody');
    DET.progress.slice().reverse().forEach((p, i) => {
      body.appendChild(el('tr', { html: `<td class="ctr">${DET.progress.length - i}</td><td>${U.fmtDate(p.date)}</td>
        <td class="num">${p.physical}</td><td class="num">${p.financial}</td><td>${esc(p.note || '')}</td>
        <td class="ctr"><button class="btn tiny red" data-p="${p.id}">🗑</button></td>` }));
    });
    tbl.appendChild(body); tb2.appendChild(tbl); t.appendChild(tb2); wrap.appendChild(t);
    setTimeout(() => $$('[data-p]', tbl).forEach(btn => btn.onclick = async () => {
      await U.del('/api/progress/' + btn.dataset.p); toast('✓ Point deleted', 'ok');
      const r = await U.get('/api/works/' + w.id); DET = r.data; refreshDetailTotals();
    }), 0);
    return wrap;
  }
  function field2(label, id, type, value, span) {
    return el('div', { class: 'f ' + (span || 'c3') }, [el('label', { text: label }), el('input', { type, id, value: value === null || value === undefined ? '' : value })]);
  }

  function notePane(w) {
    const c = el('div', { class: 'card' });
    c.appendChild(el('div', { class: 'card-h', html: '<b>Remarks / Office Notes</b><span class="sub">audit-trailed conversation about this work</span>' }));
    const b = el('div', { class: 'card-b' });
    const ta = el('textarea', { id: 'noteTxt', style: { width: '100%', minHeight: '64px', padding: '8px', border: '1px solid var(--line)', borderRadius: '8px' }, placeholder: 'Write a remark / observation / meeting note…' });
    const au = el('input', { id: 'noteAuthor', placeholder: 'Your name / designation', style: { padding: '7px 9px', border: '1px solid var(--line)', borderRadius: '7px', width: '240px' } });
    b.appendChild(el('div', { style: { display: 'flex', gap: '8px', alignItems: 'flex-start', flexWrap: 'wrap' } }, [ta, au, el('button', { class: 'btn primary', text: '＋ Add Remark', onclick: addNote })]));
    const list = el('div', { style: { marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' } });
    const render = () => {
      clear(list);
      DET.notes.forEach(n => list.appendChild(el('div', { class: 'alert-item', html: `<div><div class="ai-t">${esc(n.note)}</div>
        <div class="ai-s">${esc(n.created_at)}${n.author ? ' • ' + esc(n.author) : ''}</div></div>
        <button class="btn tiny red" data-n="${n.id}">🗑</button>` })));
      if (!DET.notes.length) list.appendChild(el('div', { class: 'empty small', text: 'No remarks yet.' }));
      $$('[data-n]', list).forEach(btn => btn.onclick = async () => { await U.del('/api/notes/' + btn.dataset.n); const r = await U.get('/api/works/' + w.id); DET = r.data; render(); });
    };
    async function addNote() {
      if (!$('#noteTxt').value.trim()) return toast('Write something first', 'warn');
      const r = await U.post(`/api/works/${w.id}/notes`, { note: $('#noteTxt').value.trim(), author: $('#noteAuthor').value });
      DET.notes = r.data.items; $('#noteTxt').value = ''; render(); toast('✓ Remark added', 'ok');
    }
    b.appendChild(list); c.appendChild(b); render();
    return c;
  }

  function auditPane(w) {
    const c = el('div', { class: 'card' });
    c.appendChild(el('div', { class: 'card-h', html: '<b>Record Information & Data Lineage</b>' }));
    const b = el('div', { class: 'card-b' });
    b.innerHTML = `<div class="grid g2">
      <div>${infoRows([['Record ID', w.id], ['Created at', w.created_at], ['Last updated', w.updated_at], ['Recycle bin', w.is_deleted ? 'Yes' : 'No'],
        ['Effective amount logic', w.revised_est_amount ? 'Revised estimate' : (w.aa_amount ? 'AA amount' : 'Estimate / TS amount')],
        ['Paid amount source', w.amount_paid ? 'Manual / bill register' : 'Bill register'],
        ['Bill status source', w.bill_status ? 'Manually set' : 'Auto-derived from bills']])}</div>
      <div>${infoRows([['Estimate → TS → AA chain', [w.ts_number, w.aa_number].filter(Boolean).join(' → ') || 'incomplete'],
        ['Tender → Award → WO chain', [w.tender_number, w.contractor_name ? 'Awarded' : '', w.wo_number].filter(Boolean).join(' → ') || 'incomplete'],
        ['Checklists present', `${DET.milestones.length} milestones, ${DET.documents.length} documents`],
        ['Progress points', DET.progress.length], ['Bills recorded', DET.bills.length], ['Remarks', DET.notes.length]])}</div>
    </div>
    <div class="btn-row" style="margin-top:12px">
      <button class="btn sm" id="aRecalc">⚙ Recalculate derived fields for this work</button>
      <button class="btn sm" id="aJson">{ } View raw JSON</button>
      <button class="btn sm" id="aCsv">⤓ Export this work as CSV</button>
    </div>`;
    c.appendChild(b);
    setTimeout(() => {
      $('#aRecalc').onclick = async () => { const r = await U.post(`/api/works/${w.id}/quick`, { remarks: w.remarks }); DET.work = r.data.work; toast('✓ Recalculated', 'ok'); refreshDetailTotals(); };
      $('#aJson').onclick = () => modal('Raw JSON – Work #' + w.id, el('pre', { class: 'code', text: JSON.stringify(DET, null, 2) }), [{ label: 'Close', cls: 'primary' }], { width: 'min(880px,96vw)' });
      $('#aCsv').onclick = () => {
        const keys = Object.keys(w);
        U.saveCsv(`work_${w.id}.csv`, U.tableToCsv(keys, [keys.map(k => typeof w[k] === 'object' ? JSON.stringify(w[k]) : w[k])]));
      };
    }, 0);
    return c;
  }
  function infoRows(pairs) {
    return `<div class="info-grid" style="grid-template-columns:1fr">${pairs.map(([k, v]) => `<div class="ig"><span>${esc(k)}</span><b>${v === '' || v === null || v === undefined ? '<span class="muted">—</span>' : esc(String(v))}</b></div>`).join('')}</div>`;
  }

  function quickUpdate(w) {
    const body = el('div');
    const fg = el('div', { class: 'form-grid' });
    const fld = (label, id, type, value, opts = {}) => el('div', { class: 'f ' + (opts.span || 'c6') }, [el('label', { text: label }), (() => {
      if (opts.options) {
        const s = el('select', { id }, [el('option', { value: '', text: '— no change —' })].concat(opts.options.map(o => el('option', { value: o, text: o, selected: o === value }))));
        return s;
      }
      return el('input', { type, id, value: value === null || value === undefined ? '' : value });
    })()]);
    fg.appendChild(fld('Physical Progress %', 'q_phys', 'number', w.physical_progress, { span: 'c4' }));
    fg.appendChild(fld('Amount Paid ₹', 'q_paid', 'text', w.amount_paid, { span: 'c4' }));
    fg.appendChild(fld('Work Status', 'q_status', 'select', w.work_status, { span: 'c4', options: M().work_status }));
    fg.appendChild(fld('Bill Status', 'q_bill', 'select', w.bill_status_auto, { span: 'c4', options: M().bill_status }));
    fg.appendChild(fld('Utility Connection', 'q_util', 'select', w.utility_connection, { span: 'c4', options: M().utility }));
    fg.appendChild(fld('Quality Inspection', 'q_qc', 'select', w.quality_inspection, { span: 'c4', options: M().quality }));
    fg.appendChild(fld('MB Status', 'q_mb', 'text', w.mb_status, { span: 'c4' }));
    fg.appendChild(fld('Extended Target Date', 'q_target', 'date', w.extended_target_date, { span: 'c4' }));
    fg.appendChild(fld('Remarks', 'q_rem', 'text', w.remarks, { span: 'c12' }));
    body.appendChild(fg);
    body.appendChild(el('div', { class: 'small muted', style: { marginTop: '8px' }, text: 'Blank fields are left unchanged. A progress-history point is recorded automatically when physical progress is changed.' }));
    modal('⚡ Quick Update – ' + esc(w.work_name).slice(0, 60), body, [
      { label: 'Cancel', cls: 'ghost' },
      {
        label: 'Save changes', cls: 'primary', onClick: async (close) => {
          const patch = {};
          const map = { q_phys: 'physical_progress', q_paid: 'amount_paid', q_status: 'work_status', q_bill: 'bill_status', q_util: 'utility_connection', q_qc: 'quality_inspection', q_mb: 'mb_status', q_target: 'extended_target_date', q_rem: 'remarks' };
          Object.entries(map).forEach(([id, k]) => { const node = document.getElementById(id); if (node && node.value !== '' && String(node.value) !== String(w[k] === null || w[k] === undefined ? '' : w[k])) patch[k] = node.value; });
          try { const r = await U.post(`/api/works/${w.id}/quick`, patch); DET.work = r.data.work; close(); toast('✓ Updated', 'ok'); refreshDetailTotals(); await loadWorks(); }
          catch (e) { toast('✗ ' + e.message, 'err'); }
        },
      },
    ], { width: 'min(760px,96vw)' });
  }

  /* ==================== VIEW: BILLS ==================== */
  async function vBills() {
    const v = clear($('#view'));
    loading(true, 'Loading bill register…');
    const q = U.qs(Object.assign({}, S.filters, { only_unpaid: S.billFilters.onlyUnpaid ? 1 : '' }));
    const r = await U.get('/api/bills' + (q || ''));
    loading(false);
    let bills = r.data.bills, T = r.data.totals;
    if (S.billFilters.status) bills = bills.filter(b => b.status === S.billFilters.status);
    if (S.billFilters.taluka) bills = bills.filter(b => b.taluka === S.billFilters.taluka);

    const t = { count: bills.length, amount: bills.reduce((a, b) => a + b.amount, 0), paid: bills.reduce((a, b) => a + b.paid_amount, 0), pending: bills.reduce((a, b) => a + b.pending, 0), maxAge: bills.reduce((m, b) => Math.max(m, b.ageing_days), 0) };
    const kg = el('div', { class: 'grid g6', style: { marginBottom: '13px' } });
    [['Bills Listed', t.count, '', 'in current filter'], ['Bill Amount', '₹ ' + U.fmtLakh(t.amount), 'k-teal', 'Lakh'],
    ['Paid', '₹ ' + U.fmtLakh(t.paid), 'k-green', 'Lakh'], ['Pending', '₹ ' + U.fmtLakh(t.pending), 'k-amber', 'Lakh'],
    ['Unpaid Bills', bills.filter(b => b.status !== 'Paid / Disbursed').length, 'k-red', 'requiring action'],
    ['Max Ageing', t.maxAge + ' d', 'k-violet', 'oldest unpaid bill']].forEach(k =>
      kg.appendChild(el('div', { class: 'kpi ' + k[2], html: `<div class="k-l">${esc(k[0])}</div><div class="k-v">${esc(String(k[1]))}</div><div class="k-s">${esc(k[3])}</div>` })));
    v.appendChild(kg);

    /* status summary */
    const byStatus = {};
    bills.forEach(b => { (byStatus[b.status] = byStatus[b.status] || []).push(b); });
    const rows = Object.keys(byStatus).map(k => ({ label: k, value: byStatus[k].length, color: k === 'Paid / Disbursed' ? '#1b6b34' : k.includes('Objection') || k.includes('Rejected') ? '#b3261e' : '#f2b134' }));
    const g2 = el('div', { class: 'grid g2', style: { marginBottom: '13px' } });
    g2.appendChild(card('Bill Status Split', 'count of bills', Ch.donut(rows, { centreLabel: 'BILLS', centreValue: t.count })));
    g2.appendChild(card('Ageing Buckets (unpaid bills)', 'days since submission',
      Ch.hbar([['0-30 days', 0, 30], ['31-60 days', 31, 60], ['61-90 days', 61, 90], ['91-180 days', 91, 180], ['> 180 days', 181, 99999]].map(([lab, lo, hi]) => ({
        label: lab, value: bills.filter(b => b.status !== 'Paid / Disbursed' && b.ageing_days >= lo && b.ageing_days <= hi).length,
        parts: [{ value: bills.filter(b => b.status !== 'Paid / Disbursed' && b.ageing_days >= lo && b.ageing_days <= hi).reduce((a, b) => a + b.pending, 0) / 100000, color: lo > 60 ? '#b3261e' : lo > 30 ? '#f2b134' : '#2b608f', label: lab }],
      })), { fmt: (r, tot) => '₹' + U.fmtNum(tot, 1) + 'L', legendParts: null, amount: false })));
    v.appendChild(g2);

    /* controls */
    const ctl = el('div', { class: 'card' });
    ctl.appendChild(el('div', { class: 'card-h', html: `<b>Bill Register</b><span class="sub">click ✓ Paid to record payment instantly — work totals update automatically</span><span class="grow"></span>` }));
    const cb = el('div', { class: 'card-b', style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' } });
    const stSel = el('select', { class: 'inline-sel', onchange: (e) => { S.billFilters.status = e.target.value; vBills(); } },
      [el('option', { value: '', text: 'All bill statuses' })].concat((M().bill_status || []).map(s => el('option', { value: s, text: s, selected: S.billFilters.status === s }))));
    cb.appendChild(el('div', { class: 'fld' }, [el('label', { text: 'Bill status' }), stSel]));
    cb.appendChild(el('label', { class: 'check-item', style: { alignSelf: 'end' }, html: `<input type="checkbox" ${S.billFilters.onlyUnpaid ? 'checked' : ''} id="onlyUnpaid"> <span>Only unpaid / pending bills</span>` }));
    cb.appendChild(el('div', { class: 'grow' }));
    cb.appendChild(el('button', { class: 'btn sm red', text: '⤓ Bill Status PDF', onclick: () => exportPdf('bills_pdf') }));
    cb.appendChild(el('button', { class: 'btn sm green', text: '⤓ Bill Register Excel', onclick: () => exportXlsx('bills_xl') }));
    cb.appendChild(el('button', { class: 'btn sm', text: '⤓ CSV', onclick: () => U.saveCsv('bill_register.csv', U.tableToCsv(['Work', 'Est No', 'Taluka', 'Contractor', 'Bill Type', 'Bill No', 'Submitted', 'Amount', 'Paid', 'Pending', 'Status', 'Ageing days', 'Voucher', 'Objection'], bills.map(b => [b.work_name, b.est_number, b.taluka, b.contractor, b.bill_type, b.bill_number, b.submitted_date, b.amount, b.paid_amount, b.pending, b.status, b.ageing_days, b.voucher_number, b.objection]))) }));
    ctl.appendChild(cb);
    setTimeout(() => { $('#onlyUnpaid').onchange = (e) => { S.billFilters.onlyUnpaid = e.target.checked ? 1 : 0; vBills(); }; }, 0);

    const wrap = el('div', { class: 'tbl-wrap', style: { maxHeight: 'calc(100vh - 420px)' } });
    const tbl = el('table', { class: 'tbl' });
    tbl.innerHTML = `<thead><tr><th>#</th><th>Work / Est No</th><th>Taluka</th><th>Contractor</th><th>Bill Type</th><th>Bill No</th>
      <th class="ctr">Submitted</th><th class="num">Amount ₹</th><th class="num">Paid ₹</th><th class="num">Pending ₹</th>
      <th>Status</th><th class="ctr">Ageing</th><th>Voucher / TRN</th><th>Objection</th><th class="ctr">Actions</th></tr></thead>`;
    const tb = el('tbody');
    bills.forEach((b, i) => {
      tb.appendChild(el('tr', { html: `<td class="ctr">${i + 1}</td>
        <td><span class="wname" data-go="#/work/${b.work_id}">${esc(b.work_name)}</span><div class="wsub">${esc(b.est_number || '')} • ${esc(b.sub_division || '')}</div></td>
        <td>${esc(b.taluka)}</td><td>${esc(b.contractor || '—')}</td><td>${esc(b.bill_type)}</td><td>${esc(b.bill_number || '—')}</td>
        <td class="ctr">${U.fmtDate(b.submitted_date)}</td><td class="num">${U.fmtNum(b.amount)}</td>
        <td class="num" style="color:var(--green)">${U.fmtNum(b.paid_amount)}</td>
        <td class="num" style="color:${b.pending > 0 ? 'var(--accent)' : 'var(--txt-3)'}"><b>${U.fmtNum(b.pending)}</b></td>
        <td>${U.billBadge(b.status)}</td>
        <td class="ctr">${b.ageing_days ? `<span class="badge ${b.ageing_days > 60 ? 'b-red' : b.ageing_days > 30 ? 'b-amber' : 'b-grey'}">${b.ageing_days} d</span>` : '—'}</td>
        <td class="small">${esc([b.voucher_number, b.treasury_ref].filter(Boolean).join(' / ') || '—')}</td>
        <td class="small">${esc(b.objection || '—')}</td>
        <td class="ctr nowrap"><button class="btn tiny ghost" data-go="#/work/${b.work_id}" title="Open work">▸</button>
          <button class="btn tiny green" data-pay="${b.bill_id}" data-amt="${b.pending}" title="Mark fully paid today">✓ Paid</button></td>` }));
    });
    tbl.appendChild(tb);
    tbl.appendChild(el('tfoot', { html: `<tr><td colspan="7">TOTAL (${bills.length} bills)</td><td class="num">${U.fmtNum(t.amount)}</td>
      <td class="num">${U.fmtNum(t.paid)}</td><td class="num">${U.fmtNum(t.pending)}</td><td colspan="5"></td></tr>` }));
    wrap.appendChild(tbl); ctl.appendChild(wrap); v.appendChild(ctl);
    setTimeout(() => {
      bindGo(v);
      $$('[data-pay]', tbl).forEach(btn => btn.onclick = async () => {
        const bid = btn.dataset.pay, amt = Number(btn.dataset.amt) || 0;
        if (amt <= 0) return toast('This bill is already fully paid', 'warn');
        confirmBox('Record payment?', `Mark this bill as <b>fully paid</b> today for <b>₹ ${U.fmtNum(amt)}</b>?<br>The work's amount paid, financial progress and bill status will be recalculated automatically.`, async () => {
          try { await U.put('/api/bills/' + bid, { paid_amount: amt, paid_date: U.today(), status: 'Paid / Disbursed' }); toast('✓ Payment recorded', 'ok'); vBills(); }
          catch (e) { toast('✗ ' + e.message, 'err'); }
        }, 'Record payment', 'green');
      });
    }, 0);
  }

  /* ==================== VIEW: MILESTONES ==================== */
  async function vMilestones() {
    const v = clear($('#view'));
    loading(true, 'Loading milestones…');
    const q = U.qs(Object.assign({}, S.filters, { flag: S.msFilters.flag === 'ALL' ? '' : S.msFilters.flag }));
    const r = await U.get('/api/milestones' + q);
    loading(false);
    const ms = r.data.milestones, c = r.data.counts;
    const kg = el('div', { class: 'grid g4', style: { marginBottom: '13px' } });
    [['Total Milestones', c.total, ''], ['Completed', c.done, 'k-green'], ['Overdue', c.overdue, 'k-red'], ['Due ≤ 30 days', c.due, 'k-amber']]
      .forEach(k => kg.appendChild(el('div', { class: 'kpi ' + k[2], html: `<div class="k-l">${esc(k[0])}</div><div class="k-v">${k[1]}</div><div class="k-s">across filtered works</div>` })));
    v.appendChild(kg);

    const ctl = el('div', { class: 'card' });
    ctl.appendChild(el('div', { class: 'card-h', html: `<b>Milestone Tracker</b><span class="sub">global view of every stage across all works</span><span class="grow"></span>` }));
    const cb = el('div', { class: 'card-b', style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } });
    cb.appendChild(el('div', { class: 'fld' }, [el('label', { text: 'Flag' }), el('select', {
      class: 'inline-sel', onchange: (e) => { S.msFilters.flag = e.target.value; vMilestones(); },
    }, ['ALL', 'OVERDUE', 'DUE SOON', 'SCHEDULED', 'DONE'].map(x => el('option', { value: x, text: x, selected: S.msFilters.flag===x})))]));
    cb.appendChild(el('div', { class: 'grow' }));
    cb.appendChild(el('button', { class: 'btn sm red', text: '⤓ Milestone PDF', onclick: () => exportPdf('milestones') }));
    cb.appendChild(el('button', { class: 'btn sm green', text: '⤓ Milestone Excel', onclick: () => exportXlsx('milestone_xl') }));
    cb.appendChild(el('button', { class: 'btn sm', text: '⤓ CSV', onclick: () => U.saveCsv('milestones.csv', U.tableToCsv(['Work', 'Est No', 'Taluka', 'Milestone', 'Planned', 'Actual', 'Status', 'Days left', 'Overdue days', 'Flag'], ms.map(m => [m.work_name, m.est_number, m.taluka, m.milestone, m.planned_date, m.actual_date, m.status, m.days_left, m.overdue_days, m.flag]))) }));
    ctl.appendChild(cb);
    const wrap = el('div', { class: 'tbl-wrap', style: { maxHeight: 'calc(100vh - 400px)' } });
    const tbl = el('table', { class: 'tbl' });
    tbl.innerHTML = `<thead><tr><th>#</th><th>Work / Est No</th><th>Taluka</th><th>Milestone</th><th class="ctr">Planned</th>
      <th class="ctr">Actual</th><th>Status</th><th class="ctr">Days Left</th><th class="ctr">Overdue</th><th>Flag</th><th>Responsible</th></tr></thead>`;
    const tb = el('tbody');
    ms.forEach((m, i) => {
      tb.appendChild(el('tr', { html: `<td class="ctr">${i + 1}</td>
        <td><span class="wname" data-go="#/work/${m.work_id}">${esc(m.work_name)}</span><div class="wsub">${esc(m.est_number || '')}</div></td>
        <td>${esc(m.taluka)}</td><td>${esc(m.milestone)}</td><td class="ctr">${U.fmtDate(m.planned_date)}</td>
        <td class="ctr">${U.fmtDate(m.actual_date)}</td><td>${esc(m.status)}</td>
        <td class="ctr">${m.days_left === null ? '—' : U.relDays(m.days_left)}</td>
        <td class="ctr">${m.overdue_days ? `<b style="color:var(--red)">${m.overdue_days} d</b>` : '—'}</td>
        <td>${m.flag === 'OVERDUE' ? '<span class="badge b-red">OVERDUE</span>' : m.flag === 'DUE SOON' ? '<span class="badge b-amber">DUE SOON</span>' : m.flag === 'DONE' ? '<span class="badge b-green">DONE</span>' : '<span class="badge b-grey">SCHEDULED</span>'}</td>
        <td>${esc(m.responsible || '—')}</td>` }));
    });
    tbl.appendChild(tb); wrap.appendChild(tbl); ctl.appendChild(wrap); v.appendChild(ctl);
    bindGo(v);
  }

  /* ==================== VIEW: ALERTS ==================== */
  async function vAlerts() {
    const v = clear($('#view'));
    loading(true, 'Scanning for alerts…');
    const r = await U.get('/api/alerts' + fqs());
    loading(false);
    const A2 = r.data.alerts, items = A2.items, c = A2.counts;
    v.appendChild(el('div', { class: 'card', html: `<div class="card-h"><b>Alerts &amp; Reminders Centre</b>
      <span class="sub">auto-generated by the tracking rules (delay grace ${S.rules.completionGraceDays} d • bill warning ${S.rules.billPendingWarnDays} d • bill alert ${S.rules.billPendingAlertDays} d)</span>
      <span class="grow"></span><button class="btn sm red" id="alPdf">⤓ Critical Works PDF</button>
      <button class="btn sm" id="alRecalc">⚙ Recalculate All</button></div>
      <div class="card-b grid g6" style="gap:8px">
        ${alertTile('Overdue target', c.overdue_target, 'red')}${alertTile('Bill pending > ' + S.rules.billPendingAlertDays + ' d', c.bill_overdue, 'red')}
        ${alertTile('Stalled / stayed', c.stalled, 'red')}${alertTile('Overdue milestones', c.milestone_overdue, 'amber')}
        ${alertTile('Milestones due soon', c.milestone_due, 'amber')}${alertTile('Target within 30 d', c.target_soon, 'blue')}
        ${alertTile('Final bill pending', c.final_bill_pending, 'amber')}${alertTile('Work order missing', c.wo_pending, 'blue')}
        ${alertTile('Budget &lt; AA amount', c.budget_short, 'amber')}${alertTile('Incomplete data', c.data_gaps, 'blue')}
      </div>` }));
    setTimeout(() => {
      $('#alPdf').onclick = () => exportPdf('delays');
      $('#alRecalc').onclick = async () => { const x = await U.post('/api/recompute', {}); toast('✓ ' + x.message, 'ok'); await loadWorks(); vAlerts(); };
    }, 0);

    const group = (title, kind, list, render) => {
      if (!list.length) return;
      const g = el('div', { class: 'alert-group' });
      g.appendChild(el('div', { class: 'ag-h ag-' + kind, html: `<span>${esc(title)}</span><span class="badge b-grey">${list.length}</span>` }));
      const l = el('div', { class: 'alert-list' });
      list.forEach(x => l.appendChild(render(x)));
      g.appendChild(l); v.appendChild(g);
    };
    const workItem = (w, sub, badge) => el('div', {
      class: 'alert-item', html: `<div><div class="ai-t"><span class="wname" data-go="#/work/${w.id}">${esc(w.work_name)}</span>
        <span class="wsub"> • ${esc(w.taluka || '')} • ${esc(w.est_number || '')} • ₹ ${U.fmtNum(w.effective_amount)}</span></div>
        <div class="ai-s">${sub}</div></div><div>${badge || ''}</div>`,
    });
    group('⚠ Works beyond target date (delayed)', 'red', items.overdue_target.sort((a, b) => b.delay_days - a.delay_days),
      (w) => workItem(w, `Target ${U.fmtDate(w.effective_target)} • physical ${w.physical_progress}% • delayed by <b>${w.delay_days}</b> days • ${esc(w.contractor_name || 'no contractor')}`, `<span class="badge b-red">${w.delay_days} d</span>`));
    group('₹ Bills pending beyond ' + S.rules.billPendingAlertDays + ' days', 'red', items.bill_overdue.sort((a, b) => b.bill_pending_days - a.bill_pending_days),
      (w) => workItem(w, `${w.unpaid_bill_count} unpaid bill(s) worth <b>₹ ${U.fmtNum(w.bills_pending_amount)}</b> • oldest pending <b>${w.bill_pending_days}</b> days • ${esc(w.bill_status_auto)}`, `<span class="badge b-red">${w.bill_pending_days} d</span>`));
    group('⛔ Stalled / stayed / litigation works', 'red', items.stalled,
      (w) => workItem(w, `Status: ${esc(w.work_status)} • reason: ${esc(w.stalled_reason || w.delay_reason || 'not recorded')} • physical ${w.physical_progress}%`, '<span class="badge b-red">STALLED</span>'));
    group('◷ Overdue milestones', 'amber', items.milestone_overdue.sort((a, b) => b.days - a.days),
      (x) => workItem(x.work, `Milestone <b>${esc(x.m.name)}</b> was due on ${U.fmtDate(x.m.planned_date)} • ${x.days} days overdue`, `<span class="badge b-red">${x.days} d</span>`));
    group('📅 Milestones due within 45 days', 'amber', items.milestone_due.sort((a, b) => a.days - b.days),
      (x) => workItem(x.work, `Milestone <b>${esc(x.m.name)}</b> due ${U.fmtDate(x.m.planned_date)} (${x.days} days)`, `<span class="badge b-amber">in ${x.days} d</span>`));
    group('🎯 Target completion date within 30 days', 'blue', items.target_soon.sort((a, b) => a.days_to_target - b.days_to_target),
      (w) => workItem(w, `Target ${U.fmtDate(w.effective_target)} • physical ${w.physical_progress}% • ${w.days_to_target} days left`, `<span class="badge b-amber">${w.days_to_target} d</span>`));
    group('✔ Physically complete but final payment pending', 'amber', items.final_bill_pending,
      (w) => workItem(w, `Balance payable <b>₹ ${U.fmtNum(w.balance_amount)}</b> • bill status: ${esc(w.bill_status_auto)}`, '<span class="badge b-amber">FINAL BILL</span>'));
    group('📄 Award made but work order not recorded', 'blue', items.wo_pending,
      (w) => workItem(w, `Contractor ${esc(w.contractor_name)} recorded but W.O. number is blank`, '<span class="badge b-blue">DATA GAP</span>'));
    group('💰 Budget provision lower than AA amount', 'amber', items.budget_short,
      (w) => workItem(w, `Budget ₹ ${U.fmtNum(w.budget_provision)} vs AA ₹ ${U.fmtNum(w.aa_amount)} — short by ₹ ${U.fmtNum(w.aa_amount - w.budget_provision)}`, '<span class="badge b-amber">SHORT</span>'));
    group('✎ Incomplete records (fill these fields)', 'blue', items.data_gaps,
      (x) => workItem(x.w, `Missing: <b>${esc(x.gaps)}</b>`, '<span class="badge b-blue">INCOMPLETE</span>'));
    if (!c.total) v.appendChild(el('div', { class: 'card', html: '<div class="card-b"><div class="empty"><span class="e-i">✓</span><b>No alerts</b><br><span class="small">Everything is on track for the current filter.</span></div></div></div>' }));
    bindGo(v);
  }

  /* ==================== VIEW: REPORTS ==================== */
  function exportPdf(type, extra) {
    const q = U.qs(Object.assign({}, S.filters, extra || {}, { units: (extra && extra.units) || S.repUnits || 'Rs' }));
    U.download('/api/report/pdf/' + type + q);
    pushHistory('PDF', type);
    toast(`⤓ Opening PDF: ${S.reports[type] ? S.reports[type].title : type}`, 'ok');
  }
  function exportXlsx(type, extra) {
    const q = U.qs(Object.assign({}, S.filters, extra || {}));
    U.download('/api/report/excel/' + type + q);
    pushHistory('EXCEL', type);
    toast(`⤓ Downloading Excel: ${S.reports[type] ? S.reports[type].title : type}`, 'ok');
  }
  function exportCsv() {
    U.download('/api/export/csv' + fqs());
    pushHistory('CSV', 'ledger');
    toast('⤓ CSV export started', 'ok');
  }
  function pushHistory(kind, type) {
    S.history.unshift({ kind, type, at: new Date().toLocaleString('en-IN'), filters: JSON.stringify(S.filters).slice(0, 160) });
    S.history = S.history.slice(0, 25);
    localStorage.setItem('rep_history', JSON.stringify(S.history));
  }

  async function vReports() {
    const v = clear($('#view'));
    await loadWorks();
    const T = S.totals;
    v.appendChild(el('div', { class: 'card', html: `<div class="card-h"><b>Reports Centre</b>
      <span class="sub">Every report respects the filters in the bar above • ${T.count} works selected • Est ₹ ${U.fmtLakh(T.est_amount)} L • Paid ₹ ${U.fmtLakh(T.paid)} L</span><span class="grow"></span>
      <span class="badge b-red">10 PDF reports</span><span class="badge b-green">9 Excel workbooks</span></div>
      <div class="card-b">
        <div class="btn-row" style="margin-bottom:6px">
          <span class="small muted">PDF amount unit:</span>
          <div class="pill-tabs" id="unitTabs">
            <button data-u="Rs" class="${(S.repUnits || 'Rs') === 'Rs' ? 'active' : ''}">₹ Rupees</button>
            <button data-u="lakh" class="${S.repUnits === 'lakh' ? 'active' : ''}">₹ Lakh</button>
          </div>
          <span class="small muted">Sort:</span>
          <select class="inline-sel" id="repSort">
            <option value="taluka">Taluka → Work name</option><option value="amount">Highest amount first</option>
            <option value="status">Life-cycle stage</option><option value="target">Target date</option>
            <option value="delay">Most delayed first</option><option value="head">Head of Account</option>
            <option value="contractor">Contractor</option>
          </select>
          <button class="btn sm" id="repAll">⚙ Recalculate all derived fields first</button>
        </div>
        <div class="small muted">💡 PDF reports open in a new browser tab (use the browser's save/print). Excel workbooks download directly with live formulas, conditional formatting and dropdowns.</div>
      </div>` }));
    setTimeout(() => {
      $$('#unitTabs button').forEach(b => b.onclick = () => { S.repUnits = b.dataset.u; $$('#unitTabs button').forEach(x => x.classList.toggle('active', x === b)); });
      $('#repSort').value = S.filters.sort || 'taluka';
      $('#repSort').onchange = (e) => { S.filters.sort = e.target.value; renderFilterBar(); };
      $('#repAll').onclick = async () => { const r = await U.post('/api/recompute', {}); toast('✓ ' + r.message, 'ok'); await loadWorks(); vReports(); };
    }, 0);

    const mk = (kind, type) => {
      const def = S.reports[type] || { title: type, desc: '' };
      const c = el('div', { class: 'rep-card ' + (kind === 'PDF' ? 'pdf' : 'xlsx') });
      c.innerHTML = `<span class="rc-tag">${kind}</span><div class="rc-t">${esc(def.title)}</div><div class="rc-d">${esc(def.desc)}</div>`;
      const b = el('div', { class: 'rc-b' });
      b.appendChild(el('button', { class: 'btn tiny ' + (kind === 'PDF' ? 'red' : 'green'), text: kind === 'PDF' ? '⤓ Generate PDF' : '⤓ Download XLSX', onclick: () => kind === 'PDF' ? exportPdf(type) : exportXlsx(type) }));
      if (kind === 'PDF') b.appendChild(el('button', { class: 'btn tiny ghost', text: 'New tab', onclick: () => window.open('/api/report/pdf/' + type + fqs(), '_blank') }));
      if (type === 'dossier') b.appendChild(el('button', { class: 'btn tiny ghost', text: 'For one work…', onclick: () => pickWorkForDossier() }));
      c.appendChild(b);
      return c;
    };
    const pdfTypes = Object.keys(S.reports).filter(k => S.reports[k].group === 'PDF');
    const xlTypes = Object.keys(S.reports).filter(k => S.reports[k].group === 'EXCEL');
    const g1 = el('div', { class: 'grid g4' }); pdfTypes.forEach(t => g1.appendChild(mk('PDF', t)));
    v.appendChild(card('📄 PDF Reports (print-ready, letterhead, totals & signature block)', 'generated on the server with PDFKit', '', g1));
    const g2 = el('div', { class: 'grid g4' }); xlTypes.forEach(t => g2.appendChild(mk('EXCEL', t)));
    v.appendChild(card('📊 Excel Workbooks (styled, live formulas, conditional formatting)', 'generated on the server with ExcelJS', '', g2));

    /* recent history */
    if (S.history.length) {
      const t = el('table', { class: 'tbl' });
      t.innerHTML = `<thead><tr><th>#</th><th>Type</th><th>Report</th><th>When</th><th>Filters</th><th></th></tr></thead>`;
      const tb = el('tbody');
      S.history.forEach((h, i) => tb.appendChild(el('tr', { html: `<td class="ctr">${i + 1}</td><td>${h.kind === 'PDF' ? '<span class="badge b-red">PDF</span>' : h.kind === 'CSV' ? '<span class="badge b-grey">CSV</span>' : '<span class="badge b-green">XLSX</span>'}</td>
        <td>${esc((S.reports[h.type] || {}).title || h.type)}</td><td class="small">${esc(h.at)}</td><td class="small muted">${esc(h.filters)}</td>
        <td class="ctr"><button class="btn tiny ghost" data-rerun="${h.kind}:${h.type}">↻ Run again</button></td>` })));
      t.appendChild(tb);
      v.appendChild(card('Recently generated', 'stored in this browser only', '', t));
      setTimeout(() => $$('[data-rerun]').forEach(b => b.onclick = () => { const [k, ty] = b.dataset.rerun.split(':'); k === 'PDF' ? exportPdf(ty) : k === 'CSV' ? exportCsv() : exportXlsx(ty); }), 0);
    }
  }

  function pickWorkForDossier() {
    const body = el('div');
    const inp = el('input', { id: 'dossierPick', list: 'dl_works', placeholder: 'Type work name / est number…', style: { width: '100%', padding: '9px', border: '1px solid var(--line)', borderRadius: '8px' } });
    body.appendChild(inp);
    body.appendChild(el('datalist', { id: 'dl_works' }, S.works.map(w => el('option', { value: `${w.id} — ${w.work_name} (${w.est_number || 'no est no'})` }))));
    body.appendChild(el('div', { class: 'small muted', style: { marginTop: '8px' }, html: 'Or leave blank to generate the dossier for <b>all filtered works</b> (' + S.works.length + ' works — large PDF).' }));
    modal('Generate PDF Dossier', body, [
      { label: 'Cancel', cls: 'ghost' },
      {
        label: 'Generate PDF', cls: 'red', onClick: (close) => {
          const val = $('#dossierPick').value.trim();
          const id = val.match(/^\s*(\d+)/) ? val.match(/^\s*(\d+)/)[1] : null;
          close(); exportPdf('dossier', id ? { id } : {});
        },
      },
    ], { width: 'min(680px,96vw)' });
  }

  /* ==================== VIEW: IMPORT ==================== */
  function vImport() {
    const v = clear($('#view'));
    const c = el('div', { class: 'card' });
    c.appendChild(el('div', { class: 'card-h', html: `<b>Import Works in Bulk</b><span class="sub">Excel (.xlsx), CSV, TSV — or paste rows directly. Headers are matched automatically.</span>
      <span class="grow"></span><button class="btn sm" id="tpl">⤓ Download CSV Template</button>` }));
    const b = el('div', { class: 'card-b' });
    b.innerHTML = `<div class="grid g2">
      <div>
        <div class="f"><label>1 ▸ Upload a file (xlsx / csv / tsv)</label>
          <div id="dropZone" style="border:2px dashed var(--line);border-radius:10px;padding:26px;text-align:center;background:var(--panel-2)">
            <div style="font-size:26px">⇪</div>
            <div><b>Drop your file here</b> or <label class="btn sm primary" style="cursor:pointer">browse<input type="file" id="fileIn" accept=".xlsx,.xls,.csv,.tsv,.txt" style="display:none"></label></div>
            <div class="small muted" style="margin-top:6px">First sheet is read. A header row is detected automatically.</div>
          </div>
        </div>
      </div>
      <div>
        <div class="f"><label>2 ▸ …or paste rows (tab / comma separated)</label>
          <textarea id="pasteIn" style="width:100%;min-height:150px;padding:9px;border:1px solid var(--line);border-radius:9px;font-family:var(--mono);font-size:11.5px" placeholder="Work Name,Est No,Taluka,Head of Account,AA Amount,Est Amount,Work Status,Bill Status&#10;Electrification of PHC Peint,Est/25-26/001,Peint,2217 01 102,1250000,1250000,In Progress,Pending at Division"></textarea>
          <div class="btn-row" style="margin-top:7px">
            <button class="btn sm primary" id="parsePaste">⇢ Parse pasted text</button>
            <span class="small muted">Tip: copy cells straight out of Excel — tabs are detected automatically.</span>
          </div>
        </div>
      </div></div>
      <div class="small muted" style="margin-top:10px">
        <b>Recognised headers (any language/case):</b> Work Name / कामाचे नाव, Est No / अंदाज क्र, Taluka / तालुका, Head of Account / लेखाशीर्ष, AA Amount, Est Amount, TS Amount, AA No, AA Date, Contractor, WO No, WO Date, Target Date, Physical Progress, Amount Paid, Work Status, Bill Status, Village, Division, Sub-Division, Section, Nature of Work, Fund Source, Priority, Remarks…
      </div>`;
    c.appendChild(b);
    v.appendChild(c);
    const out = el('div', { id: 'importOut' }); v.appendChild(out);
    setTimeout(() => {
      $('#tpl').onclick = () => U.download('/api/import/template.csv');
      const dz = $('#dropZone'), fi = $('#fileIn');
      ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag-over'); }));
      ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('drag-over'); }));
      dz.addEventListener('drop', (e) => { if (e.dataTransfer.files.length) previewFile(e.dataTransfer.files[0]); });
      fi.onchange = () => { if (fi.files.length) previewFile(fi.files[0]); };
      $('#parsePaste').onclick = () => previewText($('#pasteIn').value);
    }, 0);

    async function previewFile(file) {
      const fd = new FormData(); fd.append('file', file);
      loading(true, 'Reading ' + file.name + '…');
      try { const r = await U.post('/api/import/preview', fd); renderPreview(r.data, file.name); }
      catch (e) { toast('✗ ' + e.message, 'err', 7000); } finally { loading(false); }
    }
    async function previewText(text) {
      if (!text.trim()) return toast('Paste some rows first', 'warn');
      loading(true, 'Parsing…');
      try { const r = await U.post('/api/import/preview', { text }); renderPreview(r.data, 'pasted text'); }
      catch (e) { toast('✗ ' + e.message, 'err', 7000); } finally { loading(false); }
    }

    function renderPreview(d, src) {
      clear(out);
      const c2 = el('div', { class: 'card' });
      c2.appendChild(el('div', { class: 'card-h', html: `<b>Import Preview – ${esc(src)}</b>
        <span class="sub">${d.total} data row(s) • ${d.matched} of ${d.header.filter(Boolean).length} columns mapped automatically • ${d.errorCount} row(s) with warnings</span><span class="grow"></span>
        <button class="btn sm green" id="doImport">⇢ Import ${d.total} work(s)</button>
        <select class="inline-sel" id="importMode">
          <option value="create">Create new (update if est. no. exists)</option>
          <option value="update">Update existing by est. no. only</option>
          <option value="duplicate">Always create duplicates</option>
        </select>
        <label class="check-item"><input type="checkbox" id="impChecklist" checked> <span>Add standard checklists</span></label>` }));
      const bb = el('div', { class: 'card-b' });
      /* mapping table */
      let mh = `<div class="small muted" style="margin-bottom:6px"><b>Column mapping</b> (change any dropdown if a column was mis-detected)</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">`;
      d.header.forEach((h, i) => {
        mh += `<span class="chip" style="background:var(--panel-2);color:var(--txt)">“${esc(h || '(blank)')}” →
          <select class="inline-sel mapSel" data-i="${i}" style="max-width:190px">
            <option value="">— ignore —</option>
            ${Object.keys(ALIAS_FIELDS()).map(f => `<option value="${f}" ${d.mapping[i] === f ? 'selected' : ''}>${esc(f)}</option>`).join('')}
          </select></span>`;
      });
      mh += `</div>`;
      bb.innerHTML = mh;
      /* preview grid */
      const wrap = el('div', { class: 'tbl-wrap', style: { maxHeight: '340px', marginTop: '10px' } });
      const tbl = el('table', { class: 'tbl' });
      const fields = d.mapping.filter(Boolean);
      tbl.innerHTML = `<thead><tr><th>Row</th>${fields.map(f => `<th>${esc(f)}</th>`).join('')}</tr></thead>`;
      const tb = el('tbody');
      d.rows.slice(0, 200).forEach((r, i) => {
        tb.appendChild(el('tr', { html: `<td class="ctr">${i + 1}</td>${fields.map(f => `<td class="small">${esc(typeof r[f] === 'object' ? JSON.stringify(r[f]) : r[f])}</td>`).join('')}` }));
      });
      tbl.appendChild(tb); wrap.appendChild(tbl); bb.appendChild(wrap);
      if (d.errors.length) {
        bb.appendChild(el('div', { style: { marginTop: '10px' }, html: `<div class="alert-group"><div class="ag-h ag-amber">⚠ ${d.errorCount} row(s) need attention</div>
          <div class="alert-list">${d.errors.slice(0, 25).map(e => `<div class="alert-item"><div><div class="ai-t">Line ${e.line}${e.work_name ? ' – ' + esc(e.work_name) : ''}</div><div class="ai-s">${esc(e.errors.join(' | '))}</div></div></div>`).join('')}</div></div>` }));
      }
      if (d.unmapped && d.unmapped.length) bb.appendChild(el('div', { class: 'small muted', style: { marginTop: '8px' }, html: `Ignored columns: ${d.unmapped.map(x => '“' + esc(x) + '”').join(', ')}` }));
      c2.appendChild(bb); out.appendChild(c2);

      setTimeout(() => {
        $('#doImport').onclick = async () => {
          const mapping = $$('.mapSel', bb).map(s => s.value);
          loading(true, 'Importing…');
          try {
            const r = await U.post('/api/import/commit', { rows: d.rows, mapping, mode: $('#importMode').value, checklist: $('#impChecklist').checked });
            loading(false);
            toast(`✓ ${r.message}`, 'ok', 6000);
            if (r.data && r.data.messages && r.data.messages.length) modal('Import notes', el('div', { html: r.data.messages.map(x => `<div class="small">• ${esc(x)}</div>`).join('') }), [{ label: 'OK', cls: 'primary' }]);
            await refreshMeta(); await loadWorks(); clear(out);
            out.appendChild(el('div', { class: 'card', html: `<div class="card-b"><div class="empty"><span class="e-i">✓</span><b>Import complete</b><br>
              <span class="small">Created ${r.created} • Updated ${r.updated} • Skipped ${r.skipped}</span><br><br>
              <button class="btn primary" onclick="location.hash='#/works'">Open Works Ledger →</button>
              <button class="btn" onclick="location.hash='#/dashboard'">Go to Dashboard</button></div></div>` }));
          } catch (e) { loading(false); toast('✗ ' + e.message, 'err', 8000); }
        };
      }, 0);
    }
    function ALIAS_FIELDS() {
      return {
        work_name: 1, est_number: 1, est_year: 1, financial_year: 1, taluka: 1, village: 1, district: 1, division: 1, sub_division: 1, section: 1,
        head_of_account: 1, head_desc: 1, nature_of_work: 1, work_type: 1, fund_source: 1, scheme_name: 1, user_department: 1, sanctioning_authority: 1,
        aa_number: 1, aa_date: 1, aa_amount: 1, ts_number: 1, ts_date: 1, est_amount: 1, revised_est_number: 1, revised_est_amount: 1, budget_provision: 1,
        tender_type: 1, tender_number: 1, tender_date: 1, agreement_number: 1, agreement_date: 1, contractor_name: 1, contractor_class: 1, contractor_contact: 1,
        wo_number: 1, wo_date: 1, wo_amount: 1, site_handover_date: 1, target_date: 1, extended_target_date: 1, physical_progress: 1, financial_progress: 1,
        amount_paid: 1, work_status: 1, bill_status: 1, utility_connection: 1, quality_inspection: 1, mb_status: 1, sd_status: 1, priority: 1, remarks: 1,
        stalled_reason: 1, delay_reason: 1, work_name_mr: 1, lat: 1, lng: 1,
      };
    }
  }

  /* ==================== VIEW: SETTINGS ==================== */
  async function vSettings() {
    const v = clear($('#view'));
    loading(true); const r = await U.get('/api/settings'); loading(false);
    const st = r.data;
    const accs = el('div');

    /* security / login credentials */
    const a0 = el('div', { class: 'acc open' });
    a0.innerHTML = `<div class="acc-h"><b>0 ▸ Login & Security (username / password)</b><span class="caret">▸</span></div>`;
    const b0 = el('div', { class: 'card-b' });
    if (st.auth && st.auth.default_password) b0.appendChild(el('div', { class: 'note-warn', html: '⚠ You are still using the default password <b>admin123</b>. Change it below before publishing the app online.' }));
    const sg = el('div', { class: 'form-grid' });
    const mkIn = (id, lbl, type, val, cls) => { const d = el('div', { class: 'fld ' + (cls || '') }); d.innerHTML = `<label>${lbl}</label>`; const i = el('input', { id, type }); if (val) i.value = val; d.appendChild(i); return d; };
    sg.appendChild(mkIn('secUser', 'Username', 'text', st.auth ? st.auth.user : 'admin', 'c4'));
    sg.appendChild(mkIn('secCur', 'Current password', 'password', '', 'c4'));
    sg.appendChild(mkIn('secNew', 'New password (min 6 chars, blank = keep)', 'password', '', 'c4'));
    b0.appendChild(sg);
    const srow = el('div', { style: { marginTop: '10px' } });
    const sbtn = el('button', { class: 'btn primary', text: '💾 Update credentials' });
    sbtn.onclick = async () => {
      const body = { current: $('#secCur').value, username: $('#secUser').value };
      if ($('#secNew').value) body.password = $('#secNew').value;
      try { const rr = await U.put('/api/auth', body); toast(rr.message || 'Updated', 'ok'); setTimeout(() => location.reload(), 900); }
      catch (e) { toast(e.message, 'err'); }
    };
    srow.appendChild(sbtn);
    b0.appendChild(srow);
    a0.appendChild(b0); accs.appendChild(a0);

    /* letterhead */
    const a1 = el('div', { class: 'acc open' });
    a1.innerHTML = `<div class="acc-h"><b>1 ▸ Report Letterhead & Signature Block (used on every PDF)</b><span class="caret">▸</span></div>`;
    const b1 = el('div', { class: 'card-b' });
    const fg = el('div', { class: 'form-grid' });
    const L = st.letterhead;
    [['line1', 'Line 1 (top)', 'c6'], ['line2', 'Line 2 (main title – Marathi)', 'c6'], ['line3', 'Line 3 (English title)', 'c6'],
      ['line4', 'Line 4 (address)', 'c6'], ['signLeft', 'Left signature block', 'c6'], ['signRight', 'Right signature block', 'c6'], ['stamp', 'Stamp / footer text', 'c6']]
      .forEach(([k, lab, span]) => {
        const f = el('div', { class: 'f ' + span }, [el('label', { text: lab })]);
        const ta = el('textarea', { id: 'lh_' + k, rows: k.startsWith('sign') ? 3 : 1 }); ta.value = L[k] || '';
        f.appendChild(ta); fg.appendChild(f);
      });
    b1.appendChild(fg);
    b1.appendChild(el('div', { class: 'btn-row', style: { marginTop: '10px' } }, [el('button', { class: 'btn primary', text: '💾 Save letterhead', onclick: saveLh })]));
    a1.appendChild(b1); accs.appendChild(a1);
    async function saveLh() {
      const lh = {}; ['line1', 'line2', 'line3', 'line4', 'signLeft', 'signRight', 'stamp'].forEach(k => lh[k] = $('#lh_' + k).value);
      try { const x = await U.put('/api/settings', { letterhead: lh }); S.letterhead = x.data.letterhead; toast('✓ Letterhead saved – used by all PDF reports', 'ok'); }
      catch (e) { toast('✗ ' + e.message, 'err'); }
    }

    /* rules */
    const a2 = el('div', { class: 'acc' });
    a2.innerHTML = `<div class="acc-h"><b>2 ▸ Automation Rules (thresholds for alerts & RAG)</b><span class="caret">▸</span></div>`;
    const b2 = el('div', { class: 'card-b' });
    const fg2 = el('div', { class: 'form-grid' });
    [['billPendingWarnDays', 'Bill pending – warning after (days)'], ['billPendingAlertDays', 'Bill pending – alert after (days)'],
      ['milestoneOverdueDays', 'Milestone overdue grace (days)'], ['completionGraceDays', 'Target delay grace (days)'],
      ['financialRedBelow', 'Financial progress below % = risk'], ['physicalGapRed', 'Physical − financial gap % = risk']]
      .forEach(([k, lab]) => {
        const f = el('div', { class: 'f c4' }, [el('label', { text: lab })]);
        f.appendChild(el('input', { type: 'number', id: 'rl_' + k, value: st.rules[k] })); fg2.appendChild(f);
      });
    b2.appendChild(fg2);
    b2.appendChild(el('div', { class: 'btn-row', style: { marginTop: '10px' } }, [el('button', { class: 'btn primary', text: '💾 Save rules', onclick: saveRules })]));
    a2.appendChild(b2); accs.appendChild(a2);
    async function saveRules() {
      const rules = {}; ['billPendingWarnDays', 'billPendingAlertDays', 'milestoneOverdueDays', 'completionGraceDays', 'financialRedBelow', 'physicalGapRed'].forEach(k => rules[k] = Number($('#rl_' + k).value) || 0);
      try { const x = await U.put('/api/settings', { rules }); S.rules = x.data.rules; toast('✓ Rules saved', 'ok'); }
      catch (e) { toast('✗ ' + e.message, 'err'); }
    }

    /* masters */
    const a3 = el('div', { class: 'acc' });
    a3.innerHTML = `<div class="acc-h"><b>3 ▸ Master Lists (तालुका, लेखाशीर्ष, divisions, contractors…)</b><span class="caret">▸</span></div>`;
    const b3 = el('div', { class: 'card-b' });
    b3.appendChild(el('div', { class: 'small muted', style: { marginBottom: '8px' }, text: 'One entry per line. These lists drive every dropdown, autocomplete, grouping and report in the application.' }));
    const groups = [['talukas', 'Talukas (तालुका)'], ['heads', 'Head of Account list'], ['divisions', 'Divisions'], ['sub_divisions', 'Sub-Divisions'],
      ['sections', 'Sections'], ['nature', 'Nature of Work'], ['funds', 'Fund Sources'], ['contractors', 'Contractors / Agencies'], ['user_departments', 'User Departments']];
    const fg3 = el('div', { class: 'form-grid' });
    groups.forEach(([k, lab]) => {
      const f = el('div', { class: 'f c4' }, [el('label', { text: `${lab} (${(st.masters[k] || []).length})` })]);
      const ta = el('textarea', { id: 'm_' + k, rows: 6, style: { fontFamily: 'var(--mono)', fontSize: '11.5px' } });
      ta.value = (st.masters[k] || []).join('\n'); f.appendChild(ta); fg3.appendChild(f);
    });
    b3.appendChild(fg3);
    b3.appendChild(el('div', { class: 'btn-row', style: { marginTop: '10px' } }, [el('button', { class: 'btn primary', text: '💾 Save master lists', onclick: saveMasters })]));
    a3.appendChild(b3); accs.appendChild(a3);
    async function saveMasters() {
      const masters = {};
      groups.forEach(([k]) => masters[k] = $('#m_' + k).value.split('\n').map(x => x.trim()).filter(Boolean));
      try { const x = await U.put('/api/settings', { masters }); S.masters = x.data.masters; await refreshMeta(); toast('✓ Master lists saved', 'ok'); }
      catch (e) { toast('✗ ' + e.message, 'err'); }
    }

    /* data management */
    const a4 = el('div', { class: 'acc' });
    a4.innerHTML = `<div class="acc-h"><b>4 ▸ Backup, Restore & Data Management</b><span class="caret">▸</span></div>`;
    const b4 = el('div', { class: 'card-b' });
    b4.innerHTML = `<div class="grid g2">
      <div><b class="small">Export / backup</b>
        <div class="btn-row" style="margin-top:6px">
          <button class="btn sm primary" id="bkDownload">⤓ Download full JSON backup</button>
          <button class="btn sm" id="bkServer">💾 Save backup on server</button>
          <button class="btn sm" id="bkCsv">⤓ Export works as CSV</button>
          <button class="btn sm green" id="bkXlsx">⤓ Export master Excel</button>
        </div>
        <div class="small muted" style="margin-top:6px">A backup contains every work, bill, milestone, document, remark and setting.</div>
        <div id="bkList" class="small" style="margin-top:8px"></div>
      </div>
      <div><b class="small">Restore / reset</b>
        <div class="btn-row" style="margin-top:6px">
          <label class="btn sm" style="cursor:pointer">⇪ Restore from JSON file<input type="file" id="restoreFile" accept=".json" style="display:none"></label>
          <button class="btn sm" id="btnSeed">＋ Load sample data</button>
          <button class="btn sm red" id="btnReset">🗑 Delete ALL data</button>
        </div>
        <div class="small muted" style="margin-top:6px">Restore replaces the current database unless you keep a copy first.</div>
        <div class="small" style="margin-top:8px">Recycle bin: <b id="binCount">${st.recycle}</b> record(s) <button class="btn tiny" id="btnBin">Open bin</button> <button class="btn tiny red" id="btnEmptyBin">Empty bin</button></div>
      </div></div>`;
    a4.appendChild(b4); accs.appendChild(a4);

    v.appendChild(accs);
    v.appendChild(el('div', { class: 'card', html: `<div class="card-b small muted">Database file: <span class="mono">data/tracker.db</span> (SQLite) •
      Server-side backups are written to <span class="mono">data/backups/</span> • Everything is stored locally in this workspace.</div>` }));

    /* accordion behaviour */
    $$('.acc-h', accs).forEach(h => h.onclick = () => h.parentElement.classList.toggle('open'));

    setTimeout(async () => {
      $('#bkDownload').onclick = () => U.download('/api/backup');
      $('#bkServer').onclick = async () => { const r = await U.post('/api/backup?save=1', {}); toast('✓ ' + r.message, 'ok'); listBackups(); };
      $('#bkCsv').onclick = exportCsv;
      $('#bkXlsx').onclick = () => exportXlsx('ledger');
      $('#btnSeed').onclick = () => confirmBox('Load sample data?', 'Sample works will be added <b>only if the database is empty</b>.', async () => {
        const r = await U.post('/api/seed', {}); toast('✓ ' + r.message, 'ok'); await refreshMeta(); await loadWorks(); vSettings();
      }, 'Load samples', 'primary');
      $('#btnReset').onclick = () => confirmBox('Delete ALL data?', 'This permanently removes every work, bill, milestone, document and remark. Download a backup first!', async () => {
        const r = await U.post('/api/reset', {}); toast('✓ ' + r.message, 'ok'); await refreshMeta(); await loadWorks(); vSettings();
      }, 'Delete everything', 'red');
      $('#restoreFile').onchange = async (e) => {
        const f = e.target.files[0]; if (!f) return;
        const txt = await f.text();
        confirmBox('Restore database?', `File <b>${esc(f.name)}</b> will <b>replace</b> all current data.`, async () => {
          try { const r = await U.post('/api/restore', { json: txt }); toast('✓ ' + r.message, 'ok'); await refreshMeta(); await loadWorks(); vSettings(); }
          catch (err) { toast('✗ ' + err.message, 'err', 8000); }
        }, 'Restore now', 'accent');
      };
      $('#btnBin').onclick = openBin;
      $('#btnEmptyBin').onclick = () => confirmBox('Empty the recycle bin?', 'Deleted works will be permanently purged.', async () => {
        const r = await U.post('/api/works/recycle/empty', {}); toast('✓ ' + r.message, 'ok'); vSettings();
      }, 'Empty bin');
      listBackups();
    }, 0);

    async function listBackups() {
      try {
        const r = await U.get('/api/backups');
        const box = $('#bkList');
        box.innerHTML = r.data.backups.length ? '<b class="small">Server backups:</b><br>' + r.data.backups.slice(0, 8).map(b =>
          `<span class="chip" style="margin:2px">${esc(b.name)} <button data-rb="${esc(b.name)}" title="Restore this backup">↺</button></span>`).join('') : '<span class="muted">No server-side backups yet.</span>';
        $$('[data-rb]', box).forEach(btn => btn.onclick = () => confirmBox('Restore this backup?', `<b>${esc(btn.dataset.rb)}</b> will replace all current data.`, async () => {
          const r2 = await U.post('/api/restore', { file: btn.dataset.rb }); toast('✓ ' + r2.message, 'ok'); await refreshMeta(); await loadWorks(); vSettings();
        }, 'Restore', 'accent'));
      } catch (e) { /* ignore */ }
    }
    async function openBin() {
      const r = await U.get('/api/recycle');
      const body = el('div');
      if (!r.data.works.length) body.innerHTML = '<div class="empty small">Recycle bin is empty.</div>';
      else {
        const t = el('table', { class: 'tbl' });
        t.innerHTML = `<thead><tr><th>#</th><th>Work</th><th>Est No</th><th>Taluka</th><th class="num">AA ₹</th><th>Deleted at</th><th></th></tr></thead>`;
        const tb = el('tbody');
        r.data.works.forEach((w, i) => tb.appendChild(el('tr', { html: `<td class="ctr">${i + 1}</td><td>${esc(w.work_name)}</td><td>${esc(w.est_number || '')}</td>
          <td>${esc(w.taluka || '')}</td><td class="num">${U.fmtNum(w.aa_amount)}</td><td class="small">${esc(w.updated_at)}</td>
          <td class="ctr nowrap"><button class="btn tiny green" data-res="${w.id}">↺ Restore</button> <button class="btn tiny red" data-pur="${w.id}">✕ Purge</button></td>` })));
        t.appendChild(tb); body.appendChild(t);
        setTimeout(() => {
          $$('[data-res]', body).forEach(b => b.onclick = async () => { await U.post(`/api/works/${b.dataset.res}/restore`, {}); toast('✓ Restored', 'ok'); closeModal(); await refreshMeta(); await loadWorks(); });
          $$('[data-pur]', body).forEach(b => b.onclick = async () => { await U.del(`/api/works/${b.dataset.pur}?hard=1`); toast('✓ Purged permanently', 'ok'); closeModal(); openBin(); });
        }, 0);
      }
      modal('Recycle Bin', body, [{ label: 'Close', cls: 'primary' }], { width: 'min(880px,96vw)' });
    }
  }

  /* ==================== VIEW: LOGS ==================== */
  async function vLogs() {
    const v = clear($('#view'));
    loading(true); const r = await U.get('/api/logs?limit=600'); loading(false);
    const logs = r.data.logs;
    const c = el('div', { class: 'card' });
    c.appendChild(el('div', { class: 'card-h', html: `<b>Audit Log</b><span class="sub">every create / update / delete / report action is recorded</span><span class="grow"></span>
      <input class="inline-sel" id="logQ" placeholder="Filter log…" style="width:200px">
      <button class="btn sm" id="logCsv">⤓ CSV</button>` }));
    const b = el('div', { class: 'card-b tight' });
    const wrap = el('div', { class: 'tbl-wrap', style: { maxHeight: 'calc(100vh - 260px)' } });
    const tbl = el('table', { class: 'tbl' });
    tbl.innerHTML = `<thead><tr><th>#</th><th>When</th><th>Action</th><th>Entity</th><th>ID</th><th>Detail</th></tr></thead>`;
    const tb = el('tbody');
    const paint = (list) => {
      clear(tb);
      list.forEach((l, i) => tb.appendChild(el('tr', { class: 'log-row', html: `<td class="ctr">${i + 1}</td><td class="nowrap small">${esc(l.created_at)}</td>
        <td><span class="badge ${/DELETE|RESET|PURGE/.test(l.action) ? 'b-red' : /CREATE|ADD|IMPORT|SEED/.test(l.action) ? 'b-green' : /REPORT/.test(l.action) ? 'b-violet' : 'b-blue'}">${esc(l.action)}</span></td>
        <td>${esc(l.entity)}</td><td class="ctr">${esc(l.entity_id)}</td><td class="small">${esc(l.detail)}</td>` })));
    };
    paint(logs);
    tbl.appendChild(tb); wrap.appendChild(tbl); b.appendChild(wrap); c.appendChild(b); v.appendChild(c);
    setTimeout(() => {
      $('#logQ').oninput = U.debounce((e) => {
        const q = e.target.value.toLowerCase();
        paint(logs.filter(l => [l.action, l.entity, l.entity_id, l.detail, l.created_at].join(' ').toLowerCase().includes(q)));
      }, 200);
      $('#logCsv').onclick = () => U.saveCsv('audit_log.csv', U.tableToCsv(['When', 'Action', 'Entity', 'ID', 'Detail'], logs.map(l => [l.created_at, l.action, l.entity, l.entity_id, l.detail])));
    }, 0);
  }

  /* ==================== VIEW: HELP ==================== */
  function vHelp() {
    const v = clear($('#view'));
    const c = el('div', { class: 'card' });
    c.appendChild(el('div', { class: 'card-h', html: '<b>User Guide, Field Reference & Keyboard Shortcuts</b>' }));
    const b = el('div', { class: 'card-b' });
    b.innerHTML = `
    <div class="grid g2">
      <div>
        <h4 style="margin:0 0 6px">How to use this tracker</h4>
        <ol class="small" style="line-height:1.8;padding-left:18px">
          <li><b>Add works</b> — use <span class="kbd">N</span> or “＋ New Work”. Only <i>Work Name</i> and <i>Taluka</i> are compulsory; everything else is derived where possible.</li>
          <li><b>Bulk entry</b> — use <b>Import Data</b>: upload an Excel/CSV file or paste rows copied straight from Excel. Headers are matched automatically (English or Marathi).</li>
          <li><b>Track progress</b> — type a new % in the Physical column of the ledger and press <span class="kbd">Enter</span>; it saves instantly and writes a progress-history point.</li>
          <li><b>Record bills</b> — open a work ▸ <b>Bills</b> tab ▸ add R.A./Final bills. Paid amounts roll up into <i>Amount Paid</i>, <i>Financial %</i> and <i>Balance</i> automatically.</li>
          <li><b>Milestones</b> — a standard 20-stage checklist is created with every work; fill planned dates and tick stages off.</li>
          <li><b>Reports</b> — pick any PDF or Excel report; the current filters (taluka, head of account, status…) are always applied.</li>
        </ol>
        <h4 style="margin:14px 0 6px">Keyboard shortcuts</h4>
        <div class="small">
          <div class="stat-line"><span>Global search</span><b><span class="kbd">Ctrl</span>+<span class="kbd">K</span></b></div>
          <div class="stat-line"><span>New work</span><b><span class="kbd">N</span></b></div>
          <div class="stat-line"><span>Dashboard</span><b><span class="kbd">D</span></b></div>
          <div class="stat-line"><span>Works ledger</span><b><span class="kbd">W</span></b></div>
          <div class="stat-line"><span>Bills</span><b><span class="kbd">B</span></b></div>
          <div class="stat-line"><span>Reports</span><b><span class="kbd">R</span></b></div>
          <div class="stat-line"><span>Alerts</span><b><span class="kbd">A</span></b></div>
          <div class="stat-line"><span>Close dialog</span><b><span class="kbd">Esc</span></b></div>
        </div>
      </div>
      <div>
        <h4 style="margin:0 0 6px">Field reference</h4>
        <table class="tbl"><tbody>
          <tr><td><b>Est Number</b></td><td>Your estimate file number (अंदाज क्र.). Duplicates are blocked.</td></tr>
          <tr><td><b>AA Amount</b></td><td>Administrative Approval amount. Defaults to the estimate amount if left blank.</td></tr>
          <tr><td><b>Est Amount (TS Amount)</b></td><td>Technical Sanction / estimate amount — both fields are kept in sync.</td></tr>
          <tr><td><b>Effective Amount</b></td><td>Revised estimate → else AA → else estimate. Used for balance &amp; utilisation.</td></tr>
          <tr><td><b>Bill Status</b></td><td>Auto-derived from the bill register unless you set it manually.</td></tr>
          <tr><td><b>Work Status</b></td><td>Auto-suggested from TS/AA/tender/WO/progress data; you can override.</td></tr>
          <tr><td><b>RAG</b></td><td>RED = delayed/stalled/bill &gt; 60 d; AMBER = at risk; GREEN = on track.</td></tr>
          <tr><td><b>Delay days</b></td><td>Days beyond target date after a ${C_RULES().completionGraceDays}-day grace.</td></tr>
          <tr><td><b>Head of Account</b></td><td>Major/minor head (e.g. 2059 02 102). Description &amp; type auto-fill.</td></tr>
        </tbody></table>
        <h4 style="margin:14px 0 6px">Automation that runs by itself</h4>
        <ul class="small" style="line-height:1.75;padding-left:18px">
          <li>Financial progress = paid ÷ effective amount (recalculated on every bill change).</li>
          <li>Amount paid = sum of paid amounts in the bill register.</li>
          <li>Bill ageing, delay days, days-to-target, RAG rating &amp; alerts.</li>
          <li>Milestone/document checklists auto-created for new works.</li>
          <li>Progress history auto-recorded on quick updates.</li>
          <li>Audit trail of every create / update / delete / report.</li>
          <li>Amount-in-words, lakh/crore conversions while typing (type <span class="mono">25L</span> or <span class="mono">2.5cr</span>).</li>
          <li>Column presets, filters, drafts and report history remembered in the browser.</li>
        </ul>
      </div>
    </div>
    <h4 style="margin:14px 0 6px">Report catalogue</h4>
    <table class="tbl"><thead><tr><th>Report</th><th>Format</th><th>What it contains</th></tr></thead><tbody>
      ${Object.entries(S.reports).map(([k, r]) => `<tr><td><b>${esc(r.title)}</b></td><td>${r.group === 'PDF' ? '<span class="badge b-red">PDF</span>' : '<span class="badge b-green">EXCEL</span>'}</td><td class="small">${esc(r.desc)}</td></tr>`).join('')}
    </tbody></table>`;
    c.appendChild(b); v.appendChild(c);
  }
  function C_RULES() { return S.rules || { completionGraceDays: 30 }; }

  /* ==================== GLOBAL BINDINGS ==================== */
  function bindGlobal() {
    $('#btnNewWork').onclick = () => go('#/workform/new');
    $('#navToggle').onclick = () => document.body.classList.toggle('side-collapsed');
    $('#btnTheme').onclick = () => { document.body.classList.toggle('dark'); localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light'); };
    if (localStorage.getItem('theme') === 'dark') document.body.classList.add('dark');
    $('#btnPrint').onclick = () => U.printView(document.title);
    $('#btnBackup').onclick = () => U.download('/api/backup');
    if (!$('#btnLogout')) {
      const lb = el('button', { class: 'btn tiny ghost', id: 'btnLogout', text: '⎋ Logout' });
      lb.onclick = async () => { await fetch('/api/logout', { method: 'POST' }); location.reload(); };
      $('#btnBackup').parentNode.insertBefore(lb, $('#btnBackup'));
    }
    $('#modalClose').onclick = closeModal;
    $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

    /* global search */
    const inp = $('#globalSearch'), drop = $('#searchDrop');
    const run = U.debounce(async () => {
      const q = inp.value.trim();
      if (q.length < 2) { drop.classList.add('hidden'); return; }
      try {
        const r = await U.get('/api/works' + U.qs({ q }));
        const list = r.data.works.slice(0, 12);
        clear(drop);
        if (!list.length) drop.appendChild(el('div', { class: 'sd-item small muted', text: 'No match' }));
        list.forEach(w => drop.appendChild(el('div', {
          class: 'sd-item', html: `<b>${esc(w.work_name)}</b>
            <div class="sd-sub"><span>${esc(w.taluka || '')}</span><span>${esc(w.est_number || '')}</span>
            <span>₹ ${U.fmtLakh(w.effective_amount)} L</span><span>${esc(w.work_status)}</span>${U.ragBadge(w.rag)}</div>`,
          onclick: () => { drop.classList.add('hidden'); inp.value = ''; go('#/work/' + w.id); },
        })));
        drop.appendChild(el('div', { class: 'sd-item small', html: `<b>${r.data.count}</b> match(es) — <a href="#" id="sdAll">see all in ledger →</a>`, onclick: (e) => { e.preventDefault(); S.filters.q = q; drop.classList.add('hidden'); go('#/works'); onFilterChange(); } }));
        drop.classList.remove('hidden');
      } catch (e) { /* ignore */ }
    }, 220);
    inp.addEventListener('input', run);
    inp.addEventListener('focus', run);
    document.addEventListener('click', (e) => { if (!e.target.closest('.search-wrap')) drop.classList.add('hidden'); });

    /* shortcuts */
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
      const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); inp.focus(); inp.select(); return; }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      const map = { n: '#/workform/new', d: '#/dashboard', w: '#/works', b: '#/bills', r: '#/reports', a: '#/alerts', m: '#/milestones' };
      const k = map[e.key.toLowerCase()];
      if (k) { e.preventDefault(); go(k); }
    });
  }

  global.APP = { S, exportPdf, exportXlsx, exportCsv, route, go, reload: boot };
  document.addEventListener('DOMContentLoaded', boot);
})(window);
