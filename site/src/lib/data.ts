// Build-time access to results/results.json (server side only: Astro frontmatter).
// Every number on the site is read through get() and rendered through format().
import fs from 'node:fs';
import path from 'node:path';

const RESULTS_PATH = path.resolve(process.cwd(), '..', 'results', 'results.json');

export const results: any = JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf-8'));

/** Split "a.b[2].c" into ["a", "b", 2, "c"]. Keys may contain spaces and brackets of their own, so
 *  only a trailing [n] on a segment is read as an array index. */
export function parseKey(key: string): (string | number)[] {
  const parts: (string | number)[] = [];
  for (const segment of key.split('.')) {
    const match = segment.match(/^(.*?)((?:\[\d+\])+)$/);
    if (match) {
      if (match[1]) parts.push(match[1]);
      for (const index of match[2].matchAll(/\[(\d+)\]/g)) parts.push(Number(index[1]));
    } else {
      parts.push(segment);
    }
  }
  return parts;
}

/** Value at a key path. Throws (and so fails the build) if the key does not exist. */
export function get(key: string): any {
  let node: any = results;
  for (const part of parseKey(key)) {
    if (node === null || node === undefined || !(part in Object(node))) {
      throw new Error(`results.json has no key "${key}" (stopped at "${part}")`);
    }
    node = node[part as any];
  }
  return node;
}

/** True if the key exists (for optional content). */
export function has(key: string): boolean {
  try {
    get(key);
    return true;
  } catch {
    return false;
  }
}
