/**
 * THE HUNT · BEAU'S PICKS — the sub-category shortlist engine (August 2026
 * redesign).
 *
 * Unfolding a category no longer draws three loose pieces: it asks Beau for
 * the THREE SUB-CATEGORIES that matter most for THIS man inside it — read
 * from his ledger (what is covered, what is thin, what is a gap), his frame,
 * colouring, budgets, city and climate, and the registers he actually
 * dresses for. Each sub-category row carries a season tag, a status word
 * (COVERED · THIN · CLOSED · GAP · WHY HERE · WHY NOW), Beau's one-line
 * reason and the count he owns in it — and behind each row sits a TEN-PICK
 * page: ten real, researched pieces by real makers, priced against his own
 * budget for the category, each with Beau's quality call and the line saying
 * why this one for him.
 *
 * Every draw goes through the never-dead-end transport (claude.ts
 * `callModel`) and is cached against a fingerprint of the facts themselves,
 * exactly as the rest of the Hunt's engines are — so unfolding twice costs
 * nothing and logging a piece re-writes the shortlist by itself. Failure is
 * silent: the surface shows an empty shelf, never an error.
 */
import { CLAUDE_HAIKU, CLAUDE_SONNET, callModel, type ClaudeSystemBlock } from './claude';
import { findGarmentType } from './garment-types';
import { HUNT_CATEGORIES, huntCategory, type HuntCategory } from './hunt-model';
import { callsInCategory, huntReaderBrief, ownedInCategory, type HuntReader } from './hunt-reader';
import { fetchCategoryBudgets, formatBudget, getCurrency, type CategoryBudget } from './profile-data';

/** Three sub-categories per unfolded category — the founder's screens. */
export const SUB_PICKS_PER_CATEGORY = 3;
/** Ten picks on the page, held at ten. */
export const TEN_PICKS = 10;
/** The bench behind them — drawn in the same call so a removal is instant. */
const BENCH_SIZE = 3;

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export type HuntSubStatus = 'COVERED' | 'THIN' | 'CLOSED' | 'GAP' | 'WHY HERE' | 'WHY NOW';

export const HUNT_SUB_STATUSES: HuntSubStatus[] = ['COVERED', 'THIN', 'CLOSED', 'GAP', 'WHY HERE', 'WHY NOW'];

export interface HuntSubPick {
  /** The sub-category as Beau names it, e.g. "Oxford & poplin". */
  subName: string;
  /** Season / temperature tag, e.g. "all year", "14–22°". */
  seasonTag: string;
  status: HuntSubStatus;
  /** Beau's one-line reason this sub-category is on the shortlist. */
  reason: string;
  /** How many of his logged pieces fall inside it. */
  youOwn: number;
}

export type HuntPickTier = 'WELL UNDER' | 'INSIDE COMFORTABLE' | 'INSIDE STRETCHING';
export type HuntPickQuality = 'SOUND' | 'BUY FIRST' | 'NOT FOR YOU' | 'SPECIAL CASE';

export interface HuntTenPick {
  /** The piece as Beau names it — cut, cloth, colour. */
  pieceName: string;
  /** One real maker. */
  maker: string;
  /** The maker's or a trusted retailer's page, when Beau is sure of one. */
  retailerUrl: string | null;
  /** The garment-type id it answers (garment-types.ts) — the Index link. */
  garmentTypeId: string | null;
  /** Short tags, e.g. OATMEAL · BRITISH CUT · COTTON · UNDER €300. */
  tags: string[];
  /** The price, in his display currency. */
  price: string;
  /** Where the price sits against HIS budget for this category. */
  priceTier: HuntPickTier;
  /** Beau's quality call on the piece for this man. */
  quality: HuntPickQuality;
  /** Why this one, for him — one line. */
  why: string;
}

export interface HuntTenPicksSheet {
  /** The row's own line, restated. */
  summary: string;
  /** 1–2 sentences on what Beau is specifically picking for him here. */
  explanation: string;
  /** The ten on the page. */
  picks: HuntTenPick[];
  /** The bench behind them — promoted one by one as picks are removed. */
  bench: HuntTenPick[];
}

