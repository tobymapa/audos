/**
 * THE HUNT · THE READER — the tab's two reading jobs, in one place.
 *
 *  1. THE MAN. The ONE brief every surface of the tab reasons over,
 *     assembled from his whole record (below).
 *  2. THE PRODUCT LINK. A pasted url read into structured facts — piece,
 *     maker, price, photograph, description — at the bottom of this file
 *     (`readProductLink`), plus the small url helpers the tab shares.
 *
 * ── 1. THE MAN ───────────────────────────────────────────────────────────
 *
 * Beau's Picks and Ask Beau must never hold different pictures of the same
 * person, so the gathering AND the wording of the brief live here and
 * nowhere else. Everything is read from what he has actually told the app:
 *
 *   · the dossier's physical read — height, weight, build, complexion, hair
 *     colour, and his own note on the colours he knows he wears well
 *   · the sizes — general size, chest, waist, inseam, shoulder, shoe
 *   · the directions — his style archetypes and the people he named as
 *     references, plus how often each dress register actually comes up
 *   · place — home city, the climate he dresses for, and the derived
 *     eight-band day histogram when the climate pipeline has run
 *   · the ledger — every logged piece with its material, in HIS words
 *   · the calls already made on The Hunt — saved, favourite and passed
 *   · makers he trusts, makers he has ruled out, his materials rule, his
 *     secondhand openness, his currency and anything he added in his own
 *     words
 *
 * Nothing here is a default or a placeholder: a fact he has not given is
 * simply absent from the brief, and the prompt says what would sharpen it.
 */
import {
  fetchBrandSignals,
  fetchMaterials,
  fetchStyleMeasurements,
  getCurrency,
  homeCity,
  label,
  secondhandAllowed,
  type StyleMeasurements,
  type StylePrefs,
  type StyleProfile,
  type WardrobePiece,
} from './profile-data';
import { climateLabel, fetchDossierDetails, hairColourLabel, type DossierDetails } from './dossier-details';
import { REGISTER_FREQUENCY_LABELS, fetchRegisterFrequencies, type RegisterFrequency } from './coverage-prefs';
import { fetchAvatarInputs } from './body-profile';
import { FIELD_REGISTER_LABELS, pieceIndexCategory } from './index-model';
import { CLAUDE_HAIKU, CLAUDE_SONNET, callClaude } from './claude';
import { searchWeb } from './scout-ai';
import { fetchProductImage } from './og-image';
import { HUNT_CATEGORIES, huntCategory, type HuntCall } from './hunt-model';

export interface HuntReader {
  profile: StyleProfile | null;
  pieces: WardrobePiece[];
  prefs: StylePrefs | null;
  details: DossierDetails | null;
  measurements: StyleMeasurements | null;
  avatar: { heightCm: number | null; weightKg: number | null; bodyType: string | null };
  /** piece id → its material, so the ledger reads in cloth as well as name. */
  materials: Record<number, string>;
  /** register id → how often it comes up ('most-days' … 'never'). */
  registerFrequencies: Record<string, string>;
  trustedBrands: string[];
  avoidedBrands: string[];
  /** Every call already made on The Hunt, so nothing is offered twice. */
  calls: HuntCall[];
}

/**
 * Gather the record. Never throws — a companion row that fails to read just
 * means one fewer fact in the brief, never a broken tab.
 */
export async function loadHuntReader(input: {
  profile: StyleProfile | null;
  pieces: WardrobePiece[];
  prefs: StylePrefs | null;
  calls: HuntCall[];
}): Promise<HuntReader> {
  const [details, measurements, avatar, materials, freqs, signals] = await Promise.all([
    fetchDossierDetails().catch(() => null),
    fetchStyleMeasurements().catch(() => null),
    fetchAvatarInputs().catch(() => ({ heightCm: null, weightKg: null, bodyType: null } as any)),
    fetchMaterials().catch(() => ({} as Record<number, string>)),
    fetchRegisterFrequencies().catch(() => ({} as Record<string, string>)),
    fetchBrandSignals().catch(() => ({ trustedBrands: [] as string[], avoidedBrands: [] as string[] })),
  ]);
  return {
    profile: input.profile,
    pieces: input.pieces,
    prefs: input.prefs,
    details,
    measurements,
    avatar: {
      heightCm: avatar?.heightCm ?? null,
      weightKg: avatar?.weightKg ?? null,
      bodyType: avatar?.bodyType ?? null,
    },
    materials,
    registerFrequencies: freqs,
    trustedBrands: signals.trustedBrands,
    avoidedBrands: signals.avoidedBrands,
    calls: input.calls,
  };
}

