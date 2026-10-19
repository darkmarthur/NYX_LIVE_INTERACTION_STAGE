import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createApp } from '../server/app.mjs';
import { createDemoBackend } from '../scripts/demo.mjs';

const now=Date.parse('2026-10-18T18:00:00-06:00');
const origin='https://nyx.example';
const env={BRIDGE_SECRET:'test-query-activation-'.repeat(3),APPS_SCRIPT_URL:'https://script.google.com/macros/s/testing/exec',SITE_ORIGIN:origin,PRIVACY_CONTROLLER:'Responsable',PRIVACY_ADDRESS:'Contacto',PRIVACY_EMAIL:'MARIODOMINGUEZ',LEGAL_APPROVED:'false',COLLECTION_OPEN:'false'};
const jpeg=Buffer.from([255,216,255,192,0,17,8,0,10,0,10,3,1,17,0,2,17,0,3,17,0,255,218,0,8,1,1,0,0,63,0,0,255,217]);
function fixture(){
  const backend=createDemoBackend(), calls=[];
  const app=createApp({env,now:()=>now,backend:async(...args)=>{calls.push(args);return backend(...args);}});
  const request=(path,init={})=>app(new Request(origin+path,init));
  const post=(route,cookie,csrf,payload,{query='?enable=true',headers={}}={})=>request(route+query,{method:'POST',headers:{origin,cookie,'x-nyx-csrf':csrf,'content-type':'application/json',...headers},body:payload instanceof Buffer?payload:JSON.stringify(payload)});
  return {request,post,calls,backend};
}
const base={answer:'Un recuerdo compartido.',consent:true,termsVersion:'2026-10-15-v2',website:''};
test('URL alone controls visual phase; old Netlify COLLECTION_OPEN=false is ignored',async()=>{
  const f=fixture();
  const closed=(await(await f.request('/api/bootstrap')).json()).data;
  assert.equal(closed.config.phase,'paused');
  const enabled=(await(await f.request('/api/bootstrap?enable=true')).json()).data;
  assert.equal(enabled.config.phase,'open');
  assert.ok(enabled.session.question);
  for(const bad of ['?enable=TRUE','?enable=1','?enable=false','?enable=true&enable=true','?enable=true&enable=false']){
    const conf=(await(await f.request('/api/bootstrap'+bad)).json()).data.config;
    assert.equal(conf.phase,'paused');
  }
});
test('JSON answer requires BOTH URL param and boolean request field',async()=>{
  const f=fixture(), initial=await f.request('/api/bootstrap?enable=true');
  const {session}= (await initial.json()).data;
  const cookie=initial.headers.get('set-cookie').split(';')[0];
  assert.equal((await f.post('/api/answer',cookie,session.csrf,{...base,enable_interaction:true},{query:''})).status,410);
  assert.equal((await f.post('/api/answer',cookie,session.csrf,base)).status,410);
  assert.equal((await f.post('/api/answer',cookie,session.csrf,{...base,enable_interaction:'true'})).status,410);
  assert.equal(f.calls.length,0);
  const accepted=await f.post('/api/answer',cookie,session.csrf,{...base,enable_interaction:true});
  assert.equal(accepted.status,200);
  assert.equal(f.calls[0][1].enableInteraction,true);
});
test('JPEG requires BOTH URL param and explicit request header',async()=>{
  const f=fixture(), initial=await f.request('/api/bootstrap?enable=true');
  const {session}=(await initial.json()).data, cookie=initial.headers.get('set-cookie').split(';')[0];
  const headers={'content-type':'image/jpeg','x-nyx-consent':'true','x-nyx-terms':'2026-10-15-v2'};
  assert.equal((await f.post('/api/photo',cookie,session.csrf,jpeg,{query:'',headers:{...headers,'x-nyx-enable-interaction':'true'}})).status,410);
  assert.equal((await f.post('/api/photo',cookie,session.csrf,jpeg,{headers})).status,410);
  assert.equal(f.calls.length,0);
  assert.equal((await f.post('/api/photo',cookie,session.csrf,jpeg,{headers:{...headers,'x-nyx-enable-interaction':'true'}})).status,200);
  assert.equal(f.calls[0][1].enableInteraction,true);
});
test('Withdrawal remains available without enabled URL for previous consent',async()=>{
  const f=fixture(), initial=await f.request('/api/bootstrap?enable=true');
  const {session}=(await initial.json()).data, cookie=initial.headers.get('set-cookie').split(';')[0];
  await f.post('/api/answer',cookie,session.csrf,{...base,enable_interaction:true});
  const old=await f.request('/api/bootstrap',{headers:{cookie}});
  const oldState=(await old.json()).data;
  assert.equal(oldState.config.phase,'paused');
  assert.ok(oldState.session.text);
  const cancelled=await f.post('/api/withdraw',cookie,session.csrf,{confirm:true,kind:'text'},{query:''});
  assert.equal(cancelled.status,200);
});
test('No internal navigation from home or participant pages; Instagram intentional exception',()=>{
  for(const page of ['index.html','foto.html','preguntas.html']){
    const html=readFileSync(new URL('../dist/'+page,import.meta.url),'utf8');
    assert.ok(html.includes('https://www.instagram.com/nyx.sonoro'));
    assert.ok(!/<a[^>]+href="\/(?:foto|preguntas|legal|)"/.test(html));
  }
  const home=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
  assert.ok(home.includes('LIVE SET / PERFORMANCE'));
  assert.ok(!home.includes('ESTA NOCHE,'));
  const question=readFileSync(new URL('../dist/preguntas.html',import.meta.url),'utf8');
  assert.ok(question.includes('Comparte una idea.'));
  const photo=readFileSync(new URL('../dist/foto.html',import.meta.url),'utf8');
  assert.ok(photo.includes('¿QUÉ IMAGEN'));
  assert.ok(photo.includes('Un recuerdo de tu celular a la pantalla grande.'));
  assert.ok(readFileSync(new URL('../public/app.js',import.meta.url),'utf8').includes('SÍGUENOS EN INSTAGRAM'));
});

test('An unapproved notice flag or non-email contact is NOT a hidden activation switch',async()=>{
  const f=fixture();
  const first=await f.request('/api/bootstrap?enable=true');
  const {config,session}=(await first.json()).data;
  assert.equal(config.ready,true);
  assert.equal(config.phase,'open');
  const cookie=first.headers.get('set-cookie').split(';')[0];
  const sent=await f.post('/api/answer',cookie,session.csrf,{answer:'Un momento feliz.',consent:true,termsVersion:'2026-10-15-v2',website:'',enable_interaction:true});
  assert.equal(sent.status,200);
  const off=await f.request('/api/bootstrap');
  assert.equal((await off.json()).data.config.phase,'paused');
});
