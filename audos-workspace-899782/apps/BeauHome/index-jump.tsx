/**
 * THE INDEX · THE JUMP (29d · new) — four levels is a long walk for a
 * reader who already knows the word. Opens over any Index screen; ⌘K
 * anywhere in the tab.
 *
 * Grouped by KIND, never merged — types, cuts, makers, each under its own
 * heading with its own count: a single ranked list would put a maker and a
 * coat on adjacent rows as though they were the same sort of thing. Every
 * type row carries its band, so the result is already a judgement.
 *
 * Copy columns: the records searched are FIX; matching, grouping, ordering
 * and the counts are FIT string work; the “did you mean” line on a miss is
 * GEN (G11) — shipped absent, and it abstains when the match was exact.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { BRAND_DIRECTORY } from './brands';
import { INDEX_GARMENT_TYPES, type GarmentType } from './garment-types';
import { categoryName, spanLabel, spanOf } from './index-model';
import { ACCENT_DEEP, FAINT, FAINTER, GenSlot, HAIRLINE, INK, PAPER, RULE, SECONDARY, WALNUT, body, mono, serif, type IndexNav } from './index-chrome';
import { usePlexMono } from './mono-type';

interface JumpHit {
  kind: 'type' | 'cut' | 'maker';
  label: string;
  note: string;
  open: () => void;
}

function matches(text: string, q: string): boolean {
  return text.toLowerCase().includes(q);
}

/** Full text of one type record — name first, then everything the record
 * carries (category, cuts, colours, makers), so “waxed”, “navy” or a maker
 * name all land. Name hits rank ahead of body hits. */
function typeHaystack(t: GarmentType): string {
  return `${t.name} ${categoryName(t.category)} ${t.cuts.join(' ')} ${t.colours.join(' ')} ${t.makers.join(' ')}`.toLowerCase();
}

