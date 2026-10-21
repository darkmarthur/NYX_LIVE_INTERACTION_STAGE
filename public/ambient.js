// NYX: optional, non-interactive 2D waves. No images, libraries, WebGL or network.
export function startAmbient({ isBusy = () => false } = {}) {
  if (document.querySelector('.nyx-ambient')) return;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const lowData = () => Boolean(connection?.saveData || /^(slow-)?2g$/.test(connection?.effectiveType || ''));
  if (motion.matches || lowData()) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'nyx-ambient';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.setAttribute('role', 'presentation');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  document.body.prepend(canvas);

  let width = 1, height = 1, ratio = 1, timer = 0, raf = 0, fadeFrame = 0;
  let stopped = false, suspended = false, needsResize = true, shown = false;
  let time = 0, previous = 0, expensive = 0;
  const dots = Array.from({ length:20 }, (_, i) => ({
    x: ((i * 0.61803398875) % 1), y: ((i * 0.41421356237 + 0.13) % 1),
    size: i % 4 === 0 ? 1.8 : 0.85, phase: i * 1.7
  }));
  const editing = () => /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
  const paused = () => stopped || suspended || document.hidden || motion.matches || lowData() || isBusy() || editing();

  function resize() {
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);
    // At most ~480k physical pixels, including high-DPI and desktop screens.
    ratio = Math.min(window.devicePixelRatio || 1, 1.25, Math.sqrt(480000 / (width * height)));
    canvas.width = Math.max(1, Math.floor(width * ratio));
    canvas.height = Math.max(1, Math.floor(height * ratio));
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    needsResize = false;
  }
  function waveY(x, band, strand) {
    const u = x / width;
    const envelope = Math.sin(Math.PI * u);
    return height * (0.20 + band * 0.28) +
      Math.sin(u * 5.8 + time * 0.19 + band * 1.5) * height * 0.12 * envelope +
      Math.sin(u * 10.5 - time * 0.13 + band) * height * 0.035 +
      (strand - 1) * (12 + 7 * Math.sin(u * 4 + time * 0.1));
  }
  function draw() {
    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 0.8;
    for (let band = 0; band < 3; band++) {
      for (let strand = 0; strand < 3; strand++) {
        ctx.strokeStyle = band === 1 ? 'rgba(255,112,210,0.13)' : 'rgba(0,255,204,0.22)';
        ctx.beginPath();
        for (let j = 0; j <= 52; j++) {
          const x = width * j / 52, y = waveY(x, band, strand);
          if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
    for (const dot of dots) {
      const x = (dot.x * width + Math.sin(time * 0.1 + dot.phase) * 18 + width) % width;
      const y = (dot.y * height + Math.cos(time * 0.08 + dot.phase) * 24 + height) % height;
      ctx.fillStyle = dot.size > 1 ? 'rgba(0,255,204,0.38)' : 'rgba(170,230,226,0.27)';
      ctx.beginPath(); ctx.arc(x, y, dot.size, 0, Math.PI * 2); ctx.fill();
    }
  }
  function cancel() {
    clearTimeout(timer); window.cancelAnimationFrame(raf);
    timer = raf = 0; previous = 0;
  }
  function requestFrame() {
    if (timer || raf || paused()) return;
    timer = window.setTimeout(() => {
      timer = 0;
      if (!paused()) raf = window.requestAnimationFrame(frame);
    }, 1000 / 18); // Avoid a 60/120-Hz no-op loop on high-refresh phones.
  }
  function frame(now) {
    raf = 0;
    if (paused()) { cancel(); return; }
    try {
      if (needsResize) resize();
      if (previous) time += Math.min(100, now - previous) / 1000;
      previous = now;
      const before = performance.now();
      draw();
      expensive = performance.now() - before > 9 ? expensive + 1 : Math.max(0, expensive - 1);
      if (!shown) {
        shown = true;
        // Commit opacity:0 before enabling the CSS fade, including Safari.
        fadeFrame = window.requestAnimationFrame(() => {
          fadeFrame = window.requestAnimationFrame(() => canvas.classList.add('is-visible'));
        });
      }
      if (expensive >= 8) { stopped = true; cancel(); return; } // Keep a still frame on slow devices.
      requestFrame();
    } catch { dispose(); } // Rendering errors cannot disable the application.
  }
  function sync() { if (paused()) cancel(); else requestFrame(); }
  function focusChanged() { window.setTimeout(sync, 0); }
  function onResize() { needsResize = true; sync(); }
  function onHide() { suspended = true; cancel(); }
  function onShow() { suspended = false; needsResize = true; sync(); }
  const observer = new MutationObserver(sync);
  const main = document.querySelector('#main');
  if (main) observer.observe(main, { subtree:true, childList:true, attributes:true, attributeFilter:['disabled','data-processing'] });
  observer.observe(document.documentElement, { attributes:true, attributeFilter:['class'] });
  document.addEventListener('visibilitychange', sync);
  document.addEventListener('focusin', sync);
  document.addEventListener('focusout', focusChanged);
  window.addEventListener('resize', onResize, { passive:true });
  window.addEventListener('pagehide', onHide);
  window.addEventListener('pageshow', onShow);
  if (motion.addEventListener) motion.addEventListener('change', sync);
  else if (motion.addListener) motion.addListener(sync);
  connection?.addEventListener?.('change', sync);
  function dispose() {
    stopped = true; cancel(); window.cancelAnimationFrame(fadeFrame);
    observer.disconnect();
    document.removeEventListener('visibilitychange', sync);
    document.removeEventListener('focusin', sync);
    document.removeEventListener('focusout', focusChanged);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pagehide', onHide);
    window.removeEventListener('pageshow', onShow);
    if (motion.removeEventListener) motion.removeEventListener('change', sync);
    else if (motion.removeListener) motion.removeListener(sync);
    connection?.removeEventListener?.('change', sync);
    canvas.remove();
  }
  sync();
  return { dispose };
}
