(() => {
'use strict';
const LW = window.LightweightCharts;
if (!LW) return;

/* =====================================================================
   TOP-LEVEL VARIABLE DECLARATIONS
   ===================================================================== */
let markersDirty = true;
let uiRafPending = false;
let dockedIndicators = [];
let sidePanelOpen = true;
let tool = 'cursor';
let pending = null;
let dotOwner = 0;
let drag = null;
let scriptEditIdx = null;
let scriptEditView = null;
let bbSelectedIdx = 0;
let currentCat = 'all';
let lastDblTime = 0;
let toastTimer = null;
let askPriceLine1 = null;
let askPriceLine2 = null;
let posLines = [];

const isF = Number.isFinite;
const nanArr = n => new Array(n).fill(NaN);

/* =====================================================================
   TOP-LEVEL DATA CONVERTERS
   ===================================================================== */
function colsOf(cs) {
  const n = (cs && cs.length) ? cs.length : 0;
  const o = {
    time: new Array(n),
    open: new Array(n),
    high: new Array(n),
    low: new Array(n),
    close: new Array(n),
    volume: new Array(n)
  };
  for (let i = 0; i < n; i++) {
    const c = cs[i];
    o.time[i] = c.time;
    o.open[i] = c.open;
    o.high[i] = c.high;
    o.low[i] = c.low;
    o.close[i] = c.close;
    o.volume[i] = c.volume;
  }
  return o;
}
window.colsOf = colsOf;
window.colsof = colsOf;

/* =====================================================================
   BROKER SPREADS & INSTRUMENTS
   ===================================================================== */
const BROKER_SPREADS = {
  FBS: { EURUSD: 0.00010, GBPUSD: 0.00013, XAUUSD: 0.31, USOIL: 0.04, UKOIL: 0.05, NAS100: 1.50, US100: 1.50, USTEC: 1.50, BTCUSD: 30.0, BTCUSDT: 30.0, defaultPips: 1.2 },
  XM: { EURUSD: 0.00017, GBPUSD: 0.00022, XAUUSD: 0.38, USOIL: 0.05, UKOIL: 0.06, NAS100: 2.00, US100: 2.00, USTEC: 2.00, BTCUSD: 32.0, BTCUSDT: 32.0, defaultPips: 1.8 },
  TICKMILL: { EURUSD: 0.00002, GBPUSD: 0.00004, XAUUSD: 0.14, USOIL: 0.03, UKOIL: 0.04, NAS100: 1.00, US100: 1.00, USTEC: 1.00, BTCUSD: 15.0, BTCUSDT: 15.0, defaultPips: 0.4 },
  OANDA: { EURUSD: 0.00014, GBPUSD: 0.00018, XAUUSD: 0.28, USOIL: 0.04, UKOIL: 0.05, NAS100: 1.80, US100: 1.80, USTEC: 1.80, BTCUSD: 25.0, BTCUSDT: 25.0, defaultPips: 1.4 },
  FXTM: { EURUSD: 0.00015, GBPUSD: 0.00019, XAUUSD: 0.32, USOIL: 0.04, UKOIL: 0.05, NAS100: 2.00, US100: 2.00, USTEC: 2.00, BTCUSD: 28.0, BTCUSDT: 28.0, defaultPips: 1.5 }
};

const INSTRUMENTS = [
  { sym: 'XAUUSD', name: 'Gold Spot / US Dollar', cat: 'metals', tag: 'MT5 GOLD' },
  { sym: 'BTCUSDT', name: 'Bitcoin / Tether Spot', cat: 'crypto', tag: 'CRYPTO' },
  { sym: 'ETHUSDT', name: 'Ethereum / Tether Spot', cat: 'crypto', tag: 'CRYPTO' },
  { sym: 'SOLUSDT', name: 'Solana / Tether Spot', cat: 'crypto', tag: 'CRYPTO' },
  { sym: 'BNBUSDT', name: 'BNB / Tether Spot', cat: 'crypto', tag: 'CRYPTO' },
  { sym: 'XRPUSDT', name: 'Ripple / Tether Spot', cat: 'crypto', tag: 'CRYPTO' },
  { sym: 'EURUSD', name: 'Euro / US Dollar', cat: 'forex', tag: 'MT5 FX' },
  { sym: 'GBPUSD', name: 'British Pound / US Dollar', cat: 'forex', tag: 'MT5 FX' },
  { sym: 'USDJPY', name: 'US Dollar / Japanese Yen', cat: 'forex', tag: 'MT5 FX' },
  { sym: 'GBPJPY', name: 'British Pound / Japanese Yen', cat: 'forex', tag: 'MT5 FX' },
  { sym: 'AUDUSD', name: 'Australian Dollar / US Dollar', cat: 'forex', tag: 'MT5 FX' },
  { sym: 'EURUSDT', name: 'Euro / Tether Spot', cat: 'forex', tag: 'SPOT FX' },
  { sym: 'GBPUSDT', name: 'British Pound / Tether Spot', cat: 'forex', tag: 'SPOT FX' },
  { sym: 'NAS100', name: 'Nasdaq 100 Index (Cash CFD)', cat: 'nasdaq', tag: 'MT5 INDEX' },
  { sym: 'US100', name: 'US Tech 100 Index', cat: 'nasdaq', tag: 'MT5 INDEX' },
  { sym: 'USTEC', name: 'US Tech 100 Spot Cash', cat: 'nasdaq', tag: 'MT5 CASH' },
  { sym: 'NQ', name: 'E-mini Nasdaq 100 Futures', cat: 'nasdaq', tag: 'FUTURES' },
  { sym: 'USOIL', name: 'WTI Crude Oil Cash / Spot', cat: 'oil', tag: 'MT5 OIL' },
  { sym: 'UKOIL', name: 'Brent Crude Oil Spot', cat: 'oil', tag: 'MT5 BRENT' },
  { sym: 'PAXGUSDT', name: 'Paxos Gold Spot (1 oz troy)', cat: 'metals', tag: 'LIVE METAL' }
];

/* =====================================================================
   CORE ENGINE: HELPERS, VIEWS, ACCOUNT & DATA LOADERS
   ===================================================================== */
const $ = id => document.getElementById(id);
function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') e[k] = v;
    else e.setAttribute(k, v);
  }
  for (const k of kids.flat()) {
    if (k == null || k === false) continue;
    e.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
  return e;
}
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};

const TF = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 };
const C = { up: '#00e5a0', dn: '#ff3d71' };
const S = Object.assign({
  symbol: 'XAUUSD', tf: '15m', tf2: '15m', range: 'year', source: 'auto', speed: 2,
  replayOn: true, spreadOn: true, broker: 'XM', layout: 'single', dockInd: false, dockWidth: 320, prec: 2
}, store.get('tfx_settings', {}));
if (!TF[S.tf]) S.tf = '15m';
if (!TF[S.tf2]) S.tf2 = S.tf;

S.replayOn = true;

function saveSettings() { S.tf = V1.tf; S.tf2 = V2.tf; store.set('tfx_settings', S); }

const A = Object.assign({ balance: 10000, startBal: 10000, positions: [], history: [], nextId: 1 }, store.get('tfx_acct', {}));
function saveAcct() {
  store.set('tfx_acct', { balance: A.balance, startBal: A.startBal, nextId: A.nextId,
    positions: A.positions.map(p => Object.assign({}, p, { ui: false })), history: A.history.slice(0, 500) });
}
const R = { i: 0, k: 0, N: 8, playing: false, timer: null, ph: 0, pl: 0, speed: 2 };
const Pz = { last: 0, bid: 0, ask: 0, spread: 0, time: 0 };
const dom = {};
function initDomCache() {
  ['accBal', 'accEq', 'accUpl', 'accMar', 'accFree', 'accNet', 'btnBuy', 'btnSell', 'stPrice', 'stSpread', 'stData', 'stSrc', 'repInfo', 'loading', 'loadTxt']
    .forEach(id => dom[id] = $(id));
}
let activeChartIndex = 1;

function makeChart(id) {
  const chart = LW.createChart($(id), {
    autoSize: true,
    layout: { background: { type: LW.ColorType.Solid, color: '#0b0e1a' }, textColor: '#7f89b3', fontFamily: 'Inter, system-ui, sans-serif' },
    grid: { vertLines: { color: 'rgba(29,35,66,0.45)' }, horzLines: { color: 'rgba(29,35,66,0.45)' } },
    crosshair: { mode: LW.CrosshairMode.Normal },
    rightPriceScale: { borderColor: '#1d2342' },
    timeScale: { borderColor: '#1d2342', timeVisible: true, secondsVisible: false }
  });
  const candleSeries = chart.addSeries(LW.CandlestickSeries, { upColor: C.up, downColor: C.dn, borderVisible: false, wickUpColor: C.up, wickDownColor: C.dn }, 0);
  const volSeries = chart.addSeries(LW.HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol', priceLineVisible: false, lastValueVisible: false }, 0);
  chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
  const markersApi = LW.createSeriesMarkers(candleSeries, []);
  return { chart, candleSeries, volSeries, markersApi };
}
const C1 = makeChart('chart'), C2 = makeChart('chart2');

function mkView(n) {
  const tf = n === 1 ? S.tf : S.tf2;
  return { n, c: n === 1 ? C1 : C2, elId: n === 1 ? 'chart' : 'chart2', paneId: n === 1 ? 'paneChart1' : 'paneChart2',
    legId: n === 1 ? 'legend' : 'legend2', svgId: n === 1 ? 'rulerSvg1' : 'rulerSvg2',
    tf, tfSec: TF[tf], candles: [], cols: colsOf([]), IND: [], drawings: [], posLines: [], askLine: null,
    hidden: false, done: 0, form: null, agg: null, key: '', ruler: null, crossIdx: null, crossBar: null,
    srcUsed: '', layer: null, posEls: null };
}
const V1 = mkView(1), V2 = mkView(2), VIEWS = [V1, V2];
const AV = () => (activeChartIndex === 2 && S.layout !== 'single') ? V2 : V1;
const master = () => V1;
const viewsNeeded = () => S.layout === 'single' ? [V1] : [V1, V2];
const visCount = v => Math.min(v.done || 0, v.candles ? v.candles.length : 0);
const keyOf = v => `${S.symbol}|${v.tf}|${S.range}|${S.source}`;

function shownLastTime(v) {
  const cs = v.candles; if (!cs || !cs.length) return 0;
  if (v.form) return v.form.time;
  const n = visCount(v); return n > 0 ? cs[n - 1].time : 0;
}
function snapTime(v, t) {
  const cs = v.candles; if (!cs || !cs.length || t == null) return -1;
  let lo = 0, hi = cs.length - 1, r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (cs[m].time <= t) { r = m; lo = m + 1; } else hi = m - 1; }
  return r < 0 ? -1 : cs[r].time;
}

const signed = n => (n > 0 ? '+' : '') + (+n || 0).toFixed(2);
const fmtP = x => (x == null || !isF(x)) ? '–' : (+x).toFixed(S.prec);
const fmtMoney = x => (+x || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDT = t => new Date(t * 1000).toISOString().replace('T', ' ').slice(0, 16);
const candleBar = c => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close });
const volBar = (c, vol) => ({ time: c.time, value: vol, color: c.close >= c.open ? 'rgba(0,229,160,.35)' : 'rgba(255,61,113,.35)' });

