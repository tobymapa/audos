/**
 * THE INDEX · L3 · THE CUT PAGE (26c) — same template as L2, one field
 * swapped: instead of “three cuts”, it carries “how it differs from its
 * parent”. Up: the parent, the only way up. Down: nothing — this is the
 * leaf; colour and cloth are filters, not deeper pages.
 *
 * The band is drawn OVER the parent's band rather than alone, and the
 * whole middle is the difference table — a cut page is only worth having
 * if it can say something its parent can't. “Other cuts of this type” is
 * the lateral row the map called out as missing — added (29a).
 */
import { promoteToScout } from './profile-data';
import { findGarmentType } from './garment-types';
import { runOfType } from './garment-type-runs';
import { categoryName, isBandedCategory, spanLabel, spanOf, verdictFor, type IndexModel } from './index-model';
import {
  ACCENT_DEEP,
  BackLink,
  Breadcrumb,
  ControlLink,
  FAINT,
  FAINTER,
  GenSlot,
  HAIRLINE,
  INK,
  NameLink,
  OutlinedControl,
  PAPER,
  RULE,
  SECONDARY,
  UpDownOut,
  VerdictMark,
  WALNUT,
  body,
  mono,
  serif,
  type IndexNav,
} from './index-chrome';
import { usePlexMono } from './mono-type';

/** The difference rows the data can assert without inventing — the cut's
 * own name against the parent's general case. The authored per-cut prose
 * (shoulder, lining, consequence-in-wear) is slot G4's job at read time. */
function differenceRows(parentName: string, cut: string, registers: string, colours: string): Array<[string, string, string]> {
  return [
    ['Cut', 'The parent, generally — every version the run holds', `${cut} — this version, chosen on purpose`],
    ['Registers', registers, 'The same reach, worn at this cut\u2019s own end of it'],
    ['Colours', colours, 'The same set — the ranking on the parent page still applies'],
    ['Makers', 'Every maker on the parent page', 'The subset below that cuts this one'],
  ];
}

