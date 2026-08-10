/**
 * THE PIECE INDEX — the full 13a taxonomy (design handoff screen 13a,
 * “The piece index, set as an index”): every garment type in the app's
 * own eleven categories, grouped by the runs a tailor would use, in the
 * exact order the reference sets them — PLUS the handful of types the
 * existing World of Menswear reference knew that 13a missed (appended to
 * their natural subgroups, so no existing data is dropped).
 *
 * `entry` links a type to its full World of Menswear entry id when one
 * exists — tapping such a type opens the entry; the rest are listed as
 * reference rows (the taxonomy is the point; the essays are filling in).
 */

export interface PieceIndexType {
  /** Display name, exactly as the 13a reference sets it. */
  name: string;
  /** World of Menswear entry id, when this type has a full entry. */
  entry?: string;
  /** True when the linked entry is a wardrobe essential — 'The core'. */
  core?: boolean;
}

export interface PieceIndexGroup {
  /** The tailor's-run label, mono small caps in the gutter. */
  label: string;
  types: PieceIndexType[];
}

export interface PieceIndexCategory {
  id: string;
  name: string;
  /** The one-line description under the category name. */
  blurb: string;
  groups: PieceIndexGroup[];
}

function t(name: string, entry?: string, core?: boolean): PieceIndexType {
  return entry ? (core ? { name, entry, core } : { name, entry }) : { name };
}

