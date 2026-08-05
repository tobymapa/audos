/**
 * Ethaion illustration slots — ligne claire artwork, drawn in code.
 *
 * Every slot renders an inline SVG illustration in the house style (clean
 * single-weight outlines, flat colour fills, white ground, no shading —
 * Tintin, not icon-set), layered UNDER a standard <img> pointing at a static
 * file in /illustrations/. The SVG is the working placeholder: the moment a
 * real artwork file (AI-generated or commissioned, Mr. Slowboy / ligne
 * claire style) is dropped into /illustrations/ it loads and takes over —
 * no code changes required.
 *
 * File naming convention (PNG, white or transparent background):
 *   Garment / wardrobe category icons (square 1:1):
 *     /illustrations/garment-<id>.png
 *   Style archetype characters (portrait 4:5 — a figure wearing the style):
 *     /illustrations/archetype-<id>.png
 *   Landing-page welcome figure (portrait 4:5 — the Ethaion valet):
 *     /illustrations/welcome-valet.png
 *
 * Owned vs. gap mechanic: `muted` renders the gap state (greyscale artwork).
 * `fill` (0–1) renders the wardrobe tracker's partial state — a greyscale
 * base with the coloured artwork revealed bottom-up.
 */

import { useState } from 'react';

/* --------------------------------------------------------------------------
 * Palette — flat ligne claire colours (max 3–4 per drawing + ink)
 * ------------------------------------------------------------------------*/

const INK = '#2E2A25';
const WHITE = '#FFFFFF';
const CREAM = '#F6F1E5';
const ECRU = '#EAE2CC';
const STONE = '#DFD8C2';
const SKY = '#BFD7E8';
const NAVY = '#2F4A6E';
const NAVY_LIGHT = '#3D5B84';
const DENIM = '#46618C';
const KHAKI = '#D9BE8F';
const TAN = '#C29A64';
const BROWN = '#8F5B33';
const DARKBROWN = '#5E3D24';
const OLIVE = '#6F7452';
const WAXOLIVE = '#6B6845';
const FOREST = '#4E6A50';
const FOREST_DARK = '#3B5340';
const RUST = '#B45E38';
const BURGUNDY = '#7E3E46';
const GREY = '#AEB4B9';
const LIGHTGREY = '#D8D8D2';
const CHARCOAL = '#4A4E56';
const SATIN = '#5A5E68';
const BLACKISH = '#383B41';
const FRENCHBLUE = '#4C6E9C';
const OCHRE = '#C9993F';
const SKIN = '#F2CBA4';
const HAIR = '#4B3620';
const GROUND = '#ECEAE2';

const FILL_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * Tintable fill: the drawing's default flat colour, overridable per instance
 * via the `--illo-primary` CSS variable (set by <Illo color=…>). This is how
 * one shirt drawing renders as a blue OCBD, a white OCBD, and a pink OCBD —
 * same symbol, different fill. Archetype figures never set the variable, so
 * they always keep their drawn colours.
 */
const tint = (c: string) => `var(--illo-primary, ${c})`;

