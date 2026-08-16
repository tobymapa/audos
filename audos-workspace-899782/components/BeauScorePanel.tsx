/**
 * SCORE A PIECE — the Ask Beau drawer's second mode (August 2026).
 *
 * One input takes a URL, a description, or a photograph; Beau assesses the
 * piece across Cloth · Cut · Make · Longevity and closes with a Regret Risk
 * verdict (Low / Moderate / High) and one sentence of reasoning. The engine
 * lives in apps/BeauHome/beau-score.ts — this file is the drawer surface:
 * the input, the phase line, the inline result card, and the shared
 * BeauScoreCard the chat thread re-uses for the saved copies.
 */
import { useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import {
  deleteBeauScore,
  runBeauScore,
  type BeauScore,
} from '../apps/BeauHome/beau-score';
import { openYourCalls } from '../apps/BeauHome/edit-links';

/** Land on The Search → Your Calls behind the drawer: open the home app,
 * navigate its tab, then close ONLY the chat overlay (never a toggle). */
export function goToYourCallsFromDrawer(): void {
  window.dispatchEvent(new CustomEvent('openApp', { detail: { appId: 'home' } }));
  openYourCalls();
  window.dispatchEvent(new Event('ethaion:close-agent-overlay'));
}

/** A photograph, downscaled to a sensible model payload (max 1280px, JPEG). */
async function readImageAsDataUrl(file: File): Promise<string> {
  const raw: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read that photo.'));
    reader.readAsDataURL(file);
  });
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('unreadable image'));
      img.src = raw;
    });
    const max = 1280;
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    if (scale >= 1 && raw.length < 2_000_000) return raw;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return raw;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch {
    return raw;
  }
}

// The drawer's editorial grammar (founder's reference, August 2026):
// hairlines, square corners, IBM Plex Mono small-caps labels, oxblood for
// anything that speaks.
const S_MONO = "'IBM Plex Mono', monospace";
const S_OXBLOOD = '#7c2d2d';
const S_INK = '#241a12';
const S_BODY = '#3b2b1d';
const S_MUTED = '#856c51';
const S_FAINT = '#a68e70';
const S_HAIRLINE = 'rgba(59,43,29,0.14)';

function sMono(size: number, color: string, tracking = '0.1em') {
  return {
    fontFamily: S_MONO,
    fontSize: `${size}px`,
    letterSpacing: tracking,
    textTransform: 'uppercase' as const,
    color,
  };
}

const RISK_TONES: Record<BeauScore['risk'], { ink: string; wash: string; border: string }> = {
  Low: {
    ink: 'var(--space-semantic-success-700)',
    wash: 'color-mix(in srgb, var(--space-semantic-success-500) 12%, transparent)',
    border: 'color-mix(in srgb, var(--space-semantic-success-500) 45%, transparent)',
  },
  Moderate: {
    ink: 'var(--space-semantic-warning-700)',
    wash: 'color-mix(in srgb, var(--space-semantic-warning-500) 12%, transparent)',
    border: 'color-mix(in srgb, var(--space-semantic-warning-500) 45%, transparent)',
  },
  High: {
    ink: 'var(--space-semantic-danger-700)',
    wash: 'color-mix(in srgb, var(--space-semantic-danger-500) 12%, transparent)',
    border: 'color-mix(in srgb, var(--space-semantic-danger-500) 45%, transparent)',
  },
};

const PILLARS: Array<{ key: 'cloth' | 'cut' | 'make' | 'longevity'; label: string }> = [
  { key: 'cloth', label: 'Cloth' },
  { key: 'cut', label: 'Cut' },
  { key: 'make', label: 'Make' },
  { key: 'longevity', label: 'Longevity' },
];

/** One assessment, as a card — the inline result AND the chat-thread copy
 * wear the same treatment. Deleting the chat copy never touches the Your
 * Calls record; they are independent by design. */
