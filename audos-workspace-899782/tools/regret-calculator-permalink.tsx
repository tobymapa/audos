/**
 * Ethaion — Regret Risk Calculator (public GTM micro-tool)
 *
 * Standalone permalink page (TSX), served publicly with NO auth / session / OTP.
 * Source of truth for the platform permalink page with slug "regret-calculator".
 *
 * STYLING NOTE (v2, 2026-08-14): every layout rule is now inline / injected by
 * this file itself. v1 relied on the Tailwind CDN script for spacing and
 * centering, which degrades to flush-left, cramped layout when that script is
 * blocked (ad blockers) or slow. Do NOT reintroduce utility-class styling here.
 *
 * BRAND DIRECTORY (v3, 2026-08-14): expanded from 2 tiers (~59 labels) to 4 tiers
 * (~230 labels: heritage 5 / solid 8 / variable 13 / fast fashion 22). Static and
 * baked in — adds a few KB to the page, zero runtime cost, result stays instant.
 *
 * Scoring: 0–100, LOWER = BETTER. Four vectors, 0–25 each:
 *   1. Quality opacity   — can you verify quality before buying?
 *   2. Fit uncertainty   — calibrated by garment type
 *   3. Brand consistency — heritage / unknown / fast-fashion
 *   4. Style longevity   — garment type + price together
 *
 * Analytics: every completed calculation is logged anonymously to the
 * WorkspaceDB table `regret_calc_events`. The token below is the public
 * runtime token already shipped to every browser in the published Ethaion
 * bundle — it grants no more access here than it does there.
 *
 * ── Deployment record ───────────────────────────────────────────────────────
 * Permalink page id : 6a1e7b3d-c9c2-4c10-bb32-1cd193b1913e
 * Slug              : regret-calculator
 * Live URL (once public): https://www.ethaion.com/p/regret-calculator
 * Review URL (draft) : https://www.ethaion.com/p/regret-calculator?token=ethaion-review-8k24qv
 * Status            : isPublic=false (draft for founder review; flip via PATCH)
 * Update the page   : PATCH /api/workspaces/3460cb2c-8c4f-405c-83a2-057f8b58da27/permalink-pages/6a1e7b3d-c9c2-4c10-bb32-1cd193b1913e
 *                     with header "x-session-id: <any-id>" and body { "tsxSource": <this file> }
 *                     (recompiles automatically; 422 on compile error).
 * Go live           : same PATCH with { "isPublic": true, "accessToken": null }
 * Analytics table   : regret_calc_events (WorkspaceDB) — one row per calculation.
 * NOTE: this file is NOT a registered space app — it is the source of the
 * standalone permalink page above. Do not add it to config.json.
 */
import { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Scale, ArrowRight, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';

/* ---------- Brand: Ethaion warm-neutral palette (standalone page — no theme tokens here) ---------- */
const C = {
  page: '#efe7d9',
  card: '#fbf8f1',
  soft: '#fbf1de',
  border: 'rgba(59,43,29,0.18)',
  borderStrong: 'rgba(59,43,29,0.34)',
  text: '#3b2b1d',
  secondary: '#634e38',
  muted: '#856c51',
  brand: '#a8712c',
  contrast: '#7c4a17',
  onBrand: '#fbf1de',
  success: '#4e6a50',
  warning: '#96631f',
  danger: '#7d2a24',
};
const FONT_HEAD = '"Cormorant Garamond", Georgia, "Times New Roman", serif';
const FONT_BODY = '"Lora", Georgia, "Times New Roman", serif';

(function bootstrapPage() {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href =
    'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Lora:ital,wght@0,400;0,500;0,600;1,400&display=swap';
  document.head.appendChild(link);
  document.body.style.backgroundColor = C.page;
  document.body.style.margin = '0';
})();

/* ---------- Analytics (anonymous, fire-and-forget) ---------- */
const WORKSPACE_ID = '3460cb2c-8c4f-405c-83a2-057f8b58da27';
// Public runtime token — identical to the one embedded in the published Ethaion app bundle.
const DB_TOKEN = 'ak_live_d8f82dcd5b17076820738c0cd91d1d43f552c8bd2d93733b2f3e5fa79335834a';

function priceBucket(price: number): string {
  if (price <= 50) return '£0–50';
  if (price <= 150) return '£51–150';
  if (price <= 300) return '£151–300';
  return '£300+';
}

function logCalculation(row: Record<string, unknown>) {
  try {
    fetch(`/api/workspaces/${WORKSPACE_ID}/data/regret_calc_events?_shared=1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Workspace-DB-Token': DB_TOKEN },
      body: JSON.stringify({ rows: [{ ...row, session_id: null }] }),
    }).catch(() => {});
  } catch (_) {
    /* analytics must never block the result */
  }
}

/* ---------- Scoring ---------- */
type Vector = { key: string; label: string; score: number; note: string };

const GARMENT_TYPES = ['Coat', 'Blazer', 'Trousers', 'Shirt', 'Shoes', 'Knitwear', 'Accessories', 'Other'] as const;

const MATERIAL_SUGGESTIONS = ['wool', 'cashmere', 'cotton', 'linen', 'leather', 'silk', 'polyester blend', 'synthetic', 'mixed'];

const NATURALS = ['wool', 'merino', 'lambswool', 'shetland', 'cashmere', 'linen', 'leather', 'suede', 'shearling', 'silk', 'mohair', 'alpaca', 'camel', 'tweed', 'flannel', 'moleskin', 'corduroy', 'denim', 'cotton'];
const SYNTHETICS = ['polyester', 'poly blend', 'acrylic', 'nylon', 'elastane', 'spandex', 'viscose', 'rayon', 'synthetic', 'pleather', 'vegan leather', 'faux leather', 'polyurethane', ' pu ', 'pvc', 'microfiber', 'microfibre'];
const VAGUE = ['blend', 'mixed', 'mix', 'fabric', 'material', 'unknown', 'not sure'];

function scoreQuality(materialRaw: string): Vector {
  const m = ' ' + materialRaw.trim().toLowerCase() + ' ';
  const base = { key: 'quality', label: 'Quality opacity' };
  if (!materialRaw.trim()) {
    return { ...base, score: 23, note: 'No material given — when a listing hides fibre content, treat quality as unverifiable.' };
  }
  const natural = NATURALS.find((k) => m.includes(k));
  const synthetic = SYNTHETICS.find((k) => m.includes(k));
  const vague = VAGUE.find((k) => m.includes(k));
  if (natural && !synthetic && !vague) {
    if (natural === 'cotton' || natural === 'denim' || natural === 'corduroy') {
      return { ...base, score: 7, note: 'Cotton is honest and verifiable, though quality varies with weight and weave — check both.' };
    }
    return { ...base, score: 4, note: `${capitalize(natural)} is a natural performance fibre — quality is largely verifiable before you buy.` };
  }
  if (natural && (synthetic || vague)) {
    return { ...base, score: 13, note: 'A blended or mixed composition makes it hard to know what you are really paying for.' };
  }
  if (synthetic) {
    return { ...base, score: 21, note: 'Synthetic-dominant fabric is the hardest quality to verify — and the most common regret.' };
  }
  if (vague) {
    return { ...base, score: 16, note: 'A vague description like this usually means the composition would not flatter the listing.' };
  }
  return { ...base, score: 19, note: 'We could not verify this material — unverifiable quality reads as risk, not a pass.' };
}

const FIT_BY_TYPE: Record<string, { score: number; note: string }> = {
  Accessories: { score: 3, note: 'Accessories are close to size-proof — fit is rarely the reason they go unworn.' },
  Shoes: { score: 7, note: 'Shoe sizing is fairly standard, but width and last shape still catch people out.' },
  Shirt: { score: 11, note: 'Shirts have forgiving tolerances, though collar and sleeve length still matter.' },
  Knitwear: { score: 14, note: 'Knitwear stretches and drapes differently by maker — a moderate fit risk.' },
  Coat: { score: 18, note: 'Coats forgive more than tailoring, but shoulder and length errors are expensive ones.' },
  Trousers: { score: 21, note: 'Trousers are highly body-specific — fit risk is hard to eliminate without trying them on.' },
  Blazer: { score: 24, note: 'A blazer lives or dies on the shoulders — the hardest fit to get right unseen.' },
  Other: { score: 13, note: 'Without a defined category we assume mid-level fit risk.' },
};

function scoreFit(garment: string): Vector {
  const f = FIT_BY_TYPE[garment] || FIT_BY_TYPE.Other;
  return { key: 'fit', label: 'Fit uncertainty', score: f.score, note: f.note };
}

/* Brand directory — curated, deterministic, baked into the page (no lookups at runtime,
   so a bigger directory costs nothing at scoring time). Four tiers:
   HERITAGE (5) verifiable quality · SOLID (8) dependable, check the line ·
   VARIABLE (13) known name, quality varies · FAST_FASHION (22) built for turnover.
   Anything unmatched scores 15 and is flagged as unverified — never punished. */
type BrandEntry = { key: string; name: string };

const HERITAGE: BrandEntry[] = [
  { key: 'suitsupply', name: 'Suitsupply' }, { key: 'drakes', name: "Drake's" }, { key: 'cos', name: 'COS' },
  { key: 'apc', name: 'A.P.C.' }, { key: 'loropiana', name: 'Loro Piana' }, { key: 'sandro', name: 'Sandro' },
  { key: 'clubmonaco', name: 'Club Monaco' }, { key: 'ralphlauren', name: 'Ralph Lauren' },
  { key: 'brunellocucinelli', name: 'Brunello Cucinelli' }, { key: 'sunspel', name: 'Sunspel' },
  { key: 'johnsmedley', name: 'John Smedley' }, { key: 'privatewhite', name: 'Private White V.C.' },
  { key: 'margarethowell', name: 'Margaret Howell' }, { key: 'oliverspencer', name: 'Oliver Spencer' },
  { key: 'lucafaloni', name: 'Luca Faloni' }, { key: 'asket', name: 'ASKET' }, { key: 'spiermackay', name: 'Spier & Mackay' },
  { key: 'cordings', name: 'Cordings' }, { key: 'barbour', name: 'Barbour' }, { key: 'filson', name: 'Filson' },
  { key: 'paraboot', name: 'Paraboot' }, { key: 'crockettjones', name: 'Crockett & Jones' }, { key: 'churchs', name: "Church's" },
  { key: 'alden', name: 'Alden' }, { key: 'trickers', name: "Tricker's" }, { key: 'carmina', name: 'Carmina' },
  { key: 'meermin', name: 'Meermin' }, { key: 'williamlockie', name: 'William Lockie' },
  { key: 'harleyofscotland', name: 'Harley of Scotland' }, { key: 'inismeain', name: 'Inis Meáin' },
  { key: 'bergberg', name: 'Berg & Berg' }, { key: 'angloitalian', name: 'Anglo-Italian' },
  { key: 'kamakura', name: 'Kamakura' }, { key: 'zegna', name: 'Zegna' }, { key: 'canali', name: 'Canali' },
  { key: 'boglioli', name: 'Boglioli' }, { key: 'lardini', name: 'Lardini' }, { key: 'corneliani', name: 'Corneliani' },
  { key: 'kiton', name: 'Kiton' }, { key: 'attolini', name: 'Cesare Attolini' }, { key: 'isaia', name: 'Isaia' },
  { key: 'brioni', name: 'Brioni' }, { key: 'tomford', name: 'Tom Ford' }, { key: 'hermes', name: 'Hermès' },
  { key: 'berluti', name: 'Berluti' }, { key: 'ringjacket', name: 'Ring Jacket' }, { key: 'caruso', name: 'Caruso' },
  { key: 'belvest', name: 'Belvest' }, { key: 'oxxford', name: 'Oxxford' }, { key: 'sidmashburn', name: 'Sid Mashburn' },
  { key: 'husbands', name: 'Husbands' }, { key: 'armoury', name: 'The Armoury' }, { key: 'rubinacci', name: 'Rubinacci' },
  { key: 'tagliatore', name: 'Tagliatore' }, { key: 'lbm1911', name: 'L.B.M. 1911' }, { key: 'petrillo', name: 'De Petrillo' },
  { key: 'andersonsheppard', name: 'Anderson & Sheppard' },
  { key: 'edwardgreen', name: 'Edward Green' }, { key: 'johnlobb', name: 'John Lobb' }, { key: 'gaziano', name: 'Gaziano & Girling' },
  { key: 'cheaney', name: 'Cheaney' }, { key: 'saintcrispin', name: "Saint Crispin's" }, { key: 'viberg', name: 'Viberg' },
  { key: 'rmwilliams', name: 'R.M. Williams' }, { key: 'redwing', name: 'Red Wing' }, { key: 'grantstone', name: 'Grant Stone' },
  { key: 'parkhurst', name: 'Parkhurst' }, { key: 'rancourt', name: 'Rancourt' }, { key: 'quoddy', name: 'Quoddy' },
  { key: 'yuketen', name: 'Yuketen' }, { key: 'heschung', name: 'Heschung' }, { key: 'jmweston', name: 'J.M. Weston' },
  { key: 'bonafe', name: 'Enzo Bonafé' }, { key: 'vass', name: 'Vass' }, { key: 'tlbmallorca', name: 'TLB Mallorca' },
  { key: 'yanko', name: 'Yanko' },
  { key: 'grenfell', name: 'Grenfell' }, { key: 'mackintosh', name: 'Mackintosh' }, { key: 'baracuta', name: 'Baracuta' },
  { key: 'valstar', name: 'Valstar' }, { key: 'aspesi', name: 'Aspesi' }, { key: 'tenc', name: 'Ten C' },
  { key: 'schott', name: 'Schott NYC' }, { key: 'aeroleather', name: 'Aero Leather' }, { key: 'lewisleathers', name: 'Lewis Leathers' },
  { key: 'realmccoy', name: "The Real McCoy's" }, { key: 'buzzrickson', name: "Buzz Rickson's" }, { key: 'ironheart', name: 'Iron Heart' },
  { key: 'cabourn', name: 'Nigel Cabourn' }, { key: 'engineeredgarments', name: 'Engineered Garments' },
  { key: 'arpenteur', name: 'Arpenteur' }, { key: 'bonnefacture', name: 'De Bonne Facture' }, { key: 'lavenham', name: 'Lavenham' },
  { key: 'gloverall', name: 'Gloverall' }, { key: 'lechameau', name: 'Le Chameau' },
  { key: 'jamiesons', name: "Jamieson's of Shetland" }, { key: 'johnstons', name: 'Johnstons of Elgin' },
  { key: 'ballantyne', name: 'Ballantyne' }, { key: 'colhays', name: "Colhay's" },
  { key: 'andersenandersen', name: 'Andersen-Andersen' }, { key: 'snsherning', name: 'S.N.S. Herning' },
  { key: 'letricoteur', name: 'Le Tricoteur' }, { key: 'guernseywoollens', name: 'Guernsey Woollens' },
  { key: 'northseaclothing', name: 'North Sea Clothing' }, { key: 'peregrine', name: 'Peregrine' },
  { key: 'howlin', name: "Howlin'" },
  { key: 'turnbull', name: 'Turnbull & Asser' }, { key: 'emmawillis', name: 'Emma Willis' }, { key: 'budd', name: 'Budd Shirtmakers' },
  { key: '100hands', name: '100 Hands' }, { key: 'finamore', name: 'Finamore' }, { key: 'barba', name: 'Barba' },
  { key: 'borrelli', name: 'Luigi Borrelli' }, { key: 'inglese', name: 'G. Inglese' }, { key: 'luxire', name: 'Luxire' },
  { key: 'fullcount', name: 'Full Count' }, { key: 'momotaro', name: 'Momotaro' }, { key: 'dartisan', name: "Studio D'Artisan" },
  { key: 'pureblue', name: 'Pure Blue Japan' }, { key: '3sixteen', name: '3sixteen' }, { key: 'tellason', name: 'Tellason' },
  { key: 'orslow', name: 'orSlow' }, { key: 'hiut', name: 'Hiut Denim' }, { key: 'samuraijeans', name: 'Samurai Jeans' },
  { key: 'incotex', name: 'Incotex' }, { key: 'berwich', name: 'Berwich' }, { key: 'pttorino', name: 'PT Torino' },
  { key: 'pt01', name: 'PT Torino' },
  { key: 'jpress', name: 'J. Press' }, { key: 'oconnells', name: "O'Connell's" }, { key: 'andovershop', name: 'The Andover Shop' },
  { key: 'mercerandsons', name: 'Mercer & Sons' }, { key: 'mercersons', name: 'Mercer & Sons' },
  { key: 'portugueseflannel', name: 'Portuguese Flannel' }, { key: 'gitman', name: 'Gitman Vintage' },
  { key: 'battenwear', name: 'Battenwear' }, { key: 'beams', name: 'Beams Plus' },
  { key: 'pantherella', name: 'Pantherella' }, { key: 'bresciani', name: 'Bresciani' },
];

const SOLID: BrandEntry[] = [
  { key: 'uniqlo', name: 'Uniqlo' }, { key: 'muji', name: 'Muji' }, { key: 'arket', name: 'Arket' },
  { key: 'levis', name: "Levi's" }, { key: 'carhartt', name: 'Carhartt' }, { key: 'patagonia', name: 'Patagonia' },
  { key: 'arcteryx', name: "Arc'teryx" }, { key: 'fjallraven', name: 'Fjällräven' }, { key: 'llbean', name: 'L.L.Bean' },
  { key: 'danner', name: 'Danner' }, { key: 'loake', name: 'Loake' }, { key: 'grenson', name: 'Grenson' },
  { key: 'allenedmonds', name: 'Allen Edmonds' }, { key: 'wolverine', name: 'Wolverine' }, { key: 'blundstone', name: 'Blundstone' },
  { key: 'stoneisland', name: 'Stone Island' }, { key: 'cpcompany', name: 'C.P. Company' }, { key: 'belstaff', name: 'Belstaff' },
  { key: 'burberry', name: 'Burberry' }, { key: 'paulsmith', name: 'Paul Smith' }, { key: 'fredperry', name: 'Fred Perry' },
  { key: 'toddsnyder', name: 'Todd Snyder' }, { key: 'buckmason', name: 'Buck Mason' }, { key: 'taylorstitch', name: 'Taylor Stitch' },
  { key: 'flintandtinder', name: 'Flint and Tinder' }, { key: 'norseprojects', name: 'Norse Projects' },
  { key: 'ourlegacy', name: 'Our Legacy' }, { key: 'adaysmarch', name: "A Day's March" }, { key: 'nn07', name: 'NN.07' },
  { key: 'unitedarrows', name: 'United Arrows' }, { key: 'commonprojects', name: 'Common Projects' },
  { key: 'hackett', name: 'Hackett' }, { key: 'eton', name: 'Eton' }, { key: 'charlestyrwhitt', name: 'Charles Tyrwhitt' },
  { key: 'tyrwhitt', name: 'Charles Tyrwhitt' }, { key: 'tmlewin', name: 'T.M. Lewin' }, { key: 'propercloth', name: 'Proper Cloth' },
  { key: 'nudie', name: 'Nudie Jeans' }, { key: 'brooksbrothers', name: 'Brooks Brothers' },
];

const VARIABLE: BrandEntry[] = [
  { key: 'jcrew', name: 'J.Crew' }, { key: 'bananarepublic', name: 'Banana Republic' }, { key: 'gap', name: 'Gap' },
  { key: 'abercrombie', name: 'Abercrombie & Fitch' }, { key: 'americaneagle', name: 'American Eagle' },
  { key: 'everlane', name: 'Everlane' }, { key: 'bonobos', name: 'Bonobos' }, { key: 'massimodutti', name: 'Massimo Dutti' },
  { key: 'mango', name: 'Mango' }, { key: 'reiss', name: 'Reiss' }, { key: 'tedbaker', name: 'Ted Baker' },
  { key: 'scotchsoda', name: 'Scotch & Soda' }, { key: 'superdry', name: 'Superdry' }, { key: 'jackjones', name: 'Jack & Jones' },
  { key: 'celio', name: 'Celio' }, { key: 'dockers', name: 'Dockers' }, { key: 'nautica', name: 'Nautica' },
  { key: 'guess', name: 'Guess' }, { key: 'hugoboss', name: 'Hugo Boss' }, { key: 'boss', name: 'Hugo Boss' },
  { key: 'armani', name: 'Armani' }, { key: 'calvinklein', name: 'Calvin Klein' }, { key: 'tommyhilfiger', name: 'Tommy Hilfiger' },
  { key: 'tommy', name: 'Tommy Hilfiger' }, { key: 'lacoste', name: 'Lacoste' }, { key: 'gant', name: 'GANT' },
  { key: 'benetton', name: 'Benetton' }, { key: 'esprit', name: 'Esprit' }, { key: 'next', name: 'Next' },
  { key: 'mossbros', name: 'Moss Bros' }, { key: 'marksandspencer', name: 'Marks & Spencer' },
  { key: 'marksspencer', name: 'Marks & Spencer' }, { key: 'drmartens', name: 'Dr. Martens' },
  { key: 'docmartens', name: 'Dr. Martens' }, { key: 'clarks', name: 'Clarks' }, { key: 'timberland', name: 'Timberland' },
  { key: 'northface', name: 'The North Face' }, { key: 'landsend', name: "Lands' End" }, { key: 'dickies', name: 'Dickies' },
  { key: 'lee', name: 'Lee' }, { key: 'wrangler', name: 'Wrangler' }, { key: 'aldo', name: 'ALDO' },
  { key: 'stevemadden', name: 'Steve Madden' },
];

const FAST_FASHION: BrandEntry[] = [
  { key: 'zara', name: 'Zara' }, { key: 'asos', name: 'ASOS' }, { key: 'hm', name: 'H&M' },
  { key: 'boohoo', name: 'Boohoo' }, { key: 'prettylittlething', name: 'PrettyLittleThing' },
  { key: 'shein', name: 'Shein' }, { key: 'primark', name: 'Primark' }, { key: 'fashionnova', name: 'Fashion Nova' },
  { key: 'forever21', name: 'Forever 21' }, { key: 'missguided', name: 'Missguided' }, { key: 'romwe', name: 'Romwe' },
  { key: 'temu', name: 'Temu' }, { key: 'aliexpress', name: 'AliExpress' }, { key: 'wish', name: 'Wish' },
  { key: 'cider', name: 'Cider' }, { key: 'bershka', name: 'Bershka' }, { key: 'pullandbear', name: 'Pull & Bear' },
  { key: 'stradivarius', name: 'Stradivarius' }, { key: 'newlook', name: 'New Look' },
  { key: 'riverisland', name: 'River Island' }, { key: 'topman', name: 'Topman' },
  { key: 'zaful', name: 'Zaful' }, { key: 'nastygal', name: 'Nasty Gal' }, { key: 'isawitfirst', name: 'I Saw It First' },
  { key: 'oldnavy', name: 'Old Navy' }, { key: 'hollister', name: 'Hollister' }, { key: 'matalan', name: 'Matalan' },
  { key: 'cottonon', name: 'Cotton On' },
];

function normBrand(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function matchBrand(input: string, list: { key: string; name: string }[]) {
  const n = normBrand(input);
  if (!n) return null;
  for (const b of list) {
    const k = b.key;
    if (n === k) return b;
    if (k.length >= 4 && n.startsWith(k)) return b;
    if (k.length >= 7 && (n.endsWith(k) || n.includes(k))) return b;
  }
  return null;
}

function scoreBrand(brandRaw: string): Vector & { unverified: boolean } {
  const base = { key: 'brand', label: 'Brand consistency' };
  const trimmed = brandRaw.trim();
  if (!trimmed) {
    return { ...base, score: 16, unverified: true, note: 'No brand given — with no track record to check, we score it as an unknown.' };
  }
  const heritage = matchBrand(trimmed, HERITAGE);
  if (heritage) {
    return { ...base, score: 5, unverified: false, note: `${heritage.name} has a verifiable track record of consistent quality.` };
  }
  const solid = matchBrand(trimmed, SOLID);
  if (solid) {
    return { ...base, score: 8, unverified: false, note: `${solid.name} is a dependable maker — quality generally holds up, though check the specific line.` };
  }
  const variable = matchBrand(trimmed, VARIABLE);
  if (variable) {
    return { ...base, score: 13, unverified: false, note: `${variable.name} is a known name whose quality varies line to line — judge the garment, not the label.` };
  }
  const fast = matchBrand(trimmed, FAST_FASHION);
  if (fast) {
    return { ...base, score: 22, unverified: false, note: `${fast.name} is built for speed and turnover, not consistency — quality varies batch to batch.` };
  }
  return { ...base, score: 15, unverified: true, note: "We couldn't verify this brand's track record — scored cautiously as an unknown, not punished." };
}

const LONGEVITY_BY_TYPE: Record<string, { score: number; note: string }> = {
  Coat: { score: 6, note: 'A coat is a classic category with a long style life — cost-per-wear works in your favour.' },
  Blazer: { score: 6, note: 'A blazer is about as time-proof as menswear gets, provided the cut stays sober.' },
  Trousers: { score: 6, note: 'Trousers in classic cuts outlast trend cycles.' },
  Shirt: { score: 6, note: 'A shirt is wardrobe infrastructure — classic collars do not date.' },
  Shoes: { score: 6, note: 'Good shoes on classic lasts age into character rather than out of style.' },
  Knitwear: { score: 6, note: 'Classic knitwear survives decades of trend churn.' },
  Accessories: { score: 12, note: 'Accessories skew trend-adjacent — statement pieces date fastest.' },
  Other: { score: 14, note: 'An undefined category makes longevity hard to underwrite — scored trend-adjacent.' },
};

function scoreLongevity(garment: string, price: number): Vector {
  const l = LONGEVITY_BY_TYPE[garment] || LONGEVITY_BY_TYPE.Other;
  let score = l.score;
  let note = l.note;
  if (price < 50) {
    score = Math.min(25, score + 5);
    note += ' Priced under £50, it also carries a high-turnover production signal (+5).';
  }
  return { key: 'longevity', label: 'Style longevity', score, note };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function verdictFor(total: number): { label: string; color: string } {
  if (total <= 30) return { label: 'Low risk — buy with confidence', color: C.success };
  if (total <= 60) return { label: 'Moderate risk — dig deeper first', color: C.warning };
  return { label: 'High risk — pause before committing', color: C.danger };
}

function vectorColor(score: number): string {
  if (score <= 8) return C.success;
  if (score <= 16) return C.warning;
  return C.danger;
}

/* ---------- Methodology copy (rendered as bullets) ---------- */
const METHOD_POINTS: { title: string; body: string }[] = [
  {
    title: 'Quality opacity (0–25)',
    body: 'Named natural fibres — wool, cashmere, linen, leather, cotton — score low because you can verify them before buying. Blends and mixed compositions score mid. Synthetic-dominant or unspecified fabric scores high.',
  },
  {
    title: 'Fit uncertainty (0–25)',
    body: 'Accessories and shoes carry the least sizing risk; shirts and knitwear sit in the middle; trousers, blazers and coats are the hardest to fit without trying them on.',
  },
  {
    title: 'Brand consistency (0–25)',
    body: "Scored against a built-in directory of roughly 230 menswear labels in four tiers: heritage and quality makers score lowest, dependable mid-tier names slightly higher, known high-street labels with variable quality sit mid-range, and recognised fast fashion scores high. Brands we can't verify default to a cautious middle — flagged, never punished.",
  },
  {
    title: 'Style longevity (0–25)',
    body: 'Classic garment categories score low; accessories and undefined categories skew trend-adjacent. Anything priced under £50 adds 5 points as a high-turnover signal.',
  },
];

/* ---------- Self-contained layout styles (no external CSS dependency) ---------- */

const S: Record<string, React.CSSProperties> = {
  outer: { minHeight: '100vh', backgroundColor: C.page, fontFamily: FONT_BODY, color: C.text },
  container: {
    maxWidth: 640,
    margin: '0 auto',
    padding: '48px 26px 96px',
    boxSizing: 'border-box',
  },
  card: {
    backgroundColor: C.card,
    border: `1px solid ${C.border}`,
    borderRadius: 18,
    padding: '28px 24px',
    marginTop: 32,
    boxShadow: '0 10px 30px rgba(43,30,20,0.10)',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    backgroundColor: C.card,
    border: `1px solid ${C.borderStrong}`,
    borderRadius: 10,
    padding: '13px 14px',
    fontSize: 16,
    fontFamily: FONT_BODY,
    color: C.text,
    outline: 'none',
  },
  label: {
    display: 'block',
    fontFamily: FONT_BODY,
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: C.secondary,
    marginBottom: 7,
  },
  primaryButton: {
    display: 'flex',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    boxSizing: 'border-box',
    backgroundColor: C.contrast,
    color: C.onBrand,
    fontFamily: FONT_BODY,
    fontSize: 16,
    fontWeight: 600,
    letterSpacing: '0.02em',
    border: 'none',
    borderRadius: 12,
    padding: '16px 18px',
    cursor: 'pointer',
  },
};

function App() {
  const [garment, setGarment] = useState('');
  const [priceText, setPriceText] = useState('');
  const [material, setMaterial] = useState('');
  const [brand, setBrand] = useState('');
  const [materialFocused, setMaterialFocused] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<null | { total: number; vectors: Vector[]; garment: string; price: number }>(null);
  const [showMethod, setShowMethod] = useState(false);
  const resultRef = useRef<HTMLDivElement | null>(null);

  const materialMatches = useMemo(() => {
    const q = material.trim().toLowerCase();
    if (!q) return MATERIAL_SUGGESTIONS;
    return MATERIAL_SUGGESTIONS.filter((s) => s.includes(q) && s !== q);
  }, [material]);

  const submit = () => {
    const price = parseFloat(priceText.replace(/[£,\s]/g, ''));
    if (!garment) {
      setError('Choose a garment type first.');
      return;
    }
    if (!priceText.trim() || isNaN(price) || price <= 0) {
      setError('Enter the price in £ — it feeds two of the four risk vectors.');
      return;
    }
    setError('');
    const vectors = [scoreQuality(material), scoreFit(garment), scoreBrand(brand), scoreLongevity(garment, price)];
    const total = vectors.reduce((sum, v) => sum + v.score, 0);
    setResult({ total, vectors, garment, price });
    logCalculation({
      garment_type: garment,
      price,
      price_bucket: priceBucket(price),
      material: material.trim() || null,
      brand: brand.trim() || null,
      quality_score: vectors[0].score,
      fit_score: vectors[1].score,
      brand_score: vectors[2].score,
      longevity_score: vectors[3].score,
      total_score: total,
    });
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  const reset = () => {
    setResult(null);
    setGarment('');
    setPriceText('');
    setMaterial('');
    setBrand('');
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const verdict = result ? verdictFor(result.total) : null;

  return (
    <div style={S.outer}>
      <div style={S.container}>
        {/* Masthead */}
        <header style={{ textAlign: 'center' }}>
          <p style={{ fontFamily: FONT_BODY, fontSize: 12, letterSpacing: '0.28em', color: C.contrast, fontWeight: 600, margin: 0 }}>
            E T H A I O N
          </p>
          <h1 style={{ fontFamily: FONT_HEAD, fontSize: 40, lineHeight: 1.08, fontWeight: 600, margin: '16px 0 0' }}>
            The Regret Risk Calculator
          </h1>
          <p style={{ color: C.secondary, fontSize: 16, lineHeight: 1.6, margin: '16px auto 0', maxWidth: 430 }}>
            Score a purchase before you make it. Four risk vectors, one number out of 100 —{' '}
            <em>lower is better</em>. No sign-up, no email, no catch.
          </p>
        </header>

        {/* Form */}
        {!result && (
          <div style={S.card}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
              <div>
                <label style={S.label} htmlFor="garment">Garment type</label>
                <select
                  id="garment"
                  value={garment}
                  onChange={(e) => setGarment(e.target.value)}
                  style={{ ...S.input, appearance: 'none', WebkitAppearance: 'none', backgroundImage: 'linear-gradient(45deg, transparent 50%, #7c4a17 50%), linear-gradient(135deg, #7c4a17 50%, transparent 50%)', backgroundPosition: 'calc(100% - 20px) 55%, calc(100% - 14px) 55%', backgroundSize: '6px 6px', backgroundRepeat: 'no-repeat' }}
                >
                  <option value="">Select a type…</option>
                  {GARMENT_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={S.label} htmlFor="price">Price</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: C.muted, fontSize: 16 }}>£</span>
                  <input
                    id="price"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    placeholder="120"
                    value={priceText}
                    onChange={(e) => setPriceText(e.target.value)}
                    style={{ ...S.input, paddingLeft: 30 }}
                  />
                </div>
              </div>

              <div>
                <label style={S.label} htmlFor="material">Material</label>
                <input
                  id="material"
                  type="text"
                  placeholder="e.g. wool, cashmere, polyester blend…"
                  value={material}
                  onChange={(e) => setMaterial(e.target.value)}
                  onFocus={() => setMaterialFocused(true)}
                  onBlur={() => setTimeout(() => setMaterialFocused(false), 150)}
                  autoComplete="off"
                  style={S.input}
                />
                {materialFocused && materialMatches.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                    {materialMatches.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); setMaterial(s); }}
                        style={{ backgroundColor: C.soft, border: `1px solid ${C.border}`, color: C.contrast, fontSize: 13, fontFamily: FONT_BODY, cursor: 'pointer', borderRadius: 999, padding: '5px 13px' }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label style={S.label} htmlFor="brand">Brand</label>
                <input
                  id="brand"
                  type="text"
                  placeholder="e.g. Drake's, Zara, or a maker we may not know"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  autoComplete="off"
                  style={S.input}
                />
              </div>

              {error && (
                <p style={{ color: C.danger, fontSize: 14, margin: 0 }}>{error}</p>
              )}

              <button type="button" onClick={submit} style={S.primaryButton}>
                <Scale size={18} />
                Score this purchase
              </button>
              <p style={{ color: C.muted, fontSize: 12.5, textAlign: 'center', margin: 0, lineHeight: 1.5 }}>
                The result appears instantly, right here. Nothing to unlock.
              </p>
            </div>
          </div>
        )}

        {/* Result */}
        {result && verdict && (
          <div ref={resultRef} style={{ scrollMarginTop: 24 }}>
            <div style={S.card}>
              <p style={{ ...S.label, textAlign: 'center', marginBottom: 4 }}>
                {result.garment} · £{result.price.toLocaleString('en-GB', { maximumFractionDigits: 2 })} · regret risk
              </p>
              <p style={{ fontFamily: FONT_HEAD, fontSize: 72, lineHeight: 1, fontWeight: 700, margin: '12px 0 0', color: verdict.color, textAlign: 'center' }}>
                {result.total}
                <span style={{ fontSize: 26, fontWeight: 500, color: C.muted }}> / 100</span>
              </p>
              <p style={{ display: 'block', width: 'fit-content', margin: '16px auto 0', backgroundColor: C.soft, border: `1px solid ${C.border}`, color: verdict.color, fontSize: 14.5, fontWeight: 600, borderRadius: 999, padding: '7px 17px', textAlign: 'center' }}>
                {verdict.label}
              </p>

              {/* Breakdown */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 22, marginTop: 30 }}>
                {result.vectors.map((v) => (
                  <div key={v.key}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                      <p style={{ fontFamily: FONT_HEAD, fontSize: 19, fontWeight: 600, margin: 0 }}>{v.label}</p>
                      <p style={{ fontSize: 13.5, fontWeight: 600, color: vectorColor(v.score), margin: 0, whiteSpace: 'nowrap' }}>
                        {v.score} / 25
                      </p>
                    </div>
                    <div style={{ height: 6, width: '100%', overflow: 'hidden', borderRadius: 999, backgroundColor: C.page, marginTop: 9 }}>
                      <div
                        style={{ height: '100%', borderRadius: 999, width: `${Math.max(4, (v.score / 25) * 100)}%`, backgroundColor: vectorColor(v.score), transition: 'width 600ms ease' }}
                      />
                    </div>
                    <p style={{ color: C.secondary, fontSize: 14, lineHeight: 1.55, margin: '9px 0 0' }}>{v.note}</p>
                  </div>
                ))}
              </div>

              {/* Embedded CTA */}
              <div style={{ backgroundColor: C.soft, border: `1px solid ${C.border}`, borderRadius: 14, padding: '22px 20px', marginTop: 34 }}>
                <p style={{ fontFamily: FONT_HEAD, fontSize: 21, lineHeight: 1.35, fontWeight: 600, margin: 0 }}>
                  Want help finding pieces that score under 30?
                </p>
                <p style={{ color: C.secondary, fontSize: 14.5, lineHeight: 1.6, margin: '10px 0 0' }}>
                  That's exactly what Ethaion does — an AI valet that vets material, maker and fit against your own wardrobe before you spend a pound.
                </p>
                <a
                  href="https://app.ethaion.com"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, boxSizing: 'border-box', width: '100%', backgroundColor: C.contrast, color: C.onBrand, fontSize: 15.5, fontWeight: 600, textDecoration: 'none', borderRadius: 12, padding: '15px 18px', marginTop: 20 }}
                >
                  Meet Ethaion
                  <ArrowRight size={17} />
                </a>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
                <button
                  type="button"
                  onClick={reset}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', color: C.contrast, fontFamily: FONT_BODY, fontSize: 14.5, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3, padding: 6 }}
                >
                  <RotateCcw size={15} />
                  Recalculate — try another piece
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Methodology (transparency) */}
        <div style={{ marginTop: 36 }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={() => setShowMethod(!showMethod)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: C.muted, fontFamily: FONT_BODY, fontSize: 13.5, cursor: 'pointer', padding: 6 }}
            >
              How the scoring works
              {showMethod ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
          </div>
          {showMethod && (
            <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '22px 22px', marginTop: 12 }}>
              <p style={{ color: C.secondary, fontSize: 13.5, lineHeight: 1.65, margin: 0 }}>
                Each purchase is scored 0–25 on four vectors, summed to a total out of 100 — lower is better.
              </p>
              <ul style={{ listStyle: 'none', margin: '16px 0 0', padding: 0 }}>
                {METHOD_POINTS.map((pt) => (
                  <li key={pt.title} style={{ display: 'flex', gap: 12, marginTop: 14, alignItems: 'flex-start' }}>
                    <span style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: C.brand, marginTop: 8, flexShrink: 0 }} />
                    <p style={{ color: C.secondary, fontSize: 13.5, lineHeight: 1.65, margin: 0 }}>
                      <strong style={{ color: C.text }}>{pt.title}.</strong> {pt.body}
                    </p>
                  </li>
                ))}
              </ul>
              <p style={{ color: C.secondary, fontSize: 13.5, lineHeight: 1.65, margin: '16px 0 0' }}>
                The rubric is deliberately rigorous rather than flattering — a tool like this only earns trust by being honest.
              </p>
            </div>
          )}
          <p style={{ color: C.muted, fontSize: 12, textAlign: 'center', lineHeight: 1.6, margin: '22px 0 0' }}>
            Anonymous usage only: we log the garment type, price bracket and score to understand what people check.
            No account, no email, no tracking of who you are.
          </p>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
