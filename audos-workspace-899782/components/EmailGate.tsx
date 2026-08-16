import { useState, useEffect, useRef } from 'react';
import {
  ArrowRight,
  X,
  Plus,
  Sparkles,
  Eye,
  Layers,
  Rocket,
  Check,
} from 'lucide-react';
import { useSpaceRuntime } from '../SpaceRuntimeContext';
import type { DesktopThemeTokens } from '../types';

// Version marker for auto-upgrade detection
// Increment this when making breaking changes that stale copies need
export const EMAIL_GATE_VERSION = 139; // v139: new-vs-returning is decided by the register endpoint’s isReturningUser answer, not by which button was pressed — a brand-new email through “Sign in” now lands in onboarding first (with its always-visible skips) instead of being force-marked returning and dropped on an empty dashboard; a known account still goes straight to its dashboard. // v138: OTP removed from Register and Sign in (founder’s request) — one register call resolves the session and enters the space directly with no verification-code step; boot restore re-resolves the stored email through the same idempotent register call instead of demanding an OTP-verified session (and falls back to a stored durable id when the network is down); the gate also asks the platform to disable the space’s OTP config on mount. The 'otp' step machinery remains in the file but is never entered. // v137: landing page rebuilt to the founder’s editorial reference — sticky masthead, hero with the live Beau-verdict card, the enemy, Plate I, four doubts, how Beau works, the house rules, on the name, the dark join band and the colophon; auth, session restore and the sign-in/register modal untouched. // v136: Sign in marks the stored session as returning (isReturningUser) so an existing user never lands in onboarding; Register keeps the server’s own answer so new accounts still get the wizard with its visible skips. // v131: auth rewritten from scratch — ONE register call resolves the session for both Sign in and Register, the client never supplies a sessionId, the identity switches in place (no OTP detour, no post-auth reload, no null render), and every entry point settles in either the signed-in shell or the sign-in form, so no path can leave a blank screen or a spinner that never resolves. // v130: preserve an existing canonical session during boot, recover only genuinely missing ids, and enter restored sessions without a second reload. // v129: bound every auth/session recovery request and render a visible restoring state instead of a blank screen. // v128: reload once after verification so the injected WorkspaceDB client boots under the canonical verified owner; the SDK has no runtime session-switch API, so in-place entry left profile reads on the pre-auth identity. // v127: complete verified sign-in in place now that WorkspaceDB is synchronized, avoiding the redundant reload/blank state. // v126: synchronize the verified canonical identity into both SpaceRuntime and WorkspaceDB before any profile read or piece write. // v125: resolve every email to its stable server session, recover stale cached identities before mounting, and reboot WorkspaceDB under the verified owner. // v124: restore the canonical register → OTP → verified workspace-session flow, match the documented registration payload exactly, and never treat a local fallback id as an authenticated session. // v123: if App Preview’s register endpoint still returns its generic “Required” validation failure, preserve the entered email in a local session and continue instead of trapping the user. // v122: restores the previously working direct email-registration entry path; onboarding no longer depends on the failing upfront OTP detour. // v121: supplies this workspace’s id when App Preview does not inject __WORKSPACE_ID__, preventing registration and OTP validation from returning “Required”. // v120: restores the sessionId field required by this workspace’s register endpoint while retaining canonical response resolution for OTP. // v119: OTP sign-in now registers without a client-made id and resolves the canonical workspace session from both documented and enveloped responses before sending the code. // v118: every real workspace registration now completes OTP verification before entering onboarding, including first-time emails, so profile saves and Skip run under a genuinely verified session. // v117: registration now accepts the canonical session id when returned and otherwise keeps the submitted registered session id, instead of incorrectly rejecting a successful response. // v116: registration CTAs now require an email-backed session before onboarding, and real workspace sessions are server-verified instead of trusting local guest flags. // v115: the sign-in / register popup now shares the landing page’s visual language — parchment paper, hairline edges, 4px corners, Cormorant heading, Lora body, one outlined-gold control, and text fields identical to the Settings panel’s. The dialog renders outside .eg-root, so it carries its own copy of the design tokens (.eg-portal). Copy and structure unchanged. // v114: hero opts out of the platform’s injected "hero legibility floor" via data-light-hero. That published-bundle stylesheet paints a rgba(2,6,23,0.55) scrim + white copy over `.eg-root > section:first-of-type:not([data-light-hero])` (meant for dark video heroes) — it was the real cause of the grey "wardrobe advisor who already knows you" section; the section’s own background was always literal cream #efe7d9 (v113).

// Ethaion favicon: hosted serif Cormorant-style "H" in warm ink #241a12 on
// cream #efe7d9. The `?v=habitus4` query param is a cache-buster: browsers
// cache favicons aggressively per-URL, so a returning visitor whose tab was
// stamped with the old pre-rebrand Brummell "B" gets a guaranteed fresh
// fetch. Every icon surface (16/32 tab icon + 180 apple-touch) uses this
// single URL.
const HABITUS_FAVICON =
  'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785281369484-t6ystn.png?v=habitus4';


type ParsedResponseBody = { data: unknown; rawText: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// Parses a fetch Response body safely so a 5xx HTML page (proxy timeout,
// memory-crash restart, etc.) does not throw inside `response.json()` and
// get swallowed into the generic "Connection error" copy. Always returns
// an object instead of throwing — callers inspect `response.ok` themselves.
// Every auth request is bounded. A hung endpoint has to surface as a plain,
// retryable failure — never as a screen that waits forever.
const AUTH_REQUEST_TIMEOUT_MS = 7_000;

// Hard ceiling for restoring a cached session. The request timeout is shorter
// so this watchdog always has time to clear stale state and show the login.
const BOOT_TIMEOUT_MS = 8_000;

// v6 restores the documented register → OTP → verified-session contract.
const AUTH_VERSION = 6;

async function fetchAuth(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = AUTH_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

async function parseResponseBody(response: Response): Promise<ParsedResponseBody> {
  let rawText = '';
  try {
    rawText = await response.text();
  } catch {
    return { data: null, rawText: '' };
  }

  if (!rawText) {
    return { data: null, rawText: '' };
  }

  try {
    return { data: JSON.parse(rawText) as unknown, rawText };
  } catch {
    return { data: null, rawText };
  }
}

// Pick the most informative error message we can show to the user given
// what came back over the wire. Server-provided `error` always wins; for
// unparseable / non-JSON responses we expose the HTTP status so the bug
// is debuggable instead of being hidden behind "Connection error".
function describeResponseFailure(
  response: Response,
  body: unknown,
  rawText: string,
  fallback: string,
): string {
  if (isRecord(body)) {
    const errField = body.error;
    if (typeof errField === 'string' && errField.trim()) return errField;
    const msgField = body.message;
    if (typeof msgField === 'string' && msgField.trim()) return msgField;
  }

  const status = response.status;
  if (status === 429) return 'Too many requests. Please wait a moment and try again.';
  if (status === 502 || status === 503 || status === 504) {
    return 'The server is temporarily unavailable. Please try again in a moment.';
  }
  if (status >= 500) return `Server error (${status}). Please try again.`;
  if (status === 404) return 'This space could not be found. Please contact support.';
  if (status === 403) return 'This email is not authorized to access this space.';
  if (status === 400 && rawText) {
    // Sometimes the server returns a plain text 400; surface a trimmed copy
    const snippet = rawText.trim().slice(0, 140);
    if (snippet) return snippet;
  }

  return fallback;
}

// Snapshot of the JSON envelope returned by /api/space/:spaceId/register.
// All fields are optional because the server has historically added/removed
// keys; the client narrows individually before use.
interface SpaceRegisterResponseBody {
  success?: boolean;
  workspaceSessionId?: string;
  sessionId?: string;
  id?: string;
  contactId?: string;
  email?: string;
  isReturningUser?: boolean;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  visitorId?: string | null;
  workspaceId?: string;
  metadata?: Record<string, unknown>;
  data?: Record<string, unknown>;
}

/**
 * The DURABLE workspace session, if the server issued one.
 *
 * This is the only field that ever carries one, and it is the only kind of id
 * the WorkspaceDB data API will read or write under: anything else is refused
 * with 403 SESSION_VERIFICATION_REQUIRED. The server issues it once an email
 * has a verified workspace session and returns null otherwise, handing back a
 * per-call provisional browser session (`csess_…`) instead.
 */
function resolveRegisterSession(
  body: SpaceRegisterResponseBody,
): { id: string; provisional: boolean } | null {
  const nested = isRecord(body.data) ? body.data : null;
  const durableCandidates = [body.workspaceSessionId, nested?.workspaceSessionId];
  const durable = durableCandidates.find(
    (value) => typeof value === 'string' && value.trim(),
  );
  if (typeof durable === 'string') return { id: durable, provisional: false };

  // Before OTP verification this workspace returns the valid session in
  // `sessionId` while `workspaceSessionId` is null. That provisional id is
  // exactly what the OTP endpoints expect as sessionUuid; it becomes the
  // verified workspace identity only after a successful verify response.
  const provisionalCandidates = [body.sessionId, nested?.sessionId];
  const provisional = provisionalCandidates.find(
    (value) => typeof value === 'string' && value.trim(),
  );
  return typeof provisional === 'string'
    ? { id: provisional, provisional: true }
    : null;
}

function registeredResponseValue(
  body: SpaceRegisterResponseBody,
  key: 'contactId' | 'isReturningUser' | 'metadata',
): unknown {
  const top = body as unknown as Record<string, unknown>;
  const nested = isRecord(body.data) ? body.data : null;
  return top[key] ?? nested?.[key];
}

// The session this space keeps in localStorage under `space_session_{spaceId}`.
// It is read by the space runtime, the injected WorkspaceDB client, Settings
// and the app’s own profile helpers, so the shape only ever grows and every
// field is optional. `workspaceSessionId` is the canonical id.
interface StoredSession {
  id?: string;
  sessionId?: string;
  workspaceSessionId?: string;
  email?: string | null;
  contactId?: string | null;
  isReturningUser?: boolean;
  metadata?: Record<string, unknown>;
  isGuest?: boolean;
  // True when the id is a provisional browser session rather than a durable
  // workspace one. Such a session gets the visitor in, but the data API will
  // not read or write under it, so the gate keeps trying to upgrade it.
  provisional?: boolean;
  // The inverse of `provisional`, kept because other surfaces already read it:
  // useAgentChatRuntime only loads a conversation history for a session marked
  // verified. A durable workspace session is by definition a verified one —
  // the server will not issue one for an unverified email.
  verified?: boolean;
  authVersion?: number;
  timestamp?: number;
}

/** The id on a stored session, whichever key an older writer used. */
function sessionIdOf(session: StoredSession | null): string | null {
  const candidates = [session?.workspaceSessionId, session?.sessionId, session?.id];
  const found = candidates.find((value) => typeof value === 'string' && value.trim());
  return typeof found === 'string' ? found : null;
}

/** Locally minted ids (old guest and template-preview sessions). They own
 * whatever that browser logged, but they are not server sessions, so an email
 * can always be resolved to something better. */
function isLocalSessionId(value: string | null): boolean {
  return !!value && /^(guest|ephemeral|anon|csess_local)_/.test(value);
}

/** What the register endpoint tells us about the resolved identity. */
interface ResolvedSession {
  id: string;
  /** Whether `id` is the durable workspace session (see above). */
  durable: boolean;
  contactId: string | null;
  isReturningUser: boolean;
  metadata: Record<string, unknown>;
}

type ResolveResult =
  | { ok: true; session: ResolvedSession }
  | { ok: false; error: string };

interface EmailGateProps {
  spaceId: string;
  branding?: {
    name?: string;
    tagline?: string;
    logoUrl?: string;
    heroVideoUrl?: string;
    colors?: Record<string, any>;
    palette?: Record<string, any>;
  };
  themeTokens?: DesktopThemeTokens;
}

// 'loading' — restoring a stored session. 'email' — the form is on screen.
// 'complete' — a session was adopted and the shell takes over. There is no
// fourth state, and every path through the gate ends in one of the last two.
type GateStep = 'loading' | 'email' | 'otp' | 'complete';

// Derive a usable color set from a single hex primary color
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace('#', '');
  if (clean.length !== 3 && clean.length !== 6) return null;
  const normalized =
    clean.length === 3
      ? clean.split('').map((char) => char + char).join('')
      : clean;
  return {
    r: parseInt(normalized.substring(0, 2), 16),
    g: parseInt(normalized.substring(2, 4), 16),
    b: parseInt(normalized.substring(4, 6), 16),
  };
}

function colorWithAlpha(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function normalizeHexColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  const match = trimmed.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  return match ? `#${match[1]}` : undefined;
}

function readableTextColor(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#ffffff';
  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return luminance > 0.58 ? '#3b2b1d' : '#f7f2e9';
}

// ---------------------------------------------------------------------------
// THE LANDING PAGE CONTENT (v137) — the founder’s editorial reference,
// verbatim. Static copy lives at module scope so a render never rebuilds it;
// the interactive Beau-verdict card reads LANDING_PIECES through the
// `verdictPiece` state inside EmailGate.
// ---------------------------------------------------------------------------

/** The two inks the verdict card scores with — gold for an answered
 * question, a drier clay for one the piece fails. */
const LANDING_GOOD = '#a8712c';
const LANDING_BAD = '#8c5a3c';

// Every mono label on the landing page is set through this helper, so the
// phone-width reading floor lives here rather than in dozens of call sites:
// `--el-mono-min` is 0px on desktop (the size below is used exactly as
// written) and is lifted to a legible minimum inside the page’s phone media
// query. One variable therefore raises every kicker, caption and pill at
// once, and no desktop size changes.
const landingMono = (size: number, color: string, tracking = '0.07em') => ({
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: `max(var(--el-mono-min, 0px), ${size}px)`,
  letterSpacing: tracking,
  textTransform: 'uppercase' as const,
  color,
});

const landingSerif = (size: number, color: string) => ({
  fontFamily: "'Cormorant Garamond', Georgia, 'Times New Roman', serif",
  fontSize: `${size}px`,
  fontWeight: 400,
  color,
});

/** A long paragraph that reads as an essay on a desktop column and as a wall
 * of text on a 375px screen. On a phone the body clamps to a few lines behind
 * a "Read on" control so several long entries can stack without burying the
 * page; from 641px up the clamp and the control are both absent, so the
 * desktop page is exactly as it was. All of the copy stays on the page — it is
 * paced, not cut. */
function LandingProse({
  text,
  style,
  lines = 5,
}: {
  text: string;
  style?: React.CSSProperties;
  lines?: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={open ? 'el-prose is-open' : 'el-prose'}>
      <p
        className="el-prose-body"
        style={{ ...(style || {}), ['--el-prose-lines' as string]: String(lines) } as React.CSSProperties}
      >
        {text}
      </p>
      <button type="button" className="el-prose-more" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? 'Show less' : 'Read on'}
      </button>
    </div>
  );
}

