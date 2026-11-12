// Bake the image-based lighting once, so browsers never run three.js's PMREM blur shaders (their
// cold compile alone blocked the main thread for ~0.7 s on Windows/D3D11 in Lighthouse runs).
//
// What it does: in headless Chromium, three.js (the pinned site version) renders RoomEnvironment
// through PMREMGenerator.fromScene(scene, 0.04) — exactly what the hero did at runtime — reads the
// resulting CubeUV render target back, encodes it as RGBE (shared-exponent HDR, 4 bytes per texel)
// and writes it gzipped to public/data/env-room.rgbe.gz with a 12-byte header:
//   "RGBE" | uint16 width | uint16 height | uint32 cube size   (little-endian)
// src/scripts/webgl/env.ts loads it as a CubeUVReflectionMapping DataTexture.
// Re-run only when the three.js version or the environment changes:
//   ./node.sh node scripts/bake-env.mjs [cubeSize=256]
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const three = path.join(site, 'node_modules', 'three');
const size = Number(process.argv[2] || 256);
const ORIGIN = 'http://bake.local';

const browser = await chromium.launch({ args: process.platform === 'win32' ? ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu'] : [] });
const page = await browser.newPage();
await page.route(`${ORIGIN}/**`, (route) => {
  const p = new URL(route.request().url()).pathname;
  if (p === '/') {
    return route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><script type="importmap">{"imports":{"three":"/three/build/three.module.js"}}</script><body></body>`,
    });
  }
  const file = path.join(three, p.replace(/^\/three\//, ''));
  if (!file.startsWith(three) || !fs.existsSync(file)) return route.fulfill({ status: 404 });
  return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(file) });
});
await page.goto(`${ORIGIN}/`);
const result = await page.evaluate(async (cubeSize) => {
  const THREE = await import('three');
  const { RoomEnvironment } = await import('/three/examples/jsm/environments/RoomEnvironment.js');
  const renderer = new THREE.WebGLRenderer();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(new RoomEnvironment(), 0.04, 0.1, 100, { size: cubeSize });
  const { width, height } = rt;
  const buf = new Uint16Array(width * height * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, width, height, buf);
  return { width, height, version: THREE.REVISION, data: Array.from(buf) };
}, size);
await browser.close();

// Half floats -> RGBE.
const half = (h) => {
  const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff;
  if (e === 0) return s * 2 ** -14 * (f / 1024);
  if (e === 31) return f ? NaN : s * Infinity;
  return s * 2 ** (e - 15) * (1 + f / 1024);
};
const { width, height } = result;
const out = Buffer.alloc(12 + width * height * 4);
out.write('RGBE', 0, 'ascii');
out.writeUInt16LE(width, 4);
out.writeUInt16LE(height, 6);
out.writeUInt32LE(size, 8);
let maxV = 0;
for (let i = 0; i < width * height; i++) {
  const r = Math.max(0, half(result.data[i * 4])), g = Math.max(0, half(result.data[i * 4 + 1])), b = Math.max(0, half(result.data[i * 4 + 2]));
  const v = Math.max(r, g, b);
  maxV = Math.max(maxV, v);
  const o = 12 + i * 4;
  if (v < 1e-32) continue; // zeros
  const e = Math.ceil(Math.log2(v));
  const scale = 256 / 2 ** e;
  out[o] = Math.min(255, Math.floor(r * scale));
  out[o + 1] = Math.min(255, Math.floor(g * scale));
  out[o + 2] = Math.min(255, Math.floor(b * scale));
  out[o + 3] = e + 128;
}
const gz = zlib.gzipSync(out, { level: 9 });
const dest = path.join(site, 'public', 'data', 'env-room.rgbe.gz');
fs.writeFileSync(dest, gz);
console.log(`bake-env: three r${result.version}, cube ${size}, ${width}x${height}, max ${maxV.toFixed(2)}, ${(out.length / 1024).toFixed(0)} KB raw, ${(gz.length / 1024).toFixed(0)} KB gzipped -> public/data/env-room.rgbe.gz`);
