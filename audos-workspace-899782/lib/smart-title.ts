/**
 * SMART TITLES — a LOCAL, zero-network summariser that turns raw text (a
 * hunt query, a chat's first message) into a short descriptive title, the
 * way Claude / ChatGPT / Gemini name conversations:
 *
 *   "find me navy wool blazers under £400"  →  "Navy wool blazers under £400"
 *   "i'm building a capsule wardrobe for autumn, where do i start?"
 *                                            →  "Building a capsule wardrobe for autumn"
 *
 * Rules: 3–7 words where the source allows it, normally capitalised, no
 * trailing punctuation. The summariser strips conversational filler openers
 * ("can you", "find me", "I'm looking for" …), keeps the author's own word
 * order and phrasing for what remains, then trims to length — never a model
 * call, so it is instant, free and works offline.
 *
 * Consumers: Beau's chat conversation list
 * (components/BeauConversations.tsx).
 */

const MAX_WORDS_DEFAULT = 7;
const MAX_CHARS = 64;

/** Conversational filler the title never needs — stripped from the front,
 * repeatedly, until the text starts with substance. Order matters only in
 * that all of them run until none match. */
const FILLER_OPENERS: RegExp[] = [
  /^(hi|hey|hello|hiya|good\s+(morning|afternoon|evening))[\s,.!:;-]+/i,
  /^(beau|please|ok(ay)?|so|well|um|right)[\s,.!:;-]+/i,
  /^(can|could|would|will)\s+you\s+(please\s+)?/i,
  /^(i\s*(?:'m|am)\s+(?:looking|searching|hunting|shopping)\s+for\s+)/i,
  /^(i\s*(?:'m|am)\s+(?:thinking|wondering)\s+(?:about|of)\s+)/i,
  /^(i\s+(?:want|need|would\s+like|wanna)\s+(?:to\s+(?:find|buy|get|see|know|ask)\s+(?:about\s+)?)?)/i,
  /^(help\s+me\s+(?:find|with|choose|pick|decide\s+on)?\s*)/i,
  /^(find|show|get|give|tell)\s+me\s+(about\s+)?/i,
  /^(find|search(?:\s+for)?|look\s+for|looking\s+for|hunt(?:\s+for)?|recommend|suggest)\s+/i,
  /^(what\s+(?:should|do|would)\s+(?:i|you)\s+(?:think\s+(?:about|of)\s+)?)/i,
  /^(thoughts\s+on|advice\s+on|question\s+about|a\s+question\s+about)\s+/i,
  /^(is\s+it\s+worth|are\s+there)\s+/i,
  /^i\s*['\u2019]?m\s+/i,
  /^i\s+am\s+/i,
];

/** Words a title never ENDS on — trimmed off after the length cut so a
 * seven-word slice can't stop mid-phrase ("… blazers under" / "… wardrobe
 * for"). Trailing only — the same words are kept mid-phrase. */
const WEAK_TRAILERS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'with', 'without', 'for', 'in', 'on',
  'at', 'of', 'to', 'from', 'by', 'my', 'your', 'his', 'her', 'their', 'our',
  'that', 'this', 'these', 'those', 'is', 'are', 'was', 'were', 'be', 'i',
  'me', 'you', 'it', 'its', 'as', 'so', 'if', 'when', 'while', 'about',
  'under', 'over', 'between', 'into', 'than', 'some', 'any', 'very', 'really',
  'which', 'who', 'what', 'how', 'where', 'why', 'do', 'does', 'can', 'should',
]);

/** Strip URLs, markdown/code noise and collapse whitespace. */
function cleanSource(raw: string): string {
  return (raw || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[\u201c\u201d"`*_#>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A short smart title from free text — 3–7 words where the source allows,
 * normally capitalised, no trailing punctuation. Returns '' when the source
 * has no usable substance (empty, punctuation-only), so callers can fall
 * back to their own placeholder.
 */
export function smartTitle(raw: string, maxWords: number = MAX_WORDS_DEFAULT): string {
  let text = cleanSource(raw);
  if (!text) return '';

  // Work on the FIRST sentence/clause — the intent lives there, the rest is
  // elaboration ("…, where do I start?"). No lookbehind (older Safari).
  const clauseMatch = text.match(/^[^.!?—–]+[.!?]?/);
  if (clauseMatch && clauseMatch[0].trim()) text = clauseMatch[0].trim();

  // Peel conversational filler off the front until the text starts with
  // substance (bounded — each pass must shorten the string).
  for (let pass = 0; pass < 8; pass += 1) {
    let changed = false;
    for (const opener of FILLER_OPENERS) {
      const next = text.replace(opener, '');
      if (next !== text && next.trim()) {
        text = next.trim();
        changed = true;
      }
    }
    if (!changed) break;
  }

  // Trailing question/exclamation furniture goes before the word cut.
  text = text.replace(/[\s.,;:!?…-]+$/g, '').trim();
  if (!text) return '';

  let words = text.split(/\s+/);
  if (words.length > maxWords) words = words.slice(0, maxWords);

  // Respect the character budget too — drop whole words, never cut inside one.
  while (words.length > 1 && words.join(' ').length > MAX_CHARS) words.pop();

  // Never end on a connector/article — trim weak trailers left by the cut.
  while (words.length > 1 && WEAK_TRAILERS.has(words[words.length - 1].toLowerCase().replace(/[^a-z'\u2019]/g, ''))) {
    words.pop();
  }

  let title = words.join(' ').replace(/[\s.,;:!?…-]+$/g, '').trim();
  if (!title || !/[a-z0-9£$€]/i.test(title)) return '';

  // Normal capitalisation: first letter up, the author's own casing kept for
  // the rest (brand names and acronyms — OCBD, M65 — survive intact).
  title = title.charAt(0).toUpperCase() + title.slice(1);
  return title;
}

/** True when a stored name reads as a date/placeholder rather than a real
 * title — "Chat 8 Aug", "Chat 14:32", "New chat", a bare timestamp. */
export function looksLikePlaceholderName(name: string): boolean {
  const n = (name || '').trim();
  if (!n) return true;
  if (/^new chat$/i.test(n)) return true;
  if (/^chat\b/i.test(n)) return true;
  if (/^\d{1,2}[:/.\-]\d{1,2}([:/.\-]\d{2,4})?$/.test(n)) return true;
  if (/^\d{4}-\d{2}-\d{2}/.test(n)) return true;
  return false;
}
