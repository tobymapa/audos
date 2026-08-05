/**
 * Ethaion fabric education layer — inline, footnote-style micro-notes.
 *
 * When Beau (or any surface) mentions a fabric type, the term renders with a
 * dotted underline and a small tap/hover note explaining what it is, why
 * it's used, and when it's appropriate. Concise by design — a footnote, not
 * a lecture.
 *
 * `annotateFabrics` walks React children (as produced by react-markdown)
 * and wraps the first few fabric mentions per block in a <FabricTip>.
 */
import { useEffect, useRef, useState } from 'react';

export interface FabricNote {
  /** Matches the term in running text (case-insensitive, word-boundaried). */
  pattern: RegExp;
  /** 2–3 short lines: what it is · why it's used · when it's appropriate. */
  note: string;
}

export const FABRIC_NOTES: FabricNote[] = [
  { pattern: /\bcotton oxford\b|\boxford cloth\b|\boxford weave\b/i, note: 'A woven basket-weave cotton that holds its shape. More structured and formal than jersey — the classic smart-casual shirt fabric.' },
  { pattern: /\bcotton jersey\b|\bjersey knit\b/i, note: 'A knitted (not woven) cotton — soft and stretchy, so it drapes casually. This is what most T-shirts are made from.' },
  { pattern: /\bmerino( wool)?\b/i, note: 'Fine-gauge wool that regulates temperature and resists odour, with far less itch than regular wool. Ideal for knits worn next to skin, year-round.' },
  { pattern: /\blinen\b/i, note: 'Woven flax fibre — breathable and fast-drying, so it excels in heat. Creases naturally; that lived-in look is part of its character.' },
  { pattern: /\blambswool\b/i, note: 'Soft first-shearing wool — warm, light and less coarse than standard wool. The everyday winter jumper fabric.' },
  { pattern: /\bshetland( wool)?\b/i, note: 'Springy, textured wool from Shetland sheep. Hard-wearing and warm with a rustic surface — right for casual and country knits.' },
  { pattern: /\bcashmere\b/i, note: 'Ultra-fine goat undercoat — exceptionally soft and warm for its weight. A luxury knit fabric; needs gentler care than sheep’s wool.' },
  { pattern: /\bflannel\b/i, note: 'A softly brushed weave (cotton or wool) that traps warmth without bulk. Cotton flannel for casual shirts; wool flannel for smart winter trousers.' },
  { pattern: /\bpoplin\b/i, note: 'A smooth, tightly woven shirting cotton with a crisp, light hand. Dressier than oxford — the business-shirt standard.' },
  { pattern: /\btwill\b/i, note: 'A diagonal weave that drapes well and resists creasing. Durable and forgiving — chinos and workwear live here.' },
  { pattern: /\bselvedge( denim)?\b/i, note: 'Denim woven on narrow shuttle looms with a finished self-edge. Denser and longer-lived than mass-market denim; fades to your wear pattern.' },
  { pattern: /\bwaxed cotton\b/i, note: 'Cotton impregnated with wax for wind and rain resistance. Never machine wash — it can be re-waxed for decades. The field-jacket classic.' },
  { pattern: /\bgabardine\b/i, note: 'A tight, weather-resistant twill originally developed for outerwear. Smart and hard-wearing — trench coats and dress trousers.' },
  { pattern: /\bcorduroy\b/i, note: 'Cotton woven with velvety ribs (wales). Warm, textured and casual — an autumn/winter trouser and jacket fabric.' },
  { pattern: /\bmoleskin\b/i, note: 'A dense, brushed cotton with a suede-like surface. Warm, quiet and tough — the country-trouser alternative to corduroy.' },
  { pattern: /\bseersucker\b/i, note: 'A puckered summer cotton that holds itself off the skin for airflow. At its best in hot weather; inherently casual-smart.' },
  { pattern: /\bhopsack\b/i, note: 'An airy basket-weave wool — breathable with a slight texture that hides wrinkles. The unstructured-blazer standard.' },
  { pattern: /\btweed\b/i, note: 'A coarse, dense woollen weave built for the outdoors. Warm, weatherproof and textured — country jackets and winter tailoring.' },
  { pattern: /\bworsted( wool)?\b/i, note: 'Smooth, tightly spun wool that wears cleanly and holds a crease. The suiting standard — sharper and less fuzzy than woollens.' },
  { pattern: /\bpiqu[eé]\b/i, note: 'A breathable cotton knit with a raised waffle texture — the polo-shirt fabric. Slightly dressier than jersey.' },
  { pattern: /\bloopwheel(ed)?\b|\bloopback\b/i, note: 'Cotton knitted slowly on vintage machines (or with soft inner loops). Dense yet soft — the mark of a serious sweatshirt.' },
  { pattern: /\bventile\b/i, note: 'Densely woven cotton that swells when wet to block wind and rain — weatherproofing without synthetics.' },
  { pattern: /\bherringbone\b/i, note: 'A V-patterned twill weave. Adds quiet texture to jackets and coats — reads formal at a distance, detailed up close.' },
  { pattern: /\bsuede\b/i, note: 'Leather with the flesh side out — soft, matte and casual-leaning. Needs a brush and protector spray, not polish.' },
  { pattern: /\bshell cordovan\b/i, note: 'Dense horsehide leather that ripples rather than creases. Extremely long-lived — the investment shoe leather.' },
  { pattern: /\bgrenadine\b/i, note: 'An open, textured silk weave used for understated ties — more depth than a flat silk, quieter than a pattern.' },
];

