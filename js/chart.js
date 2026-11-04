// グラフ（自作の SVG。ライブラリなし）
// - 色はお店ごとに固定（CSS 変数 --series-1〜8。期間や表示を変えても塗り直さない）
// - 線 2px・点 8px（まわりに 2px の背景色のふち）・目盛りは細い実線
// - グラフをタップ（またはドラッグ）すると、いちばん近い日の値段を下に表示
// 前半は DOM に触らない純粋関数（tests/chart.test.js でテスト）

export const SERIES_SLOTS = 8;
const DAY = 86400000;

// きりのいい目盛り（例: 52〜79 → 50, 60, 70, 80）
export function niceTicks(min, max, count = 4) {
  let lo = Math.min(min, max);
  let hi = Math.max(min, max);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { lo: 0, hi: 1, step: 1, ticks: [0, 1] };
  if (hi - lo < 1e-9) {
    const pad = Math.abs(lo) * 0.1 || 1;
    lo -= pad;
    hi += pad;
  }
  // 目盛りの数が count 以下になる、いちばん細かいきりのいい刻み（1・2・5 の10倍数）
  const span = hi - lo;
  const raw = span / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((k) => k * mag).find((st) => span / st <= count + 1e-9);
  const start = Math.floor(lo / step + 1e-9) * step;
  const end = Math.ceil(hi / step - 1e-9) * step;
  const ticks = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Number(v.toFixed(10)));
  return { lo: start, hi: end, step, ticks };
}

// 目盛りの小数桁（刻みに合わせる）
export function tickDecimals(step) {
  if (step >= 1) return 0;
  return Math.min(3, Math.ceil(-Math.log10(step) - 1e-9));
}