/** The coverage-map's register ids, keyed as FIELD_REGISTER_LABELS holds them. */
const REGISTER_ID_TO_KEY: Record<string, string> = {
  casual: 'Casual',
  'smart-casual': 'Smart-Casual',
  formal: 'Formal',
  business: 'Business',
  'black-tie': 'Black-Tie',
  'outdoor-work': 'Outdoor-Work',
};

/**
 * The man, in Beau's own reading order. This string IS the personalisation:
 * every recommendation, verdict and comparison on the tab is written against
 * it, and it changes the moment he changes a fact — which is what moves the
 * cache fingerprints too.
 */
export function huntReaderBrief(reader: HuntReader): string {
  const { profile, details, measurements, avatar, prefs } = reader;
  const lines: string[] = [];

  if (details?.displayName) lines.push(`Name: ${details.displayName}.`);

  const physical: string[] = [];
  if (avatar.heightCm) physical.push(`${avatar.heightCm} cm tall`);
  else if (profile?.height_range) physical.push(label.height(profile.height_range));
  if (avatar.weightKg) physical.push(`${avatar.weightKg} kg`);
  const build = avatar.bodyType || label.build(profile?.build);
  if (build) physical.push(`${String(build).toLowerCase()} build`);
  if (profile?.fit_notes) physical.push(`fit note: ${profile.fit_notes}`);
  if (physical.length > 0) lines.push(`Frame: ${physical.join(', ')}.`);

  const colouring: string[] = [];
  if (profile?.skin_tone) colouring.push(`complexion ${label.skinTone(profile.skin_tone).toLowerCase()}`);
  if (details?.hairColour) colouring.push(`hair ${hairColourLabel(details.hairColour).toLowerCase()}`);
  if (colouring.length > 0) lines.push(`Colouring: ${colouring.join(', ')}.`);
  if (details?.paletteNotes) {
    lines.push(`His own note on colour — what he knows he wears well: “${details.paletteNotes}”`);
  }

  const sizes: string[] = [];
  if (measurements?.clothing_size) sizes.push(`usual size ${measurements.clothing_size}`);
  if (measurements?.chest_cm) sizes.push(`chest ${measurements.chest_cm} cm`);
  if (measurements?.waist_cm) sizes.push(`waist ${measurements.waist_cm} cm`);
  if (measurements?.inseam_cm) sizes.push(`inseam ${measurements.inseam_cm} cm`);
  if (measurements?.shoulder_cm) sizes.push(`shoulder ${measurements.shoulder_cm} cm`);
  if (measurements?.shoe_size) {
    sizes.push(`shoe ${measurements.shoe_size} ${measurements.shoe_size_system || ''}`.trim());
  }
  if (sizes.length > 0) lines.push(`Sizes: ${sizes.join(', ')}.`);

  const archetypes = (profile?.archetypes || []).filter(Boolean).map((a) => label.archetype(a));
  if (archetypes.length > 0) lines.push(`Style directions: ${archetypes.join(', ')}.`);
  if ((details?.styleReferences || []).length > 0) {
    lines.push(`People he named as references: ${(details as DossierDetails).styleReferences.join(', ')}.`);
  }

  const occasions = (profile?.occasions || []).filter(Boolean).map((o) => label.occasion(o));
  if (occasions.length > 0) lines.push(`Dresses for: ${occasions.join(', ')}.`);

  const freqLines = Object.entries(reader.registerFrequencies)
    .filter(([, freq]) => freq)
    .map(([reg, freq]) => {
      const regLabel = FIELD_REGISTER_LABELS[REGISTER_ID_TO_KEY[reg] || reg] || reg;
      const freqLabel = REGISTER_FREQUENCY_LABELS[freq as RegisterFrequency] || freq;
      return `${regLabel}: ${freqLabel.toLowerCase()}`;
    });
  if (freqLines.length > 0) {
    lines.push(
      `How often each register actually comes up: ${freqLines.join('; ')}. Never recommend for a register he has ruled out.`,
    );
  }

  const city = homeCity(profile) || details?.city || null;
  if (city) lines.push(`Home city: ${city}.`);
  if (details?.climate) lines.push(`The climate he dresses for: ${climateLabel(details.climate)}.`);
  if (details?.climateBands) {
    lines.push(
      'Days a year in each apparent-temperature band, coldest first (below 0°, 0–5°, 5–10°, 10–15°, '
      + `15–20°, 20–25°, 25–30°, above 30°): ${details.climateBands.join(' · ')}. `
      + 'Weight everything to the bands he actually lives in.',
    );
  }

  if (profile?.materials) lines.push(`Materials rule: ${label.materials(profile.materials)}.`);
  const cur = getCurrency();
  lines.push(`Quote every price in ${cur.id} (${cur.symbol.trim()}).`);
  if (prefs?.secondhand === 'no') lines.push('New pieces only — never suggest secondhand or vintage.');
  else if (secondhandAllowed(prefs)) {
    lines.push('Open to secondhand and vintage — say so plainly when pre-owned is the smarter buy.');
  }
  if (prefs?.free_text) lines.push(`In his own words: “${prefs.free_text.trim()}”`);
  if (reader.trustedBrands.length > 0) {
    lines.push(
      `Makers he already trusts — prefer one of these when they genuinely make the piece well: ${reader.trustedBrands.join(', ')}.`,
    );
  }
  if (reader.avoidedBrands.length > 0) {
    lines.push(`Makers he has ruled out — NEVER name one of these: ${reader.avoidedBrands.join(', ')}.`);
  }

  if (lines.length === 0) {
    return 'No dossier on file yet — keep everything classic, and say plainly what he could fill in to sharpen it.';
  }
  return lines.join('\n');
}

