/**
 * Curated feedback loop (Pass Eight) — the "Not feeling this? Tell Beau why"
 * sheet behind each Curated card's discreet feedback tap.
 *
 * Multimodal, like every Beau touchpoint: type it, hold-to-talk (transcribed
 * into the note), talk live, attach a photo (a look that IS them — the
 * aesthetic signal is read, never the label), or paste a link. Beau
 * interprets the objection into a structured session signal — wrong colour,
 * wrong formality, wrong brand, wrong silhouette, already owned — that the
 * feed uses to swap in a better alternative and quietly retune the rest of
 * this session's picks. Session only: never a permanent profile update.
 */
import { useRef, useState } from 'react';
import { Camera, Loader2, Send, X } from 'lucide-react';
import { tw, typography } from '../../lib/colors';
import { LiveTalkButton, VoiceButton } from '../../lib/voice';
import { formatPrice, type CuratedSessionSignal, type FeedCard } from './profile-data';

// ---------------------------------------------------------------------------
// Interpretation — turn the user's words (and any photo/link) into a signal
// ---------------------------------------------------------------------------

const KNOWN_REASONS = new Set([
  'wrong-colour', 'wrong-formality', 'wrong-brand', 'wrong-silhouette', 'already-own', 'too-expensive', 'other',
]);

function extractJson(text: string): any {
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** Pull the first URL out of free text. */
function extractUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : null;
}

/** No-network fallback: keyword heuristics so the loop never dead-ends. */
function interpretLocally(card: FeedCard, note: string): CuratedSessionSignal {
  const q = note.toLowerCase();
  const reasons: string[] = [];
  const avoidColors: string[] = [];
  const avoidBrands: string[] = [];
  let wantSmarter = false;
  let wantMoreCasual = false;
  let alreadyOwn = false;
  if (/colou?r|too (dark|light|bright)|navy|black|brown|olive|burgundy|tan|grey/.test(q)) {
    reasons.push('wrong-colour');
    for (const c of card.item.colors) if (q.includes(c.toLowerCase())) avoidColors.push(c.toLowerCase());
    if (avoidColors.length === 0 && card.item.colors[0]) avoidColors.push(card.item.colors[0].toLowerCase());
  }
  if (/too (formal|smart|dressy|stiff)|more (casual|relaxed)/.test(q)) {
    reasons.push('wrong-formality');
    wantMoreCasual = true;
  }
  if (/too casual|not smart|smarter|dressier|more formal/.test(q)) {
    reasons.push('wrong-formality');
    wantSmarter = true;
  }
  if (q.includes(card.item.brand.toLowerCase()) || /brand|maker|label/.test(q)) {
    reasons.push('wrong-brand');
    avoidBrands.push(card.item.brand);
  }
  if (/shape|cut|silhouette|baggy|slim|boxy|long|short/.test(q)) reasons.push('wrong-silhouette');
  if (/already (own|have|got)|something like this|similar/.test(q)) {
    reasons.push('already-own');
    alreadyOwn = true;
  }
  if (/expensive|price|cost|cheaper|afford/.test(q)) reasons.push('too-expensive');
  if (reasons.length === 0) reasons.push('other');
  return {
    itemId: card.item.id,
    slot: card.item.slot,
    category: card.item.category,
    reasons,
    avoidColors,
    avoidBrands,
    wantSmarter,
    wantMoreCasual,
    alreadyOwn,
    note: note.trim() || undefined,
  };
}

/** Read the aesthetic signal out of an attached photo (never the label). */
async function readPhotoSignal(file: File): Promise<string> {
  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error('could not read file'));
    reader.readAsDataURL(file);
  });
  const uploadRes = await fetch('/api/upload/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageData: base64Data, fileName: file.name || 'feedback.jpg' }),
  });
  if (!uploadRes.ok) throw new Error(`photo upload failed: ${uploadRes.status}`);
  const { imageUrl } = await uploadRes.json();
  if (!imageUrl) throw new Error('photo upload returned no URL');
  const analyzeRes = await fetch('/api/analyze-document', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      documentUrl: imageUrl,
      documentType: 'image',
      analysisPrompt:
        'This image shows a menswear look or garment the user prefers over a recommendation they rejected. Describe the AESTHETIC SIGNAL in one plain sentence — silhouette, colour register, formality level, material texture — never brand or person identity. If nothing useful is visible, reply exactly: nothing legible.',
    }),
  });
  if (!analyzeRes.ok) return '';
  const { analysis } = await analyzeRes.json();
  const text = typeof analysis === 'string' ? analysis.trim() : '';
  return /^nothing legible/i.test(text) ? '' : text;
}

