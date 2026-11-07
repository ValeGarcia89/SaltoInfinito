"""Prueba de diseño responsive: textos sin desbordar y paneles dentro de la pantalla en 5 tamaños (móviles, tablet, PC)."""
import asyncio
from playwright.async_api import async_playwright
JS = """() => { const bad=[]; document.querySelectorAll('.btn,.how b,.how span,.set-name,.panel h2,.stats span,.stats b,.title').forEach(e=>{
  if(e.offsetParent===null && !e.closest('.screen')) return; if(e.scrollWidth>e.clientWidth+1) bad.push(e.className+':'+e.textContent.trim().slice(0,20)); }); return bad; }"""
async def check(b,name,w,h,mobile):
    ctx = await b.new_context(viewport={'width':w,'height':h}, device_scale_factor=2, has_touch=mobile, is_mobile=mobile)
    pg = await ctx.new_page(); await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_timeout(1200)
    out={}
    for scr,act in [('menu',None),('modes','play'),('customize','customize'),('instructions','instructions'),('settings','#btn-settings')]:
        if act:
            if act.startswith('#'): await pg.click(act)
            else:
                await pg.click('.screen.show [data-action=back]') if scr!='modes' and scr!='customize' and False else None
                await pg.evaluate("document.querySelectorAll('.screen.show').forEach(e=>e.classList.remove('show'))")
                await pg.click(f'#screen-menu [data-action={act}]') if False else await pg.evaluate(f"document.querySelector('[data-action={act}]').click()")
            await pg.wait_for_timeout(350)
        out[scr]=await pg.evaluate(JS)
        # ¿el panel cabe en el escenario?
        fit = await pg.evaluate("""() => { const st=document.querySelector('#stage').getBoundingClientRect(); const p=document.querySelector('.screen.show .panel'); if(!p) return 'n/a'; const r=p.getBoundingClientRect(); return (r.top>=st.top-1 && r.bottom<=st.bottom+1)?'cabe':'DESBORDA' }""")
        out[scr]=(out[scr], fit)
        await pg.evaluate("document.querySelector('#btn-settings') && 0")
        await pg.evaluate("document.querySelectorAll('.screen.show').forEach(e=>e.classList.remove('show')); document.querySelector('#screen-menu').classList.add('show')")
    print(name,out); await ctx.close()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for n,w,h,m in [('móvil 568x320',568,320,True),('móvil 667x375',667,375,True),('móvil vertical 390x844',390,844,True),('tablet 4:3 1024x768',1024,768,False),('PC 1920x1080',1920,1080,False)]:
            await check(b,n,w,h,m)
        await b.close()
asyncio.run(main())
