/**
 * THE PIECE DETAIL PAGE · BEAU'S COPY — every generated line on the full
 * piece page (piece-detail-page.tsx), written against the reader's REAL
 * record: their city and climate, the pieces on their ledger (names and
 * colours), the gaps their board names, and the places their Dossier and
 * trips hold. Nothing here is a stock string about a garment in general.
 *
 * ONE model call per piece type (the never-dead-end transport, claude.ts
 * `callModel`), cached in localStorage on a fingerprint of the facts — so
 * the page never regenerates on a mere re-open, and re-writes itself only
 * when the wardrobe or the dossier moves. While the call is in flight (or
 * every transport is down) a DETERMINISTIC fallback computed from the same
 * facts carries every slot, so the page is complete and honest from the
 * first paint.
 */
import { useEffect, useMemo, useState } from 'react';
import { CLAUDE_HAIKU, CLAUDE_SONNET, callModel } from './claude';
import type { GarmentType } from './garment-types';
import {
  FIELD_REGISTERS,
  FIELD_REGISTER_LABELS,
  daysInSpan,
  neighboursOf,
  spanLabel,
  spanOf,
  verdictFor,
  type IndexModel,
} from './index-model';
import type { StyleProfile, WardrobePiece } from './profile-data';
import { DOSSIER_DETAILS_EVENT, fetchDossierDetails, type DossierDetails } from './dossier-details';
import { EMPTY_INPUTS, fetchAvatarInputs, type AvatarInputs } from './body-profile';

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export interface DetailPlaceInput {
  name: string;
  /** Trips logged to it — 0 for the home city. */
  trips: number;
  home: boolean;
}

export interface DetailRegisterNote {
  note: string;
  occasions: string[];
}

export interface DetailPlaceCard {
  name: string;
  trips: number;
  home: boolean;
  /** The verdict headline — “Essential — buy this one”. */
  verdict: string;
  /** 'essential' | 'works' | 'wrong' — the headline's ink. */
  tone: 'essential' | 'works' | 'wrong';
  why: string;
}

