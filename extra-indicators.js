/**
 * Tributo Fx — Extra Technical Indicators Plugin (MT5 Standard Suite)
 * File: extra-indicators.js
 */
(function() {
  'use strict';

  window.TFX_EXTRA_INDICATORS = window.TFX_EXTRA_INDICATORS || {};

  const isF = Number.isFinite;
  const nanArr = n => new Array(n).fill(NaN);

  const math = {
    sma(src, len) {
      const n = src.length, out = nanArr(n); let sum = 0, bad = 0;
      for (let i = 0; i < n; i++) {
        const v = src[i]; if (isF(v)) sum += v; else bad++;
        if (i >= len) { const u = src[i - len]; if (isF(u)) sum -= u; else bad--; }
        if (i >= len - 1 && bad === 0) out[i] = sum / len;
      }
      return out;
    },
    ema(src, len) {
      const n = src.length, out = nanArr(n), a = 2 / (len + 1);
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
    smma(src, len) {
      const n = src.length, out = nanArr(n), a = 1 / len;
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
    hl2(h, l) {
      const n = h.length, out = new Array(n);
      for (let i = 0; i < n; i++) out[i] = (h[i] + l[i]) / 2;
      return out;
    }
  };

  const line = (title, values, color, w = 2) => ({ title, values, color, type: 'line', lineWidth: w });

  // 1. Bears Power (MT5 Histogram)
  window.TFX_EXTRA_INDICATORS.bearspower = {
    name: 'Bears Power (MT5)',
    params: [
      { k: 'len', l: 'Period', t: 'num', d: 13, min: 1 },
      { k: 'color', l: 'Color', t: 'color', d: '#ff3d71' }
    ],
    run: (c, p) => {
      const ema = math.ema(c.close, p.len);
      const vals = c.low.map((l, i) => isF(ema[i]) ? l - ema[i] : NaN);
      const colors = vals.map((v, i) => !isF(v) ? null : v >= (vals[i - 1] || 0) ? '#ff6b8b' : '#ff3d71');
      return {
        overlay: false,
        plots: [{ title: 'Bears (' + p.len + ')', values: vals, color: p.color, type: 'histogram', colors }],
        hlines: [{ price: 0, color: '#4a5380', title: '0.0' }]
      };
    }
  };

  // 2. Bulls Power (MT5 Histogram)
  window.TFX_EXTRA_INDICATORS.bullspower = {
    name: 'Bulls Power (MT5)',
    params: [
      { k: 'len', l: 'Period', t: 'num', d: 13, min: 1 },
      { k: 'color', l: 'Color', t: 'color', d: '#00e5a0' }
    ],
    run: (c, p) => {
      const ema = math.ema(c.close, p.len);
      const vals = c.high.map((h, i) => isF(ema[i]) ? h - ema[i] : NaN);
      const colors = vals.map((v, i) => !isF(v) ? null : v >= (vals[i - 1] || 0) ? '#00e5a0' : '#00996b');
      return {
        overlay: false,
        plots: [{ title: 'Bulls (' + p.len + ')', values: vals, color: p.color, type: 'histogram', colors }],
        hlines: [{ price: 0, color: '#4a5380', title: '0.0' }]
      };
    }
  };

  // 3. DeMarker (MT5 Standard Oscillator)
  window.TFX_EXTRA_INDICATORS.demarker = {
    name: 'DeMarker (MT5)',
    params: [
      { k: 'len', l: 'Period', t: 'num', d: 14, min: 1 },
      { k: 'color', l: 'Color', t: 'color', d: '#00f0ff' }
    ],
    run: (c, p) => {
      const n = c.high.length, dMax = nanArr(n), dMin = nanArr(n), out = nanArr(n);
      for (let i = 1; i < n; i++) {
        dMax[i] = c.high[i] > c.high[i - 1] ? (c.high[i] - c.high[i - 1]) : 0;
        dMin[i] = c.low[i] < c.low[i - 1] ? (c.low[i - 1] - c.low[i]) : 0;
      }
      const sMax = math.sma(dMax, p.len);
      const sMin = math.sma(dMin, p.len);
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
  };

  // 4. Awesome Oscillator (AO MT5 Histogram)
  window.TFX_EXTRA_INDICATORS.ao = {
    name: 'Awesome Oscillator (AO)',
    params: [
      { k: 'f', l: 'Fast SMA', t: 'num', d: 5, min: 1 },
      { k: 's', l: 'Slow SMA', t: 'num', d: 34, min: 2 }
    ],
    run: (c, p) => {
      const med = math.hl2(c.high, c.low);
      const sf = math.sma(med, p.f), ss = math.sma(med, p.s), n = med.length, vals = nanArr(n);
      for (let i = 0; i < n; i++) if (isF(sf[i]) && isF(ss[i])) vals[i] = sf[i] - ss[i];
      const colors = vals.map((v, i) => !isF(v) ? null : v >= (vals[i - 1] || 0) ? '#00e5a0' : '#ff3d71');
      return {
        overlay: false,
        plots: [{ title: 'AO', values: vals, color: '#00e5a0', type: 'histogram', colors }],
        hlines: [{ price: 0, color: '#4a5380', title: '0.0' }]
      };
    }
  };

  // 5. Gator Oscillator (Alligator Histogram)
  window.TFX_EXTRA_INDICATORS.alligator_hist = {
    name: 'Gator Oscillator (Histogram)',
    params: [],
    run: (c) => {
      const med = math.hl2(c.high, c.low);
      const jaw = math.smma(med, 13);
      const teeth = math.smma(med, 8);
      const lips = math.smma(med, 5);
      const n = med.length;
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
  };

  // 6. Classic Alligator Lines Overlay
  window.TFX_EXTRA_INDICATORS.alligator = {
    name: 'Alligator (Lines)',
    params: [],
    run: (c) => {
      const med = math.hl2(c.high, c.low);
      return {
        overlay: true,
        plots: [
          line('Jaw (13)', math.smma(med, 13), '#2962ff', 2),
          line('Teeth (8)', math.smma(med, 8), '#ff3d71', 2),
          line('Lips (5)', math.smma(med, 5), '#00e5a0', 2)
        ]
      };
    }
  };

  // 7. OsMA Indicator (Moving Average of Oscillator) — Default: 12, 6, 9
  window.TFX_EXTRA_INDICATORS.osma = {
    name: 'OsMA (12, 6, 9)',
    params: [
      { k: 'f', l: 'Fast EMA', t: 'num', d: 12, min: 1 },
      { k: 's', l: 'Slow EMA', t: 'num', d: 6, min: 1 },
      { k: 'sig', l: 'Signal SMA', t: 'num', d: 9, min: 1 }
    ],
    run: (c, p) => {
      const fastEMA = math.ema(c.close, p.f);
      const slowEMA = math.ema(c.close, p.s);
      const n = c.close.length;
      const macd = nanArr(n);
      for (let i = 0; i < n; i++) {
        if (isF(fastEMA[i]) && isF(slowEMA[i])) {
          macd[i] = fastEMA[i] - slowEMA[i];
        }
      }
      const signal = math.sma(macd, p.sig);
      const osma = nanArr(n);
      for (let i = 0; i < n; i++) {
        if (isF(macd[i]) && isF(signal[i])) {
          osma[i] = macd[i] - signal[i];
        }
      }
      const colors = osma.map((v, i) => !isF(v) ? null : v >= (osma[i - 1] || 0) ? '#00e5a0' : '#ff3d71');
      return {
        overlay: false,
        plots: [{ title: 'OsMA', values: osma, color: '#00e5a0', type: 'histogram', colors }],
        hlines: [{ price: 0, color: '#4a5380', title: '0.0' }]
      };
    }
  };

})();
