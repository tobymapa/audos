/**
 * THE INDEX · GEN — the model wiring behind the twelve GEN slots (Task 3
 * of the Index rebuild; the slots themselves shipped ABSENT in Task 2).
 *
 * THE ABSTENTION DOCTRINE (29b), enforced here rather than hoped for:
 *  · A slot may assert ONLY what is in its derived facts block — owned
 *    names, day counts, gap names, maker records. The prompt says so and
 *    the derivation only includes slots whose facts EXIST: a slot whose
 *    preconditions fail is never even asked for — deterministic abstention,
 *    not a model promise.
 *  · Three states and no fourth: ABSENT removes the element (no facts, no
 *    provider, the model failed, or the model returned null for the slot);
 *    PENDING draws a hairline at the sentence's own measure; READY draws
 *    the text. No placeholder strings — G12 (first-run) keeps the one
 *    allowed fallback, passed by its screen, and is never generated.
 *  · One Haiku call per SCOPE (a type page's G1+G2+G3 are one call, not
 *    three), cached in localStorage on a fingerprint of the facts — the
 *    words only re-write themselves when the wardrobe, city or profile
 *    changes. A failed call abstains for the session instead of retrying
 *    in a loop.
 */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { CLAUDE_HAIKU, callClaude } from './claude';
import { BRAND_DIRECTORY } from './brands';
import { INDEX_GARMENT_TYPES, findGarmentType, garmentTypesForMaker } from './garment-types';
import { TEMPERATURE_BANDS, temperatureBandLabel, temperatureBandRange, type TemperatureBand } from './temperature-bands';
import {
  FIELD_REGISTERS,
  FIELD_REGISTER_LABELS,
  RULER_HI,
  RULER_LO,
  categoryName,
  daysInBand,
  daysInSpan,
  isBandedCategory,
  spanLabel,
  spanOf,
  verdictFor,
  type IndexModel,
  type TempSpan,
} from './index-model';
import { quadrantDots, quadrantMode, quadrantStats, type QuadrantFace, type QuadrantMode } from './index-quadrant-model';
import type { StyleProfile } from './profile-data';

// ---------------------------------------------------------------------------
// The context — the tab provides its model once; every GenSlot reads it.
// ---------------------------------------------------------------------------

interface IndexGenContextValue {
  model: IndexModel;
  profile: StyleProfile | null;
}

const IndexGenCtx = createContext<IndexGenContextValue | null>(null);

export function IndexGenProvider({
  model,
  profile,
  children,
}: {
  model: IndexModel;
  profile: StyleProfile | null;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ model, profile }), [model, profile]);
  return <IndexGenCtx.Provider value={value}>{children}</IndexGenCtx.Provider>;
}

// ---------------------------------------------------------------------------
// Cache — fingerprint of the facts; memory + localStorage; session failure
// memo so an unreachable model abstains instead of looping.
// ---------------------------------------------------------------------------

