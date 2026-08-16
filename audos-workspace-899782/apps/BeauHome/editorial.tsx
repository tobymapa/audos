/**
 * Reads — the short-form editorial layer (Pass Forty-Two — back on the tab
 * bar as a full screen).
 *
 * Six Habitus-authored pieces in Beau's voice: quality, care, and the long
 * game. The screen reads top to bottom:
 *  1. "Reads" page heading (Cormorant 52px/400).
 *  2. A full-bleed WALNUT BAND (#241a12, 48px 40px 52px) immediately below
 *     the heading carrying the FEATURED article — Cormorant 28px title in
 *     #f6f0e5, a 2-line Lora 15px deck at .78 opacity, and a tappable
 *     "Read now ›" text row (no button) that unfolds the piece in place.
 *  3. "The library" — section head + filter pills (All · Fabric · Fit ·
 *     Care · Value) over the dark hairline rule, then EDITORIAL SECTIONS
 *     (Pass Forty-Four): each article is a full-width section — a PROMINENT
 *     matted 4:3 photograph plate (1px neutral-300 mat, ~8px inner padding,
 *     monospace caption bottom-left), Cormorant 22px/400 title, 2-line Lora
 *     14px standfirst in neutral-600, a 1px-accent tag pill (4px radius, no
 *     fill) + read time, and "Read ›" in the accent — stacked vertically
 *     and parted by hairlines. The 2-up grid is retired.
 * Everything expands inline — short-form by design, never a magazine.
 * Content is static and curated (no network), so the tab always renders
 * instantly.
 */
import { useState } from 'react';
import { typography } from '../../lib/colors';

interface EditorialPiece {
  id: string;
  /** Category tag pill — Care / Quality / Heritage. */
  tag: string;
  /** Library filter bucket (HTML reference): fabric · fit · care · value. */
  filter: 'fabric' | 'fit' | 'care' | 'value';
  /** Cell kicker, e.g. "Fabric literacy" — shown as "{kicker} · {n} min". */
  kicker: string;
  /** Editorial photograph — 4:3, rendered through the matted plate. */
  image: string;
  /** Display date for the monospace date / read-time line. */
  date: string;
  title: string;
  standfirst: string;
  minutes: number;
  paragraphs: string[];
}

