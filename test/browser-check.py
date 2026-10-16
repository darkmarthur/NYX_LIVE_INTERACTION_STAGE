"""Offline Chromium DOM/worker tests. Does NOT verify HTTP navigation, cookies or Netlify.
Reads the production build; substitutes fetch and module loading only. Requires Python playwright + Chromium.
"""
import json, re, subprocess, random
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT.parent
REPORT=json.loads((ROOT/'dist/build-report.json').read_text())
ASSETS=ROOT/'dist/assets'/REPORT['version']
CONFIG={'eventId':'nyx-ocampo-2026','eventName':'NYX Sonoro','venue':'Teatro Ocampo · Cuernavaca','eventLabel':'22 de octubre de 2026 · 19:00 h','opensAt':'2026-10-08T00:00:00-06:00','closesAt':'2026-10-22T19:00:00-06:00','purgeAt':'2026-10-23T10:00:00-06:00','deleteBy':'2026-10-23T12:00:00-06:00','termsVersion':'2026-10-15-v2','maxPhotoBytes':1048576,'maxPhotoSide':2048,'maxOriginalBytes':20971520,'maxAnswerLength':500,'ready':True,'phase':'open','mode':'demo','controller':'Prueba local','address':'No es un aviso real','contact':'test@example.test'}
QUESTION='¿Cómo terminarías la frase «por un instante, todo parecía…»?'
MOCK='''({config,question}) => {
 window.__calls=[];window.__state={csrf:'test-only',question:{id:99,text:question},photo:null,text:null};
 window.__failNext=false;
 window.fetch=async(path,options={})=>{
   window.__calls.push({path,method:options.method,bytes:options.body?.size||options.body?.length||0,contentType:options.headers?.['Content-Type']});
   let data;
   if(path==='/api/config') data=config;
   else if(path==='/api/bootstrap') data={config,session:window.__state};
   else if(path==='/api/session') data=window.__state;
   else if(path==='/api/withdraw') {let kind=JSON.parse(options.body).kind;window.__state[kind]={...window.__state[kind],withdrawn:true};data={withdrawn:true,kind};}
   else {let kind=path==='/api/photo'?'photo':'text';let receipt='NYX-1234567890abcdef1234567890abcdef';window.__state[kind]={submitted:true,receipt};data={receipt};if(window.__failNext){window.__failNext=false;throw new TypeError('offline after write');}}
   return new Response(JSON.stringify({ok:true,data}),{headers:{'Content-Type':'application/json'}});
 };
}'''
APP=(ASSETS/'app.js').read_text().replace("import('./photo.js')","Promise.resolve(window.__photo)").replace("import('./legal.js')","Promise.resolve(window.__legal)")
PHOTO=(ASSETS/'photo.js').read_text().replace('export async function preparePhoto','async function preparePhoto').replace("new URL('./photo-worker.js', import.meta.url)",'window.__workerURL')
LEGAL=(ASSETS/'legal.js').read_text().replace('export function renderLegal','function renderLegal')
def load(page,path,config=CONFIG,question=QUESTION,fallback=False):
    name={'/':'index.html','/foto':'foto.html','/preguntas':'preguntas.html','/legal':'legal.html'}[path]
    html=(ROOT/'dist'/name).read_text()
    html=re.sub(r'<script[^>]*>.*?</script>','',html,flags=re.S)
    html=re.sub(r'<link rel="stylesheet"[^>]*>',lambda m:'<style>'+(ASSETS/'styles.css').read_text()+'</style>',html)
    page.set_content(html)
    page.evaluate(MOCK,{'config':config,'question':question})
    page.evaluate('(source)=>{window.__workerURL=URL.createObjectURL(new Blob([source],{type:"text/javascript"}));}',(ASSETS/'photo-worker.js').read_text())
    page.evaluate('window.__photo=(()=>{'+PHOTO+';return {preparePhoto};})()')
    page.evaluate('window.__legal=(()=>{'+LEGAL+';return {renderLegal};})()')
    if fallback:page.evaluate('window.Worker=undefined')
    page.evaluate('()=>{'+APP+'}')
    page.wait_for_function("document.querySelector('#phase').textContent !== 'CONECTANDO'")
def dimensions(page):
    return page.evaluate('''() => ({height:innerHeight,scroll:document.documentElement.scrollHeight,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,send:document.querySelector('#send')?.getBoundingClientRect().bottom})''')
