/* Tributo Fx - Live TradingView chart + dock crosshair sync (split from script.js) */
(() => {
'use strict';
window.TFX_createLive = function (ctx) {
  const { $, S, V1, store, toast, fmtP, fmtDT, isF, master, pause, syncViewStates, viewsNeeded, renderView, syncDockedCrosshair, getDocked } = ctx;
  let tvWidget = null;
  let tvSyncMode = true;
  let tvCal = null;
  let liveVisibleBars = 110;

  /* =====================================================================
     LIVE TRADINGVIEW WIDGET INTEGRATION
     ===================================================================== */
  function renderLiveTradingView(sym = S.symbol, tf = V1.tf) {
    let tvSymbol = 'OANDA:XAUUSD';
    const upper = String(sym || 'XAUUSD').toUpperCase();

    if (upper === 'XAUUSD' || upper === 'GOLD') tvSymbol = 'OANDA:XAUUSD';
    else if (upper.includes('BTC')) tvSymbol = 'BINANCE:BTCUSDT';
    else if (upper.includes('ETH')) tvSymbol = 'BINANCE:ETHUSDT';
    else if (upper.includes('SOL')) tvSymbol = 'BINANCE:SOLUSDT';
    else if (upper.includes('BNB')) tvSymbol = 'BINANCE:BNBUSDT';
    else if (upper.includes('XRP')) tvSymbol = 'BINANCE:XRPUSDT';
    else if (upper.includes('EURUSD')) tvSymbol = 'OANDA:EURUSD';
    else if (upper.includes('GBPUSD')) tvSymbol = 'OANDA:GBPUSD';
    else if (upper.includes('USDJPY')) tvSymbol = 'OANDA:USDJPY';
    else if (upper.includes('GBPJPY')) tvSymbol = 'OANDA:GBPJPY';
    else if (upper.includes('AUDUSD')) tvSymbol = 'OANDA:AUDUSD';
    else if (upper === 'NAS100' || upper === 'US100' || upper === 'USTEC' || upper === 'NQ') tvSymbol = 'CAPITALCOM:US100';
    else if (upper === 'USOIL' || upper === 'UKOIL') tvSymbol = 'TVC:USOIL';
    else tvSymbol = `OANDA:${upper}`;

    const tfMap = { '1m': '1', '5m': '5', '15m': '15', '1h': '60', '4h': '240', '1d': 'D' };
    const interval = tfMap[tf] || '15';

    const container = $('tvChartContainer');
    if (container) container.innerHTML = '';

    if (window.TradingView) {
      tvWidget = new TradingView.widget({
        "autosize": true,
        "symbol": tvSymbol,
        "interval": interval,
        "timezone": "Etc/UTC",
        "theme": "dark",
        "style": "1",
        "locale": "en",
        "toolbar_bg": "#0b0e1a",
        "enable_publishing": false,
        "hide_side_toolbar": false,
        "allow_symbol_change": true,
        "container_id": "tvChartContainer"
      });
    }
  }
  window.renderLiveTradingView = renderLiveTradingView;

  /* =====================================================================
     LIVE TRADINGVIEW CROSSHAIR & EXACT CANDLE DOCK SYNCHRONIZATION
     ===================================================================== */
  function tvDockRange(lastIdx) {
    const ov = $('tvCrossOverlay'), W = ov ? ov.clientWidth : 0;
    const s = (tvCal && tvCal.s > 0) ? tvCal.s : 6.5;
    const gap = (tvCal && isF(tvCal.gap)) ? tvCal.gap : 85;
    if (!W) return { from: Math.max(0, lastIdx - (liveVisibleBars || 110)), to: lastIdx + 10 };
  
    const visibleBefore = (W - gap) / s;
    const visibleAfter = gap / s;
    return {
      from: Math.max(0, Math.floor(lastIdx - visibleBefore)),
      to: Math.ceil(lastIdx + visibleAfter)
    };
  }

  function applyDockRange() {
    const cs = V1.candles; if (!cs || !cs.length) return;
    const range = tvDockRange(cs.length - 1);
    try { V1.c.chart.timeScale().setVisibleLogicalRange(range); } catch {}
    getDocked().forEach(d => { try { d.chart.timeScale().setVisibleLogicalRange(range); } catch {} });
  }

  function setupLiveModeView() {
    pause();
    const m = master();
    const cs = m.candles;
    if (!cs || !cs.length) return;

    m.done = cs.length;
    m.form = null;
    syncViewStates();
    for (const v of viewsNeeded()) renderView(v);

    const lastIdx = cs.length - 1;
    const range = tvDockRange(lastIdx);

    try {
      m.c.chart.timeScale().setVisibleLogicalRange(range);
    } catch {}

    getDocked().forEach(d => {
      try { d.chart.timeScale().setVisibleLogicalRange(range); } catch {}
    });
  }
  window.setupLiveModeView = setupLiveModeView;

  function syncLiveOverlayFromDock(targetIdx, clampedIdx) {
    const overlay = $('tvCrossOverlay');
    const vLine = $('tvCrossV');
    const hLine = $('tvCrossH');
    const pBadge = $('tvPriceBadge');
    const tBadge = $('tvTimeBadge');
    if (!overlay || !vLine || !hLine || !tvCal) return;

    const W = overlay.clientWidth;
    if (!W) return;
    const cs = V1.candles;
    if (!cs || !cs.length) return;
    const lastIdx = cs.length - 1;

    const xLatest = W - tvCal.gap;
    const liveX = Math.round(xLatest + (targetIdx - lastIdx) * tvCal.s);

    if (liveX < 0 || liveX > W) {
      hideLiveCrosshair();
      return;
    }

    vLine.setAttribute('x1', liveX);
    vLine.setAttribute('x2', liveX);
    vLine.style.display = 'block';

    const candle = cs[clampedIdx];
    if (candle && V1.c.candleSeries) {
      const y = V1.c.candleSeries.priceToCoordinate(candle.close);
      if (y != null && isF(y)) {
        hLine.setAttribute('y1', y);
        hLine.setAttribute('y2', y);
        hLine.style.display = 'block';

        if (pBadge) {
          pBadge.textContent = fmtP(candle.close);
          pBadge.style.top = y + 'px';
          pBadge.style.display = 'block';
        }
      } else {
        hLine.style.display = 'none';
        if (pBadge) pBadge.style.display = 'none';
      }

      if (tBadge) {
        tBadge.textContent = fmtDT(candle.time);
        tBadge.style.left = liveX + 'px';
        tBadge.style.display = 'block';
      }
    } else {
      hLine.style.display = 'none';
      if (pBadge) pBadge.style.display = 'none';
    }
  }

  function hideLiveCrosshair() {
    const vLine = $('tvCrossV');
    const hLine = $('tvCrossH');
    const pBadge = $('tvPriceBadge');
    const tBadge = $('tvTimeBadge');
    if (vLine) vLine.style.display = 'none';
    if (hLine) hLine.style.display = 'none';
    if (pBadge) pBadge.style.display = 'none';
    if (tBadge) tBadge.style.display = 'none';
  }

  function initTvCrosshairSync() {
    const overlay = $('tvCrossOverlay');
    const vLine = $('tvCrossV');
    const hLine = $('tvCrossH');
    const pBadge = $('tvPriceBadge');
    const tBadge = $('tvTimeBadge');
    const btnSync = $('btnTvSyncMode');
    const btnInteract = $('btnTvInteract');

    if (!overlay) return;
    if (initTvCrosshairSync.ready) return;
    initTvCrosshairSync.ready = true;
    tvCal = store.get('tfx_tv_cal', null) || { gap: 85, s: 6.5 };
    let calStep = 0;

    let tvAuto = false, tvAutoTimer = null, tvFromCanvas = false;
    function setTvSync(on, auto) {
      clearTimeout(tvAutoTimer);
      tvAuto = !!auto;
      tvFromCanvas = false;
      tvSyncMode = on;
      overlay.style.pointerEvents = on ? 'auto' : 'none';
      if (btnSync && btnInteract) {
        btnSync.style.background = on ? 'var(--panel2)' : 'none';
        btnSync.style.color = on ? 'var(--cyan)' : 'var(--muted)';
        btnSync.style.fontWeight = on ? '700' : '400';

        btnInteract.style.background = on ? 'none' : 'var(--panel2)';
        btnInteract.style.color = on ? 'var(--muted)' : 'var(--cyan)';
        btnInteract.style.fontWeight = on ? '400' : '700';
      }
      if (!on) {
        calStep = 0;
        hideLiveCrosshair();
        syncDockedCrosshair(null, null);
      }
    }

    if (btnSync) btnSync.onclick = () => { setTvSync(true); toast('✛ Dock Sync: Move mouse to inspect indicators'); };
    if (btnInteract) btnInteract.onclick = () => { setTvSync(false); toast('✏ Drawing Mode: Direct control of TradingView'); };

    setTvSync(true);

    overlay.addEventListener('wheel', e => {
      if (!tvSyncMode) return;
      const delta = e.deltaY;
      if (delta < 0) {
        liveVisibleBars = Math.max(25, liveVisibleBars - 10);
      } else {
        liveVisibleBars = Math.min(350, liveVisibleBars + 10);
      }
      const cs = V1.candles;
      if (cs && cs.length) {
        const lastIdx = cs.length - 1;
        const range = { from: Math.max(0, lastIdx - liveVisibleBars), to: lastIdx + Math.round(tvCal.gap / tvCal.s) };
        getDocked().forEach(d => {
          try { d.chart.timeScale().setVisibleLogicalRange(range); } catch {}
        });
        try { V1.c.chart.timeScale().setVisibleLogicalRange(range); } catch {}
      }
    }, { passive: true });

    const tvResume = () => { if (tvAuto) setTvSync(true); };
    const tvHandOver = ms => { if (!tvSyncMode) return; setTvSync(false, true); tvFromCanvas = true; if (ms) tvAutoTimer = setTimeout(tvResume, ms); };
    overlay.addEventListener('wheel', () => { if (!calStep) tvHandOver(1500); }, { passive: true });
    overlay.addEventListener('pointerdown', e => { if (calStep) tvCalibrate(e); else tvHandOver(4000); });

    function tvSolveSpacing(xL, x2) {
      const cs = V1.candles, last = cs.length - 1;
      if (last < 20 || !(xL - x2 > 20)) return null;
      let best = null;
      for (let c = last - 1; c >= 0; c--) {
        const s = (xL - x2) / (last - c);
        if (s > 20) continue;
        if (s < 2) break;
        const from = Math.max(0, Math.floor(last - xL / s)), hc = cs[c].high;
        let ok = true;
        for (let i = from; i <= last; i++) if (cs[i].high > hc) { ok = false; break; }
        if (!ok) continue;
        const score = Math.abs(Math.log(s / 6.5));
        if (!best || score < best.score) best = { s, c, score };
      }
      return best;
    }

    function tvCalibrate(e) {
      const r = overlay.getBoundingClientRect(), x = e.clientX - r.left, W = r.width;
      if (calStep === 1) {
        tvCal.gap = Math.max(10, Math.round(W - x));
        store.set('tfx_tv_cal', tvCal);
        calStep = 2;
        applyDockRange();
        toast(`✓ Latest candle saved (Gap: ${tvCal.gap}px). Step 2/2: Click an earlier candle/peak, or Esc to finish`);
      } else if (calStep === 2) {
        const best = tvSolveSpacing(W - tvCal.gap, x);
        if (!best) {
          const dx = (W - tvCal.gap) - x;
          if (dx > 25) {
            tvCal.s = Math.max(2, Math.min(25, +(dx / 10).toFixed(1)));
            store.set('tfx_tv_cal', tvCal);
            calStep = 0;
            applyDockRange();
            toast(`✓ Aligned (~${tvCal.s.toFixed(1)} px per candle). Move mouse to test`);
            return;
          }
          toast('Could not match that candle. Click a visible candle left of latest, or Esc');
          return;
        }
        tvCal.s = best.s;
        store.set('tfx_tv_cal', tvCal);
        calStep = 0;
        applyDockRange();
        toast('✓ Aligned (' + best.s.toFixed(1) + ' px per candle). Move mouse to test');
      }
    }

    const btnAlign = $('btnTvAlign');
    if (btnAlign) btnAlign.onclick = () => { setTvSync(true); calStep = 1; toast('🎯 1/2: Click the LATEST candle (rightmost) on chart'); };
  
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && calStep) { calStep = 0; toast('✓ Alignment saved'); }
      if (!S.replayOn && tvSyncMode && !calStep) {
        if (e.key === '[') {
          tvCal.gap = Math.max(10, tvCal.gap - 2);
          store.set('tfx_tv_cal', tvCal);
          applyDockRange();
          toast(`Gap Nudge: ${tvCal.gap}px`);
        } else if (e.key === ']') {
          tvCal.gap += 2;
          store.set('tfx_tv_cal', tvCal);
          applyDockRange();
          toast(`Gap Nudge: ${tvCal.gap}px`);
        }
      }
    });

    window.addEventListener('blur', () => setTimeout(() => {
      if (S.replayOn || (!tvSyncMode && !tvAuto)) return;
      const f = document.activeElement;
      if (f && f.tagName === 'IFRAME' && $('tvChartContainer').contains(f)) {
        const fromCanvas = tvFromCanvas;
        setTvSync(false, true);
        tvAutoTimer = setTimeout(tvResume, fromCanvas ? 4000 : 15000);
      }
    }, 0));
    window.addEventListener('focus', () => { if (!S.replayOn) tvResume(); });
    const tvWrap = $('tvEmbedWrap');
    if (tvWrap) tvWrap.addEventListener('mouseenter', () => { if (!S.replayOn) tvResume(); });

    overlay.addEventListener('pointermove', e => {
      if (!tvSyncMode) return;
      const rect = overlay.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const W = rect.width;

      vLine.setAttribute('x1', x);
      vLine.setAttribute('x2', x);
      vLine.style.display = 'block';

      hLine.setAttribute('y1', y);
      hLine.setAttribute('y2', y);
      hLine.style.display = 'block';

      const price = V1.c.candleSeries.coordinateToPrice(y);
      if (price != null && isF(price)) {
        pBadge.textContent = fmtP(price);
        pBadge.style.top = y + 'px';
        pBadge.style.display = 'block';
      } else {
        pBadge.style.display = 'none';
      }

      const cs = V1.candles;
      if (cs && cs.length) {
        const lastIdx = cs.length - 1;
        const xLatest = W - tvCal.gap;
        const targetIdx = Math.round(lastIdx + (x - xLatest) / tvCal.s);

        if (targetIdx > lastIdx) {
          const futureSec = (targetIdx - lastIdx) * (V1.tfSec || 60);
          tBadge.textContent = fmtDT(cs[lastIdx].time + futureSec);
          tBadge.style.left = x + 'px';
          tBadge.style.display = 'block';
          syncDockedCrosshair(null, targetIdx);
        } else {
          const clampedIdx = Math.max(0, targetIdx);
          tBadge.textContent = fmtDT(cs[clampedIdx].time);
          tBadge.style.left = x + 'px';
          tBadge.style.display = 'block';
          syncDockedCrosshair(cs[clampedIdx].time, targetIdx);
        }
      } else {
        tBadge.style.display = 'none';
      }
    });

    overlay.addEventListener('pointerleave', () => {
      hideLiveCrosshair();
      syncDockedCrosshair(null, null);
    });

    document.addEventListener('keydown', e => {
      const t = e.target.tagName;
      if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
      if (!S.replayOn) {
        if (e.key === 'c' || e.key === 'C') {
          setTvSync(!tvSyncMode);
          toast(tvSyncMode ? '✛ Sync Dock: ON' : '✏ Draw & Control: ON');
        } else if (e.key === 'Shift' && !tvSyncMode) {
          setTvSync(true);
        }
      }
    });

    document.addEventListener('keyup', e => {
      if (!S.replayOn && e.key === 'Shift') {
        setTvSync(false);
      }
    });
  }

  return { renderLiveTradingView, tvDockRange, applyDockRange, setupLiveModeView, syncLiveOverlayFromDock, hideLiveCrosshair, initTvCrosshairSync };
};
})();