function toast(msg) {
  const t = $('toast'); if (!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

function setPrecision() {
  const cs = master().candles; if (!cs || !cs.length) return;
  const p = cs[cs.length - 1].close;
  S.prec = p >= 1000 ? 2 : p >= 10 ? 3 : p >= 1 ? 5 : 6;
  VIEWS.forEach(v => v.c.candleSeries.applyOptions({ priceFormat: { type: 'price', precision: S.prec, minMove: Math.pow(10, -S.prec) } }));
}

function updateBidAsk(price) {
  if (!price) return;
  Pz.last = price; Pz.bid = price;
  if (S.spreadOn) {
    const tbl = BROKER_SPREADS[S.broker] || BROKER_SPREADS.XM;
    let sp = tbl[S.symbol];
    if (sp == null) sp = (tbl.defaultPips || 1) * (S.prec >= 3 ? Math.pow(10, -(S.prec - 1)) : 0.1);
    Pz.spread = sp; Pz.ask = price + sp;
  } else { Pz.spread = 0; Pz.ask = price; }
}

function zoomChart(f) {
  const ts = AV().c.chart.timeScale(), r = ts.getVisibleLogicalRange(); if (!r) return;
  const mid = (r.from + r.to) / 2, half = (r.to - r.from) / 2 * f;
  ts.setVisibleLogicalRange({ from: mid - half, to: mid + half });
}

const _cache = new Map();
const BMAP = { XAUUSD: 'PAXGUSDT', EURUSD: 'EURUSDT', GBPUSD: 'GBPUSDT' };
function rangeStart(tfSec) {
  const now = Date.now() / 1000; let s;
  if (S.range === '30d') s = now - 30 * 86400;
  else if (S.range === '90d') s = now - 90 * 86400;
  else s = Date.UTC(new Date().getUTCFullYear(), 0, 1) / 1000;
  return Math.floor(Math.max(s, now - 40000 * tfSec) / tfSec) * tfSec;
}
async function fetchBinance(sym, tf, start) {
  let lastErr;
  for (const base of ['https://api.binance.com', 'https://data-api.binance.vision']) {
    try {
      const out = []; let t = start * 1000;
      for (let pg = 0; pg < 60; pg++) {
        const r = await fetch(`${base}/api/v3/klines?symbol=${sym}&interval=${tf}&startTime=${t}&limit=1000`);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const a = await r.json(); if (!a.length) break;
        for (const k of a) out.push({ time: Math.floor(k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] });
        t = a[a.length - 1][0] + 1; if (a.length < 1000) break;
      }
      if (!out.length) throw new Error('No data');
      return out;
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}
function demoCandles(sym, tfSec, start) {
  const base = { XAUUSD: 4000, PAXGUSDT: 4000, BTCUSDT: 90000, ETHUSDT: 3500, SOLUSDT: 180, BNBUSDT: 650, XRPUSDT: 2.2, EURUSD: 1.08, GBPUSD: 1.27,
    USDJPY: 150, GBPJPY: 190, AUDUSD: 0.66, EURUSDT: 1.08, GBPUSDT: 1.27, NAS100: 20000, US100: 20000, USTEC: 20000, NQ: 20000, USOIL: 75, UKOIL: 80 }[sym] || 100;
  let h = 0; for (const ch of sym + tfSec) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => { h |= 0; h = h + 0x6D2B79F5 | 0; let t = Math.imul(h ^ h >>> 15, 1 | h); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const g = () => { let u = 0; for (let i = 0; i < 6; i++) u += rnd(); return (u - 3) / Math.sqrt(0.5); };
  const now = Math.floor(Date.now() / 1000 / tfSec) * tfSec, vol = base * 0.0007 * Math.sqrt(tfSec / 900), out = [];
  let prev = base, i = 0;
  for (let t = start; t < now && i < 40000; t += tfSec, i++) {
    const o = prev, cl = Math.max(base * 0.05, o + o * 0 + vol * g() + Math.sin(i / 400) * vol * 0.1);
    const hi = Math.max(o, cl) + Math.abs(g()) * vol * 0.5, lo = Math.min(o, cl) - Math.abs(g()) * vol * 0.5;
    out.push({ time: t, open: o, high: hi, low: Math.max(lo, 0.0001), close: cl, volume: Math.round(100 + rnd() * 900) });
    prev = cl;
  }
  return out;
}
async function loadData(tf, force) {
  const tfSec = TF[tf], start = rangeStart(tfSec), key = `${S.symbol}|${tf}|${S.range}|${S.source}`;
  if (!force && _cache.has(key)) return _cache.get(key);
  let res = null;
  const sym = BMAP[S.symbol] || (/USDT$/.test(S.symbol) ? S.symbol : null);
  if (S.source !== 'demo') {
    try {
      if (!sym) throw new Error(S.symbol + ' is not available on Binance');
      res = { candles: await fetchBinance(sym, tf, start), source: 'BINANCE ' + sym };
    } catch (e) { if (S.source === 'binance') throw e; console.warn('Binance failed, using demo:', e.message); }
  }
  if (!res) res = { candles: demoCandles(S.symbol, tfSec, start), source: 'DEMO' };
  _cache.set(key, res); return res;
}

const TEMPLATES = {
  'EMA Cross (9/21)': `indicator({ name: 'EMA Cross', overlay: true });
plot(ta.ema(close, 9), { title: 'EMA 9', color: '#00e5a0' });
plot(ta.ema(close, 21), { title: 'EMA 21', color: '#ff3d71' });`,
  'ATR (14)': `indicator({ name: 'ATR 14', overlay: false });
plot(ta.atr(high, low, close, 14), { title: 'ATR', color: '#ffd43b' });`,
  'Momentum (10)': `indicator({ name: 'Momentum 10', overlay: false });
const m = close.map((v, i) => i >= 10 ? v - close[i - 10] : NaN);
plot(m, { title: 'MOM', color: '#00f0ff', style: 'histogram' });
hline(0, { color: '#4a5380' });`
};

setTimeout(() => {
  const tplSel = $('tplSel');
  if (tplSel) Object.keys(TEMPLATES).forEach(k => tplSel.append(el('option', { value: k }, k)));

  VIEWS.forEach(v => {
    v.c.chart.subscribeClick(p => { if (viewsNeeded().includes(v)) handleDrawingClick(p, v); });
    v.c.chart.subscribeCrosshairMove(p => { rulerMove(v, p); followDot(v, p); });
    v.c.chart.timeScale().subscribeVisibleLogicalRangeChange(() => redrawRulers());
  });

  const toggleDock = on => {
    S.dockInd = on; saveSettings();
    rebuildIndicatorSeries(V1); renderAll();
    setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
  };
  $('btnToggleDock').onclick = () => toggleDock(!S.dockInd);
  $('btnCloseDock').onclick = () => toggleDock(false);

  const rz = $('dockHResizer');
  if (rz) {
    rz.addEventListener('pointerdown', e => {
      e.preventDefault(); rz.classList.add('dragging');
      const sx = e.clientX, sw = $('indDock').clientWidth;
      const mv = ev => { S.dockWidth = Math.max(220, Math.min(550, sw + ev.clientX - sx)); $('indDock').style.width = S.dockWidth + 'px'; syncDockedChartsRange(); };
      const up = () => { rz.classList.remove('dragging'); window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); saveSettings(); };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    });
  }
}, 0);

/* =====================================================================
   TECHNICAL ANALYSIS (TA) LIBRARY
   ===================================================================== */
const ta = {
  sma(src, len) {
    const n = src.length, out = nanArr(n); let sum = 0, bad = 0;
    for (let i = 0; i < n; i++) {
      const v = src[i]; if (isF(v)) sum += v; else bad++;
      if (i >= len) { const u = src[i - len]; if (isF(u)) sum -= u; else bad--; }
      if (i >= len - 1 && bad === 0) out[i] = sum / len;
    }
    return out;
  },
  ema(src, len, alpha) {
    const n = src.length, out = nanArr(n), a = alpha || (2 / (len + 1));
    let cnt = 0, sum = 0, prev = NaN;
    for (let i = 0; i < n; i++) {
      const v = src[i];
      if (!isF(prev)) {
        if (isF(v)) { cnt++; sum += v; if (cnt === len) { prev = sum / len; out[i] = prev; } }
        else { cnt = 0; sum = 0; }
      } else if (isF(v)) { prev = a * v + (1 - a) * prev; out[i] = prev; }
    }
    return out;
  },
  rma(src, len) { return ta.ema(src, len, 1 / len); },
  smma(src, len) { return ta.rma(src, len); },
  wma(src, len) {
    const n = src.length, out = nanArr(n), den = len * (len + 1) / 2;
    for (let i = len - 1; i < n; i++) {
      let s = 0, ok = true;
      for (let j = 0; j < len; j++) { const v = src[i - len + 1 + j]; if (!isF(v)) { ok = false; break; } s += v * (j + 1); }
      if (ok) out[i] = s / den;
    }
    return out;
  },
  stdev(src, len) {
    const n = src.length, out = nanArr(n);
    let sum = 0, sumSq = 0, bad = 0;
    for (let i = 0; i < n; i++) {
      const v = src[i];
      if (isF(v)) { sum += v; sumSq += v * v; } else bad++;
      if (i >= len) {
        const u = src[i - len];
        if (isF(u)) { sum -= u; sumSq -= u * u; } else bad--;
      }
      if (i >= len - 1 && bad === 0) {
        const mean = sum / len;
        const variance = Math.max(0, (sumSq / len) - (mean * mean));
        out[i] = Math.sqrt(variance);
      }
    }
    return out;
  },
  highest(src, len) {
    const n = src.length, out = nanArr(n);
    for (let i = len - 1; i < n; i++) {
      let m = -Infinity;
      for (let j = 0; j < len; j++) { const v = src[i - j]; if (v > m) m = v; }
      out[i] = m;
    }
    return out;
  },
  lowest(src, len) {
    const n = src.length, out = nanArr(n);
    for (let i = len - 1; i < n; i++) {
      let m = Infinity;
      for (let j = 0; j < len; j++) { const v = src[i - j]; if (v < m) m = v; }
      out[i] = m;
    }
    return out;
  },
  tr(h, l, c) {
    const n = h.length, out = nanArr(n);
    for (let i = 0; i < n; i++) out[i] = i === 0 ? h[i] - l[i] : Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]));
    return out;
  },
  atr(h, l, c, len = 14) { return ta.rma(ta.tr(h, l, c), len); },
  rsi(src, len = 14) {
    const n = src.length, up = nanArr(n), dn = nanArr(n), out = nanArr(n);
    for (let i = 1; i < n; i++) { const d = src[i] - src[i - 1]; if (isF(d)) { up[i] = Math.max(d, 0); dn[i] = Math.max(-d, 0); } }
    const ru = ta.rma(up, len), rd = ta.rma(dn, len);
    for (let i = 0; i < n; i++) if (isF(ru[i]) && isF(rd[i])) out[i] = rd[i] === 0 ? 100 : 100 - 100 / (1 + ru[i] / rd[i]);
    return out;
  },
  macd(src, f = 12, s = 26, sig = 9) {
    const ef = ta.ema(src, f), es = ta.ema(src, s), n = src.length, m = nanArr(n);
    for (let i = 0; i < n; i++) if (isF(ef[i]) && isF(es[i])) m[i] = ef[i] - es[i];
    const sg = ta.sma(m, sig), h = nanArr(n);
    for (let i = 0; i < n; i++) if (isF(m[i]) && isF(sg[i])) h[i] = m[i] - sg[i];
    return { macd: m, signal: sg, hist: h };
  },
  osma(src, f = 12, s = 6, sig = 9) {
    const ef = ta.ema(src, f), es = ta.ema(src, s), n = src.length, m = nanArr(n);
    for (let i = 0; i < n; i++) if (isF(ef[i]) && isF(es[i])) m[i] = ef[i] - es[i];
    const sg = ta.sma(m, sig), out = nanArr(n);
    for (let i = 0; i < n; i++) if (isF(m[i]) && isF(sg[i])) out[i] = m[i] - sg[i];
    return out;
  },
  bb(src, len = 20, mult = 2) {
    const mid = ta.sma(src, len), sd = ta.stdev(src, len), n = src.length, up = nanArr(n), lo = nanArr(n);
    for (let i = 0; i < n; i++) if (isF(mid[i]) && isF(sd[i])) { up[i] = mid[i] + mult * sd[i]; lo[i] = mid[i] - mult * sd[i]; }
    return { mid, upper: up, lower: lo };
  },
  supertrend(h, l, c, len = 10, mult = 3) {
    const n = c.length, atr = ta.atr(h, l, c, len), up = nanArr(n), down = nanArr(n);
    let fub = NaN, flb = NaN, dir = 1, started = false;
    for (let i = 0; i < n; i++) {
      if (!isF(atr[i])) continue;
      const hl2 = (h[i] + l[i]) / 2, ub = hl2 + mult * atr[i], lb = hl2 - mult * atr[i];
      if (!started) { ub; flb = lb; dir = 1; started = true; }
      else {
        const pf = fub, pl = flb;
        fub = (ub < pf || c[i - 1] > pf) ? ub : pf;
        flb = (lb > pl || c[i - 1] < pl) ? lb : pl;
        if (dir === -1 && c[i] > fub) dir = 1; else if (dir === 1 && c[i] < flb) dir = -1;
      }
      if (dir === 1) up[i] = flb; else down[i] = fub;
    }
    return { up, down };
  }
};

function partialCandle(c, k, N) {
  if (k >= N) return { time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume };
  const bull = c.close >= c.open;
  const pts = [c.open, bull ? c.low : c.high, bull ? c.high : c.low, c.close];
  const t = k / N * 3, s = Math.min(2, Math.floor(t)), u = t - s;
  const price = pts[s] + (pts[s + 1] - pts[s]) * u;
  let hi = c.open, lo = c.open;
  for (let j = 1; j <= s; j++) { hi = Math.max(hi, pts[j]); lo = Math.min(lo, pts[j]); }
  hi = Math.max(hi, price); lo = Math.min(lo, price);
  return { time: c.time, open: c.open, high: hi, low: lo, close: price, volume: c.volume * k / N };
}

function runScript(code, cols) {
  const n = cols.close.length;
  const spec = { name: 'Script', overlay: true, plots: [], hlines: [], markers: [] };
  const api = {
    indicator: (o = {}) => { if (o.name) spec.name = String(o.name); if (o.overlay !== undefined) spec.overlay = !!o.overlay; },
    plot: (values, o = {}) => {
      if (!values || typeof values.length !== 'number') throw new Error('plot(): array required');
      spec.plots.push({ title: o.title || 'Plot', values: Array.from(values), color: o.color || '#00f0ff',
        type: o.style === 'histogram' ? 'histogram' : 'line', lineWidth: o.lineWidth || 2, colors: o.colors || null });
    },
    hline: (price, o = {}) => { spec.hlines.push({ price, color: o.color || '#7f89b3', title: o.title || '' }); }
  };
  const hl2 = cols.high.map((h, i) => (h + cols.low[i]) / 2);
  const hlc3 = cols.high.map((h, i) => (h + cols.low[i] + cols.close[i]) / 3);
  const ohlc4 = cols.high.map((h, i) => (cols.open[i] + h + cols.low[i] + cols.close[i]) / 4);
  const fn = new Function('time', 'open', 'high', 'low', 'close', 'volume', 'hl2', 'hlc3', 'ohlc4', 'n', 'ta', 'indicator', 'plot', 'hline',
    '"use strict";\n' + code);
  fn(cols.time, cols.open, cols.high, cols.low, cols.close, cols.volume, hl2, hlc3, ohlc4, n, ta, api.indicator, api.plot, api.hline);
  return spec;
}

const line = (title, values, color, w = 2) => ({ title, values, color, type: 'line', lineWidth: w });

const BUILTIN = {
  sma: { name: 'SMA', params: [{ k:'len', l:'Length', t:'num', d:50, min:1 }, { k:'color', l:'Color', t:'color', d:'#ffd43b' }], run: (c, p) => ({ overlay: true, plots: [line('SMA ' + p.len, ta.sma(c.close, p.len), p.color)] }) },
  ema: { name: 'EMA', params: [{ k:'len', l:'Length', t:'num', d:21, min:1 }, { k:'color', l:'Color', t:'color', d:'#00f0ff' }], run: (c, p) => ({ overlay: true, plots: [line('EMA ' + p.len, ta.ema(c.close, p.len), p.color)] }) },
  bb: { name: 'Bollinger Bands', params: [{ k:'len', l:'Length', t:'num', d:20, min:1 }, { k:'mult', l:'StdDev', t:'num', d:2, min:0.1, step:0.1 }, { k:'color', l:'Color', t:'color', d:'#8a2be2' }],
    run: (c, p) => { const b = ta.bb(c.close, p.len, p.mult); return { overlay: true, plots: [line('Upper', b.upper, p.color, 1), line('Basis', b.mid, '#ff2bd6', 1), line('Lower', b.lower, p.color, 1)] }; } },
  rsi: { name: 'RSI', params: [{ k:'len', l:'Length', t:'num', d:14, min:1 }, { k:'color', l:'Color', t:'color', d:'#b388ff' }], run: (c, p) => ({ overlay: false, precision: 2, plots: [line('RSI ' + p.len, ta.rsi(c.close, p.len), p.color)], hlines: [{ price: 70, color: '#ff3d71' }, { price: 30, color: '#00e5a0' }] }) },
  macd: { name: 'MACD', params: [{ k:'f', l:'Fast', t:'num', d:12, min:1 }, { k:'s', l:'Slow', t:'num', d:26, min:2 }, { k:'g', l:'Signal', t:'num', d:9, min:1 }],
    run: (c, p) => {
      const m = ta.macd(c.close, p.f, p.s, p.g);
      const colors = m.hist.map((h, i) => !isF(h) ? null : h >= 0 ? (h >= (m.hist[i - 1] || 0) ? '#26d9a8' : '#8fe8cf') : (h <= (m.hist[i - 1] || 0) ? '#ff3d71' : '#ff94ad'));
      return { overlay: false, plots: [{ title: 'Hist', values: m.hist, color: '#26d9a8', type: 'histogram', colors }, line('MACD', m.macd, '#00f0ff', 1.5), line('Signal', m.signal, '#ff2bd6', 1.5)] };
    } },
  osma: {
    name: 'OsMA (12, 6, 9)',
    params: [
      { k:'f', l:'Fast EMA', t:'num', d:12, min:1 },
      { k:'s', l:'Slow EMA', t:'num', d:6, min:1 },
      { k:'sig', l:'Signal SMA', t:'num', d:9, min:1 }
    ],
    run: (c, p) => {
      const vals = ta.osma(c.close, p.f, p.s, p.sig);
      const colors = vals.map((v, i) => !isF(v) ? null : v >= (vals[i - 1] || 0) ? '#00e5a0' : '#ff3d71');
      return {
        overlay: false,
        plots: [{ title: 'OsMA', values: vals, color: '#00e5a0', type: 'histogram', colors }],
        hlines: [{ price: 0, color: '#4a5380', title: '0.0' }]
      };
    }
  },
  supertrend: { name: 'Supertrend', params: [{ k:'len', l:'Length', t:'num', d:10, min:1 }, { k:'mult', l:'Mult', t:'num', d:3, min:0.1, step:0.1 }],
    run: (c, p) => { const s = ta.supertrend(c.high, c.low, c.close, p.len, p.mult); return { overlay: true, plots: [line('ST up', s.up, '#00e5a0', 2), line('ST down', s.down, '#ff3d71', 2)] }; } },
  bearspower: {
    name: 'Bears Power (MT5)',
    params: [{ k:'len', l:'Period', t:'num', d:13, min:1 }, { k:'color', l:'Color', t:'color', d:'#ff3d71' }],
    run: (c, p) => {
      const ema = ta.ema(c.close, p.len);
      const vals = c.low.map((l, i) => isF(ema[i]) ? l - ema[i] : NaN);
      const colors = vals.map((v, i) => !isF(v) ? null : v >= (vals[i - 1] || 0) ? '#ff6b8b' : '#ff3d71');
      return { overlay: false, plots: [{ title: 'Bears (' + p.len + ')', values: vals, color: p.color, type: 'histogram', colors }], hlines: [{ price: 0, color: '#4a5380', title: '0.0' }] };
    }
  },
  bullspower: {
    name: 'Bulls Power (MT5)',
    params: [{ k:'len', l:'Period', t:'num', d:13, min:1 }, { k:'color', l:'Color', t:'color', d:'#00e5a0' }],
    run: (c, p) => {
      const ema = ta.ema(c.close, p.len);
      const vals = c.high.map((h, i) => isF(ema[i]) ? h - ema[i] : NaN);
      const colors = vals.map((v, i) => !isF(v) ? null : v >= (vals[i - 1] || 0) ? '#00e5a0' : '#00996b');
      return { overlay: false, plots: [{ title: 'Bulls (' + p.len + ')', values: vals, color: p.color, type: 'histogram', colors }], hlines: [{ price: 0, color: '#4a5380', title: '0.0' }] };
    }
  },
  demarker: {
    name: 'DeMarker (MT5)',
    params: [{ k:'len', l:'Period', t:'num', d:14, min:1 }, { k:'color', l:'Color', t:'color', d:'#00f0ff' }],
    run: (c, p) => {
      const n = c.high.length, dMax = nanArr(n), dMin = nanArr(n), out = nanArr(n);
      for (let i = 1; i < n; i++) {
        dMax[i] = c.high[i] > c.high[i - 1] ? (c.high[i] - c.high[i - 1]) : 0;
        dMin[i] = c.low[i] < c.low[i - 1] ? (c.low[i - 1] - c.low[i]) : 0;
      }
      const sMax = ta.sma(dMax, p.len);
      const sMin = ta.sma(dMin, p.len);
      for (let i = 0; i < n; i++) {
        if (isF(sMax[i]) && isF(sMin[i])) {
          const den = sMax[i] + sMin[i];
          out[i] = den === 0 ? 0.5 : (sMax[i] / den);
        }
      }
      return {
        overlay: false,
        precision: 3,
        plots: [line('DeM (' + p.len + ')', out, p.color, 2)],
        hlines: [
          { price: 0.70, color: '#ff3d71', title: '0.70' },
          { price: 0.50, color: '#4a5380', title: '0.50' },
          { price: 0.30, color: '#00e5a0', title: '0.30' }
        ]
      };
    }
  },
  ao: {
    name: 'Awesome Oscillator (AO)',
    params: [{ k:'f', l:'Fast SMA', t:'num', d:5, min:1 }, { k:'s', l:'Slow SMA', t:'num', d:34, min:2 }],
    run: (c, p) => {
      const med = c.high.map((h, i) => (h + c.low[i]) / 2);
      const sf = ta.sma(med, p.f), ss = ta.sma(med, p.s), n = med.length, vals = nanArr(n);
      for (let i = 0; i < n; i++) if (isF(sf[i]) && isF(ss[i])) vals[i] = sf[i] - ss[i];
      const colors = vals.map((v, i) => !isF(v) ? null : v >= (vals[i - 1] || 0) ? '#00e5a0' : '#ff3d71');
      return { overlay: false, plots: [{ title: 'AO', values: vals, color: '#00e5a0', type: 'histogram', colors }], hlines: [{ price: 0, color: '#4a5380', title: '0.0' }] };
    }
  },
  alligator_hist: {
    name: 'Gator Oscillator (Histogram)',
    params: [],
    run: (c) => {
      const med = c.high.map((h, i) => (h + c.low[i]) / 2);
      const jaw = ta.smma(med, 13), teeth = ta.smma(med, 8), lips = ta.smma(med, 5), n = med.length;
      const up = nanArr(n), dn = nanArr(n);
      for (let i = 0; i < n; i++) {
        if (isF(jaw[i]) && isF(teeth[i])) up[i] = Math.abs(jaw[i] - teeth[i]);
        if (isF(teeth[i]) && isF(lips[i])) dn[i] = -Math.abs(teeth[i] - lips[i]);
      }
      const colUp = up.map((v, i) => !isF(v) ? null : v >= (up[i - 1] || 0) ? '#00e5a0' : '#ff3d71');
      const colDn = dn.map((v, i) => !isF(v) ? null : Math.abs(v) >= Math.abs(dn[i - 1] || 0) ? '#00e5a0' : '#ff3d71');
      return {
        overlay: false,
        plots: [
          { title: 'Gator Upper', values: up, color: '#00e5a0', type: 'histogram', colors: colUp },
          { title: 'Gator Lower', values: dn, color: '#ff3d71', type: 'histogram', colors: colDn }
        ],
        hlines: [{ price: 0, color: '#4a5380', title: '0.0' }]
      };
    }
  },
  alligator: {
    name: 'Alligator (Lines)',
    params: [],
    run: (c) => {
      const med = c.high.map((h, i) => (h + c.low[i]) / 2);
      return { overlay: true, plots: [line('Jaw (13)', ta.smma(med, 13), '#2962ff', 2), line('Teeth (8)', ta.smma(med, 8), '#ff3d71', 2), line('Lips (5)', ta.smma(med, 5), '#00e5a0', 2)] };
    }
  }
};

/* Dock is controlled ONLY by the "Dock Left" button (S.dockInd).
   ON  = all bottom indicators go to the left dock.
   OFF = all indicators stay on the chart. */
function isDockActive() {
  return typeof S !== 'undefined' && !!S.dockInd;
}
window.isDockActive = isDockActive;

function updateDockVisibility() {
  const active = isDockActive();
  const dock = $('indDock');
  const btn = $('btnToggleDock');
  if (dock) {
    dock.style.display = active ? 'flex' : 'none';
    if (active) dock.style.width = ((typeof S !== 'undefined' && S.dockWidth) || 320) + 'px';
  }
  if (btn) btn.classList.toggle('on', active);
}
window.updateDockVisibility = updateDockVisibility;

function destroyDockedIndicators() {
  dockedIndicators.forEach(d => {
    try { d.chart.remove(); } catch {}
  });
  dockedIndicators = [];
  const listEl = $('indDockList');
  if (listEl) listEl.innerHTML = '';
  const badge = $('dockCountBadge');
  if (badge) badge.textContent = '0';
}
window.destroyDockedIndicators = destroyDockedIndicators;

function sizePanes(v) {
  if (!v) {
    if (typeof viewsNeeded === 'function') viewsNeeded().forEach(sizePanes);
    return;
  }
  try {
    const ps = v.c.chart.panes();
    if (ps.length < 2) return;
    const total = $(v.elId).clientHeight - 34, sub = Math.max(80, Math.round(total / (ps.length + 1.5)));
    ps.slice(1).forEach(p => p.setHeight(sub));
    ps[0].setHeight(Math.max(160, total - sub * (ps.length - 1)));
  } catch {}
}
window.sizePanes = sizePanes;

function computeInd(v, ind) {
  if (!ind && v && v.type) {
    ind = v;
    v = (typeof V1 !== 'undefined') ? V1 : null;
  }
  if (!v && typeof V1 !== 'undefined') v = V1;
  if (!ind) return;

  ind.error = null;
  try {
    if (!v || !v.cols) { ind.spec = null; return; }
    if (ind.type === 'script') {
      ind.spec = runScript(ind.code, v.cols);
    } else {
      const d = BUILTIN[ind.type];
      if (!d) throw new Error('Unknown indicator ' + ind.type);
      ind.spec = Object.assign({ markers: [], hlines: [] }, d.run(v.cols, ind.params || {}));
    }
  } catch (e) {
    ind.spec = null;
    ind.error = e.message;
  }
}
window.computeInd = computeInd;
window.computeind = computeInd;

function indTitle(ind) {
  if (!ind) return '';
  if (ind.type === 'script') return ind.spec?.name || ind.name || 'Script';
  return BUILTIN[ind.type] ? BUILTIN[ind.type].name : ind.type;
}
window.indTitle = indTitle;

function saveInds() {
  const ser = v => v.IND.map(i => ({ type: i.type, params: i.params, code: i.code, name: i.name }));
  store.set('tfx_inds', ser(V1));
  store.set('tfx_inds2', ser(V2));
}
window.saveInds = saveInds;

function plotPoint(v, pl, i) {
  if (!v.candles || !v.candles[i]) return { time: 0 };
  const t = v.candles[i].time, val = pl.values ? pl.values[i] : NaN;
  if (!isF(val)) return { time: t };
  const o = { time: t, value: val };
  if (pl.colors && pl.colors[i]) o.color = pl.colors[i];
  return o;
}
window.plotPoint = plotPoint;

function plotData(v, pl, n) {
  const out = [];
  if (!v.candles || !v.candles.length || !pl || !pl.values) return out;
  const count = Math.min(n, v.candles.length);
  for (let i = 0; i < count; i++) out.push(plotPoint(v, pl, i));
  return out;
}
window.plotData = plotData;

function getSeriesForPane(v, paneIndex) {
  if (!paneIndex) return v.c.candleSeries;
  for (const ind of v.IND) {
    if (ind.paneIndex === paneIndex && ind.series && ind.series.length > 0) return ind.series[0];
  }
  return v.c.candleSeries;
}
window.getSeriesForPane = getSeriesForPane;

function fillIndicatorData(v) {
  const n = visCount(v);
  for (const ind of v.IND) {
    if (ind.series && ind.spec && ind.spec.plots) {
      ind.series.forEach((sr, i) => {
        if (ind.spec.plots[i]) sr.setData(plotData(v, ind.spec.plots[i], n));
      });
    }
  }
  if (isDockActive() && v === V1) {
    dockedIndicators.forEach(d => {
      if (d.seriesList && d.ind.spec && d.ind.spec.plots) {
        d.seriesList.forEach((sr, i) => {
          if (d.ind.spec.plots[i]) sr.setData(plotData(v, d.ind.spec.plots[i], n));
        });
      }
    });
  }
}
window.fillIndicatorData = fillIndicatorData;

function rebuildIndicatorSeries(v) {
  if (!v) return;
  removeDrawingObjs(v);
  for (const ind of v.IND) {
    for (const sr of ind.series || []) {
      try { v.c.chart.removeSeries(sr); } catch {}
    }
    ind.series = [];
    ind.paneIndex = 0;
  }

  const dockActive = isDockActive();
  updateDockVisibility();

  if (dockActive && v === V1) {
    for (const ind of v.IND) {
      if (!ind.spec || !ind.spec.overlay) continue;
      ind.paneIndex = 0;
      const prec = ind.spec.precision ?? S.prec, fmt = { type: 'price', precision: prec, minMove: Math.pow(10, -prec) };
      ind.spec.plots.forEach(pl => {
        const sr = v.c.chart.addSeries(LW.LineSeries, { color: pl.color, lineWidth: pl.lineWidth || 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, priceFormat: fmt }, 0);
        ind.series.push(sr);
      });
    }
    buildDockedIndicators();
  } else {
    if (v === V1) destroyDockedIndicators();
    let pane = 1;
    for (const ind of v.IND) {
      if (!ind.spec) continue;
      if (v.hidden && !ind.spec.overlay) continue;
      const pIdx = ind.spec.overlay ? 0 : pane++;
      ind.paneIndex = pIdx;
      const prec = ind.spec.precision ?? S.prec, fmt = { type: 'price', precision: prec, minMove: Math.pow(10, -prec) };
      ind.spec.plots.forEach((pl, pi) => {
        const hist = pl.type === 'histogram';
        const sr = v.c.chart.addSeries(hist ? LW.HistogramSeries : LW.LineSeries,
          hist ? { color: pl.color, priceLineVisible: false, lastValueVisible: false, priceFormat: fmt }
               : { color: pl.color, lineWidth: pl.lineWidth || 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, priceFormat: fmt }, pIdx);
        ind.series.push(sr);
        if (pi === 0) (ind.spec.hlines || []).forEach(h => sr.createPriceLine({ price: h.price, color: h.color, lineWidth: 1, lineStyle: LW.LineStyle.Dashed, axisLabelVisible: false, title: h.title || '' }));
      });
    }
    setTimeout(() => sizePanes(v), 0);
  }

  rebuildDrawingSeries(v);
}
window.rebuildIndicatorSeries = rebuildIndicatorSeries;

function buildDockedIndicators() {
  destroyDockedIndicators();
  const listEl = $('indDockList');
  if (!listEl) return;
  const bottomInds = V1.IND.filter(i => i.spec && !i.spec.overlay);
  const badge = $('dockCountBadge');
  if (badge) badge.textContent = String(bottomInds.length);

  bottomInds.forEach(ind => {
    const card = document.createElement('div');
    card.className = 'ind-card';
    card.style.height = (ind.dockHeight || 135) + 'px';

    const head = document.createElement('div');
    head.className = 'ind-card-head';
    
    const titleEl = document.createElement('span');
    titleEl.className = 'ind-card-title';
    titleEl.textContent = indTitle(ind);
    
    const valEl = document.createElement('span');
    valEl.className = 'ind-card-val';
    valEl.textContent = '–';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'x';
    closeBtn.textContent = '✕';
    closeBtn.title = 'Remove';
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      const realIdx = V1.IND.indexOf(ind);
      if (realIdx >= 0) {
        V1.IND.splice(realIdx, 1);
        applyIndChange(V1);
      }
    };

    const rightWrap = document.createElement('div');
    rightWrap.style.display = 'flex';
    rightWrap.style.alignItems = 'center';
    rightWrap.style.gap = '8px';
    rightWrap.append(valEl, closeBtn);

    head.append(titleEl, rightWrap);

    const body = document.createElement('div');
    body.className = 'ind-card-body';
    body.style.position = 'relative';
    
    const chartEl = document.createElement('div');
    chartEl.className = 'ind-card-chart';
    chartEl.style.width = '100%';
    chartEl.style.height = '100%';
    
    const crossSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    crossSvg.setAttribute('class', 'ind-card-cross-svg');
    crossSvg.style.position = 'absolute';
    crossSvg.style.top = '0';
    crossSvg.style.left = '0';
    crossSvg.style.width = '100%';
    crossSvg.style.height = '100%';
    crossSvg.style.pointerEvents = 'none';
    crossSvg.style.zIndex = '5';
    
    body.append(chartEl, crossSvg);

    const resizer = document.createElement('div');
    resizer.className = 'ind-card-resizer';
    resizer.title = 'Drag up/down to adjust indicator height';

    card.append(head, body, resizer);
    listEl.append(card);

    const c = LW.createChart(chartEl, {
      autoSize: true,
      layout: { background: { type: LW.ColorType.Solid, color: '#10142a' }, textColor: '#7f89b3', fontFamily: 'Inter, system-ui, sans-serif' },
      grid: { vertLines: { color: 'rgba(29,35,66,0.35)' }, horzLines: { color: 'rgba(29,35,66,0.35)' } },
      crosshair: { mode: LW.CrosshairMode.Normal, horzLine: { visible: false, labelVisible: false } },
      rightPriceScale: { borderColor: '#1d2342', scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: { visible: false, borderColor: '#1d2342' },
      handleScroll: false,
      handleScale: false
    });

    const seriesList = [];
    const prec = ind.spec.precision ?? 2;
    const fmt = { type: 'price', precision: prec, minMove: Math.pow(10, -prec) };

    ind.spec.plots.forEach((pl, pi) => {
      const hist = pl.type === 'histogram';
      const sr = c.addSeries(hist ? LW.HistogramSeries : LW.LineSeries,
        hist ? { color: pl.color, priceLineVisible: false, lastValueVisible: false, priceFormat: fmt }
             : { color: pl.color, lineWidth: pl.lineWidth || 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, priceFormat: fmt }
      );
      seriesList.push(sr);
      if (pi === 0) (ind.spec.hlines || []).forEach(h => sr.createPriceLine({ price: h.price, color: h.color, lineWidth: 1, lineStyle: LW.LineStyle.Dashed, axisLabelVisible: false, title: h.title || '' }));
    });

    const n = visCount(V1);
    seriesList.forEach((sr, i) => sr.setData(plotData(V1, ind.spec.plots[i], n)));

    card.addEventListener('pointermove', e => {
      if (S.replayOn) return;
      const r = chartEl.getBoundingClientRect();
      const mouseX = e.clientX - r.left;
      if (mouseX < 0 || mouseX > r.width) return;
      
      let logical = null;
      try { logical = c.timeScale().coordinateToLogical(mouseX); } catch {}
      if (logical == null) return;
      const targetIdx = Math.round(logical);
      const cs = V1.candles;
      if (!cs || !cs.length) return;
      const lastIdx = cs.length - 1;
      const clampedIdx = Math.max(0, Math.min(lastIdx, targetIdx));
      const t = cs[clampedIdx] ? cs[clampedIdx].time : null;

      syncDockedCrosshair(t, targetIdx);
      syncLiveOverlayFromDock(targetIdx, clampedIdx);
    });

    card.addEventListener('pointerleave', () => {
      if (S.replayOn) return;
      syncDockedCrosshair(null, null);
      hideLiveCrosshair();
    });

    let startY = 0, startH = 0;
    const onMove = e => {
      const newH = Math.max(75, Math.min(500, startH + (e.clientY - startY)));
      card.style.height = newH + 'px';
      ind.dockHeight = newH;
      c.resize(card.clientWidth, newH - 34);
    };
    const onUp = () => {
      resizer.classList.remove('dragging');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    resizer.addEventListener('pointerdown', e => {
      startY = e.clientY;
      startH = card.clientHeight;
      resizer.classList.add('dragging');
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });

    dockedIndicators.push({ ind, card, chart: c, seriesList, valEl, crossSvg });
  });

  syncDockedChartsRange();
}
window.buildDockedIndicators = buildDockedIndicators;

function syncDockedChartsRange() {
  if (!dockedIndicators.length) return;
  const cs = V1.candles;
  if (!cs || !cs.length) return;
  let range = null;
  if (S.replayOn) { try { range = V1.c.chart.timeScale().getVisibleLogicalRange(); } catch {} }
  if (!range) range = tvDockRange(cs.length - 1);
  dockedIndicators.forEach(d => {
    try { d.chart.timeScale().setVisibleLogicalRange(range); } catch {}
  });
}
window.syncDockedChartsRange = syncDockedChartsRange;

function bsearch(v, t) {
  const cs = v.candles;
  if (!cs || !cs.length) return -1;
  let lo = 0, hi = cs.length - 1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (cs[m].time === t) return m;
    if (cs[m].time < t) lo = m + 1;
    else hi = m - 1;
  }
  return -1;
}
window.bsearch = bsearch;

function syncDockedCrosshair(time, logical) {
  if (!dockedIndicators.length) return;
  const cs = V1.candles, n = visCount(V1);
  if (!cs || !n) return;

  const lastIdx = cs.length - 1;
  let idx = -1;
  if (time != null) idx = bsearch(V1, time);
  if (idx < 0 && logical != null) {
    const roundLg = Math.round(logical);
    if (roundLg >= 0 && roundLg < n) idx = roundLg;
  }
  const rawIdx = idx >= 0 ? idx : (logical != null ? Math.round(logical) : -1);

  dockedIndicators.forEach(d => {
    const svg = d.crossSvg;
    if (svg) svg.innerHTML = '';

    if (rawIdx == null || rawIdx < 0) {
      try { d.chart.clearCrosshairPosition(); } catch {}
      d.valEl.textContent = '–';
      return;
    }

    let x = null;
    if (idx >= 0 && cs[idx]) {
      try { x = d.chart.timeScale().timeToCoordinate(cs[idx].time); } catch {}
    }
    if (x == null && logical != null) {
      try { x = d.chart.timeScale().logicalToCoordinate(logical); } catch {}
    }

    const chartW = d.card.clientWidth;
    if (svg && x != null && isF(x) && x >= 0 && x <= chartW) {
      svg.innerHTML = `<line x1="${x}" y1="0" x2="${x}" y2="100%" stroke="rgba(0,240,255,0.75)" stroke-width="1.2" stroke-dasharray="3 3"/>`;
    }

    if (idx >= 0 && idx < n && d.ind && d.ind.spec) {
      const vals = d.ind.spec.plots.map(pl => {
        const v = pl.values ? pl.values[idx] : NaN;
        return isF(v) ? (Math.abs(v) >= 100 ? v.toFixed(2) : v.toFixed(4)) : '–';
      });
      d.valEl.textContent = vals.join('  ') || '–';

      try {
        let price = 0;
        for (const pl of d.ind.spec.plots) {
          const pv = pl.values ? pl.values[idx] : NaN;
          if (isF(pv)) { price = pv; break; }
        }
        if (d.seriesList && d.seriesList.length && cs[idx]) {
          d.chart.setCrosshairPosition(price, cs[idx].time, d.seriesList[0]);
        }
      } catch {}
    } else {
      try { d.chart.clearCrosshairPosition(); } catch {}
      d.valEl.textContent = (rawIdx > lastIdx) ? '[Empty Space]' : '–';
    }
  });
}
window.syncDockedCrosshair = syncDockedCrosshair;

function refreshMarkers(force) {
  if (!force && !markersDirty) return;
  markersDirty = false;
  for (const v of viewsNeeded()) {
    const cs = v.candles; if (!cs || !cs.length) continue;
    const n = visCount(v), lastT = shownLastTime(v), out = [];
    for (const ind of v.IND) for (const m of ind.spec?.markers || []) if (m.i < n) out.push({ time: cs[m.i].time, position: m.position, shape: m.shape, color: m.color, text: m.text });
    const addTrade = (t, side, isExit, pnl) => {
      const ts = snapTime(v, t); if (ts < 0 || ts > lastT) return;
      if (!isExit) out.push({ time: ts, position: side === 'long' ? 'belowBar' : 'aboveBar', shape: side === 'long' ? 'arrowUp' : 'arrowDown', color: side === 'long' ? C.up : C.dn, text: side === 'long' ? 'B' : 'S' });
      else out.push({ time: ts, position: side === 'long' ? 'aboveBar' : 'belowBar', shape: 'circle', color: pnl >= 0 ? C.up : C.dn, text: signed(pnl) });
    };
    for (const p of A.positions) addTrade(p.openTime, p.side, false);
    for (const h of A.history) if (h.symbol === S.symbol) { addTrade(h.openTime, h.side, false); addTrade(h.closeTime, h.side, true, h.pnl); }
    out.sort((a, b) => a.time - b.time);
    v.c.markersApi.setMarkers(out);
  }
}
window.refreshMarkers = refreshMarkers;

function updateLegend(v, param) {
  if (param !== null) {
    if (param && param.time && param.seriesData) { v.crossIdx = bsearch(v, param.time); v.crossBar = param.seriesData.get(v.c.candleSeries) || null; }
    else { v.crossIdx = null; v.crossBar = null; }
  }
  const box = $(v.legId); if (!box) return;
  const cs = v.candles, n = visCount(v); let bar = v.crossBar, idx = v.crossIdx;
  if (idx === null || idx < 0 || !bar) { idx = n - 1; bar = v.form || (cs && cs.length ? cs[n - 1] : null); }
  if (!bar) { box.innerHTML = ''; return; }
  const up = bar.close >= bar.open, cls = up ? 'up' : 'dn', chg = bar.open ? (bar.close - bar.open) / bar.open * 100 : 0;
  const tag = S.layout === 'single' ? '' : `<b style="color:var(--cyan)">[${v.n === 1 ? 'A' : 'B'}]</b> `;
  let html = `<div class="ohlc">${tag}<b>${S.symbol}</b> · ${v.tf} <span>O <i class="${cls}">${fmtP(bar.open)}</i></span><span>H <i class="${cls}">${fmtP(bar.high)}</i></span><span>L <i class="${cls}">${fmtP(bar.low)}</i></span><span>C <i class="${cls}">${fmtP(bar.close)}</i></span><span class="${cls}">${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%</span></div><div class="inds">`;
  
  const visibleInds = isDockActive() ? v.IND.filter(i => i.spec && i.spec.overlay) : v.IND;
  for (const ind of visibleInds) {
    if (!ind.spec || (v.hidden && !ind.spec.overlay)) continue;
    const vals = ind.spec.plots.filter(pl => pl.type === 'line' || ind.spec.plots.length <= 2).map(pl => {
      const val = idx >= 0 && idx < n ? pl.values[idx] : NaN;
      return `<i style="color:${pl.color};font-style:normal">${isF(val) ? (Math.abs(val) >= 100 ? val.toFixed(S.prec > 2 ? 2 : S.prec) : val.toFixed(4)) : '–'}</i>`;
    });
    html += `<span class="muted">${indTitle(ind)} ${vals.join(' ')}</span>`;
  }
  box.innerHTML = html + '</div>';
}
window.updateLegend = updateLegend;

function scheduleUiUpdate() {
  if (uiRafPending) return;
  uiRafPending = true;
  requestAnimationFrame(() => {
    uiRafPending = false;
    updateAll();
    for (const v of viewsNeeded()) updateLegend(v, null);
    if (markersDirty) refreshMarkers();
    redrawRulers();
  });
}
window.scheduleUiUpdate = scheduleUiUpdate;

function setCls(e, v) {
  if (!e) return;
  e.classList.toggle('up', v > 0);
  e.classList.toggle('dn', v < 0);
}

function updateAll() {
  const upl = A.positions.reduce((s, p) => s + uplOf(p), 0), eq = A.balance + upl, um = usedMargin();
  if (dom.accBal) dom.accBal.textContent = fmtMoney(A.balance);
  if (dom.accEq) dom.accEq.textContent = fmtMoney(eq);
  if (dom.accUpl) { dom.accUpl.textContent = signed(upl); setCls(dom.accUpl, upl); }
  if (dom.accMar) dom.accMar.textContent = fmtMoney(um);
  if (dom.accFree) dom.accFree.textContent = fmtMoney(eq - um);
  const net = eq - A.startBal;
  if (dom.accNet) { dom.accNet.textContent = signed(net); setCls(dom.accNet, net); }
  
  if (dom.btnBuy) dom.btnBuy.textContent = 'BUY ' + (Pz.ask ? fmtP(Pz.ask) : (Pz.last ? fmtP(Pz.last) : ''));
  if (dom.btnSell) dom.btnSell.textContent = 'SELL ' + (Pz.bid ? fmtP(Pz.bid) : (Pz.last ? fmtP(Pz.last) : ''));
  
  for (const p of A.positions) {
    const c = $('pnl' + p.id);
    if (c) {
      const u = uplOf(p);
      c.textContent = signed(u);
      setCls(c, u);
    }
  }
  
  if (dom.stPrice) dom.stPrice.textContent = Pz.last ? `${S.symbol}  ${fmtP(Pz.last)}` : '';
  if (dom.stSpread) dom.stSpread.textContent = S.spreadOn ? `[${S.broker} Spread: ${Pz.spread > 0 ? fmtP(Pz.spread) : '0'}]` : '[Spread: OFF]';
  
  const speedLabel = S.speed === 'real' ? `1:1 Real TF (${master().tf})` : (S.speed >= 300 ? '10X Ultra (300 c/s)' : `${S.speed} c/s`);
  if (dom.repInfo) dom.repInfo.textContent = S.replayOn && Pz.time ? `Replay: ${fmtDT(Pz.time)} · ${master().tf} candle ${R.i}/${master().candles.length} · ⏱ ${speedLabel}` : '';
}
window.updateAll = updateAll;

function renderPositions() {
  const body = $('posBody');
  if (!body) return;
  body.innerHTML = '';
  if (!A.positions.length) { body.append(el('tr', {}, el('td', { colspan: '7', class: 'muted' }, 'No open positions'))); return; }
  for (const p of A.positions) {
    const mk = key => { const i = el('input', { type: 'number', step: 'any', value: p[key] != null ? (+p[key].toFixed(S.prec)) : '' }); i.addEventListener('change', () => { const v = parseFloat(i.value); p[key] = v > 0 ? v : null; syncPriceLines(); }); return i; };
    body.append(el('tr', {}, el('td', { class: p.side === 'long' ? 'up' : 'dn' }, p.side === 'long' ? 'LONG' : 'SHORT'),
      el('td', {}, lotsOf(p).toFixed(2)), el('td', {}, fmtP(p.entry)), el('td', { id: 'pnl' + p.id }, '0'),
      el('td', {}, mk('sl')), el('td', {}, mk('tp')),
      el('td', {}, el('button', { class: 'x', title: 'Close', onclick: () => closePosition(p, Pz.last, 'Manual') }, '✕'))));
  }
}
window.renderPositions = renderPositions;

function renderHistory() {
  const h = A.history, wins = h.filter(t => t.pnl > 0), losses = h.filter(t => t.pnl <= 0);
  const gw = wins.reduce((s, t) => s + t.pnl, 0), gl = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const kv = (k, v, c) => el('div', { class: 'kv' }, el('span', { class: 'muted' }, k), el('b', { class: c || '' }, v));
  const st = $('stats');
  if (st) {
    st.innerHTML = '';
    const tot = h.reduce((s, t) => s + t.pnl, 0);
    st.append(kv('Trades', String(h.length)), kv('Win rate', h.length ? (wins.length / h.length * 100).toFixed(1) + '%' : '-'),
      kv('Total P/L', signed(tot), tot >= 0 ? 'up' : 'dn'), kv('Profit factor', gl > 0 ? (gw / gl).toFixed(2) : (gw > 0 ? '∞' : '-')),
      kv('Avg win', wins.length ? signed(gw / wins.length) : '-', 'up'), kv('Avg loss', losses.length ? signed(-gl / losses.length) : '-', 'dn'));
  }
  const body = $('histBody');
  if (body) {
    body.innerHTML = '';
    if (!h.length) body.append(el('tr', {}, el('td', { colspan: '5', class: 'muted' }, 'No closed trades yet')));
    h.slice(0, 100).forEach(t => body.append(el('tr', {}, el('td', { class: t.side === 'long' ? 'up' : 'dn', title: t.symbol + '  ' + fmtDT(t.openTime) + ' → ' + fmtDT(t.closeTime) }, t.side === 'long' ? 'LONG' : 'SHORT'),
      el('td', {}, (+t.entry.toPrecision(7)).toString()), el('td', {}, (+t.exit.toPrecision(7)).toString()),
      el('td', { class: t.pnl >= 0 ? 'up' : 'dn' }, signed(t.pnl)), el('td', { class: 'muted' }, t.reason))));
  }
}
window.renderHistory = renderHistory;

function updateStatus() {
  if (dom.stData) {
    const parts = viewsNeeded().filter(v => v.candles && v.candles.length).map(v => `${S.layout === 'single' ? '' : (v.n === 1 ? 'A ' : 'B ')}${v.tf}: ${v.candles.length.toLocaleString()} candles · ${fmtDT(v.candles[0].time)} → ${fmtDT(v.candles[v.candles.length - 1].time)}`);
    dom.stData.textContent = parts.join('   |   ') || 'Ready';
  }
  if (dom.stSrc) dom.stSrc.innerHTML = `<span class="badge">${V1.srcUsed || 'ONLINE'}</span>`;
}
window.updateStatus = updateStatus;

function toggleBottomIndicators(v) {
  if (!v.IND.some(ind => ind.spec && !ind.spec.overlay) && !v.hidden) return;
  v.hidden = !v.hidden; rebuildIndicatorSeries(v); renderAll();
  toast(v.hidden ? 'Bottom indicators hidden' : 'Bottom indicators visible');
}
window.toggleBottomIndicators = toggleBottomIndicators;

/* =====================================================================
   STARTUP & REPLAY ORCHESTRATION
   ===================================================================== */
function pickN() {
  if (S.speed === 'real') { const sec = master().tfSec || 60; return sec <= 60 ? sec : Math.min(120, Math.max(20, Math.round(sec / 5))); }
  const sp = +S.speed || 2;
  if (sp <= 0.05) return 20;
  if (sp <= 0.1) return 10;
  if (sp <= 0.5) return 8;
  if (sp >= 30) return 1;
  if (sp >= 10) return 2;
  if (sp >= 5) return 4;
  return 8;
}

function tickFrame() {
  const m = master(), cs = m.candles;
  if (!cs || !cs.length || R.i >= cs.length) { pause(); toast('End of data'); return false; }
  if (R.k === 0) R.N = pickN();
  const c = cs[R.i], prev = Pz.last;
  R.k++;
  const part = partialCandle(c, R.k, R.N);
  m.c.candleSeries.update(candleBar(part)); m.c.volSeries.update(volBar(c, part.volume));
  let lo = Math.min(prev, part.close), hi = Math.max(prev, part.close);
  if (R.k === 1) { R.ph = c.open; R.pl = c.open; lo = Math.min(lo, c.open); hi = Math.max(hi, c.open); }
  if (part.high > R.ph) { hi = Math.max(hi, part.high); R.ph = part.high; }
  if (part.low < R.pl) { lo = Math.min(lo, part.low); R.pl = part.low; }
  updateBidAsk(part.close);
  Pz.time = c.time;
  checkStops(lo, hi);
  if (R.k >= R.N) {
    const j = R.i; R.i++; R.k = 0;
    for (const ind of m.IND) ind.series?.forEach((sr, i) => sr.update(plotPoint(m, ind.spec.plots[i], j)));
    if (isDockActive()) {
      dockedIndicators.forEach(d => {
        d.seriesList.forEach((sr, i) => sr.update(plotPoint(m, d.ind.spec.plots[i], j)));
      });
    }
    markersDirty = true;
  }
  m.done = R.i; m.form = R.k > 0 ? part : null;
  for (const v of viewsNeeded()) if (v !== m) advanceSlave(v);
  scheduleUiUpdate();
  return true;
}

function stepCandle() { pause(); if (!tickFrame()) return; while (R.k !== 0) tickFrame(); refreshMarkers(true); }
function stepTick() { pause(); tickFrame(); }

function play() {
  if (!S.replayOn || R.playing) return;
  R.playing = true;
  $('btnPlay').textContent = '⏸ Pause';
  loop();
}

function pause() {
  R.playing = false;
  clearTimeout(R.timer);
  $('btnPlay').textContent = '▶ Play';
}

function togglePlay() {
  R.playing ? pause() : play();
}

function loop() {
  if (!R.playing) return;
  const isReal = S.speed === 'real', tfs = master().tfSec || 60;
  const effSpeed = isReal ? (1 / Math.max(1, tfs)) : (+S.speed || 2);
  if (effSpeed >= 60) {
    R.N = 1;
    const batch = Math.min(25, Math.max(1, Math.round(effSpeed / 50)));
    for (let b = 0; b < batch; b++) { if (!tickFrame()) return; }
    R.timer = setTimeout(loop, 16);
    return;
  }
  if (!tickFrame()) return;
  const tickDelay = isReal ? Math.max(50, Math.round((tfs * 1000) / R.N)) : Math.max(2, Math.round(1000 / (effSpeed * R.N)));
  R.timer = setTimeout(loop, tickDelay);
}

function placeReplay(idx) {
  const m = master(), cs = m.candles;
  if (!cs || !cs.length) return;
  idx = Math.max(1, Math.min(cs.length - 1, idx));
  R.i = idx; R.k = 0;
  const refCandle = cs[idx - 1] || cs[0];
  updateBidAsk(refCandle.close);
  Pz.time = refCandle.time;
  renderAll();
  for (const v of viewsNeeded()) {
    if (v.done > 0) {
      v.c.chart.timeScale().setVisibleLogicalRange({ from: v.done - 110, to: v.done + 40 });
    }
  }
}

function startReplay() {
  pause();
  if (A.positions.length) closeAll('Replay restart');
  const cs = master().candles;
  if (!cs || !cs.length) return;
  const targetDateStr = $('repDate').value || '2026-01-01';
  const ts = new Date(targetDateStr + 'T00:00:00Z').getTime() / 1000;
  let idx = cs.findIndex(c => c.time >= ts);
  if (idx < 0) idx = Math.floor(cs.length * 0.5);
  const minIdx = Math.min(50, Math.max(1, Math.floor(cs.length * 0.1)));
  idx = Math.max(minIdx, Math.min(cs.length - 1, idx));
  placeReplay(idx);
}

function positionAt(cursorEnd) {
  const m = master(), cs = m.candles;
  if (!cs || !cs.length) return;
  let n = 0;
  while (n < cs.length && cs[n].time + m.tfSec <= cursorEnd) n++;
  n = Math.max(1, Math.min(cs.length - 1, n));
  placeReplay(n);
}

function showAll() {
  pause();
  renderAll();
  VIEWS.forEach(v => {
    try { v.c.chart.timeScale().fitContent(); } catch {}
  });
}

window.startReplay = startReplay;
window.placeReplay = placeReplay;
window.positionAt = positionAt;
window.showAll = showAll;
window.play = play;
window.pause = pause;
window.togglePlay = togglePlay;

/* =====================================================================
   TIMEFRAME SLAVE STATE & VIEW PIPELINE
   ===================================================================== */
function replayCursor() {
  const m = master(), cs = m.candles;
  if (!cs || !cs.length) return 0;
  if (R.i >= cs.length) return cs[cs.length - 1].time + m.tfSec;
  return cs[R.i].time + (R.k > 0 ? m.tfSec * R.k / R.N : 0);
}

function slaveState(v) {
  const m = master(), cs = v.candles, mc = m.candles, tf = v.tfSec, T = replayCursor();
  if (!cs || !cs.length) { v.done = 0; v.form = null; return; }
  let lo = 0, hi = cs.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (cs[mid].time + tf <= T) lo = mid + 1; else hi = mid; }
  v.done = lo; v.form = null;
  if (lo >= cs.length) return;
  const c = cs[lo]; if (c.time >= T) return;
  const bt = c.time; let a = v.agg;
  if (!a || a.bt !== bt || a.next > R.i) {
    let l2 = 0, h2 = mc.length; while (l2 < h2) { const mid = (l2 + h2) >> 1; if (mc[mid].time < bt) l2 = mid + 1; else h2 = mid; }
    a = v.agg = { bt, next: l2, ok: l2 < mc.length && mc[l2].time - bt < m.tfSec, hi: -Infinity, lo: Infinity, vol: 0, last: NaN };
  }
  if (a.ok) {
    while (a.next < R.i && mc[a.next].time < bt + tf) { const q = mc[a.next]; if (q.high > a.hi) a.hi = q.high; if (q.low < a.lo) a.low = q.low; a.vol += q.volume; a.last = q.close; a.next++; }
    let hh = a.hi, ll = a.lo, cl = a.last, vv = a.vol;
    if (R.k > 0 && R.i < mc.length && mc[R.i].time < bt + tf) { const p = partialCandle(mc[R.i], R.k, R.N); hh = Math.max(hh, p.high); ll = Math.min(ll, p.low); cl = p.close; vv += p.volume; }
    if (isF(cl)) { v.form = { time: bt, open: c.open, high: Math.max(hh, c.open), low: Math.min(ll, c.open), close: cl, volume: vv }; return; }
  }
  v.form = partialCandle(c, (T - bt) / tf, 1);
}

