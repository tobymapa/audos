/**
 * Ethaion — “Try this on” (virtual try-on behind lib/tryon) + the avatar
 * profile section.
 *
 * The core promise: see a piece you're considering — a Beau recommendation,
 * a Radar piece, or something from your own rail — on YOUR figure before
 * spending money.
 *
 * Since the avatar pass, renders composite garments onto the user's cached
 * AVATAR (lib/tryon/avatar.ts) — a masculine figure built once from profile
 * data — rather than re-processing their raw photo every time:
 *
 *  - TryOnButton — the ghost “Try this on” action on Curated pick cards,
 *    Radar rows, What-to-wear pieces and owned-piece cards. Tapping it hands
 *    the piece to the Fitting Room (fitting-room-state.ts), which starts the
 *    render IMMEDIATELY and opens the tab with the render in progress.
 *  - TryOnPhotoSection — the “Your Fitting Room avatar” block in Your
 *    Style: the face photo (the selfie collected before the avatar pass is
 *    re-used) plus the avatar's skin tone. Height, weight and body type are
 *    NOT edited here — they live in ONE place, “Body — sizes &
 *    measurements” (the measurements consolidation fix), and feed the same
 *    avatar store. All optional: zero input → the clean masculine default;
 *    more data → a closer figure. Every change quietly rebuilds the cached
 *    avatar in the background.
 *
 * Renders go through lib/tryon — the provider (Fashn today) stays swappable
 * there and is never imported here or by any screen.
 */
import { useEffect, useRef, useState } from 'react';
import { Camera, Loader2, PersonStanding } from 'lucide-react';
import { tw, typography } from '../../lib/colors';
import {
  fetchTryOnPhoto,
  removeTryOnPhoto,
  saveTryOnPhoto,
  type TryOnPhoto,
} from '../../lib/tryon/index';
import {
  SKIN_TONES,
  fetchAvatarInputs,
  saveAvatarInputs,
  type AvatarInputs,
} from '../../lib/tryon/avatar';
import { compressImage, fileToBase64, uploadImageData } from './photo-enhance';
import { AVATAR_ENABLED, requestFittingRoomTryOn } from './fitting-room-state';

// ---------------------------------------------------------------------------
// The piece being tried on — everything the Fitting Room needs about it.
// ---------------------------------------------------------------------------

export interface TryOnPiece {
  name: string;
  brand?: string | null;
  /** Wardrobe category — lets the Fitting Room place the piece when pinned. */
  category?: string | null;
  /** A short Beau line about the piece — reuse the card's existing
   * recommendation copy when available. */
  note?: string | null;
  /** Direct garment image URL, when the card already has one. */
  garmentImageUrl?: string | null;
  /** Product page URL — resolved to its og:image when no direct image. */
  productUrl?: string | null;
  /** The card's existing CTA, carried into the Fitting Room's fallback. */
  ctaLabel?: string | null;
  ctaUrl?: string | null;
}

// ---------------------------------------------------------------------------
// The “Try this on” button — walnut text in a hairline-bordered ghost pill,
// always a SECONDARY action. Tapping it opens the Fitting Room tab with the
// piece pre-loaded as the active render (the render starts on tap, so it is
// already cooking when the tab opens).
// ---------------------------------------------------------------------------

