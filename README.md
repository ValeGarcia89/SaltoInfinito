# Salto Infinito (Infinite Jump)

Videojuego web tipo *endless runner*: un conejo corre solo y el jugador lo hace saltar para esquivar rocas.
Prototipo funcional de las evidencias **AA2-EV01** (ficha técnica) y **AA3-EV01** (lista de requisitos de validación).
Solo usa HTML5, Canvas, JavaScript y CSS3: no hay librerías ni instalaciones. Peso total ≈ 0,17 MB.

## Cómo ejecutarlo

**Opción 1 — Abrir el archivo.** Haz doble clic en `index.html`. Funciona en la mayoría de navegadores.
(Si el navegador bloquea algo por abrir el archivo directamente, usa la opción 2.)

**Opción 2 — Servidor local (recomendada para probar).**
```
cd salto-infinito
python3 -m http.server 8000
```
y abre `http://localhost:8000`. En VS Code también sirve la extensión *Live Server*.

**Opción 3 — Enlace para pruebas con usuarios (requisito «se abre desde un enlace sin instalaciones»).**
Sube la carpeta completa a un hosting estático gratuito y comparte el enlace.
En **GitHub Pages**: sube el repositorio, entra en *Settings → Pages*, elige *Deploy from a branch* → rama `main` y carpeta `/ (root)`.
El juego quedará en `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/`. (Ya incluye `.nojekyll`, así que no hace falta configurar nada más.)
Opcional: para que la miniatura al compartir el enlace funcione en redes sociales, cambia el `og:image` de `index.html` por la URL absoluta de `assets/ui/splash.webp`.
Para probar en tu teléfono en la misma red wifi: ejecuta la opción 2 y abre `http://IP-DE-TU-PC:8000` desde el móvil.

## Controles
| Acción | Entrada |
|---|---|
| Saltar | **Espacio**, **Flecha ↑**, **clic** del mouse o **toque** en la pantalla |
| Pausa | **Esc** o **P** (o el botón de pausa del HUD) |
| Métricas de prueba | **F3** o Ajustes → «Métricas de prueba» |

Mantener la tecla pulsada **no** genera saltos repetidos: una pulsación = un salto.

## Estructura
```
index.html          Pantallas (menú, modos, personalizar, instrucciones, ajustes, pausa, derrota)
style.css           Interfaz responsive (todo escala con la variable --u)
js/config.js        TODOS los parámetros: dificultad, física, atlas de sprites, colores, audio
js/audio.js         Música y SFX (sintetizados con Web Audio; archivos opcionales)
js/assets.js        Carga de sprites y tintado del conejo
js/background.js    Fondo con parallax (5 capas + suelo)
js/game.js          Motor: bucle requestAnimationFrame, física, obstáculos, colisiones
js/ui.js            Navegación, controles, ajustes, personalización, pantalla completa
assets/sprites/     sprites.png (hoja de sprites única) + originals/ (PNG/GIF entregados; el conejo solo existe en blanco)
assets/ui/          splash.webp (imagen de portada, se muestra al cargar)
assets/audio/       Para audio propio (opcional)
tools/              build_spritesheet.py (regenera la hoja de sprites)
tests/              Pruebas automáticas (Playwright)
```

## Cómo modificar cosas

**Dificultad** — `js/config.js` → `CONFIG.MODES`. Cada modo (`easy`, `medium`, `hard`) tiene sus parámetros independientes:
`speedStart`, `speedMax`, `accel` (velocidad), `gapTime` (separación entre obstáculos en segundos), `doubleChance` (rocas dobles) y `firstDelay`.
No hay que tocar la lógica del juego. La separación nunca baja del tiempo de vuelo + `SAFE_EXTRA_TIME`, y `FAIR_RATIO` impide que salgan
obstáculos imposibles de saltar (por eso los troncos largos y las rocas dobles aparecen solo cuando la velocidad lo permite).

**Salto** — `CONFIG.PHYSICS` (`gravity`, `jumpVelocity`, `jumpBuffer`). Altura = v²/2g = 160 px; tiempo en el aire = 2v/g = 0,8 s.

**Controles** — `js/ui.js`, bloque «Controles de salto» (teclas por `e.code`; clic y toque por `pointerdown`).

**Gráficos** — Los sprites originales están en `assets/sprites/originals/`. Si cambias alguno, ejecuta
`python3 tools/build_spritesheet.py` para regenerar `sprites.png`. Si cambias tamaños, actualiza `CONFIG.ATLAS`.
Colores del conejo: `CONFIG.COLORS` (se añade un color con una línea). La opacidad del color superpuesto se ajusta con `CONFIG.TINT_ALPHA` (0 = blanco, 1 = color pleno; por defecto 0,75).

**Audio** — Ver `assets/audio/LEEME.txt`.

## Sprites usados (análisis)
- **Conejo:** `tile000`–`tile007` (8 fotogramas de 32×32). 0–3 = carrera, 4 = subida, 5 = cima, 6 = bajada, 7 = aterrizaje/choque.
- **Obstáculos:** `stone6`, `stone8` (rocas) y `log3`, `log4`, `log6`, `log9` (troncos, variantes extra).
- **Zanahoria:** `carrot.gif` (6 fotogramas animados), en la pantalla principal.
- **Portada:** `splash.webp`, como pantalla de carga y miniatura al compartir el enlace.

