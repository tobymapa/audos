/**
 * THE INDEX · TAB COPY — every line of Beau's own words on the rebuilt
 * Index tab (Pieces + Makers faces). NOTHING here is a static label: each
 * hook writes against the reader's actual record — their city and climate
 * curve, the pieces on their ledger, the gaps their board names, their
 * colouring, proportions and style directions — and caches the result on a
 * fingerprint of those facts, so the words re-write themselves only when
 * the wardrobe or the profile changes.
 *
 * While a call is in flight (or the model is unreachable) every hook
 * returns a DETERMINISTIC fallback COMPUTED from the same per-user facts,
 * so the page is personalised from the first paint and no fixed
 * placeholder string ever ships.
 *
 * Three surfaces:
 *  · useCategoryVerdicts — the verdict + recommendation paragraph under
 *    each category header on the Pieces face.
 *  · useBeauFifty — the fifty-maker shortlist the Makers face leads with:
 *    fifty houses chosen for THIS reader from the merged directory, each
 *    with a one-line justification.
 *  · usePieceBeauRead — Beau's read of one garment TYPE.
 *  · useLedgerPieceRead — Beau's read of ONE PIECE THE READER OWNS, at the
 *    top of the detail card their own row opens.
 */
import { useEffect, useMemo, useState } from 'react';
import { CLAUDE_HAIKU, CLAUDE_SONNET, callClaude } from './claude';
import { capWord, numberWord } from './mono-type';
import { archetypeLabel, type DirectoryEntry } from './brands';
import { INDEX_GARMENT_TYPES, type GarmentCategoryId, type GarmentType } from './garment-types';
import {
  computeCategoryPieceFacts,
  daysInSpan,
  spanOf,
  verdictFor,
  type IndexModel,
  type LedgerPieceRead,
} from './index-model';
import type { StyleProfile, WardrobePiece } from './profile-data';

// ---------------------------------------------------------------------------
// Fingerprint + cache — the words re-write only when the facts change.
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

const memoryCache = new Map<string, unknown>();
const inflight = new Map<string, Promise<unknown>>();

function readCache<T>(key: string): T | null {
  const inMemory = memoryCache.get(key);
  if (inMemory) return inMemory as T;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as T;
    memoryCache.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: unknown): void {
  memoryCache.set(key, value);
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable — the memory copy carries the session */
  }
}

function profileSignature(profile: StyleProfile | null): Record<string, unknown> {
  if (!profile) return { none: true };
  return {
    archetypes: profile.archetypes || [],
    occasions: profile.occasions || [],
    city: profile.lifestyle?.city || null,
    build: profile.build || null,
    skin: profile.skin_tone || null,
    materials: profile.materials || null,
    updated: profile.updated_at || null,
  };
}

function profileLine(profile: StyleProfile | null, city: string | null): string {
  const bits: string[] = [];
  const archetypes = (profile?.archetypes || []).filter(Boolean);
  if (archetypes.length > 0) bits.push(`style directions: ${archetypes.map((a) => archetypeLabel(a)).join(', ')}`);
  const occasions = (profile?.occasions || []).filter(Boolean);
  if (occasions.length > 0) bits.push(`dresses for: ${occasions.join(', ')}`);
  if (profile?.build) bits.push(`build: ${profile.build}`);
  if (profile?.skin_tone) bits.push(`colouring: ${profile.skin_tone}`);
  const homeCity = city || profile?.lifestyle?.city || null;
  if (homeCity) bits.push(`home city: ${homeCity}`);
  if (profile?.materials) bits.push(`materials they favour: ${profile.materials}`);
  return bits.length > 0 ? bits.join(' · ') : 'no dossier on file yet — write to the wardrobe facts alone';
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

function cleanLine(value: unknown, max = 260): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}

const VOICE = {
  text:
    'You are Beau, the valet voice of a classic-menswear wardrobe app. You write the working copy of THE INDEX — the reference wing listing every classic garment type and every maker on file, with the wearer\u2019s own record drawn over it. Register: quiet, knowing, concrete, lightly British; short declarative sentences; no exclamation marks, no marketing, no emoji. Write TO the wearer (\u201cyou\u201d). Personalise strictly from the facts provided — their city, colouring, proportions, style directions, what they own and the gaps their board names. Never invent ownership, never name a piece, maker or place that is not in the facts. Numbers under one hundred are written as words. Return STRICT JSON only — no prose around it.',
  cache: true,
};

