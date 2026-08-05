/**
 * Guest mode + "Save your profile" (Pass Nine).
 *
 * Ethaion is guest-first: nobody is asked for an email to enter, onboard,
 * browse Curated, use Scout, or talk to Beau. A guest session lives in
 * sessionStorage only — it ends when the browser closes, and returning
 * without saving starts onboarding fresh. That is expected and fine.
 *
 * Saving is always the user's move, never an interruption:
 *  - A persistent "Save your profile" button at the top of the Your Style
 *    screen — always visible, never a pop-up.
 *  - ONE soft nudge card at the very end of onboarding (dismissable, with
 *    Save and Skip) — never a blocker.
 *
 * Saving keeps the CURRENT session id (so everything already built — the
 * profile, the wardrobe, the chat — stays attached), registers the email
 * with the platform for recognition, and moves the session to localStorage
 * so it survives the browser closing.
 */
import { useState } from 'react';
import { BookmarkCheck, Bookmark, Check, Loader2, X } from 'lucide-react';
import { tw, typography } from '../../lib/colors';
import { trackFunnelEvent } from './profile-data';

function spaceId(): string | null {
  return (window as any).__SPACE_ID__ || null;
}

function sessionKey(): string | null {
  const id = spaceId();
  return id ? `space_session_${id}` : null;
}

function readStoredSession(): Record<string, any> | null {
  const key = sessionKey();
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** True once the profile has been saved with an email (persists across visits). */
export function isProfileSaved(): boolean {
  const key = sessionKey();
  if (!key) return false;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    const session = JSON.parse(raw);
    return typeof session.email === 'string' && session.email.includes('@');
  } catch {
    return false;
  }
}

export function savedProfileEmail(): string | null {
  const key = sessionKey();
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const session = JSON.parse(raw);
    return typeof session.email === 'string' && session.email.includes('@') ? session.email : null;
  } catch {
    return null;
  }
}

/** True for an unsaved guest session — the audience for the save affordances. */
export function isGuestUnsaved(): boolean {
  return !isProfileSaved();
}

/**
 * Persist the profile: register the email with the platform (recognition +
 * cross-visit resume), then keep the CURRENT session id and write the session
 * to localStorage so profile, wardrobe and chat survive the browser closing.
 * The registration call is best-effort — if it fails, the profile is still
 * kept on this device.
 */
export async function persistProfile(email: string): Promise<void> {
  const sid = spaceId();
  const key = sessionKey();
  if (!sid || !key) throw new Error('No space context — cannot save.');
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) throw new Error('Enter a valid email address.');
  const current = readStoredSession();
  const currentId: string =
    current?.workspaceSessionId ||
    current?.sessionId ||
    current?.id ||
    (() => {
      try {
        return sessionStorage.getItem('space_session_id');
      } catch {
        return null;
      }
    })() ||
    `guest_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

  let contactId: string | null = null;
  try {
    let visitorId: string | null = null;
    try {
      visitorId = localStorage.getItem('audos_visitor_id');
    } catch { /* optional */ }
    const res = await fetch(`/api/space/${sid}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: normalized,
        sessionId: currentId,
        visitorId,
        attribution: null,
        metadata: { source: 'save_profile', guestSessionId: currentId },
        workspaceId: (window as any).__WORKSPACE_ID__ || null,
      }),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      contactId = data?.contactId || null;
    }
  } catch (e) {
    console.warn('[Ethaion] save-profile registration failed (profile still kept on this device):', e);
  }

  // Continuity is the point: the SAME session id moves to durable storage,
  // so everything built as a guest stays attached to the saved profile.
  const session = {
    ...(current || {}),
    id: currentId,
    workspaceSessionId: currentId,
    email: normalized,
    contactId: contactId || current?.contactId || null,
    isGuest: false,
    savedProfile: true,
    verified: true,
    timestamp: Date.now(),
  };
  try {
    localStorage.setItem(key, JSON.stringify(session));
  } catch {
    throw new Error('Could not save on this device — storage is unavailable.');
  }
  try {
    sessionStorage.setItem(key, JSON.stringify(session));
    sessionStorage.setItem('space_session_id', currentId);
  } catch { /* sessionStorage copy is best-effort */ }
  try {
    window.dispatchEvent(
      new CustomEvent('audos:session-established', {
        detail: { workspaceSessionId: currentId, email: normalized },
      }),
    );
  } catch { /* non-fatal */ }
  trackFunnelEvent('profile_saved', { email_domain: normalized.split('@')[1] || '' });
}

// ---------------------------------------------------------------------------
// The save sheet — shared by the persistent button and the onboarding nudge
// ---------------------------------------------------------------------------

