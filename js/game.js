'use strict';
/* ==========================================================================
   game.js — Motor del juego (bucle, física, obstáculos, colisiones, dibujo).
   Estados: 'menu' | 'playing' | 'paused' | 'crash' | 'over'
   La interfaz (menús, botones) está en ui.js y se comunica por la API pública
   de Game (start, restart, toMenu, jump, pause, resume, resize, setColor...).
   ========================================================================== */

const Game = (function () {
  const H = CONFIG.H, GY = CONFIG.GROUND_Y;
  const PH = CONFIG.PHYSICS;
  const AIR_TIME = (2 * PH.jumpVelocity) / PH.gravity;   // segundos en el aire por salto

  let canvas, ctx, W = 800, S = 1;                         // W = ancho lógico, S = escala lógica→píxeles reales
  let state = 'menu';
  let mode = CONFIG.MODES.medium;
  let colorId = 'white';
  let callbacks = {};

  // Estado de la partida
  const rabbit = { h: 0, vy: 0, grounded: true, runT: 0, landT: 0 };
  let obstacles = [], particles = [];
  let scroll = 0, speed = 0, time = 0, distance = 0, dodged = 0, spawnDist = 0;
  let jumpBuf = 0, crashT = 0, shakeT = 0, bgTime = 0, carrotT = 0;
  let lastSecond = -1, lastScore = -1;
  let dirty = true;                                       // fuerza redibujar una escena estática (pausa / derrota / cambio de tamaño)

  // Métricas para validar los requisitos (FPS, respuesta del salto, partidas)
  const metrics = {
    fps: 0, minFrameFps: 0, frames: 0, acc: 0, worst: 0,
    jumpLast: null, jumpAvg: null, jumpMax: null, jumpCount: 0, jumpSum: 0,
    games: 0, crashes: 0, speed: 0
  };
  let pendingInputAt = null;

  /* ---------------------------------------------------------------- API */
  function init(cv, cbs) {
    canvas = cv; ctx = cv.getContext('2d', { alpha: false }); callbacks = cbs || {};
    colorId = Store.data.color;
    requestAnimationFrame(loop);
  }

  /* Ajusta el lienzo: cssW/cssH = tamaño en pantalla; logicalW = ancho lógico; dpr = densidad de píxeles */
  function resize(cssW, cssH, logicalW, dpr) {
    if (!canvas) return;                       // aún no inicializado
    W = logicalW;
    canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
    S = canvas.width / W;
    dirty = true;                              // al cambiar el tamaño el lienzo se borra: hay que redibujar
  }

  function resetRun() {
    rabbit.h = 0; rabbit.vy = 0; rabbit.grounded = true; rabbit.runT = 0; rabbit.landT = 0;
    obstacles = []; particles = [];
    scroll = 0; time = 0; distance = 0; dodged = 0; jumpBuf = 0; shakeT = 0; crashT = 0;
    speed = mode.speedStart;
    spawnDist = mode.firstDelay * speed;
    lastSecond = -1; lastScore = -1; pendingInputAt = null;
  }

  function start(modeId) {
    mode = CONFIG.MODES[modeId] || CONFIG.MODES.medium;
    resetRun();
    state = 'playing'; metrics.games++;
    emitHud(true);
  }
  function restart() { start(mode.id); }
  function toMenu() { resetRun(); state = 'menu'; scroll = 0; }
  function pause() { if (state === 'playing') state = 'paused'; }
  function resume() { if (state === 'paused') state = 'playing'; }
  function setColor(id) { colorId = id; }

  /* Salto: se aplica de inmediato dentro del evento de entrada (mínima latencia).
     Una pulsación = un salto: si está en el aire solo se guarda un breve "buffer". */
  function jump() {
    if (state !== 'playing') return;
    if (rabbit.grounded) { doJump(performance.now()); }
    else jumpBuf = PH.jumpBuffer;
  }
  function doJump(inputTime) {
    rabbit.vy = -PH.jumpVelocity; rabbit.grounded = false; rabbit.landT = 0;
    pendingInputAt = inputTime;
    AudioSys.sfx('jump');
  }

  /* ------------------------------------------------------ Obstáculos */
  const dimsCache = Object.create(null);          // las medidas solo dependen de CONFIG: se calculan una vez
  function obstacleDims(key) { return dimsCache[key] || (dimsCache[key] = computeDims(key)); }
  function computeDims(key) {
    const a = CONFIG.ATLAS.obstacles[key], s = CONFIG.OBSTACLE_SCALE, ins = CONFIG.OBSTACLE_HIT_INSET;
    const [x0, y0, x1, y1] = a.bbox;
    return {
      cellW: a.w * s,
      drawY: GY + 3 - y1 * s,                       // la base del sprite se apoya (un poco hundida) en el suelo
      hit: { x: (x0 + ins) * s, y: (y0 + ins) * s, w: (x1 - x0 - 2 * ins) * s, h: (y1 - y0 - ins) * s },
      need: (GY - 2) - (GY + 3 - y1 * s + (y0 + ins) * s)   // altura que debe alcanzar el conejo para pasar por encima
    };
  }
  /* Segundos que el conejo está por encima de la altura h durante un salto */
  function timeAbove(h) {
    const disc = PH.jumpVelocity * PH.jumpVelocity - 2 * PH.gravity * h;
    return disc <= 0 ? 0 : 2 * Math.sqrt(disc) / PH.gravity;
  }
  /* ¿Es justo (saltable con margen) un bloque de ancho blockW y altura need a esta velocidad? */
  function isFair(blockW, need) {
    const rw = CONFIG.RABBIT.hit.w * CONFIG.RABBIT.scale;
    return (blockW + rw) / speed <= CONFIG.FAIR_RATIO * timeAbove(need);
  }
  function pickKey() {
    const w = CONFIG.OBSTACLE_WEIGHTS;
    const keys = Object.keys(w).filter(k => { const d = obstacleDims(k); return isFair(d.hit.w, d.need); });
    if (!keys.length) return 'stone6';
    let total = 0; keys.forEach(k => total += w[k]);
    let r = Math.random() * total;
    for (const k of keys) { r -= w[k]; if (r <= 0) return k; }
    return keys[0];
  }
  function makeObstacle(key, x) {
    const d = obstacleDims(key);
    return { key, x, y: d.drawY, cellW: d.cellW, hit: d.hit, passed: false };
  }
  /* Genera un obstáculo (o dos rocas pegadas) y calcula la distancia al siguiente.
     La separación nunca baja del tiempo de vuelo + margen, así no hay situaciones imposibles. */
  function spawn() {
    const x = W + 30;
    let blockW;
    const stoneNeed = obstacleDims('stone6').need;
    if (Math.random() < mode.doubleChance && isFair(2 * obstacleDims('stone6').hit.w + 8, stoneNeed)) {
      const k = Math.random() < 0.5 ? 'stone6' : 'stone8';
      const a = makeObstacle(k, x), b = makeObstacle(k === 'stone6' ? 'stone8' : 'stone6', x);
      // la segunda roca queda pegada a la primera (≈ 8 px entre cajas de colisión)
      b.x = x + a.hit.x + a.hit.w + 8 - b.hit.x;
      obstacles.push(a, b);
      blockW = (b.x + b.hit.x + b.hit.w) - (a.x + a.hit.x);
    } else {
      const o = makeObstacle(pickKey(), x);
      obstacles.push(o); blockW = o.hit.w;
    }
    const prog = Math.min(1, (speed - mode.speedStart) / Math.max(1, mode.speedMax - mode.speedStart));
    const factor = 1 - 0.15 * prog;                                  // los huecos se acortan un poco al acelerar
    const t = mode.gapTime[0] + Math.random() * (mode.gapTime[1] - mode.gapTime[0]);
    const safeMin = speed * (AIR_TIME + CONFIG.SAFE_EXTRA_TIME);
    spawnDist = blockW + Math.max(t * factor * speed, safeMin);
  }

  /* --------------------------------------------------------- Actualización */
  function hitRect() {
    const r = CONFIG.RABBIT, s = r.scale;
    const cellY = GY + 4 - 32 * s - rabbit.h;
    return { x: r.x + r.hit.x * s, y: cellY + r.hit.y * s, w: r.hit.w * s, h: r.hit.h * s };
  }

  function update(dt) {
    bgTime += dt; carrotT += dt;
    if (state === 'menu') { scroll += 110 * dt; rabbit.runT += dt * 10; return; }
    if (state === 'crash') {
      crashT -= dt; shakeT = Math.max(0, shakeT - dt); updateParticles(dt);
      if (crashT <= 0) { state = 'over'; dirty = true; callbacks.onGameOver && callbacks.onGameOver(finalStats()); }
      return;
    }
    if (state !== 'playing') return;

    // Tiempo, velocidad y distancia (la dificultad aumenta de forma progresiva)
    time += dt;
    speed = Math.min(mode.speedMax, mode.speedStart + mode.accel * time);
    scroll += speed * dt; distance += speed * dt;

    // Física del conejo: gravedad y detección de suelo
    if (!rabbit.grounded) {
      rabbit.vy += PH.gravity * dt;
      rabbit.h -= rabbit.vy * dt;
      if (rabbit.h <= 0) {
        rabbit.h = 0; rabbit.vy = 0; rabbit.grounded = true; rabbit.landT = 0.08;
        burst(CONFIG.RABBIT.x + 30, GY, 4, 60, '#e9d6b8');
        AudioSys.sfx('land');
        if (jumpBuf > 0) { jumpBuf = 0; doJump(null); }      // salto guardado justo antes de aterrizar
      }
    }
    if (jumpBuf > 0) jumpBuf -= dt;
    if (rabbit.landT > 0) rabbit.landT -= dt;
    rabbit.runT += dt * (8 + speed / 80);

    // Obstáculos
    spawnDist -= speed * dt;
    if (spawnDist <= 0) spawn();
    for (const o of obstacles) o.x -= speed * dt;
    while (obstacles.length && obstacles[0].x + obstacles[0].cellW < -40) obstacles.shift();

    // Colisiones (cajas AABB) y conteo de obstáculos esquivados
    const r = hitRect();
    for (const o of obstacles) {
      const ox = o.x + o.hit.x, oy = o.y + o.hit.y;
      if (r.x < ox + o.hit.w && r.x + r.w > ox && r.y < oy + o.hit.h && r.y + r.h > oy) { crash(); return; }
      if (!o.passed && ox + o.hit.w < r.x) { o.passed = true; dodged++; }
    }
    updateParticles(dt);
    emitHud(false);
  }

  function crash() {
    state = 'crash'; crashT = 0.7; shakeT = 0.35; metrics.crashes++;
    burst(CONFIG.RABBIT.x + 50, GY - rabbit.h - 20, 16, 220, '#ffffff');
    AudioSys.sfx('crash');
  }

  function score() { return Math.floor(distance / CONFIG.SCORE_DIST_DIV) + dodged * CONFIG.OBSTACLE_POINTS; }
  function finalStats() {
    const sc = score(), best = Store.data.best[mode.id] || 0, isBest = sc > best;
    if (isBest) { Store.data.best[mode.id] = sc; Store.save(); }
    return { score: sc, time, dodged, mode: mode.id, modeLabel: mode.label, best: Math.max(best, sc), isBest };
  }
  function emitHud(force) {
    const sec = Math.floor(time), sc = score();
    if (force || sec !== lastSecond || sc !== lastScore) {
      lastSecond = sec; lastScore = sc;
      callbacks.onTick && callbacks.onTick(time, sc);
    }
  }

  /* -------------------------------------------------------- Partículas */
  function burst(x, y, n, v, color) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = v * (0.4 + Math.random() * 0.6);
      particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - v * 0.4, life: 0.4 + Math.random() * 0.3, color });
    }
  }
  function updateParticles(dt) {                 // compacta el arreglo en el sitio (sin asignar memoria nueva por cuadro)
    let n = 0;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy += 900 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      particles[n++] = p;
    }
    particles.length = n;
  }

  /* ------------------------------------------------------------ Dibujo */
  function rabbitFrame() {
    if (state === 'crash' || state === 'over') return 7;
    if (!rabbit.grounded) {
      if (rabbit.vy < -250) return 4;          // subiendo
      if (rabbit.vy < 250) return 5;           // cima
      return 6;                                // bajando
    }
    if (rabbit.landT > 0) return 7;            // aterrizaje
    return Math.floor(rabbit.runT) % 4;        // carrera (fotogramas 0-3)
  }

  function render() {
    ctx.setTransform(S, 0, 0, S, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    if (shakeT > 0) ctx.translate((Math.random() - 0.5) * 8 * (shakeT / 0.35), (Math.random() - 0.5) * 8 * (shakeT / 0.35));
    Background.draw(ctx, W, scroll, bgTime);

    if (state === 'menu') {
      // Conejo grande corriendo en el sitio y zanahoria animada (pantalla principal)
      const sc = CONFIG.RABBIT.menuScale, rx = W * 0.56, ry = GY + 4 * (sc / 3) - 32 * sc;
      Assets.drawRabbit(ctx, Math.floor(rabbit.runT) % 4, rx, ry, sc, colorId);
      // La zanahoria (bbox y 8-49 del fotograma) se apoya en el suelo y "respira" suavemente
      const bob = Math.abs(Math.sin(carrotT * 2.5)) * 10;
      Assets.drawCarrot(ctx, Math.floor(carrotT * 8) % 6, rx + 32 * sc * 0.95, GY + 4 - 49 * 3 - bob, 3);
    } else {
      for (const o of obstacles) Assets.drawObstacle(ctx, o.key, o.x, o.y, CONFIG.OBSTACLE_SCALE);
      const r = CONFIG.RABBIT, cellY = GY + 4 - 32 * r.scale - rabbit.h;
      const blink = state === 'crash' && Math.floor(crashT * 14) % 2 === 0;
      if (!blink) Assets.drawRabbit(ctx, rabbitFrame(), r.x, cellY, r.scale, colorId);
    }
    for (const p of particles) { ctx.globalAlpha = Math.min(1, p.life * 3); ctx.fillStyle = p.color; ctx.fillRect(Math.round(p.x), Math.round(p.y), 4, 4); }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /* --------------------------------------------------- Bucle principal */
  let last = 0;
  function loop(now) {
    const dtRaw = last ? (now - last) / 1000 : 0.016;
    last = now;
    const dt = Math.min(dtRaw, 0.05);              // evita saltos enormes si la pestaña se congela
    update(dt);
    if ((state !== 'paused' && state !== 'over') || dirty) { render(); dirty = false; }   // pausa y derrota son imágenes fijas: no gastan GPU

    // Métricas: FPS (promedio de 0,5 s) y peor cuadro
    metrics.frames++; metrics.acc += dtRaw; metrics.worst = Math.max(metrics.worst, dtRaw);
    if (metrics.acc >= 0.5) {
      metrics.fps = Math.round(metrics.frames / metrics.acc);
      metrics.minFrameFps = metrics.worst > 0 ? Math.round(1 / metrics.worst) : 0;
      metrics.frames = 0; metrics.acc = 0; metrics.worst = 0;
    }
    // Latencia del salto: desde la pulsación hasta terminar de dibujar el siguiente cuadro
    if (pendingInputAt !== null) {
      const lat = performance.now() - pendingInputAt;
      metrics.jumpLast = lat; metrics.jumpCount++; metrics.jumpSum += lat;
      metrics.jumpAvg = metrics.jumpSum / metrics.jumpCount;
      metrics.jumpMax = Math.max(metrics.jumpMax || 0, lat);
      pendingInputAt = null;
    }
    metrics.speed = Math.round(speed);
    requestAnimationFrame(loop);
  }

  return {
    init, resize, start, restart, toMenu, pause, resume, jump, setColor,
    get state() { return state; },
    get mode() { return mode; },
    metrics, AIR_TIME,
    _debug: () => ({ obstacles, rabbit, speed, time, W })   // solo para pruebas automáticas
  };
})();
