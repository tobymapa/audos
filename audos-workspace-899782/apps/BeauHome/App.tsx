import { useState, useEffect, useMemo, useCallback, useRef, lazy, memo, Suspense } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Compass,
  Folder,
  Hourglass,
  LayoutGrid,
  Library,
  Loader2,
  PersonStanding,
  Sparkles,
} from 'lucide-react';
import { tw, typography } from '../../lib/colors';
import {
  ARCHETYPES,
  BUILD_OPTIONS,
  CURRENCIES,
  SKIN_TONES,
  auditDuplicatePieces,
  auditPatternLabels,
  auditSeasonTags,
  avatarBodyTypeFor,
  cmToFeetInches,
  deletePiece,
  feetInchesToCm,
  fetchCategoryBudgets,
  fetchMaterials,
  MATERIAL_OPTIONS,
  fetchPieceAttributes,
  fetchPieceDetails,
  fetchPrefs,
  fetchProfile,
  fetchStyleMeasurements,
  saveMeasurements,
  heightRangeFromCm,
  homeCity,
  migrateLegacyItems,
  normalizePiece,
  reconcilePatternedName,
  savePrefs,
  saveProfile,
  trackFunnelEvent,
  type CategoryBudget,
  type Option,
  type PieceAttributes,
  type PieceDetails,
  type StylePrefs,
  type StyleProfile,
  type WardrobePiece,
} from './profile-data';
import { HAIR_COLOURS, fetchDossierDetails, saveDossierDetails } from './dossier-details';
import { fetchDossierMeasurements, saveDossierMeasurements } from './dossier-measurements';
import {
  REGISTER_FREQUENCY_LABELS,
  fetchRegisterFrequencies,
  writeRegisterFrequency,
  type RegisterFrequency,
} from './coverage-prefs';
import {
  flatLayAssetForShelf,
  peekFlatLayAsset,
  runPhotoMigration,
  type MigrationProgress,
} from './photo-enhance';
import { hydrateImagePipelineStore, whenIdle } from './image-pipeline';
import { FlatLayBoard, type FlatLayPiece } from './flat-lay-board';
import { OnboardingTour } from './onboarding-tour';
import { FloatingBackButton } from './floating-back';
import { HairlineRowsSkeleton, HomeSkeleton, ShimmerDefs } from './skeleton';
import { ArchetypeIllo } from './illustrations';
import { CategoryGrid, CategoryPage, SeeAllPieces, WardrobeSearch } from './wardrobe';
import { AddPieceHub, AddPieceSection } from './add-piece';
import { fetchAvatarInputs, saveAvatarInputs } from './body-profile';
import { sweepSemanticTags } from './semantic-tags';
import { sweepPieceWarmth } from './warmth-model';
import { BeauAssessmentProvider } from './beau-assessment-context';
import { SaveProfileNudge, isGuestUnsaved } from './save-profile';
import { TODAY_BOARD_EVENT, getTodayBoard, peekTodayBoard, type TodayBoard } from './today-board';
import { useReassessStatus } from './reassess-queue';
import { WEATHER_EVENT, WeatherLine, ensureSharedWeather, useSharedWeather } from './weather-context';
import { composeTodayCopy } from './today-copy';
import { sortByBodyOrder } from './body-order';

// Code splitting (Pass Forty-Seven; widened in Pass Fifty): every surface
// that is NOT the landing Wardrobe screen — The Rail, Radar, Scout, Reads,
// Curated, Saved, Build a Look, Style-me-today and Your Style — loads on
// first visit via dynamic import(), behind a Suspense skeleton. Only the
// Wardrobe screen's code is in the initial JS payload, so it parses and
// renders sooner on every device.
// Tab-switch performance: the main tab panels are wrapped in React.memo at
// the lazy boundary, so an app-level re-render (e.g. the `tab` state
// changing) never re-renders a panel whose props are unchanged.
const ScoutTab = lazy(() => import('./scout').then((m) => ({ default: memo(m.ScoutTab) })));
const RadarTab = lazy(() => import('./radar').then((m) => ({ default: memo(m.RadarTab) })));
const FromHabitus = lazy(() => import('./editorial').then((m) => ({ default: memo(m.FromHabitus) })));
const RailTab = lazy(() => import('./rail').then((m) => ({ default: memo(m.RailTab) })));
const CuratedTab = lazy(() => import('./curated').then((m) => ({ default: memo(m.CuratedTab) })));
const BeauTab = lazy(() => import('./beau-tab').then((m) => ({ default: memo(m.BeauTab) })));
const FittingRoomTab = lazy(() => import('./fitting-room').then((m) => ({ default: memo(m.FittingRoomTab) })));
const SavedTab = lazy(() => import('./discovery').then((m) => ({ default: memo(m.SavedTab) })));
const WardrobeStore = lazy(() => import('./store').then((m) => ({ default: memo(m.WardrobeStore) })));
const StyleMeToday = lazy(() => import('./style-today').then((m) => ({ default: memo(m.StyleMeToday) })));
const YourStyle = lazy(() => import('../YourStyle/App').then((m) => ({ default: memo(m.default) })));
const IndexTab = lazy(() => import('./index-tab').then((m) => ({ default: memo(m.IndexTab) })));

/** Module-scoped so the housekeeping audits run at most ONCE per page load.
 * A StrictMode double-mount, or the app being closed and reopened from the
 * dock, used to re-run all four from scratch. */
let auditsKicked = false;

/* ============================================================================
 * Ethaion — the home app (Milestones overhaul). A tap-only
 * onboarding runs before anything else; once complete the visitor lands in
 * a shell with SEVEN persistent top tabs in this exact order:
 *   The Ledger · The Edit · The Rail · The Hunt · The Reserve ·
 *   The Fitting · The Dossier   (Reads hidden; old Rail merged into Ledger)
 *  - Wardrobe: tracker by category (icons fill proportionally with colour),
 *    illustrated per-piece tiles tinted the piece's actual colour, the ONE
 *    photo-first "Add what you own" flow (Pass Thirty-Three: every piece
 *    starts with a photo — Beau reads the garment and pre-fills the details
 *    for confirmation), the photo log sub-view and the milestones gauge.
 *    Build & complexion lives in Your Style, not here.
 *  - Curated: TWO-LAYER. Layer 1 shows one brand-free card per wardrobe gap,
 *    milestone-ordered; tapping a gap opens Layer 2 — 3–5 specific product
 *    picks with Save (→ Saved) and Refresh (see ./curated).
 *  - Scout: the unified research surface (Pass Twelve merge): ACTIVE hunting
 *    (specific search, link/pic paste, Beau review, persistent history with
 *    notes/tags/sheet view) plus the PASSIVE "Browse" sandbox that absorbed
 *    the retired Explore tab — standalone persisted filters and results,
 *    profile untouched.
 *  - Your Style: the full editable profile screen + budget defaults.
 * Radar (the watch list), Reads (the editorials) and The Rail (the photo
 * record) regained their tab-bar slots in Pass Forty-Two — each is a full
 * screen in the same Warm Editorial design language (./radar, ./editorial,
 * ./rail).
 * Saved (the bookmark stage of the pipeline Curated → Saved → Radar →
 * Wardrobe) stays fully alive as a routable view — opened from its card on
 * the Curated tab and from chat deep links — it just no longer occupies a
 * tab-bar slot. "Build a Look" (was "The Edit") is the outfit builder —
 * opened from its card on the Wardrobe tab. The single chat entry point is
 * the shell's Beau button.
 * ==========================================================================*/

// window.useWorkspaceDB / window.__workspaceDb are auto-injected by the
// platform compiler when it sees these literal tokens in app source.
declare global {
  interface Window {
    useWorkspaceDB: <T = any>(
      table: string,
      options?: any,
    ) => { data: T[]; loading: boolean; error: Error | null; total: number; refresh: () => void };
    __workspaceDb: any;
  }
}

// ---------------------------------------------------------------------------
// Clear wardrobe — the shared confirmation-gated control (clear-wardrobe.tsx),
// rendered on BOTH the Wardrobe tab (below) and The Rail tab (rail.tsx).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Small shared UI atoms
// ---------------------------------------------------------------------------