// ---------------------------------------------------------------------------
// Cache — memory first, then localStorage, keyed on the facts themselves.
// ---------------------------------------------------------------------------

const SUBS_PREFIX = 'ethaion:hunt-subpicks:v1:';
const TEN_PREFIX = 'ethaion:hunt-tenpicks:v1:';
const subsMemory = new Map<string, HuntSubPick[]>();
const tenMemory = new Map<string, HuntTenPicksSheet>();
const subsInflight = new Map<string, Promise<HuntSubPick[] | null>>();
const tenInflight = new Map<string, Promise<HuntTenPicksSheet | null>>();

function fingerprint(value: unknown): string {
  const text = JSON.stringify(value);
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function readStored<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeStored(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full — the memory copy carries the session */
  }
}

// ---------------------------------------------------------------------------
// THE LATEST DRAW — stale-while-revalidate (performance pass, August 2026).
//
// The fingerprint caches above stay the source of truth: a draw is only
// re-made when the record actually moved, and the fresh draw is always what
// lands. These pointers additionally remember the LAST GOOD draw per shelf,
// whatever the record said at the time — so when the record HAS moved (a
// piece logged, a call made, a correction), the reader sees his last
// personalised shortlist instantly while the new one is drawn behind it,
// instead of staring at skeletons for the length of a model call. Nothing
// about the recommendations, the personalisation or the caching changes —
// only what is on screen while a re-draw runs.
// ---------------------------------------------------------------------------

const SUBS_LATEST_PREFIX = 'ethaion:hunt-subpicks:latest:v1:';
const TEN_LATEST_PREFIX = 'ethaion:hunt-tenpicks:latest:v1:';

function holdLatestSubs(categoryId: string, subs: HuntSubPick[]): void {
  writeStored(`${SUBS_LATEST_PREFIX}${categoryId}`, subs);
}

/** The last shortlist this category ever produced — for instant paint while
 * the current record's own draw runs. Null when it has never drawn. */
export function peekLatestSubPicks(categoryId: string): HuntSubPick[] | null {
  const held = readStored<HuntSubPick[]>(`${SUBS_LATEST_PREFIX}${categoryId}`);
  return Array.isArray(held) && held.length > 0 ? held : null;
}

function tenLatestKey(categoryId: string, subName: string): string {
  return `${TEN_LATEST_PREFIX}${categoryId}:${subName.toLowerCase()}`;
}

function holdLatestTen(categoryId: string, subName: string, sheet: HuntTenPicksSheet): void {
  writeStored(tenLatestKey(categoryId, subName), sheet);
}

/** The last ten-pick sheet this sub-category ever produced — the same
 * instant-paint job for the ten-picks page. */
export function peekLatestTenPicks(categoryId: string, subName: string): HuntTenPicksSheet | null {
  const held = readStored<HuntTenPicksSheet>(tenLatestKey(categoryId, subName));
  return held && Array.isArray(held.picks) && held.picks.length > 0 ? held : null;
}

// ---------------------------------------------------------------------------
// The budget on file for one category — the MONEY the page picks against.
// ---------------------------------------------------------------------------

let budgetsHeld: Record<string, CategoryBudget> | null = null;
let budgetsInflight: Promise<Record<string, CategoryBudget>> | null = null;

/** The budget row for one category, read once per session. Null when none
 * is set — the caller says so rather than inventing a range. */
export async function getCategoryBudget(categoryId: string): Promise<CategoryBudget | null> {
  if (!budgetsHeld) {
    if (!budgetsInflight) {
      budgetsInflight = fetchCategoryBudgets()
        .then((map) => {
          budgetsHeld = map;
          return map;
        })
        .catch(() => {
          budgetsInflight = null;
          return {} as Record<string, CategoryBudget>;
        });
    }
    const map = await budgetsInflight;
    return map[categoryId] || null;
  }
  return budgetsHeld[categoryId] || null;
}

/** The budget as one honest line for a prompt or the sidebar. */
export function budgetLine(budget: CategoryBudget | null): string | null {
  const text = budget ? formatBudget(budget) : '';
  return text || null;
}

// ---------------------------------------------------------------------------
// The voice — the same thesis every Hunt engine writes in.
// ---------------------------------------------------------------------------

