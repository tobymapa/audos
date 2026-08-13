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
export const EMAIL_GATE_VERSION = 125; // v125: resolve every email to its stable server session, recover stale cached identities before mounting, and reboot WorkspaceDB under the verified owner. // v124: restore the canonical register → OTP → verified workspace-session flow, match the documented registration payload exactly, and never treat a local fallback id as an authenticated session. // v123: if App Preview’s register endpoint still returns its generic “Required” validation failure, preserve the entered email in a local session and continue instead of trapping the user. // v122: restores the previously working direct email-registration entry path; onboarding no longer depends on the failing upfront OTP detour. // v121: supplies this workspace’s id when App Preview does not inject __WORKSPACE_ID__, preventing registration and OTP validation from returning “Required”. // v120: restores the sessionId field required by this workspace’s register endpoint while retaining canonical response resolution for OTP. // v119: OTP sign-in now registers without a client-made id and resolves the canonical workspace session from both documented and enveloped responses before sending the code. // v118: every real workspace registration now completes OTP verification before entering onboarding, including first-time emails, so profile saves and Skip run under a genuinely verified session. // v117: registration now accepts the canonical session id when returned and otherwise keeps the submitted registered session id, instead of incorrectly rejecting a successful response. // v116: registration CTAs now require an email-backed session before onboarding, and real workspace sessions are server-verified instead of trusting local guest flags. // v115: the sign-in / register popup now shares the landing page’s visual language — parchment paper, hairline edges, 4px corners, Cormorant heading, Lora body, one outlined-gold control, and text fields identical to the Settings panel’s. The dialog renders outside .eg-root, so it carries its own copy of the design tokens (.eg-portal). Copy and structure unchanged. // v114: hero opts out of the platform’s injected "hero legibility floor" via data-light-hero. That published-bundle stylesheet paints a rgba(2,6,23,0.55) scrim + white copy over `.eg-root > section:first-of-type:not([data-light-hero])` (meant for dark video heroes) — it was the real cause of the grey "wardrobe advisor who already knows you" section; the section’s own background was always literal cream #efe7d9 (v113).

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

function resolveRegisteredSessionId(body: SpaceRegisterResponseBody): string | null {
  const nested = isRecord(body.data) ? body.data : null;
  const candidates = [
    body.workspaceSessionId,
    body.sessionId,
    nested?.workspaceSessionId,
    nested?.sessionId,
  ];
  const found = candidates.find((value) => typeof value === 'string' && value.trim());
  return typeof found === 'string' ? found : null;
}

function registeredResponseValue(
  body: SpaceRegisterResponseBody,
  key: 'contactId' | 'isReturningUser' | 'metadata',
): unknown {
  const top = body as unknown as Record<string, unknown>;
  const nested = isRecord(body.data) ? body.data : null;
  return top[key] ?? nested?.[key];
}

// Snapshot of the JSON envelope returned by /api/auth/otp/space/{send,verify}.
interface OtpResponseBody {
  success?: boolean;
  resendCooldown?: number;
  attemptsRemaining?: number;
  expiresIn?: number;
}

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

type GateStep = 'loading' | 'email' | 'code' | 'complete';

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