/**
 * HOW MUCH OF HIM BEAU ACTUALLY HAS — the share of the dossier's facts that
 * are on file, as a percentage. Arithmetic, not an opinion: each fact below
 * either has been given or has not, and the figure moves the moment one is.
 * The masthead shows it so a thin answer always has a visible reason.
 */
export function readerCompleteness(reader: HuntReader): number {
  const { profile, details, measurements, avatar, prefs } = reader;
  const facts: boolean[] = [
    !!details?.displayName,
    !!(avatar.heightCm || profile?.height_range),
    !!avatar.weightKg,
    !!(avatar.bodyType || profile?.build),
    !!profile?.fit_notes,
    !!profile?.skin_tone,
    !!details?.hairColour,
    !!details?.paletteNotes,
    !!measurements?.clothing_size,
    !!(measurements?.chest_cm || measurements?.waist_cm),
    !!(measurements?.inseam_cm || measurements?.shoulder_cm),
    !!measurements?.shoe_size,
    (profile?.archetypes || []).length > 0,
    (details?.styleReferences || []).length > 0,
    (profile?.occasions || []).length > 0,
    Object.keys(reader.registerFrequencies).length > 0,
    !!(homeCity(profile) || details?.city),
    !!details?.climate,
    !!details?.climateBands,
    !!profile?.materials,
    !!prefs?.secondhand,
    !!prefs?.free_text,
    reader.trustedBrands.length > 0,
    reader.pieces.length > 0,
  ];
  const held = facts.filter(Boolean).length;
  return Math.round((held / facts.length) * 100);
}

