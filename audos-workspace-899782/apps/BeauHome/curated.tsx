/**
 * THE RAIL — TWO-TIER NAVIGATION (Beau intelligence overhaul).
 *
 * TIER 1 (the entry view): the ten wardrobe categories in the app's ONE
 * canonical menswear order (category-order.ts) — Tops → Knitwear →
 * Outerwear → Bottoms → Formalwear → Base layers → Shoes → Accessories →
 * Bags → Hats/Headwear — each holding
 * ILLUSTRATED sub-category cards in the house drawing language — Oxford
 * Shirt (ONE card for the whole Oxford-cloth family: button-down/OCBD and
 * spread/tab-collar variants alike — never a separate OCBD card), Polo,
 * Turtleneck, T-shirt under Tops; Chinos, Dress Trousers, Jeans, Shorts
 * under Bottoms; and so on (rail-subcategories.ts). The illustrations are
 * NAVIGATION ONLY — visual cues to find what you want. At the END of each
 * category's card row sits a plain-text "Other [Category] →" entry (never
 * an illustrated card) that unfolds a simple text list of the less-common
 * sub-types — Monk Strap, Peacoat, Waxed Jacket, Gilet… — each landing on
 * the same Tier 2 recommendations page an illustrated card does, so
 * nothing is hidden and nothing clutters the main view.
 *
 * ICON COLOUR (Recommendation Engine overhaul, Part 2): the sub-category
 * drawings are PLAIN — no colour when owned, no greyscale fade when not.
 * The owned/gap colouring is parked behind ONE flag
 * (COLOUR_PIECE_ICONS_WHEN_OWNED in illustrations.tsx). The Coverage Map's
 * sage tick is a category-level indicator and is untouched by that rule.
 *
 * TIER 2 (tap a sub-category): the product recommendations screen — the
 * sub-category name in Cormorant walnut over a tobacco-gold hairline, then
 * 3–5 Beau-curated SPECIFIC pieces. Each card shows a REAL product
 * photograph (web-resolved; a clean walnut-bordered paper rectangle when
 * none can be loaded — NEVER an illustration), the piece name, the maker,
 * the price, one or two lines of Beau's justification, and TWO actions and
 * no more: a filled primary that names its destination ("View at Drake's")
 * and opens that piece's own page at the source — never a homepage — and a
 * quiet "Find it cheaper" beside it that sweeps the marketplaces for the
 * same piece and unfolds the real listings under the card.
 * Live engine picks (beau-picks-ai.ts) lead each page; Beau's standing
 * seeds top it up so EVERY sub-category always has recommendations.
 *
 * GAP LINKING: a gap tapped in The Edit (coverage map, Complete the Look,
 * archetype essentials) lands DIRECTLY on the right sub-category's Tier 2
 * page — Tier 1 is bypassed; a chip names the handoff and ‹ The Rail goes
 * back up.
 *
 * A third layer is preserved from before: "Spec sheet & live picks ›" on a
 * product card opens the tailor's spec card + a live market hunt
 * (PickHuntPage) with Save, try-on and the outfit builder.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ExternalLink,
  Layers,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { tw, typography } from '../../lib/colors';
import { pieceBrandType, pieceMetaType, pieceNameType } from './piece-typography';
import {
  goToTab,
  logBrand,
  type CategoryBudget,
  type StylePrefs,
  type StyleProfile,
  type WardrobePiece,
} from './profile-data';
import { getBeauPicks, type BeauPicksResult, type BeauRecommendation } from './beau-picks-ai';
import {
  RAIL_CATEGORIES,
  railCategoryForGap,
  railCategoryForPick,
} from './rail-catalogue';
import { ProductPhoto } from './product-photo';
import { resolveProductPage } from './product-images';
import { useProgressiveReveal } from './progressive-list';
import { FindCheaperAction } from './find-cheaper';
import {
  otherSubcategoriesFor,
  retailLinksFor,
  seedsForSubcategory,
  subcategoriesFor,
  subcategoryForPick,
  subcategoryForText,
  type RailSubcategory,
  type RetailLink,
  type SubSeedPick,
} from './rail-subcategories';
import { runScoutRequest, type FindRecommendation } from './scout-ai';
import { addToCompare, setHuntSubTabHandoff } from './brands';
import { TicketFrame } from './ticket-frame';
import { PickCardsSkeleton } from './skeleton';
import { Illo, pieceIlloProps } from './illustrations';
import { railIllustration } from './illustration-assets';
import { ProductImage } from './og-image';
import { OutfitBuilderSheet, type OutfitCandidate } from './outfit-builder';
import { TryOnButton } from './tryon';
import { SubTabs } from './sub-tabs';
import { WorldOfMenswear } from './world-of-menswear';

// window.__workspaceDb is auto-injected by the platform compiler when it sees
// this literal token in app source (used to bookmark picks into the Saved tab).
function db(): any {
  return (window as any).__workspaceDb;
}

// ---------------------------------------------------------------------------
// Gap pre-filter — The Edit's coverage map hands a gap over via
// sessionStorage + event; The Rail opens the matching sub-category's Tier 2
// page directly (Tier 1 bypassed).
// ---------------------------------------------------------------------------

const RAIL_FILTER_KEY = 'ethaion_rail_prefilter';

export interface RailPrefilter {
  /** Canonical category row or free-text gap, e.g. "Outerwear" or "wax jacket or tweed". */
  category: string;
  /** Register id ("casual" | "smart-casual" | "formal") or null. */
  register: string | null;
}

function readRailPrefilter(): RailPrefilter | null {
  try {
    const raw = sessionStorage.getItem(RAIL_FILTER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.category !== 'string' || !parsed.category) return null;
    return { category: parsed.category, register: typeof parsed.register === 'string' && parsed.register ? parsed.register : null };
  } catch {
    return null;
  }
}

function clearRailPrefilter(): void {
  try {
    sessionStorage.removeItem(RAIL_FILTER_KEY);
  } catch { /* storage unavailable */ }
}

const normalizeRegister = (r: string): string => r.trim().toLowerCase().replace(/\s+/g, '-');

const registerDisplay = (r: string): string =>
  normalizeRegister(r) === 'smart-casual' ? 'Smart-Casual' : normalizeRegister(r) === 'formal' ? 'Formal' : 'Casual';

/** The sub-category a handed-over gap lands on: keyword match on the gap's
 * own words first, then the LEAD sub-category of its rail category — so
 * every gap opens Tier 2 directly on real recommendations. */
function subcategoryForGap(gap: RailPrefilter): RailSubcategory | null {
  const matched = subcategoryForText(gap.category);
  if (matched) return matched;
  const categoryId = railCategoryForGap(gap.category);
  if (!categoryId) return null;
  const siblings = subcategoriesFor(categoryId);
  return siblings.length > 0 ? siblings[0] : null;
}

// ---------------------------------------------------------------------------
// Saving a pick — it lands in Saved (discovery_log), the pipeline's
// "bookmarked, not sure yet" stage: The Rail → Saved → The Reserve →
// The Ledger.
// ---------------------------------------------------------------------------