export const PIECE_INDEX_CATEGORIES: PieceIndexCategory[] = [
  {
    id: 'tops',
    name: 'Tops',
    blurb: 'Shirts, polos and turtlenecks — the layer everything else is built around.',
    groups: [
      { label: 'Button-front', types: [
        t('Oxford shirt (OCBD)', 'ocbd', true), t('Poplin dress shirt', 'dress-shirt', true), t('Pinpoint oxford'),
        t('End-on-end shirt'), t('Twill dress shirt'), t('Herringbone shirt'),
        t('Bengal stripe shirt'), t('Madras shirt'), t('Seersucker shirt'),
        t('Chambray shirt', 'chambray-shirt', true), t('Denim shirt'), t('Linen shirt', 'linen-shirt', true),
        t('Casual shirt'), t('Flannel shirt', 'flannel-shirt', true), t('Brushed cotton shirt'),
        t('Chamois shirt'), t('Western shirt', 'western-shirt'), t('Camp collar shirt', 'camp-collar-shirt'),
        t('Guayabera', 'guayabera'), t('Band collar shirt', 'grandad-collar-shirt'), t('Tunic shirt'),
        t('Popover'), t('Safari shirt'), t('Work shirt'),
        t('Overshirt', 'overshirt', true), t('Shirt jacket', 'shirt-jacket'),
      ] },
      { label: 'Jersey & knitted', types: [
        t('T-shirt', 't-shirt', true), t('Pocket tee'), t('Long-sleeve tee'),
        t('Breton top', 'breton-tee'), t('Henley', 'henley'), t('Polo', 'polo-shirt', true),
        t('Long-sleeve polo', 'polo-shirt', true), t('Knitted polo', 'knitted-polo'), t('Rugby shirt', 'rugby-shirt'),
        t('Tank vest'), t('Sleeveless tee'),
      ] },
    ],
  },
  {
    id: 'knitwear',
    name: 'Knitwear',
    blurb: 'Jumpers and cardigans — the mid-layer that carries three seasons.',
    groups: [
      { label: 'Pullovers', types: [
        t('Crew neck jumper', 'crew-neck-jumper', true), t('V-neck jumper', 'v-neck-jumper'), t('Roll neck (turtleneck)', 'roll-neck-jumper', true),
        t('Mock neck'), t('Boat neck jumper'), t('Saddle-shoulder crew'),
        t('Zip neck', 'zip-neck-jumper'), t('Half-zip', 'zip-neck-jumper'), t('Quarter-zip', 'zip-neck-jumper'),
        t('Shaker knit'), t('Fisherman\'s rib'), t('Aran cable knit', 'cable-knit-jumper'),
        t('Guernsey', 'guernsey-sweater'), t('Shetland', 'shetland-jumper'), t('Fair Isle', 'fair-isle-jumper'),
        t('Argyle jumper'), t('Cowichan'), t('Ski sweater'),
        t('Cricket jumper'), t('Marled crew'), t('Cashmere crew'),
        t('Lambswool crew'), t('Waffle knit', 'waffle-knit-sweater'),
      ] },
      { label: 'Sleeveless', types: [
        t('Sweater vest', 'slipover'), t('Slipover', 'slipover'), t('Knitted waistcoat'),
        t('Fair Isle vest'),
      ] },
      { label: 'Cardigans', types: [
        t('Cardigan', 'cardigan', true), t('Shawl collar cardigan', 'cardigan', true), t('Tennis cardigan'),
        t('Knitted blazer'), t('Zip cardigan'), t('Knitted overshirt'),
        t('Chore cardigan'),
      ] },
    ],
  },
  {
    id: 'sweatshirts',
    name: 'Sweatshirts',
    blurb: 'Hoodies, crewneck sweatshirts and fleece pullovers — the off-duty mid-layer, done properly.',
    groups: [
      { label: 'All', types: [
        t('Crewneck sweatshirt', 'crewneck-sweatshirt'), t('Hoodie', 'hoodie'), t('Zip-through hoodie', 'hoodie'),
        t('Raglan sweatshirt'), t('Track top'), t('Fleece pullover', 'fleece-pullover'),
        t('Half-zip fleece', 'fleece-pullover'), t('Sherpa fleece'), t('Hooded fleece'),
      ] },
    ],
  },
  {
    id: 'outerwear',
    name: 'Outerwear',
    blurb: 'The jacket or coat that decides what the whole outfit reads as.',
    groups: [
      { label: 'Town coats', types: [
        t('Overcoat', 'overcoat', true), t('Chesterfield overcoat', 'overcoat', true), t('Polo coat'),
        t('Covert coat', 'covert-coat'), t('Crombie'), t('British warm'),
        t('Ulster coat', 'ulster-coat'), t('Guards coat'), t('Balmacaan', 'balmacaan-coat'),
        t('Raglan coat', 'raglan-coat'), t('Loden coat'), t('Tyrolean coat'),
        t('Car coat', 'car-coat'), t('Duffle coat', 'duffle-coat'), t('Peacoat', 'peacoat', true),
        t('Reefer jacket', 'peacoat', true), t('Frock overcoat'), t('Inverness cape'),
        t('Cape'),
      ] },
      { label: 'Rain & wind', types: [
        t('Trench coat', 'trench-coat', true), t('Mackintosh', 'raincoat'), t('Raincoat', 'raincoat'),
        t('Bal collar raincoat', 'raincoat'), t('Anorak'), t('Cagoule'),
        t('Windbreaker'), t('Coach jacket'), t('Fishtail parka', 'parka'),
        t('Snorkel parka', 'parka'), t('Mountain parka', 'parka'), t('Ski jacket'),
      ] },
      { label: 'Country & work', types: [
        t('Waxed jacket', 'waxed-jacket', true), t('Barn coat', 'barn-jacket'), t('Chore coat', 'chore-coat', true),
        t('Bleu de travail', 'chore-coat', true), t('Donkey jacket'), t('Mackinaw'),
        t('Fisherman\'s smock'), t('Shooting jacket'), t('Norfolk jacket'),
        t('Hacking jacket'), t('Gilet', 'gilet'), t('Shooting vest'),
        t('Ranch jacket'), t('Down vest', 'gilet'), t('Loden janker', 'loden-janker'),
        t('Noragi', 'noragi'),
      ] },
      { label: 'Military & flight', types: [
        t('Field jacket', 'field-jacket', true), t('M-43 field jacket', 'field-jacket', true), t('M-65 field jacket', 'field-jacket', true),
        t('M-51 parka', 'parka'), t('Ike jacket'), t('Tanker jacket'),
        t('Deck jacket (N-1)', 'deck-jacket'), t('Bomber (MA-1)', 'bomber-jacket'), t('Flight jacket (B-3)'),
        t('Flight jacket (A-2)', 'bomber-jacket'), t('Flight jacket (G-1)', 'bomber-jacket'), t('Souvenir jacket'),
      ] },
      { label: 'Casual & leather', types: [
        t('Harrington', 'harrington-jacket', true), t('Varsity jacket'), t('Denim trucker jacket'),
        t('Leather trucker'), t('Café racer'), t('Double rider'),
        t('Suede blouson', 'blouson'), t('Leather bomber', 'bomber-jacket'), t('Shearling coat'),
        t('Quilted jacket'), t('Down jacket'), t('Puffer'),
      ] },
    ],
  },
  {
    id: 'trousers-bottoms',
    name: 'Trousers & bottoms',
    blurb: 'Chinos, wool trousers, denim and cord — half of every outfit you own.',
    groups: [
      { label: 'Tailored', types: [
        t('Wool dress trousers', 'dress-trousers', true), t('Flannel trousers', 'flannel-trousers'), t('Fresco trousers', 'dress-trousers', true),
        t('Cavalry twill trousers'), t('Whipcord trousers'), t('Tweed trousers'),
        t('Pleated trousers', 'pleated-trousers'), t('Flat-front trousers'), t('Gurkha trousers', 'gurkha-trousers'),
        t('Officer\'s chinos', 'chinos', true), t('Linen trousers', 'linen-trousers'), t('Morning stripe trousers'),
        t('Tuxedo trousers'),
      ] },
      { label: 'Casual', types: [
        t('Chinos', 'chinos', true), t('Corduroys', 'corduroy-trousers'), t('Moleskin trousers', 'moleskin-trousers'),
        t('Five-pocket cords', 'corduroy-trousers'), t('Fatigues'), t('Cargo trousers', 'cargo-trousers'),
        t('Carpenter pants'), t('Painter pants'), t('Dungarees'),
        t('Boiler suit'), t('Drawstring trousers'), t('Sailor trousers'),
        t('Sweatpants', 'joggers'), t('Track pants', 'joggers'),
      ] },
      { label: 'Denim', types: [
        t('Straight jeans', 'jeans', true), t('Slim jeans', 'jeans', true), t('Relaxed jeans', 'jeans', true),
        t('Selvedge denim', 'jeans', true), t('Raw denim', 'jeans', true), t('Black jeans', 'jeans', true),
        t('Denim carpenter'),
      ] },
      { label: 'Riding & country', types: [
        t('Jodhpurs'), t('Breeches'), t('Plus fours'),
        t('Knickerbockers'),
      ] },
      { label: 'Shorts & swim', types: [
        t('Tailored shorts', 'shorts', true), t('Chino shorts', 'shorts', true), t('Bermuda shorts', 'shorts', true),
        t('Cargo shorts', 'shorts', true), t('Sweat shorts', 'shorts', true), t('Swim shorts', 'shorts', true),
        t('Swim briefs'), t('Board shorts', 'shorts', true),
      ] },
    ],
  },
  {
    id: 'formalwear',
    name: 'Formalwear',
    blurb: 'Blazer and suit — the register you cannot improvise on the day.',
    groups: [
      { label: 'Suits', types: [
        t('Single-breasted suit', 'two-piece-suit', true), t('Double-breasted suit', 'double-breasted-suit'), t('Three-piece suit', 'three-piece-suit'),
        t('Linen suit'), t('Seersucker suit'), t('Flannel suit'),
        t('Dinner suit', 'dinner-jacket'),
      ] },
      { label: 'Odd jackets', types: [
        t('Blazer', 'blazer', true), t('Sport coat', 'sport-coat', true), t('Tweed jacket', 'sport-coat', true),
        t('Unstructured jacket'), t('Teba jacket', 'teba-jacket'), t('Safari jacket', 'saharienne'),
        t('Sahariana', 'saharienne'), t('Nehru jacket', 'nehru-jacket'), t('Mandarin jacket', 'nehru-jacket'),
        t('Smoking jacket', 'smoking-jacket'), t('Chore blazer'), t('Guards jacket'),
      ] },
      { label: 'Waistcoats', types: [
        t('Odd waistcoat', 'waistcoat'), t('Suit waistcoat', 'waistcoat'), t('Tweed waistcoat', 'waistcoat'),
        t('Dress waistcoat', 'waistcoat'),
      ] },
      { label: 'Black tie & ceremonial', types: [
        t('Dinner jacket', 'dinner-jacket'), t('White dinner jacket', 'dinner-jacket'), t('Tailcoat', 'evening-tailcoat'),
        t('Morning coat', 'morning-coat'), t('Frock coat'), t('Marcella dress shirt', 'dress-shirt', true),
        t('Wing collar shirt'), t('Cummerbund', 'cummerbund'), t('Self-tie bow tie', 'bow-tie'),
        t('Opera pumps', 'opera-pump'), t('Patent oxfords', 'oxford-shoe', true), t('Highland doublet'),
        t('Kilt'),
      ] },
    ],
  },
  {
    id: 'base-layers',
    name: 'Base layers',
    blurb: 'The quiet layer nobody sees — and everybody feels all day.',
    groups: [
      { label: 'Under', types: [
        t('Crew undershirt', 'undershirt', true), t('V-neck undershirt', 'undershirt', true), t('Sleeveless undershirt', 'undershirt', true),
        t('Boxer shorts'), t('Boxer briefs'), t('Briefs'),
        t('Trunks'), t('Long johns', 'long-johns'), t('Thermal top (base layer)', 'thermal-base-layer'),
        t('Merino base layer', 'merino-base-layer', true), t('Union suit'), t('Long-sleeve base layer', 'long-sleeve-base-layer'),
      ] },
      { label: 'Hosiery', types: [
        t('Over-the-calf dress socks', 'dress-socks', true), t('Ribbed cotton socks'), t('Wool boot socks'),
        t('Sport socks'), t('Cashmere socks'), t('Sock garters'),
      ] },
      { label: 'Sleep & home', types: [
        t('Dressing gown'), t('Pyjamas'), t('Nightshirt'),
        t('House slippers'),
      ] },
    ],
  },
  {
    id: 'shoes',
    name: 'Shoes',
    blurb: 'Oxford, loafer, boot, clean sneaker — the thing people notice last and judge first.',
    groups: [
      { label: 'Lace-ups', types: [
        t('Cap-toe oxford', 'oxford-shoe', true), t('Wholecut', 'wholecut-oxford'), t('Plain-toe derby', 'derby', true),
        t('Apron derby', 'derby', true), t('Norwegian split-toe', 'derby', true), t('Wingtip brogue', 'brogues'),
        t('Semi-brogue', 'brogues'), t('Longwing', 'brogues'), t('Ghillie brogue', 'brogues'),
        t('Blucher', 'derby', true), t('Buck'), t('Saddle shoe'),
        t('Spectator'),
      ] },
      { label: 'Slip-ons', types: [
        t('Penny loafer', 'loafer', true), t('Tassel loafer', 'loafer', true), t('Horsebit loafer', 'loafer', true),
        t('Belgian loafer', 'loafer', true), t('Driving shoe', 'driving-shoe'), t('Deck shoe', 'boat-shoe'),
        t('Moccasin', 'moccasin'), t('Espadrille', 'espadrille'), t('Single monk', 'monk-strap'),
        t('Double monk', 'monk-strap'), t('Monk boot'), t('Backless loafer', 'loafer', true),
        t('Huarache'), t('Sandal'), t('Clog'),
      ] },
      { label: 'Boots', types: [
        t('Chelsea boot', 'chelsea-boot', true), t('Chukka', 'chukka-boot'), t('Desert boot', 'desert-boot', true),
        t('Jodhpur boot', 'jodhpur-boot'), t('Balmoral boot'), t('Service boot'),
        t('Moc-toe boot'), t('Work boot'), t('Hiking boot'),
        t('Duck boot'), t('Engineer boot'), t('Cowboy boot'),
        t('Roper boot'), t('Riding boot'), t('Wellington boot'),
        t('Country brogue boot'), t('Snow boot'), t('Crepe-sole boot', 'crepe-sole-boot'),
      ] },
      { label: 'Sneakers', types: [
        t('Leather court sneaker', 'sneaker', true), t('Canvas plimsoll', 'sneaker', true), t('Nylon runner', 'sneaker', true),
        t('High-top'), t('Skate shoe'), t('Trail sneaker'),
        t('Tennis shoe', 'sneaker', true), t('Slip-on sneaker', 'sneaker', true),
      ] },
    ],
  },
  {
    id: 'accessories',
    name: 'Accessories',
    blurb: 'Belt, watch, tie, pocket square — the details that finish a look.',
    groups: [
      { label: 'Neckwear', types: [
        t('Silk tie', 'tie', true), t('Grenadine tie', 'tie', true), t('Knitted tie', 'tie', true),
        t('Wool tie', 'tie', true), t('Printed tie', 'tie', true), t('Bow tie', 'bow-tie'),
        t('Cravat', 'ascot-cravat'), t('Ascot', 'ascot-cravat'), t('Neckerchief'),
        t('Wool scarf', 'scarf', true), t('Silk scarf', 'scarf', true), t('Muffler', 'scarf', true),
        t('Snood'),
      ] },
      { label: 'Waist & wrist', types: [
        t('Dress belt', 'belt', true), t('Casual belt', 'belt', true), t('Woven belt', 'belt', true),
        t('Ribbon belt', 'belt', true), t('Braces', 'braces'), t('Watch', 'watch', true),
        t('Watch strap'), t('Pocket watch'), t('Bracelet'),
        t('Signet ring'), t('Cufflinks', 'cufflinks'), t('Tie bar', 'tie-bar'),
        t('Collar stays'), t('Collar pin', 'collar-bar'),
      ] },
      { label: 'Pocket & hand', types: [
        t('Pocket square', 'pocket-square'), t('Handkerchief'), t('Leather gloves', 'gloves', true),
        t('Driving gloves', 'gloves', true), t('Wool gloves', 'gloves', true), t('Mittens'),
        t('Sunglasses', 'sunglasses', true), t('Umbrella', 'umbrella'), t('Wallet', 'wallet', true),
        t('Card holder', 'wallet', true), t('Coin purse'), t('Key case', 'key-fob'),
        t('Lapel pin', 'lapel-pin'), t('Boutonnière'), t('Hat pin', 'hat-pin'),
      ] },
    ],
  },
  {
    id: 'bags',
    name: 'Bags',
    blurb: 'What you carry says as much as what you wear.',
    groups: [
      { label: 'All', types: [
        t('Briefcase', 'briefcase'), t('Attaché case', 'briefcase'), t('Gladstone bag'),
        t('Doctor\'s bag'), t('Portfolio', 'portfolio'), t('Messenger bag', 'messenger-bag'),
        t('Musette'), t('Tote', 'tote', true), t('Holdall (weekender)', 'weekender', true),
        t('Barrel bag'), t('Rucksack', 'backpack', true), t('Duffle', 'weekender', true),
        t('Garment bag'), t('Belt bag'), t('Camera bag'),
        t('Dopp kit', 'dopp-kit', true), t('Document tube', 'document-tube'),
      ] },
    ],
  },
  {
    id: 'hats-headwear',
    name: 'Hats & headwear',
    blurb: 'Last in the queue, and only ever when the rest is covered.',
    groups: [
      { label: 'All', types: [
        t('Fedora', 'fedora'), t('Trilby', 'trilby'), t('Homburg'),
        t('Bowler'), t('Porkpie'), t('Panama', 'panama-hat'),
        t('Boater', 'boater'), t('Flat cap', 'flat-cap'), t('Newsboy cap', 'newsboy-cap'),
        t('Tweed cap', 'flat-cap'), t('Beret', 'beret'), t('Baseball cap', 'baseball-cap', true),
        t('Watch cap (beanie)', 'beanie', true), t('Bucket hat', 'bucket-hat'), t('Sun hat', 'sun-hat'),
        t('Deerstalker'), t('Trapper hat'), t('Ushanka'),
        t('Balaclava'), t('Top hat'), t('Driving cap', 'driving-cap'),
        t('Wool felt hat', 'wool-felt-hat'),
      ] },
    ],
  },
];

/** Every type, flattened in browse order. */
export const PIECE_INDEX_TYPES: Array<PieceIndexType & { categoryId: string; group: string }> =
  PIECE_INDEX_CATEGORIES.flatMap((cat) =>
    cat.groups.flatMap((group) => group.types.map((type) => ({ ...type, categoryId: cat.id, group: group.label }))),
  );
