/**
 * Shared structured inputs (Pass Twelve, tightened in Pass Thirteen).
 *
 *  - BrandField: the ONE brand input everywhere. It formats to ALL CAPS as
 *    the user TYPES ("uniqlo" reads "UNIQLO" immediately — no way to enter
 *    mixed casing), then validates the spelling in two stages:
 *      1. Instant local check against Beau's known-brand list (exact match
 *         passes silently; a near-miss surfaces ONE "Did you mean GRENFELL?"
 *         prompt to confirm or reject).
 *      2. AI validation for anything the local list doesn't recognise: the
 *         name is checked against a menswear-brand model — a likely typo of a
 *         real brand surfaces the same "Did you mean …?" prompt; a clean
 *         unfamiliar name is accepted exactly as typed (in CAPS). Results are
 *         cached so the same input is never re-checked.
 *    Never blocked, never silently changed — and never savable in mixed case
 *    (saves also run through formatBrandName in profile-data as the backstop).
 *
 *  - SizeSelector: the structured, type-first size picker. The user chooses a
 *    size TYPE (Letter / Numeric EU / Numeric UK-US / Shoe EU / Shoe UK), then
 *    the value within it — no free-text size entry anywhere. Legacy free-text
 *    sizes still display and can be replaced through the selector.
 */
import { useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { tw, typography } from '../../lib/colors';
import {
  COLOR_OPTIONS,
  MATERIAL_CHOICES,
  MAX_PIECE_COLORS,
  PATTERN_OPTIONS,
  SIZE_TYPES,
  checkBrandSpelling,
  composeSize,
  formatColorName,
  parseSize,
  swatchFor,
} from './profile-data';

// ---------------------------------------------------------------------------
// AI brand validation (Pass Thirteen) — second stage after the local list
// ---------------------------------------------------------------------------

interface AiBrandCheck {
  verdict: 'ok' | 'typo';
  correct: string | null;
}

const AI_BRAND_CACHE_PREFIX = 'brummell_brand_ai_';
const aiBrandMemory = new Map<string, AiBrandCheck>();

function brandCacheKey(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, ' ');
}

/**
 * Ask the model whether a brand the local list doesn't know looks like a
 * misspelling of a real clothing brand. Cached (memory + localStorage);
 * returns { verdict: 'ok' } on any failure so input is never blocked.
 */
async function checkBrandWithAI(raw: string): Promise<AiBrandCheck> {
  const key = brandCacheKey(raw);
  if (aiBrandMemory.has(key)) return aiBrandMemory.get(key) as AiBrandCheck;
  try {
    const cached = localStorage.getItem(AI_BRAND_CACHE_PREFIX + key);
    if (cached) {
      const parsed = JSON.parse(cached) as AiBrandCheck;
      if (parsed && (parsed.verdict === 'ok' || parsed.verdict === 'typo')) {
        aiBrandMemory.set(key, parsed);
        return parsed;
      }
    }
  } catch { /* storage unavailable */ }

  let result: AiBrandCheck = { verdict: 'ok', correct: null };
  try {
    const res = await fetch('/proxy/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You validate clothing-brand names typed into a menswear wardrobe app. Given the typed name, return STRICT JSON: {"verdict": "ok" | "typo", "correct": string | null}. Use "typo" ONLY when the input is clearly a misspelling of a REAL clothing/footwear/menswear brand (e.g. "RALF LAUREN" \u2192 "RALPH LAUREN", "UNIQLOO" \u2192 "UNIQLO", "BARBER" is NOT a typo of BARBOUR \u2014 too ambiguous); then "correct" is the brand\u2019s proper name in ALL CAPS. If the input already IS a real brand spelled correctly (any casing or punctuation), or you do not confidently recognise it as a typo of one, return {"verdict": "ok", "correct": null}. Never invent a correction. JSON only.',
          },
          { role: 'user', content: raw.trim() },
        ],
        max_tokens: 60,
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      const parsed = typeof content === 'string' ? JSON.parse(content) : null;
      if (parsed?.verdict === 'typo' && typeof parsed.correct === 'string' && parsed.correct.trim()) {
        result = { verdict: 'typo', correct: parsed.correct.trim().toUpperCase() };
      }
    }
  } catch (e) {
    console.warn('[Ethaion] AI brand check unavailable \u2014 accepting the name as typed:', e);
  }
  aiBrandMemory.set(key, result);
  try {
    localStorage.setItem(AI_BRAND_CACHE_PREFIX + key, JSON.stringify(result));
  } catch { /* storage unavailable */ }
  return result;
}

