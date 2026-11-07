'use strict';
/* ==========================================================================
   ui.js — Interfaz: navegación entre pantallas, controles de entrada,
   ajustes, personalización, pantalla completa y arranque del juego.
   ========================================================================== */

(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const S = Store.data;

  const stage = $('#stage'), canvas = $('#game'), hud = $('#hud');
  const NAMES = ['menu', 'modes', 'customize', 'instructions', 'settings', 'pause', 'over'];
  const screens = {}; NAMES.forEach(n => screens[n] = $('#screen-' + n));
  let current = 'menu', previous = 'menu', armTimer = null, previewRaf = 0;

  /* ------------------------------------------------ Escala / responsive */
  function layout() {
    const vv = window.visualViewport;
    const vw = vv ? vv.width : window.innerWidth, vh = vv ? vv.height : window.innerHeight;
    const aspect = vw / vh;
    const W = Math.max(CONFIG.MIN_W, Math.min(CONFIG.MAX_W, Math.round(CONFIG.H * aspect)));  // ancho lógico
    const stageW = Math.floor(Math.min(vw, vh * W / CONFIG.H)), stageH = Math.floor(stageW * CONFIG.H / W);
    stage.style.width = stageW + 'px'; stage.style.height = stageH + 'px';
    stage.style.setProperty('--u', (stageW / W).toFixed(4));
    document.body.classList.toggle('portrait', vh > vw);
    Game.resize(stageW, stageH, W, Math.min(window.devicePixelRatio || 1, 2));
  }

  /* ------------------------------------------------ Navegación */
  function show(name) {            // name = pantalla o null (en partida)
    previous = current === 'settings' ? previous : current;
    current = name;
    NAMES.forEach(n => screens[n].classList.toggle('show', n === name));
    const playing = name === null;
    hud.classList.toggle('hidden', !playing);
    $('#btn-settings').classList.toggle('hidden', playing || name === 'settings');
    $('#btn-fullscreen').classList.toggle('hidden', playing || !fsSupported());
    if (name === 'over') {
      screens.over.classList.remove('armed');
      clearTimeout(armTimer); armTimer = setTimeout(() => screens.over.classList.add('armed'), 450); // evita toques accidentales
    }
    if (name === 'modes') $$('[data-best]').forEach(el => { const b = S.best[el.dataset.best]; el.textContent = b ? 'Mejor: ' + b : ''; });
    if (name === 'customize') startPreview(); else stopPreview();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  function startGame(modeId) {
    S.lastMode = modeId; Store.save();
    Game.start(modeId);
    show(null);
  }

  const ACTIONS = {
    play: () => show('modes'),
    mode: (el) => { AudioSys.sfx('start'); startGame(el.dataset.mode); },
    customize: () => show('customize'),
    instructions: () => show('instructions'),
    settings: () => { previous = current; show('settings'); },
    'close-settings': () => show(previous),
    back: () => show('menu'),
    retry: () => { AudioSys.sfx('start'); startGame(Game.mode.id); },
    menu: () => { Game.toMenu(); show('menu'); },
    pause: () => { if (Game.state === 'playing') { Game.pause(); show('pause'); } },
    resume: () => { Game.resume(); show(null); },
    fullscreen: () => toggleFullscreen()
  };
  stage.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const act = el.dataset.action;
    if (act !== 'mode' && act !== 'retry') AudioSys.sfx('click');
    ACTIONS[act] && ACTIONS[act](el);
  });

  /* ------------------------------------------------ Controles de salto */
  /* Espacio, flecha arriba, clic y toque. Se ignora la repetición de tecla
     (e.repeat) para que mantener pulsado NO genere saltos involuntarios. */
  window.addEventListener('keydown', (e) => {
    const k = e.code;
    if (k === 'Space' || k === 'ArrowUp') {
      if (Game.state === 'playing') { e.preventDefault(); if (!e.repeat) Game.jump(); }
      else if (current === 'over' && screens.over.classList.contains('armed') && !e.repeat) { e.preventDefault(); ACTIONS.retry(); }
    } else if (k === 'Enter' && current === 'over' && screens.over.classList.contains('armed')) {
      ACTIONS.retry();
    } else if (k === 'Escape' || k === 'KeyP') {
      if (Game.state === 'playing') ACTIONS.pause(); else if (Game.state === 'paused') ACTIONS.resume();
    } else if (k === 'F3') {
      e.preventDefault(); S.showMetrics = !S.showMetrics; Store.save(); syncSettingsUI();
    }
  });
  stage.addEventListener('pointerdown', (e) => {
    AudioSys.unlock();
    if (Game.state === 'playing' && !e.target.closest('button')) { e.preventDefault(); Game.jump(); }
  });
  window.addEventListener('keydown', () => AudioSys.unlock(), { once: true });

  /* Pausa automática si se cambia de pestaña o se bloquea el teléfono */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (Game.state === 'playing') ACTIONS.pause(); AudioSys.suspendAll(true); }
    else AudioSys.suspendAll(false);
  });

  /* ------------------------------------------------ Pantalla completa */
  function fsSupported() { return !!(document.fullscreenEnabled || document.webkitFullscreenEnabled); }
  function toggleFullscreen() {
    const d = document, el = d.documentElement;
    if (d.fullscreenElement || d.webkitFullscreenElement) { (d.exitFullscreen || d.webkitExitFullscreen).call(d); return; }
    const p = (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
    if (p && p.then) p.then(() => { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); }).catch(() => {});
  }

  /* ------------------------------------------------ Ajustes */
  function setSwitch(id, on) { const b = $(id); b.setAttribute('aria-checked', on ? 'true' : 'false'); }
  function syncSettingsUI() {
    setSwitch('#sw-music', S.musicOn); setSwitch('#sw-sfx', S.sfxOn); setSwitch('#sw-metrics', S.showMetrics);
    $('#vol-music').value = Math.round(S.musicVol * 100); $('#vol-sfx').value = Math.round(S.sfxVol * 100);
    $('#metrics').hidden = !S.showMetrics;
    syncMetricsTimer();
  }
  $('#sw-music').addEventListener('click', () => { S.musicOn = !S.musicOn; Store.save(); syncSettingsUI(); AudioSys.unlock(); AudioSys.applySettings(); });
  $('#sw-sfx').addEventListener('click', () => { S.sfxOn = !S.sfxOn; Store.save(); syncSettingsUI(); AudioSys.unlock(); AudioSys.applySettings(); if (S.sfxOn) AudioSys.sfx('click'); });
  $('#sw-metrics').addEventListener('click', () => { S.showMetrics = !S.showMetrics; Store.save(); syncSettingsUI(); });
  $('#vol-music').addEventListener('input', (e) => { S.musicVol = e.target.value / 100; Store.save(); AudioSys.applySettings(); });
  $('#vol-sfx').addEventListener('input', (e) => { S.sfxVol = e.target.value / 100; Store.save(); AudioSys.applySettings(); });
  $('#vol-sfx').addEventListener('change', () => AudioSys.sfx('click'));

  /* Panel de métricas para las pruebas de validación (FPS, salto < 0,2 s, etc.) */
  let metricsTimer = null;                       // solo corre mientras las métricas están visibles
  function renderMetrics() {
    const m = Game.metrics, f = (v) => v == null ? '—' : v.toFixed(1) + ' ms';
    $('#metrics').textContent =
      `FPS ${m.fps} (mín ${m.minFrameFps})\nSalto: últ ${f(m.jumpLast)} · prom ${f(m.jumpAvg)} · máx ${f(m.jumpMax)}\n` +
      `Vel ${m.speed} px/s · partidas ${m.games} · choques ${m.crashes}`;
  }
  function syncMetricsTimer() {
    if (S.showMetrics && !metricsTimer) { renderMetrics(); metricsTimer = setInterval(renderMetrics, 250); }
    else if (!S.showMetrics && metricsTimer) { clearInterval(metricsTimer); metricsTimer = null; }
  }

  /* ------------------------------------------------ Personalizar */
  const swWrap = $('#swatches');
  CONFIG.COLORS.forEach(c => {
    const b = document.createElement('button');
    b.className = 'swatch' + (c.hex ? '' : ' white'); b.dataset.color = c.id;
    b.setAttribute('role', 'radio'); b.setAttribute('aria-label', c.name); b.title = c.name;
    if (c.hex) b.style.setProperty('--sw', c.hex);
    b.addEventListener('click', () => {
      S.color = c.id; Store.save(); Game.setColor(c.id); AudioSys.sfx('click'); markSwatch();
    });
    swWrap.appendChild(b);
  });
  function markSwatch() { $$('.swatch').forEach(b => b.setAttribute('aria-checked', b.dataset.color === S.color ? 'true' : 'false')); }

  const pv = $('#preview'), pcx = pv.getContext('2d');
  function startPreview() {
    markSwatch(); cancelAnimationFrame(previewRaf);
    const t0 = performance.now();
    (function tick(now) {
      pcx.imageSmoothingEnabled = false; pcx.clearRect(0, 0, 160, 160);
      Assets.drawRabbit(pcx, Math.floor((now - t0) / 100) % 4, 16, 112 + 4 - 128, 4, S.color);
      previewRaf = requestAnimationFrame(tick);
    })(t0);
  }
  function stopPreview() { cancelAnimationFrame(previewRaf); }

  /* ------------------------------------------------ Iconos de instrucciones */
  function drawIcons() {
    $$('canvas.ico').forEach(cv => {
      const c = cv.getContext('2d'); c.imageSmoothingEnabled = false; c.clearRect(0, 0, 64, 64);
      switch (cv.dataset.ico) {
        case 'rabbit': Assets.drawRabbit(c, 1, 0, 6, 2, S.color); break;
        case 'stone': Assets.drawObstacle(c, 'stone6', 0, 14, 2); break;
        case 'carrot': Assets.drawCarrot(c, 0, 15, 3, 1); break;
        case 'key':
          c.fillStyle = '#e8ecf8'; c.fillRect(4, 18, 56, 28); c.fillStyle = '#9aa5c8'; c.fillRect(4, 42, 56, 6);
          c.fillStyle = '#14224d'; c.font = 'bold 11px Trebuchet MS, sans-serif'; c.textAlign = 'center'; c.fillText('ESPACIO', 32, 35); break;
        case 'modes':
          ['#34c759', '#f5b800', '#ef4444'].forEach((col, i) => { c.fillStyle = col; c.fillRect(6 + i * 19, 50 - (i + 1) * 12, 15, (i + 1) * 12); });
          break;
      }
    });
  }

  /* ------------------------------------------------ Arranque */
  function boot() {
    const img = $('#loader-img');
    img.onload = () => { img.hidden = false; };
    img.src = 'assets/ui/splash.webp';
    const t0 = performance.now();
    Assets.load().then(() => {
      drawIcons(); syncSettingsUI();
      Game.init(canvas, {
        onTick: (time, score) => {
          const s = Math.floor(time);
          $('#time-val').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
          $('#score-val').textContent = score;
        },
        onGameOver: (st) => {
          $('#over-score').textContent = st.score;
          $('#over-time').textContent = st.time.toFixed(1) + ' s';
          $('#over-note').textContent = st.isBest ? '¡Nueva mejor puntuación en ' + st.modeLabel + '!' : 'Modo ' + st.modeLabel;
          $('#over-best').textContent = st.best;
          show('over');
        }
      });
      layout();
      const wait = Math.max(0, 700 - (performance.now() - t0));
      setTimeout(() => $('#loader').classList.add('done'), wait);
    }).catch((err) => {
      $('#loader-text').textContent = 'No se pudieron cargar los recursos. Abre el juego desde un servidor (ver README) o revisa la carpeta assets/.';
      console.error(err);
    });
    window.addEventListener('resize', layout);
    window.addEventListener('orientationchange', () => setTimeout(layout, 120));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', layout);
    show('menu');
  }
  boot();
})();