export function TryOnButton({
  piece,
  className = '',
  plain = false,
}: {
  piece: TryOnPiece;
  className?: string;
  /** Text-link presentation (Radar rows) instead of the bordered pill. */
  plain?: boolean;
}) {
  // 44px touch floor on mobile; the desktop presentation stays compact.
  const buttonCls = plain
    ? `inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-0 ${typography.size.xs} text-[var(--color-text,#241a12)] hover:text-[var(--color-accent-700,#7c4a17)] hover:underline transition-colors`
    : `px-3 py-1.5 min-h-[44px] sm:min-h-0 rounded-lg ${typography.size.xs} inline-flex items-center gap-1.5 bg-transparent border border-[var(--color-divider,rgba(59,43,29,0.18))] text-[var(--color-text,#241a12)] hover:border-[var(--space-border-strong)] transition-colors`;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        requestFittingRoomTryOn({
          key: `piece-${(piece.garmentImageUrl || piece.productUrl || `${piece.brand || ''}-${piece.name}`).trim()}`,
          name: piece.name,
          brand: piece.brand || null,
          category: piece.category || null,
          garmentImageUrl: piece.garmentImageUrl || null,
          productUrl: piece.productUrl || null,
          note: piece.note || null,
          ctaLabel: piece.ctaLabel || null,
          ctaUrl: piece.ctaUrl || null,
        });
      }}
      className={`${buttonCls} ${className}`}
      title={
        AVATAR_ENABLED
          ? 'See it on your avatar before you spend a penny — opens The Fitting'
          : 'Lay it out with the rest of your look before you spend a penny — opens The Fitting'
      }
    >
      <PersonStanding className="w-3.5 h-3.5" />
      Try this on
    </button>
  );
}

// ---------------------------------------------------------------------------
// “Your Fitting Room avatar” — the Your Style profile section. The face
// photo (set once, reused) plus the optional avatar inputs. Every field is
// optional; every change quietly rebuilds the cached avatar.
// ---------------------------------------------------------------------------

async function uploadTryOnPhotoFile(file: File): Promise<string> {
  // Face photos keep a little more resolution than garment shots — the
  // composite quality depends on it — but still compress before upload.
  const compressed = await compressImage(file, 1600, 0.85);
  const { base64, mimeType } = await fileToBase64(compressed);
  // The shared versioned upload (photo-enhance): the stored filename carries
  // a content hash, so a retaken face photo always mints a NEW URL — no
  // browser or CDN cache can keep serving the old one.
  return uploadImageData(`data:${mimeType};base64,${base64}`, compressed.name || 'tryon.jpg');
}

/** Avatar parked (fitting-room-state.ts): with no figure in The Fitting there
 * is nothing for these inputs to shape, so the block is not rendered and none
 * of its loading runs. The section itself is untouched below — flipping the
 * flag brings it straight back. */
export function TryOnPhotoSection({ className = '' }: { className?: string }) {
  if (!AVATAR_ENABLED) return null;
  return <AvatarProfileSection className={className} />;
}

