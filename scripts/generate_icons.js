import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createPng(width, height, getPixelColor) {
  // RGBA pixels
  const rowSize = width * 4 + 1; // +1 for filter byte
  const rawData = Buffer.alloc(rowSize * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter type 0 (None)

    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = getPixelColor(x, y, width, height);
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a;
    }
  }

  const compressedData = zlib.deflateSync(rawData);

  // PNG Header
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth 8
  ihdr[9] = 6; // Color type 6 (RGBA)
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace

  const ihdrChunk = createChunk('IHDR', ihdr);
  const idatChunk = createChunk('IDAT', compressedData);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(4 + 4 + len + 4);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4, 4, 'ascii');
  data.copy(buf, 8);
  const crcVal = crc32(buf.subarray(4, 8 + len));
  buf.writeUInt32BE(crcVal >>> 0, 8 + len);
  return buf;
}

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) c = 0xedb88320 ^ (c >>> 1);
    else c = c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return crc ^ 0xffffffff;
}

// CitasPro Logo rendering logic
// Primary Indigo: #4F46E5 (79, 70, 229)
// Accent/Hover: #4338CA (67, 56, 202)
// White: (255, 255, 255)
// Cyan/Teal accent: #38BDF8 (56, 189, 248)

function getAppIconPixel(x, y, w, h, isRound = false) {
  const cx = w / 2;
  const cy = h / 2;
  const rx = x - cx;
  const ry = y - cy;
  const dist = Math.sqrt(rx * rx + ry * ry);

  // Outer boundary / mask
  if (isRound) {
    if (dist > w * 0.48) return [0, 0, 0, 0];
  } else {
    // Squircle / rounded rect
    const r = w * 0.22;
    const absX = Math.abs(rx);
    const absY = Math.abs(ry);
    const cornerX = Math.max(0, absX - (cx - r));
    const cornerY = Math.max(0, absY - (cy - r));
    if (Math.sqrt(cornerX * cornerX + cornerY * cornerY) > r) {
      return [0, 0, 0, 0];
    }
  }

  // Background gradient: #4F46E5 top-left to #3730A3 bottom-right
  const gradFactor = (x / w + y / h) / 2;
  const rBg = Math.round(79 * (1 - gradFactor) + 55 * gradFactor);
  const gBg = Math.round(70 * (1 - gradFactor) + 48 * gradFactor);
  const bBg = Math.round(229 * (1 - gradFactor) + 163 * gradFactor);

  // Inner CitasPro Symbol: Calendar/Clock/Checkmark
  // Scale normalized coordinates (-1 to 1)
  const nx = (x - cx) / (w * 0.38);
  const ny = (y - cy) / (h * 0.38);

  // Calendar Base (rounded box)
  const isCalBox = nx >= -0.7 && nx <= 0.7 && ny >= -0.5 && ny <= 0.7;
  const isCalHeader = nx >= -0.7 && nx <= 0.7 && ny >= -0.7 && ny < -0.5;
  const isCalRing1 = (nx >= -0.45 && nx <= -0.35 && ny >= -0.85 && ny <= -0.55);
  const isCalRing2 = (nx >= 0.35 && nx <= 0.45 && ny >= -0.85 && ny <= -0.55);

  // Checkmark inside calendar
  // Checkmark points: (-0.35, 0.15) -> (-0.1, 0.4) -> (0.45, -0.15)
  let isCheck = false;
  // Line 1: (-0.35, 0.15) to (-0.1, 0.4)
  const d1 = distToSegment(nx, ny, -0.35, 0.15, -0.1, 0.4);
  // Line 2: (-0.1, 0.4) to (0.45, -0.15)
  const d2 = distToSegment(nx, ny, -0.1, 0.4, 0.45, -0.15);
  if (d1 < 0.12 || d2 < 0.12) {
    isCheck = true;
  }

  // Clock arc / Dot in top right
  const clockDist = Math.sqrt((nx - 0.25) * (nx - 0.25) + (ny + 0.2) * (ny + 0.2));
  const isClockDot = clockDist < 0.08;

  if (isRing(nx, ny, -0.4, -0.65, 0.08) || isRing(nx, ny, 0.4, -0.65, 0.08)) {
    return [255, 255, 255, 255];
  }

  if (isCheck) {
    return [56, 189, 248, 255]; // Cyan checkmark #38BDF8
  }

  if (isCalHeader) {
    return [99, 102, 241, 255]; // Lighter header #6366F1
  }

  if (isCalBox) {
    // Semi-white calendar face
    return [255, 255, 255, 255];
  }

  return [rBg, gBg, bBg, 255];
}