function syncViewStates() {
  const m = master();
  for (const v of viewsNeeded()) {
    const cs = v.candles; v.agg = null;
    if (!cs || !cs.length) { v.done = 0; v.form = null; }
    else if (!S.replayOn) { v.done = cs.length; v.form = null; }
    else if (v === m) { v.done = R.i; v.form = (R.k > 0 && R.i < cs.length) ? partialCandle(cs[R.i], R.k, R.N) : null; }
    else slaveState(v);
  }
}

function renderView(v) {
  const cs = v.candles;
  if (!cs || !cs.length) { v.c.candleSeries.setData([]); v.c.volSeries.setData([]); return; }
  const n = visCount(v), cd = new Array(n), vd = new Array(n);
  for (let i = 0; i < n; i++) { cd[i] = candleBar(cs[i]); vd[i] = volBar(cs[i], cs[i].volume); }
  if (v.form) { cd.push(candleBar(v.form)); vd.push(volBar(v.form, v.form.volume)); }
  v.c.candleSeries.setData(cd); v.c.volSeries.setData(vd);
  fillIndicatorData(v);
}

function renderAll() {
  syncViewStates();
  for (const v of viewsNeeded()) renderView(v);
  refreshMarkers(true); syncPriceLines();
  for (const v of viewsNeeded()) updateLegend(v, null);
  updateAll(); redrawRulers();
  syncDockedChartsRange();
}