const PIECES: EditorialPiece[] = [
  {
    id: 'fabric-quality',
    tag: 'Quality',
    filter: 'fabric',
    kicker: 'Fabric literacy',
    image: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785324132785-5zy9kw.png',
    date: 'March 2026',
    title: 'How to read fabric quality',
    standfirst: 'What to look for before the label — construction, weight, and what the hand tells you.',
    minutes: 4,
    paragraphs: [
      'The label tells you the fibre; it says nothing about how the cloth was made. Two shirts can both read “100% cotton” and be different species: one woven dense and even from long-staple yarn, the other loose, thin and hairy from the cheapest fibre that qualifies. Start with your hands. Good cloth has body without stiffness — it recovers when you scrunch it, drapes rather than clings, and feels cool and dry rather than waxy.',
      'Then look at the construction. Hold a weave up to the light: tight, regular yarns with no skipped threads are the mark of a mill that was not cutting corners. On knits, stretch a small section and watch it return — sluggish recovery today is a bagged-out elbow within a season. Seams tell the same story in miniature: flat-felled or densely stitched seams outlast pinked-and-overlocked ones by years.',
      'Weight is the last tell, and the most underrated. A heavier Oxford, a denser flannel, a chunkier loafer sole all carry a simple message: there is more material here to wear through. Lightness has its place in summer cloth, but when two garments cost the same and one feels substantial while the other feels like air, the substantial one is usually the honest one.',
    ],
  },
  {
    id: 'natural-fibres',
    tag: 'Care',
    filter: 'fabric',
    kicker: 'Material judgement',
    image: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785324163767-n2as7j.png',
    date: 'April 2026',
    title: 'The case for natural fibres',
    standfirst: 'Why wool, cotton, and linen outperform synthetics over a wardrobe’s lifetime.',
    minutes: 3,
    paragraphs: [
      'Natural fibres are irregular at a microscopic level. Wool scales, linen slubs and leather grain scatter wear rather than displaying every abrasion in exactly the same way. With use, they relax, polish and deepen: denim fades at the knees, a wax jacket records rain, good leather darkens where your hand finds it.',
      'Many synthetics are engineered for consistency. That can be excellent when you need stretch, low weight or weather protection, but uniform filaments often show age abruptly: shine at friction points, permanent odour, peeling coatings or pills that never settle into character. They tend to look newer for a while, then simply look spent.',
      'This is not a purity contest. A small amount of nylon can strengthen socks; elastane can make trousers practical; a technical shell may outperform any natural cloth in hard rain. Judge the blend by its job. For pieces you want to keep for years — knitwear, coats, shirts, leather shoes — favour a high natural-fibre content, sound construction and a surface that can be brushed, repaired or refinished rather than discarded.',
    ],
  },
  {
    id: 'capsule-wardrobe',
    tag: 'Heritage',
    filter: 'value',
    kicker: 'Buying well',
    image: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785336482972-kwtsdi.png',
    date: 'May 2026',
    title: 'Building a capsule wardrobe',
    standfirst: 'The case for owning fewer pieces, chosen with more intention.',
    minutes: 5,
    paragraphs: [
      'A capsule wardrobe is not a punishment diet. It is the observation that most men wear twenty per cent of what they own, and that the other eighty per cent exists because each piece was bought as an answer to a single afternoon rather than as part of a system. Fewer pieces, chosen so that nearly everything works with nearly everything else, produces more outfits from less cloth — and less standing in front of the rail at seven in the morning.',
      'The mechanics are simple. Anchor the capsule in a narrow palette — navy, grey, ecru, brown — so combinations cannot clash. Cover the real shape of your life: if your week is five days casual and one dinner, buy for that ratio, not for an imagined boardroom. Then let each category earn its count: three or four shirts that fit properly beat nine that almost do.',
      'Intention is what separates a capsule from a small pile of clothes. Every piece should have a stated job — the trousers that dress up or down, the knit that layers over both shirts, the one coat that finishes everything. When a candidate cannot name its job, or duplicates a job already filled, it stays in the shop. That discipline, kept for a year, quietly builds the wardrobe everything else on this shelf is about.',
    ],
  },
  {
    id: 'shoe-longevity',
    tag: 'Care',
    filter: 'care',
    kicker: 'Shoe care',
    image: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785324103455-xy5w73.png',
    date: 'June 2026',
    title: 'On the longevity of good shoes',
    standfirst: 'A well-made shoe resoled twice outlasts three cheap pairs. The arithmetic is straightforward.',
    minutes: 3,
    paragraphs: [
      'A worn sole is not a worn-out shoe. Start with the upper: good calf, suede or shell should be supple rather than split, with creases that have rolled instead of cracked. Then look at the shape. If the heel counter still holds your foot and the shoe has not twisted sideways, the structure is doing its job.',
      'The join between upper and sole decides the shoe’s future. A visible stitched welt — Goodyear, storm or hand welt — is the clearest green light, because a cobbler can remove the sole without disturbing the upper. Blake-stitched shoes can often be resoled too. A moulded or heavily glued unit may cost more to rebuild than to replace — which is precisely why it was cheaper on day one.',
      'Now the arithmetic. A welted pair at three times the price of a glued pair, resoled twice at a fraction of the purchase cost, delivers a decade or more of wear; the glued pair delivers eighteen months and a bin bag. Per year on your feet, the expensive shoe is the cheap one. Resole loyalty, not guilt — reserve the cobbler’s bill for shoes that fit beautifully and would cost real money to replace like-for-like.',
    ],
  },
  {
    id: 'fit-over-label',
    tag: 'Quality',
    filter: 'fit',
    kicker: 'Fit decoded',
    image: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785324225008-5r79cs.png',
    date: 'July 2026',
    title: 'Why fit matters more than the label',
    standfirst: 'Proportion is everything. The same garment reads completely differently on a well-fitted frame.',
    minutes: 4,
    paragraphs: [
      'Put a man in a modest shirt that follows his shoulder line and sits cleanly at the collar, and he looks considered. Put the same man in a garment three times the price that pulls at the button and pools at the cuff, and he looks like he borrowed it. The eye reads proportion long before it reads a label — which is why fit is the cheapest upgrade in menswear and the most commonly skipped.',
      'The fixed points matter most. On anything tailored, the shoulder seam should meet your shoulder bone — almost nothing else is harder to alter. On trousers, the rise and the seat decide comfort and line; the hem is a ten-minute job. On knitwear, body length and sleeve length carry the silhouette. Learn your numbers — shoulder, pit-to-pit, rise, inseam — and carry them with you; they translate across brands in a way that S, M and L never will.',
      '“Classic fit”, “slim fit”, “relaxed fit” are marketing dialects, not measurements — one brand’s classic is another’s contemporary. So never buy the adjective. Compare garment measurements you already know work, budget for the tailor as part of the price, and remember: a well-fitted frame makes ordinary clothes look deliberate, and no label can do that for you.',
    ],
  },
  {
    id: 'century-of-evidence',
    tag: 'Heritage',
    filter: 'value',
    kicker: 'Buying well',
    image: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785324195007-t44rdq.png',
    date: 'August 2026',
    title: 'The classic wardrobe: a century of evidence',
    standfirst: 'What the men who dressed well a hundred years ago knew that hasn’t changed.',
    minutes: 6,
    paragraphs: [
      'Photographs from the 1920s onward keep making the same quiet argument: the men who look right in them are wearing things you could wear tomorrow. An Oxford shirt, a navy blazer, grey flannel trousers, a trench coat, brown welted shoes — the pieces have survived a century of fashion cycles not by resisting change but by never depending on it. They solve permanent problems: weather, work, occasion, proportion.',
      'The evidence runs through every decade. The 1930s gave the drape suit and the polo coat; the 1950s put the same Oxford cloth on campus with chinos and loafers; the 1960s tightened the line without changing the vocabulary. Each generation adjusted the cut a centimetre here and there. None of them replaced the pieces themselves — because a good overcoat in 1935 was answering the same November as a good overcoat today.',
      'The practical lesson is about where to spend. Anything with a century of continuous service — the white shirt, the navy knit, the dark raw denim, the plain welted derby — can be bought with confidence and bought once, because time has already run the experiment. Anything invented last season is still in trials. A wardrobe built on the proven pieces, with fashion admitted only at the edges, is what the best-dressed men in those photographs actually did.',
      'It is also why this product exists. Ethaion is opinionated about the classic wardrobe precisely because the returns are so well documented: fewer, better, proven pieces — fitted to your frame, your climate and your life — beat a closet of experiments every year for the rest of your life.',
    ],
  },
];

