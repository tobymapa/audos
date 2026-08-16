/**
 * Piece-card typography — the THREE distinct tiers every piece summary card
 * uses, everywhere piece cards appear (Fitting Room rails, Curated picks,
 * Radar rows, wardrobe/Rail cards). One source, so the hierarchy never
 * drifts back into everything-the-same-weight clutter:
 *
 *   1. PIECE NAME — Cormorant, walnut, ~16px. The headline; dominant.
 *   2. BRAND      — Lora, tobacco gold accent, ~13px. Clearly secondary.
 *   3. CATEGORY / FABRIC — Lora, muted warm tone, ~12px. Supporting detail.
 *
 * These are inline-style objects (not classes) so they win over any legacy
 * utility classes still on a card while those are migrated — which also
 * means no stylesheet can raise them on a phone, so tiers 2 and 3 carry the
 * house phone floor themselves: --eth-body / --eth-label are 0px above the
 * breakpoint (Desktop.tsx), so the desktop card keeps 13px and 12px exactly,
 * and a phone reads them at 15.5px and 14px.
 */
import type React from 'react';

/** Tier 1 — the piece name: Cormorant, dominant. The ink is deliberately
 * LIGHTER than a section/category header's walnut (founder's hierarchy fix):
 * shifted roughly half-way toward the paper ground, so piece names read
 * clearly beneath their category headers without competing with them. */
export const pieceNameType: React.CSSProperties = {
  fontFamily: 'var(--space-font-heading)',
  fontSize: '16px',
  fontWeight: 500,
  lineHeight: 1.25,
  color: 'color-mix(in srgb, #241a12 55%, #f6f0e5)',
};

/** Tier 2 — the brand: Lora, tobacco gold, clearly distinct from the name. */
export const pieceBrandType: React.CSSProperties = {
  fontFamily: 'var(--space-font-family)',
  fontSize: 'max(var(--eth-body, 0px), 13px)',
  fontWeight: 400,
  lineHeight: 1.4,
  color: 'var(--color-accent, #a8712c)',
};

/** Tier 3 — category + fabric: Lora, muted warm tone, supporting detail. */
export const pieceMetaType: React.CSSProperties = {
  fontFamily: 'var(--space-font-family)',
  fontSize: 'max(var(--eth-label, 0px), 12px)',
  fontWeight: 400,
  lineHeight: 1.4,
  color: '#9a8a7a',
};
