// No dependencies; decoded pixels and compression stay off the UI thread where supported.
self.onmessage = async ({ data:{ file, limits } }) => {
  let image;
  try {
    image = await createImageBitmap(file, { imageOrientation:'from-image' });
    if (!image.width || image.width * image.height > 60000000) throw new Error('DIMENSIONS');
    for (const side of [limits.side,1600,1280,1024,768]) {
      const ratio = Math.min(1,side/Math.max(image.width,image.height));
      const width = Math.max(1,Math.round(image.width*ratio)), height = Math.max(1,Math.round(image.height*ratio));
      const canvas = new OffscreenCanvas(width,height), ctx = canvas.getContext('2d', { alpha:false });
      if (!ctx) throw new Error('DECODE');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,width,height); ctx.drawImage(image,0,0,width,height);
      for (const quality of [.82,.72,.60]) {
        const blob = await canvas.convertToBlob({ type:'image/jpeg',quality });
        if (blob.type === 'image/jpeg' && blob.size <= (quality === .60 ? limits.max : limits.target)) { self.postMessage({ blob,width,height }); return; }
      }
    }
    throw new Error('SIZE');
  } catch (error) { self.postMessage({ error:['SIZE','DIMENSIONS'].includes(error.message) ? error.message : 'DECODE' }); }
  finally { image?.close(); }
};
