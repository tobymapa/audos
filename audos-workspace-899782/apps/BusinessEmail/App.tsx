import { useCallback, useEffect, useMemo, useState } from 'react';
import { Inbox, Loader2, Mail, PenSquare, RefreshCw, Send, ArrowLeft, AlertCircle, Lock, Sparkles, CheckCircle2, Globe, Copy, ShieldCheck, Wallet, Search } from 'lucide-react';

/**
 * Business Email (Mailroom) — the founder's real inbox on their own domain,
 * living in the space next to the other apps.
 *
 * Owner-only by design (plan R17): every API route this app calls requires
 * the signed-in viewer to be the workspace owner. Non-owner visitors get a
 * friendly lock screen instead of data.
 *
 * First run (no inbox yet) lands on the SETUP WIZARD: pick a domain →
 * publish/copy DNS records → verify → choose an address → approve the
 * monthly subscription → inbox live, with a prefilled test email. The
 * conversational path ("ask your agent to set up business email") stays
 * available the whole way — both surfaces drive the same server rails.
 *
 * The concierge tab is the landing view once an inbox exists: the digest
 * the scheduled beat produced (what needs a reply, drafts awaiting
 * approval, FYIs). Sending is two-phase (plan R10): compose creates a
 * draft, then approve + send fire as explicit owner-authed calls — the
 * same draft objects the Mailroom agent proposes via propose_send. The
 * agent can never send; this app is the only dispatch surface.
 *
 * Render safety: digest summaries, triage rationales, subjects, and bodies
 * are derived from external senders — always rendered as plain React text
 * nodes (escaped), never as HTML/markdown.
 */

interface ThreadSummary {
  threadKey: string;
  mailbox: string | null;
  subject: string | null;
  lastFrom: string | null;
  lastAt: string | null;
  messageCount: number;
  lastDirection: 'inbound' | 'outbound' | null;
  inboundCount: number;
  outboundCount: number;
  counterpart: string | null;
  lastSnippet: string | null;
}

interface MailMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  fromEmail: string | null;
  from: string;
  toEmail: string | null;
  subject: string | null;
  bodyPlain: string | null;
  providerMessageId: string | null;
  status: string;
  createdAt: string;
}

interface InboxSummary {
  address: string;
  domain: string;
  displayName: string | null;
}

interface SendDraft {
  id: string;
  status: 'proposed' | 'approved' | 'dispatched' | 'failed' | 'discarded';
  inboxAddress: string;
  toEmail: string;
  subject: string;
  bodyPlain: string;
  inReplyToProviderMessageId: string | null;
  createdAt: string;
}

interface DigestThreadRef {
  threadKey: string;
  classification: 'needs_reply' | 'fyi' | 'ignore';
  subject?: string | null;
  rationale?: string | null;
  draftId?: string | null;
}

interface ConciergeDigest {
  digest: {
    id: string;
    needsReplyCount: number;
    fyiCount: number;
    ignoredCount: number;
    draftsProposedCount: number;
    threadRefs: DigestThreadRef[] | null;
    summaryText: string | null;
    generatedAt: string;
  } | null;
  needsReplyCount: number;
  proposedDraftCount: number;
  lastProcessedAt: string | null;
  cadenceHours: number;
  runs: Array<{ id: string; status: string; startedAt: string; finishedAt: string | null }>;
}

interface DnsRecord {
  type: string;
  name: string;
  value: string;
  priority?: number;
  status?: string;
}

interface SetupStatus {
  domainCandidates: Array<{
    domain: string;
    source: string;
    mailgunInboundConflict: boolean;
  }>;
  needsDomain: boolean;
  domains: Array<{
    domain: string;
    verificationStatus: 'NOT_STARTED' | 'PENDING' | 'VERIFIED' | 'FAILED';
    dnsPath: 'managed' | 'byo' | null;
    records: DnsRecord[] | null;
    awaitingDomainVerification: boolean;
    verifiedAt: string | null;
  }>;
  inboxes: InboxSummary[];
  pricing: {
    monthlyChargeCents: number;
    monthlyListPriceCents: number;
    inboxSeatPriceCents: number;
    walletBalanceCents: number;
    sufficient: boolean;
    shortfallCents: number;
  };
  subscription: {
    entitled: boolean;
    periodEnd: string | null;
  };
  ownerEmail: string | null;
}

class OwnerOnlyError extends Error {
  ownerOnly = true;
}

/** Non-2xx with the server's structured payload preserved (code, shortfall…). */
class ApiError extends Error {
  status: number;
  code: string | null;
  body: any;
  constructor(status: number, body: any) {
    super(body?.message || body?.error || `Request failed (${status})`);
    this.status = status;
    this.code = typeof body?.error === 'string' ? body.error : null;
    this.body = body ?? {};
  }
}

function workspaceRef(): string {
  return (window as any).__WORKSPACE_ID__ || '';
}

/**
 * Founder identity for approval/charge endpoints: the space shell stores the
 * verified founder session under `space_session_{spaceId}` (seeded by the
 * dashboard preview-session or the space email gate). Sending its id lets
 * the server attest "the workspace owner clicked this" even though the app
 * cannot carry a platform JWT. Older gate entries stored the id under
 * different keys, so fall back through them.
 */
