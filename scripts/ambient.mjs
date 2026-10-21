// Small loader compiled into app.js. The renderer is NOT an initial dependency.
export function ambientClientScript() {
  return `
;(() => {
  if (page === 'legal') return;
  let attempted = false, timer = 0, idle = 0, observer;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const isBusy = () => busy || uncertain || document.querySelector('#confirm-unsend')?.disabled === true || document.querySelector('#check-status')?.disabled === true || document.querySelector('#photo-frame')?.dataset.processing === 'true' || document.documentElement.classList.contains('legal-open');
  const isEditing = () => /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
  const allowed = () => !motion.matches && navigator.onLine !== false && !connection?.saveData && !/^(slow-)?2g$/.test(connection?.effectiveType || '');
  function clearSchedule() {
    clearTimeout(timer);
    if (idle && typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idle);
    timer = idle = 0;
  }
  function cleanup() {
    clearSchedule();
    document.removeEventListener('visibilitychange', schedule);
    document.removeEventListener('focusout', schedule);
    window.removeEventListener('online', schedule);
    observer?.disconnect();
  }
  function load() {
    if (attempted || !allowed() || document.hidden || isBusy() || isEditing()) return;
    attempted = true;
    cleanup();
    // Optional: a failed request or unsupported canvas must never affect the form.
    import('./ambient.js').then(module => module.startAmbient({ isBusy })).catch(() => {});
  }
  function schedule() {
    clearSchedule();
    if (attempted || !allowed() || document.hidden || isBusy() || isEditing()) return;
    // Run after the usable form + window.load, then a quiet gap, then idle time.
    timer = window.setTimeout(() => {
      timer = 0;
      if (typeof window.requestIdleCallback === 'function') idle = window.requestIdleCallback(load);
      else timer = window.setTimeout(load, 300); // Older Safari: no idle API required.
    }, 1200);
  }
  function ready() {
    if (!allowed() || (page !== 'home' && !config?.ready)) return;
    document.addEventListener('visibilitychange', schedule);
    document.addEventListener('focusout', schedule);
    window.addEventListener('online', schedule);
    observer = new MutationObserver(schedule);
    observer.observe(main, { subtree:true, childList:true, attributes:true, attributeFilter:['disabled','data-processing'] });
    schedule();
  }
  nyxBootReady.then(() => {
    if (document.readyState === 'complete') ready();
    else window.addEventListener('load', ready, { once:true });
  }).catch(() => {});
})();
`;
}
export const AMBIENT_CSS = `
/* Decoration never intercepts input or changes document dimensions. */
.nyx-ambient{position:fixed;inset:0;display:block;width:100%;height:100%;z-index:0;pointer-events:none;opacity:0;transition:opacity 1.8s ease}
.nyx-ambient.is-visible{opacity:1}.shell{position:relative;z-index:1;background:linear-gradient(90deg,#050505e0,#0505059c 45%,#050505d9)}
@media(prefers-reduced-motion:reduce){.nyx-ambient{display:none;transition:none}}
`;
