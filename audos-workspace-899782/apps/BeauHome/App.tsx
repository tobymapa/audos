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
import { OnboardingTour } from './onboarding-tour';
import { ChromeNavBar, ScrollToTop, type CrumbPublication } from './crumb-trail';
import { HairlineRowsSkeleton, HomeSkeleton } from './skeleton';
import { ArchetypeIllo } from './illustrations';
import { fetchAvatarInputs, saveAvatarInputs } from './body-profile';
import { sweepSemanticTags } from './semantic-tags';
import { sweepPieceWarmth } from './warmth-model';
import { BeauAssessmentProvider } from './beau-assessment-context';
import { SaveProfileNudge, isGuestUnsaved } from './save-profile';

// Code splitting (Pass Forty-Seven; widened in Pass Fifty): every surface
// that is NOT the landing Wardrobe screen — The Rail, Radar, Reads,
// Curated, Saved, Build a Look, Style-me-today and Your Style — loads on
// first visit via dynamic import(), behind a Suspense skeleton. Only the
// Wardrobe screen's code is in the initial JS payload, so it parses and
// renders sooner on every device.
// Tab-switch performance: the main tab panels are wrapped in React.memo at
// the lazy boundary, so an app-level re-render (e.g. the `tab` state
// changing) never re-renders a panel whose props are unchanged.
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
const HuntTab = lazy(() => import('./hunt-tab').then((m) => ({ default: memo(m.HuntTab) })));
// The Ledger's own layout (the landing tab): everything he owns, by category.
const LedgerTab = lazy(() => import('./ledger-tab').then((m) => ({ default: memo(m.LedgerTab) })));
// The maker sheet — the app-wide maker popout, mounted once so a maker's
// name is clickable from ANY tab (Index, Ledger, Hunt, the piece pages).
const MakerSheetHost = lazy(() => import('./maker-sheet').then((m) => ({ default: memo(m.MakerSheetHost) })));

/** Module-scoped so the housekeeping audits run at most ONCE per page load.
 * A StrictMode double-mount, or the app being closed and reopened from the
 * dock, used to re-run all four from scratch. */
let auditsKicked = false;

/* ============================================================================
 * Ethaion — the home app (Milestones overhaul). A tap-only
 * onboarding runs before anything else; once complete the visitor lands in
 * a shell with SIX persistent top tabs in this exact order:
 *   The Ledger · The Edit · The Fitting · The Hunt · The Index · The Dossier
 *   (Reads hidden; old Rail merged into Ledger)
 *  - The Ledger (tab id 'wardrobe', ledger-tab.tsx): everything he owns, by
 *    category — a link or a photograph goes in at the top, the nine
 *    categories unfold into his pieces with Beau's read against each one,
 *    opening a piece opens the sheet where he corrects Beau, and the page
 *    closes on the pieces the record argues against. This app file holds only
 *    the shell for it: the tab bar, the data, and the routing.
 *    Build & complexion lives in The Dossier, not here.
 *  - Curated: TWO-LAYER. Layer 1 shows one brand-free card per wardrobe gap,
 *    milestone-ordered; tapping a gap opens Layer 2 — 3–5 specific product
 *    picks with Save (→ Saved) and Refresh (see ./curated).
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
          // SIZES — straight onto style_measurements, the same rows the
          // Dossier reads.
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

  // Email verification happens before this wizard. Every profile question is
  // optional, so Continue must remain available even when a step is blank;
  // entered values are still persisted by commitStep.
  const stepDone = true;

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
                shoe size, straight onto style_measurements. All skippable. */}
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
                    Beau judges every trouser against this — without it any fit read is guesswork.
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
                    Every shoe Beau weighs is judged against this. Brand-by-brand exceptions live in The Dossier.
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
// Top-level navigation — SIX tabs, in this exact order, each with a
// hairline stroke icon:
//   The Ledger · The Edit · The Fitting · The Hunt · The Index · The Dossier.
// The Hunt is REINSTATED (August 2026) and sits immediately LEFT of The
// Index: three sub-tabs — Beau's Picks, Ask Beau and Your Calls
// (hunt-tab.tsx). The Index keeps its place immediately LEFT of The Dossier,
// which stays the RIGHTMOST tab. The internal tab ids are unchanged
// ('wardrobe', 'beau', 'fitting-room', 'your-style', …) so chat deep links
// keep working, and the retired tab surfaces ('curated', 'radar') stay fully
// routable as hidden views.
// On a phone the six tabs move to a BOTTOM bar at thumb height with 52pt
// targets, same order.
// ---------------------------------------------------------------------------

type TabId = 'wardrobe' | 'beau' | 'curated' | 'fitting-room' | 'hunt' | 'index' | 'saved' | 'radar' | 'reads' | 'rail' | 'your-style' | 'dressed';

