'use strict';
/* ==========================================================================
   config.js — Parámetros del juego «Salto Infinito» (Infinite Jump)
   Todo lo que se puede ajustar sin tocar la lógica está en este archivo:
   dificultad, física, atlas de sprites, colores del conejo y audio opcional.
   ========================================================================== */

const CONFIG = {
  VERSION: '1.1.0',

  /* ---- Lienzo ----------------------------------------------------------
     Alto lógico fijo (450). El ancho lógico se adapta al aspecto de la
     pantalla entre MIN_W y MAX_W; después se escala a la pantalla real. */
  H: 450,
  MIN_W: 600,
  MAX_W: 900,
  PIXEL: 3,          // tamaño de "píxel de arte" en el fondo (coherente con los sprites x3)
  GROUND_Y: 372,     // altura (y) a la que está el suelo

  /* ---- Conejo ----------------------------------------------------------- */
  RABBIT: {
    scale: 3,                       // los sprites de 32 px se dibujan x3 (96 px)
    x: 130,                         // posición horizontal fija
    hit: { x: 8, y: 13, w: 18, h: 17 }, // caja de colisión en píxeles de sprite (algo más pequeña que el dibujo)
    menuScale: 5                    // tamaño del conejo en el menú principal
  },

  /* ---- Física del salto -------------------------------------------------
     Altura máxima = v²/(2g) = 160 px · tiempo en el aire = 2v/g = 0,8 s */
  PHYSICS: {
    gravity: 2000,        // px/s²
    jumpVelocity: 800,    // px/s hacia arriba
    jumpBuffer: 0.12      // s: si se pulsa justo antes de aterrizar, el salto se aplica al tocar suelo
  },

  /* ---- Modos de dificultad ----------------------------------------------
     Cada modo es un conjunto independiente de parámetros (requisito AA3):
       speedStart / speedMax : velocidad inicial y tope (px/s)
       accel                 : aumento de velocidad por segundo de partida (px/s²)
       gapTime               : [mín, máx] segundos de separación entre obstáculos
       doubleChance          : probabilidad (0-1) de dos rocas pegadas
       firstDelay            : segundos antes del primer obstáculo
     Para cambiar la dificultad basta editar estos números. */
  MODES: {
    easy:   { id: 'easy',   label: 'FÁCIL',   speedStart: 280, speedMax: 470, accel: 5,  gapTime: [1.70, 2.60], doubleChance: 0,    firstDelay: 1.8,
              desc: 'Lento y con mucho espacio' },
    medium: { id: 'medium', label: 'MEDIO',   speedStart: 340, speedMax: 620, accel: 9,  gapTime: [1.30, 2.00], doubleChance: 0.12, firstDelay: 1.6,
              desc: 'Va acelerando poco a poco' },
    hard:   { id: 'hard',   label: 'DIFÍCIL', speedStart: 420, speedMax: 760, accel: 12, gapTime: [1.00, 1.55], doubleChance: 0.25, firstDelay: 1.4,
              desc: 'Rápido y con poco tiempo' }
  },
  /* Tiempo extra (s) sobre el tiempo de vuelo que se garantiza entre obstáculos,
     para que nunca aparezcan situaciones imposibles. */
  SAFE_EXTRA_TIME: 0.20,
  /* Justicia: un obstáculo solo aparece si el tiempo que tarda en cruzar al conejo
     es como máximo este porcentaje del tiempo que el conejo permanece por encima de él
     durante un salto. Así los troncos largos y las rocas dobles solo salen cuando la
     velocidad ya lo permite (nunca hay obstáculos imposibles de saltar). */
  FAIR_RATIO: 0.72,

  /* Puntos: distancia/SCORE_DIST_DIV + OBSTACLE_POINTS por cada obstáculo esquivado */
  SCORE_DIST_DIV: 12,
  OBSTACLE_POINTS: 10,

  /* ---- Atlas de la hoja de sprites assets/sprites/sprites.png (320x122) ----
     bbox = zona visible [x0, y0, x1, y1] dentro del fotograma, en píxeles de sprite. */
  ATLAS: {
    rabbit: Array.from({ length: 8 }, (_, i) => ({ x: i * 32, y: 0, w: 32, h: 32 })),
    carrot: Array.from({ length: 6 }, (_, i) => ({ x: i * 34, y: 64, w: 34, h: 58 })),
    obstacles: {
      stone6: { x: 0,   y: 32, w: 32, h: 32, bbox: [4, 12, 30, 32] },
      stone8: { x: 32,  y: 32, w: 32, h: 32, bbox: [2, 11, 31, 32] },
      log3:   { x: 64,  y: 32, w: 64, h: 32, bbox: [4, 13, 61, 31] },
      log4:   { x: 128, y: 32, w: 48, h: 32, bbox: [7, 13, 43, 31] },
      log6:   { x: 176, y: 32, w: 64, h: 32, bbox: [4, 13, 61, 31] },
      log9:   { x: 240, y: 32, w: 48, h: 32, bbox: [5, 11, 43, 31] }
    }
  },
  /* Probabilidad relativa de cada obstáculo (predominan las rocas) */
  OBSTACLE_WEIGHTS: { stone6: 3, stone8: 3, log3: 1, log4: 1, log6: 1, log9: 1 },
  OBSTACLE_SCALE: 3,
  OBSTACLE_HIT_INSET: 3, // px de sprite que se recortan a la caja de colisión (más justo para el jugador)

  /* ---- Colores del conejo -------------------------------------------------
     Solo existe el sprite BLANCO; cada color se superpone con transparencia.
     TINT_ALPHA = opacidad del color superpuesto (0 = blanco, 1 = color pleno). */
  TINT_ALPHA: 0.75,
  /* Posición (x, y) del ojo azul (2x2 px) dentro de cada uno de los 8 fotogramas: no se tiñe */
  EYES: [[25,22],[24,20],[25,19],[24,17],[28,14],[28,18],[28,22],[26,24]],
  COLORS: [
    { id: 'white',  name: 'Blanco',  hex: null },   // null = sprite original, sin color encima
    { id: 'orange', name: 'Naranja', hex: '#ff9f43' },
    { id: 'pink',   name: 'Rosa',    hex: '#ff7eb6' },
    { id: 'blue',   name: 'Azul',    hex: '#5aa9ff' },
    { id: 'green',  name: 'Verde',   hex: '#6ddc7a' },
    { id: 'purple', name: 'Morado',  hex: '#a98bff' },
    { id: 'gold',   name: 'Dorado',  hex: '#ffd23f' },
    { id: 'gray',   name: 'Gris',    hex: '#9aa5b1' }
  ],

  /* ---- Audio ------------------------------------------------------------
     Por defecto música y efectos se sintetizan con Web Audio (sin archivos).
     Para usar archivos propios, copia el audio en assets/audio/ y escribe aquí
     la ruta, por ejemplo: music: 'assets/audio/musica.mp3'. Si el archivo no
     existe, el juego sigue funcionando con el sonido sintetizado. */
  AUDIO_FILES: {
    music: null,
    sfx: { jump: null, crash: null, click: null, start: null }
  },

  STORAGE_KEY: 'saltoInfinito.v1'
};

/* ---- Almacenamiento local (ajustes, color y mejores puntuaciones) ------- */
const Store = (function () {
  const defaults = {
    musicOn: true, sfxOn: true, musicVol: 0.5, sfxVol: 0.8,
    showMetrics: false, color: 'white', lastMode: 'medium',
    best: { easy: 0, medium: 0, hard: 0 }
  };
  let data = JSON.parse(JSON.stringify(defaults));
  try {
    const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (raw) { const saved = JSON.parse(raw); data = Object.assign(data, saved); data.best = Object.assign({}, defaults.best, saved.best); }
  } catch (e) { /* localStorage no disponible: se usa memoria */ }
  function save() { try { localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(data)); } catch (e) { /* ignorar */ } }
  return { data, save };
})();