function advanceSlave(v) {
  const old = v.done, cs = v.candles;
  slaveState(v);
  if (v.done < old) { renderView(v); return; }
  for (let j = old; j < v.done; j++) {
    v.c.candleSeries.update(candleBar(cs[j])); v.c.volSeries.update(volBar(cs[j], cs[j].volume));
    for (const ind of v.IND) ind.series?.forEach((sr, i) => sr.update(plotPoint(v, ind.spec.plots[i], j)));
  }
  if (v.form) { v.c.candleSeries.update(candleBar(v.form)); v.c.volSeries.update(volBar(v.form, v.form.volume)); }
}

/* =====================================================================
   TRADING ENGINE & P/L
   ===================================================================== */
function feePct() { return Math.max(0, parseFloat($('ordFee').value) || 0); }
function levX() { return Math.max(1, parseFloat($('ordLev').value) || 1); }
function dirOf(p) { return p.side === 'long' ? 1 : -1; }

function uplOf(p) {
  if (!Pz.last) return 0;
  const exitPrice = p.side === 'long' ? (Pz.bid || Pz.last) : (Pz.ask || Pz.last);
  return (exitPrice - p.entry) * p.qty * dirOf(p);
}

function usedMargin() { return A.positions.reduce((s, p) => s + p.notional / p.lev, 0); }
function equity() { return A.balance + A.positions.reduce((s, p) => s + uplOf(p), 0); }