const VOICE: ClaudeSystemBlock = {
  text:
    'You are Beau, the valet voice of Ethaion — a classic-menswear wardrobe app for a man building an intentional, quality wardrobe. Register: quiet, knowing, concrete, lightly British; short declarative sentences; no marketing, no exclamation marks, no emoji. Write TO him (“you”). '
    + 'THE THESIS, applied without exception: natural or genuinely good materials, considered construction, timeless design, a piece that can be repaired or resoled and still reads right in fifteen years. Fast fashion never appears — no Zara, H&M, ASOS, Shein, Temu, Primark or Boohoo — whatever the price fits. Name REAL makers only, and only ones that genuinely make the piece in question; when you are not certain a maker makes it, choose one you are certain of. '
    + 'Every line must be earned from the FACTS you are given: his frame, colouring, sizes, budgets, directions, city, climate, what is already on his ledger and the calls he has already made. Never invent ownership, never write a generic compliment. '
    + 'Return STRICT JSON only — no markdown fences, no prose around it, no commentary.',
  cache: true,
};

// ---------------------------------------------------------------------------
// Reading replies — a truncated reply is still worth every complete object.
// ---------------------------------------------------------------------------

function parseJson(raw: string | null): any {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    for (const [open, close] of [['{', '}'], ['[', ']']] as const) {
      const start = trimmed.indexOf(open);
      const end = trimmed.lastIndexOf(close);
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(trimmed.slice(start, end + 1));
        } catch {
          /* try the next shape */
        }
      }
    }
    return null;
  }
}

/** Every self-contained JSON object inside a string, at any depth. */
function objectsIn(text: string): any[] {
  const out: any[] = [];
  const starts: number[] = [];
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') starts.push(i);
    else if (ch === '}') {
      const start = starts.pop();
      if (start == null) continue;
      try {
        out.push(JSON.parse(text.slice(start, i + 1)));
      } catch {
        /* not a complete object on its own */
      }
    }
  }
  return out;
}

function str(v: unknown, max = 300): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function normaliseStatus(raw: unknown): HuntSubStatus | null {
  const text = str(raw, 20).toUpperCase();
  const hit = HUNT_SUB_STATUSES.find((s) => s === text);
  if (hit) return hit;
  if (/COVER/.test(text)) return 'COVERED';
  if (/THIN/.test(text)) return 'THIN';
  if (/CLOS/.test(text)) return 'CLOSED';
  if (/GAP|MISS/.test(text)) return 'GAP';
  if (/NOW/.test(text)) return 'WHY NOW';
  if (/HERE/.test(text)) return 'WHY HERE';
  return null;
}

function normaliseTier(raw: unknown): HuntPickTier {
  const text = str(raw, 30).toUpperCase();
  if (/WELL UNDER|UNDER/.test(text)) return 'WELL UNDER';
  if (/STRETCH/.test(text)) return 'INSIDE STRETCHING';
  return 'INSIDE COMFORTABLE';
}

function normaliseQuality(raw: unknown): HuntPickQuality {
  const text = str(raw, 30).toUpperCase();
  if (/BUY FIRST|FIRST/.test(text)) return 'BUY FIRST';
  if (/NOT FOR/.test(text)) return 'NOT FOR YOU';
  if (/SPECIAL/.test(text)) return 'SPECIAL CASE';
  return 'SOUND';
}

function sanitizeSubPick(raw: any, ownedCount: number): HuntSubPick | null {
  const subName = str(raw?.subName ?? raw?.sub_name ?? raw?.name, 60);
  if (!subName) return null;
  const youOwnRaw = Number(raw?.youOwn ?? raw?.you_own ?? raw?.owned);
  const youOwn = Number.isFinite(youOwnRaw) ? Math.max(0, Math.min(99, Math.round(youOwnRaw))) : 0;
  return {
    subName,
    seasonTag: str(raw?.seasonTag ?? raw?.season_tag ?? raw?.season, 24) || 'all year',
    status: normaliseStatus(raw?.status) || (youOwn === 0 && ownedCount === 0 ? 'GAP' : youOwn === 0 ? 'GAP' : 'COVERED'),
    reason: str(raw?.reason ?? raw?.line ?? raw?.why, 220),
    youOwn,
  };
}

