"""Prueba con BOT: juega solo en los 3 modos y verifica que no hay obstáculos imposibles, FPS y latencia del salto.
Uso: (1) en la carpeta del proyecto:  python3 -m http.server 8765   (2) en otra terminal:  python3 tests/test_bot.py
Requiere: pip install playwright && playwright install chromium"""
import asyncio, json, sys
from playwright.async_api import async_playwright
BOT = """
window.__bot = setInterval(() => {
  if (Game.state !== 'playing') return;
  const d = Game._debug(); const r = d.rabbit; if (!r.grounded) return;
  const front = 130 + 26*3;                       // borde derecho de la caja del conejo
  for (const o of d.obstacles) {
    const left = o.x + o.hit.x, dx = left - front;
    if (dx > -10 && dx < d.speed*0.20) { Game.jump(); return; }   // salta ~0,20 s antes del choque
  }
}, 4);
"""
async def run(b, modeid, secs):
    pg = await b.new_page(viewport={'width':1000,'height':560})
    errs=[]
    pg.on('console', lambda m: errs.append((m.type,m.text)) if m.type in('error','warning') else None)
    pg.on('pageerror', lambda e: errs.append(('pageerror',str(e))))
    await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_timeout(1200)
    await pg.click('[data-action=play]'); await pg.wait_for_timeout(300)
    await pg.click(f'[data-mode={modeid}]')
    await pg.evaluate(BOT)
    snap=False
    for i in range(secs*2):
        await pg.wait_for_timeout(500)
        if await pg.evaluate("Game.state")!='playing': break
        if i==16 and modeid=='hard' and not snap:
            await pg.screenshot(path='/tmp/play_mid.png'); snap=True
    m = await pg.evaluate("({state:Game.state, t:Game._debug().time, speed:Game._debug().speed, m:Game.metrics})")
    print(modeid, 'estado', m['state'], 't=%.1f'%m['t'], 'vel', round(m['speed']), 'fps', m['m']['fps'], 'minfps', m['m']['minFrameFps'],
          'salto prom %.1f ms max %.1f ms (n=%d)'%(m['m']['jumpAvg'] or 0, m['m']['jumpMax'] or 0, m['m']['jumpCount']), 'errs', errs)
    await pg.close()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        await asyncio.gather(run(b,'easy',60), run(b,'medium',45), run(b,'hard',50))
        await b.close()
asyncio.run(main())
