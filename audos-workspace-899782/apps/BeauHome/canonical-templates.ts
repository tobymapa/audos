/**
 * Tier 1 canonical garment templates (Pass Twenty-Two).
 *
 * ONE canonical base image per garment sub-category: a clean, professional
 * catalogue shot of a NEUTRAL medium-grey garment on a pure white background,
 * generated once by the builder and stored here as static app assets
 * (durable platform-CDN URLs — never regenerated at runtime).
 *
 * Solid-colour pieces (Tier 1 of the two-tier pipeline in photo-enhance.ts)
 * are rendered by recolouring the matching template with the piece's own
 * dominant colour — extracted from the founder's uploaded photo via canvas,
 * falling back to the piece's named colour swatch. Because the garment shape
 * IS the template, every solid tee (or OCBD, or trouser…) shares an identical
 * silhouette, fold, crop and padding by construction — only the colour
 * differs.
 *
 * The neutral garments are deliberately MID-GREY (not white): the Tier 1
 * recolour is a luminance-preserving multiply, so a mid-grey base keeps the
 * fabric shading legible whether the target colour is white, navy or black.
 */

export const CANONICAL_TEMPLATES: Record<string, string> = {
  /** T-shirt — folded flat, face up, front visible. */
  tee: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785013583515-qj7j0i.png',
  /** Polo shirt — folded flat, face up, collar and placket visible. */
  polo: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785013619579-imrhjm.png',
  /** OCBD / button-down shirt — folded flat, face up, collar folded down. */
  shirt: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785013668949-kc364a.png',
  /** Knitwear / sweater — folded. */
  knit: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785013701349-3wiwff.png',
  /** Jacket / outerwear — flat-lay, full garment visible. (Kept for
   * completeness; outerwear is routed Tier 2 by tierForPiece, always.) */
  outerwear: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785013781534-97psey.png',
  /** Trousers / chinos — folded. */
  trousers: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785013746986-iee7p9.png',
  /** Shoes — single shoe, side profile. */
  shoes: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785013824406-pakbrk.png',
  /** Accessories — soft textile flat lay. */
  accessory: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785013855402-1lgs4f.png',
};

/**
 * The canonical template for a prompt-category id (photo-enhance.ts
 * promptCategoryFor). Null when the sub-category has no meaningful shared
 * silhouette (bags, hats) — those pieces always render through Tier 2.
 */
export function templateFor(promptCategory: string): string | null {
  const map: Record<string, string> = {
    tee: 'tee',
    base: 'tee',
    polo: 'polo',
    shirt: 'shirt',
    knit: 'knit',
    trousers: 'trousers',
    outerwear: 'outerwear',
    formalwear: 'outerwear',
    shoes: 'shoes',
    accessory: 'accessory',
  };
  const key = map[promptCategory];
  return key ? CANONICAL_TEMPLATES[key] || null : null;
}