export function IndexJump({ nav, onClose }: { nav: IndexNav; onClose: () => void }) {
  usePlexMono();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const recordTotal = useMemo(
    () => INDEX_GARMENT_TYPES.length + INDEX_GARMENT_TYPES.reduce((n, t) => n + t.cuts.length, 0) + BRAND_DIRECTORY.length,
    [],
  );

  const q = query.trim().toLowerCase();
  const { types, cuts, makers, flat } = useMemo(() => {
    if (!q) return { types: [] as JumpHit[], cuts: [] as JumpHit[], makers: [] as JumpHit[], flat: [] as JumpHit[] };
    const go = (fn: () => void) => () => {
      onClose();
      fn();
    };
    const types: JumpHit[] = INDEX_GARMENT_TYPES.filter((t) => typeHaystack(t).includes(q))
      .sort((a, b) => Number(matches(b.name, q)) - Number(matches(a.name, q)))
      .slice(0, 6)
      .map((t: GarmentType) => ({ kind: 'type', label: t.name, note: `${categoryName(t.category)} · ${spanLabel(spanOf(t))}`, open: go(() => nav.goType(t.id)) }));
    const cuts: JumpHit[] = [];
    for (const t of INDEX_GARMENT_TYPES) {
      for (const c of t.cuts) {
        if (cuts.length >= 4) break;
        if (matches(c, q) || matches(`${c} ${t.name}`, q)) cuts.push({ kind: 'cut', label: c, note: `a cut of ${t.name}`, open: go(() => nav.goCut(t.id, c)) });
      }
    }
    const makers: JumpHit[] = BRAND_DIRECTORY.filter(
      (b) =>
        matches(b.brand, q) ||
        matches(b.referenceFor || '', q) ||
        matches(b.city || '', q) ||
        matches(b.country || '', q) ||
        b.signaturePieces.some((s) => matches(s, q)),
    )
      .sort((a, b) => Number(matches(b.brand, q)) - Number(matches(a.brand, q)))
      .slice(0, 4)
      .map((b) => ({ kind: 'maker', label: b.brand, note: b.referenceFor ? `reference for the ${b.referenceFor.toLowerCase()}` : b.country, open: go(() => nav.goMaker(b.brand)) }));
    return { types, cuts, makers, flat: [...types, ...cuts, ...makers] };
  }, [q, nav, onClose]);

  useEffect(() => setCursor(0), [q]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(flat.length - 1, c + 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    }
    if (e.key === 'Enter' && flat[cursor]) flat[cursor].open();
  };

  const Group = ({ title, hits, offset }: { title: string; hits: JumpHit[]; offset: number }) =>
    hits.length === 0 ? null : (
      <div style={{ padding: '10px 0 2px' }}>
        <div style={{ ...mono(8, FAINT), padding: '0 18px 6px' }}>
          {title} {hits.length}
        </div>
        {hits.map((hit, i) => {
          const active = offset + i === cursor;
          return (
            <button
              key={`${hit.kind}-${hit.label}-${i}`}
              type="button"
              onClick={hit.open}
              onMouseEnter={() => setCursor(offset + i)}
              className="block w-full text-left"
              style={{ background: active ? 'rgba(168,113,44,0.10)' : 'transparent', padding: '8px 18px', borderLeft: active ? `2px solid ${ACCENT_DEEP}` : '2px solid transparent' }}
            >
              <span style={serif(15.5)}>{hit.label}</span>
              <span style={{ ...mono(8, FAINT), marginLeft: '12px' }}>{hit.note}</span>
            </button>
          );
        })}
      </div>
    );

  return (
    <div
      role="dialog"
      aria-label="Search the Index"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(36,26,18,0.45)', zIndex: 90, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '9vh 16px 16px' }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(620px, 100%)', background: PAPER, border: `1px solid ${RULE}`, boxShadow: '0 18px 60px rgba(36,26,18,0.35)' }}>
        <div className="flex items-center" style={{ gap: '14px', padding: '13px 18px', borderBottom: `1px solid ${HAIRLINE}` }}>
          <span style={mono(8.5, FAINT)}>Find</span>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="a type, a cut, a maker"
            aria-label="Search the Index"
            className="w-full bg-transparent focus:outline-none placeholder:text-[#856c51]"
            style={{ fontFamily: 'var(--space-font-family)', fontSize: '15px', color: INK }}
          />
          <span style={{ ...mono(8, FAINTER), whiteSpace: 'nowrap' }}>{q ? `${flat.length} of ${recordTotal} records` : `${recordTotal} records`}</span>
        </div>

        {q ? (
          <div style={{ maxHeight: '54vh', overflowY: 'auto' }}>
            <Group title="Types" hits={types} offset={0} />
            <Group title="Cuts" hits={cuts} offset={types.length} />
            <Group title="Makers" hits={makers} offset={types.length + cuts.length} />
            {flat.length === 0 && (
              <div style={{ padding: '18px' }}>
                <p style={{ ...body(13.5, SECONDARY), margin: 0 }}>
                  Nothing in the Index answers “{query.trim()}” — nothing has been removed from the taxonomy, only from
                  view.
                </p>
                {/* GEN · G11 — what the reader probably meant; ships absent,
                    and abstains whenever the match was exact. */}
                <GenSlot slot="G11" scope={`jump:${query.trim()}`} />
              </div>
            )}
          </div>
        ) : (
          <div style={{ padding: '16px 18px' }}>
            <p style={{ ...body(13, SECONDARY), margin: 0 }}>Types, cuts and makers, each under its own heading — never in one column.</p>
          </div>
        )}

        <div className="flex items-center justify-between" style={{ padding: '10px 18px', borderTop: `1px solid ${HAIRLINE}` }}>
          <span style={mono(7.5, FAINTER)}>↑↓ to move · ⏎ to open · esc to close</span>
          <button type="button" onClick={() => { onClose(); nav.goRoot(); }} className="hover:underline" style={{ ...mono(8, ACCENT_DEEP), background: 'transparent', padding: 0 }}>
            Browse the eleven categories instead →
          </button>
        </div>
      </div>
    </div>
  );
}