// The flagship manifesto piece leads the page from the walnut band.
const FEATURED_ID = 'century-of-evidence';

// ---------------------------------------------------------------------------
// Featured — the walnut band immediately below the page heading
// ---------------------------------------------------------------------------

function FeaturedBand({ piece }: { piece: EditorialPiece }) {
  const [open, setOpen] = useState(false);
  return (
    <section
      aria-label="Featured read"
      className="px-6 sm:px-10"
      style={{ background: '#241a12', paddingTop: '52px', paddingBottom: '56px' }}
    >
      <div className="max-w-[1180px] mx-auto grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_360px] items-center gap-10 md:gap-16">
        <div>
          <p
            className="uppercase"
            style={{ fontFamily: 'var(--space-font-heading)', fontSize: '12px', letterSpacing: '0.16em', color: '#e3c184', marginBottom: '10px' }}
          >
            This week · {piece.kicker} · {piece.minutes} min
          </p>
          <h4
            style={{ fontFamily: 'var(--space-font-heading)', fontWeight: 400, fontSize: '40px', lineHeight: 1.1, color: '#f6f0e5', maxWidth: '26ch', marginBottom: '14px' }}
          >
            {piece.title}
          </h4>
          {/* Deck — Lora 16px, two lines at most */}
          <p
            style={{
              fontFamily: 'var(--space-font-family)',
              fontSize: '16px',
              lineHeight: 1.65,
              color: '#f6f0e5',
              opacity: 0.85,
              maxWidth: '56ch',
              marginBottom: '24px',
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {piece.standfirst}
          </p>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="px-5 min-h-[44px] rounded text-[15px] bg-transparent border transition-colors hover:bg-[rgba(246,240,229,0.08)]"
            style={{ borderColor: '#cb9d51', color: '#f6f0e5', fontFamily: 'var(--space-font-family)' }}
          >
            {open ? 'Close' : 'Read this'}
          </button>
        </div>
        {/* Matted 4:3 plate — walnut-toned mat, monospace caption */}
        <div className="hidden md:block" style={{ border: '1px solid #4a3626', padding: '12px' }}>
          <img
            src={piece.image}
            alt=""
            className="block w-full aspect-[4/3] object-cover"
            loading="lazy"
            width={800}
            height={600}
            style={{ filter: 'sepia(0.20) saturate(0.85) contrast(1.05)' }}
          />
          <span className="block mt-1.5" style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '10px', color: '#c5b193' }}>
            {piece.date} · {piece.minutes} min read
          </span>
        </div>
        {open && (
          <div className="md:col-span-2 mt-2 pt-5 space-y-3" style={{ borderTop: '1px solid rgba(246,240,229,0.15)' }}>
            {piece.paragraphs.map((p, i) => (
              <p
                key={i}
                style={{ fontFamily: 'var(--space-font-family)', fontSize: '15px', lineHeight: 1.7, color: '#f6f0e5', opacity: 0.9, maxWidth: '68ch' }}
              >
                {p}
              </p>
            ))}
            <p style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '10px', color: '#f6f0e5', opacity: 0.55 }}>
              {piece.date} · {piece.minutes} min read
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Editorial section — one article as a full-width section (Pass Forty-Four):
// a PROMINENT matted 4:3 photograph plate (1px neutral-300 mat, ~8px inner
// padding, monospace caption bottom-left), title Cormorant 22px/400, a
// 2-line Lora 14px standfirst, the category tag pill + read time, and
// "Read ›" in the accent. Articles stack vertically, parted by hairlines.
// ---------------------------------------------------------------------------

function ArticleSection({ piece }: { piece: EditorialPiece }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ padding: '36px 0' }}>
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,420px)_minmax(0,1fr)] items-start gap-7 md:gap-12">
        {/* Photograph plate — 4:3, matted, prominent (not thumbnail-sized) */}
        <div style={{ border: '1px solid var(--color-neutral-300,#dccdb2)', padding: '8px' }}>
          <img
            src={piece.image}
            alt=""
            loading="lazy"
            width={800}
            height={600}
            className="block w-full aspect-[4/3] object-cover"
            style={{ filter: 'sepia(0.20) saturate(0.85) contrast(1.05)' }}
          />
          <span
            className="block text-left"
            style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '10px', color: 'var(--color-neutral-600,#856c51)', marginTop: '6px' }}
          >
            {piece.kicker} · {piece.date}
          </span>
        </div>
        <div className="min-w-0">
          {/* Title — Cormorant 22px weight 400 */}
          <h5
            className={typography.color.primary}
            style={{ fontFamily: 'var(--space-font-heading)', fontWeight: 400, fontSize: '22px', lineHeight: 1.2 }}
          >
            {piece.title}
          </h5>
          {/* Standfirst — Lora 14px neutral-600, max 2 lines */}
          <p
            className="text-[var(--color-neutral-600,#856c51)]"
            style={{
              fontFamily: 'var(--space-font-family)',
              fontSize: '14px',
              lineHeight: 1.6,
              marginTop: '8px',
              maxWidth: '58ch',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {piece.standfirst}
          </p>
          {/* Category tag pill + read time — Lora 11px uppercase */}
          <span className="flex items-center flex-wrap" style={{ gap: '10px', marginTop: '14px' }}>
            <span
              className="uppercase border border-[var(--color-accent,#a8712c)] text-[var(--color-accent-800,#5c3413)]"
              style={{ fontFamily: 'var(--space-font-family)', fontSize: '11px', letterSpacing: '0.12em', borderRadius: '4px', padding: '3px 10px', background: 'transparent' }}
            >
              {piece.tag}
            </span>
            <span
              className="uppercase text-[var(--color-neutral-600,#856c51)]"
              style={{ fontFamily: 'var(--space-font-family)', fontSize: '11px', letterSpacing: '0.12em' }}
            >
              {piece.minutes} min read
            </span>
          </span>
          {/* "Read ›" — Lora 13px accent; the piece unfolds in place */}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="inline-flex items-center gap-1 group hover:underline"
            style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px', color: 'var(--color-accent,#a8712c)', marginTop: '16px' }}
          >
            {open ? 'Close' : 'Read'}
            <span
              aria-hidden="true"
              className="group-hover:translate-x-0.5 transition-transform"
              style={{ fontFamily: 'var(--space-font-heading)', fontSize: '15px', lineHeight: 1 }}
            >
              ›
            </span>
          </button>
          {open && (
            <div className="space-y-3" style={{ marginTop: '16px' }}>
              {piece.paragraphs.map((p, i) => (
                <p key={i} className={typography.color.primary} style={{ fontFamily: 'var(--space-font-family)', fontSize: '15px', lineHeight: 1.7, maxWidth: '62ch' }}>
                  {p}
                </p>
              ))}
              <p style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '10px', color: 'var(--color-neutral-600,#856c51)' }}>
                {piece.date} · {piece.minutes} min read
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reads screen root — manages its own full-width sections so the walnut
// band runs full bleed (App.tsx renders it without a wrapper).
// ---------------------------------------------------------------------------

const LIBRARY_FILTERS: Array<{ id: 'all' | 'fabric' | 'fit' | 'care' | 'value'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'fabric', label: 'Fabric' },
  { id: 'fit', label: 'Fit' },
  { id: 'care', label: 'Care' },
  { id: 'value', label: 'Value' },
];

export function FromHabitus() {
  const featured = PIECES.find((p) => p.id === FEATURED_ID) || PIECES[0];
  const rest = PIECES.filter((p) => p.id !== featured.id);
  const [filter, setFilter] = useState<'all' | 'fabric' | 'fit' | 'care' | 'value'>('all');
  const gridPieces = filter === 'all' ? rest : rest.filter((p) => p.filter === filter);

  return (
    <div className="pb-24">
      {/* Page heading — Cormorant 52px/400 + standfirst, over a hairline */}
      <div className="px-6 sm:px-10 pt-[52px] pb-11 border-b border-[var(--color-divider,rgba(59,43,29,0.18))]">
        <div className="max-w-[1180px] mx-auto">
          <h3 className={`hab-page-title ${typography.color.primary}`} style={{ marginBottom: '14px' }}>Reads</h3>
          <p className={typography.color.primary} style={{ fontFamily: 'var(--space-font-family)', fontSize: '16px', lineHeight: 1.55, maxWidth: '54ch' }}>
            Two-minute reads on buying well — fabric, fit, value and care. No trends, no hauls.
          </p>
        </div>
      </div>

      {/* The walnut band — IMMEDIATELY below the heading */}
      <FeaturedBand piece={featured} />

      {/* The library — section head + filter pills over the ink rule, then
          the 2-up article grid with TRUE hairline gutters: the divider colour
          shows through the 1px gaps, each cell is --paper. */}
      <div className="px-6 sm:px-10 pt-[48px]">
        <div className="max-w-[1180px] mx-auto">
          <div className="flex items-baseline justify-between gap-3 flex-wrap pb-2.5 border-b border-[var(--color-text,#3b2b1d)]">
            <h4 className={`hab-section-head ${typography.color.primary}`}>The library</h4>
            <span className="flex gap-2 flex-wrap">
              {LIBRARY_FILTERS.map((f) => {
                const active = filter === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFilter(f.id)}
                    aria-pressed={active}
                    className={`uppercase border transition-colors ${
                      active
                        ? 'border-[var(--color-accent,#a8712c)] text-[var(--color-accent-800,#5c3413)]'
                        : 'border-[var(--color-neutral-300,#dccdb2)] text-[var(--color-neutral-700,#634e38)] hover:border-[var(--space-border-strong)] hover:text-[var(--space-text-primary)]'
                    }`}
                    style={{ fontFamily: 'var(--space-font-family)', fontSize: '11px', letterSpacing: '0.12em', borderRadius: '4px', padding: '4px 11px' }}
                  >
                    {f.label}
                  </button>
                );
              })}
            </span>
          </div>
          {gridPieces.length === 0 ? (
            <p className="py-10 text-center" style={{ fontFamily: 'var(--space-font-family)', fontSize: '15px', color: 'var(--color-neutral-600,#856c51)' }}>
              Nothing filed under that yet — tap “All” to see the whole library.
            </p>
          ) : (
            /* Editorial sections (Pass Forty-Four) — articles stack
               vertically, one full-width section each, parted by hairlines.
               The 2-up grid is retired. */
            <div className="divide-y divide-[var(--color-divider,rgba(59,43,29,0.18))] border-b border-[var(--color-divider,rgba(59,43,29,0.18))]">
              {gridPieces.map((piece) => (
                <ArticleSection key={piece.id} piece={piece} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