function ChoiceButton({
  selected,
  onClick,
  children,
  className = '',
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-2xl border-2 transition-all ${
        selected
          ? 'border-[var(--space-brand-primary)] bg-[var(--space-surface-accent-soft)] shadow-[0_4px_14px_var(--space-shell-shadow)]'
          : 'border-[var(--space-border-default)] bg-[var(--space-surface-card)] hover:border-[var(--space-border-strong)] hover:-translate-y-px'
      } ${className}`}
    >
      {children}
    </button>
  );
}

/** The small unit / system switch used beside a numeric field (ft·in vs cm,
 * UK vs EU vs US). Hairline segmented control — no fills but the active one. */
function UnitSwitch<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange: (next: T) => void;
}) {
  return (
    <span className="inline-flex" role="group">
      {options.map(({ id, label: unitLabel }, i) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-pressed={active}
            className={`px-3 h-[32px] grid place-items-center transition-colors ${
              active
                ? 'border border-[var(--color-accent,#a8712c)] bg-[var(--color-accent-100,#fbf1de)] text-[var(--color-accent-800,#5c3413)]'
                : 'border border-[var(--color-divider,rgba(59,43,29,0.18))] text-[var(--color-neutral-700,#634e38)] hover:text-[var(--space-text-primary)]'
            } ${i > 0 ? 'border-l-0' : ''}`}
            style={{ fontFamily: 'var(--space-font-family)', fontSize: '12px' }}
          >
            {unitLabel}
          </button>
        );
      })}
    </span>
  );
}

/** A hairline silhouette for each body type — the visual on the body-type
 * cards. Stroke only, walnut, in the house drawing language. */
function BuildFigure({ id }: { id: string }) {
  // Shoulder half-width, waist half-width — the two numbers that make a
  // build read at a glance.
  const shape: Record<string, { shoulder: number; waist: number }> = {
    slim: { shoulder: 9, waist: 6.5 },
    athletic: { shoulder: 13, waist: 7.5 },
    regular: { shoulder: 11, waist: 9.5 },
    broad: { shoulder: 15, waist: 12.5 },
  };
  const { shoulder, waist } = shape[id] || shape.regular;
  const cx = 30;
  return (
    <svg viewBox="0 0 60 84" className="w-full h-[74px]" fill="none" stroke="#3b2b1d" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx={cx} cy="13" r="7" />
      <path d={`M${cx - shoulder} 30 Q${cx} 24 ${cx + shoulder} 30 L${cx + waist} 52 L${cx - waist} 52 Z`} />
      <path d={`M${cx - waist + 1} 52 L${cx - waist + 1.5} 78`} />
      <path d={`M${cx + waist - 1} 52 L${cx + waist - 1.5} 78`} />
      <path d={`M${cx - shoulder + 1} 31 L${cx - shoulder - 1.5} 50`} />
      <path d={`M${cx + shoulder - 1} 31 L${cx + shoulder + 1.5} 50`} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Onboarding — FOUR screens, ~90 seconds (feature pass · 18a · M11), each
// one filling the Dossier at the source:
//   1 · BODY      — name · build · skin colouring · height + weight
//   2 · SIZES     — the labels worn: general size · trouser waist · shoe
//   3 · LIFESTYLE — register frequency + up to THREE style directions
//                   (three is the cap on purpose — seven overlapping tags
//                   tell him nothing); "Not for me" mutes a register
//   4 · BUDGET & MATERIALS — comfort range per piece · material stance
// Everything else — foot length, hair colour, brand-size exceptions, the
// rest — lives in The Dossier, fillable any time. After onboarding Beau
// holds his full read until FIVE pieces are logged (beau-assessment.ts).
// ---------------------------------------------------------------------------

const TOTAL_STEPS = 4;

const STEP_META: Array<{ title: string; sub: string }> = [
  { title: 'Your body', sub: 'A first name, your build and colouring, and the two figures that decide what flatters. Nothing here is compulsory.' },
  { title: 'Your sizes', sub: 'The labels you actually wear — general size, trouser waist, shoe. Beau judges fit with these; skip any you don\u2019t know.' },
  { title: 'How do you actually dress?', sub: 'How often each register comes up, and up to three style directions. Muting one now is why he\u2019ll never nag you about a dinner jacket.' },
  { title: 'Budget & materials', sub: 'A comfort range per piece — a signal, never a hard ceiling — and where you stand on synthetics.' },
];

/** The three dress registers the coverage map reads — same ids everywhere. */
const ONBOARDING_REGISTERS: Array<{ id: string; label: string }> = [
  { id: 'smart-casual', label: 'Smart casual' },
  { id: 'casual', label: 'Casual' },
  { id: 'formal', label: 'Formal' },
];

const DIRECTIONS_CAP = 3;

/** The budget comfort bands — style_profile.budget_range's documented
 * values, the symbol following the chosen display currency. */
function budgetBandOptions(symbol: string): Option[] {
  return [
    { id: 'under-100', label: `Under ${symbol}100` },
    { id: '100-250', label: `${symbol}100 – ${symbol}250` },
    { id: '250-500', label: `${symbol}250 – ${symbol}500` },
    { id: '500-plus', label: `${symbol}500 and up` },
  ];
}

interface OnboardingProps {
  profile: StyleProfile | null;
  prefs: StylePrefs | null;
  onDone: (profile: StyleProfile | null) => void;
}

function Onboarding({ profile, prefs, onDone }: OnboardingProps) {
  const [step, setStep] = useState<number>(() => {
    const saved = profile?.onboarding_step ?? 0;
    return Math.min(Math.max(saved, 0), TOTAL_STEPS - 1);
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Local draft state, seeded from any partial profile (mid-flow resume).
  const [name, setName] = useState<string>('');
  const [archetypes, setArchetypes] = useState<string[]>(profile?.archetypes ?? []);
  // SPECIFIC height (Part 1) — no more bands. The exact figure lives on the
  // avatar profile (height_cm + the unit the user prefers to read it in);
  // the legacy `height_range` band is DERIVED from it on save, because
  // Beau's proportion rules and the curation scoring still read the band.
  const [heightUnit, setHeightUnit] = useState<'cm' | 'ftin'>('cm');
  const [heightCmStr, setHeightCmStr] = useState<string>('');
  const [heightFtStr, setHeightFtStr] = useState<string>('');
  const [heightInStr, setHeightInStr] = useState<string>('');
  // Weight — stored in kg on the avatar profile, typed in either unit.
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lbs'>('kg');
  const [weightStr, setWeightStr] = useState<string>('');
  // Foot length — the PHYSICAL measurement (dossier_measurements), never a
  // shoe-size label. Sizing labels live in The Dossier's Sizes section.
  const [footUnit, setFootUnit] = useState<'cm' | 'in'>('cm');
  const [footStr, setFootStr] = useState<string>('');
  const [build, setBuild] = useState<string | null>(profile?.build ?? null);
  const [skinTone, setSkinTone] = useState<string | null>(profile?.skin_tone ?? null);
  const [hairColour, setHairColour] = useState<string | null>(null);
  const [budgetRange, setBudgetRange] = useState<string | null>(profile?.budget_range ?? null);
  const [currency, setCurrency] = useState<string>(prefs?.currency ?? 'GBP');
  // SCREEN 2 — SIZES: the labels worn, pre-populated from anything already
  // known (style_measurements) in the resume effect below.
  const [clothingSize, setClothingSize] = useState('');
  const [waistStr, setWaistStr] = useState('');
  const [waistUnit, setWaistUnit] = useState<'cm' | 'in'>('cm');
  const [shoeSize, setShoeSize] = useState('');
  const [shoeSystem, setShoeSystem] = useState('UK');
  // SCREEN 3 — LIFESTYLE: how often each register comes up ("Not for me"
  // mutes it — coverage-prefs.ts), plus a typed custom direction.
  const [registerFreqs, setRegisterFreqs] = useState<Record<string, string>>({});
  const [customDirection, setCustomDirection] = useState('');
  // SCREEN 4 — MATERIALS: preference or exclusion (style_profile.materials).
  const [materialsPref, setMaterialsPref] = useState<string | null>(profile?.materials ?? null);

  /** The specific height in cm, whichever way it was typed. */
  const heightCm = ((): number | null => {
    if (heightUnit === 'cm') {
      const n = parseFloat(heightCmStr);
      return isFinite(n) && n > 0 ? Math.round(n) : null;
    }
    const ft = parseFloat(heightFtStr);
    if (!isFinite(ft) || ft <= 0) return null;
    const inch = parseFloat(heightInStr);
    return feetInchesToCm(ft, isFinite(inch) && inch > 0 ? inch : 0);
  })();

  /** The weight in kg, whichever unit it was typed in. */
  const weightKg = ((): number | null => {
    const n = parseFloat(weightStr);
    if (!isFinite(n) || n <= 0) return null;
    return weightUnit === 'lbs' ? n / 2.20462 : n;
  })();

  // Mid-flow resume: seed the name and hair colour from dossier_details,
  // the foot length from dossier_measurements, and height + weight from the
  // avatar profile the specific figures are stored on.
  useEffect(() => {
    let cancelled = false;
    fetchDossierDetails()
      .then((d) => {
        if (cancelled) return;
        if (d.displayName) setName((cur) => cur || d.displayName || '');
        if (d.hairColour) setHairColour((cur) => cur ?? d.hairColour);
      })
      .catch(() => undefined);
    fetchDossierMeasurements()
      .then((m) => {
        if (cancelled || !m.foot_length) return;
        const digits = m.foot_length.match(/[\d.]+/);
        if (digits) {
          setFootUnit(/(\bin\b|inch|″|")/i.test(m.foot_length) ? 'in' : 'cm');
          setFootStr((cur) => cur || digits[0]);
        }
      })
      .catch(() => undefined);
    // SIZES pre-populate from anything already detectable.
    fetchStyleMeasurements()
      .then((m) => {
        if (cancelled || !m) return;
        if (m.clothing_size) setClothingSize((cur) => cur || m.clothing_size || '');
        if (m.shoe_size) {
          setShoeSize((cur) => cur || m.shoe_size || '');
          if (m.shoe_size_system) setShoeSystem(m.shoe_size_system);
        }
        if (m.waist_cm) {
          const digits = String(m.waist_cm).match(/[\d.]+/);
          if (digits) {
            setWaistUnit(/(\bin\b|inch|″|")/i.test(String(m.waist_cm)) ? 'in' : 'cm');
            setWaistStr((cur) => cur || digits[0]);
          }
        }
      })
      .catch(() => undefined);
    fetchRegisterFrequencies()
      .then((freqs) => {
        if (!cancelled && freqs && Object.keys(freqs).length > 0) setRegisterFreqs((cur) => ({ ...freqs, ...cur }));
      })
      .catch(() => undefined);
    fetchAvatarInputs()
      .then((inputs) => {
        if (cancelled) return;
        if (inputs?.heightCm) {
          setHeightUnit(inputs.heightUnit === 'ftin' ? 'ftin' : 'cm');
          setHeightCmStr(String(Math.round(inputs.heightCm)));
          const { ft, inch } = cmToFeetInches(inputs.heightCm);
          setHeightFtStr(String(ft));
          setHeightInStr(String(inch));
        }
        if (inputs?.weightKg) {
          const lbs = inputs.weightUnit === 'lbs';
          setWeightUnit(lbs ? 'lbs' : 'kg');
          setWeightStr(String(Math.round(lbs ? inputs.weightKg * 2.20462 : inputs.weightKg)));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const patchForStep = useCallback(
    (s: number): Record<string, unknown> => {
      switch (s) {
        // The band is derived from the specific height, never asked for.
        case 0: return { height_range: heightRangeFromCm(heightCm), build, skin_tone: skinTone };
        case 2: return { archetypes };
        case 3: return { budget_range: budgetRange, materials: materialsPref };
        default: return {};
      }
    },
    [heightCm, build, skinTone, archetypes, budgetRange, materialsPref],
  );

  // Persist the current step's answers; onboarding resumes here if they
  // leave. The name and hair colour live in dossier_details, height /
  // weight / body type feed the avatar profile, foot length lives in
  // dossier_measurements and the display currency in style_prefs — none of
  // those companion writes may block the flow, so each one fails soft.
  const commitStep = useCallback(
    async (s: number, extra: Record<string, unknown> = {}) => {
      setSaving(true);
      try {
        if (s === 0) {
          // BODY — the name onto the dossier; the exact height, weight and
          // body type also feed the Fitting figure.
          if (name.trim()) await saveDossierDetails({ displayName: name.trim() }).catch(() => undefined);
          if (hairColour) await saveDossierDetails({ hairColour }).catch(() => undefined);
          if (heightCm || weightKg || build) {
            await saveAvatarInputs({
              heightCm: heightCm ?? null,
              heightUnit,
              weightKg: weightKg ?? null,
              weightUnit,
              bodyType: avatarBodyTypeFor(build),
            }).catch(() => undefined);
          }
          const foot = footStr.trim();
          if (foot) {
            await saveDossierMeasurements({
              foot_length: /^\d+(\.\d+)?$/.test(foot) ? `${foot} ${footUnit}` : foot,
            }).catch(() => undefined);
          }
        } else if (s === 1) {
          // SIZES — straight onto style_measurements, the same rows The
          // Hunt's fit-for-you column and the Dossier read.
          const waist = waistStr.trim();
          const patch: Record<string, string | null> = {};
          if (clothingSize.trim()) patch.clothing_size = clothingSize.trim();
          if (shoeSize.trim()) {
            patch.shoe_size = shoeSize.trim();
            patch.shoe_size_system = shoeSystem;
          }
          if (waist) patch.waist_cm = /^\d+(\.\d+)?$/.test(waist) ? `${waist} ${waistUnit}` : waist;
          if (Object.keys(patch).length > 0) await saveMeasurements(patch).catch(() => undefined);
        } else if (s === 2) {
          // LIFESTYLE — each register's frequency lands in coverage_prefs;
          // "Not for me" also mutes the register at the source.
          for (const { id } of ONBOARDING_REGISTERS) {
            const freq = registerFreqs[id];
            if (freq) writeRegisterFrequency(id, freq as RegisterFrequency);
          }
        } else if (s === 3) {
          await savePrefs({ currency }).catch(() => undefined);
        }
        const fresh = await saveProfile({ ...patchForStep(s), onboarding_step: Math.min(s + 1, TOTAL_STEPS - 1), ...extra });
        // Analytics (Pass Nine): one event per completed onboarding step, plus
        // a completion event — logged for later funnel review. Never blocking.
        trackFunnelEvent(`step_${s + 1}_complete`, { step: s + 1, total_steps: TOTAL_STEPS });
        if ((extra as Record<string, unknown>).onboarding_complete) {
          trackFunnelEvent('onboarding_complete', { last_step: s + 1, total_steps: TOTAL_STEPS });
        }
        return fresh;
      } finally {
        setSaving(false);
      }
    },
    [patchForStep, name, heightCm, heightUnit, weightKg, weightUnit, footStr, footUnit, build, hairColour, currency],
  );

  const confirmCompletedProfile = async (fresh: StyleProfile | null): Promise<StyleProfile> => {
    let confirmed = fresh;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (confirmed?.onboarding_complete) return confirmed;
      await new Promise((resolve) => window.setTimeout(resolve, 80 * (attempt + 1)));
      confirmed = await fetchProfile();
    }
    throw new Error('Your profile did not finish saving. Please try once more.');
  };

  const advance = async () => {
    if (saving) return;
    setSaveError(null);
    try {
      if (step >= TOTAL_STEPS - 1) {
        const fresh = await commitStep(step, { onboarding_complete: true });
        onDone(await confirmCompletedProfile(fresh));
      } else {
        // Do not advance the UI ahead of persistence: each answer is durable
        // before the next screen appears, so the final handoff cannot race
        // earlier queued writes.
        await commitStep(step);
        setStep((current) => current + 1);
      }
    } catch (error) {
      console.error('[Ethaion] onboarding save failed:', error);
      setSaveError(error instanceof Error ? error.message : 'Could not save that step. Please try again.');
    }
  };

  const skipAll = async () => {
    if (saving) return;
    setSaveError(null);
    try {
      const fresh = await commitStep(step, { onboarding_complete: true });
      onDone(await confirmCompletedProfile(fresh));
    } catch (error) {
      console.error('[Ethaion] onboarding completion failed:', error);
      setSaveError(error instanceof Error ? error.message : 'Could not finish setup. Please try again.');
    }
  };

  const stepDone = (() => {
    switch (step) {
      case 0: return name.trim() !== '' || heightCm != null || weightKg != null || build != null || skinTone != null;
      case 1: return true; // sizes are skippable — the Dossier nags instead
      case 2: return archetypes.length > 0 || Object.keys(registerFreqs).length > 0;
      case 3: return true; // the range is a signal, never a gate
      default: return false;
    }
  })();

  // UP TO THREE directions (18a · M11) — the cap is the point: seven
  // overlapping tags tell him nothing.
  const toggleDirection = (id: string) => {
    setArchetypes(
      archetypes.includes(id)
        ? archetypes.filter((x) => x !== id)
        : archetypes.length >= DIRECTIONS_CAP
          ? archetypes
          : [...archetypes, id],
    );
  };

  const addCustomDirection = () => {
    const custom = customDirection.trim();
    if (!custom || archetypes.length >= DIRECTIONS_CAP) return;
    if (archetypes.some((a) => a.toLowerCase() === custom.toLowerCase())) return;
    setArchetypes([...archetypes, custom]);
    setCustomDirection('');
  };

  const meta = STEP_META[step];
  const currencySymbol = (CURRENCIES.find((c) => c.id === currency)?.symbol || '£').trim();

  return (
    <div className="min-h-full flex flex-col bg-[var(--space-surface-card)]">
      {/* Progress header */}
      <div className="px-5 pt-5 pb-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="p-1.5 rounded-lg hover:bg-[var(--space-surface-muted)] text-[var(--space-text-secondary)] transition-colors"
              aria-label="Previous question"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          ) : (
            <span className="w-7" />
          )}
          <div className="flex-1 h-2 rounded-full bg-[var(--space-surface-muted)] overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--space-brand-primary)] transition-all duration-300"
              style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }}
            />
          </div>
          <span className={`${typography.size.xs} ${typography.color.muted} tabular-nums`}>
            {step + 1}/{TOTAL_STEPS}
          </span>
        </div>
      </div>

      <div className="flex-1 px-5 pb-6 overflow-y-auto">
        <div className="max-w-xl mx-auto">
          <p className={`${typography.size.xs} uppercase tracking-[0.25em] ${typography.color.muted} mt-2`}>
            Getting to know you
          </p>
          <h2 className={`${typography.size['2xl']} ${typography.weight.semibold} ${typography.color.primary} mt-1`}>
            {meta.title}
          </h2>
          <p className={`${typography.size.sm} ${typography.color.secondary} mt-1.5`}>{meta.sub}</p>

          <div className="mt-6">
            {/* 3 · LIFESTYLE — register frequency first (the dossier's
                registers; "Not for me" mutes one at the source), then up to
                THREE style directions on the same visual cards the Dossier
                uses. */}
            {step === 2 && (
              <>
                <div className="mb-7">
                  <p className={`${typography.size.xs} uppercase tracking-wide ${typography.weight.medium} ${typography.color.secondary} mb-2`}>
                    The registers you dress for
                  </p>
                  <div className="divide-y divide-[var(--space-border-default)] border-t border-b border-[var(--space-border-default)]">
                    {ONBOARDING_REGISTERS.map(({ id, label: regLabel }) => (
                      <div key={id} className="flex items-center gap-2 flex-wrap py-2.5">
                        <span className={`${typography.size.sm} ${typography.weight.medium} ${typography.color.primary} w-28 flex-shrink-0`}>
                          {regLabel}
                        </span>
                        <span className="flex gap-1.5 flex-wrap">
                          {(Object.keys(REGISTER_FREQUENCY_LABELS) as RegisterFrequency[]).map((f) => {
                            const active = registerFreqs[id] === f;
                            return (
                              <button
                                key={f}
                                type="button"
                                onClick={() => setRegisterFreqs((cur) => ({ ...cur, [id]: f }))}
                                aria-pressed={active}
                                className={`px-3 py-1.5 rounded-full ${typography.size.xs} border transition-colors ${
                                  active
                                    ? 'bg-[var(--space-surface-accent-soft)] text-[var(--space-brand-primary-700)] border-[var(--space-brand-primary)]'
                                    : 'border-[var(--space-border-default)] text-[var(--space-text-secondary)] hover:border-[var(--space-border-strong)]'
                                }`}
                              >
                                {REGISTER_FREQUENCY_LABELS[f]}
                              </button>
                            );
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className={`${typography.size.xs} ${typography.color.muted} mt-1.5 italic`}>
                    “Not for me” mutes the register — The Edit stops counting its gaps and Beau holds no opinion about it.
                  </p>
                </div>
                <p className={`${typography.size.xs} uppercase tracking-wide ${typography.weight.medium} ${typography.color.secondary} mb-2`}>
                  Directions you like · up to {DIRECTIONS_CAP} — {archetypes.length}/{DIRECTIONS_CAP} chosen
                </p>
                {/* Archetype cards (Pass Forty-Four): a photorealistic
                    reference PHOTOGRAPH on top — full-body or torso-down, no
                    portraits, the outfit is the subject — name and short
                    description below. The old SVG placeholder illustrations
                    are retired from this step. */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {ARCHETYPES.map((a) => {
                    const selected = archetypes.includes(a.id);
                    return (
                      <ChoiceButton
                        key={a.id}
                        selected={selected}
                        onClick={() => toggleDirection(a.id)}
                        className="p-3 flex flex-col"
                      >
                        <span className="relative block">
                          <span className="block rounded-xl bg-[#eadfcb] overflow-hidden">
                            <ArchetypeIllo id={a.id} title={a.label} variant="photo" className="w-full" />
                          </span>
                          {selected && (
                            <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[var(--space-brand-primary)] flex items-center justify-center">
                              <Check className="w-3 h-3 text-[var(--space-text-on-primary)]" />
                            </span>
                          )}
                        </span>
                        <span className={`block text-center ${typography.size.sm} ${typography.weight.semibold} ${typography.color.primary} mt-2`}>
                          {a.label}
                        </span>
                        <span className={`block text-center ${typography.size.xs} ${typography.color.muted} mt-1 leading-snug`}>
                          {a.detail}
                        </span>
                      </ChoiceButton>
                    );
                  })}
                </div>
                <p className={`${typography.size.xs} ${typography.color.muted} mt-3 italic`}>
                  Three is the cap on purpose — seven overlapping tags tell him nothing.
                </p>
                {/* OR TYPE YOUR OWN — a custom direction counts against the
                    same cap and rides the same archetypes field. */}
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <input
                    type="text"
                    value={customDirection}
                    onChange={(e) => setCustomDirection(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addCustomDirection();
                      }
                    }}
                    placeholder='Or type your own — e.g. “Italian casual”'
                    aria-label="Type your own style direction"
                    disabled={archetypes.length >= DIRECTIONS_CAP}
                    className={`flex-1 min-w-[200px] ${tw.input.base} ${tw.input.default} ${typography.size.sm} disabled:opacity-50`}
                  />
                  <button
                    type="button"
                    onClick={addCustomDirection}
                    disabled={!customDirection.trim() || archetypes.length >= DIRECTIONS_CAP}
                    className={`px-3 py-2 rounded-lg ${typography.size.sm} ${tw.button.secondary} disabled:opacity-40`}
                  >
                    Add it
                  </button>
                </div>
                {archetypes.filter((id) => !ARCHETYPES.some((a) => a.id === id)).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {archetypes
                      .filter((id) => !ARCHETYPES.some((a) => a.id === id))
                      .map((custom) => (
                        <button
                          key={custom}
                          type="button"
                          onClick={() => setArchetypes(archetypes.filter((x) => x !== custom))}
                          className={`px-3 py-1.5 rounded-full ${typography.size.xs} border bg-[var(--space-surface-accent-soft)] text-[var(--space-brand-primary-700)] border-[var(--space-brand-primary)]`}
                          title="Remove this direction"
                        >
                          {custom} ×
                        </button>
                      ))}
                  </div>
                )}
              </>
            )}

            {/* 1 · NAME — the dossier is made out to someone. */}
            {step === 0 && (
              <div className="space-y-2">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. James"
                  aria-label="Your name"
                  autoComplete="given-name"
                  className={`${tw.input.base} ${tw.input.default}`}
                  style={{ fontFamily: 'var(--space-font-heading)', fontSize: '22px', height: '54px' }}
                />
                <p className={`${typography.size.xs} ${typography.color.muted} italic`}>
                  It sits at the top of your Dossier — the profile Beau keeps of what works for you.
                </p>
              </div>
            )}

            {/* 1 · BODY (continued) — height and weight, then build and
                colouring below. Foot length moved to The Dossier. */}
            {step === 0 && (
              <div className="space-y-6 mt-6">
                {/* SPECIFIC height (Part 1) — everyone knows their own height,
                    so nobody is asked to pick a band. Imperial or metric. */}
                <div>
                  <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                    <p className={`${typography.size.xs} uppercase tracking-wide ${typography.weight.medium} ${typography.color.secondary}`}>
                      Height
                    </p>
                    <UnitSwitch
                      value={heightUnit}
                      options={[
                        { id: 'ftin' as const, label: 'ft / in' },
                        { id: 'cm' as const, label: 'cm' },
                      ]}
                      onChange={(next) => {
                        // Carry the figure across the toggle, never lose it.
                        if (next === 'cm' && heightCm) setHeightCmStr(String(heightCm));
                        if (next === 'ftin' && heightCm) {
                          const { ft, inch } = cmToFeetInches(heightCm);
                          setHeightFtStr(String(ft));
                          setHeightInStr(String(inch));
                        }
                        setHeightUnit(next);
                      }}
                    />
                  </div>
                  {heightUnit === 'cm' ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={120}
                        max={230}
                        value={heightCmStr}
                        onChange={(e) => setHeightCmStr(e.target.value)}
                        placeholder="175"
                        aria-label="Height in centimetres"
                        className={`w-28 ${tw.input.base} ${tw.input.default} ${typography.size.sm}`}
                      />
                      <span className={`${typography.size.sm} ${typography.color.muted}`}>cm</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={3}
                        max={7}
                        value={heightFtStr}
                        onChange={(e) => setHeightFtStr(e.target.value)}
                        placeholder="5"
                        aria-label="Height — feet"
                        className={`w-20 ${tw.input.base} ${tw.input.default} ${typography.size.sm}`}
                      />
                      <span className={`${typography.size.sm} ${typography.color.muted}`}>ft</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={11}
                        value={heightInStr}
                        onChange={(e) => setHeightInStr(e.target.value)}
                        placeholder="9"
                        aria-label="Height — inches"
                        className={`w-20 ${tw.input.base} ${tw.input.default} ${typography.size.sm}`}
                      />
                      <span className={`${typography.size.sm} ${typography.color.muted}`}>in</span>
                    </div>
                  )}
                  <p className={`${typography.size.xs} ${typography.color.muted} mt-1.5 italic`}>
                    e.g. 5′9″ or 175 cm — the exact figure, not a range.
                  </p>
                </div>
                {/* Weight — kg or lb, the figure carried across the toggle. */}
                <div>
                  <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                    <p className={`${typography.size.xs} uppercase tracking-wide ${typography.weight.medium} ${typography.color.secondary}`}>
                      Weight
                    </p>
                    <UnitSwitch
                      value={weightUnit}
                      options={[
                        { id: 'lbs' as const, label: 'lb' },
                        { id: 'kg' as const, label: 'kg' },
                      ]}
                      onChange={(next) => {
                        if (weightKg) {
                          setWeightStr(String(Math.round(next === 'lbs' ? weightKg * 2.20462 : weightKg)));
                        }
                        setWeightUnit(next);
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={30}
                      max={450}
                      value={weightStr}
                      onChange={(e) => setWeightStr(e.target.value)}
                      placeholder={weightUnit === 'kg' ? '78' : '172'}
                      aria-label={`Weight in ${weightUnit === 'kg' ? 'kilograms' : 'pounds'}`}
                      className={`w-28 ${tw.input.base} ${tw.input.default} ${typography.size.sm}`}
                    />
                    <span className={`${typography.size.sm} ${typography.color.muted}`}>{weightUnit === 'kg' ? 'kg' : 'lb'}</span>
                  </div>
                </div>
                {/* Body type — visual cards, never a dropdown. Optional. */}
                <div>
                  <p className={`${typography.size.xs} uppercase tracking-wide ${typography.weight.medium} ${typography.color.secondary} mb-2`}>
                    Body type <span className="normal-case tracking-normal font-normal">(optional)</span>
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {BUILD_OPTIONS.map((o) => {
                      const selected = build === o.id;
                      return (
                        <ChoiceButton
                          key={o.id}
                          selected={selected}
                          onClick={() => setBuild(selected ? null : o.id)}
                          className="p-3 flex flex-col items-center text-center"
                        >
                          <span className="relative block w-full">
                            <span className="block rounded-xl bg-[#eadfcb] overflow-hidden py-2">
                              <BuildFigure id={o.id} />
                            </span>
                            {selected && (
                              <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[var(--space-brand-primary)] flex items-center justify-center">
                                <Check className="w-3 h-3 text-[var(--space-text-on-primary)]" />
                              </span>
                            )}
                          </span>
                          <span className={`block ${typography.size.sm} ${typography.weight.semibold} ${typography.color.primary} mt-2`}>
                            {o.label}
                          </span>
                          {o.sub && (
                            <span className={`block ${typography.size.xs} ${typography.color.muted} mt-1 leading-snug`}>{o.sub}</span>
                          )}
                        </ChoiceButton>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* 1 · BODY (colouring) — skin tone; hair colour optional. */}
            {step === 0 && (
              <div className="space-y-6 mt-6">
                <div>
                  <p className={`${typography.size.xs} uppercase tracking-wide ${typography.weight.medium} ${typography.color.secondary} mb-2`}>
                    Skin tone
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {SKIN_TONES.map((t) => {
                      const selected = skinTone === t.id;
                      return (
                        <ChoiceButton key={t.id} selected={selected} onClick={() => setSkinTone(t.id)} className="p-3 flex flex-col items-center text-center">
                          <span
                            className="w-12 h-12 rounded-full border-2 border-[var(--space-border-strong)] flex items-center justify-center"
                            style={{ background: t.swatch }}
                          >
                            {selected && <Check className="w-4 h-4" style={{ color: '#33302a' }} />}
                          </span>
                          <span className={`${typography.size.sm} ${typography.weight.medium} ${typography.color.primary} mt-2`}>
                            {t.label}
                          </span>
                          <span className={`${typography.size.xs} ${typography.color.muted} mt-0.5`}>{t.undertone}</span>
                        </ChoiceButton>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <p className={`${typography.size.xs} uppercase tracking-wide ${typography.weight.medium} ${typography.color.secondary} mb-2`}>
                    Hair colour <span className="normal-case tracking-normal font-normal">(optional)</span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {HAIR_COLOURS.map((h) => {
                      const selected = hairColour === h.id;
                      return (
                        <button
                          key={h.id}
                          type="button"
                          onClick={() => setHairColour(selected ? null : h.id)}
                          aria-pressed={selected}
                          className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all ${
                            selected
                              ? 'border-[var(--space-brand-primary)] bg-[var(--space-surface-accent-soft)]'
                              : 'border-[var(--space-border-default)] hover:border-[var(--space-border-strong)]'
                          }`}
                        >
                          <span className="w-8 h-8 rounded-full border border-[var(--space-border-strong)]" style={{ background: h.swatch }} />
                          <span className={`${typography.size.xs} ${typography.color.primary}`}>{h.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* 2 · SIZES — the labels worn: general size · trouser waist ·
                shoe size, straight onto style_measurements (the rows The
                Hunt's fit-for-you column reads). All skippable. */}
            {step === 1 && (
              <div className="space-y-6">
                <div>
                  <p className={`${typography.size.xs} uppercase tracking-wide ${typography.weight.medium} ${typography.color.secondary} mb-2`}>
                    General size — shirts & jackets
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {['XS', 'S', 'M', 'L', 'XL', 'XXL'].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setClothingSize(clothingSize === s ? '' : s)}
                        aria-pressed={clothingSize === s}
                        className={`px-3.5 py-1.5 rounded-full ${typography.size.sm} border transition-colors ${
                          clothingSize === s
                            ? 'bg-[var(--space-surface-accent-soft)] text-[var(--space-brand-primary-700)] border-[var(--space-brand-primary)]'
                            : 'border-[var(--space-border-default)] text-[var(--space-text-secondary)] hover:border-[var(--space-border-strong)]'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                    <p className={`${typography.size.xs} uppercase tracking-wide ${typography.weight.medium} ${typography.color.secondary}`}>
                      Trouser waist
                    </p>
                    <UnitSwitch
                      value={waistUnit}
                      options={[
                        { id: 'in' as const, label: 'in' },
                        { id: 'cm' as const, label: 'cm' },
                      ]}
                      onChange={(next) => {
                        const n = parseFloat(waistStr);
                        if (isFinite(n) && n > 0 && next !== waistUnit) {
                          const converted = next === 'in' ? n * 2.54 : n / 2.54;
                          setWaistStr(String(Math.round(converted)));
                        }
                        setWaistUnit(next);
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={waistStr}
                      onChange={(e) => setWaistStr(e.target.value)}
                      placeholder={waistUnit === 'cm' ? '86' : '34'}
                      aria-label={`Trouser waist in ${waistUnit === 'cm' ? 'centimetres' : 'inches'}`}
                      className={`w-28 ${tw.input.base} ${tw.input.default} ${typography.size.sm}`}
                    />
                    <span className={`${typography.size.sm} ${typography.color.muted}`}>{waistUnit}</span>
                  </div>
                  <p className={`${typography.size.xs} ${typography.color.muted} mt-1.5 italic`}>
                    The Hunt judges every trouser against this — without it the fit row is guesswork.
                  </p>
                </div>
                <div>
                  <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                    <p className={`${typography.size.xs} uppercase tracking-wide ${typography.weight.medium} ${typography.color.secondary}`}>
                      Shoe size
                    </p>
                    <UnitSwitch
                      value={shoeSystem}
                      options={[
                        { id: 'UK', label: 'UK' },
                        { id: 'EU', label: 'EU' },
                        { id: 'US', label: 'US' },
                      ]}
                      onChange={setShoeSystem}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={shoeSize}
                      onChange={(e) => setShoeSize(e.target.value)}
                      placeholder={shoeSystem === 'EU' ? '43' : '9'}
                      aria-label={`Shoe size (${shoeSystem})`}
                      className={`w-28 ${tw.input.base} ${tw.input.default} ${typography.size.sm}`}
                    />
                    <span className={`${typography.size.sm} ${typography.color.muted}`}>{shoeSystem}</span>
                  </div>
                  <p className={`${typography.size.xs} ${typography.color.muted} mt-1.5 italic`}>
                    Every shoe in The Hunt is judged against this. Brand-by-brand exceptions live in The Dossier.
                  </p>
                </div>
              </div>
            )}

            {/* 4 · BUDGET & MATERIALS — a signal Beau works with, never a
                hard ceiling; the currency sets the symbol everywhere. */}
            {step === 3 && (
              <div className="space-y-6">
                <div>
                  <p className={`${typography.size.xs} uppercase tracking-wide ${typography.weight.medium} ${typography.color.secondary} mb-2`}>
                    Comfort range per piece
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {budgetBandOptions(currencySymbol).map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setBudgetRange(budgetRange === b.id ? null : b.id)}
                        aria-pressed={budgetRange === b.id}
                        className={`px-3 py-1.5 rounded-full ${typography.size.xs} border transition-colors ${
                          budgetRange === b.id
                            ? 'bg-[var(--space-surface-accent-soft)] text-[var(--space-brand-primary-700)] border-[var(--space-brand-primary)]'
                            : 'border-[var(--space-border-default)] text-[var(--space-text-secondary)] hover:border-[var(--space-border-strong)]'
                        }`}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                  <p className={`${typography.size.xs} ${typography.color.muted} mt-1.5 italic`}>
                    Not a hard ceiling — Beau still names the piece above it when it’s the right answer, and tells you why.
                  </p>
                </div>
                <div>
                  <p className={`${typography.size.xs} uppercase tracking-wide ${typography.weight.medium} ${typography.color.secondary} mb-2`}>
                    Currency
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {CURRENCIES.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setCurrency(c.id)}
                        aria-pressed={currency === c.id}
                        className={`px-3 py-1.5 rounded-full ${typography.size.xs} border transition-colors ${
                          currency === c.id
                            ? 'bg-[var(--space-surface-accent-soft)] text-[var(--space-brand-primary-700)] border-[var(--space-brand-primary)]'
                            : 'border-[var(--space-border-default)] text-[var(--space-text-secondary)] hover:border-[var(--space-border-strong)]'
                        }`}
                      >
                        {c.symbol.trim()} {c.id}
                      </button>
                    ))}
                  </div>
                </div>
                {/* MATERIALS — preference or exclusion, the same options the
                    Dossier holds (style_profile.materials). */}
                <div>
                  <p className={`${typography.size.xs} uppercase tracking-wide ${typography.weight.medium} ${typography.color.secondary} mb-2`}>
                    Materials
                  </p>
                  <div className="grid gap-2">
                    {MATERIAL_OPTIONS.map((m) => {
                      const selected = materialsPref === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setMaterialsPref(selected ? null : m.id)}
                          aria-pressed={selected}
                          className={`text-left px-3.5 py-2.5 rounded-xl border transition-colors ${
                            selected
                              ? 'bg-[var(--space-surface-accent-soft)] border-[var(--space-brand-primary)]'
                              : 'border-[var(--space-border-default)] hover:border-[var(--space-border-strong)]'
                          }`}
                        >
                          <span className={`block ${typography.size.sm} ${typography.weight.medium} ${typography.color.primary}`}>{m.label}</span>
                          {m.sub && <span className={`block ${typography.size.xs} ${typography.color.muted} mt-0.5`}>{m.sub}</span>}
                        </button>
                      );
                    })}
                  </div>
                  <p className={`${typography.size.xs} ${typography.color.muted} mt-1.5 italic`}>
                    Whether nylon can ever answer a gap — exclusions hold everywhere Beau recommends.
                  </p>
                </div>
                {/* The gentle close — one line, muted, not a prompt. */}
                <p className={`${typography.size.xs} ${typography.color.muted}`}>
                  Add five pieces after this and Beau's full read opens up — below five he'll tell you he needs more to
                  work with. The rest of the Dossier — foot length, hair colour, brand sizes — fills in any time.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer: continue + skip */}
      <div className="px-5 py-4 border-t border-[var(--space-border-default)] bg-[var(--space-surface-card)] flex-shrink-0">
        <div className="max-w-xl mx-auto flex flex-col gap-2">
          {saveError && (
            <p className={`${typography.size.xs} text-[var(--space-semantic-danger)]`} role="alert">
              {saveError}
            </p>
          )}
          <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={skipAll}
            disabled={saving}
            className={`${typography.size.xs} ${typography.color.muted} hover:underline`}
          >
            Skip for now
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={advance}
            disabled={!stepDone || saving}
            className={`px-6 py-3 rounded-xl ${typography.size.sm} flex items-center gap-2 ${tw.button.primary} disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : step === TOTAL_STEPS - 1 ? (
              <>
                Meet your wardrobe <Sparkles className="w-4 h-4" />
              </>
            ) : (
              <>
                Continue <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top-level navigation (founder's correction — SIX tabs), in this exact
// order, each with a hairline stroke icon:
//   The Ledger · The Edit · The Fitting · The Hunt · The Index · The Dossier.
// The Rail / Hunt / Reserve funnel is consolidated into The Hunt as three
// stages on one screen (hunt-stages.tsx); The Index houses the two
// reference works (the piece taxonomy + the maker directory); The Dossier
// is BACK IN THE PRIMARY NAV as the RIGHTMOST tab (founder's correction —
// it was briefly demoted to the account corner). The internal tab ids are
// unchanged ('wardrobe', 'beau', 'scout', 'fitting-room', 'your-style', …)
// so chat deep links keep working, and the retired tab surfaces ('curated',
// 'radar') stay fully routable as hidden views.
// On a phone the six tabs move to a BOTTOM bar at thumb height with 52pt
// targets, same order.
// ---------------------------------------------------------------------------

type TabId = 'wardrobe' | 'beau' | 'curated' | 'fitting-room' | 'scout' | 'saved' | 'radar' | 'reads' | 'rail' | 'your-style' | 'dressed' | 'index';

/** Hairline, stroke-only tab icons — no fills (Part 1's icon column). */
const TABS: Array<{ id: TabId; label: string; short: string; icon: 'book' | 'grid' | 'hanger' | 'compass' | 'hourglass' | 'figure' | 'folder' | 'library' }> = [
  { id: 'wardrobe', label: 'The Ledger', short: 'Ledger', icon: 'book' },
  { id: 'beau', label: 'The Edit', short: 'Edit', icon: 'grid' },
  { id: 'fitting-room', label: 'The Fitting', short: 'Fitting', icon: 'figure' },
  { id: 'scout', label: 'The Hunt', short: 'Hunt', icon: 'compass' },
  { id: 'index', label: 'The Index', short: 'Index', icon: 'library' },
  // The Dossier — a PRIMARY tab again, rightmost (founder's correction).
  { id: 'your-style', label: 'The Dossier', short: 'Dossier', icon: 'folder' },
];

/** A small clothes-hanger glyph — stroke-only, inherits the tab's colour. */
function HangerGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-3.5 h-3.5 mr-1.5 flex-shrink-0"
      aria-hidden="true"
    >
      <path d="M12 8V7c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2" />
      <path d="M12 8 3.9 13.7c-1 .7-.5 2.3.75 2.3h14.7c1.25 0 1.75-1.6.75-2.3L12 8Z" />
    </svg>
  );
}

/** The icon beside each tab label — lucide strokes at hairline weight, plus
 * the in-house hanger glyph for The Rail. Never filled. */
function TabIcon({ icon }: { icon: string }) {
  const cls = 'w-3.5 h-3.5 mr-1.5 flex-shrink-0';
  switch (icon) {
    case 'book': return <BookOpen className={cls} strokeWidth={1.5} aria-hidden="true" />;
    case 'grid': return <LayoutGrid className={cls} strokeWidth={1.5} fill="none" aria-hidden="true" />;
    case 'hanger': return <HangerGlyph />;
    case 'compass': return <Compass className={cls} strokeWidth={1.5} aria-hidden="true" />;
    case 'hourglass': return <Hourglass className={cls} strokeWidth={1.5} aria-hidden="true" />;
    case 'figure': return <PersonStanding className={cls} strokeWidth={1.5} aria-hidden="true" />;
    case 'folder': return <Folder className={cls} strokeWidth={1.5} fill="none" aria-hidden="true" />;
    case 'library': return <Library className={cls} strokeWidth={1.5} aria-hidden="true" />;
    default: return null;
  }
}

/** Views without a tab-bar entry — still routable from chat and in-app links.
 * 'dressed' is the Build a Look outfit builder, opened from The Ledger's card;
 * 'saved' is the old bookmark stage, opened from The Rail;
 * 'reads' is the editorial layer — HIDDEN from the nav, code and content
 * fully intact (Milestones overhaul, Part 6);
 * 'rail' is the OLD Rail photo-record screen — no tab-bar slot, still
 * routable by deep link;
 * 'curated' is the old Rail tab — its reference half lives in The Index,
 * its funnel half in The Hunt's Spotted stage;
 * 'radar' is the old Reserve — now The Hunt's Held stage. */
const HIDDEN_TAB_IDS: TabId[] = ['dressed', 'saved', 'reads', 'rail', 'curated', 'radar'];

function TabBar({ tab, onChange }: { tab: TabId; onChange: (t: TabId) => void }) {
  // Warm Editorial nav, two placements (founder's correction — six tabs):
  //  · DESKTOP — the six tabs as a centred header strip, 47px tall. The
  //    Dossier sits rightmost IN the strip; the account corner is retired.
  //  · PHONE — the six tabs move to a fixed BOTTOM bar at thumb height,
  //    52pt targets, same order; the slim top strip keeps the wordmark.
  const tourAnchorFor = (id: TabId) =>
    id === 'wardrobe' ? 'tour-ledger'
    : id === 'scout' ? 'tour-hunt'
    : id === 'fitting-room' ? 'tour-fitting'
    : id === 'index' ? 'tour-index'
    : undefined;

  return (
    <>
      {/* PHONE: the strip is GONE — the shell masthead above already
          carries the Ethaion wordmark, so repeating it here read as a
          duplicate smaller header (UI corrections pass). The tabs live in
          the fixed bottom bar; this strip only exists from sm up. */}
      <div className="hidden sm:block sticky top-0 z-30 bg-[var(--space-surface-card)] border-b border-[var(--space-text-primary)] flex-shrink-0">
        {/* The strip scrolls horizontally when it must, but never shows a
            scrollbar track — scrollbar-width: none (Firefox), -ms-overflow-style
            (legacy Edge) and ::-webkit-scrollbar (Chrome/Safari) all hidden. */}
        <style>{'.ethaion-tabnav{scrollbar-width:none;-ms-overflow-style:none}.ethaion-tabnav::-webkit-scrollbar{display:none;width:0;height:0}'}</style>
        <div className="relative flex items-center justify-center px-3 sm:px-12">
          <nav
            className="ethaion-tabnav hidden sm:flex justify-center gap-1 overflow-x-auto"
            style={{ WebkitOverflowScrolling: 'touch', overscrollBehaviorX: 'contain', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            aria-label="Ethaion sections"
          >
            {TABS.map(({ id, label: tabLabel, icon }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  data-tour={tourAnchorFor(id)}
                  onClick={() => onChange(id)}
                  className={`flex items-center flex-shrink-0 px-3.5 sm:px-5 h-[47px] border-b-2 -mb-px whitespace-nowrap uppercase transition-colors ${
                    active
                      ? 'border-[var(--space-brand-primary)] text-[var(--space-text-primary)]'
                      : 'border-transparent text-[var(--color-neutral-600,#856c51)] hover:text-[var(--space-text-primary)]'
                  }`}
                  style={{ fontFamily: 'var(--space-font-family)', fontSize: '12px', letterSpacing: '0.1em', fontWeight: active ? 600 : 400 }}
                  aria-current={active ? 'page' : undefined}
                >
                  <TabIcon icon={icon} />
                  {tabLabel}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* PHONE — the six tabs at the bottom, thumb height, 52pt targets,
          same order as the desktop header (Mobile spec M1 + the founder's
          six-tab correction). */}
      <nav
        className="sm:hidden fixed bottom-0 left-0 right-0 z-40 flex bg-[var(--space-surface-card)] border-t border-[var(--space-text-primary)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Ethaion sections"
      >
        {TABS.map(({ id, short, icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              data-tour={tourAnchorFor(id) ? `${tourAnchorFor(id)}-m` : undefined}
              onClick={() => onChange(id)}
              className={`flex-1 min-h-[52px] flex flex-col items-center justify-center gap-0.5 uppercase transition-colors ${
                active
                  ? 'text-[var(--space-text-primary)] border-t-2 border-[var(--space-brand-primary)] -mt-px'
                  : 'text-[var(--color-neutral-600,#856c51)]'
              }`}
              style={{ fontFamily: 'var(--space-font-family)', fontSize: '9.5px', letterSpacing: '0.1em', fontWeight: active ? 600 : 400 }}
              aria-current={active ? 'page' : undefined}
            >
              {/* TabIcon carries a right margin for the inline header row —
                  cancel it here so the stacked icon stays centred. */}
              <span className="-mr-1.5"><TabIcon icon={icon} /></span>
              {short}
            </button>
          );
        })}
      </nav>
    </>
  );
}

// ---------------------------------------------------------------------------
// What to wear today? — the FIRST of the app's three walnut bands (Pass
// Forty-One): a full-bleed #241a12 band that sits IMMEDIATELY below the
// "Your Wardrobe" page heading. Cormorant 28px heading in #f6f0e5, one short
// supporting line in Lora 15px at .78 opacity, and a tappable "Let's do it ›"
// text row (no button) that opens the full weather + occasion flow
// (StyleMeToday).
// ---------------------------------------------------------------------------

/**
 * The outfit preview inside the Beau · Today card — it fills the card's
 * RIGHT-side space (text left, preview right), showing what Beau is
 * suggesting before the tap-through. Reads the SAME cached today board The
 * Fitting uses (today-board.ts) — one compose per day per wardrobe, never
 * more.
 *
 * IT IS ONE CANVAS, not a row of thumbnails and not a set of separate cards:
 * a single `.today-canvas` — ONE light field inset in the walnut slab — with
 * a transparent `.today-piece` per garment laid on it (flat-lay-board.tsx,
 * `variant="tray"`), the same fixed ZONE layout the Fitting's stage uses
 * (head / torso / waist / legs / feet plus the side accessory column, zero
 * rotation), at 480 × 600. There is no second rendering: whatever the state
 * of the ingestion pipeline, this is the card.
 *
 * THE CANVAS IS THE ONLY BACKGROUND SURFACE HERE, and that is the whole point:
 * it is what the WALNUT needs — a navy jacket or a black shoe would otherwise
 * wash out against it — and it is also the ground an uncut photo's studio
 * white multiplies into, which is what lets a piece whose cutout has not
 * landed yet be composed with the rest rather than held back. A light square
 * behind each individual piece was the old workaround for the same problem and
 * it is gone: it turned one composed outfit back into a run of little cards.
 * The pieces themselves are transparent, so where zones overlap (torso
 * layers, socks over shoes) it is the IMAGES that overlap. The canvas carries
 * one 2px inset frame 10px inside its own edge, like a picture frame sitting
 * within the boundary.
 */
/** The tray is 480 × 600 — the zone system's portrait design size. It MUST
 * match `.today-stage`'s aspect-ratio in flat-lay-board.tsx (the transparent
 * positioning box inside the canvas), so the fixed zone percentages land
 * where the design puts them. */
const TODAY_BOARD_ASPECT = 480 / 600;

/**
 * THE TRAY'S SPACE, HELD — shown only on a FIRST compose, when there is no
 * cached board for today yet and Beau is out reasoning about one. Composing
 * the board is a model call, and the card used to show nothing at all on that
 * side until it came back, which read as a broken half-empty band.
 *
 * It is ONE quiet field in the tray's exact shape (480 × 600, right-aligned,
 * the same box `.today-canvas` occupies), deliberately NOT a row of ghost
 * squares: a placeholder that hinted at separate tiles would be the very
 * impression the flat-lay exists to undo. Nothing here renders a piece, so it
 * is not a second rendering of the composition — it is the space, waiting.
 */
const TodayTraySkeleton = memo(function TodayTraySkeleton() {
  return (
    <span
      role="status"
      aria-label={'Beau is laying out today\u2019s outfit'}
      className="block sm:flex-1 min-w-0"
      // The canvas's own box — the SQUARE framed canvas (founder's frame
      // fix): equal width and height, 420px at most, inset 16px from the
      // slab's edge, right-aligned — so the skeleton holds exactly the
      // footprint the finished tray takes.
      style={{
        width: 'calc(100% - 32px)',
        maxWidth: '420px',
        aspectRatio: '1 / 1',
        minHeight: '160px',
        margin: '16px 16px 16px auto',
      }}
    >
      <ShimmerDefs />
      {/* Paper at very low opacity — the beige shimmer the paper surfaces use
          would glare against the walnut. */}
      <span
        aria-hidden="true"
        className="block w-full h-full"
        style={{
          background:
            'linear-gradient(90deg, rgba(246,240,229,0.045) 25%, rgba(246,240,229,0.115) 50%, rgba(246,240,229,0.045) 75%)',
          backgroundSize: '200% 100%',
          animation: 'hab-shimmer 1.5s infinite',
        }}
      />
    </span>
  );
});

/** The settled tray cutouts for a set of pieces — synchronous peeks only,
 * shared by the tray's initial state and its effect so the FIRST painted
 * frame already carries every stored cutout. Only flatLayReady cuts count: a
 * cut that still has the wearer in it, or one the verification step flagged,
 * is a fine thumbnail and never a tray item. */
function settledTrayCutouts(
  pieces: WardrobePiece[],
): Record<number, { url: string; croppedWidth: number | null; croppedHeight: number | null }> {
  const settled: Record<number, { url: string; croppedWidth: number | null; croppedHeight: number | null }> = {};
  for (const piece of pieces) {
    const asset = peekFlatLayAsset((piece.photo_url || '').trim());
    if (asset?.flatLayReady) {
      settled[piece.id] = {
        url: asset.url,
        croppedWidth: asset.croppedWidth ?? null,
        croppedHeight: asset.croppedHeight ?? null,
      };
    }
  }
  return settled;
}

const TodayOutfitPreview = memo(function TodayOutfitPreview({ pieces, profile }: { pieces: WardrobePiece[]; profile: StyleProfile }) {
  const [today, setToday] = useState<TodayBoard | null>(() => peekTodayBoard(pieces));
  // True only while a FIRST compose is out — a cached board paints instantly
  // and never shows the placeholder, and a recompose (a new city, an adjusted
  // board) leaves the tray already on screen exactly where it is.
  // Initialised from the same condition the effect uses, so the very FIRST
  // painted frame already holds the tray's space — the effect runs after
  // paint, and starting at false left one blank frame before the skeleton.
  const [composing, setComposing] = useState(
    () => pieces.filter((p) => p.id > 0).length >= 3 && !peekTodayBoard(pieces),
  );
  useEffect(() => {
    let cancelled = false;
    // Only compose once the wardrobe can actually dress a day.
    if (pieces.filter((p) => p.id > 0).length >= 3) {
      if (!peekTodayBoard(pieces)) setComposing(true);
      getTodayBoard({ pieces, profile })
        .then((b) => {
          if (!cancelled) setToday(b);
        })
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled) setComposing(false);
        });
    }
    const onUpdate = () => setToday(peekTodayBoard(pieces));
    window.addEventListener(TODAY_BOARD_EVENT, onUpdate);
    // A location/weather change re-runs the compose — the board signature
    // includes the city, so a new place means a fresh weather-aware read.
    const onWeather = () => {
      if (pieces.filter((p) => p.id > 0).length >= 3) {
        getTodayBoard({ pieces, profile })
          .then((b) => {
            if (!cancelled) setToday(b);
          })
          .catch(() => undefined);
      }
    };
    window.addEventListener(WEATHER_EVENT, onWeather);
    return () => {
      cancelled = true;
      window.removeEventListener(TODAY_BOARD_EVENT, onUpdate);
      window.removeEventListener(WEATHER_EVENT, onWeather);
    };
  }, [pieces, profile]);

  const thumbs = useMemo(() => {
    if (!today) return [] as WardrobePiece[];
    const byId = new Map(pieces.map((p) => [p.id, p]));
    const withPhotos = today.pieceIds
      .map((id) => byId.get(id))
      .filter((p): p is WardrobePiece => !!p && !!(p.photo_url || '').trim());
    // Left-to-right follows the body, top to bottom: hat → outerwear →
    // jacket → knitwear → top → trousers → shoes. Leftmost = head,
    // rightmost = feet.
    return sortByBodyOrder(withPhotos, (p) => ({ category: p.category, slot: p.slot, name: p.name }));
  }, [today, pieces]);

  // THE STORED CUTOUTS. A wardrobe photo is kept on a paper card, not as a
  // cutout, so the tray needs the transparent PNG the ingestion pipeline
  // stored for it. Every piece is PEEKED first — an ingested one answers
  // synchronously from the store, which is why this card paints its finished
  // composition on the first render — and anything still missing is handed to
  // the IDLE queue rather than processed while the page is rendering.
  // The URL plus the tight-cropped PNG's pixel dimensions (pipeline v3) —
  // the tray derives each item's render width from its category height and
  // this true aspect ratio, without loading the image first.
  const [cutouts, setCutouts] = useState<Record<number, { url: string; croppedWidth: number | null; croppedHeight: number | null }>>(
    () => settledTrayCutouts(thumbs),
  );
  // How many pieces are still WAITING on the ingestion pipeline. While any
  // are, the tray's space is held by the skeleton rather than showing a
  // half-empty canvas — and never a photograph on a solid plate.
  const [pendingCutouts, setPendingCutouts] = useState(() => {
    const settled = settledTrayCutouts(thumbs);
    return thumbs.filter((piece) => (piece.photo_url || '').trim() && !settled[piece.id]).length;
  });
  useEffect(() => {
    let live = true;
    const settled = settledTrayCutouts(thumbs);
    setCutouts(settled);
    const pending = thumbs.filter((piece) => (piece.photo_url || '').trim() && !settled[piece.id]);
    setPendingCutouts(pending.length);
    if (pending.length > 0) {
      whenIdle(() => {
        for (const piece of pending) {
          if (!live) return;
          void flatLayAssetForShelf({
            candidates: (piece.photo_url || '').trim(),
            category: piece.category,
            name: piece.name,
            pieceId: piece.id,
          })
            .then((asset) => {
              if (!live || !asset.flatLayReady) return;
              setCutouts((current) =>
                current[piece.id]?.url === asset.url
                  ? current
                  : {
                      ...current,
                      [piece.id]: {
                        url: asset.url,
                        croppedWidth: asset.croppedWidth ?? null,
                        croppedHeight: asset.croppedHeight ?? null,
                      },
                    },
              );
            })
            .catch(() => undefined)
            .finally(() => {
              if (live) setPendingCutouts((count) => Math.max(0, count - 1));
            });
        }
      });
    }
    return () => {
      live = false;
    };
  }, [thumbs]);

  // ONLY GENUINE TRANSPARENCY GOES INTO THE TRAY (founder's spec): a piece
  // whose stored cutout has landed is laid on the canvas as a bare
  // alpha-channel PNG; a piece the pipeline is still cutting — or one it
  // could not cut cleanly — is marked NOT flat-lay-ready, and the board holds
  // it out of the composition. Never a photograph on a solid plate inside the
  // tray: the paper card a wardrobe photo lives on is exactly the white box
  // the composition must never show.
  const boardPieces: FlatLayPiece[] = useMemo(
    () =>
      thumbs.map((piece) => ({
        key: String(piece.id),
        name: piece.name,
        category: piece.category,
        slot: piece.slot,
        image: cutouts[piece.id]?.url || (piece.photo_url || '').trim(),
        flatLayReady: cutouts[piece.id] ? true : false,
        // The tight-cropped cutout's true aspect — only meaningful alongside
        // the cutout URL itself, so both travel together.
        croppedWidth: cutouts[piece.id]?.croppedWidth ?? null,
        croppedHeight: cutouts[piece.id]?.croppedHeight ?? null,
      })),
    [thumbs, cutouts],
  );

  // Nothing to lay out yet: hold the tray's space while Beau is composing,
  // and take none at all when there is simply no board to show.
  if (thumbs.length < 2) return composing ? <TodayTraySkeleton /> : null;

  // The tray lays out STORED TRANSPARENT CUTOUTS ONLY. While the ingestion
  // pipeline is still cutting (or the board itself is still composing) its
  // space is held by the skeleton; if nothing could be cut and nothing is
  // pending, there is no tray — never a canvas of plated photographs.
  const readyCount = boardPieces.filter((piece) => piece.flatLayReady !== false).length;
  if (readyCount < 2) return composing || pendingCutouts > 0 ? <TodayTraySkeleton /> : null;

  // THE TRAY — ONE beige canvas, every piece an absolutely-positioned child
  // laid on it in its category's fixed zone. Only genuine transparent cutouts
  // lie on it: a piece still waiting on its cutout (or flagged by the
  // verification step) is held out of the composition — its plated
  // presentation lives in The Fitting's held-out list, never inside the tray.
  return (
    <FlatLayBoard
      pieces={boardPieces}
      seed={`today-${(today?.pieceIds || []).join('-') || 'ethaion'}`}
      // DRAGGABLE PIECES: the customer can reposition any piece on the Today
      // canvas; the layout is remembered per outfit (localStorage, keyed by
      // the board's piece identity) and the zone composition stays the
      // default starting state.
      dragKey={`today-${(today?.pieceIds || []).join('-') || 'ethaion'}`}
      aspect={TODAY_BOARD_ASPECT}
      panel="walnut"
      uniformItems
      variant="tray"
      // The canvas IS the column: the layout classes go on the one background
      // surface rather than on a wrapper around it, so there is exactly one
      // box here and every piece is a child of it. No `w-full`: the canvas
      // sets its own width so its 16px inset from the slab is real space
      // rather than overflow.
      className="sm:flex-1 min-w-0"
      ariaLabel="Today's suggested outfit — laid out flat"
    />
  );
});

/**
 * THE RE-ASSESSMENT MARK — the visible half of the save/re-assess split
 * (reassess-queue.ts), on the screen where the save actually happens.
 *
 * Logging or editing a piece awaits its database write and nothing else: the
 * Save button releases at once and Beau's re-read is queued behind it. That
 * is the right architecture and it leaves one thing unsaid — the customer has
 * no way of knowing the re-read is happening. This is that line, and it is
 * deliberately the smallest thing on the page: one quiet sentence under the
 * heading while the background job runs, gone when it clears.
 *
 * It BLOCKS NOTHING. It is not a spinner over the page, it takes no space
 * when idle, and The Ledger stays fully usable throughout — the sections that
 * depend on the assessment (the Verdict, the Coverage Map, Complete the Look
 * on The Edit) re-render in place when it lands, with no reload.
 */
const ReassessMark = memo(function ReassessMark() {
  const status = useReassessStatus();
  if (status !== 'reassessing') return null;
  return (
    <p
      aria-live="polite"
      className="inline-flex items-center gap-1.5 text-[var(--color-neutral-600,#856c51)]"
      style={{ fontFamily: 'var(--space-font-family)', fontSize: '12.5px', lineHeight: 1.5, marginTop: '10px' }}
    >
      <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
      Beau is re-reading your wardrobe — carry on; The Edit updates itself.
    </p>
  );
});

/**
 * TODAY'S WEATHER GAP — the honest line on the walnut card (Today
 * weather-reasoning fix, step 5).
 *
 * When the candidate filter cannot cover a core slot with anything rated for
 * the conditions, Beau says so HERE as well as in The Fitting: a customer who
 * never taps through would otherwise see a suggested outfit with no hint that
 * it is a compromise, which is exactly the trust problem this fix exists to
 * close. Paper text at reduced opacity, not oxblood — oxblood never sits on
 * the dark walnut ground (Part 4).
 */
const TodayGapNote = memo(function TodayGapNote({ pieces }: { pieces: WardrobePiece[] }) {
  const [note, setNote] = useState<string | null>(() => peekTodayBoard(pieces)?.gapNote ?? null);
  useEffect(() => {
    const sync = () => setNote(peekTodayBoard(pieces)?.gapNote ?? null);
    sync();
    window.addEventListener(TODAY_BOARD_EVENT, sync);
    return () => window.removeEventListener(TODAY_BOARD_EVENT, sync);
  }, [pieces]);
  if (!note) return null;
  return (
    <p
      className="mt-3 italic"
      style={{
        fontFamily: 'var(--space-font-family)',
        fontSize: '13.5px',
        lineHeight: 1.55,
        color: '#f6f0e5',
        opacity: 0.82,
        maxWidth: '52ch',
        borderLeft: '2px solid rgba(246,240,229,0.45)',
        paddingLeft: '12px',
      }}
    >
      {note}
    </p>
  );
});

const WhatToWearToday = memo(function WhatToWearToday({
  pieces,
  profile,
  onPlanFullLook,
}: {
  pieces: WardrobePiece[];
  profile: StyleProfile;
  onPlanFullLook: () => void;
}) {
  // First use asks for the device location via the browser prompt (a stored
  // city never re-prompts); the profile's home city is the quiet fallback.
  useEffect(() => {
    ensureSharedWeather(homeCity(profile));
  }, [profile]);
  // THE DAILY COPY (founder's copy contract, today-copy.ts). The headline
  // and body are GENERATED, never hard-coded: they ride on the cached today
  // board (produced with the chosen pieces from the same live weather — one
  // unit, regenerated once per day per location, and together on “ask for
  // another”). Until a board with copy exists — first compose still out, or
  // a board cached before the contract — the same generator runs here on
  // the live weather, so the card is never empty and never a question.
  const [board, setBoard] = useState<TodayBoard | null>(() => peekTodayBoard(pieces));
  useEffect(() => {
    const sync = () => setBoard(peekTodayBoard(pieces));
    sync();
    window.addEventListener(TODAY_BOARD_EVENT, sync);
    window.addEventListener(WEATHER_EVENT, sync);
    return () => {
      window.removeEventListener(TODAY_BOARD_EVENT, sync);
      window.removeEventListener(WEATHER_EVENT, sync);
    };
  }, [pieces]);
  const { weather } = useSharedWeather();
  const copy = useMemo(() => {
    if (board?.headline && board?.body) return { headline: board.headline, body: board.body };
    const byId = new Map(pieces.map((p) => [p.id, p]));
    const chosen = (board?.pieceIds || [])
      .map((id) => byId.get(id))
      .filter((p): p is WardrobePiece => !!p)
      .map((p) => ({ name: p.name, category: p.category, slot: p.slot }));
    const generated = composeTodayCopy({ weather, pieces: chosen });
    return {
      headline: board?.headline || generated.headline,
      body: board?.body || generated.body,
    };
  }, [board, pieces, weather]);
  return (
    <section
      aria-label="Beau · today — the day's outfit"
      data-tour="tour-beau-today"
      className="px-6 sm:px-10 border-b border-[var(--color-divider,rgba(59,43,29,0.18))]"
      style={{ background: '#241a12', paddingTop: '48px', paddingBottom: '52px' }}
    >
      {/* Two columns: Beau's words on the left, the suggested-outfit
          preview filling the right-side space (it stacks below the copy on
          small screens). Tapping through lands on The Fitting with this
          exact board pre-filled. */}
      <div className="max-w-[1180px] mx-auto flex flex-col sm:flex-row sm:items-center gap-7 sm:gap-12">
        <div className="min-w-0 flex-1">
          {/* Oxblood never sits on the dark walnut ground (Part 4) — the
              BEAU · TODAY kicker reads in paper here. */}
          <p
            className="uppercase"
            style={{ fontFamily: 'var(--space-font-heading)', fontSize: '12px', letterSpacing: '0.16em', color: '#fbf8f1', marginBottom: '8px' }}
          >
            Beau · today
          </p>
          {/* [headline] — the weather-driven judgement call, 3–8 words,
              never a question. Generated fresh with each day's board. */}
          <h3 style={{ fontFamily: 'var(--space-font-heading)', fontWeight: 400, fontSize: '32px', lineHeight: 1.1, color: '#f6f0e5' }}>
            {copy.headline}
          </h3>
          {/* [body] — the pieces, named plainly, and why they hold up all
              day. Never mechanism copy. */}
          <p className="mt-2" style={{ fontFamily: 'var(--space-font-family)', fontSize: '15px', lineHeight: 1.6, color: '#f6f0e5', opacity: 0.78, maxWidth: '56ch' }}>
            {copy.body}
          </p>
          {/* [meta] — City · Temp°C · Condition + “Change location” (or
              “Set your location” when unknown). ONE shared state with The
              Fitting: change it in either place and both update instantly. */}
          <div className="mt-3">
            <WeatherLine tone="dark" />
          </div>
          {/* When nothing owned is rated for today, the card says so rather
              than presenting a compromise as the answer. */}
          <TodayGapNote pieces={pieces} />
          <button
            type="button"
            onClick={onPlanFullLook}
            className="mt-6 inline-flex items-center gap-1.5 group"
            style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', color: 'var(--color-accent,#a8712c)' }}
          >
            Let’s do it
            <span
              className="group-hover:translate-x-0.5 transition-transform"
              style={{ fontFamily: 'var(--space-font-heading)', fontSize: '17px', lineHeight: 1 }}
              aria-hidden="true"
            >
              ›
            </span>
          </button>
        </div>
        {/* The right-side outfit preview — renders nothing until the cached
            today board has at least two photographed pieces. */}
        <TodayOutfitPreview pieces={pieces} profile={profile} />
      </div>
    </section>
  );
});

// ---------------------------------------------------------------------------
// Wardrobe action rows (Pass Forty-Four) — plain tappable hairline rows that
// sit ABOVE the inventory: label Cormorant 19px, descriptor Lora 14px
// neutral-600, trailing ›, 1px divider bottom hairline. No fill, no radius.
// ---------------------------------------------------------------------------

const WardrobeActionRow = memo(function WardrobeActionRow({
  rowLabel,
  descriptor,
  onClick,
  compact = false,
}: {
  rowLabel: string;
  descriptor: string;
  onClick: () => void;
  /** Single-line hairline variant — roughly half the vertical space: the
   * label and descriptor share one row, for actions that should read as a
   * quiet tappable rule rather than a banner. */
  compact?: boolean;
}) {
  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full min-h-[44px] flex items-center gap-3 text-left group"
        style={{ padding: '8px 0', borderBottom: '1px solid var(--color-divider,rgba(59,43,29,0.18))', background: 'transparent', borderRadius: 0 }}
      >
        <span className="min-w-0 flex-1 flex items-baseline gap-2.5">
          <span
            className={`flex-shrink-0 ${typography.color.primary}`}
            style={{ fontFamily: 'var(--space-font-heading)', fontSize: '17px', fontWeight: 400, lineHeight: 1.2 }}
          >
            {rowLabel}
          </span>
          <span
            className="hidden sm:block truncate text-[var(--color-neutral-600,#856c51)]"
            style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px', lineHeight: 1.4 }}
          >
            {descriptor}
          </span>
        </span>
        <span
          className="flex-shrink-0 text-[var(--color-neutral-500,#a68e70)] group-hover:translate-x-0.5 transition-transform"
          style={{ fontFamily: 'var(--space-font-heading)', fontSize: '17px', lineHeight: 1 }}
          aria-hidden="true"
        >
          ›
        </span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full grid grid-cols-[minmax(0,1fr)_18px] items-center gap-3 text-left group"
      style={{ padding: '20px 0', borderBottom: '1px solid var(--color-divider,rgba(59,43,29,0.18))', background: 'transparent', borderRadius: 0 }}
    >
      <span className="min-w-0">
        <span
          className={`block ${typography.color.primary}`}
          style={{ fontFamily: 'var(--space-font-heading)', fontSize: '19px', fontWeight: 400, lineHeight: 1.2 }}
        >
          {rowLabel}
        </span>
        <span
          className="block text-[var(--color-neutral-600,#856c51)]"
          style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', lineHeight: 1.5, marginTop: '4px' }}
        >
          {descriptor}
        </span>
      </span>
      <span
        className="justify-self-end text-[var(--color-neutral-500,#a68e70)] group-hover:translate-x-0.5 transition-transform"
        style={{ fontFamily: 'var(--space-font-heading)', fontSize: '17px', lineHeight: 1 }}
        aria-hidden="true"
      >
        ›
      </span>
    </button>
  );
});

/** Keeps a visited tab's subtree mounted when the user switches away —
 * hidden with display:none instead of unmounted — so component state,
 * fetched data and decoded images survive and switching back is instant.
 * Tabs still mount lazily on their first visit, exactly as before. */
function KeepMounted({ active, children }: { active: boolean; children: React.ReactNode }) {
  const everActive = useRef(false);
  if (active) everActive.current = true;
  if (!everActive.current) return null;
  return <div style={active ? undefined : { display: 'none' }}>{children}</div>;
}

/** Suspense fallback while a lazy tab's code loads — the standard shimmer
 * hairline rows in the page frame, never a blank screen or a spinner. */
function TabLoadingSkeleton() {
  return (
    <div className="px-6 sm:px-10 pt-[52px]">
      <div className="max-w-[1180px] mx-auto">
        <HairlineRowsSkeleton rows={6} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

export default function BeauHome() {
  const [profile, setProfile] = useState<StyleProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [budgets, setBudgets] = useState<Record<string, CategoryBudget>>({});
  const [prefs, setPrefs] = useState<StylePrefs | null>(null);
  const [materials, setMaterials] = useState<Record<number, string>>({});
  const [pieceDetails, setPieceDetails] = useState<Record<number, PieceDetails>>({});
  const [pieceAttributes, setPieceAttrs] = useState<Record<number, PieceAttributes>>({});
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [openStyleToday, setOpenStyleToday] = useState(false);
  // "All pieces" — The Ledger's full-inventory page (Part 2b).
  const [openSeeAll, setOpenSeeAll] = useState(false);
  const [tab, setTab] = useState<TabId>('wardrobe');
  // The single end-of-onboarding save nudge — set once when a guest finishes
  // onboarding, dismissed forever after (Save or Skip).
  const [showSaveNudge, setShowSaveNudge] = useState(false);
  // Retroactive photo clean-up (Pass Twenty-Six): every piece with a photo
  // is swept through client-side background removal + white-card
  // normalization in the background — this drives the subtle progress pill,
  // never a blocking state. One-time only (bgRemovalV46 flag).
  const [photoSweep, setPhotoSweep] = useState<MigrationProgress | null>(null);
  // Keyed by the wardrobe's piece-id set so newly added pieces are swept too;
  // already-settled pieces are skipped inside runPhotoMigration, so repeat
  // sweeps are cheap no-ops.
  const photoSweepKicked = useRef('');
  const [optimisticPiecePatches, setOptimisticPiecePatches] = useState<Record<number, Partial<WardrobePiece> & { pattern?: string | null }>>({});
  // Optimistic ADDS (Pass Forty-Six): a freshly saved piece appears in the
  // wardrobe immediately — faint, marked __pending — while the insert is in
  // flight; a failed save removes it again.
  const [optimisticNewPieces, setOptimisticNewPieces] = useState<Array<WardrobePiece & { __pending?: boolean }>>([]);

  const {
    data: rawPieces,
    loading: piecesLoading,
    refresh: refreshPieces,
  } = window.useWorkspaceDB<WardrobePiece>('wardrobe_pieces', {
    orderBy: { column: 'created_at', direction: 'asc' },
    limit: 100,
  });

  const pieces = useMemo(
    () => [
      ...(rawPieces ?? []).map((row) => {
        const piece = normalizePiece(row);
        const attr = pieceAttributes[piece.id];
        return {
          ...piece,
          // Display guard (Pass Twenty-One): a label may only say "Patterned"
          // when the structured pattern field is explicitly non-solid — plain
          // pieces never show it. User-typed names are kept as typed.
          name: attr?.name_is_custom === true ? piece.name : reconcilePatternedName(piece.name, attr?.pattern || null),
          pattern: attr?.pattern || null,
          ...(optimisticPiecePatches[piece.id] || {}),
        } as WardrobePiece & { pattern?: string | null };
      }),
      // Optimistic adds close the list — they carry __pending for the faint
      // row treatment until the write settles. A ghost whose real row has
      // already arrived (same name + category) is dropped immediately so the
      // piece never shows twice.
      ...optimisticNewPieces.filter(
        (ghost) => !(rawPieces ?? []).some((row) => row.name === ghost.name && row.category === ghost.category),
      ),
    ],
    [rawPieces, pieceAttributes, optimisticPiecePatches, optimisticNewPieces],
  );

  const refreshMaterials = useCallback(() => {
    fetchMaterials().then(setMaterials).catch(() => undefined);
  }, []);
  const refreshDetails = useCallback(() => {
    fetchPieceDetails().then(setPieceDetails).catch(() => undefined);
  }, []);
  const refreshAttributes = useCallback(() => {
    fetchPieceAttributes().then(setPieceAttrs).catch(() => undefined);
  }, []);

  // Pieces + their companion metadata rows refresh together.
  const refreshAll = useCallback(() => {
    refreshPieces();
    refreshMaterials();
    refreshDetails();
    refreshAttributes();
  }, [refreshPieces, refreshMaterials, refreshDetails, refreshAttributes]);

  // ---------------------------------------------------------------------
  // BOOT, IN TWO PHASES.
  //
  // Phase 1 — only what the first screen actually needs to draw: the
  // profile, prefs, budgets and the piece companion tables. These go out in
  // parallel and nothing else competes with them.
  //
  // Phase 2 — the four housekeeping audits (legacy migration, season tags,
  // pattern labels, duplicates). None of them affect what the user sees on
  // arrival, but they used to run in the same tick as phase 1, each issuing
  // its own full `wardrobe_pieces` read and then a serial write per affected
  // row. They now wait for the browser to go idle, share ONE cached read
  // between them, and coalesce into a single refresh at the end instead of
  // up to four.
  // ---------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    // --- Phase 1: first-paint data ---
    fetchProfile()
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch((e) => console.error('[Ethaion] failed to load profile:', e))
      .finally(() => {
        if (!cancelled) setProfileLoaded(true);
      });
    fetchCategoryBudgets()
      .then((b) => {
        if (!cancelled) setBudgets(b);
      })
      .catch((e) => console.error('[Ethaion] failed to load budgets:', e));
    // Prefs: secondhand openness + display currency + free-text context.
    fetchPrefs()
      .then((p) => {
        if (!cancelled) setPrefs(p);
      })
      .catch((e) => console.error('[Ethaion] failed to load prefs:', e));
    refreshMaterials();
    refreshDetails();
    refreshAttributes();

    // --- Phase 2: housekeeping, once the page is interactive ---
    if (auditsKicked) {
      return () => {
        cancelled = true;
      };
    }
    auditsKicked = true;

    whenIdle(() => {
      if (cancelled) return;
      void (async () => {
        let piecesChanged = false;
        let materialsChanged = false;

        // Sequential BY DESIGN: each audit reads the shared cached snapshot,
        // and running them in parallel would let two of them rewrite the same
        // row from the same stale copy. Sequential is fine now that it costs
        // one read total and happens off the critical path.
        try {
          if (await migrateLegacyItems()) piecesChanged = true;
        } catch { /* non-fatal */ }
        if (cancelled) return;
        try {
          if (await auditSeasonTags()) piecesChanged = true;
        } catch { /* non-fatal */ }
        if (cancelled) return;
        try {
          if (await auditPatternLabels()) piecesChanged = true;
        } catch { /* non-fatal */ }
        if (cancelled) return;
        try {
          if (await auditDuplicatePieces()) {
            piecesChanged = true;
            materialsChanged = true;
          }
        } catch { /* non-fatal */ }
        if (cancelled) return;

        // ONE refresh for the whole batch. Previously each audit that changed
        // anything triggered its own, so a wardrobe needing all four fixes
        // re-fetched and re-rendered the full list four times on arrival.
        if (piecesChanged) refreshPieces();
        if (materialsChanged) refreshMaterials();
      })();
    }, 4000);

    return () => {
      cancelled = true;
    };
  }, []);

  // Piece edits close immediately and publish this optimistic patch. Keeping
  // the overlay at the app root prevents any unrelated render from briefly
  // restoring stale DB values while the background save is still in flight.
  useEffect(() => {
    const onOptimistic = (event: Event) => {
      const patch = (event as CustomEvent).detail?.piece as (WardrobePiece & { pattern?: string | null }) | undefined;
      if (!patch?.id) return;
      setOptimisticPiecePatches((current) => ({ ...current, [patch.id]: patch }));
    };
    const onRollback = (event: Event) => {
      const pieceId = Number((event as CustomEvent).detail?.pieceId);
      if (!pieceId) return;
      setOptimisticPiecePatches((current) => {
        const next = { ...current };
        delete next[pieceId];
        return next;
      });
    };
    window.addEventListener('ethaion:piece-optimistic', onOptimistic);
    window.addEventListener('ethaion:piece-rollback', onRollback);
    window.addEventListener('ethaion:piece-settled', onRollback);
    return () => {
      window.removeEventListener('ethaion:piece-optimistic', onOptimistic);
      window.removeEventListener('ethaion:piece-rollback', onRollback);
      window.removeEventListener('ethaion:piece-settled', onRollback);
    };
  }, []);

  // Optimistic ADD events (Pass Forty-Six): the save flows append the new
  // piece instantly (`piece-add-optimistic`), then either settle it (the DB
  // write landed — the row swaps for the real one on refresh) or fail it
  // (the row is removed and the flow shows an inline error).
  useEffect(() => {
    const onAddOptimistic = (event: Event) => {
      const piece = (event as CustomEvent).detail?.piece as WardrobePiece | undefined;
      if (!piece?.id) return;
      setOptimisticNewPieces((current) => [...current, { ...piece, __pending: true, __tempId: piece.id } as WardrobePiece & { __pending: boolean }]);
    };
    const remove = (event: Event) => {
      const tempId = Number((event as CustomEvent).detail?.tempId);
      if (!tempId) return;
      setOptimisticNewPieces((current) => current.filter((p) => p.id !== tempId));
    };
    window.addEventListener('ethaion:piece-add-optimistic', onAddOptimistic);
    window.addEventListener('ethaion:piece-add-failed', remove);
    return () => {
      window.removeEventListener('ethaion:piece-add-optimistic', onAddOptimistic);
      window.removeEventListener('ethaion:piece-add-failed', remove);
    };
  }, []);

  // A completed first-save photo pipeline swaps the raw optimistic image for
  // its stored Photoroom/canonical result without a reload.
  useEffect(() => {
    // A settled photo changes exactly one column on one table (`photo_url` on
    // wardrobe_pieces). This used to call refreshAll() — re-reading materials,
    // details and attributes as well — so every photo that finished processing
    // cost four round-trips and a full re-render of the wardrobe instead of
    // one. That is the stutter you feel right after adding a photo.
    window.addEventListener('ethaion:piece-photo-settled', refreshPieces);
    return () => window.removeEventListener('ethaion:piece-photo-settled', refreshPieces);
  }, [refreshPieces]);

  // A settled optimistic add is cleared as soon as the refreshed rows
  // contain a real piece newer than it — no flicker, no double row.
  useEffect(() => {
    const onAddSettled = (event: Event) => {
      const tempId = Number((event as CustomEvent).detail?.tempId);
      if (!tempId) return;
      // The write landed — refresh brings the real row; drop the ghost once
      // the data comes back (a short grace keeps the row visible meanwhile).
      window.setTimeout(() => {
        setOptimisticNewPieces((current) => current.filter((p) => p.id !== tempId));
      }, 900);
    };
    window.addEventListener('ethaion:piece-add-settled', onAddSettled);
    return () => window.removeEventListener('ethaion:piece-add-settled', onAddSettled);
  }, []);

  // Cross-surface tab navigation: chat deep links and embedded screens
  // dispatch `ethaion:navigate` with { tab }. A profile reset from the
  // Your Style tab also lands here, so re-check the profile each time.
  useEffect(() => {
    const onNavigate = (e: Event) => {
      let wanted = (e as CustomEvent).detail?.tab as string | undefined;
      // Legacy deep link: the Explore tab merged into Scout (Pass Twelve).
      if (wanted === 'explore') wanted = 'scout';
      if (wanted && (TABS.some((t) => t.id === wanted) || HIDDEN_TAB_IDS.includes(wanted as TabId))) {
        setTab(wanted as TabId);
        setOpenCategory(null);
        setOpenStyleToday(false);
        setOpenSeeAll(false);
      }
      // Deep link: "style-today" opens The Ledger's daily-outfit surface.
      if (wanted === 'style-today') {
        setTab('wardrobe');
        setOpenCategory(null);
        setOpenStyleToday(true);
        setOpenSeeAll(false);
      }
      fetchProfile()
        .then((p) => setProfile(p))
        .catch(() => undefined);
    };
    window.addEventListener('ethaion:navigate', onNavigate);
    return () => window.removeEventListener('ethaion:navigate', onNavigate);
  }, []);

  // The Index's "Log one I own" / "Add to the Ledger" (ethaion:add-piece):
  // land on The Ledger — the Add a piece surface listens for the SAME event
  // (add-piece.tsx) and opens its Search flow seeded with the type name.
  useEffect(() => {
    const onAddPiece = () => {
      setTab('wardrobe');
      setOpenCategory(null);
      setOpenStyleToday(false);
      setOpenSeeAll(false);
    };
    window.addEventListener('ethaion:add-piece', onAddPiece);
    return () => window.removeEventListener('ethaion:add-piece', onAddPiece);
  }, []);

  // Keep-mounted tabs: announce each activation so panels that stay mounted
  // in the background (The Reserve, The Fitting) can refresh their own data
  // the moment they come forward — the freshness a remount used to provide.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('ethaion:tab-activated', { detail: { tab } }));
  }, [tab]);

  // Beau and Your Style both broadcast profile changes. Re-read on focus too,
  // so a chat-authored edit is visible the moment the app comes forward.
  useEffect(() => {
    const refreshProfile = () => fetchProfile().then(setProfile).catch(() => undefined);
    const onProfile = (e: Event) => {
      const fresh = (e as CustomEvent).detail?.profile as StyleProfile | undefined;
      if (fresh) setProfile(fresh);
      else refreshProfile();
    };
    window.addEventListener('ethaion:profile', onProfile);
    window.addEventListener('focus', refreshProfile);
    return () => {
      window.removeEventListener('ethaion:profile', onProfile);
      window.removeEventListener('focus', refreshProfile);
    };
  }, []);

  // Live prefs updates (currency / secondhand changed in Your Style) — keeps
  // Curated prices and secondhand filtering in sync without a reload.
  useEffect(() => {
    const onPrefs = (e: Event) => {
      const fresh = (e as CustomEvent).detail?.prefs as StylePrefs | undefined;
      if (fresh) setPrefs(fresh);
      else fetchPrefs().then(setPrefs).catch(() => undefined);
    };
    window.addEventListener('ethaion:prefs', onPrefs);
    return () => window.removeEventListener('ethaion:prefs', onPrefs);
  }, []);

  // THE CUTOUT STORE, READ ONCE, BEFORE ANY GRID PAINTS (image pipeline,
  // Step 4). Every surface that shows an item peeks this store synchronously,
  // so an item ingested on an earlier visit — or on another device — answers
  // instantly with the CDN URL of its stored transparent PNG and nothing has
  // to be processed while a page is rendering.
  useEffect(() => {
    void hydrateImagePipelineStore();
  }, []);

  // THE BACKGROUND INGESTION JOB. Owned pieces logged before this pipeline
  // existed have a photograph but no stored cutout, so they are put through it
  // here — on the idle queue, after the store has been read, one piece at a
  // time — and the Today tray and the Fitting board then find a finished
  // transparent PNG waiting for them instead of making one mid-render. Pieces
  // already ingested are skipped for nothing.
  const cutoutSweepKicked = useRef('');
  useEffect(() => {
    const withPhotos = pieces.filter((p) => p.id > 0 && (p.photo_url || '').trim());
    if (withPhotos.length === 0) return;
    const key = withPhotos.map((p) => p.id).sort((a, b) => a - b).join(',');
    if (cutoutSweepKicked.current === key) return;
    cutoutSweepKicked.current = key;
    let live = true;
    void hydrateImagePipelineStore().then(() => {
      if (!live) return;
      whenIdle(() => {
        void (async () => {
          for (const piece of withPhotos) {
            if (!live) return;
            const source = (piece.photo_url || '').trim();
            if (peekFlatLayAsset(source)) continue;
            await flatLayAssetForShelf({
              candidates: source,
              category: piece.category,
              name: piece.name,
              pieceId: piece.id,
            }).catch(() => undefined);
          }
        })();
      }, 6000);
    });
    return () => {
      live = false;
    };
  }, [pieces]);

  // Pass Forty-Nine (the universal transparency rule): on first load, EVERY
  // piece with a photo is re-run through THE ONE ingestion pipeline — the
  // original uploaded photo (or the best surviving image) becomes a stored
  // GENUINE alpha-channel transparent cutout (background removed, alpha edge
  // eroded ~2px, tight-cropped to the silhouette + 4px, verified on both
  // real grounds). Runs once (bgRemovalV49 flag); repeat calls are cheap
  // no-ops, and pieces whose photo is already a stored cutout are skipped.
  //
  // THREE THINGS WERE WRONG HERE AND ALL THREE COST THE USER TIME.
  //
  // 1. It started 350ms after the pieces arrived — i.e. right on top of the
  //    first paint, so the heaviest main-thread work in the app (canvas pixel
  //    passes, one per photo) ran exactly while the user was trying to scroll.
  //    It now waits for a genuinely idle browser.
  // 2. It called `refreshAll()` on completion — four table re-reads and a full
  //    list re-render — while `pieces` was in its own dependency array. A
  //    sweep that changed anything therefore produced new `pieces`, which
  //    re-armed the effect. Only the id-set guard stopped it looping, and any
  //    add or delete re-armed it anyway. It now refreshes only the piece rows,
  //    and the guard is keyed so a settled sweep cannot re-trigger itself.
  // 3. `materials`, `pieceAttributes` and `refreshAll` were dependencies but
  //    never read from the closure — the effect re-ran on every unrelated
  //    metadata change and immediately bailed on the guard, but only after
  //    React had already torn down and re-created the timer.
  //
  const photoSweepRan = useRef(false);
  useEffect(() => {
    if (pieces.length === 0) return;
    const withPhotos = pieces.filter((p) => p.id > 0 && (p.photo_url || '').trim());
    if (withPhotos.length === 0) return;
    const sweepKey = withPhotos.map((p) => p.id).sort((a, b) => a - b).join(',');
    if (photoSweepKicked.current === sweepKey) return;
    photoSweepKicked.current = sweepKey;

    let live = true;
    // The first sweep of a session is the expensive one. Give the page a real
    // chance to become interactive first; later incremental sweeps (a single
    // newly added piece) are cheap and can start sooner.
    whenIdle(() => {
      if (!live) return;
      void Promise.all([fetchMaterials(), fetchPieceAttributes()])
        .then(([freshMaterials, freshAttributes]) => {
          if (!live) return 0;
          const patterns = Object.fromEntries(
            Object.entries(freshAttributes).map(([id, value]) => [Number(id), value.pattern || null]),
          );
          return runPhotoMigration(withPhotos, freshMaterials, setPhotoSweep, patterns);
        })
        .then((changed) => {
          photoSweepRan.current = true;
          // Narrowed from refreshAll(): the sweep only ever rewrites
          // `photo_url` on wardrobe_pieces, so re-reading materials, details
          // and attributes was three wasted round-trips and a wasted render.
          if (live && (changed || 0) > 0) refreshPieces();
        })
        .catch(() => undefined);
    }, photoSweepRan.current ? 1200 : 8000);

    return () => {
      live = false;
    };
    // `pieces` only. The other three were read from fresh fetches inside the
    // effect, never from the closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieces, refreshPieces]);

  // LAYER 1 catch-up sweep (Beau intelligence overhaul): pieces logged
  // before the overhaul — or via chat tools that write straight to the
  // table — get their background semantic classification (semantic-tags.ts)
  // a moment after load. Repeat sweeps are cheap no-ops.
  const semanticSweepKicked = useRef('');
  useEffect(() => {
    const real = pieces.filter((p) => p.id > 0);
    if (real.length === 0) return;
    const key = real.map((p) => p.id).sort((a, b) => a - b).join(',');
    if (semanticSweepKicked.current === key) return;
    semanticSweepKicked.current = key;
    const timer = window.setTimeout(() => {
      void sweepSemanticTags(real, materials).catch(() => undefined);
      // WARMTH catch-up (Today weather-reasoning fix): pieces logged before
      // the warmth model existed get their band stored too. The daily
      // candidate filter never waits on this — it infers a band for anything
      // without a row — so the sweep only makes the read inspectable and
      // overridable.
      void sweepPieceWarmth(real, materials).catch(() => undefined);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [pieces, materials]);

  // LAYER 2 auto-refresh now lives in BeauAssessmentProvider (the app-level
  // assessment state, wrapped around the shell below): the assessment result
  // survives tab switches and re-runs ONLY when the wardrobe, archetypes,
  // profile, budgets or taste memory actually change — never on navigation.

  // Stable reference (Pass Forty-Six) so memoised children (CategoryGrid,
  // ItemCard) don't re-render on unrelated App state changes.
  const removePiece = useCallback(async (id: number) => {
    await deletePiece(id);
    refreshAll();
  }, [refreshAll]);

  // Fitting entry points (Fitting overhaul, Part 3.1): The Fitting is ONE
  // shared canvas — "Build a Look" hands it an empty board, "Beau · Today"
  // a pre-filled board + reasoning strip (Beau · Trip's form lives in
  // trip-card.tsx). Dynamic imports keep the Fitting's code lazy-loaded.
  const openManualFitting = useCallback(() => {
    void import('./fitting-room-state').then((m) => m.requestFittingBoard({ source: 'manual' }));
  }, []);
  const openTodayFitting = useCallback(() => {
    void import('./fitting-room-state').then((m) => m.requestFittingBoard({ source: 'today' }));
  }, []);
  const openTripFitting = useCallback(() => {
    // No brief here — The Fitting opens in Trip mode and shows the short
    // destination / dates / occasions form itself (Part 10).
    void import('./fitting-room-state').then((m) => m.requestFittingBoard({ source: 'trip' }));
  }, []);

  // Stable handlers for the memoised panels and action rows — inline arrows
  // here would hand every memoised child a fresh prop on each app render
  // and defeat React.memo entirely.
  const openAllPieces = useCallback(() => setOpenSeeAll(true), []);
  const closeAllPieces = useCallback(() => setOpenSeeAll(false), []);
  const closeStyleToday = useCallback(() => setOpenStyleToday(false), []);
  const closeCategory = useCallback(() => setOpenCategory(null), []);
  const backToWardrobe = useCallback(() => setTab('wardrobe'), []);
  const backToCurated = useCallback(() => setTab('curated'), []);

  // FLOATING BACK (founder's fix): the one back action the CURRENT view
  // supports, if any — exactly the handler that view's own back button
  // already calls. Top-level tab roots have none, so nothing floats there;
  // the button itself only appears once the page is scrolled down.
  const floatingBack =
    tab === 'wardrobe' && openStyleToday ? closeStyleToday
    : tab === 'wardrobe' && !openStyleToday && openCategory ? closeCategory
    : tab === 'wardrobe' && !openStyleToday && !openCategory && openSeeAll ? closeAllPieces
    : tab === 'dressed' ? backToWardrobe
    : tab === 'saved' ? backToCurated
    : null;

  if (!profileLoaded) {
    // Skeleton over spinner (Track J): ghost outlines of the page that's
    // coming, so opening the wardrobe feels instant rather than waited-for.
    return <HomeSkeleton />;
  }

  // Onboarding runs before anything else — and resumes mid-flow.
  if (!profile || !profile.onboarding_complete) {
    return (
      <Onboarding
        profile={profile}
        prefs={prefs}
        onDone={(p) => {
          setProfile(p);
          setTab('wardrobe');
          setOpenCategory(null);
          setOpenStyleToday(false);
          refreshAll();
          fetchPrefs().then(setPrefs).catch(() => undefined);
          // The ONE soft save nudge (Pass Nine): shown right after the final
          // onboarding step, just before the dashboard — guests only, always
          // dismissable, never a blocker.
          if (isGuestUnsaved()) setShowSaveNudge(true);
        }}
      />
    );
  }

  return (
    <BeauAssessmentProvider profile={profile} pieces={pieces} budgets={budgets} prefs={prefs}>
    <div className="min-h-full bg-[var(--space-surface-page)] relative flex flex-col">
      {/* Persistent navigation — The Ledger · The Edit · The Fitting ·
          The Hunt · The Index · The Dossier (six tabs — the founder's
          correction; on a phone the six tabs sit in the bottom bar). */}
      <TabBar
        tab={tab}
        onChange={(t) => {
          setTab(t);
          setOpenCategory(null);
          setOpenStyleToday(false);
          setOpenSeeAll(false);
        }}
      />

      {/* Subtle first-load migration pill: every old piece is run through
          background removal + white-card normalization without blocking the
          wardrobe. */}
      {photoSweep?.active && (
        <div className="fixed bottom-[72px] sm:bottom-4 right-4 z-40 rounded-full bg-[var(--space-surface-card)] border border-[var(--space-border-default)] shadow-md px-3.5 py-2 flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--space-text-brand)]" />
          <span className={`${typography.size.xs} ${typography.color.secondary}`}>
            Refreshing wardrobe images… {Math.min(photoSweep.done + 1, photoSweep.total)} of {photoSweep.total}
          </span>
        </div>
      )}

      {/* Bottom padding on phones clears the fixed bottom tab bar. */}
      <div className="flex-1 pb-[68px] sm:pb-0">
        {/* Tab panels stay mounted once visited (KeepMounted) — switching
            tabs hides them with display:none instead of unmounting, so
            their state and data survive and switching back is instant. */}
        <KeepMounted active={tab === 'wardrobe'}>
        {openStyleToday && (
          <Suspense fallback={<TabLoadingSkeleton />}>
          <StyleMeToday
            pieces={pieces}
            materials={materials}
            profile={profile}
            onBack={closeStyleToday}
            onChanged={refreshAll}
          />
          </Suspense>
        )}

        {!openStyleToday && openCategory && (
          <CategoryPage
            categoryId={openCategory}
            pieces={pieces}
            materials={materials}
            details={pieceDetails}
            onBack={closeCategory}
            onDelete={removePiece}
            onAdded={refreshAll}
            addPanel={<AddPieceHub categoryId={openCategory} pieces={pieces} onAdded={refreshAll} />}
          />
        )}

        {/* SEE ALL PIECES — the full inventory view: every category as a
            horizontal row of tiles, filters by category and sub-type. */}
        {!openStyleToday && !openCategory && openSeeAll && (
          <SeeAllPieces
            pieces={pieces}
            materials={materials}
            onBack={closeAllPieces}
            onChanged={refreshAll}
          />
        )}

        {!openStyleToday && !openCategory && !openSeeAll && (
          <>
            {/* Page heading: "The Ledger" (was "Your wardrobe") — Cormorant
                52px, closed by a hairline. Beneath it, and ONLY while a
                queued pass is actually running, the re-assessment mark. */}
            <div className="px-6 sm:px-10 pt-[52px] pb-8 border-b border-[var(--color-divider,rgba(59,43,29,0.18))]">
              <div className="max-w-[1180px] mx-auto">
                <h2 className={`hab-page-title ${typography.color.primary}`} style={{ marginBottom: '10px' }}>
                  The Ledger
                </h2>
                <p className={`hab-standfirst ${typography.color.secondary}`} style={{ margin: 0 }}>
                  Beau’s live read of your wardrobe — and what deserves your money next.
                </p>
                <ReassessMark />
              </div>
            </div>

            {/* THE LEDGER LAYOUT (Recommendation Engine overhaul, Part 7) —
                strict order: 1 Build a look · 2 Beau · Today · 3 Plan for a
                trip · 4 Add a piece · 5 Your pieces. VISUAL RULE: dark card =
                Beau-initiated TIME-SENSITIVE prompt (Today only); plain
                hairline row = user-initiated or contextual action (Build a
                look, Plan for a trip). This distinction holds everywhere. */}

            {/* 1 — "Build a look": plain tappable hairline row — opens The
                Fitting with an empty board (the manual entry point). Styled
                IDENTICALLY to "Plan for a trip" below (founder's fix pass):
                the same full WardrobeActionRow treatment, not the compact
                variant — same typography, dividers and colours. */}
            <div className="px-6 sm:px-10">
              <div className="max-w-[1180px] mx-auto">
                <WardrobeActionRow
                  rowLabel="Build a look"
                  descriptor="Pull together an outfit from what you own."
                  onClick={openManualFitting}
                />
              </div>
            </div>

            {/* 2 — Beau · Today: the ONE walnut band — the priority prompt,
                full visual weight. It previews the suggested outfit (Part 8)
                and hands off to The Fitting with the same board pre-filled. */}
            <WhatToWearToday pieces={pieces} profile={profile} onPlanFullLook={openTodayFitting} />

            {/* 3 — "Plan for a trip": a plain hairline row (user-initiated,
                contextual — NOT a dark card). Routes to The Fitting in Trip
                mode, where the short brief form now lives. */}
            <div className="px-6 sm:px-10">
              <div className="max-w-[1180px] mx-auto">
                <WardrobeActionRow
                  rowLabel="Plan for a trip"
                  descriptor="Tell Beau where you’re going — he’ll build a capsule and flag what’s missing."
                  onClick={openTripFitting}
                />
              </div>
            </div>

            {/* 4 — "Add a piece": the full 23a surface — its own "Add a
                piece" header with the [ Photograph ] [ Search ] pills at the
                right edge, the photo-led card flow beneath (add-piece.tsx). */}
            <div className="px-6 sm:px-10 pt-10">
              <div className="max-w-[1180px] mx-auto">
                <AddPieceSection pieces={pieces} onAdded={refreshAll} />
              </div>
            </div>

            {/* (The old "Plan a Trip" walnut band is retired — the Beau ·
                Trip card above hands the whole flow to The Fitting's Trip
                mode. travel.tsx stays routable in code only.) */}

            <div className="max-w-[1180px] mx-auto w-full">
              {/* ONE soft save nudge — appears once, right after onboarding,
                  with Save and Skip. Guests only; never re-shown. */}
              {showSaveNudge && (
                <div className="px-6 sm:px-10 pt-8">
                  <SaveProfileNudge onDismiss={() => setShowSaveNudge(false)} />
                </div>
              )}

              {/* Your Pieces (Part 2b) — a clean inventory of what the user
                  actually owns: search bar → the "All pieces" row → the
                  category sections, each with a simple raw piece count
                  (never a fraction, never an "x / y needed"). Coverage
                  judgement lives in The Edit's coverage map, not here. The
                  LAST section — it closes the page with the 72px bottom
                  padding (the old "On the Rail" section was removed: owned
                  pieces are already organised by category here). */}
              <section className="px-6 sm:px-10 pt-[52px] pb-[72px]" data-tour="tour-ledger-pieces">
                <div className="pb-2.5 border-b border-[var(--color-text,#3b2b1d)] mb-4">
                  <h3 className={`hab-section-head ${typography.color.primary}`}>Your pieces</h3>
                </div>
                {(piecesLoading || rawPieces == null) && (rawPieces ?? []).length === 0 ? (
                  /* Wardrobe pieces loading — shimmer hairline rows in the
                     shape of the category list (Pass Forty-Six): never a
                     blank area, never a spinner. `rawPieces == null` is part
                     of the guard so the pre-first-fetch state also shows the
                     skeleton rather than an empty list. */
                  <HairlineRowsSkeleton rows={6} />
                ) : (
                  <WardrobeSearch
                    pieces={pieces}
                    materials={materials}
                    details={pieceDetails}
                    attributes={pieceAttributes}
                    onDelete={removePiece}
                    onChanged={refreshAll}
                  >
                    {/* "All pieces" — below the search bar, before the
                        categories: opens the full row-layout inventory. */}
                    {pieces.length > 0 && (
                      <WardrobeActionRow
                        rowLabel="All pieces"
                        descriptor="Every piece you own, category by category, with filters"
                        onClick={openAllPieces}
                      />
                    )}
                    <CategoryGrid pieces={pieces} onOpen={setOpenCategory} />
                  </WardrobeSearch>
                )}
              </section>

            </div>
          </>
        )}
        </KeepMounted>

        {/* The Rail (was Curated) — the action layer of The Edit: Beau's
            ranked recommendations, spec sheets and live hunts. The Saved
            stage's entry row lives here. */}
        <KeepMounted active={tab === 'curated'}>
          <div className="px-6 sm:px-10 py-8 max-w-[1180px] mx-auto w-full pb-28">
            {/* The Saved entry now renders inside CuratedTab as a plain
                hairline row, directly under the standfirst (Pass Forty-One). */}
            <Suspense fallback={<HairlineRowsSkeleton rows={6} />}>
              <CuratedTab profile={profile} budgets={budgets} pieces={pieces} prefs={prefs} onBudgetsSaved={setBudgets} />
            </Suspense>
          </div>
        </KeepMounted>

        {/* The Edit — Beau's live assessment of the wardrobe (the
            intelligence overhaul): verdict, the six-step foundation ladder,
            what to acquire next and per-direction essentials coverage, all
            from one cached live reasoning pass with a quiet Re-assess. */}
        <KeepMounted active={tab === 'beau'}>
          {/* BeauTab carries its own standard masthead (title + standfirst,
              full-width hairline) — the wrapper only holds the bottom pad. */}
          <div className="pb-28">
            <Suspense
              fallback={
                <div className="px-6 sm:px-10 py-8 max-w-[1180px] mx-auto w-full">
                  <HairlineRowsSkeleton rows={6} />
                </div>
              }
            >
              <BeauTab profile={profile} budgets={budgets} pieces={pieces} prefs={prefs} />
            </Suspense>
          </div>
        </KeepMounted>

        {/* Fitting Room — the single home for all try-on activity: the
            soft-edged avatar panel + the three shelf rails (Beau's Picks ·
            On your Radar · What you own). Every "Try this on" button across
            the app lands here with its piece already rendering. */}
        <KeepMounted active={tab === 'fitting-room'}>
          <Suspense fallback={<TabLoadingSkeleton />}>
            <FittingRoomTab profile={profile} budgets={budgets} pieces={pieces} prefs={prefs} />
          </Suspense>
        </KeepMounted>

        {/* Reads — the editorial layer. HIDDEN from the tab bar (Part 6):
            all code, data and content intact, still routable by deep link. */}
        {tab === 'reads' && (
          <Suspense fallback={<TabLoadingSkeleton />}>
            <FromHabitus />
          </Suspense>
        )}

        {/* Build a Look — the outfit builder / pieces-on-rails view (was "The Edit") */}
        {tab === 'dressed' && (
          <Suspense fallback={<TabLoadingSkeleton />}>
            <WardrobeStore
              pieces={pieces}
              materials={materials}
              details={pieceDetails}
              onBack={backToWardrobe}
              onDelete={removePiece}
              onChanged={refreshAll}
            />
          </Suspense>
        )}

        {/* The OLD Rail — photo record of everything owned. No tab-bar slot
            any more (its contents merged into The Ledger's "On the Rail"
            section) but the full screen stays routable. */}
        {tab === 'rail' && (
          <Suspense fallback={<TabLoadingSkeleton />}>
            <RailTab pieces={pieces} materials={materials} onChanged={refreshAll} />
          </Suspense>
        )}

        <KeepMounted active={tab === 'your-style'}>
          <Suspense fallback={<TabLoadingSkeleton />}>
            <YourStyle />
          </Suspense>
        </KeepMounted>

        {/* Scout — the unified research surface (Pass Twelve): active hunts &
            reviews plus the Browse sandbox that absorbed the Explore tab */}
        <KeepMounted active={tab === 'scout'}>
          <Suspense fallback={<TabLoadingSkeleton />}>
            <ScoutTab profile={profile} budgets={budgets} pieces={pieces} prefs={prefs} />
          </Suspense>
        </KeepMounted>

        {/* The Index — the reference wing: the piece taxonomy + the maker
            directory (design handoff 13a · 9a). */}
        <KeepMounted active={tab === 'index'}>
          <Suspense fallback={<TabLoadingSkeleton />}>
            <IndexTab pieces={pieces} profile={profile} />
          </Suspense>
        </KeepMounted>

        {/* Radar — the old Reserve, HIDDEN from the nav (its records are The
            Hunt's Held stage) — still routable by deep link. */}
        <KeepMounted active={tab === 'radar'}>
          <Suspense fallback={<TabLoadingSkeleton />}>
            <RadarTab />
          </Suspense>
        </KeepMounted>

        {/* Saved — bookmarks from Curated and every intake path. Routable view
            (no tab-bar slot); opened from the Curated tab's card or chat. */}
        {tab === 'saved' && (
          <div>
            <div className="px-5 pt-4 max-w-4xl mx-auto w-full">
              <button
                type="button"
                onClick={backToCurated}
                className={`inline-flex items-center gap-1.5 ${typography.size.xs} ${typography.color.brand} hover:underline`}
              >
                <ArrowLeft className="w-3.5 h-3.5" /> The Rail
              </button>
            </div>
            <Suspense fallback={<TabLoadingSkeleton />}>
              <SavedTab />
            </Suspense>
          </div>
        )}
      </div>
      {/* Single chat entry point: the Beau button in the shell header — no
          floating duplicates. */}

      {/* Floating back — fixed top-left once the user scrolls down inside a
          sub-view; mirrors that view's own back button exactly. */}
      {floatingBack && <FloatingBackButton onBack={floatingBack} />}

      {/* First-run coach-mark tour + the quiet "?" re-trigger in the corner.
          Auto-shows once (localStorage-gated), never over the intake wizard
          — this branch only renders after onboarding completes. */}
      <OnboardingTour />
    </div>
    </BeauAssessmentProvider>
  );
}