/** What he owns in ONE Index category, in his own words, with the cloth. */
export function ownedInCategory(reader: HuntReader, categoryId: string): string[] {
  const out: string[] = [];
  for (const piece of reader.pieces) {
    if (pieceIndexCategory(piece) !== categoryId) continue;
    const named = [piece.brand, piece.name].filter(Boolean).join(' ');
    const fabric = reader.materials[piece.id];
    out.push(fabric ? `${named} (${fabric})` : named);
    if (out.length >= 24) break;
  }
  return out;
}

export interface CategoryCalls {
  saved: string[];
  favourite: string[];
  passed: string[];
}

/** The calls already made inside ONE category, grouped by tag. */
export function callsInCategory(reader: HuntReader, categoryId: string): CategoryCalls {
  const saved: string[] = [];
  const favourite: string[] = [];
  const passed: string[] = [];
  for (const call of reader.calls) {
    if (call.categoryId !== categoryId) continue;
    const line = call.subCategory ? `${call.pieceName} (${call.subCategory})` : call.pieceName;
    if (call.tag === 'passed') passed.push(line);
    else if (call.tag === 'favourite') favourite.push(line);
    else saved.push(line);
  }
  return { saved, favourite, passed };
}

// ---------------------------------------------------------------------------
// 2. THE PRODUCT LINK READER
//
// A pasted url, read into the same shape a card needs: the piece, the maker,
// the price, the photograph and what the page says the thing IS. Three
// sources, in order of how much they can be trusted:
//
//   · the page's own og:image (the `beau-og-image` hook reads the page
//     server-side — a browser cannot read a cross-origin retail page), which
//     is the maker's own photograph of the product;
//   · the live index — the url searched directly, and its slug searched as a
//     product — which is where the maker, the price and the description come
//     from;
//   · the url's own words, which is all that is left when a page will not
//     open up. A link is never dropped for being unreadable: the card keeps
//     it and says plainly that it could not be read.
//
// Nothing here is invented. A price appears only when a source states one,
// and the read never throws — an unreadable page comes back marked `read:
// false`, which is a fact the caller shows rather than an error it handles.
// ---------------------------------------------------------------------------

/** The scheme a pasted host-only link is missing. */
export function normaliseUrl(raw: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** The first url inside a piece of free text. */
export function firstUrl(text: string): string | null {
  const match = (text || '').match(/https?:\/\/[^\s<>"')]+/i);
  return match ? match[0] : null;
}

/** True when the whole box holds nothing but a link. */
export function looksLikeBareUrl(text: string): boolean {
  const trimmed = (text || '').trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  return /^https?:\/\//i.test(trimmed) || /^[\w-]+(\.[\w-]+)+\/\S+$/.test(trimmed);
}

/** The retailer's name as the card labels it — the bare host. */
export function hostLabel(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\d?\./, '');
  } catch {
    return null;
  }
}

/** What the url's own slug says the piece is — the name a card carries while
 * the page is still being read, and the one it keeps if it cannot be. */
export function pieceNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const slug = parsed.pathname.split('/').filter(Boolean).pop() || parsed.hostname;
    const words = decodeURIComponent(slug)
      .replace(/\.(html?|php|aspx?)$/i, '')
      .replace(/[-_+]+/g, ' ')
      .replace(/\b\d{5,}\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!words) return parsed.hostname.replace(/^www\d?\./, '');
    return words.charAt(0).toUpperCase() + words.slice(1);
  } catch {
    return url;
  }
}

/** One product link, read. */
export interface ProductLinkRead {
  url: string;
  pieceName: string;
  maker: string | null;
  /** With its currency symbol, exactly as a source stated it — never
   * estimated. */
  price: string | null;
  /** The page's own product photograph, when it publishes one. */
  imageUrl: string | null;
  /** What the thing IS, in a sentence — cloth, construction, cut. */
  description: string | null;
  /** Beau's first read of it for THIS man. */
  note: string | null;
  /** The Index category it belongs to, when it could be placed. */
  categoryId: string | null;
  retailer: string | null;
  /** False when the page could not be opened up — the card says so. */
  read: boolean;
}

