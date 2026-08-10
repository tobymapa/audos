/**
 * MONO TYPE — the IBM Plex Mono register the corrected design handoff
 * (screens 20a · 21a · 23a) uses for every small-caps working label: axis
 * captions, legends, field labels, counts and links. The face is loaded
 * once from Google Fonts on first use; the stack falls back to the system
 * mono so nothing shifts if the network is slow.
 *
 * Also holds the tiny copy helpers the same screens call for: the design
 * writes small counts as words ("Eighteen of the sixty-one", "Three
 * logged"), never digits.
 */
import { useEffect } from 'react';

export const MONO = "'IBM Plex Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace";

const LINK_ID = 'ethaion-plex-mono';

export function ensurePlexMono(): void {
  if (typeof document === 'undefined' || document.getElementById(LINK_ID)) return;
  const link = document.createElement('link');
  link.id = LINK_ID;
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&display=swap';
  document.head.appendChild(link);
}

/** Load IBM Plex Mono once — call from any component that sets `MONO`. */
export function usePlexMono(): void {
  useEffect(() => {
    ensurePlexMono();
  }, []);
}

const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** 0–99 as lowercase words ("sixty-one") — the design never counts in digits. */
export function numberWord(n: number): string {
  if (!Number.isFinite(n) || n < 0 || n > 99 || Math.floor(n) !== n) return String(n);
  if (n < 20) return ONES[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return ones ? `${TENS[tens]}-${ONES[ones]}` : TENS[tens];
}

/** "sixty-one" → "Sixty-one" — for a count opening a sentence. */
export function capWord(word: string): string {
  return word ? word[0].toUpperCase() + word.slice(1) : word;
}

/** "LIGHT BLUE OXFORD SHIRT" → "Light blue oxford shirt" — the card title's
 * sentence-case register (23a names read like a sentence, not a label). */
export function sentenceCase(text: string): string {
  const lower = text.trim().toLowerCase();
  return lower ? lower[0].toUpperCase() + lower.slice(1) : lower;
}
