// Image-based lighting for every scene: the pre-filtered RoomEnvironment baked by
// scripts/bake-env.mjs (public/data/env-room.rgbe.gz). Loading it as a CubeUV texture means three.js
// never runs its PMREM blur shaders in the browser, whose cold compile was the single longest
// main-thread task on the home page. One texture object serves every renderer on the page.
import * as THREE from 'three';
import { yieldToMain } from './yield';

let cache: Promise<THREE.DataTexture> | null = null;

export function roomEnvironment(): Promise<THREE.DataTexture> {
  return (cache ??= load());
}

async function load(): Promise<THREE.DataTexture> {
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
  const res = await fetch(`${base}data/env-room.rgbe.gz`);
  if (!res.ok) throw new Error(`environment: ${res.status}`);
  let bytes = new Uint8Array(await res.arrayBuffer());
  // Some servers send .gz files with Content-Encoding: gzip, and the browser has already inflated it.
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const inflated = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    bytes = new Uint8Array(await new Response(inflated).arrayBuffer());
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (String.fromCharCode(...bytes.subarray(0, 4)) !== 'RGBE') throw new Error('environment: bad header');
  const width = view.getUint16(4, true), height = view.getUint16(6, true);

  // RGBE -> half floats, a slice of rows at a time.
  const data = new Uint16Array(width * height * 4);
  const one = THREE.DataUtils.toHalfFloat(1);
  const scale = new Float32Array(256);
  for (let e = 0; e < 256; e++) scale[e] = 2 ** (e - 128) / 256;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x, o = 12 + i * 4, s = scale[bytes[o + 3]];
      const zero = bytes[o + 3] === 0;
      data[i * 4] = zero ? 0 : THREE.DataUtils.toHalfFloat(bytes[o] * s);
      data[i * 4 + 1] = zero ? 0 : THREE.DataUtils.toHalfFloat(bytes[o + 1] * s);
      data[i * 4 + 2] = zero ? 0 : THREE.DataUtils.toHalfFloat(bytes[o + 2] * s);
      data[i * 4 + 3] = one;
    }
    if (y % 128 === 127) await yieldToMain();
  }

  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.mapping = THREE.CubeUVReflectionMapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
