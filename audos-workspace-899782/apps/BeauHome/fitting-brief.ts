/**
 * THE FITTING'S EDITORIAL — the copy that sits around the composed outfit on
 * The Fitting tab: the look's NAME, the paragraph under it, the STYLE NOTES
 * and the WHAT NOT TO DO lines the reference design calls for.
 *
 * The outfit itself is composed by fitting-ai (composeFittingBoard) from the
 * pieces the man actually owns, filtered against the real weather. This
 * module only writes ABOUT that outfit — it never chooses clothes, and it is
 * told only the pieces already on the board, so it can never introduce a
 * garment he doesn't own.
 *
 * Haiku first (short, cheap, one paragraph and two short lists), through the
 * shared never-dead-end transport; when every transport is down the local
 * fallback writes an honest brief from the board itself rather than leaving
 * the column empty.
 */
import { CLAUDE_HAIKU, CLAUDE_SONNET, callModel } from './claude';

export interface FittingCopy {
  /** The look's name — "The Navy Anchor". */
  name: string;
  /** Two sentences under the name. */
  description: string;
  /** Style notes — how to wear THIS outfit well. */
  notes: string[];
  /** What not to do — the mistakes this outfit invites. */
  avoid: string[];
}

export interface CopyPiece {
  name: string;
  brand?: string | null;
  category?: string | null;
  /** The colour it is logged as, when it carries one. */
  colour?: string | null;
}

const SYSTEM = `You are Beau, Ethaion's menswear valet. You are given ONE outfit that has ALREADY been composed from a man's own wardrobe, the occasion it was drawn for, the day of the week, and the weather. Write the editorial that sits beside it on the page.

Respond ONLY with strict JSON (no markdown):
{
  "name": string,        // the look's name — two to four words, always beginning "The ": "The Navy Anchor", "The Charcoal Authority", "The Soft Wednesday", "The Easy Friday".
  "description": string, // TWO sentences, written TO the wearer as "you/your" (never "he", "his" or "this man"), on why this outfit works for this occasion, for you and this weather. Warm, direct, no hedging, no lists.
  "notes": string[],     // THREE OR FOUR style notes — short lines on wearing THIS outfit well (what to tuck, when to lose a layer, what to polish, which piece carries it). Under 20 words each. No leading dash.
  "avoid": string[]      // TWO OR THREE lines on what NOT to do with this outfit — the specific mistakes it invites. Under 18 words each. No leading cross.
}

Rules: speak ONLY about the pieces you are given — never invent a garment he does not own; never mention prices, shops or brands he is not wearing; British spelling; no exclamation marks; JSON only.`;

function extractJson(text: string): any {
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function lines(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === 'string' ? v.trim().replace(/^[\u2014\u2013\-\u00d7\u00b7\s]+/, '') : ''))
    .filter(Boolean)
    .slice(0, max);
}

function capitalise(word: string): string {
  return word ? word[0].toUpperCase() + word.slice(1) : word;
}

/** The word each occasion's look is named for when the model is unreachable. */
const FALLBACK_NOUN: Record<string, string> = {
  office: 'Anchor',
  smart: 'Turn',
  weekend: 'Ease',
  formal: 'Order',
  evening: 'Hour',
};

/** An honest brief written from the board itself — no invented advice about
 * garments, only what the composition and the day actually say. */
function localCopy(input: {
  pieces: CopyPiece[];
  occasionKey: string;
  occasionLabel: string;
  dayName: string;
  weatherPhrase?: string | null;
  reasoning?: string | null;
}): FittingCopy {
  const colour = input.pieces.map((p) => (p.colour || '').trim()).find(Boolean);
  const noun = FALLBACK_NOUN[input.occasionKey] || 'Turn';
  const name = colour ? `The ${capitalise(colour)} ${noun}` : `The ${input.dayName} ${noun}`;
  const count = input.pieces.length;
  const notes = [
    count > 0
      ? `${count} piece${count === 1 ? '' : 's'} from your own wardrobe — swap any one of them and the rest holds.`
      : 'Nothing on the board yet — tap a piece below and it lands in its own zone.',
    input.weatherPhrase ? `Drawn for ${input.weatherPhrase}.` : `Drawn for ${input.dayName} · ${input.occasionLabel.toLowerCase()}.`,
    'Drag a piece to nudge it into place; tap it, then ×, to take it off.',
  ];
  return {
    name,
    description:
      (input.reasoning || '').trim() ||
      `${input.occasionLabel} on ${input.dayName}, composed from the pieces you own and the day outside.`,
    notes,
    avoid: [
      'Don\u2019t double up a zone — one top, one bottom, one pair of shoes.',
      'Don\u2019t count a dashed piece as worn — it isn\u2019t on your Rail yet.',
    ],
  };
}

export async function composeFittingCopy(input: {
  pieces: CopyPiece[];
  occasionKey: string;
  occasionLabel: string;
  /** The occasion's own sub-line — "Business professional". */
  occasionSub: string;
  dayName: string;
  /** "Pamplona at 13\u00b0C, clear skies" — short, for the prose. */
  weatherPhrase?: string | null;
  /** The build the outfit was drawn to, when the dossier carries one. */
  build?: string | null;
  /** His complexion, when the dossier carries one — so the notes can speak
   * to why these colours work on HIM (personalisation audit, August 2026). */
  colouring?: string | null;
  /** His style directions (archetypes), same audit. */
  directions?: string[] | null;
  /** Beau's own one-line reason from the composition — the fallback prose. */
  reasoning?: string | null;
}): Promise<FittingCopy> {
  const fallback = localCopy(input);
  if (input.pieces.length === 0) return fallback;

  const outfit = input.pieces
    .map((p) =>
      [
        `\u00b7 ${p.name}`,
        p.brand ? `by ${p.brand}` : null,
        p.category ? `[${p.category}]` : null,
        p.colour ? `colour: ${p.colour}` : null,
      ]
        .filter(Boolean)
        .join(' '),
    )
    .join('\n');
  const user = [
    `OCCASION: ${input.occasionLabel} — ${input.occasionSub}`,
    `DAY: ${input.dayName}`,
    input.weatherPhrase ? `WEATHER: ${input.weatherPhrase}` : null,
    input.build ? `HIS BUILD: ${input.build}` : null,
    input.colouring ? `HIS COLOURING: ${input.colouring}` : null,
    (input.directions || []).length > 0 ? `HIS STYLE DIRECTIONS: ${(input.directions || []).join(', ')}` : null,
    `THE OUTFIT ON THE BOARD:\n${outfit}`,
    input.reasoning ? `WHY YOU COMPOSED IT: ${input.reasoning}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    const text = await callModel({
      model: CLAUDE_HAIKU,
      second: CLAUDE_SONNET,
      system: [{ text: SYSTEM, cache: true }],
      user,
      maxTokens: 700,
      temperature: 0.7,
    });
    if (!text) return fallback;
    const parsed = extractJson(text);
    const name = typeof parsed?.name === 'string' ? parsed.name.trim() : '';
    const description = typeof parsed?.description === 'string' ? parsed.description.trim() : '';
    const notes = lines(parsed?.notes, 4);
    const avoid = lines(parsed?.avoid, 3);
    if (!name && !description && notes.length === 0) return fallback;
    return {
      name: name || fallback.name,
      description: description || fallback.description,
      notes: notes.length > 0 ? notes : fallback.notes,
      avoid: avoid.length > 0 ? avoid : fallback.avoid,
    };
  } catch (e) {
    console.warn('[Ethaion] the fitting\u2019s editorial failed \u2014 using the board\u2019s own brief:', e);
    return fallback;
  }
}
