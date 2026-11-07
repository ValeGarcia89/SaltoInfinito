"""Genera assets/sprites/sprites.png (hoja de sprites única) a partir de los PNG/GIF originales.
Uso:  python3 tools/build_spritesheet.py
Requiere Pillow. Las coordenadas resultantes están en js/config.js (CONFIG.ATLAS)."""
from PIL import Image
import os
O = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sprites', 'originals')
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sprites', 'sprites.png')
sheet = Image.new('RGBA', (320, 122), (0, 0, 0, 0))
# Fila 0: conejo (8 fotogramas de 32x32)
for i in range(8):
    sheet.alpha_composite(Image.open(f'{O}/tile00{i}.png').convert('RGBA'), (i * 32, 0))
# Fila 1: obstáculos (rocas y troncos)
x = 0
for name in ['stone6', 'stone8', 'log3', 'log4', 'log6', 'log9']:
    im = Image.open(f'{O}/{name}.png').convert('RGBA')
    sheet.alpha_composite(im, (x, 32)); x += im.width
# Fila 2: zanahoria (6 fotogramas de 34x58)
g = Image.open(f'{O}/carrot.gif')
for i in range(g.n_frames):
    g.seek(i); sheet.alpha_composite(g.convert('RGBA'), (i * 34, 64))
sheet.save(OUT, optimize=True)
print('OK', OUT, sheet.size)