export function BeauScoreCard({
  score,
  onDelete,
  showSavedLine = true,
}: {
  score: BeauScore;
  /** Present on the deletable copies — removes THIS copy only. */
  onDelete?: () => void;
  showSavedLine?: boolean;
}) {
  const tone = RISK_TONES[score.risk];
  return (
    <div
      className="relative bg-[var(--space-surface-card)] overflow-hidden"
      style={{ border: '1px solid rgba(59,43,29,0.34)' }}
      data-testid={`beau-score-card-${score.id}`}
    >
      <div className="flex items-start gap-3" style={{ padding: '13px 16px 11px', borderBottom: `1px solid ${S_HAIRLINE}` }}>
        <div className="min-w-0 flex-1">
          <p style={sMono(8.5, S_OXBLOOD, '0.13em')}>Regret Risk assessment</p>
          <p
            className="truncate"
            style={{ fontFamily: 'var(--space-font-heading)', fontSize: '18px', fontWeight: 400, lineHeight: 1.2, color: S_INK, margin: '6px 0 0' }}
          >
            {score.pieceName}
            {score.maker ? <span style={{ color: '#634e38' }}> · {score.maker}</span> : null}
          </p>
          {score.priceGuide && (
            <p style={{ ...sMono(8.5, S_FAINT, '0.07em'), margin: '4px 0 0' }}>{score.priceGuide}</p>
          )}
        </div>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            title="Delete this copy — the Your Calls record keeps its own"
            aria-label="Delete this assessment from the conversation"
            className="flex-shrink-0 h-7 w-7 flex items-center justify-center transition-opacity hover:opacity-70"
            style={{ color: S_MUTED, background: 'transparent', border: 'none', cursor: 'pointer' }}
            data-testid="button-delete-score"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div style={{ padding: '4px 0 6px' }}>
        {PILLARS.map(({ key, label }, i) => (
          <div
            key={key}
            className="grid grid-cols-[86px_minmax(0,1fr)] gap-2 items-baseline"
            style={{ padding: '8px 16px', borderTop: i === 0 ? 'none' : `1px solid ${S_HAIRLINE}` }}
          >
            <span style={sMono(8.5, '#7c4a17', '0.13em')}>{label}</span>
            <span style={{ fontSize: '13.5px', lineHeight: 1.55, color: S_BODY }}>{score[key]}</span>
          </div>
        ))}
      </div>

      <div style={{ padding: '0 16px 14px' }}>
        <div style={{ background: tone.wash, border: `1px solid ${tone.border}`, padding: '10px 14px' }}>
          <span style={{ ...sMono(9, tone.ink, '0.13em') }}>Regret Risk · {score.risk}</span>
          <p style={{ fontFamily: 'var(--space-font-heading)', fontSize: '17px', fontWeight: 400, lineHeight: 1.35, color: S_INK, margin: '5px 0 0' }}>
            {score.reason}
          </p>
        </div>
        {showSavedLine && (
          <button
            type="button"
            onClick={goToYourCallsFromDrawer}
            className="mt-2.5 text-left hover:opacity-75 transition-opacity"
            style={{ ...sMono(8.5, S_MUTED, '0.07em'), background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
            data-testid="link-view-in-your-calls"
          >
            Saved to Your Calls — <span style={{ color: S_OXBLOOD }}>View in Your Calls →</span>
          </button>
        )}
        {!showSavedLine && (
          <button
            type="button"
            onClick={goToYourCallsFromDrawer}
            className="mt-2.5 text-left hover:opacity-75 transition-opacity"
            style={{ ...sMono(8.5, S_OXBLOOD, '0.07em'), background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
            data-testid="link-view-in-your-calls"
          >
            View in Your Calls →
          </button>
        )}
      </div>
    </div>
  );
}

/** The Score-a-piece pane — structured fields (the public regret
 * calculator's treatment): a link, the piece, maker and price — or a photo.
 * The intro copy is gone (founder's correction, August 2026); the fields
 * say it themselves. */
export default function BeauScorePanel() {
  const [link, setLink] = useState('');
  const [pieceField, setPieceField] = useState('');
  const [makerField, setMakerField] = useState('');
  const [priceField, setPriceField] = useState('');
  // The pillar facts Beau scores on — fill what you know (founder's
  // correction, August 2026); longevity is his call, not an input.
  const [clothField, setClothField] = useState('');
  const [cutField, setCutField] = useState('');
  const [makeField, setMakeField] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BeauScore | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const pickPhoto = async (file: File | undefined | null) => {
    if (!file) return;
    setError(null);
    try {
      setPhoto(await readImageAsDataUrl(file));
      setPhotoName(file.name);
    } catch {
      setError('Could not read that photo — try another.');
    }
  };

  const composed = [
    link.trim() ? `Link: ${link.trim()}` : null,
    pieceField.trim() ? `The piece: ${pieceField.trim()}` : null,
    makerField.trim() ? `Maker: ${makerField.trim()}` : null,
    priceField.trim() ? `Price: ${priceField.trim()}` : null,
    clothField.trim() ? `Cloth / material: ${clothField.trim()}` : null,
    cutField.trim() ? `Cut / fit: ${cutField.trim()}` : null,
    makeField.trim() ? `Make / construction: ${makeField.trim()}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const submit = async () => {
    if (busy) return;
    if (!composed && !photo) {
      setError('Give Beau a link, a few details, or a photo first.');
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const score = await runBeauScore({ input: composed, imageDataUrl: photo, onPhase: setPhase });
      setResult(score);
      setLink('');
      setPieceField('');
      setMakerField('');
      setPriceField('');
      setClothField('');
      setCutField('');
      setMakeField('');
      setPhoto(null);
      setPhotoName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Beau is away from his desk this minute — try again shortly.');
    } finally {
      setBusy(false);
      setPhase('');
    }
  };

  const fields = [
    { label: 'Link', value: link, set: setLink, placeholder: 'https:\u2026 (optional)', testid: 'input-score-link' },
    { label: 'The piece', value: pieceField, set: setPieceField, placeholder: 'e.g. navy wool overcoat', testid: 'input-score-piece' },
    { label: 'Maker', value: makerField, set: setMakerField, placeholder: 'optional', testid: 'input-score-maker' },
    { label: 'Price', value: priceField, set: setPriceField, placeholder: 'optional', testid: 'input-score-price' },
    { label: 'Cloth', value: clothField, set: setClothField, placeholder: 'material, if you know it — e.g. 100% lambswool', testid: 'input-score-cloth' },
    { label: 'Cut', value: cutField, set: setCutField, placeholder: 'fit · silhouette (optional)', testid: 'input-score-cut' },
    { label: 'Make', value: makeField, set: setMakeField, placeholder: 'construction · where it’s made (optional)', testid: 'input-score-make' },
  ];

  return (
    <div data-testid="beau-score-panel">
      <style>{'.beau-score-field::placeholder{color:#a68e70;opacity:1;}'}</style>
      <div className="bg-[var(--space-surface-card)] overflow-hidden" style={{ border: '1px solid rgba(59,43,29,0.34)' }}>
        {fields.map((f, i) => (
          <label
            key={f.label}
            className="flex items-baseline gap-3"
            style={{ padding: '10px 16px', borderTop: i === 0 ? 'none' : `1px solid ${S_HAIRLINE}` }}
          >
            <span style={{ ...sMono(8.5, S_MUTED, '0.1em'), width: '74px', flexShrink: 0 }}>{f.label}</span>
            <input
              type="text"
              value={f.value}
              onChange={(e) => f.set(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder={f.placeholder}
              disabled={busy}
              className="beau-score-field min-w-0 flex-1 border-0 bg-transparent focus:outline-none focus:ring-0"
              style={{ fontSize: '14px', lineHeight: 1.5, color: S_BODY }}
              data-testid={f.testid}
            />
          </label>
        ))}
        {photo && (
          <div className="flex items-center gap-2" style={{ padding: '10px 16px 0', borderTop: `1px solid ${S_HAIRLINE}` }}>
            <img src={photo} alt="" className="h-12 w-12 object-cover" style={{ border: `1px solid ${S_HAIRLINE}` }} />
            <span className="max-w-[160px] truncate" style={{ fontSize: '12px', color: '#634e38' }}>{photoName || 'Photo attached'}</span>
            <button
              type="button"
              onClick={() => {
                setPhoto(null);
                setPhotoName('');
              }}
              className="hover:opacity-70 transition-opacity"
              style={{ color: S_MUTED, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
              aria-label="Remove the photo"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        <div className="flex items-center" style={{ gap: '16px', padding: '10px 16px 12px', borderTop: `1px solid ${S_HAIRLINE}` }}>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              void pickPhoto(e.target.files?.[0]);
              e.target.value = '';
            }}
            data-testid="input-score-photo"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            title="Add a photo of the piece"
            className="hover:opacity-75 transition-opacity disabled:opacity-40"
            style={{ ...sMono(9, S_MUTED), background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
            data-testid="button-score-photo"
          >
            Attach photo
          </button>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || (!composed && !photo)}
            className="inline-flex items-center gap-2 transition-colors hover:bg-[rgba(124,45,45,0.08)] disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ ...sMono(9, S_OXBLOOD), padding: '6px 14px', border: `1px solid ${S_OXBLOOD}`, background: 'transparent', cursor: 'pointer' }}
            data-testid="button-score-submit"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Assess it →
          </button>
        </div>
      </div>

      {busy && phase && (
        <p className="mt-3 flex items-center gap-2" style={{ fontSize: '13px', color: S_MUTED }} aria-live="polite">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {phase}
        </p>
      )}
      {error && <p className="mt-3" style={{ fontSize: '13px', color: '#7d2a24' }}>{error}</p>}

      {result && (
        <div className="mt-4">
          <BeauScoreCard
            score={result}
            onDelete={() => {
              deleteBeauScore(result.id);
              setResult(null);
            }}
          />
        </div>
      )}
    </div>
  );
}