// 'YYYY-MM-DD' ⇄ ミリ秒（UTC の0時。日付だけを扱うので時差の影響を受けない）
export function dateToMs(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function ymdOf(ms) {
  const d = new Date(ms);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

export function fmtDateMs(ms, { withYear = false } = {}) {
  const { y, m, d } = ymdOf(ms);
  return withYear ? `${y}/${m}/${d}` : `${m}/${d}`;
}

// 日付の目盛り。期間に合わせて「日」「週」「月」「年」の刻みを選ぶ
export function dateTicks(minMs, maxMs, maxTicks = 5) {
  const span = Math.max(DAY, maxMs - minMs);
  const dayCands = [1, 2, 3, 7, 14];
  for (const n of dayCands) {
    if (span / (n * DAY) <= maxTicks) {
      const ticks = [];
      // 週ごとのときも日付がそろうよう、最初の日から n 日おき
      for (let t = Math.ceil(minMs / DAY) * DAY; t <= maxMs; t += n * DAY) ticks.push({ t, label: fmtDateMs(t) });
      return ticks;
    }
  }
  const monthCands = [1, 2, 3, 6, 12, 24];
  const a = ymdOf(minMs);
  const b = ymdOf(maxMs);
  const months = (b.y - a.y) * 12 + (b.m - a.m) + 1;
  const n = monthCands.find((k) => months / k <= maxTicks) || 48;
  const ticks = [];
  let y = a.y;
  let m = a.m;
  // 最初の月初（期間の始まり以降）から n か月おき（n が 12 以上なら1月にそろえる）
  let t = Date.UTC(y, m - 1, 1);
  if (t < minMs) {
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  if (n >= 12) {
    if (m !== 1) {
      y += 1;
      m = 1;
    }
  } else {
    while ((m - 1) % n !== 0) {
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
  }
  const multiYear = a.y !== b.y;
  for (t = Date.UTC(y, m - 1, 1); t <= maxMs; ) {
    const d = ymdOf(t);
    let label = `${d.m}月`;
    if (n >= 12) label = `${d.y}年`;
    else if (multiYear && d.m === 1) label = `${d.y}年1月`;
    ticks.push({ t, label });
    let nm = d.m + n;
    let ny = d.y;
    while (nm > 12) {
      nm -= 12;
      ny += 1;
    }
    t = Date.UTC(ny, nm - 1, 1);
  }
  return ticks;
}

// 並んだ値の中で x にいちばん近いものの位置
export function nearestIndex(sortedValues, x) {
  if (!sortedValues.length) return -1;
  let lo = 0;
  let hi = sortedValues.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (sortedValues[mid] < x) lo = mid;
    else hi = mid;
  }
  return Math.abs(sortedValues[lo] - x) <= Math.abs(sortedValues[hi] - x) ? lo : hi;
}

// 色の割り当て: 先に登場した順に 1〜8 番。9番目からは「その他」（0 = 灰色）
export function assignSlots(keysInOrder) {
  const map = new Map();
  for (const k of keysInOrder) if (!map.has(k)) map.set(k, map.size < SERIES_SLOTS ? map.size + 1 : 0);
  return map;
}

// ---------------- ここから下はブラウザ専用 ----------------

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(name, attrs = {}) {
  const el = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/**
 * 折れ線グラフ（お店ごとの価格推移）
 * @param {HTMLElement} root 入れ物
 * @param {{
 *   series: {key:string, name:string, slot:number, points:{x:number, y:number, sale?:boolean, detail?:string}[]}[],
 *   xMin?:number, xMax?:number, height?:number,
 *   yFormat:(v:number, step:number)=>string, valueFormat:(v:number)=>string,
 *   label:string, hint?:string,
 * }} opts
 * @returns {{destroy:()=>void}}
 */
export function lineChart(root, opts) {
  const hidden = new Set();
  let selectedX = null;
  let lastWidth = 0;

  root.classList.add('chart');
  root.replaceChildren();
  const readout = el('div', 'chart-readout');
  readout.setAttribute('aria-live', 'polite');
  const plot = el('div', 'chart-plot');
  const legend = el('div', 'chart-legend');
  root.append(readout, plot, legend);

  const allSeries = opts.series.filter((s) => s.points.length);

  function visibleSeries() {
    return allSeries.filter((s) => !hidden.has(s.key));
  }

  function xs() {
    return [...new Set(visibleSeries().flatMap((s) => s.points.map((p) => p.x)))].sort((a, b) => a - b);
  }

  function renderReadout() {
    readout.replaceChildren();
    if (selectedX == null) {
      readout.append(el('p', 'chart-hint', opts.hint || 'グラフをタップすると、その日の値段が出ます'));
      return;
    }
    readout.append(el('p', 'chart-readout-date', fmtDateMs(selectedX, { withYear: true })));
    const list = el('ul', 'chart-readout-list');
    for (const s of visibleSeries()) {
      for (const p of s.points.filter((q) => q.x === selectedX)) {
        const li = el('li', 'chart-readout-row');
        const key = el('span', `chart-key s-${s.slot}`);
        key.setAttribute('aria-hidden', 'true');
        const value = el('strong', 'chart-readout-value', opts.valueFormat(p.y));
        const name = el('span', 'chart-readout-name', s.name);
        li.append(key, value, name);
        if (p.sale) li.append(el('span', 'badge is-sale', '特売'));
        if (p.detail) li.append(el('span', 'chart-readout-detail', p.detail));
        list.append(li);
      }
    }
    readout.append(list);
  }

  function renderLegend() {
    legend.replaceChildren();
    if (allSeries.length < 2) return; // 1店だけなら凡例はいらない（見出しで分かる）
    for (const s of allSeries) {
      const b = el('button', 'chart-legend-item');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(!hidden.has(s.key)));
      const key = el('span', `chart-key s-${s.slot}`);
      key.setAttribute('aria-hidden', 'true');
      b.append(key, el('span', 'chart-legend-name', s.name));
      b.addEventListener('click', () => {
        if (hidden.has(s.key)) hidden.delete(s.key);
        else if (visibleSeries().length > 1) hidden.add(s.key); // 全部は消さない
        if (selectedX != null && !xs().includes(selectedX)) selectedX = null;
        renderLegend();
        renderPlot();
        renderReadout();
      });
      legend.append(b);
    }
  }

  let current = null; // { crosshair, dots: [{ el, x }], sx, m, H }

  // 選んだ日の縦線と点の強調だけを更新（SVG は作り直さない。ドラッグが途切れないように）
  function updateSelection() {
    if (!current) return;
    const { crosshair, dots, sx } = current;
    if (selectedX == null) {
      crosshair.setAttribute('visibility', 'hidden');
    } else {
      const x = Math.round(sx(selectedX)) + 0.5;
      crosshair.setAttribute('x1', x);
      crosshair.setAttribute('x2', x);
      crosshair.setAttribute('visibility', 'visible');
    }
    for (const d of dots) {
      const on = d.x === selectedX;
      d.el.setAttribute('r', on ? 6 : 4);
      d.el.classList.toggle('is-active', on);
    }
  }

  function select(x) {
    if (x === selectedX) return;
    selectedX = x;
    updateSelection();
    renderReadout();
  }

  function renderPlot() {
    const W = Math.max(240, Math.round(plot.clientWidth || root.clientWidth || 340));
    lastWidth = W;
    const H = opts.height || 200;
    plot.replaceChildren();
    current = null;
    const vis = visibleSeries();
    const pts = vis.flatMap((s) => s.points);
    if (!pts.length) {
      plot.append(el('p', 'chart-empty', 'この期間の記録はありません'));
      return;
    }

    let xMin = opts.xMin ?? Math.min(...pts.map((p) => p.x));
    let xMax = opts.xMax ?? Math.max(...pts.map((p) => p.x));
    if (xMax - xMin < 2 * DAY) {
      xMin -= 3 * DAY;
      xMax += 3 * DAY;
    }
    const yTicks = niceTicks(Math.min(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.y)), 4);
    const labels = yTicks.ticks.map((v) => opts.yFormat(v, yTicks.step));
    const m = { top: 10, right: 12, bottom: 24, left: Math.max(34, Math.max(...labels.map((l) => l.length)) * 7 + 10) };
    const pw = W - m.left - m.right;
    const ph = H - m.top - m.bottom;
    const sx = (x) => m.left + ((x - xMin) / (xMax - xMin)) * pw;
    const sy = (y) => m.top + (1 - (y - yTicks.lo) / (yTicks.hi - yTicks.lo)) * ph;

    const svg = svgEl('svg', { class: 'chart-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', tabindex: 0, 'aria-label': opts.label });

    // 横の目盛り線と縦軸の数字
    const grid = svgEl('g', { class: 'chart-grid' });
    yTicks.ticks.forEach((v, i) => {
      const y = Math.round(sy(v)) + 0.5;
      grid.append(svgEl('line', { x1: m.left, x2: W - m.right, y1: y, y2: y, class: i === 0 ? 'chart-baseline' : 'chart-gridline' }));
      const t = svgEl('text', { x: m.left - 6, y: y + 4, 'text-anchor': 'end', class: 'chart-tick' });
      t.textContent = labels[i];
      grid.append(t);
    });
    // 横軸の日付
    for (const tk of dateTicks(xMin, xMax, Math.max(2, Math.floor(pw / 62)))) {
      const x = sx(tk.t);
      if (x < m.left - 0.5 || x > W - m.right + 0.5) continue;
      const t = svgEl('text', { x, y: H - 6, 'text-anchor': 'middle', class: 'chart-tick' });
      t.textContent = tk.label;
      grid.append(t);
    }
    svg.append(grid);

    // 選んだ日の縦線（線と点の下に敷く）
    const crosshair = svgEl('line', { x1: 0, x2: 0, y1: m.top, y2: H - m.bottom, class: 'chart-crosshair', visibility: 'hidden' });
    svg.append(crosshair);

    // 線と点（色はお店ごとに固定）
    const marks = svgEl('g', { class: 'chart-marks' });
    for (const s of vis) {
      const sorted = [...s.points].sort((a, b) => a.x - b.x);
      if (sorted.length > 1) {
        const d = sorted.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(' ');
        marks.append(svgEl('path', { d, class: `chart-line s-${s.slot}` }));
      }
    }
    const dots = [];
    for (const s of vis) {
      for (const p of s.points) {
        const c = svgEl('circle', { cx: sx(p.x).toFixed(1), cy: sy(p.y).toFixed(1), r: 4, class: `chart-dot s-${s.slot}${p.sale ? ' is-sale' : ''}` });
        dots.push({ el: c, x: p.x });
        marks.append(c);
      }
    }
    svg.append(marks);

    // タッチ・クリックを受ける透明な面（点より広く。どこを触ってもいちばん近い日を選ぶ）
    svg.append(svgEl('rect', { x: 0, y: 0, width: W, height: H, class: 'chart-hit' }));
    const dates = xs();
    const pick = (clientX) => {
      const rect = svg.getBoundingClientRect();
      const x = xMin + ((clientX - rect.left - m.left) / pw) * (xMax - xMin);
      const i = nearestIndex(dates, x);
      if (i >= 0) select(dates[i]);
    };
    svg.addEventListener('pointerdown', (e) => pick(e.clientX));
    svg.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse' || e.buttons) pick(e.clientX);
    });
    svg.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'Escape', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      if (e.key === 'Escape') {
        select(null);
        return;
      }
      let i = selectedX == null ? dates.length - 1 : dates.indexOf(selectedX);
      if (e.key === 'ArrowLeft') i = Math.max(0, i - 1);
      if (e.key === 'ArrowRight') i = Math.min(dates.length - 1, i + 1);
      if (e.key === 'Home') i = 0;
      if (e.key === 'End') i = dates.length - 1;
      select(dates[i]);
    });
    plot.append(svg);
    current = { crosshair, dots, sx };
    updateSelection();
  }

  renderLegend();
  renderReadout();
  renderPlot();

  // 画面の幅が変わったら描き直す
  const ro = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => {
        const w = Math.round(plot.clientWidth);
        if (w && Math.abs(w - lastWidth) > 1) renderPlot();
      })
    : null;
  ro?.observe(plot);

  return {
    destroy() {
      ro?.disconnect();
    },
  };
}