// ---------------------------------------------------------------------------
// Shared facts — what the reader owns and lacks, per category.
// ---------------------------------------------------------------------------

interface CategoryFacts {
  id: string;
  name: string;
  total: number;
  owned: number;
  ownedNames: string[];
  gapNames: string[];
  /** Ledger pieces in this category — the SAME categorisation the band
   * strip counts with (index-model computeCategoryPieceFacts), so the copy
   * can never say "nothing on your ledger" while a band counts a piece. */
  piecesLogged: number;
  pieceNames: string[];
}

function categoryFactsOf(model: IndexModel, pieces: WardrobePiece[]): CategoryFacts[] {
  const pieceFacts = computeCategoryPieceFacts(pieces);
  return model.categories.map((cat) => {
    const ids = cat.runs.flatMap((r) => r.typeIds);
    const ownedNames: string[] = [];
    const gapNames: string[] = [];
    for (const id of ids) {
      const names = model.ownership.names.get(id);
      if (names && names.length > 0 && ownedNames.length < 6) ownedNames.push(names[0]);
      if (model.gaps.has(id) && gapNames.length < 4) {
        const t = INDEX_GARMENT_TYPES.find((x) => x.id === id);
        if (t) gapNames.push(t.name);
      }
    }
    const logged = pieceFacts[cat.id] || { count: 0, names: [] };
    return {
      id: cat.id,
      name: cat.name,
      total: cat.total,
      owned: cat.ownedCount,
      ownedNames,
      gapNames,
      piecesLogged: logged.count,
      pieceNames: logged.names,
    };
  });
}

// ---------------------------------------------------------------------------
// CATEGORY VERDICTS — the paragraph under each category header.
// ---------------------------------------------------------------------------

export interface CategoryVerdicts {
  /** categoryId → Beau's verdict + recommendation for THIS reader. */
  verdicts: Record<string, string>;
  generated: boolean;
}