// ---------------------------------------------------------------------------
// BrandField
// ---------------------------------------------------------------------------

export function BrandField({
  value,
  onChange,
  placeholder = 'Optional — e.g. BARBOUR',
  inputClassName = '',
  ariaLabel = 'Brand',
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  inputClassName?: string;
  ariaLabel?: string;
}) {
  const [suggestion, setSuggestion] = useState<string | null>(null);
  // Suggestions the user explicitly rejected ("No, keep mine") — keyed by the
  // typed value so the same prompt never re-appears for the same input.
  const dismissed = useRef<Set<string>>(new Set());
  const timer = useRef<number | null>(null);
  // Guards stale async AI results: only the check for the CURRENT value lands.
  const checkSeq = useRef(0);

  const runCheck = (raw: string) => {
    const seq = ++checkSeq.current;
    const trimmed = raw.trim();
    if (!trimmed || dismissed.current.has(trimmed.toLowerCase())) {
      setSuggestion(null);
      return;
    }
    const check = checkBrandSpelling(trimmed);
    if (check.status === 'suggestion' && check.suggestion && check.suggestion !== trimmed.toUpperCase()) {
      setSuggestion(check.suggestion);
      return;
    }
    setSuggestion(null);
    // Stage 2 (Pass Thirteen): the local list doesn't know it — ask the AI
    // whether it's a typo of a real brand. Cached, non-blocking, never wrong
    // by force: an unrecognised clean name passes as typed.
    if (check.status === 'unknown' && trimmed.length >= 4) {
      void checkBrandWithAI(trimmed).then((ai) => {
        if (seq !== checkSeq.current) return; // value changed since
        if (dismissed.current.has(trimmed.toLowerCase())) return;
        if (ai.verdict === 'typo' && ai.correct && ai.correct !== trimmed.toUpperCase()) {
          setSuggestion(ai.correct);
        }
      });
    }
  };

  // Debounced check while typing, plus an immediate check on blur.
  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => runCheck(value), 700);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [value]);

  return (
    <div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        onBlur={() => runCheck(value)}
        placeholder={placeholder}
        className={inputClassName || `${tw.input.base} ${tw.input.default} ${typography.size.sm} uppercase`}
        aria-label={ariaLabel}
        autoCapitalize="characters"
        spellCheck={false}
      />
      {suggestion && (
        <div className="mt-1.5 rounded-lg bg-[var(--space-surface-accent-soft)] px-2.5 py-1.5 flex items-center gap-1.5 flex-wrap">
          <span className={`${typography.size.xs} ${typography.color.secondary}`}>
            Did you mean <span className={`${typography.weight.semibold} ${typography.color.primary}`}>{suggestion}</span>?
          </span>
          <button
            type="button"
            onClick={() => {
              onChange(suggestion);
              setSuggestion(null);
            }}
            className={`px-2 py-0.5 rounded-lg ${typography.size.xs} ${tw.button.primary} inline-flex items-center gap-1`}
          >
            <Check className="w-3 h-3" /> Yes, use {suggestion}
          </button>
          <button
            type="button"
            onClick={() => {
              dismissed.current.add(value.trim().toLowerCase());
              setSuggestion(null);
            }}
            className={`px-2 py-0.5 rounded-lg ${typography.size.xs} ${tw.button.ghost} border border-[var(--space-border-default)] inline-flex items-center gap-1`}
          >
            <X className="w-3 h-3" /> No — keep “{value.trim()}”
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SizeSelector
// ---------------------------------------------------------------------------

export function SizeSelector({
  value,
  onChange,
  ariaLabel = 'Size',
}: {
  /** The stored size string, e.g. 'M', '32', 'EU 48', 'UK 9' — '' when unset. */
  value: string;
  onChange: (next: string) => void;
  ariaLabel?: string;
}) {
  const parsed = parseSize(value);
  const [typeId, setTypeId] = useState<string>(parsed?.typeId || '');

  // When the stored value changes from outside (a fresh row loads), re-derive
  // the selected type — but never fight the user's own in-flight type choice.
  useEffect(() => {
    const p = parseSize(value);
    if (p) setTypeId(p.typeId);
  }, [value]);

  const type = SIZE_TYPES.find((s) => s.id === typeId) || null;
  const selectedValue = parsed && parsed.typeId === typeId ? parsed.value : '';
  const selectCls = `${tw.input.base} ${tw.input.default} ${typography.size.sm}`;

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-2 gap-1.5">
        <select
          value={typeId}
          onChange={(e) => {
            const nextType = e.target.value;
            setTypeId(nextType);
            // Changing type clears the value until one is picked within it.
            if (!nextType) onChange('');
          }}
          className={selectCls}
          aria-label={`${ariaLabel} — sizing type`}
        >
          <option value="">Size type…</option>
          {SIZE_TYPES.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
        <select
          value={selectedValue}
          onChange={(e) => onChange(e.target.value ? composeSize(typeId, e.target.value) : '')}
          disabled={!type}
          className={`${selectCls} disabled:opacity-50`}
          aria-label={`${ariaLabel} — value`}
        >
          <option value="">{type ? 'Pick a size…' : 'Pick a type first'}</option>
          {(type?.values || []).map((v) => (
            <option key={v} value={v}>{composeSize(typeId, v)}</option>
          ))}
        </select>
      </div>
      {value.trim() && !parsed && (
        <p className={`${typography.size.xs} ${typography.color.muted}`} style={{ fontSize: 'max(var(--eth-micro, 0px), 10px)' }}>
          Currently “{value.trim()}” — pick a type and value above to replace it.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ColorSelector (Pass Fourteen) — the ONE way colours are entered anywhere.
// Tap to select/deselect from the structured palette; max 3 per piece; each
// selection shows as a labelled chip with its swatch. No typing, ever.
// ---------------------------------------------------------------------------

export function ColorSelector({
  value,
  onChange,
  max = MAX_PIECE_COLORS,
  ariaLabel = 'Colours',
}: {
  /** Selected colour names (lowercase palette ids or legacy values). */
  value: string[];
  onChange: (next: string[]) => void;
  /** Maximum selections — 3 for pieces, 1 for single-colour fields. */
  max?: number;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = value.map((c) => c.toLowerCase().trim()).filter(Boolean);
  // Legacy free-typed values that aren't palette entries still display (and
  // can be deselected) — they just can't be re-entered.
  const legacy = selected.filter((c) => !COLOR_OPTIONS.includes(c));

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((c) => c !== id));
      return;
    }
    if (selected.length >= max) {
      // At the cap, a new tap replaces the LAST selection (primary stays put).
      onChange(max <= 1 ? [id] : [...selected.slice(0, max - 1), id]);
      return;
    }
    onChange([...selected, id]);
  };

  const chip = (id: string, isLegacy = false) => {
    const active = selected.includes(id);
    return (
      <button
        key={id}
        type="button"
        onClick={() => toggle(id)}
        aria-pressed={active}
        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border transition-colors ${typography.size.xs} ${
          active
            ? 'bg-[var(--space-surface-accent-soft)] border-[var(--space-brand-primary)] text-[var(--space-text-brand)] font-medium'
            : 'border-[var(--space-border-default)] text-[var(--space-text-secondary)] hover:border-[var(--space-border-strong)]'
        }`}
        style={{ fontSize: 'max(var(--eth-label, 0px), 11px)' }}
        title={active ? `Remove ${formatColorName(id)}` : `Select ${formatColorName(id)}`}
      >
        <span
          className="w-3.5 h-3.5 rounded-full border border-[var(--space-border-strong)] inline-block flex-shrink-0"
          style={{ background: swatchFor(id) }}
        />
        {formatColorName(id)}{isLegacy ? ' · legacy' : ''}
        {active && <Check className="w-3 h-3" />}
      </button>
    );
  };

  return (
    <div aria-label={ariaLabel}>
      {/* Selected chips — always visible; first selection is the primary colour */}
      <div className="flex flex-wrap items-center gap-1.5">
        {selected.length > 0 ? (
          selected.map((c) => chip(c, legacy.includes(c)))
        ) : (
          <span className={`${typography.size.xs} ${typography.color.muted}`}>No colour selected yet</span>
        )}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`px-2 py-1 rounded-full border border-dashed border-[var(--space-border-strong)] ${typography.size.xs} ${typography.color.muted} hover:text-[var(--space-text-primary)] transition-colors`}
          style={{ fontSize: 'max(var(--eth-label, 0px), 11px)' }}
          aria-expanded={open}
        >
          {open ? 'Done' : selected.length > 0 ? 'Change…' : 'Pick colours…'}
        </button>
      </div>
      {open && (
        <div className="mt-2 rounded-xl border border-[var(--space-border-default)] bg-[var(--space-surface-card)] p-2.5">
          <p className={`${typography.size.xs} ${typography.color.muted} mb-1.5`} style={{ fontSize: 'max(var(--eth-micro, 0px), 10px)' }}>
            Tap to select{max > 1 ? ` — up to ${max}; the first is the primary colour` : ''}.
          </p>
          <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto">
            {COLOR_OPTIONS.map((id) => chip(id))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PatternSelector (Pass Fourteen) — separate from colour, tap-to-select only.
// ---------------------------------------------------------------------------

export function PatternSelector({
  value,
  onChange,
  ariaLabel = 'Pattern',
}: {
  /** Selected pattern id ('' when unset). */
  value: string;
  onChange: (next: string) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={ariaLabel}>
      {PATTERN_OPTIONS.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(active ? '' : o.id)}
            aria-pressed={active}
            className={`px-2 py-1 rounded-full border transition-colors ${typography.size.xs} ${
              active
                ? 'bg-[var(--space-surface-accent-soft)] text-[var(--space-brand-primary-700)] border-[var(--space-brand-primary)]'
                : 'border-[var(--space-border-default)] text-[var(--space-text-secondary)] hover:border-[var(--space-border-strong)]'
            }`}
            style={{ fontSize: 'max(var(--eth-label, 0px), 11px)' }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MaterialSelector (Pass Fourteen) — the controlled material list. A legacy
// free-typed value (e.g. "Cotton oxford") still displays as an extra option
// until replaced; no new free text can be entered.
// ---------------------------------------------------------------------------

export function MaterialSelector({
  value,
  onChange,
  ariaLabel = 'Material',
}: {
  value: string;
  onChange: (next: string) => void;
  ariaLabel?: string;
}) {
  const trimmed = value.trim();
  const isLegacy = !!trimmed && !MATERIAL_CHOICES.includes(trimmed);
  return (
    <select
      value={trimmed}
      onChange={(e) => onChange(e.target.value)}
      className={`${tw.input.base} ${tw.input.default} ${typography.size.sm}`}
      aria-label={ariaLabel}
    >
      <option value="">Material…</option>
      {isLegacy && <option value={trimmed}>{trimmed} (as logged)</option>}
      {MATERIAL_CHOICES.map((m) => (
        <option key={m} value={m}>{m}</option>
      ))}
    </select>
  );
}
