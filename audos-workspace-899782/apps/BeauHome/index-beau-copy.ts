/**
 * THE INDEX · BEAU'S OWN SMALL PRINT — every descriptive string on the
 * redesigned Index root list and the category plates (founder's visual
 * pass): the italic line under each category header, the plate's standfirst,
 * the coverage notes, the one-line run descriptions and the three-slot
 * annotation blocks at the foot of each page.
 *
 * NOTHING HERE IS A STATIC LABEL. Each surface makes ONE Haiku call that
 * writes the whole page's copy against the wearer's actual facts — their
 * city, what they own, the gaps their board names — and the result is
 * cached (localStorage + memory) on a fingerprint of those facts, so the
 * words only re-write themselves when the wardrobe or profile changes.
 *
 * While the call is in flight (or if the model is unreachable) the hooks
 * return a DETERMINISTIC fallback COMPUTED from the same per-user facts —
 * counts, owned names, gap names — so the page is personalised from the
 * first paint and no fixed placeholder string ever ships.
 */
import { useEffect, useMemo, useState } from 'react';
import { CLAUDE_HAIKU, callClaude } from './claude';
import { capWord, numberWord } from './mono-type';
import type { StyleProfile } from './profile-data';

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export interface IndexAnnotations {
  up: string;
  down: string;
  out: string;
}

export interface RootCategoryFact {
  id: string;
  name: string;
  total: number;
  owned: number;
  ownedNames: string[];
  gapNames: string[];
}

export interface RootIndexFacts {
  typeTotal: number;
  ownedTotal: number;
  city: string | null;
  categories: RootCategoryFact[];
}

export interface RootIndexCopy {
  /** categoryId → the italic line under the category header. */
  blurbs: Record<string, string>;
  /** The three small blocks at the foot of the root list — the structure,
   * the type/gap logic, the colour system. */
  annotations: IndexAnnotations;
  /** True once the model's own words replaced the computed fallback. */
  generated: boolean;
}

export interface PlateGroupFact {
  label: string;
  total: number;
  owned: number;
  ownedNames: string[];
  gapNames: string[];
}

export interface PlateFacts {
  categoryId: string;
  categoryName: string;
  total: number;
  owned: number;
  ownedNames: string[];
  gapNames: string[];
  /** The widest uncovered stretch of the category's ruler, if any. */
  holeLo: number | null;
  holeHi: number | null;
  city: string | null;
  groups: PlateGroupFact[];
  /** "#4 of 11" — where the plate sits in the category walk. */
  position: number;
  count: number;
}

export interface CategoryPlateCopy {
  /** 2–3 lines under the big category name. */
  description: string;
  /** Under "X of Y owned" — Beau's read of the wearer's coverage. */
  statNote: string;
  /** The rail beside the coverage ruler. */
  coverageNote: string;
  /** group label → its one-line description. */
  groupNotes: Record<string, string>;
  /** UP · DOWN · OUT — breadcrumb logic, dashed-vs-filled, the count. */
  annotations: IndexAnnotations;
  generated: boolean;
}

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
    materials: profile.materials || null,
    updated: profile.updated_at || null,
  };
}

function profileLine(profile: StyleProfile | null, city: string | null): string {
  const bits: string[] = [];
  const archetypes = (profile?.archetypes || []).filter(Boolean);
  if (archetypes.length > 0) bits.push(`style directions: ${archetypes.join(', ')}`);
  const occasions = (profile?.occasions || []).filter(Boolean);
  if (occasions.length > 0) bits.push(`dresses for: ${occasions.join(', ')}`);
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

function cleanLine(value: unknown, max = 240): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}

// ---------------------------------------------------------------------------
// The shared voice block — cached by Anthropic across both surfaces.
// ---------------------------------------------------------------------------