function contractSize(sym) {
  if (/^XAU/.test(sym)) return 100;
  if (/^(EUR|GBP|AUD|USD)(USD|JPY|USDT)$/.test(sym)) return 100000;
  if (sym === 'USOIL' || sym === 'UKOIL') return 1000;
  return 1;
}
const lotsOf = p => (p.lots != null ? p.lots : p.qty / contractSize(p.symbol));

function openPosition(side) {
  if (!S.replayOn) return toast('Turn on Practice replay to trade');
  if (!Pz.last) return toast('No price yet');
  let lots = Math.round((parseFloat($('ordSize').value) || 0) * 100) / 100;
  if (lots < 0.01) { lots = 0.01; $('ordSize').value = '0.01'; toast('Minimum lot is 0.01'); }

  const execPrice = side === 'long' ? (Pz.ask || Pz.last) : (Pz.bid || Pz.last);
  const qty = lots * contractSize(S.symbol), notional = qty * execPrice;
  const lev = levX(), margin = notional / lev;
  if (margin > equity() - usedMargin()) return toast('Not enough free margin');

  const fee = notional * feePct() / 100;
  const slPct = parseFloat($('ordSL').value), tpPct = parseFloat($('ordTP').value), d = side === 'long' ? 1 : -1;
  const pos = { id: A.nextId++, symbol: S.symbol, side, lots, qty, notional, lev, entry: execPrice, fees: fee, openTime: Pz.time,
    sl: slPct > 0 ? execPrice * (1 - d * slPct / 100) : null, tp: tpPct > 0 ? execPrice * (1 + d * tpPct / 100) : null };
  A.balance -= fee; A.positions.push(pos); saveAcct();
  syncPriceLines(); renderPositions(); updateAll(); try { refreshMarkers(true); } catch {}
  toast(`Filled: ${side.toUpperCase()} ${lots.toFixed(2)} lot @ ${fmtP(execPrice)}`);
}