export default function EmailGate({
  spaceId,
  branding,
  themeTokens,
}: EmailGateProps) {
  const { setSessionId } = useSpaceRuntime();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<GateStep>('loading');
  const [otpEnabled, setOtpEnabled] = useState(true);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [entered, setEntered] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  // Keep the email field uncontrolled: several iOS/password-manager autofill
  // implementations mutate the DOM value before firing a reliable React
  // change event. A controlled value used to snap that fill back to its first
  // character. Submission always reads the native input value directly.
  const emailInputRef = useRef<HTMLInputElement>(null);

  // App Preview does not always inject __WORKSPACE_ID__, but registration and
  // OTP both require it. This source belongs to one workspace, so use its
  // stable id as the preview-safe fallback.
  const workspaceId =
    (window as any).__WORKSPACE_ID__ || '3460cb2c-8c4f-405c-83a2-057f8b58da27';
  const gdprEnabled = !!(window as any).__GDPR_ENABLED__;
  // Template previews (genesis-space*) aren’t tied to a workspace, so the
  // normal email/OTP registration can’t complete — always offer guest entry
  // there. Cloned workspaces (workspace-N) keep the flag-gated behavior.
  const isTemplatePreview = spaceId === 'genesis-space' || spaceId.startsWith('genesis-space-');
  // A verified email-backed session is required before the profile wizard.
  // Keeping guest entry disabled prevents local-only guest ids from reaching
  // WorkspaceDB writes, which require a registered session.
  const guestModeEnabled = false;
  const rawSocialProviders = (window as any).__SOCIAL_PROVIDERS__;
  const socialProviders: string[] = Array.isArray(rawSocialProviders) ? rawSocialProviders : [];

  useEffect(() => {
    storeAttribution();
    checkExistingSession();
  }, [spaceId]);

  // Pre-fill email from localStorage when loaded inside the onboarding walkthrough
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('walkthrough') === 'true') {
      const storedEmail = localStorage.getItem('user_email');
      if (storedEmail) setEmail(storedEmail);
    }
  }, []);

  useEffect(() => {
    if (email && emailInputRef.current && !emailInputRef.current.value) {
      emailInputRef.current.value = email;
    }
  }, [email]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

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

  const checkExistingSession = async () => {
    // `?as=visitor` preview: never adopt a stored session — skip straight to the
    // logged-out email form instead of jumping to the empty 'complete' state.
    const forceVisitor = typeof window !== 'undefined' && (window as any).__AUDOS_FORCE_VISITOR__ === true;
    const sessionKey = `space_session_${spaceId}`;
    // Guest sessions live in sessionStorage (they end when the browser
    // closes); saved profiles live in localStorage. Check both — a saved
    // profile wins, a mid-session guest reload keeps its session.
    const existingSession = forceVisitor
      ? null
      : localStorage.getItem(sessionKey) || sessionStorage.getItem(sessionKey);

    if (existingSession) {
      try {
        const session = JSON.parse(existingSession);
        let effectiveSessionId = session.workspaceSessionId || session.id;

        // Registration is email-idempotent only when the client does not
        // supply a fresh session id. Re-resolve cached sessions by email so
        // users affected by the auth regression reconnect to the original
        // workspaceSessionId that owns their profile and wardrobe rows.
        if (session.email && workspaceId && !isTemplatePreview) {
          try {
            const canonicalRes = await fetch(`/api/space/${spaceId}/register`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                email: String(session.email).trim().toLowerCase(),
                visitorId: getVisitorId(),
                attribution: null,
                metadata: { source: 'auth_identity_recovery' },
                workspaceId,
              }),
            });
            const { data: canonicalResult, rawText: canonicalRawText } =
              await parseResponseBody(canonicalRes);
            if (!canonicalRes.ok || !isRecord(canonicalResult)) {
              throw new Error(
                describeResponseFailure(
                  canonicalRes,
                  canonicalResult,
                  canonicalRawText,
                  'Could not reconnect your saved profile.',
                ),
              );
            }
            const canonicalBody = canonicalResult as SpaceRegisterResponseBody;
            const canonicalSessionId = resolveRegisteredSessionId(canonicalBody);
            if (!canonicalSessionId) throw new Error('No canonical workspace session was returned.');
            effectiveSessionId = canonicalSessionId;
            localStorage.setItem(sessionKey, JSON.stringify({
              ...session,
              id: canonicalSessionId,
              workspaceSessionId: canonicalSessionId,
              contactId:
                registeredResponseValue(canonicalBody, 'contactId') ||
                session.contactId ||
                null,
              isReturningUser:
                typeof registeredResponseValue(canonicalBody, 'isReturningUser') === 'boolean'
                  ? registeredResponseValue(canonicalBody, 'isReturningUser')
                  : !!session.isReturningUser,
              verified: false,
              authVersion: 3,
              timestamp: Date.now(),
            }));
          } catch (recoveryError) {
            console.warn('[EmailGate] canonical session recovery failed:', recoveryError);
            setStep('email');
            return;
          }
        }

        if (effectiveSessionId) {
          // Template previews have no server-side identity, so their local
          // guest session is the only valid continuation. Real workspace
          // sessions must pass the normal server-side verification below.
          if (isTemplatePreview && session.isGuest) {
            setSessionId(effectiveSessionId);
            setStep('complete');
            return;
          }
          if (workspaceId) {
            try {
              const configRes = await fetch(`/api/auth/otp/space/config/${workspaceId}`);
              const configData = await configRes.json();
              const otpConfig = configData.config || configData;

              if (otpConfig.enabled) {
                setOtpEnabled(true);
                const checkRes = await fetch(`/api/auth/otp/space/check-session?workspaceId=${workspaceId}&sessionUuid=${encodeURIComponent(effectiveSessionId)}`, {
                  credentials: 'include'
                });
                const checkData = await checkRes.json();

                if (checkData.verified) {
                  try {
                    const recovered = JSON.parse(localStorage.getItem(sessionKey) || '{}');
                    localStorage.setItem(sessionKey, JSON.stringify({
                      ...recovered,
                      id: effectiveSessionId,
                      workspaceSessionId: effectiveSessionId,
                      verified: true,
                      authVersion: 3,
                      timestamp: Date.now(),
                    }));
                  } catch { /* the in-memory session still works for this visit */ }
                  setSessionId(effectiveSessionId);
                  completeGateEntry();
                  return;
                } else {
                  setStep('email');
                  return;
                }
              }
            } catch (e) {
              // This workspace’s profile storage requires a verified session.
              // Re-authenticate instead of adopting an unverified cached id.
              console.log('[EmailGate] OTP config check failed, requiring verification');
              setOtpEnabled(true);
              setStep('email');
              return;
            }
          }

          setSessionId(effectiveSessionId);
          setStep('complete');
          return;
        }
      } catch (e) {
        console.error('Failed to parse session:', e);
      }
    }

    if (workspaceId) {
      try {
        const configRes = await fetch(`/api/auth/otp/space/config/${workspaceId}`);
        const configData = await configRes.json();
        const otpConfig = configData.config || configData;
        setOtpEnabled(otpConfig.enabled || false);
      } catch (e) {
        // Fail closed for Ethaion: entering with an unverified registration
        // only defers the failure to onboarding’s WorkspaceDB writes.
        setOtpEnabled(true);
      }
    }

    setStep('email');
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const submittedEmail = (emailInputRef.current?.value || email).trim();
    if (!submittedEmail || !submittedEmail.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    setEmail(submittedEmail);
    setError('');
    setLoading(true);

    try {
      const normalizedEmail = submittedEmail.toLowerCase();

      // OTP-enabled workspaces must establish and verify the canonical server
      // session before the app mounts; WorkspaceDB rejects unverified ids.
      const requireOtpAtEntry = otpEnabled;
      if (requireOtpAtEntry && workspaceId) {
        const attribution = getAttribution();
        const visitorId = getVisitorId();

        const registerRes = await fetch(`/api/space/${spaceId}/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            email: normalizedEmail,
            visitorId,
            attribution,
            metadata: { marketingConsent },
            workspaceId,
          }),
        });

        const { data: registerResult, rawText: registerRawText } =
          await parseResponseBody(registerRes);

        if (!registerRes.ok) {
          console.error('[EmailGate] register failed', {
            status: registerRes.status,
            body: registerResult ?? registerRawText.slice(0, 200),
          });
          setError(
            describeResponseFailure(
              registerRes,
              registerResult,
              registerRawText,
              'Failed to create session. Please try again.',
            ),
          );
          setLoading(false);
          return;
        }

        if (!isRecord(registerResult)) {
          console.error('[EmailGate] register returned an unparseable body', {
            status: registerRes.status,
            rawText: registerRawText.slice(0, 200),
          });
          setError('The server returned an unexpected response. Please try again.');
          setLoading(false);
          return;
        }

        const registerBody = registerResult as SpaceRegisterResponseBody;
        const wsSessionId = resolveRegisteredSessionId(registerBody);
        if (!wsSessionId) {
          setError('Could not start a verified session. Please try again.');
          setLoading(false);
          return;
        }
        setPendingSessionId(wsSessionId);

        if (typeof (window as any).fbq === 'function' && (window as any).__META_PIXEL_ID__) {
          (window as any).fbq('init', (window as any).__META_PIXEL_ID__, { em: normalizedEmail.toLowerCase().trim() });
        }
        fireLeadEventWithRetry(normalizedEmail);

        const sessionKey = `space_session_${spaceId}`;
        const pendingSession = {
          id: wsSessionId,
          workspaceSessionId: wsSessionId,
          email: normalizedEmail,
          contactId: registeredResponseValue(registerBody, 'contactId') || null,
          timestamp: Date.now(),
          verified: false,
          isReturningUser: registeredResponseValue(registerBody, 'isReturningUser') === true,
          metadata: registeredResponseValue(registerBody, 'metadata') || {},
        };
        localStorage.setItem(sessionKey, JSON.stringify(pendingSession));

        // WorkspaceDB writes require a server-verified session. First-time
        // emails must complete OTP too; registration alone is not verification.
        const response = await fetch('/api/auth/otp/space/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email: normalizedEmail, workspaceId, sessionUuid: wsSessionId }),
        });

        const { data: otpResult, rawText: otpRawText } = await parseResponseBody(response);

        if (!response.ok) {
          console.error('[EmailGate] otp send failed', {
            status: response.status,
            body: otpResult ?? otpRawText.slice(0, 200),
          });
          setError(
            describeResponseFailure(
              response,
              otpResult,
              otpRawText,
              'Failed to send code. Please try again.',
            ),
          );
          setLoading(false);
          return;
        }

        const otpBody: OtpResponseBody = isRecord(otpResult) ? otpResult : {};
        setResendCooldown(otpBody.resendCooldown ?? 60);
        setStep('code');
      } else {
        await registerSession(submittedEmail);
      }
    } catch (err) {
      console.error('[EmailGate] Network error in handleEmailSubmit:', err);
      setError('Connection error. Please check your internet connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (code.length !== 4) {
      setError('Please enter the 4-digit code');
      return;
    }

    setError('');
    setLoading(true);

    try {
      if (!pendingSessionId) {
        setError('Session expired. Please start over.');
        setStep('email');
        setLoading(false);
        return;
      }

      const normalizedEmail = email.toLowerCase().trim();
      const response = await fetch('/api/auth/otp/space/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: normalizedEmail, code, workspaceId, sessionUuid: pendingSessionId }),
      });

      const { data: verifyResult, rawText: verifyRawText } = await parseResponseBody(response);
      const verifyBody: OtpResponseBody = isRecord(verifyResult) ? verifyResult : {};

      if (!response.ok || !verifyBody.success) {
        console.error('[EmailGate] otp verify failed', {
          status: response.status,
          body: verifyResult ?? verifyRawText.slice(0, 200),
        });
        if (typeof verifyBody.attemptsRemaining === 'number') {
          setError(`Invalid code. ${verifyBody.attemptsRemaining} attempts remaining.`);
        } else {
          setError(
            describeResponseFailure(
              response,
              verifyResult,
              verifyRawText,
              'Invalid code. Please try again.',
            ),
          );
        }
        setLoading(false);
        return;
      }

      await completeVerifiedSession();
    } catch (err) {
      console.error('[EmailGate] Network error in handleCodeSubmit:', err);
      setError('Connection error. Please check your internet connection and try again.');
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0 || !pendingSessionId) return;

    setLoading(true);
    setError('');

    try {
      const normalizedEmail = email.toLowerCase().trim();
      const response = await fetch('/api/auth/otp/space/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: normalizedEmail, workspaceId, sessionUuid: pendingSessionId }),
      });

      const { data: resendResult, rawText: resendRawText } = await parseResponseBody(response);

      if (response.ok) {
        const resendBody: OtpResponseBody = isRecord(resendResult) ? resendResult : {};
        setResendCooldown(resendBody.resendCooldown ?? 60);
        setCode('');
      } else {
        console.error('[EmailGate] otp resend failed', {
          status: response.status,
          body: resendResult ?? resendRawText.slice(0, 200),
        });
        setError(
          describeResponseFailure(
            response,
            resendResult,
            resendRawText,
            'Failed to resend code. Please try again.',
          ),
        );
      }
    } catch (err) {
      console.error('[EmailGate] Network error in handleResendCode:', err);
      setError('Connection error. Please check your internet connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const completeVerifiedSession = async () => {
    const sessionKey = `space_session_${spaceId}`;
    const normalizedEmail = email.toLowerCase().trim();
    let verifiedMetadata: Record<string, unknown> = {};
    let isReturningUser = false;
    try {
      const existingSession = localStorage.getItem(sessionKey);
      if (existingSession) {
        const parsed = JSON.parse(existingSession);
        if (parsed.metadata) verifiedMetadata = parsed.metadata;
        if (typeof parsed.isReturningUser === 'boolean') {
          isReturningUser = parsed.isReturningUser;
        }
      }
    } catch {}
    const session = {
      id: pendingSessionId,
      workspaceSessionId: pendingSessionId,
      email: normalizedEmail,
      timestamp: Date.now(),
      verified: true,
      authVersion: 3,
      isReturningUser,
      metadata: verifiedMetadata,
    };
    localStorage.setItem(sessionKey, JSON.stringify(session));

    try {
      window.dispatchEvent(new CustomEvent('audos:session-established', {
        detail: {
          workspaceSessionId: pendingSessionId,
          email: normalizedEmail,
        }
      }));
    } catch (e) {}

    setSessionId(pendingSessionId!);
    completeGateEntry();
    setLoading(false);
  };

  const registerSession = async (emailValue = email) => {
    const normalizedEmail = emailValue.toLowerCase().trim();

    // Template previews have no workspace, so the server-side register can
    // never succeed ("Could not resolve workspace from space."). Create a
    // local preview session with the entered email instead.
    if (isTemplatePreview) {
      const previewId = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      const previewSession = {
        id: previewId,
        workspaceSessionId: previewId,
        email: normalizedEmail,
        isGuest: true,
        timestamp: Date.now(),
        verified: true,
        metadata: {},
      };
      localStorage.setItem(`space_session_${spaceId}`, JSON.stringify(previewSession));
      try {
        window.dispatchEvent(new CustomEvent('audos:session-established', {
          detail: { workspaceSessionId: previewId, email: normalizedEmail, isGuest: true },
        }));
      } catch (e) {}
      setSessionId(previewId);
      completeGateEntry();
      setLoading(false);
      return;
    }

    const attribution = getAttribution();
    const visitorId = getVisitorId();
    const response = await fetch(`/api/space/${spaceId}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        email: normalizedEmail,
        visitorId,
        attribution,
        metadata: { marketingConsent },
        workspaceId,
      }),
    });

    const { data: registerResult, rawText: registerRawText } = await parseResponseBody(response);

    if (!response.ok) {
      console.error('[EmailGate] registerSession failed', {
        status: response.status,
        body: registerResult ?? registerRawText.slice(0, 200),
      });
      setError(
        describeResponseFailure(
          response,
          registerResult,
          registerRawText,
          'Registration failed. Please try again.',
        ),
      );
      setLoading(false);
      return;
    }

    if (!isRecord(registerResult)) {
      console.error('[EmailGate] registerSession returned an unparseable body', {
        status: response.status,
        rawText: registerRawText.slice(0, 200),
      });
      setError('The server returned an unexpected response. Please try again.');
      setLoading(false);
      return;
    }

    const registerBody = registerResult as SpaceRegisterResponseBody;
    // Only the server-returned workspace session is authenticated. The
    // client-generated sessionId is request correlation, never a substitute
    // for the canonical workspaceSessionId.
    const effectiveSessionId = resolveRegisteredSessionId(registerBody);
    if (!effectiveSessionId) {
      setError('Could not create a workspace session. Please try again.');
      setLoading(false);
      return;
    }

    const sessionKey = `space_session_${spaceId}`;
    const session = {
      id: effectiveSessionId,
      workspaceSessionId: effectiveSessionId,
      email: normalizedEmail,
      contactId: registeredResponseValue(registerBody, 'contactId') || null,
      timestamp: Date.now(),
      authVersion: 3,
      isReturningUser: registeredResponseValue(registerBody, 'isReturningUser') === true,
      metadata: registeredResponseValue(registerBody, 'metadata') || {},
    };
    localStorage.setItem(sessionKey, JSON.stringify(session));

    try {
      window.dispatchEvent(new CustomEvent('audos:session-established', {
        detail: {
          workspaceSessionId: effectiveSessionId,
          email: normalizedEmail,
        }
      }));
    } catch (e) {}

    if (typeof (window as any).fbq === 'function' && (window as any).__META_PIXEL_ID__) {
      (window as any).fbq('init', (window as any).__META_PIXEL_ID__, { em: normalizedEmail.toLowerCase().trim() });
    }
    fireLeadEventWithRetry(normalizedEmail);

    setSessionId(effectiveSessionId);
    completeGateEntry();
    setLoading(false);
  };

  const handleGuestMode = async () => {
    setError('');
    setLoading(true);

    try {
      const guestId = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      const sessionKey = `space_session_${spaceId}`;
      const guestSession = {
        id: guestId,
        workspaceSessionId: guestId,
        email: null,
        isGuest: true,
        timestamp: Date.now(),
        verified: true,
        metadata: {},
      };
      // Deliberately NOT persistent: sessionStorage only, so closing the
      // browser ends a guest session and a return without saving starts
      // onboarding fresh. "Save your profile" inside the app moves the
      // session to localStorage with the user’s email.
      sessionStorage.setItem(sessionKey, JSON.stringify(guestSession));
      sessionStorage.setItem('space_session_id', guestId);

      try {
        window.dispatchEvent(new CustomEvent('audos:session-established', {
          detail: { workspaceSessionId: guestId, isGuest: true },
        }));
      } catch (e) {}

      setSessionId(guestId);
      completeGateEntry();
    } catch (err) {
      setError('Could not continue as guest. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Reboot the real workspace after authentication so the injected
  // WorkspaceDB client starts with the verified canonical session. This also
  // removes forced-visitor preview mode and prevents piece writes from using
  // the pre-auth token/session that existed when the bundle first mounted.
  const completeGateEntry = () => {
    try {
      if (typeof window !== 'undefined' && !isTemplatePreview) {
        const url = new URL(window.location.href);
        url.searchParams.delete('as');
        window.location.replace(url.toString());
        return;
      }
    } catch (e) {}
    setStep('complete');
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

  const openLogin = () => {
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
      desc: 'Track what you own in The Ledger, see the real gaps on The Edit’s coverage map, and browse The Rail — recommendations ranked for your archetypes and your budgets.',
    },
  ];
  const howItWorks = [
    { step: '1', title: 'Build your profile', desc: 'Tap through the visual onboarding — style archetypes, occasions, proportions, skin tone and materials. No typing required.' },
    { step: '2', title: 'Map your wardrobe', desc: 'Log what you own in one go. The Ledger keeps the record, and The Edit’s coverage map shows exactly where your wardrobe reaches — and where it doesn’t.' },
    { step: '3', title: 'Buy with conviction', desc: 'Ask Beau about any piece — or hand him the hunt. Every verdict is reasoned against your profile and your real budget.' },
  ];
  const testimonials = [
    { quote: 'Ten open tabs of “best oxford shirt” and still no decision — that is the exhaustion Ethaion exists to end.', name: 'The problem' },
    { quote: 'Fewer, better pieces, chosen with intention — a wardrobe that still feels right at 45.', name: 'The principle' },
  ];
  const faqs = [
    { q: 'Do I need an account or email to start?', a: 'No. Tap “Start now” and you’re in — the onboarding, The Ledger, The Rail and Beau all work as a guest, no email asked. When you want your profile to survive the browser closing, tap “Save your profile” inside (top of The Dossier) and leave an email — entirely your call.' },
    { q: 'Do I need a credit card?', a: 'No — no credit card, and no email either. Start as a guest and save your profile only if you want it kept.' },
    { q: 'What is inside?', a: 'Beau — your personal menswear advisor — plus The Ledger (your wardrobe record), The Rail (his recommendations, matched to your profile), and Maker Scout for discovering obscure, high-value makers.' },
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

      <form onSubmit={handleEmailSubmit} className="space-y-4">
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
          {loading ? 'Just a moment...' : 'Sign in'}
          {!loading && <ArrowRight size={18} strokeWidth={2.6} />}
        </button>
      </form>

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

      {guestModeEnabled && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={handleGuestMode}
            disabled={loading}
            className="eg-link"
            data-testid="button-guest-mode"
          >
            Continue as guest
          </button>
        </div>
      )}
    </div>
  );

  if (step === 'loading' || step === 'complete') {
    return null;
  }

  // OTP Code verification screen
  if (step === 'code') {
    return (
      <div
        className="min-h-screen flex flex-col overflow-y-auto"
        style={{ fontFamily: bodyFontStack, background: gateGradient }}
      >
        <div className="flex-1 flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-sm">
            <div className="text-center mb-10">
              <div className="flex justify-center mb-4">
                <div
                  className="flex h-16 w-16 items-center justify-center rounded-2xl"
                  style={{ backgroundColor: panelColor, border: `1px solid ${borderColor}`, boxShadow: `0 10px 24px ${colorWithAlpha(primaryColor, 0.16)}` }}
                >
                  <BrandMark size={52} />
                </div>
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: textPrimary, fontFamily: headingFontStack }}>
                Check your inbox
              </h1>
              <p className="mt-2 text-sm" style={{ color: textMuted }}>
                We sent a 4-digit code to<br />
                <span className="font-medium" style={{ color: textPrimary }}>{email}</span>
              </p>
              <p className="mt-3 text-xs" style={{ color: textSubtle }}>
                can’t find it? Check your spam or junk folder.
              </p>
            </div>

            <form onSubmit={handleCodeSubmit} className="space-y-5">
              <div>
                <input
                  type="text"
                  name="one-time-code"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  value={code}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setCode(val);
                    setError('');
                  }}
                  placeholder="0000"
                  className="w-full px-4 py-3.5 text-center text-2xl tracking-[0.5em] font-mono rounded-xl focus:outline-none transition-all"
                  style={{
                    backgroundColor: panelColor,
                    border: `2px solid ${error ? '#7d2a24' : borderColor}`,
                    color: textPrimary,
                  }}
                  disabled={loading}
                  autoFocus
                  data-testid="input-code"
                />
                {error && (
                  <p className="mt-2 text-xs" style={{ color: 'var(--space-semantic-danger)' }} data-testid="text-error">
                    {error}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading || code.length !== 4}
                className="w-full py-3.5 rounded-2xl font-bold text-base transition-all flex items-center justify-center gap-2 hover:scale-[1.02]"
                style={{
                  backgroundColor: loading || code.length !== 4 ? colorWithAlpha(primaryColor, 0.3) : primaryColor,
                  color: onPrimary,
                  cursor: loading || code.length !== 4 ? 'not-allowed' : 'pointer',
                  boxShadow: loading || code.length !== 4 ? 'none' : `0 10px 24px ${colorWithAlpha(primaryColor, 0.34)}`,
                }}
                data-testid="button-verify"
              >
                {loading ? 'Verifying...' : 'Verify code'}
                {!loading && <ArrowRight size={18} strokeWidth={2.6} />}
              </button>
            </form>

            <div className="text-center mt-6 space-x-4">
              <button
                onClick={handleResendCode}
                disabled={resendCooldown > 0 || loading}
                className="text-sm transition-colors"
                style={{ color: resendCooldown > 0 ? textSubtle : textPrimary }}
              >
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
              </button>
              <span style={{ color: textSubtle }}>|</span>
              <button
                onClick={() => { setStep('email'); setCode(''); setError(''); }}
                className="text-sm transition-colors"
                style={{ color: textMuted }}
              >
                Change email
              </button>
            </div>
          </div>
        </div>

        <div className="pb-8 text-center">
          <p className="text-xs" style={{ color: textSubtle }}>
            Your data is private and secure
          </p>
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
      style={{ height: '100dvh', WebkitOverflowScrolling: 'touch', fontFamily: "'Lora', Georgia, 'Times New Roman', serif", backgroundColor: '#efe7d9' }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Lora:ital,wght@0,400;1,400&display=swap');
        .eg-root {
          /* Landing surfaces are pinned to the Ethaion design system — cream
             page (#efe7d9) and parchment paper (#fbf8f1) — so no runtime
             theme-token fallback can ever turn a section grey. */
          --page: #efe7d9;
          --paper: #fbf8f1;
          --ink: ${palette?.text?.primary || '#3b2b1d'};
          --accent: ${primaryColor};
          --accent-deep: ${accentInk};
          --divider: ${borderColor};
          color: var(--ink);
        }
        .eg-root h1, .eg-root h2, .eg-root h3 {
          font-family: 'Cormorant Garamond', Georgia, 'Times New Roman', serif;
          font-weight: 400;
        }
        .eg-root em { font-style: italic; }
        .eg-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 42px;
          padding: 0 30px;
          border: 1px solid var(--accent);
          border-radius: 4px;
          background: transparent;
          color: var(--ink);
          font-family: 'Cormorant Garamond', Georgia, 'Times New Roman', serif;
          font-size: 15px;
          font-weight: 500;
          letter-spacing: 0.06em;
          cursor: pointer;
          transition: background-color 0.2s ease;
        }
        .eg-btn:hover { background-color: ${colorWithAlpha(primaryColor, 0.08)}; }
        .eg-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .eg-btn--block { width: 100%; gap: 8px; }
        /* The dialog renders OUTSIDE .eg-root (it is a sibling of the landing
           shell), so it needs its own copy of the design tokens — without
           them every .eg-btn / .eg-link inside it would resolve var(--ink)
           and var(--accent) to nothing and lose its colour entirely. */
        .eg-portal {
          --page: #efe7d9;
          --paper: #fbf8f1;
          --ink: ${palette?.text?.primary || '#3b2b1d'};
          --accent: ${primaryColor};
          --accent-deep: ${accentInk};
          --divider: ${borderColor};
          font-family: 'Lora', Georgia, 'Times New Roman', serif;
          color: var(--ink);
        }
        /* THE SIGN-IN / REGISTER POPUP shares the page’s visual language:
           parchment paper, hairline edges, a 4px radius, no shadow, the
           display serif for the heading and the outlined-gold control.
           It is declared with literal colours rather than the .eg-root
           custom properties because the dialog renders OUTSIDE .eg-root. */
        .eg-modal {
          background: #fbf8f1;
          border: 1px solid ${borderColor};
          border-radius: 4px;
        }
        .eg-modal-title {
          font-family: 'Cormorant Garamond', Georgia, 'Times New Roman', serif;
          font-weight: 400;
          font-size: 30px;
          line-height: 1.15;
          color: ${palette?.text?.primary || '#3b2b1d'};
        }
        .eg-modal-sub {
          font-family: 'Lora', Georgia, serif;
          font-size: 14px;
          line-height: 1.7;
          color: ${palette?.text?.secondary || '#634e38'};
        }
        .eg-close {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 38px;
          height: 38px;
          background: transparent;
          border: 1px solid ${borderColor};
          border-radius: 4px;
          color: ${palette?.text?.primary || '#3b2b1d'};
          cursor: pointer;
          transition: background-color 0.2s ease;
        }
        .eg-close:hover { background-color: ${colorWithAlpha(primaryColor, 0.08)}; }
        /* One text box, identical to the Settings panel’s fields: transparent
           ground, a single hairline, 4px corners, Lora at 14px. */
        .eg-input {
          width: 100%;
          background: transparent;
          border: 1px solid ${borderColor};
          border-radius: 4px;
          min-height: 46px;
          padding: 0 14px;
          font-family: 'Lora', Georgia, serif;
          font-size: 14px;
          color: ${palette?.text?.primary || '#3b2b1d'};
          outline: none;
        }
        .eg-input:focus { border-color: ${primaryColor}; }
        .eg-input::placeholder { color: #a68e70; opacity: 1; }
        .eg-input--error { border-color: #7d2a24; }
        .eg-fine {
          font-family: 'Lora', Georgia, serif;
          font-size: 12px;
          line-height: 1.7;
          color: ${palette?.text?.secondary || '#634e38'};
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
        .eg-header {
          position: sticky;
          top: 0;
          z-index: 30;
          background: var(--paper);
          border-bottom: 1px solid var(--ink);
        }
        .eg-header-inner {
          position: relative;
          max-width: 1120px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
          align-items: center;
          column-gap: 18px;
          padding: 18px 24px;
        }
        .eg-header-side {
          display: flex;
          align-items: center;
          min-width: 0;
        }
        .eg-header-side--left { justify-content: flex-end; }
        .eg-header-side--right { justify-content: space-between; gap: 18px; }
        .eg-wordmark {
          font-family: 'Cormorant Garamond', Georgia, 'Times New Roman', serif;
          font-weight: 500;
          font-size: 34px;
          line-height: 1;
          letter-spacing: 0.28em;
          /* letter-spacing adds a trailing space after the final S, which
             shifts the glyphs ~half that distance left of true centre — the
             matching left padding cancels it so ETHAION sits dead centre in
             the bar (the grid’s two 1fr side columns centre the box itself). */
          padding-left: 0.28em;
          text-transform: uppercase;
          color: var(--ink);
          white-space: nowrap;
          justify-self: center;
          text-align: center;
        }
        /* Perfect horizontal centring (v108): the VISIBLE wordmark is
           absolutely positioned at the true centre of the header bar, so no
           amount of side-column content (rules, nav links) can push it
           off-centre at any viewport width. An invisible spacer copy stays in
           the grid’s middle column to keep the rules and links laid out
           exactly as before. */
        .eg-wordmark--spacer { visibility: hidden; }
        .eg-wordmark--centered {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
        }
        .eg-wordmark-rule {
          height: 1px;
          background: var(--accent);
          flex: 1 1 0%;
          max-width: 200px;
        }
        .eg-header-links {
          display: flex;
          align-items: center;
          gap: 22px;
          flex-shrink: 0;
        }
        .eg-hero {
          /* Literal cream (#efe7d9), never a variable — the hero must match
             the rest of the landing page on every device and theme state. */
          background: #efe7d9;
          text-align: center;
          padding: 130px 24px 140px;
        }
        .eg-hero h1 {
          font-size: clamp(36px, 6vw, 52px);
          line-height: 1.14;
          max-width: 760px;
          margin: 0 auto;
          color: var(--ink);
        }
        .eg-hero-sub {
          font-family: 'Lora', Georgia, serif;
          font-size: 18px;
          line-height: 1.7;
          color: var(--ink);
          opacity: 0.7;
          max-width: 480px;
          margin: 26px auto 44px;
        }
        .eg-section { padding: 92px 24px; }
        .eg-section--paper { background: #fbf8f1; }
        .eg-section--page { background: #efe7d9; }
        .eg-section-inner { max-width: 620px; margin: 0 auto; }
        .eg-section-head {
          font-size: clamp(26px, 4vw, 32px);
          line-height: 1.2;
          color: var(--ink);
          margin: 0 0 24px;
          padding-bottom: 14px;
          border-bottom: 1px solid var(--ink);
        }
        .eg-body {
          font-family: 'Lora', Georgia, serif;
          font-size: 15px;
          line-height: 1.9;
          color: var(--ink);
          margin: 0;
        }
        .eg-rows { list-style: none; margin: 6px 0 0; padding: 0; }
        .eg-rows li {
          font-family: 'Cormorant Garamond', Georgia, 'Times New Roman', serif;
          font-size: 24px;
          font-weight: 400;
          color: var(--ink);
          padding: 18px 2px;
          border-bottom: 1px solid var(--divider);
        }
        .eg-rows li:last-child { border-bottom: none; }
        .eg-section-note {
          font-family: 'Lora', Georgia, serif;
          font-size: 15px;
          font-style: italic;
          line-height: 1.8;
          color: var(--ink);
          opacity: 0.75;
          margin: 28px 0 0;
          padding-top: 18px;
          border-top: 1px solid var(--divider);
        }
        /* The problem — four editorial cards: hairline gutters (the divider
           colour shows through 1px gaps), paper cells, no shadows. */
        .eg-cards {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1px;
          background: var(--divider);
          border: 1px solid var(--divider);
          margin-top: 6px;
        }
        .eg-card {
          background: var(--paper);
          padding: 26px 24px 28px;
        }
        .eg-card-title {
          font-family: 'Cormorant Garamond', Georgia, 'Times New Roman', serif;
          font-size: 21px;
          font-weight: 400;
          font-style: italic;
          color: var(--ink);
          margin: 0 0 10px;
        }
        .eg-card-body {
          font-family: 'Lora', Georgia, serif;
          font-size: 14px;
          line-height: 1.8;
          color: var(--ink);
          margin: 0;
        }
        @media (max-width: 560px) {
          .eg-cards { grid-template-columns: 1fr; }
        }
        /* What Beau does — three beats parted by hairlines, like .eg-rows
           but with a body line under each title. */
        .eg-beats { margin: 6px 0 0; }
        .eg-beat {
          padding: 26px 2px;
          border-bottom: 1px solid var(--divider);
        }
        .eg-beat:last-child { border-bottom: none; padding-bottom: 0; }
        .eg-beat-title {
          font-family: 'Cormorant Garamond', Georgia, 'Times New Roman', serif;
          font-size: 24px;
          font-weight: 400;
          color: var(--ink);
          margin: 0 0 10px;
        }
        .eg-beat-body {
          font-family: 'Lora', Georgia, serif;
          font-size: 15px;
          line-height: 1.9;
          color: var(--ink);
          margin: 0;
        }
        .eg-cta-band {
          background: var(--paper);
          border-top: 1px solid var(--divider);
          text-align: center;
        }
        .eg-cta-band h2 {
          font-size: clamp(28px, 4vw, 34px);
          margin: 0 0 30px;
          color: var(--ink);
        }
        .eg-cta-note {
          font-family: 'Lora', Georgia, serif;
          font-size: 13px;
          color: var(--ink);
          opacity: 0.65;
          margin: 20px 0 0;
        }
        .eg-cta-note .eg-link {
          font-size: 13px;
          text-decoration: underline;
          text-decoration-color: var(--accent);
          text-underline-offset: 3px;
        }
        .eg-footer {
          background: var(--paper);
          border-top: 1px solid var(--ink);
          padding: 44px 24px 32px;
        }
        .eg-footer-inner {
          max-width: 1120px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          flex-wrap: wrap;
        }
        .eg-footer-wordmark {
          font-family: 'Cormorant Garamond', Georgia, 'Times New Roman', serif;
          font-weight: 500;
          font-size: 24px;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          color: var(--ink);
        }
        .eg-footer-copy {
          max-width: 1120px;
          margin: 26px auto 0;
          text-align: center;
          font-family: 'Lora', Georgia, serif;
          font-size: 12px;
          color: var(--ink);
          opacity: 0.6;
        }
        @media (max-width: 640px) {
          .eg-header-inner { padding: 14px 12px; column-gap: 10px; }
          .eg-wordmark { font-size: 20px; letter-spacing: 0.18em; padding-left: 0.18em; }
          .eg-wordmark-rule { display: none; }
          .eg-header-side--right { justify-content: flex-end; gap: 0; }
          .eg-header-links { gap: 12px; }
          .eg-header-links .eg-link { font-size: 13px; white-space: nowrap; }
          .eg-hero { padding: 88px 20px 96px; }
          .eg-section { padding: 64px 20px; }
        }
        @media (max-width: 340px) {
          /* Very narrow phones: tighten the wordmark so the absolutely-centred
             mark clears the Sign in / Register links. */
          .eg-wordmark { font-size: 17px; letter-spacing: 0.12em; padding-left: 0.12em; }
        }
      `}</style>
      <header className="eg-header">
        <div className="eg-header-inner">
          <div className="eg-header-side eg-header-side--left" aria-hidden="true">
            <span className="eg-wordmark-rule" />
          </div>
          <span className="eg-wordmark eg-wordmark--spacer" aria-hidden="true">{brandName}</span>
          <div className="eg-header-side eg-header-side--right">
            <span className="eg-wordmark-rule" aria-hidden="true" />
            <nav className="eg-header-links" aria-label="Account">
              <button
                type="button"
                onClick={openLogin}
                className="eg-link"
                data-testid="button-open-login"
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={openLogin}
                disabled={loading}
                className="eg-link"
                data-testid="button-register"
              >
                Register
              </button>
            </nav>
          </div>
          <span className="eg-wordmark eg-wordmark--centered">{brandName}</span>
        </div>
      </header>
      <section
        className="eg-hero"
        data-light-hero="true"
        style={{
          opacity: entered ? 1 : 0,
          transform: entered ? 'none' : 'translateY(16px)',
          transition: 'opacity 0.7s ease, transform 0.7s ease',
        }}
      >
        <h1>The wardrobe advisor who already knows you.</h1>
        <p className="eg-hero-sub">
          Beau is your scout — he knows your proportions, your gaps, your taste, and does the
          searching so you decide with conviction.
        </p>
        <button
          type="button"
          onClick={openLogin}
          disabled={loading}
          className="eg-btn"
          data-testid="button-enter-guest"
        >
          {loading ? 'One moment…' : 'Start building your wardrobe'}
        </button>
      </section>

      <section className="eg-section eg-section--paper">
        <div className="eg-section-inner">
          <h2 className="eg-section-head">Every purchase feels like a gamble.</h2>
          <p className="eg-body">
            Hours of searching. Tab after tab, forum thread after forum thread. And still not
            completely sure when you finally buy. Beau does that searching for you — so confidence
            is earned before money changes hands, not discovered after.
          </p>
        </div>
      </section>

      <section className="eg-section eg-section--page">
        <div className="eg-section-inner">
          <h2 className="eg-section-head">Your wardrobe, built with conviction.</h2>
          <ul className="eg-rows">
            <li>Knows what you own and what’s missing</li>
            <li>Hunts for pieces he can justify</li>
            <li>Gets better the longer you use him</li>
          </ul>
          <p className="eg-section-note">
            Your advisor is Beau — named for George Bryan “Beau” Brummell, the father of modern men’s
            style.
          </p>
        </div>
      </section>

      <section className="eg-section eg-section--paper">
        <div className="eg-section-inner">
          <h2 className="eg-section-head">On the name.</h2>
          <p className="eg-body">
            Ethaion draws from two Greek words: <em>ethos</em> — the animating character of a
            person, the spirit from which everything flows — and <em>aion</em>, enduring time. A
            wardrobe that ages with you.
          </p>
        </div>
      </section>

      <section className="eg-section eg-section--page">
        <div className="eg-section-inner">
          <h2 className="eg-section-head">What we stand for.</h2>
          <p className="eg-body">
            A wardrobe built with conviction. Not chasing trends, not collecting labels — choosing
            pieces that earn their place and stay there.
          </p>
        </div>
      </section>

      <section className="eg-section eg-section--paper">
        <div className="eg-section-inner">
          <h2 className="eg-section-head">The problem.</h2>
          <div className="eg-cards">
            <div className="eg-card">
              <h3 className="eg-card-title">Origin stories</h3>
              <p className="eg-card-body">
                A brand can legally claim a piece was made somewhere when only minor steps in the
                process happened there — while the actual construction took place on the other
                side of the world. That rarely makes it onto the label.
              </p>
            </div>
            <div className="eg-card">
              <h3 className="eg-card-title">What it’s actually made of</h3>
              <p className="eg-card-body">
                More and more garments are primarily polyester — a plastic derived from petroleum.
                It traps heat, holds odour, sheds microplastics with every wash. Wool breathes.
                Linen regulates. Cotton softens with wear. Most brands don’t lead with what
                they’re made of.
              </p>
            </div>
            <div className="eg-card">
              <h3 className="eg-card-title">Quality hides</h3>
              <p className="eg-card-body">
                It reveals itself in wear — six months later, when the money’s already gone and
                the return window isn’t.
              </p>
            </div>
            <div className="eg-card">
              <h3 className="eg-card-title">The search</h3>
              <p className="eg-card-body">
                You lose hours — sometimes days — across tabs, forums, and dead ends, and walk
                away less certain than when you started.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="eg-section eg-section--page">
        <div className="eg-section-inner">
          <h2 className="eg-section-head">What Beau does.</h2>
          <div className="eg-beats">
            <div className="eg-beat">
              <h3 className="eg-beat-title">Beau understands you first.</h3>
              <p className="eg-beat-body">
                Your proportions, your skin tone, your style sensibility, what you already own —
                and what’s genuinely missing from it. He builds a picture before he starts
                looking.
              </p>
            </div>
            <div className="eg-beat">
              <h3 className="eg-beat-title">Then he goes looking.</h3>
              <p className="eg-beat-body">
                Not just through the obvious names. The established houses that actually earn
                their reputation — and the smaller makers that rarely surface unless you know
                exactly where to look. A wool mill that’s been doing the same thing for a
                century. A shoemaker nobody outside the trade has heard of. Wherever the best
                version exists, Beau finds it.
              </p>
            </div>
            <div className="eg-beat">
              <h3 className="eg-beat-title">Every recommendation comes with his reasoning.</h3>
              <p className="eg-beat-body">
                The construction, the material, the fit for your build, why this piece and not
                the twenty others like it. The goal isn’t to help you buy more. It’s to help you
                buy once, with complete confidence — so the only feeling left is the pleasure of
                wearing it for decades.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="eg-section eg-cta-band">
        <div className="eg-section-inner">
          <h2>Ready to start?</h2>
          <button
            type="button"
            onClick={openLogin}
            disabled={loading}
            className="eg-btn"
          >
            Start building your wardrobe
          </button>
          <p className="eg-cta-note">
            Already have an account?{' '}
            <button type="button" onClick={openLogin} className="eg-link">
              Sign in →
            </button>
          </p>
        </div>
      </section>

      <footer className="eg-footer">
        <div className="eg-footer-inner">
          <span className="eg-footer-wordmark">{brandName}</span>
          <nav className="eg-header-links" aria-label="Account">
            <button type="button" onClick={openLogin} className="eg-link">
              Sign in
            </button>
            <button type="button" onClick={openLogin} disabled={loading} className="eg-link">
              Register
            </button>
          </nav>
        </div>
        <p className="eg-footer-copy">© {new Date().getFullYear()} {brandName}.</p>
      </footer>
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
                Welcome back to {brandName}
              </h2>
              <p className="eg-modal-sub mb-5">
                Sign in with the email you saved your profile with — or continue as a guest below.
              </p>
              {renderLoginPanel(true)}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
