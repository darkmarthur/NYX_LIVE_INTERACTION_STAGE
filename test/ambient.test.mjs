import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { gzipSync } from 'node:zlib';
import { ambientClientScript, AMBIENT_CSS } from '../scripts/ambient.mjs';
import { calendarFile, eventHTML, googleCalendarURL } from '../scripts/event.mjs';

function fixture({ motion=false, saveData=false, effectiveType='4g', idle=true, loaded=true }={}) {
  const timers=new Map(), idles=new Map(), handlers=new Map(); let seq=0, imports=0, init=0, settle;
  const boot=new Promise(resolve=>{settle=resolve;});
  const add=(key,fn)=>handlers.set(key,fn), remove=key=>handlers.delete(key);
  const context={page:'text',busy:false,uncertain:false,config:{ready:true},main:{},nyxBootReady:boot,
    navigator:{onLine:true,connection:{saveData,effectiveType}},
    document:{hidden:false,activeElement:{tagName:'BODY'},readyState:loaded?'complete':'loading',querySelector:()=>null,documentElement:{classList:{contains:()=>false}},addEventListener:add,removeEventListener:remove},
    window:{matchMedia:()=>({matches:motion}),setTimeout:(fn,delay)=>{const id=++seq;timers.set(id,{fn,delay});return id;},addEventListener:add,removeEventListener:remove},
    clearTimeout:id=>timers.delete(id),MutationObserver:class {observe(){} disconnect(){}},
    loadAmbient:async()=>{imports++;return {startAmbient:()=>{init++;}};}
  };
  if(idle){context.window.requestIdleCallback=fn=>{const id=++seq;idles.set(id,fn);return id;};context.window.cancelIdleCallback=id=>idles.delete(id);}
  vm.createContext(context); new vm.Script(ambientClientScript().replace("import('./ambient.js')",'loadAmbient()')).runInContext(context);
  return {context,timers,idles,handlers,settle,imports:()=>imports,init:()=>init,
    tick(){const entries=[...timers.entries()];for(const [id,t]of entries){timers.delete(id);t.fn();}},
    idle(){for(const [id,fn] of [...idles.entries()]){idles.delete(id);fn();}}
  };
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('Loader waits for boot, full page load and quiet period',async()=>{
 const f=fixture({loaded:false});assert.equal(f.timers.size,0);f.settle();await flush();assert.equal(f.timers.size,0);
 f.context.document.readyState='complete';f.handlers.get('load')();assert.equal([...f.timers.values()][0].delay,1200);assert.equal(f.imports(),0);
 f.tick();assert.equal(f.imports(),0);f.idle();await flush();assert.equal(f.imports(),1);assert.equal(f.init(),1);
});
test('Fallback without requestIdleCallback works after timers, not synchronously',async()=>{
 const f=fixture({idle:false});f.settle();await flush();f.tick();assert.equal(f.imports(),0);assert.equal([...f.timers.values()][0].delay,300);f.tick();await flush();assert.equal(f.init(),1);
});
for(const [label,options]of [['reduced motion',{motion:true}],['data saver',{saveData:true}],['2g',{effectiveType:'2g'}],['slow-2g',{effectiveType:'slow-2g'}]]){
 test(label+' avoids even the renderer request',async()=>{const f=fixture(options);f.settle();await flush();f.tick();f.idle();await flush();assert.equal(f.imports(),0);assert.equal(f.timers.size,0);});
}
test('Typing postpones loading and blur permits it',async()=>{
 const f=fixture();f.context.document.activeElement.tagName='TEXTAREA';f.settle();await flush();assert.equal(f.timers.size,0);
 f.context.document.activeElement.tagName='BODY';f.handlers.get('focusout')();f.tick();f.idle();await flush();assert.equal(f.imports(),1);
});
test('Tab hidden at the last moment never starts a download',async()=>{
 const f=fixture();f.settle();await flush();f.tick();f.context.document.hidden=true;f.idle();await flush();assert.equal(f.imports(),0);
 f.context.document.hidden=false;f.handlers.get('visibilitychange')();f.tick();f.idle();await flush();assert.equal(f.imports(),1);
});
test('Busy upload at the last moment blocks decoration',async()=>{
 const f=fixture();f.settle();await flush();f.tick();f.context.busy=true;f.idle();await flush();assert.equal(f.imports(),0);
});
test('Optional renderer budget and syntax',()=>{
 const text=readFileSync(new URL('../public/ambient.js',import.meta.url),'utf8');new vm.Script(text.replace('export function','function'));
 assert.ok(gzipSync(text).length<3000);assert.ok(!/\b(fetch|WebSocket|setInterval)\(/.test(text));assert.ok(text.includes('480000'));assert.ok(text.includes('1000 / 18'));
 assert.match(AMBIENT_CSS,/pointer-events:none/);assert.match(AMBIENT_CSS,/opacity 1.8s/);
});
test('Calendar ICS is start-only UTC, no invented end, no forced download',()=>{
 const ics=calendarFile();assert.match(ics,/DTSTART:20261023T010000Z/);assert.ok(!ics.includes('DTEND:'));assert.ok(ics.endsWith('\r\n'));
 const html=eventHTML();assert.ok(!html.includes('download='));assert.ok(html.includes('type="text/calendar"'));assert.ok(html.includes('Safari o Chrome'));
 assert.equal(new URL(googleCalendarURL()).searchParams.get('dates'),'20261023T010000Z/20261023T010000Z');
});
test('Static calendar headers and build retain the lazy renderer path',()=>{
 const toml=readFileSync(new URL('../netlify.toml',import.meta.url),'utf8');assert.ok(toml.includes('Content-Type = "text/calendar; charset=utf-8"'));assert.ok(toml.includes('Content-Disposition = \'inline;'));
 const build=readFileSync(new URL('../scripts/build.mjs',import.meta.url),'utf8');assert.ok(build.includes('const nyxBootReady = boot();'));assert.ok(build.includes('eventClientScript() + ambientClientScript()'));
});
