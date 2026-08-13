/**
 * GARMENT TYPE ENTRIES 4 of 4 — ACCESSORIES · BAGS · HATS · OTHER.
 * One `gt(id, name, category, band, reach, cuts, colours, makers)` per line.
 * Assembled and indexed by garment-types.ts — import from THERE, not here.
 *
 * NOTE on 'other': records in that category are the catch-all bucket — they
 * exist in the data but MUST NEVER appear in Index navigation or plates
 * (filter with INDEX_GARMENT_TYPES / visibleGarmentTypes in garment-types.ts).
 */
import { gt, C, SC, B, F, BT, OW, type GarmentType } from './garment-type-model';

export const GARMENT_TYPE_ENTRIES_4: GarmentType[] = [
  // ─── ACCESSORIES · belts & braces ───
  gt('bridle-belt', 'Bridle Leather Belt', 'accessories', '10-15', [C, SC, B, F], ['1.25in', '1.5in'], ['Dark brown', 'Black', 'Tan', 'Oxblood'], ['Equus Leather', 'Tanner Goods', "Anderson's"]),
  gt('suede-belt', 'Suede Belt', 'accessories', '15-20', [SC, C], ['1.25in'], ['Snuff', 'Chocolate', 'Navy'], ["Anderson's"]),
  gt('woven-belt', 'Woven Leather Belt', 'accessories', '20-25', [C, SC], ['Stretch', 'Solid leather'], ['Tan', 'Dark brown', 'Navy'], ["Anderson's"]),
  gt('webbing-belt', 'Canvas Webbing Belt', 'accessories', '20-25', [C, OW], ['D-ring', 'Military buckle'], ['Olive', 'Navy', 'Khaki'], []),
  gt('ribbon-belt', 'Ribbon Belt', 'accessories', '25-30', [C, SC], ['Surcingle'], ['Navy-red stripe', 'Club stripe'], []),
  gt('braces', 'Braces', 'accessories', '10-15', [B, F, BT], ['Button-on', 'Boxcloth'], ['Navy', 'Black', 'Burgundy', 'Cream'], []),
  gt('cummerbund', 'Cummerbund', 'accessories', '10-15', [BT], ['Silk pleated'], ['Black', 'Midnight'], []),

  // ─── ACCESSORIES · neckwear ───
  gt('grenadine-tie', 'Grenadine Tie', 'accessories', '10-15', [B, F], ['Fina', 'Grossa'], ['Navy', 'Charcoal', 'Burgundy'], ['Sam Hober', "Drake's", 'Shibumi Firenze']),
  gt('knitted-tie', 'Knitted Tie', 'accessories', '10-15', [SC, B], ['Square-end'], ['Navy', 'Bottle green', 'Burgundy', 'Silver'], ["Drake's", 'Shibumi Firenze']),
  gt('printed-silk-tie', 'Printed Silk Tie', 'accessories', '10-15', [B, F], ['3.25in', '3.5in'], ['Navy motif', 'Burgundy motif'], ["Drake's", 'Rubinacci', 'Shibumi Firenze']),
  gt('madder-tie', 'Ancient Madder Tie', 'accessories', '5-10', [B, SC], ['3.5in'], ['Burgundy paisley', 'Forest paisley', 'Gold paisley'], ["Drake's", 'Shibumi Firenze']),
  gt('challis-tie', 'Wool Challis Tie', 'accessories', '5-10', [SC, B], ['3.5in'], ['Navy motif', 'Brown motif'], ['Sam Hober', "Drake's"]),
  gt('repp-stripe-tie', 'Repp Stripe Tie', 'accessories', '10-15', [B, SC], ['3.25in', '3.5in'], ['Navy-gold stripe', 'Burgundy-navy stripe'], ["Drake's", 'Shibumi Firenze']),
  gt('black-bow-tie', 'Black Bow Tie', 'accessories', '10-15', [BT], ['Self-tie butterfly', 'Batwing'], ['Black silk', 'Midnight'], ["Drake's"]),
  gt('cravat', 'Day Cravat', 'accessories', '15-20', [SC], ['Self-tie'], ['Paisley', 'Polka dot', 'Navy'], ['Rubinacci']),
  gt('pocket-square', 'Pocket Square', 'accessories', '10-15', [SC, B, F, BT], ['Silk', 'Linen', 'Wool'], ['White linen', 'Navy print', 'Paisley'], ['Rubinacci', 'Simonnot Godard', "Drake's", 'Shibumi Firenze']),
  gt('bandana', 'Bandana', 'accessories', '20-25', [C, OW], ['Classic square'], ['Indigo', 'Red', 'Ecru'], []),

  // ─── ACCESSORIES · scarves & gloves ───
  gt('cashmere-scarf', 'Cashmere Scarf', 'accessories', '0-5', [SC, B, F, C], ['Standard', 'Oversized'], ['Camel', 'Grey', 'Navy', 'Burgundy'], ['Begg x Co', 'Johnstons of Elgin']),
  gt('wool-scarf', 'Lambswool Scarf', 'accessories', '0-5', [C, SC, OW], ['Standard'], ['Tartan', 'Navy', 'Grey herringbone'], ['Johnstons of Elgin', 'Begg x Co']),
  gt('silk-scarf', 'Silk Scarf', 'accessories', '10-15', [SC, F], ['Standard'], ['Paisley', 'Polka dot'], ['Rubinacci', 'Begg x Co']),
  gt('evening-scarf', 'White Evening Scarf', 'accessories', '5-10', [BT, F], ['Standard'], ['White silk', 'Ivory'], []),
  gt('leather-gloves', 'Leather Gloves', 'accessories', '0-5', [SC, B, F], ['Cashmere-lined', 'Unlined'], ['Dark brown', 'Black', 'Tan'], []),
  gt('driving-gloves', 'Driving Gloves', 'accessories', '10-15', [SC, C], ['Unlined'], ['Tan', 'Dark brown'], []),
  gt('shearling-gloves', 'Shearling Gloves', 'accessories', 'below-0', [C, OW], ['Regular'], ['Chestnut', 'Dark brown'], []),
  gt('knitted-gloves', 'Knitted Gloves', 'accessories', '0-5', [C, SC], ['Wool', 'Cashmere'], ['Grey', 'Navy', 'Camel'], ['Johnstons of Elgin', 'Highland 2000']),

  // ─── ACCESSORIES · socks, eyewear, watches & small leather ───
  gt('over-calf-socks', 'Over-the-Calf Socks', 'accessories', '10-15', [B, F, BT], ['Cotton lisle', 'Merino'], ['Navy', 'Charcoal', 'Burgundy'], []),
  gt('ragg-socks', 'Ragg Wool Socks', 'accessories', '0-5', [C, OW], ['Boot weight'], ['Oat melange', 'Grey', 'Forest'], ['Smartwool', 'L.L.Bean']),
  gt('sunglasses', 'Acetate Sunglasses', 'accessories', '25-30', [C, SC, B], ['Wayfarer', 'Round', 'Aviator'], ['Tortoise', 'Black', 'Crystal'], []),
  gt('field-watch', 'Field Watch', 'accessories', '10-15', [C, OW], ['34-38mm', '38-42mm'], ['Black dial', 'White dial'], ['Hamilton', 'Timex', 'Seiko']),
  gt('dress-watch', 'Dress Watch', 'accessories', '10-15', [B, F, BT], ['34-38mm'], ['White dial', 'Silver dial', 'Black dial'], ['Hamilton', 'Seiko', 'Timex']),
  gt('dive-watch', 'Dive Watch', 'accessories', '15-20', [C, SC], ['38-42mm'], ['Black dial', 'Blue dial'], ['Seiko', 'Timex']),
  gt('chronograph-watch', 'Chronograph Watch', 'accessories', '10-15', [SC, B], ['38-42mm'], ['Panda dial', 'Black dial'], ['Hamilton', 'Seiko']),
  gt('bifold-wallet', 'Bifold Wallet', 'accessories', '10-15', [C, SC, B, F], ['Standard'], ['Dark brown', 'Black', 'Tan'], ['Tanner Goods', 'Frank Clegg']),
  gt('card-holder', 'Card Holder', 'accessories', '10-15', [C, SC, B, F], ['Standard'], ['Dark brown', 'Black', 'Navy'], ['Tanner Goods', 'Frank Clegg']),
  gt('money-clip', 'Money Clip', 'accessories', '10-15', [SC, B, F], ['Standard'], ['Brass', 'Silver'], []),
  gt('city-umbrella', 'City Umbrella', 'accessories', '10-15', [B, F, SC], ['Solid stick', 'Folding'], ['Black', 'Navy', 'Racing green'], ['Lock & Co.']),
  gt('tie-bar', 'Tie Bar', 'accessories', '10-15', [B, F], ['Standard'], ['Silver', 'Gold'], []),
  gt('cufflinks', 'Cufflinks', 'accessories', '10-15', [B, F, BT], ['T-bar', 'Chain', 'Silk knot'], ['Silver', 'Gold', 'Mother-of-pearl'], []),
  gt('collar-pin', 'Collar Pin', 'accessories', '10-15', [B, F], ['Barbell', 'Clip'], ['Silver', 'Gold'], []),

  // ─── BAGS ───
  gt('briefcase', 'Leather Briefcase', 'bags', '10-15', [B, F], ['Single-gusset', 'Double-gusset'], ['Dark brown', 'Black', 'Tan'], ['Frank Clegg', 'Chapman Bags']),
  gt('attache-case', 'Attach\u00e9 Case', 'bags', '10-15', [B, F], ['Slim', 'Standard'], ['Black', 'Dark brown'], ['Frank Clegg']),
  gt('holdall', 'Holdall', 'bags', '10-15', [C, SC, B], ['Weekender', 'Large'], ['Navy canvas', 'Olive canvas', 'Tan leather'], ['Bennett Winch', 'Frank Clegg', 'Mismo', 'Chapman Bags']),
  gt('canvas-tote', 'Canvas Tote', 'bags', '15-20', [C, SC], ['Standard', 'Zip-top'], ['Natural', 'Navy', 'Olive'], ['L.L.Bean', 'Tanner Goods', 'Mismo']),
  gt('messenger-bag', 'Messenger Bag', 'bags', '10-15', [C, SC], ['Standard'], ['Olive', 'Navy', 'Tan'], ['Filson', 'Mismo', 'Chapman Bags']),
  gt('musette', 'Musette', 'bags', '15-20', [C], ['Slim'], ['Olive', 'Ecru', 'Navy'], []),
  gt('canvas-rucksack', 'Canvas Rucksack', 'bags', '10-15', [C, OW], ['Roll-top', 'Flap'], ['Olive', 'Tan', 'Navy'], ['Filson', 'Mismo', 'Chapman Bags']),
  gt('field-satchel', 'Field Satchel', 'bags', '10-15', [C, OW], ['Standard'], ['Olive', 'Tan'], ['Filson', 'Chapman Bags']),
  gt('game-bag', 'Game Bag', 'bags', '5-10', [OW, C], ['Standard'], ['Olive', 'Tan leather trim'], ['Chapman Bags', 'Barbour']),
  gt('dopp-kit', 'Dopp Kit', 'bags', '10-15', [C, SC, B], ['Standard'], ['Tan', 'Navy', 'Olive'], ['Frank Clegg', 'Tanner Goods', 'Mismo']),
  gt('garment-bag', 'Garment Bag', 'bags', '10-15', [B, F], ['Folding'], ['Navy', 'Black', 'Olive'], ['Bennett Winch']),
  gt('portfolio', 'Leather Portfolio', 'bags', '10-15', [B, F], ['Slim'], ['Dark brown', 'Black'], ['Frank Clegg']),

  // ─── HATS ───
  gt('flat-cap', 'Flat Cap', 'hats', '5-10', [C, SC, OW], ['Standard'], ['Tweed grey', 'Brown herringbone', 'Navy'], ['Lock & Co.', 'Stetson', 'Cableami']),
  gt('newsboy-cap', 'Newsboy Cap', 'hats', '5-10', [C, SC], ['Eight-piece'], ['Tweed brown', 'Grey Donegal'], ['Lock & Co.', 'Stetson']),
  gt('fedora', 'Fedora', 'hats', '10-15', [SC, B, F], ['Fur felt', 'Wool felt'], ['Grey', 'Brown', 'Navy'], ['Lock & Co.', 'Stetson']),
  gt('trilby', 'Trilby', 'hats', '10-15', [SC, C], ['Felt', 'Straw'], ['Brown', 'Grey', 'Natural'], ['Lock & Co.', 'Stetson']),
  gt('panama-hat', 'Panama Hat', 'hats', 'above-30', [SC, C], ['Fedora crown', 'Optimo crown'], ['Natural', 'Bleached'], ['Lock & Co.', 'Stetson']),
  gt('pork-pie-hat', 'Pork Pie Hat', 'hats', '15-20', [C, SC], ['Felt', 'Straw'], ['Charcoal', 'Brown'], ['Stetson', 'Lock & Co.']),
  gt('bucket-hat', 'Bucket Hat', 'hats', '20-25', [C], ['Cotton', 'Waxed'], ['Olive', 'Navy', 'Stone'], ['Cableami', 'Barbour']),
  gt('baseball-cap', 'Baseball Cap', 'hats', '15-20', [C], ['Six-panel', 'Unstructured'], ['Navy', 'Olive', 'Stone'], ['Cableami', 'L.L.Bean']),
  gt('watch-cap', 'Watch Cap', 'hats', '0-5', [C, OW], ['Ribbed wool', 'Cashmere'], ['Navy', 'Grey', 'Olive', 'Black'], ['Highland 2000', 'Le Bonnet', 'Heimat']),
  gt('bobble-hat', 'Bobble Hat', 'hats', 'below-0', [C], ['Ribbed'], ['Navy', 'Oat', 'Rust'], ['Highland 2000', 'Le Bonnet']),
  gt('deerstalker', 'Deerstalker', 'hats', '0-5', [OW, C], ['Tweed'], ['Estate tweed', 'Herringbone'], ['Lock & Co.']),
  gt('boater', 'Boater', 'hats', '25-30', [SC], ['Straw'], ['Natural with band'], ['Lock & Co.']),
  gt('beret', 'Beret', 'hats', '5-10', [C], ['Wool'], ['Black', 'Navy', 'Charcoal'], ['Le Bonnet']),
  gt('bowler-hat', 'Bowler Hat', 'hats', '10-15', [F, B], ['Fur felt'], ['Black'], ['Lock & Co.']),
  gt('homburg', 'Homburg', 'hats', '10-15', [F, BT], ['Fur felt'], ['Black', 'Grey'], ['Lock & Co.']),
  gt('top-hat', 'Top Hat', 'hats', '10-15', [BT, F], ['Silk plush', 'Fur felt'], ['Black'], ['Lock & Co.']),
  gt('trapper-hat', 'Trapper Hat', 'hats', 'below-0', [C, OW], ['Shearling', 'Quilted'], ['Brown', 'Olive'], ['Stetson']),
  gt('breton-cap', 'Breton Fisherman Cap', 'hats', '5-10', [C], ['Wool'], ['Navy', 'Black'], []),
  gt('boonie-hat', 'Boonie Hat', 'hats', '25-30', [C, OW], ['Cotton ripstop'], ['Olive', 'Khaki', 'Camo'], ['Cableami']),
  gt('sou-wester', 'Sou\u2019wester', 'hats', '5-10', [OW, C], ['Waxed', 'Rubberised'], ['Yellow', 'Navy'], []),
  gt('irish-walking-hat', 'Irish Walking Hat', 'hats', '5-10', [C, SC, OW], ['Crushable tweed'], ['Brown tweed', 'Grey tweed'], ['Lock & Co.']),
  gt('balaclava', 'Balaclava', 'hats', 'below-0', [OW, C], ['Ribbed wool', 'Merino'], ['Navy', 'Black', 'Oat'], ['Highland 2000']),

  // ─── OTHER · catch-all bucket: NEVER shown in Index navigation or plates ───
  gt('pyjama-set', 'Pyjama Set', 'other', '10-15', [C], ['Classic piped', 'Short set'], ['Navy stripe', 'White', 'Piped blue'], ['Hanro', 'Sunspel']),
  gt('dressing-gown', 'Dressing Gown', 'other', '10-15', [C], ['Wool', 'Silk', 'Towelling'], ['Navy paisley', 'Burgundy', 'Grey'], ['Hanro', 'Sunspel']),
  gt('towelling-robe', 'Towelling Robe', 'other', '15-20', [C], ['Regular'], ['White', 'Navy'], ['Orlebar Brown', 'Hanro']),
];
