import { deflateSync, inflateSync } from 'node:zlib';

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Uint8Array) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** Minimaler PNG-Encoder (RGB) für Werkzeuge, ohne Abhängigkeiten. */
export function encodePng(width: number, height: number, rgb: Uint8Array): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    Buffer.from(rgb.buffer, rgb.byteOffset + y * width * 3, width * 3).copy(raw, y * (width * 3 + 1) + 1);
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Minimaler PNG-Decoder (8 bit, Palette auch 1–4 bit, ohne Interlacing) für Werkzeuge → RGBA. */
export function decodePng(buf: Buffer): { width: number; height: number; data: Uint8ClampedArray } {
  let p = 8;
  let width = 0, height = 0, type = 0, depth = 8;
  let plte = Buffer.alloc(0), trns = Buffer.alloc(0);
  const idat: Buffer[] = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const t = buf.toString('ascii', p + 4, p + 8);
    const d = buf.subarray(p + 8, p + 8 + len);
    if (t === 'IHDR') {
      width = d.readUInt32BE(0);
      height = d.readUInt32BE(4);
      depth = d[8];
      type = d[9];
      if (d[12] !== 0 || (depth !== 8 && type !== 3)) throw new Error('PNG: nur 8 bit (Palette auch 1–4 bit) ohne Interlacing');
    } else if (t === 'PLTE') plte = d;
    else if (t === 'tRNS') trns = d;
    else if (t === 'IDAT') idat.push(d);
    p += 12 + len;
  }
  const bpp = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type]!;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = Math.ceil((width * bpp * depth) / 8);
  const px = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x];
      const a = x >= bpp ? px[y * stride + x - bpp] : 0;
      const b = y ? px[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f];
      px[y * stride + x] = (v + pred) & 255;
    }
  }
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * bpp;
    if (type === 3) {
      const y = Math.floor(i / width), bit = (i % width) * depth;
      const k = (px[y * stride + (bit >> 3)] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
      data.set([plte[k * 3], plte[k * 3 + 1], plte[k * 3 + 2], k < trns.length ? trns[k] : 255], i * 4);
    } else if (type === 6) data.set(px.subarray(s, s + 4), i * 4);
    else if (type === 2) data.set([px[s], px[s + 1], px[s + 2], 255], i * 4);
    else if (type === 4) data.set([px[s], px[s], px[s], px[s + 1]], i * 4);
    else data.set([px[s], px[s], px[s], 255], i * 4);
  }
  return { width, height, data };
}