interface LandingPieceRow {
  label: string;
  note: string;
  mark2: string;
  good: boolean;
}

interface LandingPiece {
  label: string;
  name: string;
  meta: string;
  verdict: string;
  rows: LandingPieceRow[];
}

const LANDING_PIECES: LandingPiece[] = [
  {
    label: 'Lambswool crew · £145',
    name: 'The Peregrine crew, in oatmeal',
    meta: 'British lambswool · made in Yorkshire · 12 years in the line',
    verdict: 'Buy it. This one you keep.',
    rows: [
      { label: 'Quality', note: 'Fully-fashioned knit, no cut-and-sew seams. Wool grown and spun in the UK — spinning, knitting and finishing all in one country.', mark2: 'Holds up', good: true },
      { label: 'Fit', note: 'Body length runs short — the one house that does, and the one you need at 5′7″.', mark2: 'Right on you', good: true },
      { label: 'Continuity', note: 'Same colour, same gauge, every autumn since 2014. You can buy a second in two years.', mark2: 'Repeatable', good: true },
      { label: 'In ten years', note: 'Oatmeal against your colouring, no logo, no season. Nothing here dates.', mark2: 'Still yours', good: true },
    ],
  },
  {
    label: 'Technical overshirt · £320',
    name: 'The overshirt you asked me about',
    meta: 'Cotton-nylon blend · capsule drop · third year of the label',
    verdict: 'Pass. Not this one, not at that price.',
    rows: [
      { label: 'Quality', note: '38% nylon in a piece sold as cotton, and “made in Portugal” covers the finishing only — it was cut and sewn elsewhere.', mark2: 'Thin for the money', good: false },
      { label: 'Fit', note: 'Drop shoulder set for a taller frame; the seam lands halfway down your upper arm.', mark2: 'Wrong lines', good: false },
      { label: 'Continuity', note: 'Capsule drop — gone in eight weeks, with nothing in the colour to build against.', mark2: 'One-off', good: false },
      { label: 'In ten years', note: 'Reads as 2026 the moment the cut moves on. You’d resent it by spring.', mark2: 'Dates fast', good: false },
    ],
  },
];

const LANDING_DOUBTS = [
  { n: '01', title: 'Is it actually well made?', body: 'Origin is close to legal fiction: a label can claim a country where only minor finishing happened while the garment was built on the other side of the world. And more of it is polyester every year — a petroleum plastic that traps heat, holds odour and sheds microplastics with every wash. Wool breathes, linen regulates, cotton softens. Almost nobody leads with what a piece is made of.', answer: 'Beau reads the make before you pay: fibre, seams, where each step actually happened, and the label’s record over time.' },
  { n: '02', title: 'Will it fit me?', body: 'Standard proportions don’t translate to every frame. A shorter build gets the wrong sleeve, the wrong rise, the wrong shoulder seam — and it only reveals itself in wear, six months later, when the money’s gone and the return window isn’t.', answer: 'He knows your measurements and which houses cut for them — and says so plainly when one doesn’t.' },
  { n: '03', title: 'Can I build on it?', body: 'A one-season run means no second in the same colour, no matching weight, nothing to grow the wardrobe around. You buy the piece and the piece stays alone.', answer: 'He tracks which labels keep a piece in the line year after year, and flags the ones that won’t.' },
  { n: '04', title: 'Will I still want it?', body: 'The real question is whether you’ll be proud of it at any age — or whether it will read as a passing year the moment taste moves on.', answer: 'Nothing trend-led reaches you. If it wouldn’t hold at sixty, he doesn’t bring it.' },
];

const LANDING_STEPS = [
  { n: '01', kicker: 'He learns you', title: 'Your proportions, colouring and budget reality', body: 'Height and how you’re built, what works against your complexion, what you can actually spend, and the life the clothes have to survive — multiple countries, one suitcase, no dry cleaner on the corner.' },
  { n: '02', kicker: 'He does the looking', title: 'Makers who rarely surface unless you know where to look', body: 'Not just the obvious names — the established houses that genuinely earn their reputation, and the small makers you’d never find otherwise. A wool mill that has done the same thing for a century. A shoemaker nobody outside the trade has heard of. Wherever the best version of a piece exists, Beau finds it.' },
  { n: '03', kicker: 'He justifies it', title: 'A verdict you can argue with, line by line', body: 'Every recommendation arrives with its reasoning shown, including the reasons against. You keep the decision; what changes is that you now know what you’re deciding.' },
];

const LANDING_REFUSALS = [
  { title: 'No fast fashion', body: 'Whatever the price, whatever the search — pieces built to fail are never an answer here.' },
  { title: 'No trend-chasing', body: 'Nothing is recommended because it’s popular. Only because it’s right for you, and defensible in writing.' },
  { title: 'No label bias', body: 'A famous name earns no weight it hasn’t earned on the make. Prestige is not a quality signal.' },
  { title: 'No cosplay', body: 'This isn’t old-money dress-up. Clothes as character, not performance — you should look like yourself.' },
];

/** The two plates — bespoke photographs generated for this page (the make
 * up close, and a cloth-swatch detail), hosted on the workspace CDN. */
const LANDING_PLATE_WIDE =
  'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1786768858866-04iiqm.png';
const LANDING_PLATE_SMALL =
  'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1786768886199-yuwh68.png';