function sanitizeTenPick(raw: any): HuntTenPick | null {
  const pieceName = str(raw?.pieceName ?? raw?.piece_name ?? raw?.name, 90);
  if (!pieceName) return null;
  const url = str(raw?.retailerUrl ?? raw?.retailer_url ?? raw?.url, 300);
  const typeId = str(raw?.garmentTypeId ?? raw?.garment_type_id ?? raw?.typeId, 60).toLowerCase();
  const tags = Array.isArray(raw?.tags)
    ? raw.tags.map((t: unknown) => str(t, 24)).filter(Boolean).slice(0, 5)
    : [];
  return {
    pieceName,
    maker: str(raw?.maker ?? raw?.brand, 60),
    retailerUrl: /^https?:\/\//i.test(url) ? url : null,
    garmentTypeId: findGarmentType(typeId) ? typeId : null,
    tags,
    price: str(raw?.price ?? raw?.priceGuide ?? raw?.price_guide, 40),
    priceTier: normaliseTier(raw?.priceTier ?? raw?.price_tier ?? raw?.tier),
    quality: normaliseQuality(raw?.quality ?? raw?.call),
    why: str(raw?.why ?? raw?.whyThisOne ?? raw?.why_this_one ?? raw?.whyYou, 260),
  };
}

/** De-duplicated picks from a reply, complete objects salvaged from a
 * truncated one. */
function tenPicksFrom(raw: string | null, listKey: string, exclude: string[] = []): HuntTenPick[] {
  if (!raw) return [];
  const parsed = parseJson(raw);
  const listed = Array.isArray(parsed?.[listKey])
    ? parsed[listKey]
    : Array.isArray(parsed)
      ? parsed
      : null;
  const candidates: any[] = listed || objectsIn(raw).filter((o) => o && (o.pieceName || o.piece_name));
  const seen = new Set(exclude.map((n) => n.trim().toLowerCase()).filter(Boolean));
  const picks: HuntTenPick[] = [];
  for (const entry of candidates) {
    const pick = sanitizeTenPick(entry);
    if (!pick) continue;
    const name = pick.pieceName.toLowerCase();
    if (seen.has(name)) continue;
    seen.add(name);
    picks.push(pick);
  }
  return picks;
}

// ---------------------------------------------------------------------------
// What the prompts are built from
// ---------------------------------------------------------------------------

/** The category's runs and their types — the reference Beau names within. */
function categoryReference(category: HuntCategory, withIds: boolean): string {
  return category.subCategories
    .slice(0, 12)
    .map((sub) => {
      const types = sub.typeIds
        .map((id) => {
          const type = findGarmentType(id);
          if (!type) return null;
          return withIds ? `${type.name} (id: ${id})` : type.name;
        })
        .filter((name): name is string => !!name)
        .slice(0, withIds ? 10 : 7);
      return `- ${sub.label} — ${sub.note}${types.length > 0 ? `\n  e.g. ${types.join(', ')}` : ''}`;
    })
    .join('\n');
}

/** The whole wardrobe, one line per category. */
function wholeLedger(reader: HuntReader): string {
  return HUNT_CATEGORIES.map((category) => {
    const owned = ownedInCategory(reader, category.id);
    return `- ${category.name}: ${owned.length > 0 ? owned.slice(0, 10).join('; ') : 'nothing logged'}`;
  }).join('\n');
}

/** Everything about this category that should move the caches when it
 * changes. */
function categoryFacts(reader: HuntReader, category: HuntCategory): unknown {
  return {
    category: category.id,
    owned: ownedInCategory(reader, category.id),
    ledger: reader.pieces.length,
    calls: callsInCategory(reader, category.id),
  };
}

// ---------------------------------------------------------------------------
// THE SHORTLIST — three sub-categories per unfolded category.
// ---------------------------------------------------------------------------