/** Interpret the objection with the model; heuristics as the safety net. */
async function interpretFeedback(
  card: FeedCard,
  note: string,
  photoSignal: string,
  linkUrl: string | null,
): Promise<CuratedSessionSignal> {
  const fallback = interpretLocally(card, [note, photoSignal].filter(Boolean).join(' — '));
  try {
    const res = await fetch('/proxy/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You interpret a menswear customer\u2019s pushback on a recommendation into a structured recalibration signal. Return STRICT JSON only: {"reasons": string[], "avoid_colors": string[], "avoid_brands": string[], "want_smarter": boolean, "want_more_casual": boolean, "already_own": boolean, "summary": string}. reasons \u2286 ["wrong-colour","wrong-formality","wrong-brand","wrong-silhouette","already-own","too-expensive","other"]. avoid_colors: lowercase colour names to steer away from (only when the colour is genuinely the objection). avoid_brands: brand names to steer away from (only when the brand is the objection). summary: the objection in \u226410 words, in the customer\u2019s spirit. Read any attached-photo description as the aesthetic the customer PREFERS \u2014 infer direction from it (e.g. more relaxed, earthier colours), never a brand.',
          },
          {
            role: 'user',
            content: [
              `REJECTED RECOMMENDATION: ${card.item.brand} ${card.item.name} \u2014 ${card.item.colors.join('/')} ${card.item.slot}, ${card.item.materialNote}, ${formatPrice(card.item.priceGBP)}, occasions: ${card.item.occasions.join(', ')}.`,
              note.trim() ? `THE CUSTOMER SAYS: ${note.trim()}` : null,
              photoSignal ? `A PHOTO THEY SHARED READS AS: ${photoSignal}` : null,
              linkUrl ? `THEY PASTED THIS LINK AS A REFERENCE: ${linkUrl}` : null,
            ].filter(Boolean).join('\n'),
          },
        ],
        max_tokens: 300,
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) throw new Error(`interpret call failed: ${res.status}`);
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    const parsed = typeof content === 'string' ? extractJson(content) : null;
    if (!parsed) throw new Error('no interpretation');
    const reasons = (Array.isArray(parsed.reasons) ? parsed.reasons : [])
      .filter((r: unknown) => typeof r === 'string' && KNOWN_REASONS.has(r as string)) as string[];
    const strArr = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x) => typeof x === 'string').map((x) => (x as string).toLowerCase().trim()).filter(Boolean) : [];
    return {
      itemId: card.item.id,
      slot: card.item.slot,
      category: card.item.category,
      reasons: reasons.length > 0 ? reasons : fallback.reasons,
      avoidColors: strArr(parsed.avoid_colors),
      avoidBrands: Array.isArray(parsed.avoid_brands) ? parsed.avoid_brands.filter((x: unknown) => typeof x === 'string') : [],
      wantSmarter: parsed.want_smarter === true,
      wantMoreCasual: parsed.want_more_casual === true,
      alreadyOwn: parsed.already_own === true,
      note: (typeof parsed.summary === 'string' && parsed.summary.trim()) || note.trim() || undefined,
    };
  } catch (e) {
    console.warn('[Ethaion] feedback interpretation fell back to heuristics:', e);
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// The sheet
// ---------------------------------------------------------------------------

export function CuratedFeedbackSheet({
  card,
  onClose,
  onSignal,
}: {
  card: FeedCard;
  onClose: () => void;
  onSignal: (signal: CuratedSessionSignal) => void;
}) {
  const [note, setNote] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview((ev.target?.result as string) || null);
    reader.readAsDataURL(file);
  };

  // Quick chips cover the common objections in one tap; free text refines.
  const chips: Array<{ label: string; text: string }> = [
    { label: 'Wrong colour', text: `The ${card.item.colors[0] || ''} isn\u2019t for me`.trim() },
    { label: 'Too formal', text: 'Too formal for how I actually live' },
    { label: 'Too casual', text: 'I need something smarter than this' },
    { label: 'Not the brand', text: `Not a ${card.item.brand} man` },
    { label: 'Wrong shape', text: 'The silhouette isn\u2019t me' },
    { label: 'Already own similar', text: 'I already own something like this' },
  ];

  const submit = async () => {
    if (busy || (!note.trim() && !photoFile)) return;
    setBusy(true);
    try {
      let photoSignal = '';
      if (photoFile) {
        setPhase('Reading your photo\u2026');
        try {
          photoSignal = await readPhotoSignal(photoFile);
        } catch (e) {
          console.warn('[Ethaion] feedback photo read failed (continuing with text):', e);
        }
      }
      setPhase('Finding something more you\u2026');
      const link = extractUrl(note);
      const signal = await interpretFeedback(card, note, photoSignal, link);
      onSignal(signal);
    } finally {
      setBusy(false);
      setPhase('');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Tell Beau why the ${card.item.brand} ${card.item.name} isn\u2019t right`}
    >
      <span className="absolute inset-0 bg-[var(--space-shell-shadow-strong)]" aria-hidden="true" />
      <div
        className="relative w-full sm:max-w-md sm:mx-4 bg-[var(--space-surface-card)] rounded-t-2xl sm:rounded-2xl p-5 shadow-xl max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className={`${typography.size.base} ${typography.weight.semibold} ${typography.color.primary}`}>
              Not feeling this? Tell Beau why.
            </h4>
            <p className={`${typography.size.xs} ${typography.color.muted} mt-0.5`}>
              {card.item.brand} {card.item.name} — say what’s off and he’ll find something more you. This tunes
              today’s picks only, never your saved profile.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--space-surface-muted)] text-[var(--space-text-muted)] flex-shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 mt-3">
          {chips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => setNote((cur) => (cur.trim() ? `${cur.trim()}. ${chip.text}` : chip.text))}
              className={`px-2.5 py-1 rounded-full ${typography.size.xs} border border-[var(--space-border-default)] text-[var(--space-text-secondary)] hover:border-[var(--space-border-strong)] hover:text-[var(--space-text-primary)] transition-colors`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder="In your own words — wrong colour, too dressy, already own one… or paste a link to a look that IS you"
          rows={3}
          disabled={busy}
          className={`${tw.input.base} ${tw.input.default} ${typography.size.sm} resize-none mt-3`}
          aria-label="Why this recommendation is not right"
        />

        {photoPreview && (
          <div className="flex items-center gap-2 mt-2">
            <img src={photoPreview} alt="Attached reference" className="w-10 h-10 rounded-lg object-cover border border-[var(--space-border-default)]" />
            <span className={`${typography.size.xs} ${typography.color.muted} flex-1 truncate`}>
              Photo attached — Beau reads the aesthetic, never the label
            </span>
            <button
              type="button"
              onClick={() => {
                setPhotoFile(null);
                setPhotoPreview(null);
              }}
              className={`p-1 rounded-lg ${tw.button.ghost}`}
              aria-label="Remove photo"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* The full input suite: text above, photo / hold-to-talk / live talk here */}
        <div className="flex items-center gap-1 mt-2.5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="h-8 w-8 flex items-center justify-center rounded-xl hover:bg-[var(--space-surface-muted)] text-[var(--space-text-muted)] disabled:opacity-50 transition-colors"
            title="Attach a photo — a look or piece that IS you"
            aria-label="Attach a photo"
          >
            <Camera className="w-4 h-4" />
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={pickPhoto} className="hidden" aria-hidden="true" />
          <VoiceButton
            disabled={busy}
            onTranscript={(text) => setNote((cur) => (cur.trim() ? `${cur.trim()} ${text}` : text))}
            title="Hold to talk — your words land in the note"
          />
          <LiveTalkButton
            disabled={busy}
            instructions={`The customer just pushed back on one of Beau's recommendations: the ${card.item.brand} ${card.item.name} (${card.item.colors.join('/')}, ${card.item.materialNote}). Help them articulate what they'd prefer instead \u2014 colour, formality, silhouette \u2014 and suggest they type the conclusion into the feedback note.`}
          />
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || (!note.trim() && !photoFile)}
            className={`px-4 py-2 rounded-lg ${typography.size.sm} inline-flex items-center gap-1.5 ${tw.button.primary} disabled:opacity-40`}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {busy ? phase || 'Working\u2026' : 'Tell Beau'}
          </button>
        </div>
      </div>
    </div>
  );
}
