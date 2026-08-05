/**
 * GENERATED LIGNE CLAIRE ARTWORK — the static illustration files behind The
 * Rail's Tier 1 sub-category cards AND The Ledger's category rows (two maps,
 * RAIL_ILLUSTRATIONS and LEDGER_ILLUSTRATIONS, at the foot of this file).
 *
 * WHY THIS FILE EXISTS
 * illustrations.tsx draws every slot in code (inline SVG) and layers a static
 * artwork file on top; the drawing is only ever the placeholder. That works,
 * but ONE drawing has to serve every sub-category that shares a slot — so
 * Chelsea Boot and Desert Boot both drew the same boot, Crew Neck / V-Neck /
 * Zip Neck the same jumper, Waistcoat the suit, Watch and Pocket Square the
 * generic tag, Tote and Weekender the same bag.
 *
 * The first passes fixed those duplicates. This pass goes wider: EVERY Tier 1
 * sub-category should carry a real ligne claire plate, because a
 * unique-but-coded SVG is still the wrong drawing language for the house.
 * Work down the list at the foot of this file, in the order given.
 *
 * Each entry below is a bespoke illustration generated for Ethaion in the
 * house ligne claire register — clean single-weight ink outline, flat muted
 * fills, no shading, white ground, square — and hosted on the platform CDN
 * (durable URLs, the same arrangement the archetype photographs use in
 * illustrations.tsx). Keyed by SUB-CATEGORY id from rail-subcategories.ts,
 * not by slot, which is the whole point: two sub-categories on one slot can
 * now carry two different drawings.
 *
 * FALLBACK: an id that is not listed here — or a file that fails to load —
 * falls straight back to the coded SVG for its slot. Nothing breaks, and
 * adding artwork is a one-line change.
 *
 * TO ADD MORE: generate a square illustration to the same spec (ligne claire,
 * flat muted fills, plain white ground running to every edge, no border or
 * frame) and add its id + URL below.
 */