/* Shared stroke presets — single consistent line weight per asset class. */
const L = { stroke: INK, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const D = { stroke: INK, strokeWidth: 1.1, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
/* Archetype (character) line weights — viewBox is larger, stroke scales up. */
const AL = { stroke: INK, strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const AD = { stroke: INK, strokeWidth: 1.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

type Art = () => JSX.Element;

function GarmentSvg({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
      {children}
    </svg>
  );
}

function FigureSvg({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 120 150" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
      {children}
    </svg>
  );
}

/* ==========================================================================
 * GARMENTS — square 1:1, viewBox 64
 * ========================================================================*/

/** Long-sleeve shirt silhouette (sleeves hanging at the sides). */
function ShirtBody({ fill, children }: { fill: string; children?: React.ReactNode }) {
  return (
    <>
      <path
        d="M25 10 L14 14 L9 21 L9 47 L16 47 L16 55 L48 55 L48 47 L55 47 L55 21 L50 14 L39 10 C36 15 28 15 25 10 Z"
        fill={fill}
        {...L}
      />
      {/* sleeve inner seams + cuffs */}
      <path d="M16 24 L16 47" {...D} />
      <path d="M48 24 L48 47" {...D} />
      <path d="M9.5 42 L15.5 42" {...D} />
      <path d="M48.5 42 L54.5 42" {...D} />
      {children}
    </>
  );
}

function Placket({ from = 18, to = 54, buttons = [23, 29, 35, 41, 47] }: { from?: number; to?: number; buttons?: number[] }) {
  return (
    <>
      <path d={`M30.8 ${from} L30.8 ${to}`} {...D} />
      <path d={`M33.2 ${from} L33.2 ${to}`} {...D} />
      {buttons.map((y) => (
        <circle key={y} cx={32} cy={y} r={0.9} fill={INK} stroke="none" />
      ))}
    </>
  );
}

function PointCollar({ fill, buttonDown = false }: { fill: string; buttonDown?: boolean }) {
  return (
    <>
      <path d="M25 10 L32 17.5 L26.5 20.5 L23 13 Z" fill={fill} {...D} />
      <path d="M39 10 L32 17.5 L37.5 20.5 L41 13 Z" fill={fill} {...D} />
      {buttonDown && (
        <>
          <circle cx={26.8} cy={19.2} r={0.8} fill={INK} stroke="none" />
          <circle cx={37.2} cy={19.2} r={0.8} fill={INK} stroke="none" />
        </>
      )}
    </>
  );
}

const OcbdArt: Art = () => (
  <GarmentSvg>
    <ShirtBody fill={tint(SKY)}>
      <Placket />
      <PointCollar fill={tint(SKY)} buttonDown />
      {/* chest pocket */}
      <path d="M20 27 L26 27 L26 34 L20 34 Z" fill={tint(SKY)} {...D} />
    </ShirtBody>
  </GarmentSvg>
);

const DressShirtArt: Art = () => (
  <GarmentSvg>
    <ShirtBody fill={tint(WHITE)}>
      <Placket />
      {/* spread collar */}
      <path d="M25 10 L32 17.5 L24.5 19.5 L21.5 13.5 Z" fill={tint(WHITE)} {...D} />
      <path d="M39 10 L32 17.5 L39.5 19.5 L42.5 13.5 Z" fill={tint(WHITE)} {...D} />
    </ShirtBody>
  </GarmentSvg>
);

const FlannelArt: Art = () => (
  <GarmentSvg>
    <ShirtBody fill={tint(FOREST)}>
      {/* plaid — flat bands, no gradients */}
      <path d="M22.5 15 L22.5 55" stroke={FOREST_DARK} strokeWidth={3.5} strokeLinecap="round" />
      <path d="M41.5 15 L41.5 55" stroke={FOREST_DARK} strokeWidth={3.5} strokeLinecap="round" />
      <path d="M9 28 L55 28" stroke={FOREST_DARK} strokeWidth={3.5} strokeLinecap="round" />
      <path d="M9 42 L55 42" stroke={FOREST_DARK} strokeWidth={3.5} strokeLinecap="round" />
      <path d="M18.5 15 L18.5 55" stroke={CREAM} strokeWidth={0.9} strokeLinecap="round" />
      <path d="M45.5 15 L45.5 55" stroke={CREAM} strokeWidth={0.9} strokeLinecap="round" />
      <path d="M9 24 L55 24" stroke={CREAM} strokeWidth={0.9} strokeLinecap="round" />
      <path d="M9 47 L55 47" stroke={CREAM} strokeWidth={0.9} strokeLinecap="round" />
      <Placket />
      <PointCollar fill={tint(FOREST)} />
    </ShirtBody>
  </GarmentSvg>
);

/** Short-sleeve silhouette (tee / polo). */
function TeeBody({ fill, children }: { fill: string; children?: React.ReactNode }) {
  return (
    <>
      <path
        d="M24 11 L14 15 L7 25 L15 31 L18 28 L18 54 L46 54 L46 28 L49 31 L57 25 L50 15 L40 11 C37 16 27 16 24 11 Z"
        fill={fill}
        {...L}
      />
      {children}
    </>
  );
}

const TeeArt: Art = () => (
  <GarmentSvg>
    <TeeBody fill={tint(CREAM)}>
      {/* ribbed neckline */}
      <path d="M24.8 12.5 C27.5 17 36.5 17 39.2 12.5" fill="none" {...D} />
    </TeeBody>
  </GarmentSvg>
);

const PoloArt: Art = () => (
  <GarmentSvg>
    <TeeBody fill={tint(NAVY)}>
      {/* sleeve rib cuffs */}
      <path d="M13.5 27.5 L16.5 29.8" {...D} />
      <path d="M50.5 27.5 L47.5 29.8" {...D} />
      <Placket from={17} to={28} buttons={[21, 25]} />
      {/* flat knit collar */}
      <path d="M24 11 L32 17 L27 20 L23.5 13.5 Z" fill={tint(NAVY_LIGHT)} {...D} />
      <path d="M40 11 L32 17 L37 20 L40.5 13.5 Z" fill={tint(NAVY_LIGHT)} {...D} />
    </TeeBody>
  </GarmentSvg>
);

const ThermalArt: Art = () => (
  <GarmentSvg>
    <ShirtBody fill={tint(CREAM)}>
      {/* waffle grid */}
      <path d="M24 20 L24 52" stroke="#DFD3B6" strokeWidth={0.9} />
      <path d="M32 22 L32 52" stroke="#DFD3B6" strokeWidth={0.9} />
      <path d="M40 20 L40 52" stroke="#DFD3B6" strokeWidth={0.9} />
      <path d="M17 27 L47 27" stroke="#DFD3B6" strokeWidth={0.9} />
      <path d="M17 36 L47 36" stroke="#DFD3B6" strokeWidth={0.9} />
      <path d="M17 45 L47 45" stroke="#DFD3B6" strokeWidth={0.9} />
      {/* henley placket */}
      <path d="M28.5 14 C30.5 15.5 33.5 15.5 35.5 14" fill="none" {...D} />
      <path d="M30.8 16 L30.8 27 M33.2 16 L33.2 27" {...D} />
      <circle cx={32} cy={19} r={0.9} fill={INK} stroke="none" />
      <circle cx={32} cy={24} r={0.9} fill={INK} stroke="none" />
    </ShirtBody>
  </GarmentSvg>
);

/* ---------------------------------- bottoms ----------------------------- */

function TrousersBase({ fill, crease = false, children }: { fill: string; crease?: boolean; children?: React.ReactNode }) {
  return (
    <>
      <path d="M19 9 L45 9 L46.5 54 L35 54 L32 26 L29 54 L17.5 54 Z" fill={fill} {...L} />
      {/* waistband + fly */}
      <path d="M19.2 15 L44.8 15" {...D} />
      <path d="M32 15 L32 22" {...D} />
      {/* belt loops */}
      <path d="M22 9.5 L22 14 M42 9.5 L42 14" {...D} />
      <circle cx={32} cy={12} r={0.9} fill={INK} stroke="none" />
      {crease && (
        <>
          <path d="M24.5 20 L23.5 51" {...D} />
          <path d="M39.5 20 L40.5 51" {...D} />
        </>
      )}
      {children}
    </>
  );
}

const ChinosArt: Art = () => (
  <GarmentSvg>
    <TrousersBase fill={tint(KHAKI)}>
      {/* slash pockets */}
      <path d="M20 15.5 C22.5 19 24 21.5 24.5 25" fill="none" {...D} />
      <path d="M44 15.5 C41.5 19 40 21.5 39.5 25" fill="none" {...D} />
    </TrousersBase>
  </GarmentSvg>
);

const JeansArt: Art = () => (
  <GarmentSvg>
    <TrousersBase fill={tint(DENIM)}>
      {/* five-pocket stitching in gold */}
      <path d="M20 16.5 C22.5 19.5 24 21.5 24.5 24.5" fill="none" stroke={OCHRE} strokeWidth={1.1} strokeLinecap="round" />
      <path d="M44 16.5 C41.5 19.5 40 21.5 39.5 24.5" fill="none" stroke={OCHRE} strokeWidth={1.1} strokeLinecap="round" />
      <path d="M19.4 16.5 L44.6 16.5" stroke={OCHRE} strokeWidth={1.1} strokeLinecap="round" />
      {/* inseam stitch */}
      <path d="M29.6 30 L27.4 51" stroke={OCHRE} strokeWidth={1.1} strokeLinecap="round" />
      <path d="M34.4 30 L36.6 51" stroke={OCHRE} strokeWidth={1.1} strokeLinecap="round" />
    </TrousersBase>
  </GarmentSvg>
);

const TrousersArt: Art = () => (
  <GarmentSvg>
    <TrousersBase fill={tint(GREY)} crease>
      {/* side-seam hint */}
      <path d="M19 18 L18.4 50" {...D} />
      <path d="M45 18 L45.6 50" {...D} />
    </TrousersBase>
  </GarmentSvg>
);

const ShortsArt: Art = () => (
  <GarmentSvg>
    <path d="M18 16 L46 16 L48 46 L35.5 46 L32 30 L28.5 46 L16 46 Z" fill={tint(KHAKI)} {...L} />
    <path d="M18.2 22 L45.8 22" {...D} />
    <path d="M32 22 L32 28" {...D} />
    <path d="M22 16.5 L22 21 M42 16.5 L42 21" {...D} />
    <circle cx={32} cy={19} r={0.9} fill={INK} stroke="none" />
    {/* hem cuffs */}
    <path d="M17 41.5 L28 41.5" {...D} />
    <path d="M36 41.5 L47 41.5" {...D} />
    <path d="M19 22.5 C21.5 26 23 28 23.5 31" fill="none" {...D} />
    <path d="M45 22.5 C42.5 26 41 28 40.5 31" fill="none" {...D} />
  </GarmentSvg>
);

const LongJohnsArt: Art = () => (
  <GarmentSvg>
    <path d="M21 10 L43 10 L44 54 L34.5 54 L32 24 L29.5 54 L20 54 Z" fill={tint(CREAM)} {...L} />
    <path d="M21.1 15 L42.9 15" {...D} />
    {/* waffle texture */}
    <path d="M26.5 20 L25.5 50" stroke="#DFD3B6" strokeWidth={0.9} />
    <path d="M37.5 20 L38.5 50" stroke="#DFD3B6" strokeWidth={0.9} />
    {/* ribbed ankle cuffs */}
    <path d="M20.2 49 L29.7 49 M34.3 49 L43.8 49" {...D} />
    <path d="M22.5 49.5 L22.4 53.5 M25.5 49.5 L25.4 53.5 M38.5 49.5 L38.6 53.5 M41.5 49.5 L41.6 53.5" stroke="#DFD3B6" strokeWidth={0.9} />
  </GarmentSvg>
);

/* ----------------------------------- shoes ------------------------------ */

const LoafersArt: Art = () => (
  <GarmentSvg>
    {/* penny loafer, side view, toe left */}
    <path d="M8 45 C8 39 12 35 19 34 C26 33 30 29.5 35 28 C40 26.5 47 27.5 51 31 C54 34 55.5 40 56 45 Z" fill={tint(BROWN)} {...L} />
    {/* penny strap */}
    <path d="M31 29.5 C33.5 33 34 36.5 33 40.5" fill="none" {...D} />
    <path d="M38.5 27.8 C40.5 31 41 34.5 40.5 38" fill="none" {...D} />
    <path d="M34.5 33 L37.5 32.2" {...D} />
    {/* sole + heel */}
    <path d="M8 45 L56 45 L55.5 49 L8.5 49 Z" fill={tint(DARKBROWN)} {...L} />
    <path d="M42 49 L55.5 49 L55 53 L42.5 53 Z" fill={tint(DARKBROWN)} {...L} />
  </GarmentSvg>
);

const DerbiesArt: Art = () => (
  <GarmentSvg>
    <path d="M8 45 C8 39 12 35 19 34 C26 33 29 30 34 28 C39 26 46 27 50 30.5 C53.5 33.5 55.5 40 56 45 Z" fill={tint(DARKBROWN)} {...L} />
    {/* toe cap */}
    <path d="M20 34 C21 38 21 41.5 20 45" fill="none" {...D} />
    {/* lace panel + eyelets */}
    <path d="M33 28.5 C36 32 37 36 36.5 40" fill="none" {...D} />
    <circle cx={38.5} cy={31} r={0.9} fill={CREAM} stroke="none" />
    <circle cx={40} cy={34} r={0.9} fill={CREAM} stroke="none" />
    <circle cx={41} cy={37} r={0.9} fill={CREAM} stroke="none" />
    <path d="M38.5 31 L35 32.8 M40 34 L36 35.6 M41 37 L36.6 38.4" stroke={CREAM} strokeWidth={1} strokeLinecap="round" />
    {/* welt + sole + heel */}
    <path d="M8.5 42.5 L55.7 42.5" {...D} />
    <path d="M8 45 L56 45 L55.5 49 L8.5 49 Z" fill={INK} {...L} />
    <path d="M42 49 L55.5 49 L55 53 L42.5 53 Z" fill={INK} {...L} />
  </GarmentSvg>
);

const BootsArt: Art = () => (
  <GarmentSvg>
    {/* chukka, side view — taller shaft, toe left */}
    <path d="M8 45 C8 39.5 12 36 18.5 35 L27 33.5 L28 15 C28 12.5 30 11 33 11 L41 11 C44 11 45.5 12.5 45.5 15 L46 33 C51 35 54.5 39.5 56 45 Z" fill={tint(TAN)} {...L} />
    {/* shaft opening */}
    <path d="M28.5 15.5 L45.4 15.5" {...D} />
    {/* two-eyelet lacing */}
    <circle cx={33} cy={21} r={1.1} fill={INK} stroke="none" />
    <circle cx={41} cy={21} r={1.1} fill={INK} stroke="none" />
    <circle cx={33.5} cy={27} r={1.1} fill={INK} stroke="none" />
    <circle cx={40.5} cy={27} r={1.1} fill={INK} stroke="none" />
    <path d="M33 21 L40.5 27 M41 21 L33.5 27" {...D} />
    {/* toe seam */}
    <path d="M20 35.5 C21.5 38.5 21.5 41.5 20.5 45" fill="none" {...D} />
    {/* crepe sole + heel */}
    <path d="M8 45 L56 45 L55.5 50 L8.5 50 Z" fill={tint(DARKBROWN)} {...L} />
    <path d="M40 50 L55.5 50 L55 53.5 L40.5 53.5 Z" fill={tint(DARKBROWN)} {...L} />
  </GarmentSvg>
);

const SneakersArt: Art = () => (
  <GarmentSvg>
    <path d="M8 44 C8 38 12 34.5 19 33.5 C26 32.5 29.5 29.5 34 28 C39 26.5 46 27.5 50 31 C53.5 34 55.5 39.5 56 44 Z" fill={tint(WHITE)} {...L} />
    {/* toe cap */}
    <path d="M17.5 34 C19 37.5 19 41 18 44" fill="none" {...D} />
    {/* laces */}
    <path d="M32 29 C35 32.5 36 36 35.5 39.5" fill="none" {...D} />
    <path d="M34.5 31.5 L39.5 30 M35.8 34.5 L41 33 M36.3 37.5 L42 36.2" {...D} />
    {/* heel tab */}
    <path d="M48 31 C51 33.5 53 37.5 54 42" fill="none" {...D} />
    {/* rubber sole */}
    <path d="M8 44 L56 44 L55.5 50.5 L8.5 50.5 Z" fill={CREAM} {...L} />
    <path d="M8.4 47 L55.7 47" {...D} />
  </GarmentSvg>
);

const EspadrillesArt: Art = () => (
  <GarmentSvg>
    {/* Slip-on upper, side view, with the braided jute sole that defines an espadrille. */}
    <path d="M8 43 C8 38 12 35 19 34 C25 33 29 30 34 28.5 C39 27 46 28 50 31.5 C53 34 55 38.5 56 43 Z" fill={tint(CREAM)} {...L} />
    <path d="M34 29.2 C38 32 43.5 32.5 48.5 30.7" fill={WHITE} {...D} />
    <path d="M34 29.5 L37.5 35 L40.5 30.5" fill={CREAM} {...D} />
    <path d="M19 34 C22 37 22.5 40 21.5 43 M27 32 C30 35 31 39 30.5 43" fill="none" {...D} />
    <path d="M8 43 L56 43 L55 50 L9 50 Z" fill={TAN} {...L} />
    <path d="M9.5 45 L55.5 45 M9.2 48 L55.2 48" stroke={OCHRE} strokeWidth={1} strokeLinecap="round" />
    <path d="M12 43.5 L16 49.5 M18 43.5 L22 49.5 M24 43.5 L28 49.5 M30 43.5 L34 49.5 M36 43.5 L40 49.5 M42 43.5 L46 49.5 M48 43.5 L52 49.5" stroke={BROWN} strokeWidth={0.8} strokeLinecap="round" />
  </GarmentSvg>
);

/* --------------------------------- outerwear ---------------------------- */

/** Boxy jacket silhouette with hanging sleeves. */
function JacketBody({ fill, hem = 56, children }: { fill: string; hem?: number; children?: React.ReactNode }) {
  return (
    <>
      <path
        d={`M24 9 L12 13 L7 20 L7 47 L15 47 L15 ${hem} L49 ${hem} L49 47 L57 47 L57 20 L52 13 L40 9 C37 13.5 27 13.5 24 9 Z`}
        fill={fill}
        {...L}
      />
      <path d="M15 23 L15 47" {...D} />
      <path d="M49 23 L49 47" {...D} />
      {children}
    </>
  );
}

const FieldJacketArt: Art = () => (
  <GarmentSvg>
    <JacketBody fill={tint(OLIVE)}>
      {/* zip + storm flap */}
      <path d="M32 14 L32 56" {...D} />
      {/* collar */}
      <path d="M24 9 L32 14.5 L26 17 L22.5 11.5 Z" fill={tint(OLIVE)} {...D} />
      <path d="M40 9 L32 14.5 L38 17 L41.5 11.5 Z" fill={tint(OLIVE)} {...D} />
      {/* four pockets with flaps */}
      <path d="M19 21 L27 21 L27 29 L19 29 Z" fill={tint(OLIVE)} {...D} />
      <path d="M19 21 L27 21 L27 23.6 L19 23.6 Z" fill={tint(OLIVE)} {...D} />
      <path d="M37 21 L45 21 L45 29 L37 29 Z" fill={tint(OLIVE)} {...D} />
      <path d="M37 21 L45 21 L45 23.6 L37 23.6 Z" fill={tint(OLIVE)} {...D} />
      <path d="M18 37 L27.5 37 L27.5 47 L18 47 Z" fill={tint(OLIVE)} {...D} />
      <path d="M18 37 L27.5 37 L27.5 40 L18 40 Z" fill={tint(OLIVE)} {...D} />
      <path d="M36.5 37 L46 37 L46 47 L36.5 47 Z" fill={tint(OLIVE)} {...D} />
      <path d="M36.5 37 L46 37 L46 40 L36.5 40 Z" fill={tint(OLIVE)} {...D} />
    </JacketBody>
  </GarmentSvg>
);

const WaxedJacketArt: Art = () => (
  <GarmentSvg>
    <JacketBody fill={tint(WAXOLIVE)}>
      {/* snap placket */}
      <path d="M30.6 16 L30.6 56 M33.4 16 L33.4 56" {...D} />
      <circle cx={32} cy={20} r={0.9} fill={INK} stroke="none" />
      <circle cx={32} cy={28} r={0.9} fill={INK} stroke="none" />
      <circle cx={32} cy={36} r={0.9} fill={INK} stroke="none" />
      <circle cx={32} cy={44} r={0.9} fill={INK} stroke="none" />
      <circle cx={32} cy={51} r={0.9} fill={INK} stroke="none" />
      {/* corduroy collar */}
      <path d="M24 9 L32 15.5 L25 19 L21.5 12 Z" fill={tint(TAN)} {...D} />
      <path d="M40 9 L32 15.5 L39 19 L42.5 12 Z" fill={tint(TAN)} {...D} />
      {/* bellows pockets */}
      <path d="M17.5 34 L28 34 L28 47 L17.5 47 Z" fill={tint(WAXOLIVE)} {...D} />
      <path d="M17.5 34 L28 34 L28 37.6 L17.5 37.6 Z" fill={tint(WAXOLIVE)} {...D} />
      <path d="M36 34 L46.5 34 L46.5 47 L36 47 Z" fill={tint(WAXOLIVE)} {...D} />
      <path d="M36 34 L46.5 34 L46.5 37.6 L36 37.6 Z" fill={tint(WAXOLIVE)} {...D} />
      {/* chest slit pocket */}
      <path d="M38 24 L45 26" {...D} />
    </JacketBody>
  </GarmentSvg>
);

const BlazerArt: Art = () => (
  <GarmentSvg>
    <JacketBody fill={tint(NAVY)} hem={56}>
      {/* shirt + tie behind lapels */}
      <path d="M27 12 L32 34 L37 12 C35 14.5 29 14.5 27 12 Z" fill={WHITE} {...D} />
      <path d="M31 14 L33 14 L34 22 L32 26 L30 22 Z" fill={BURGUNDY} {...D} />
      {/* lapels */}
      <path d="M24 9 L27 12 L32 34 L26 22 L22 17 L25.5 14.5 L22 12 Z" fill={tint(NAVY)} {...D} />
      <path d="M40 9 L37 12 L32 34 L38 22 L42 17 L38.5 14.5 L42 12 Z" fill={tint(NAVY)} {...D} />
      {/* front closure + buttons */}
      <path d="M32 34 L32 56" {...D} />
      <circle cx={32} cy={38} r={1} fill={INK} stroke="none" />
      <circle cx={32} cy={45} r={1} fill={INK} stroke="none" />
      {/* pockets */}
      <path d="M18 38 L27 38 L27 47 L18 47 Z" fill={tint(NAVY)} {...D} />
      <path d="M37 38 L46 38 L46 47 L37 47 Z" fill={tint(NAVY)} {...D} />
      <path d="M19.5 24 L25.5 24" {...D} />
    </JacketBody>
  </GarmentSvg>
);

const HarringtonArt: Art = () => (
  <GarmentSvg>
    <JacketBody fill={tint(STONE)} hem={54}>
      {/* stand collar */}
      <path d="M25 9 L25.5 14 L38.5 14 L39 9 C36 12.5 28 12.5 25 9 Z" fill={tint(STONE)} {...D} />
      {/* zip */}
      <path d="M32 14 L32 50" {...D} />
      {/* raglan seams */}
      <path d="M15 26 L25.5 13" {...D} />
      <path d="M49 26 L38.5 13" {...D} />
      {/* slanted flap pockets */}
      <path d="M18 38 L26 41 L25 45 L17 42 Z" fill={tint(STONE)} {...D} />
      <path d="M46 38 L38 41 L39 45 L47 42 Z" fill={tint(STONE)} {...D} />
      {/* ribbed hem */}
      <path d="M15 50 L49 50" {...D} />
      <path d="M18 50.5 L18 53.5 M22 50.5 L22 53.5 M26 50.5 L26 53.5 M30 50.5 L30 53.5 M34 50.5 L34 53.5 M38 50.5 L38 53.5 M42 50.5 L42 53.5 M46 50.5 L46 53.5" {...D} />
    </JacketBody>
  </GarmentSvg>
);

const LeatherJacketArt: Art = () => (
  <GarmentSvg>
    <JacketBody fill={tint(BLACKISH)} hem={54}>
      {/* asymmetric zip */}
      <path d="M28 13 L36 54" stroke={GREY} strokeWidth={1.4} strokeLinecap="round" />
      <path d="M28 13 L36 54" {...D} strokeDasharray="0.2 3" />
      {/* snap collar */}
      <path d="M24 9 L33 13.5 L25 18 L21 12 Z" fill={tint(BLACKISH)} {...D} />
      <path d="M40 9 L33 13.5 L40.5 17 L43.5 11.5 Z" fill={tint(BLACKISH)} {...D} />
      <circle cx={24} cy={15} r={1} fill={tint(GREY)} stroke="none" />
      {/* chest + hip zips */}
      <path d="M18 27 L26 31" stroke={GREY} strokeWidth={1.4} strokeLinecap="round" />
      <path d="M46 27 L38 31" stroke={GREY} strokeWidth={1.4} strokeLinecap="round" />
      <path d="M19 42 L26 45" stroke={GREY} strokeWidth={1.4} strokeLinecap="round" />
      {/* hem band */}
      <path d="M15 50 L49 50" {...D} />
    </JacketBody>
  </GarmentSvg>
);

const OvercoatArt: Art = () => (
  <GarmentSvg>
    <JacketBody fill={tint(TAN)} hem={58}>
      {/* deep lapels */}
      <path d="M24 9 L27 12 L32 32 L26 21 L21.5 16.5 L25.5 14 L22 11.5 Z" fill={tint(TAN)} {...D} />
      <path d="M40 9 L37 12 L32 32 L38 21 L42.5 16.5 L38.5 14 L42 11.5 Z" fill={tint(TAN)} {...D} />
      <path d="M27 12 L32 32 L37 12 C35 14.5 29 14.5 27 12 Z" fill={CREAM} {...D} />
      {/* closure + buttons */}
      <path d="M32 32 L32 58" {...D} />
      <circle cx={32} cy={36} r={1.1} fill={INK} stroke="none" />
      <circle cx={32} cy={43} r={1.1} fill={INK} stroke="none" />
      <circle cx={32} cy={50} r={1.1} fill={INK} stroke="none" />
      {/* flap pockets */}
      <path d="M18 40 L27 40 L27 43.4 L18 43.4 Z" fill={tint(TAN)} {...D} />
      <path d="M37 40 L46 40 L46 43.4 L37 43.4 Z" fill={tint(TAN)} {...D} />
    </JacketBody>
  </GarmentSvg>
);

const RaincoatArt: Art = () => (
  <GarmentSvg>
    <JacketBody fill={tint(STONE)} hem={58}>
      {/* small collar, top button */}
      <path d="M25 9 L32 14 L26.5 16.5 L23 11.5 Z" fill={tint(STONE)} {...D} />
      <path d="M39 9 L32 14 L37.5 16.5 L41 11.5 Z" fill={tint(STONE)} {...D} />
      <circle cx={32} cy={17} r={0.9} fill={INK} stroke="none" />
      {/* fly front */}
      <path d="M32 14.5 L32 58" {...D} />
      <path d="M28.5 20 L28.5 52" {...D} />
      {/* welt pockets */}
      <path d="M19 38 L26 42" {...D} />
      <path d="M45 38 L38 42" {...D} />
    </JacketBody>
  </GarmentSvg>
);

const ChoreJacketArt: Art = () => (
  <GarmentSvg>
    <JacketBody fill={tint(FRENCHBLUE)} hem={54}>
      {/* small collar */}
      <path d="M25 9 L32 14.5 L26.5 17.5 L23 11.5 Z" fill={tint(FRENCHBLUE)} {...D} />
      <path d="M39 9 L32 14.5 L37.5 17.5 L41 11.5 Z" fill={tint(FRENCHBLUE)} {...D} />
      {/* placket + buttons */}
      <path d="M30.8 15 L30.8 54 M33.2 15 L33.2 54" {...D} />
      <circle cx={32} cy={19} r={0.9} fill={INK} stroke="none" />
      <circle cx={32} cy={26} r={0.9} fill={INK} stroke="none" />
      <circle cx={32} cy={33} r={0.9} fill={INK} stroke="none" />
      <circle cx={32} cy={40} r={0.9} fill={INK} stroke="none" />
      <circle cx={32} cy={47} r={0.9} fill={INK} stroke="none" />
      {/* three patch pockets */}
      <path d="M37.5 21 L45 21 L45 29 L37.5 29 Z" fill={tint(FRENCHBLUE)} {...D} />
      <path d="M17.5 36 L26.5 36 L26.5 47 L17.5 47 Z" fill={tint(FRENCHBLUE)} {...D} />
      <path d="M37.5 36 L46.5 36 L46.5 47 L37.5 47 Z" fill={tint(FRENCHBLUE)} {...D} />
    </JacketBody>
  </GarmentSvg>
);

/* ---------------------------------- knits ------------------------------- */

const CrewneckArt: Art = () => (
  <GarmentSvg>
    <ShirtBody fill={tint(ECRU)}>
      {/* ribbed crew neck */}
      <path d="M25.5 11.5 C28 15.5 36 15.5 38.5 11.5" fill="none" {...D} />
      <path d="M24.8 10.2 C27.5 15 36.5 15 39.2 10.2" fill="none" {...D} />
      {/* ribbed hem + cuffs */}
      <path d="M16 51 L48 51" {...D} />
      <path d="M19 51.5 L19 54.5 M23 51.5 L23 54.5 M27 51.5 L27 54.5 M31 51.5 L31 54.5 M35 51.5 L35 54.5 M39 51.5 L39 54.5 M43 51.5 L43 54.5" {...D} />
      <path d="M10.5 43.5 L10.5 46.5 M12.5 43.5 L12.5 46.5 M14.5 43.5 L14.5 46.5 M49.5 43.5 L49.5 46.5 M51.5 43.5 L51.5 46.5 M53.5 43.5 L53.5 46.5" {...D} />
    </ShirtBody>
  </GarmentSvg>
);

const CardiganArt: Art = () => (
  <GarmentSvg>
    <ShirtBody fill={tint(NAVY)}>
      {/* shawl collar */}
      <path d="M25 10 C27 15 29.5 20 30.8 26 L30.8 55" fill="none" {...D} />
      <path d="M39 10 C37 15 34.5 20 33.2 26 L33.2 55" fill="none" {...D} />
      <path d="M25 10 C24 16 26 22 28.6 26" fill="none" {...D} />
      <path d="M39 10 C40 16 38 22 35.4 26" fill="none" {...D} />
      {/* buttons */}
      <circle cx={32} cy={30} r={1} fill={OCHRE} stroke="none" />
      <circle cx={32} cy={37} r={1} fill={OCHRE} stroke="none" />
      <circle cx={32} cy={44} r={1} fill={OCHRE} stroke="none" />
      <circle cx={32} cy={51} r={1} fill={OCHRE} stroke="none" />
      {/* ribbed hem */}
      <path d="M16 51 L30 51 M34 51 L48 51" {...D} />
      <path d="M19 51.5 L19 54.5 M23 51.5 L23 54.5 M27 51.5 L27 54.5 M37 51.5 L37 54.5 M41 51.5 L41 54.5 M45 51.5 L45 54.5" {...D} />
    </ShirtBody>
  </GarmentSvg>
);

const SweatshirtArt: Art = () => (
  <GarmentSvg>
    <ShirtBody fill={tint(GREY)}>
      {/* neck band + V-notch */}
      <path d="M25 11 C27.5 15.5 36.5 15.5 39 11" fill="none" {...D} />
      <path d="M29.5 14.8 L32 19.5 L34.5 14.8" fill="none" {...D} />
      {/* ribbed hem + cuffs */}
      <path d="M16 50.5 L48 50.5" {...D} />
      <path d="M19 51 L19 54.5 M23 51 L23 54.5 M27 51 L27 54.5 M31 51 L31 54.5 M35 51 L35 54.5 M39 51 L39 54.5 M43 51 L43 54.5" {...D} />
      <path d="M10.5 43.5 L10.5 46.5 M12.5 43.5 L12.5 46.5 M14.5 43.5 L14.5 46.5 M49.5 43.5 L49.5 46.5 M51.5 43.5 L51.5 46.5 M53.5 43.5 L53.5 46.5" {...D} />
    </ShirtBody>
  </GarmentSvg>
);

/* ---------------------------------- formal ------------------------------ */

const SuitArt: Art = () => (
  <GarmentSvg>
    <JacketBody fill={tint(CHARCOAL)} hem={56}>
      <path d="M27.5 12 L32 32 L36.5 12 C34.5 14 29.5 14 27.5 12 Z" fill={WHITE} {...D} />
      <path d="M30.9 13.5 L33.1 13.5 L34.2 20 L32 24.5 L29.8 20 Z" fill={BURGUNDY} {...D} />
      {/* notch lapels */}
      <path d="M24 9 L27.5 12 L32 32 L26.5 21 L22.5 16.5 L26 14 L22.5 11.5 Z" fill={tint(CHARCOAL)} {...D} />
      <path d="M40 9 L36.5 12 L32 32 L37.5 21 L41.5 16.5 L38 14 L41.5 11.5 Z" fill={tint(CHARCOAL)} {...D} />
      <path d="M32 32 L32 56" {...D} />
      <circle cx={32} cy={36} r={1} fill={INK} stroke="none" />
      <circle cx={32} cy={43} r={1} fill={INK} stroke="none" />
      {/* pockets */}
      <path d="M18 39 L27 39 L27 42.2 L18 42.2 Z" fill={tint(CHARCOAL)} {...D} />
      <path d="M37 39 L46 39 L46 42.2 L37 42.2 Z" fill={tint(CHARCOAL)} {...D} />
      <path d="M19.5 24 L25.5 24" {...D} />
    </JacketBody>
  </GarmentSvg>
);

const DinnerSuitArt: Art = () => (
  <GarmentSvg>
    <JacketBody fill={tint(BLACKISH)} hem={56}>
      <path d="M27.5 12 L32 34 L36.5 12 C34.5 14 29.5 14 27.5 12 Z" fill={WHITE} {...D} />
      {/* bow tie */}
      <path d="M28.5 14.5 L31.3 16.2 L31.3 18.8 L28.5 20.5 Z" fill={INK} {...D} />
      <path d="M35.5 14.5 L32.7 16.2 L32.7 18.8 L35.5 20.5 Z" fill={INK} {...D} />
      <path d="M31.3 16.4 L32.7 16.4 L32.7 18.6 L31.3 18.6 Z" fill={INK} {...D} />
      {/* satin shawl lapel */}
      <path d="M24 9 C22 18 26 28 32 34 L27.5 12 Z" fill={SATIN} {...D} />
      <path d="M40 9 C42 18 38 28 32 34 L36.5 12 Z" fill={SATIN} {...D} />
      <path d="M32 34 L32 56" {...D} />
      <circle cx={32} cy={38} r={1} fill={INK} stroke="none" />
      {/* jetted pockets */}
      <path d="M18 40 L27 40" {...D} />
      <path d="M37 40 L46 40" {...D} />
    </JacketBody>
  </GarmentSvg>
);

const TieArt: Art = () => (
  <GarmentSvg>
    {/* knot */}
    <path d="M27.5 8 L36.5 8 L34.5 16 L29.5 16 Z" fill={tint(NAVY)} {...L} />
    {/* blade */}
    <path d="M29.5 16 L34.5 16 L38 44 L32 56 L26 44 Z" fill={tint(NAVY)} {...L} />
    {/* repp stripes */}
    <path d="M27.2 27 L36.2 21.5" stroke={BURGUNDY} strokeWidth={3.2} strokeLinecap="round" />
    <path d="M28.3 36 L37.4 30.5" stroke={BURGUNDY} strokeWidth={3.2} strokeLinecap="round" />
    <path d="M29.4 45 L38.2 39.8" stroke={BURGUNDY} strokeWidth={3.2} strokeLinecap="round" />
    <path d="M30.8 52.5 L36.4 49" stroke={BURGUNDY} strokeWidth={3.2} strokeLinecap="round" />
    <path d="M26.9 30 L36.6 24.2" stroke={CREAM} strokeWidth={0.9} strokeLinecap="round" />
    <path d="M28 39 L37.8 33.2" stroke={CREAM} strokeWidth={0.9} strokeLinecap="round" />
    <path d="M29.2 48 L37.6 43" stroke={CREAM} strokeWidth={0.9} strokeLinecap="round" />
  </GarmentSvg>
);

const ScarfArt: Art = () => (
  <GarmentSvg>
    {/* looped scarf: ring + two hanging tails */}
    <path d="M20 14 C20 9.5 44 9.5 44 14 C44 18.5 38 21 32 21 C26 21 20 18.5 20 14 Z" fill={tint(TAN)} {...L} />
    <path d="M22 17.5 C25 20 39 20 42 17.5" fill="none" {...D} />
    {/* left tail */}
    <path d="M24 19.5 L21 48 L30 48 L31.5 21" fill={tint(TAN)} {...L} />
    {/* right tail */}
    <path d="M40 19.5 L43 44 L34 44 L32.5 21" fill={tint(TAN)} {...L} />
    {/* fringe */}
    <path d="M22 48 L21.5 53 M24.5 48 L24.3 53 M27 48 L27.2 53 M29.5 48 L29.8 53" {...D} />
    <path d="M35 44 L35.3 49 M37.5 44 L37.8 49 M40 44 L40.4 49 M42.3 44 L42.8 49" {...D} />
    {/* weave lines */}
    <path d="M25.5 26 L30.8 26 M24.8 33 L30.4 33 M23.9 40 L30.1 40" {...D} />
    <path d="M33.2 26 L38.7 26 M33.6 32 L39.4 32 M34 38 L40.2 38" {...D} />
  </GarmentSvg>
);

const BeltArt: Art = () => (
  <GarmentSvg>
    {/* coiled belt seen from above */}
    <circle cx={31} cy={33} r={17.5} fill="none" stroke={BROWN} strokeWidth={9} />
    <circle cx={31} cy={33} r={22} fill="none" {...L} />
    <circle cx={31} cy={33} r={13} fill="none" {...L} />
    {/* strap end exiting the coil */}
    <path d="M43 20 C49 23 53 28 54 34 L46 36 C45 31 42 27 38 25 Z" fill={tint(BROWN)} {...L} />
    {/* buckle */}
    <path d="M46 32 L56 30 L57.5 37 L47.5 39 Z" fill={OCHRE} {...L} />
    <path d="M51.5 31 L52.5 38" {...D} />
    {/* holes */}
    <circle cx={20} cy={26} r={1} fill={INK} stroke="none" />
    <circle cx={17.5} cy={31} r={1} fill={INK} stroke="none" />
    <circle cx={17.5} cy={36.5} r={1} fill={INK} stroke="none" />
  </GarmentSvg>
);

const GlovesArt: Art = () => (
  <GarmentSvg>
    {/* rear glove */}
    <path d="M36 14 L48 14 L48 34 C48 40 44 44 39 44 L34 44 C31 44 30 41 31.5 39 L35 34 Z" fill={tint(DARKBROWN)} {...L} />
    {/* front glove — palm with fingers */}
    <path
      d="M17 20 L29 20 L29 33 L31.5 29 C32.8 27 36 28 35 31 L31 39 C29.5 42 27 43.5 24 43.5 L21 43.5 C18.5 43.5 17 41.5 17 39 Z"
      fill={tint(BROWN)}
      {...L}
    />
    {/* finger separations */}
    <path d="M20.7 20.5 L20.7 30 M24.3 20.5 L24.3 30 M27.9 20.5 L27.9 30" {...D} />
    {/* cuffs */}
    <path d="M16 14 L30 14 L30 20 L16 20 Z" fill={tint(BROWN)} {...L} />
    <path d="M36 14 L48 14 L48 19 L36 19 Z" fill={tint(DARKBROWN)} {...L} />
    {/* stitch detail */}
    <path d="M20 36 L26 36" {...D} />
  </GarmentSvg>
);

/* ----------------------------------- hats ------------------------------- */

const FlatCapArt: Art = () => (
  <GarmentSvg>
    {/* side profile, peak left */}
    <path d="M52 40 C54 26 42 18 30 19 C19 20 11 28 10 38 L10 40 Z" fill={tint(BROWN)} {...L} />
    {/* peak */}
    <path d="M10 40 L6 40 C5 40 5 38 6.5 37.5 L10 36.5 Z" fill={tint(DARKBROWN)} {...L} />
    {/* herringbone ticks */}
    <path d="M20 26 L23 29 M23 29 L26 26 M30 24 L33 27 M33 27 L36 24 M40 25 L43 28 M43 28 L46 25 M25 33 L28 36 M28 36 L31 33 M35 32 L38 35 M38 35 L41 32" stroke={INK} strokeWidth={0.9} strokeLinecap="round" />
    {/* band edge */}
    <path d="M10 40 L52 40" {...L} />
    <circle cx={31} cy={20.5} r={1.1} fill={tint(DARKBROWN)} {...D} />
  </GarmentSvg>
);

const BeanieArt: Art = () => (
  <GarmentSvg>
    <path d="M15 38 C15 20 49 20 49 38 Z" fill={tint(NAVY)} {...L} />
    {/* vertical ribs on dome */}
    <path d="M24 23.5 C23 28 22.5 33 22.5 38 M32 21.8 L32 38 M40 23.5 C41 28 41.5 33 41.5 38" {...D} />
    {/* folded band */}
    <path d="M13 38 L51 38 L51 46 L13 46 Z" fill={tint(NAVY_LIGHT)} {...L} />
    <path d="M17 38.5 L17 45.5 M21 38.5 L21 45.5 M25 38.5 L25 45.5 M29 38.5 L29 45.5 M33 38.5 L33 45.5 M37 38.5 L37 45.5 M41 38.5 L41 45.5 M45 38.5 L45 45.5" {...D} />
  </GarmentSvg>
);

const BrimmedHatArt: Art = () => (
  <GarmentSvg>
    {/* crown */}
    <path d="M18 38 C17 24 22 16 32 16 C42 16 47 24 46 38 Z" fill={tint(BROWN)} {...L} />
    {/* crown pinch */}
    <path d="M32 16.5 C29 22 28.5 28 29.5 33" {...D} />
    {/* band */}
    <path d="M17.6 33 L46.4 33 L46 38.5 L18 38.5 Z" fill={tint(DARKBROWN)} {...L} />
    {/* brim */}
    <path d="M8 38 L56 38 C56 43 51 45.5 44 45.5 L20 45.5 C13 45.5 8 43 8 38 Z" fill={tint(BROWN)} {...L} />
  </GarmentSvg>
);

/* ----------------------------------- bags ------------------------------- */

const BagArt: Art = () => (
  <GarmentSvg>
    {/* holdall body */}
    <path d="M14 27 L50 27 C55 27 58 32 58 38.5 C58 45 55 50 50 50 L14 50 C9 50 6 45 6 38.5 C6 32 9 27 14 27 Z" fill={tint(TAN)} {...L} />
    {/* zip along the top */}
    <path d="M12 30.5 L52 30.5" {...D} />
    <path d="M50 30.5 L53 28" {...D} />
    {/* end seams */}
    <path d="M13 27.5 C10.5 30 9.5 34 9.5 38.5 C9.5 43 10.5 47 13 49.5" fill="none" {...D} />
    <path d="M51 27.5 C53.5 30 54.5 34 54.5 38.5 C54.5 43 53.5 47 51 49.5" fill="none" {...D} />
    {/* straps + handles */}
    <path d="M22 27 L22 50 M26 27 L26 50 M38 27 L38 50 M42 27 L42 50" stroke={DARKBROWN} strokeWidth={2.4} strokeLinecap="round" />
    <path d="M24 26 C24 17 40 17 40 26" fill="none" stroke={DARKBROWN} strokeWidth={2.6} strokeLinecap="round" />
  </GarmentSvg>
);

const BriefcaseArt: Art = () => (
  <GarmentSvg>
    {/* handle */}
    <path d="M27 22 C27 16.5 37 16.5 37 22" fill="none" stroke={DARKBROWN} strokeWidth={2.6} strokeLinecap="round" />
    {/* body */}
    <path d="M11 22 L53 22 C54.5 22 55.5 23 55.5 24.5 L55.5 49 C55.5 50.5 54.5 51.5 53 51.5 L11 51.5 C9.5 51.5 8.5 50.5 8.5 49 L8.5 24.5 C8.5 23 9.5 22 11 22 Z" fill={tint(BROWN)} {...L} />
    {/* flap */}
    <path d="M8.5 34 L55.5 34" {...D} />
    {/* clasps */}
    <path d="M18 31 L24 31 L24 37 L18 37 Z" fill={OCHRE} {...D} />
    <path d="M40 31 L46 31 L46 37 L40 37 Z" fill={OCHRE} {...D} />
    {/* stitching */}
    <path d="M11 47.5 L53 47.5" stroke={OCHRE} strokeWidth={0.9} strokeLinecap="round" strokeDasharray="2 2" />
  </GarmentSvg>
);

const BackpackArt: Art = () => (
  <GarmentSvg>
    {/* top handle */}
    <path d="M28 14 C28 10 36 10 36 14" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />
    {/* body */}
    <path d="M20 14 L44 14 C48 14 50 17 50 21 L50 46 C50 50 48 52 44 52 L20 52 C16 52 14 50 14 46 L14 21 C14 17 16 14 20 14 Z" fill={tint(OLIVE)} {...L} />
    {/* lid flap */}
    <path d="M14 28 C24 32 40 32 50 28" fill="none" {...D} />
    {/* front pocket */}
    <path d="M23 36 L41 36 L41 50 L23 50 Z" fill={tint(OLIVE)} {...D} />
    {/* straps + buckles */}
    <path d="M25 15 L25 40 M39 15 L39 40" stroke={DARKBROWN} strokeWidth={2.4} strokeLinecap="round" />
    <path d="M22.8 38 L27.2 38 L27.2 42 L22.8 42 Z" fill={OCHRE} {...D} />
    <path d="M36.8 38 L41.2 38 L41.2 42 L36.8 42 Z" fill={OCHRE} {...D} />
  </GarmentSvg>
);

/* ---------------------------------- generic ----------------------------- */

const GenericArt: Art = () => (
  <GarmentSvg>
    {/* Neutral tag for genuinely uncategorised items — clear without implying
        that the piece belongs on a hanger or is a specific garment type. */}
    <path d="M14 17 L38 13 L53 28 L34 49 L13 36 Z" fill={tint(KHAKI)} {...L} />
    <circle cx={25} cy={25} r={4} fill={WHITE} {...D} />
    <path d="M31 20 L45 33 M26 35 L35 44" fill="none" {...D} />
  </GarmentSvg>
);

/* ==========================================================================
 * CHARACTERS — portrait 4:5, viewBox 120×150
 * ========================================================================*/

function GroundShadow() {
  return <ellipse cx={60} cy={141.5} rx={29} ry={4} fill={GROUND} stroke="none" />;
}

function Head({ hat }: { hat?: 'flatcap' }) {
  return (
    <>
      <path d="M55 25 L55 36 L65 36 L65 25 Z" fill={SKIN} {...AL} />
      <circle cx={60} cy={18} r={10.5} fill={SKIN} {...AL} />
      {hat === 'flatcap' ? (
        <>
          <path d="M48.5 14.5 C50 6.5 70 6.5 71.5 14.5 L72 16 L48 16 Z" fill={tint(BROWN)} {...AL} />
          <path d="M48 16 L72 16 L75.5 17.5 C76.5 18 76 19.5 74.5 19.5 L68 18.5" fill={tint(BROWN)} {...AL} />
        </>
      ) : (
        <path d="M49.5 17.5 C49.5 9.5 54 7.2 60 7.2 C66 7.2 70.5 9.5 70.5 17.5 C67 12.8 53 12.8 49.5 17.5 Z" fill={HAIR} {...AD} />
      )}
    </>
  );
}

function Hands({ y = 87 }: { y?: number }) {
  return (
    <>
      <circle cx={40.5} cy={y} r={3.2} fill={SKIN} {...AD} />
      <circle cx={79.5} cy={y} r={3.2} fill={SKIN} {...AD} />
    </>
  );
}

/** Trouser legs + optional details. */
function Legs({ fill, crease = false, cuff = 131, cargo = false }: { fill: string; crease?: boolean; cuff?: number; cargo?: boolean }) {
  return (
    <>
      <path d={`M46.5 79 L73.5 79 L71.5 ${cuff} L62.5 ${cuff} L60 96 L57.5 ${cuff} L48.5 ${cuff} Z`} fill={fill} {...AL} />
      {crease && (
        <>
          <path d={`M53.5 86 L52.8 ${cuff - 3}`} {...AD} />
          <path d={`M66.5 86 L67.2 ${cuff - 3}`} {...AD} />
        </>
      )}
      {cargo && (
        <>
          <path d="M47.5 100 L56 100 L55.5 110 L48 110 Z" fill={fill} {...AD} />
          <path d="M64 100 L72.5 100 L72 110 L64.5 110 Z" fill={fill} {...AD} />
        </>
      )}
    </>
  );
}

type ShoeStyle = 'loafer' | 'derby' | 'boot' | 'sneaker' | 'welly' | 'deck';

function Shoes({ style, color }: { style: ShoeStyle; color: string }) {
  if (style === 'welly') {
    return (
      <>
        <path d="M49 104 L58 104 L58 136 C58 139 55.5 140.5 52 140.5 L44 140.5 C41 140.5 40 138 41.5 136 C43.5 133.5 46 132.5 49 131.5 Z" fill={color} {...AL} />
        <path d="M62 104 L71 104 L71 131.5 C74 132.5 76.5 133.5 78.5 136 C80 138 79 140.5 76 140.5 L68 140.5 C64.5 140.5 62 139 62 136 Z" fill={color} {...AL} />
        <path d="M49.5 108 L57.5 108 M62.5 108 L70.5 108" {...AD} />
        <path d="M41 137.5 L58 137.5 M62 137.5 L79 137.5" {...AD} />
      </>
    );
  }
  const boot = style === 'boot';
  const topY = boot ? 126 : 131;
  return (
    <>
      {/* left foot (toe pointing left-out) */}
      <path
        d={`M48.5 ${topY} L58 ${topY} L58 136.5 C58 139 55.5 140.5 51.5 140.5 L42.5 140.5 C39.5 140.5 38.8 138 40.5 136.2 C43 133.8 45.5 133 48.5 132.5 Z`}
        fill={color}
        {...AL}
      />
      {/* right foot */}
      <path
        d={`M62 ${topY} L71.5 ${topY} L71.5 132.5 C74.5 133 77 133.8 79.5 136.2 C81.2 138 80.5 140.5 77.5 140.5 L68.5 140.5 C64.5 140.5 62 139 62 136.5 Z`}
        fill={color}
        {...AL}
      />
      {/* soles */}
      <path d="M39.6 138.2 L58 138.2 M62 138.2 L80.4 138.2" stroke={INK} strokeWidth={1.2} strokeLinecap="round" />
      {style === 'loafer' && <path d="M46 134.5 L51 133.2 M69 133.2 L74 134.5" {...AD} />}
      {style === 'derby' && <path d="M50 133.6 L54 132.8 M66 132.8 L70 133.6" {...AD} />}
      {style === 'boot' && <path d="M48.8 129 L57.7 129 M62.3 129 L71.2 129" {...AD} />}
      {(style === 'sneaker' || style === 'deck') && (
        <path d="M40 137 L58 137 M62 137 L80 137" stroke={CREAM} strokeWidth={2.4} strokeLinecap="round" />
      )}
    </>
  );
}

/** Torso + sleeves for a shirt worn tucked (no jacket). */
function ShirtTorso({ fill, children }: { fill: string; children?: React.ReactNode }) {
  return (
    <>
      {/* sleeves behind torso */}
      <path d="M50 36 L42 41 L38.5 47 L37.5 83 L44.5 83 L45.5 52 Z" fill={fill} {...AL} />
      <path d="M70 36 L78 41 L81.5 47 L82.5 83 L75.5 83 L74.5 52 Z" fill={fill} {...AL} />
      {/* torso */}
      <path d="M50 36 L45 40 L45.5 81 L74.5 81 L75 40 L70 36 C67 40.5 53 40.5 50 36 Z" fill={fill} {...AL} />
      {children}
    </>
  );
}

/** Open-front jacket torso + sleeves; children draw what shows beneath. */
function JacketTorso({ fill, hem = 84, children }: { fill: string; hem?: number; children?: React.ReactNode }) {
  return (
    <>
      <path d={`M50 36 L41.5 41 L38 47 L37 ${hem} L44 ${hem} L45 54 Z`} fill={fill} {...AL} />
      <path d={`M70 36 L78.5 41 L82 47 L83 ${hem} L76 ${hem} L75 54 Z`} fill={fill} {...AL} />
      {children}
      {/* jacket front panels over the base layer */}
      <path d={`M50 36 L44.5 40 L44.8 ${hem} L57 ${hem} L58.5 48 Z`} fill={fill} {...AL} />
      <path d={`M70 36 L75.5 40 L75.2 ${hem} L63 ${hem} L61.5 48 Z`} fill={fill} {...AL} />
    </>
  );
}

/* --------------------------- individual archetypes ----------------------- */

const IvyArt: Art = () => (
  <FigureSvg>
    <GroundShadow />
    <Legs fill={tint(KHAKI)} crease={false} />
    <Shoes style="loafer" color={BROWN} />
    <ShirtTorso fill={tint(SKY)}>
      {/* placket + buttons */}
      <path d="M60 41 L60 80" {...AD} />
      <circle cx={60} cy={47} r={1} fill={INK} stroke="none" />
      <circle cx={60} cy={55} r={1} fill={INK} stroke="none" />
      <circle cx={60} cy={63} r={1} fill={INK} stroke="none" />
      <circle cx={60} cy={71} r={1} fill={INK} stroke="none" />
      {/* button-down collar */}
      <path d="M52 35.5 L60 42 L54.5 45 L51 38 Z" fill={tint(SKY)} {...AD} />
      <path d="M68 35.5 L60 42 L65.5 45 L69 38 Z" fill={tint(SKY)} {...AD} />
      <circle cx={55} cy={43.8} r={0.8} fill={INK} stroke="none" />
      <circle cx={65} cy={43.8} r={0.8} fill={INK} stroke="none" />
      {/* surcingle belt */}
      <path d="M45.7 77 L74.3 77" stroke={NAVY} strokeWidth={3} strokeLinecap="round" />
      <path d="M58 77 L62 77" stroke={OCHRE} strokeWidth={3} strokeLinecap="round" />
    </ShirtTorso>
    <Hands />
    <Head />
  </FigureSvg>
);

const CountryArt: Art = () => (
  <FigureSvg>
    <GroundShadow />
    <Legs fill={tint(TAN)} cuff={126} />
    <Shoes style="welly" color={FOREST_DARK} />
    <JacketTorso fill={tint(WAXOLIVE)} hem={88}>
      <path d="M58 42 L62 42 L62 88 L58 88 Z" fill={tint(ECRU)} {...AD} />
    </JacketTorso>
    {/* corduroy collar */}
    <path d="M52 35.5 L60 42.5 L53.5 46 L50 38.5 Z" fill={tint(TAN)} {...AD} />
    <path d="M68 35.5 L60 42.5 L66.5 46 L70 38.5 Z" fill={tint(TAN)} {...AD} />
    {/* bellows pockets */}
    <path d="M46.5 68 L55 68 L55 80 L46.5 80 Z" fill={tint(WAXOLIVE)} {...AD} />
    <path d="M65 68 L73.5 68 L73.5 80 L65 80 Z" fill={tint(WAXOLIVE)} {...AD} />
    <path d="M46.5 71 L55 71 M65 71 L73.5 71" {...AD} />
    {/* snaps */}
    <circle cx={60} cy={50} r={1} fill={INK} stroke="none" />
    <circle cx={60} cy={60} r={1} fill={INK} stroke="none" />
    <circle cx={60} cy={70} r={1} fill={INK} stroke="none" />
    <circle cx={60} cy={80} r={1} fill={INK} stroke="none" />
    <Hands y={90} />
    <Head hat="flatcap" />
  </FigureSvg>
);

const ContinentalArt: Art = () => (
  <FigureSvg>
    <GroundShadow />
    <Legs fill={tint(GREY)} crease />
    <Shoes style="loafer" color={BROWN} />
    <JacketTorso fill={tint(STONE)}>
      {/* open-collar white shirt beneath */}
      <path d="M54 40 L60 62 L66 40 C64 43 56 43 54 40 Z" fill={WHITE} {...AD} />
      <path d="M54 39.5 L58 44 L54.5 46.5 Z" fill={WHITE} {...AD} />
      <path d="M66 39.5 L62 44 L65.5 46.5 Z" fill={WHITE} {...AD} />
    </JacketTorso>
    {/* soft notch lapels */}
    <path d="M52 36 L54.5 39 L59 58 L53 47 L50.5 43 L53 41 L50.5 39 Z" fill={tint(STONE)} {...AD} />
    <path d="M68 36 L65.5 39 L61 58 L67 47 L69.5 43 L67 41 L69.5 39 Z" fill={tint(STONE)} {...AD} />
    {/* single button */}
    <circle cx={59.8} cy={62} r={1} fill={INK} stroke="none" />
    {/* patch pockets */}
    <path d="M46.5 70 L54 70 L54 80 L46.5 80 Z" fill={tint(STONE)} {...AD} />
    <path d="M66 70 L73.5 70 L73.5 80 L66 80 Z" fill={tint(STONE)} {...AD} />
    <Hands />
    <Head />
  </FigureSvg>
);

const SportsmanArt: Art = () => (
  <FigureSvg>
    <GroundShadow />
    <Legs fill={tint(DENIM)} />
    <Shoes style="boot" color={BROWN} />
    <ShirtTorso fill={RUST}>
      {/* plaid */}
      <path d="M52 44 L52 80 M68 44 L68 80" stroke="#8F4527" strokeWidth={3} strokeLinecap="round" />
      <path d="M45.8 56 L74.2 56 M45.8 70 L74.2 70" stroke="#8F4527" strokeWidth={3} strokeLinecap="round" />
      <path d="M40 56 L44 56 M76 56 L80 56" stroke="#8F4527" strokeWidth={3} strokeLinecap="round" />
      <path d="M56 46 L56 79 M45.9 62 L74.1 62" stroke={CREAM} strokeWidth={0.9} strokeLinecap="round" />
      {/* placket + collar */}
      <path d="M60 42 L60 80" {...AD} />
      <circle cx={60} cy={49} r={1} fill={INK} stroke="none" />
      <circle cx={60} cy={59} r={1} fill={INK} stroke="none" />
      <circle cx={60} cy={69} r={1} fill={INK} stroke="none" />
      <path d="M52 35.5 L60 42 L54.5 45 L51 38 Z" fill={RUST} {...AD} />
      <path d="M68 35.5 L60 42 L65.5 45 L69 38 Z" fill={RUST} {...AD} />
    </ShirtTorso>
    <Hands />
    <Head />
  </FigureSvg>
);

const WorkwearArt: Art = () => (
  <FigureSvg>
    <GroundShadow />
    <Legs fill={tint(ECRU)} />
    <Shoes style="boot" color={DARKBROWN} />
    <JacketTorso fill={tint(FRENCHBLUE)} hem={86}>
      <path d="M58 42 L62 42 L62 86 L58 86 Z" fill={CREAM} {...AD} />
    </JacketTorso>
    {/* small collar */}
    <path d="M52.5 35.5 L60 42 L55 45 L51.5 38.5 Z" fill={tint(FRENCHBLUE)} {...AD} />
    <path d="M67.5 35.5 L60 42 L65 45 L68.5 38.5 Z" fill={tint(FRENCHBLUE)} {...AD} />
    {/* buttons */}
    <circle cx={60} cy={48} r={1} fill={INK} stroke="none" />
    <circle cx={60} cy={56} r={1} fill={INK} stroke="none" />
    <circle cx={60} cy={64} r={1} fill={INK} stroke="none" />
    <circle cx={60} cy={72} r={1} fill={INK} stroke="none" />
    <circle cx={60} cy={80} r={1} fill={INK} stroke="none" />
    {/* three patch pockets */}
    <path d="M64.5 48 L72.5 48 L72.5 57 L64.5 57 Z" fill={tint(FRENCHBLUE)} {...AD} />
    <path d="M46 66 L54.5 66 L54.5 78 L46 78 Z" fill={tint(FRENCHBLUE)} {...AD} />
    <path d="M65.5 66 L74 66 L74 78 L65.5 78 Z" fill={tint(FRENCHBLUE)} {...AD} />
    <Hands y={88} />
    <Head />
  </FigureSvg>
);

const MilitaryArt: Art = () => (
  <FigureSvg>
    <GroundShadow />
    <Legs fill={tint(STONE)} cargo />
    <Shoes style="boot" color={BLACKISH} />
    <JacketTorso fill={tint(OLIVE)} hem={88}>
      <path d="M58 42 L62 42 L62 88 L58 88 Z" fill={tint(ECRU)} {...AD} />
    </JacketTorso>
    {/* collar */}
    <path d="M52.5 35.5 L60 42 L55 45 L51.5 38.5 Z" fill={tint(OLIVE)} {...AD} />
    <path d="M67.5 35.5 L60 42 L65 45 L68.5 38.5 Z" fill={tint(OLIVE)} {...AD} />
    {/* epaulettes */}
    <path d="M44 40 L51 37.5 M69 37.5 L76 40" {...AD} />
    {/* four pockets */}
    <path d="M47 48 L54.5 48 L54.5 56 L47 56 Z" fill={tint(OLIVE)} {...AD} />
    <path d="M65.5 48 L73 48 L73 56 L65.5 56 Z" fill={tint(OLIVE)} {...AD} />
    <path d="M47 50.5 L54.5 50.5 M65.5 50.5 L73 50.5" {...AD} />
    <path d="M46 68 L55 68 L55 80 L46 80 Z" fill={tint(OLIVE)} {...AD} />
    <path d="M65 68 L74 68 L74 80 L65 80 Z" fill={tint(OLIVE)} {...AD} />
    <path d="M46 71 L55 71 M65 71 L74 71" {...AD} />
    <Hands y={90} />
    <Head />
  </FigureSvg>
);

const NauticalArt: Art = () => (
  <FigureSvg>
    <GroundShadow />
    <Legs fill={tint(NAVY)} />
    <Shoes style="deck" color={BROWN} />
    <ShirtTorso fill={WHITE}>
      {/* breton stripes across torso */}
      <path d="M45.4 46 L74.6 46 M45.4 52 L74.6 52 M45.5 58 L74.5 58 M45.5 64 L74.5 64 M45.5 70 L74.5 70 M45.5 76 L74.5 76" stroke={NAVY} strokeWidth={3} strokeLinecap="round" />
      {/* stripes on sleeves */}
      <path d="M38.3 52 L44.8 52 M75.2 52 L81.7 52 M38 58 L44.8 58 M75.2 58 L82 58 M37.9 64 L44.7 64 M75.3 64 L82.1 64 M37.8 70 L44.6 70 M75.4 70 L82.2 70 M37.7 76 L44.5 76 M75.5 76 L82.3 76" stroke={NAVY} strokeWidth={3} strokeLinecap="round" />
      {/* boat neck */}
      <path d="M51 37 C54 41 66 41 69 37" fill="none" {...AD} />
    </ShirtTorso>
    <Hands />
    <Head />
  </FigureSvg>
);

const RivieraArt: Art = () => (
  <FigureSvg>
    <GroundShadow />
    <Legs fill="#E0C998" cuff={127} />
    <Shoes style="loafer" color={TAN} />
    {/* linen shirt worn untucked */}
    <path d="M50 36 L42 41 L38.5 47 L37.5 83 L44.5 83 L45.5 52 Z" fill={CREAM} {...AL} />
    <path d="M70 36 L78 41 L81.5 47 L82.5 83 L75.5 83 L74.5 52 Z" fill={CREAM} {...AL} />
    <path d="M50 36 L45 40 L45.5 87 L74.5 87 L75 40 L70 36 C67 40.5 53 40.5 50 36 Z" fill={CREAM} {...AL} />
    {/* open collar */}
    <path d="M52 35.5 L58 41.5 L53 44.5 L50 38 Z" fill={CREAM} {...AD} />
    <path d="M68 35.5 L62 41.5 L67 44.5 L70 38 Z" fill={CREAM} {...AD} />
    <path d="M58 41.5 L60 46 L62 41.5" fill="none" {...AD} />
    {/* placket + buttons */}
    <path d="M60 46 L60 86" {...AD} />
    <circle cx={60} cy={53} r={1} fill={INK} stroke="none" />
    <circle cx={60} cy={62} r={1} fill={INK} stroke="none" />
    <circle cx={60} cy={71} r={1} fill={INK} stroke="none" />
    <circle cx={60} cy={80} r={1} fill={INK} stroke="none" />
    {/* rolled sleeves */}
    <path d="M38.2 66 L44.6 66 M75.4 66 L81.8 66" {...AD} />
    <Hands y={72} />
    <Head />
  </FigureSvg>
);

const FormalArt: Art = () => (
  <FigureSvg>
    <GroundShadow />
    <Legs fill={tint(NAVY)} crease />
    <Shoes style="derby" color={BLACKISH} />
    <JacketTorso fill={tint(NAVY)}>
      <path d="M55 39 L60 60 L65 39 C63 42 57 42 55 39 Z" fill={WHITE} {...AD} />
      <path d="M58.9 40.5 L61.1 40.5 L62 47 L60 52 L58 47 Z" fill={BURGUNDY} {...AD} />
    </JacketTorso>
    {/* notch lapels */}
    <path d="M52 36 L55 39 L59.5 58 L53.5 47 L50.5 43 L53.5 40.8 L50.8 38.8 Z" fill={tint(NAVY)} {...AD} />
    <path d="M68 36 L65 39 L60.5 58 L66.5 47 L69.5 43 L66.5 40.8 L69.2 38.8 Z" fill={tint(NAVY)} {...AD} />
    {/* buttons + pockets */}
    <circle cx={60} cy={62} r={1} fill={INK} stroke="none" />
    <circle cx={60} cy={69} r={1} fill={INK} stroke="none" />
    <path d="M46.5 71 L54 71 L54 74 L46.5 74 Z" fill={tint(NAVY)} {...AD} />
    <path d="M66 71 L73.5 71 L73.5 74 L66 74 Z" fill={tint(NAVY)} {...AD} />
    {/* pocket square on the chest panel */}
    <path d="M67 55 L72 55 L69.5 52 Z" fill={WHITE} {...AD} />
    <Hands />
    <Head />
  </FigureSvg>
);

const RelaxedArt: Art = () => (
  <FigureSvg>
    <GroundShadow />
    <Legs fill={tint(NAVY)} />
    <Shoes style="loafer" color={BROWN} />
    <JacketTorso fill={tint(GREY)}>
      {/* open-collar light blue shirt */}
      <path d="M54 40 L60 62 L66 40 C64 43 56 43 54 40 Z" fill={tint(SKY)} {...AD} />
      <path d="M54 39.5 L58 44 L54.5 46.5 Z" fill={tint(SKY)} {...AD} />
      <path d="M66 39.5 L62 44 L65.5 46.5 Z" fill={tint(SKY)} {...AD} />
      <circle cx={60} cy={50} r={0.8} fill={INK} stroke="none" />
      <circle cx={60} cy={56} r={0.8} fill={INK} stroke="none" />
    </JacketTorso>
    {/* lapels */}
    <path d="M52 36 L54.5 39 L59 58 L53 47 L50.5 43 L53 41 L50.5 39 Z" fill={tint(GREY)} {...AD} />
    <path d="M68 36 L65.5 39 L61 58 L67 47 L69.5 43 L67 41 L69.5 39 Z" fill={tint(GREY)} {...AD} />
    <circle cx={59.8} cy={62} r={1} fill={INK} stroke="none" />
    {/* patch pockets */}
    <path d="M46.5 70 L54 70 L54 80 L46.5 80 Z" fill={tint(GREY)} {...AD} />
    <path d="M66 70 L73.5 70 L73.5 80 L66 80 Z" fill={tint(GREY)} {...AD} />
    <Hands />
    <Head />
  </FigureSvg>
);

const MotoArt: Art = () => (
  <FigureSvg>
    <GroundShadow />
    <Legs fill={tint(DENIM)} />
    <Shoes style="boot" color={BLACKISH} />
    <JacketTorso fill={tint(BLACKISH)} hem={82}>
      <path d="M57 42 L63 42 L63 82 L57 82 Z" fill={LIGHTGREY} {...AD} />
    </JacketTorso>
    {/* asymmetric zip */}
    <path d="M57 44 L64 82" stroke={GREY} strokeWidth={1.6} strokeLinecap="round" />
    {/* snap lapels */}
    <path d="M52 36 L60 41 L53 46 L50 39 Z" fill={tint(BLACKISH)} {...AD} />
    <path d="M68 36 L60 41 L67 46 L70 39 Z" fill={tint(BLACKISH)} {...AD} />
    <circle cx={52.5} cy={43.5} r={1} fill={tint(GREY)} stroke="none" />
    <circle cx={67.5} cy={43.5} r={1} fill={tint(GREY)} stroke="none" />
    {/* chest zips */}
    <path d="M46.5 60 L53 64 M73.5 60 L67 64" stroke={GREY} strokeWidth={1.4} strokeLinecap="round" />
    <Hands />
    <Head />
  </FigureSvg>
);

/** The Ethaion valet — navy blazer, OCBD, chinos, loafers, pocket square. */
const WelcomeValetArt: Art = () => (
  <FigureSvg>
    <GroundShadow />
    <Legs fill={tint(KHAKI)} crease />
    <Shoes style="loafer" color={BROWN} />
    <JacketTorso fill={tint(NAVY)}>
      {/* OCBD + knit tie — kept open and simple so the chest stays legible */}
      <path d="M55 39 L60 60 L65 39 C63 42 57 42 55 39 Z" fill={tint(SKY)} {...AD} />
      <path d="M58.9 40.5 L61.1 40.5 L62 47 L60 52 L58 47 Z" fill={BURGUNDY} {...AD} />
    </JacketTorso>
    {/* lapels */}
    <path d="M52 36 L55 39 L59.5 58 L53.5 47 L50.5 43 L53.5 40.8 L50.8 38.8 Z" fill={tint(NAVY)} {...AD} />
    <path d="M68 36 L65 39 L60.5 58 L66.5 47 L69.5 43 L66.5 40.8 L69.2 38.8 Z" fill={tint(NAVY)} {...AD} />
    {/* brass buttons */}
    <circle cx={60} cy={61.5} r={1.1} fill={OCHRE} stroke="none" />
    <circle cx={60} cy={68.5} r={1.1} fill={OCHRE} stroke="none" />
    {/* pocket square on the chest panel */}
    <path d="M67 54.5 L72 54.5 L69.5 51.5 Z" fill={WHITE} {...AD} />
    {/* patch pockets */}
    <path d="M46.5 70 L54 70 L54 80 L46.5 80 Z" fill={tint(NAVY)} {...AD} />
    <path d="M66 70 L73.5 70 L73.5 80 L66 80 Z" fill={tint(NAVY)} {...AD} />
    <Hands />
    <Head />
  </FigureSvg>
);

/* ==========================================================================
 * Registries + alias resolution
 * ========================================================================*/

const GARMENT_ART: Record<string, Art> = {
  ocbd: OcbdArt,
  'dress-shirt': DressShirtArt,
  flannel: FlannelArt,
  polo: PoloArt,
  tee: TeeArt,
  chinos: ChinosArt,
  jeans: JeansArt,
  trousers: TrousersArt,
  shorts: ShortsArt,
  loafers: LoafersArt,
  derbies: DerbiesArt,
  boots: BootsArt,
  sneakers: SneakersArt,
  espadrilles: EspadrillesArt,
  'field-jacket': FieldJacketArt,
  'waxed-jacket': WaxedJacketArt,
  blazer: BlazerArt,
  harrington: HarringtonArt,
  'leather-jacket': LeatherJacketArt,
  overcoat: OvercoatArt,
  raincoat: RaincoatArt,
  crewneck: CrewneckArt,
  cardigan: CardiganArt,
  sweatshirt: SweatshirtArt,
  scarf: ScarfArt,
  suit: SuitArt,
  'dinner-suit': DinnerSuitArt,
  tie: TieArt,
  'flat-cap': FlatCapArt,
  belt: BeltArt,
  bag: BagArt,
  'chore-jacket': ChoreJacketArt,
  gloves: GlovesArt,
  thermal: ThermalArt,
  'long-johns': LongJohnsArt,
  briefcase: BriefcaseArt,
  backpack: BackpackArt,
  beanie: BeanieArt,
  'brimmed-hat': BrimmedHatArt,
  generic: GenericArt,
};

/** Slot ids that reuse another drawing (ItemCard passes slot ids directly). */
const GARMENT_ALIASES: Record<string, string> = {
  'casual-shirt': 'flannel',
  shirt: 'ocbd',
  tops: 'ocbd',
  undershirt: 'tee',
  vest: 'thermal',
  'base-layers': 'thermal',
  oxford: 'derbies',
  oxfords: 'derbies',
  shoe: 'derbies',
  shoes: 'derbies',
  espadrille: 'espadrilles',
  espadrilles: 'espadrilles',
  'jazz-shoe': 'sneakers',
  'jazz-shoes': 'sneakers',
  'deck-shoe': 'loafers',
  'deck-shoes': 'loafers',
  'boat-shoe': 'loafers',
  'boat-shoes': 'loafers',
  'pique-polo': 'polo',
  'pique-cotton-polo': 'polo',
  'cotton-pique-polo': 'polo',
  other: 'generic',
  pants: 'trousers',
  bottoms: 'trousers',
  sweater: 'crewneck',
  knitwear: 'crewneck',
  jacket: 'field-jacket',
  outerwear: 'field-jacket',
  formalwear: 'suit',
  accessories: 'tie',
  bags: 'bag',
  hats: 'flat-cap',
  headwear: 'flat-cap',
};

interface ResolvedGarmentArt {
  assetId: string;
  art: Art;
}

function normalizeGarmentId(id: string): string {
  return id
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Systematic inference (Pass Five audit). The hard rules:
 *  - Anything shoe-like (shoe, boot, loafer, sneaker, Oxford-as-shoe,
 *    espadrille, moccasin, sandal, derby, brogue, monk strap, chukka,
 *    Chelsea/desert boot…) ALWAYS renders a shoe silhouette — never a hanger
 *    or generic tag.
 *  - Anything jacket-like (jacket, coat, blazer, parka, anorak, Harrington,
 *    trench, overcoat, field/wax jacket, puffer…) ALWAYS renders an
 *    outerwear silhouette.
 *  - "Suit" is one garment — the suit silhouette, never top + bottom.
 */
function inferGarmentArtId(id: string): string | undefined {
  const words = new Set(id.split('-').filter(Boolean));
  const has = (...candidates: string[]) => candidates.some((candidate) => words.has(candidate));

  // --- Shoes: always a shoe silhouette, NEVER a hanger -------------------
  if (has('espadrille', 'espadrilles', 'alpargata', 'alpargatas')) return 'espadrilles';
  if (words.has('jazz') && has('shoe', 'shoes')) return 'sneakers';
  if (has('loafer', 'loafers', 'moccasin', 'moccasins', 'weejun', 'weejuns')) return 'loafers';
  if (words.has('monk') || has('derby', 'derbies', 'brogue', 'brogues', 'blucher', 'bluchers')) return 'derbies';
  if (has('oxford', 'oxfords') && !has('shirt', 'shirts', 'ocbd', 'cloth')) return 'derbies';
  if (has('chukka', 'chukkas', 'chelsea', 'boot', 'boots', 'desert')) return 'boots';
  if (has('sneaker', 'sneakers', 'trainer', 'trainers', 'plimsoll', 'plimsolls', 'gat', 'gats')) return 'sneakers';
  if (has('sandal', 'sandals', 'pump', 'pumps', 'heel', 'heels', 'deck', 'boat') && has('shoe', 'shoes', 'sandal', 'sandals', 'pump', 'pumps', 'heel', 'heels')) return 'loafers';
  if (has('shoe', 'shoes', 'footwear')) return 'derbies';

  // --- Suits: ONE garment, the suit silhouette ---------------------------
  if (has('tuxedo', 'tux') || (words.has('dinner') && has('suit', 'suits', 'jacket'))) return 'dinner-suit';
  if (has('suit', 'suits')) return 'suit';

  // --- Outerwear: always a jacket/coat silhouette ------------------------
  if (has('blazer', 'blazers') || (words.has('sport') && has('coat', 'coats', 'jacket', 'jackets')) || (words.has('tweed') && has('coat', 'jacket'))) return 'blazer';
  if (has('harrington', 'bomber', 'blouson')) return 'harrington';
  if (has('trench', 'raincoat', 'mac', 'mackintosh', 'anorak', 'parka')) return 'raincoat';
  if (words.has('wax') || words.has('waxed') || has('barbour', 'bedale', 'beaufort')) return 'waxed-jacket';
  if (has('overcoat', 'topcoat', 'peacoat', 'duffle', 'greatcoat') || (words.has('wool') && has('coat', 'coats'))) return 'overcoat';
  if (words.has('leather') && has('jacket', 'jackets')) return 'leather-jacket';
  if (has('chore')) return 'chore-jacket';
  if (words.has('field') || has('m43', 'm65', 'fatigue')) return 'field-jacket';
  if (has('jacket', 'jackets', 'coat', 'coats', 'outerwear', 'puffer', 'windbreaker', 'gilet')) return 'field-jacket';

  // --- Tops / knits / bottoms / accessories -------------------------------
  if (has('polo', 'polos', 'pique', 'piqué')) return 'polo';
  if (has('flannel', 'flannels')) return 'flannel';
  if (words.has('ocbd')) return 'ocbd';
  if (words.has('dress') && has('shirt', 'shirts')) return 'dress-shirt';
  if (id.includes('t-shirt') || has('tee', 'tees', 'tshirt', 'undershirt', 'undershirts', 'henley')) return 'tee';
  if (has('cardigan', 'cardigans')) return 'cardigan';
  if (has('sweatshirt', 'sweatshirts', 'hoodie', 'hoodies')) return 'sweatshirt';
  if (has('rollneck', 'turtleneck', 'jumper', 'jumpers', 'sweater', 'sweaters', 'knit', 'knitwear', 'crewneck', 'guernsey', 'aran', 'shetland', 'lambswool', 'merino', 'cashmere')) return 'crewneck';
  if (has('shirt', 'shirts', 'top', 'tops', 'overshirt')) return 'ocbd';
  if (has('chino', 'chinos', 'khakis')) return 'chinos';
  if (has('jean', 'jeans', 'denim', 'selvedge')) return 'jeans';
  if (has('short', 'shorts')) return 'shorts';
  if (has('trouser', 'trousers', 'pant', 'pants', 'slacks')) return 'trousers';
  if (has('tie', 'ties', 'necktie', 'grenadine')) return 'tie';
  if (has('scarf', 'scarves')) return 'scarf';
  if (has('belt', 'belts')) return 'belt';
  if (has('glove', 'gloves', 'mitten', 'mittens')) return 'gloves';
  if (has('beanie', 'beanies') || (words.has('watch') && words.has('cap'))) return 'beanie';
  if (has('fedora', 'trilby', 'panama')) return 'brimmed-hat';
  if (has('cap', 'caps', 'hat', 'hats')) return 'flat-cap';
  if (has('briefcase', 'tote', 'satchel', 'attache', 'attaché')) return 'briefcase';
  if (has('backpack', 'rucksack', 'daypack')) return 'backpack';
  if (has('bag', 'bags', 'holdall', 'weekender', 'duffle', 'duffel', 'luggage')) return 'bag';

  return undefined;
}

function resolveGarmentArt(id: string, nameHint?: string): ResolvedGarmentArt {
  const normalizedId = normalizeGarmentId(id);
  let assetId =
    (GARMENT_ART[normalizedId] && normalizedId) ||
    GARMENT_ALIASES[normalizedId] ||
    inferGarmentArtId(normalizedId) ||
    'generic';
  // A piece with no recognised slot must still draw the right silhouette:
  // infer from its NAME ("Crown Northampton Jazz Shoes" → white shoe, an
  // "Adidas jacket" → outerwear) before ever falling back to the generic tag.
  if (assetId === 'generic' && nameHint) {
    const normalizedName = normalizeGarmentId(nameHint);
    assetId =
      (GARMENT_ART[normalizedName] && normalizedName) ||
      GARMENT_ALIASES[normalizedName] ||
      inferGarmentArtId(normalizedName) ||
      'generic';
  }
  return { assetId, art: GARMENT_ART[assetId] || GenericArt };
}

const ARCHETYPE_ART: Record<string, Art> = {
  ivy: IvyArt,
  country: CountryArt,
  continental: ContinentalArt,
  sportsman: SportsmanArt,
  workwear: WorkwearArt,
  military: MilitaryArt,
  nautical: NauticalArt,
  riviera: RivieraArt,
  formal: FormalArt,
  relaxed: RelaxedArt,
  moto: MotoArt,
};

function resolveArchetypeArt(id: string): Art {
  return ARCHETYPE_ART[id] || RelaxedArt;
}

/* --------------------------------------------------------------------------
 * Archetype reference photographs (Pass Thirty-Nine rebuild) — the CLOTHING
 * is the subject. Every image is a bespoke editorial photograph generated
 * for Ethaion and hosted on the platform CDN (durable URLs — the previous
 * Wikimedia hotlinks intermittently failed to load, which dropped the
 * carousel back to line drawings). Each frame shows the complete outfit
 * from the chin down — no faces, no portraits — so a stranger could
 * identify the style purely from what is worn. Rendered through the shared
 * plate treatment (.hab-plate — sepia, mat border) so they sit in the same
 * warm editorial register as the garment plates.
 *
 * These photographs appear where ArchetypeIllo is called with
 * variant="photo" — the Your Style carousel AND the onboarding archetype
 * cards (Pass Forty-Four: the SVG placeholder illustrations were replaced
 * with these real photographs on the archetype selection step).
 * ------------------------------------------------------------------------*/

export const ARCHETYPE_PHOTOS: Record<string, { src: string; person: string; position?: string }> = {
  ivy: {
    src: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785336110374-5y2ngo.png',
    person: 'Oxford button-down, navy blazer, chinos, penny loafers',
  },
  country: {
    src: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785336153053-upftsa.png',
    person: 'Waxed jacket, tattersall shirt, cords, brogue boots',
  },
  continental: {
    src: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785336198971-cjb7rr.png',
    person: 'Unstructured grey jacket, open collar, suede loafers',
  },
  sportsman: {
    src: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785336239510-jo7gsl.png',
    person: 'Flannel, waxed canvas vest, raw denim, logger boots',
  },
  workwear: {
    src: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785336310074-mpkd3f.png',
    person: 'Indigo chore coat, white tee, carpenter trousers',
  },
  military: {
    src: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785336346439-3xyx7k.png',
    person: 'M-65 field jacket, fatigue trousers, combat boots',
  },
  nautical: {
    src: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785336380417-1j06iy.png',
    person: 'Breton stripe, off-white trousers, deck shoes',
  },
  riviera: {
    src: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785336277929-j5v4xh.png',
    person: 'Cream linen shirt, pleated linen trousers, woven loafers',
  },
  formal: {
    src: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785336418555-kvxlz7.png',
    person: 'Midnight dinner suit, marcella shirt, black bow tie',
  },
  relaxed: {
    src: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785336451338-c2wqox.png',
    person: 'Knitted polo, grey flannels, clean white sneakers',
  },
};

/* --------------------------------------------------------------------------
 * Per-archetype photo SETS (Pass Forty-Four) — the Your Style screen shows a
 * mini-carousel of photographs per archetype (target: three each). Every
 * frame follows the same spec as ARCHETYPE_PHOTOS: photorealistic, full-body
 * or torso-down, no faces — the outfit is the subject. The first entry of
 * each set is the original reference photograph, so ARCHETYPE_PHOTOS stays
 * the single-photo source for onboarding cards and small slots.
 * Pass Forty-Four (retry): the follow-up generation landed — all nine
 * archetypes now carry the full three frames.
 * ------------------------------------------------------------------------*/

export const ARCHETYPE_PHOTO_SETS: Record<string, Array<{ src: string; person: string; position?: string }>> = {
  ivy: [
    ARCHETYPE_PHOTOS.ivy,
    {
      src: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785367395877-885qi1.png',
      person: 'Shetland crewneck over an OCBD, grey flannels, penny loafers',
    },
    {
      src: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785367414913-wh0lro.png',
      person: 'Herringbone tweed sport coat, stripe OCBD, tan chinos, loafers',
    },
  ],
  country: [
    ARCHETYPE_PHOTOS.country,
    {
      src: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785367434195-8urqoc.png',
      person: 'Tweed shooting jacket, tattersall shirt, moleskins, brogue boots',
    },
    {
      src: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785367453939-kyvw32.png',
      person: 'Quilted jacket, lambswool jumper, cords, walking boots',
    },
  ],
  continental: [
    ARCHETYPE_PHOTOS.continental,
    {
      src: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785367377039-tdvwt8.png',
      person: 'Unstructured navy blazer, open collar, cream pleats, suede loafers',
    },
    {
      src: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785367354310-tszzwr.png',
      person: 'Camel overcoat, knitted polo, grey flannels, brown loafers',
    },
  ],
  sportsman: [
    ARCHETYPE_PHOTOS.sportsman,
    {
      src: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785367535798-ocf05s.png',
      person: 'Chamois shirt, raw denim, moc-toe work boots',
    },
    {
      src: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785405766964-vvd0tx.png',
      person: 'Buffalo plaid mackinaw, ecru henley, raw denim, moc-toe boots',
    },
  ],
  workwear: [
    ARCHETYPE_PHOTOS.workwear,
    {
      src: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785367515829-zfcxge.png',
      person: 'Denim trucker, loopwheeled tee, hickory-stripe trousers, work boots',
    },
    {
      src: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785405805701-sc3euu.png',
      person: 'Duck canvas chore jacket, chambray shirt, double-knee trousers, work boots',
    },
  ],
  relaxed: [
    ARCHETYPE_PHOTOS.relaxed,
    {
      src: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785367576486-gkb7ug.png',
      person: 'Navy merino crewneck over an oxford, tan chinos, white sneakers',
    },
    {
      src: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785405839243-br3s5t.png',
      person: 'Suede bomber over a light blue oxford, olive chinos, chukka boots',
    },
  ],
  military: [
    ARCHETYPE_PHOTOS.military,
    {
      src: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785367596480-tdcdsi.png',
      person: 'Safari jacket, cargo trousers, desert boots',
    },
    {
      src: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785405859407-n78hv3.png',
      person: 'Navy deck jacket, ecru tee, OG-107 fatigues, service boots',
    },
  ],
  nautical: [
    ARCHETYPE_PHOTOS.nautical,
    {
      src: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785367616776-49ce15.png',
      person: 'Pea coat over a breton stripe, off-white trousers, deck shoes',
    },
    {
      src: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785405894229-eyzocv.png',
      person: 'Cable-knit fisherman jumper, navy trousers, deck shoes',
    },
  ],
  riviera: [
    ARCHETYPE_PHOTOS.riviera,
    {
      src: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785367555036-sf1tn0.png',
      person: 'Pale blue linen shirt, white linen trousers, espadrilles',
    },
    {
      src: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785405924103-0liuoe.png',
      person: 'Ecru knitted polo, olive pleated linen trousers, woven loafers',
    },
  ],
};

/** The plate treatment applied inline for the small (chip-sized) slots where
 * the 6px mat of .hab-plate would swallow the photo. */
const PLATE_FILTER = 'sepia(0.20) saturate(0.85) contrast(1.05)';

/* ==========================================================================
 * Frame — inline artwork with a static-file override on top
 * ========================================================================*/

interface IllustrationFrameProps {
  /** Static artwork override path, e.g. /illustrations/garment-ocbd.png */
  src: string;
  /** Accessible name for the slot. */
  label: string;
  /** Renders one instance of the inline ligne claire artwork. */
  renderArt: () => JSX.Element;
  /** Greyscale "gap" state. */
  muted?: boolean;
  /** Partial fill 0–1 (wardrobe tracker). Undefined = fully owned/coloured. */
  fill?: number;
  /** CSS colour that overrides the drawing's primary fill (`--illo-primary`). */
  tintColor?: string;
  /** Intrinsic ratio used when the consumer only constrains one dimension. */
  aspectRatio: string;
  /**
   * Multiply the artwork file into the surface behind it. Generated ligne
   * claire plates ship on a plain WHITE ground; multiplied onto the warm card
   * the white disappears and the flat fills pick up the paper tone, instead
   * of the drawing reading as a white sticker on a warm tile.
   */
  blendWithGround?: boolean;
  className?: string;
}

/**
 * One illustration slot: the inline SVG artwork with an <img> layered on top.
 * The img is transparent until a real file at `src` loads, so a missing file
 * never shows a broken-image glyph — the drawn artwork simply stays.
 *
 * THE ARTWORK FILE IS LAZY, and that is a load-time decision made ONCE here
 * rather than per surface. The Rail's Tier 1 navigation is over fifty
 * sub-category cards on one screen and The Ledger's inventory is another
 * dozen rows: eagerly they were fifty-odd full-size plates on the wire before
 * the customer had scrolled anything, which is the single biggest thing the
 * first paint was waiting on. `loading="lazy"` fetches only the cards near
 * the viewport and the rest as they are scrolled to, `decoding="async"` keeps
 * the decode off the main thread, and the intrinsic size lets the browser
 * budget the download.
 *
 * Nothing is empty meanwhile — but WHAT holds the space depends on what is
 * known about the slot. A slot with an EXPLICIT plate URL (an https file
 * from illustration-assets.ts) is known to have real artwork coming, so it
 * holds its space with a quiet SHIMMER SKELETON: showing the coded SVG there
 * meant every load flashed the old drawing style and then swapped to the
 * plate — the "old icons briefly show the old style" symptom. A slot with
 * only the speculative /illustrations/ lookup keeps the coded SVG as its
 * real content, exactly as before, and the SVG also remains the fallback
 * whenever a plate file fails to load.
 */
function IllustrationFrame({
  src,
  label,
  renderArt,
  muted = false,
  fill,
  tintColor,
  aspectRatio,
  blendWithGround = false,
  className = '',
}: IllustrationFrameProps) {
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const loaded = loadedSrc === src;
  const failed = failedSrc === src;
  // An explicit CDN plate (an https URL from illustration-assets.ts) is KNOWN
  // to exist — hold its space with a shimmer instead of flashing the coded
  // SVG's old drawing style first. The speculative relative lookup
  // (/illustrations/garment-<id>.png) keeps the coded SVG as real content.
  const expectPlate = /^https?:\/\//i.test(src);
  const waitingForPlate = expectPlate && !loaded && !failed;
  const f = fill == null ? 1 : clamp01(fill);
  const partial = !muted && fill != null && f < 1;

  return (
    <span
      role="img"
      aria-label={label}
      className={`relative block overflow-hidden ${className}`}
      style={{ aspectRatio, ...(tintColor ? ({ '--illo-primary': tintColor } as React.CSSProperties) : null) }}
    >
      {/* The plate is confirmed coming — a quiet shimmer holds the space so
          the customer never sees the coded drawing swap to the plate. */}
      {waitingForPlate && (
        <span aria-hidden="true" className="absolute inset-0 block">
          <style>{'@keyframes illo-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }'}</style>
          <span
            className="absolute block"
            style={{
              inset: '12%',
              background: 'linear-gradient(90deg, #E8E1D3 25%, #F2ECDF 50%, #E8E1D3 75%)',
              backgroundSize: '200% 100%',
              animation: 'illo-shimmer 1.5s ease-in-out infinite',
              borderRadius: '2px',
            }}
          />
        </span>
      )}

      {/* Inline artwork — shown until the artwork file exists */}
      {!loaded && !waitingForPlate && (
        <span aria-hidden="true" className="absolute inset-0 block">
          {/* Base: full colour when owned; greyscale for gap/partial states */}
          <span
            className="absolute inset-0 block"
            style={
              muted || partial
                ? { filter: 'grayscale(1) contrast(0.88)', opacity: muted ? 0.55 : 0.45 }
                : undefined
            }
          >
            {renderArt()}
          </span>
          {/* Colour reveal rising from the bottom (wardrobe tracker) */}
          {partial && f > 0 && (
            <span
              className="absolute inset-0 block"
              style={{
                clipPath: `inset(${(1 - f) * 100}% 0 0 0)`,
                transition: `clip-path 700ms ${FILL_EASE}`,
              }}
            >
              {renderArt()}
            </span>
          )}
        </span>
      )}

      {/* The artwork file override. Hidden (opacity 0) until it loads;
          greyscale base when muted or partially filled. */}
      <img
        key={src}
        src={src}
        alt=""
        draggable={false}
        loading="lazy"
        decoding="async"
        // The generated plates are square 1024px files; declaring the
        // intrinsic size lets the browser reserve and budget without waiting
        // for headers. The box is sized by the frame, never by these.
        width={1024}
        height={1024}
        onLoad={() => setLoadedSrc(src)}
        onError={() => {
          setLoadedSrc(null);
          // A failed plate falls back to the coded SVG — never a stuck shimmer.
          setFailedSrc(src);
        }}
        className="absolute inset-0 w-full h-full object-contain"
        style={{
          opacity: loaded ? (muted ? 0.45 : partial ? 0.35 : 1) : 0,
          filter: muted || partial ? 'grayscale(1) contrast(0.92)' : undefined,
          mixBlendMode: blendWithGround ? 'multiply' : undefined,
        }}
      />
      {/* Colour reveal clipped in from the bottom for the partial state */}
      {loaded && partial && f > 0 && (
        <img
          src={src}
          alt=""
          draggable={false}
          // Only ever rendered once the layer above has already loaded the
          // same file, so this is a cache hit rather than a second download.
          decoding="async"
          width={1024}
          height={1024}
          className="absolute inset-0 w-full h-full object-contain"
          style={{
            clipPath: `inset(${(1 - f) * 100}% 0 0 0)`,
            transition: `clip-path 700ms ${FILL_EASE}`,
            mixBlendMode: blendWithGround ? 'multiply' : undefined,
          }}
        />
      )}
    </span>
  );
}

/* --------------------------------------------------------------------------
 * Public components — same API the rest of the app already consumes
 * ------------------------------------------------------------------------*/

/**
 * PIECE-ICON COLOUR — PARKED, NOT ABANDONED (Recommendation Engine
 * overhaul, Part 2).
 *
 * Piece and sub-category icons in The Ledger and The Rail render PLAIN:
 * no colour treatment when the user owns one, no greyscale fade when he
 * does not. The "colour the icon if he owns it" idea is deliberately parked
 * behind this ONE flag — set it to `true` and every icon routed through
 * `pieceIlloProps()` goes straight back to coloured-when-owned /
 * muted-when-not, with no other edit needed.
 *
 * The Coverage Map's sage tick is a CATEGORY-level indicator, not a piece
 * icon — it never passes through here and is never affected.
 */
export const COLOUR_PIECE_ICONS_WHEN_OWNED: boolean = false;

/**
 * The `<Illo>` props a piece / sub-category icon should carry. While the
 * flag above is off this is always `{}` — a plain, unfaded, untinted
 * drawing. Surfaces that do not (yet) know whether the user owns the type
 * can call it with no argument.
 */
export function pieceIlloProps(owned = false): { muted?: boolean } {
  if (!COLOUR_PIECE_ICONS_WHEN_OWNED) return {};
  return { muted: !owned };
}

interface IlloProps {
  id: string;
  /** Greyscale "gap" state — the B&W twin of the coloured artwork. */
  muted?: boolean;
  /**
   * Partial colour fill, 0–1: the wardrobe tracker's "filling up" mechanic.
   * 0 = empty/grey · 1 = fully filled/coloured.
   */
  fill?: number;
  /**
   * CSS colour to render the garment's primary fill in — the piece's ACTUAL
   * colour (e.g. swatchFor('olive') on olive chinos). Same symbol per clothing
   * type, different fill per piece.
   */
  color?: string;
  /** Kept for API compatibility (labels are no longer rendered — the art is). */
  showLabel?: boolean;
  /**
   * The piece's display name, used as an inference fallback when `id` (the
   * slot) is missing or unrecognised — so "Jazz Shoes" always draws a shoe.
   */
  name?: string;
  /**
   * An explicit artwork file for this slot, overriding the
   * /illustrations/garment-<id>.png lookup — how a sub-category carries its
   * OWN drawing while sharing a coded slot with its siblings (see
   * illustration-assets.ts). The coded SVG stays the fallback: if the file
   * fails to load, the drawing simply remains.
   */
  src?: string;
  /** Multiply a white-ground artwork file into the surface behind it. */
  blendWithGround?: boolean;
  className?: string;
  title?: string;
}

/** A single garment / category icon slot (square). */
export function Illo({ id, muted = false, fill, color, name, src, blendWithGround, className, title }: IlloProps) {
  const { art, assetId } = resolveGarmentArt(id, name || title);
  return (
    <IllustrationFrame
      src={src || `/illustrations/garment-${assetId}.png`}
      label={title || id}
      renderArt={art}
      muted={muted}
      fill={fill}
      tintColor={color}
      aspectRatio="1 / 1"
      blendWithGround={blendWithGround}
      className={className}
    />
  );
}

/** A style-archetype character slot (portrait 4:5) — used on the onboarding
 * cards, the Your Style tab, and anywhere archetypes appear.
 *
 * Pass Thirty-Three: the ligne claire character illustration is the DEFAULT
 * everywhere (onboarding included). Real reference photographs
 * (ARCHETYPE_PHOTOS above) render ONLY when variant="photo" is passed —
 * the Your Style profile display — plate-treated like the garment images,
 * with the drawing as the fallback if the photo fails to load. */
export function ArchetypeIllo({
  id,
  className,
  title,
  showLabel,
  variant = 'illustration',
}: {
  id: string;
  className?: string;
  title?: string;
  showLabel?: boolean;
  /** 'illustration' (default) draws the ligne claire character; 'photo'
   * renders the real reference photograph where one exists. */
  variant?: 'illustration' | 'photo';
}) {
  const art = resolveArchetypeArt(id);
  const photo = variant === 'photo' ? ARCHETYPE_PHOTOS[id] : undefined;
  const [photoFailed, setPhotoFailed] = useState(false);
  if (photo && !photoFailed) {
    // Full-size card slots get the complete plate treatment (sepia + mat
    // border); chip-sized slots (showLabel === false) keep the sepia only.
    const plate = showLabel !== false;
    return (
      <span
        role="img"
        aria-label={title ? `${title} — ${photo.person}` : photo.person}
        title={photo.person}
        className={`relative block overflow-hidden ${plate ? '' : 'rounded-md'} ${className || ''}`}
        style={{ aspectRatio: '4 / 5' }}
      >
        <img
          src={photo.src}
          alt={title ? `${title} — ${photo.person}` : photo.person}
          draggable={false}
          loading="lazy"
          width={640}
          height={800}
          onError={() => setPhotoFailed(true)}
          className={`absolute inset-0 w-full h-full object-cover ${photo.position ? '' : 'object-top'} ${plate ? 'hab-plate' : ''}`}
          style={{
            ...(photo.position ? { objectPosition: photo.position } : null),
            ...(plate ? null : { filter: PLATE_FILTER }),
          }}
        />
      </span>
    );
  }
  return (
    <IllustrationFrame
      src={`/illustrations/archetype-${id}.png`}
      label={title || id}
      renderArt={art}
      aspectRatio="4 / 5"
      className={className}
    />
  );
}

/** The Ethaion valet welcome slot (portrait 4:5) for the landing page and
 * first-run moments. */
export function WelcomeIllo({ className, title = 'Welcome to Ethaion' }: { className?: string; title?: string }) {
  return (
    <IllustrationFrame
      src="/illustrations/welcome-valet.png"
      label={title}
      renderArt={WelcomeValetArt}
      aspectRatio="4 / 5"
      className={className}
    />
  );
}