export default function EmailGate({
  spaceId,
  branding,
  themeTokens,
}: EmailGateProps) {
  const { setSessionId } = useSpaceRuntime();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [pendingAuth, setPendingAuth] = useState<{ email: string; session: ResolvedSession; mode: 'register' | 'signin' } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<GateStep>('loading');
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  // Which CTA opened the panel. Register and Sign in hit the same endpoint —
  // it is idempotent per email — so this only decides the copy.
  const [authMode, setAuthMode] = useState<'register' | 'signin'>('register');
  const [entered, setEntered] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  // Which piece the hero’s live Beau-verdict card is showing (v137 landing).
  const [verdictPiece, setVerdictPiece] = useState(0);
  // Keep the email field uncontrolled: several iOS/password-manager autofill
  // implementations mutate the DOM value before firing a reliable React
  // change event. A controlled value used to snap that fill back to its first
  // character. Submission always reads the native input value directly.
  const emailInputRef = useRef<HTMLInputElement>(null);
  const restoreAttemptRef = useRef(0);
  const authAttemptRef = useRef(0);

  // App Preview does not always inject __WORKSPACE_ID__, but registration
  // requires it. This source belongs to one workspace, so its stable id is
  // the preview-safe fallback.
  const workspaceId =
    (window as any).__WORKSPACE_ID__ || '3460cb2c-8c4f-405c-83a2-057f8b58da27';
  const gdprEnabled = !!(window as any).__GDPR_ENABLED__;
  // `?as=visitor` preview: hold the logged-out landing page whatever is in
  // storage, so the founder can review what a first-time visitor sees.
  const forceVisitor = (window as any).__AUDOS_FORCE_VISITOR__ === true;
  // Template previews (genesis-space*) are not attached to a workspace, so
  // server-side registration can never succeed there.
  const isTemplatePreview = spaceId === 'genesis-space' || spaceId.startsWith('genesis-space-');
  const rawSocialProviders = (window as any).__SOCIAL_PROVIDERS__;
  const socialProviders: string[] = Array.isArray(rawSocialProviders) ? rawSocialProviders : [];

  useEffect(() => {
    storeAttribution();
    // OTP OFF, PLATFORM-SIDE TOO (founder’s request, August 2026): the gate
    // no longer asks for a verification code, so tell the platform’s OTP
    // config the same thing. Idempotent and fire-and-forget — if the endpoint
    // refuses, the gate’s own no-OTP flow still stands on its own.
    if (!isTemplatePreview) {
      fetch(`/api/auth/otp/space/config/${workspaceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled: false }),
      }).catch(() => { /* non-fatal */ });
    }
    let settled = false;
    const attempt = ++restoreAttemptRef.current;
    // The watchdog is the guarantee, not the plan: if the restore below is
    // somehow still pending, the visitor gets the sign-in form rather than a
    // spinner with no end. Incrementing the token prevents a late response
    // from adopting the stale session after the fallback has rendered.
    const watchdog = window.setTimeout(() => {
      if (settled || restoreAttemptRef.current !== attempt) return;
      settled = true;
      restoreAttemptRef.current += 1;
      console.warn('[EmailGate] session restore timed out; clearing stale session');
      clearStoredSession();
      setPendingAuth(null);
      setLoading(false);
      setStep('email');
    }, BOOT_TIMEOUT_MS);
    restoreSession(attempt)
      .catch((err) => {
        if (restoreAttemptRef.current !== attempt) return;
        console.error('[EmailGate] session restore threw; showing sign-in:', err);
        clearStoredSession();
        setStep('email');
      })
      .finally(() => {
        settled = true;
        window.clearTimeout(watchdog);
      });
    return () => {
      if (restoreAttemptRef.current === attempt) restoreAttemptRef.current += 1;
      window.clearTimeout(watchdog);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId]);

  // One ceiling covers the whole interactive chain (register plus OTP send, or
  // OTP verify), not just an individual fetch. Invalidating the attempt token
  // also prevents a late response from entering the app after the fallback.
  useEffect(() => {
    if (!loading) return;
    const attempt = authAttemptRef.current;
    const timer = window.setTimeout(() => {
      if (authAttemptRef.current !== attempt) return;
      authAttemptRef.current += 1;
      clearStoredSession();
      setPendingAuth(null);
      setCode('');
      setLoading(false);
      setError('Sign-in timed out. Please try again.');
      setStep('email');
    }, BOOT_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, spaceId]);

  // Pre-fill a previously captured address (including a paid checkout return),
  // but never use it as proof of authentication.
  useEffect(() => {
    try {
      const storedEmail = localStorage.getItem('user_email');
      if (storedEmail) setEmail(storedEmail);
    } catch { /* storage unavailable */ }
  }, []);

  useEffect(() => {
    if (email && emailInputRef.current && !emailInputRef.current.value) {
      emailInputRef.current.value = email;
    }
  }, [email]);

  // Landing hero entrance animation (client-only; defaults visible if JS is slow)
  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 60);
    return () => clearTimeout(t);
  }, []);

  // Browser-tab favicon: strip EVERY icon reference the served page shipped
  // with — rel="icon" variants (incl. "shortcut icon"), apple-touch / mask
  // icons, web-manifest links, and msapplication tile metas (the old
  // Brummell "B" could survive in any of them) — then install the Ethaion
  // "H" mark, cache-busted with ?v=habitus4, as the 32×32 / 16×16 tab icons
  // and the 180×180 apple-touch-icon.
  useEffect(() => {
    document
      .querySelectorAll(
        'link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"], link[rel="mask-icon"], link[rel="manifest"], meta[name="msapplication-TileImage"], meta[name="msapplication-config"]'
      )
      .forEach((el) => el.parentNode?.removeChild(el));
    const addIconLink = (rel: string, sizes: string) => {
      const link = document.createElement('link');
      link.rel = rel;
      if (rel === 'icon') link.type = 'image/png';
      link.setAttribute('sizes', sizes);
      link.href = HABITUS_FAVICON;
      document.head.appendChild(link);
    };
    addIconLink('icon', '32x32');
    addIconLink('icon', '16x16');
    addIconLink('apple-touch-icon', '180x180');
  }, []);

  // Floating header: transparent over the hero, solid after the visitor scrolls.
  // The landing page scrolls inside `.eg-root` (not the window), so the listener
  // attaches to that container. Re-runs on step change since eg-root only exists
  // on the main landing screen.
  useEffect(() => {
    const root = document.querySelector('.eg-root');
    if (!root) return;
    const onScroll = () => setScrolled(root.scrollTop > 24);
    root.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => root.removeEventListener('scroll', onScroll);
  }, [step]);

  // Landing reveal (v137): the reference page’s data-rise / data-rule
  // IntersectionObserver, scoped to the .eg-root scroller. Elements ease in
  // as they enter the viewport; reduced-motion visitors see everything at
  // once via the CSS override.
  useEffect(() => {
    const root = document.querySelector('.eg-root');
    if (!root) return;
    const targets = root.querySelectorAll('[data-rise],[data-rule]');
    if (targets.length === 0) return;
    if (!('IntersectionObserver' in window)) {
      targets.forEach((t) => t.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            io.unobserve(entry.target);
          }
        });
      },
      { root, rootMargin: '0px 0px -12% 0px', threshold: 0 },
    );
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, [step]);

  // -------------------------------------------------------------------
  // AUTH — one way in, no detours, no dead ends.
  //
  // POST /api/space/:spaceId/register is the whole of both flows, for both
  // Register and Sign in. The client never invents or sends a session id —
  // the server assigns it (the session-management contract documents
  // `sessionId` as "optional, omitted for new clients"), which is what
  // stops a known email from forking a second identity.
  //
  // WHAT THE SERVER ACTUALLY RETURNS, as of this rewrite:
  //  - `workspaceSessionId` — the DURABLE session, and the only kind the
  //    data API will read or write under. Issued once an email has a
  //    verified workspace session, which is how Sign in picks up the
  //    profile and wardrobe that already belong to that address.
  //  - `sessionId` — a provisional browser session (`csess_…`), different
  //    on every call, issued when there is no durable one yet.
  //
  // We take the durable id when there is one and the provisional id
  // otherwise, because letting someone in beats stranding them: the app
  // holds their onboarding answers locally either way. A provisional
  // session is marked as such and re-resolved on the next boot, so it
  // upgrades itself to the durable id the moment the server issues one,
  // with no action from the visitor.
  //
  // The identity is switched IN PLACE. The injected WorkspaceDB client
  // exposes setSessionId() and re-reads on the platform’s
  // `audos:session-established` event, so there is nothing to gain from
  // reloading the page after signing in — and with no reload there is no
  // boot cycle to get caught in.
  //
  // Every path below settles in exactly one of two states: 'complete' (a
  // session was adopted) or 'email' (the form is on screen, with a reason
  // if something failed). A slow, failing or missing endpoint can only
  // ever produce the second one.
  // -------------------------------------------------------------------

  const storedSessionKey = `space_session_${spaceId}`;

  const readStoredSession = (): StoredSession | null => {
    try {
      const raw = localStorage.getItem(storedSessionKey) || sessionStorage.getItem(storedSessionKey);
      if (!raw || !raw.startsWith('{')) return null;
      const parsed = JSON.parse(raw) as unknown;
      return isRecord(parsed) ? (parsed as StoredSession) : null;
    } catch {
      // Storage blocked (private mode, tracking protection). Signing in for
      // this visit still works; nothing in here may throw.
      return null;
    }
  };

  const writeStoredSession = (session: StoredSession) => {
    try {
      localStorage.setItem(storedSessionKey, JSON.stringify(session));
      sessionStorage.removeItem(storedSessionKey);
    } catch { /* the in-memory session still carries this visit */ }
  };

  const clearStoredSession = () => {
    try {
      localStorage.removeItem(storedSessionKey);
      localStorage.removeItem(`space_subscription_${spaceId}`);
      sessionStorage.removeItem(storedSessionKey);
      sessionStorage.removeItem(`ethaion_auth_reload_${spaceId}`);
    } catch { /* storage may be unavailable; the gate still resets in memory */ }
  };

  // Point every consumer of the identity at the same id, in the order they
  // read it: the WorkspaceDB client first, so the very next query already
  // carries X-Session-Id, then the space runtime — whose setSessionId
  // broadcasts `audos:session-established`, which is what makes the
  // useWorkspaceDB hooks re-read as the new owner.
  const adoptSession = (id: string) => {
    try {
      const injected = (window as any).__workspaceDb;
      if (injected && typeof injected.setSessionId === 'function') injected.setSessionId(id);
    } catch { /* the SDK also re-reads the id from storage on its next call */ }
    setSessionId(id);
  };

  // The gate’s only network call.
  const resolveSessionForEmail = async (
    normalizedEmail: string,
    source: string,
  ): Promise<ResolveResult> => {
    try {
      const response = await fetchAuth(`/api/space/${spaceId}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: normalizedEmail,
          // App Preview’s deployed register validator requires sessionId even
          // though the integration catalog marks it optional. Reuse the stable
          // browser visitor id instead of minting a new value on every retry;
          // the server still resolves the canonical workspaceSessionId.
          sessionId: getVisitorId(),
          visitorId: getVisitorId(),
          attribution: getAttribution(),
          metadata: { marketingConsent, source },
          workspaceId,
        }),
      });

      const { data, rawText } = await parseResponseBody(response);

      if (!response.ok || !isRecord(data)) {
        console.error('[EmailGate] register failed', {
          status: response.status,
          body: data ?? rawText.slice(0, 200),
        });
        return {
          ok: false,
          error: describeResponseFailure(
            response,
            data,
            rawText,
            'We could not sign you in just now. Please try again.',
          ),
        };
      }

      const body = data as SpaceRegisterResponseBody;
      const registeredSession = resolveRegisterSession(body);
      if (!registeredSession) {
        console.error('[EmailGate] register returned no session id', rawText.slice(0, 200));
        return { ok: false, error: 'The server did not return a session. Please try again.' };
      }

      const contactId = registeredResponseValue(body, 'contactId');
      const metadata = registeredResponseValue(body, 'metadata');
      return {
        ok: true,
        session: {
          id: registeredSession.id,
          durable: !registeredSession.provisional,
          contactId: typeof contactId === 'string' ? contactId : null,
          isReturningUser: registeredResponseValue(body, 'isReturningUser') === true,
          metadata: isRecord(metadata) ? (metadata as Record<string, unknown>) : {},
        },
      };
    } catch (err) {
      // Includes fetchAuth’s own timeout abort, so a hung request is just a
      // failure the visitor can retry.
      console.error('[EmailGate] register request failed:', err);
      return {
        ok: false,
        error: 'Connection error. Please check your internet connection and try again.',
      };
    }
  };

  /** Persist the resolved identity, then hand the space over. */
  const enterSpace = (
    normalizedEmail: string,
    resolved: ResolvedSession,
    previous: StoredSession | null,
  ) => {
    // Carry a previous session’s extras (chat intake state and the like) only
    // when it belongs to the same person.
    const carried =
      previous && (!previous.email || String(previous.email).toLowerCase() === normalizedEmail)
        ? previous
        : null;

    writeStoredSession({
      ...(carried || {}),
      id: resolved.id,
      sessionId: resolved.id,
      // Only a DURABLE id belongs in `workspaceSessionId`: every reader in the
      // space treats that field as the workspace identity, and a provisional
      // browser session is not one. They all fall back to `id`, and writing
      // undefined here also clears a stale value off a carried session.
      workspaceSessionId: resolved.durable ? resolved.id : undefined,
      email: normalizedEmail,
      contactId: resolved.contactId ?? carried?.contactId ?? null,
      isReturningUser: resolved.isReturningUser || carried?.isReturningUser === true,
      metadata: resolved.metadata,
      isGuest: false,
      provisional: !resolved.durable,
      verified: resolved.durable,
      authVersion: AUTH_VERSION,
      timestamp: Date.now(),
    });

    // `?as=visitor` pins the shell to the logged-out view, so entering in
    // place would leave the gate on screen. The session is already stored:
    // drop the flag and let the space boot signed in.
    if (forceVisitor) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('as');
        window.location.replace(url.toString());
        return;
      } catch { /* fall through and enter in place */ }
    }

    adoptSession(resolved.id);
    setStep('complete');
  };

  /** Template previews have no workspace behind them, so registration can
   * never succeed there. Enter on a local id so the landing page and the
   * shell can still be reviewed. */
  const enterTemplatePreview = (normalizedEmail: string) => {
    const previewId = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    writeStoredSession({
      id: previewId,
      sessionId: previewId,
      workspaceSessionId: previewId,
      email: normalizedEmail,
      isGuest: true,
      provisional: true,
      authVersion: AUTH_VERSION,
      timestamp: Date.now(),
    });
    adoptSession(previewId);
    setStep('complete');
  };

  /** BOOT. Trust no cached identity until the server confirms it is verified. */
  const restoreSession = async (attempt: number) => {
    if (forceVisitor) {
      setStep('email');
      return;
    }

    let raw: string | null = null;
    try {
      raw = localStorage.getItem(storedSessionKey) || sessionStorage.getItem(storedSessionKey);
    } catch { /* handled as no session below */ }

    if (!raw) {
      setStep('email');
      return;
    }

    const stored = readStoredSession();
    const storedId = sessionIdOf(stored);
    const storedEmail =
      typeof stored?.email === 'string' ? stored.email.trim().toLowerCase() : '';
    const canonicalId =
      typeof stored?.workspaceSessionId === 'string' ? stored.workspaceSessionId.trim() : '';

    // WITHOUT OTP (founder’s request, August 2026) a stored session no longer
    // needs to have been written by a verified flow. Anything structurally
    // usable — a server-issued id plus the email it belongs to — is
    // re-resolved through the same idempotent register call the sign-in form
    // uses: the server answers with the canonical session for that email
    // (upgrading a provisional id to the durable one the moment one exists),
    // and the visitor enters without retyping anything.
    if (!stored || !storedId || !storedEmail || isLocalSessionId(storedId)) {
      clearStoredSession();
      setStep('email');
      return;
    }

    const resolved = await resolveSessionForEmail(storedEmail, 'boot_restore');
    if (restoreAttemptRef.current !== attempt) return;
    if (resolved.ok) {
      enterSpace(storedEmail, resolved.session, stored);
      return;
    }

    // The re-resolve failed (offline, server hiccup). A durable canonical
    // session is safe to enter on as-is rather than kicking the visitor back
    // to the form.
    if (canonicalId && storedId === canonicalId && stored.provisional !== true) {
      adoptSession(canonicalId);
      setStep('complete');
      return;
    }

    clearStoredSession();
    setEmail(storedEmail);
    setStep('email');
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const submittedEmail = (emailInputRef.current?.value || email).trim();
    if (!submittedEmail || !submittedEmail.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    const normalizedEmail = submittedEmail.toLowerCase();
    const attempt = ++authAttemptRef.current;
    setEmail(submittedEmail);
    setError('');
    setLoading(true);
    clearStoredSession();

    if (isTemplatePreview) {
      enterTemplatePreview(normalizedEmail);
      setLoading(false);
      return;
    }

    // Step 1: register and receive the server-issued workspaceSessionId.
    const result = await resolveSessionForEmail(
      normalizedEmail,
      authMode === 'signin' ? 'landing_sign_in' : 'landing_register',
    );
    if (authAttemptRef.current !== attempt) return;
    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      setStep('email');
      return;
    }

    // NO OTP (founder’s request, August 2026): registration resolved the
    // session, and that is the whole of the flow — no verification code, no
    // second step, straight into the space. The lead/pixel events that used
    // to fire after a successful verify fire here instead.
    try {
      if (typeof (window as any).fbq === 'function' && (window as any).__META_PIXEL_ID__) {
        (window as any).fbq('init', (window as any).__META_PIXEL_ID__, { em: normalizedEmail });
      }
    } catch { /* non-fatal */ }
    void fireLeadEventWithRetry(normalizedEmail);

    if (authAttemptRef.current !== attempt) return;
    // NEW OR RETURNING IS THE SERVER’S CALL, NOT THE BUTTON’S (founder’s
    // correction, August 2026): a brand-new email typed into “Sign in” used
    // to be force-marked returning, which skipped onboarding for someone who
    // has no account yet. Both buttons let the visitor in — no redirect, no
    // dead end — and the register endpoint’s own isReturningUser answer
    // decides the landing: a known account goes straight to its dashboard
    // (the app’s onboarding gate also skips anyone whose profile already
    // holds data, so an existing account is safe even if the flag is ever
    // missing), while a NEW email — whichever button it came through — sees
    // onboarding as the very first view, with its always-visible skips.
    enterSpace(normalizedEmail, result.session, null);
    setPendingAuth(null);
    setLoading(false);
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!pendingAuth) {
      clearStoredSession();
      setError('Your sign-in session expired. Please start again.');
      setStep('email');
      return;
    }

    const normalizedCode = code.trim();
    if (!/^\d{4}$/.test(normalizedCode)) {
      setError('Enter the 4-digit code from your email.');
      return;
    }

    const attempt = ++authAttemptRef.current;
    setError('');
    setLoading(true);
    try {
      // Step 3: only a verified response may establish the app session.
      const response = await fetchAuth('/api/auth/otp/space/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: pendingAuth.email,
          code: normalizedCode,
          workspaceId,
          sessionUuid: pendingAuth.session.id,
          sessionId: pendingAuth.session.id,
        }),
      });
      const { data, rawText } = await parseResponseBody(response);
      if (authAttemptRef.current !== attempt) return;
      if (
        !response.ok ||
        !isRecord(data) ||
        data.success !== true ||
        data.verified !== true
      ) {
        setError(describeResponseFailure(
          response,
          data,
          rawText,
          'That code is invalid or expired. Please try again.',
        ));
        setLoading(false);
        return;
      }
    } catch (err) {
      if (authAttemptRef.current !== attempt) return;
      console.warn('[EmailGate] OTP verification failed:', err);
      clearStoredSession();
      setPendingAuth(null);
      setCode('');
      setError('Verification timed out. Please sign in again.');
      setLoading(false);
      setStep('email');
      return;
    }

    if (authAttemptRef.current !== attempt) return;
    try {
      if (typeof (window as any).fbq === 'function' && (window as any).__META_PIXEL_ID__) {
        (window as any).fbq('init', (window as any).__META_PIXEL_ID__, { em: pendingAuth.email });
      }
    } catch { /* non-fatal */ }
    void fireLeadEventWithRetry(pendingAuth.email);

    // OTP verification upgrades the session server-side, but the id we hold
    // may still be the provisional browser session (`csess_…`) from register.
    // Persisting that as the durable workspace session is what caused the
    // restore → clear → sign-in boot loop: check-session reports it is not a
    // real workspace session, so every boot fell back to the email form.
    // Register is idempotent for a verified email, so re-resolve it now to
    // pick up the durable workspaceSessionId the server just issued.
    const upgraded = await resolveSessionForEmail(pendingAuth.email, 'otp_verified_upgrade');
    if (authAttemptRef.current !== attempt) return;
    // SIGN IN SKIPS ONBOARDING, ALWAYS (founder’s routing fix): someone who
    // chose “Sign in” is claiming an existing account and has just proven the
    // email is theirs, so the stored session is marked returning even when
    // the register endpoint does not say so itself — the app’s onboarding
    // gate reads this flag and goes straight to the home screen. “Register”
    // keeps the server’s own answer, so a brand-new account still lands in
    // onboarding (with its always-visible skips).
    const returning = pendingAuth.mode === 'signin';
    if (upgraded.ok && upgraded.session.durable) {
      enterSpace(
        pendingAuth.email,
        { ...upgraded.session, isReturningUser: upgraded.session.isReturningUser || returning },
        null,
      );
    } else {
      // No durable id came back — let them in on the provisional session
      // rather than blocking entry. It is stored as provisional (not
      // verified), so the next boot re-resolves it instead of adopting it.
      enterSpace(
        pendingAuth.email,
        { ...pendingAuth.session, durable: false, isReturningUser: pendingAuth.session.isReturningUser || returning },
        null,
      );
    }
    setPendingAuth(null);
    setLoading(false);
  };

  const handleSocialLogin = (provider: string) => {
    // Strip the forced-visitor preview flag from the OAuth return URL so the
    // visitor comes back to the signed-in space, not the forced signed-out view.
    let socialReturnTo = window.location.href;
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('as');
      socialReturnTo = url.toString();
    } catch (e) {}
    const returnUrl = encodeURIComponent(socialReturnTo);
    const url = workspaceId
      ? `/api/auth/social/${provider}?workspaceId=${workspaceId}&spaceId=${spaceId}&returnUrl=${returnUrl}`
      : `/api/auth/social/${provider}?spaceId=${spaceId}&returnUrl=${returnUrl}`;
    window.location.href = url;
  };

  function getVisitorId(): string {
    const key = 'audos_visitor_id';
    let id = localStorage.getItem(key);
    if (!id) {
      id = `v_${Math.random().toString(36).substring(2)}_${Date.now()}`;
      localStorage.setItem(key, id);
    }
    return id;
  }

  function getAttrCookie(): Record<string, string> | null {
    try {
      const raw = localStorage.getItem('audos_attribution');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function setAttrCookie(jsonStr: string) {
    const ATTR_COOKIE_NAME = 'audos_attr';
    const MULTI_LEVEL_TLDS = ['co.uk','co.za','co.in','co.jp','co.kr','co.nz','com.au','com.br','com.cn','com.mx','com.sg','com.hk','com.tw','com.ar','com.co','com.eg','com.my','com.ng','com.pe','com.ph','com.pk','com.tr','com.ua','com.vn','org.uk','org.au','net.au','net.uk','ac.uk','gov.uk','gov.au','edu.au','ne.jp','or.jp'];
    const hostname = window.location.hostname;
    const platformDomains = [
      'replit.dev', 'replit.app', 'repl.co',
      'github.io', 'herokuapp.com', 'netlify.app', 'vercel.app',
      'pages.dev', 'workers.dev', 'web.app', 'firebaseapp.com',
      'azurewebsites.net', 'cloudfront.net', 'amazonaws.com',
      'ngrok.io', 'ngrok.app', 'railway.app', 'render.com',
      'fly.dev', 'deno.dev', 'glitch.me'
    ];
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.localhost');
    const isIP = /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
    let isPlatform = false;
    for (let i = 0; i < platformDomains.length; i++) {
      if (hostname.endsWith('.' + platformDomains[i]) || hostname === platformDomains[i]) {
        isPlatform = true;
        break;
      }
    }
    let domainPart = '';
    if (!isLocalhost && !isIP && !isPlatform) {
      const parts = hostname.split('.');
      const lastTwo = parts.slice(-2).join('.');
      if (MULTI_LEVEL_TLDS.indexOf(lastTwo) !== -1 && parts.length >= 3) {
        domainPart = '; domain=.' + parts.slice(-3).join('.');
      } else if (parts.length >= 2) {
        domainPart = '; domain=.' + parts.slice(-2).join('.');
      }
    }
    const isSecure = window.location.protocol === 'https:';
    const secureFlag = isSecure ? '; Secure' : '';
    document.cookie = ATTR_COOKIE_NAME + '=' + encodeURIComponent(jsonStr) + '; max-age=86400; path=/' + domainPart + '; SameSite=Lax' + secureFlag;
  }

  function storeAttribution() {
    const params = new URLSearchParams(window.location.search);
    const hasUtm = params.has('utm_source') || params.has('utm_medium') || params.has('utm_campaign') || params.has('fbclid') || params.has('gclid') || params.has('ref');
    if (!hasUtm) return;

    const attr: Record<string, string> = { capturedAt: Date.now().toString() };
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid', 'ref'].forEach(p => {
      const v = params.get(p);
      if (v) attr[p === 'ref' ? 'referrer' : p.replace('utm_', 'utm').replace('_', '')] = v;
    });
    if (document.referrer) attr.httpReferrer = document.referrer;

    try {
      localStorage.setItem('audos_attribution', JSON.stringify(attr));
    } catch {}

    const cookieAttr: Record<string, string> = { capturedAt: new Date().toISOString() };
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid', 'ref'].forEach(p => {
      const v = params.get(p);
      if (v) cookieAttr[p] = v;
    });
    if (document.referrer) cookieAttr.httpReferrer = document.referrer;
    try {
      setAttrCookie(JSON.stringify(cookieAttr));
      console.log('[EmailGate] Attribution stored in cookie:', cookieAttr);
    } catch {}
  }

  async function fireLeadEventWithRetry(emailAddr: string, attempt = 0) {
    const normalizedEmail = emailAddr.toLowerCase().trim();
    // Task #1480: stable conversion id used for both client-side rdt('track','Lead', …)
    // and server-side Reddit CAPI so they dedupe.
    const conversionId = `lead_${spaceId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const tryFireFbq = (): boolean => {
      if (typeof (window as any).fbq === 'function') {
        (window as any).fbq('track', 'Lead', {
          content_name: 'Email Capture',
          content_category: 'space',
        }, {
          em: normalizedEmail
        });
        console.log('[EmailGate] Meta Pixel Lead event fired for:', emailAddr);
        return true;
      }
      return false;
    };

    if (!tryFireFbq()) {
      console.log('[EmailGate] fbq not ready, will retry with exponential backoff...');
      const maxRetries = 5;
      const delays = [100, 200, 400, 800, 1600];

      const retryWithBackoff = (retryAttempt: number) => {
        if (retryAttempt >= maxRetries) {
          console.warn('[EmailGate] Failed to fire Lead event - fbq never loaded after 5 retries');
          return;
        }
        setTimeout(() => {
          if (tryFireFbq()) {
            console.log(`[EmailGate] Lead event fired after ${retryAttempt + 1} retries`);
          } else {
            retryWithBackoff(retryAttempt + 1);
          }
        }, delays[retryAttempt]);
      };

      retryWithBackoff(0);
    }

    // Task #1480: Reddit Pixel Lead (parallel to Meta). We call window.rdt
    // directly — the queue stub installed by the injected PageVisit snippet
    // (Task #1456, already live) handles late pixel.js loads, so we don’t
    // need the exponential-backoff retry the Meta path uses. Re-running
    // rdt('init', …, { email, externalId }) propagates advanced matching for
    // the subsequent Lead event (Reddit "Step 3: Set up match keys").
    try {
      const rdt = (window as any).rdt;
      const pixelId = (window as any).__REDDIT_PIXEL_ID__;
      if (typeof rdt === 'function') {
        if (pixelId) {
          rdt('init', pixelId, { email: normalizedEmail, externalId: getVisitorId() });
        }
        rdt('track', 'Lead', { conversionId });
        console.log('[EmailGate] Reddit Pixel Lead event fired (conversionId=' + conversionId + ')');
      }
    } catch (e) {
      console.warn('[EmailGate] Reddit Pixel Lead failed:', e);
    }

    if (!workspaceId) return;
    try {
      await fetch(`/api/space/${spaceId}/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'lead',
          sessionId: `lead_${Date.now()}`,
          visitorId: getVisitorId(),
          // Task #1480: include conversionId so server-side Reddit CAPI dedupes
          // with the client-side rdt('track','Lead',…) fired above.
          conversionId,
          metadata: { email: emailAddr, conversionId, ...getAttribution() },
          workspaceId,
        }),
      });
    } catch {
      if (attempt < 2) setTimeout(() => fireLeadEventWithRetry(emailAddr, attempt + 1), 2000);
    }
  }

  const getAttribution = () => {
    const params = new URLSearchParams(window.location.search);

    const urlAttribution: Record<string, string | null> = {};
    if (params.get('utm_source')) urlAttribution.utmSource = params.get('utm_source');
    if (params.get('utm_medium')) urlAttribution.utmMedium = params.get('utm_medium');
    if (params.get('utm_campaign')) urlAttribution.utmCampaign = params.get('utm_campaign');
    if (params.get('utm_content')) urlAttribution.utmContent = params.get('utm_content');
    if (params.get('utm_term')) urlAttribution.utmTerm = params.get('utm_term');
    if (params.get('fbclid')) urlAttribution.fbclid = params.get('fbclid');
    if (params.get('gclid')) urlAttribution.gclid = params.get('gclid');
    if (params.get('ref')) urlAttribution.referrer = params.get('ref');
    if (document.referrer) urlAttribution.httpReferrer = document.referrer;

    const storedAttr = getAttrCookie();

    const merged: Record<string, string | null> = {};
    if (storedAttr) {
      for (const [key, value] of Object.entries(storedAttr)) {
        if (value && key !== 'capturedAt') merged[key] = value;
      }
    }
    for (const [key, value] of Object.entries(urlAttribution)) {
      if (value) merged[key] = value;
    }

    return Object.keys(merged).length > 0 ? merged : null;
  };

  const runtimeConfig = (window as any).__SPACE_CONFIG__;
  const runtimeDesktop = runtimeConfig?.desktop || {};
  const runtimeThemeTokens = runtimeDesktop?.themeTokens || {};
  const runtimeBranding = runtimeDesktop?.branding || {};
  // Founder-selected typography flows through themeTokens.typography (kickoff →
  // compiled __SPACE_CONFIG__). Derive the body/heading font stacks here so the
  // landing renders the chosen fonts instead of a hard-coded system-ui.
  const typography =
    themeTokens?.typography || runtimeThemeTokens?.typography || {};
  const bodyFontStack = typography.bodyFont
    ? `"${typography.bodyFont}", system-ui, -apple-system, sans-serif`
    : 'system-ui, -apple-system, sans-serif';
  const headingFontStack = typography.headingFont
    ? `"${typography.headingFont}", system-ui, -apple-system, sans-serif`
    : bodyFontStack;
  // Kickoff stores the manually selected color in palette.primary. Shell accent
  // is derived from palette.highlight and is only a fallback for older spaces.
  const selectedAccentColor = normalizeHexColor(
    themeTokens?.shell?.accentColor ||
      runtimeThemeTokens?.shell?.accentColor ||
      runtimeDesktop?.theme?.accentColor,
  );
  const palette =
    themeTokens?.palette ||
    runtimeThemeTokens?.palette ||
    branding?.palette ||
    runtimeBranding?.palette ||
    branding?.colors ||
    runtimeBranding?.colors ||
    {};
  const palettePrimary = normalizeHexColor(palette?.primary);
  const primaryColor = palettePrimary || selectedAccentColor || '#1e293b';
  const highlightColor = normalizeHexColor(palette?.highlight || palette?.secondary) || primaryColor;
  const brandName = branding?.name || 'Welcome';
  const tagline = branding?.tagline || 'Get started today.';
  const logoUrl = branding?.logoUrl;
  const bgLight = palette?.surfaces?.page || colorWithAlpha(primaryColor, 0.04);
  const bgMedium = palette?.surfaces?.accentSoft || colorWithAlpha(primaryColor, 0.08);
  const borderColor = palette?.surfaces?.border || colorWithAlpha(primaryColor, 0.15);
  const panelColor = themeTokens?.shell?.panelBackground || palette?.surfaces?.panel || '#ffffff';
  const panelStrongColor =
    themeTokens?.shell?.panelStrongBackground || palette?.surfaces?.panelStrong || '#ffffff';
  const pageBackground = themeTokens?.shell?.pageBackground || palette?.surfaces?.page || '#ffffff';
  const sectionBackground = palette?.surfaces?.muted || '#eadfcb';
  const gateGradient =
    themeTokens?.shell?.gateBackground ||
    `linear-gradient(180deg, ${
      palette?.surfaces?.gradientFrom || bgLight
    } 0%, ${
      palette?.surfaces?.gradientVia || '#ffffff'
    } 55%, ${
      palette?.surfaces?.gradientTo || '#ffffff'
    } 100%)`;
  const textPrimary = palette?.text?.brand || primaryColor;
  const textMuted = palette?.text?.secondary || colorWithAlpha(primaryColor, 0.55);
  const textSubtle = palette?.text?.muted || colorWithAlpha(primaryColor, 0.35);
  const selectedAccentOverridesPalette = !palettePrimary && !!selectedAccentColor;
  const onPrimary = selectedAccentOverridesPalette
    ? readableTextColor(primaryColor)
    : palette?.text?.onPrimary || readableTextColor(primaryColor);
  const onHighlight = selectedAccentOverridesPalette
    ? readableTextColor(highlightColor)
    : palette?.text?.onHighlight || onPrimary;
  // Warm Editorial (Pass Thirty-One): colour is a stroke, never a fill — CTAs
  // are outlined in the accent, with the deep accent step as legible ink.
  const accentInk = palette?.primaryScale?.['700'] || primaryColor;
  // Flat brand colour for the hero — ligne claire means flat fills, no
  // gradients. Derived from the workspace palette, never hardcoded hex.
  const heroGradient = primaryColor;
  const brandGradient = primaryColor;
  // Hero copy + CTAs sit on the gradient/video, so they stay white over a
  // dark scrim. The scrim deepens for light primaries so text stays legible
  // regardless of the workspace palette (contrast may resolve to white).
  const primaryRgb = hexToRgb(primaryColor);
  const primaryIsLight = primaryRgb
    ? (0.2126 * primaryRgb.r + 0.7152 * primaryRgb.g + 0.0722 * primaryRgb.b) / 255 > 0.62
    : false;
  const heroScrim = `linear-gradient(105deg, rgba(0,0,0,${primaryIsLight ? 0.6 : 0.42}) 0%, rgba(0,0,0,${primaryIsLight ? 0.42 : 0.18}) 48%, rgba(0,0,0,0) 88%)`;
  const heroVideoUrl =
    branding?.heroVideoUrl ||
    runtimeBranding.heroVideoUrl ||
    (window as any).__WORKSPACE_HERO_VIDEO_URL__ ||
    '';
  const heroHasVideo = typeof heroVideoUrl === 'string' && heroVideoUrl.trim().length > 0;
  const footerBackground = palette?.primaryScale?.['900'] || palette?.text?.primary || primaryColor;
  const footerTextColor = readableTextColor(footerBackground);
  const heroVideoFallback = palette?.primaryScale?.['900'] || primaryColor;
  const loginPanelId = 'email-gate-login-panel';

  const openLogin = (mode: 'register' | 'signin') => {
    setAuthMode(mode);
    setError('');
    setLoginOpen(true);
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>('[data-testid="input-email"]');
      input?.focus();
    }, 0);
  };

  const valueProps = [
    {
      title: 'A style profile that actually knows you',
      desc: 'A two-minute visual onboarding captures your style direction, skin tone, proportions, materials and per-category budgets — so you never have to repeat yourself.',
    },
    {
      title: 'Straight verdicts, not endless options',
      desc: 'Describe a piece or paste a product link and Beau answers with a clear buy-or-skip, reasoned against your profile — quality, fit, colour and value.',
    },
    {
      title: 'A wardrobe map, not a shopping list',
      desc: 'Track what you own in The Rail, see the real gaps on The Edit’s coverage map, and browse The Search — recommendations ranked for your archetypes and your budgets.',
    },
  ];
  const howItWorks = [
    { step: '1', title: 'Build your profile', desc: 'Tap through the visual onboarding — style archetypes, occasions, proportions, skin tone and materials. No typing required.' },
    { step: '2', title: 'Map your wardrobe', desc: 'Log what you own in one go. The Rail keeps the record, and The Edit’s coverage map shows exactly where your wardrobe reaches — and where it doesn’t.' },
    { step: '3', title: 'Buy with conviction', desc: 'Ask Beau about any piece — or hand him the hunt. Every verdict is reasoned against your profile and your real budget.' },
  ];
  const testimonials = [
    { quote: 'Ten open tabs of “best oxford shirt” and still no decision — that is the exhaustion Ethaion exists to end.', name: 'The problem' },
    { quote: 'Fewer, better pieces, chosen with intention — a wardrobe that still feels right at 45.', name: 'The principle' },
  ];
  const faqs = [
    { q: 'Do I need an account or email to start?', a: 'Enter your email to register or sign in. New accounts can skip any onboarding step — or skip the whole wizard for now — and returning accounts go straight to their saved dashboard.' },
    { q: 'Do I need a credit card?', a: 'No. Registration is free and no credit card is required.' },
    { q: 'What is inside?', a: 'Beau — your personal menswear advisor — plus The Rail (your wardrobe record), The Search (his recommendations, matched to your profile), and Maker Scout for discovering obscure, high-value makers.' },
    { q: 'Is my data private?', a: 'Yes. Your profile and wardrobe are stored privately for your account and used only to personalise your recommendations.' },
  ];

  // Presentational icons paired with the content arrays above by index.
  // Kept separate so the copy arrays stay plain for per-workspace rewrites.
  const valuePropIcons = [Eye, Layers, Rocket];

  // A monochrome onboarding mark (path marker ".mono.") can be recolored for
  // contrast; any other logo (legacy colored, knockout, dimensional) is shown
  // as-is on a neutral chip so it keeps working without clashing.
  const logoIsMono =
    typeof logoUrl === 'string' && /\.mono\.[a-z0-9]+(?:[?#].*)?$/i.test(logoUrl);

  // Centralized logo "block/chip": the fill derives from the current theme
  // tokens and the mark auto-picks white/black for contrast, so swapping the
  // brand palette recolors the block without ever regenerating the logo.
  const BrandMark = ({
    size = 40,
    blockColor,
    radiusScale = 0.26,
  }: { size?: number; blockColor?: string; radiusScale?: number }) => {
    const fill = blockColor || primaryColor;
    const markIsLight = readableTextColor(fill) === '#ffffff';
    const inner = Math.round(size * 0.6);
    const blockStyle = {
      width: size,
      height: size,
      borderRadius: Math.round(size * radiusScale),
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    } as const;
    if (logoUrl && !logoIsMono) {
      return (
        <div
          style={{ ...blockStyle, backgroundColor: '#ffffff', border: `1px solid ${borderColor}` }}
        >
          <img
            src={logoUrl}
            alt={brandName}
            style={{ width: inner, height: inner, objectFit: 'contain' }}
          />
        </div>
      );
    }
    return (
      <div style={{ ...blockStyle, backgroundColor: fill }}>
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={brandName}
            style={{
              width: inner,
              height: inner,
              objectFit: 'contain',
              filter: markIsLight ? 'brightness(0) invert(1)' : 'brightness(0)',
            }}
          />
        ) : (
          <span
            style={{
              color: markIsLight ? '#f7f2e9' : '#3b2b1d',
              fontWeight: 700,
              fontSize: Math.round(size * 0.42),
              fontFamily: headingFontStack,
            }}
          >
            {brandName.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
    );
  };

  const renderLoginPanel = (compact = false) => (
    <div
      id={loginPanelId}
      className={compact ? '' : 'rounded-3xl p-6 sm:p-8'}
      style={compact ? undefined : {
        backgroundColor: panelColor,
        boxShadow: `0 24px 48px ${colorWithAlpha(primaryColor, 0.14)}, 0 2px 6px ${colorWithAlpha(primaryColor, 0.06)}`,
        border: `1px solid ${borderColor}`,
      }}
    >
      {!compact && (
        <div className="mb-5 text-center">
          <div
            className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl"
            style={{ background: brandGradient, color: onPrimary }}
          >
            <Sparkles size={22} strokeWidth={2.4} />
          </div>
          <p className="text-base font-extrabold" style={{ color: textPrimary }}>
            Pick up where you left off
          </p>
          <p className="mt-1 text-sm" style={{ color: textMuted }}>
            Enter the email you saved your profile with — your wardrobe will be waiting.
          </p>
        </div>
      )}

      {step === 'otp' ? (
        <form onSubmit={handleOtpSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              name="otp"
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={code}
              onChange={(e) => {
                setCode(e.currentTarget.value.replace(/\D/g, '').slice(0, 4));
                setError('');
              }}
              placeholder="4-digit code"
              className={`eg-input${error ? ' eg-input--error' : ''}`}
              disabled={loading}
              required
              autoFocus
              data-testid="input-otp"
            />
            {error && (
              <p className="mt-2 text-xs" style={{ color: 'var(--space-semantic-danger)' }} data-testid="text-error">
                {error}
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={loading}
            className="eg-btn eg-btn--block"
            data-testid="button-verify"
          >
            {loading ? 'Verifying…' : 'Verify and continue'}
            {!loading && <ArrowRight size={18} strokeWidth={2.6} />}
          </button>
          <button
            type="button"
            className="eg-link w-full text-center"
            disabled={loading}
            onClick={() => {
              clearStoredSession();
              setPendingAuth(null);
              setCode('');
              setError('');
              setStep('email');
            }}
          >
            Use a different email
          </button>
        </form>
      ) : (
        <form onSubmit={handleAuthSubmit} className="space-y-4">
          <div>
            <input
              ref={emailInputRef}
              type="email"
              name="email"
              autoComplete="username"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              defaultValue={email}
              onInput={(e) => {
                setEmail(e.currentTarget.value);
                setError('');
              }}
              placeholder="Enter your email"
              className={`eg-input${error ? ' eg-input--error' : ''}`}
              disabled={loading}
              required
              autoFocus={loginOpen}
              data-testid="input-email"
            />
            {error && (
              <p className="mt-2 text-xs" style={{ color: 'var(--space-semantic-danger)' }} data-testid="text-error">
                {error}
              </p>
            )}
          </div>

          {gdprEnabled && (
            <div
              className="space-y-2 rounded-lg px-3 py-2 text-xs"
              style={{
                backgroundColor: bgLight,
                color: textMuted,
              }}
            >
              <p>
                By entering your email, you agree to our{' '}
                <a href="/privacy" className="font-medium underline" style={{ color: textPrimary }}>
                  Privacy Policy
                </a>.
              </p>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={marketingConsent}
                  onChange={(e) => setMarketingConsent(e.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 rounded"
                  style={{ borderColor: borderColor, accentColor: primaryColor }}
                />
                <span>I want to receive marketing emails and updates (optional)</span>
              </label>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="eg-btn eg-btn--block"
            data-testid="button-continue"
          >
            {loading ? 'Just a moment…' : authMode === 'signin' ? 'Sign in' : 'Register'}
            {!loading && <ArrowRight size={18} strokeWidth={2.6} />}
          </button>
        </form>
      )}

      {!compact && (
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-5 text-xs font-medium" style={{ color: textSubtle }}>
          <span className="inline-flex items-center gap-1"><Check size={13} strokeWidth={3} />100% free</span>
          <span className="inline-flex items-center gap-1"><Check size={13} strokeWidth={3} />No credit card</span>
          <span className="inline-flex items-center gap-1"><Check size={13} strokeWidth={3} />Instant access</span>
        </div>
      )}

      {socialProviders.length > 0 && (
        <div className="mt-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px" style={{ backgroundColor: borderColor }} />
            <span className="text-xs font-medium" style={{ color: textSubtle }}>or continue with</span>
            <div className="flex-1 h-px" style={{ backgroundColor: borderColor }} />
          </div>
          <div className={`grid gap-2 ${socialProviders.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {socialProviders.map((provider) => (
              <button
                key={provider}
                type="button"
                onClick={() => handleSocialLogin(provider)}
                disabled={loading}
                className="eg-btn eg-btn--block"
              >
                <span className="capitalize">{provider}</span>
              </button>
            ))}
          </div>
        </div>
      )}

    </div>
  );

  // ONE status screen for both non-interactive states, and it is never
  // `null`. The shell decides whether to mount the gate from the runtime
  // session, so a gate that renders nothing while that session is still
  // landing is exactly what produced the blank screen this rewrite removes.
  if (step === 'loading' || step === 'complete') {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ fontFamily: bodyFontStack, background: gateGradient, color: textPrimary }}
        role="status"
        aria-live="polite"
      >
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-current border-t-transparent animate-spin" />
          <span className="text-sm">
            {step === 'complete' ? 'Opening your wardrobe…' : 'Restoring your wardrobe…'}
          </span>
        </div>
      </div>
    );
  }

  // Main email entry screen - landing page first, native login panel on CTA.
  return (
    <>
      {/*
        WYSIWYG kickoff: the founder-chosen landing look replaces ONLY the shell
        region between the START/END markers below. Everything outside it — the
        auth hooks/handlers above, and the login modal + <LoginPanel> after END —
        is fixed platform infrastructure and is never LLM-regenerated, so
        sign-in / OTP / registration is guaranteed intact after a variant ships.
        A generated shell may use in-scope brand vars (primaryColor, brandName,
        heroVideoUrl, heroHasVideo, openLogin, BrandMark, colorWithAlpha, the
        lucide icons, …) but must not fetch, register, or duplicate auth.
        See server/services/kickoff-email-gate-variants.service.ts.
      */}
      {/* AUDOS:LANDING_SHELL:START */}
    <div
      className="eg-root h-screen overflow-y-auto"
      style={{ height: '100dvh', WebkitOverflowScrolling: 'touch', fontFamily: "'Lora', Georgia, 'Times New Roman', serif", backgroundColor: '#ded4c2' }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Lora:ital,wght@0,400;0,500;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap');
        .eg-root {
          /* Landing surfaces are pinned to the Ethaion design system — cream
             page (#efe7d9) and parchment paper (#fbf8f1) — so no runtime
             theme-token fallback can ever turn a section grey. */
          --page: #efe7d9;
          --paper: #fbf8f1;
          --ink: #3b2b1d;
          --walnut: #241a12;
          --accent: #a8712c;
          --accent-deep: #7c4a17;
          --divider: rgba(59,43,29,0.18);
          color: var(--ink);
        }
        .eg-root h1, .eg-root h2, .eg-root h3 {
          font-family: 'Cormorant Garamond', Georgia, 'Times New Roman', serif;
          font-weight: 400;
        }
        .eg-root em { font-style: italic; }
        .eg-root a { color: #7c4a17; text-decoration: none; }
        .eg-root a:hover { color: #241a12; text-decoration: underline; }
        .eg-root ::selection { background: rgba(168,113,44,.22); }
        .eg-root input { font: inherit; }
        .eg-root input:focus-visible, .eg-root a:focus-visible, .eg-root [tabindex]:focus-visible, .eg-root button:focus-visible { outline: 2px solid #a8712c; outline-offset: 2px; }
        /* The reveal grammar — the reference page’s own rise and rule-draw. */
        .eg-root [data-rise] { opacity: 0; transform: translateY(22px); transition: opacity .9s cubic-bezier(.2,.6,.2,1), transform .9s cubic-bezier(.2,.6,.2,1); }
        .eg-root [data-rise].in { opacity: 1; transform: none; }
        .eg-root [data-rise][data-delay="1"] { transition-delay: .09s; }
        .eg-root [data-rise][data-delay="2"] { transition-delay: .18s; }
        .eg-root [data-rise][data-delay="3"] { transition-delay: .27s; }
        .eg-root [data-rule] { transform: scaleX(0); transform-origin: left; transition: transform 1.1s cubic-bezier(.2,.6,.2,1); }
        .eg-root [data-rule].in { transform: none; }
        @media (prefers-reduced-motion: reduce) {
          .eg-root [data-rise], .eg-root [data-rule] { opacity: 1 !important; transform: none !important; transition: none !important; }
        }
        /* The one outlined control the modal shares with the page. */
        .eg-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 44px;
          padding: 13px 24px;
          border: 1px solid #a8712c;
          border-radius: 0;
          background: rgba(168,113,44,.12);
          color: #241a12;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 10px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          cursor: pointer;
          white-space: nowrap;
          transition: background-color 0.2s ease;
        }
        .eg-btn:hover { background-color: rgba(168,113,44,.24); }
        .eg-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .eg-btn--block { width: 100%; gap: 8px; }
        /* The dialog renders OUTSIDE .eg-root (it is a sibling of the landing
           shell), so it needs its own copy of the design tokens — without
           them every .eg-btn / .eg-link inside it would resolve var(--ink)
           and var(--accent) to nothing and lose its colour entirely. */
        .eg-portal {
          --page: #efe7d9;
          --paper: #fbf8f1;
          --ink: #3b2b1d;
          --accent: #a8712c;
          --accent-deep: #7c4a17;
          --divider: rgba(59,43,29,0.18);
          font-family: 'Lora', Georgia, 'Times New Roman', serif;
          color: var(--ink);
        }
        /* THE SIGN-IN / REGISTER POPUP shares the page’s visual language:
           parchment paper, hairline edges, square corners, no shadow, the
           display serif for the heading and the outlined-gold control. */
        .eg-modal {
          background: #fbf8f1;
          border: 1px solid #3b2b1d;
          border-radius: 0;
        }
        .eg-modal-title {
          font-family: 'Cormorant Garamond', Georgia, 'Times New Roman', serif;
          font-weight: 400;
          font-size: 30px;
          line-height: 1.15;
          color: #241a12;
        }
        .eg-modal-sub {
          font-family: 'Lora', Georgia, serif;
          font-size: 14px;
          line-height: 1.7;
          color: #634e38;
        }
        .eg-close {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 38px;
          height: 38px;
          background: transparent;
          border: 1px solid rgba(59,43,29,0.3);
          border-radius: 0;
          color: #241a12;
          cursor: pointer;
          transition: background-color 0.2s ease;
        }
        .eg-close:hover { background-color: rgba(168,113,44,.08); }
        /* One text box, identical to the page’s own email fields: paper
           ground, a single hairline, square corners, Lora at 15px. */
        .eg-input {
          width: 100%;
          background: #fbf8f1;
          border: 1px solid rgba(59,43,29,.3);
          border-radius: 0;
          min-height: 46px;
          padding: 0 15px;
          font-family: 'Lora', Georgia, serif;
          font-size: 15px;
          color: #241a12;
          outline: none;
        }
        .eg-input:focus { border-color: #a8712c; }
        .eg-input::placeholder { color: #a68e70; opacity: 1; }
        .eg-input--error { border-color: #7d2a24; }
        .eg-fine {
          font-family: 'Lora', Georgia, serif;
          font-size: 12px;
          line-height: 1.7;
          color: #634e38;
        }
        @media (max-width: 640px) {
          .eg-modal-title { font-size: 25px; }
        }
        .eg-link {
          background: none;
          border: none;
          padding: 0;
          font-family: 'Lora', Georgia, serif;
          font-size: 14px;
          color: var(--ink);
          cursor: pointer;
          transition: color 0.2s ease;
        }
        .eg-link:hover { color: var(--accent-deep); }
        /* ——— the landing page itself, on the reference’s own grammar ——— */
        /* The reading floors default to 0px, which means "use the size the
           call site asked for". Only the phone media query at the foot of this
           sheet raises them. */
        .el-page { width: 100%; max-width: 1440px; margin: 0 auto; background: #efe7d9; color: #3b2b1d; font-size: 15.5px; line-height: 1.6; --el-mono-min: 0px; --el-body-min: 0px; }
        .el-nav {
          position: sticky; top: 0; z-index: 20;
          display: flex; align-items: center; gap: 40px;
          flex-wrap: wrap;
          padding: 16px 56px;
          background: rgba(251,248,241,.94);
          backdrop-filter: blur(8px);
          border-bottom: 1px solid #3b2b1d;
        }
        .el-nav-links { display: flex; align-items: center; gap: 30px; font-family: 'IBM Plex Mono', monospace; font-size: 9.5px; letter-spacing: .1em; text-transform: uppercase; }
        .el-nav-links a, .el-nav-links button.el-navlink { color: #634e38; background: none; border: none; padding: 0; font: inherit; letter-spacing: inherit; text-transform: inherit; cursor: pointer; }
        .el-nav-links a:hover, .el-nav-links button.el-navlink:hover { color: #241a12; text-decoration: underline; }
        .el-navcta { padding: 8px 15px; border: 1px solid #a8712c; background: rgba(168,113,44,.1); color: #241a12 !important; font: inherit; letter-spacing: inherit; text-transform: inherit; cursor: pointer; }
        .el-navcta:hover { background: rgba(168,113,44,.2); text-decoration: none !important; }
        .el-hero { display: grid; grid-template-columns: minmax(0,1fr) 520px; gap: 56px; align-items: start; padding: 70px 56px 66px; border-bottom: 1px solid #3b2b1d; background: #efe7d9; }
        .el-hero h1 { margin: 16px 0 0; font-size: clamp(40px, 4.9vw, 70px); font-weight: 400; line-height: 1.02; letter-spacing: -.014em; color: #241a12; text-wrap: pretty; }
        .el-field { flex: 1; padding: 13px 15px; background: #fbf8f1; border: 1px solid rgba(59,43,29,.3); color: #241a12; font-size: 15px; min-width: 0; }
        .el-field::placeholder { color: #a68e70; }
        .el-submit { padding: 13px 24px; border: 1px solid #a8712c; background: rgba(168,113,44,.12); font-family: 'IBM Plex Mono', monospace; font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: #241a12; cursor: pointer; white-space: nowrap; display: flex; align-items: center; }
        .el-submit:hover { background: rgba(168,113,44,.24); }
        .el-submit:disabled { opacity: .55; cursor: not-allowed; }
        .el-pill:hover { border-color: #a8712c !important; }
        .el-prompt-row:hover { background: rgba(168,113,44,.06); }
        .el-enemy { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 56px; align-items: baseline; }
        .el-doubts-grid, .el-refusals-grid { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); }
        .el-steps { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); margin: 64px 56px 0; border: 1px solid #3b2b1d; background: #fbf8f1; }
        .el-name-grid { display: grid; grid-template-columns: minmax(0,1fr) 300px; gap: 56px; align-items: center; }
        .el-join-grid { display: grid; grid-template-columns: minmax(0,1fr) 520px; gap: 56px; align-items: end; }
        .el-join-field { flex: 1; padding: 13px 15px; background: transparent; border: 1px solid rgba(232,222,208,.4); color: #f4ece0; font-size: 15px; min-width: 0; }
        .el-join-field::placeholder { color: rgba(232,222,208,.55); }
        .el-join-submit { padding: 13px 24px; border: 1px solid #c9a672; background: rgba(201,166,114,.12); color: #f4ece0; font-family: 'IBM Plex Mono', monospace; font-size: 10px; letter-spacing: .1em; text-transform: uppercase; cursor: pointer; white-space: nowrap; display: flex; align-items: center; }
        .el-join-submit:hover { background: rgba(201,166,114,.26); }
        .el-join-submit:disabled { opacity: .55; cursor: not-allowed; }
        @media (max-width: 1080px) {
          .el-hero { grid-template-columns: 1fr; }
        }
        @media (max-width: 900px) {
          .el-nav { padding: 14px 24px; gap: 20px; }
          .el-nav-anchor { display: none; }
          .el-hero { padding: 48px 24px 52px; gap: 40px; }
          .el-pad { padding-left: 24px !important; padding-right: 24px !important; }
          .el-inset { margin-left: 24px !important; margin-right: 24px !important; }
          .el-enemy { grid-template-columns: 1fr; gap: 20px; }
          .el-doubts-grid, .el-refusals-grid { grid-template-columns: repeat(2, minmax(0,1fr)); }
          .el-steps { grid-template-columns: 1fr; margin: 48px 24px 0; }
          .el-steps > div { border-right: none !important; border-bottom: 1px solid rgba(59,43,29,.2); }
          .el-name-grid { grid-template-columns: 1fr; gap: 32px; }
          .el-join-grid { grid-template-columns: 1fr; gap: 36px; }
        }
        @media (max-width: 560px) {
          .el-doubts-grid, .el-refusals-grid { grid-template-columns: 1fr; }
          .el-hero-form { flex-direction: column; align-items: stretch; }
          .el-hero-form .el-submit, .el-hero-form .el-join-submit { justify-content: center; }
          /* Stacked one-up, the entries need a rule between them and their own
             full width — the desktop column’s right border and right padding
             would otherwise leave four blocks of copy running together. */
          .el-doubts-grid > div, .el-refusals-grid > div {
            padding: 22px 0 24px !important;
            border-right: none !important;
            border-bottom: 1px solid rgba(59,43,29,.2);
          }
          .el-doubts-grid > div:last-child, .el-refusals-grid > div:last-child { border-bottom: none; }
        }

        /* ——— PHONE PASS (≤640px) ———
           Every rule below sits inside a max-width query, so the desktop page
           set out above is untouched. Three jobs, in order:
           1. TYPE — lift the mono labels and the body copy to a comfortable
              reading floor via the two variables on .el-page.
           2. ROOM — a 375px screen cannot afford a 56px (or even 24px) gutter,
              so the page gutter, the hero and the plates all come in.
           3. REFLOW — the masthead, the hero figures and Beau’s verdict card
              were laid out on desktop geometry (wide rows, a 4-up mark grid, a
              fixed 82px label column). They stack, and every control that a
              thumb has to hit is at least 44px tall. */
        @media (max-width: 640px) {
          /* Nothing may scroll sideways. */
          .eg-root { overflow-x: hidden; }

          .el-page { --el-mono-min: 12px; --el-body-min: 15.5px; font-size: 16px; line-height: 1.62; }

          /* Masthead. The section anchors are already hidden below 900px, so
             this row is wordmark + Sign in + Create account; it is tightened
             so all three fit a 375px screen on one line, and .el-nav’s
             flex-wrap is the backstop if they ever cannot. */
          .el-nav { padding: 11px 18px; gap: 12px; }
          .el-nav-links { gap: 14px; font-size: 11px; }
          .el-nav-links button.el-navlink { display: inline-flex; align-items: center; min-height: 44px; }
          .el-navcta { min-height: 44px; padding: 12px 13px; }
          .el-wordmark { font-size: 15px !important; letter-spacing: .17em !important; }
          .el-wordmark-box { width: 21px !important; height: 21px !important; }

          /* Gutters. */
          .el-hero { padding: 32px 18px 40px; gap: 32px; }
          .el-pad { padding-left: 18px !important; padding-right: 18px !important; }
          .el-inset { margin-left: 18px !important; margin-right: 18px !important; }
          .el-steps { margin-left: 18px !important; margin-right: 18px !important; }
          .el-steps > div { padding: 22px 20px 26px !important; }
          .el-hero h1 { font-size: clamp(32px, 9.2vw, 42px); line-height: 1.07; }

          /* Fields and buttons. 16px is the size below which iOS Safari zooms
             the whole page in on focus; 48px is a comfortable thumb target. */
          .el-field, .el-join-field { min-height: 48px; font-size: 16px; padding: 12px 14px; }
          .el-submit, .el-join-submit { min-height: 48px; font-size: 11px; justify-content: center; }
          .eg-input { min-height: 48px; font-size: 16px; }
          .eg-btn { min-height: 48px; font-size: 11px; }

          /* The dialog’s own reading floor. These three render inside
             .eg-portal — a sibling of the landing shell, outside .el-page —
             so they cannot read --el-body-min and need their phone sizes
             written here rather than through the shared token. */
          .eg-modal-sub { font-size: 15.5px; }
          .eg-link { font-size: 15.5px; }
          .eg-fine { font-size: 14px; }
          /* The dialog’s link is a full-width control, so it takes a thumb
             target too; the landing page’s inline "Sign in" keeps the height
             of the sentence it sits in. The close cross was a 38px square. */
          .eg-modal .eg-link { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; }
          .eg-close { width: 44px; height: 44px; }

          /* The three hero figures sat in one row on a 44px gap, which is
             wider than the screen. They share the width and wrap. */
          .el-hero-stats { gap: 18px 24px !important; flex-wrap: wrap; margin-top: 32px !important; }
          .el-hero-stats > div { flex: 1 1 86px; min-width: 0; }

          /* Beau’s verdict card. The four score marks go two-up, and each test
             row stacks its label above the finding instead of squeezing the
             finding into what is left of a fixed 82px column. */
          .el-pill { min-height: 44px; padding: 8px 13px !important; }
          .el-verdict-marks { grid-template-columns: repeat(2, minmax(0,1fr)) !important; gap: 16px 12px !important; }
          .el-verdict-head { display: none !important; }
          .el-verdict-row { grid-template-columns: minmax(0,1fr) !important; gap: 3px !important; padding: 13px 16px !important; }

          /* The plates keep their frame, not their desktop height. */
          .el-plate-wide { height: 210px !important; padding: 8px !important; }
          .el-plate-small { height: 175px !important; }

          /* Justified setting opens rivers of white space in a 375px measure. */
          .el-enemy p { text-align: left !important; }

          .el-colophon { gap: 10px 22px !important; padding: 18px 18px !important; }
        }

        /* The "Read on" control is a phone affordance only: above 640px the
           paragraph is always shown in full and the button never renders, so
           the desktop page keeps reading straight through. */
        .el-prose-more { display: none; }
        @media (max-width: 640px) {
          .el-prose .el-prose-body {
            display: -webkit-box;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: var(--el-prose-lines, 5);
            overflow: hidden;
          }
          .el-prose.is-open .el-prose-body { display: block; overflow: visible; }
          .el-prose-more {
            display: inline-flex;
            align-items: center;
            min-height: 44px;
            padding: 0;
            background: none;
            border: none;
            font-family: 'IBM Plex Mono', monospace;
            font-size: 11px;
            letter-spacing: .1em;
            text-transform: uppercase;
            color: #7c4a17;
            border-bottom: 1px solid rgba(168,113,44,.45);
            cursor: pointer;
          }
        }
      `}</style>

      <div className="el-page" data-screen-label="Landing">
        {/* ——— the sticky masthead ——— */}
        <div className="el-nav">
          <div style={{ display: 'flex', alignItems: 'center', gap: '11px' }}>
            <div className="el-wordmark-box" style={{ width: '24px', height: '24px', border: '1px solid #241a12', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '15px', lineHeight: 1, color: '#241a12' }}>E</span>
            </div>
            <span className="el-wordmark" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '17px', letterSpacing: '.26em', color: '#241a12' }}>ETHAION</span>
          </div>
          <span style={{ flex: 1 }} />
          <div className="el-nav-links">
            <a className="el-nav-anchor" href="#doubts">Four doubts</a>
            <a className="el-nav-anchor" href="#beau">How Beau works</a>
            <a className="el-nav-anchor" href="#refuses">No commission</a>
            <span className="el-nav-anchor" style={{ width: '1px', height: '14px', background: 'rgba(59,43,29,.28)' }} />
            <button type="button" className="el-navlink" onClick={() => openLogin('signin')} data-testid="button-open-login">Sign in</button>
            <button type="button" className="el-navcta" onClick={() => openLogin('register')} disabled={loading} data-testid="button-register">Create account</button>
          </div>
        </div>

        {/* ——— the hero: the claim on the left, Beau’s verdict card on the right ——— */}
        <section className="el-hero" data-light-hero="true" data-screen-label="Hero">
          <div>
            <div data-rise="" style={landingMono(9.5, '#7c4a17', '0.14em')}>A scout for your wardrobe · four questions, scored</div>
            <h1 data-rise="" data-delay="1">The last wardrobe you’ll have to guess at.</h1>
            <p data-rise="" data-delay="2" style={{ margin: '22px 0 0', maxWidth: '60ch', fontSize: '17px', lineHeight: 1.62 }}>
              Every purchase feels like a gamble you might regret. Beau already knows your proportions, your colouring
              and your budget — and scores every piece against the same four questions before you pay.
            </p>
            <p data-rise="" data-delay="2" style={{ margin: '14px 0 0', maxWidth: '60ch', color: '#634e38' }}>
              <em>Beau is your valet — named for George Bryan “Beau” Brummell, the father of modern menswear.</em> He looks high and low on your behalf: the construction, the cloth,
              whether the label will still make it in five years, whether the proportions work on <em>your</em> frame.
              He does the legwork. You decide.
            </p>

            <div data-rise="" data-delay="3" style={{ display: 'flex', flexDirection: 'column', gap: '11px', marginTop: '30px', maxWidth: '470px' }}>
              <form
                className="el-hero-form"
                style={{ display: 'flex', gap: '11px' }}
                onSubmit={(e) => {
                  e.preventDefault();
                  openLogin('register');
                }}
              >
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError('');
                  }}
                  placeholder="your@email.com"
                  aria-label="Email address"
                  className="el-field"
                  data-testid="input-hero-email"
                />
                <button type="submit" className="el-submit" disabled={loading} data-testid="button-enter-guest">
                  {loading ? 'One moment…' : 'Create your account'}
                </button>
              </form>
              <div style={landingMono(9, '#a68e70')}>Free to join. You’re in straight away — no newsletter, no drops, no noise.</div>
              <div style={{ fontSize: 'max(var(--el-body-min, 0px), 13.5px)', color: '#634e38' }}>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => openLogin('signin')}
                  className="eg-link"
                  style={{ fontSize: 'max(var(--el-body-min, 0px), 13.5px)', borderBottom: '1px solid rgba(168,113,44,.6)' }}
                >
                  Sign in
                </button>
              </div>
            </div>

            <div className="el-hero-stats" data-rise="" data-delay="3" style={{ display: 'flex', gap: '44px', marginTop: '40px', paddingTop: '26px', borderTop: '1px solid rgba(59,43,29,.22)' }}>
              <div>
                <div style={{ ...landingSerif(40, '#241a12'), lineHeight: 1, fontFeatureSettings: "'tnum'" }}>4</div>
                <div style={{ ...landingMono(9, '#856c51'), marginTop: '6px' }}>doubts closed before you pay</div>
              </div>
              <div>
                <div style={{ ...landingSerif(40, '#241a12'), lineHeight: 1, fontFeatureSettings: "'tnum'" }}>1</div>
                <div style={{ ...landingMono(9, '#856c51'), marginTop: '6px' }}>valet who knows you</div>
              </div>
              <div>
                <div style={{ ...landingSerif(40, '#a8712c'), lineHeight: 1, fontFeatureSettings: "'tnum'" }}>0</div>
                <div style={{ ...landingMono(9, '#856c51'), marginTop: '6px' }}>commission, ever</div>
              </div>
            </div>
          </div>

          {/* Beau’s verdict card — live: tap a piece to read the other verdict. */}
          <div data-screen-label="Beau verdict" data-rise="" data-delay="1" style={{ border: '1px solid #3b2b1d', background: '#fbf8f1' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px', flexWrap: 'wrap', padding: '13px 18px', borderBottom: '1px solid rgba(59,43,29,.2)' }}>
              <span style={landingMono(8.5, '#a68e70')}>Under consideration</span>
              {LANDING_PIECES.map((p, i) => {
                const on = i === verdictPiece;
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setVerdictPiece(i)}
                    className="el-pill"
                    style={{
                      ...landingMono(9, on ? '#241a12' : '#856c51', '0.06em'),
                      padding: '5px 12px',
                      border: `1px solid ${on ? '#a8712c' : 'rgba(59,43,29,.28)'}`,
                      background: on ? 'rgba(168,113,44,.14)' : 'transparent',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                    data-testid={`button-verdict-piece-${i}`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            <div style={{ padding: '16px 18px 4px' }}>
              <div style={{ ...landingSerif(26, '#241a12'), lineHeight: 1.13 }}>{LANDING_PIECES[verdictPiece].name}</div>
              <div style={{ ...landingMono(9, '#856c51', '0.05em'), marginTop: '5px', fontFeatureSettings: "'tnum'" }}>{LANDING_PIECES[verdictPiece].meta}</div>
            </div>

            <div className="el-verdict-marks" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: '10px', padding: '14px 18px 0' }}>
              {LANDING_PIECES[verdictPiece].rows.map((row) => (
                <div key={row.label}>
                  <div style={{ height: '3px', background: row.good ? LANDING_GOOD : 'rgba(140,90,60,.35)' }} />
                  <div style={{ ...landingMono(7.5, '#856c51', '0.1em'), marginTop: '6px' }}>{row.label}</div>
                  <div style={{ ...landingMono(7.5, row.good ? '#7c4a17' : LANDING_BAD, '0.1em'), marginTop: '2px' }}>
                    {row.good ? 'Answered' : 'Not answered'}
                  </div>
                </div>
              ))}
            </div>

            <div className="el-verdict-head" style={{ display: 'grid', gridTemplateColumns: '82px minmax(0,1fr)', gap: '10px', padding: '14px 18px 7px', ...landingMono(8, '#a68e70', '0.06em') }}>
              <span>The test</span>
              <span>What Beau found</span>
            </div>

            {LANDING_PIECES[verdictPiece].rows.map((row) => (
              <div
                key={row.label}
                className="el-verdict-row"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '82px minmax(0,1fr)',
                  gap: '10px',
                  padding: '11px 18px',
                  borderTop: '1px solid rgba(59,43,29,.13)',
                  borderLeft: `3px solid ${row.good ? LANDING_GOOD : LANDING_BAD}`,
                }}
              >
                <span style={landingMono(8.5, '#856c51', '0.05em')}>{row.label}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 'max(var(--el-body-min, 0px), 13.5px)', lineHeight: 1.5, color: '#3b2b1d' }}>{row.note}</div>
                  <div style={{ ...landingMono(8.5, row.good ? '#7c4a17' : LANDING_BAD, '0.05em'), marginTop: '3px' }}>{row.mark2}</div>
                </div>
              </div>
            ))}

            <div style={{ padding: '14px 18px 17px', borderTop: '1px solid #3b2b1d', background: 'rgba(168,113,44,.05)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '16px' }}>
                <span style={landingMono(8, '#7c4a17', '0.07em')}>Beau, on whether to buy</span>
                <span style={landingMono(8, '#856c51', '0.07em')}>
                  {LANDING_PIECES[verdictPiece].rows.filter((r) => r.good).length} of 4 questions answered
                </span>
              </div>
              <p style={{ ...landingSerif(21, '#241a12'), margin: '7px 0 0', lineHeight: 1.2 }}>{LANDING_PIECES[verdictPiece].verdict}</p>
            </div>
          </div>
        </section>

        {/* ——— the enemy ——— */}
        <div className="el-pad" data-screen-label="The enemy" style={{ padding: '64px 56px 0' }}>
          <div className="el-enemy">
            <h2 data-rise="" style={{ margin: 0, fontSize: 'clamp(30px, 3vw, 42px)', fontWeight: 400, lineHeight: 1.06, color: '#241a12' }}>
              Regret is the enemy. Ignorance at the till is how it gets in.
            </h2>
            <p data-rise="" data-delay="1" style={{ margin: 0, fontSize: 'max(var(--el-body-min, 0px), 15.5px)', lineHeight: 1.62, textAlign: 'justify' }}>
              You search until you’re tired — tab after tab, thread after thread — buy anyway, and find out whether it
              was right after the money is gone. Quality is opaque at the till. Fit only reveals itself in wear. The
              run ends and you can’t build on the piece. Ethaion closes that gap before your money moves: Beau holds
              your proportions, your colouring, your budget, everything you own and everything you’ve turned down,
              then brings back only what he can justify line by line.
            </p>
          </div>
        </div>

        {/* ——— Plate I ——— */}
        <div className="el-inset el-plate-wide" data-screen-label="Plate" data-rise="" style={{ margin: '56px 56px 0', position: 'relative', height: '400px', border: '1px solid #3b2b1d', padding: '11px', background: '#fbf8f1' }}>
          <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
            <img
              src={LANDING_PLATE_WIDE}
              alt="The make, up close — a tailor’s hands at work on a wool lapel"
              loading="lazy"
              decoding="async"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
        </div>
        <div className="el-inset" style={{ display: 'flex', justifyContent: 'space-between', gap: '24px', margin: '9px 56px 0', ...landingMono(8.5, '#a68e70') }}>
          <span>Plate I — the make, up close</span>
          <span>Ethaion</span>
        </div>

        {/* ——— the four doubts ——— */}
        <div id="doubts" className="el-pad" data-screen-label="Four doubts" style={{ padding: '56px 56px 0' }}>
          <div data-rise="" style={landingMono(9.5, '#7c4a17', '0.14em')}>Four doubts, answered before you buy</div>
          <div data-rule="" style={{ height: '1px', background: '#3b2b1d', marginTop: '22px' }} />
          <div className="el-doubts-grid">
            {LANDING_DOUBTS.map((d, i) => (
              <div key={d.n} data-rise="" data-delay={String(i)} style={{ padding: '22px 22px 30px 0', borderRight: '1px solid rgba(59,43,29,.2)' }}>
                <div style={{ ...landingMono(9, '#a8712c', '0.06em'), fontFeatureSettings: "'tnum'" }}>{d.n}</div>
                <div style={{ ...landingSerif(26, '#241a12'), marginTop: '10px', lineHeight: 1.1 }}>{d.title}</div>
                <LandingProse
                  text={d.body}
                  lines={5}
                  style={{ margin: '10px 0 0', fontSize: 'max(var(--el-body-min, 0px), 13.5px)', lineHeight: 1.55, color: '#3b2b1d' }}
                />
                <div style={{ marginTop: '13px', paddingTop: '11px', borderTop: '1px solid rgba(168,113,44,.4)', fontSize: 'max(var(--el-body-min, 0px), 13px)', lineHeight: 1.5, color: '#7c4a17' }}>
                  <em>{d.answer}</em>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ——— how Beau works ——— */}
        <div id="beau" className="el-steps" data-screen-label="How Beau works">
          {LANDING_STEPS.map((s, i) => (
            <div key={s.n} data-rise="" data-delay={String(i)} style={{ padding: '26px 26px 30px', borderRight: '1px solid rgba(59,43,29,.2)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 'max(var(--el-mono-min, 0px), 10px)', color: '#a8712c', fontFeatureSettings: "'tnum'" }}>{s.n}</span>
                <span style={landingMono(8.5, '#7c4a17')}>{s.kicker}</span>
              </div>
              <div style={{ ...landingSerif(27, '#241a12'), marginTop: '12px', lineHeight: 1.08 }}>{s.title}</div>
              <LandingProse
                text={s.body}
                lines={5}
                style={{ margin: '11px 0 0', fontSize: 'max(var(--el-body-min, 0px), 13.5px)', lineHeight: 1.58, color: '#3b2b1d' }}
              />
            </div>
          ))}
        </div>

        {/* ——— the house rules ——— */}
        <div id="refuses" className="el-pad" data-screen-label="Refusals" style={{ padding: '70px 56px 0' }}>
          <div data-rise="" style={{ maxWidth: '64ch' }}>
            <div style={landingMono(9.5, '#7c4a17', '0.14em')}>The house rules</div>
            <h2 style={{ margin: '14px 0 0', fontSize: 'clamp(34px, 3.6vw, 52px)', fontWeight: 400, lineHeight: 1.04, color: '#241a12' }}>
              No brand can buy its way into your wardrobe.
            </h2>
            <p style={{ margin: '16px 0 0', color: '#634e38' }}>
              Brands can pay to be assessed. None can pay to be recommended, and Ethaion takes no commission on
              anything you buy — so there is nothing on this page, or in Beau’s advice, that a cheque changed. An
              advisor is only worth having if you know what he won’t say.
            </p>
          </div>
          <div data-rule="" style={{ height: '1px', background: '#3b2b1d', marginTop: '30px' }} />
          <div className="el-refusals-grid">
            {LANDING_REFUSALS.map((r, i) => (
              <div key={r.title} data-rise="" data-delay={String(i)} style={{ padding: '20px 22px 26px 0', borderRight: '1px solid rgba(59,43,29,.2)' }}>
                <div style={{ ...landingSerif(24, '#241a12'), lineHeight: 1.1 }}>{r.title}</div>
                <p style={{ margin: '8px 0 0', fontSize: 'max(var(--el-body-min, 0px), 13.5px)', lineHeight: 1.55, color: '#3b2b1d' }}>{r.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ——— on the name ——— */}
        <div data-screen-label="On the name" style={{ marginTop: '70px', background: '#fbf8f1', borderTop: '1px solid #3b2b1d', borderBottom: '1px solid #3b2b1d', padding: '56px' }} className="el-pad">
          <div className="el-name-grid">
            <div data-rise="">
              <div style={landingMono(9.5, '#a68e70', '0.14em')}>On the name</div>
              <p style={{ ...landingSerif(29, '#241a12'), margin: '16px 0 0', maxWidth: '56ch', lineHeight: 1.28 }}>
                Ethaion draws on two Greek words: <em>ethos</em>, the animating character of a person — the spirit
                everything else flows from — and <em>aion</em>, enduring time. A wardrobe that ages with you.
              </p>
            </div>
            <div className="el-plate-small" data-rise="" data-delay="1" style={{ position: 'relative', height: '220px', border: '1px solid rgba(59,43,29,.35)', padding: '9px', background: '#efe7d9' }}>
              <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
                <img
                  src={LANDING_PLATE_SMALL}
                  alt="A cloth swatch and horn buttons on warm paper"
                  loading="lazy"
                  decoding="async"
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ——— the join band ——— */}
        <div id="join" className="el-pad" data-screen-label="Join" style={{ background: '#241a12', color: '#e8ded0', padding: '64px 56px' }}>
          <div className="el-join-grid">
            <div data-rise="">
              <div style={landingMono(9.5, '#c9a672', '0.14em')}>Private beta · open now, and small</div>
              <h2 style={{ margin: '16px 0 0', fontSize: 'clamp(34px, 3.6vw, 52px)', fontWeight: 400, lineHeight: 1.02, color: '#f4ece0' }}>
                Stop gambling on your own wardrobe.
              </h2>
              <p style={{ margin: '18px 0 0', maxWidth: '52ch', color: 'rgba(232,222,208,.78)' }}>
                Tell Beau what you own and where you’re going — the first questions take about five minutes — and
                he’ll tell you what’s missing, and what’s worth the money when you find it. No queue: you start
                tonight.
              </p>
            </div>
            <div data-rise="" data-delay="1" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <form
                className="el-hero-form"
                style={{ display: 'flex', gap: '11px' }}
                onSubmit={(e) => {
                  e.preventDefault();
                  openLogin('register');
                }}
              >
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError('');
                  }}
                  placeholder="your@email.com"
                  aria-label="Email address"
                  className="el-join-field"
                  data-testid="input-join-email"
                />
                <button type="submit" className="el-join-submit" disabled={loading} data-testid="button-join-register">
                  {loading ? 'One moment…' : 'Create your account'}
                </button>
              </form>
              <div style={landingMono(9, 'rgba(232,222,208,.6)')}>Free to join. You’re in straight away — no newsletter, no drops, no noise.</div>
              <div style={{ fontSize: 'max(var(--el-body-min, 0px), 13.5px)', color: 'rgba(232,222,208,.72)' }}>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => openLogin('signin')}
                  style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontSize: 'max(var(--el-body-min, 0px), 13.5px)', color: '#c9a672', borderBottom: '1px solid rgba(201,166,114,.5)', cursor: 'pointer' }}
                >
                  Sign in
                </button>
              </div>
              {/* CONTACT & INQUIRIES (founder’s request, August 2026) — this
                  slot used to carry the founder’s own story; it now carries
                  the way to reach him. */}
              <p style={{ margin: '10px 0 0', paddingTop: '16px', borderTop: '1px solid rgba(232,222,208,.2)', fontSize: 'max(var(--el-body-min, 0px), 13.5px)', lineHeight: 1.6, color: 'rgba(232,222,208,.7)' }}>
                Questions or inquiries — write to{' '}
                <a
                  href="mailto:toby.ethaion@gmail.com"
                  style={{ color: '#c9a672', textDecoration: 'none', borderBottom: '1px solid rgba(201,166,114,.5)' }}
                >
                  toby.ethaion@gmail.com
                </a>
              </p>
            </div>
          </div>
        </div>

        {/* ——— the colophon ——— */}
        <div className="el-pad el-colophon" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px 40px', padding: '18px 56px', background: '#fbf8f1', borderTop: '1px solid #3b2b1d', ...landingMono(9, '#856c51', '0.08em') }}>
          <span>Ethaion — building wardrobes with intention</span>
          <span>
            Inquiries —{' '}
            <a href="mailto:toby.ethaion@gmail.com" style={{ color: '#7c4a17', textDecoration: 'none', borderBottom: '1px solid rgba(124,74,23,.4)' }}>
              toby.ethaion@gmail.com
            </a>
          </span>
          <span>No commission · no trend-chasing · no cosplay</span>
        </div>
      </div>
    </div>
      {/* AUDOS:LANDING_SHELL:END */}

      {loginOpen && (
        <div
          className="eg-portal fixed inset-0 z-50 flex items-center justify-center px-4 py-6 sm:py-8 backdrop-blur-sm"
          style={{ backgroundColor: colorWithAlpha(palette?.text?.primary || primaryColor, 0.55) }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="email-gate-login-title"
          onClick={(event) => {
            if (event.target === event.currentTarget && !loading) {
              setLoginOpen(false);
            }
          }}
        >
          <div className="eg-modal w-full max-w-md relative max-h-[88dvh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setLoginOpen(false)}
              disabled={loading}
              aria-label="Close login"
              className="eg-close absolute right-4 top-4 z-10"
            >
              <X size={18} strokeWidth={2} />
            </button>
            <div className="px-5 py-6 sm:p-8">
              <h2 id="email-gate-login-title" className="eg-modal-title mb-2 pr-12">
                {step === 'otp'
                  ? 'Check your email'
                  : authMode === 'signin'
                    ? `Welcome back to ${brandName}`
                    : `Join ${brandName}`}
              </h2>
              <p className="eg-modal-sub mb-5">
                {step === 'otp'
                  ? `Enter the 4-digit code sent to ${pendingAuth?.email || email}.`
                  : authMode === 'signin'
                    ? 'Enter the email you saved your profile with — your wardrobe will be waiting.'
                    : 'Enter your email to begin. Everything after this is optional, and you can skip straight through.'}
              </p>
              {renderLoginPanel(true)}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
