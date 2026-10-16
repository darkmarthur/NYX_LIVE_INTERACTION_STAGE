const TARGET = 256 * 1024, HARD_MAX = 384 * 1024;
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function withWorker(file, limits) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./photo-worker.js', import.meta.url), { type:'module' });
    const timer = setTimeout(() => { worker.terminate(); reject(new Error('WORKER')); }, 45000);
    const done = () => { clearTimeout(timer); worker.terminate(); };
    worker.onmessage = ({ data }) => { done(); data.error ? reject(new Error(data.error)) : resolve(data); };
    worker.onerror = () => { done(); reject(new Error('WORKER')); };
    worker.postMessage({ file, limits });
  });
}
async function fallback(file, limits) {
  const url = URL.createObjectURL(file), image = new Image();
  image.decoding = 'async';
  try {
    await new Promise((resolve,reject) => { image.onload = resolve; image.onerror = () => reject(new Error('DECODE')); image.src = url; });
    if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > 60000000) throw new Error('DIMENSIONS');
    for (const side of [limits.side,1600,1280,1024,768]) {
      const ratio = Math.min(1,side / Math.max(image.naturalWidth,image.naturalHeight));
      const width = Math.max(1,Math.round(image.naturalWidth*ratio)), height = Math.max(1,Math.round(image.naturalHeight*ratio));
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha:false });
      if (!ctx) throw new Error('DECODE');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,width,height);
      await tick(); ctx.drawImage(image,0,0,width,height);
      for (const quality of [.82,.72,.60]) {
        await tick();
        const blob = await new Promise(resolve => canvas.toBlob(resolve,'image/jpeg',quality));
        if (blob?.type === 'image/jpeg' && blob.size <= (quality === .60 ? limits.max : limits.target)) { canvas.width=canvas.height=1; return { blob,width,height }; }
      }
      canvas.width=canvas.height=1;
    }
    throw new Error('SIZE');
  } finally { image.src=''; URL.revokeObjectURL(url); }
}
export async function preparePhoto(file, config) {
  if (!file.size || file.size > config.maxOriginalBytes) throw new Error('Elige una foto de hasta 20 MB.');
  if (!/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name) && !/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type)) throw new Error('Elige una foto JPEG, PNG, WebP o HEIC compatible.');
  const limits = { side:Math.min(config.maxPhotoSide,2048), target:TARGET, max:Math.min(config.maxPhotoBytes,HARD_MAX) };
  let result;
  try {
    if (typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined') {
      try { result = await withWorker(file,limits); } catch (error) { if (['SIZE','DIMENSIONS'].includes(error.message)) throw error; }
    }
    if (!result) result = await fallback(file,limits);
    return { ...result, previewUrl:URL.createObjectURL(result.blob) };
  } catch (error) {
    if (error.message === 'SIZE') throw new Error('No pudimos reducir esta foto. Elige otra imagen.');
    if (error.message === 'DIMENSIONS') throw new Error('La imagen es demasiado grande para procesarla en este dispositivo.');
    throw new Error('Tu navegador no pudo abrirla. Prueba una versión JPEG; HEIC no funciona en todos los teléfonos.');
  }
}