export async function drawCategorySubPicks(
  reader: HuntReader,
  categoryId: string,
  options: { forceRefresh?: boolean } = {},
): Promise<HuntSubPick[] | null> {
  const category = huntCategory(categoryId);
  if (!category) return null;
  const key = `${SUBS_PREFIX}${categoryId}:${fingerprint({
    reader: huntReaderBrief(reader),
    facts: categoryFacts(reader, category),
  })}`;
  if (!options.forceRefresh) {
    const held = subsMemory.get(key) || readStored<HuntSubPick[]>(key);
    if (held && Array.isArray(held) && held.length > 0) {
      subsMemory.set(key, held);
      holdLatestSubs(categoryId, held);
      return held;
    }
    const running = subsInflight.get(key);
    if (running) return running;
  }

  const owned = ownedInCategory(reader, categoryId);
  const calls = callsInCategory(reader, categoryId);
  const budget = await getCategoryBudget(categoryId).catch(() => null);

  const job = (async (): Promise<HuntSubPick[] | null> => {
    const user = [
      `THE MAN:\n${huntReaderBrief(reader)}`,
      `ON HIS LEDGER IN ${category.name.toUpperCase()} — every piece he has logged here, in his own words:\n`
        + `${owned.length > 0 ? owned.join('\n') : 'nothing logged in this category yet'}`,
      `THE REST OF HIS WARDROBE:\n${wholeLedger(reader)}`,
      budgetLine(budget) ? `HIS BUDGET FOR ${category.name.toUpperCase()}: ${budgetLine(budget)}.` : null,
      'CALLS HE HAS ALREADY MADE IN THIS CATEGORY:\n'
        + `favourites: ${calls.favourite.join('; ') || 'none'}\n`
        + `saved: ${calls.saved.join('; ') || 'none'}\n`
        + `passed on: ${calls.passed.join('; ') || 'none'}`,
      `WHAT ${category.name.toUpperCase()} COVERS — its runs, for your reference:\n${categoryReference(category, false)}`,
      `Name the ${SUB_PICKS_PER_CATEGORY} SUB-CATEGORIES inside ${category.name} that matter most for THIS man right now — `
        + 'read from what he owns (covered, thin, gap), his frame, colouring, budget, city, climate and the registers he actually dresses in. '
        + 'A sub-category is a specific family of pieces (“Oxford & poplin”, “Overshirts”, “Flannel & chambray”), not a whole run and never a single product. '
        + `Return JSON: {"subs": [ … ]} — EXACTLY ${SUB_PICKS_PER_CATEGORY} entries, each with exactly these keys: `
        + '"subName" (max 32 chars), '
        + '"seasonTag" (when it earns its keep — "all year", or a temperature span like "14–22°"), '
        + '"status" (ONE of COVERED, THIN, CLOSED, GAP, WHY HERE, WHY NOW — read from HIS ledger: COVERED when he owns it well, THIN when one piece is doing all the work, GAP when nothing answers it, CLOSED when he has told you no, WHY HERE / WHY NOW when the reason is his life or the season), '
        + '"reason" (ONE line, max 160 chars, written to him — e.g. "Six shirts, well chosen. Nothing needed; Beau\u2019s list here is a standing replacement shortlist."), '
        + '"youOwn" (integer — how many of the pieces listed above fall inside this sub-category).',
    ]
      .filter(Boolean)
      .join('\n\n');

    const ask = async (model: string, second: string): Promise<HuntSubPick[]> => {
      const raw = await callModel({ model, second, system: [VOICE], user, maxTokens: 900, temperature: 0.5 });
      const parsed = parseJson(raw);
      const list: any[] = Array.isArray(parsed?.subs)
        ? parsed.subs
        : Array.isArray(parsed)
          ? parsed
          : objectsIn(raw || '').filter((o) => o && (o.subName || o.sub_name || o.name));
      const out: HuntSubPick[] = [];
      const seen = new Set<string>();
      for (const entry of list) {
        const sub = sanitizeSubPick(entry, owned.length);
        if (!sub || seen.has(sub.subName.toLowerCase())) continue;
        seen.add(sub.subName.toLowerCase());
        out.push(sub);
      }
      return out.slice(0, SUB_PICKS_PER_CATEGORY);
    };

    let subs = await ask(CLAUDE_SONNET, CLAUDE_HAIKU);
    if (subs.length === 0) subs = await ask(CLAUDE_HAIKU, CLAUDE_SONNET);
    if (subs.length === 0) return null;
    subsMemory.set(key, subs);
    writeStored(key, subs);
    holdLatestSubs(categoryId, subs);
    return subs;
  })().finally(() => subsInflight.delete(key));

  subsInflight.set(key, job);
  return job;
}