export function IndexCutPage({ model, typeId, cut, nav }: { model: IndexModel; typeId: string; cut: string; nav: IndexNav }) {
  usePlexMono();
  const parent = findGarmentType(typeId);
  if (!parent) return null;
  const home = runOfType(parent.id);
  const banded = isBandedCategory(parent.category);
  const span = spanOf(parent);
  const verdict = verdictFor(model.climate, parent, model.gaps.has(parent.id));
  const siblings = parent.cuts.filter((c) => c !== cut);
  const rows = differenceRows(parent.name, cut, parent.reach.join(' · '), parent.colours.slice(0, 3).join(', '));

  return (
    <div>
      <BackLink label={parent.name.toLowerCase()} onClick={nav.back} />
      <div style={{ marginTop: '10px' }}>
        <Breadcrumb
          segs={[
            { label: 'The Index', onClick: nav.goRoot },
            { label: categoryName(parent.category), onClick: () => nav.goPlate(parent.category) },
            ...(home ? [{ label: home.run.label, onClick: () => nav.goPlate(parent.category) }] : []),
            { label: parent.name, onClick: () => nav.goType(parent.id) },
            { label: cut },
          ]}
        />
      </div>

      <div style={{ marginTop: '16px', paddingBottom: '20px', borderBottom: `1px solid ${INK}` }}>
        <div style={mono(8.5, FAINT)}>A cut of the {parent.name.toLowerCase()} · one of {parent.cuts.length}</div>
        <h3 style={{ ...serif(0), fontSize: 'clamp(26px, 3.4vw, 36px)', lineHeight: 1.08, margin: '8px 0 0' }}>{cut}</h3>
        {/* GEN · G4 — what choosing this cut costs and buys, in wear; absent. */}
        <GenSlot slot="G4" scope={`cut:${parent.id}:${cut}`} style={{ marginTop: '10px' }} />
      </div>

      {banded && span && (
        <section>
          <div className="flex items-baseline flex-wrap" style={{ gap: '4px 12px', paddingBottom: '8px', borderBottom: `1px solid ${RULE}`, marginTop: '26px' }}>
            <span style={serif(19)}>Temperature band</span>
            <span style={mono(8, FAINT)}>and the parent's, for comparison</span>
          </div>
          <div className="flex items-baseline flex-wrap" style={{ gap: '10px 28px', marginTop: '14px' }}>
            <div>
              <div style={serif(26)}>{spanLabel(span)}C</div>
              <div style={{ ...mono(8, FAINT), marginTop: '4px' }}>This cut · drawn over the parent's own band</div>
            </div>
            <div style={{ ...mono(8.5, SECONDARY) }}>Parent · {spanLabel(span)}</div>
            {model.climate.weighted && (
              <span>
                <VerdictMark verdict={verdict} />
                {model.climate.city && <span style={{ ...mono(8, FAINT), marginLeft: '8px' }}>for {model.climate.city}</span>}
              </span>
            )}
          </div>
        </section>
      )}

      {/* ——— how it differs from its parent — the only reason this page exists */}
      <section>
        <div className="flex items-baseline flex-wrap" style={{ gap: '4px 12px', paddingBottom: '8px', borderBottom: `1px solid ${RULE}`, marginTop: '30px' }}>
          <span style={serif(19)}>How it differs from its parent</span>
          <span style={mono(8, FAINT)}>the only reason this page exists</span>
        </div>
        <div style={{ marginTop: '6px' }}>
          <div className="grid grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)]" style={{ gap: '18px', padding: '9px 0', borderBottom: `1px solid ${RULE}` }}>
            <span style={mono(8, FAINT)} />
            <span style={mono(8.5, FAINT)}>The parent, generally</span>
            <span style={mono(8.5, WALNUT)}>This cut</span>
          </div>
          {rows.map(([label, parentCell, cutCell]) => (
            <div key={label} className="grid grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)]" style={{ gap: '18px', padding: '10px 0', borderBottom: `1px solid rgba(59,43,29,0.12)`, alignItems: 'baseline' }}>
              <span style={mono(8.5, SECONDARY)}>{label}</span>
              <span style={{ ...body(13.5, SECONDARY) }}>{parentCell}</span>
              <span style={{ ...body(13.5, INK) }}>{cutCell}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ——— who cuts it — the parent's makers, unchanged facts */}
      {parent.makers.length > 0 && (
        <section>
          <div className="flex items-baseline flex-wrap" style={{ gap: '4px 12px', paddingBottom: '8px', borderBottom: `1px solid ${RULE}`, marginTop: '30px' }}>
            <span style={serif(19)}>Who cuts it</span>
            <span style={mono(8, FAINT)}>from the parent's {parent.makers.length} makers</span>
          </div>
          <div style={{ marginTop: '6px' }}>
            {parent.makers.map((name) => (
              <div key={name} style={{ padding: '9px 0', borderBottom: `1px solid rgba(59,43,29,0.12)` }}>
                <NameLink onClick={() => nav.goMaker(name)} size={15}>{name}</NameLink>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ——— other cuts of this type — lateral (added per the 29a note) */}
      {siblings.length > 0 && (
        <section>
          <div style={{ ...mono(8.5, ACCENT_DEEP), marginTop: '28px' }}>Other cuts of this type</div>
          <div className="flex flex-wrap" style={{ gap: '8px 22px', marginTop: '10px' }}>
            {siblings.map((c) => (
              <NameLink key={c} onClick={() => nav.goCut(parent.id, c)} size={15}>{c}</NameLink>
            ))}
          </div>
        </section>
      )}

      <UpDownOut
        up={
          <>
            <ControlLink onClick={() => nav.goType(parent.id)}>{parent.name}</ControlLink>, its parent — and the sibling cuts from there. The only way up.
          </>
        }
        down={<>Nothing. This is the leaf — colour and cloth are filters, not deeper pages.</>}
        out={
          <>
            A maker → their page ·{' '}
            <ControlLink onClick={() => promoteToScout(`${cut.toLowerCase()} ${parent.name.toLowerCase()}`)}>Hunt this cut →</ControlLink>
          </>
        }
      />
    </div>
  );
}