function closePosition(pos, price, reason) {
  const exitPrice = pos.side === 'long' ? (Pz.bid || price) : (Pz.ask || price);
  const gross = (exitPrice - pos.entry) * pos.qty * dirOf(pos), exitFee = exitPrice * pos.qty * feePct() / 100;
  A.balance += gross - exitFee;
  A.history.unshift({ id: pos.id, symbol: pos.symbol, side: pos.side, qty: pos.qty, notional: pos.notional, entry: pos.entry, exit: exitPrice,
    openTime: pos.openTime, closeTime: Pz.time, pnl: gross - pos.fees - exitFee, reason });
  A.positions = A.positions.filter(p => p !== pos); saveAcct();
  refreshMarkers(true); syncPriceLines(); renderPositions(); renderHistory(); updateAll();
}

function closeAll(reason) { [...A.positions].forEach(p => closePosition(p, Pz.last, reason)); }

function checkStops(lo, hi) {
  for (const p of [...A.positions]) {
    const slHit = p.sl != null && (p.side === 'long' ? lo <= p.sl : hi >= p.sl);
    const tpHit = p.tp != null && (p.side === 'long' ? hi >= p.tp : lo <= p.tp);
    if (slHit) closePosition(p, p.sl, 'Stop loss'); else if (tpHit) closePosition(p, p.tp, 'Take profit');
  }
  if (A.positions.length && equity() <= usedMargin() * 0.1) { closeAll('Liquidated'); toast('Margin call'); }
}

function pipSize(price) { return S.prec >= 3 ? Math.pow(10, -(S.prec - 1)) : (price >= 1000 ? 1 : 0.1); }
function levelPnl(p, price) { return (price - p.entry) * p.qty * dirOf(p) - p.fees - price * p.qty * feePct() / 100; }

function setLevel(p, kind, price) {
  const d = dirOf(p), tick = Math.pow(10, -S.prec);
  if (kind === 'tp') price = d > 0 ? Math.max(price, p.entry + tick) : Math.min(price, p.entry - tick);
  else price = d > 0 ? Math.min(price, p.entry - tick) : Math.max(price, p.entry + tick);
  p[kind] = price;
}

function startDrag(p, kind, v, armed) {
  if (p[kind] == null) { const dist = Math.max(p.entry * 0.003, pipSize(p.entry) * 10), d = dirOf(p); p[kind] = kind === 'tp' ? p.entry + d * dist : p.entry - d * dist; }
  drag = { p, kind, v, armed }; p.ui = false;
}

function endDrag() { drag = null; renderPositions(); }

window.addEventListener('pointermove', e => {
  if (!drag || !drag.v.layer) return;
  const r = drag.v.layer.getBoundingClientRect(), pr = drag.v.c.candleSeries.coordinateToPrice(e.clientY - r.top);
  if (pr != null) setLevel(drag.p, drag.kind, pr);
});
window.addEventListener('pointerup', () => { if (drag && !drag.armed) endDrag(); });
window.addEventListener('pointerdown', () => { if (drag && drag.armed) endDrag(); }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && drag) endDrag(); });

function makePosEls(v, p) {
  const root = document.createElement('div'); v.layer.append(root);
  const mkEl = cls => { const d = document.createElement('div'); d.className = cls; root.append(d); return d; };
  const span = chip => { const t = document.createElement('span'); t.className = 't'; chip.append(t); return t; };
  const btn = (chip, cls, txt, fn) => { const b = document.createElement('button'); b.className = 'pl-b ' + cls; b.textContent = txt; b.addEventListener('pointerdown', ev => { ev.stopPropagation(); ev.preventDefault(); fn(); }); chip.append(b); return b; };
  const e = { root, eLine: mkEl('pl-line'), eChip: mkEl('pl-chip'), tLine: mkEl('pl-line'), tChip: mkEl('pl-chip drag'), sLine: mkEl('pl-line'), sChip: mkEl('pl-chip drag') };
  e.eT = span(e.eChip);
  e.bTP = btn(e.eChip, 'tp', 'TP', () => startDrag(p, 'tp', v, true));
  e.bSL = btn(e.eChip, 'sl', 'SL', () => startDrag(p, 'sl', v, true));
  e.eT.addEventListener('click', () => { p.ui = !p.ui; });
  e.tT = span(e.tChip); e.sT = span(e.sChip);
  btn(e.tChip, 'sl', '✕', () => { p.tp = null; renderPositions(); });
  btn(e.sChip, 'sl', '✕', () => { p.sl = null; renderPositions(); });
  e.tT.addEventListener('pointerdown', ev => { ev.preventDefault(); startDrag(p, 'tp', v, false); });
  e.sT.addEventListener('pointerdown', ev => { ev.preventDefault(); startDrag(p, 'sl', v, false); });
  return e;
}

function placePos(v, p, e) {
  const ser = v.c.candleSeries, col = p.side === 'long' ? C.up : C.dn;
  const put = (line, chip, textEl, price, text, color) => {
    const y = price == null ? null : ser.priceToCoordinate(price);
    line.style.display = chip.style.display = y == null ? 'none' : '';
    if (y == null) return;
    line.style.top = y + 'px'; line.style.borderTopColor = color;
    chip.style.top = y + 'px'; chip.style.borderColor = color; chip.style.color = color;
    if (textEl.textContent !== text) textEl.textContent = text;
  };
  const info = (name, price) => `${name} · ${(Math.abs(price - p.entry) / pipSize(p.entry)).toFixed(1)} pips · ${signed(levelPnl(p, price))}`;
  put(e.eLine, e.eChip, e.eT, p.entry, `${p.side === 'long' ? 'LONG' : 'SHORT'} ${lotsOf(p).toFixed(2)} lot · ${signed(uplOf(p))}`, col);
  e.bTP.style.display = e.bSL.style.display = p.ui ? '' : 'none';
  put(e.tLine, e.tChip, e.tT, p.tp, p.tp != null ? info('TP', p.tp) : '', C.up);
  put(e.sLine, e.sChip, e.sT, p.sl, p.sl != null ? info('SL', p.sl) : '', C.dn);
}

function layoutPos() {
  const need = viewsNeeded();
  for (const v of VIEWS) {
    if (!v.layer) { v.layer = document.createElement('div'); v.layer.className = 'pl-layer'; $(v.paneId).append(v.layer); v.posEls = new Map(); }
    const on = need.includes(v);
    v.layer.style.display = on ? 'block' : 'none';
    if (!on) continue;
    const live = new Set();
    for (const p of A.positions) {
      live.add(p.id);
      let e = v.posEls.get(p.id);
      if (!e) { e = makePosEls(v, p); v.posEls.set(p.id, e); }
      placePos(v, p, e);
    }
    for (const [id, e] of v.posEls) if (!live.has(id)) { e.root.remove(); v.posEls.delete(id); }
  }
}
(function posLoop() { if (A.positions.length || VIEWS.some(v => v.posEls && v.posEls.size)) { try { layoutPos(); } catch {} } requestAnimationFrame(posLoop); })();

function syncPriceLines() {
  try { layoutPos(); } catch {}
  const need = viewsNeeded();
  for (const v of VIEWS) {
    const ser = v.c.candleSeries;
    v.posLines.forEach(l => { try { ser.removePriceLine(l); } catch {} }); v.posLines = [];
    if (!need.includes(v)) { if (v.askLine) { try { ser.removePriceLine(v.askLine); } catch {} v.askLine = null; } continue; }
    if (S.spreadOn && Pz.ask && Pz.spread > 0) {
      if (!v.askLine) v.askLine = ser.createPriceLine({ price: Pz.ask, color: 'rgba(255,43,214,0.65)', lineWidth: 1, lineStyle: LW.LineStyle.Dotted, axisLabelVisible: true, title: 'ASK' });
      else v.askLine.applyOptions({ price: Pz.ask });
    } else if (v.askLine) { try { ser.removePriceLine(v.askLine); } catch {} v.askLine = null; }
    const add = (price, color, style, title) => v.posLines.push(ser.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title }));
    for (const p of A.positions) {
      add(p.entry, p.side === 'long' ? C.up : C.dn, LW.LineStyle.Dashed, p.side === 'long' ? 'LONG' : 'SHORT');
    }
  }
}
window.syncPriceLines = syncPriceLines;

/* =====================================================================
   DRAWINGS & RULER ENGINE
   ===================================================================== */
function setTool(t) {
  tool = t; pending = null;
  VIEWS.forEach(v => { if (v.ruler && !v.ruler.final) { v.ruler = null; drawRuler(v); } });
  $('toolCursor').classList.toggle('on', t === 'cursor');
  $('toolH').classList.toggle('on', t === 'h');
  $('toolTrend').classList.toggle('on', t === 'trend');
  $('toolRuler').classList.toggle('on', t === 'ruler');
  $('drawDot').style.display = 'none';
  if (t === 'h') toast('Click on chart to draw horizontal line');
  if (t === 'trend') toast('Click Point A, then Point B to draw trendline');
  if (t === 'ruler') toast('Click Point A, move mouse to measure, click Point B to fix');
}
window.setTool = setTool;

function followDot(v, p) {
  const dot = $('drawDot');
  if (tool === 'cursor' || !p.point) { if (tool === 'cursor' || dotOwner === v.n) dot.style.display = 'none'; return; }
  dotOwner = v.n; dot.style.display = 'block';
  const pr = $('chartWrap').getBoundingClientRect(), r = $(v.paneId).getBoundingClientRect();
  dot.style.left = (r.left - pr.left + p.point.x) + 'px'; dot.style.top = (r.top - pr.top + p.point.y) + 'px';
}

function removeDrawingObjs(v) {
  for (const d of v.drawings) { try { if (d.type === 'h') d.series.removePriceLine(d.obj); else v.c.chart.removeSeries(d.obj); } catch {} d.obj = null; d.series = null; }
}