async function savePickToSavedTab(pick: {
  name: string;
  brand: string | null;
  category: string | null;
  price: string | null;
  link: string | null;
  note: string | null;
}): Promise<void> {
  await db().from('discovery_log').insert({
    name: pick.name,
    brand: pick.brand,
    category: pick.category,
    source_type: 'curated',
    source_url: pick.link,
    image_url: null,
    price: pick.price,
    description: pick.note,
    notes: null,
    status: null,
    tags: JSON.stringify([]),
  });
  if (pick.brand) {
    logBrand({ brand: pick.brand, source: 'curated', item_name: pick.name, category: pick.category, url: pick.link });
  }
}

// ---------------------------------------------------------------------------
// Product photography is the shared ProductPhoto block (product-photo.tsx):
// the REAL product's image, web-resolved from the brand's own site or a
// quality retailer, shown at its NATIVE resolution and tapping straight
// through to the source product page. It floats on the shelf's own paper —
// no border, no mat, no shadow, nothing painted behind it — and when nothing
// resolves the 4:5 space simply stays empty so the grid holds its shape.
// Never an illustration, never an unrelated stock photograph.
// ---------------------------------------------------------------------------

/** The retailer whose page the card's primary action opens — the maker when
 * the piece is theirs, otherwise the first real retail link we hold. Used to
 * name the button ("View at Drake's") so the destination is never a guess. */
function primaryDestination(product: SubProduct, officialUrl: string): string {
  if (officialUrl && product.brand) return product.brand;
  const first = product.links[0];
  if (first?.retailer) return first.retailer;
  return product.brand || '';
}

// ---------------------------------------------------------------------------
// TIER 1 — the illustrated sub-category navigation.
// ---------------------------------------------------------------------------

/** Short names for the "Other [Category] →" rows — "Other Trousers &
 * bottoms" reads clumsy; these keep the row label tight. */
const OTHER_ROW_LABELS: Record<string, string> = {
  tops: 'Tops',
  bottoms: 'Bottoms',
  shoes: 'Shoes',
  outerwear: 'Outerwear',
  knitwear: 'Knitwear',
  sweatshirts: 'Sweatshirts',
  formalwear: 'Formalwear',
  'base-layers': 'Base Layers',
  accessories: 'Accessories',
  bags: 'Bags',
  hats: 'Headwear',
};

/** One Tier 1 sub-category card. The drawing is a PLAIN illustration — no
 * colour treatment, no greyscale fade (Recommendation Engine overhaul,
 * Part 2). `pieceIlloProps()` is the one switch that would put the
 * owned/gap colouring back.
 *
 * Sub-categories with their own generated ligne claire plate
 * (illustration-assets.ts) draw it instead of the shared slot SVG — that is
 * how Chelsea Boot and Desert Boot, or Waistcoat and Suit, stopped being the
 * same picture. Anything without one keeps the coded drawing. */
