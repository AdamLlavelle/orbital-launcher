// Generates build/icon.ico (and icon.png) — the Orbital Launcher app icon.
// Pure Node: draws at 4x supersampling, encodes PNG by hand, wraps it in ICO.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 256;
const SS = 4; // supersample factor
const BIG = SIZE * SS;

// colors
const BG = [11, 14, 20, 255];        // #0b0e14 rounded square
const PLANET_TOP = [95, 152, 255, 255];   // lighter blue
const PLANET_BOT = [61, 123, 240, 255];   // deeper blue
const RING = [232, 236, 244, 235];   // near-white ring
const MOON = [232, 236, 244, 255];

const px = new Float64Array(BIG * BIG * 4); // accumulate straight RGBA

function put(x, y, c) {
  const i = (y * BIG + x) * 4;
  const a = c[3] / 255;
  px[i] = c[0] * a + px[i] * (1 - a);
  px[i + 1] = c[1] * a + px[i + 1] * (1 - a);
  px[i + 2] = c[2] * a + px[i + 2] * (1 - a);
  px[i + 3] = Math.min(255, c[3] + px[i + 3] * (1 - a));
}

const cx = BIG / 2;
const cy = BIG / 2;
const cornerR = BIG * 0.22;
const planetR = BIG * 0.235;
const ringRx = BIG * 0.42;
const ringRy = BIG * 0.155;
const ringW = 0.075; // normalized ring half-width
const rot = (-24 * Math.PI) / 180;
const cosR = Math.cos(rot);
const sinR = Math.sin(rot);

function inRoundedSquare(x, y) {
  const m = BIG * 0.04; // margin
  const min = m;
  const max = BIG - m;
  if (x < min || x > max || y < min || y > max) return false;
  const rx = Math.max(0, Math.max(min + cornerR - x, x - (max - cornerR)));
  const ry = Math.max(0, Math.max(min + cornerR - y, y - (max - cornerR)));
  return rx * rx + ry * ry <= cornerR * cornerR;
}

function ringDist(x, y) {
  // rotate into ellipse space; returns [normalized radial distance, rotated y]
  const dx = x - cx;
  const dy = y - cy;
  const xr = dx * cosR + dy * sinR;
  const yr = -dx * sinR + dy * cosR;
  const d = Math.sqrt((xr / ringRx) ** 2 + (yr / ringRy) ** 2);
  return [d, yr];
}

for (let y = 0; y < BIG; y++) {
  for (let x = 0; x < BIG; x++) {
    if (!inRoundedSquare(x, y)) continue;
    put(x, y, BG);

    const dx = x - cx;
    const dy = y - cy;
    const inPlanet = dx * dx + dy * dy <= planetR * planetR;
    const [rd, yr] = ringDist(x, y);
    const onRing = Math.abs(rd - 1) < ringW;

    if (onRing && yr <= 0) put(x, y, RING);         // ring behind planet (top)
    if (inPlanet) {
      const t = (dy + planetR) / (2 * planetR);     // vertical gradient
      put(x, y, [
        PLANET_TOP[0] + (PLANET_BOT[0] - PLANET_TOP[0]) * t,
        PLANET_TOP[1] + (PLANET_BOT[1] - PLANET_TOP[1]) * t,
        PLANET_TOP[2] + (PLANET_BOT[2] - PLANET_TOP[2]) * t,
        255
      ]);
    }
    if (onRing && yr > 0) put(x, y, RING);          // ring in front (bottom)
  }
}

// moon dot on the upper-right of the ring
const moonAngle = 0.32; // parametric position on the ellipse
const mx = cx + ringRx * Math.cos(moonAngle) * cosR - ringRy * Math.sin(moonAngle) * sinR;
const my = cy + ringRx * Math.cos(moonAngle) * sinR + ringRy * Math.sin(moonAngle) * cosR - BIG * 0.19;
const moonR = BIG * 0.035;
for (let y = Math.floor(my - moonR); y <= my + moonR; y++) {
  for (let x = Math.floor(mx - moonR); x <= mx + moonR; x++) {
    if (x < 0 || y < 0 || x >= BIG || y >= BIG) continue;
    if ((x - mx) ** 2 + (y - my) ** 2 <= moonR * moonR && inRoundedSquare(x, y)) put(x, y, MOON);
  }
}

// downsample to 256 with box filter
const out = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const i = ((y * SS + sy) * BIG + x * SS + sx) * 4;
        r += px[i]; g += px[i + 1]; b += px[i + 2]; a += px[i + 3];
      }
    }
    const n = SS * SS;
    const o = (y * SIZE + x) * 4;
    out[o] = Math.round(r / n);
    out[o + 1] = Math.round(g / n);
    out[o + 2] = Math.round(b / n);
    out[o + 3] = Math.round(a / n);
  }
}

// ---- PNG encoding ----
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 6;  // RGBA
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0; // no filter
  out.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
]);

// ---- ICO wrapping (single 256px PNG entry) ----
const ico = Buffer.alloc(6 + 16);
ico.writeUInt16LE(0, 0);  // reserved
ico.writeUInt16LE(1, 2);  // type: icon
ico.writeUInt16LE(1, 4);  // count
ico[6] = 0;               // width 256
ico[7] = 0;               // height 256
ico[8] = 0;               // palette
ico[9] = 0;               // reserved
ico.writeUInt16LE(1, 10); // planes
ico.writeUInt16LE(32, 12);// bpp
ico.writeUInt32LE(png.length, 14);
ico.writeUInt32LE(22, 18);// offset

const outDir = path.join(__dirname, '..', 'build');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'icon.png'), png);
fs.writeFileSync(path.join(outDir, 'icon.ico'), Buffer.concat([ico, png]));
console.log('Wrote build/icon.png and build/icon.ico');