function rebuildDrawingSeries(v) {
  for (const d of v.drawings) {
    try {
      if (v.hidden && d.paneIndex > 0) continue;
      if (d.type === 'h') { const t = getSeriesForPane(v, d.paneIndex); d.series = t; d.obj = t.createPriceLine({ price: d.price, color: '#ffd43b', lineWidth: 1, lineStyle: LW.LineStyle.Solid, axisLabelVisible: true, title: '' }); }
      else { const sr = v.c.chart.addSeries(LW.LineSeries, { color: '#00f0ff', lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, d.paneIndex); sr.setData(d.pts.map(q => ({ time: q.time, value: q.price }))); d.obj = sr; }
    } catch {}
  }
}

function rulerPoint(v, p) {
  if (!p.point || (p.paneIndex !== undefined && p.paneIndex !== 0)) return null;
  const l = v.c.chart.timeScale().coordinateToLogical(p.point.x), price = v.c.candleSeries.coordinateToPrice(p.point.y);
  if (l == null || price == null) return null;
  return { logical: Math.round(l), price };
}

function rulerMove(v, p) {
  if (tool !== 'ruler' || !v.ruler || v.ruler.final) return;
  const pt = rulerPoint(v, p); if (!pt) return;
  v.ruler.b = pt; drawRuler(v);
}

function rulerClick(p, v, pIdx) {
  if (pIdx !== 0) { toast('Ruler works on the price pane'); return; }
  const pt = rulerPoint(v, p); if (!pt) return;
  if (!v.ruler || v.ruler.final) {
    VIEWS.forEach(w => { if (w !== v && w.ruler && !w.ruler.final) { w.ruler = null; drawRuler(w); } });
    v.ruler = { a: pt, b: pt, final: false }; drawRuler(v);
  } else { v.ruler.b = pt; v.ruler.final = true; drawRuler(v); setTool('cursor'); }
}

function drawRuler(v) {
  const svg = $(v.svgId); if (!svg) return;
  svg.innerHTML = '';
  const r = v.ruler; if (!r || !viewsNeeded().includes(v)) return;
  const ts = v.c.chart.timeScale(), ser = v.c.candleSeries;
  const x1 = ts.logicalToCoordinate(r.a.logical), x2 = ts.logicalToCoordinate(r.b.logical), y1 = ser.priceToCoordinate(r.a.price), y2 = ser.priceToCoordinate(r.b.price);
  if ([x1, x2, y1, y2].some(q => q == null)) return;
  const box = svg.getBoundingClientRect(), W = box.width, H = box.height;
  const dp = r.b.price - r.a.price, pct = r.a.price ? dp / r.a.price * 100 : 0, nb = Math.abs(r.b.logical - r.a.logical);
  const pts = Math.round(Math.abs(dp) * Math.pow(10, S.prec)), sg = dp >= 0 ? '+' : '';
  let vol = 0; const lo = Math.max(0, Math.min(r.a.logical, r.b.logical)), hi = Math.max(r.a.logical, r.b.logical);
  for (let i = lo; i <= hi && i <= v.done; i++) { if (i < v.done) vol += v.candles[i].volume; else if (v.form) vol += v.form.volume; }
  const col = dp >= 0 ? '#2f7bff' : '#ff3d71', fill = dp >= 0 ? 'rgba(47,123,255,.18)' : 'rgba(255,61,113,.18)';
  const L = Math.min(x1, x2), Rr = Math.max(x1, x2), T = Math.min(y1, y2), B = Math.max(y1, y2), mx = (L + Rr) / 2, my = (T + B) / 2;
  const arrow = (xa, ya, xb, yb) => {
    if (Math.hypot(xb - xa, yb - ya) < 3) return '';
    const ang = Math.atan2(yb - ya, xb - xa), len = 9, f = n => n.toFixed(1);
    return `<line x1="${f(xa)}" y1="${f(ya)}" x2="${f(xb)}" y2="${f(yb)}" stroke="${col}" stroke-width="1.5"/><polygon points="${f(xb)},${f(yb)} ${f(xb - len * Math.cos(ang - 0.4))},${f(yb - len * Math.sin(ang - 0.4))} ${f(xb - len * Math.cos(ang + 0.4))},${f(yb - len * Math.sin(ang + 0.4))}" fill="${col}"/>`;
  };
  const lines = [`${sg}${fmtP(dp)} (${sg}${pct.toFixed(2)}%) ${pts} pts`, `${nb} bars`, `Vol ${vol.toLocaleString()}`];
  const w = Math.max(...lines.map(t => t.length)) * 7 + 18, h = lines.length * 16 + 8;
  const lx = Math.max(4, Math.min(x2 + 12, W - w - 70)), ly = Math.max(4, Math.min(dp >= 0 ? y2 - h - 10 : y2 + 10, H - h - 30));
  svg.innerHTML = `<rect x="${L}" y="${T}" width="${Rr - L}" height="${B - T}" fill="${fill}" stroke="${col}" stroke-width="1" stroke-dasharray="4 3"/>`
    + `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="1" stroke-dasharray="2 3"/>`
    + arrow(x1, my, x2, my) + arrow(mx, y1, mx, y2)
    + `<circle cx="${x1}" cy="${y1}" r="4" fill="${col}"/><circle cx="${x2}" cy="${y2}" r="4" fill="${col}"/>`
    + `<rect x="${lx}" y="${ly}" width="${w}" height="${h}" rx="5" fill="rgba(16,20,42,.94)" stroke="${col}"/>`
    + lines.map((t, i) => `<text x="${lx + 9}" y="${ly + 18 + i * 16}" fill="${i ? '#b8c2ee' : '#fff'}" font-size="11.5" font-weight="${i ? 400 : 700}" font-family="Consolas,Menlo,monospace">${t}</text>`).join('');
}

function redrawRulers() { VIEWS.forEach(v => { if (v.ruler) drawRuler(v); }); }
window.redrawRulers = redrawRulers;

function handleDrawingClick(p, v) {
  if (tool === 'cursor' || !p.point) return;
  const pIdx = p.paneIndex ?? 0;
  if (tool === 'ruler') { rulerClick(p, v, pIdx); return; }
  const targetSeries = getSeriesForPane(v, pIdx);
  const price = targetSeries ? targetSeries.coordinateToPrice(p.point.y) : null;
  if (price == null) return;
  if (tool === 'h') {
    const pl = targetSeries.createPriceLine({ price, color: '#ffd43b', lineWidth: 1, lineStyle: LW.LineStyle.Solid, axisLabelVisible: true, title: '' });
    v.drawings.push({ type: 'h', paneIndex: pIdx, series: targetSeries, obj: pl, price });
    setTool('cursor'); toast('Horizontal line placed'); return;
  }
  if (tool === 'trend' && p.time) {
    if (!pending || pending.v !== v) { pending = { v, time: p.time, price, paneIndex: pIdx }; toast('Point A set. Click Point B.'); return; }
    if (pending.paneIndex !== pIdx) { pending = { v, time: p.time, price, paneIndex: pIdx }; return; }
    if (pending.time === p.time) return;
    const pts = [{ time: pending.time, price: pending.price }, { time: p.time, price }].sort((a, b) => a.time - b.time);
    const sr = v.c.chart.addSeries(LW.LineSeries, { color: '#00f0ff', lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, pIdx);
    sr.setData(pts.map(q => ({ time: q.time, value: q.price })));
    v.drawings.push({ type: 't', paneIndex: pIdx, obj: sr, pts });
    setTool('cursor'); toast('Trendline placed');
  }
}

function clearDrawings() {
  VIEWS.forEach(v => { removeDrawingObjs(v); v.drawings.length = 0; v.ruler = null; drawRuler(v); });
  pending = null;
  toast('All drawings removed');
}

/* =====================================================================
   BLOOMBERG TERMINAL INSTRUMENT SELECTOR
   ===================================================================== */
function renderBloombergList() {
  const query = $('bbSearch').value.trim().toUpperCase();
  const listEl = $('bbList');
  if (!listEl) return;
  listEl.innerHTML = '';

  const filtered = INSTRUMENTS.filter(it => {
    const matchCat = currentCat === 'all' || it.cat === currentCat;
    const matchQuery = !query || it.sym.includes(query) || it.name.toUpperCase().includes(query);
    return matchCat && matchQuery;
  });

  $('bbCount').textContent = `${filtered.length} Instruments`;

  if (!filtered.length) {
    listEl.append(el('div', { style: 'padding:20px;color:#ff9900;text-align:center' }, 'NO INSTRUMENT FOUND'));
    return;
  }

  if (bbSelectedIdx >= filtered.length) bbSelectedIdx = 0;

  filtered.forEach((it, idx) => {
    const item = el('div', {
      class: `bb-item ${idx === bbSelectedIdx ? 'active' : ''}`,
      onclick: () => selectInstrument(it.sym)
    },
      el('div', { class: 'bb-sym' }, it.sym),
      el('div', { class: 'bb-name' }, it.name),
      el('div', { class: 'bb-cat' }, it.cat),
      el('div', { class: 'bb-tag' }, it.tag)
    );
    listEl.append(item);
  });
}

function selectInstrument(sym) {
  closeBloombergModal();
  if (sym === S.symbol) return;
  if (A.positions.length) { toast('Close open positions before changing symbol'); return; }
  clearDrawings();
  S.symbol = sym;
  $('symInput').value = sym;
  saveSettings();
  reload(null, false);
  if (!S.replayOn) {
    setupLiveModeView();
    renderLiveTradingView(S.symbol, V1.tf);
  }
}

function openBloombergModal() {
  $('bbModal').hidden = false;
  $('bbSearch').value = '';
  bbSelectedIdx = 0;
  renderBloombergList();
  setTimeout(() => $('bbSearch').focus(), 50);
}

function closeBloombergModal() { $('bbModal').hidden = true; }

/* =====================================================================
   SPLIT SCREEN & LAYOUT MODES
   ===================================================================== */
function setActive(n) {
  activeChartIndex = n;
  $('paneChart1').classList.toggle('active-pane', n === 1);
  $('paneChart2').classList.toggle('active-pane', n === 2);
  markTf();
  if (scriptEditIdx !== null) { scriptEditIdx = null; $('scAdd').textContent = 'Add to chart'; }
  if (!$('modalInd').hidden) renderIndModal();
}

function setLayoutMode(mode, noLoad) {
  const prev = S.layout, cur = noLoad ? null : currentCursor();
  if (!noLoad && prev === 'single' && mode !== 'single') { V2.tf = V1.tf; V2.tfSec = V1.tfSec; }
  S.layout = mode;
  saveSettings();
  $('layoutSel').value = mode;
  const wrap = $('chartWrap');
  wrap.classList.remove('split-horz', 'split-vert');
  if (mode === 'single') { $('paneChart2').style.display = 'none'; setActive(1); }
  else { $('paneChart2').style.display = 'block'; wrap.classList.add(mode === 'horz' ? 'split-horz' : 'split-vert'); markTf(); }
  if (!noLoad) {
    if (mode !== 'single' && V2.key !== keyOf(V2)) reload(cur, false, [V2]);
    else if (!S.replayOn) showAll();
    else if (cur != null) positionAt(cur);
  }
  setTimeout(() => { sizePanes(); redrawRulers(); }, 60);
}

/* =====================================================================
   MODALS: INDICATORS & SCRIPTS
   ===================================================================== */
function openModal(id) { $(id).hidden = false; }

function applyIndChange(v = AV()) { rebuildIndicatorSeries(v); renderAll(); saveInds(); }

function addBuiltin(type) {
  const v = AV(), params = {}; BUILTIN[type].params.forEach(p => params[p.k] = p.d);
  const ind = { type, params, series: [] }; computeInd(v, ind); v.IND.push(ind); applyIndChange(v); renderIndModal();
}

function copyIndAtoB() {
  if (S.layout === 'single') { toast('Open split-screen layout first'); return; }
  V2.IND.forEach(ind => ind.series?.forEach(sr => { try { V2.c.chart.removeSeries(sr); } catch {} }));
  V2.IND = V1.IND.map(i => ({ type: i.type, params: JSON.parse(JSON.stringify(i.params || {})), code: i.code, name: i.name, series: [] }));
  V2.IND.forEach(i => computeInd(V2, i));
  applyIndChange(V2); if (!$('modalInd').hidden) renderIndModal();
  toast('Indicators copied: Chart A → Chart B');
}

function renderIndModal() {
  const v = AV();
  $('indTitle').textContent = `Indicators — Chart ${v.n === 1 ? 'A' : 'B'} (${v.tf})`;
  const av = $('indAvail'); av.innerHTML = '';

  for (const [type, d] of Object.entries(BUILTIN)) {
    av.append(el('button', { class: 'chip', onclick: () => addBuiltin(type) }, '+ ' + d.name));
  }

  const ac = $('indActive'); ac.innerHTML = '';
  if (!v.IND.length) ac.append(el('div', { class: 'muted' }, 'No indicators yet.'));
  v.IND.forEach((ind, idx) => {
    const ps = el('div', { class: 'ps' });
    if (ind.type !== 'script') BUILTIN[ind.type].params.forEach(p => {
      const inp = el('input', { type: p.t === 'color' ? 'color' : 'number', value: ind.params[p.k] });
      if (p.t === 'num') { inp.min = p.min ?? 1; inp.step = p.step ?? 1; }
      inp.addEventListener('change', () => { ind.params[p.k] = p.t === 'color' ? inp.value : (parseFloat(inp.value) || p.d); computeInd(v, ind); applyIndChange(v); renderIndModal(); });
      ps.append(el('label', {}, p.l, inp));
    });
    const head = el('div', { class: 't' }, el('span', {}, (ind.type === 'script' ? '{ } ' : '') + indTitle(ind)),
      el('span', {},
        ind.type === 'script' ? el('button', { class: 'btn', style: 'margin-right:6px', onclick: () => { loadScriptToEditor(ind.name || indTitle(ind), ind.code, idx); scriptEditView = v; openModal('modalScript'); } }, 'Edit') : '',
        el('button', { class: 'x', onclick: () => { v.IND.splice(idx, 1); applyIndChange(v); renderIndModal(); } }, 'Remove')));
    ac.append(el('div', { class: 'arow' }, head, ps, ind.error ? el('div', { class: 'err' }, ind.error) : ''));
  });
}

function savedScripts() { return store.get('tfx_scripts', []); }

function loadScriptToEditor(name, code, editIdx = null) {
  $('scName').value = name || ''; $('scCode').value = code || ''; $('scErr').textContent = ''; scriptEditIdx = editIdx;
  $('scAdd').textContent = editIdx === null ? 'Add to chart' : 'Update on chart';
}

function renderScriptList() {
  const l = $('scList'); l.innerHTML = ''; const arr = savedScripts();
  if (!arr.length) l.append(el('div', { class: 'muted' }, 'Nothing saved yet.'));
  arr.forEach((s, i) => l.append(el('div', { class: 'arow' }, el('div', { class: 't' }, el('span', {}, s.name),
    el('span', {}, el('button', { class: 'btn', style: 'margin-right:6px', onclick: () => loadScriptToEditor(s.name, s.code) }, 'Load'),
      el('button', { class: 'x', onclick: () => { const a = savedScripts(); a.splice(i, 1); store.set('tfx_scripts', a); renderScriptList(); } }, 'Delete'))))));
}

/* =====================================================================
   MAIN INTERFACE CONTROLS & TIMEFRAME SELECTORS
   ===================================================================== */
function markTf() {
  document.querySelectorAll('#tfSeg button').forEach(b => b.classList.toggle('on', b.dataset.tf === AV().tf));
}

function setReplaySpeed(val) {
  S.speed = val;
  R.speed = val === 'real' ? 'real' : +val;
  $('speedSel').value = String(val);
  const icon = $('speedIcon');
  if (icon) {
    if (val === 'real') icon.textContent = '⏱';
    else if (+val <= 0.05) icon.textContent = '🐢';
    else if (+val >= 300) icon.textContent = '🚀';
    else if (+val >= 60) icon.textContent = '⚡';
    else icon.textContent = '⏱';
  }
  saveSettings();
  if (R.playing) {
    clearTimeout(R.timer);
    loop();
  }
  scheduleUiUpdate();
}

function showLoading(on, msg) {
  if (dom.loading) dom.loading.hidden = !on;
  if (on && dom.loadTxt) dom.loadTxt.textContent = msg || `Loading ${S.symbol}...`;
}

async function reload(cursorEnd, forceRefresh = false, which = null) {
  showLoading(true, `Loading data for ${S.symbol}...`);
  try {
    const list = which || viewsNeeded();
    await Promise.all(list.map(async v => {
      const res = await loadData(v.tf, forceRefresh);
      v.candles = res.candles;
      v.srcUsed = res.source;
      v.tfSec = TF[v.tf];
      v.cols = colsOf(v.candles);
      v.key = keyOf(v);
    }));
    setPrecision();
    for (const v of list) { v.IND.forEach(ind => computeInd(v, ind)); rebuildIndicatorSeries(v); }
    updateStatus();

    const cs = master().candles;
    if (cs && cs.length) {
      const firstDt = new Date(cs[0].time * 1000).toISOString().slice(0, 10);
      const lastDt = new Date(cs[cs.length - 1].time * 1000).toISOString().slice(0, 10);
      const repDateEl = $('repDate');
      if (repDateEl) {
        repDateEl.min = firstDt;
        repDateEl.max = lastDt;
        if (!repDateEl.value || repDateEl.value < firstDt || repDateEl.value > lastDt) repDateEl.value = firstDt;
      }
    }

    if (S.replayOn) { 
      if (cursorEnd != null) positionAt(cursorEnd); 
      else startReplay(); 
    } else {
      setupLiveModeView();
    }
  } catch (e) { console.error(e); toast('Load failed: ' + e.message); }
  finally { showLoading(false); }
}
window.reload = reload;

function currentCursor() {
  if (!S.replayOn) return null;
  const m = master(); if (!m.candles.length) return null;
  pause(); while (R.k !== 0) { if (!tickFrame()) break; }
  return R.i > 0 ? m.candles[R.i - 1].time + m.tfSec : null;
}

async function changeTf(tf) {
  const v = AV(); if (tf === v.tf) return;
  const cur = currentCursor();
  removeDrawingObjs(v); v.drawings = v.drawings.filter(d => d.type === 'h'); v.ruler = null; drawRuler(v);
  v.tf = tf; markTf(); saveSettings();
  await reload(cur, false, [v]);
  if (!S.replayOn) {
    setupLiveModeView();
    renderLiveTradingView(S.symbol, V1.tf);
    toast(`Timeframe: ${tf} (Synced with Live Chart & Indicators)`);
  }
}

function toggleSidePanel() {
  sidePanelOpen = !sidePanelOpen;
  $('mainLayout').classList.toggle('side-collapsed', !sidePanelOpen);
  const topBtn = $('btnToggleSide');
  const fltBtn = $('btnSideToggleFloat');
  if (topBtn) topBtn.classList.toggle('on', sidePanelOpen);
  if (fltBtn) fltBtn.textContent = sidePanelOpen ? '◨' : '◧';
  setTimeout(() => {
    window.dispatchEvent(new Event('resize'));
    sizePanes(V1);
    applyDockRange();
  }, 100);
}

/* =====================================================================
   STARTUP INITIALIZATION
   ===================================================================== */
function init() {
  initDomCache();

  Object.keys(TF).forEach(tf => $('tfSeg').append(el('button', { 'data-tf': tf, class: tf === S.tf ? 'on' : '', onclick: () => changeTf(tf) }, tf)));

  $('symInput').value = S.symbol;
  $('rangeSel').value = S.range;
  $('srcSel').value = S.source;
  $('speedSel').value = String(S.speed);
  $('repDate').value = '2026-01-01';
  $('chkSpread').checked = !!S.spreadOn;
  $('selBroker').value = S.broker || 'XM';
  $('ordBal').value = A.startBal;
  $('replayChk').checked = true;

  $('btnStart').onclick = startReplay;
  $('btnPlay').onclick = togglePlay;
  $('btnTick').onclick = stepTick;
  $('btnCandle').onclick = stepCandle;

  $('speedSel').onchange = () => setReplaySpeed($('speedSel').value);
  $('btnSpeedDown').onclick = () => {
    const sel = $('speedSel');
    if (sel.selectedIndex > 0) { sel.selectedIndex--; setReplaySpeed(sel.value); toast(`Speed: ${sel.options[sel.selectedIndex].text}`); }
  };
  $('btnSpeedUp').onclick = () => {
    const sel = $('speedSel');
    if (sel.selectedIndex < sel.options.length - 1) { sel.selectedIndex++; setReplaySpeed(sel.value); toast(`Speed: ${sel.options[sel.selectedIndex].text}`); }
  };
  $('speedIcon').onclick = () => {
    const sel = $('speedSel');
    if (sel.value === 'real') { setReplaySpeed('2'); toast('Speed: 2 candles/s'); }
    else { setReplaySpeed('real'); toast(`Speed: 1:1 Real Live (${master().tf})`); }
  };

  $('btnFit').onclick = () => { C1.chart.timeScale().fitContent(); C2.chart.timeScale().fitContent(); };
  $('btnZoomIn').onclick = () => zoomChart(0.7);
  $('btnZoomOut').onclick = () => zoomChart(1.4);
  $('btnZoomReset').onclick = () => { C1.chart.timeScale().fitContent(); C2.chart.timeScale().fitContent(); };

  $('btnToggleSide').onclick = toggleSidePanel;
  $('btnSideToggleFloat').onclick = toggleSidePanel;
  $('btnCloseSideX').onclick = toggleSidePanel;

  $('toolCursor').onclick = () => setTool('cursor');
  $('toolH').onclick = () => setTool('h');
  $('toolTrend').onclick = () => setTool('trend');
  $('toolRuler').onclick = () => setTool('ruler');
  $('toolClear').onclick = clearDrawings;

  $('btnBuy').onclick = () => openPosition('long');
  $('btnSell').onclick = () => openPosition('short');
  $('btnCloseAll').onclick = () => { if (A.positions.length) closeAll('Manual'); };
  $('btnReset').onclick = () => {
    if (!confirm('Reset practice account?')) return;
    A.positions = []; A.history = []; A.startBal = Math.max(100, parseFloat($('ordBal').value) || 10000); A.balance = A.startBal;
    saveAcct(); syncPriceLines(); refreshMarkers(true); renderPositions(); renderHistory(); updateAll();
  };
  $('tabPos').onclick = () => { $('tabPos').classList.add('on'); $('tabHist').classList.remove('on'); $('panePos').hidden = false; $('paneHist').hidden = true; };
  $('tabHist').onclick = () => { $('tabHist').classList.add('on'); $('tabPos').classList.remove('on'); $('panePos').hidden = true; $('paneHist').hidden = false; renderHistory(); };

  $('rangeSel').onchange = async () => { S.range = $('rangeSel').value; saveSettings(); await reload(currentCursor(), false); };
  $('srcSel').onchange = async () => { S.source = $('srcSel').value; saveSettings(); await reload(currentCursor(), false); };
  $('btnUpdateData').onclick = async () => { toast('Updating data...'); await reload(currentCursor(), true); toast('Data updated!'); };
  $('chkSpread').addEventListener('change', () => { S.spreadOn = $('chkSpread').checked; saveSettings(); updateBidAsk(Pz.last); syncPriceLines(); updateAll(); toast(S.spreadOn ? `Spread ON (${S.broker})` : 'Spread OFF'); });
  $('selBroker').addEventListener('change', () => { S.broker = $('selBroker').value; saveSettings(); updateBidAsk(Pz.last); syncPriceLines(); updateAll(); toast(`Broker: ${S.broker}`); });

  $('replayChk').onchange = () => {
    S.replayOn = $('replayChk').checked;
    saveSettings();
    pause();
    const isReplay = S.replayOn;
    const tvLayer = $('tvEmbedWrap');

    ['btnStart', 'btnPlay', 'btnTick', 'btnCandle', 'speedSel', 'btnSpeedDown', 'btnSpeedUp', 'repDate'].forEach(id => {
      const elx = $(id); if (elx) elx.disabled = !isReplay;
    });

    if (isReplay) {
      if (tvLayer) tvLayer.style.display = 'none';
      syncDockedCrosshair(null, null);
      startReplay();
      toast('Mode: Practice Replay');
    } else {
      if (tvLayer) tvLayer.style.display = 'block';
      setupLiveModeView();
      renderLiveTradingView(S.symbol, V1.tf);
      updateDockVisibility();
      initTvCrosshairSync();
      toast(`Mode: Real-Time Live (${S.symbol})`);
    }
  };

  document.addEventListener('keydown', e => {
    const t = e.target.tagName; if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    else if (e.key === 'ArrowRight') stepCandle();
    else if (e.key === 'b' || e.key === 'B') openPosition('long');
    else if (e.key === 's' || e.key === 'S') openPosition('short');
  });

  setInterval(() => { const c = $('clockTxt'); if (c) c.textContent = new Date().toLocaleString('en-GB', { hour12: false }); }, 1000);

  VIEWS.forEach(v => v.c.chart.subscribeCrosshairMove(p => {
    v.pendingParam = p;
    if (v.legRaf) return;
    v.legRaf = true;
    requestAnimationFrame(() => {
      v.legRaf = false;
      updateLegend(v, v.pendingParam);
      if (v === V1 && isDockActive()) {
        const q = v.pendingParam || p;
        let logical = null;
        if (q.point) {
          if (q.logical != null) logical = q.logical;
          else { const lg = v.c.chart.timeScale().coordinateToLogical(q.point.x); if (lg != null) logical = Math.round(lg); }
        }
        syncDockedCrosshair(q.time, logical);
      }
    });
  }));

  V1.c.chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
    if (isDockActive()) syncDockedChartsRange();
  });

  initTvCrosshairSync();

  document.querySelectorAll('.modal').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m || e.target.hasAttribute('data-close')) m.hidden = true; });
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { document.querySelectorAll('.modal').forEach(m => m.hidden = true); if (tool !== 'cursor') setTool('cursor'); } });

  $('btnInd').onclick = () => { renderIndModal(); openModal('modalInd'); };
  $('btnCopyInd').onclick = copyIndAtoB;
  $('btnCopyInd2').onclick = copyIndAtoB;

  $('btnScript').onclick = () => { renderScriptList(); $('scTitle').textContent = 'Script indicators (JavaScript) — Chart ' + (AV().n === 1 ? 'A' : 'B'); openModal('modalScript'); };
  const tplSel = $('tplSel');
  if (tplSel) {
    tplSel.append(el('option', { value: '' }, 'Load template…'));
    tplSel.onchange = () => { if (tplSel.value) loadScriptToEditor(tplSel.value, TEMPLATES[tplSel.value]); tplSel.value = ''; };
  }
  $('scNew').onclick = () => loadScriptToEditor('', '');
  $('scSave').onclick = () => {
    const name = $('scName').value.trim() || 'My script', code = $('scCode').value, arr = savedScripts(), i = arr.findIndex(s => s.name === name);
    if (i >= 0) arr[i] = { name, code }; else arr.push({ name, code });
    store.set('tfx_scripts', arr); renderScriptList(); toast('Saved');
  };
  $('scAdd').onclick = () => {
    const name = $('scName').value.trim() || 'My script', code = $('scCode').value;
    const v = (scriptEditIdx !== null && scriptEditView) ? scriptEditView : AV();
    const test = { type: 'script', code, name, series: [] }; computeInd(v, test);
    if (test.error) { $('scErr').textContent = 'Error: ' + test.error; return; }
    $('scErr').textContent = '';
    if (scriptEditIdx !== null && v.IND[scriptEditIdx]) Object.assign(v.IND[scriptEditIdx], { code, name, spec: test.spec, error: null });
    else v.IND.push(test);
    scriptEditIdx = null; scriptEditView = null; $('scAdd').textContent = 'Add to chart';
    applyIndChange(v); toast('Script applied to Chart ' + (v.n === 1 ? 'A' : 'B'));
  };

  $('symInput').addEventListener('click', openBloombergModal);
  $('bbClose').addEventListener('click', closeBloombergModal);
  $('bbModal').addEventListener('click', e => { if (e.target === $('bbModal')) closeBloombergModal(); });

  document.querySelectorAll('#bbTabs .bb-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#bbTabs .bb-tab').forEach(t => t.classList.remove('on'));
      tab.classList.add('on');
      currentCat = tab.dataset.cat;
      bbSelectedIdx = 0;
      renderBloombergList();
    });
  });

  $('bbSearch').addEventListener('input', () => { bbSelectedIdx = 0; renderBloombergList(); });
  $('bbSearch').addEventListener('keydown', e => {
    const items = document.querySelectorAll('.bb-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (items.length) {
        bbSelectedIdx = (bbSelectedIdx + 1) % items.length;
        renderBloombergList();
        const activeEl = document.querySelector('.bb-item.active');
        if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (items.length) {
        bbSelectedIdx = (bbSelectedIdx - 1 + items.length) % items.length;
        renderBloombergList();
        const activeEl = document.querySelector('.bb-item.active');
        if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const activeEl = document.querySelector('.bb-item.active');
      if (activeEl) selectInstrument(activeEl.querySelector('.bb-sym').textContent);
      else if ($('bbSearch').value.trim()) selectInstrument($('bbSearch').value.trim().toUpperCase());
    } else if (e.key === 'Escape') closeBloombergModal();
  });

  $('layoutSel').addEventListener('change', () => setLayoutMode($('layoutSel').value));
  $('paneChart1').addEventListener('pointerdown', () => setActive(1), true);
  $('paneChart2').addEventListener('pointerdown', () => setActive(2), true);

  setReplaySpeed(S.speed);
  setLayoutMode(S.layout || 'single', true);

  const saved = store.get('tfx_inds', null);
  const defaults = saved ?? [
    { type: 'ema', params: { len: 50, color: '#ffd43b' } },
    { type: 'rsi', params: { len: 14, color: '#b388ff' } }
  ];
  const okInd = d => d && (d.type === 'script' || BUILTIN[d.type]);
  const mapInd = d => ({ type: d.type, params: d.params || {}, code: d.code, name: d.name, series: [] });
  defaults.filter(okInd).forEach(d => V1.IND.push(mapInd(d)));
  (store.get('tfx_inds2', []) || []).filter(okInd).forEach(d => V2.IND.push(mapInd(d)));

  renderPositions();
  renderHistory();
  updateAll();
  reload(null, false);

  const tvLayer = $('tvEmbedWrap');
  if (tvLayer) tvLayer.style.display = 'none';
}

/* Live TradingView chart module (live.js) */
const { renderLiveTradingView, tvDockRange, applyDockRange, setupLiveModeView, syncLiveOverlayFromDock, hideLiveCrosshair, initTvCrosshairSync } = window.TFX_createLive({
  $, S, V1, store, toast, fmtP, fmtDT, isF, master, pause, syncViewStates, viewsNeeded, renderView, syncDockedCrosshair,
  getDocked: () => dockedIndicators
});

init();

})();