/** Hairline, stroke-only tab icons — no fills (Part 1's icon column). */
const TABS: Array<{ id: TabId; label: string; short: string; icon: 'book' | 'grid' | 'hanger' | 'hourglass' | 'figure' | 'folder' | 'library' | 'compass' }> = [
  { id: 'wardrobe', label: 'The Ledger', short: 'Ledger', icon: 'book' },
  { id: 'beau', label: 'The Edit', short: 'Edit', icon: 'grid' },
  { id: 'fitting-room', label: 'The Fitting', short: 'Fitting', icon: 'figure' },
  // The Hunt — reinstated (August 2026), immediately LEFT of The Index.
  { id: 'hunt', label: 'The Hunt', short: 'Hunt', icon: 'compass' },
  // The Index — rebuilt (August 2026), sits immediately LEFT of The Dossier.
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
    case 'hourglass': return <Hourglass className={cls} strokeWidth={1.5} aria-hidden="true" />;
    case 'figure': return <PersonStanding className={cls} strokeWidth={1.5} aria-hidden="true" />;
    case 'library': return <Library className={cls} strokeWidth={1.5} aria-hidden="true" />;
    case 'compass': return <Compass className={cls} strokeWidth={1.5} fill="none" aria-hidden="true" />;
    case 'folder': return <Folder className={cls} strokeWidth={1.5} fill="none" aria-hidden="true" />;
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
 * 'curated' is the old Rail tab;
 * 'radar' is the old Reserve — the watch list. */
const HIDDEN_TAB_IDS: TabId[] = ['dressed', 'saved', 'reads', 'rail', 'curated', 'radar'];

/**
 * TAPPING A TAB ALWAYS GOES HOME (founder's correction, August 2026). The tab
 * strip announces every tap on `ethaion:tab-home` — including a tap on the
 * tab already showing — and each tab root listens for its own id and resets
 * whatever sub-tab or detail page it was left on. Resets are plain setState
 * calls to values the tab may already hold, so tapping the tab you are
 * already at the top of changes nothing: no scroll jump, no reload, no
 * refetch.
 *
 * The listeners match the event name as a literal rather than importing it
 * from here: this module already imports every tab, so a shared constant
 * exported from it would close an import cycle.
 */

/** What each tab reads as in the FLOATING breadcrumb (crumb-trail.tsx) —
 * the label after the ETHAION root when nothing deeper is on screen. */
const TAB_TRAIL_LABELS: Record<TabId, string> = {
  wardrobe: 'The Ledger',
  beau: 'The Edit',
  'fitting-room': 'The Fitting',
  hunt: 'The Hunt',
  index: 'The Index',
  'your-style': 'The Dossier',
  curated: 'The Rail',
  radar: 'The Reserve',
  reads: 'Reads',
  rail: 'The Rail',
  saved: 'Saved',
  dressed: 'Build a Look',
};

function TabBar({ tab, onChange }: { tab: TabId; onChange: (t: TabId) => void }) {
  // Warm Editorial nav, two placements (six tabs since The Hunt returned):
  //  · DESKTOP — the tabs as a centred header strip, 47px tall. The
  //    Dossier sits rightmost IN the strip; the account corner is retired.
  //  · PHONE — the tabs move to a fixed BOTTOM bar at thumb height,
  //    52pt targets, same order; the slim top strip keeps the wordmark.
  const tourAnchorFor = (id: TabId) =>
    id === 'wardrobe' ? 'tour-ledger'
    : id === 'beau' ? 'tour-edit'
    : id === 'fitting-room' ? 'tour-fitting'
    : id === 'hunt' ? 'tour-hunt'
    : id === 'index' ? 'tour-index'
    : id === 'your-style' ? 'tour-dossier'
    : undefined;

  return (
    <>
      {/* PHONE: the strip is GONE — the shell masthead above already
          carries the Ethaion wordmark, so repeating it here read as a
          duplicate smaller header (UI corrections pass). The tabs live in
          the fixed bottom bar; this strip only exists from sm up.
          With six tabs the strip scrolls horizontally on a narrow desktop
          window rather than crushing the labels. */}
      <div className="hidden sm:block sticky top-0 z-30 bg-[var(--space-surface-card)] border-b border-[var(--space-text-primary)] flex-shrink-0 overflow-hidden">
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
          same order as the desktop header (Mobile spec M1). */}
      {/* The bar never hides a tab: the six share the width when they fit and
          the row scrolls horizontally (scrollbar hidden) when they don't. */}
      <nav
        className="ethaion-tabnav sm:hidden fixed bottom-0 left-0 right-0 z-40 flex overflow-x-auto bg-[var(--space-surface-card)] border-t border-[var(--space-text-primary)]"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom)',
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorX: 'contain',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
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
              className={`flex-1 flex-shrink-0 min-w-[54px] min-h-[52px] flex flex-col items-center justify-center gap-0.5 uppercase transition-colors ${
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
  // The one sub-view The Ledger still routes to: the daily-outfit surface,
  // opened by the 'style-today' deep link (the tab's own layout is
  // ledger-tab.tsx, which holds its own state).
  const [openStyleToday, setOpenStyleToday] = useState(false);
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
    // Read well past any realistic wardrobe — a 100-row cap was silently
    // truncating large ledgers, so every count downstream (the Index's
    // band counts, category ownership, The Edit's coverage) under-read.
    limit: 1000,
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
      const wanted = (e as CustomEvent).detail?.tab as string | undefined;
      if (wanted && (TABS.some((t) => t.id === wanted) || HIDDEN_TAB_IDS.includes(wanted as TabId))) {
        setTab(wanted as TabId);
        setOpenStyleToday(false);
      }
      // Deep link: "style-today" opens The Ledger's daily-outfit surface.
      if (wanted === 'style-today') {
        setTab('wardrobe');
        setOpenStyleToday(true);
      }
      fetchProfile()
        .then((p) => setProfile(p))
        .catch(() => undefined);
    };
    window.addEventListener('ethaion:navigate', onNavigate);
    return () => window.removeEventListener('ethaion:navigate', onNavigate);
  }, []);

  // The "Log one I own" / "Add to the Ledger" event (ethaion:add-piece):
  // land on The Ledger — its Log a piece row listens for the SAME event
  // (ledger-tab.tsx) and opens the search flow seeded with the type name.
  useEffect(() => {
    const onAddPiece = () => {
      setTab('wardrobe');
      setOpenStyleToday(false);
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

  // Stable reference (Pass Forty-Six) so memoised children don't re-render
  // on unrelated App state changes.
  const removePiece = useCallback(async (id: number) => {
    await deletePiece(id);
    refreshAll();
  }, [refreshAll]);

  // (The Ledger's old hand-offs into The Fitting — Build a look, Beau ·
  // Today, Plan for a trip — went with the layout they lived on. The Fitting
  // opens its own board, and fitting-room-state still takes a board request
  // from anywhere that needs one.)

  // Stable handlers for the memoised panels and action rows — inline arrows
  // here would hand every memoised child a fresh prop on each app render
  // and defeat React.memo entirely.
  const closeStyleToday = useCallback(() => setOpenStyleToday(false), []);
  const backToWardrobe = useCallback(() => setTab('wardrobe'), []);
  const backToCurated = useCallback(() => setTab('curated'), []);
  const goHome = useCallback(() => {
    setTab('wardrobe');
    setOpenStyleToday(false);
  }, []);

  // THE FLOATING TRAIL'S FALLBACK (founder's request, August 2026): the
  // active tab's own root trail — ETHAION / THE LEDGER and so on. Sub-pages
  // publish deeper trails themselves (CrumbHeader / CrumbPublisher) and win
  // over this while they are on screen; the three shell-owned sub-views
  // (Style me today, Build a Look, Saved) publish here, with the same back
  // handler their own back buttons call. A root tab view carries no back.
  const crumbFallback = useMemo<CrumbPublication>(() => {
    const home = { label: 'Ethaion', onClick: goHome };
    if (tab === 'wardrobe' && openStyleToday) {
      return {
        segs: [home, { label: 'The Ledger', onClick: closeStyleToday }, { label: 'Style me today' }],
        onBack: closeStyleToday,
        backLabel: 'The Ledger',
      };
    }
    if (tab === 'dressed') {
      return {
        segs: [home, { label: 'The Ledger', onClick: backToWardrobe }, { label: 'Build a Look' }],
        onBack: backToWardrobe,
        backLabel: 'The Ledger',
      };
    }
    if (tab === 'saved') {
      return {
        segs: [home, { label: 'The Rail', onClick: backToCurated }, { label: 'Saved' }],
        onBack: backToCurated,
        backLabel: 'The Rail',
      };
    }
    return { segs: [home, { label: TAB_TRAIL_LABELS[tab] || 'Home' }] };
  }, [tab, openStyleToday, goHome, closeStyleToday, backToWardrobe, backToCurated]);

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
          The Hunt · The Index · The Dossier (six tabs; on a phone they sit
          in the bottom bar). */}
      <TabBar
        tab={tab}
        onChange={(t) => {
          setTab(t);
          setOpenStyleToday(false);
          // Every tap goes to the tab's HOME, even a tap on the tab already
          // showing: the roots listen for this and drop whatever sub-tab or
          // detail page they were left on.
          window.dispatchEvent(new CustomEvent('ethaion:tab-home', { detail: { tab: t } }));
        }}
      />

      {/* THE FLOATING CHROME — not a row: a zero-height sticky rail just
          under the tab strip that floats ← BACK and the page path on the
          left, ASK BEAU and the settings gear on the right, every one of
          them in the same capsule, with nothing across the middle. It shows
          the deepest trail currently on screen (sub-pages publish their own
          through CrumbHeader / CrumbPublisher) and falls back to the active
          tab's root trail. */}
      <ChromeNavBar fallback={crumbFallback} />

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
        {/* THE LEDGER (ledger-tab.tsx) — everything he owns, by category: log
            a piece, unfold a category, open one to correct Beau, and the
            pieces the record argues against. The style-me-today surface stays
            routable underneath it (the 'style-today' deep link). */}
        <KeepMounted active={tab === 'wardrobe'}>
        {openStyleToday ? (
          <Suspense fallback={<TabLoadingSkeleton />}>
          <StyleMeToday
            pieces={pieces}
            materials={materials}
            profile={profile}
            onBack={closeStyleToday}
            onChanged={refreshAll}
          />
          </Suspense>
        ) : (
          <>
            <Suspense fallback={<TabLoadingSkeleton />}>
              <LedgerTab
                profile={profile}
                pieces={pieces}
                prefs={prefs}
                budgets={budgets}
                loading={piecesLoading || rawPieces == null}
                onChanged={refreshAll}
              />
            </Suspense>

            {/* ONE soft save nudge — appears once, right after onboarding,
                with Save and Skip. Guests only; never re-shown. */}
            {showSaveNudge && (
              <div className="px-6 sm:px-10 pb-10">
                <div className="max-w-[1180px] mx-auto">
                  <SaveProfileNudge onDismiss={() => setShowSaveNudge(false)} />
                </div>
              </div>
            )}
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

        {/* The Hunt — what Beau would put in front of him next. Three
            sub-tabs: Beau's Picks (the Index's categories read down, each
            unfolding into its sub-categories and his live recommendations),
            Ask Beau (a question, a brief or a pasted product, plus a bench
            holding up to four for a side-by-side) and Your Calls (everything
            tagged, sortable, changeable). Sits LEFT of The Index. */}
        <KeepMounted active={tab === 'hunt'}>
          <Suspense fallback={<TabLoadingSkeleton />}>
            <HuntTab profile={profile} pieces={pieces} prefs={prefs} budgets={budgets} />
          </Suspense>
        </KeepMounted>

        {/* The Index — the reference wing rebuilt from the founder's design
            screenshots: Pieces and Makers as two faces of one page. Sits
            LEFT of The Dossier in the strip. */}
        <KeepMounted active={tab === 'index'}>
          <Suspense fallback={<TabLoadingSkeleton />}>
            <IndexTab pieces={pieces} profile={profile} />
          </Suspense>
        </KeepMounted>

        <KeepMounted active={tab === 'your-style'}>
          <Suspense fallback={<TabLoadingSkeleton />}>
            <YourStyle />
          </Suspense>
        </KeepMounted>

        {/* Radar — the old Reserve, HIDDEN from the nav — still routable
            by deep link. */}
        <KeepMounted active={tab === 'radar'}>
          <Suspense fallback={<TabLoadingSkeleton />}>
            <RadarTab />
          </Suspense>
        </KeepMounted>

        {/* Saved — bookmarks from Curated and every intake path. Routable view
            (no tab-bar slot); opened from the Curated tab's card or chat. */}
        {/* No local back row here: the floating chrome already carries this
            view's ← BACK (see crumbFallback above) and a second one under it
            was the duplicate the founder called out. */}
        {tab === 'saved' && (
          <Suspense fallback={<TabLoadingSkeleton />}>
            <SavedTab />
          </Suspense>
        )}
      </div>
      {/* Single chat entry point: the Ask Beau capsule in the chrome nav bar
          above — no floating duplicates. (It replaced both the old
          scroll-triggered floating back button, floating-back.tsx, and the
          shell masthead's own Beau/Settings corner.) */}

      {/* First-run coach-mark tour + the quiet "?" re-trigger in the corner.
          Auto-shows once (localStorage-gated), never over the intake wizard
          — this branch only renders after onboarding completes. */}
      <OnboardingTour />

      {/* Back to the top — a small capsule in the bottom-right corner, clear
          of the phone's tab bar, shown only once the top has scrolled away. */}
      <ScrollToTop />

      {/* The maker sheet — slides in from the right wherever a maker's name
          is clicked; carries its own ← CLOSE, Escape and backdrop-tap ways
          out. Renders nothing until asked. */}
      <Suspense fallback={null}>
        <MakerSheetHost profile={profile} pieces={pieces} />
      </Suspense>
    </div>
    </BeauAssessmentProvider>
  );
}
