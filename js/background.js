'use strict';
/* ==========================================================================
   background.js — Fondo con efecto parallax (5 capas + suelo).
   Los archivos entregados no incluían fondos, así que se generan UNA sola vez
   en canvas ocultos en estilo pixel art (píxel = CONFIG.PIXEL, igual que los
   sprites x3) y luego solo se copian al lienzo principal: es muy ligero.
   Cada capa se desplaza a una velocidad distinta (factor de parallax).
   ========================================================================== */

const Background = (function () {
  const P = CONFIG.PIXEL, H = CONFIG.H, GY = CONFIG.GROUND_Y;
  const TILE_W = 256;                 // ancho de cada capa en píxeles de arte (768 px lógicos)
  const LH = H / P;                   // alto en píxeles de arte
  const GROUND_LOW = GY / P;          // y del suelo en píxeles de arte (124)
  const layers = [];                  // { canvas, factor, drift }
  let skyCanvas = null, sunCanvas = null, groundCanvas = null;

  function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function rect(cx, color, x, y, w, h) { cx.fillStyle = color; cx.fillRect(x, y, w, h); }

  /* Nube de píxeles: filas [desplazamiento, ancho] */
  function cloud(cx, x, y, s) {
    const rows = [[4, 6], [2, 10], [0, 14], [0, 16], [1, 14]];
    rows.forEach((r, i) => rect(cx, '#ffffff', x + r[0] * s, y + i * s, r[1] * s, s));
    rows.forEach((r, i) => { if (i >= 3) rect(cx, '#dcecff', x + r[0] * s, y + i * s, r[1] * s, s); });
    rect(cx, '#ffffff', x + 3 * s, y + 3 * s, 10 * s, s);
  }

  /* Colinas periódicas (se repiten sin cortes en el borde de la capa) */
  function hills(color, light, base, amp, k1, k2, p1, p2) {
    const c = mk(TILE_W, LH), cx = c.getContext('2d');
    for (let x = 0; x < TILE_W; x++) {
      const hgt = base + amp * Math.sin(2 * Math.PI * k1 * x / TILE_W + p1) + amp * 0.5 * Math.sin(2 * Math.PI * k2 * x / TILE_W + p2);
      const top = Math.round(GROUND_LOW - hgt);
      rect(cx, color, x, top, 1, LH - top);
      rect(cx, light, x, top, 1, 2);
    }
    return c;
  }

  /* Arbustos redondeados cerca del suelo */
  function bushes() {
    const c = mk(TILE_W, LH), cx = c.getContext('2d');
    const spots = [[18, 7], [70, 5], [112, 8], [168, 6], [214, 7]];
    spots.forEach(([x, r]) => {
      for (let dy = 0; dy < r; dy++) {
        const half = Math.round(Math.sqrt(r * r - (r - dy) * (r - dy)) * 1.5);
        rect(cx, dy < 2 ? '#5cc16a' : '#3f9e58', x - half, GROUND_LOW - r - 1 + dy, half * 2, 1);
      }
      rect(cx, '#2f8247', x - r, GROUND_LOW - 2, r * 2, 2);
    });
    return c;
  }

  /* Suelo: césped arriba y tierra con motas. Se repite cada 64 px de arte */
  function buildGround() {
    const w = 64, h = Math.ceil((H - GY) / P) + 1;
    const c = mk(w, h), cx = c.getContext('2d');
    rect(cx, '#9a6a45', 0, 0, w, h);
    rect(cx, '#6fd05a', 0, 0, w, 3);
    rect(cx, '#4fb34a', 0, 3, w, 2);
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 70; i++) rect(cx, rnd() < 0.5 ? '#84573a' : '#b17f56', Math.floor(rnd() * w), 6 + Math.floor(rnd() * (h - 6)), 2, 1);
    for (let x = 0; x < w; x += 4) rect(cx, '#8be26e', x, 0, 1, 1);                // brillo del césped
    for (let x = 2; x < w; x += 8) { rect(cx, '#4fb34a', x, -0, 1, 1); rect(cx, '#4fb34a', x, 5, 2, 1); }
    return c;
  }

  function build() {
    // Cielo en franjas (degradado "pixelado")
    skyCanvas = mk(1, LH);
    const sx = skyCanvas.getContext('2d');
    const top = [110, 198, 245], bot = [215, 242, 255];
    for (let y = 0; y < LH; y += 6) {
      const t = Math.min(1, y / (GROUND_LOW));
      const col = top.map((v, i) => Math.round(v + (bot[i] - v) * t));
      rect(sx, `rgb(${col[0]},${col[1]},${col[2]})`, 0, y, 1, 6);
    }
    // Sol
    sunCanvas = mk(22, 22);
    const su = sunCanvas.getContext('2d');
    for (let y = 0; y < 22; y++) for (let x = 0; x < 22; x++) {
      const d = Math.hypot(x - 10.5, y - 10.5);
      if (d < 8) rect(su, '#ffe27a', x, y, 1, 1);
      else if (d < 10.5) rect(su, 'rgba(255,240,170,0.55)', x, y, 1, 1);
    }
    // Capa 1: nubes (muy lejos). Capa 2-3: colinas. Capa 4: arbustos
    const clouds = mk(TILE_W, LH), cc = clouds.getContext('2d');
    [[10, 14, 2], [80, 30, 3], [150, 10, 2], [200, 38, 2], [235, 18, 3]].forEach(a => cloud(cc, a[0], a[1], a[2]));
    layers.push({ canvas: clouds, factor: 0.05, drift: 8 });
    layers.push({ canvas: hills('#a9b8f0', '#c4cdf6', 38, 12, 2, 5, 0.6, 1.3), factor: 0.12, drift: 0 });
    layers.push({ canvas: hills('#82cf92', '#9fe0a8', 22, 8, 3, 7, 2.0, 0.4), factor: 0.28, drift: 0 });
    layers.push({ canvas: bushes(), factor: 0.55, drift: 0 });
    groundCanvas = buildGround();
  }

  /* Dibuja todo el fondo. scroll = distancia recorrida; t = tiempo total (para la deriva de nubes) */
  function draw(ctx, W, scroll, t) {
    ctx.drawImage(skyCanvas, 0, 0, 1, LH, 0, 0, W, H);
    ctx.drawImage(sunCanvas, W - 120, 150, 22 * P, 22 * P);
    const tileW = TILE_W * P;
    for (const L of layers) {
      let off = Math.floor((scroll * L.factor + t * L.drift) % tileW);
      for (let x = -off; x < W; x += tileW) ctx.drawImage(L.canvas, Math.round(x), 0, tileW, H);
    }
    // Suelo
    const gw = groundCanvas.width * P, gh = groundCanvas.height * P;
    let go = Math.floor(scroll % gw);
    for (let x = -go; x < W; x += gw) ctx.drawImage(groundCanvas, Math.round(x), GY, gw, gh);
  }

  build();
  return { draw };
})();