export const RAIL_ILLUSTRATIONS: Record<string, string> = {
  // Tops — the oxford-cloth button-down, the pique polo, the rolled tube
  // collar and the plain crew tee, each drawn rather than coded
  'oxford-shirt':
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785785950209-r6lg55.png',
  polo:
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785785978959-zaxg9s.png',
  // Turtleneck also shares the crewneck slot — the tall folded collar is the
  // whole point, and the coded jumper never had one
  turtleneck:
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785786004398-o1m87x.png',
  't-shirt':
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785786078429-a1s76k.png',
  // Bottoms — told apart by construction, not colour: flat front and belt
  // loops, pleats and turn-ups, five pockets and rivets, above the knee
  chinos:
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785786166497-1og9m3.png',
  'dress-trousers':
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785786189498-mewxs7.png',
  jeans:
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785786215788-pwngyu.png',
  shorts:
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785786237282-h90x0q.png',
  // Shoes — closed lacing, buckles and a backless slipper, told apart from
  // the shared derby and loafer drawings
  'oxford-shoe':
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785780509037-jbayol.png',
  'monk-strap':
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785780729124-ca1smh.png',
  mule:
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785780748528-mz8ja2.png',
  // Shoes — open derby lacing (quarters stitched over the vamp, no toe cap)
  // and the strapped slip-on, both on the same left-facing three-quarter view
  // as the Oxford plate above so the shoe cards read as one set
  derby:
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785786263806-8fhr0r.png',
  loafer:
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785786288304-1fwiyi.png',
  // Shoes — the elastic-sided boot and the two-eyelet chukka, told apart
  'chelsea-boot':
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785774350573-2lluuf.png',
  'desert-boot':
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785774375059-9kmwzs.png',
  // Knitwear — round neck, V notch, and zip hardware at the collar
  'crew-neck':
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785774397719-jp3lsx.png',
  'v-neck':
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785774711351-8yjzgd.png',
  'zip-neck':
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785774446331-kviv2u.png',
  // Knitwear — the slipover has no sleeves at all, so the crewneck drawing
  // was simply the wrong garment
  slipover:
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785780707549-pcvg7e.png',
  // Formalwear — sleeveless waistcoat vs the sleeved jacket
  waistcoat:
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785774467399-c8swk8.png',
  suit:
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785774493326-servg9.png',
  // Formalwear — the cutaway morning coat over striped trousers, not the
  // plain lounge suit it used to borrow
  'morning-suit':
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785780795143-vja8jw.png',
  // Accessories — both previously drew the generic tag
  watch:
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785774519485-p6750j.png',
  'pocket-square':
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785774547460-pu9jbj.png',
  // Accessories — the four that had no drawing of their own at all and fell
  // back to the generic tag SVG
  sunglasses:
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785780565120-qlffs4.png',
  braces:
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785780587729-i0h39b.png',
  cufflinks:
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785780609267-xwp7kg.png',
  wallet:
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785780639267-1x07cc.png',
  // Base layers — also on the generic tag until now
  boxers:
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785780683246-ys8z6p.png',
  socks:
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785780660758-ry6lea.png',
  // Bags — open-top tote vs the structured holdall
  tote:
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785774574958-k213cc.png',
  weekender:
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785774600497-2ox675.png',
  // Bags — the zip-top dopp kit, previously the generic holdall
  washbag:
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785780770674-02g285.png',
  // Shoes — the low-top tennis sneaker, on the same left-facing
  // three-quarter view as the Oxford, derby and loafer plates. ALL WHITE
  // throughout — upper, sole, toe, heel and laces — no grey sole, no
  // yellow lace or heel accents; the ink outline alone does the work.
  sneaker:
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785814688131-v74jwa.png',
  // Outerwear — the four coats told apart by construction: ribbed blouson,
  // bellows pockets and a drawstring, a plain three-button knee-length
  // coat, and the double-breasted belted trench
  harrington:
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785787488617-3ctadg.png',
  'field-jacket':
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785787525847-yjfeud.png',
  overcoat:
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785787548789-y4ehol.png',
  raincoat:
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785787570627-skb7dr.png',
  // Tailoring — the two that shared the blazer slot, now split on the one
  // detail that actually separates them: flapped pockets and a structured
  // shoulder against soft patch pockets with no flaps at all
  'blazer-outer':
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785787593480-rkw7vf.png',
  'sport-coat':
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785787619675-wwjtig.png',
  // Knitwear — the button-through cardigan, which the pullover slot could
  // never show
  cardigan:
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785787649772-tqx0we.png',
  // Base layers — the sleeveless vest and the long-sleeved thermal, both
  // previously borrowing the plain crew tee
  undershirt:
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785787679449-5qa7qg.png',
  'base-layer-top':
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785787702208-hcf68k.png',
  // Accessories — the coiled belt and the untied tie
  belt:
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785787724536-3e4cuu.png',
  tie:
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785787747766-y2uz77.png',
  // Accessories — the fringed rectangular scarf, laid in an open loop so the
  // band and both tasselled ends read at card size
  scarf:
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785798137388-3nq9jg.png',
  // Bags — the hard-sided two-strap briefcase, told apart from the open tote
  // and the soft holdall by its rigid flap and top handle
  briefcase:
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785798171245-8pz6m4.png',
  // Hats — the whole category, drawn at last. THREE of these shared the one
  // brimmed-hat drawing, so Bucket Hat, Panama and Fedora were literally the
  // same picture; they are now told apart by the brim alone — sloping down
  // all round, held flat and level with a bound edge, and snapped down at
  // the front.
  cap:
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785797890536-plo1ry.png',
  beanie:
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785797955563-glb4yn.png',
  'bucket-hat':
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785797988998-iqruay.png',
  panama:
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785798026465-do7czg.png',
  fedora:
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785798101651-r0mz8r.png',
  // Outerwear — the corduroy collar and four bellows pockets the generic
  // field-jacket slot could never show
  'waxed-jacket':
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785798215380-ho929z.png',
  // Knitwear — the two that shared the crewneck slot with the plain jumper:
  // Aran's rope-twist cable panels and Fair Isle's banded yoke motifs
  'aran-jumper':
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785798286796-5bun5j.png',
  'fair-isle':
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785798323521-meko0i.png',
};