// ---------------------------------------------------------------------------
// THE TEN-PICK PAGE — ten researched picks plus the bench behind them.
// ---------------------------------------------------------------------------

const PICK_SHAPE =
  'Each pick is an object with exactly these keys: '
  + '"pieceName" (the piece as you would name it — cut, cloth and colour, max 60 chars), '
  + '"maker" (ONE real maker who genuinely makes it), '
  + '"retailerUrl" (the maker\u2019s own product or collection page when you are CERTAIN of the address; null when not — never invent a url), '
  + '"garmentTypeId" (the id, verbatim, of the garment type it answers from the runs listed above; null when none fits), '
  + '"tags" (3–4 short tags — the colour, the cut, the cloth, the price angle, e.g. "OATMEAL", "BRITISH CUT", "COTTON", "UNDER €300"), '
  + '"price" (one honest figure or tight range in his currency, e.g. "€180"), '
  + '"priceTier" (against HIS budget for this category: WELL UNDER, INSIDE COMFORTABLE or INSIDE STRETCHING), '
  + '"quality" (your call for HIM: SOUND, BUY FIRST, NOT FOR YOU or SPECIAL CASE — at least 2 of the first ten must be BUY FIRST), '
  + '"why" (ONE line, max 160 chars — why this one for this wearer, written TO them as “you/your” (never “he”, “his” or “this man”): name the fact in their profile or ledger it answers).';