## Limitaciones de los recursos y cómo se resolvieron
1. **No había fondos ni suelo.** Se generan por código en pixel art (mismo tamaño de píxel ×3 que los sprites) y se copian ya dibujados: es muy ligero.
2. **El conejo solo existe en blanco.** No hay sprites de colores: el color se **superpone con transparencia** sobre el sprite blanco por código (se multiplica sobre el cuerpo blanco/gris y se mezcla con el píxel original según `TINT_ALPHA`; conserva sombreado, silueta y el ojo azul). Cada color se calcula una sola vez y queda en caché.
3. **No había audio.** Música y efectos se sintetizan con Web Audio; se pueden reemplazar por archivos sin tocar la lógica.
4. **Los troncos no eran «rocas».** Se incluyen como variantes de obstáculo porque venían entre los sprites; predominan las rocas (peso 3 vs 1) y se pueden quitar en `OBSTACLE_WEIGHTS`.
5. **El estilo es pixel art** (la ficha dejaba la decisión «según el resultado de los sprites»).

## Optimizaciones (v1.1.0)
- **Portada** de 140 KB (PNG) → 52 KB (WebP). Era lo que más pesaba: las imágenes que descarga el jugador pasaron de ≈ 150 KB a ≈ 62 KB, y el proyecto completo de ≈ 255 KB a ≈ 173 KB.
- **Conejo**: solo sprites blancos; el tintado se calcula una vez por color (antes se buscaba el color en la lista en cada fotograma) y ya no se carga dos veces la portada.
- **Motor**: medidas de obstáculos en caché, partículas sin crear arreglos nuevos por cuadro, y en **pausa / derrota** el lienzo no se vuelve a dibujar (menos GPU y batería en el teléfono).
- **Audio**: el ruido del choque se genera una sola vez.
- **Interfaz**: el temporizador de métricas solo corre si las métricas están activas; precarga de la portada y la hoja de sprites.
- **Repositorio**: eliminadas carpetas vacías con nombres con llaves `{...}` (error de `mkdir`), añadidos `.gitignore` y `.nojekyll`.

## Pruebas realizadas (automáticas, Chromium headless)
| Prueba | Resultado |
|---|---|
| Consola del navegador sin errores ni avisos (menús, partida, derrota, ajustes) | ✔ |
| Salto con Espacio, Flecha ↑, clic y toque | ✔ |
| Tecla mantenida no produce saltos múltiples | ✔ |
| Choque con roca → pantalla de derrota con «¡Juego terminado!», puntuación y tiempo | ✔ |
| Reinicio: **1 clic** desde la derrota restablece posición, obstáculos, velocidad y tiempo | ✔ |
| Menú principal desde la derrota | ✔ |
| Color del conejo: **3 interacciones** (Personalizar → color → Listo); se ve en la partida y persiste | ✔ |
| Música y SFX se activan/desactivan de forma independiente; los ajustes se mantienen al navegar y al recargar | ✔ |
| Pausa (Esc/botón/cambio de pestaña) y continuar | ✔ |
| Bot jugando 45–60 s en **Fácil, Medio y Difícil** hasta la velocidad máxima, sin choques | ✔ |
| FPS medidos: 54–60 sostenidos. Con 3 navegadores simultáneos (carga artificial) hubo cuadros aislados de 20–30 FPS; con uno solo, 60 constantes. Confirmar en un teléfono real | ✔ ≥ 30 sostenido |
| Tiempo de respuesta del salto (pulsación → siguiente cuadro dibujado): promedio 3–10 ms, máximo ≈ 21 ms | ✔ < 200 ms |
| Textos sin desbordar y paneles dentro de pantalla en 568×320, 667×375, 390×844, 1024×768 y 1920×1080 | ✔ |
| Peso total < 10 MB (≈ 0,17 MB); 3+ archivos de código + carpeta de recursos; sprites en una hoja | ✔ |

## Pendiente / lo que NO se ha podido comprobar
- **Validación con usuarios reales** (AA3): el juego está preparado, pero **no** se ha probado con personas. Quedan por medir: 4 de 5 identifican los botones en < 10 s,
  instrucciones entendidas en < 30 s, valoración visual ≥ 4/5, ≥ 3 de 5 usan la personalización, 4 de 5 vuelven a jugar, dificultad adecuada ≥ 3/5.
- **Colisiones «100 % en 20 partidas»**: la detección es por cajas (AABB) y funcionó en las pruebas, pero las 20 partidas de prueba deben hacerlas ustedes y registrarlas.
- **Prueba en teléfonos reales**: se simuló el tamaño y el toque en Chromium, pero no se probó en un iPhone/Android físico. En iPhone (Safari) el botón de pantalla completa
  se oculta porque el navegador no lo permite.
- **Audio**: en el entorno de pruebas no hay altavoces, así que se comprobó que no hay errores, pero no cómo suena. Revísalo a oído y ajusta volúmenes en Ajustes.
- La latencia medida llega hasta que se dibuja el cuadro, no hasta que la pantalla lo muestra físicamente (suma ≈ 1 cuadro más de la pantalla).

## Cómo facilitar la validación
Activa **Ajustes → Métricas de prueba** (o F3): muestra FPS, respuesta del salto (última / promedio / máxima), velocidad, partidas y choques.