function AvatarProfileSection({ className = '' }: { className?: string }) {
  const [photo, setPhoto] = useState<TryOnPhoto | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Avatar inputs — loaded once. Only the skin tone is edited here; height,
  // weight and body type are edited in Body — sizes & measurements and land
  // in the same store.
  const [inputs, setInputs] = useState<AvatarInputs | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchTryOnPhoto(true)
      .then((p) => {
        if (!cancelled) setPhoto(p);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    fetchAvatarInputs(true)
      .then((fresh) => {
        if (cancelled) return;
        setInputs(fresh);
      })
      .catch(() => undefined);
    const onChange = (event: Event) => {
      const fresh = (event as CustomEvent).detail?.photo as TryOnPhoto | null | undefined;
      setPhoto(fresh ?? null);
    };
    window.addEventListener('ethaion:tryon-photo', onChange);
    return () => {
      cancelled = true;
      window.removeEventListener('ethaion:tryon-photo', onChange);
    };
  }, []);

  /** Persist a partial change — saveAvatarInputs also kicks the quiet
   * background rebuild of the cached avatar. */
  const commit = (patch: Partial<AvatarInputs>) => {
    setInputs((cur) => ({ ...(cur || ({} as AvatarInputs)), ...patch } as AvatarInputs));
    void saveAvatarInputs(patch).then((merged) => {
      setInputs(merged);
    });
  };

  const onPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = (e.target.files || [])[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file || uploading) return;
    setUploading(true);
    setError(null);
    try {
      const url = await uploadTryOnPhotoFile(file);
      const fresh = await saveTryOnPhoto(url);
      setPhoto(fresh);
    } catch (err) {
      console.error('[Ethaion] saving the face photo failed:', err);
      setError('That photo didn\u2019t save — try again in a moment.');
    } finally {
      setUploading(false);
    }
  };

  const onRemove = async () => {
    if (removing) return;
    setRemoving(true);
    setError(null);
    try {
      await removeTryOnPhoto();
      setPhoto(null);
    } catch (err) {
      console.error('[Ethaion] removing the face photo failed:', err);
      setError('Couldn\u2019t remove it just now — try again in a moment.');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className={`border-b border-[var(--space-border-default)] py-4 px-1 ${className}`}>
      <p className={`${typography.size.xs} uppercase tracking-[0.18em] ${typography.color.muted}`}>Your avatar for The Fitting</p>
      <p className={`${typography.size.sm} ${typography.color.primary} mt-1`} style={{ fontFamily: 'var(--space-font-family)' }}>
        Beau builds your figure for The Fitting from these details — every field is optional. Nothing set means a
        clean default figure; the more you add, the closer it gets to you.
      </p>

      {/* Face photo — the selfie already collected; softly blended onto the figure. */}
      <div className="flex items-start gap-4 mt-4 flex-wrap">
        {photo && (
          <span className="hab-plate block w-24 aspect-[3/4] bg-[#eadfcb] overflow-hidden flex-shrink-0">
            <img src={photo.photo_url} alt="Your saved face photo" className="w-full h-full object-cover" />
          </span>
        )}
        <div className="flex flex-col items-start gap-2 min-w-0">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || !loaded}
            className={`px-3.5 py-2 rounded-lg ${typography.size.xs} inline-flex items-center gap-1.5 ${tw.button.primary} disabled:opacity-50`}
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
            {uploading ? 'Saving\u2026' : photo ? 'Retake the photo' : 'Add a face photo'}
          </button>
          {photo && (
            <button
              type="button"
              onClick={() => void onRemove()}
              disabled={removing}
              className={`${typography.size.xs} ${typography.color.muted} hover:text-[var(--color-accent-700,#7c4a17)] hover:underline inline-flex items-center gap-1 disabled:opacity-50`}
            >
              {removing && <Loader2 className="w-3 h-3 animate-spin" />}
              Remove the photo
            </button>
          )}
          <p className={`${typography.size.xs} ${typography.color.muted} leading-snug max-w-sm`} style={{ fontSize: '11px' }}>
            One clear, front-on photo of your face — good light, nothing covering it. Beau blends it softly onto
            your figure; it stays in your profile and is only ever used for your previews.
          </p>
          {error && <p className={`${typography.size.xs} text-[var(--space-semantic-warning)]`}>{error}</p>}
        </div>
      </div>

      {/* Height, weight and body type are deliberately NOT repeated here —
          they are edited once, in “Body — sizes & measurements”, and feed
          this same figure (the measurements consolidation fix). */}
      <p className={`${typography.size.xs} ${typography.color.muted} mt-4 leading-snug max-w-md`} style={{ fontSize: '11px' }}>
        Your height, weight and body type shape this figure too — set them under “Body — sizes &amp;
        measurements”, in one place.
      </p>

      {/* Skin tone — eight swatches, light to deep, warm and cool. */}
      <div className="mt-5">
        <p className={`${typography.size.xs} ${typography.color.muted} mb-1.5`} style={{ fontSize: '11px' }}>Skin tone</p>
        <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Skin tone">
          {SKIN_TONES.map((tone) => {
            const active = inputs?.skinTone === tone.id;
            return (
              <button
                key={tone.id}
                type="button"
                onClick={() => commit({ skinTone: active ? null : tone.id })}
                aria-pressed={active}
                aria-label={`Skin tone — ${tone.label}`}
                title={tone.label}
                className="w-8 h-8 rounded transition-shadow"
                style={{
                  background: tone.hex,
                  border: active
                    ? '2px solid var(--color-accent,#a8712c)'
                    : '1px solid var(--space-border-default, rgba(59,43,29,0.18))',
                }}
              />
            );
          })}
        </div>
      </div>

      <p className={`${typography.size.xs} ${typography.color.muted} mt-4 leading-snug max-w-md`} style={{ fontSize: '11px' }}>
        Changes refresh your avatar quietly in the background — The Fitting picks them up the next time it
        opens.
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => void onPicked(e)}
        className="hidden"
        aria-label="Upload your face photo"
      />
    </div>
  );
}