function tenPicksUserMessage(
  reader: HuntReader,
  category: HuntCategory,
  sub: { subName: string; seasonTag: string; status: string; reason: string },
  budget: CategoryBudget | null,
  exclude: string[],
  count: number,
  withHeader: boolean,
): string {
  const owned = ownedInCategory(reader, category.id);
  const calls = callsInCategory(reader, category.id);
  const cur = getCurrency();
  return [
    `THE MAN:\n${huntReaderBrief(reader)}`,
    `THE SUB-CATEGORY YOU ARE PICKING IN: ${sub.subName} (inside ${category.name}) — ${sub.seasonTag} — your read of it for him: ${sub.status} — “${sub.reason}”.`,
    `ON HIS LEDGER IN ${category.name.toUpperCase()}:\n${owned.length > 0 ? owned.join('\n') : 'nothing logged in this category yet'}`,
    budgetLine(budget)
      ? `HIS BUDGET FOR ${category.name.toUpperCase()}: ${budgetLine(budget)} — spread the picks across it, and mark each one WELL UNDER, INSIDE COMFORTABLE or INSIDE STRETCHING against it.`
      : `He has set no budget for ${category.name} — keep the spread honest, entry to investment, and mark the tiers against a sensible middle in ${cur.id}.`,
    'CALLS HE HAS ALREADY MADE IN THIS CATEGORY:\n'
      + `favourites: ${calls.favourite.join('; ') || 'none'}\n`
      + `saved: ${calls.saved.join('; ') || 'none'}\n`
      + `PASSED ON (never offer these again in the same form): ${calls.passed.join('; ') || 'none'}`,
    `THE GARMENT TYPES ${category.name.toUpperCase()} COVERS (use their ids for "garmentTypeId"):\n${categoryReference(category, true)}`,
    exclude.length > 0
      ? `ALREADY ON THE PAGE OR CLEARED AWAY — do NOT repeat any of these, nor a mere colour change of one: ${exclude.join('; ')}`
      : null,
    `Choose the ${count} pieces you would put in front of him in ${sub.subName} — REAL pieces that exist, by real makers, `
    + 'filtered against his budget, frame, colouring, climate and register, spread across price points and quality tiers within his range. '
    + `${withHeader
      ? `Return JSON: {"summary": "…" (your one-line read of this sub-category for him, max 160 chars), "explanation": "…" (1–2 sentences, max 300 chars — what you are specifically picking for HIM within it), "picks": [ … ]} — EXACTLY ${count} picks. `
      : `Return JSON: {"picks": [ … ]} — EXACTLY ${count} picks. `}${PICK_SHAPE}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * The ten-pick sheet for one sub-category: ten on the page, a small bench
 * behind them, and Beau's header lines. Cached on the facts. Null only when
 * every transport came back empty.
 */
export async function drawTenPicks(
  reader: HuntReader,
  categoryId: string,
  sub: HuntSubPick,
  options: { forceRefresh?: boolean } = {},
): Promise<HuntTenPicksSheet | null> {
  const category = huntCategory(categoryId);
  if (!category) return null;
  const key = `${TEN_PREFIX}${categoryId}:${sub.subName.toLowerCase()}:${fingerprint({
    reader: huntReaderBrief(reader),
    facts: categoryFacts(reader, category),
  })}`;
  if (!options.forceRefresh) {
    const held = tenMemory.get(key) || readStored<HuntTenPicksSheet>(key);
    if (held && Array.isArray(held.picks) && held.picks.length > 0) {
      tenMemory.set(key, held);
      holdLatestTen(categoryId, sub.subName, held);
      return held;
    }
    const running = tenInflight.get(key);
    if (running) return running;
  }

  const budget = await getCategoryBudget(categoryId).catch(() => null);
  const total = TEN_PICKS + BENCH_SIZE;

  const job = (async (): Promise<HuntTenPicksSheet | null> => {
    const user = tenPicksUserMessage(reader, category, sub, budget, [], total, true);
    const ask = async (model: string, second: string, temperature: number) => {
      const raw = await callModel({ model, second, system: [VOICE], user, maxTokens: 4000, temperature });
      const parsed = parseJson(raw);
      return {
        summary: str(parsed?.summary, 200),
        explanation: str(parsed?.explanation, 340),
        picks: tenPicksFrom(raw, 'picks'),
      };
    };

    let result = await ask(CLAUDE_SONNET, CLAUDE_HAIKU, 0.5);
    if (result.picks.length === 0) result = await ask(CLAUDE_HAIKU, CLAUDE_SONNET, 0.55);
    if (result.picks.length === 0) return null;

    const sheet: HuntTenPicksSheet = {
      summary: result.summary || sub.reason,
      explanation: result.explanation,
      picks: result.picks.slice(0, TEN_PICKS),
      bench: result.picks.slice(TEN_PICKS, total),
    };
    tenMemory.set(key, sheet);
    writeStored(key, sheet);
    holdLatestTen(categoryId, sub.subName, sheet);
    return sheet;
  })().finally(() => tenInflight.delete(key));

  tenInflight.set(key, job);
  return job;
}

/** Write the sheet back after a removal, so leaving and returning keeps the
 * page as he left it. */
export function holdTenPicksSheet(
  reader: HuntReader,
  categoryId: string,
  sub: HuntSubPick,
  sheet: HuntTenPicksSheet,
): void {
  const category = huntCategory(categoryId);
  if (!category) return;
  const key = `${TEN_PREFIX}${categoryId}:${sub.subName.toLowerCase()}:${fingerprint({
    reader: huntReaderBrief(reader),
    facts: categoryFacts(reader, category),
  })}`;
  tenMemory.set(key, sheet);
  writeStored(key, sheet);
  holdLatestTen(categoryId, sub.subName, sheet);
}

/**
 * A few more picks for the bench, when removals have run it dry. Everything
 * already on the page, on the bench or removed is excluded. Returns [] when
 * Beau is unreachable — the page simply runs a pick short.
 */
export async function drawBenchRefill(input: {
  reader: HuntReader;
  categoryId: string;
  sub: HuntSubPick;
  exclude: string[];
  count?: number;
}): Promise<HuntTenPick[]> {
  const category = huntCategory(input.categoryId);
  if (!category) return [];
  const budget = await getCategoryBudget(input.categoryId).catch(() => null);
  const count = input.count || 2;
  const user = tenPicksUserMessage(input.reader, category, input.sub, budget, input.exclude, count, false);
  const raw = await callModel({
    model: CLAUDE_SONNET,
    second: CLAUDE_HAIKU,
    system: [VOICE],
    user,
    maxTokens: 1000,
    temperature: 0.65,
  });
  return tenPicksFrom(raw, 'picks', input.exclude).slice(0, count);
}
