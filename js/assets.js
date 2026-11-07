'use strict';
/* ==========================================================================
   assets.js — Carga de la hoja de sprites y utilidades de dibujo.

   TINTADO DEL CONEJO: en assets/ solo existe el conejo BLANCO (tile000–007).
   Para personalizarlo, se coloca el color encima del sprite con cierta
   transparencia (CONFIG.TINT_ALPHA): el color se multiplica sobre el cuerpo y
   se mezcla con el píxel original. Así se conservan el sombreado, la silueta y
   la transparencia; el ojo azul no se toca (se restaura con CONFIG.EYES). Cada color se calcula UNA sola vez
   y se guarda en caché (no hay trabajo extra por fotograma).
   ========================================================================== */

const Assets = (function () {
  const sheet = new Image();
  const COLORS = Object.create(null);                 // id -> { id, name, hex }
  CONFIG.COLORS.forEach(c => { COLORS[c.id] = c; });
  const tintCache = Object.create(null);              // id -> hoja de 256x32 con los 8 fotogramas

  /* Carga la hoja de sprites (obligatoria) */
  function load() {
    return new Promise((resolve, reject) => {
      sheet.onload = () => resolve();
      sheet.onerror = () => reject(new Error('No se pudo cargar assets/sprites/sprites.png'));
      sheet.src = 'assets/sprites/sprites.png';
    });
  }

  /* Construye la hoja del conejo con el color superpuesto (semitransparente).
     Se hace SOLO con operaciones de composición del canvas (sin getImageData), porque
     leer píxeles falla ("canvas contaminado") al abrir index.html con doble clic (file://). */
  function buildTint(color) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 32;
    const cx = c.getContext('2d');
    cx.drawImage(sheet, 0, 0, 256, 32, 0, 0, 256, 32);          // conejo blanco original
    // multiply con alpha a  →  mezcla(pixel, pixel × color, a): conserva el sombreado
    cx.globalCompositeOperation = 'multiply';
    cx.globalAlpha = CONFIG.TINT_ALPHA;
    cx.fillStyle = color.hex;
    cx.fillRect(0, 0, 256, 32);
    // conserva la silueta y la transparencia originales
    cx.globalAlpha = 1;
    cx.globalCompositeOperation = 'destination-in';
    cx.drawImage(sheet, 0, 0, 256, 32, 0, 0, 256, 32);
    // el ojo azul (2x2 px por fotograma) se restaura sin color encima
    cx.globalCompositeOperation = 'source-over';
    CONFIG.EYES.forEach((e, f) => cx.drawImage(sheet, f * 32 + e[0], e[1], 2, 2, f * 32 + e[0], e[1], 2, 2));
    return c;
  }

  /* Hoja del conejo en el color pedido (blanco = sprite original, sin copia) */
  function rabbitSheet(colorId) {
    let s = tintCache[colorId];
    if (s) return s;
    const color = COLORS[colorId];
    s = (color && color.hex) ? buildTint(color) : sheet;
    tintCache[colorId] = s;
    return s;
  }

  /* Dibuja un fotograma del conejo. (x, y) = esquina superior izquierda de la celda de 32x32 */
  function drawRabbit(ctx, frame, x, y, scale, colorId) {
    ctx.drawImage(rabbitSheet(colorId), frame * 32, 0, 32, 32, Math.round(x), Math.round(y), 32 * scale, 32 * scale);
  }
  function drawCarrot(ctx, frame, x, y, scale) {
    const a = CONFIG.ATLAS.carrot[frame % 6];
    ctx.drawImage(sheet, a.x, a.y, a.w, a.h, Math.round(x), Math.round(y), a.w * scale, a.h * scale);
  }
  function drawObstacle(ctx, key, x, y, scale) {
    const a = CONFIG.ATLAS.obstacles[key];
    ctx.drawImage(sheet, a.x, a.y, a.w, a.h, Math.round(x), Math.round(y), a.w * scale, a.h * scale);
  }

  return { load, drawRabbit, drawCarrot, drawObstacle, sheet };
})();