function getForegroundIconPixel(x, y, w, h) {
  // Transparent background, centered symbol (safe area 66% width)
  const cx = w / 2;
  const cy = h / 2;

  const nx = (x - cx) / (w * 0.28);
  const ny = (y - cy) / (h * 0.28);

  const isCalBox = nx >= -0.7 && nx <= 0.7 && ny >= -0.5 && ny <= 0.7;
  const isCalHeader = nx >= -0.7 && nx <= 0.7 && ny >= -0.7 && ny < -0.5;

  let isCheck = false;
  const d1 = distToSegment(nx, ny, -0.35, 0.15, -0.1, 0.4);
  const d2 = distToSegment(nx, ny, -0.1, 0.4, 0.45, -0.15);
  if (d1 < 0.13 || d2 < 0.13) {
    isCheck = true;
  }

  if (isRing(nx, ny, -0.4, -0.65, 0.09) || isRing(nx, ny, 0.4, -0.65, 0.09)) {
    return [255, 255, 255, 255];
  }

  if (isCheck) {
    return [79, 70, 229, 255]; // Indigo checkmark inside white cal
  }

  if (isCalHeader) {
    return [99, 102, 241, 255];
  }

  if (isCalBox) {
    return [255, 255, 255, 255];
  }

  return [0, 0, 0, 0];
}

function isRing(x, y, cx, cy, r) {
  const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
  return d <= r;
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
  if (l2 === 0) return Math.sqrt((px - x1) * (px - x1) + (py - y1) * (py - y1));
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * (x2 - x1);
  const projY = y1 + t * (y2 - y1);
  return Math.sqrt((px - projX) * (px - projX) + (py - projY) * (py - projY));
}

const densities = [
  { folder: 'mipmap-mdpi', size: 48, fgSize: 108 },
  { folder: 'mipmap-hdpi', size: 72, fgSize: 162 },
  { folder: 'mipmap-xhdpi', size: 96, fgSize: 216 },
  { folder: 'mipmap-xxhdpi', size: 144, fgSize: 324 },
  { folder: 'mipmap-xxxhdpi', size: 192, fgSize: 432 },
];

const resDir = path.resolve('android/app/src/main/res');

for (const d of densities) {
  const dirPath = path.join(resDir, d.folder);
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });

  // ic_launcher.png
  const launcherBuf = createPng(d.size, d.size, (x, y, w, h) => getAppIconPixel(x, y, w, h, false));
  fs.writeFileSync(path.join(dirPath, 'ic_launcher.png'), launcherBuf);

  // ic_launcher_round.png
  const roundBuf = createPng(d.size, d.size, (x, y, w, h) => getAppIconPixel(x, y, w, h, true));
  fs.writeFileSync(path.join(dirPath, 'ic_launcher_round.png'), roundBuf);

  // ic_launcher_foreground.png
  const fgBuf = createPng(d.fgSize, d.fgSize, (x, y, w, h) => getForegroundIconPixel(x, y, w, h));
  fs.writeFileSync(path.join(dirPath, 'ic_launcher_foreground.png'), fgBuf);
}

// Also splash PNGs for drawable-port and drawable-land folders
const drawableDirs = [
  'drawable', 'drawable-land-hdpi', 'drawable-land-mdpi', 'drawable-land-xhdpi',
  'drawable-land-xxhdpi', 'drawable-land-xxxhdpi', 'drawable-port-hdpi',
  'drawable-port-mdpi', 'drawable-port-xhdpi', 'drawable-port-xxhdpi', 'drawable-port-xxxhdpi'
];

for (const dDir of drawableDirs) {
  const dirPath = path.join(resDir, dDir);
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
  const splashBuf = createPng(280, 280, (x, y, w, h) => getAppIconPixel(x, y, w, h, false));
  fs.writeFileSync(path.join(dirPath, 'splash.png'), splashBuf);
}

console.log('Icons and splashes generated successfully!');