function squash(v: unknown, max = 300): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function jsonFrom(raw: string | null): any {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
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

const READER_VOICE = {
  text:
    'You are Beau, the valet voice of Ethaion — a classic-menswear wardrobe app. You are reading a product page a man has put in front of you and writing down what it IS. '
    + 'Copy the facts from the sources given: never invent a price, never invent a maker, never describe a detail the sources do not state. Where a fact is missing, leave the field empty. '
    + 'Your one line of opinion is written TO him (“you”): quiet, concrete, lightly British, no marketing. Return STRICT JSON only — no markdown fences, no prose around it.',
  cache: true,
};

/**
 * Read one pasted product link. Never throws: a page that will not open
 * comes back with whatever the url itself said and `read: false`.
 */
export async function readProductLink(input: { url: string; reader: HuntReader | null }): Promise<ProductLinkRead> {
  const url = normaliseUrl(input.url);
  const guess = pieceNameFromUrl(url);
  const base: ProductLinkRead = {
    url,
    pieceName: guess,
    maker: null,
    price: null,
    imageUrl: null,
    description: null,
    note: null,
    categoryId: null,
    retailer: hostLabel(url),
    read: false,
  };
  try {
    // The page's own photograph and the index's read of it, together — the
    // image never delays the facts and the facts never delay the image.
    const [image, direct, byName] = await Promise.all([
      fetchProductImage(url).catch(() => ''),
      searchWeb(url, 5).catch(() => []),
      searchWeb(`${guess} price`, 4).catch(() => []),
    ]);
    base.imageUrl = image || null;
    const hits = [...direct, ...byName].slice(0, 8);
    if (hits.length === 0) return base;

    const categoryIds = HUNT_CATEGORIES.map((c) => c.id).join(', ');
    const user = [
      input.reader ? `THE MAN:\n${huntReaderBrief(input.reader)}` : null,
      `HE PASTED THIS PRODUCT LINK: ${url}\nThe url itself reads like: ${guess}`,
      `WHAT THE INDEX RETURNS FOR IT (copy your facts from these):\n${hits
        .map((h, i) => `${i + 1}. ${h.title}\n   ${h.snippet}\n   ${h.link}`)
        .join('\n\n')}`,
      'Identify the product and write it down. Return JSON: '
        + '{"pieceName": "…" (colour and cloth included where the sources say them, max 70 chars), '
        + '"maker": "…"|null, '
        + '"price": "…"|null (with its currency symbol, ONLY if a source states it), '
        + '"description": "…" (ONE sentence, max 200 chars — what the thing IS: cloth, construction, cut), '
        + `"categoryId": one of ${categoryIds} or null, `
        + '"note": "…" (1–2 short sentences, max 220 chars — your first read of THIS piece for THIS man; leave empty if you were given nothing about him)}.',
    ]
      .filter(Boolean)
      .join('\n\n');

    let raw = await callClaude({ model: CLAUDE_HAIKU, system: [READER_VOICE], user, maxTokens: 700, temperature: 0.4 });
    if (!raw) raw = await callClaude({ model: CLAUDE_SONNET, system: [READER_VOICE], user, maxTokens: 700, temperature: 0.4 });
    const parsed = jsonFrom(raw);
    const pieceName = squash(parsed?.pieceName, 90);
    if (!pieceName) return base;
    const categoryRaw = squash(parsed?.categoryId, 40).toLowerCase();
    return {
      ...base,
      pieceName,
      maker: squash(parsed?.maker, 60) || null,
      price: squash(parsed?.price, 40) || null,
      description: squash(parsed?.description, 240) || null,
      note: squash(parsed?.note, 260) || null,
      categoryId: huntCategory(categoryRaw) ? categoryRaw : null,
      read: true,
    };
  } catch (e) {
    console.warn('[Ethaion] The Hunt could not read that product link (non-fatal):', e);
    return base;
  }
}