function SubcategoryCard({ sub, onOpen }: { sub: RailSubcategory; onOpen: () => void }) {
  const artwork = railIllustration(sub.id);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="min-w-0 text-left group flex flex-col self-start"
      aria-label={`${sub.label} — see Beau's recommendations`}
      title={`See Beau's ${sub.label.toLowerCase()} recommendations`}
    >
      <span className="block w-full aspect-[4/5] bg-[#eadfcb] overflow-hidden flex items-center justify-center border border-transparent group-hover:border-[var(--color-accent,#a8712c)] transition-colors box-border">
        <Illo
          id={sub.slotId}
          {...pieceIlloProps()}
          title={sub.label}
          showLabel={false}
          src={artwork}
          blendWithGround={!!artwork}
          className={artwork ? 'w-[88%] h-[88%]' : 'w-[68%] h-[68%]'}
        />
      </span>
      {/* CONSISTENT HEADING SLOT: the label area reserves two lines whether
          the name wraps ("Crew Neck Jumper") or not ("V-Neck"), so every
          card in a row is the same height and the plates + "Beau's picks ›"
          lines stay vertically aligned — on mobile's 3-up grid especially. */}
      <span
        className={`block ${typography.color.primary} group-hover:underline`}
        style={{ fontFamily: 'var(--space-font-heading)', fontWeight: 400, fontSize: '17px', lineHeight: 1.25, marginTop: '9px', minHeight: '43px' }}
      >
        {sub.label}
      </span>
      <span
        className="block text-[var(--color-neutral-600,#856c51)]"
        style={{ fontFamily: 'var(--space-font-family)', fontSize: '11.5px', lineHeight: 1.4, marginTop: '2px' }}
      >
        Beau’s picks ›
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// TIER 2 — the product recommendations screen for one sub-category.
// ---------------------------------------------------------------------------

/** One Tier 2 product — a live engine pick or one of Beau's standing seeds,
 * both promoted to a full recommendation so the spec sheet, the live hunt
 * and Save all work identically. */
interface SubProduct {
  key: string;
  rec: BeauRecommendation;
  name: string;
  brand: string;
  price: string;
  note: string;
  links: RetailLink[];
  live: boolean;
}

function seedToRecommendation(seed: SubSeedPick, sub: RailSubcategory): BeauRecommendation {
  return {
    pieceName: seed.name,
    category: sub.label,
    subType: sub.label,
    whyNow: seed.note,
    archetypesServed: [],
    qualitySignals: '',
    exampleBrand: seed.brand,
    constructionMethod: '',
    material: '',
    origin: '',
    register: '',
    typicalPrice: seed.price,
    colorwayNote: '',
    slotId: sub.slotId,
    categoryId: sub.categoryId,
  };
}

function ProductRecCard({
  product,
  saved,
  saving,
  onSave,
  onSpecSheet,
}: {
  product: SubProduct;
  saved: boolean;
  saving: boolean;
  onSave: () => void;
  onSpecSheet: () => void;
}) {
  // THE OFFICIAL PRODUCT PAGE (Rail cards, Part 6): the card's primary action
  // must land on THIS piece's page on the maker's own site — or on a quality
  // retailer when the maker does not sell direct — never the homepage and
  // never a search results page. The image resolver already reads the page
  // each candidate photograph came from, so this is the same cached lookup
  // rather than a second round of searching. Until it settles (and if it
  // finds nothing) the card's existing buy link stands in.
  const [officialUrl, setOfficialUrl] = useState('');
  useEffect(() => {
    let live = true;
    setOfficialUrl('');
    void resolveProductPage({ brand: product.brand, name: product.name })
      .then((url) => {
        if (live && url) setOfficialUrl(url);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [product.brand, product.name]);

  const fallbackUrl = product.links.length > 0 ? product.links[0].url : '';
  const productPageUrl = officialUrl || fallbackUrl;
  const label = `${product.brand} ${product.name}`.trim();
  const destination = primaryDestination(product, officialUrl);

  return (
    <div className="min-w-0 flex flex-col">
      {/* The photograph taps straight through to the product page it came
          from — the same page the primary action below opens. */}
      <ProductPhoto
        brand={product.brand}
        name={product.name}
        href={productPageUrl || null}
        className="w-full"
        renderWidth={280}
        category={product.rec.categoryId || null}
      />
      {productPageUrl ? (
        <a
          href={productPageUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={`block ${typography.color.primary} hover:underline`}
          style={{ fontFamily: 'var(--space-font-heading)', fontWeight: 500, fontSize: '19px', lineHeight: 1.2, marginTop: '11px' }}
          title={`${label} — open the product page`}
        >
          {product.name}
        </a>
      ) : (
        <span
          className={`block ${typography.color.primary}`}
          style={{ fontFamily: 'var(--space-font-heading)', fontWeight: 500, fontSize: '19px', lineHeight: 1.2, marginTop: '11px' }}
        >
          {product.name}
        </span>
      )}
      <span className="flex items-baseline gap-2 flex-wrap" style={{ marginTop: '4px' }}>
        {product.brand && (
          <span className="text-[var(--color-accent-700,#7c4a17)]" style={{ fontFamily: 'var(--space-font-family)', fontSize: '12.5px' }}>
            {product.brand}
          </span>
        )}
        {product.price && (
          <span className="text-[var(--color-neutral-600,#856c51)] tabular-nums" style={{ fontFamily: 'var(--space-font-family)', fontSize: '12.5px' }}>
            {product.price}
          </span>
        )}
        {product.live && (
          <span className="uppercase text-[var(--color-accent-700,#7c4a17)]" style={{ fontFamily: 'var(--space-font-heading)', fontSize: '10px', letterSpacing: '0.14em' }}>
            From Beau’s live read
          </span>
        )}
      </span>
      {product.note && (
        <span
          className="block text-[var(--color-neutral-800,#453325)]"
          style={{ fontFamily: 'var(--space-font-family)', fontSize: '13.5px', lineHeight: 1.55, marginTop: '8px' }}
        >
          {product.note}
        </span>
      )}
      <span className="flex-1" />
      {/* TWO ACTIONS, ONE HIERARCHY (Rail cards, Part 3). The card used to
          carry three presentations of the same job at once — a filled primary
          link, a row of italicised "View on eBay / Grailed" links under the
          photograph, and a bordered "Find something cheaper" button. The raw
          marketplace links are gone: one FILLED primary that names where it
          lands, and one quiet secondary that puts Beau on the hunt. */}
      <div className="flex items-center gap-2.5 flex-wrap" style={{ marginTop: '10px' }}>
        {/* PRIMARY — this piece's own page at the source, named. */}
        {productPageUrl && (
          <a
            href={productPageUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="px-3.5 min-h-[40px] inline-flex items-center gap-1.5 text-[13px] transition-opacity hover:opacity-90"
            style={{ borderRadius: 0, background: '#241a12', color: '#f6f0e5', border: '1px solid #241a12' }}
            title={`${label} — open the product page`}
          >
            {destination ? `View at ${destination}` : 'Official page'}
            <span aria-hidden="true" style={{ fontSize: '11px', lineHeight: 1 }}>↗</span>
          </a>
        )}
        {/* SECONDARY — the same specific piece, hunted across the secondhand
            and multi-brand marketplaces. Hairline border, no fill: it must
            never compete with the primary. Results unfold inline below. */}
        <FindCheaperAction brand={product.brand} name={product.name} />
        <button
          type="button"
          onClick={onSpecSheet}
          className="min-h-[40px] inline-flex items-center text-[13px] text-[var(--color-accent-700,#7c4a17)] hover:underline transition-colors"
        >
          Spec sheet &amp; live picks
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || saved}
          className="min-h-[40px] inline-flex items-center gap-1.5 text-[13px] text-[var(--color-neutral-700,#634e38)] hover:text-[var(--color-accent-700,#7c4a17)] hover:underline transition-colors disabled:opacity-70"
        >
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {saved ? 'Saved' : 'Save for later'}
        </button>
      </div>
    </div>
  );
}

function SubcategoryPage({
  sub,
  livePicks,
  prefilter,
  onClearPrefilter,
  onBack,
  onSwitchSub,
  onOpenPick,
  savedKeys,
  savingKey,
  onSave,
}: {
  sub: RailSubcategory;
  livePicks: BeauRecommendation[];
  prefilter: RailPrefilter | null;
  onClearPrefilter: () => void;
  onBack: () => void;
  onSwitchSub: (next: RailSubcategory) => void;
  onOpenPick: (rec: BeauRecommendation) => void;
  savedKeys: Set<string>;
  savingKey: string | null;
  onSave: (product: SubProduct) => void;
}) {
  const category = RAIL_CATEGORIES.find((c) => c.id === sub.categoryId) || null;
  // Lateral chips: the category's illustrated sub-categories — plus THIS
  // sub-category when it was opened from the "Other …" text list.
  const mainSiblings = subcategoriesFor(sub.categoryId);
  const siblings = mainSiblings.some((s) => s.id === sub.id) ? mainSiblings : [...mainSiblings, sub];

  // 3–5 products: live engine picks filed to THIS sub-category lead; Beau's
  // standing seeds top the page up so it is never thin.
  const products = useMemo(() => {
    const list: SubProduct[] = [];
    const taken = new Set<string>();
    livePicks.forEach((rec, index) => {
      const railCat = railCategoryForPick(rec);
      const matched = subcategoryForPick(rec, railCat);
      if (!matched || matched.id !== sub.id) return;
      taken.add(rec.pieceName.trim().toLowerCase());
      list.push({
        key: `live-${sub.id}-${index}`,
        rec,
        name: rec.pieceName,
        brand: rec.exampleBrand,
        price: rec.typicalPrice || (category ? category.typicalPrice : ''),
        note: rec.whyNow,
        links: retailLinksFor(rec.exampleBrand, rec.subType || rec.pieceName),
        live: true,
      });
    });
    for (const seed of seedsForSubcategory(sub.id)) {
      if (list.length >= 5) break;
      if (taken.has(seed.name.trim().toLowerCase())) continue;
      list.push({
        key: `seed-${sub.id}-${seed.name}`,
        rec: seedToRecommendation(seed, sub),
        name: seed.name,
        brand: seed.brand,
        price: seed.price,
        note: seed.note,
        links: retailLinksFor(seed.brand, seed.name),
        live: false,
      });
    }
    return list.slice(0, 5);
  }, [livePicks, sub, category]);

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className={`inline-flex items-center gap-1.5 ${typography.size.xs} ${typography.color.brand} hover:underline`}
      >
        <ArrowLeft className="w-3.5 h-3.5" /> The Rail
      </button>

      {/* Gap handoff chip — this page was opened straight from The Edit. */}
      {prefilter && (
        <div
          className="flex items-center gap-3 flex-wrap mt-4 px-3 py-2"
          style={{ border: '1px dashed var(--color-divider,rgba(59,43,29,0.4))' }}
        >
          <span className={typography.color.primary} style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px' }}>
            Straight to the gap you tapped in The Edit:{' '}
            <span style={{ fontFamily: 'var(--space-font-heading)', letterSpacing: '0.06em' }}>
              {prefilter.category}
              {prefilter.register ? ` · ${registerDisplay(prefilter.register)}` : ''}
            </span>
          </span>
          <button
            type="button"
            onClick={onClearPrefilter}
            className="hover:underline"
            style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px', color: 'var(--color-accent,#a8712c)' }}
          >
            Dismiss ×
          </button>
        </div>
      )}

      {/* Section header — the sub-category name in Cormorant walnut over a
          tobacco-gold hairline (Part 1.2). */}
      <div className="mt-6" style={{ borderBottom: '1px solid var(--color-accent,#a8712c)', paddingBottom: '10px' }}>
        {category && (
          <p className="uppercase text-[var(--color-neutral-600,#856c51)]" style={{ fontFamily: 'var(--space-font-heading)', fontSize: '11px', letterSpacing: '0.16em', marginBottom: '5px' }}>
            {category.label}
          </p>
        )}
        <h3 className={typography.color.primary} style={{ fontFamily: 'var(--space-font-heading)', fontWeight: 400, fontSize: '32px', lineHeight: 1.1 }}>
          {sub.label}
        </h3>
        <p
          className="text-[var(--color-neutral-700,#634e38)]"
          style={{ fontFamily: 'var(--space-font-family)', fontSize: '13.5px', lineHeight: 1.55, marginTop: '5px', maxWidth: '62ch' }}
        >
          Beau’s picks for this rail — specific pieces, real photographs, honest prices, and where to actually buy
          them.
        </p>
      </div>

      {/* Sibling sub-categories — lateral movement without going back up. */}
      {siblings.length > 1 && (
        <div className="flex items-center gap-1.5 mt-4 flex-wrap" role="group" aria-label={`Other ${category ? category.label.toLowerCase() : ''} sub-categories`}>
          {siblings.map((s) => {
            const active = s.id === sub.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  if (!active) onSwitchSub(s);
                }}
                aria-pressed={active}
                className="inline-flex items-center justify-center transition-colors"
                style={{
                  fontFamily: 'var(--space-font-family)',
                  fontSize: '12.5px',
                  lineHeight: 1,
                  borderRadius: 0,
                  padding: '0 12px',
                  height: '32px',
                  whiteSpace: 'nowrap',
                  background: active ? '#241a12' : 'var(--color-paper,#fbf8f1)',
                  color: active ? '#fbf8f1' : 'var(--color-text,#3b2b1d)',
                  border: active ? '1px solid #241a12' : '1px solid var(--color-divider,rgba(59,43,29,0.35))',
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      )}

      {/* The recommendations — 3–5 product cards. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-9 mt-7">
        {products.map((product) => (
          <ProductRecCard
            key={product.key}
            product={product}
            saved={savedKeys.has(product.key)}
            saving={savingKey === product.key}
            onSave={() => onSave(product)}
            onSpecSheet={() => onOpenPick(product.rec)}
          />
        ))}
      </div>

      <p className={`${typography.size.xs} ${typography.color.muted} mt-8`} style={{ fontSize: '10px' }}>
        Beau’s live read of your wardrobe leads this page; his standing classics hold it open where the live pass
        has not spoken. Every buy link is a real product page or a tightly filtered retailer search — never a brand
        homepage. “Spec sheet &amp; live picks” opens the tailor’s spec card and a fresh market hunt for that exact
        piece, with Save, virtual try-on, and the outfit builder.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The SPEC SHEET — a tailor's spec card for the opened recommendation:
// item name, maker, construction table, colourway analysis and acquisition
// options, in the corner-bracket ticket-frame language.
// ---------------------------------------------------------------------------

function SpecTableRow({ term, detail }: { term: string; detail: string }) {
  return (
    <tr>
      <th
        scope="row"
        className="text-left uppercase text-[var(--color-neutral-600,#856c51)]"
        style={{ fontFamily: 'var(--space-font-heading)', fontSize: '11px', letterSpacing: '0.12em', fontWeight: 400, padding: '9px 14px 9px 0', verticalAlign: 'top', borderTop: '1px solid var(--color-divider,rgba(59,43,29,0.18))', whiteSpace: 'nowrap' }}
      >
        {term}
      </th>
      <td
        className={typography.color.primary}
        style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', lineHeight: 1.55, padding: '9px 0', verticalAlign: 'top', borderTop: '1px solid var(--color-divider,rgba(59,43,29,0.18))' }}
      >
        {detail}
      </td>
    </tr>
  );
}

function SpecSheet({ pick }: { pick: BeauRecommendation }) {
  const buyLinks = retailLinksFor(pick.exampleBrand, pick.subType || pick.pieceName);
  const colorway =
    pick.colorwayNote ||
    'Take the warm colourway when two are offered — olive, camel, tan, burgundy and rust sit naturally against a warm, light-brown complexion; cool greys and icy pastels flatten it.';
  return (
    <TicketFrame className="mt-4" padding="22px">
      <p
        className="uppercase text-[var(--color-neutral-600,#856c51)]"
        style={{ fontFamily: 'var(--space-font-heading)', fontSize: '11px', letterSpacing: '0.16em', marginBottom: '6px' }}
      >
        Spec sheet
      </p>
      <h3 className={typography.color.primary} style={{ fontFamily: 'var(--space-font-heading)', fontWeight: 500, fontSize: '27px', lineHeight: 1.15 }}>
        {pick.pieceName}
      </h3>
      {pick.exampleBrand && (
        <p className="text-[var(--color-accent-700,#7c4a17)]" style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', fontStyle: 'italic', marginTop: '4px' }}>
          Maker: {pick.exampleBrand}
        </p>
      )}

      {/* Construction table — hairline rows, spec-card register. */}
      <table className="w-full border-collapse mt-4" style={{ borderBottom: '1px solid var(--color-divider,rgba(59,43,29,0.18))' }}>
        <tbody>
          <SpecTableRow term="Construction" detail={pick.constructionMethod || pick.qualitySignals || '—'} />
          <SpecTableRow term="Material / fabric" detail={pick.material || '—'} />
          <SpecTableRow term="Origin" detail={pick.origin || '—'} />
          <SpecTableRow term="Register" detail={pick.register ? registerDisplay(pick.register) : '—'} />
        </tbody>
      </table>

      {/* Colourway analysis — why this colour works on YOUR skin tone. */}
      <p
        className="text-[var(--color-neutral-800,#453325)] mt-4"
        style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', lineHeight: 1.6, maxWidth: '58ch', paddingLeft: '16px', borderLeft: '2px solid var(--color-accent,#a8712c)' }}
      >
        <em
          className="block uppercase not-italic text-[var(--color-accent-700,#7c4a17)]"
          style={{ fontFamily: 'var(--space-font-heading)', fontSize: '12px', letterSpacing: '0.12em', marginBottom: '5px' }}
        >
          Colourway
        </em>
        {colorway}
      </p>

      {/* Acquisition options — direct buy links + the Compare handoff. */}
      <div className="flex items-center gap-5 flex-wrap mt-5">
        {buyLinks.map((link) => (
          <a
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:underline"
            style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px', color: 'var(--color-accent,#a8712c)' }}
          >
            {link.kind === 'view' ? `View on ${link.retailer}` : `Buy at ${link.retailer}`} <ExternalLink className="w-3 h-3" />
          </a>
        ))}
        {/* Compare makers — pre-loads this maker into The Hunt's Compare
            sub-tab (Brand Intelligence overhaul, Part 5). */}
        {pick.exampleBrand && (
          <button
            type="button"
            onClick={() => {
              addToCompare(pick.exampleBrand);
              setHuntSubTabHandoff('compare');
              goToTab('scout');
            }}
            className="inline-flex items-center gap-1 hover:underline"
            style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px', color: 'var(--color-accent,#a8712c)' }}
            title="Line this maker up against others in The Hunt's Compare"
          >
            Compare makers ›
          </button>
        )}
      </div>
    </TicketFrame>
  );
}

// ---------------------------------------------------------------------------
// Layer 3 — the spec sheet above a live market hunt for the opened
// recommendation: 2–4 real products with links, Save into the Saved tab,
// try-on, the outfit builder, Refresh, back nav.
// ---------------------------------------------------------------------------

interface AiPick {
  key: string;
  name: string;
  brand: string;
  price: string;
  link: string;
  note: string;
  secondhand?: string;
}

function SavePickButton({ saved, saving, onSave }: { saved: boolean; saving: boolean; onSave: () => void }) {
  return (
    <button
      type="button"
      onClick={onSave}
      disabled={saved || saving}
      className={`px-3 py-1.5 min-h-[44px] sm:min-h-0 rounded-lg ${typography.size.xs} inline-flex items-center gap-1.5 transition-colors ${
        saved
          ? 'bg-[var(--space-surface-accent-soft)] text-[var(--space-text-brand)] border border-[var(--space-brand-primary-200)]'
          : `${tw.button.primary}`
      } disabled:opacity-80`}
      title={saved ? 'Bookmarked — it\u2019s waiting in Saved (the row at the top of this tab)' : 'Bookmark this pick into Saved'}
    >
      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <Check className="w-3.5 h-3.5" /> : null}
      {saved ? 'Saved' : 'Save'}
    </button>
  );
}

function AiPickCard({
  pick,
  saved,
  saving,
  onSave,
  onBuild,
}: {
  pick: AiPick;
  saved: boolean;
  saving: boolean;
  onSave: () => void;
  /** Open the outfit builder seeded with this find. */
  onBuild: () => void;
}) {
  const pickUrl = pick.link ? (pick.link.startsWith('http') ? pick.link : `https://${pick.link}`) : null;
  return (
    /* NO CARD AROUND THE PRODUCT (the shelf rule, applied here too): no fill,
       no border, no radius and no shadow — the photograph and its three lines
       of type float on the page's own paper, the way they do on The Rail's
       recommendation cards and on the Fitting's shelf. */
    <div className="min-w-0 flex flex-col">
      {/* The product photo from the linked page (og:image); the fallback is
          the clean neutral placeholder — never an illustration. */}
      <ProductImage
        url={pickUrl}
        alt={`${pick.brand} ${pick.name}`.trim()}
        fallback={
          <span
            className="block w-full h-full"
            aria-hidden="true"
            style={{ background: 'var(--color-paper,#fbf8f1)', border: '1px solid var(--color-text,#3b2b1d)', boxSizing: 'border-box' }}
          />
        }
        className="mb-2.5"
      />
      <div className="min-w-0">
        {/* Three-tier piece typography: name · brand · detail. */}
        <p style={pieceNameType}>
          {pick.name}
          {pick.price ? (
            <span style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px', fontWeight: 400, color: 'var(--space-text-secondary)' }}>
              {' '}· {pick.price}
            </span>
          ) : null}
        </p>
        {pick.brand && <p style={{ ...pieceBrandType, marginTop: '2px' }}>{pick.brand}</p>}
        {pick.secondhand && (
          <p className="mt-0.5" style={{ ...pieceMetaType, fontSize: '10px' }}>{pick.secondhand}</p>
        )}
      </div>
      {pick.note && <p className={`${typography.size.xs} ${typography.color.secondary} mt-2 leading-relaxed`}>{pick.note}</p>}
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <SavePickButton saved={saved} saving={saving} onSave={onSave} />
        <button
          type="button"
          onClick={onBuild}
          className={`px-3 py-1.5 min-h-[44px] sm:min-h-0 rounded-lg ${typography.size.xs} ${tw.button.secondary} inline-flex items-center gap-1.5`}
          title="Combine it with pieces you own — Beau checks the pairing works before you buy"
        >
          <Layers className="w-3.5 h-3.5" /> Build an outfit with this
        </button>
        {/* Virtual try-on — see yourself in it before you buy (lib/tryon). */}
        <TryOnButton
          piece={{
            name: pick.name,
            brand: pick.brand || null,
            note: pick.note || null,
            productUrl: pickUrl,
            ctaLabel: pick.brand ? `Buy at ${pick.brand}` : 'Buy the piece',
            ctaUrl: pickUrl,
          }}
        />
        {pickUrl && (
          <a
            href={pickUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`${typography.size.xs} ${typography.color.brand} inline-flex items-center gap-1 hover:underline`}
          >
            Buy {pick.brand ? `at ${pick.brand}` : ''} <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </div>
  );
}

function PickHuntPage({
  pick,
  profile,
  budgets,
  pieces,
  prefs,
  onBack,
  backLabel,
}: {
  pick: BeauRecommendation;
  profile: StyleProfile;
  budgets: Record<string, CategoryBudget>;
  pieces: WardrobePiece[];
  prefs: StylePrefs | null;
  onBack: () => void;
  backLabel: string;
}) {
  const [aiPicks, setAiPicks] = useState<AiPick[] | null>(null);
  const [hunting, setHunting] = useState(false);
  const [phase, setPhase] = useState('');
  const [huntError, setHuntError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [builderSeed, setBuilderSeed] = useState<OutfitCandidate | null>(null);

  // The live hunt — Beau searches the market for THIS piece, briefed with
  // the sub-type and the quality signals from his own recommendation.
  useEffect(() => {
    let cancelled = false;
    setHunting(true);
    setHuntError(null);
    setPhase('Beau is hunting the market\u2026');
    const brief = [pick.pieceName, pick.subType && pick.subType !== pick.pieceName ? `(${pick.subType})` : '', '— classic menswear, best current buys.', pick.qualitySignals ? `Look for: ${pick.qualitySignals}` : '', attempt > 0 ? `Fresh angle ${attempt}.` : ''].filter(Boolean).join(' ');
    void runScoutRequest({
      mode: 'find',
      query: brief,
      linkUrl: null,
      photoUrl: null,
      profile,
      budgets,
      pieces,
      prefs,
      onPhase: (p) => {
        if (!cancelled) setPhase(p);
      },
    })
      .then((outcome) => {
        if (cancelled) return;
        if (outcome.result.kind === 'find' && outcome.result.recommendations.length > 0) {
          setAiPicks(
            outcome.result.recommendations.map((rec: FindRecommendation, i: number) => ({
              key: `ai-${attempt}-${i}`,
              name: rec.name,
              brand: rec.brand,
              price: rec.price,
              link: rec.link,
              note: rec.whyForYou,
              secondhand: rec.secondhand,
            })),
          );
        } else {
          setHuntError('Beau couldn\u2019t find anything that clears the bar just now — try Refresh in a moment.');
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setHuntError(e instanceof Error ? e.message : 'Beau couldn\u2019t reach the market just now — try again in a moment.');
      })
      .finally(() => {
        if (!cancelled) {
          setHunting(false);
          setPhase('');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, pick.pieceName]); // a new pick or an explicit refresh re-runs the hunt

  const candidateFromAiPick = (p: AiPick): OutfitCandidate => ({
    key: p.key,
    name: p.name,
    brand: p.brand || null,
    productUrl: p.link ? (p.link.startsWith('http') ? p.link : `https://${p.link}`) : null,
    slot: pick.slotId || null,
    category: pick.categoryId || null,
    source: 'curated',
  });

  const save = async (key: string, entry: { name: string; brand: string | null; price: string | null; link: string | null; note: string | null }) => {
    if (savedKeys.has(key) || savingKey) return;
    setSavingKey(key);
    try {
      await savePickToSavedTab({ ...entry, category: pick.categoryId || null });
      setSavedKeys((cur) => new Set(cur).add(key));
    } catch (e) {
      console.error('[Ethaion] saving a curated pick failed:', e);
    } finally {
      setSavingKey(null);
    }
  };

  const savedCount = savedKeys.size;

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className={`inline-flex items-center gap-1.5 ${typography.size.xs} ${typography.color.brand} hover:underline`}
      >
        <ArrowLeft className="w-3.5 h-3.5" /> {backLabel}
      </button>

      {/* THE SPEC SHEET — the tailor's spec card for this recommendation. */}
      <SpecSheet pick={pick} />

      {/* Beau's reasoning, restated under the sheet. */}
      <div className="mt-4">
        {pick.archetypesServed.length > 0 && (
          <p className="text-[var(--color-accent-700,#7c4a17)]" style={{ fontFamily: 'var(--space-font-family)', fontSize: '12px', fontStyle: 'italic', lineHeight: 1.5 }}>
            Serves your {pick.archetypesServed.join(' and ')} side{pick.archetypesServed.length > 1 ? 's' : ''}
          </p>
        )}
        {pick.whyNow && <p className={`${typography.size.xs} ${typography.color.secondary} mt-1 leading-relaxed`} style={{ maxWidth: '62ch' }}>{pick.whyNow}</p>}
      </div>

      <div className="flex items-center justify-between gap-2 mt-4 flex-wrap">
        <p className={`${typography.size.xs} uppercase tracking-[0.18em] ${typography.weight.medium} ${typography.color.secondary}`}>
          Beau’s picks from a live hunt
        </p>
        <button
          type="button"
          onClick={() => setAttempt((a) => a + 1)}
          disabled={hunting}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] sm:min-h-0 rounded-full ${typography.size.xs} border border-[var(--space-border-default)] text-[var(--space-text-secondary)] hover:border-[var(--space-border-strong)] hover:text-[var(--space-text-primary)] transition-colors disabled:opacity-60`}
          title="Pull fresh suggestions for this piece"
        >
          {hunting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {hunting ? phase || 'Hunting\u2026' : 'Refresh picks'}
        </button>
      </div>

      {huntError && !hunting && <p className={`${typography.size.xs} text-[var(--space-semantic-warning)] mt-2`}>{huntError}</p>}

      {/* While Beau hunts the market the incoming picks show as shimmer card
          ghosts — never a blank area. */}
      {hunting && (
        <div className="mt-4">
          <PickCardsSkeleton cards={4} />
        </div>
      )}

      {!hunting && aiPicks && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          {aiPicks.map((p) => (
            <AiPickCard
              key={p.key}
              pick={p}
              saved={savedKeys.has(p.key)}
              saving={savingKey === p.key}
              onSave={() => void save(p.key, { name: p.name, brand: p.brand || null, price: p.price || null, link: p.link || null, note: p.note || null })}
              onBuild={() => setBuilderSeed(candidateFromAiPick(p))}
            />
          ))}
        </div>
      )}

      <p className={`${typography.size.xs} ${typography.color.muted} mt-4`} style={{ fontSize: '10px' }}>
        Save parks a pick in Saved (the card at the top of this tab) — the “bookmarked, not sure yet” stage. From there you can move it to
        The Reserve when you’re serious, or mark it purchased when it’s yours. “Build an outfit with this” checks a pick against
        what you already own before you commit.
        {savedCount > 0 ? ` ${savedCount} pick${savedCount === 1 ? '' : 's'} saved this visit.` : ''}
      </p>

      {/* The outfit builder — slides up over the picks page */}
      {builderSeed && (
        <OutfitBuilderSheet
          seed={builderSeed}
          pieces={pieces}
          curated={(aiPicks || []).map(candidateFromAiPick)}
          onClose={() => setBuilderSeed(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The Rail's two SUB-TABS (Rail overhaul, Part 1) — directly below the
// "The Rail" page header:
//   · "For You" — the original gap-driven personal rail (Tier 1 -> Tier 2 ->
//     spec sheet), unchanged in content and logic.
//   · "World of Menswear" — the full reference taxonomy of classic
//     menswear (world-of-menswear.tsx).
// Styling comes from the SHARED sub-tab component (sub-tabs.tsx), so these
// are pixel-identical to The Hunt's sub-tabs; both style variants live in
// that file behind a one-line switch.
// ---------------------------------------------------------------------------

type RailView = 'for-you' | 'world';

const RAIL_SUB_TABS: Array<{ id: RailView; label: string }> = [
  { id: 'for-you', label: 'For You' },
  { id: 'world', label: 'World of Menswear' },
];

function RailSubTabs({ view, onChange }: { view: RailView; onChange: (v: RailView) => void }) {
  return (
    /* The same hairline baseline The Hunt's sub-tab row sits on. */
    <div className="border-b border-[var(--color-divider,rgba(59,43,29,0.18))]" style={{ marginBottom: '20px' }}>
      <SubTabs items={RAIL_SUB_TABS} active={view} onChange={onChange} ariaLabel="Rail views" className="py-3" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The Rail tab root — the two-tier state machine: Tier 1 (illustrated
// sub-category navigation) → Tier 2 (product recommendations for one
// sub-category) → the spec sheet + live hunt for one recommendation.
// ---------------------------------------------------------------------------

export function CuratedTab({
  profile,
  budgets,
  pieces,
  prefs,
  onBudgetsSaved,
}: {
  profile: StyleProfile;
  budgets: Record<string, CategoryBudget>;
  pieces: WardrobePiece[];
  prefs: StylePrefs | null;
  onBudgetsSaved: (budgets: Record<string, CategoryBudget>) => void;
}) {
  void onBudgetsSaved; // budgets are edited from Your Style; kept for prop compatibility

  const [result, setResult] = useState<BeauPicksResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState('Beau is reading your wardrobe\u2026');
  const [error, setError] = useState<string | null>(null);
  // The two-tier navigation state: which sub-category is open (Tier 2), and
  // which recommendation is open on top of it (the spec-sheet layer).
  const [openSub, setOpenSub] = useState<RailSubcategory | null>(() => {
    const gap = readRailPrefilter();
    return gap ? subcategoryForGap(gap) : null;
  });
  const [openPick, setOpenPick] = useState<BeauRecommendation | null>(null);
  // Which sub-tab of The Rail is showing: "For You" (the gap-driven personal
  // rail — the original view, unchanged) or "World of Menswear" (the full
  // reference taxonomy). Rail overhaul, Part 1.
  const [railView, setRailView] = useState<RailView>('for-you');
  // Which category's "Other …" text list is unfolded on Tier 1.
  const [otherOpenFor, setOtherOpenFor] = useState<string | null>(null);
  // TIER 1's PROGRESSIVE REVEAL (progressive-list.ts) — the rail's category
  // sections render a few at a time as they are scrolled to, in the standard
  // menswear order. The order and the contents are untouched; only how many
  // are BUILT on arrival changes.
  const {
    count: categoryCount,
    sentinelRef: categorySentinelRef,
    done: categoriesDone,
  } = useProgressiveReveal(RAIL_CATEGORIES.length, { initial: 3, step: 3, resetKey: 'rail-tier-1' });
  const visibleCategories = useMemo(() => RAIL_CATEGORIES.slice(0, categoryCount), [categoryCount]);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [savingKey, setSavingKey] = useState<string | null>(null);
  // The gap tapped in The Edit — Tier 2 opens on it DIRECTLY (Tier 1
  // bypassed); the chip on that page names the handoff.
  const [prefilter, setPrefilter] = useState<RailPrefilter | null>(() => readRailPrefilter());
  const refreshSeq = useRef(0);

  // A gap tapped while The Rail is already mounted re-targets it live.
  useEffect(() => {
    const onPrefilter = (e: Event) => {
      const detail = (e as CustomEvent).detail as { category?: string; register?: string | null } | undefined;
      if (detail?.category) {
        const gap: RailPrefilter = { category: detail.category, register: detail.register || null };
        setPrefilter(gap);
        setOpenPick(null);
        setRailView('for-you'); // gap handoffs always land on the personal rail
        setOpenSub(subcategoryForGap(gap));
      }
    };
    window.addEventListener('ethaion:rail-prefilter', onPrefilter);
    return () => window.removeEventListener('ethaion:rail-prefilter', onPrefilter);
  }, []);

  const clearFilter = () => {
    setPrefilter(null);
    clearRailPrefilter();
  };

  const load = (forceRefresh: boolean) => {
    const seq = ++refreshSeq.current;
    setLoading(true);
    setError(null);
    void getBeauPicks({ profile, pieces, prefs, forceRefresh, onPhase: (p) => {
      if (seq === refreshSeq.current) setPhase(p);
    } })
      .then((res) => {
        if (seq !== refreshSeq.current) return;
        setResult(res);
        setOpenPick(null);
      })
      .catch((e: unknown) => {
        if (seq !== refreshSeq.current) return;
        setError(e instanceof Error ? e.message : 'Beau couldn\u2019t reach his desk just now — try again in a moment.');
      })
      .finally(() => {
        if (seq === refreshSeq.current) setLoading(false);
      });
  };

  // The engine call — cached, so this only reaches the model when the
  // wardrobe or the profile actually changed since the last run.
  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, pieces, prefs]);

  const saveProduct = async (product: SubProduct) => {
    if (savedKeys.has(product.key) || savingKey) return;
    setSavingKey(product.key);
    try {
      await savePickToSavedTab({
        name: product.name,
        brand: product.brand || null,
        category: product.rec.categoryId || null,
        price: product.price || null,
        link: product.links.length > 0 ? product.links[0].url : null,
        note: product.note || null,
      });
      setSavedKeys((cur) => new Set(cur).add(product.key));
    } catch (e) {
      console.error('[Ethaion] saving a recommendation failed:', e);
    } finally {
      setSavingKey(null);
    }
  };

  // THE SPEC-SHEET LAYER — a recommendation is open over Tier 2 (or Tier 1).
  if (openPick) {
    return (
      <PickHuntPage
        pick={openPick}
        profile={profile}
        budgets={budgets}
        pieces={pieces}
        prefs={prefs}
        onBack={() => setOpenPick(null)}
        backLabel={openSub ? openSub.label : 'The Rail'}
      />
    );
  }

  // TIER 2 — one sub-category's product recommendations.
  if (openSub) {
    return (
      <SubcategoryPage
        sub={openSub}
        livePicks={result?.picks || []}
        prefilter={prefilter}
        onClearPrefilter={clearFilter}
        onBack={() => {
          setOpenSub(null);
          clearFilter();
        }}
        onSwitchSub={(next) => {
          setOpenSub(next);
          setPrefilter(null);
        }}
        onOpenPick={setOpenPick}
        savedKeys={savedKeys}
        savingKey={savingKey}
        onSave={(product) => void saveProduct(product)}
      />
    );
  }

  // WORLD OF MENSWEAR — the second sub-tab: the full reference taxonomy
  // (search on top, category browse beneath, 7-field editorial detail views,
  // and Beau's For You note routing gaps back into the personal rail).
  if (railView === 'world') {
    return (
      <div>
        <h3 className={`hab-page-title ${typography.color.primary}`} style={{ marginBottom: '14px' }}>
          The Rail
        </h3>
        <RailSubTabs view={railView} onChange={setRailView} />
        <WorldOfMenswear
          pieces={pieces}
          profile={profile}
          onSeeForYou={(sub) => {
            setPrefilter(null);
            clearRailPrefilter();
            setRailView('for-you');
            setOpenPick(null);
            setOpenSub(sub);
          }}
        />
      </div>
    );
  }

  // TIER 1 — the "For You" sub-tab (the original personal rail, unchanged):
  // illustrated sub-category navigation, category by category.
  return (
    <div>
      <h3 className={`hab-page-title ${typography.color.primary}`} style={{ marginBottom: '14px' }}>
        The Rail
      </h3>

      {/* The two sub-tabs — directly below the main Rail tab header. */}
      <RailSubTabs view={railView} onChange={setRailView} />

      {/* Standfirst — three lines maximum. */}
      <p className={typography.color.primary} style={{ fontFamily: 'var(--space-font-family)', fontSize: '16px', lineHeight: 1.55, maxWidth: '62ch', marginBottom: '18px' }}>
        The action layer of The Edit, ordered by essentialness. Find what you’re after by its picture — tap any
        piece type and Beau’s specific recommendations open, with real photographs, prices and where to buy.
      </p>

      {/* Part-filled profile — a plain inline note, never a banner or modal:
          Beau names what's missing and asks for it, because archetypes, skin
          tone and build all sharpen what he recommends. */}
      {(() => {
        const missing: string[] = [];
        if (!Array.isArray(profile.archetypes) || profile.archetypes.length === 0) missing.push('your style archetypes');
        if (!profile.skin_tone) missing.push('your skin tone');
        if (!profile.height_range && !profile.build) missing.push('your height and build');
        if (missing.length === 0) return null;
        const named = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`;
        return (
          <p
            className="text-[var(--color-neutral-600,#856c51)]"
            style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', lineHeight: 1.6, maxWidth: '62ch', marginBottom: '18px' }}
          >
            Beau is working from a part-filled profile — add {named} and these picks get sharper and more yours.{' '}
            <button
              type="button"
              onClick={() => goToTab('your-style')}
              className="text-[var(--color-accent,#a8712c)] hover:underline"
              style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px' }}
            >
              Complete your style profile ›
            </button>
          </p>
        );
      })()}

      {/* Saved — a plain hairline row: Lora 14px left, › right. */}
      <div className="border-t border-b border-[var(--color-divider,rgba(59,43,29,0.18))] mb-5">
        <button
          type="button"
          onClick={() => goToTab('saved')}
          className="w-full grid grid-cols-[minmax(0,1fr)_18px] items-center gap-3 text-left py-[14px] group"
        >
          <span className={typography.color.primary} style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px' }}>
            Saved — your bookmarked picks
          </span>
          <span
            className="justify-self-end text-[var(--color-neutral-500,#a68e70)] group-hover:translate-x-0.5 transition-transform"
            style={{ fontFamily: 'var(--space-font-heading)', fontSize: '17px', lineHeight: 1 }}
            aria-hidden="true"
          >
            ›
          </span>
        </button>
      </div>

      {/* The engine's status line + explicit refresh — the ONLY thing that
          re-calls the model besides a wardrobe/profile change. */}
      <div className="flex items-center justify-between gap-2 mb-5 flex-wrap">
        <p className={`${typography.size.xs} ${typography.color.muted}`} style={{ fontFamily: 'var(--space-font-family)' }}>
          {loading
            ? phase
            : result
              ? result.fromCache
                ? 'From Beau\u2019s last read of your wardrobe — he re-reads when it changes.'
                : 'Beau read your wardrobe just now.'
              : ''}
        </p>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={loading}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] sm:min-h-0 rounded-full ${typography.size.xs} border border-[var(--space-border-default)] text-[var(--space-text-secondary)] hover:border-[var(--space-border-strong)] hover:text-[var(--space-text-primary)] transition-colors disabled:opacity-60`}
          title="Ask Beau to re-read your wardrobe and rethink his picks"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {loading ? 'Thinking\u2026' : 'Rethink my picks'}
        </button>
      </div>

      {/* Quiet error fallback — the navigation still stands: Beau's standing
          recommendations hold every sub-category open even when the live
          engine is unreachable. */}
      {!loading && error && (
        <p className={`${typography.size.xs} text-[var(--space-semantic-warning)] mb-4`}>{error}</p>
      )}

      {/* TIER 1 — one section per category, most essential first, each a
          grid of illustrated sub-category cards. The illustrations are the
          navigation; product photography lives one tap deeper.

          RENDERED PROGRESSIVELY (progressive-list.ts): the full navigation is
          well over a hundred illustrated cards, and building every one of them
          on arrival is work nobody has scrolled to yet. The first few
          categories render, the rest append a viewport ahead of the scroll —
          in the SAME menswear order, so the sequence the copy below promises
          is untouched. (The artwork files are lazy in their own right, in
          illustrations.tsx; this is the render cost, not the network.) */}
      <div>
        {visibleCategories.map((category) => {
          const subs = subcategoriesFor(category.id);
          if (subs.length === 0) return null;
          return (
            <section key={category.id} aria-label={category.label} style={{ marginTop: '34px' }}>
              {/* Category label — Cormorant, walnut ink, tobacco-gold hairline. */}
              <div style={{ borderBottom: '1px solid var(--color-accent,#a8712c)', paddingBottom: '9px', marginBottom: '20px' }}>
                <h4
                  className={typography.color.primary}
                  style={{ fontFamily: 'var(--space-font-heading)', fontWeight: 400, fontSize: '26px', lineHeight: 1.15 }}
                >
                  {category.label}
                </h4>
                <p
                  className="text-[var(--color-neutral-700,#634e38)]"
                  style={{ fontFamily: 'var(--space-font-family)', fontSize: '13.5px', lineHeight: 1.55, marginTop: '4px', maxWidth: '62ch' }}
                >
                  {category.blurb}
                </p>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-x-5 gap-y-7 items-start">
                {subs.map((sub) => (
                  <SubcategoryCard
                    key={sub.id}
                    sub={sub}
                    onOpen={() => {
                      setPrefilter(null);
                      clearRailPrefilter();
                      setOpenSub(sub);
                    }}
                  />
                ))}
              </div>
              {/* "Other [Category] →" — a plain-text entry at the END of the
                  card row (never an illustrated card): unfolds a simple text
                  list of less-common sub-types; tapping any item opens its
                  Tier 2 recommendations exactly like a card does. */}
              {(() => {
                const others = otherSubcategoriesFor(category.id);
                if (others.length === 0) return null;
                const rowLabel = OTHER_ROW_LABELS[category.id] || category.label;
                const open = otherOpenFor === category.id;
                return (
                  <div className="mt-5">
                    <button
                      type="button"
                      onClick={() => setOtherOpenFor(open ? null : category.id)}
                      aria-expanded={open}
                      className="inline-flex items-baseline gap-1.5 hover:underline"
                      style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', color: 'var(--color-accent,#a8712c)' }}
                    >
                      Other {rowLabel} {open ? '×' : '→'}
                    </button>
                    {open && (
                      <div className="mt-2 border-t border-b border-[var(--color-divider,rgba(59,43,29,0.18))] divide-y divide-[var(--color-divider,rgba(59,43,29,0.18))] max-w-md">
                        {others.map((other) => (
                          <button
                            key={other.id}
                            type="button"
                            onClick={() => {
                              setPrefilter(null);
                              clearRailPrefilter();
                              setOpenSub(other);
                            }}
                            className="w-full grid grid-cols-[minmax(0,1fr)_18px] items-center gap-3 text-left py-[11px] group"
                            aria-label={`${other.label} — see Beau's recommendations`}
                          >
                            <span className={typography.color.primary} style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px' }}>
                              {other.label}
                            </span>
                            <span
                              className="justify-self-end text-[var(--color-neutral-500,#a68e70)] group-hover:translate-x-0.5 transition-transform"
                              style={{ fontFamily: 'var(--space-font-heading)', fontSize: '16px', lineHeight: 1 }}
                              aria-hidden="true"
                            >
                              ›
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </section>
          );
        })}
        {/* The reveal sentinel — reaching within a viewport of it appends the
            next categories, so scrolling never stops at a short rail. */}
        {!categoriesDone && <span ref={categorySentinelRef} aria-hidden="true" className="block" style={{ height: '1px' }} />}
      </div>

      <p className={`${typography.size.xs} ${typography.color.muted} mt-8 flex items-start gap-1`} style={{ fontSize: '10px' }}>
        <span>
          The rail runs in the standard menswear order — tops, knitwear, outerwear, bottoms, formalwear and base
          layers first, then shoes, then accessories, bags and headwear last. The drawings are signposts: tap one and Beau&rsquo;s specific product
          recommendations open — real photographs, makers, prices, his reasoning, and one link to the piece at the
          source with a cheaper-hunt beside it.
          Less-common types sit behind each section&rsquo;s &ldquo;Other →&rdquo; row — the same recommendations,
          none of the clutter. Gaps tapped in The Edit land straight on the right piece type. His picks refresh when your wardrobe or
          profile changes, or when you ask him to rethink.
        </span>
      </p>
    </div>
  );
}