if not (OUT/'nyx-test-photo.jpg').exists():
    from PIL import Image
    Image.frombytes('RGB',(2400,1800),random.Random(42).randbytes(2400*1800*3)).save(OUT/'nyx-test-photo.jpg',quality=93)
results=[]; functional=[]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    for width,height in [(320,568),(360,640),(375,667),(390,844),(430,932),(1440,1000)]:
        for path in ['/','/foto','/preguntas']:
            context=browser.new_context(viewport={'width':width,'height':height},device_scale_factor=1)
            page=context.new_page(); errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            load(page,path); result=dimensions(page)
            result.update({'viewport':f'{width}x{height}','path':path,'errors':errors});results.append(result)
            if width==390:page.screenshot(path=str(OUT/f'nyx-v3-{path.strip("/") or "inicio"}.png'),full_page=True)
            if path!='/':assert page.locator('#send').is_disabled()
            context.close()
    small=browser.new_context(viewport={'width':320,'height':568});smallpage=small.new_page();load(smallpage,'/preguntas')
    questions=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {QUESTIONS} from './shared/questions.mjs'; console.log(JSON.stringify(QUESTIONS))"],cwd=ROOT))
    worst=0
    for q in questions:
        smallpage.locator('#question').evaluate('(el,q)=>el.textContent=q',q)
        d=dimensions(smallpage);worst=max(worst,d['scroll']-d['height'])
    assert worst==0, f'Question overflow: {worst}px'
    functional.append('All 100 questions fit 320×568 with keyboard closed and normal text size')
    small.close()
    ctx=browser.new_context(viewport={'width':390,'height':844});page=ctx.new_page();load(page,'/preguntas')
    page.fill('#answer','El patio de mi abuela.');assert page.locator('#send').is_disabled();page.check('#consent')
    page.evaluate('window.__failNext=true');page.click('#send');page.wait_for_selector('#send:has-text("COMPROBAR ENVÍO")')
    assert len([c for c in page.evaluate('window.__calls') if c['path']=='/api/answer'])==1
    page.click('#send');page.wait_for_selector('#unsend');functional.append('Timeout after write → status check, no second upload')
    page.screenshot(path=str(OUT/'nyx-v3-exito.png'),full_page=True)
    page.evaluate("window.__state.photo={receipt:'NYX-other',submitted:true}")
    page.click('#unsend');page.click('#confirm-unsend');page.wait_for_selector('.cancelled')
    assert page.evaluate('window.__state.photo.withdrawn') is None
    assert page.evaluate('window.__state.text.withdrawn') is True
    functional.append('Selective unsend from success; other route untouched')
    page.screenshot(path=str(OUT/'nyx-v3-anulado.png'),full_page=True)
    for fallback in [False,True]:
        load(page,'/foto',fallback=fallback)
        page.set_input_files('#photo-file',str(OUT/'nyx-test-photo.jpg'))
        page.wait_for_selector('#preview-box:not([hidden])',timeout=60000)
        size=page.locator('#photo-info').inner_text()
        page.check('#consent');page.screenshot(path=str(OUT/f'nyx-v3-foto-preview-{fallback}.png'),full_page=True)
        page.click('#send');page.wait_for_selector('#unsend')
        calls=page.evaluate('window.__calls'); uploads=[c for c in calls if c['path']=='/api/photo'];assert len(uploads)==1
        assert uploads[0]['contentType']=='image/jpeg';assert uploads[0]['bytes']<=384*1024
        functional.append(f'Photo {"fallback" if fallback else "worker"}: {size}; binary bytes {uploads[0]["bytes"]}')
    load(page,'/legal');page.wait_for_selector('.legal h2');assert page.locator('.legal h2').count()==8
    functional.append('Legal loaded separately and remains scrollable')
    browser.close()
result={'layout':results,'functional':functional,'scope':'Offline DOM, mocked fetch. Real image compression + worker/fallback; no HTTP/cookies/Google E2E.'}
(OUT/'nyx-layout-check.json').write_text(json.dumps(result,indent=2,ensure_ascii=False))
for r in results:print(r['viewport'],r['path'],'scroll=',r['scroll']-r['height'],'horizontal=',r['scrollWidth']-r['width'],'errors=',r['errors'])
print('\n'.join(functional))
