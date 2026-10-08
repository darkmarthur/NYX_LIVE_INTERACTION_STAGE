// Se procesa en el dispositivo: no se sube el original ni su nombre/EXIF.
function loadImage(file) {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Este navegador no puede abrir la imagen. Exporta la foto como JPEG o PNG y vuelve a seleccionarla.')); };
    image.src = url;
  });
}
const asBlob = (canvas, quality) => new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('No pudimos preparar la foto. Prueba con otra imagen.')), 'image/jpeg', quality));
const asBase64 = blob => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1]);
  reader.onerror = () => reject(new Error('No pudimos leer la imagen.'));
  reader.readAsDataURL(blob);
});
export async function preparePhoto(file, limits) {
  if (!file || file.size === 0 || file.size > limits.maxOriginalBytes) throw new Error('Selecciona una foto de hasta 20 MB.');
  if (!/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name) || (file.type && !/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type))) throw new Error('Usa JPEG, PNG, WebP o una foto HEIC compatible con tu navegador. No se admiten GIF ni SVG.');
  const image = await loadImage(file);
  if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 80000000) throw new Error('La foto es demasiado grande para procesarla aquí. Exporta una versión más pequeña.');
  const scale = Math.min(1, limits.maxPhotoSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Tu navegador no pudo preparar la imagen.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  let blob;
  for (const quality of [0.86, 0.76, 0.64, 0.5, 0.38]) {
    blob = await asBlob(canvas, quality);
    if (blob.size <= limits.maxPhotoBytes) break;
  }
  if (blob.size > limits.maxPhotoBytes) throw new Error('La imagen sigue siendo demasiado pesada. Elige una versión más pequeña.');
  const base64 = await asBase64(blob);
  const result = { base64, previewUrl: URL.createObjectURL(blob), bytes: blob.size, width: canvas.width, height: canvas.height };
  canvas.width = canvas.height = 1;
  image.src = '';
  return result;
}
