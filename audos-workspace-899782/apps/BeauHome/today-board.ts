/**
 * THE TODAY BOARD — the app-level cache for Beau's daily outfit reasoning
 * (the global tab-caching fix, Part 3).
 *
 * ONE composed "what to wear today" board per day per wardrobe, shared by:
 *   · the Beau · Today card on The Ledger (the small outfit preview strip)
 *   · The Fitting's Today entry point (the pre-filled board + reasoning)
 *
 * The result lives at MODULE level (plus localStorage), so it survives tab
 * switches and re-mounts — tab navigation NEVER re-runs the model. The
 * invalidation contract:
 *   · the calendar day changes            → fresh compose on next request
 *   · the wardrobe changes (ids moved)    → fresh compose on next request
 *   · the FEELS-LIKE band moves           → fresh compose on next request. A
 *     board composed at 18°C is the wrong board at 31°C, and the candidate
 *     filter that produced it would now cut differently.
 *   · a quick-adjust chip in The Fitting  → the ADJUSTED board replaces the
 *     cached one (rememberTodayBoard), so the Ledger preview stays in step
 *   · an explicit force refresh           → fresh compose
 */
import { composeFittingBoard, fetchTodayWeatherLine } from './fitting-ai';
import { fetchMaterials, type StyleProfile, type WardrobePiece } from './profile-data';
import { getSharedWeather, getStoredSharedCity, sharedFilterTempC } from './weather-context';
import { fetchPieceWarmth, type PieceWarmth } from './warmth-model';
import { composeTodayCopy } from './today-copy';

export interface TodayBoard {
  pieceIds: number[];
  reasoning: string;
  /** Set when today's conditions leave a genuine hole in the wardrobe — the
   * honest alternative to quietly composing with a wrong-season piece. */
  gapNote?: string | null;
  /** THE DAILY COPY (founder's copy contract, today-copy.ts) — generated
   * WITH the board from the same live weather + chosen pieces, and cached
   * with it as ONE unit: a recompose (new day, new city, adjusted board)
   * regenerates both together, never separately. Absent on boards cached
   * before the contract landed — the card then derives copy at render. */
  headline?: string | null;
  body?: string | null;
  composedAt: number;
}

/** Fired whenever the cached today board changes (compose or adjust). */
export const TODAY_BOARD_EVENT = 'ethaion:today-board';

const STORAGE_KEY = 'ethaion_today_board_v1';

/** Day + wardrobe + location + conditions fingerprint — the ONLY things that
 * invalidate the cache. The city is part of it so a location change
 * (What-to-Wear card or The Fitting) recomposes with the new weather, and the
 * feels-like band is part of it in 3°C steps so a real change in conditions
 * recomposes without ±1°C drift thrashing the model. */
function todaySignature(pieces: WardrobePiece[]): string {
  const day = new Date().toISOString().slice(0, 10);
  const city = (getStoredSharedCity() || '').trim().toLowerCase();
  const felt = sharedFilterTempC();
  const band = felt == null ? 'na' : String(Math.round(felt / 3));
  const ids = pieces
    .filter((p) => p.id > 0)
    .map((p) => p.id)
    .sort((a, b) => a - b)
    .join(',');
  return `${day}|${city}|${band}|${ids}`;
}

let memory: { sig: string; board: TodayBoard } | null = null;
let inflight: { sig: string; job: Promise<TodayBoard> } | null = null;

function readStored(sig: string): TodayBoard | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.sig === sig && Array.isArray(parsed?.board?.pieceIds) && parsed.board.pieceIds.length > 0) {
      return parsed.board as TodayBoard;
    }
    return null;
  } catch {
    return null;
  }
}

function store(sig: string, board: TodayBoard): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sig, board }));
  } catch { /* storage unavailable — the module memory still holds it */ }
}

/** Synchronous cache peek — no compose, no network. */
export function peekTodayBoard(pieces: WardrobePiece[]): TodayBoard | null {
  const sig = todaySignature(pieces);
  if (memory && memory.sig === sig) return memory.board;
  const stored = readStored(sig);
  if (stored) {
    memory = { sig, board: stored };
    return stored;
  }
  return null;
}

/**
 * Replace the cached board (quick-adjusts in The Fitting land here so the
 * Ledger preview shows the adjusted outfit, not the stale original).
 */
export function rememberTodayBoard(pieces: WardrobePiece[], board: TodayBoard): void {
  const sig = todaySignature(pieces);
  memory = { sig, board };
  store(sig, board);
  window.dispatchEvent(new CustomEvent(TODAY_BOARD_EVENT));
}

/**
 * The ONE way to get today's board: cached when fresh, composed once when
 * not (in-flight calls are deduplicated). `force` is the explicit refresh.
 */
export async function getTodayBoard({
  pieces,
  profile,
  force = false,
}: {
  pieces: WardrobePiece[];
  profile: StyleProfile | null;
  force?: boolean;
}): Promise<TodayBoard> {
  const sig = todaySignature(pieces);
  if (!force) {
    const cached = peekTodayBoard(pieces);
    if (cached) return cached;
    if (inflight && inflight.sig === sig) return inflight.job;
  }
  const job = (async () => {
    const [materials, weatherLine, warmth] = await Promise.all([
      fetchMaterials().catch(() => ({} as Record<number, string>)),
      fetchTodayWeatherLine(profile).catch(() => null),
      fetchPieceWarmth().catch(() => ({} as Record<number, PieceWarmth>)),
    ]);
    const result = await composeFittingBoard({
      pieces,
      materials,
      profile,
      occasion: 'an ordinary day today',
      weatherLine,
      warmth,
    });
    // THE DAILY COPY — headline + body, from the same live inputs the board
    // itself was composed from (the shared weather reading and the chosen
    // pieces), so copy and pieces are one unit in the cache.
    const byId = new Map(pieces.map((p) => [p.id, p]));
    const chosen = result.pieceIds
      .map((id) => byId.get(id))
      .filter((p): p is WardrobePiece => !!p)
      .map((p) => ({ name: p.name, category: p.category, slot: p.slot, material: materials[p.id] || null }));
    const copy = composeTodayCopy({ weather: getSharedWeather(), pieces: chosen });
    const board: TodayBoard = {
      pieceIds: result.pieceIds,
      reasoning: result.reasoning,
      gapNote: result.gapNote ?? null,
      headline: copy.headline,
      body: copy.body,
      composedAt: Date.now(),
    };
    rememberTodayBoard(pieces, board);
    return board;
  })().finally(() => {
    if (inflight && inflight.sig === sig) inflight = null;
  });
  inflight = { sig, job };
  return job;
}