/** First matching note for a material string, or null. */
export function fabricNoteFor(text: string): FabricNote | null {
  for (const note of FABRIC_NOTES) {
    if (note.pattern.test(text)) return note;
  }
  return null;
}

/**
 * Inline fabric footnote: dotted-underlined term; tap (or hover) opens a
 * small explanatory note. Tap-toggle makes it work on touch screens.
 */
export function FabricTip({ term, note }: { term: string; note: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [open]);

  return (
    <span ref={ref} className="relative inline group">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="inline bg-transparent border-0 p-0 m-0 font-inherit text-inherit cursor-help underline decoration-dotted decoration-[var(--space-text-muted)] underline-offset-2"
        aria-expanded={open}
        aria-label={term + ' — fabric note'}
      >
        {term}
      </button>
      <span
        className={
          'pointer-events-none absolute left-1/2 bottom-full z-40 mb-1.5 w-60 -translate-x-1/2 rounded-xl border border-[var(--space-border-default)] bg-[var(--space-surface-card)] px-3 py-2 text-left text-[11px] font-normal leading-relaxed text-[var(--space-text-secondary)] shadow-lg ' +
          (open ? 'block' : 'hidden group-hover:block')
        }
        role="note"
      >
        {note}
      </span>
    </span>
  );
}

const MAX_TIPS_PER_BLOCK = 4;

function annotateString(text: string, budget: { left: number }): React.ReactNode {
  if (budget.left <= 0 || !text) return text;
  const parts: React.ReactNode[] = [];
  let rest = text;
  let key = 0;
  while (rest && budget.left > 0) {
    let best: { index: number; match: string; note: string } | null = null;
    for (const fabric of FABRIC_NOTES) {
      const re = new RegExp(fabric.pattern.source, 'i');
      const m = re.exec(rest);
      if (m && (best == null || m.index < best.index)) {
        best = { index: m.index, match: m[0], note: fabric.note };
      }
    }
    if (!best) break;
    if (best.index > 0) parts.push(rest.slice(0, best.index));
    parts.push(<FabricTip key={'fab-' + key} term={best.match} note={best.note} />);
    key += 1;
    budget.left -= 1;
    rest = rest.slice(best.index + best.match.length);
  }
  if (parts.length === 0) return text;
  if (rest) parts.push(rest);
  return parts;
}

/**
 * Walk react-markdown children and wrap fabric terms in FabricTips. Only
 * plain strings are touched — links, code and nested elements pass through
 * untouched. At most a handful of tips per block, so dense fabric talk
 * doesn't become visual noise.
 */
export function annotateFabrics(children: React.ReactNode): React.ReactNode {
  const budget = { left: MAX_TIPS_PER_BLOCK };
  const walk = (node: React.ReactNode): React.ReactNode => {
    if (typeof node === 'string') return annotateString(node, budget);
    if (Array.isArray(node)) return node.map((child, i) => <span key={'seg-' + i} className="contents">{walk(child)}</span>);
    return node;
  };
  return walk(children);
}
