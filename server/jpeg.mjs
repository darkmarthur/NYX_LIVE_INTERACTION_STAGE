// Valida contenedor y dimensiones; no reemplaza la decodificación ni la moderación.
export function validateJpeg(base64, maxBytes = 1048576, maxSide = 2048) {
  const invalid = () => { throw new Error('INVALID_IMAGE'); };
  if (typeof base64 !== 'string' || base64.length > Math.ceil(maxBytes / 3) * 4 || base64.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) invalid();
  const data = Buffer.from(base64, 'base64');
  if (data.toString('base64') !== base64 || data.length > maxBytes || data.length < 32 || data.readUInt16BE(0) !== 0xffd8 || data.readUInt16BE(data.length - 2) !== 0xffd9) invalid();
  let pos = 2;
  let dimensions;
  while (pos < data.length - 2) {
    if (data[pos++] !== 0xff) invalid();
    while (data[pos] === 0xff) pos++;
    const marker = data[pos++];
    if (marker === 0xda) {
      if (!dimensions) invalid();
      return { bytes: data, ...dimensions };
    }
    if (pos + 2 > data.length || marker === 0xd9 || marker === 0x00) invalid();
    const length = data.readUInt16BE(pos);
    if (length < 2 || pos + length > data.length - 2) invalid();
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (length < 8) invalid();
      const height = data.readUInt16BE(pos + 3);
      const width = data.readUInt16BE(pos + 5);
      if (!height || !width || width > maxSide || height > maxSide) invalid();
      dimensions = { width, height };
    }
    pos += length;
  }
  invalid();
}
