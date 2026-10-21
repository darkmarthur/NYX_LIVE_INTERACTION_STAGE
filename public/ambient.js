// Optional advected particles in a slowly evolving flow field. No external assets.
export function startAmbient({ isBusy = () => false } = {}) {
  if (document.querySelector('.nyx-ambient')) return;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const lowData = () => Boolean(connection?.saveData || /^(slow-)?2g$/.test(connection?.effectiveType || ''));
  if (motion.matches || lowData()) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'nyx-ambient'; canvas.setAttribute('aria-hidden','true'); canvas.setAttribute('role','presentation');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  document.body.prepend(canvas);
  let width = 1, height = 1, ratio = 1, timer = 0, raf = 0, fadeFrame = 0;
  let stopped = false, suspended = false, needsResize = true, shown = false;
  let time = 0, previous = 0, expensive = 0, seed = 20261022;
  let particles = [];
  const random = () => ((seed = (Math.imul(1664525,seed) + 1013904223) >>> 0) / 4294967296);
  const editing = () => /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
  const paused = () => stopped || suspended || document.hidden || motion.matches || lowData() || isBusy() || editing();
  function rebirth(particle, scatter = false) {
    particle.x = random() * width; particle.y = random() * height;
    particle.life = 5 + random() * 13; particle.age = scatter ? random() * particle.life : 0;
    particle.speed = 15 + random() * 24; particle.alpha = .18 + random() * .30;
    particle.width = random() > .8 ? 1.2 : .65;
    particle.color = random() > .93 ? 2 : random() > .6 ? 1 : 0;
  }
  function resize() {
    width = Math.max(1,window.innerWidth); height = Math.max(1,window.innerHeight);
    ratio = Math.min(window.devicePixelRatio || 1,1.25,Math.sqrt(480000 / (width * height)));
    canvas.width = Math.max(1,Math.floor(width * ratio)); canvas.height = Math.max(1,Math.floor(height * ratio));
    ctx.setTransform(ratio,0,0,ratio,0,0);
    particles = Array.from({length:Math.min(320,Math.max(160,Math.round(width * height / 1500)))},() => {
      const particle = {}; rebirth(particle,true); return particle;
    });
    needsResize = false;
  }
  // Curl of a layered stream function: local eddies rather than decorative waves.
  function direction(x,y) {
    const scale = Math.min(width,height);
    const a = (x - width * .5) / scale * 4.2, b = (y - height * .5) / scale * 4.2;
    const t = time * .065;
    const cross = Math.cos(a * 1.45 + b * .8 - t * .8);
    const vx = 1.3 * Math.sin(a * .9 + t) * Math.cos(b * 1.3 - t) + .44 * cross;
    const vy = -.9 * Math.cos(a * .9 + t) * Math.sin(b * 1.3 - t) - .80 * cross;
    return Math.atan2(vy,vx);
  }
  function draw(dt) {
    ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(0,0,0,0.047)'; ctx.fillRect(0,0,width,height);
    ctx.globalCompositeOperation = 'source-over';
    for (const particle of particles) {
      particle.age += dt;
      if (particle.age > particle.life || particle.x < -12 || particle.x > width + 12 || particle.y < -12 || particle.y > height + 12) { rebirth(particle); continue; }
      const heading = direction(particle.x,particle.y);
      const x = particle.x + Math.cos(heading) * particle.speed * dt;
      const y = particle.y + Math.sin(heading) * particle.speed * dt;
      ctx.globalAlpha = particle.alpha * Math.max(0,Math.min(1,particle.age / .9,(particle.life-particle.age) / 1.2));
      ctx.strokeStyle = particle.color === 2 ? '#b39aad' : particle.color === 1 ? '#c4d4ce' : '#65c8be';
      ctx.lineWidth = particle.width;
      ctx.beginPath(); ctx.moveTo(particle.x,particle.y); ctx.lineTo(x,y); ctx.stroke();
      particle.x = x; particle.y = y;
    }
    ctx.globalAlpha = 1;
  }
  function cancel() { clearTimeout(timer); window.cancelAnimationFrame(raf); timer = raf = 0; previous = 0; }
  function requestFrame() {
    if (timer || raf || paused()) return;
    timer = window.setTimeout(() => { timer = 0; if (!paused()) raf = window.requestAnimationFrame(frame); },1000 / 18);
  }
  function frame(now) {
    raf = 0;
    if (paused()) { cancel(); return; }
    try {
      if (needsResize) resize();
      const dt = previous ? Math.min(100,now-previous)/1000 : 0; previous = now; time += dt;
      const before = performance.now(); draw(dt);
      expensive = performance.now()-before > 9 ? expensive+1 : Math.max(0,expensive-1);
      if (!shown) {
        shown = true;
        fadeFrame = window.requestAnimationFrame(() => { fadeFrame = window.requestAnimationFrame(() => canvas.classList.add('is-visible')); });
      }
      if (expensive >= 8) { stopped = true; cancel(); return; }
      requestFrame();
    } catch { dispose(); }
  }
  function sync() { if (paused()) cancel(); else requestFrame(); }
  function onResize() { needsResize = true; sync(); }
  function focusChanged() { window.setTimeout(sync,0); }
  function onHide() { suspended = true; cancel(); }
  function onShow() { suspended = false; needsResize = true; sync(); }
  const observer = new MutationObserver(sync), main = document.querySelector('#main');
  if (main) observer.observe(main,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled','data-processing']});
  observer.observe(document.documentElement,{attributes:true,attributeFilter:['class']});
  document.addEventListener('visibilitychange',sync); document.addEventListener('focusin',sync); document.addEventListener('focusout',focusChanged);
  window.addEventListener('resize',onResize,{passive:true}); window.addEventListener('pagehide',onHide); window.addEventListener('pageshow',onShow);
  if (motion.addEventListener) motion.addEventListener('change',sync); else if (motion.addListener) motion.addListener(sync);
  connection?.addEventListener?.('change',sync);
  function dispose() {
    stopped = true; cancel(); window.cancelAnimationFrame(fadeFrame); observer.disconnect();
    document.removeEventListener('visibilitychange',sync); document.removeEventListener('focusin',sync); document.removeEventListener('focusout',focusChanged);
    window.removeEventListener('resize',onResize); window.removeEventListener('pagehide',onHide); window.removeEventListener('pageshow',onShow);
    if (motion.removeEventListener) motion.removeEventListener('change',sync); else if (motion.removeListener) motion.removeListener(sync);
    connection?.removeEventListener?.('change',sync); canvas.remove();
  }
  sync(); return {dispose};
}
