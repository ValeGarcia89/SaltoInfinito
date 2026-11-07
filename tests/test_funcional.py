"""Pruebas funcionales: controles, color en 3 interacciones, reinicio en 1 clic, pausa, ajustes independientes, persistencia.
Uso igual que test_bot.py (servidor en el puerto 8765)."""
import asyncio, json
from playwright.async_api import async_playwright
res=[]
def ok(name, cond, extra=''): res.append((name, 'OK' if cond else 'FALLO', extra)); print(('✔ ' if cond else '✘ ')+name, extra)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width':1000,'height':560}, has_touch=True)
        pg = await ctx.new_page(); errs=[]
        pg.on('console', lambda m: errs.append((m.type,m.text)) if m.type in('error','warning') else None)
        pg.on('pageerror', lambda e: errs.append(('pageerror',str(e))))
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_timeout(1200)
        st = lambda: pg.evaluate("Game.state")
        grounded = lambda: pg.evaluate("Game._debug().rabbit.grounded")
        # --- Personalizar en <=3 interacciones y ver color en partida
        await pg.click('[data-action=customize]')                 # 1
        await pg.click('.swatch[data-color=pink]')                # 2
        await pg.click('.screen.show [data-action=back]')         # 3
        ok('Color cambiado en 3 interacciones', await pg.evaluate("Store.data.color")=='pink')
        # Verifica que el tintado realmente cambia píxeles (cuerpo ya no blanco) conservando alpha
        r = await pg.evaluate("""() => { const c=Assets; const cv=document.createElement('canvas'); cv.width=32;cv.height=32; const x=cv.getContext('2d');
            Assets.drawRabbit(x,0,0,0,1,'pink'); const d=x.getImageData(0,0,32,32).data; let n=0,white=0,pinkish=0;
            for(let i=0;i<d.length;i+=4){ if(d[i+3]>0){n++; if(d[i]>240&&d[i+1]>240&&d[i+2]>240) white++; if(d[i]>200&&d[i+1]<170&&d[i+2]>150) pinkish++;} } return {n,white,pinkish}; }""")
        ok('Tintado conserva silueta y colorea el cuerpo', r['n']>100 and r['white']==0 and r['pinkish']>50, str(r))
        # --- Empezar partida
        await pg.click('[data-action=play]'); await pg.click('[data-mode=medium]'); await pg.wait_for_timeout(200)
        ok('Partida inicia (Jugar -> modo)', await st()=='playing')
        # --- Controles de salto
        async def try_jump(label, fn):
            for _ in range(40):
                if await grounded(): break
                await pg.wait_for_timeout(50)
            await fn(); await pg.wait_for_timeout(60)
            ok(f'Salto con {label}', not await grounded())
            await pg.wait_for_timeout(1100)
        await try_jump('ESPACIO', lambda: pg.keyboard.press('Space'))
        await try_jump('Flecha ARRIBA', lambda: pg.keyboard.press('ArrowUp'))
        await try_jump('clic del mouse', lambda: pg.mouse.click(500,300))
        await try_jump('toque en pantalla', lambda: pg.touchscreen.tap(500,300))
        # --- Tecla mantenida = 1 solo salto
        await pg.evaluate("window.__jumps=0; const o=Game.jump; ")
        cnt = await pg.evaluate("""async () => { let n=0; const rb=Game._debug().rabbit; let prevG=rb.grounded;
            return await new Promise(res=>{ const iv=setInterval(()=>{ const g=Game._debug().rabbit.grounded; if(prevG&&!g) n++; prevG=g; },5); setTimeout(()=>{clearInterval(iv);res(n)},1800); }) }""") if False else None
        # mantiene Space con repeticiones durante ~1.2 s y cuenta despegues
        await pg.evaluate("window.__n=0; window.__pg=true; window.__iv=setInterval(()=>{const g=Game._debug().rabbit.grounded; if(window.__pg&&!g) window.__n++; window.__pg=g;},4)")
        for _ in range(50):
            if await grounded(): break
            await pg.wait_for_timeout(40)
        await pg.keyboard.down('Space')
        for _ in range(12):
            await pg.keyboard.down('Space'); await pg.wait_for_timeout(100)   # genera keydown con repeat
        await pg.keyboard.up('Space')
        n = await pg.evaluate("window.__n"); await pg.evaluate("clearInterval(window.__iv)")
        ok('Tecla mantenida no genera saltos múltiples', n<=1, f'despegues={n}')
        # --- Pausa
        await pg.wait_for_timeout(300)
        if await st()=='playing':
            await pg.keyboard.press('Escape'); ok('Pausa con Esc', await st()=='paused')
            await pg.click('[data-action=resume]'); ok('Continuar tras pausa', await st()=='playing')
        # --- Choque + reinicio <=2 toques
        for _ in range(80):
            if await st()=='over': break
            await pg.wait_for_timeout(250)
        ok('Choque con roca -> pantalla de derrota', await st()=='over')
        await pg.wait_for_timeout(700)
        txt = await pg.evaluate("document.querySelector('#screen-over').innerText")
        ok('Derrota muestra mensaje, puntuación y tiempo', '¡Juego terminado!' in txt and 'Puntuación' in txt and 'Tiempo' in txt)
        await pg.click('[data-action=retry]')                      # 1 solo clic
        await pg.wait_for_timeout(100)
        d = await pg.evaluate("({s:Game.state, t:Game._debug().time, n:Game._debug().obstacles.length, h:Game._debug().rabbit.h, sp:Game._debug().speed})")
        ok('Volver a jugar: 1 clic y estado reiniciado', d['s']=='playing' and d['t']<0.5 and d['n']==0 and d['h']==0 and d['sp']<=345, str(d))
        # menú principal desde derrota
        for _ in range(80):
            if await st()=='over': break
            await pg.wait_for_timeout(250)
        await pg.wait_for_timeout(700); await pg.click('#screen-over [data-action=menu]'); await pg.wait_for_timeout(200)
        ok('Menú principal desde derrota', await st()=='menu' and await pg.evaluate("document.querySelector('#screen-menu').classList.contains('show')"))
        # --- Ajustes independientes
        await pg.click('#btn-settings'); await pg.wait_for_timeout(250)
        await pg.click('#sw-music')
        a = await pg.evaluate("({m:Store.data.musicOn,s:Store.data.sfxOn})")
        ok('Música OFF no afecta SFX', a['m']==False and a['s']==True, str(a))
        await pg.click('#sw-music'); await pg.click('#sw-sfx')
        a = await pg.evaluate("({m:Store.data.musicOn,s:Store.data.sfxOn})")
        ok('SFX OFF no afecta música', a['m']==True and a['s']==False, str(a))
        await pg.click('#sw-sfx')
        gv = await pg.evaluate("""() => { AudioSys.unlock(); return new Promise(r=>setTimeout(()=>r(1),200)); }""")
        await pg.click('.screen.show [data-action=close-settings]')
        ok('Ajustes vuelven a la pantalla anterior', await pg.evaluate("document.querySelector('#screen-menu').classList.contains('show')"))
        # persistencia
        await pg.reload(); await pg.wait_for_timeout(1200)
        ok('Color y mejor puntuación persisten tras recargar', await pg.evaluate("Store.data.color=='pink' && Store.data.best.medium>0"))
        # pantalla completa (no debe lanzar error)
        await pg.click('#btn-fullscreen'); await pg.wait_for_timeout(300)
        ok('Sin errores en consola', len(errs)==0, str(errs))
        await b.close()
asyncio.run(main())