/**
 * STILL ON THE CODED SVG — no ligne claire plate of their own yet, because
 * each pass hits a per-job cap on generated images. Each needs ONE square
 * ligne claire plate to the spec in the header comment above, then an entry
 * here under its own grouping comment. Nothing is broken meanwhile: every id
 * below falls back to the coded SVG for its slot.
 *
 * This list was re-derived by cross-referencing the map above against
 * rail-subcategories.ts directly, so it is exact rather than inherited.
 *
 * TIER 1 CARDS: none. Every illustrated Tier 1 sub-category card now carries
 * its own plate.
 *
 * "Other [Category] →" ROWS (the plain-text sub-types behind each category)
 * — 22 remaining:
 *   dress-shirt · flannel-shirt · linen-shirt · chambray-shirt · henley ·
 *   overshirt · corduroy-trousers · linen-trousers · fatigue-trousers ·
 *   swim-shorts · penny-loafer · espadrille · boat-shoe · peacoat ·
 *   duffle-coat · gilet · knitted-polo · dinner-suit · long-johns ·
 *   gloves · rucksack · messenger-bag
 *
 * DO THESE GROUPS FIRST. Where two or more of the ids above share one slot,
 * they all fall back to the SAME coded drawing, so those cards currently show
 * identical artwork — the most visibly wrong state there is:
 *   trousers slot — corduroy-trousers, linen-trousers, fatigue-trousers
 *   overcoat slot — peacoat, duffle-coat
 *   loafers slot — penny-loafer, boat-shoe
 *   casual-shirt slot — linen-shirt, chambray-shirt
 * The crewneck and brimmed-hat duplicate groups are cleared.
 *
 * PALETTE NOTE for whoever picks this up: keep every fill inside the muted
 * house range (cream, oatmeal, warm grey, walnut brown, tan). Naming a real
 * garment colour in the prompt — "pale blue oxford", "indigo denim" — makes
 * the model draw it, and one blue card in a cream grid stands out badly. Tell
 * garments apart by construction detail instead of by colour.
 *
 * House colour per garment type, and do not let the model choose freely:
 * shirts and sneakers and base layers cream · knitwear and swim shorts
 * oatmeal · tailoring, dress/suit trousers, jeans and accessories warm grey ·
 * chinos, jackets and hats tan · coats, leather footwear and bags walnut
 * brown. ONE deliberate exception is wired above: Panama is cream, because
 * asking for tan straw returns a saturated yellow boater with a woven texture
 * grid — outside the muted range and against the no-texture rule. Cream is
 * inside the house range and the flat level brim, not the colour, is what
 * separates it from the Fedora.
 */

/** The bespoke artwork for a sub-category, or undefined — in which case the
 * caller keeps the coded SVG for that slot. */
export function railIllustration(subcategoryId: string): string | undefined {
  return RAIL_ILLUSTRATIONS[subcategoryId];
}

/**
 * THE LEDGER'S CATEGORY PLATES — keyed by WARDROBE_CATEGORIES id
 * (profile-data.ts), one drawing per category row in The Ledger's inventory
 * list. The Ledger asked for its icons by SLOT (`cat.coverIllo`), which no
 * plate is keyed on, so every row fell through to the coded SVG however many
 * plates the Rail had. Keying on the category id fixes that and lets a
 * category borrow whichever Rail plate actually represents it — Shoes takes
 * the loafer, Tops the Oxford shirt — rather than each needing its own.
 *
 * "Other" is the one row with no garment behind it, so it takes an empty
 * wooden hanger: a wardrobe object in the same register, and unmistakably
 * not a specific piece.
 */
export const LEDGER_ILLUSTRATIONS: Record<string, string> = {
  tops: RAIL_ILLUSTRATIONS['oxford-shirt'],
  bottoms: RAIL_ILLUSTRATIONS.chinos,
  shoes: RAIL_ILLUSTRATIONS.loafer,
  outerwear: RAIL_ILLUSTRATIONS['waxed-jacket'],
  knitwear: RAIL_ILLUSTRATIONS['crew-neck'],
  formalwear: RAIL_ILLUSTRATIONS.suit,
  accessories: RAIL_ILLUSTRATIONS.belt,
  'base-layers': RAIL_ILLUSTRATIONS['base-layer-top'],
  bags: RAIL_ILLUSTRATIONS.tote,
  hats: RAIL_ILLUSTRATIONS.cap,
  other:
    'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785798248917-exgzm4.png',
};

/** The plate for a Ledger category row, or undefined — in which case the
 * caller keeps the coded SVG for that category's slot. */
export function ledgerIllustration(categoryId: string): string | undefined {
  return LEDGER_ILLUSTRATIONS[categoryId];
}