const VOICE = {
  text:
    'You are Beau, the valet voice of a classic-menswear wardrobe app. You write the small print of THE INDEX — the reference wing that lists every classic garment type, with the wearer\u2019s own coverage drawn over it. Register: quiet, knowing, concrete, lightly British; short declarative sentences; no exclamation marks, no marketing, no emoji. Write TO the wearer (\u201cyou\u201d). Personalise strictly from the facts provided — their city, what they own, the gaps their board names. Never invent ownership, never name a piece or a place that is not in the facts. Numbers under one hundred are written as words. Return STRICT JSON only — no prose around it.',
  cache: true,
};

// ---------------------------------------------------------------------------
// ROOT LIST copy.
// ---------------------------------------------------------------------------

function rootFallback(facts: RootIndexFacts): RootIndexCopy {
  const blurbs: Record<string, string> = {};
  for (const cat of facts.categories) {
    if (cat.owned > 0) {
      const carrier = (cat.ownedNames[0] || '').toLowerCase();
      const gap = (cat.gapNames[0] || '').toLowerCase();
      blurbs[cat.id] =
        `You own ${numberWord(cat.owned)} of the ${numberWord(cat.total)}` +
        (carrier ? ` — your ${carrier} carries the run` : '') +
        (gap ? `; the ${gap} is the named hole.` : '.');
    } else {
      blurbs[cat.id] = `${capWord(numberWord(cat.total))} types, none in your ledger yet — an open run.`;
    }
  }
  return {
    blurbs,
    annotations: {
      up:
        `One index, ${numberWord(facts.categories.length)} categories, ${facts.typeTotal} types — ` +
        `each category heads its own run, and its name opens the category's plate.`,
      down:
        `A type name opens its entry; a category name opens its plate; a tinted row with a dashed band is a gap your board has already named.`,
      out:
        `A filled band is a type you own, drawn where its temperature sits${facts.city ? ` against ${facts.city}` : ''}; ` +
        `grey is one you don't; dashed is the hole worth hunting.`,
    },
    generated: false,
  };
}

async function generateRootCopy(facts: RootIndexFacts, profile: StyleProfile | null): Promise<RootIndexCopy | null> {
  const catLines = facts.categories
    .map((cat) => {
      const owned = cat.ownedNames.length > 0 ? ` · owns: ${cat.ownedNames.join(', ')}` : '';
      const gaps = cat.gapNames.length > 0 ? ` · named gaps: ${cat.gapNames.join(', ')}` : '';
      return `- id "${cat.id}" · ${cat.name} · ${cat.total} types · ${cat.owned} owned${owned}${gaps}`;
    })
    .join('\n');
  const raw = await callClaude({
    model: CLAUDE_HAIKU,
    system: [
      VOICE,
      {
        text:
          'Task: the INDEX ROOT LIST. Every garment category heads its own run of rows (type name · temperature band · verdict). You write (1) one italic line under each category header — what this category is to THIS wearer, read from what they own and lack, at most 110 characters, no category name repeated at the start; and (2) the three small annotation blocks at the foot of the page: "up" explains how the index is structured (categories head runs; a category name opens its plate), "down" explains the type and gap logic (a type name opens its entry; a tinted, dash-banded row is a gap the wearer\u2019s board names), "out" explains the colour system (filled band = owned, grey = not owned, dashed = a named gap) — each at most 150 characters, personalised where the facts allow. Return JSON: {"blurbs": {"<categoryId>": "..."}, "annotations": {"up": "...", "down": "...", "out": "..."}}. Include EVERY category id given.',
        cache: true,
      },
    ],
    user: `The wearer — ${profileLine(profile, facts.city)}.\nCity the verdicts read against: ${facts.city || 'not set'}.\nThey own ${facts.ownedTotal} of ${facts.typeTotal} types overall.\n\nThe categories:\n${catLines}`,
    maxTokens: 1400,
    temperature: 0.5,
  });
  const parsed = parseJson(raw);
  if (!parsed || typeof parsed !== 'object') return null;
  const fallback = rootFallback(facts);
  const blurbs: Record<string, string> = {};
  for (const cat of facts.categories) {
    blurbs[cat.id] = cleanLine(parsed.blurbs?.[cat.id], 160) || fallback.blurbs[cat.id];
  }
  return {
    blurbs,
    annotations: {
      up: cleanLine(parsed.annotations?.up, 220) || fallback.annotations.up,
      down: cleanLine(parsed.annotations?.down, 220) || fallback.annotations.down,
      out: cleanLine(parsed.annotations?.out, 220) || fallback.annotations.out,
    },
    generated: true,
  };
}