function spaceSessionId(): string | null {
  try {
    const spaceId = (window as any).__SPACE_ID__ || '';
    if (!spaceId) return null;
    const raw = localStorage.getItem(`space_session_${spaceId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const id = parsed?.workspaceSessionId || parsed?.id || parsed?.sessionId;
    return typeof id === 'string' && id ? id : null;
  } catch {
    return null;
  }
}

async function api(path: string, init?: RequestInit) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const sessionId = spaceSessionId();
  if (sessionId) headers['X-Space-Session-Id'] = sessionId;
  const res = await fetch(`/api/workspaces/${workspaceRef()}/mailroom${path}`, {
    credentials: 'include',
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
  });
  if (res.status === 401 || res.status === 403) {
    // Only a bare auth rejection means "you are not the owner". Structured
    // 403s (e.g. approval_requires_identity) must surface their real message
    // instead of locking the whole app behind the owner screen.
    const body = await res.clone().json().catch(() => ({} as any));
    const code = typeof body?.error === 'string' ? body.error : null;
    if (!code || code === 'owner_only' || code === 'forbidden' || code === 'unauthorized') {
      throw new OwnerOnlyError('Business email is only visible to the workspace owner.');
    }
    throw new ApiError(res.status, body);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({} as any));
    throw new ApiError(res.status, body);
  }
  return res.json();
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Gmail-style timestamps: time today, "Jul 16" this year, full date otherwise. */
function formatWhen(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "Jane Doe <jane@x.com>" -> "Jane Doe"; bare addresses pass through. */
function displayName(raw: string | null): string {
  if (!raw) return 'Unknown';
  const name = raw.replace(/<[^>]*>/g, '').replace(/"/g, '').trim();
  return name || raw.replace(/^.*</, '').replace(/>.*$/, '').trim() || 'Unknown';
}

function initialOf(raw: string | null): string {
  const name = displayName(raw);
  const ch = name.trim().charAt(0);
  return ch ? ch.toUpperCase() : '?';
}

const emptyCompose = {
  inboxAddress: '',
  to: '',
  subject: '',
  bodyPlain: '',
  inReplyToProviderMessageId: undefined as string | undefined,
};

const AGENT_HINT = 'Prefer to chat? Ask your agent: "set up my business email" — it walks the same steps.';

/**
 * The app's own warm, characterful sans-serif. We load it once from Google
 * Fonts and scope it to this app via an inline fontFamily on each root - we
 * never touch the space theme's --space-font-family, so the rest of the shell
 * stays exactly as it was. Falls back to system sans if the font can't load.
 */
const APP_FONT =
  '"Figtree", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const PRIMARY_BUTTON =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-[#0b57d0] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0842a0] focus:outline-none focus:ring-2 focus:ring-[#c2e7ff] disabled:cursor-not-allowed disabled:opacity-50';
const SECONDARY_BUTTON =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-[#dadce0] bg-white px-4 py-2.5 text-sm font-medium text-[#3c4043] transition hover:bg-[#f8fafd] focus:outline-none focus:ring-2 focus:ring-[#d3e3fd] disabled:cursor-not-allowed disabled:opacity-50';
const FIELD =
  'w-full rounded-lg border border-[#dadce0] bg-white px-3.5 py-2.5 text-sm text-[#202124] outline-none transition placeholder:text-[#9aa0a6] hover:border-[#bdc1c6] focus:border-[#0b57d0] focus:ring-2 focus:ring-[#d3e3fd]';

function useAppFont(): void {
  useEffect(() => {
    const id = 'mailroom-app-font';
    if (typeof document === 'undefined' || document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&display=swap';
    document.head.appendChild(link);
  }, []);
}

/**
 * First-run setup wizard: domain → DNS → verify → address → pay → live.
 * Deterministic and resumable — every screen derives from /setup/status, so
 * a founder can leave mid-setup and pick up where they left off.
 */
function SetupFlow({
  onOpenInbox,
  onSendTest,
}: {
  onOpenInbox: () => void;
  onSendTest: (fromAddress: string, to: string | null) => void;
}) {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [domainInput, setDomainInput] = useState('');
  const [username, setUsername] = useState('hello');
  const [displayName, setDisplayName] = useState('');
  const [proposal, setProposal] = useState<{
    intentId: string;
    amountCents: number;
    description: string;
  } | null>(null);
  const [shortfallCents, setShortfallCents] = useState<number | null>(null);
  const [provisioned, setProvisioned] = useState<{
    address: string;
    imap: string;
    smtp: string;
  } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useAppFont();

  const loadStatus = useCallback(async () => {
    try {
      const res = await api('/setup/status');
      setStatus(res.data ?? null);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to load setup status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // The domain this setup run works on: prefer a verified one, else the
  // most recently registered (status.domains is newest-first).
  const activeDomain = useMemo(() => {
    if (!status) return null;
    return (
      status.domains.find((d) => d.verificationStatus === 'VERIFIED') ??
      status.domains[0] ??
      null
    );
  }, [status]);

  const registerDomain = async (domain: string) => {
    setBusy('register');
    setError(null);
    try {
      await api('/setup/domains', {
        method: 'POST',
        body: JSON.stringify({ domain }),
      });
      await loadStatus();
    } catch (err: any) {
      setError(err?.message || 'Failed to register domain.');
    } finally {
      setBusy(null);
    }
  };

  const checkVerification = async (domain: string) => {
    setBusy('verify');
    setError(null);
    try {
      await api(`/setup/domains/${encodeURIComponent(domain)}/verify`, {
        method: 'POST',
        body: '{}',
      });
      await loadStatus();
    } catch (err: any) {
      setError(err?.message || 'Verification check failed.');
    } finally {
      setBusy(null);
    }
  };

  const proposeInbox = async (domain: string) => {
    setBusy('propose');
    setError(null);
    setShortfallCents(null);
    try {
      const res = await api('/setup/inboxes/propose', {
        method: 'POST',
        body: JSON.stringify({
          username,
          domain,
          ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
        }),
      });
      if (res.data?.alreadyProvisioned) {
        setProvisioned({
          address: res.data.inbox.address,
          imap: 'imap.agentmail.to:993',
          smtp: 'smtp.agentmail.to:465',
        });
        return;
      }
      // Already on an active monthly subscription — provision without a card.
      if (res.data?.alreadyEntitled) {
        await executeInbox(domain, null);
        return;
      }
      setProposal({
        intentId: res.data.intentId,
        amountCents: res.data.amountCents,
        description:
          res.data.confirmationCard?.description ||
          'Mailroom monthly subscription',
      });
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 402) {
        setShortfallCents(
          typeof err.body?.insufficientFunds?.shortfallCents === 'number'
            ? err.body.insufficientFunds.shortfallCents
            : null,
        );
        setError(err.message);
      } else {
        setError(err?.message || 'Could not prepare the subscription.');
      }
    } finally {
      setBusy(null);
    }
  };

  const executeInbox = async (
    domain: string,
    spendIntentId: string | null = proposal?.intentId ?? null,
  ) => {
    setBusy('execute');
    setError(null);
    try {
      const res = await api('/setup/inboxes/execute', {
        method: 'POST',
        body: JSON.stringify({
          username,
          domain,
          ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
          ...(spendIntentId ? { spendIntentId } : {}),
        }),
      });
      setProvisioned({
        address: res.data.address,
        imap: res.data.imap || 'imap.agentmail.to:993',
        smtp: res.data.smtp || 'smtp.agentmail.to:465',
      });
      setProposal(null);
    } catch (err: any) {
      // Stale/expired approval: drop the card so the founder re-proposes.
      if (err instanceof ApiError && err.status === 409) {
        setProposal(null);
        setError('That approval expired — review the subscription again to continue.');
      } else if (err instanceof ApiError && err.status === 402) {
        setProposal(null);
        setShortfallCents(
          typeof err.body?.insufficientFunds?.shortfallCents === 'number'
            ? err.body.insufficientFunds.shortfallCents
            : null,
        );
        setError(err.message);
      } else {
        setError(err?.message || 'Provisioning failed. You were not charged.');
      }
    } finally {
      setBusy(null);
    }
  };

  const copyRecord = async (record: DnsRecord) => {
    try {
      await navigator.clipboard.writeText(record.value);
      setCopied(`${record.type}:${record.name}`);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard unavailable — founder can select the text manually.
    }
  };

  const setupStage =
    provisioned || (status?.inboxes.length ?? 0) > 0
      ? 4
      : activeDomain?.verificationStatus === 'VERIFIED'
        ? 3
        : activeDomain
          ? 2
          : 1;
  const setupSteps = [
    { number: 1, label: 'Choose domain' },
    { number: 2, label: 'Verify DNS' },
    { number: 3, label: 'Create inbox' },
    { number: 4, label: 'Ready' },
  ];

  const stepShell = (children: any) => (
    <div
      className="h-full overflow-y-auto bg-[#f7f8fa] p-4 text-[#202124] sm:p-6 lg:p-10"
      style={{ fontFamily: APP_FONT }}
    >
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-5 flex items-center gap-3 px-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0b57d0] text-white shadow-sm">
            <Mail className="h-[18px] w-[18px]" />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-[-0.01em] text-[#202124]">Mailroom</p>
            <p className="text-xs text-[#80868b]">Business Email</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[#e0e3e7] bg-white shadow-[0_1px_2px_rgba(60,64,67,0.08),0_8px_24px_rgba(60,64,67,0.06)]">
          <div className="grid md:grid-cols-[220px_minmax(0,1fr)]">
            <aside className="border-b border-[#e0e3e7] bg-[#f8fafd] p-5 md:min-h-[480px] md:border-b-0 md:border-r md:p-6">
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.12em] text-[#80868b]">
                Setup
              </p>
              <ol className="grid grid-cols-4 gap-2 md:grid-cols-1 md:gap-1">
                {setupSteps.map((step) => {
                  const complete = setupStage > step.number;
                  const active = setupStage === step.number;
                  return (
                    <li
                      key={step.number}
                      className={`flex min-w-0 items-center gap-3 rounded-lg px-2 py-2 ${
                        active ? 'bg-[#e8f0fe]' : ''
                      }`}
                    >
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                          complete
                            ? 'bg-[#188038] text-white'
                            : active
                              ? 'bg-[#0b57d0] text-white'
                              : 'border border-[#dadce0] bg-white text-[#80868b]'
                        }`}
                      >
                        {complete ? <CheckCircle2 className="h-3.5 w-3.5" /> : step.number}
                      </span>
                      <span
                        className={`hidden truncate text-sm md:block ${
                          active ? 'font-semibold text-[#174ea6]' : 'text-[#5f6368]'
                        }`}
                      >
                        {step.label}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </aside>

            <main className="flex min-h-[420px] flex-col p-6 sm:p-8 lg:p-10">
              <div className="mb-7">
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#0b57d0]">
                  Step {setupStage} of 4
                </p>
                <h2 className="text-2xl font-semibold tracking-[-0.025em] text-[#202124]">
                  Set up your business email
                </h2>
                <p className="mt-2 max-w-lg text-sm leading-6 text-[#5f6368]">
                  Create a professional inbox on your domain. Mailroom will organize incoming
                  messages and prepare replies for your approval.
                </p>
              </div>

              {error && (
                <div className="mb-5 flex items-start gap-2 rounded-xl border border-[#f4c7c3] bg-[#fce8e6] px-3.5 py-3 text-sm text-[#b3261e]">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              <div className="flex-1">{children}</div>

              <div className="mt-8 flex items-start gap-2 rounded-xl bg-[#f8fafd] px-3.5 py-3 text-xs leading-5 text-[#5f6368]">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0b57d0]" />
                <p>{AGENT_HINT}</p>
              </div>
            </main>
          </div>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-[#f7f8fa]">
        <Loader2 className="h-6 w-6 animate-spin text-[#0b57d0]" />
      </div>
    );
  }

  // ── Success ────────────────────────────────────────────────────────────
  if (provisioned) {
    return stepShell(
      <div className="space-y-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#e6f4ea] text-[#137333]">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <div>
          <h3 className="text-xl font-semibold tracking-[-0.02em] text-[#202124]">
            Your inbox is ready
          </h3>
          <p className="mt-1 text-sm font-medium text-[#0b57d0]">{provisioned.address}</p>
          <p className="mt-3 max-w-lg text-sm leading-6 text-[#5f6368]">
            You can send and receive now. Mailroom checks incoming messages every day and
            prepares drafts for you to review.
          </p>
        </div>
        <div className="rounded-xl border border-[#e0e3e7] bg-[#f8fafd] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#80868b]">
            Connect another mail app
          </p>
          <div className="mt-2 grid gap-1 text-xs text-[#5f6368] sm:grid-cols-2">
            <p>IMAP · {provisioned.imap}</p>
            <p>SMTP · {provisioned.smtp}</p>
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <button
            className={SECONDARY_BUTTON}
            onClick={() => onSendTest(provisioned.address, status?.ownerEmail ?? null)}
          >
            <Send className="h-4 w-4" /> Send a test email
          </button>
          <button
            className={PRIMARY_BUTTON}
            onClick={onOpenInbox}
          >
            Go to my inbox
          </button>
        </div>
      </div>,
    );
  }

  if (!status) {
    return stepShell(
      <button
        className={PRIMARY_BUTTON}
        onClick={() => {
          setLoading(true);
          loadStatus();
        }}
      >
        <RefreshCw className="h-4 w-4" /> Retry
      </button>,
    );
  }

  // ── Step: address + pay (domain verified) ──────────────────────────────
  if (activeDomain && activeDomain.verificationStatus === 'VERIFIED') {
    const price = formatCents(
      status.pricing.monthlyChargeCents ?? status.pricing.inboxSeatPriceCents,
    );
    const listPrice = formatCents(
      status.pricing.monthlyListPriceCents ??
        status.pricing.monthlyChargeCents ??
        status.pricing.inboxSeatPriceCents,
    );
    const alreadySubscribed = status.subscription?.entitled === true;
    return stepShell(
      <div className="space-y-6">
        <div className="flex items-center gap-3 rounded-xl border border-[#ceead6] bg-[#e6f4ea] px-4 py-3 text-sm text-[#137333]">
          <ShieldCheck className="h-5 w-5 shrink-0" />
          <span className="font-medium">{activeDomain.domain} is verified</span>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-[#3c4043]">Email address</label>
          <div className="flex overflow-hidden rounded-lg border border-[#dadce0] bg-white transition focus-within:border-[#0b57d0] focus-within:ring-2 focus-within:ring-[#d3e3fd]">
            <input
              className="min-w-0 flex-1 border-0 bg-transparent px-3.5 py-2.5 text-sm text-[#202124] outline-none placeholder:text-[#9aa0a6]"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              placeholder="hello"
            />
            <span className="flex items-center border-l border-[#e0e3e7] bg-[#f8fafd] px-3 text-sm text-[#5f6368]">
              @{activeDomain.domain}
            </span>
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-semibold text-[#3c4043]">
            Sender name <span className="font-normal text-[#80868b]">(optional)</span>
          </label>
          <input
            className={FIELD}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your business name"
          />
        </div>

        {shortfallCents != null && (
          <p className="rounded-xl border border-[#fdd663] bg-[#fef7e0] px-4 py-3 text-sm leading-6 text-[#7a4f01]">
            Your wallet needs {formatCents(shortfallCents)} more to cover the
            monthly Mailroom subscription ({listPrice}/mo list; charge {price}).
            Add funds from the Wallet app, then try again.
          </p>
        )}

        {proposal ? (
          <div className="space-y-4 rounded-xl border border-[#aecbfa] bg-[#f8fbff] p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#d3e3fd] text-[#0b57d0]">
                <Wallet className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#202124]">{proposal.description}</p>
                <p className="mt-1 text-sm leading-5 text-[#5f6368]">
                  Monthly Mailroom subscription of {formatCents(proposal.amountCents)} from your
                  workspace wallet. Nothing auto-renews — you re-approve when the period ends.
                </p>
              </div>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <button
                className={PRIMARY_BUTTON}
                disabled={!!busy}
                onClick={() => executeInbox(activeDomain.domain, proposal.intentId)}
              >
                {busy === 'execute' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Approve & create ({formatCents(proposal.amountCents)})
              </button>
              <button
                className={SECONDARY_BUTTON}
                disabled={!!busy}
                onClick={() => setProposal(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            className={PRIMARY_BUTTON}
            disabled={!!busy || !username.trim()}
            onClick={() => proposeInbox(activeDomain.domain)}
          >
            {busy === 'propose' || busy === 'execute' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            {alreadySubscribed
              ? `Continue — create ${username.trim() || 'hello'}@${activeDomain.domain}`
              : `Continue — create ${username.trim() || 'hello'}@${activeDomain.domain} (${price}/mo)`}
          </button>
        )}
      </div>,
    );
  }

  // ── Step: DNS + verification (domain registered, not verified) ─────────
  if (activeDomain) {
    const records = activeDomain.records ?? [];
    const managed = activeDomain.dnsPath === 'managed';
    return stepShell(
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-xl border border-[#fdd663] bg-[#fef7e0] px-4 py-3">
          <Globe className="mt-0.5 h-5 w-5 shrink-0 text-[#b06000]" />
          <div>
            <p className="text-sm font-semibold text-[#3c4043]">{activeDomain.domain}</p>
            <p className="mt-0.5 text-sm text-[#7a4f01]">
              {activeDomain.verificationStatus === 'FAILED'
                ? 'Verification failed. Check the records below and try again.'
                : 'Waiting for DNS verification'}
            </p>
          </div>
        </div>
        {managed ? (
          <p className="text-sm leading-6 text-[#5f6368]">
            Your domain is managed by Audos, so the email DNS records were
            published automatically. Verification usually completes within a
            few minutes.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm leading-6 text-[#5f6368]">
              Add these records at your DNS provider, then check verification.
            </p>
            <ul className="divide-y divide-[#e0e3e7] overflow-hidden rounded-xl border border-[#e0e3e7]">
              {records.map((r) => (
                <li
                  key={`${r.type}:${r.name}`}
                  className="bg-white p-3.5 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-md bg-[#e8f0fe] px-2 py-1 font-semibold text-[#174ea6]">
                      {r.type}
                      {r.priority != null ? ` (priority ${r.priority})` : ''}
                    </span>
                    <button
                      className="flex items-center gap-1 rounded-md px-2 py-1.5 font-medium text-[#0b57d0] transition hover:bg-[#e8f0fe]"
                      onClick={() => copyRecord(r)}
                    >
                      <Copy className="h-3 w-3" />
                      {copied === `${r.type}:${r.name}` ? 'Copied' : 'Copy value'}
                    </button>
                  </div>
                  <dl className="mt-2 grid gap-1 text-[#5f6368]">
                    <div className="grid grid-cols-[48px_1fr] gap-2">
                      <dt className="font-medium text-[#80868b]">Host</dt>
                      <dd className="break-all font-mono">{r.name}</dd>
                    </div>
                    <div className="grid grid-cols-[48px_1fr] gap-2">
                      <dt className="font-medium text-[#80868b]">Value</dt>
                      <dd className="break-all font-mono">{r.value}</dd>
                    </div>
                  </dl>
                </li>
              ))}
              {records.length === 0 && (
                <li className="bg-white p-4 text-sm text-[#5f6368]">
                  Records unavailable — re-register the domain or ask your agent.
                </li>
              )}
            </ul>
          </div>
        )}
        <button
          className={PRIMARY_BUTTON}
          disabled={!!busy}
          onClick={() => checkVerification(activeDomain.domain)}
        >
          {busy === 'verify' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Check verification
        </button>
      </div>,
    );
  }

  // ── Step: no domain at all — the get-a-domain gate ──────────────────────
  if (status.needsDomain) {
    return stepShell(
      <div className="rounded-xl border border-[#e0e3e7] bg-[#f8fafd] p-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#e8f0fe] text-[#0b57d0]">
          <Globe className="h-5 w-5" />
        </div>
        <h3 className="mt-4 text-base font-semibold text-[#202124]">Start with your domain</h3>
        <p className="mt-2 max-w-lg text-sm leading-6 text-[#5f6368]">
          Business email lives on your own domain. Ask your agent “help me get a domain” and
          it will walk you through buying or connecting one. Come back here when it is ready.
        </p>
      </div>,
    );
  }

  // ── Step: pick / enter the domain ───────────────────────────────────────
  return stepShell(
    <div className="space-y-5">
      <p className="text-sm font-semibold text-[#3c4043]">
        Which domain should your business email live on?
      </p>
      <ul className="space-y-2.5">
        {status.domainCandidates.map((c) => (
          <li key={c.domain}>
            <button
              className="group w-full rounded-xl border border-[#dadce0] bg-white px-4 py-3 text-left text-sm transition hover:border-[#aecbfa] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!!busy || c.mailgunInboundConflict}
              onClick={() => registerDomain(c.domain)}
            >
              <span className="flex items-center gap-2 font-semibold text-[#202124]">
                <Globe className="h-4 w-4 text-[#80868b] transition group-hover:text-[#0b57d0]" />
                {c.domain}
              </span>
              {c.mailgunInboundConflict && (
                <span className="mt-2 block pl-6 text-xs leading-5 text-[#b06000]">
                  This domain already receives mail through your existing Audos
                  email setup — tear that down first, or use a subdomain like
                  mail.{c.domain}.
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3 py-1 text-xs uppercase tracking-[0.08em] text-[#9aa0a6]">
        <span className="h-px flex-1 bg-[#e0e3e7]" />
        Or use another domain
        <span className="h-px flex-1 bg-[#e0e3e7]" />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className={`${FIELD} flex-1`}
          placeholder="yourbrand.com"
          value={domainInput}
          onChange={(e) => setDomainInput(e.target.value)}
        />
        <button
          className={PRIMARY_BUTTON}
          disabled={!!busy || domainInput.trim().length < 3}
          onClick={() => registerDomain(domainInput.trim().toLowerCase())}
        >
          {busy === 'register' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Globe className="h-4 w-4" />
          )}
          Use this domain
        </button>
      </div>
    </div>,
  );
}

/** Circle avatar with the sender's initial — keeps rows scannable. */
function Avatar({ seed, size = 'md' }: { seed: string | null; size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'h-6 w-6 text-xs' : 'h-8 w-8 text-sm';
  return (
    <div
      className={`flex ${cls} shrink-0 items-center justify-center rounded-full bg-[#e8f0fe] font-semibold text-[#185abc]`}
    >
      {initialOf(seed)}
    </div>
  );
}

function FolderButton({
  icon: Icon,
  label,
  active,
  count,
  onClick,
}: {
  icon: typeof Inbox;
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex w-full items-center justify-center gap-3 rounded-full px-3 py-2.5 text-sm transition-colors md:justify-start ${
        active
          ? 'bg-[#d3e3fd] font-semibold text-[#041e49]'
          : 'text-[#3c4043] hover:bg-[#e9eef6]'
      }`}
    >
      <Icon className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-[#0b57d0]' : 'text-[#5f6368]'}`} />
      <span className="hidden flex-1 truncate text-left md:block">{label}</span>
      {typeof count === 'number' && count > 0 && (
        <span
          className={`absolute ml-6 mt-[-18px] min-w-[18px] shrink-0 rounded-full px-1 text-center text-[10px] font-semibold leading-[18px] md:static md:ml-0 md:mt-0 md:px-1.5 md:text-[11px] md:leading-5 ${
            active
              ? 'bg-white text-[#174ea6]'
              : 'bg-[#e8eaed] text-[#5f6368]'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/** One row in the Inbox / Sent lists. Sender medium, subject bold, snippet
 *  muted, an unread dot when the other side spoke last, and a subtle highlight
 *  when it's the open conversation. */
function ThreadRow({
  t,
  mode,
  selected,
  onOpen,
}: {
  t: ThreadSummary;
  mode: 'inbox' | 'sent';
  selected?: boolean;
  onOpen: () => void;
}) {
  const awaiting = mode === 'inbox' && t.lastDirection === 'inbound';
  const party = mode === 'sent' ? (t.counterpart ?? t.lastFrom) : (t.lastFrom ?? t.counterpart);
  const who = mode === 'sent' ? `To: ${displayName(party)}` : displayName(party);
  return (
    <button
      onClick={onOpen}
      className={`group relative flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors ${
        selected
          ? 'bg-[#e8f0fe] ring-1 ring-inset ring-[#d3e3fd]'
          : awaiting
            ? 'bg-[#fbfdff] hover:bg-[#f2f6fc]'
            : 'hover:bg-[#f8fafd]'
      }`}
    >
      {awaiting && (
        <span
          className="absolute left-1 top-[18px] h-2 w-2 rounded-full bg-[#0b57d0]"
          title="Unread"
        />
      )}
      <Avatar seed={party} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={`truncate text-sm font-medium ${
              awaiting ? 'font-semibold text-[#202124]' : 'text-[#5f6368]'
            }`}
          >
            {who}
          </span>
          <span className={`shrink-0 text-xs ${awaiting ? 'font-medium text-[#0b57d0]' : 'text-[#80868b]'}`}>
            {formatWhen(t.lastAt)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`truncate text-sm ${
              awaiting ? 'font-semibold text-[#202124]' : 'font-medium text-[#5f6368]'
            }`}
          >
            {t.subject ?? '(no subject)'}
          </span>
          {t.messageCount > 1 && (
            <span className="shrink-0 rounded-full bg-[#e8eaed] px-1.5 text-[11px] text-[#5f6368]">
              {t.messageCount}
            </span>
          )}
        </div>
        {/* Snippet is untrusted sender content - plain text node only. */}
        {t.lastSnippet && (
          <p className="mt-0.5 truncate text-xs leading-5 text-[#80868b]">{t.lastSnippet}</p>
        )}
      </div>
    </button>
  );
}

function EmptyState({
  icon: Icon,
  title,
  detail,
}: {
  icon: typeof Inbox;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-[#f1f3f4]">
        <Icon className="h-5 w-5 text-[#80868b]" />
      </div>
      <p className="text-sm font-semibold text-[#202124]">{title}</p>
      <p className="max-w-xs text-xs leading-5 text-[#80868b]">{detail}</p>
    </div>
  );
}

type Folder = 'inbox' | 'sent' | 'drafts' | 'assistant';

export default function BusinessEmail() {
  useAppFont();
  const [folder, setFolder] = useState<Folder>('inbox');
  const [view, setView] = useState<'list' | 'thread' | 'compose' | 'draft'>('list');
  const [inboxes, setInboxes] = useState<InboxSummary[]>([]);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [activeThreadKey, setActiveThreadKey] = useState<string | null>(null);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [ownerOnly, setOwnerOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [compose, setCompose] = useState(emptyCompose);
  const [sendState, setSendState] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [replySending, setReplySending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [concierge, setConcierge] = useState<ConciergeDigest | null>(null);
  const [drafts, setDrafts] = useState<SendDraft[]>([]);
  const [draftEdits, setDraftEdits] = useState<Record<string, { subject: string; bodyPlain: string }>>({});
  const [draftBusy, setDraftBusy] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);

  const defaultInbox = inboxes[0]?.address ?? '';
  /** True when running inside the dashboard's Agents-hub iframe - the only
      place an "ask your agent" postMessage has a parent to land in. */
  const embedded = typeof window !== 'undefined' && window.parent !== window;
  const [agentQuestion, setAgentQuestion] = useState('');
  const [agentAsked, setAgentAsked] = useState(false);

  /** Hand the founder's question to the dashboard, which starts a direct
      conversation with the Mailroom agent and opens it in the Tasks panel
      (this app has no chat of its own - the agent runs platform-side). */
  const askAgent = () => {
    const q = agentQuestion.trim() || 'What needs my attention in my business email inbox?';
    window.parent.postMessage(
      { type: 'audos:chat-with-agent', agentSlug: 'mailroom', prompt: q },
      window.location.origin,
    );
    setAgentQuestion('');
    setAgentAsked(true);
  };

  const refresh = useCallback(async () => {
    if (!workspaceRef()) {
      setError('Workspace not resolved for this space yet - reload the page.');
      setLoading(false);
      return;
    }
    try {
      const [inboxRes, threadRes, digestRes, draftRes] = await Promise.all([
        api('/inboxes'),
        api('/threads'),
        api('/concierge/digest').catch(() => ({ data: null })),
        api('/drafts').catch(() => ({ data: [] })),
      ]);
      setInboxes(inboxRes.data ?? []);
      setThreads(threadRes.data ?? []);
      setConcierge(digestRes.data ?? null);
      setDrafts(((draftRes.data ?? []) as SendDraft[]).filter((d) => d.status === 'proposed'));
      setOwnerOnly(false);
      setError(null);
    } catch (err: any) {
      if (err?.ownerOnly) setOwnerOnly(true);
      else setError(err?.message || 'Failed to load mail.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 60_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const openThread = useCallback(async (threadKey: string) => {
    setActiveThreadKey(threadKey);
    setView('thread');
    setReplyBody('');
    setReplyError(null);
    setThreadLoading(true);
    try {
      const res = await api(`/threads/${encodeURIComponent(threadKey)}`);
      setMessages(res.data ?? []);
    } catch (err: any) {
      if (err?.ownerOnly) setOwnerOnly(true);
      else setError(err?.message || 'Failed to load conversation.');
    } finally {
      setThreadLoading(false);
    }
  }, []);

  const activeThread = useMemo(
    () => threads.find((t) => t.threadKey === activeThreadKey),
    [threads, activeThreadKey],
  );

  const activeDraft = useMemo(
    () => drafts.find((d) => d.id === activeDraftId) ?? null,
    [drafts, activeDraftId],
  );

  const inboxThreads = useMemo(() => threads.filter((t) => t.inboundCount > 0), [threads]);
  const sentThreads = useMemo(() => threads.filter((t) => t.outboundCount > 0), [threads]);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleInboxThreads = useMemo(
    () =>
      inboxThreads.filter((t) =>
        [t.lastFrom, t.counterpart, t.subject, t.lastSnippet]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedQuery)),
      ),
    [inboxThreads, normalizedQuery],
  );
  const visibleSentThreads = useMemo(
    () =>
      sentThreads.filter((t) =>
        [t.lastFrom, t.counterpart, t.subject, t.lastSnippet]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedQuery)),
      ),
    [sentThreads, normalizedQuery],
  );
  const visibleDrafts = useMemo(
    () =>
      drafts.filter((d) =>
        [d.toEmail, d.subject, d.bodyPlain].some((value) =>
          value.toLowerCase().includes(normalizedQuery),
        ),
      ),
    [drafts, normalizedQuery],
  );
  const awaitingCount = useMemo(
    () => inboxThreads.filter((t) => t.lastDirection === 'inbound').length,
    [inboxThreads],
  );

  /** Compose (new mail): draft, approve, dispatch - three phases, one button. */
  const handleSend = async () => {
    setSendError(null);
    try {
      setSendState('Drafting');
      const proposed = await api('/drafts', {
        method: 'POST',
        body: JSON.stringify({
          inboxAddress: compose.inboxAddress || defaultInbox,
          to: compose.to.trim(),
          subject: compose.subject.trim() || '(no subject)',
          bodyPlain: compose.bodyPlain,
          inReplyToProviderMessageId: compose.inReplyToProviderMessageId,
        }),
      });
      setSendState('Approving');
      await api(`/drafts/${proposed.data.id}/approve`, { method: 'POST', body: '{}' });
      setSendState('Sending');
      await api(`/drafts/${proposed.data.id}/send`, { method: 'POST', body: '{}' });
      setCompose(emptyCompose);
      setFolder('sent');
      setQuery('');
      setView('list');
      refresh();
    } catch (err: any) {
      setSendError(err?.message || 'Send failed.');
    } finally {
      setSendState(null);
    }
  };

  /** Inline reply inside a conversation - same three-phase pipeline. */
  const sendReply = async () => {
    if (!activeThread || !replyBody.trim() || replySending) return;
    const lastInbound = [...messages].reverse().find((m) => m.direction === 'inbound');
    const to = lastInbound?.fromEmail ?? activeThread.counterpart ?? '';
    if (!to) {
      setReplyError('No recipient found for this conversation.');
      return;
    }
    setReplyError(null);
    setReplySending(true);
    try {
      const proposed = await api('/drafts', {
        method: 'POST',
        body: JSON.stringify({
          inboxAddress: activeThread.mailbox ?? defaultInbox,
          to,
          subject: activeThread.subject
            ? `Re: ${activeThread.subject.replace(/^Re:\s*/i, '')}`
            : '(no subject)',
          bodyPlain: replyBody,
          inReplyToProviderMessageId: lastInbound?.providerMessageId ?? undefined,
        }),
      });
      await api(`/drafts/${proposed.data.id}/approve`, { method: 'POST', body: '{}' });
      await api(`/drafts/${proposed.data.id}/send`, { method: 'POST', body: '{}' });
      setReplyBody('');
      await openThread(activeThread.threadKey);
      refresh();
    } catch (err: any) {
      setReplyError(err?.message || 'Reply failed.');
    } finally {
      setReplySending(false);
    }
  };

  /** Founder reviews (optionally edits) then approves + dispatches a draft. */
  const approveAndSend = useCallback(
    async (draft: SendDraft) => {
      setDraftError(null);
      setDraftBusy(draft.id);
      try {
        const edits = draftEdits[draft.id];
        if (
          edits &&
          (edits.subject !== draft.subject || edits.bodyPlain !== draft.bodyPlain)
        ) {
          await api(`/drafts/${draft.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ subject: edits.subject, bodyPlain: edits.bodyPlain }),
          });
        }
        await api(`/drafts/${draft.id}/approve`, { method: 'POST', body: '{}' });
        await api(`/drafts/${draft.id}/send`, { method: 'POST', body: '{}' });
        setDraftEdits((prev) => {
          const next = { ...prev };
          delete next[draft.id];
          return next;
        });
        await refresh();
      } catch (err: any) {
        setDraftError(err?.message || 'Approve & send failed.');
      } finally {
        setDraftBusy(null);
      }
    },
    [draftEdits, refresh],
  );

  if (ownerOnly) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center bg-[#f7f8fa] p-8 text-center"
        style={{ fontFamily: APP_FONT }}
      >
        <div className="flex max-w-sm flex-col items-center rounded-2xl border border-[#e0e3e7] bg-white p-8 shadow-[0_8px_24px_rgba(60,64,67,0.06)]">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#e8f0fe]">
            <Lock className="h-5 w-5 text-[#0b57d0]" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-[#202124]">Owner only</h3>
          <p className="mt-2 text-sm leading-6 text-[#5f6368]">
            Business email is private to the workspace owner. Sign in with the owner
            account to read and send mail.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-[#f7f8fa]">
        <Loader2 className="h-6 w-6 animate-spin text-[#0b57d0]" />
      </div>
    );
  }

  if (inboxes.length === 0) {
    // First run: the in-app setup wizard (domain -> DNS -> verify -> pay ->
    // live). Both wizard exits re-fetch inboxes so the main UI takes over.
    return (
      <SetupFlow
        onOpenInbox={() => {
          setFolder('inbox');
          setView('list');
          refresh();
        }}
        onSendTest={(fromAddress, to) => {
          setCompose({
            inboxAddress: fromAddress,
            to: to ?? '',
            subject: 'Testing my new business email',
            bodyPlain: `Hi - this is a test from my new business address ${fromAddress}. It works!`,
            inReplyToProviderMessageId: undefined,
          });
          setView('compose');
          refresh();
        }}
      />
    );
  }

  const digest = concierge?.digest ?? null;
  const needsReplyRefs = (digest?.threadRefs ?? []).filter(
    (r) => r.classification === 'needs_reply',
  );
  const readingOpen = view !== 'list';

  const folderTitle: Record<Folder, string> = {
    inbox: 'Inbox',
    sent: 'Sent',
    drafts: 'Drafts',
    assistant: 'Assistant',
  };

  const openFolder = (f: Folder) => {
    setFolder(f);
    setQuery('');
    setView('list');
    setActiveThreadKey(null);
    setActiveDraftId(null);
  };

  const openDraft = (id: string) => {
    setActiveDraftId(id);
    setDraftError(null);
    setView('draft');
  };

  const lastInboundMsg = [...messages].reverse().find((m) => m.direction === 'inbound');
  const replyTo = lastInboundMsg?.fromEmail ?? activeThread?.counterpart ?? '';

  return (
    <div
      className="flex h-full min-h-0 w-full overflow-hidden bg-[#f7f8fa] text-[#202124]"
      style={{ fontFamily: APP_FONT }}
    >
      {/* ── Column 1: folder rail ───────────────────────────────────── */}
      <aside className="flex w-[72px] shrink-0 flex-col gap-1 border-r border-[#e0e3e7] bg-[#f7f8fa] px-2 py-3 md:w-60 md:px-3">
        <div className="mb-4 flex items-center justify-center gap-3 px-2 md:justify-start">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0b57d0] text-white shadow-sm">
            <Mail className="h-[18px] w-[18px]" />
          </div>
          <div className="hidden min-w-0 md:block">
            <p className="truncate text-sm font-semibold tracking-[-0.01em] text-[#202124]">
              Mailroom
            </p>
            <p className="truncate text-[11px] text-[#80868b]">Business Email</p>
          </div>
        </div>

        <button
          className="mb-4 flex h-12 w-full items-center justify-center gap-3 rounded-2xl bg-[#c2e7ff] px-3 text-sm font-semibold text-[#001d35] shadow-[0_1px_2px_rgba(60,64,67,0.15)] transition hover:bg-[#b3deff] hover:shadow-[0_2px_6px_rgba(60,64,67,0.18)] md:justify-start md:px-4"
          onClick={() => {
            setCompose({ ...emptyCompose, inboxAddress: defaultInbox });
            setSendError(null);
            setActiveThreadKey(null);
            setActiveDraftId(null);
            setView('compose');
          }}
        >
          <PenSquare className="h-[18px] w-[18px] shrink-0" />
          <span className="hidden md:inline">Compose</span>
        </button>
        <FolderButton
          icon={Inbox}
          label="Inbox"
          active={folder === 'inbox' && view !== 'compose'}
          count={awaitingCount}
          onClick={() => openFolder('inbox')}
        />
        <FolderButton
          icon={Send}
          label="Sent"
          active={folder === 'sent' && view !== 'compose'}
          onClick={() => openFolder('sent')}
        />
        <FolderButton
          icon={Mail}
          label="Drafts"
          active={folder === 'drafts' && view !== 'compose'}
          count={drafts.length}
          onClick={() => openFolder('drafts')}
        />
        <FolderButton
          icon={Sparkles}
          label="Assistant"
          active={folder === 'assistant' && view !== 'compose'}
          count={concierge?.needsReplyCount ?? 0}
          onClick={() => openFolder('assistant')}
        />

        {/* Account chip - the connected address, calm and un-highlighted. */}
        <div className="mt-auto flex items-center justify-center gap-2 rounded-xl border border-transparent px-2 py-2 transition hover:border-[#e0e3e7] hover:bg-white md:justify-start md:px-2.5">
          <Avatar seed={defaultInbox} size="sm" />
          <div className="hidden min-w-0 flex-1 md:block">
            <p
              className="truncate text-xs font-medium text-[#3c4043]"
              title={defaultInbox}
            >
              {defaultInbox}
            </p>
            <p className="text-[11px] text-[#80868b]">Connected</p>
          </div>
        </div>
      </aside>

      {/* ── Column 2: message list ──────────────────────────────────── */}
      <section
        className={`min-h-0 min-w-0 flex-1 flex-col border-r border-[#e0e3e7] bg-white lg:flex lg:w-[380px] lg:flex-none ${
          readingOpen ? 'hidden lg:flex' : 'flex'
        }`}
      >
        <header className="border-b border-[#e0e3e7] bg-white px-4 pb-3 pt-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-[#202124]">
                {folderTitle[folder]}
              </h2>
              {folder === 'inbox' && awaitingCount > 0 && (
                <span className="rounded-full bg-[#e8f0fe] px-2 py-0.5 text-xs font-semibold text-[#174ea6]">
                  {awaitingCount}
                </span>
              )}
            </div>
            <button
              className="shrink-0 rounded-full p-2 text-[#5f6368] transition-colors hover:bg-[#f1f3f4]"
              onClick={refresh}
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          {folder !== 'assistant' && (
            <label className="flex items-center gap-2 rounded-xl bg-[#f1f3f4] px-3 py-2.5 transition focus-within:bg-white focus-within:ring-2 focus-within:ring-[#d3e3fd]">
              <Search className="h-4 w-4 shrink-0 text-[#5f6368]" />
              <input
                className="min-w-0 flex-1 border-0 bg-transparent text-sm text-[#202124] outline-none placeholder:text-[#80868b]"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${folderTitle[folder].toLowerCase()}`}
              />
            </label>
          )}
        </header>

        {error && (
          <p className="border-b border-[#f4c7c3] bg-[#fce8e6] px-4 py-2.5 text-sm text-[#b3261e]">
            {error}
          </p>
        )}

        {/* Inbox / Sent thread lists - stay visible beside the reading pane. */}
        {(folder === 'inbox' || folder === 'sent') && (
          <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
            {(folder === 'inbox' ? visibleInboxThreads : visibleSentThreads).length === 0 ? (
              query ? (
                <EmptyState
                  icon={Search}
                  title="No messages found"
                  detail={`Try a different search for “${query}”.`}
                />
              ) : folder === 'inbox' ? (
                <EmptyState
                  icon={Inbox}
                  title="Your inbox is clear"
                  detail={`Mail sent to ${inboxes.map((i) => i.address).join(', ')} will land here.`}
                />
              ) : (
                <EmptyState
                  icon={Send}
                  title="Nothing sent yet"
                  detail="Emails you send show up here, newest first."
                />
              )
            ) : (
              <div className="flex flex-col gap-1">
                {(folder === 'inbox' ? visibleInboxThreads : visibleSentThreads).map((t) => (
                  <ThreadRow
                    key={t.threadKey}
                    t={t}
                    mode={folder === 'inbox' ? 'inbox' : 'sent'}
                    selected={view === 'thread' && t.threadKey === activeThreadKey}
                    onOpen={() => openThread(t.threadKey)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Drafts list - editing opens in the reading pane. */}
        {folder === 'drafts' && (
          <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
            {visibleDrafts.length === 0 ? (
              <EmptyState
                icon={query ? Search : Mail}
                title={query ? 'No drafts found' : 'No drafts waiting'}
                detail={
                  query
                    ? `Try a different search for “${query}”.`
                    : 'When your assistant proposes a reply, it appears here for your approval before anything is sent.'
                }
              />
            ) : (
              <div className="flex flex-col gap-1">
                {visibleDrafts.map((d) => {
                  const selected = view === 'draft' && d.id === activeDraftId;
                  return (
                    <button
                      key={d.id}
                      onClick={() => openDraft(d.id)}
                      className={`flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors ${
                        selected
                          ? 'bg-[#e8f0fe] ring-1 ring-inset ring-[#d3e3fd]'
                          : 'hover:bg-[#f8fafd]'
                      }`}
                    >
                      <Avatar seed={d.toEmail} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[#5f6368]">
                          To: {displayName(d.toEmail)}
                        </p>
                        <p className="truncate text-sm font-semibold text-[#202124]">
                          {d.subject || '(no subject)'}
                        </p>
                        {/* Draft body is agent-authored - plain text node only. */}
                        {d.bodyPlain && (
                          <p className="mt-0.5 truncate text-xs leading-5 text-[#80868b]">
                            {d.bodyPlain}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Assistant panel */}
        {folder === 'assistant' && (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
            <div className="rounded-2xl bg-[#e8f0fe] p-4">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-[#0b57d0] shadow-sm">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#041e49]">Mailroom assistant</p>
                  <p className="text-[11px] text-[#5f6368]">
                    {concierge?.lastProcessedAt
                      ? `Last checked ${formatWhen(concierge.lastProcessedAt)}`
                      : 'Daily inbox concierge'}
                  </p>
                </div>
              </div>

              {/* summaryText is agent prose derived from untrusted inbound mail -
                  rendered strictly as an escaped React text node. */}
              {digest?.summaryText ? (
                <p className="whitespace-pre-wrap text-sm leading-6 text-[#202124]">
                  {digest.summaryText}
                </p>
              ) : (
                <p className="text-sm leading-6 text-[#5f6368]">
                  {concierge
                    ? 'Your concierge checks this inbox every day, flags mail that needs a reply, and prepares drafts for your approval.'
                    : 'Concierge status is temporarily unavailable.'}
                </p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-[#e0e3e7] bg-white p-3">
                <p className="text-lg font-semibold text-[#202124]">
                  {concierge?.needsReplyCount ?? 0}
                </p>
                <p className="mt-0.5 text-[11px] text-[#80868b]">Need reply</p>
              </div>
              <button
                className="rounded-xl border border-[#e0e3e7] bg-white p-3 text-left transition hover:border-[#aecbfa] hover:bg-[#f8fbff]"
                onClick={() => openFolder('drafts')}
              >
                <p className="text-lg font-semibold text-[#0b57d0]">{drafts.length}</p>
                <p className="mt-0.5 text-[11px] text-[#80868b]">Drafts</p>
              </button>
              <div className="rounded-xl border border-[#e0e3e7] bg-white p-3">
                <p className="text-lg font-semibold text-[#202124]">{digest?.fyiCount ?? 0}</p>
                <p className="mt-0.5 text-[11px] text-[#80868b]">FYI</p>
              </div>
            </div>

            {/* Ask the Mailroom agent directly. The conversation runs in the
                dashboard's Tasks panel, so we postMessage the question up to
                the parent, which starts the run and opens that conversation. */}
            {embedded ? (
              <div className="space-y-2 rounded-xl border border-[#e0e3e7] bg-white p-3">
                <p className="text-xs font-semibold text-[#3c4043]">Ask Mailroom</p>
                <div className="flex gap-2">
                  <input
                    className={`${FIELD} min-w-0 flex-1 py-2`}
                    placeholder="What needs my attention?"
                    value={agentQuestion}
                    onChange={(e) => setAgentQuestion(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') askAgent();
                    }}
                  />
                  <button
                    className="flex shrink-0 items-center justify-center rounded-lg bg-[#0b57d0] px-3 text-white transition hover:bg-[#0842a0]"
                    onClick={askAgent}
                    title="Ask Mailroom"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
                {agentAsked && (
                  <p className="text-xs leading-5 text-[#80868b]">
                    Conversation started in your Tasks panel.
                  </p>
                )}
              </div>
            ) : (
              <p className="rounded-xl bg-[#f8fafd] p-3 text-xs leading-5 text-[#80868b]">
                Open this app from your dashboard’s Agents area to chat with Mailroom.
              </p>
            )}

            {needsReplyRefs.length > 0 && (
              <div className="space-y-2">
                <h4 className="px-1 text-xs font-semibold uppercase tracking-[0.1em] text-[#80868b]">
                  Needs your attention
                </h4>
                <div className="divide-y divide-[#e0e3e7] overflow-hidden rounded-xl border border-[#e0e3e7] bg-white">
                  {needsReplyRefs.map((ref) => (
                    <button
                      key={ref.threadKey}
                      className="flex w-full flex-col gap-1 px-3.5 py-3 text-left transition-colors hover:bg-[#f8fafd]"
                      onClick={() => openThread(ref.threadKey)}
                    >
                      <span className="truncate text-sm font-semibold text-[#202124]">
                        {ref.subject ?? '(no subject)'}
                      </span>
                      {ref.rationale && (
                        <span className="truncate text-xs text-[#80868b]">
                          {ref.rationale}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {drafts.length === 0 && needsReplyRefs.length === 0 && digest && (
              <div className="flex items-center gap-2 rounded-xl border border-[#ceead6] bg-[#e6f4ea] px-3.5 py-3 text-sm text-[#137333]">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Nothing needs your attention right now.
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Column 3: reading pane ──────────────────────────────────── */}
      <section
        className={`min-h-0 min-w-0 flex-1 flex-col bg-[#f8fafd] lg:flex ${
          readingOpen ? 'flex' : 'hidden lg:flex'
        }`}
      >
        {readingOpen && (
          <header className="flex min-h-[65px] items-center gap-3 border-b border-[#e0e3e7] bg-white px-4 py-3 sm:px-5">
            <button
              className="rounded-full p-2 text-[#5f6368] transition-colors hover:bg-[#f1f3f4] lg:hidden"
              onClick={() => {
                setView('list');
                setActiveThreadKey(null);
                setActiveDraftId(null);
              }}
              title="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold tracking-[-0.01em] text-[#202124]">
                {view === 'compose'
                  ? 'New email'
                  : view === 'draft'
                    ? 'Review draft'
                    : (activeThread?.subject ?? 'Conversation')}
              </p>
              {view === 'thread' && activeThread?.counterpart && (
                <p className="mt-0.5 truncate text-xs text-[#80868b]">
                  with {displayName(activeThread.counterpart)}
                </p>
              )}
            </div>
          </header>
        )}

        {/* Calm empty state when nothing is open (desktop only). */}
        {view === 'list' && (
          <div className="hidden flex-1 items-center justify-center p-8 lg:flex">
            <div className="rounded-2xl border border-[#e0e3e7] bg-white shadow-[0_1px_2px_rgba(60,64,67,0.05)]">
              <EmptyState
                icon={folder === 'assistant' ? Sparkles : Mail}
                title="Nothing open"
                detail={
                  folder === 'assistant'
                    ? 'Pick something from your concierge, or open a conversation to read it here.'
                    : 'Select a message to read it here, or compose a new one.'
                }
              />
            </div>
          </div>
        )}

        {/* Conversation */}
        {view === 'thread' && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
              {threadLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-[#0b57d0]" />
                </div>
              ) : (
                <div className="mx-auto max-w-3xl space-y-4">
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={`rounded-xl border p-4 text-sm shadow-[0_1px_2px_rgba(60,64,67,0.04)] sm:p-5 ${
                        m.direction === 'outbound'
                          ? 'border-[#d3e3fd] bg-[#f8fbff]'
                          : 'border-[#e0e3e7] bg-white'
                      }`}
                    >
                      <div className="mb-4 flex items-center gap-2.5">
                        <Avatar
                          size="sm"
                          seed={m.direction === 'outbound' ? defaultInbox : (m.fromEmail ?? m.from)}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[#202124]">
                            {m.direction === 'outbound' ? 'You' : displayName(m.fromEmail ?? m.from)}
                          </p>
                          <p className="truncate text-[11px] text-[#80868b]">
                            {m.direction === 'outbound' ? defaultInbox : (m.fromEmail ?? m.from)}
                          </p>
                        </div>
                        <span className="ml-auto shrink-0 text-xs text-[#80868b]">
                          {formatWhen(m.createdAt)}
                        </span>
                      </div>
                      {/* Inbound bodies are untrusted - plain text nodes only. */}
                      <p className="whitespace-pre-wrap leading-7 text-[#3c4043]">
                        {m.bodyPlain ?? ''}
                      </p>
                      {m.status === 'bounced' && (
                        <p className="mt-2 flex items-center gap-1 text-xs text-[#b3261e]">
                          <AlertCircle className="h-3 w-3" /> Bounced
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="border-t border-[#e0e3e7] bg-white/90 p-3 backdrop-blur sm:p-4">
              <div className="mx-auto max-w-3xl rounded-xl border border-[#dadce0] bg-white p-3 shadow-[0_2px_8px_rgba(60,64,67,0.08)] focus-within:border-[#aecbfa] focus-within:ring-2 focus-within:ring-[#e8f0fe]">
                {replyTo && (
                  <p className="mb-2 text-xs font-medium text-[#5f6368]">
                    Reply to {displayName(replyTo)}
                  </p>
                )}
                <textarea
                  className="w-full resize-none border-0 bg-transparent text-sm leading-6 text-[#202124] placeholder:text-[#9aa0a6] focus:outline-none"
                  rows={3}
                  placeholder="Write a reply..."
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                />
                <div className="mt-2 flex justify-end">
                  <button
                    className={`flex shrink-0 items-center gap-2 rounded-full bg-[#0b57d0] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#0842a0] ${
                      replySending || !replyBody.trim() ? 'cursor-not-allowed opacity-40' : ''
                    }`}
                    disabled={replySending || !replyBody.trim()}
                    onClick={sendReply}
                  >
                    {replySending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Send
                  </button>
                </div>
                {replyError && <p className="mt-1 text-sm text-[#b3261e]">{replyError}</p>}
              </div>
            </div>
          </div>
        )}

        {/* Draft editor */}
        {view === 'draft' &&
          (activeDraft ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
              <div className="mx-auto max-w-3xl rounded-xl border border-[#e0e3e7] bg-white shadow-[0_1px_3px_rgba(60,64,67,0.08)]">
                {draftError && (
                  <p className="border-b border-[#f4c7c3] bg-[#fce8e6] px-5 py-3 text-sm text-[#b3261e]">
                    {draftError}
                  </p>
                )}
                <div className="flex flex-col gap-1 border-b border-[#e0e3e7] px-5 py-4 text-xs text-[#5f6368] sm:flex-row sm:items-center sm:justify-between">
                  <span className="truncate">
                    <span className="text-[#80868b]">To</span> {activeDraft.toEmail}
                  </span>
                  <span className="shrink-0">
                    <span className="text-[#80868b]">From</span> {activeDraft.inboxAddress}
                  </span>
                </div>
                {(() => {
                  const edits = draftEdits[activeDraft.id] ?? {
                    subject: activeDraft.subject,
                    bodyPlain: activeDraft.bodyPlain,
                  };
                  return (
                    <div>
                      <input
                        className="w-full border-0 border-b border-[#e0e3e7] px-5 py-4 text-lg font-semibold text-[#202124] outline-none placeholder:text-[#9aa0a6]"
                        value={edits.subject}
                        placeholder="Subject"
                        onChange={(e) =>
                          setDraftEdits((prev) => ({
                            ...prev,
                            [activeDraft.id]: { ...edits, subject: e.target.value },
                          }))
                        }
                      />
                      <textarea
                        className="min-h-[320px] w-full resize-none border-0 px-5 py-5 text-sm leading-7 text-[#202124] outline-none placeholder:text-[#9aa0a6]"
                        value={edits.bodyPlain}
                        onChange={(e) =>
                          setDraftEdits((prev) => ({
                            ...prev,
                            [activeDraft.id]: { ...edits, bodyPlain: e.target.value },
                          }))
                        }
                      />
                      <div className="flex justify-end border-t border-[#e0e3e7] px-4 py-3">
                        <button
                          className={`flex items-center gap-2 rounded-full bg-[#0b57d0] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0842a0] ${
                            draftBusy ? 'cursor-not-allowed opacity-40' : ''
                          }`}
                          disabled={!!draftBusy}
                          onClick={async () => {
                            await approveAndSend(activeDraft);
                            setView('list');
                            setActiveDraftId(null);
                          }}
                        >
                          {draftBusy === activeDraft.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4" />
                          )}
                          Approve & send
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8">
              <EmptyState
                icon={CheckCircle2}
                title="Draft sent"
                detail="Pick another draft to review, or head back to your inbox."
              />
            </div>
          ))}

        {/* Compose */}
        {view === 'compose' && (
          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="mx-auto max-w-3xl overflow-hidden rounded-xl border border-[#e0e3e7] bg-white shadow-[0_1px_3px_rgba(60,64,67,0.08)]">
              {inboxes.length > 1 ? (
                <select
                  className="w-full border-0 border-b border-[#e0e3e7] bg-white px-5 py-3 text-sm text-[#3c4043] outline-none"
                  value={compose.inboxAddress || defaultInbox}
                  onChange={(e) => setCompose((c) => ({ ...c, inboxAddress: e.target.value }))}
                >
                  {inboxes.map((i) => (
                    <option key={i.address} value={i.address}>
                      From: {i.address}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="border-b border-[#e0e3e7] px-5 py-3 text-sm text-[#5f6368]">
                  <span className="mr-2 text-[#80868b]">From</span>
                  {compose.inboxAddress || defaultInbox}
                </p>
              )}
              <input
                className="w-full border-0 border-b border-[#e0e3e7] px-5 py-3 text-sm text-[#202124] outline-none placeholder:text-[#80868b]"
                placeholder="Recipients"
                value={compose.to}
                onChange={(e) => setCompose((c) => ({ ...c, to: e.target.value }))}
              />
              <input
                className="w-full border-0 border-b border-[#e0e3e7] px-5 py-4 text-lg font-semibold text-[#202124] outline-none placeholder:font-normal placeholder:text-[#9aa0a6]"
                placeholder="Subject"
                value={compose.subject}
                onChange={(e) => setCompose((c) => ({ ...c, subject: e.target.value }))}
              />
              <textarea
                className="min-h-[320px] w-full resize-none border-0 px-5 py-5 text-sm leading-7 text-[#202124] outline-none placeholder:text-[#9aa0a6]"
                placeholder="Write your message..."
                value={compose.bodyPlain}
                onChange={(e) => setCompose((c) => ({ ...c, bodyPlain: e.target.value }))}
              />
              {sendError && (
                <p className="border-t border-[#f4c7c3] bg-[#fce8e6] px-5 py-3 text-sm text-[#b3261e]">
                  {sendError}
                </p>
              )}
              <div className="flex justify-end gap-2 border-t border-[#e0e3e7] px-4 py-3">
                <button
                  className="rounded-full px-4 py-2.5 text-sm font-medium text-[#5f6368] transition-colors hover:bg-[#f1f3f4]"
                  onClick={() => setView('list')}
                >
                  Cancel
                </button>
                <button
                  className={`flex items-center gap-2 rounded-full bg-[#0b57d0] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0842a0] ${
                    sendState || !compose.to || !compose.subject || !compose.bodyPlain
                      ? 'cursor-not-allowed opacity-40'
                      : ''
                  }`}
                  disabled={!!sendState || !compose.to || !compose.subject || !compose.bodyPlain}
                  onClick={handleSend}
                >
                  {sendState ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> {sendState}
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" /> Send
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