function categoryVerdictFallback(facts: CategoryFacts[], city: string | null): CategoryVerdicts {
  const verdicts: Record<string, string> = {};
  for (const cat of facts) {
    const carrier = (cat.pieceNames[0] || cat.ownedNames[0] || '').toLowerCase();
    const gap = (cat.gapNames[0] || '').toLowerCase();
    if (cat.piecesLogged > 0) {
      const count = cat.piecesLogged > 99 ? String(cat.piecesLogged) : numberWord(cat.piecesLogged);
      verdicts[cat.id] =
        `${capWord(count)} piece${cat.piecesLogged === 1 ? '' : 's'} of ${cat.name.toLowerCase()} on your ledger` +
        (carrier ? ` — your ${carrier} carries the run` : '') +
        (gap
          ? `. The ${gap} is the hole worth filling${city ? ` for ${city}` : ''}.`
          : city
            ? `. Against ${city}'s year, that is a sound base — buy for the bands you live in, not the ones you visit.`
            : `. Set your city in the Dossier and the verdicts sharpen.`);
    } else {
      verdicts[cat.id] =
        `Nothing of ${cat.name.toLowerCase()} on your ledger yet — ` +
        (gap
          ? `start with the ${gap}; your board already names it.`
          : `an open run. Log a piece and Beau reads it against ${city ? `${city}'s` : 'your'} climate.`);
    }
  }
  return { verdicts, generated: false };
}

async function generateCategoryVerdicts(
  facts: CategoryFacts[],
  city: string | null,
  profile: StyleProfile | null,
): Promise<CategoryVerdicts | null> {
  const catLines = facts
    .map((cat) => {
      const logged =
        cat.piecesLogged > 0
          ? ` · pieces on their ledger: ${cat.piecesLogged}${cat.pieceNames.length > 0 ? ` (${cat.pieceNames.join(', ')})` : ''}`
          : ' · pieces on their ledger: none';
      const gaps = cat.gapNames.length > 0 ? ` · named gaps: ${cat.gapNames.join(', ')}` : '';
      return `- id "${cat.id}" · ${cat.name} · ${cat.total} types${logged}${gaps}`;
    })
    .join('\n');
  const raw = await callClaude({
    model: CLAUDE_HAIKU,
    system: [
      VOICE,
      {
        text:
          'Task: the PIECES face of the Index. Under each category header sits Beau\u2019s verdict for THIS wearer: 1\u20132 short sentences (max 230 characters) reading the category against the pieces they have ACTUALLY logged — the exact counts and names given per category; never contradict them (if pieces are listed they own them, if none are listed they own none) — plus their colouring, proportions, lifestyle, city and climate — a verdict AND a recommendation (what carries the run, what the next buy should be, or what to skip). Different for every wearer and every category; never generic. Return JSON: {"verdicts": {"<categoryId>": "..."}}. Include EVERY category id given.',
        cache: true,
      },
    ],
    user: `The wearer — ${profileLine(profile, city)}.\nCity the verdicts read against: ${city || 'not set'}.\n\nThe categories:\n${catLines}`,
    maxTokens: 1800,
    temperature: 0.5,
  });
  const parsed = parseJson(raw);
  if (!parsed || typeof parsed !== 'object') return null;
  const fallback = categoryVerdictFallback(facts, city);
  const verdicts: Record<string, string> = {};
  for (const cat of facts) {
    verdicts[cat.id] = cleanLine(parsed.verdicts?.[cat.id], 300) || fallback.verdicts[cat.id];
  }
  return { verdicts, generated: true };
}

export function useCategoryVerdicts(profile: StyleProfile | null, model: IndexModel, pieces: WardrobePiece[]): CategoryVerdicts {
  const facts = useMemo(() => categoryFactsOf(model, pieces), [model, pieces]);
  const city = model.climate.city;
  const fp = useMemo(() => fingerprint({ facts, city, profile: profileSignature(profile) }), [facts, city, profile]);
  const key = `ethaion:index-tab-copy:v2:cats:${fp}`;
  const fallback = useMemo(() => categoryVerdictFallback(facts, city), [facts, city]);
  const [copy, setCopy] = useState<CategoryVerdicts | null>(() => readCache<CategoryVerdicts>(key));

  useEffect(() => {
    const cached = readCache<CategoryVerdicts>(key);
    if (cached) {
      setCopy(cached);
      return;
    }
    setCopy(null);
    let alive = true;
    // A short settle so a wardrobe still loading in doesn't burn a call on
    // provisional facts.
    const timer = window.setTimeout(() => {
      const job =
        (inflight.get(key) as Promise<CategoryVerdicts | null>) ||
        generateCategoryVerdicts(facts, city, profile).finally(() => inflight.delete(key));
      inflight.set(key, job);
      job
        .then((result) => {
          if (!result) return;
          writeCache(key, result);
          if (alive) setCopy(result);
        })
        .catch(() => undefined);
    }, 1200);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return copy || fallback;
}

// ---------------------------------------------------------------------------
// BEAU'S FIFTY — the curated maker shortlist the Makers face leads with.
// ---------------------------------------------------------------------------

export interface BeauPick {
  /** The maker's name, exactly as the directory holds it. */
  brand: string;
  /** One line: why this house, for THIS reader. */
  why: string;
  rank: number;
}

export interface BeauFifty {
  picks: BeauPick[];
  generated: boolean;
}

/** maker name (lowercased) → the categories the canon says they make. */
const MAKER_CATS: Map<string, Set<GarmentCategoryId>> = (() => {
  const map = new Map<string, Set<GarmentCategoryId>>();
  for (const t of INDEX_GARMENT_TYPES) {
    for (const m of t.makers) {
      const key = m.toLowerCase();
      const set = map.get(key) || new Set<GarmentCategoryId>();
      set.add(t.category);
      map.set(key, set);
    }
  }
  return map;
})();

function isStub(e: DirectoryEntry): boolean {
  const p = e.profile;
  return (p.priceRangeLabel === '—' || !p.priceRangeLabel) && (p.materials || []).length === 0;
}

function priceNew(e: DirectoryEntry): string {
  const label = (e.profile.priceRangeLabel || '').trim();
  if (!label || label === '—') return 'price unread';
  const m = label.match(/\(([^)]+)\)/);
  return m ? m[1] : label;
}

interface FiftyFacts {
  city: string | null;
  ownedBrands: string[];
  gapNames: string[];
  gapCategories: string[];
}

function fiftyFactsOf(model: IndexModel, pieces: WardrobePiece[]): FiftyFacts {
  const ownedBrands = [...new Set(pieces.map((p) => (p.brand || '').trim()).filter(Boolean))].slice(0, 20);
  const gapNames: string[] = [];
  const gapCategories = new Set<string>();
  for (const id of model.gaps.keys()) {
    const t = INDEX_GARMENT_TYPES.find((x) => x.id === id);
    if (!t) continue;
    if (gapNames.length < 6) gapNames.push(t.name);
    gapCategories.add(t.category);
  }
  return { city: model.climate.city, ownedBrands, gapNames, gapCategories: [...gapCategories] };
}

const RATING_SCORE: Record<string, number> = { Excellent: 4, Reliable: 3, Inconsistent: 1, Avoid: 0 };

/** Deterministic shortlist — the same facts the model reads, as arithmetic. */
function fiftyFallback(entries: DirectoryEntry[], facts: FiftyFacts, profile: StyleProfile | null): BeauFifty {
  const archetypes = new Set((profile?.archetypes || []).filter(Boolean));
  const ownedKeys = new Set(facts.ownedBrands.map((b) => b.toLowerCase()));
  const gapCats = new Set(facts.gapCategories);
  const scored = entries
    .filter((e) => e.source !== 'user' && !isStub(e))
    .map((e) => {
      const p = e.profile;
      const key = p.brand.toLowerCase();
      const cats = MAKER_CATS.get(key) || new Set<GarmentCategoryId>();
      const archOverlap = (p.archetypes || []).filter((a) => archetypes.has(a)).length;
      const answersGap = [...cats].some((c) => gapCats.has(c));
      const onLedger = ownedKeys.has(key);
      let score = (RATING_SCORE[e.rating] ?? 1) * 3 + (Number.isFinite(p.qualityScore) ? p.qualityScore : 5);
      score += Math.min(archOverlap, 2) * 3;
      if (answersGap) score += 4;
      if (onLedger) score += 3;
      let why: string;
      if (answersGap) {
        const gapCat = [...cats].find((c) => gapCats.has(c));
        why = `Answers the ${String(gapCat).replace(/-/g, ' ')} gap your board names — ${p.construction && p.construction !== '—' ? p.construction.toLowerCase() : 'honest make'} at ${priceNew(e)}.`;
      } else if (onLedger) {
        why = `Already proven on your ledger — ${p.constructionQuality.toLowerCase()} construction that repays rewearing.`;
      } else if (archOverlap > 0) {
        const a = (p.archetypes || []).find((x) => archetypes.has(x));
        why = `Sits square in your ${archetypeLabel(a || '').toLowerCase()} direction at ${priceNew(e)}.`;
      } else {
        why = `${p.country !== '—' ? `${p.country} — ` : ''}Beau rates the make ${Number.isFinite(p.qualityScore) ? p.qualityScore : 5}/10 for the money.`;
      }
      return { brand: p.brand, why, score };
    })
    .sort((a, b) => b.score - a.score || a.brand.localeCompare(b.brand));
  // THE COVERAGE RULE. A shortlist ranked on score alone clusters on the
  // categories the catalog is deepest in (shoes, outerwear) and can leave a
  // whole kind of piece unrepresented — so the fifty are drawn round-robin
  // across the eleven categories, strongest house first within each, and the
  // remaining places go to the next-best whatever they make. Every piece type
  // therefore reaches the recommendations, and the arrow from a piece row
  // still has the whole file behind it (index-maker-rows makersForCategory
  // guarantees at least ten there).
  const byCategory = new Map<string, Array<{ brand: string; why: string; score: number }>>();
  for (const s of scored) {
    for (const cat of MAKER_CATS.get(s.brand.toLowerCase()) || new Set<GarmentCategoryId>()) {
      const list = byCategory.get(cat) || [];
      list.push(s);
      byCategory.set(cat, list);
    }
  }
  const chosen: Array<{ brand: string; why: string }> = [];
  const taken = new Set<string>();
  const cats = [...byCategory.keys()];
  let round = 0;
  while (chosen.length < 50 && round < 12) {
    let addedThisRound = false;
    for (const cat of cats) {
      if (chosen.length >= 50) break;
      const list = byCategory.get(cat) || [];
      const next = list.find((s) => !taken.has(s.brand));
      if (!next) continue;
      taken.add(next.brand);
      chosen.push(next);
      addedThisRound = true;
    }
    if (!addedThisRound) break;
    round += 1;
  }
  for (const s of scored) {
    if (chosen.length >= 50) break;
    if (taken.has(s.brand)) continue;
    taken.add(s.brand);
    chosen.push(s);
  }
  return {
    picks: chosen.slice(0, 50).map((s, i) => ({ brand: s.brand, why: s.why, rank: i + 1 })),
    generated: false,
  };
}

async function generateFifty(
  entries: DirectoryEntry[],
  facts: FiftyFacts,
  profile: StyleProfile | null,
): Promise<BeauFifty | null> {
  const candidates = entries.filter((e) => e.source !== 'user' && !isStub(e));
  if (candidates.length === 0) return null;
  const lines = candidates
    .map((e) => {
      const p = e.profile;
      const cats = [...(MAKER_CATS.get(p.brand.toLowerCase()) || [])].join('/');
      return `- ${p.brand} · ${p.country}${p.city ? ` (${p.city})` : ''} · ${priceNew(e)} · quality ${p.qualityScore}/10 · rating ${e.rating}${cats ? ` · makes ${cats}` : ''} · ${(p.description || '').slice(0, 90)}`;
    })
    .join('\n');
  const want = Math.min(50, candidates.length);
  const task = {
    text:
      `Task: BEAU'S FIFTY — the curated maker shortlist heading the Index's Makers face. From the CANDIDATES ONLY (never a name outside the list), choose the ${want} houses that serve THIS wearer best — weigh their style directions, colouring, proportions, budget signals, city and climate, what they already own and the gaps their board names. Order matters: strongest first. COVER THE WHOLE WARDROBE: every kind of piece named in the candidates\u2019 \u201cmakes\u201d field must be answered by several houses \u2014 never fill the list with shoes and outerwear because the file is deepest there. For each, "why" is ONE line (max 110 characters), specific to this wearer — the piece it answers, the direction it serves, or the gap it fills; never a generic compliment. Return JSON: {"picks": [{"name": "<exact candidate name>", "why": "..."}]} — exactly ${want} picks, names verbatim from the candidate list.`,
    cache: true,
  };
  const user =
    `The wearer — ${profileLine(profile, facts.city)}.\n` +
    `City: ${facts.city || 'not set'}.\n` +
    `Makers already on their ledger: ${facts.ownedBrands.join(', ') || 'none yet'}.\n` +
    `Gaps their board names: ${facts.gapNames.join(', ') || 'none named'}.\n\nCANDIDATES:\n${lines}`;
  let raw = await callClaude({ model: CLAUDE_SONNET, system: [VOICE, task], user, maxTokens: 3800, temperature: 0.4 });
  if (!raw) raw = await callClaude({ model: CLAUDE_HAIKU, system: [VOICE, task], user, maxTokens: 3800, temperature: 0.4 });
  const parsed = parseJson(raw);
  const rawPicks: any[] = Array.isArray(parsed?.picks) ? parsed.picks : [];
  if (rawPicks.length === 0) return null;
  const byKey = new Map(candidates.map((e) => [e.profile.brand.toLowerCase(), e.profile.brand]));
  const seen = new Set<string>();
  const picks: BeauPick[] = [];
  for (const p of rawPicks) {
    const name = byKey.get(String(p?.name || '').trim().toLowerCase());
    if (!name || seen.has(name)) continue;
    seen.add(name);
    picks.push({ brand: name, why: cleanLine(p?.why, 150) || 'Chosen against your record.', rank: picks.length + 1 });
    if (picks.length >= 50) break;
  }
  if (picks.length === 0) return null;
  // The model came back short — top up from the deterministic ranking so
  // the shortlist still counts fifty (or every candidate, if fewer exist).
  if (picks.length < want) {
    const fallback = fiftyFallback(entries, facts, profile);
    for (const f of fallback.picks) {
      if (picks.length >= want) break;
      if (seen.has(f.brand)) continue;
      seen.add(f.brand);
      picks.push({ ...f, rank: picks.length + 1 });
    }
  }
  return { picks, generated: true };
}

export function useBeauFifty(
  profile: StyleProfile | null,
  pieces: WardrobePiece[],
  model: IndexModel,
  entries: DirectoryEntry[],
): BeauFifty {
  const facts = useMemo(() => fiftyFactsOf(model, pieces), [model, pieces]);
  const candidateNames = useMemo(
    () =>
      entries
        .filter((e) => e.source !== 'user' && !isStub(e))
        .map((e) => e.profile.brand)
        .sort(),
    [entries],
  );
  const fp = useMemo(
    () => fingerprint({ facts, candidateNames, profile: profileSignature(profile) }),
    [facts, candidateNames, profile],
  );
  const key = `ethaion:index-tab-copy:v1:fifty:${fp}`;
  const fallback = useMemo(() => fiftyFallback(entries, facts, profile), [entries, facts, profile]);
  const [copy, setCopy] = useState<BeauFifty | null>(() => readCache<BeauFifty>(key));

  useEffect(() => {
    const cached = readCache<BeauFifty>(key);
    if (cached) {
      setCopy(cached);
      return;
    }
    setCopy(null);
    if (candidateNames.length === 0) return;
    let alive = true;
    // Settle so the directory and ledger both land before the call spends.
    const timer = window.setTimeout(() => {
      const job =
        (inflight.get(key) as Promise<BeauFifty | null>) ||
        generateFifty(entries, facts, profile).finally(() => inflight.delete(key));
      inflight.set(key, job);
      job
        .then((result) => {
          if (!result) return;
          writeCache(key, result);
          if (alive) setCopy(result);
        })
        .catch(() => undefined);
    }, 1500);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return copy || fallback;
}

// ---------------------------------------------------------------------------
// PIECE READ — Beau's paragraph at the top of a type's inline entry.
// ---------------------------------------------------------------------------

function pieceReadFallback(type: GarmentType, model: IndexModel): string {
  const span = spanOf(type);
  const days = daysInSpan(model.climate, span);
  const gap = model.gaps.has(type.id);
  const ownedNames = model.ownership.names.get(type.id) || [];
  const city = model.climate.city;
  const verdict = verdictFor(model.climate, type, gap);
  const dayLine = days != null ? `about ${days > 99 ? String(days) : numberWord(days)} days a year${city ? ` in ${city}` : ''}` : null;
  if (ownedNames.length > 0) {
    return (
      `Your ${ownedNames[0].toLowerCase()} answers this${dayLine ? ` — ${dayLine}` : ''}. ` +
      (verdict === 'wrong tool'
        ? 'A narrow tool where you live — keep it for travel rather than doubling up.'
        : 'Buy a second only when the first wears through.')
    );
  }
  if (gap) {
    return `A gap your board already names${dayLine ? ` — it would earn ${dayLine}` : ''}. ${
      type.makers[0] ? `${type.makers[0]} is the reference to start with.` : 'Start with the makers listed below.'
    }`;
  }
  if (verdict === 'wrong tool') {
    return `For ${city || 'your climate'}, the wrong tool${dayLine ? ` — ${dayLine}` : ''}. Spend elsewhere first.`;
  }
  if (verdict === 'essential') {
    return `Nothing on your ledger answers this yet${dayLine ? `, and it would earn ${dayLine}` : ''} — a strong next buy.`;
  }
  return `Not on your ledger${dayLine ? ` — it would see ${dayLine}` : ''}. ${
    city ? 'Sound, not urgent — fill your named gaps first.' : 'Set your city in the Dossier and Beau weighs it for you.'
  }`;
}

export function usePieceBeauRead(type: GarmentType | null, model: IndexModel, profile: StyleProfile | null): string | null {
  const city = model.climate.city;
  const factKey = useMemo(() => {
    if (!type) return null;
    const span = spanOf(type);
    return fingerprint({
      id: type.id,
      city,
      days: daysInSpan(model.climate, span),
      owned: model.ownership.names.get(type.id) || [],
      gap: model.gaps.has(type.id),
      profile: profileSignature(profile),
    });
  }, [type, city, model, profile]);
  const key = type && factKey ? `ethaion:index-tab-copy:v1:piece:${type.id}:${factKey}` : null;
  const [copy, setCopy] = useState<string | null>(() => (key ? readCache<string>(key) : null));

  useEffect(() => {
    if (!type || !key) return;
    const cached = readCache<string>(key);
    if (cached) {
      setCopy(cached);
      return;
    }
    setCopy(null);
    let alive = true;
    const span = spanOf(type);
    const days = daysInSpan(model.climate, span);
    const gap = model.gaps.has(type.id);
    const ownedNames = model.ownership.names.get(type.id) || [];
    const verdict = verdictFor(model.climate, type, gap);
    const job =
      (inflight.get(key) as Promise<string | null>) ||
      callClaude({
        model: CLAUDE_HAIKU,
        system: [
          VOICE,
          {
            text:
              'Task: ONE GARMENT TYPE\u2019S inline entry on the Index. Write Beau\u2019s read for THIS wearer: 1\u20132 short sentences (max 280 characters) — whether this type earns a place in their wardrobe, read from their climate, what they already own of it, the gap status and their profile; end with a concrete recommendation (buy, skip, or which maker to start with — only makers from the facts). Return JSON: {"read": "..."}.',
            cache: true,
          },
        ],
        user:
          `The wearer — ${profileLine(profile, city)}.\n` +
          `The type: ${type.name} (${type.category})${span ? ` · answers ${span.lo}\u2013${span.hi}\u00b0 apparent` : ' · judged by material and place'}.\n` +
          `Days a year it would earn${city ? ` in ${city}` : ''}: ${days != null ? days : 'unknown — no city set'}.\n` +
          `The arithmetic verdict: ${verdict || 'unweighted'}.\n` +
          `They own of it: ${ownedNames.join(', ') || 'nothing'}.\n` +
          `A gap their board names: ${gap ? 'yes' : 'no'}.\n` +
          `Verified makers: ${type.makers.slice(0, 6).join(', ') || 'none on file'}.`,
        maxTokens: 300,
        temperature: 0.5,
      })
        .then((raw) => cleanLine(parseJson(raw)?.read, 320))
        .finally(() => inflight.delete(key));
    inflight.set(key, job);
    job
      .then((text) => {
        if (!text) return;
        writeCache(key, text);
        if (alive) setCopy(text);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!type) return null;
  return copy || pieceReadFallback(type, model);
}

// ---------------------------------------------------------------------------
// ONE PIECE THE READER OWNS — Beau's read at the top of the detail card a
// piece row opens on the Pieces face.
// ---------------------------------------------------------------------------

function pieceFactLines(read: LedgerPieceRead, model: IndexModel, siblings: number): string[] {
  const p = read.piece;
  const city = model.climate.city;
  const days = read.span ? daysInSpan(model.climate, read.span) : null;
  const where = city ? ' in ' + city : '';
  const dayCount = days != null ? String(days) : 'unknown';
  const lines = [
    `The piece, in their own words: “${p.name}”.`,
    `Category: ${read.category || 'unplaced'}.`,
    `Maker: ${read.brand || 'none recorded'}.`,
    `Cloth: ${read.material || 'not recorded'}.`,
    `Colours: ${(p.colors || []).join(', ') || 'not recorded'}.`,
    `Seasons tagged: ${(p.seasons || []).join(', ') || 'none'}.`,
    read.span
      ? `Comfortable range read from the piece: ${read.span.lo}–${read.span.hi}° apparent.`
      : 'No temperature range — judged by material and place, not weather.',
    'Days a year that range earns' + where + ': ' + dayCount + '.',
    'Other pieces they own in the same category: ' + siblings + '.',
  ];
  if (read.type) {
    lines.push('The garment type it answers to: ' + read.type.name + '.');
    lines.push('Verified makers of that type: ' + (read.type.makers.slice(0, 6).join(', ') || 'none on file') + '.');
  }
  return lines;
}

/** The deterministic read — the same facts, as arithmetic, so the card is
 * personalised from the first paint whether or not a call lands. */
function ledgerPieceFallback(read: LedgerPieceRead, model: IndexModel, siblings: number): string {
  const city = model.climate.city;
  const days = read.span ? daysInSpan(model.climate, read.span) : null;
  const spell = (n: number) => (n > 99 ? String(n) : numberWord(n));
  const dayLine = days != null ? 'about ' + spell(days) + ' days a year' + (city ? ' in ' + city : '') : null;
  const cloth = read.material ? read.material.toLowerCase() : null;
  if (!read.span) {
    const opener = cloth ? 'Weather does not judge this one — the ' + cloth + ' does.' : 'Weather does not judge this one.';
    return opener + ' It earns its place on how often it is the right register, not on the temperature.';
  }
  const range = read.span.lo + '–' + read.span.hi + '°';
  const opener = cloth ? capWord(cloth) + ' — it answers ' + range : 'It answers ' + range;
  const middle = dayLine ? ', which is ' + dayLine + '. ' : '. ';
  const close =
    read.span.hi - read.span.lo >= 20
      ? 'A wide band, so it carries most of your year — the piece to replace properly when it goes.'
      : siblings > 1
        ? 'You own ' + spell(siblings) + ' in this category; buy the next one for a band this does not reach.'
        : 'The only piece answering this stretch of your year — a second would earn its keep.';
  return opener + middle + close;
}

const OWNED_PIECE_TASK = {
  text:
    'Task: ONE PIECE THE WEARER ALREADY OWNS, opened from their own ledger on the Index. Write Beau\u2019s read of THAT PIECE for THIS wearer: one or two short sentences (max 300 characters) \u2014 what it is doing for them, read from its cloth, its colours, the temperature range it answers and how much of their year that range covers, plus their colouring, proportions and style directions; end with a concrete recommendation (wear it more in a named register, keep it for one job, replace it, or what to buy alongside it). Never invent a maker, a cloth or a piece that is not in the facts. Return JSON with one key, read.',
  cache: true,
};

export function useLedgerPieceRead(
  read: LedgerPieceRead | null,
  model: IndexModel,
  profile: StyleProfile | null,
  siblings = 0,
): string | null {
  const city = model.climate.city;
  const factKey = useMemo(() => {
    if (!read) return null;
    return fingerprint({
      id: read.piece.id,
      name: read.piece.name,
      cat: read.category,
      brand: read.brand,
      material: read.material,
      colors: read.piece.colors || [],
      span: read.span,
      city,
      siblings,
      profile: profileSignature(profile),
    });
  }, [read, city, siblings, profile]);
  const key = read && factKey ? 'ethaion:index-tab-copy:v1:owned:' + read.piece.id + ':' + factKey : null;
  const [copy, setCopy] = useState<string | null>(() => (key ? readCache<string>(key) : null));

  useEffect(() => {
    if (!read || !key) return;
    const cached = readCache<string>(key);
    if (cached) {
      setCopy(cached);
      return;
    }
    setCopy(null);
    let alive = true;
    const user = 'The wearer \u2014 ' + profileLine(profile, city) + '.\n' + pieceFactLines(read, model, siblings).join('\n');
    const job =
      (inflight.get(key) as Promise<string | null>) ||
      callClaude({
        model: CLAUDE_HAIKU,
        system: [VOICE, OWNED_PIECE_TASK],
        user,
        maxTokens: 320,
        temperature: 0.5,
      })
        .then((raw) => cleanLine(parseJson(raw)?.read, 340))
        .finally(() => inflight.delete(key));
    inflight.set(key, job);
    job
      .then((text) => {
        if (!text) return;
        writeCache(key, text);
        if (alive) setCopy(text);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!read) return null;
  return copy || ledgerPieceFallback(read, model, siblings);
}

/** The capitalised-word helper is re-exported for the tab's own fallbacks. */
export { capWord, numberWord };
