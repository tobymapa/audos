import { memo, useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  Link as LinkIcon,
  Loader2,
  MessageCircle,
  Mic,
  Plus,
  Quote,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { tw, typography } from '../../lib/colors';
import {
  ARCHETYPES,
  BUILD_OPTIONS,
  CLOTHING_SIZE_OPTIONS,
  CURRENCIES,
  MATERIAL_OPTIONS,
  SECONDHAND_OPTIONS,
  SHOE_SIZE_SYSTEMS,
  SKIN_TONES,
  TONE_GUIDANCE,
  addTrustedBrand,
  avatarBodyTypeFor,
  cmToFeetInches,
  composeProportionBullets,
  feetInchesToCm,
  fetchCategoryBudgets,
  fetchMeasurementExtras,
  fetchPrefs,
  fetchProfile,
  fetchStyleMeasurements,
  fetchTasteReferences,
  fetchTrustedBrands,
  goToTab,
  heightRangeFromCm,
  label,
  openBeauChat,
  removeTasteReference,
  removeTrustedBrand,
  resetProfile,
  saveMeasurementExtras,
  saveMeasurements,
  savePrefs,
  saveProfile,
  swatchFor,
  type CategoryBudget,
  type MeasurementExtras,
  type Option,
  type ProportionBullets,
  type StyleMeasurements,
  type StylePrefs,
  type StyleProfile,
  type TasteReference,
  type TrustedBrand,
} from '../BeauHome/profile-data';
import { generateFitNotes, generateProportionBullets } from '../BeauHome/wardrobe-ai';
import { BudgetFilters } from '../BeauHome/wardrobe';
import { ARCHETYPE_PHOTOS, ARCHETYPE_PHOTO_SETS, ArchetypeIllo } from '../BeauHome/illustrations';
import { HowToMeasureButton } from '../BeauHome/measure-guide';
import { SaveProfileButton } from '../BeauHome/save-profile';
import { TabHeader } from '../BeauHome/tab-header';
import { CrumbPublisher, goToEthaionTab } from '../BeauHome/crumb-trail';
import { Onboarding } from '../BeauHome/App';
import { fetchAvatarInputs, saveAvatarInputs } from '../BeauHome/body-profile';
import {
  CLIMATE_OPTIONS,
  EMPTY_DOSSIER_DETAILS,
  HAIR_COLOURS,
  cachedDisplayName,
  climateLabel,
  fetchDossierDetails,
  hairColourLabel,
  saveDossierDetails,
  type DossierDetails,
} from '../BeauHome/dossier-details';
import {
  CLOTHES_SIZE_SYSTEMS,
  EMPTY_DOSSIER_MEASUREMENTS,
  GARMENT_SIZE_CATEGORIES,
  fetchDossierMeasurements,
  parseGarmentSizes,
  saveDossierMeasurements,
  serializeGarmentSizes,
  type DossierMeasurements,
} from '../BeauHome/dossier-measurements';
import { computeAndStoreClimateCurve } from '../BeauHome/climate-pipeline';
import { CLAUDE_HAIKU, CLAUDE_SONNET, callModel } from '../BeauHome/claude';
import { TEMPERATURE_BANDS } from '../BeauHome/temperature-bands';
import {
  COVERAGE_PREFS_EVENT,
  FREQ_STORE_KEY,
  MUTED_STORE_KEY,
  REGISTER_FREQUENCY_LABELS,
  fetchCoveragePrefs,
  fetchRegisterFrequencies,
  loadLocalJson,
  writeRegisterFrequency,
  type RegisterFrequency,
} from '../BeauHome/coverage-prefs';

/* ============================================================================
 * THE DOSSIER — rebuilt clean (Dossier overhaul).
 *
 * Top-to-bottom structure, exactly:
 *   · THE NAME TAPE — a small cloth-label card at the very top, styled
 *     like a Savile Row name tape: "MADE FOR" (IM Fell English, 14px,
 *     letter-spaced) over the name (Alex Brush at 52px, tap to edit, no
 *     visible input chrome) over the date the profile was opened (Alex
 *     Brush italic at 18px, not editable). Card ground inside a STITCH — a
 *     sewn dash set in from the edge, on a label tilted a fraction off
 *     square. No "Name:" label, no "Date:" label; the sequence is
 *     self-evident.
 *   · PHYSICAL PROFILE — height, weight, body type, foot length. All
 *     compact, sized to what they hold, unit toggle inline beside each
 *     field it governs. "How to measure" anchored below the fields.
 *   · SKIN TONE + HAIR COLOUR — two standalone fields, their own section
 *     directly after Physical profile. No group header, no sub-label.
 *   · SIZES — the sizing LABELS the user wears (distinct from the physical
 *     measurements above): shoe sizes (system + brand exceptions) and
 *     clothes sizes (general size + system, the six garment measurements
 *     each with its own cm/in toggle, brand exceptions).
 *   · LIFESTYLE CONTEXT — city, climate, occasions.
 *   · STYLE PROFILE — the archetype chips (shown here ONCE, nowhere else)
 *     and the named style references.
 *   · WHAT WORKS FOR YOU — the living brief: palette observations, what
 *     suits the frame, fit notes and the taste-reference log. Grows as
 *     Beau learns more.
 *   · WHAT BEAU DOES FOR YOU — budget comfort range per piece FIRST (a
 *     signal, not a ceiling), then the working preferences: per-category
 *     budgets, materials, secondhand, trusted brands, free-text context.
 *
 * Every section is an accordion — header always visible, editor expands on
 * tap — and every edit persists through an explicit save (or an immediate
 * tap-save for chips), with a quiet "Saved." confirmation beside the button
 * that did it.
 * ==========================================================================*/

// Literal window.__workspaceDb token so the platform compiler injects the
// WorkspaceDB SDK for this app too (persistence lives in ../BeauHome/profile-data).
const __workspaceDbInjection = () => (window as any).__workspaceDb ?? (window as any).useWorkspaceDB;
void __workspaceDbInjection;

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full ${typography.size.xs} border transition-colors ${
        active
          ? 'bg-[var(--space-surface-accent-soft)] text-[var(--space-brand-primary-700)] border-[var(--space-brand-primary)]'
          : 'border-[var(--space-border-default)] text-[var(--space-text-secondary)] hover:border-[var(--space-border-strong)]'
      }`}
    >
      {children}
    </button>
  );
}

// Sub-labels inside a section's editor.
const statLabelCls = `${typography.size.xs} uppercase tracking-wide ${typography.color.muted} mb-1.5`;

/* ---------------------------------------------------------------------------
 * THE NAME TAPE — the bespoke label at the very top of the Dossier. Not a
 * section header: a small cloth-label card in the manner of a Savile Row
 * name tape. A card ground (#FBF8F1) inside a STITCH LINE set 8px in from
 * the edge, on a label tilted -0.4deg — sewn in by hand, not printed square.
 * Only the card box is a rule (a pseudo-element cannot be inline); every
 * declaration INSIDE it is written on the element itself, with no media
 * query. That is deliberate. The card previously carried its type scale in
 * scoped classes behind a breakpoint and kept reading small, so the sizes
 * live where nothing outside the element can reach them — 14px label, 52px
 * name, 18px date, identical at every width. The two faces — IM Fell English
 * for the "MADE FOR" line, Alex Brush for the declaration and the date —
 * load from Google Fonts once per session.
 * ------------------------------------------------------------------------*/

const NAME_TAPE_FONTS_ID = 'ethaion-name-tape-fonts';

/* THE STITCH. Four background layers, one per edge, each a repeating dash of
 * thread-brown laid 8px INSIDE the card's own edge — which is what a name
 * tape actually looks like, and what a single `border: 1px dashed` never
 * does: a CSS dashed border is machine-even, sits on the boundary, and turns
 * the corners in one continuous stroke. The -0.4deg on the whole card is the
 * other half of the same idea. A label is sewn in by hand and is never quite
 * square to the cloth; the tilt is small enough to read as an imperfection
 * rather than a design gesture.
 *
 * It has to be a rule rather than an inline style because ::before cannot be
 * expressed inline — but it governs the CARD ONLY. Every type declaration
 * inside stays where it was, on the elements themselves. */
const MADE_FOR_CSS = `
.made-for-card {
  position: relative;
  background: #FBF8F1;
  padding: 28px 32px;
  max-width: 420px;
  margin: 0 auto;
  transform: rotate(-0.4deg);
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}

.made-for-card::before {
  content: "";
  position: absolute;
  inset: 8px;
  background-image:
    repeating-linear-gradient(to right, #A8998A 0 4px, transparent 4px 9px),
    repeating-linear-gradient(to bottom, #A8998A 0 4px, transparent 4px 9px),
    repeating-linear-gradient(to right, #A8998A 0 4px, transparent 4px 9px),
    repeating-linear-gradient(to bottom, #A8998A 0 4px, transparent 4px 9px);
  background-position: top, right, bottom, left;
  background-size: 9px 1.5px, 1.5px 9px, 9px 1.5px, 1.5px 9px;
  background-repeat: repeat-x, repeat-y, repeat-x, repeat-y;
  pointer-events: none;
}
`;

function useNameTapeFonts() {
  useEffect(() => {
    if (document.getElementById(NAME_TAPE_FONTS_ID)) return;
    const link = document.createElement('link');
    link.id = NAME_TAPE_FONTS_ID;
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Alex+Brush&family=IM+Fell+English&display=swap';
    document.head.appendChild(link);
  }, []);
}

/**
 * The tape itself. Three lines, top to bottom — "MADE FOR" · the name ·
 * the date the dossier was opened. The name is the declaration: tap it to
 * edit in place (a discreet underline appears under the caret — no visible
 * input chrome in the default state), Enter or tapping away saves. The
 * date is set by the record, not the hand — it is never editable.
 */
function DossierNameTape({
  name,
  createdAt,
  saved,
  nameLoaded = true,
  onSave,
}: {
  name: string;
  createdAt: string | null | undefined;
  saved: boolean;
  /** False while the saved name is still being fetched — the "Your name"
   * placeholder is held back so it can never flash over a real name. */
  nameLoaded?: boolean;
  onSave: (next: string) => void;
}) {
  useNameTapeFonts();
  const [draft, setDraft] = useState(name);
  const [focused, setFocused] = useState(false);
  // Fresh data reseeds the draft — but never underneath an active edit.
  useEffect(() => {
    if (!focused) setDraft(name);
  }, [name, focused]);
  const commit = () => {
    setFocused(false);
    if (draft.trim() !== (name || '').trim()) onSave(draft);
  };
  // Explicit English locale — the rest of the site is English, so the date
  // must never follow the browser's system language (e.g. "agosto").
  const dated = createdAt
    ? new Date(createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;
  return (
    <div style={{ paddingTop: '26px' }}>
      <style>{MADE_FOR_CSS}</style>
      {/* The card box comes from `.made-for-card` — the stitch is a
          pseudo-element and cannot be written inline. Everything INSIDE it
          still carries every declaration on the element itself: no classes,
          no media query, no CSS variables. An inline style beats any rule
          that could otherwise reach in and shrink the type, so there is a
          single type scale at every width — the label at 14px, the name at
          52px, the date at 18px, on a phone exactly as on a desktop. Earlier
          rounds expressed these sizes through scoped classes and a breakpoint
          and the card kept reading small. */}
      <div className="made-for-card" style={{ textAlign: 'center' }}>
        {/* Positioned, so the content stacks ABOVE the stitch layer. */}
        <div style={{ position: 'relative' }}>
          <div
            style={{
              fontFamily: "'IM Fell English', 'Cormorant Garamond', Georgia, serif",
              fontSize: '14px',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: '#8A7F70',
              marginBottom: '16px',
            }}
          >
            Made For
          </div>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
            }}
            placeholder={nameLoaded && !name ? 'Your name' : ''}
            aria-label="The name Beau addresses you by — tap to edit"
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'center',
              fontFamily: "'Alex Brush', 'Snell Roundhand', 'Brush Script MT', cursive",
              fontSize: '52px',
              lineHeight: 1.1,
              color: '#241a12',
              background: 'transparent',
              border: 'none',
              borderBottom: focused ? '1px solid #D9CFBE' : '1px solid transparent',
              borderRadius: 0,
              outline: 'none',
              padding: '0 2px 2px',
              marginBottom: '16px',
              caretColor: '#8B3A3A',
            }}
          />
          {dated && (
            <div
              style={{
                fontFamily: "'Alex Brush', 'Snell Roundhand', 'Brush Script MT', cursive",
                fontStyle: 'italic',
                fontSize: '18px',
                color: '#8A7F70',
              }}
            >
              {dated}
            </div>
          )}
        </div>
      </div>
      {/* The quiet confirmation — outside the tape so the label itself never
          shifts or reflows on save. */}
      <p
        aria-live="polite"
        className="text-center"
        style={{ fontFamily: 'var(--space-font-family)', fontSize: '11px', color: '#8B3A3A', minHeight: '16px', marginTop: '6px' }}
      >
        {saved ? 'Saved.' : '\u00a0'}
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * THE DOSSIER'S FIELD CHROME
 *
 * Every compact field in this file draws its label, its box and its width
 * from the constants below — one label style, one input style, one width.
 * Labels sit DIRECTLY ABOVE their field, never beside it, so rows of fields
 * line up on the same grid whatever they hold. The palette is the app's
 * warm editorial set — walnut #241a12 on paper #FBF8F1, hairlines #D9CFBE,
 * muted labels #8A7F70, oxblood #8B3A3A for the quiet confirmations.
 * ------------------------------------------------------------------------*/

const FIELD_LABEL: React.CSSProperties = {
  display: 'block',
  fontFamily: 'var(--space-font-family)',
  fontSize: '10px',
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: '#8A7F70',
  marginBottom: '6px',
  whiteSpace: 'nowrap',
};

const FIELD_INPUT: React.CSSProperties = {
  fontFamily: 'var(--space-font-family)',
  fontSize: '14px',
  color: '#241a12',
  background: '#FBF8F1',
  border: '1px solid #D9CFBE',
  borderRadius: '2px',
  height: '38px',
  padding: '0 10px',
  boxSizing: 'border-box',
  outline: 'none',
};

/** Every compact numeric field shares this width — it is what makes the
 * measurement rows read as one grid. */
const FIELD_WIDTH = '96px';

const UNIT_HINT: React.CSSProperties = {
  fontFamily: 'var(--space-font-family)',
  fontSize: '11px',
  color: '#8A7F70',
};

/**
 * A hairline micro-switch that sits INLINE beside the field it governs — the
 * cm / in choice belongs next to the measurement it changes, not floated off
 * to the far side of the row.
 */
function InlineSwitch({
  options,
  active,
  onSelect,
  label,
}: {
  options: Array<{ id: string; label: string }>;
  active: string;
  onSelect: (id: string) => void;
  label: string;
}) {
  return (
    <span
      className="inline-flex items-stretch flex-shrink-0"
      role="group"
      aria-label={label}
      style={{ border: '1px solid #D9CFBE', borderRadius: '2px', height: '38px', overflow: 'hidden' }}
    >
      {options.map((o) => {
        const on = o.id === active;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onSelect(o.id)}
            aria-pressed={on}
            className="transition-colors"
            style={{
              fontFamily: 'var(--space-font-family)',
              fontSize: '10.5px',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              padding: '0 9px',
              background: on ? '#241a12' : 'transparent',
              color: on ? '#F5F0E6' : '#8A7F70',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </span>
  );
}

/**
 * The ONE save control every editable row uses: same shape, same place —
 * bottom left of the panel — with a quiet confirmation beside it, so a save
 * is visibly a save rather than something that may or may not have landed.
 */
function SaveButton({
  onClick,
  busy,
  saved,
  disabled = false,
  label = 'Save',
}: {
  onClick: () => void;
  busy: boolean;
  saved: boolean;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        type="button"
        onClick={onClick}
        disabled={busy || disabled}
        className={`px-4 rounded ${typography.size.xs} ${tw.button.primary} inline-flex items-center gap-1.5 disabled:opacity-40`}
        style={{ height: '38px' }}
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
        {label}
      </button>
      {saved && (
        <span style={{ fontFamily: 'var(--space-font-family)', fontSize: '12px', color: '#8B3A3A' }}>Saved.</span>
      )}
    </div>
  );
}

interface SectionProps {
  title: string;
  value: React.ReactNode;
  editing: boolean;
  onToggle: () => void;
  className?: string;
  children: React.ReactNode; // editor
}

/**
 * One accordion row of the Dossier: the section's name over the facts it
 * holds (always visible), and the editor that expands underneath on tap.
 *
 * TWO RULES, each of which fixes a real regression:
 *
 * 1. NOTHING MOVES UNDER THE FINGER. The control on the right occupies a
 *    FIXED box — the word is width-constrained and right-aligned — so the
 *    Edit → Done swap and the caret rotation cannot nudge the row sideways.
 *    That micro-shift was the "the edit button does nothing" bug.
 *
 * 2. THE FACTS READ ONCE. The summary line belongs to the CLOSED row; open
 *    it and the editor holds those values instead, so nothing is printed
 *    twice on the same screen.
 */
function Section({ title, value, editing, onToggle, className = '', children }: SectionProps) {
  const panelId = `dossier-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <div className={`border-b border-[var(--space-border-default)] ${className}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={editing}
        aria-controls={panelId}
        className="w-full flex items-start justify-between gap-4 text-left min-h-[44px]"
        style={{ paddingTop: '16px', paddingBottom: '16px' }}
      >
        <span className="min-w-0 flex-1">
          <span
            className="block uppercase"
            style={{
              fontFamily: 'var(--space-font-heading)',
              fontSize: '12px',
              letterSpacing: '0.18em',
              color: '#8A7F70',
            }}
          >
            {title}
          </span>
          {!editing && (
            <span
              className={`block ${typography.color.primary}`}
              style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', lineHeight: 1.5, marginTop: '6px' }}
            >
              {value}
            </span>
          )}
        </span>
        <span className="flex items-center flex-shrink-0" style={{ gap: '6px', paddingTop: '1px' }}>
          <span
            className={typography.color.brand}
            style={{
              fontFamily: 'var(--space-font-family)',
              fontSize: '11px',
              letterSpacing: '0.06em',
              width: '30px',
              textAlign: 'right',
            }}
          >
            {editing ? 'Done' : 'Edit'}
          </span>
          <ChevronDown
            className={`w-3.5 h-3.5 ${typography.color.brand} transition-transform duration-200 ${editing ? 'rotate-180' : ''}`}
          />
        </span>
      </button>
      {editing && (
        <div id={panelId} style={{ paddingBottom: '26px' }}>
          {children}
        </div>
      )}
    </div>
  );
}

/** A compact fact line for a section header — "180 cm · 78 kg · Athletic".
 * Empty parts drop out; an empty line falls back to the hint. */
function FactLine({ parts, hint }: { parts: Array<string | null | undefined>; hint?: string }) {
  const kept = parts.filter((x): x is string => !!x && !!x.trim());
  if (kept.length === 0) return <EmptyHint text={hint} />;
  return <>{kept.join(' · ')}</>;
}

function EmptyHint({ text = 'Not captured yet — tap Edit to set it.' }: { text?: string }) {
  return <span className={typography.color.muted}>{text}</span>;
}

/* ---------------------------------------------------------------------------
 * Units — every linear measurement stores as free text WITH its unit
 * ("102 cm", "40 in"), so each field can carry its own cm / in toggle and
 * Beau's rubric reads the value unambiguously.
 * ------------------------------------------------------------------------*/

type LinearUnit = 'cm' | 'in';

function parseMeasure(text: string | null | undefined): { num: string; unit: LinearUnit } {
  const t = (text || '').trim();
  const unit: LinearUnit = /(\bin\b|inch|″|")/i.test(t) ? 'in' : 'cm';
  const m = t.match(/[\d.]+/);
  return { num: m ? m[0] : '', unit };
}

function convertMeasure(num: string, from: LinearUnit, to: LinearUnit): string {
  if (from === to) return num;
  const n = parseFloat(num);
  if (!isFinite(n) || n <= 0) return num;
  const converted = to === 'in' ? n / 2.54 : n * 2.54;
  const rounded = Math.round(converted * 10) / 10;
  return String(rounded % 1 === 0 ? Math.round(rounded) : rounded);
}

function serializeMeasure(num: string, unit: LinearUnit): string | null {
  const t = (num || '').trim();
  if (!t) return null;
  return /^\d+(\.\d+)?$/.test(t) ? `${t} ${unit}` : t;
}

interface MeasureDraft {
  num: string;
  unit: LinearUnit;
}

/**
 * One compact measurement field: label above, number box, and its OWN
 * cm / in toggle inline beside it. Toggling converts the number in place.
 */
function MeasureField({
  fieldLabel,
  draft,
  placeholderCm,
  onChange,
}: {
  fieldLabel: string;
  draft: MeasureDraft;
  placeholderCm: string;
  onChange: (next: MeasureDraft) => void;
}) {
  const placeholder =
    draft.unit === 'in' ? String(Math.round((parseFloat(placeholderCm) / 2.54) * 10) / 10) : placeholderCm;
  return (
    <div>
      <span style={FIELD_LABEL}>{fieldLabel}</span>
      <div className="flex items-center" style={{ gap: '8px' }}>
        <input
          type="text"
          inputMode="decimal"
          value={draft.num}
          onChange={(e) => onChange({ ...draft, num: e.target.value })}
          placeholder={placeholder}
          aria-label={`${fieldLabel} (${draft.unit})`}
          style={{ ...FIELD_INPUT, width: FIELD_WIDTH }}
        />
        <InlineSwitch
          label={`${fieldLabel} — centimetres or inches`}
          options={[
            { id: 'cm', label: 'cm' },
            { id: 'in', label: 'in' },
          ]}
          active={draft.unit}
          onSelect={(u) =>
            onChange({ num: convertMeasure(draft.num, draft.unit, u as LinearUnit), unit: u as LinearUnit })
          }
        />
      </div>
    </div>
  );
}

/**
 * BUDGET COMFORT RANGE — per piece. Deliberately NOT a ceiling: it is the
 * signal Beau weighs recommendations against, and he will still name a piece
 * above it when the piece is the right answer. The ids are
 * style_profile.budget_range's documented values; the symbol follows the
 * visitor's display currency.
 */
function budgetBands(symbol: string): Option[] {
  return [
    { id: 'under-100', label: `Under ${symbol}100` },
    { id: '100-250', label: `${symbol}100 – ${symbol}250` },
    { id: '250-500', label: `${symbol}250 – ${symbol}500` },
    { id: '500-plus', label: `${symbol}500 and up` },
  ];
}

/** One archetype cell — a paper cell in the 3-up hairline grid carrying a
 * carousel of reference photographs for the archetype: ONE matted 3:4 photo
 * visible at a time, ‹ › arrows overlaid, a small bar progress indicator
 * below, the archetype name and description underneath. Memoised — its
 * props are two primitives, so parent keystrokes never re-render the grid. */
const ArchetypeCell = memo(function ArchetypeCell({ id, primary }: { id: string; primary: boolean }) {
  const meta = ARCHETYPES.find((x) => x.id === id);
  const photos = ARCHETYPE_PHOTO_SETS[id] || (ARCHETYPE_PHOTOS[id] ? [ARCHETYPE_PHOTOS[id]] : []);
  const [frame, setFrame] = useState(0);
  // Only frames the user has actually cycled to are mounted — off-screen
  // carousel frames never download.
  const [visited, setVisited] = useState<Set<number>>(() => new Set([0]));
  const photo = photos.length > 0 ? photos[Math.min(frame, photos.length - 1)] : null;
  const step = (dir: number) =>
    setFrame((cur) => {
      const next = (cur + dir + photos.length) % photos.length;
      setVisited((v) => {
        if (v.has(next)) return v;
        const grown = new Set(v);
        grown.add(next);
        return grown;
      });
      return next;
    });
  const arrowStyle: React.CSSProperties = {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    width: '28px',
    height: '28px',
    border: 'none',
    outline: 'none',
    borderRadius: '50%',
    background: '#d4c9b8',
    color: '#241a12',
    boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
    fontFamily: 'var(--space-font-heading)',
    fontSize: '16px',
    lineHeight: 1,
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  };
  return (
    <div className="bg-[var(--color-paper,#fbf8f1)] flex flex-col" style={{ padding: '24px 24px 26px', gap: '14px' }}>
      {photo ? (
        /* REFERENCE-SIZED (UI corrections pass): the photograph is capped
           well below the cell's width — a reference image beside the label
           and description, never the dominant element. */
        <span className="block" style={{ maxWidth: '210px' }}>
          <span className="block border border-[var(--color-neutral-300,#dccdb2)]" style={{ padding: '6px' }}>
            <span className="block relative w-full overflow-hidden bg-[#eadfcb]" style={{ aspectRatio: '3 / 4' }}>
              {photos.map((ph, i) =>
                visited.has(i) ? (
                  <img
                    key={ph.src}
                    src={ph.src}
                    alt={i === frame ? `${label.archetype(id)} — ${ph.person}` : ''}
                    aria-hidden={i !== frame}
                    loading={primary && i === 0 ? 'eager' : 'lazy'}
                    width={600}
                    height={800}
                    draggable={false}
                    className="absolute inset-0 w-full h-full object-cover object-top"
                    style={{
                      filter: 'sepia(0.20) saturate(0.85) contrast(1.05)',
                      opacity: i === frame ? 1 : 0,
                      transition: 'opacity 300ms ease',
                      ...(ph.position ? { objectPosition: ph.position } : null),
                    }}
                  />
                ) : null,
              )}
              {photos.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => step(-1)}
                    style={{ ...arrowStyle, left: '10px' }}
                    aria-label={`Previous ${label.archetype(id)} look`}
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={() => step(1)}
                    style={{ ...arrowStyle, right: '10px' }}
                    aria-label={`Next ${label.archetype(id)} look`}
                  >
                    ›
                  </button>
                </>
              )}
            </span>
            <span
              className="block text-left"
              style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '9px', color: 'var(--color-neutral-600,#856c51)', marginTop: '6px' }}
            >
              {photo.person}
            </span>
          </span>
          {photos.length > 1 && (
            <span className="flex" style={{ gap: '3px', marginTop: '8px' }} aria-hidden="true">
              {photos.map((_, i) => (
                <span
                  key={i}
                  className="block flex-1"
                  style={{ height: '2px', borderRadius: 0, background: i === frame ? 'var(--color-accent,#a8712c)' : 'var(--color-neutral-300,#dccdb2)' }}
                />
              ))}
            </span>
          )}
        </span>
      ) : (
        <span className="block border border-[var(--color-neutral-300,#dccdb2)] bg-[#eadfcb] overflow-hidden" style={{ maxWidth: '210px' }}>
          <ArchetypeIllo id={id} title={label.archetype(id)} variant="photo" className="w-full" />
        </span>
      )}
      <span className="block">
        <span className="flex items-baseline justify-between gap-2.5">
          <span
            className={typography.color.primary}
            style={{ fontFamily: 'var(--space-font-heading)', fontWeight: 500, fontSize: '21px', lineHeight: 1.2 }}
          >
            {label.archetype(id)}
          </span>
          {primary && (
            <span
              className="uppercase whitespace-nowrap text-[var(--color-accent-700,#7c4a17)]"
              style={{ fontFamily: 'var(--space-font-heading)', fontSize: '12px', letterSpacing: '0.1em' }}
            >
              Primary
            </span>
          )}
        </span>
        {meta && (
          <span
            className="block text-[var(--color-neutral-800,#453325)]"
            style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', lineHeight: 1.55, marginTop: '9px' }}
          >
            {meta.detail}
          </span>
        )}
      </span>
    </div>
  );
});

/**
 * AUTOFILL THE CLIMATE (founder's request, August 2026): the moment a city
 * lands, Beau infers which of the six coarse climate options it lives in
 * and writes it onto the dossier — no manual chip tap needed (the chips
 * below stay editable and always win a correction). AI first — the city's
 * NAME is what a person reasons from — with a deterministic fallback read
 * from the freshly derived 8-band day histogram, so the field fills even
 * when every transport is down. Returns the climate id, or null.
 */
async function inferClimateForCity(city: string, bands: number[] | null): Promise<string | null> {
  const ids = CLIMATE_OPTIONS.map((c) => c.id);
  const clean = (city || '').trim();
  if (clean) {
    try {
      const raw = await callModel({
        model: CLAUDE_HAIKU,
        second: CLAUDE_SONNET,
        system: [
          {
            text:
              'You classify a city into ONE coarse climate id for a menswear wardrobe app. Return STRICT JSON only: {"climate": "<id>"} — the id MUST be exactly one of: temperate (four real seasons), mild-wet, cold-winters, hot-dry, hot-humid, tropical (hot year round). No prose, no markdown.',
            cache: true,
          },
        ],
        user: `The city: ${clean}. Which one id fits its climate best?`,
        maxTokens: 60,
        temperature: 0,
      });
      const match = raw ? raw.match(/\{[\s\S]*\}/) : null;
      const parsed = match ? JSON.parse(match[0]) : null;
      const id = String(parsed?.climate || '').trim().toLowerCase();
      if (ids.includes(id)) return id;
    } catch { /* the histogram fallback below still answers */ }
  }
  // The histogram fallback — coarse, but honest: read the derived days.
  if (bands && bands.length === 8) {
    const cold = (bands[0] || 0) + (bands[1] || 0);
    const veryHot = (bands[6] || 0) + (bands[7] || 0);
    const hot = (bands[5] || 0) + veryHot;
    if (veryHot >= 200) return 'tropical';
    if (hot >= 160) return 'hot-dry';
    if (cold >= 55) return 'cold-winters';
    return 'temperate';
  }
  return null;
}

/**
 * The Lifestyle city editor, wired to the CLIMATE PIPELINE (Data Layer
 * task, Deliverable 6): saving a typed place geocodes it (Open-Meteo, free,
 * no key) and derives the 8-band day histogram ONCE; “Use my location” does
 * the same from browser geolocation — permission-gated and always skippable.
 * Both store city + coordinates + histogram in dossier_details; every
 * failure steps down the ladder (the coarse climate chips below), never
 * blocks. Saving a city ALSO autofills the coarse climate field (above).
 */
function ClimateCityEditor({
  details,
  life,
  onProfileCity,
  onStored,
}: {
  details: DossierDetails;
  life: { city?: string };
  onProfileCity: (city: string) => void;
  onStored: (fresh: DossierDetails) => void;
}) {
  const [draft, setDraft] = useState(details.city ?? life.city ?? '');
  const [working, setWorking] = useState<null | 'typed' | 'geo'>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    setDraft(details.city ?? life.city ?? '');
  }, [details.city, life.city]);

  const run = async (kind: 'typed' | 'geo') => {
    if (kind === 'typed' && !draft.trim()) return;
    setWorking(kind);
    setNote(null);
    try {
      const curve = await computeAndStoreClimateCurve(
        kind === 'geo' ? { useGeolocation: true } : { useGeolocation: false, typedCity: draft.trim() },
      );
      if (curve.source === 'none' || !curve.bands) {
        setNote(
          kind === 'geo'
            ? 'Location was unavailable — type your city instead, or pick a coarse climate below; nothing is blocked.'
            : 'That place could not be found — check the spelling, or pick a coarse climate below; nothing is blocked.',
        );
      } else {
        const cityLabel = (curve.city || draft).trim();
        if (cityLabel) onProfileCity(cityLabel);
        // AUTOFILL THE CLIMATE — inferred from the city (AI first, the
        // fresh histogram as the fallback) and written straight onto the
        // dossier; the chips below reflect it and stay correctable.
        try {
          const climate = await inferClimateForCity(cityLabel, curve.bands || null);
          if (climate) await saveDossierDetails({ climate });
        } catch { /* the coarse chips below still work by hand */ }
        onStored(await fetchDossierDetails());
      }
    } catch {
      setNote('The climate service could not be reached just now — the coarse climate below still works.');
    } finally {
      setWorking(null);
    }
  };

  const bands = details.climateBands;
  const maxBand = bands ? Math.max(1, ...bands) : 1;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void run('typed');
          }}
          placeholder="e.g. Barcelona"
          className={`${tw.input.base} ${tw.input.default} ${typography.size.sm} flex-1 max-w-xs`}
          aria-label="City / location"
        />
        <button
          type="button"
          onClick={() => void run('typed')}
          disabled={working != null || !draft.trim()}
          className={`px-3.5 rounded-lg ${typography.size.sm} ${tw.button.secondary} disabled:opacity-50`}
        >
          {working === 'typed' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => void run('geo')}
          disabled={working != null}
          className={`px-3.5 rounded-lg ${typography.size.sm} ${tw.button.secondary} disabled:opacity-50`}
        >
          {working === 'geo' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Use my location'}
        </button>
      </div>
      {working != null && (
        <p className={`${typography.size.xs} ${typography.color.muted} italic`}>
          Reading twenty years of weather for your location — done once, kept forever…
        </p>
      )}
      {note && <p className={`${typography.size.xs} ${typography.color.muted} italic`}>{note}</p>}
      {bands && (
        <div>
          <div className="flex items-end gap-1" aria-label="Your year in eight temperature bands">
            {TEMPERATURE_BANDS.map((def, i) => (
              <div key={def.id} className="flex flex-col items-center" style={{ width: '34px' }}>
                <div
                  title={`${def.label} · ${bands[i] || 0} days a year`}
                  style={{
                    width: '16px',
                    height: `${Math.max(2, (30 * (bands[i] || 0)) / maxBand)}px`,
                    background: 'var(--space-brand-primary)',
                    opacity: 0.75,
                  }}
                />
                <span className={`${typography.size.xs} ${typography.color.muted}`} style={{ fontSize: '9px', marginTop: '2px' }}>
                  {bands[i] || 0}
                </span>
              </div>
            ))}
          </div>
          <p className={`${typography.size.xs} ${typography.color.muted} mt-1 italic`}>
            {details.city ? `${details.city}\u2019s` : 'Your'} year in eight bands, coldest first — days a year of
            each, from twenty years of feels-like weather (08:00–20:00). Beau weighs every garment type against
            these counts. Derived once; it only recomputes when you change your city.
          </p>
        </div>
      )}
    </div>
  );
}

/** The six dress registers — mute the ones that don’t apply to your life.
 * A muted register cannot raise a gap anywhere: the coverage map, the
 * Index’s field and Beau’s recommendations all honour it immediately. */
const REGISTER_PREF_OPTIONS: Array<{ id: string; label: string }> = [
  { id: 'casual', label: 'Casual' },
  { id: 'smart-casual', label: 'Smart casual' },
  { id: 'business', label: 'Business' },
  { id: 'formal', label: 'Formal' },
  { id: 'black-tie', label: 'Black tie' },
  { id: 'outdoor-work', label: 'Outdoor & work' },
];

/** The folded face of the frequency block — every register named with its
 * current answer, one flowing line. */
function registerFreqSummary(freqs: Record<string, string>): string {
  return REGISTER_PREF_OPTIONS.map((r) => {
    const f = freqs[r.id] as RegisterFrequency | undefined;
    return `${r.label}: ${f ? REGISTER_FREQUENCY_LABELS[f] : '—'}`;
  }).join(' · ');
}

/** The Lifestyle section's collapsed fact line — only the registers that
 * have an answer, plus a muted count. */
function registerFreqShort(freqs: Record<string, string>): string {
  const parts = REGISTER_PREF_OPTIONS.filter((r) => freqs[r.id] && freqs[r.id] !== 'never').map(
    (r) => `${r.label} ${REGISTER_FREQUENCY_LABELS[freqs[r.id] as RegisterFrequency].toLowerCase()}`,
  );
  const mutedCount = REGISTER_PREF_OPTIONS.filter((r) => freqs[r.id] === 'never').length;
  if (mutedCount > 0) parts.push(`${mutedCount} muted`);
  return parts.join(' · ');
}

function RegisterPrefs({ onMirror }: { onMirror: (muted: string[], freqs: Record<string, string>) => void }) {
  // ONE FREQUENCY PER REGISTER (founder's correction, August 2026): the
  // dossier used to offer only a mute toggle here, so the occasion CADENCE
  // asked in onboarding was invisible and uneditable afterwards. Every
  // register now carries its own frequency — the same four answers
  // onboarding asks — and “Not for me” mutes the register exactly as the
  // old toggle did.
  // FOLDED BY DEFAULT (founder's request, August 2026): six registers ×
  // four chips is a wall of controls — folded, the block reads as one
  // summary line, and Edit unfolds the chip rows.
  const [freqs, setFreqs] = useState<Record<string, string>>(() =>
    loadLocalJson<Record<string, string>>(FREQ_STORE_KEY, {}),
  );
  const [muted, setMuted] = useState<string[]>(() => loadLocalJson<string[]>(MUTED_STORE_KEY, []));
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () => {
      fetchCoveragePrefs()
        .then((p) => {
          if (alive) setMuted(p.muted);
        })
        .catch(() => undefined);
      fetchRegisterFrequencies()
        .then((f) => {
          if (alive) setFreqs(f);
        })
        .catch(() => undefined);
    };
    load();
    window.addEventListener(COVERAGE_PREFS_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(COVERAGE_PREFS_EVENT, load);
    };
  }, []);

  const setFrequency = (id: string, freq: RegisterFrequency) => {
    const nextFreqs = { ...freqs, [id]: freq };
    setFreqs(nextFreqs);
    const nextMuted = freq === 'never' ? [...new Set([...muted, id])] : muted.filter((m) => m !== id);
    setMuted(nextMuted);
    writeRegisterFrequency(id, freq);
    onMirror(nextMuted, nextFreqs);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <button
        type="button"
        onClick={() => setOpen((cur) => !cur)}
        aria-expanded={open}
        className="text-left"
        style={{ background: 'transparent', padding: 0, maxWidth: 'fit-content' }}
      >
        {/* THE FOLD CONTROL SITS RIGHT BESIDE THE SUMMARY (founder's
            correction, August 2026) — inline after the last word, never
            across the screen. */}
        <span className={`${typography.size.xs} ${typography.color.secondary}`} style={{ lineHeight: 1.7 }}>
          {registerFreqSummary(freqs)}
        </span>{' '}
        <span className={typography.size.xs} style={{ color: 'var(--space-text-accent)', whiteSpace: 'nowrap' }}>
          {open ? 'Fold ↑' : 'Edit ▾'}
        </span>
      </button>
      {open && (
        <>
          {REGISTER_PREF_OPTIONS.map((r) => (
            <div key={r.id}>
              <p className={`${typography.size.xs} ${typography.color.secondary}`} style={{ marginBottom: '4px' }}>
                {r.label}
                {muted.includes(r.id) && <span className={typography.color.muted}> — muted</span>}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(REGISTER_FREQUENCY_LABELS) as RegisterFrequency[]).map((freq) => (
                  <Chip key={freq} active={(freqs[r.id] || '') === freq} onClick={() => setFrequency(r.id, freq)}>
                    {REGISTER_FREQUENCY_LABELS[freq]}
                  </Chip>
                ))}
              </div>
            </div>
          ))}
          <p className={`${typography.size.xs} ${typography.color.muted} italic`}>
            How often each register actually comes up. “Not for me” mutes it — the coverage map and Beau hold no
            opinion about a muted register.
          </p>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Taste References — the running log of style inspiration shared with Beau,
// as a dedicated drill-down sub-screen.
// ---------------------------------------------------------------------------

function tasteSourceMeta(sourceType: string): { Icon: React.ComponentType<{ className?: string }>; label: string } {
  switch (sourceType) {
    case 'photo': return { Icon: ImageIcon, label: 'Photo' };
    case 'link': return { Icon: LinkIcon, label: 'Link' };
    case 'voice': return { Icon: Mic, label: 'Voice note' };
    default: return { Icon: Quote, label: 'Described' };
  }
}

/**
 * An interval that only does work while its element is actually on screen.
 *
 * WHY: the Dossier ran two 2.5-second polls. Both are legitimate — Beau's
 * `save_rubric` runs server-side and cannot dispatch a browser event, so a
 * poll is the only way a chat-authored edit appears without a reload — but
 * neither stopped when the screen was no longer visible. Main tabs stay
 * mounted under `display:none` once visited, so the taste-reference poll kept
 * firing database reads and replacing state for a screen the customer had
 * navigated away from, re-rendering a large tree each time.
 *
 * The interval still ticks (a boolean check every 2.5s costs nothing) but only
 * calls the job when the document is visible AND the element is not inside a
 * hidden subtree. Becoming visible again refreshes immediately, so nothing is
 * ever stale on return.
 *
 * Attach the returned ref to the screen's root element.
 */
function useVisibleInterval(job: () => void, ms: number) {
  const ref = useRef<HTMLDivElement | null>(null);
  // Held in a ref so a changing closure never re-arms the interval.
  const jobRef = useRef(job);
  jobRef.current = job;

  useEffect(() => {
    const onScreen = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return false;
      const el = ref.current;
      if (!el) return false;
      // `checkVisibility` accounts for display:none, visibility:hidden and
      // content-visibility; `offsetParent` is the fallback for older engines.
      const check = (el as unknown as { checkVisibility?: () => boolean }).checkVisibility;
      return typeof check === 'function' ? check.call(el) : el.offsetParent !== null;
    };

    const timer = window.setInterval(() => {
      if (onScreen()) jobRef.current();
    }, ms);

    const onVisibilityChange = () => {
      if (onScreen()) jobRef.current();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [ms]);

  return ref;
}

function TasteReferencesScreen({ onBack }: { onBack: () => void }) {
  const [refs, setRefs] = useState<TasteReference[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = () =>
      fetchTasteReferences()
        .then((r) => {
          if (!cancelled) {
            setRefs(r);
            setLoaded(true);
          }
        })
        .catch(() => {
          if (!cancelled) setLoaded(true);
        });
    void refresh();
    window.addEventListener('focus', refresh);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', refresh);
    };
  }, []);

  // Light poll: entries Beau logs mid-conversation appear without a reload,
  // even in the side-by-side chat + app layout. Suspended while this screen is
  // off-screen — it used to keep reading the database after the customer had
  // navigated to another tab.
  const rootRef = useVisibleInterval(() => {
    void fetchTasteReferences()
      .then((r) => {
        setRefs(r);
        setLoaded(true);
      })
      .catch(() => undefined);
  }, 2500);

  const remove = async (id: number) => {
    setRemovingId(id);
    try {
      const fresh = await removeTasteReference(id);
      setRefs(fresh);
    } finally {
      setRemovingId(null);
      setConfirmingId(null);
    }
  };

  return (
    <div ref={rootRef} className="min-h-full bg-transparent">
      <div className="px-5 py-5 space-y-5 max-w-4xl mx-auto w-full pb-24">
        {/* No local back control — this screen publishes its whereabouts to
            the app's ONE floating back + breadcrumb row instead. */}
        <CrumbPublisher
          segs={[
            { label: 'Ethaion', onClick: () => goToEthaionTab('wardrobe') },
            { label: 'The Dossier', onClick: onBack },
            { label: 'Taste references' },
          ]}
          onBack={onBack}
          backLabel="The Dossier"
        />
        <div>
          <h3 className={`${typography.size['2xl']} ${typography.weight.semibold} ${typography.color.primary}`}>
            Taste references
          </h3>
          <p className={`${typography.size.xs} ${typography.color.muted} mt-0.5 max-w-md`}>
            Looks you’ve shared with Beau, and the signal he read in each — newest first.
          </p>
        </div>

        {!loaded ? (
          <div className="flex justify-center py-16">
            <Loader2 className={`w-6 h-6 animate-spin ${tw.icon.primary}`} />
          </div>
        ) : refs.length === 0 ? (
          <div className={`${tw.card.default} rounded-2xl px-6 py-12 text-center`}>
            <Sparkles className={`w-8 h-8 mx-auto ${tw.icon.muted}`} />
            <p className={`${typography.size.base} ${typography.weight.medium} ${typography.color.primary} mt-3`}>
              Nothing shared yet
            </p>
            <p className={`${typography.size.sm} ${typography.color.muted} mt-1 max-w-xs mx-auto`}>
              Share looks you’re drawn to with Beau — he’ll extract what they say about your style.
            </p>
            <button
              type="button"
              onClick={openBeauChat}
              className={`mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl ${typography.size.sm} ${tw.button.primary}`}
            >
              <MessageCircle className="w-4 h-4" /> Share a look with Beau
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {refs.map((ref) => {
              const meta = tasteSourceMeta(ref.source_type);
              const Icon = meta.Icon;
              const when = ref.created_at
                ? new Date(ref.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                : '';
              return (
                <div key={ref.id} className={`${tw.card.default} rounded-2xl p-3.5 flex items-start gap-3`}>
                  {ref.image_url ? (
                    <img
                      src={ref.image_url}
                      alt=""
                      loading="lazy"
                      width={56}
                      height={56}
                      className="w-14 h-14 rounded-xl object-cover flex-shrink-0 border border-[var(--space-border-default)]"
                    />
                  ) : (
                    <span className="w-14 h-14 rounded-xl bg-[var(--space-surface-accent-soft)] flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-[var(--space-text-brand)]" />
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`${typography.size.xs} ${typography.color.muted}`}>
                      {meta.label}{when ? ` · ${when}` : ''}
                    </p>
                    {ref.raw_input && (
                      <p
                        className={`${typography.size.sm} ${typography.color.primary} mt-0.5 italic`}
                        style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                      >
                        “{ref.raw_input}”
                      </p>
                    )}
                    {ref.source_url && (
                      <a
                        href={ref.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`block ${typography.size.xs} ${typography.color.brand} hover:underline truncate mt-0.5`}
                      >
                        {ref.source_url}
                      </a>
                    )}
                    <p className={`${typography.size.xs} ${typography.color.secondary} mt-1.5 leading-relaxed`}>
                      <span className={`${typography.weight.medium} ${typography.color.brand}`}>Noted:</span> {ref.extracted_signal}
                    </p>
                  </div>
                  {confirmingId === ref.id ? (
                    <span className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => void remove(ref.id)}
                        disabled={removingId === ref.id}
                        className={`px-2.5 py-1.5 rounded-lg ${typography.size.xs} ${tw.button.danger} inline-flex items-center gap-1 disabled:opacity-50`}
                      >
                        {removingId === ref.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                        Remove
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingId(null)}
                        className={`p-1.5 rounded-lg ${tw.button.ghost}`}
                        aria-label="Keep this reference"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingId(ref.id)}
                      className={`flex-shrink-0 ${typography.size.xs} ${typography.color.muted} hover:text-[var(--space-semantic-danger)] hover:underline`}
                    >
                      Remove
                    </button>
                  )}
                </div>
              );
            })}
            <p className={`${typography.size.xs} ${typography.color.muted} italic pt-1`}>
              What’s here shapes Beau’s picks; what you remove stops counting immediately.
            </p>
            <button
              type="button"
              onClick={openBeauChat}
              className={`mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl ${typography.size.sm} ${tw.button.primary}`}
            >
              <MessageCircle className="w-4 h-4" /> Share another look with Beau
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Brand-by-brand size exceptions — repeatable Brand + Size pairs, serialised
// into the same free-text columns Beau already reads ("Sunspel M, Incotex
// 46"), so the rubric sync needs no changes.
// ---------------------------------------------------------------------------

function parseBrandSizes(text: string): Array<{ brand: string; size: string }> {
  return (text || '')
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((chunk) => {
      // Prefer an explicit separator: "Sunspel — M", "Incotex: 46".
      const sep = chunk.split(/\s*(?:—|–|:)\s*/);
      if (sep.length >= 2) return { brand: sep[0], size: sep.slice(1).join(' ') };
      // Otherwise the size is the trailing token(s): "Loake UK 9", "Zara M".
      const tokens = chunk.split(/\s+/);
      if (tokens.length >= 3 && /^(UK|EU|US)$/i.test(tokens[tokens.length - 2])) {
        return { brand: tokens.slice(0, -2).join(' '), size: tokens.slice(-2).join(' ') };
      }
      if (tokens.length >= 2) {
        return { brand: tokens.slice(0, -1).join(' '), size: tokens[tokens.length - 1] };
      }
      return { brand: chunk, size: '' };
    });
}

function serializeBrandSizes(rows: Array<{ brand: string; size: string }>): string {
  return rows
    .filter((r) => r.brand.trim() !== '' && r.size.trim() !== '')
    .map((r) => `${r.brand.trim()} ${r.size.trim()}`)
    .join(', ');
}

function BrandSizeRows({
  value,
  onChange,
  brandPlaceholder,
  sizePlaceholder,
  addLabel,
}: {
  value: string;
  onChange: (serialized: string) => void;
  brandPlaceholder: string;
  sizePlaceholder: string;
  addLabel: string;
}) {
  const [rows, setRows] = useState<Array<{ brand: string; size: string }>>(() => {
    const parsed = parseBrandSizes(value);
    return parsed.length > 0 ? parsed : [{ brand: '', size: '' }];
  });
  const push = (next: Array<{ brand: string; size: string }>) => {
    setRows(next);
    onChange(serializeBrandSizes(next));
  };
  return (
    <div className="space-y-1.5">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-1.5 max-w-md">
          <input
            type="text"
            value={row.brand}
            onChange={(e) => push(rows.map((r, j) => (j === i ? { ...r, brand: e.target.value } : r)))}
            placeholder={brandPlaceholder}
            className="flex-1 min-w-0"
            style={FIELD_INPUT}
            aria-label="Brand name"
          />
          <input
            type="text"
            value={row.size}
            onChange={(e) => push(rows.map((r, j) => (j === i ? { ...r, size: e.target.value } : r)))}
            placeholder={sizePlaceholder}
            className="flex-shrink-0"
            style={{ ...FIELD_INPUT, width: FIELD_WIDTH }}
            aria-label="Size in that brand"
          />
          <button
            type="button"
            onClick={() => push(rows.length > 1 ? rows.filter((_, j) => j !== i) : [{ brand: '', size: '' }])}
            className="p-1.5 rounded-lg text-[var(--space-text-muted)] hover:text-[var(--space-semantic-danger)] hover:bg-[var(--space-surface-muted)] flex-shrink-0"
            aria-label="Remove this brand"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => push([...rows, { brand: '', size: '' }])}
        className={`inline-flex items-center gap-1 ${typography.size.xs} ${typography.color.brand} hover:underline`}
      >
        <Plus className="w-3 h-3" /> {addLabel}
      </button>
    </div>
  );
}

/** The occasion chips, in the Dossier's confirmed order — daily, work,
 * weekend, travel. Ids are style_profile.occasions' documented values (the
 * daily register is stored as 'smart-casual'), so Beau's rubric sync reads
 * them unchanged. */
const DOSSIER_OCCASIONS: Option[] = [
  { id: 'smart-casual', label: 'Daily' },
  { id: 'work', label: 'Work' },
  { id: 'weekend', label: 'Weekend' },
  { id: 'travel', label: 'Travel' },
];

/** Body type labels come straight from the shared BUILD_OPTIONS — the SAME
 * list onboarding shows (founder's rule, August 2026: the Dossier and
 * onboarding must never disagree), so there is no Dossier-only relabelling
 * any more. */
const buildLabelOf = (id?: string | null): string =>
  (id && BUILD_OPTIONS.find((o) => o.id === id)?.label) || (id ? label.build(id) : '');

/** The six garment measurements in the Sizes section, in the confirmed
 * order. `key` is the draft key; chest/waist/hips/inseam/shoulder persist to
 * style_measurements, arm to measurement_extras. */
const GARMENT_MEASURES: Array<{ key: string; label: string; cm: string }> = [
  { key: 'chest', label: 'Chest', cm: '102' },
  { key: 'waist', label: 'Waist', cm: '86' },
  { key: 'hips', label: 'Hips', cm: '100' },
  { key: 'shoulder', label: 'Shoulder width', cm: '46' },
  { key: 'arm', label: 'Arm length / sleeve', cm: '64' },
  { key: 'inseam', label: 'Inseam', cm: '81' },
];

// ---------------------------------------------------------------------------
// DOSSIER DATA CACHE (tab-switch performance fix) — everything this screen
// fetches on mount lives at MODULE level once loaded, so returning to the
// tab (or remounting it) paints INSTANTLY from cache — no "Reading your
// profile…" spinner when the data already exists. A background refresh runs
// only when the cache is STALE (older than 60 seconds); edits made on the
// screen are mirrored straight back into the cache, so a mutation is never
// hidden by the staleness window.
// ---------------------------------------------------------------------------

interface DossierCacheShape {
  at: number;
  profile: StyleProfile | null;
  budgets: Record<string, CategoryBudget>;
  prefs: StylePrefs | null;
  trustedBrands: TrustedBrand[];
  measurements: StyleMeasurements | null;
  extras: MeasurementExtras | null;
  dm: DossierMeasurements;
  heightCm: number | null;
  heightUnit: 'cm' | 'ftin';
  weightKg: number | null;
  weightUnit: 'kg' | 'lbs';
  tasteCount: number | null;
  details: DossierDetails;
}

const DOSSIER_STALE_MS = 60_000;
let dossierCache: DossierCacheShape | null = null;

export default function YourStyle() {
  const [profile, setProfile] = useState<StyleProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  // The Dossier-launched onboarding (founder's routing fix): “Start
  // onboarding” and “Retake onboarding” run the REAL wizard right here,
  // inline over this tab — finishing (or skipping) lands straight back on
  // The Dossier with every answer already saved to the profile.
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  // Bumping this re-runs the boot effect, so the panels re-read the fresh
  // answers (profile, measurements, dossier details, avatar) the moment
  // the wizard closes.
  const [bootBump, setBootBump] = useState(0);
  /** The screen's root — polling is skipped while the tab sits hidden
   * behind another one (KeepMounted hides it with display:none). */
  const rootRef = useRef<HTMLDivElement | null>(null);
  // Every section owns its own open flag — opening one never closes (or
  // shifts) another, which was the old micro-shift-under-the-tap bug.
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [fitNotesDraft, setFitNotesDraft] = useState('');
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [draftingNotes, setDraftingNotes] = useState(false);
  const [budgets, setBudgets] = useState<Record<string, CategoryBudget>>({});
  const [prefs, setPrefs] = useState<StylePrefs | null>(null);
  const [freeTextDraft, setFreeTextDraft] = useState('');
  const [savingPrefs, setSavingPrefs] = useState<string | null>(null);
  const [propBullets, setPropBullets] = useState<ProportionBullets>({ works: [], lookFor: [], avoid: [] });
  const [trustedBrands, setTrustedBrands] = useState<TrustedBrand[]>([]);
  const [brandDraft, setBrandDraft] = useState('');
  const [savingBrand, setSavingBrand] = useState(false);

  // Sizing rows — style_measurements + measurement_extras + the new
  // dossier_measurements companion (foot length, clothes size system).
  const [measurements, setMeasurements] = useState<StyleMeasurements | null>(null);
  const [extras, setExtras] = useState<MeasurementExtras | null>(null);
  const [dm, setDm] = useState<DossierMeasurements>(EMPTY_DOSSIER_MEASUREMENTS);

  // PHYSICAL PROFILE drafts — height, weight, body type, foot length.
  const [heightCm, setHeightCm] = useState<number | null>(null);
  const [heightUnit, setHeightUnit] = useState<'cm' | 'ftin'>('cm');
  const [heightCmDraft, setHeightCmDraft] = useState('');
  const [heightFtDraft, setHeightFtDraft] = useState('');
  const [heightInDraft, setHeightInDraft] = useState('');
  const [weightKg, setWeightKg] = useState<number | null>(null);
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lbs'>('kg');
  const [weightDraft, setWeightDraft] = useState('');
  const [buildDraft, setBuildDraft] = useState('');
  // UNSAVED-DRAFT GUARD (founder's fix, August 2026 — "body type does not
  // save"): this screen re-syncs its drafts from the server on window focus
  // and on every profile broadcast, and that sync silently WIPED an edit the
  // reader had not saved yet (switch to another window, come back, the field
  // has snapped back) — Save then compared "unchanged" and wrote nothing. A
  // dirty draft is never overwritten by a background sync; saving releases
  // it.
  const buildDraftDirty = useRef(false);
  const fitNotesDraftDirty = useRef(false);
  const [footDraft, setFootDraft] = useState<MeasureDraft>({ num: '', unit: 'cm' });
  const [savingPhysical, setSavingPhysical] = useState(false);

  // SIZES drafts — the labels the user wears.
  const [shoeSizeDraft, setShoeSizeDraft] = useState('');
  const [shoeSystemDraft, setShoeSystemDraft] = useState('UK');
  const [shoeBrandDraft, setShoeBrandDraft] = useState('');
  const [clothingSizeDraft, setClothingSizeDraft] = useState('');
  const [clothesSystemDraft, setClothesSystemDraft] = useState('alpha');
  const [clothesBrandDraft, setClothesBrandDraft] = useState('');
  /** Per-garment-category size labels — shirt / trouser / jacket / knitwear /
   * suit, each its own field (dossier_measurements.garment_sizes). */
  const [garmentSizeDrafts, setGarmentSizeDrafts] = useState<Record<string, string>>({});
  const [garmentDrafts, setGarmentDrafts] = useState<Record<string, MeasureDraft>>({});
  const [savingSizes, setSavingSizes] = useState(false);
  /** Remount key for the two BrandSizeRows editors when fresh data lands. */
  const [sizesSeedVersion, setSizesSeedVersion] = useState(0);

  // The facts style_profile has no column for — name, hair colour, palette
  // notes, named style references, climate (dossier-details.ts).
  // Seeded SYNCHRONOUSLY from the cached display name (dossier-details.ts):
  // a returning user's name paints on the very first render — the "Made For"
  // tape never falls back to its placeholder while the DB fetch is out.
  const [details, setDetails] = useState<DossierDetails>(() => ({
    ...EMPTY_DOSSIER_DETAILS,
    displayName: cachedDisplayName(),
  }));
  /** True once the saved dossier details have actually arrived (cache or DB). */
  const [detailsLoaded, setDetailsLoaded] = useState(false);
  const [paletteDraft, setPaletteDraft] = useState('');
  const [referenceDraft, setReferenceDraft] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  // Taste References — drill-down sub-screen.
  const [view, setView] = useState<'main' | 'taste-references'>('main');

  // Tapping The Dossier's tab label comes back to the tab's home: the Taste
  // references drill-down closes and every section folds away.
  useEffect(() => {
    const onTabHome = (e: Event) => {
      if ((e as CustomEvent).detail?.tab !== 'your-style') return;
      setView('main');
      setOpenIds({});
    };
    window.addEventListener('ethaion:tab-home', onTabHome);
    return () => window.removeEventListener('ethaion:tab-home', onTabHome);
  }, []);
  const [tasteCount, setTasteCount] = useState<number | null>(null);
  const profileEditVersion = useRef(0);
  const profileEditsPending = useRef(0);
  const prefsEditVersion = useRef(0);

  const seedHeightDrafts = (cm: number | null, unit: 'cm' | 'ftin') => {
    setHeightCmDraft(cm ? String(Math.round(cm)) : '');
    if (cm) {
      const { ft, inch } = cmToFeetInches(cm);
      setHeightFtDraft(String(ft));
      setHeightInDraft(String(inch));
    } else {
      setHeightFtDraft('');
      setHeightInDraft('');
    }
    setHeightUnit(unit);
  };

  /** Persist a specific height: the exact figure onto the avatar profile,
   * the derived band onto the style profile (Beau's rules read the band). */
  const commitHeight = async (nextCm: number | null, unit: 'cm' | 'ftin') => {
    setHeightCm(nextCm);
    seedHeightDrafts(nextCm, unit);
    await saveAvatarInputs({ heightCm: nextCm, heightUnit: unit }).catch(() => undefined);
    await patch('proportions', { height_range: heightRangeFromCm(nextCm) });
  };

  const seedWeightDraft = (kg: number | null, unit: 'kg' | 'lbs') => {
    setWeightDraft(kg ? String(Math.round(unit === 'lbs' ? kg * 2.20462 : kg)) : '');
    setWeightUnit(unit);
  };

  /** Persist the weight onto the avatar profile — stored in kg, read back in
   * the user's preferred unit. */
  const commitWeight = async (raw: string, unit: 'kg' | 'lbs') => {
    const n = parseFloat(raw);
    const kg = isFinite(n) && n > 0 ? (unit === 'lbs' ? n / 2.20462 : n) : null;
    setWeightKg(kg);
    seedWeightDraft(kg, unit);
    await saveAvatarInputs({ weightKg: kg, weightUnit: unit }).catch(() => undefined);
  };

  useEffect(() => {
    let cancelled = false;
    const refreshProfile = () => {
      // Mounted-but-hidden (another tab active, KeepMounted's display:none):
      // skip the poll entirely — no server traffic for a hidden screen.
      if (rootRef.current && rootRef.current.offsetParent === null) return Promise.resolve();
      return fetchProfile()
        .then((p) => {
          if (cancelled || profileEditsPending.current > 0) return;
          setProfile(p);
          if (!fitNotesDraftDirty.current) setFitNotesDraft(p?.fit_notes ?? '');
          if (!buildDraftDirty.current) setBuildDraft(p?.build ?? '');
        })
        .catch((e) => console.error('[YourStyle] failed to load profile:', e))
        .finally(() => {
          if (!cancelled) setLoaded(true);
        });
    };

    /** Paint the whole screen from the module cache — synchronous, no
     * loading state: tab switching feels instant. */
    const applyCache = (cache: DossierCacheShape) => {
      setProfile(cache.profile);
      if (!fitNotesDraftDirty.current) setFitNotesDraft(cache.profile?.fit_notes ?? '');
      if (!buildDraftDirty.current) setBuildDraft(cache.profile?.build ?? '');
      setBudgets(cache.budgets);
      setPrefs(cache.prefs);
      setFreeTextDraft(cache.prefs?.free_text ?? '');
      setTrustedBrands(cache.trustedBrands);
      setMeasurements(cache.measurements);
      setExtras(cache.extras);
      setDm(cache.dm);
      setHeightCm(cache.heightCm);
      seedHeightDrafts(cache.heightCm, cache.heightUnit);
      setWeightKg(cache.weightKg);
      seedWeightDraft(cache.weightKg, cache.weightUnit);
      setTasteCount(cache.tasteCount);
      setDetails(cache.details);
      setDetailsLoaded(true);
      setPaletteDraft(cache.details.paletteNotes ?? '');
      setLoaded(true);
    };

    /** One parallel fetch of everything the screen shows; the profile lands
     * first (it gates the spinner), the rest follows and refreshes the
     * module cache's timestamp. */
    const loadAll = () => {
      const profileJob = fetchProfile()
        .then((p) => {
          if (cancelled) return p;
          if (profileEditsPending.current === 0) {
            setProfile(p);
            if (!fitNotesDraftDirty.current) setFitNotesDraft(p?.fit_notes ?? '');
            if (!buildDraftDirty.current) setBuildDraft(p?.build ?? '');
          }
          return p;
        })
        .catch((e) => {
          console.error('[YourStyle] failed to load profile:', e);
          return null;
        })
        .finally(() => {
          if (!cancelled) setLoaded(true);
        });
      const restJob = Promise.all([
        fetchCategoryBudgets().catch((e) => {
          console.error('[YourStyle] failed to load budgets:', e);
          return {} as Record<string, CategoryBudget>;
        }),
        fetchPrefs().catch((e) => {
          console.error('[YourStyle] failed to load prefs:', e);
          return null;
        }),
        fetchTrustedBrands().catch((e) => {
          console.error('[YourStyle] failed to load trusted brands:', e);
          return [] as TrustedBrand[];
        }),
        fetchStyleMeasurements().catch((e) => {
          console.error('[YourStyle] failed to load measurements:', e);
          return null;
        }),
        fetchMeasurementExtras().catch(() => null),
        fetchDossierMeasurements().catch(() => EMPTY_DOSSIER_MEASUREMENTS),
        fetchAvatarInputs(true).catch(() => null),
        fetchTasteReferences().catch(() => [] as TasteReference[]),
        fetchDossierDetails().catch(() => EMPTY_DOSSIER_DETAILS),
      ]);
      void Promise.all([profileJob, restJob]).then(([p, [b, prefRow, brands, m, x, d, inputs, refs, det]]) => {
        if (cancelled) return;
        setBudgets(b);
        setPrefs(prefRow);
        setFreeTextDraft(prefRow?.free_text ?? '');
        setTrustedBrands(brands);
        setMeasurements(m);
        setExtras(x);
        setDm(d);
        const heightUnitFresh: 'cm' | 'ftin' = inputs?.heightUnit === 'ftin' ? 'ftin' : 'cm';
        const weightUnitFresh: 'kg' | 'lbs' = inputs?.weightUnit === 'lbs' ? 'lbs' : 'kg';
        if (inputs) {
          setHeightCm(inputs.heightCm);
          seedHeightDrafts(inputs.heightCm, heightUnitFresh);
          setWeightKg(inputs.weightKg ?? null);
          seedWeightDraft(inputs.weightKg ?? null, weightUnitFresh);
        }
        setTasteCount(refs.length);
        setDetails(det);
        setDetailsLoaded(true);
        setPaletteDraft(det.paletteNotes ?? '');
        dossierCache = {
          at: Date.now(),
          profile: p,
          budgets: b,
          prefs: prefRow,
          trustedBrands: brands,
          measurements: m,
          extras: x,
          dm: d,
          heightCm: inputs?.heightCm ?? null,
          heightUnit: heightUnitFresh,
          weightKg: inputs?.weightKg ?? null,
          weightUnit: weightUnitFresh,
          tasteCount: refs.length,
          details: det,
        };
      });
    };

    // Cached data answers instantly — no loading state when data already
    // exists; a background refresh runs only when it is stale (>60s).
    if (dossierCache) {
      applyCache(dossierCache);
      if (Date.now() - dossierCache.at > DOSSIER_STALE_MS) loadAll();
    } else {
      loadAll();
    }
    const onProfile = (event: Event) => {
      if (profileEditsPending.current > 0) return;
      const fresh = (event as CustomEvent).detail?.profile as StyleProfile | undefined;
      if (fresh) {
        setProfile(fresh);
        if (!fitNotesDraftDirty.current) setFitNotesDraft(fresh.fit_notes ?? '');
        if (!buildDraftDirty.current) setBuildDraft(fresh.build ?? '');
      } else {
        void refreshProfile();
      }
    };
    window.addEventListener('ethaion:profile', onProfile);
    window.addEventListener('focus', refreshProfile);
    // Beau's save_rubric tool runs server-side and cannot dispatch a browser
    // event. A light poll while this screen is mounted makes that edit appear
    // without a reload, even in the side-by-side chat + app layout.
    const syncTimer = window.setInterval(refreshProfile, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(syncTimer);
      window.removeEventListener('ethaion:profile', onProfile);
      window.removeEventListener('focus', refreshProfile);
    };
    // `bootBump` re-runs the whole boot read after the inline onboarding
    // closes — the module cache is cleared first, so this is a real re-read.
  }, [bootBump]);

  // Mirror the screen's live state back into the module cache whenever any
  // cached slice changes — an edit made here (a saved measurement, a new
  // trusted brand, a renamed tape) is exactly what the next mount paints,
  // so the staleness window can never hide a mutation.
  useEffect(() => {
    if (!loaded) return;
    dossierCache = {
      at: dossierCache?.at ?? Date.now(),
      profile,
      budgets,
      prefs,
      trustedBrands,
      measurements,
      extras,
      dm,
      heightCm,
      heightUnit,
      weightKg,
      weightUnit,
      tasteCount,
      details,
    };
  }, [loaded, profile, budgets, prefs, trustedBrands, measurements, extras, dm, heightCm, heightUnit, weightKg, weightUnit, tasteCount, details]);

  // Seeding the sizing drafts from the rows themselves — and re-seeding
  // whenever they change — closes the race the old screen had: drafts filled
  // only when a section opened put empty boxes over saved values.
  useEffect(() => {
    setShoeSizeDraft(measurements?.shoe_size ?? '');
    setShoeSystemDraft(measurements?.shoe_size_system ?? 'UK');
    setShoeBrandDraft(measurements?.shoe_brand_sizes ?? '');
    setClothingSizeDraft(measurements?.clothing_size ?? '');
    setClothesBrandDraft(measurements?.brand_sizes ?? '');
    const stored: Record<string, string | null | undefined> = {
      chest: measurements?.chest_cm,
      waist: measurements?.waist_cm,
      hips: measurements?.hips_cm,
      shoulder: measurements?.shoulder_cm,
      arm: extras?.arm_length,
      inseam: measurements?.inseam_cm,
    };
    const next: Record<string, MeasureDraft> = {};
    for (const f of GARMENT_MEASURES) next[f.key] = parseMeasure(stored[f.key]);
    setGarmentDrafts(next);
    setSizesSeedVersion((v) => v + 1);
  }, [measurements, extras]);

  useEffect(() => {
    setFootDraft(parseMeasure(dm.foot_length));
    if (dm.clothes_size_system) setClothesSystemDraft(dm.clothes_size_system);
    setGarmentSizeDrafts(parseGarmentSizes(dm.garment_sizes));
  }, [dm]);

  // Concise what-suits-your-frame bullets — AI-generated, deterministic fallback.
  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    setPropBullets(composeProportionBullets(profile));
    if (profile.height_range || profile.build) {
      generateProportionBullets(profile)
        .then((b) => {
          if (!cancelled && b) setPropBullets(b);
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [profile?.height_range, profile?.build, profile?.fit_notes]);

  const patchPrefs = async (sectionId: string, fields: Partial<Omit<StylePrefs, 'id'>>) => {
    const before = prefs;
    const editVersion = ++prefsEditVersion.current;
    const optimistic: StylePrefs = {
      id: before?.id ?? -1,
      secondhand: before?.secondhand ?? null,
      currency: before?.currency ?? null,
      free_text: before?.free_text ?? null,
      ...fields,
    };
    setPrefs(optimistic);
    setSavingPrefs(sectionId);
    try {
      const fresh = await savePrefs(fields);
      if (fresh && prefsEditVersion.current === editVersion) setPrefs(fresh);
    } catch (e) {
      console.error('[YourStyle] failed to save prefs:', e);
      if (prefsEditVersion.current === editVersion) {
        const fresh = await fetchPrefs().catch(() => null);
        const rollback = fresh ?? before;
        setPrefs(rollback);
        setFreeTextDraft(rollback?.free_text ?? '');
      }
    } finally {
      setSavingPrefs((current) => (current === sectionId ? null : current));
    }
  };

  /** Write one or more of the companion-table facts. Optimistic, and it
   * rolls the local copy back to whatever the write actually returned. */
  const patchDetails = async (fields: Parameters<typeof saveDossierDetails>[0]) => {
    const before = details;
    setDetails((cur) => ({ ...cur, ...fields } as DossierDetails));
    setSavingDetails(true);
    try {
      setDetails(await saveDossierDetails(fields));
    } catch {
      setDetails(before);
    } finally {
      setSavingDetails(false);
    }
  };

  const patch = async (sectionId: string, fields: Record<string, unknown>) => {
    const before = profile;
    if (!before) return;
    const editVersion = ++profileEditVersion.current;
    profileEditsPending.current += 1;
    setProfile((current) => (current ? ({ ...current, ...fields } as StyleProfile) : current));
    if ('fit_notes' in fields) {
      fitNotesDraftDirty.current = false;
      setFitNotesDraft(typeof fields.fit_notes === 'string' ? fields.fit_notes : '');
    }
    if ('build' in fields) buildDraftDirty.current = false;
    setSaving(sectionId);
    try {
      const fresh = await saveProfile(fields);
      if (fresh && profileEditVersion.current === editVersion) setProfile(fresh);
    } catch (e) {
      console.error('[YourStyle] failed to save profile:', e);
      if (profileEditVersion.current === editVersion) {
        const fresh = await fetchProfile().catch(() => null);
        const rollback = fresh ?? before;
        setProfile(rollback);
        setFitNotesDraft(rollback.fit_notes ?? '');
      }
    } finally {
      profileEditsPending.current -= 1;
      setSaving((current) => (current === sectionId ? null : current));
    }
  };

  const toggleInList = (list: string[] | null, id: string): string[] => {
    const cur = Array.isArray(list) ? list : [];
    return cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  };

  const doReset = async () => {
    setResetting(true);
    try {
      await resetProfile();
      // Retake runs the wizard RIGHT HERE (it used to dump the user on the
      // wardrobe tab) — done or skipped, they land back on The Dossier.
      setProfile(null);
      dossierCache = null;
      setOnboardingOpen(true);
    } finally {
      setResetting(false);
      setConfirmingReset(false);
    }
  };

  if (!loaded) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className={`w-7 h-7 animate-spin ${tw.icon.primary}`} />
        <p className={`${typography.size.sm} ${typography.color.muted}`}>Reading your profile…</p>
      </div>
    );
  }

  // THE INLINE ONBOARDING — the same four-screen wizard the first run uses
  // (exported by the home app), rendered in place of this tab's content.
  // Every answer saves to the profile exactly as first-run onboarding does;
  // Continue on the last screen or either Skip closes it, and The Dossier
  // re-reads everything so the Beau panels reflect the fresh answers.
  if (onboardingOpen) {
    return (
      <div className="min-h-full" style={{ background: 'var(--space-surface-card)' }}>
        <Onboarding
          profile={profile}
          prefs={prefs}
          onDone={(fresh) => {
            setOnboardingOpen(false);
            if (fresh) setProfile(fresh);
            dossierCache = null;
            setBootBump((n) => n + 1);
            // Tell the rest of the app (the shell's first-run gate, the
            // other tabs) the profile moved — fresh in hand when we have it.
            window.dispatchEvent(
              fresh
                ? new CustomEvent('ethaion:profile', { detail: { profile: fresh } })
                : new CustomEvent('ethaion:profile'),
            );
          }}
        />
      </div>
    );
  }

  // Dedicated Taste References sub-screen — a full drill-down, not inline.
  // Tapping The Dossier's own tab label closes it (see the listener below).
  if (view === 'taste-references') {
    return (
      <TasteReferencesScreen
        onBack={() => {
          setView('main');
          fetchTasteReferences().then((r) => setTasteCount(r.length)).catch(() => undefined);
        }}
      />
    );
  }

  if (!profile) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center py-24 px-6 text-center gap-3">
        <p className={`${typography.size.base} ${typography.weight.medium} ${typography.color.primary}`}>
          Beau doesn’t know you yet
        </p>
        <p className={`${typography.size.sm} ${typography.color.muted} max-w-xs`}>
          A two-minute onboarding builds your style profile — then everything here fills in.
        </p>
        <button
          type="button"
          onClick={() => setOnboardingOpen(true)}
          className={`mt-2 px-5 py-2.5 rounded-xl ${typography.size.sm} ${tw.button.primary}`}
        >
          Start onboarding
        </button>
      </div>
    );
  }

  const p = profile;
  const archetypes = Array.isArray(p.archetypes) ? p.archetypes : [];
  const occasions = Array.isArray(p.occasions) ? p.occasions : [];
  const life = p.lifestyle || {};
  // budget_range is a real style_profile column but predates the StyleProfile
  // type, so it is read through a narrow cast rather than widened globally.
  const budgetRange = (p as unknown as { budget_range?: string | null }).budget_range ?? null;

  const isOpen = (id: string) => !!openIds[id];
  const toggleSection = (id: string) => setOpenIds((cur) => ({ ...cur, [id]: !cur[id] }));

  const currencySymbol = (CURRENCIES.find((c) => c.id === (prefs?.currency || 'GBP'))?.symbol || '£').trim();
  const BANDS = budgetBands(currencySymbol);

  /** A quiet "Saved." beside the button that did it. */
  const flashSaved = (id: string) => {
    setFlash(id);
    window.setTimeout(() => setFlash((cur) => (cur === id ? null : cur)), 2400);
  };

  /** PHYSICAL PROFILE saves as one unit: height and weight onto the avatar
   * profile (plus the derived height band onto the style profile, which is
   * what Beau's rules read), body type onto the style profile and the
   * avatar, foot length onto dossier_measurements. The row stays open and
   * the button confirms — nothing writes on blur behind your back. */
  const savePhysical = async () => {
    if (savingPhysical) return;
    setSavingPhysical(true);
    try {
      if (heightUnit === 'cm') {
        const n = parseFloat(heightCmDraft);
        await commitHeight(isFinite(n) && n > 0 ? Math.round(n) : null, 'cm');
      } else {
        const ft = parseFloat(heightFtDraft);
        const inch = parseFloat(heightInDraft);
        await commitHeight(
          isFinite(ft) && ft > 0 ? feetInchesToCm(ft, isFinite(inch) && inch > 0 ? inch : 0) : null,
          'ftin',
        );
      }
      await commitWeight(weightDraft, weightUnit);
      if ((buildDraft || null) !== (p.build || null)) {
        await patch('proportions', { build: buildDraft || null });
        await saveAvatarInputs({ bodyType: avatarBodyTypeFor(buildDraft) }).catch(() => undefined);
      }
      buildDraftDirty.current = false;
      const freshDm = await saveDossierMeasurements({
        foot_length: serializeMeasure(footDraft.num, footDraft.unit),
      });
      setDm(freshDm);
      flashSaved('physical');
    } finally {
      setSavingPhysical(false);
    }
  };

  /** SIZES saves as one unit: the labels and brand exceptions onto
   * style_measurements, arm length onto measurement_extras, the clothes
   * size system onto dossier_measurements. */
  const saveSizes = async () => {
    if (savingSizes) return;
    setSavingSizes(true);
    try {
      const g = (key: string) => {
        const d = garmentDrafts[key] || { num: '', unit: 'cm' as LinearUnit };
        return serializeMeasure(d.num, d.unit);
      };
      const freshMeasurements = await saveMeasurements({
        clothing_size: clothingSizeDraft.trim() || null,
        brand_sizes: clothesBrandDraft.trim() || null,
        shoe_size: shoeSizeDraft.trim() || null,
        shoe_size_system: shoeSizeDraft.trim() ? shoeSystemDraft : null,
        shoe_brand_sizes: shoeBrandDraft.trim() || null,
        chest_cm: g('chest'),
        waist_cm: g('waist'),
        hips_cm: g('hips'),
        inseam_cm: g('inseam'),
        shoulder_cm: g('shoulder'),
      });
      const freshExtras = await saveMeasurementExtras({ arm_length: g('arm') });
      const freshDm = await saveDossierMeasurements({
        clothes_size_system: clothesSystemDraft || null,
        garment_sizes: serializeGarmentSizes(garmentSizeDrafts),
      });
      setMeasurements(freshMeasurements);
      setExtras(freshExtras);
      setDm(freshDm);
      flashSaved('sizes');
    } finally {
      setSavingSizes(false);
    }
  };

  const singleChips = (options: Option[], current: string | null, sectionId: string, field: string) => (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <Chip key={o.id} active={current === o.id} onClick={() => void patch(sectionId, { [field]: o.id })}>
          {o.label}
        </Chip>
      ))}
      {saving === sectionId && <Loader2 className="w-4 h-4 animate-spin text-[var(--space-text-muted)] mt-1" />}
    </div>
  );

  const clothesSizePlaceholder = clothesSystemDraft === 'eu' ? '50' : clothesSystemDraft === 'us' ? '40' : 'M';

  return (
    <div ref={rootRef} className="min-h-full bg-transparent relative">
      {/* The shared tab masthead (tab-header.tsx) — the same block as every
          other primary tab, with the ALWAYS-VISIBLE "Save your profile"
          button in its aside. */}
      <TabHeader
        title="The Dossier"
        standfirst="Everything Beau knows about you — correct it and he uses it."
        aside={<SaveProfileButton surface="your-style" />}
      />

      <div className="px-6 sm:px-10 max-w-[1180px] mx-auto w-full pb-28">
        {/* ================= THE NAME TAPE =================
            Not a section header — the bespoke cloth-label card at the very
            top of the Dossier. "MADE FOR" · the name (tap to edit) · the
            date the dossier was opened. No "Name:" label, no "Date:" label. */}
        <DossierNameTape
          name={details.displayName ?? ''}
          createdAt={p.created_at}
          saved={flash === 'name'}
          nameLoaded={detailsLoaded || !!details.displayName}
          onSave={(next) => void patchDetails({ displayName: next }).then(() => flashSaved('name'))}
        />

        {/* ================= MISSING, AND IT COSTS YOU NOW (M10) =================
            Shoe size and waist are the two facts Beau's fit reads
            need — while either is missing, the callout LEADS the Dossier
            (never buried mid-page) and names the cost. It disappears the
            moment both are set. */}
        {detailsLoaded && (!measurements?.shoe_size || !measurements?.waist_cm) && (
          <div
            className="mt-6 p-4 sm:p-5"
            style={{ border: '1.5px solid var(--color-accent-2,#7d2a24)', background: 'var(--color-paper,#fbf8f1)' }}
            role="note"
            aria-label="Missing measurements Beau needs"
          >
            <p className="uppercase" style={{ fontFamily: 'var(--space-font-heading)', fontSize: '11px', letterSpacing: '0.16em', color: 'var(--color-accent-2,#7d2a24)' }}>
              Missing, and it costs you now
            </p>
            <p className={typography.color.primary} style={{ fontFamily: 'var(--space-font-heading)', fontSize: '20px', lineHeight: 1.25, marginTop: '6px' }}>
              {!measurements?.shoe_size && !measurements?.waist_cm
                ? 'He doesn\u2019t have your shoe size or your waist.'
                : !measurements?.shoe_size
                  ? 'He doesn\u2019t have your shoe size.'
                  : 'He doesn\u2019t have your waist.'}
            </p>
            <p className={typography.color.primary} style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', lineHeight: 1.55, marginTop: '6px', maxWidth: '54ch' }}>
              Every fit read Beau gives is guesswork until these are set — shoes judged without a size, trousers
              without a waist. {!measurements?.shoe_size && !measurements?.waist_cm ? 'Two fields fix it.' : 'One field fixes it.'}
            </p>
            <button
              type="button"
              onClick={() => {
                if (!isOpen('sizes')) toggleSection('sizes');
                window.setTimeout(() => {
                  document.querySelector('[data-dossier-section="sizes"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 60);
              }}
              className="mt-3 inline-flex items-center gap-1.5 min-h-[44px] px-4 border transition-colors"
              style={{
                fontFamily: 'var(--space-font-family)',
                fontSize: '14px',
                borderColor: 'var(--color-accent-2,#7d2a24)',
                color: 'var(--color-accent-2,#7d2a24)',
                borderRadius: 0,
              }}
            >
              {!measurements?.shoe_size && !measurements?.waist_cm ? 'Add shoe size and waist ›' : !measurements?.shoe_size ? 'Add your shoe size ›' : 'Add your waist ›'}
            </button>
          </div>
        )}

        {/* ================= 1 · PHYSICAL PROFILE =================
            Four compact fields, each sized to what it holds, each unit
            toggle inline beside the field it governs. The how-to-measure
            helper anchors below the fields, on the same left margin. */}
        <Section
          title="Physical profile"
          value={
            <FactLine
              parts={[
                heightCm
                  ? heightUnit === 'ftin'
                    ? `${cmToFeetInches(heightCm).ft}′ ${cmToFeetInches(heightCm).inch}″`
                    : `${Math.round(heightCm)} cm`
                  : '',
                weightKg
                  ? weightUnit === 'lbs'
                    ? `${Math.round(weightKg * 2.20462)} lb`
                    : `${Math.round(weightKg)} kg`
                  : '',
                p.build ? buildLabelOf(p.build) : '',
                dm.foot_length ? `Foot ${dm.foot_length}` : '',
              ]}
              hint="No measurements yet — tap Edit to add them."
            />
          }
          editing={isOpen('physical')}
          onToggle={() => toggleSection('physical')}
        >
          <div className="space-y-5">
            <div className="flex flex-wrap items-start" style={{ columnGap: '18px', rowGap: '16px' }}>
              {/* Height — cm or ft/in, the toggle inline beside the field. */}
              <div>
                <span style={FIELD_LABEL}>Height</span>
                <div className="flex items-center" style={{ gap: '8px' }}>
                  {heightUnit === 'cm' ? (
                    <input
                      type="number"
                      inputMode="numeric"
                      value={heightCmDraft}
                      onChange={(e) => setHeightCmDraft(e.target.value)}
                      placeholder="175"
                      aria-label="Height in centimetres"
                      style={{ ...FIELD_INPUT, width: FIELD_WIDTH }}
                    />
                  ) : (
                    <span className="inline-flex items-center" style={{ gap: '6px' }}>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={heightFtDraft}
                        onChange={(e) => setHeightFtDraft(e.target.value)}
                        placeholder="5"
                        aria-label="Height — feet"
                        style={{ ...FIELD_INPUT, width: '46px' }}
                      />
                      <span style={UNIT_HINT}>ft</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={heightInDraft}
                        onChange={(e) => setHeightInDraft(e.target.value)}
                        placeholder="9"
                        aria-label="Height — inches"
                        style={{ ...FIELD_INPUT, width: '46px' }}
                      />
                      <span style={UNIT_HINT}>in</span>
                    </span>
                  )}
                  <InlineSwitch
                    label="Height — centimetres or feet and inches"
                    options={[
                      { id: 'cm', label: 'cm' },
                      { id: 'ftin', label: 'in' },
                    ]}
                    active={heightUnit}
                    onSelect={(id) => seedHeightDrafts(heightCm, id === 'ftin' ? 'ftin' : 'cm')}
                  />
                </div>
              </div>
              {/* Weight — kg or lb, the toggle inline beside the field. */}
              <div>
                <span style={FIELD_LABEL}>Weight</span>
                <div className="flex items-center" style={{ gap: '8px' }}>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={weightDraft}
                    onChange={(e) => setWeightDraft(e.target.value)}
                    placeholder={weightUnit === 'kg' ? '78' : '172'}
                    aria-label={`Weight in ${weightUnit === 'kg' ? 'kilograms' : 'pounds'}`}
                    style={{ ...FIELD_INPUT, width: FIELD_WIDTH }}
                  />
                  <InlineSwitch
                    label="Weight — kilograms or pounds"
                    options={[
                      { id: 'kg', label: 'kg' },
                      { id: 'lbs', label: 'lb' },
                    ]}
                    active={weightUnit}
                    onSelect={(id) => seedWeightDraft(weightKg, id === 'lbs' ? 'lbs' : 'kg')}
                  />
                </div>
              </div>
              {/* Body type — a compact select: slim / athletic / regular /
                  large-broad. */}
              <div>
                <span style={FIELD_LABEL}>Body type</span>
                <select
                  value={buildDraft}
                  onChange={(e) => {
                    buildDraftDirty.current = true;
                    setBuildDraft(e.target.value);
                  }}
                  aria-label="Body type"
                  style={{ ...FIELD_INPUT, width: '150px', paddingRight: '26px' }}
                >
                  <option value="">—</option>
                  {BUILD_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              {/* Foot length — the PHYSICAL measurement of the foot (not a
                  shoe-size label; those live under Sizes below). */}
              <MeasureField
                fieldLabel="Foot length"
                draft={footDraft}
                placeholderCm="27"
                onChange={setFootDraft}
              />
            </div>

            {/* The helper is anchored under the fields it explains, on the
                same left margin — never floated off to one side. */}
            <div>
              <HowToMeasureButton />
            </div>

            <SaveButton onClick={() => void savePhysical()} busy={savingPhysical} saved={flash === 'physical'} />
          </div>
        </Section>

        {/* ================= 2 · SKIN TONE + HAIR COLOUR =================
            Two standalone fields — their own section, sitting directly
            after Physical profile. No group header, no sub-label beyond
            the field names themselves. */}
        <Section
          title="Skin tone & hair colour"
          value={
            <FactLine
              parts={[
                SKIN_TONES.find((t) => t.id === p.skin_tone)?.label,
                hairColourLabel(details.hairColour),
              ]}
              hint="Not captured yet — tap Edit to set them."
            />
          }
          editing={isOpen('complexion')}
          onToggle={() => toggleSection('complexion')}
        >
          <div className="space-y-5">
            <div>
              <p className={statLabelCls}>Skin tone</p>
              <div className="flex flex-wrap gap-2">
                {SKIN_TONES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => void patch('complexion', { skin_tone: t.id })}
                    aria-pressed={p.skin_tone === t.id}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all ${
                      p.skin_tone === t.id
                        ? 'border-[var(--space-brand-primary)] bg-[var(--space-surface-accent-soft)]'
                        : 'border-[var(--space-border-default)] hover:border-[var(--space-border-strong)]'
                    }`}
                  >
                    <span className="w-8 h-8 rounded-full border border-[var(--space-border-strong)]" style={{ background: t.swatch }} />
                    <span className={`${typography.size.xs} ${typography.color.primary}`}>{t.label}</span>
                  </button>
                ))}
                {saving === 'complexion' && <Loader2 className="w-4 h-4 animate-spin text-[var(--space-text-muted)]" />}
              </div>
            </div>
            <div>
              <p className={statLabelCls}>Hair colour</p>
              <div className="flex flex-wrap gap-2">
                {HAIR_COLOURS.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => void patchDetails({ hairColour: details.hairColour === h.id ? null : h.id })}
                    aria-pressed={details.hairColour === h.id}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all ${
                      details.hairColour === h.id
                        ? 'border-[var(--space-brand-primary)] bg-[var(--space-surface-accent-soft)]'
                        : 'border-[var(--space-border-default)] hover:border-[var(--space-border-strong)]'
                    }`}
                  >
                    <span className="w-8 h-8 rounded-full border border-[var(--space-border-strong)]" style={{ background: h.swatch }} />
                    <span className={`${typography.size.xs} ${typography.color.primary}`}>{h.label}</span>
                  </button>
                ))}
                {savingDetails && <Loader2 className="w-4 h-4 animate-spin text-[var(--space-text-muted)]" />}
              </div>
            </div>
          </div>
        </Section>

        {/* ================= 3 · SIZES =================
            The sizing LABELS the user wears — distinct from the physical
            measurements above. Two subsections: shoe sizes and clothes
            sizes, each with brand-by-brand exceptions. */}
        <div data-dossier-section="sizes" />
        <Section
          title="Sizes"
          value={
            <FactLine
              parts={[
                measurements?.clothing_size ? `Size ${measurements.clothing_size}` : '',
                measurements?.shoe_size ? `Shoe ${measurements.shoe_size_system || 'UK'} ${measurements.shoe_size}` : '',
                [
                  measurements?.chest_cm ? `chest ${measurements.chest_cm}` : '',
                  measurements?.waist_cm ? `waist ${measurements.waist_cm}` : '',
                  measurements?.inseam_cm ? `inseam ${measurements.inseam_cm}` : '',
                ]
                  .filter(Boolean)
                  .join(', '),
              ]}
              hint="No sizes yet — tap Edit to add them."
            />
          }
          editing={isOpen('sizes')}
          onToggle={() => toggleSection('sizes')}
        >
          <div className="space-y-7">
            {/* --- Shoe sizes --- */}
            <div className="space-y-4">
              <span
                className="block uppercase text-[var(--color-accent-700,#7c4a17)]"
                style={{ fontFamily: 'var(--space-font-heading)', fontSize: '12px', letterSpacing: '0.14em' }}
              >
                Shoe sizes
              </span>
              <div>
                <span style={FIELD_LABEL}>Shoe size</span>
                {/* Every common standard — UK · EU · US · JP (cm) · IT · FR ·
                    AU/NZ: pick the system you buy in, enter the size in it. */}
                <div className="flex items-center flex-wrap" style={{ gap: '8px' }}>
                  <input
                    type="text"
                    value={shoeSizeDraft}
                    onChange={(e) => setShoeSizeDraft(e.target.value)}
                    placeholder={({ UK: '9', EU: '43', US: '10', JP: '27', IT: '43', FR: '43', 'AU/NZ': '9' } as Record<string, string>)[shoeSystemDraft] || '9'}
                    aria-label={`Shoe size (${shoeSystemDraft})`}
                    style={{ ...FIELD_INPUT, width: FIELD_WIDTH }}
                  />
                  <InlineSwitch
                    label="Shoe sizing system"
                    options={SHOE_SIZE_SYSTEMS.map((sys) => ({ id: sys, label: sys === 'JP' ? 'JP (cm)' : sys }))}
                    active={shoeSystemDraft}
                    onSelect={setShoeSystemDraft}
                  />
                </div>
              </div>
              <div>
                <span style={FIELD_LABEL}>Brand exceptions</span>
                <p className={`${typography.size.xs} ${typography.color.muted} italic`} style={{ marginBottom: '8px' }}>
                  Where a maker runs differently — e.g. “In Allen Edmonds I’m a 9 UK, in Loake a 9.5 UK.”
                </p>
                <BrandSizeRows
                  key={`shoe-${sizesSeedVersion}`}
                  value={shoeBrandDraft}
                  onChange={setShoeBrandDraft}
                  brandPlaceholder="Brand — e.g. Loake"
                  sizePlaceholder="e.g. 9.5 UK"
                  addLabel="Add a shoe brand"
                />
              </div>
            </div>

            {/* --- Clothes sizes --- */}
            <div className="space-y-4 border-t border-[var(--space-border-default)] pt-5">
              <span
                className="block uppercase text-[var(--color-accent-700,#7c4a17)]"
                style={{ fontFamily: 'var(--space-font-heading)', fontSize: '12px', letterSpacing: '0.14em' }}
              >
                Clothes sizes
              </span>
              <div>
                <span style={FIELD_LABEL}>General size</span>
                <div className="flex items-center flex-wrap" style={{ gap: '8px' }}>
                  {clothesSystemDraft === 'alpha' ? (
                    <span className="inline-flex flex-wrap items-center" style={{ gap: '6px' }}>
                      {CLOTHING_SIZE_OPTIONS.map((s) => (
                        <Chip
                          key={s}
                          active={clothingSizeDraft === s}
                          onClick={() => setClothingSizeDraft(clothingSizeDraft === s ? '' : s)}
                        >
                          {s}
                        </Chip>
                      ))}
                    </span>
                  ) : (
                    <input
                      type="text"
                      inputMode="numeric"
                      value={clothingSizeDraft}
                      onChange={(e) => setClothingSizeDraft(e.target.value)}
                      placeholder={clothesSizePlaceholder}
                      aria-label={`General clothing size (${clothesSystemDraft.toUpperCase()} numerical)`}
                      style={{ ...FIELD_INPUT, width: FIELD_WIDTH }}
                    />
                  )}
                  <InlineSwitch
                    label="Clothing size system — alpha, EU numerical or US numerical"
                    options={CLOTHES_SIZE_SYSTEMS}
                    active={clothesSystemDraft}
                    onSelect={setClothesSystemDraft}
                  />
                </div>
              </div>
              {/* SIZES BY GARMENT (UI corrections pass) — one clearly
                  labelled field per garment category, independent of the
                  general size above; each takes whatever system the user
                  buys that category in. */}
              <div>
                <span style={FIELD_LABEL}>Sizes by garment</span>
                <p className={`${typography.size.xs} ${typography.color.muted} italic`} style={{ marginBottom: '8px' }}>
                  Where one number doesn’t cover you — each garment category takes its own size, in whatever system
                  you buy it in.
                </p>
                <div className="flex flex-wrap items-start" style={{ columnGap: '18px', rowGap: '14px' }}>
                  {GARMENT_SIZE_CATEGORIES.map((cat) => (
                    <div key={cat.id}>
                      <span style={FIELD_LABEL}>{cat.label}</span>
                      <input
                        type="text"
                        value={garmentSizeDrafts[cat.id] || ''}
                        onChange={(e) => setGarmentSizeDrafts((cur) => ({ ...cur, [cat.id]: e.target.value }))}
                        placeholder={cat.placeholder}
                        aria-label={`${cat.label} size`}
                        style={{ ...FIELD_INPUT, width: '164px' }}
                      />
                    </div>
                  ))}
                </div>
              </div>
              {/* The six garment measurements — compact, labels above, each
                  with its OWN cm / in toggle, all on the same grid. */}
              <div>
                <span style={FIELD_LABEL}>Measurements</span>
                <div className="flex flex-wrap items-start" style={{ columnGap: '18px', rowGap: '16px' }}>
                  {GARMENT_MEASURES.map((f) => (
                    <MeasureField
                      key={f.key}
                      fieldLabel={f.label}
                      draft={garmentDrafts[f.key] || { num: '', unit: 'cm' }}
                      placeholderCm={f.cm}
                      onChange={(next) => setGarmentDrafts((cur) => ({ ...cur, [f.key]: next }))}
                    />
                  ))}
                </div>
              </div>
              <div>
                <span style={FIELD_LABEL}>Brand exceptions</span>
                <p className={`${typography.size.xs} ${typography.color.muted} italic`} style={{ marginBottom: '8px' }}>
                  Where a maker runs differently — e.g. “Sunspel M, Incotex 46.”
                </p>
                <BrandSizeRows
                  key={`clothes-${sizesSeedVersion}`}
                  value={clothesBrandDraft}
                  onChange={setClothesBrandDraft}
                  brandPlaceholder="Brand — e.g. Sunspel"
                  sizePlaceholder="e.g. M"
                  addLabel="Add a brand"
                />
              </div>
            </div>

            <SaveButton onClick={() => void saveSizes()} busy={savingSizes} saved={flash === 'sizes'} />
          </div>
        </Section>

        {/* ================= 4 · LIFESTYLE CONTEXT ================= */}
        <Section
          title="Lifestyle context"
          value={
            <FactLine
              parts={[
                details.city || life.city,
                climateLabel(details.climate),
                // ONE VOCABULARY (founder's correction, August 2026): the
                // summary reads off the per-register frequencies — the old
                // Daily/Work/Weekend/Travel chips are retired from this
                // section, so the two never disagree again.
                registerFreqShort(loadLocalJson<Record<string, string>>(FREQ_STORE_KEY, {})),
              ]}
              hint="Nothing captured yet — tap Edit."
            />
          }
          editing={isOpen('lifestyle')}
          onToggle={() => toggleSection('lifestyle')}
        >
          <div className="space-y-4">
            <div>
              <p className={statLabelCls}>City / location</p>
              <ClimateCityEditor
                details={details}
                life={life}
                onProfileCity={(nextCity) => void patch('lifestyle', { lifestyle: { ...life, city: nextCity || undefined } })}
                onStored={(fresh) => setDetails(fresh)}
              />
            </div>
            <div>
              <p className={statLabelCls}>Climate</p>
              <div className="flex flex-wrap gap-1.5">
                {CLIMATE_OPTIONS.map((c) => (
                  <Chip
                    key={c.id}
                    active={details.climate === c.id}
                    onClick={() => void patchDetails({ climate: details.climate === c.id ? null : c.id })}
                  >
                    {c.label}
                  </Chip>
                ))}
              </div>
              <p className={`${typography.size.xs} ${typography.color.muted} mt-1 italic`}>
                The coarse fallback when no city is set — it maps to a stock year of the eight bands. A real city
                above always beats it.
              </p>
            </div>
            <div>
              <p className={statLabelCls}>Occasion frequency — by register</p>
              <RegisterPrefs onMirror={(nextMuted) => void patchDetails({ mutedRegisters: nextMuted })} />
            </div>
            {/* THE OLD “OCCASIONS” CHIPS (Daily · Work · Weekend · Travel)
                ARE RETIRED (founder's correction, August 2026): they spoke a
                different vocabulary from the per-register frequencies above
                and the two could disagree. The frequency block is now the one
                place occasions are answered; stored profile.occasions data is
                untouched for anything that still reads it. */}
          </div>
        </Section>

        {/* ================= 5 · STYLE PROFILE =================
            Below Lifestyle context, never above it. The archetypes appear
            HERE ONCE — the same visual chips onboarding uses — and nowhere
            else in the Dossier. */}
        <Section
          title="Style profile"
          value={
            <FactLine
              parts={[
                archetypes.length > 0 ? archetypes.map((id) => label.archetype(id)).join(', ') : '',
                details.styleReferences.length > 0 ? details.styleReferences.join(', ') : '',
              ]}
              hint="No directions picked yet — tap Edit."
            />
          }
          editing={isOpen('style')}
          onToggle={() => toggleSection('style')}
        >
          <div className="space-y-5">
            <div>
              <p className={statLabelCls}>Archetypes — pick as many as feel true, blends are the point</p>
              <div className="flex flex-wrap items-center" style={{ gap: '9px' }} role="group" aria-label="Style archetypes — tap to toggle">
                {ARCHETYPES.map((a) => {
                  const active = archetypes.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => void patch('archetypes', { archetypes: toggleInList(archetypes, a.id) })}
                      aria-pressed={active}
                      className={`uppercase border transition-colors ${
                        active
                          ? 'border-[var(--color-accent,#a8712c)] text-[var(--color-accent-800,#5c3413)]'
                          : 'border-[var(--color-neutral-300,#dccdb2)] text-[var(--color-neutral-700,#634e38)] hover:border-[var(--space-border-strong)] hover:text-[var(--space-text-primary)]'
                      }`}
                      style={{ fontFamily: 'var(--space-font-family)', fontSize: '11px', letterSpacing: '0.12em', borderRadius: '4px', padding: '5px 12px' }}
                    >
                      {a.label}
                    </button>
                  );
                })}
                {saving === 'archetypes' && <Loader2 className="w-4 h-4 animate-spin text-[var(--space-text-muted)]" />}
              </div>
            </div>

            {archetypes.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-[var(--color-divider,rgba(59,43,29,0.18))] border-t border-b border-[var(--color-divider,rgba(59,43,29,0.18))]">
                {archetypes.map((id, i) => (
                  <ArchetypeCell key={id} id={id} primary={i === 0} />
                ))}
                {archetypes.length % 3 !== 0 &&
                  Array.from({ length: 3 - (archetypes.length % 3) }, (_, i) => (
                    <div key={`pad-${i}`} className="hidden sm:block bg-[var(--color-paper,#fbf8f1)]" aria-hidden="true" />
                  ))}
              </div>
            )}

            {/* Style references — the names he GIVES ("Paul Newman", "Steve
                McQueen"). Distinct from Taste references, which are looks he
                has SHARED. */}
            <div>
              <p className={statLabelCls}>Style references</p>
              {details.styleReferences.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {details.styleReferences.map((ref) => (
                    <span
                      key={ref}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[var(--space-border-default)] ${typography.size.xs} ${typography.color.primary}`}
                    >
                      {ref}
                      <button
                        type="button"
                        onClick={() => void patchDetails({ styleReferences: details.styleReferences.filter((r) => r !== ref) })}
                        className="text-[var(--space-text-muted)] hover:text-[var(--space-semantic-danger)]"
                        aria-label={`Remove ${ref} from style references`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2 max-w-md">
                <input
                  type="text"
                  value={referenceDraft}
                  onChange={(e) => setReferenceDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && referenceDraft.trim()) {
                      e.preventDefault();
                      void patchDetails({ styleReferences: [...details.styleReferences, referenceDraft] });
                      setReferenceDraft('');
                    }
                  }}
                  placeholder="e.g. Paul Newman, Steve McQueen"
                  aria-label="Add a style reference"
                  className={`${tw.input.base} ${tw.input.default} ${typography.size.sm} flex-1`}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!referenceDraft.trim()) return;
                    void patchDetails({ styleReferences: [...details.styleReferences, referenceDraft] });
                    setReferenceDraft('');
                  }}
                  disabled={!referenceDraft.trim() || savingDetails}
                  className={`px-3.5 rounded-lg ${typography.size.sm} ${tw.button.secondary} inline-flex items-center gap-1.5 disabled:opacity-50`}
                >
                  {savingDetails ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Add
                </button>
              </div>
              <p className={`${typography.size.xs} ${typography.color.muted} mt-1 italic`}>
                Men whose dressing you’d happily be compared to. Beau reads the register, never copies the outfit.
              </p>
            </div>
          </div>
        </Section>

        {/* ================= 6 · WHAT WORKS FOR YOU =================
            The living brief Beau holds on what suits you — palette
            observations, his read of the frame, the fit notes and the
            taste-reference log. Designed to grow in detail as he learns
            more; everything here is editable. (Skin tone and hair colour
            live in their own section above, never duplicated here.) */}
        <Section
          title="What works for you"
          value={
            <FactLine
              parts={[
                details.paletteNotes,
                p.fit_notes || '',
                tasteCount ? `${tasteCount} taste reference${tasteCount === 1 ? '' : 's'}` : '',
              ]}
              hint="Nothing noted yet — tap Edit. This brief grows as Beau learns what suits you."
            />
          }
          editing={isOpen('works')}
          onToggle={() => toggleSection('works')}
        >
          <div className="space-y-5">
            <div>
              <p className={statLabelCls}>Palette observations</p>
              <textarea
                value={paletteDraft}
                onChange={(e) => setPaletteDraft(e.target.value)}
                placeholder="e.g. Nothing yellow-based. Olive washes me out; charcoal and oatmeal always work."
                rows={3}
                className={`${tw.input.base} ${tw.input.default} ${typography.size.sm} resize-none`}
              />
              <div className="mt-2">
                <SaveButton
                  onClick={() => void patchDetails({ paletteNotes: paletteDraft }).then(() => flashSaved('palette'))}
                  busy={savingDetails}
                  saved={flash === 'palette'}
                  disabled={paletteDraft.trim() === (details.paletteNotes ?? '')}
                  label="Save notes"
                />
              </div>
            </div>
            {p.skin_tone && TONE_GUIDANCE[p.skin_tone] && (
              <div className="border-t border-[var(--space-border-default)] pt-4">
                <span
                  className="block uppercase text-[var(--color-accent-700,#7c4a17)]"
                  style={{ fontFamily: 'var(--space-font-heading)', fontSize: '12px', letterSpacing: '0.14em', marginBottom: '12px' }}
                >
                  Colours that work on you
                </span>
                <span className="block" style={{ fontFamily: 'var(--space-font-family)', fontSize: '15px', lineHeight: 1.6, marginBottom: '14px' }}>
                  {TONE_GUIDANCE[p.skin_tone].line}
                </span>
                <span className="flex items-center gap-[18px] flex-wrap">
                  {TONE_GUIDANCE[p.skin_tone].palette.map((c) => (
                    <span key={c} className="inline-flex items-center gap-[7px]" style={{ fontSize: '13px' }}>
                      <span
                        className="w-4 h-4 rounded-full border border-[var(--space-border-strong)] inline-block"
                        style={{ background: swatchFor(c) }}
                      />
                      <span className={`${typography.color.secondary} capitalize`}>{c}</span>
                    </span>
                  ))}
                </span>
              </div>
            )}
            {/* Beau's read of the frame — grows sharper as the physical
                profile fills in. */}
            {(propBullets.works.length > 0 || propBullets.lookFor.length > 0 || propBullets.avoid.length > 0) && (
              <div className="border-t border-[var(--space-border-default)] pt-4">
                <span
                  className="block uppercase text-[var(--color-accent-700,#7c4a17)]"
                  style={{ fontFamily: 'var(--space-font-heading)', fontSize: '12px', letterSpacing: '0.14em', marginBottom: '14px' }}
                >
                  What suits your frame — the specifics
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-[1px] bg-[var(--color-divider,rgba(59,43,29,0.18))] border-t border-b border-[var(--color-divider,rgba(59,43,29,0.18))]">
                  {[
                    { k: 'Works for you', lines: propBullets.works, muted: false },
                    { k: 'Look for', lines: propBullets.lookFor, muted: false },
                    { k: 'Avoid', lines: propBullets.avoid, muted: true },
                  ].map((cell) => (
                    <span key={cell.k} className="block bg-[var(--color-paper,#fbf8f1)] min-w-0" style={{ padding: '20px 22px 22px' }}>
                      <span
                        className={`block uppercase ${cell.muted ? 'text-[var(--color-neutral-700,#634e38)]' : typography.color.primary}`}
                        style={{ fontFamily: 'var(--space-font-heading)', fontWeight: 500, fontSize: '17px', letterSpacing: '0.1em', marginBottom: '12px' }}
                      >
                        {cell.k}
                      </span>
                      <span className="flex flex-col" style={{ gap: '10px' }}>
                        {(cell.lines.length > 0 ? cell.lines : ['—']).map((line) => (
                          <span
                            key={line}
                            className={cell.muted ? 'text-[var(--color-neutral-700,#634e38)]' : typography.color.primary}
                            style={{ fontFamily: 'var(--space-font-family)', fontSize: '15px', lineHeight: 1.5 }}
                          >
                            {line}
                          </span>
                        ))}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {/* Fit notes — the tailor's shorthand. Beau-draftable. */}
            <div className="border-t border-[var(--space-border-default)] pt-4">
              <p className={statLabelCls}>Fit notes</p>
              <div className="flex gap-2 max-w-xl">
                <input
                  type="text"
                  value={fitNotesDraft}
                  onChange={(e) => {
                    fitNotesDraftDirty.current = true;
                    setFitNotesDraft(e.target.value);
                  }}
                  placeholder="e.g. 40S jackets, 17.5cm leg opening, no break"
                  className={`${tw.input.base} ${tw.input.default} ${typography.size.sm} flex-1`}
                />
                <button
                  type="button"
                  onClick={() => void patch('works', { fit_notes: fitNotesDraft.trim() || null })}
                  className={`px-3.5 rounded-lg ${typography.size.sm} ${tw.button.secondary}`}
                >
                  Save
                </button>
              </div>
              {(heightCm || p.height_range || p.build) && (
                <button
                  type="button"
                  onClick={() =>
                    void (async () => {
                      if (draftingNotes) return;
                      setDraftingNotes(true);
                      try {
                        const notes = await generateFitNotes(p);
                        if (notes) {
                          setFitNotesDraft(notes);
                          await patch('works', { fit_notes: notes });
                        }
                      } finally {
                        setDraftingNotes(false);
                      }
                    })()
                  }
                  disabled={draftingNotes}
                  className={`mt-1.5 inline-flex items-center gap-1.5 ${typography.size.xs} ${typography.color.brand} hover:underline disabled:opacity-50`}
                >
                  {draftingNotes && <Loader2 className="w-3 h-3 animate-spin" />}
                  {p.fit_notes ? 'Have Beau redraft them' : 'Have Beau draft them'}
                </button>
              )}
            </div>
            {/* Taste references — the looks shared with Beau and the signal
                he read in each. Part of the living brief; opens its own
                screen. */}
            <button
              type="button"
              onClick={() => setView('taste-references')}
              className="w-full text-left flex items-center justify-between gap-3 group border-t border-[var(--space-border-default)] pt-4"
            >
              <span className="min-w-0">
                <span className={statLabelCls}>Taste references</span>
                <span className={`block ${typography.size.sm} ${tasteCount ? typography.color.primary : typography.color.muted}`}>
                  {tasteCount == null
                    ? 'Loading…'
                    : tasteCount > 0
                      ? `${tasteCount} look${tasteCount === 1 ? '' : 's'} shared with Beau — tap to see the signals he read.`
                      : 'Share looks you’re drawn to with Beau — he’ll extract what they say about your style.'}
                </span>
              </span>
              <ChevronRight className="w-4 h-4 text-[var(--space-text-muted)] flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </Section>

        {/* ================= 7 · WHAT BEAU DOES FOR YOU =================
            The working agreement. Budget comfort range per piece comes
            FIRST — a signal Beau works with, never a hard ceiling — then
            the rest of the preferences that steer how he hunts. */}
        <Section
          title="What Beau does for you"
          value={
            <FactLine
              parts={[
                BANDS.find((b) => b.id === budgetRange)?.label,
                prefs?.currency || 'GBP',
                p.materials ? label.materials(p.materials) : '',
                prefs?.secondhand ? label.secondhand(prefs.secondhand) : '',
                trustedBrands.length > 0 ? `${trustedBrands.length} trusted brand${trustedBrands.length === 1 ? '' : 's'}` : '',
              ]}
              hint="No comfort range set — tap Edit."
            />
          }
          editing={isOpen('beau')}
          onToggle={() => toggleSection('beau')}
        >
          <div className="space-y-5">
            {/* FIRST — the budget comfort range per piece. */}
            <div>
              <p className={statLabelCls}>Budget comfort range per piece</p>
              <div className="flex flex-wrap gap-1.5">
                {BANDS.map((b) => (
                  <Chip
                    key={b.id}
                    active={budgetRange === b.id}
                    onClick={() => void patch('beau', { budget_range: budgetRange === b.id ? null : b.id })}
                  >
                    {b.label}
                  </Chip>
                ))}
                {saving === 'beau' && <Loader2 className="w-4 h-4 animate-spin text-[var(--space-text-muted)] mt-1" />}
              </div>
              <p className={`${typography.size.xs} ${typography.color.muted} mt-1 italic`}>
                Not a hard ceiling — a signal Beau works with. He still names the piece above it when it’s the right
                answer, and tells you why.
              </p>
            </div>
            <div>
              <p className={statLabelCls}>Currency</p>
              <div className="flex flex-wrap gap-1.5">
                {CURRENCIES.map((c) => (
                  <Chip
                    key={c.id}
                    active={(prefs?.currency || 'GBP') === c.id}
                    onClick={() => void patchPrefs('currency', { currency: c.id })}
                  >
                    {c.symbol.trim()} {c.id}
                  </Chip>
                ))}
                {savingPrefs === 'currency' && <Loader2 className="w-4 h-4 animate-spin text-[var(--space-text-muted)] mt-1" />}
              </div>
              <p className={`${typography.size.xs} ${typography.color.muted} mt-1 italic`}>
                Applies across Beau’s picks and budgets. Conversions are approximate.
              </p>
            </div>
            {/* Per-category budgets — the range can differ by category. */}
            <div className="border-t border-[var(--space-border-default)] pt-4">
              <BudgetFilters budgets={budgets} onSaved={setBudgets} />
            </div>
            {/* The rest of the working preferences — this section grows as
                Beau takes on more for you. */}
            <div className="border-t border-[var(--space-border-default)] pt-4">
              <p className={statLabelCls}>Materials</p>
              {singleChips(MATERIAL_OPTIONS, p.materials, 'materials', 'materials')}
            </div>
            <div>
              <p className={statLabelCls}>Vintage &amp; secondhand</p>
              <div className="flex flex-wrap gap-1.5">
                {SECONDHAND_OPTIONS.map((o) => (
                  <Chip
                    key={o.id}
                    active={prefs?.secondhand === o.id}
                    onClick={() => void patchPrefs('secondhand', { secondhand: o.id })}
                  >
                    {o.label}
                  </Chip>
                ))}
                {savingPrefs === 'secondhand' && <Loader2 className="w-4 h-4 animate-spin text-[var(--space-text-muted)] mt-1" />}
              </div>
              <p className={`${typography.size.xs} ${typography.color.muted} mt-1`}>
                When open, eBay and Vestiaire finds appear in Beau’s picks — always labelled.
              </p>
            </div>
            <div>
              <p className={statLabelCls}>Trusted brands</p>
              <p className={`${typography.size.xs} ${typography.color.muted} mb-2`}>
                Beau checks these makers first when hunting your gaps — he also adds them when you mention a brand you
                love in chat.
              </p>
              {trustedBrands.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {trustedBrands.map((b) => (
                    <span
                      key={b.id}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[var(--space-border-default)] ${typography.size.xs} ${typography.color.primary}`}
                    >
                      {b.brand}
                      <button
                        type="button"
                        onClick={() => void removeTrustedBrand(b.id).then(setTrustedBrands)}
                        className="text-[var(--space-text-muted)] hover:text-[var(--space-semantic-danger)]"
                        aria-label={`Remove ${b.brand} from trusted brands`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2 max-w-md">
                <input
                  type="text"
                  value={brandDraft}
                  onChange={(e) => setBrandDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && brandDraft.trim() && !savingBrand) {
                      setSavingBrand(true);
                      void addTrustedBrand(brandDraft, 'your-style')
                        .then(setTrustedBrands)
                        .finally(() => {
                          setSavingBrand(false);
                          setBrandDraft('');
                        });
                    }
                  }}
                  placeholder="e.g. Barbour, Sunspel, Drake’s"
                  className={`${tw.input.base} ${tw.input.default} ${typography.size.sm} flex-1`}
                  aria-label="Add a trusted brand"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!brandDraft.trim() || savingBrand) return;
                    setSavingBrand(true);
                    void addTrustedBrand(brandDraft, 'your-style')
                      .then(setTrustedBrands)
                      .finally(() => {
                        setSavingBrand(false);
                        setBrandDraft('');
                      });
                  }}
                  disabled={!brandDraft.trim() || savingBrand}
                  className={`px-3.5 rounded-lg ${typography.size.sm} ${tw.button.secondary} inline-flex items-center gap-1.5 disabled:opacity-50`}
                >
                  {savingBrand ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Add
                </button>
              </div>
            </div>
            <div>
              <p className={statLabelCls}>Anything else Beau should know</p>
              <textarea
                value={freeTextDraft}
                onChange={(e) => setFreeTextDraft(e.target.value)}
                placeholder="e.g. I run hot so I avoid heavy layers — and I already own too much navy…"
                rows={4}
                className={`${tw.input.base} ${tw.input.default} ${typography.size.sm} resize-none`}
              />
              <div className="mt-2">
                <SaveButton
                  onClick={() => void patchPrefs('freetext', { free_text: freeTextDraft.trim() || null }).then(() => flashSaved('freetext'))}
                  busy={savingPrefs === 'freetext'}
                  saved={flash === 'freetext'}
                  disabled={freeTextDraft.trim() === (prefs?.free_text ?? '')}
                  label="Save"
                />
              </div>
            </div>
          </div>
        </Section>

        {/* Your Fitting Room photo — the base photo Beau renders try-ons
            onto. Kept below the brief; not one of its sections. */}
        {/* The avatar builder is deleted (design handoff §dead-code) — the
            flat lay replaced the try-on figure. Height, weight and build
            stay above, in “Body — sizes & measurements”. */}

        {/* Reset */}
        <div className={`${tw.card.flat} rounded-2xl p-4 mt-5`}>
          {!confirmingReset ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className={`${typography.size.sm} ${typography.weight.medium} ${typography.color.primary}`}>
                  Retake onboarding
                </p>
                <p className={`${typography.size.xs} ${typography.color.muted} mt-0.5`}>
                  Clears this profile and reruns onboarding.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfirmingReset(true)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg ${typography.size.xs} ${tw.button.ghost} border border-[var(--space-border-default)] flex-shrink-0`}
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reset profile
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className={`${typography.size.sm} ${typography.color.primary}`}>
                Clear everything Beau knows and start over?
              </p>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={doReset}
                  disabled={resetting}
                  className={`px-3.5 py-2 rounded-lg ${typography.size.xs} ${tw.button.danger} flex items-center gap-1.5 disabled:opacity-50`}
                >
                  {resetting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Yes, reset
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingReset(false)}
                  className={`px-3.5 py-2 rounded-lg ${typography.size.xs} ${tw.button.ghost} border border-[var(--space-border-default)]`}
                >
                  Keep it
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Single chat entry point lives in the shell header — no floating duplicate. */}
    </div>
  );
}
