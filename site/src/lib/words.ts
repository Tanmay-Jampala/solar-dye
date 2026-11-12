// Counts written as words ("eleven descriptors", "nine molecules") are numbers too, so they are
// computed from results.json like every other number: the length of the array (or the number of
// keys of the object) at a key, optionally only the items whose field equals a value.
// Used by <Count> for page text and directly for attributes (meta descriptions, alt text).
import { get } from './data';

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

/** "group=push-pull": count only items whose `group` is `push-pull`. */
export function countOf(key: string, where?: string): number {
  const v = get(key);
  let items: unknown[] = Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : [];
  if (!Array.isArray(v) && (!v || typeof v !== 'object')) throw new Error(`countOf: "${key}" is not an array or object`);
  if (where) {
    const [field, value] = where.split('=');
    items = items.filter((it) => it && typeof it === 'object' && String((it as Record<string, unknown>)[field]) === value);
  }
  return items.length;
}

export function word(n: number, cap = false): string {
  if (!Number.isInteger(n) || n < 0 || n >= WORDS.length) throw new Error(`word: ${n} has no word form; show it as a number`);
  const w = WORDS[n];
  return cap ? w[0].toUpperCase() + w.slice(1) : w;
}

/** The count at a key, as a word. */
export function countWord(key: string, opts: { where?: string; cap?: boolean } = {}): string {
  return word(countOf(key, opts.where), opts.cap);
}
