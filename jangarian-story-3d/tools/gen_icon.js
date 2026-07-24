/* apple-touch-icon.png をつくる小さなツール (Node.js だけで動く)
   つかいかた: node tools/gen_icon.js */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 180;
const px = new Uint8Array(SIZE * SIZE * 4);

function put(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  const na = a / 255;
  px[i] = Math.round(r * na + px[i] * (1 - na));
  px[i + 1] = Math.round(g * na + px[i + 1] * (1 - na));
  px[i + 2] = Math.round(b * na + px[i + 2] * (1 - na));
  px[i + 3] = Math.max(px[i + 3], a);
}

function circle(cx, cy, rad, r, g, b, sx = 1, sy = 1) {
  const rx = rad * sx, ry = rad * sy;
  for (let y = Math.floor(cy - ry) - 1; y <= cy + ry + 1; y++) {
    for (let x = Math.floor(cx - rx) - 1; x <= cx + rx + 1; x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= 1) put(x, y, r, g, b, 255);
      else if (d <= 1.06) put(x, y, r, g, b, Math.round(255 * (1 - (d - 1) / 0.06)));
    }
  }
}

// はいけい (そらいろ、角丸はOS側で処理される)
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const t = y / SIZE;
    put(x, y, Math.round(159 + t * 40), Math.round(217 + t * 20), 255, 255);
  }
}
// くさ
for (let y = 150; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) put(x, y, 126, 203, 98, 255);
}
// みみ
circle(52, 52, 22, 143, 127, 112);
circle(128, 52, 22, 143, 127, 112);
circle(52, 55, 11, 240, 184, 192);
circle(128, 55, 11, 240, 184, 192);
// かお
circle(90, 95, 62, 185, 168, 154, 1, 0.95);
// ほっぺ・くちまわり
circle(64, 118, 22, 247, 242, 233);
circle(116, 118, 22, 247, 242, 233);
circle(90, 122, 24, 247, 242, 233, 1, 0.8);
// め
circle(64, 86, 9, 36, 26, 20);
circle(116, 86, 9, 36, 26, 20);
circle(67, 83, 3, 255, 255, 255);
circle(119, 83, 3, 255, 255, 255);
// ほっぺのぴんく
circle(46, 108, 9, 255, 168, 184);
circle(134, 108, 9, 255, 168, 184);
// はな
circle(90, 106, 6, 229, 138, 154);
// ひまわりのたね (くちもと)
circle(90, 130, 8, 90, 70, 50, 0.7, 1.1);

// ---- PNG 書きだし ----
function crc32(buf) {
  let c, table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  c = ~0;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ table[(c ^ buf[i]) & 0xff];
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;   // bit depth
ihdr[9] = 6;   // RGBA
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0;
  Buffer.from(px.buffer, y * SIZE * 4, SIZE * 4).copy(raw, y * (SIZE * 4 + 1) + 1);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
]);

const out = path.join(__dirname, '..', 'assets', 'apple-touch-icon.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log('wrote', out, png.length, 'bytes');
