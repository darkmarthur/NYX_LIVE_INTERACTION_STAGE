import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createApp } from '../server/app.mjs';
import { withErrorDiagnostics } from '../server/diagnostics.mjs';
const time = Date.parse('2026-10-21T18:00:00-06:00');
const env = {SITE_ORIGIN:'https://nyx.example',APPS_SCRIPT_URL:'https://script.google.com/macros/s/test/exec',BRIDGE_SECRET:'regression-only-'.repeat(4)};
for (const code of ['STALE','FULL','WITHDRAWN','BACKEND']) {
  test(`Rejection ${code} exposes a stable code and logs no contribution or key`,async () => {
    const app = withErrorDiagnostics(createApp({env,now:()=>time,backend:async () => { throw new Error(code); }}));
    const initial=await app(new Request(env.SITE_ORIGIN+'/api/bootstrap?enable=true'));
    const cookie=initial.headers.get('set-cookie').split(';')[0];
    const csrf=(await initial.json()).data.session.csrf;
    const logs=[], prior=console.warn;
    console.warn=(item)=>logs.push(item);
    let response;
    try {
      response=await app(new Request(env.SITE_ORIGIN+'/api/answer?enable=true',{method:'POST',headers:{origin:env.SITE_ORIGIN,cookie,'x-nyx-csrf':csrf,'content-type':'application/json'},body:JSON.stringify({answer:'PRIVATE_CONTENT_DO_NOT_LOG',consent:true,enable_interaction:true,termsVersion:'2026-10-15-v2',website:''})}));
    } finally { console.warn=prior; }
    assert.equal(response.status,code==='BACKEND'?503:409);
    const payload=await response.json();assert.equal(payload.ok,false);assert.equal(payload.error.code,code);assert.ok(payload.error.message);
    assert.deepEqual(JSON.parse(logs[0]),{event:'nyx_request_error',code,status:response.status});
    assert.ok(!logs.join().includes(env.BRIDGE_SECRET));assert.ok(!logs.join().includes('PRIVATE_CONTENT'));
  });
}
test('Built photo page uses a full button and separate native input; feedback code is present',()=>{
  const html=readFileSync(new URL('../dist/foto.html',import.meta.url),'utf8');
  assert.match(html,/<button type="button" class="picker" id="picker"/);
  assert.match(html,/<\/button><input id="photo-file"/);
  assert.ok(!html.includes('<label class="picker"'));
  const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  assert.ok(source.includes("$('#picker').addEventListener('click',choosePhoto)"));
  assert.ok(source.includes('function showFailure('));
  assert.ok(source.includes("if (previous && !previous.withdrawn)"));
});