export function SaveProfileSheet({ onClose, onSaved }: { onClose: () => void; onSaved?: () => void }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const save = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await persistProfile(email);
      setDone(true);
      onSaved?.();
      setTimeout(onClose, 1600);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save — try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Save your profile"
    >
      <span className="absolute inset-0 bg-[var(--space-shell-shadow-strong)]" aria-hidden="true" />
      <div
        className="relative w-full sm:max-w-md sm:mx-4 bg-[var(--space-surface-card)] rounded-t-2xl sm:rounded-2xl p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className={`${typography.size.base} ${typography.weight.semibold} ${typography.color.primary}`}>
              Save your profile
            </h4>
            <p className={`${typography.size.xs} ${typography.color.muted} mt-0.5`}>
              Leave an email and everything stays — your style profile, your wardrobe, your conversations with Beau.
              Without it, this session ends when the browser closes.
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

        {done ? (
          <p className={`${typography.size.sm} text-[var(--space-semantic-success)] mt-4 inline-flex items-center gap-1.5`}>
            <Check className="w-4 h-4" /> Saved — your profile will be here next time.
          </p>
        ) : (
          <>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void save();
                }
              }}
              placeholder="you@example.com"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              disabled={busy}
              className={`${tw.input.base} ${tw.input.default} ${typography.size.sm} mt-4`}
              aria-label="Email address to save your profile"
            />
            {error && (
              <p className={`${typography.size.xs} text-[var(--space-semantic-danger)] mt-1.5`}>{error}</p>
            )}
            <div className="flex items-center gap-2 mt-3">
              <button
                type="button"
                onClick={() => void save()}
                disabled={busy || !email.trim()}
                className={`px-4 py-2 rounded-lg ${typography.size.sm} inline-flex items-center gap-1.5 ${tw.button.primary} disabled:opacity-40`}
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookmarkCheck className="w-4 h-4" />}
                Save my profile
              </button>
              <button
                type="button"
                onClick={onClose}
                className={`px-3 py-2 rounded-lg ${typography.size.xs} ${tw.button.ghost} border border-[var(--space-border-default)]`}
              >
                Not now
              </button>
            </div>
            <p className={`${typography.size.xs} ${typography.color.muted} mt-2`} style={{ fontSize: '10px' }}>
              Your email is used only to bring your profile back — no newsletters unless you ask for them.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Persistent button — lives at the top of Your Style. Always visible; shows
// the saved state once an email is attached.
// ---------------------------------------------------------------------------

export function SaveProfileButton({ surface = 'your-style' }: { surface?: string }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<boolean>(() => isProfileSaved());
  const email = savedProfileEmail();

  if (saved) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full ${typography.size.xs} border border-[var(--space-border-default)] text-[var(--space-text-secondary)] bg-[var(--space-surface-muted)]`}
        title={email ? `Profile saved — ${email}` : 'Profile saved'}
      >
        <BookmarkCheck className="w-3.5 h-3.5 text-[var(--space-semantic-success)]" />
        Profile saved{email ? ` · ${email}` : ''}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          trackFunnelEvent('save_profile_tapped', { surface });
          setOpen(true);
        }}
        className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full ${typography.size.xs} ${tw.button.primary}`}
        title="Save your profile — keep everything for next time"
      >
        <Bookmark className="w-3.5 h-3.5" />
        Save your profile
      </button>
      {open && <SaveProfileSheet onClose={() => setOpen(false)} onSaved={() => setSaved(true)} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// The ONE soft nudge — a dismissable card shown once, at the very end of
// onboarding, just before the dashboard. Save and Skip; never a blocker,
// never a pop-up mid-action.
// ---------------------------------------------------------------------------

export function SaveProfileNudge({ onDismiss }: { onDismiss: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`${tw.card.default} rounded-2xl p-4 border-[var(--space-brand-primary-200)] bg-[var(--space-surface-accent-soft)]`}>
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl bg-[var(--space-surface-card)] flex items-center justify-center flex-shrink-0">
          <Bookmark className="w-4 h-4 text-[var(--space-text-brand)]" />
        </span>
        <div className="flex-1 min-w-0">
          <p className={`${typography.size.sm} ${typography.weight.semibold} ${typography.color.primary}`}>
            Want to pick up where you left off next time? Save your profile.
          </p>
          <p className={`${typography.size.xs} ${typography.color.muted} mt-0.5`}>
            Right now this is a guest session — it ends when the browser closes. One email keeps your profile,
            wardrobe and Beau’s notes waiting for you.
          </p>
          <div className="flex items-center gap-2 mt-2.5">
            <button
              type="button"
              onClick={() => {
                trackFunnelEvent('save_profile_tapped', { surface: 'onboarding-nudge' });
                setOpen(true);
              }}
              className={`px-3.5 py-1.5 rounded-lg ${typography.size.xs} inline-flex items-center gap-1.5 ${tw.button.primary}`}
            >
              <BookmarkCheck className="w-3.5 h-3.5" /> Save
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className={`px-3 py-1.5 rounded-lg ${typography.size.xs} ${tw.button.ghost} border border-[var(--space-border-default)]`}
            >
              Skip
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="p-1.5 rounded-lg hover:bg-[var(--space-surface-card)] text-[var(--space-text-muted)] flex-shrink-0"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {open && (
        <SaveProfileSheet
          onClose={() => {
            setOpen(false);
            if (isProfileSaved()) onDismiss();
          }}
        />
      )}
    </div>
  );
}
