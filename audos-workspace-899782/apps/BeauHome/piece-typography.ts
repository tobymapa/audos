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
 * utility classes still on a card while those are migrated.
 */
import type React from 'react';

/** Tier 1 — the piece name: Cormorant, walnut, dominant. */
export const pieceNameType: React.CSSProperties = {
  fontFamily: 'var(--space-font-heading)',
  fontSize: '16px',
  fontWeight: 500,
  lineHeight: 1.25,
  color: '#241a12',
};

/** Tier 2 — the brand: Lora, tobacco gold, clearly distinct from the name. */
export const pieceBrandType: React.CSSProperties = {
  fontFamily: 'var(--space-font-family)',
  fontSize: '13px',
  fontWeight: 400,
  lineHeight: 1.4,
  color: 'var(--color-accent, #a8712c)',
};

/** Tier 3 — category + fabric: Lora, muted warm tone, supporting detail. */
export const pieceMetaType: React.CSSProperties = {
  fontFamily: 'var(--space-font-family)',
  fontSize: '12px',
  fontWeight: 400,
  lineHeight: 1.4,
  color: '#9a8a7a',
};