export function useRootIndexCopy(profile: StyleProfile | null, facts: RootIndexFacts): RootIndexCopy {
  const fp = useMemo(() => fingerprint({ facts, profile: profileSignature(profile) }), [facts, profile]);
  const key = `ethaion:index-copy:v1:root:${fp}`;
  const fallback = useMemo(() => rootFallback(facts), [facts]);
  const [copy, setCopy] = useState<RootIndexCopy | null>(() => readCache<RootIndexCopy>(key));

  useEffect(() => {
    const cached = readCache<RootIndexCopy>(key);
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
        (inflight.get(key) as Promise<RootIndexCopy | null>) ||
        generateRootCopy(facts, profile).finally(() => inflight.delete(key));
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
// CATEGORY PLATE copy.
// ---------------------------------------------------------------------------

function plateFallback(facts: PlateFacts): CategoryPlateCopy {
  const groupNotes: Record<string, string> = {};
  for (const group of facts.groups) {
    groupNotes[group.label] =
      group.owned > 0
        ? `${capWord(numberWord(group.total))} types — your ${(group.ownedNames[0] || '').toLowerCase()} holds this run.`
        : `${capWord(numberWord(group.total))} types, none of them yours yet.`;
  }
  const hole =
    facts.holeLo !== null && facts.holeHi !== null ? `${facts.holeLo}–${facts.holeHi}°` : null;
  return {
    description:
      `${capWord(numberWord(facts.total))} types, ${numberWord(facts.groups.length)} runs, one ruler. ` +
      `Read down for what a run is; read across for what temperature it answers. ` +
      `Your own rack is drawn across the top in the same scale — the holes are where you have nothing to put on.`,
    statNote:
      facts.owned > 0
        ? `${capWord(numberWord(facts.owned))} of ${numberWord(facts.total)} — ${facts.ownedNames
            .slice(0, 2)
            .map((n) => n.toLowerCase())
            .join(' and ')} on your rack.`
        : `Nothing of this category in your ledger yet — the whole ruler is open.`,
    coverageNote:
      facts.owned > 0
        ? `${capWord(facts.ownedNames.slice(0, 2).map((n) => n.toLowerCase()).join(' and '))}${
            hole ? ` — and ${hole} is bare.` : '.'
          }`
        : `Nothing to draw yet${hole ? ` — ${hole} is bare` : ''}; log a piece and its band lands here.`,
    groupNotes,
    annotations: {
      up: `Back returns to the Index root — the breadcrumb, always top left; the arrows walk plate #${facts.position} of ${facts.count}.`,
      down: `A filled band is a type you own; a dashed band on a tinted row is a gap your board names — tap either for its entry.`,
      out:
        `"${facts.owned} of ${facts.total} owned" is the plate's own arithmetic${
          hole ? ` — hunting the ${hole} hole is how it fills` : ''
        }.`,
    },
    generated: false,
  };
}

async function generatePlateCopy(facts: PlateFacts, profile: StyleProfile | null): Promise<CategoryPlateCopy | null> {
  const groupLines = facts.groups
    .map((group) => {
      const owned = group.ownedNames.length > 0 ? ` · owns: ${group.ownedNames.join(', ')}` : '';
      const gaps = group.gapNames.length > 0 ? ` · named gaps: ${group.gapNames.join(', ')}` : '';
      return `- "${group.label}" · ${group.total} types · ${group.owned} owned${owned}${gaps}`;
    })
    .join('\n');
  const hole =
    facts.holeLo !== null && facts.holeHi !== null
      ? `${facts.holeLo}–${facts.holeHi}°C`
      : 'none — their pieces cover the ruler';
  const raw = await callClaude({
    model: CLAUDE_HAIKU,
    system: [
      VOICE,
      {
        text:
          'Task: ONE CATEGORY PLATE of the index — all of one garment category on one temperature ruler, the wearer\u2019s own coverage drawn over it. Write: "description" — two or three short sentences (max 320 chars) reading the whole category against this wearer: the counts, how to read the plate (down for runs, across for temperature), and where their holes are; "stat_note" — one sentence (max 150 chars) under the "X of Y owned" figure, naming what they own; "coverage_note" — one or two short sentences (max 210 chars) beside the ruler: what they can already put on and what stretch is bare; "group_notes" — for EVERY run label given, one line (max 120 chars) on what that run answers, read against the wearer; "annotations" — three small blocks: "up" the breadcrumb and back-arrow logic (back to the Index root; arrows walk the plates), "down" what a dashed band means against a filled one, "out" what the owned count means and how the plan fills (the hole is huntable) — each max 160 chars. Return JSON: {"description": "...", "stat_note": "...", "coverage_note": "...", "group_notes": {"<label>": "..."}, "annotations": {"up": "...", "down": "...", "out": "..."}}.',
        cache: true,
      },
    ],
    user:
      `The wearer — ${profileLine(profile, facts.city)}.\n` +
      `The category: ${facts.categoryName} — ${facts.total} types across ${facts.groups.length} runs; plate #${facts.position} of ${facts.count}.\n` +
      `They own ${facts.owned}: ${facts.ownedNames.join(', ') || 'nothing'}.\n` +
      `Gaps their board names: ${facts.gapNames.join(', ') || 'none'}.\n` +
      `The bare stretch of the ruler: ${hole}.\n` +
      `City the verdicts read against: ${facts.city || 'not set'}.\n\nThe runs:\n${groupLines}`,
    maxTokens: 1200,
    temperature: 0.5,
  });
  const parsed = parseJson(raw);
  if (!parsed || typeof parsed !== 'object') return null;
  const fallback = plateFallback(facts);
  const groupNotes: Record<string, string> = {};
  for (const group of facts.groups) {
    groupNotes[group.label] = cleanLine(parsed.group_notes?.[group.label], 170) || fallback.groupNotes[group.label];
  }
  return {
    description: cleanLine(parsed.description, 420) || fallback.description,
    statNote: cleanLine(parsed.stat_note, 210) || fallback.statNote,
    coverageNote: cleanLine(parsed.coverage_note, 280) || fallback.coverageNote,
    groupNotes,
    annotations: {
      up: cleanLine(parsed.annotations?.up, 220) || fallback.annotations.up,
      down: cleanLine(parsed.annotations?.down, 220) || fallback.annotations.down,
      out: cleanLine(parsed.annotations?.out, 220) || fallback.annotations.out,
    },
    generated: true,
  };
}

export function useCategoryPlateCopy(profile: StyleProfile | null, facts: PlateFacts): CategoryPlateCopy {
  const fp = useMemo(() => fingerprint({ facts, profile: profileSignature(profile) }), [facts, profile]);
  const key = `ethaion:index-copy:v1:plate:${facts.categoryId}:${fp}`;
  const fallback = useMemo(() => plateFallback(facts), [facts]);
  const [copy, setCopy] = useState<CategoryPlateCopy | null>(() => readCache<CategoryPlateCopy>(key));

  useEffect(() => {
    const cached = readCache<CategoryPlateCopy>(key);
    if (cached) {
      setCopy(cached);
      return;
    }
    setCopy(null);
    let alive = true;
    const timer = window.setTimeout(() => {
      const job =
        (inflight.get(key) as Promise<CategoryPlateCopy | null>) ||
        generatePlateCopy(facts, profile).finally(() => inflight.delete(key));
      inflight.set(key, job);
      job
        .then((result) => {
          if (!result) return;
          writeCache(key, result);
          if (alive) setCopy(result);
        })
        .catch(() => undefined);
    }, 700);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return copy || fallback;
}