function fingerprint(value: unknown): string {
  const text = JSON.stringify(value);
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

type SlotTexts = Record<string, string | null>;

const memoryCache = new Map<string, SlotTexts>();
const inflight = new Map<string, Promise<SlotTexts | null>>();
const failedThisSession = new Set<string>();

function readCache(key: string): SlotTexts | null {
  const hit = memoryCache.get(key);
  if (hit) return hit;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SlotTexts;
    memoryCache.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: SlotTexts): void {
  memoryCache.set(key, value);
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch { /* storage unavailable — the memory copy carries the session */ }
}

/** Trim to a word cap, preferring a full-stop inside the cap. Never pads. */
function capWords(text: string, max: number): string {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  if (words.length <= max) return words.join(' ');
  let cut = words.slice(0, max).join(' ');
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.\u2019'), cut.lastIndexOf('.\u201d'));
  if (lastStop > cut.length * 0.4) cut = cut.slice(0, lastStop + 1);
  return /[.!?\u2026]$/.test(cut) ? cut : `${cut}\u2026`;
}

function parseJson(raw: string | null): any {
  if (!raw) return null;
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Shared voice — the same register as every other Beau surface, plus the
// abstention instruction stated as a hard rule.
// ---------------------------------------------------------------------------

const VOICE = {
  text:
    'You are Beau, the valet voice of Ethaion, a classic-menswear wardrobe instrument. You write the GENERATED sentences of THE INDEX \u2014 its reference wing. Register: quiet, knowing, concrete, lightly British; short declarative sentences; no exclamation marks, no marketing, no emoji, no headings. Write TO the wearer (\u201cyou\u201d). THE HARD RULE: you may assert ONLY what is in the facts block \u2014 the owned pieces, day counts, gap names, maker records and city given. Never invent ownership, a place, a price or a count. If the facts cannot support a slot\u2019s sentence, return null for that slot\u2019s key instead of writing anything. Numbers under twenty-one are written as words. Return STRICT JSON only \u2014 an object whose keys are exactly the slot ids requested.',
  cache: true,
};

// ---------------------------------------------------------------------------
// Facts derivations — one per scope family. Returning null = the WHOLE
// scope abstains (nothing is even asked). Each ask carries its own word cap.
// ---------------------------------------------------------------------------

interface ScopeRequest {
  /** The facts the fingerprint and the prompt are built from. */
  facts: unknown;
  /** slot id → what to write, stated to the model. */
  asks: Record<string, string>;
  /** slot id → word cap enforced after the call. */
  caps: Record<string, number>;
  /** The user-message facts block. */
  user: string;
}

function ownedLine(model: IndexModel, typeId: string): string {
  const names = model.ownership.names.get(typeId) || [];
  return names.length > 0 ? names.join(', ') : 'nothing';
}

function profileLine(profile: StyleProfile | null): string {
  const bits: string[] = [];
  const archetypes = (profile?.archetypes || []).filter(Boolean);
  if (archetypes.length > 0) bits.push(`style directions: ${archetypes.join(', ')}`);
  const occasions = (profile?.occasions || []).filter(Boolean);
  if (occasions.length > 0) bits.push(`dresses for: ${occasions.join(', ')}`);
  return bits.length > 0 ? bits.join(' \u00b7 ') : 'no dossier facts beyond the wardrobe';
}

/** The bare stretches of one category's ruler — same arithmetic as the
 * plate draws, restated here so the summary sentence can only echo it. */
function bareStretches(model: IndexModel, catId: string): TempSpan[] {
  if (!model.climate.bands) return [];
  const cat = model.categories.find((c) => c.id === catId);
  if (!cat || !cat.banded) return [];
  const ownedSpans = cat.runs
    .flatMap((r) => r.typeIds)
    .filter((id) => model.ownership.swatches.has(id))
    .map((id) => {
      const type = findGarmentType(id);
      return type ? spanOf(type) : null;
    })
    .filter(Boolean) as TempSpan[];
  const holes: TempSpan[] = [];
  let open: number | null = null;
  for (let deg = RULER_LO; deg <= RULER_HI; deg += 1) {
    const days = daysInSpan(model.climate, { lo: deg, hi: deg + 1 }) || 0;
    const asked = days >= 1.5;
    const covered = ownedSpans.some((s) => deg >= s.lo && deg < s.hi);
    if (asked && !covered) {
      if (open == null) open = deg;
    } else if (open != null) {
      if (deg - open >= 4) holes.push({ lo: open, hi: deg });
      open = null;
    }
  }
  if (open != null && RULER_HI - open >= 4) holes.push({ lo: open, hi: RULER_HI });
  return holes.slice(0, 3);
}

/** Cheap trigram similarity for the jump's did-you-mean candidates. */
function fuzzyCandidates(query: string): string[] {
  const grams = (s: string) => {
    const g = new Set<string>();
    const t = ` ${s.toLowerCase()} `;
    for (let i = 0; i < t.length - 2; i += 1) g.add(t.slice(i, i + 3));
    return g;
  };
  const qg = grams(query);
  if (qg.size === 0) return [];
  const names = [...INDEX_GARMENT_TYPES.map((t) => t.name), ...BRAND_DIRECTORY.map((b) => b.brand)];
  return names
    .map((n) => {
      const ng = grams(n);
      let hit = 0;
      for (const g of qg) if (ng.has(g)) hit += 1;
      return { n, s: hit / qg.size };
    })
    .filter((x) => x.s >= 0.3)
    .sort((a, b) => b.s - a.s)
    .slice(0, 8)
    .map((x) => x.n);
}

function buildScopeRequest(scope: string, model: IndexModel, profile: StyleProfile | null): ScopeRequest | null {
  const { climate } = model;
  const cityLine = climate.city ? `${climate.city}` : 'not set';

  // ─── type:<id> — G1 (earns a place) · G2 (city reasoning) · G3 (the case)
  if (scope.startsWith('type:')) {
    const type = findGarmentType(scope.slice(5));
    if (!type) return null;
    const span = spanOf(type);
    const days = daysInSpan(climate, span);
    const owned = ownedLine(model, type.id);
    const gapRank = model.gaps.get(type.id) || null;
    const verdict = verdictFor(climate, type, !!gapRank);
    const asks: Record<string, string> = {};
    const caps: Record<string, number> = {};
    if (days != null) {
      asks.G1 = 'One sentence under the type name: whether this type earns a place in THIS wearer\u2019s wardrobe, argued from the day count and what they own \u2014 a judgement with its arithmetic showing.';
      caps.G1 = 34;
    }
    if (climate.city && days != null) {
      asks.G2 = 'One line of reasoning for the wearer\u2019s city row in \u201cWhere it suits\u201d: WHY the verdict given holds for that city, from the day counts \u2014 the argument, not the verdict word again.';
      caps.G2 = 30;
    }
    if (days != null || model.ownedTotal > 0) {
      asks.G3 = 'Two or three sentences at the foot of the page: the case for and against this type for THIS wearer \u2014 what it would finish among their pieces, what argues against spending here first.';
      caps.G3 = 60;
    }
    if (Object.keys(asks).length === 0) return null;
    return {
      facts: { s: scope, days, owned, gapRank, verdict, city: climate.city, ownedTotal: model.ownedTotal },
      asks,
      caps,
      user:
        `The type: ${type.name} (${categoryName(type.category)}), answers ${spanLabel(span)}C, centres at ${temperatureBandLabel(type.band).toLowerCase()} (${temperatureBandRange(type.band)}). Registers it carries: ${type.reach.join(', ')}.\n` +
        `The wearer \u2014 ${profileLine(profile)}. City: ${cityLine}.` +
        (days != null ? ` Days a year inside its span there: ${days}.` : '') +
        `\nThey own, of this type: ${owned}. Their board ${gapRank ? `names it gap #${gapRank}` : 'does not name it a gap'}. The computed verdict: ${verdict || 'withheld'}.\n` +
        `They own ${model.ownedTotal} of ${model.typeTotal} types overall.`,
    };
  }

  // ─── cut:<typeId>:<cut> — G4 (what the cut costs and buys, in wear)
  if (scope.startsWith('cut:')) {
    const rest = scope.slice(4);
    const sep = rest.indexOf(':');
    if (sep < 0) return null;
    const type = findGarmentType(rest.slice(0, sep));
    const cut = rest.slice(sep + 1);
    if (!type || !cut) return null;
    return {
      facts: { s: scope },
      asks: {
        G4: 'One or two sentences under the cut\u2019s name: what choosing this cut of the parent type costs and buys IN WEAR \u2014 shoulder, line, formality \u2014 garment truth, not a claim about the wearer.',
      },
      caps: { G4: 44 },
      user: `The parent type: ${type.name} (${categoryName(type.category)}), cuts it exists in: ${type.cuts.join(', ')}. The cut on this page: ${cut}. Registers the parent carries: ${type.reach.join(', ')}.`,
    };
  }

  // ─── ruler:<cat>:<band> — G5 · ruler:<cat> — G6
  if (scope.startsWith('ruler:')) {
    const rest = scope.slice(6);
    const sep = rest.indexOf(':');
    if (sep >= 0) {
      const catId = rest.slice(0, sep);
      const band = rest.slice(sep + 1) as TemperatureBand;
      const cat = model.categories.find((c) => c.id === catId);
      if (!cat || !TEMPERATURE_BANDS.some((d) => d.id === band)) return null;
      return {
        facts: { s: scope },
        asks: {
          G5: 'One sentence for a band this category holds nothing in: WHY the category ends before this temperature \u2014 a fact about clothing, never about the wearer\u2019s wardrobe.',
        },
        caps: { G5: 28 },
        user: `The category: ${cat.name}. The empty band: ${temperatureBandLabel(band).toLowerCase()}, ${temperatureBandRange(band)} apparent temperature.`,
      };
    }
    const cat = model.categories.find((c) => c.id === rest);
    if (!cat || !cat.banded) return null;
    if (cat.ownedCount === 0 || !climate.weighted) return null;
    const bandLines = TEMPERATURE_BANDS.map((def) => {
      const types = cat.runs
        .flatMap((r) => r.typeIds)
        .map((id) => findGarmentType(id))
        .filter((t) => t && t.band === def.id) as NonNullable<ReturnType<typeof findGarmentType>>[];
      const owned = types.filter((t) => model.ownership.swatches.has(t.id));
      const days = daysInBand(climate, def.id);
      return `- ${temperatureBandRange(def.id)} \u00b7 ${days ?? '\u2014'} days \u00b7 you own: ${owned.length > 0 ? owned.map((t) => ownedLine(model, t.id)).join('; ') : 'nothing'}`;
    }).join('\n');
    return {
      facts: { s: scope, owned: cat.ownedCount, bands: climate.bands },
      asks: {
        G6: 'Two sentences reading the wearer\u2019s coverage OFF THIS RULER: which bands their pieces already answer (name the pieces), and which heavy-day band is barest \u2014 the day counts doing the arguing.',
      },
      caps: { G6: 46 },
      user: `The category: ${cat.name}, ${cat.total} types; they own ${cat.ownedCount}. City: ${cityLine}.\nThe bands, coldest first:\n${bandLines}`,
    };
  }

  // ─── matrix — G7 (the one reading above category scope)
  if (scope === 'matrix') {
    if (!climate.weighted && model.ownedTotal === 0) return null;
    const catLines = model.categories
      .map((c) => `- ${c.name}: ${c.total} types, ${c.ownedCount} owned`)
      .join('\n');
    return {
      facts: { s: scope, ownedTotal: model.ownedTotal, bands: climate.bands },
      asks: {
        G7: 'One or two sentences under the matrix: the single most consequential thing the counts say about THIS wearer \u2014 where their ownership clusters and where their days are heaviest with nothing counted.',
      },
      caps: { G7: 44 },
      user:
        `City: ${cityLine}. Days per band, coldest first: ${climate.bands ? climate.bands.join(', ') : 'not weighted'}.\n` +
        `They own ${model.ownedTotal} of ${model.typeTotal} types.\n${catLines}`,
    };
  }

  // ─── field — G8 (three readings) · G9 (Beau's line)
  if (scope === 'field') {
    if (!climate.weighted) return null;
    const placed: string[] = [];
    for (const [typeId, names] of model.ownership.names) {
      const type = findGarmentType(typeId);
      if (type && isBandedCategory(type.category) && placed.length < 10) placed.push(`${names[0] || type.name} (${type.reach[0]}, ${spanLabel(spanOf(type))})`);
    }
    const asks: Record<string, string> = {
      G8: 'Two sentences of \u201chow to read your field\u201d: which register-by-temperature corner of the grid the wearer\u2019s year actually lives in, from the day counts \u2014 orientation, not advice.',
    };
    const caps: Record<string, number> = { G8: 40 };
    if (placed.length > 0) {
      asks.G9 = 'One line in Beau\u2019s own voice: the single cell he would fill next and why \u2014 named from the facts, one recommendation, no list.';
      caps.G9 = 30;
    }
    return {
      facts: { s: scope, placed, bands: climate.bands },
      asks,
      caps,
      user:
        `City: ${cityLine}. Days per band, coldest first: ${climate.bands ? climate.bands.join(', ') : '\u2014'}.\n` +
        `Registers, most dressed first: ${FIELD_REGISTERS.map((r) => FIELD_REGISTER_LABELS[r]).join(', ')}.\n` +
        `Their placed banded pieces: ${placed.length > 0 ? placed.join('; ') : 'none yet'}.\n` +
        `The wearer \u2014 ${profileLine(profile)}.`,
    };
  }

  // ─── makers-root — G10 (why this maker, for you — three, never sixty)
  if (scope === 'makers-root') {
    const archetypes = (profile?.archetypes || []).filter(Boolean);
    const ownedBrands = [...new Set([...model.ownership.brands.values()])].slice(0, 8);
    if (archetypes.length === 0 && ownedBrands.length === 0) return null;
    const scored = BRAND_DIRECTORY.map((b) => ({
      b,
      s:
        b.archetypes.filter((a) => archetypes.map((x) => x.toLowerCase()).includes(a)).length * 2 +
        (ownedBrands.some((o) => o.toLowerCase() === b.brand.toLowerCase()) ? 3 : 0),
    }))
      .sort((a, z) => z.s - a.s)
      .slice(0, 3)
      .filter((x) => x.s > 0);
    if (scored.length === 0) return null;
    const makerLines = scored
      .map(({ b }) => `- ${b.brand} (${[b.city, b.country].filter(Boolean).join(', ')}) \u2014 reference for the ${b.referenceFor || b.signaturePieces[0]}; registers: ${b.registers.join(', ')}; ${b.priceRangeLabel}`)
      .join('\n');
    return {
      facts: { s: scope, makers: scored.map((x) => x.b.brand), archetypes, ownedBrands },
      asks: {
        G10: 'One short paragraph naming AT MOST the three makers given: why each one, for THIS wearer \u2014 read from their style directions and the makers they already own. Three annotations, never a directory.',
      },
      caps: { G10: 52 },
      user: `The wearer \u2014 ${profileLine(profile)}. Makers they already own pieces by: ${ownedBrands.join(', ') || 'none recorded'}.\nThe three makers:\n${makerLines}`,
    };
  }

  // ─── maker:<name> — the ledger verdict on the maker page
  if (scope.startsWith('maker:')) {
    const name = scope.slice(6);
    const maker = BRAND_DIRECTORY.find((b) => b.brand.toLowerCase() === name.toLowerCase());
    if (!maker) return null;
    const archetypes = (profile?.archetypes || []).filter(Boolean);
    const ownsBy = [...model.ownership.brands.entries()]
      .filter(([, brand]) => brand.toLowerCase() === maker.brand.toLowerCase())
      .map(([typeId]) => findGarmentType(typeId)?.name || typeId);
    if (archetypes.length === 0 && ownsBy.length === 0 && model.ownedTotal === 0) return null;
    const madeTypes = garmentTypesForMaker(maker.brand)
      .slice(0, 6)
      .map((t) => t.name);
    return {
      facts: { s: scope, ownsBy, archetypes: archetypes.slice(0, 4) },
      asks: {
        'maker-ledger': 'One sentence against the wearer\u2019s ledger: whether this maker sits inside their world \u2014 argued from what they own by them (if anything) and their style directions. A verdict with its reason.',
      },
      caps: { 'maker-ledger': 32 },
      user:
        `The maker: ${maker.brand} (${[maker.city, maker.country].filter(Boolean).join(', ')}), reference for the ${maker.referenceFor || maker.signaturePieces[0]}; ${maker.priceRangeLabel}; registers ${maker.registers.join(', ')}. Types they make here: ${madeTypes.join(', ') || 'outside the typed canon'}.\n` +
        `The wearer \u2014 ${profileLine(profile)}. They own by this maker: ${ownsBy.join(', ') || 'nothing'}; ${model.ownedTotal} pieces typed overall.`,
    };
  }

  // ─── category:<id> — the plate's one hole-summary sentence
  if (scope.startsWith('category:')) {
    const catId = scope.slice(9);
    const cat = model.categories.find((c) => c.id === catId);
    if (!cat || !climate.weighted) return null;
    const holes = bareStretches(model, catId);
    if (holes.length === 0) return null;
    const holeLines = holes
      .map((h) => `${h.lo}\u2013${h.hi}\u00b0C (\u2248${daysInSpan(climate, h) ?? '?'} days of the year)`)
      .join('; ');
    const ownedNames = cat.runs
      .flatMap((r) => r.typeIds)
      .filter((id) => model.ownership.swatches.has(id))
      .slice(0, 4)
      .map((id) => ownedLine(model, id));
    return {
      facts: { s: scope, holes, owned: cat.ownedCount },
      asks: {
        'plate-holes': 'One sentence under the owned count: the bare stretch of this category\u2019s ruler stated plainly \u2014 the degrees, the days, and what (if anything) already covers the rest.',
      },
      caps: { 'plate-holes': 30 },
      user: `The category: ${cat.name}; they own ${cat.ownedCount} of ${cat.total} types${ownedNames.length > 0 ? ` (${ownedNames.join('; ')})` : ''}. City: ${cityLine}. The bare stretches, hottest need first: ${holeLines}.`,
    };
  }

  // ─── quadrant:<face>:<mode> — G13, the annotation beside the plot.
  // Abstains (whole scope) until there is something PERSONAL to read:
  // owned pieces for the pieces face, owned brands or style directions for
  // the makers face. The FIX blurb and FIT corner counts carry the screen
  // when this slot is absent.
  if (scope.startsWith('quadrant:')) {
    const rest = scope.slice(9);
    const sep = rest.indexOf(':');
    if (sep < 0) return null;
    const face = rest.slice(0, sep) as QuadrantFace;
    const modeId = rest.slice(sep + 1) as QuadrantMode;
    if ((face !== 'pieces' && face !== 'makers') || !quadrantMode(modeId) || quadrantMode(modeId).id !== modeId) return null;
    const archetypes = (profile?.archetypes || []).filter(Boolean);
    if (face === 'pieces' && model.ownedTotal === 0) return null;
    if (face === 'makers' && archetypes.length === 0 && model.ownership.brands.size === 0) return null;
    const def = quadrantMode(modeId);
    const dots = quadrantDots(model, face, modeId);
    const stats = quadrantStats(dots, climate.weighted);
    const ownedNames =
      face === 'pieces'
        ? [...model.ownership.names.values()].map((n) => n[0]).filter(Boolean).slice(0, 8)
        : [...new Set([...model.ownership.brands.values()])].slice(0, 8);
    return {
      facts: { s: scope, corners: stats.corners, ownedCorners: stats.ownedCorners, ownedNames },
      asks: {
        G13: 'One or two sentences beside the quadrant: what THIS axis pairing reveals about the wearer\u2019s own set \u2014 which corner their things cluster in, and the corner that argues for attention. Orientation from the counts given, never advice to buy.',
      },
      caps: { G13: 44 },
      user:
        `The plot: ${def.yAxis} (vertical) against ${def.xAxis} (horizontal); dots are ${face === 'makers' ? 'makers' : 'garment types'}. City: ${cityLine}.\n` +
        `Corner counts [top-left / top-right / bottom-left / bottom-right] \u2014 corners mean [${def.corners.join(' / ')}]: all ${stats.corners.join(' / ')}; theirs ${stats.ownedCorners.join(' / ')}.\n` +
        `Their own ${face === 'makers' ? 'makers' : 'pieces'} on the plot: ${ownedNames.join(', ') || 'none'}.\n` +
        `The wearer \u2014 ${profileLine(profile)}.`,
    };
  }

  // ─── jump:<query> — G11, the did-you-mean line on a miss
  if (scope.startsWith('jump:')) {
    const query = scope.slice(5).trim();
    if (query.length < 3) return null;
    const candidates = fuzzyCandidates(query);
    if (candidates.length === 0) return null;
    return {
      facts: { s: scope, candidates },
      asks: {
        G11: 'One line for a search that matched nothing: what the reader probably meant, chosen ONLY from the candidate names given \u2014 \u201cDid you mean \u2026\u201d with at most two names. If none is plausible, return null.',
      },
      caps: { G11: 22 },
      user: `The query that matched nothing: \u201c${query}\u201d.\nCandidate names from the Index (the only names you may offer): ${candidates.join(', ')}.`,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// The generation job — one call per scope, all its slots at once.
// ---------------------------------------------------------------------------

async function generateScope(request: ScopeRequest): Promise<SlotTexts | null> {
  const slotIds = Object.keys(request.asks);
  const askLines = slotIds.map((id) => `\u00b7 "${id}" \u2014 ${request.asks[id]} At most ${request.caps[id]} words.`).join('\n');
  const raw = await callClaude({
    model: CLAUDE_HAIKU,
    system: [
      VOICE,
      {
        text:
          `Task: write the generated slots for ONE screen of the Index. The slots:\n${askLines}\n` +
          `Return STRICT JSON: {${slotIds.map((id) => `"${id}": "..." | null`).join(', ')}}. A slot you cannot support from the facts is null \u2014 never a hedge, never a placeholder.`,
        cache: true,
      },
    ],
    user: request.user,
    maxTokens: 700,
    temperature: 0.4,
  });
  if (!raw) return null;
  const parsed = parseJson(raw);
  if (!parsed || typeof parsed !== 'object') return null;
  const out: SlotTexts = {};
  for (const id of slotIds) {
    const value = parsed[id];
    out[id] =
      typeof value === 'string' && value.trim() && value.trim().toLowerCase() !== 'null'
        ? capWords(value, request.caps[id])
        : null;
  }
  return out;
}

// ---------------------------------------------------------------------------
// The hook GenSlot consumes — three states and no fourth.
// ---------------------------------------------------------------------------

export interface GenSlotState {
  state: 'absent' | 'pending' | 'ready';
  text: string | null;
}

const ABSENT: GenSlotState = { state: 'absent', text: null };

export function useIndexGenText(slot: string, scope?: string): GenSlotState {
  const ctx = useContext(IndexGenCtx);
  const scopeKey = (scope || '').trim();

  const request = useMemo(
    () => (ctx && scopeKey ? buildScopeRequest(scopeKey, ctx.model, ctx.profile) : null),
    [ctx, scopeKey],
  );
  const asked = !!request && slot in request.asks;
  const cacheKey = request ? `ethaion:index-gen:v1:${scopeKey}:${fingerprint({ f: request.facts, p: (ctx?.profile?.archetypes || []).join(',') })}` : '';

  const [texts, setTexts] = useState<SlotTexts | null>(() => (cacheKey ? readCache(cacheKey) : null));

  useEffect(() => {
    if (!request || !cacheKey) {
      setTexts(null);
      return;
    }
    const cached = readCache(cacheKey);
    if (cached) {
      setTexts(cached);
      return;
    }
    if (failedThisSession.has(cacheKey)) {
      setTexts(null);
      return;
    }
    setTexts(null);
    let alive = true;
    // A short settle so a screen passed through (or facts still loading in)
    // never burns a call.
    const timer = window.setTimeout(() => {
      const job = inflight.get(cacheKey) || generateScope(request).finally(() => inflight.delete(cacheKey));
      inflight.set(cacheKey, job);
      job
        .then((result) => {
          if (!result) {
            failedThisSession.add(cacheKey);
            return;
          }
          writeCache(cacheKey, result);
          if (alive) setTexts(result);
        })
        .catch(() => failedThisSession.add(cacheKey));
    }, 900);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  if (!asked) return ABSENT;
  if (texts) {
    const text = texts[slot];
    return text ? { state: 'ready', text } : ABSENT;
  }
  if (failedThisSession.has(cacheKey)) return ABSENT;
  return { state: 'pending', text: null };
}
