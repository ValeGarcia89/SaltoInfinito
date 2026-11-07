'use strict';
/* ==========================================================================
   audio.js — Música y efectos (SFX) con control independiente.
   - Sin archivos: todo se sintetiza con Web Audio API (no bloquea el juego).
   - Con archivos: ver CONFIG.AUDIO_FILES (se usan si existen).
   Los cambios de Store.data (musicOn, sfxOn, musicVol, sfxVol) se aplican al instante.
   ========================================================================== */

const AudioSys = (function () {
  let ctx = null, musicGain = null, sfxGain = null;
  let timer = null, nextTime = 0, step = 0, musicPlaying = false;
  let musicSource = null;
  const buffers = { music: null, sfx: {} };
  const S = Store.data;

  const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function ensure() {
    if (!ctx) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        ctx = new AC();
        musicGain = ctx.createGain(); sfxGain = ctx.createGain();
        musicGain.connect(ctx.destination); sfxGain.connect(ctx.destination);
        applySettings();
        loadFiles();
      } catch (e) { ctx = null; return false; }
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  /* Aplica ajustes de volumen/encendido (independientes para música y SFX) */
  function applySettings() {
    if (!ctx) return;
    musicGain.gain.value = S.musicOn ? S.musicVol * 0.5 : 0;
    sfxGain.gain.value = S.sfxOn ? S.sfxVol : 0;
    syncMusic();
  }

  /* Carga opcional de archivos de audio (si CONFIG.AUDIO_FILES los define) */
  function loadFiles() {
    const files = CONFIG.AUDIO_FILES;
    const load = (url) => fetch(url).then(r => { if (!r.ok) throw 0; return r.arrayBuffer(); })
      .then(b => new Promise((res, rej) => ctx.decodeAudioData(b, res, rej)));
    if (files.music) load(files.music).then(b => { buffers.music = b; if (musicPlaying) { stopMusicLoop(); startMusicLoop(); } }).catch(() => {});
    Object.keys(files.sfx).forEach(k => { if (files.sfx[k]) load(files.sfx[k]).then(b => { buffers.sfx[k] = b; }).catch(() => {}); });
  }

  /* ---- Efectos ---------------------------------------------------------- */
  function tone(f0, f1, dur, type, vol, delay) {
    const t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + dur + 0.02);
  }
  const noiseCache = {};                                   // el ruido se genera una vez por duración y se reutiliza
  function noise(dur, vol) {
    let buf = noiseCache[dur];
    if (!buf) {
      const n = Math.floor(ctx.sampleRate * dur); buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      noiseCache[dur] = buf;
    }
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = buf; f.type = 'lowpass'; f.frequency.value = 900; g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(sfxGain); s.start();
  }
  const SFX = {
    jump:  () => { tone(330, 700, 0.14, 'square', 0.16); },
    land:  () => { tone(140, 70, 0.07, 'triangle', 0.14); },
    crash: () => { noise(0.35, 0.5); tone(220, 50, 0.4, 'sawtooth', 0.2); },
    click: () => { tone(880, 880, 0.05, 'square', 0.1); },
    start: () => { tone(523, 523, 0.09, 'square', 0.12, 0); tone(659, 659, 0.09, 'square', 0.12, 0.08); tone(784, 784, 0.14, 'square', 0.12, 0.16); }
  };
  function sfx(name) {
    if (!S.sfxOn || !ensure()) return;
    try {
      const buf = buffers.sfx[name];
      if (buf) { const s = ctx.createBufferSource(); s.buffer = buf; s.connect(sfxGain); s.start(); return; }
      if (SFX[name]) SFX[name]();
    } catch (e) { /* un fallo de audio nunca debe detener el juego */ }
  }

  /* ---- Música sintetizada (arpegio sencillo, bucle) ---------------------- */
  const ROOTS = [60, 57, 65, 67];      // Do, La menor, Fa, Sol
  const ARP = [0, 4, 7, 12, 7, 4, 7, 4];
  const STEP = 0.2;                    // segundos por corchea
  function scheduleStep(t) {
    const chord = Math.floor(step / 8) % 4, k = step % 8, root = ROOTS[chord];
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = midi(root + 12 + ARP[k]);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + STEP * 0.9);
    o.connect(g); g.connect(musicGain); o.start(t); o.stop(t + STEP);
    if (k % 4 === 0) {
      const b = ctx.createOscillator(), bg = ctx.createGain();
      b.type = 'square'; b.frequency.value = midi(root - 12);
      bg.gain.setValueAtTime(0.18, t); bg.gain.exponentialRampToValueAtTime(0.0001, t + STEP * 3.2);
      b.connect(bg); bg.connect(musicGain); b.start(t); b.stop(t + STEP * 3.4);
    }
    step++;
  }
  function startMusicLoop() {
    if (buffers.music) {
      musicSource = ctx.createBufferSource(); musicSource.buffer = buffers.music; musicSource.loop = true;
      musicSource.connect(musicGain); musicSource.start(); return;
    }
    nextTime = ctx.currentTime + 0.05;
    timer = setInterval(() => { while (nextTime < ctx.currentTime + 0.35) { scheduleStep(nextTime); nextTime += STEP; } }, 100);
  }
  function stopMusicLoop() {
    if (timer) { clearInterval(timer); timer = null; }
    if (musicSource) { try { musicSource.stop(); } catch (e) {} musicSource = null; }
  }
  /* Arranca o detiene la música según el ajuste (así no gasta CPU si está apagada) */
  function syncMusic() {
    if (!ctx) return;
    const want = S.musicOn;
    if (want && !musicPlaying) { musicPlaying = true; startMusicLoop(); }
    else if (!want && musicPlaying) { musicPlaying = false; stopMusicLoop(); }
  }
  function suspendAll(flag) { if (!ctx) return; if (flag) ctx.suspend(); else if (ctx.state === 'suspended') ctx.resume(); }

  /* unlock(): los navegadores exigen un gesto del usuario antes de reproducir audio */
  function unlock() { if (ensure()) syncMusic(); }

  return { unlock, applySettings, sfx, suspendAll };
})();
