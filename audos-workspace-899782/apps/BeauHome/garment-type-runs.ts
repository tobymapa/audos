/**
 * THE RUNS — how each category's types group on the root (26a) and the
 * category plate (26b): the tailor's own runs, in the order a tailor would
 * set them. FIX — written once, identical for every reader (29b).
 *
 * Every visible garment type id appears in EXACTLY ONE run. The first run
 * of each category is its SAMPLE RUN — the one the Index root shows in the
 * by-category reading (“a sample run on each row”, 29a).
 */
import type { GarmentCategoryId } from './garment-type-model';

export interface GarmentRun {
  label: string;
  /** The one-line FIX description of what the run is for. */
  note: string;
  typeIds: string[];
}

export const GARMENT_RUNS: Record<Exclude<GarmentCategoryId, 'other'>, GarmentRun[]> = {
  tops: [
    { label: 'Button-front', note: 'Collared and cuffed — the layer tailoring is built over.', typeIds: ['oxford-button-down-shirt', 'poplin-dress-shirt', 'twill-dress-shirt', 'end-on-end-shirt', 'chambray-shirt', 'denim-shirt', 'western-shirt', 'flannel-shirt', 'chamois-shirt', 'linen-shirt', 'grandad-collar-shirt', 'popover-shirt', 'corduroy-shirt', 'madras-shirt', 'seersucker-shirt', 'work-shirt', 'fatigue-shirt', 'winchester-shirt', 'tattersall-shirt', 'gingham-shirt', 'club-collar-shirt', 'pin-collar-shirt', 'marcella-dress-shirt'] },
    { label: 'Camp & resort', note: 'Open collars and warm-weather ease — worn untucked by design.', typeIds: ['camp-collar-shirt', 'guayabera', 'bowling-shirt', 'aloha-shirt', 'safari-shirt'] },
    { label: 'Polos', note: 'The collared middle ground between shirt and tee.', typeIds: ['pique-polo', 'jersey-polo', 'terry-polo', 'long-sleeve-polo', 'zip-polo'] },
    { label: 'Jersey & tees', note: 'Knitted cotton — what the casual half of a week is built on.', typeIds: ['classic-tee', 'loopwheel-tee', 'pocket-tee', 'v-neck-tee', 'long-sleeve-tee', 'mock-neck-tee', 'baseball-tee', 'ringer-tee', 'breton-shirt', 'henley', 'terry-camp-shirt', 'rugby-shirt'] },
  ],
  knitwear: [
    { label: 'Crew necks', note: 'The workhorse run — one per weight, coldest wool first.', typeIds: ['shetland-crew', 'brushed-shetland', 'lambswool-crew', 'donegal-crew', 'merino-crew', 'cashmere-crew', 'cotton-crew', 'linen-crew', 'camelhair-crew', 'alpaca-crew', 'cable-crew'] },
    { label: 'Island & gansey', note: 'Dense working knits from cold coasts — outerwear in yarn.', typeIds: ['aran-sweater', 'guernsey-sweater', 'submariner-rollneck', 'fisherman-rib-crew', 'nordic-sweater', 'lopapeysa', 'commando-sweater', 'fair-isle-sweater'] },
    { label: 'Rollnecks & fine gauge', note: 'The dressed end of knitwear — what replaces a tie.', typeIds: ['fine-gauge-rollneck', 'cashmere-rollneck', 'mock-neck-knit', 'v-neck-sweater', 'cricket-sweater'] },
    { label: 'Vests', note: 'A third layer that adds warmth without a sleeve.', typeIds: ['sweater-vest', 'fair-isle-vest'] },
    { label: 'Cardigans', note: 'The knit that opens — a jacket’s job at a knit’s weight.', typeIds: ['cardigan', 'shawl-collar-cardigan', 'zip-through-cardigan', 'aran-cardigan', 'cowichan-cardigan'] },
    { label: 'Polo collars & zips', note: 'Collared knits — mid-century smart-casual in one run.', typeIds: ['knitted-polo-shirt', 'polo-collar-sweater', 'knitted-tee', 'half-zip-knit'] },
  ],
  sweatshirts: [
    { label: 'All', note: 'Loopback cotton — the off-duty mid-layer, done properly.', typeIds: ['crewneck-sweatshirt', 'loopwheel-sweatshirt', 'reverse-weave-sweatshirt', 'salt-pepper-sweatshirt', 'pullover-hoodie', 'zip-hoodie', 'half-zip-sweatshirt', 'raglan-gym-sweatshirt', 'terry-sweatshirt'] },
  ],
  outerwear: [
    { label: 'Coats', note: 'Knee or above, worn over tailoring. Where your winter lives.', typeIds: ['wool-overcoat', 'chesterfield-coat', 'polo-coat', 'ulster-coat', 'greatcoat', 'british-warm', 'guards-coat', 'paletot', 'covert-coat', 'balmacaan', 'raglan-overcoat', 'loden-coat', 'duffle-coat', 'pea-coat', 'bridge-coat', 'car-coat'] },
    { label: 'Rain & wind', note: 'Built against weather first — formality second.', typeIds: ['mac-raincoat', 'trench-coat', 'rubberised-raincoat', 'anorak', 'cagoule', 'windbreaker', 'sailing-jacket'] },
    { label: 'Field & military', note: 'Pockets and belts. The run that answers cold work and nothing formal.', typeIds: ['m65-field-jacket', 'm43-field-jacket', 'm41-field-jacket', 'battledress-blouson', 'safari-jacket', 'sahariana', 'n1-deck-jacket', 'tanker-jacket', 'fishtail-parka', 'snorkel-parka', 'liner-jacket', 'donkey-jacket'] },
    { label: 'Flight jackets', note: 'Contractor patterns — each one a spec, not a style.', typeIds: ['ma1-bomber', 'a1-flight-jacket', 'a2-flight-jacket', 'g1-flight-jacket', 'b3-shearling-bomber', 'b10-flight-jacket', 'souvenir-jacket'] },
    { label: 'Blousons', note: 'Cut short, worn open or zipped — the city casual run.', typeIds: ['harrington-jacket', 'golfer-jacket', 'suede-blouson', 'wool-bomber', 'leather-biker-jacket', 'cafe-racer-jacket', 'varsity-jacket', 'track-jacket'] },
    { label: 'Work & country', note: 'Chore cloth, wax and shirt-weight jackets — the mending run.', typeIds: ['chore-coat', 'boilersuit', 'shop-coat', 'coach-jacket', 'overshirt', 'wool-shirt-jacket', 'cpo-jacket', 'denim-trucker', 'suede-trucker', 'barn-coat', 'mackinaw-cruiser', 'norfolk-jacket', 'waxed-field-jacket', 'waxed-motorcycle-jacket'] },
    { label: 'Quilted & down', note: 'Fill over cloth — half the weight of the coat run, none of the formality.', typeIds: ['quilted-jacket', 'quilted-gilet', 'down-gilet', 'puffer-jacket', 'down-parka', 'shearling-ranch-jacket', 'boiled-wool-jacket'] },
    { label: 'Technical & fleece', note: 'The mountain run — kept for the weather that asks for it.', typeIds: ['mountain-parka', 'shell-jacket', 'fleece-jacket', 'fleece-gilet', 'fisherman-smock'] },
  ],
  bottoms: [
    { label: 'Tailored', note: 'Wool and its summer stand-ins — half of every dressed outfit.', typeIds: ['flannel-trousers', 'worsted-trousers', 'fresco-trousers', 'cavalry-twill-trousers', 'tweed-trousers', 'gurkha-trousers', 'seersucker-trousers', 'linen-trousers', 'brace-top-trousers', 'oxford-bags', 'cricket-flannels'] },
    { label: 'Chinos & cotton', note: 'The everyday middle — smarter than denim, easier than wool.', typeIds: ['chinos', 'drawstring-trousers', 'moleskin-trousers', 'corduroy-trousers'] },
    { label: 'Denim & work', note: 'Cloth that improves with wear and mends in character.', typeIds: ['selvedge-jeans', 'classic-jeans', 'fatigue-pants', 'cargo-trousers', 'carpenter-pants', 'work-trousers', 'bib-overalls'] },
    { label: 'Jersey & deck', note: 'Drawstrings and jersey — the resting register.', typeIds: ['track-pants', 'sweatpants', 'deck-trousers'] },
    { label: 'Country', note: 'Cut for the field — the run tweed was woven for.', typeIds: ['breeks', 'plus-fours'] },
    { label: 'Shorts & swim', note: 'Above the knee — the hot end of the ruler.', typeIds: ['chino-shorts', 'linen-shorts', 'tailored-shorts', 'corduroy-shorts', 'gurkha-shorts', 'swim-shorts'] },
  ],
  formalwear: [
    { label: 'Odd jackets', note: 'A jacket without its trousers — the most-worn tailoring there is.', typeIds: ['navy-blazer', 'hopsack-blazer', 'unstructured-blazer', 'teba-jacket', 'tweed-sport-coat', 'linen-sport-coat', 'seersucker-jacket', 'madras-jacket', 'camelhair-blazer', 'corduroy-sport-coat'] },
    { label: 'Suits', note: 'One cloth, two pieces — the register you cannot improvise.', typeIds: ['worsted-suit', 'pinstripe-suit', 'flannel-suit', 'fresco-suit', 'linen-suit', 'seersucker-suit', 'cotton-suit', 'tweed-suit', 'corduroy-suit', 'mohair-suit'] },
    { label: 'Evening', note: 'Black tie and its furniture — worn rarely, judged closely.', typeIds: ['dinner-suit', 'white-dinner-jacket', 'velvet-dinner-jacket', 'smoking-jacket', 'mess-jacket', 'evening-tailcoat', 'evening-trousers', 'evening-waistcoat'] },
    { label: 'Ceremony & oddments', note: 'Morning dress, waistcoats and the club blazer.', typeIds: ['morning-coat', 'morning-trousers', 'stroller-jacket', 'odd-waistcoat', 'boating-blazer', 'nehru-jacket'] },
  ],
  'base-layers': [
    { label: 'Under', note: 'The quiet layer nobody sees and everybody feels.', typeIds: ['crew-undershirt', 'v-neck-undershirt', 'tank-undershirt', 'boxer-shorts', 'boxer-briefs', 'briefs', 'string-mesh-vest'] },
    { label: 'Thermal', note: 'The cold-day underlayer — wool first, waffle second.', typeIds: ['waffle-henley', 'thermal-long-johns', 'merino-base-top', 'merino-leggings', 'technical-base-top', 'heavyweight-thermal-crew', 'union-suit'] },
  ],
  shoes: [
    { label: 'Oxfords', note: 'Closed lacing — the dressed end of the shoe rack.', typeIds: ['cap-toe-oxford', 'wholecut-oxford', 'adelaide-oxford', 'full-brogue-oxford', 'semi-brogue', 'austerity-brogue', 'spectator-shoe', 'saddle-shoe', 'white-buck'] },
    { label: 'Derbies', note: 'Open lacing — one notch easier, most of the same rooms.', typeIds: ['plain-derby', 'split-toe-derby', 'longwing-derby', 'postman-shoe', 'tyrolean-shoe'] },
    { label: 'Loafers & monks', note: 'No laces at all — the run smart-casual actually lives in.', typeIds: ['penny-loafer', 'tassel-loafer', 'horsebit-loafer', 'kiltie-loafer', 'belgian-loafer', 'venetian-loafer', 'single-monk', 'double-monk'] },
    { label: 'Mocs & summer', note: 'Hand-sewn and soft-soled — the warm-weather run.', typeIds: ['driving-moc', 'boat-shoe', 'camp-moc', 'blucher-moc', 'wallabee', 'espadrille'] },
    { label: 'Boots', note: 'Ankle and above — where the cold half of the year stands.', typeIds: ['chukka-boot', 'desert-boot', 'chelsea-boot', 'jodhpur-boot', 'balmoral-boot', 'george-boot', 'country-brogue-boot', 'service-boot', 'moc-toe-boot', 'engineer-boot', 'logger-boot', 'lace-to-toe-boot', 'monkey-boot', 'hiking-boot', 'wellington-boot', 'duck-boot', 'deck-boot'] },
    { label: 'Evening & house', note: 'Patent, velvet and sheepskin — the indoors run.', typeIds: ['opera-pump', 'patent-oxford', 'albert-slipper', 'sheepskin-slipper'] },
    { label: 'Sneakers', note: 'The clean end of the sneaker world — nothing technical.', typeIds: ['minimal-leather-sneaker', 'leather-tennis-sneaker', 'gat-trainer', 'canvas-low-top', 'canvas-high-top', 'retro-runner'] },
    { label: 'Sandals', note: 'The hot end — leather first, never foam.', typeIds: ['leather-sandal', 'fisherman-sandal', 'gurkha-sandal', 'cork-footbed-sandal', 'veldskoen'] },
  ],
  accessories: [
    { label: 'Neckwear', note: 'Tie, square and scarf — the detail that finishes a collar.', typeIds: ['grenadine-tie', 'knitted-tie', 'printed-silk-tie', 'madder-tie', 'challis-tie', 'repp-stripe-tie', 'black-bow-tie', 'cravat', 'pocket-square', 'bandana'] },
    { label: 'Belts & braces', note: 'What holds the trousers — judged by leather and buckle.', typeIds: ['bridle-belt', 'suede-belt', 'woven-belt', 'webbing-belt', 'ribbon-belt', 'braces', 'cummerbund'] },
    { label: 'Scarves & gloves', note: 'The cold-weather pair — the first accessories winter asks for.', typeIds: ['cashmere-scarf', 'wool-scarf', 'silk-scarf', 'evening-scarf', 'leather-gloves', 'driving-gloves', 'shearling-gloves', 'knitted-gloves'] },
    { label: 'Socks & eyewear', note: 'Seen briefly, judged instantly.', typeIds: ['over-calf-socks', 'ragg-socks', 'sunglasses'] },
    { label: 'Watches', note: 'Field, dress, dive — one of each covers a life.', typeIds: ['field-watch', 'dress-watch', 'dive-watch', 'chronograph-watch'] },
    { label: 'Small goods', note: 'Leather and metal that outlast everything else on this page.', typeIds: ['bifold-wallet', 'card-holder', 'money-clip', 'city-umbrella', 'tie-bar', 'cufflinks', 'collar-pin'] },
  ],
  bags: [
    { label: 'All', note: 'What you carry says as much as what you wear.', typeIds: ['briefcase', 'attache-case', 'portfolio', 'holdall', 'canvas-tote', 'messenger-bag', 'musette', 'canvas-rucksack', 'field-satchel', 'game-bag', 'dopp-kit', 'garment-bag'] },
  ],
  hats: [
    { label: 'Brimmed', note: 'Felt and straw with a brim — the dressed run.', typeIds: ['fedora', 'trilby', 'panama-hat', 'pork-pie-hat', 'homburg', 'bowler-hat', 'top-hat', 'boater'] },
    { label: 'Caps', note: 'The flat-cap family — casual, and older than every hat above.', typeIds: ['flat-cap', 'newsboy-cap', 'baseball-cap', 'breton-cap', 'irish-walking-hat'] },
    { label: 'Cold & field', note: 'Wool, shearing and wax — hats that earn their keep.', typeIds: ['watch-cap', 'bobble-hat', 'deerstalker', 'beret', 'trapper-hat', 'boonie-hat', 'sou-wester', 'balaclava', 'bucket-hat'] },
  ],
};

/** The run one type id belongs to — null when the id is unknown/hidden. */
export function runOfType(typeId: string): { categoryId: GarmentCategoryId; run: GarmentRun } | null {
  for (const [categoryId, runs] of Object.entries(GARMENT_RUNS)) {
    for (const run of runs) {
      if (run.typeIds.includes(typeId)) return { categoryId: categoryId as GarmentCategoryId, run };
    }
  }
  return null;
}