export interface PieceDetailCopy {
  /** The subtitle — also-known-as names, tradition, decade. */
  aka: string;
  /** The lead paragraph — what it is, why it matters for a wardrobe. */
  intro: string;
  /** The AGAINST YOUR LEDGER panel's reason line. */
  ledgerNote: string;
  /** The sub-label under the big temperature range. */
  bandNote: string;
  /** Register id → how the piece works there (empty note = doesn't reach). */
  registers: Record<string, DetailRegisterNote>;
  /** The type's fixed colour set, ranked for THIS ledger, each justified. */
  colours: Array<{ name: string; why: string }>;
  places: DetailPlaceCard[];
  cutsHeading: string;
  cuts: Array<{ name: string; sub: string; note: string }>;
  /** Neighbour typeId → the one line saying why this piece is different. */
  neighbours: Record<string, string>;
  /** Beau's closing verdict — the dark-panel quote. */
  verdict: string;
  generated: boolean;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const memoryCache = new Map<string, PieceDetailCopy>();
const inflight = new Map<string, Promise<PieceDetailCopy | null>>();

function fingerprint(value: unknown): string {
  const text = JSON.stringify(value);
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function readCache(key: string): PieceDetailCopy | null {
  const held = memoryCache.get(key);
  if (held) return held;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PieceDetailCopy;
    memoryCache.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: PieceDetailCopy): void {
  memoryCache.set(key, value);
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full — the memory copy carries the session */
  }
}

function parseJson(raw: string | null): any {
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

function str(v: unknown, max = 400): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

// ---------------------------------------------------------------------------
// The deterministic fallback — the same facts, as arithmetic.
// ---------------------------------------------------------------------------

function fallbackCopy(
  type: GarmentType,
  model: IndexModel,
  places: DetailPlaceInput[],
): PieceDetailCopy {
  const span = spanOf(type);
  const days = daysInSpan(model.climate, span);
  const gap = model.gaps.has(type.id);
  const ownedNames = model.ownership.names.get(type.id) || [];
  const city = model.climate.city;
  const verdict = verdictFor(model.climate, type, gap);

  const registers: Record<string, DetailRegisterNote> = {};
  for (const reg of FIELD_REGISTERS) {
    registers[reg] = type.reach.includes(reg)
      ? { note: `It carries ${FIELD_REGISTER_LABELS[reg].toLowerCase()} — read the cut and cloth for how far.`, occasions: [] }
      : { note: '', occasions: [] };
  }

  const colours = type.colours.map((name, i) => ({
    name,
    why: i === 0 ? 'The canonical first colour — it sits under most of a considered wardrobe.' : 'Sound once the first colour is on the rail.',
  }));

  const placeCards: DetailPlaceCard[] = places.map((p) => {
    if (p.home) {
      const tone: DetailPlaceCard['tone'] = verdict === 'essential' ? 'essential' : verdict === 'wrong tool' ? 'wrong' : 'works';
      return {
        ...p,
        tone,
        verdict:
          tone === 'essential' ? 'Essential — buy this one' : tone === 'wrong' ? 'Wrong tool — leave it' : 'Works — sound, not urgent',
        why:
          days != null
            ? `${days} days a year in ${p.name} sit inside ${spanLabel(span)} — the arithmetic, not an opinion.`
            : 'Set your city in the Dossier and the day count fills in.',
      };
    }
    return {
      ...p,
      tone: 'works',
      verdict: 'Read against the trip',
      why: `Beau reads ${type.name.toLowerCase()} against ${p.name}'s climate when he writes this page.`,
    };
  });

  const cuts = type.cuts.map((name) => ({
    name,
    sub: span ? `its own construction · ${spanLabel(span)}` : 'its own construction',
    note: 'A cut in its own right — not a variation. The proportions decide what it works over.',
  }));

  const neighbourNotes: Record<string, string> = {};
  for (const n of neighboursOf(type, 6)) {
    const shared = n.reach.filter((r) => type.reach.includes(r)).length;
    neighbourNotes[n.id] =
      shared === 0
        ? 'Answers the same band, but in different registers entirely.'
        : n.category === type.category
          ? 'The same shelf, a different tool — compare the cuts before you double up.'
          : 'A different category answering the same days.';
  }

  const verdictLine = ownedNames.length > 0
    ? `Your ${ownedNames[0].toLowerCase()} already answers this page${days != null ? ` — ${days} days a year${city ? ` in ${city}` : ''}` : ''}. Buy a second only when the first wears through.`
    : gap
      ? `You own none, and your board already names this gap${days != null ? ` — it would earn ${days} days a year${city ? ` in ${city}` : ''}` : ''}. This is the page to act on.`
      : `You own none.${days != null ? ` It would earn about ${days} days a year${city ? ` in ${city}` : ''}.` : ''} ${verdict === 'wrong tool' ? 'For where you live, spend elsewhere first.' : 'Sound — fill your named gaps first, then come back.'}`;

  return {
    aka: `${type.name} · a classic of the ${FIELD_REGISTER_LABELS[type.reach[0]] ? FIELD_REGISTER_LABELS[type.reach[0]].toLowerCase() : 'menswear'} canon`,
    intro: `${type.name} — one of the ${type.category.replace(/-/g, ' ')} canon's fixed answers${span ? `, centred on ${spanLabel(span)}` : ''}. The facts below are the record's own; Beau's reading of them arrives as it is written.`,
    ledgerNote: verdictLine,
    bandNote: span ? `apparent temperature · wider over knitwear, narrower over a shirt alone` : 'judged by material and place, not by a band',
    registers,
    colours,
    places: placeCards,
    cutsHeading: type.cuts.length === 3 ? 'Three cuts, and they are not interchangeable' : `${type.cuts.length === 1 ? 'One cut' : `${type.cuts.length} cuts`}, and they are not interchangeable`,
    cuts,
    neighbours: neighbourNotes,
    verdict: verdictLine,
    generated: false,
  };
}

// ---------------------------------------------------------------------------
// Generation — one call, every slot.
// ---------------------------------------------------------------------------

const VOICE = {
  text:
    'You are Beau, the valet voice of Ethaion — a classic-menswear wardrobe app. You write the full reference page for ONE garment type, personalised to ONE wearer. Register: quiet, knowing, concrete, lightly British; short declarative sentences; no exclamation marks, no marketing, no emoji. Write TO the wearer (“you”). Every line must be earned from the FACTS provided — his city and climate, the exact pieces he has logged (names and colours), the gaps his board names, the places he travels. Never invent ownership, never name a maker, piece or place that is not in the facts. Numbers under one hundred are written as words where they read naturally. Return STRICT JSON only — no markdown fences, no prose around it.',
  cache: true,
};

function ownedLedgerLines(pieces: WardrobePiece[]): string {
  return pieces
    .slice(0, 26)
    .map((p) => `- ${p.name}${(p.colors || []).length > 0 ? ` (${(p.colors || []).join(', ')})` : ''}${p.brand ? ` by ${p.brand}` : ''}`)
    .join('\n');
}

async function generateDetailCopy(
  type: GarmentType,
  model: IndexModel,
  pieces: WardrobePiece[],
  profile: StyleProfile | null,
  details: DossierDetails | null,
  avatar: AvatarInputs,
  places: DetailPlaceInput[],
): Promise<PieceDetailCopy | null> {
  const span = spanOf(type);
  const days = daysInSpan(model.climate, span);
  const gap = model.gaps.has(type.id);
  const ownedNames = model.ownership.names.get(type.id) || [];
  const city = model.climate.city;
  const neighbours = neighboursOf(type, 6);

  const profileBits = [
    (profile?.archetypes || []).length > 0 ? `style directions: ${(profile?.archetypes || []).join(', ')}` : null,
    avatar.heightCm ? `height: ${avatar.heightCm} cm` : profile?.height_range ? `height range: ${profile.height_range}` : null,
    avatar.weightKg ? `weight: ${avatar.weightKg} kg` : null,
    avatar.bodyType || profile?.build ? `build: ${avatar.bodyType || profile?.build}` : null,
    avatar.skinTone || profile?.skin_tone ? `complexion: ${avatar.skinTone || profile?.skin_tone}` : null,
    details?.hairColour ? `hair: ${details.hairColour}` : null,
    details?.paletteNotes ? `his colour note: ${details.paletteNotes}` : null,
    (details?.styleReferences || []).length > 0 ? `style references: ${(details?.styleReferences || []).join(', ')}` : null,
    details?.climate ? `climate: ${details.climate}` : null,
    city ? `home city: ${city}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const user = [
    `THE TYPE: ${type.name} (category: ${type.category})${span ? ` · answers ${spanLabel(span)} apparent` : ' · no temperature band — judged by material and place'}${days != null ? ` · about ${days} days a year${city ? ` in ${city}` : ''} sit inside its span` : ''}.`,
    `Its registers (the FIXED reach — write within it, never beyond): ${type.reach.join(', ') || 'none'}.`,
    `Its cuts (FIXED): ${type.cuts.join(', ') || 'none'}.`,
    `Its canonical colours (FIXED set — rank THESE, never invent one): ${type.colours.join(', ') || 'none'}.`,
    `THE WEARER — ${profileBits || 'no dossier on file yet'}.`,
    `He owns of this type: ${ownedNames.join(', ') || 'nothing'}. A gap his board names: ${gap ? 'yes' : 'no'}.`,
    `HIS WHOLE LEDGER (names and colours — the colour ranking and the verdict must read against these):\n${ownedLedgerLines(pieces) || '- nothing logged yet'}`,
    `PLACES (his city first, then trips from his record): ${places.map((p) => `${p.name}${p.home ? ' (home)' : ` (${p.trips} trip${p.trips === 1 ? '' : 's'})`}`).join('; ') || 'none on file'}.`,
    `NEIGHBOURS — other types answering the same band (write ONE line each on why ${type.name} is different): ${neighbours.map((n) => `${n.name} (id: ${n.id})`).join('; ') || 'none'}.`,
    'Return ONE JSON object with EXACTLY these keys:\n'
      + '"aka" (the subtitle line — also-known-as names, the tradition it comes from, the decade it settled, max 140 chars, small-caps register),\n'
      + '"intro" (2–4 sentences — what the piece is and why it matters for HIS wardrobe specifically, max 520 chars),\n'
      + '"ledgerNote" (the AGAINST YOUR RAIL panel line — read from what he owns of it and his climate, max 260 chars),\n'
      + '"bandNote" (the sub-label under the temperature range — e.g. "over knitwear; 8–16° over a shirt alone", max 90 chars),\n'
      + `"registers" (an object with a key for EACH of: ${FIELD_REGISTERS.join(', ')} — each value {"note": how the piece works in that register FOR HIM (max 160 chars; empty string "" when the type does not reach it), "occasions": 1–3 short small-caps occasion labels like "client dinners", "weekend city" — [] when it does not reach}),\n`
      + '"colours" (the FIXED colour set re-ordered, best first FOR HIS LEDGER — each {"name": exact colour from the set, "why": one line naming the piece(s) he owns it sits with or clashes against, max 110 chars}),\n'
      + '"places" (one per place given, in the same order — each {"name": the place verbatim, "verdict": a 3–6 word headline like "Essential — buy this one" / "Works harder than at home" / "Wrong tool — leave it", "tone": one of "essential", "works", "wrong", "why": one short paragraph from the climate of that place, max 240 chars}),\n'
      + '"cutsHeading" (the section heading — e.g. "Three cuts, and they are not interchangeable", max 70 chars),\n'
      + '"cuts" (one per cut given, same order — each {"name": the cut verbatim, "sub": construction details · temperature reach, max 70 chars, "note": 1–2 sentences on when this cut and not the others, max 240 chars}),\n'
      + '"neighbours" (an object: each neighbour id given → ONE line on why this piece is different — e.g. "Colder, but casual only — no business register.", max 110 chars),\n'
      + '"verdict" (Beau reading this page against his ledger — 2–4 sentences recommending it or advising against, personal and concrete, max 420 chars).',
  ].join('\n\n');

  const raw = await callModel({
    model: CLAUDE_SONNET,
    second: CLAUDE_HAIKU,
    system: [VOICE],
    user,
    maxTokens: 3400,
    temperature: 0.5,
  });
  const parsed = parseJson(raw);
  if (!parsed || typeof parsed !== 'object') return null;

  const fallback = fallbackCopy(type, model, places);

  const registers: Record<string, DetailRegisterNote> = {};
  for (const reg of FIELD_REGISTERS) {
    const rawReg = parsed.registers?.[reg];
    const carries = type.reach.includes(reg);
    registers[reg] = {
      note: carries ? str(rawReg?.note, 200) || fallback.registers[reg].note : '',
      occasions: carries && Array.isArray(rawReg?.occasions) ? rawReg.occasions.map((o: unknown) => str(o, 32)).filter(Boolean).slice(0, 3) : [],
    };
  }

  const colourSet = new Set(type.colours.map((c) => c.toLowerCase()));
  const colours: Array<{ name: string; why: string }> = [];
  const seenColours = new Set<string>();
  for (const entry of Array.isArray(parsed.colours) ? parsed.colours : []) {
    const name = type.colours.find((c) => c.toLowerCase() === str(entry?.name, 40).toLowerCase());
    if (!name || seenColours.has(name) || !colourSet.has(name.toLowerCase())) continue;
    seenColours.add(name);
    colours.push({ name, why: str(entry?.why, 140) || 'Ranked against your rail.' });
  }
  for (const name of type.colours) {
    if (!seenColours.has(name)) colours.push({ name, why: 'Sound once the colours above are on the rail.' });
  }

  const placeCards: DetailPlaceCard[] = places.map((p, i) => {
    const rawPlace = Array.isArray(parsed.places)
      ? parsed.places.find((x: any) => str(x?.name, 60).toLowerCase() === p.name.toLowerCase()) || parsed.places[i]
      : null;
    const toneRaw = str(rawPlace?.tone, 12).toLowerCase();
    const tone: DetailPlaceCard['tone'] = toneRaw === 'essential' ? 'essential' : toneRaw === 'wrong' ? 'wrong' : 'works';
    return {
      ...p,
      tone: rawPlace ? tone : fallback.places[i]?.tone || 'works',
      verdict: str(rawPlace?.verdict, 60) || fallback.places[i]?.verdict || 'Read against the trip',
      why: str(rawPlace?.why, 280) || fallback.places[i]?.why || '',
    };
  });

  const cuts = type.cuts.map((name, i) => {
    const rawCut = Array.isArray(parsed.cuts)
      ? parsed.cuts.find((x: any) => str(x?.name, 60).toLowerCase() === name.toLowerCase()) || parsed.cuts[i]
      : null;
    return {
      name,
      sub: str(rawCut?.sub, 90) || fallback.cuts[i]?.sub || '',
      note: str(rawCut?.note, 280) || fallback.cuts[i]?.note || '',
    };
  });

  const neighbourNotes: Record<string, string> = {};
  for (const n of neighbours) {
    neighbourNotes[n.id] = str(parsed.neighbours?.[n.id], 140) || fallback.neighbours[n.id] || '';
  }

  return {
    aka: str(parsed.aka, 170) || fallback.aka,
    intro: str(parsed.intro, 600) || fallback.intro,
    ledgerNote: str(parsed.ledgerNote, 300) || fallback.ledgerNote,
    bandNote: str(parsed.bandNote, 110) || fallback.bandNote,
    registers,
    colours,
    places: placeCards,
    cutsHeading: str(parsed.cutsHeading, 80) || fallback.cutsHeading,
    cuts,
    neighbours: neighbourNotes,
    verdict: str(parsed.verdict, 480) || fallback.verdict,
    generated: true,
  };
}

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

export function usePieceDetailCopy(
  type: GarmentType | null,
  model: IndexModel,
  pieces: WardrobePiece[],
  profile: StyleProfile | null,
  places: DetailPlaceInput[],
): PieceDetailCopy | null {
  const [personal, setPersonal] = useState<{ details: DossierDetails | null; avatar: AvatarInputs } | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      void Promise.all([
        fetchDossierDetails().catch(() => null),
        fetchAvatarInputs().catch(() => ({ ...EMPTY_INPUTS })),
      ]).then(([details, avatar]) => {
        if (alive) setPersonal({ details, avatar });
      });
    };
    load();
    window.addEventListener(DOSSIER_DETAILS_EVENT, load);
    window.addEventListener('ethaion:measurements', load);
    return () => {
      alive = false;
      window.removeEventListener(DOSSIER_DETAILS_EVENT, load);
      window.removeEventListener('ethaion:measurements', load);
    };
  }, []);

  const key = useMemo(() => {
    if (!type || !personal) return null;
    const fp = fingerprint({
      id: type.id,
      city: model.climate.city,
      days: daysInSpan(model.climate, spanOf(type)),
      owned: model.ownership.names.get(type.id) || [],
      gap: model.gaps.has(type.id),
      ledger: pieces.map((p) => `${p.name}:${(p.colors || []).join('/')}`).sort(),
      places: places.map((p) => `${p.name}:${p.trips}`),
      profile: {
        archetypes: profile?.archetypes || [],
        build: personal.avatar.bodyType || profile?.build || null,
        skin: personal.avatar.skinTone || profile?.skin_tone || null,
        height: personal.avatar.heightCm || profile?.height_range || null,
        weight: personal.avatar.weightKg || null,
        hair: personal.details?.hairColour || null,
        palette: personal.details?.paletteNotes || null,
        references: personal.details?.styleReferences || [],
        climate: personal.details?.climate || null,
      },
    });
    return `ethaion:piece-detail:v1:${type.id}:${fp}`;
  }, [type, model, pieces, profile, places, personal]);

  const fallback = useMemo(() => (type ? fallbackCopy(type, model, places) : null), [type, model, places]);
  const [copy, setCopy] = useState<PieceDetailCopy | null>(() => (key ? readCache(key) : null));

  useEffect(() => {
    if (!type || !key) return;
    const cached = readCache(key);
    if (cached) {
      setCopy(cached);
      return;
    }
    setCopy(null);
    let alive = true;
    // A short settle so a ledger still loading in doesn't burn a call on
    // provisional facts.
    const timer = window.setTimeout(() => {
      const job =
        inflight.get(key) ||
        generateDetailCopy(type, model, pieces, profile, personal!.details, personal!.avatar, places).finally(() => inflight.delete(key));
      inflight.set(key, job);
      job
        .then((result) => {
          if (!result) return;
          writeCache(key, result);
          if (alive) setCopy(result);
        })
        .catch(() => undefined);
    }, 900);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!type) return null;
  return copy || fallback;
}
