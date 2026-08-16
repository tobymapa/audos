/**
 * THE INDEX VIEW TOGGLE (design handoff screens 20a · 21a) — the joined
 * three-way segmented control that sits at the RIGHT edge of the section
 * header, baseline-aligned with the heading: AS A LIST · ON A MAP · AS A
 * QUADRANT. One hairline border around the group, no internal rules; the
 * active segment fills walnut with paper type, the inactive ones read in
 * the accent brown. IBM Plex Mono 10px small caps throughout.
 */
import { MONO, usePlexMono } from './mono-type';

export interface ViewToggleItem<T extends string> {
  id: T;
  label: string;
}

export function ViewToggle<T extends string>({
  items,
  active,
  onChange,
  ariaLabel,
}: {
  items: Array<ViewToggleItem<T>>;
  active: T;
  onChange: (id: T) => void;
  ariaLabel: string;
}) {
  usePlexMono();
  return (
    <div
      className="inline-flex self-start md:self-auto"
      role="group"
      aria-label={ariaLabel}
      style={{ border: '1px solid rgba(59,43,29,0.34)' }}
    >
      {items.map(({ id, label }) => {
        const on = active === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-pressed={on}
            className="uppercase whitespace-nowrap transition-colors"
            style={{
              fontFamily: MONO,
              fontSize: 'max(var(--eth-micro, 0px), 10px)',
              letterSpacing: '0.08em',
              padding: '8px 15px',
              ...(on
                ? { background: '#241a12', color: '#f6f0e5' }
                : { background: 'transparent', color: '#7c4a17' }),
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
