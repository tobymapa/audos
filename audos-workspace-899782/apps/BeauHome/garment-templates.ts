/**
 * Tier 1 canonical garment templates (Pass Twenty-Two) — the "paint dropper"
 * half of the two-tier image pipeline.
 *
 * Solid-colour pieces never go to the AI at all. Instead, every garment
 * sub-category has ONE canonical base image — a clean, professionally-lit
 * neutral LIGHT-GREY garment on a pure white background, generated once by
 * the builder and stored here as a static asset URL. To render a piece:
 *
 *  1. Extract the dominant colour of the founder's own photo of the garment
 *     (canvas sampling of the central 60% of the image, most frequent
 *     non-white / non-background colour), falling back to the piece's named
 *     colour swatch when there is no usable photo.
 *  2. Re-colour the canonical template on a canvas: per-channel gain that
 *     shifts the template's average garment colour to the extracted colour
 *     (a hue/brightness remap equivalent to a normalised multiply blend),
 *     applied ONLY to garment pixels — the white background is masked out
 *     via a border flood-fill so it stays pure white.
 *
 * The output is by construction the SAME template with a different colour:
 * a solid white tee and a solid black tee share the exact same shape, fold,
 * crop and padding — only the colour differs. Patterned / complex pieces and
 * all outerwear skip this module entirely and go through the AI
 * image-to-image path (Tier 2) in photo-enhance.ts.
 */

// ---------------------------------------------------------------------------
// The canonical base images — generated once, reused forever. Do NOT
// regenerate these per piece; the whole point is that every solid-colour
// garment in a sub-category shares this exact silhouette.
// ---------------------------------------------------------------------------

export type TemplateId =
  | 'tee'
  | 'polo'
  | 'shirt'
  | 'knit'
  | 'outerwear'
  | 'trousers'
  | 'shoes'
  | 'accessory';

export const GARMENT_TEMPLATES: Record<TemplateId, string> = {
  // T-shirt — folded flat, face up, front visible.
  tee: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785013659517-xv98dq.png',
  // Polo shirt — folded flat, face up, collar + placket visible.
  polo: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785013692272-w9la9v.png',
  // OCBD / button-down shirt — folded flat, face up, placket centred.
  shirt: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785013738276-d00df0.png',
  // Knitwear / sweater — folded.
  knit: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785013772482-gvwmm3.png',
  // Jacket / outerwear — flat-lay, full garment visible. (Kept per the spec,
  // though outerwear routes to Tier 2 — distinctive detailing must survive.)
  outerwear: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785013854047-sh7uu3.png',
  // Trousers / chinos — folded.
  trousers: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785013821169-qah1pd.png',
  // Shoes — single shoe, side profile.
  shoes: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785013905471-ck0656.png',
  // Accessories — flat lay.
  accessory: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785013938229-w0cz3z.png',
};

/** Prompt-template id (photo-enhance's promptCategoryFor) → canonical base. */
const TEMPLATE_BY_PROMPT_CATEGORY: Record<string, TemplateId> = {
  tee: 'tee',
  base: 'tee',
  polo: 'polo',
  shirt: 'shirt',
  knit: 'knit',
  trousers: 'trousers',
  shoes: 'shoes',
  accessory: 'accessory',
  bag: 'accessory',
  hat: 'accessory',
};

/** The canonical template a prompt category renders through — null when the
 * sub-category has no Tier 1 template (outerwear / formalwear → Tier 2). */
export function templateForPromptCategory(promptCategory: string): string | null {
  const id = TEMPLATE_BY_PROMPT_CATEGORY[promptCategory];
  return id ? GARMENT_TEMPLATES[id] : null;
}

// ---------------------------------------------------------------------------
// Colour plumbing
// ---------------------------------------------------------------------------

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): RGB | null {
  const clean = (hex || '').trim().replace(/^#/, '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image failed to load: ${src.slice(0, 80)}`));
    img.src = src;
  });
}

