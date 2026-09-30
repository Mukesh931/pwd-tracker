/* ==========================================================================
   charts.js – dependency-free SVG charts (donut, bars, S-curve, gauge, heat)
   ========================================================================== */
(function (global) {
  'use strict';
  const U = global.U;
  let uid = 0;
  const nid = (p) => p + (++uid);
  const PAL = ['#12314f', '#2b608f', '#0f766e', '#b3541e', '#f2b134', '#6a4bb5', '#1b6b34', '#b3261e',
    '#1f5f8b', '#8a6d3b', '#3f8f5f', '#c2571a', '#4b6584', '#8e44ad', '#16a085', '#d35400'];

  /* ---------- donut / pie ---------- */
  function donut(items, opts = {}) {
    const total = items.reduce((a, b) => a + (Number(b.value) || 0), 0);
    const size = opts.size || 190, r = size / 2, ir = opts.inner === undefined ? size * 0.32 : opts.inner;
    const id = nid('dn');
    if (!total) return `<div class="empty small">No data</div>`;
    let ang = -Math.PI / 2, paths = '', legends = '';
    items.forEach((it, i) => {
      const v = Number(it.value) || 0; if (!v) return;
      const frac = v / total, a2 = ang + frac * Math.PI * 2;
      const c = it.color || PAL[i % PAL.length];
      const large = frac > 0.5 ? 1 : 0;
      const p1 = [r + r * Math.cos(ang), r + r * Math.sin(ang)];
      const p2 = [r + r * Math.cos(a2), r + r * Math.sin(a2)];
      const p3 = [r + ir * Math.cos(a2), r + ir * Math.sin(a2)];
      const p4 = [r + ir * Math.cos(ang), r + ir * Math.sin(ang)];
      paths += `<path d="M${p1} L${p2} A${r},${r} 0 ${large} 1 ${p3} L${p4} A${ir},${ir} 0 ${large} 0 ${p1} Z"
        fill="${c}" stroke="#fff" stroke-width="1.4"><title>${U.esc(it.label)}: ${U.fmtNum(v, 0)} (${(frac * 100).toFixed(1)}%)</title></path>`;
      const mid = (ang + a2) / 2;
      if (frac > 0.055) {
        const lr = (r + ir) / 2;
        paths += `<text x="${r + lr * Math.cos(mid)}" y="${r + lr * Math.sin(mid) + 3.4}" text-anchor="middle"
          font-size="10" font-weight="700" fill="#fff">${(frac * 100).toFixed(0)}%</text>`;
      }
      legends += `<span><i style="background:${c}"></i>${U.esc(it.label)} <b>${opts.valueFmt ? opts.valueFmt(v) : U.fmtNum(v, 0)}</b></span>`;
      ang = a2;
    });
    const centre = opts.centreLabel ? `<text x="${r}" y="${r - 3}" text-anchor="middle" font-size="19" font-weight="700" fill="#12314f">${U.esc(opts.centreValue || total)}</text>
      <text x="${r}" y="${r + 13}" text-anchor="middle" font-size="9" fill="#7b8896">${U.esc(opts.centreLabel)}</text>` : '';
    return `<div class="chart-box"><svg viewBox="0 0 ${size} ${size}" style="max-height:${size}px">${paths}${centre}</svg>
      <div class="legend">${legends}</div></div>`;
  }

  /* ---------- horizontal stacked bar (group comparison) ---------- */
  function hbar(rows, opts = {}) {
    const max = Math.max(1, ...rows.map(r => (Array.isArray(r.parts) ? r.parts.reduce((a, b) => a + (Number(b.value) || 0), 0) : Number(r.value) || 0)));
    const showAmt = opts.amount !== false;
    let html = '';
    rows.forEach((r, i) => {
      const parts = r.parts || [{ value: r.value, color: r.color || PAL[i % PAL.length], label: '' }];
      const tot = parts.reduce((a, b) => a + (Number(b.value) || 0), 0);
      let segs = '';
      parts.forEach(p => {
        const w = (Number(p.value) || 0) / max * 100;
        if (w <= 0) return;
        segs += `<i style="width:${w}%;background:${p.color || PAL[i % PAL.length]}"><title>${U.esc(p.label || r.label)}: ${U.fmtNum(p.value, 0)}</title></i>`;
      });
      html += `<div class="bar-row" title="${U.esc(r.label)}">
        <span class="lbl">${U.esc(r.label)}</span>
        <span class="bar">${segs}</span>
        <span class="val">${opts.fmt ? opts.fmt(r, tot) : U.fmtNum(tot, 0)}${showAmt && r.amount !== undefined ? `<br><span class="muted tiny">₹${U.fmtLakh(r.amount)}L</span>` : ''}</span>
      </div>`;
    });
    if (opts.legendParts) {
      html += `<div class="legend">${opts.legendParts.map((p, i) => `<span><i style="background:${p.color || PAL[i % PAL.length]}"></i>${U.esc(p.label)}</span>`).join('')}</div>`;
    }
    return html || `<div class="empty small">No data</div>`;
  }

  /* ---------- vertical grouped / stacked columns ---------- */
  function vbar(rows, opts = {}) {
    const W = opts.width || 640, H = opts.height || 210, pad = { l: 38, r: 8, t: 12, b: 46 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const max = Math.max(1, ...rows.map(r => (Array.isArray(r.parts) ? r.parts.reduce((a, b) => a + (Number(b.value) || 0), 0) : Number(r.value) || 0)));
    const step = iw / Math.max(1, rows.length);
    const bw = Math.min(46, step * 0.62);
    let g = '';
    /* gridlines */
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + ih - ih * i / 4;
      g += `<line x1="${pad.l}" y1="${y}" x2="${W - pad.r}" y2="${y}" stroke="#e6ebf1" stroke-width="1"/>
            <text x="${pad.l - 5}" y="${y + 3}" text-anchor="end" font-size="8.5" fill="#7b8896">${U.fmtNum(max * i / 4, 0)}</text>`;
    }
    rows.forEach((r, i) => {
      const x = pad.l + i * step + (step - bw) / 2;
      const parts = r.parts || [{ value: r.value, color: r.color || PAL[i % PAL.length] }];
      let yAcc = 0;
      parts.forEach(p => {
        const v = Number(p.value) || 0; if (!v) return;
        const h = v / max * ih;
        g += `<rect x="${x}" y="${pad.t + ih - yAcc - h}" width="${bw}" height="${h}" rx="2" fill="${p.color || PAL[i % PAL.length]}">
              <title>${U.esc(r.label)}${p.label ? ' – ' + U.esc(p.label) : ''}: ${U.fmtNum(v, 0)}</title></rect>`;
        yAcc += h;
      });
      const lab = String(r.label || '').length > 13 ? String(r.label).slice(0, 12) + '…' : r.label;
      g += `<text x="${x + bw / 2}" y="${H - pad.b + 12}" text-anchor="middle" font-size="8.5" fill="#5a6673">${U.esc(lab)}</text>`;
      if (opts.showValue) g += `<text x="${x + bw / 2}" y="${pad.t + ih - yAcc - 3}" text-anchor="middle" font-size="8.5" font-weight="700" fill="#12314f">${U.fmtNum(yAcc ? rows[i].parts ? rows[i].parts.reduce((a, b) => a + (Number(b.value) || 0), 0) : rows[i].value : 0, 0)}</text>`;
    });
    return `<div class="chart-box"><svg viewBox="0 0 ${W} ${H}">${g}</svg>
      ${opts.legendParts ? `<div class="legend">${opts.legendParts.map((p, i) => `<span><i style="background:${p.color || PAL[i % PAL.length]}"></i>${U.esc(p.label)}</span>`).join('')}</div>` : ''}</div>`;
  }

  /* ---------- line / area (S-curve) ---------- */
  function line(series, opts = {}) {
    const W = opts.width || 660, H = opts.height || 220, pad = { l: 48, r: 14, t: 14, b: 38 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const all = series.flatMap(s => s.points.map(p => Number(p.y) || 0));
    if (!all.length) return `<div class="empty small">No data – record payments / progress points to build the curve</div>`;
    const maxY = Math.max(1, ...all) * 1.12;
    const n = Math.max(...series.map(s => s.points.length));
    const id = nid('gr');
    let g = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${series[0].color || '#2b608f'}" stop-opacity=".34"/>
      <stop offset="100%" stop-color="${series[0].color || '#2b608f'}" stop-opacity="0"/></linearGradient></defs>`;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + ih - ih * i / 4;
      g += `<line x1="${pad.l}" y1="${y}" x2="${W - pad.r}" y2="${y}" stroke="#e6ebf1"/>
        <text x="${pad.l - 6}" y="${y + 3}" text-anchor="end" font-size="8.5" fill="#7b8896">${opts.yFmt ? opts.yFmt(maxY * i / 4) : U.fmtNum(maxY * i / 4, 0)}</text>`;
    }
    series.forEach((s, si) => {
      const pts = s.points.map((p, i) => {
        const x = pad.l + (n === 1 ? iw / 2 : iw * i / (n - 1));
        const y = pad.t + ih - (Number(p.y) || 0) / maxY * ih;
        return [x, y];
      });
      const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
      if (s.area && si === 0) g += `<path d="${d} L${pts[pts.length - 1][0]} ${pad.t + ih} L${pts[0][0]} ${pad.t + ih} Z" fill="url(#${id})"/>`;
      g += `<path d="${d}" fill="none" stroke="${s.color || PAL[si % PAL.length]}" stroke-width="${s.width || 2.2}" ${s.dash ? 'stroke-dasharray="5 4"' : ''} stroke-linejoin="round"/>`;
      pts.forEach((p, i) => {
        g += `<circle cx="${p[0]}" cy="${p[1]}" r="2.8" fill="#fff" stroke="${s.color || PAL[si % PAL.length]}" stroke-width="1.8">
          <title>${U.esc(s.points[i].x)} – ${U.esc(s.label)}: ${opts.yFmt ? opts.yFmt(s.points[i].y) : U.fmtNum(s.points[i].y, 0)}</title></circle>`;
      });
    });
    const labels = series[0].points.map(p => p.x);
    const skip = Math.ceil(labels.length / 12);
    labels.forEach((l, i) => {
      if (i % skip !== 0 && i !== labels.length - 1) return;
      const x = pad.l + (labels.length === 1 ? iw / 2 : iw * i / (labels.length - 1));
      g += `<text x="${x}" y="${H - pad.b + 14}" text-anchor="middle" font-size="8.2" fill="#5a6673">${U.esc(l)}</text>`;
    });
    return `<div class="chart-box"><svg viewBox="0 0 ${W} ${H}">${g}</svg>
      <div class="legend">${series.map((s, i) => `<span><i style="background:${s.color || PAL[i % PAL.length]}"></i>${U.esc(s.label)}</span>`).join('')}</div></div>`;
  }

  /* ---------- gauge ---------- */
  function gauge(value, opts = {}) {
    const v = Math.max(0, Math.min(100, Number(value) || 0));
    const size = opts.size || 150, r = size / 2 - 12, cx = size / 2, cy = size / 2;
    const col = opts.color || (v >= 100 ? '#1b6b34' : v >= 60 ? '#2b608f' : v >= 35 ? '#a06a00' : '#b3261e');
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    const pt = (a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    const arc = (from, to, c, w) => {
      const [x1, y1] = pt(from), [x2, y2] = pt(to);
      const large = to - from > Math.PI ? 1 : 0;
      return `<path d="M${x1} ${y1} A${r} ${r} 0 ${large} 1 ${x2} ${y2}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
    };
    const va = a0 + (a1 - a0) * v / 100;
    return `<div class="chart-box" style="text-align:center"><svg viewBox="0 0 ${size} ${size}" style="max-height:${size}px">
      ${arc(a0, a1, '#e6ebf1', 12)}${v > 0 ? arc(a0, va, col, 12) : ''}
      <text x="${cx}" y="${cy + 2}" text-anchor="middle" font-size="${size * 0.2}" font-weight="700" fill="${col}">${U.round(v, 1)}%</text>
      <text x="${cx}" y="${cy + size * 0.17}" text-anchor="middle" font-size="9" fill="#7b8896">${U.esc(opts.label || '')}</text>
    </svg></div>`;
  }

  /* ---------- heat matrix ---------- */
  function heat(rows, cols, cell, opts = {}) {
    const max = Math.max(1, ...rows.flatMap(r => cols.map(c => Number(cell(r, c)) || 0)));
    let h = `<div class="heat" style="grid-template-columns:150px repeat(${cols.length},minmax(38px,1fr))">`;
    h += `<div class="hhead"></div>` + cols.map(c => `<div class="hhead" title="${U.esc(c)}">${U.esc(String(c).length > 12 ? String(c).slice(0, 11) + '…' : c)}</div>`).join('');
    rows.forEach(r => {
      h += `<div class="hhead" style="text-align:left;font-weight:600;color:var(--txt)">${U.esc(r)}</div>`;
      cols.forEach(c => {
        const v = Number(cell(r, c)) || 0;
        const alpha = v ? 0.14 + 0.86 * (v / max) : 0;
        h += `<div class="hcell" style="${v ? `background:rgba(18,49,79,${alpha.toFixed(2)});color:${alpha > 0.55 ? '#fff' : 'var(--txt)'}` : ''}" title="${U.esc(r)} × ${U.esc(c)} = ${v}">${v || ''}</div>`;
      });
    });
    return h + '</div>';
  }

  global.Charts = { donut, hbar, vbar, line, gauge, heat, PAL };
})(window);
