"""Offline Chromium DOM functional test; fetch adapter to local server, Google mocked.
Production form markup and real JPEG compression; minimal CSS, NOT a visual regression.
No production URLs, credentials or participant data are used.
"""
from pathlib import Path
import json, urllib.request, re, base64
from playwright.sync_api import sync_playwright
from PIL import Image
root=Path(__file__).resolve().parents[1]
photo=root.parent/'test-photo.jpg'
Image.new('RGB',(1400,900),(75,120,90)).save(photo,quality=92)
base='http://127.0.0.1:8765'
cookie=''
def request_bridge(req):
 global cookie
 headers=dict(req['headers'])
 if cookie: headers['Cookie']=cookie
 if req['method']=='POST':headers['Origin']=base
 body=req.get('body')
 if isinstance(body,list):body=bytes(body)
 elif isinstance(body,str):body=body.encode()
 request=urllib.request.Request(base+req['path'],data=body,headers=headers,method=req['method'])
 try:r=urllib.request.urlopen(request)
 except urllib.error.HTTPError as e:r=e
 if r.headers.get('Set-Cookie'):cookie=r.headers['Set-Cookie'].split(';')[0]
 return {'status':r.status,'body':r.read().decode()}
def load(page,path):
 html=urllib.request.urlopen(base+path).read().decode()
 html=re.sub(r'<script[^>]*>.*?</script>','',html,flags=re.S)
 page.set_content(html)
 page.evaluate("""() => {window.Worker=undefined;window.fetch=async(path,options={})=>{
 const body=options.body instanceof Blob?[...new Uint8Array(await options.body.arrayBuffer())]:options.body;
 const r=await window.nyxFetch({path,headers:options.headers||{},method:options.method||'GET',body});
 return new Response(r.body,{status:r.status,headers:{'content-type':'application/json'}});};} """)
 photo=(root/'public/photo.js').read_text().replace('export async function','async function').replace("new URL('./photo-worker.js', import.meta.url)","'unused-worker'")
 legal=(root/'public/legal.js').read_text().replace('export function','function')
 page.evaluate('()=>{'+photo+';window.__photo={preparePhoto};}')
 page.evaluate('()=>{'+legal+';window.__legal={renderLegal};}')
 app=(root/'public/app.js').read_text().replace("import('./photo.js')",'Promise.resolve(window.__photo)').replace("import('./legal.js')",'Promise.resolve(window.__legal)').replace('location.origin',json.dumps(base)).replace('new URLSearchParams(location.search)','new URLSearchParams('+json.dumps('?'+path.split('?',1)[1] if '?' in path else '')+')')
 # about:blank disables sessionStorage; keep in-memory storage just for this test identity.
 app=app.replace('sessionStorage.', 'window.__testStorage.')
 page.evaluate("() => {window.__saved=window.__saved||{};window.__testStorage={getItem:k=>window.__saved[k]||null,setItem:(k,v)=>window.__saved[k]=v};}")
 page.evaluate('()=>{'+app+'}')

def data():return json.loads(urllib.request.urlopen(base+'/__test/counts').read())
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 ctx=b.new_context(viewport={'width':390,'height':844})
 ctx.add_init_script('window.Worker=undefined')
 page=ctx.new_page();page.expose_function('nyxFetch',request_bridge);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 load(page,'/preguntas?enable=true');page.wait_for_function("document.querySelector('#fields').disabled===false")
 assert page.locator('#send').is_disabled()
 page.fill('#answer','Primera respuesta');page.check('#consent');page.click('#send');page.wait_for_selector('#restart-contribution')
 assert len(data()['rows'])==2
 page.click('#restart-contribution');page.wait_for_selector('#answer');page.fill('#answer','Segunda respuesta');page.check('#consent');page.click('#send');page.wait_for_selector('#restart-contribution')
 assert len(data()['rows'])==3
 page.click('#my-submissions');page.wait_for_selector('#history-list .notice')
 assert page.locator('#history-list .notice').count()==2
 card=page.locator('#history-list .notice').last;card.locator('button').click();card.locator('button').click();card.locator('.status').filter(has_text='ANULADO').wait_for()
 assert [r[1] for r in data()['rows'][1:]]==['Segunda respuesta']
 page.click('#multi-close')
 page.click('#restart-contribution');page.fill('#answer','Tercera respuesta');page.check('#consent')
 urllib.request.urlopen(base+'/__test/fail-write').read()
 page.click('#send');page.wait_for_selector('#error-check');assert len(data()['rows'])==3
 page.click('#error-check');page.wait_for_function("document.querySelector('#send')?.textContent.includes('ENVIAR') && !document.querySelector('#send').disabled")
 page.click('#send');page.wait_for_selector('#restart-contribution');assert len(data()['rows'])==3
 load(page,'/preguntas?enable=true');page.wait_for_selector('#restart-contribution');assert len(data()['rows'])==3
 load(page,'/foto?enable=true');page.wait_for_function("document.querySelector('#fields').disabled===false")
 for _ in range(2):
  page.set_input_files('#photo-file',str(photo));page.wait_for_selector('#preview-box:not([hidden])');page.check('#consent');page.click('#send');page.wait_for_selector('#restart-contribution')
  if len(data()['files'])==1:page.click('#restart-contribution');page.wait_for_selector('#photo-file')
 assert len(data()['files'])==2
 page.click('#unsend');page.click('#confirm-unsend');page.wait_for_selector('.cancelled');assert len(data()['files'])==1
 assert [r[1] for r in data()['rows'][1:]]==['Segunda respuesta','Tercera respuesta']
 page.click('#restart-contribution');page.wait_for_selector('#photo-file')
 page.click('#terms-open');page.wait_for_selector('#legal-copy h2');page.click('#multi-close');assert page.locator('#photo-file').count()==1
 load(page,'/foto');page.wait_for_selector('#reload');assert page.locator('#send').count()==0
 assert not errors,errors
 print(json.dumps({'passed':['two answers without annulling','withdraw earlier answer only','timeout recovery without duplication','same-session reload recovery (adapter)','two binary photos','withdraw one photo without touching texts','new contribution after cancellation','legal modal keeps route','query flag required'], 'browser_errors':errors,'scope':'Offline Chromium DOM 390x844; fetch/module/cookie adapter to local HTTP, real JS and JPEG fallback; mocked Google; minimal test CSS, not browser HTTP or visual E2E'},ensure_ascii=False,indent=2))
 b.close()