function lumOf(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function chromaOf(r: number, g: number, b: number): number {
  return (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
}

/**
 * Dominant-colour extraction (Tier 1, step 2 of the spec): load the founder's
 * uploaded photo, sample the CENTRAL 60% of the frame (edges are background
 * by construction), and return the most frequent non-white, non-background
 * colour. Pixels are quantised into 16-level-per-channel bins; the winning
 * bin's true average is returned so the result is a real colour, not a bin
 * centroid. Returns null when nothing but white/background is found.
 */
export async function extractDominantColor(src: string): Promise<RGB | null> {
  const img = await loadImage(src);
  const scale = Math.min(1, 320 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  ctx.drawImage(img, 0, 0, w, h);

  // Central 60% — avoid the edges, which are background/floor/table.
  const x0 = Math.floor(w * 0.2);
  const y0 = Math.floor(h * 0.2);
  const cw = Math.max(1, Math.floor(w * 0.6));
  const ch = Math.max(1, Math.floor(h * 0.6));
  const data = ctx.getImageData(x0, y0, cw, ch).data;

  const bins = new Map<number, { count: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 128) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Skip white / near-white background pixels — a white garment on white is
    // handled by the caller's named-colour fallback, not by sampling glare.
    if (lumOf(r, g, b) > 0.92 && chromaOf(r, g, b) < 0.1) continue;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bin = bins.get(key) || { count: 0, r: 0, g: 0, b: 0 };
    bin.count += 1;
    bin.r += r;
    bin.g += g;
    bin.b += b;
    bins.set(key, bin);
  }

  let best: { count: number; r: number; g: number; b: number } | null = null;
  for (const bin of bins.values()) {
    if (!best || bin.count > best.count) best = bin;
  }
  if (!best || best.count === 0) return null;
  return {
    r: Math.round(best.r / best.count),
    g: Math.round(best.g / best.count),
    b: Math.round(best.b / best.count),
  };
}

// ---------------------------------------------------------------------------
// Template re-colouring
// ---------------------------------------------------------------------------

/**
 * Border flood-fill of the template's white background. The canonical
 * templates are controlled assets: garment is light grey (luminance ≈ 0.8),
 * background is white — a bright, low-chroma flood from the frame border
 * cleanly separates the two. Returns a mask (1 = background pixel).
 */
function templateBackgroundMask(data: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const isBackground = (o: number): boolean =>
    lumOf(data[o], data[o + 1], data[o + 2]) > 0.93 && chromaOf(data[o], data[o + 1], data[o + 2]) < 0.06;
  const mask = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    const i = y * w + x;
    if (mask[i] || !isBackground(i * 4)) return;
    mask[i] = 1;
    stack.push(i);
  };
  for (let x = 0; x < w; x += 1) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y += 1) {
    push(0, y);
    push(w - 1, y);
  }
  while (stack.length > 0) {
    const i = stack.pop() as number;
    const x = i % w;
    const y = (i - x) / w;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  return mask;
}

/**
 * Tier 1, step 3: apply the extracted colour to the canonical base image.
 * Per-channel gain remap: the template's average garment colour is measured,
 * then every garment pixel is scaled so that average lands exactly on the
 * target colour — shading, folds and fabric texture survive because relative
 * luminance within the garment is preserved (a normalised multiply blend).
 * Background pixels are excluded via the flood mask so the white ground is
 * never tinted. Returns a PNG data URL of the recoloured template — same
 * shape, same fold, same crop; only the colour changed.
 */
export async function renderTintedTemplate(templateUrl: string, color: RGB): Promise<string> {
  const img = await loadImage(templateUrl);
  const scale = Math.min(1, 1440 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const frame = ctx.getImageData(0, 0, w, h);
  const data = frame.data;
  const mask = templateBackgroundMask(data, w, h);

  // Average garment colour of the neutral template (non-background pixels).
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let n = 0;
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i]) continue;
    const o = i * 4;
    sumR += data[o];
    sumG += data[o + 1];
    sumB += data[o + 2];
    n += 1;
  }
  if (n < w * h * 0.05) throw new Error('template garment could not be isolated');
  const gainR = color.r / Math.max(1, sumR / n);
  const gainG = color.g / Math.max(1, sumG / n);
  const gainB = color.b / Math.max(1, sumB / n);

  for (let i = 0; i < mask.length; i += 1) {
    const o = i * 4;
    if (mask[i]) {
      // Background: forced pure white so the normalization step never has to
      // fight a tinted ground.
      data[o] = 255;
      data[o + 1] = 255;
      data[o + 2] = 255;
      data[o + 3] = 255;
    } else {
      data[o] = Math.min(255, Math.round(data[o] * gainR));
      data[o + 1] = Math.min(255, Math.round(data[o + 1] * gainG));
      data[o + 2] = Math.min(255, Math.round(data[o + 2] * gainB));
    }
  }
  ctx.putImageData(frame, 0, 0);
  return canvas.toDataURL('image/png');
}
