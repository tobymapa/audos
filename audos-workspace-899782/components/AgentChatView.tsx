/**
 * AgentChatView — per-space agent UI.
 *
 * THIS FILE IS THE PER-SPACE AGENT APPEARANCE. Edit it to restyle the agent
 * element (colors, spacing, copy, layout, message bubbles, header card,
 * suggestion chips, empty state, input bar, etc.). Your edits PERSIST across
 * recompiles.
 *
 * The runtime hook `useAgentChatRuntime` and the `AgentChat.tsx` shell are
 * platform-managed and force-overwritten on each compile — do not put any
 * logic / state / fetch / effect work in here. This view is purely
 * presentational; it consumes the runtime and renders.
 */
import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  Bot,
  Send,
  BookOpen,
  Edit3,
  Pencil,
  Save,
  Sparkles,
  Loader2,
  FolderOpen,
  Search,
  ListChecks,
  Paperclip,
  X,
  FileImage,
  File,
  XCircle,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getFriendlyTerm, getToolColor } from '../lib/friendly-terms';
import { tw, beauChatRoom } from '../lib/colors';
import { annotateFabrics } from '../lib/fabrics';
import { LiveTalkButton, VoiceButton } from '../lib/voice';
import type { AgentChatRuntime } from './useAgentChatRuntime';
import BeauScorePanel, { BeauScoreCard } from './BeauScorePanel';
import { BEAU_SCORES_EVENT, deleteBeauScore, loadBeauScores, type BeauScore } from '../apps/BeauHome/beau-score';
import { currentBeauContext } from '../apps/BeauHome/crumb-trail';

interface AgentChatViewProps {
  runtime: AgentChatRuntime;
}

function WorkingIndicator({
  lastAction,
  agentLabel = 'Agent',
  thinkingText,
}: {
  lastAction?: string;
  agentLabel?: string;
  thinkingText?: string | null;
}) {
  const actionIcons: Record<string, any> = {
    read_file: BookOpen,
    write_file: Save,
    edit_file: Edit3,
    write_task_list: ListChecks,
    glob: Search,
    grep: Search,
    ls: FolderOpen,
  };

  const Icon = actionIcons[lastAction || ''] || Loader2;
  const friendlyText = getFriendlyTerm(lastAction || '', 'thinking');
  const color = getToolColor(lastAction || '');

  return (
    <div className="flex items-center justify-center py-2 mr-8">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--space-surface-muted)] rounded-full">
        <Icon className={`h-4 w-4 ${color} animate-spin`} />
        <span className={`text-sm font-medium ${color}`}>
          {thinkingText || `${agentLabel} is ${friendlyText}...`}
        </span>
      </div>
    </div>
  );
}

// react-markdown strips its internal `node` prop from the rest spread when
// destructured, which keeps it from leaking onto DOM elements.
const SAFE_MARKDOWN_PROTOCOLS = /^(subscribe|app|https?|mailto|tel|ircs?|xmpp):/i;

const markdownUrlTransform = (value: string): string => {
  if (typeof value === 'string' && SAFE_MARKDOWN_PROTOCOLS.test(value)) {
    return value;
  }

  const colon = value.indexOf(':');
  const slash = value.indexOf('/');
  const question = value.indexOf('?');
  const hash = value.indexOf('#');

  if (
    colon === -1 ||
    (slash !== -1 && colon > slash) ||
    (question !== -1 && colon > question) ||
    (hash !== -1 && colon > hash)
  ) {
    return value;
  }

  return '';
};

const markdownComponents: Components = {
  // Fabric education layer: fabric terms Beau mentions (cotton oxford,
  // merino wool, linen…) render with a dotted underline and a tap/hover
  // micro-note — what it is, why it's used, when it's appropriate.
  p({ node: _node, children, ...props }) {
    // Size and face come from the message wrapper (Beau speaks in the
    // display serif, the customer in the body face), never from here.
    return (
      <p className="my-2" style={{ fontSize: 'inherit', lineHeight: 'inherit' }} {...props}>
        {annotateFabrics(children)}
      </p>
    );
  },
  ul({ node: _node, children, ...props }) {
    return (
      <ul
        className="my-3 pl-5 space-y-1"
        style={{ listStyleType: 'disc', listStylePosition: 'outside' }}
        {...props}
      >
        {children}
      </ul>
    );
  },
  ol({ node: _node, children, ...props }) {
    return (
      <ol
        className="my-3 pl-5 space-y-1"
        style={{ listStyleType: 'decimal', listStylePosition: 'outside' }}
        {...props}
      >
        {children}
      </ol>
    );
  },
  li({ node: _node, children, ...props }) {
    return (
      <li className="ml-0" style={{ display: 'list-item', fontSize: 'inherit', lineHeight: 'inherit' }} {...props}>
        {annotateFabrics(children)}
      </li>
    );
  },
  table({ node: _node, children, ...props }) {
    return (
      <div className="overflow-x-auto my-3">
        <table
          className="min-w-full border-collapse border border-[var(--space-border-strong)] text-base"
          {...props}
        >
          {children}
        </table>
      </div>
    );
  },
  thead({ node: _node, children, ...props }) {
    return (
      <thead className="bg-[var(--space-surface-muted)]" {...props}>
        {children}
      </thead>
    );
  },
  tbody({ node: _node, children, ...props }) {
    return <tbody {...props}>{children}</tbody>;
  },
  tr({ node: _node, children, ...props }) {
    return (
      <tr className="border-b border-[var(--space-border-default)]" {...props}>
        {children}
      </tr>
    );
  },
  th({ node: _node, children, ...props }) {
    return (
      <th
        className="border border-[var(--space-border-strong)] px-3 py-2 text-left font-semibold"
        {...props}
      >
        {children}
      </th>
    );
  },
  td({ node: _node, children, ...props }) {
    return (
      <td className="border border-[var(--space-border-strong)] px-3 py-2" {...props}>
        {children}
      </td>
    );
  },
  code({ node: _node, children, className, ...props }) {
    const isBlock = typeof className === 'string' && className.includes('language-');
    if (isBlock) {
      return (
        <code className={`${className ?? ''} break-all`} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="bg-[var(--space-neutral-800)] text-[var(--space-neutral-100)] px-1.5 py-0.5 rounded text-[15px] break-all"
        {...props}
      >
        {children}
      </code>
    );
  },
  pre({ node: _node, children, ...props }) {
    return (
      <pre
        className="bg-[var(--space-neutral-800)] text-[var(--space-neutral-100)] rounded-lg p-3 my-2 overflow-x-auto max-w-full"
        style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
        {...props}
      >
        {children}
      </pre>
    );
  },
  a({ node: _node, href, children }) {
    if (typeof href === 'string' && href.startsWith('app://')) {
      const appId = href.replace('app://', '');
      return (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('[AgentChat] Button click - opening app:', appId);
            window.dispatchEvent(new CustomEvent('openApp', { detail: { appId } }));
          }}
          className={`inline-flex items-center gap-1 px-3 py-1 ${tw.button.primary} rounded-lg transition-colors text-xs font-medium mx-1`}
          data-testid={`link-app-${appId}`}
        >
          {children}
        </button>
      );
    }
    if (typeof href === 'string' && href.startsWith('subscribe://')) {
      return (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent('endIntroSession'));
          }}
          className="text-[var(--space-text-brand)] hover:underline break-all bg-transparent border-none p-0 font-inherit text-left"
          data-testid="link-subscribe-plans"
        >
          {children}
        </button>
      );
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={href}
        className="text-[var(--space-text-brand)] hover:underline break-all"
      >
        {children}
      </a>
    );
  },
};

// ---------------------------------------------------------------------------
// THE DRAWER'S EDITORIAL GRAMMAR (founder's reference, August 2026) — one
// 20px gutter, hairline rules instead of tinted bubbles, square corners,
// IBM Plex Mono small-caps speaker labels, Cormorant for Beau's voice,
// Lora for the customer's words, oxblood for anything that speaks.
// ---------------------------------------------------------------------------
const V_MONO = "'IBM Plex Mono', monospace";
const V_OXBLOOD = '#7c2d2d';
const V_INK = '#241a12';
const V_BODY = '#3b2b1d';
const V_MUTED = '#856c51';
const V_FAINT = '#a68e70';
const V_HAIRLINE = 'rgba(59,43,29,0.14)';
const V_CANVAS = '#f4eee3';

// Every small-caps label in the chat is set through this helper, so the phone
// reading floor (--eth-micro, declared in Desktop.tsx) is applied here once
// rather than at each call site. The variable is 0px above the phone
// breakpoint, so the size asked for is used exactly as written.
function vMono(size: number, color: string, tracking = '0.1em') {
  return {
    fontFamily: V_MONO,
    fontSize: `max(var(--eth-micro, 0px), ${size}px)`,
    letterSpacing: tracking,
    textTransform: 'uppercase' as const,
    color,
  };
}

/** Beau's voice — set in the display serif, as the reference sets it. */
const beauVoice = {
  fontFamily: 'var(--space-font-heading)',
  fontSize: '18px',
  lineHeight: 1.4,
  color: V_INK,
} as const;

/** The customer's words — the body face, smaller and quieter. */
const yourVoice = { fontSize: 'max(var(--eth-body, 0px), 14px)', lineHeight: 1.55, color: V_BODY } as const;

export default function AgentChatView({ runtime }: AgentChatViewProps) {
  const {
    messages,
    streamingContent,
    isStreaming,
    loading,
    lastAction,
    isLoadingHistory,
    hasLoadedHistory,
    input,
    setInput,
    pendingAttachments,
    isUploadingAttachment,
    isDraggingOver,
    messagesEndRef,
    textareaRef,
    fileInputRef,
    dropZoneRef,
    abortStream,
    sendMessage,
    sendMessageWithContent,
    removeAttachment,
    handleFileSelect,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handlePaste,
    handleKeyDown,
    greetingPrompt,
    isConfigLoaded,
    greetingSent,
    welcomeInjectedSource,
    isBeaconSpace,
    agentLabel,
    thinkingText,
    beaconIntake,
    beaconStarterPrompts,
    starterPrompts,
    shortcutPrefix,
  } = runtime;

  // THE TWO MODES (August 2026): the drawer opens on two tappable options
  // above the conversation — CHAT (the conversation, unchanged) and SCORE A
  // PIECE (a link, a description or a photo → Cloth · Cut · Make · Longevity
  // and a Regret Risk verdict). Score results also file into the
  // conversation history as deletable cards (the local score store).
  const [drawerMode, setDrawerMode] = useState<'chat' | 'score'>('chat');
  const [scores, setScores] = useState<BeauScore[]>(() => loadBeauScores());
  useEffect(() => {
    const sync = () => setScores(loadBeauScores());
    window.addEventListener(BEAU_SCORES_EVENT, sync);
    return () => window.removeEventListener(BEAU_SCORES_EVENT, sync);
  }, []);

  // THE OPENING REMARK (founder's reference): Beau opens with an observation
  // about the screen the reader came from — not an empty field under a
  // mascot. The context is the deepest visible breadcrumb at mount; the
  // remark itself is ONE small model call, cached per context for the
  // session, with a deterministic line the moment the drawer opens.
  const [openingContext] = useState<string | null>(() => {
    if (isBeaconSpace) return null;
    try {
      return currentBeauContext();
    } catch {
      return null;
    }
  });
  const [opening, setOpening] = useState('');
  useEffect(() => {
    if (!openingContext || isBeaconSpace) return;
    const key = `beau_opening_${openingContext}`;
    try {
      const cached = sessionStorage.getItem(key);
      if (cached) {
        setOpening(cached);
        return;
      }
    } catch { /* storage unavailable — generate fresh */ }
    let alive = true;
    void (async () => {
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
                  'You are Beau, the valet voice of Ethaion — a quiet, knowing, lightly British classic-menswear advisor. The customer just opened your chat drawer from a screen in the wardrobe app. In ONE or TWO short sentences written to him ("you"), open with a useful remark about what he was looking at and what you can do from here. No greetings, no exclamation marks, no emoji. Return STRICT JSON: {"line": string}.',
              },
              { role: 'user', content: `He was just looking at: ${openingContext}` },
            ],
            max_tokens: 90,
            temperature: 0.5,
            response_format: { type: 'json_object' },
          }),
        });
        if (!res.ok) return;
        const data = await res.json();
        const parsed = JSON.parse(data?.choices?.[0]?.message?.content || '{}');
        const line = typeof parsed?.line === 'string' ? parsed.line.trim() : '';
        if (line && alive) {
          setOpening(line);
          try {
            sessionStorage.setItem(key, line);
          } catch { /* best-effort cache */ }
        }
      } catch { /* the deterministic line already covers this */ }
    })();
    return () => {
      alive = false;
    };
  }, [openingContext, isBeaconSpace]);

  // Scroll-to-latest: a floating arrow appears when the reader is scrolled up
  // from the bottom of a long conversation (WhatsApp/iMessage pattern).
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const handleMessagesScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    setShowJumpToLatest(el.scrollHeight - el.scrollTop - el.clientHeight > 220);
  };
  const jumpToLatest = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Edit a previous input: loads it back into the composer for correction and
  // resend — the closest equivalent of ChatGPT's message editing here.
  const editMessage = (content: string) => {
    setInput(content);
    textareaRef.current?.focus();
  };

  const hasUserMessages = messages.some((message) => message.role === 'user');
  const shouldShowBeaconIntake = isBeaconSpace && !!beaconIntake && !hasUserMessages;
  const composerPlaceholder = pendingAttachments.length > 0
    ? isBeaconSpace
      ? 'Add any context about these files...'
      : 'Add a message about the files...'
    : isBeaconSpace
      ? shouldShowBeaconIntake
        ? 'We can keep building from your starter plan, or you can tell me what changed...'
        : "Tell me what happened, or what you're worried about..."
      : hasUserMessages
        ? 'Reply\u2026'
        : 'Describe a piece you\u2019re after, paste a link or share a look you love';

  const visibleMessages = messages.filter(
    (m) => !(m.role === 'user' && typeof m.content === 'string' && m.content.startsWith('[SYSTEM:')),
  );

  const isPending =
    isLoadingHistory ||
    !isConfigLoaded ||
    (!!greetingPrompt && !greetingSent) ||
    (greetingSent && !welcomeInjectedSource);

  const showPendingPlaceholder =
    visibleMessages.length === 0 &&
    !loading &&
    !streamingContent &&
    !shouldShowBeaconIntake &&
    isPending;

  const showEmptyStateWelcome =
    !isLoadingHistory &&
    hasLoadedHistory &&
    isConfigLoaded &&
    visibleMessages.length === 0 &&
    !greetingSent &&
    !greetingPrompt &&
    !shouldShowBeaconIntake;

  // Conversation-starter rows must be visible in the INITIAL state even when a
  // welcome assistant message has been injected (config.agent.welcomeMessage),
  // which makes visibleMessages non-empty and turns showEmptyStateWelcome off.
  // Gate on "no user messages yet" instead so the starters stay tappable until
  // the visitor sends their first message. They disappear the moment the user
  // starts typing — a first-touch affordance, not furniture.
  const userIsTyping = input.trim().length > 0;

  const showStarterPromptsBelowWelcome =
    !isBeaconSpace &&
    !showEmptyStateWelcome &&
    !isLoadingHistory &&
    hasLoadedHistory &&
    isConfigLoaded &&
    !hasUserMessages &&
    !shouldShowBeaconIntake &&
    !loading &&
    !streamingContent &&
    !userIsTyping &&
    starterPrompts.length > 0;

  const isHomeView =
    !isBeaconSpace &&
    !hasUserMessages &&
    // Saved Regret Risk assessments live in the thread — with any on file the
    // conversation view shows so their cards are reachable.
    scores.length === 0 &&
    hasLoadedHistory &&
    !isLoadingHistory &&
    isConfigLoaded &&
    !loading &&
    !streamingContent &&
    !shouldShowBeaconIntake &&
    !isPending;

  const firstAssistantMessage = visibleMessages.find((m) => m.role === 'assistant');
  const homeWelcomeText =
    typeof firstAssistantMessage?.content === 'string' && firstAssistantMessage.content.length <= 260
      ? firstAssistantMessage.content
      : '';

  // What the opening block says before (or instead of) the model's remark.
  const fallbackOpening = openingContext
    ? `You were just looking at ${openingContext}. Ask me for my read on it — or bring me something else entirely.`
    : homeWelcomeText ||
      'Describe a piece you\u2019re after, paste a link, or ask what to wear — I already know your dossier, so you\u2019ll never have to repeat yourself.';

  // THE COMPOSER — anchored to the foot of the drawer at all times (the
  // reference's rule: it never floats mid-panel above the suggestions). One
  // ink rule above, the canvas wash behind, ATTACH · DICTATE · LIVE on the
  // left and SEND ↵ in oxblood on the right.
  const composerElement = (
    <>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        data-testid="input-file-attachment"
      />

      <div
        ref={dropZoneRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="flex-shrink-0 transition-colors"
        style={{
          borderTop: '1px solid #3b2b1d',
          background: isDraggingOver ? 'rgba(168,113,44,0.1)' : V_CANVAS,
        }}
      >
        {isDraggingOver && (
          <div className="flex items-center" style={{ gap: '8px', padding: '10px 20px 0' }}>
            <FileImage className="w-4 h-4" style={{ color: V_OXBLOOD }} />
            <span style={vMono(9, V_OXBLOOD)}>Drop files here</span>
          </div>
        )}

        {pendingAttachments.length > 0 && (
          <div className="flex flex-wrap" style={{ gap: '8px', padding: '10px 20px 0' }}>
            {pendingAttachments.map((attachment) => (
              <div
                key={attachment.id}
                className="flex items-center gap-1.5 text-xs"
                style={{ padding: '4px 8px', border: `1px solid ${V_HAIRLINE}`, background: 'var(--space-surface-card)' }}
                data-testid={`attachment-preview-${attachment.id}`}
              >
                {attachment.contentType.startsWith('image/') ? (
                  <FileImage className="w-3 h-3" style={{ color: V_OXBLOOD }} />
                ) : (
                  <File className="w-3 h-3" style={{ color: V_MUTED }} />
                )}
                <span className="max-w-[120px] truncate" style={{ color: V_BODY }}>
                  {attachment.originalName}
                </span>
                <button
                  onClick={() => removeAttachment(attachment.id)}
                  className="hover:opacity-70 transition-opacity"
                  style={{ color: V_MUTED, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
                  data-testid={`button-remove-attachment-${attachment.id}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends (the composer's own SEND ↵ promise); Shift+Enter
            // breaks the line; the runtime's Cmd/Ctrl+Enter still works.
            if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
              e.preventDefault();
              if (!loading) sendMessage();
              return;
            }
            handleKeyDown(e);
          }}
          onPaste={handlePaste}
          placeholder={composerPlaceholder}
          className="beau-composer-field w-full border-0 bg-transparent focus:outline-none focus:ring-0 resize-none"
          // The composer is a text box, so it takes the 16px iOS floor rather
          // than the body floor: below 16px Safari zooms the whole chat in the
          // moment the field takes focus.
          style={{ padding: '13px 20px 10px', fontSize: 'max(var(--eth-input, 0px), 14px)', lineHeight: 1.45, color: V_BODY, minHeight: '38px' }}
          rows={1}
          disabled={loading}
          data-testid="textarea-instruction"
        />

        <div className="flex items-center" style={{ gap: '16px', padding: '0 20px 12px' }}>
          {/* Multimodal input: file upload + press-and-hold voice + live talk */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loading || isUploadingAttachment || pendingAttachments.length >= 5}
            className="hab-tap hover:opacity-75 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ ...vMono(9, V_MUTED), background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
            data-testid="button-attach-file"
            title="Add a photo or file — show Beau a garment, a look, or a screenshot"
          >
            {isUploadingAttachment ? 'Uploading…' : 'Attach'}
          </button>
          <VoiceButton
            label="Dictate"
            labelStyle={vMono(9, V_MUTED)}
            className="hab-tap hover:opacity-75"
            disabled={loading}
            onTranscript={(text) => {
              void sendMessageWithContent(text, []);
            }}
            title="Hold to talk to Beau — release to send"
          />
          <LiveTalkButton
            label="Live"
            labelStyle={vMono(9, V_MUTED)}
            className="hab-tap hover:opacity-75"
            disabled={loading}
            title="Talk live with Beau — a real-time voice conversation"
          />
          <span className="flex-1" />
          <button
            onClick={loading ? abortStream : sendMessage}
            disabled={(!input.trim() && pendingAttachments.length === 0) && !loading}
            className="hab-tap transition-colors hover:bg-[rgba(124,45,45,0.08)] disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              ...vMono(9, V_OXBLOOD),
              padding: '6px 14px',
              border: `1px solid ${V_OXBLOOD}`,
              background: 'transparent',
              cursor: 'pointer',
            }}
            data-testid="button-send-message"
          >
            {loading ? 'Stop' : 'Send ↵'}
          </button>
        </div>
      </div>
    </>
  );

  // THE TWO MODES — a single hairline-divided row (never two tinted cards):
  // the active mode carries a 2px oxblood left rule and a whisper of wash.
  const scoreMode = !isBeaconSpace && drawerMode === 'score';
  const modeSwitch = isBeaconSpace ? null : (
    <div
      className="grid grid-cols-2 flex-shrink-0"
      role="tablist"
      aria-label="Beau modes"
      style={{ borderBottom: '1px solid rgba(59,43,29,0.2)' }}
    >
      {([
        { id: 'chat', title: 'Chat', hint: 'Style · wardrobe · what to wear' },
        { id: 'score', title: 'Score a piece', hint: 'Link · photo · description' },
      ] as const).map((m, i) => {
        const active = drawerMode === m.id;
        return (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => setDrawerMode(m.id)}
            className="text-left transition-colors"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
              padding: '8px 20px',
              minWidth: 0,
              border: 'none',
              borderLeft: i === 0 ? `2px solid ${active ? V_OXBLOOD : 'transparent'}` : '1px solid rgba(59,43,29,0.2)',
              background: active ? 'rgba(124,45,45,0.05)' : 'transparent',
              cursor: 'pointer',
            }}
            data-testid={`button-beau-mode-${m.id}`}
          >
            <span style={{ ...vMono(8.5, active ? V_OXBLOOD : V_MUTED), whiteSpace: 'nowrap' }}>{m.title}</span>
            <span className="truncate" style={{ fontSize: 'max(var(--eth-label, 0px), 11px)', lineHeight: 1.3, color: '#8a7057' }}>{m.hint}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div
      className={`h-full flex flex-col ${
        isBeaconSpace
          ? 'bg-gradient-to-br from-[var(--space-surface-gradient-from)] via-[var(--space-surface-gradient-via)] to-[var(--space-surface-gradient-to)]'
          : 'bg-[var(--space-surface-card)]'
      }`}
      // The chat shares the dashboard's warm cream/linen palette rather than
      // sitting in a dark room of its own (founder's correction, August 2026).
      style={isBeaconSpace ? undefined : beauChatRoom}
    >
      <style>{'.beau-composer-field::placeholder{color:#a68e70;opacity:1;}'}</style>
      {modeSwitch}
      {scoreMode ? (
        /* SCORE A PIECE — one input (a URL, a description, or a photo), the
           four-pillar read, the Regret Risk verdict, and the auto-save to the
           thread and to The Search → Your Calls. */
        <div className="flex-1 overflow-y-auto">
          <div className="w-full" style={{ padding: '18px 20px 24px' }}>
            <BeauScorePanel />
          </div>
        </div>
      ) : isHomeView ? (
        /* THE FIRST-RUN STATE — Beau opens with an observation about the
           screen the reader came from (or his welcome line), then the OR ASK
           rows. The composer stays anchored to the foot below. */
        <>
          <div className="flex-1 overflow-y-auto" data-testid="home-view">
            <div style={{ padding: '16px 20px 4px', borderLeft: `2px solid ${V_OXBLOOD}` }}>
              <div style={vMono(8.5, V_OXBLOOD, '0.13em')}>
                {openingContext ? 'Beau, on what you were just looking at' : 'Beau, at your service'}
              </div>
              <p
                style={{
                  fontFamily: 'var(--space-font-heading)',
                  fontSize: '22px',
                  fontWeight: 400,
                  lineHeight: 1.28,
                  color: V_INK,
                  margin: '9px 0 0',
                }}
              >
                {opening || fallbackOpening}
              </p>
            </div>
            {starterPrompts.length > 0 && !userIsTyping && (
              <>
                <div style={{ ...vMono(8.5, V_FAINT, '0.13em'), padding: '16px 20px 6px' }}>Or ask</div>
                <div className="flex flex-col">
                  {starterPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => {
                        void sendMessageWithContent(prompt, []);
                      }}
                      className="flex items-baseline text-left transition-colors hover:bg-[rgba(168,113,44,0.06)]"
                      style={{
                        gap: '11px',
                        padding: '11px 20px',
                        background: 'transparent',
                        border: 'none',
                        borderTop: `1px solid ${V_HAIRLINE}`,
                        cursor: 'pointer',
                      }}
                    >
                      <span className="flex-shrink-0" style={{ fontFamily: V_MONO, fontSize: 'max(var(--eth-micro, 0px), 9px)', color: V_OXBLOOD }}>→</span>
                      <span className="flex-1 min-w-0" style={{ fontSize: 'max(var(--eth-body, 0px), 14px)', lineHeight: 1.45, color: V_BODY }}>{prompt}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          {composerElement}
        </>
      ) : (
      <>
      <div ref={scrollContainerRef} onScroll={handleMessagesScroll} className="flex-1 overflow-auto">
        <div className="w-full pb-3">
        {/* Pending-init placeholder so the user never sees a blank chat */}
        {showPendingPlaceholder && (
          <div className="flex items-center" style={{ gap: '8px', padding: '15px 20px' }}>
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: V_FAINT }} />
            <span style={vMono(9, V_FAINT)}>Getting ready…</span>
          </div>
        )}

        {!isLoadingHistory && hasLoadedHistory && shouldShowBeaconIntake && beaconIntake && (
          <div className="px-4 pt-4">
            <div className="mx-auto max-w-2xl overflow-hidden rounded-3xl border border-[var(--space-semantic-success-100)] bg-[var(--space-surface-card)] shadow-sm">
              <div className="border-b border-[var(--space-semantic-success-100)] bg-gradient-to-r from-[var(--space-semantic-success-50)] via-[var(--space-surface-card)] to-[var(--space-surface-accent-soft)] px-6 py-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--space-semantic-success-700)]">
                  Your Beacon starting point
                </p>
                <h2 className="mt-2 text-xl font-semibold text-[var(--space-text-primary)]">
                  {beaconIntake.headline}
                </h2>
                <p className="mt-2 text-sm leading-6 text-[var(--space-text-secondary)]">{beaconIntake.reflection}</p>
              </div>

              <div className="space-y-5 px-6 py-5">
                <div className="rounded-2xl border border-[var(--space-semantic-success-100)] bg-[var(--space-semantic-success-50)] px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--space-semantic-success-700)]">
                    Today's anchor
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--space-text-secondary)]">{beaconIntake.anchor}</p>
                </div>

                <div>
                  <p className="text-sm font-semibold text-[var(--space-text-primary)]">Good next steps</p>
                  <div className="mt-3 space-y-2">
                    {beaconIntake.nextSteps.map((step) => (
                      <div
                        key={step}
                        className="flex items-start gap-3 rounded-2xl bg-[var(--space-surface-muted)] px-4 py-3 text-sm text-[var(--space-text-secondary)]"
                      >
                        <div className="mt-0.5 h-2 w-2 rounded-full bg-[var(--space-semantic-success-600)]" />
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold text-[var(--space-text-primary)]">Continue from here</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {beaconIntake.starterPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => {
                          void sendMessageWithContent(prompt, []);
                        }}
                        className="rounded-full border border-[var(--space-semantic-success-100)] bg-[var(--space-surface-card)] px-4 py-2 text-sm font-medium text-[var(--space-semantic-success-700)] shadow-sm transition hover:border-[var(--space-semantic-success-500)] hover:bg-[var(--space-semantic-success-50)]"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Welcome message - only shown when confirmed no history exists */}
        {showEmptyStateWelcome ? (
          isBeaconSpace ? (
            <div className="mt-8 px-4">
              <div className="mx-auto max-w-xl rounded-3xl border border-[var(--space-semantic-success-100)] bg-gradient-to-b from-[var(--space-semantic-success-50)] via-[var(--space-surface-card)] to-[var(--space-surface-card)] px-6 py-8 text-center shadow-sm">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--space-semantic-success-700)] text-[var(--space-text-on-primary)] shadow-sm">
                  <Bot className="h-6 w-6" />
                </div>
                <h2 className="text-xl font-semibold text-[var(--space-text-primary)]">Start with the hard part</h2>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--space-text-secondary)]">
                  Tell Beacon what happened, what conversation you are dreading, or what you need help saying next.
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {beaconStarterPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => {
                        void sendMessageWithContent(prompt, []);
                      }}
                      className="rounded-full border border-[var(--space-semantic-success-100)] bg-[var(--space-surface-card)] px-4 py-2 text-sm font-medium text-[var(--space-semantic-success-700)] shadow-sm transition hover:border-[var(--space-semantic-success-500)] hover:bg-[var(--space-semantic-success-50)]"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div style={{ padding: '16px 20px 4px', borderLeft: `2px solid ${V_OXBLOOD}` }}>
                <div style={vMono(8.5, V_OXBLOOD, '0.13em')}>Beau, at your service</div>
                <p style={{ ...beauVoice, margin: '9px 0 0' }}>
                  I’ve read your style profile, so I already know your direction, skin tone and budget. Describe a
                  piece you’re after or paste a product link and I’ll tell you whether it’s worth buying — or share a
                  look you love and I’ll read the signal underneath. I can also log a piece to The Rail, or hunt one
                  down for you: just say the word.
                </p>
              </div>
              {starterPrompts.length > 0 && !userIsTyping && (
                <>
                  <div style={{ ...vMono(8.5, V_FAINT, '0.13em'), padding: '16px 20px 6px' }}>Or ask</div>
                  <div className="flex flex-col">
                    {starterPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => {
                          void sendMessageWithContent(prompt, []);
                        }}
                        className="flex items-baseline text-left transition-colors hover:bg-[rgba(168,113,44,0.06)]"
                        style={{
                          gap: '11px',
                          padding: '11px 20px',
                          background: 'transparent',
                          border: 'none',
                          borderTop: `1px solid ${V_HAIRLINE}`,
                          cursor: 'pointer',
                        }}
                      >
                        <span className="flex-shrink-0" style={{ fontFamily: V_MONO, fontSize: 'max(var(--eth-micro, 0px), 9px)', color: V_OXBLOOD }}>→</span>
                        <span className="flex-1 min-w-0" style={{ fontSize: 'max(var(--eth-body, 0px), 14px)', lineHeight: 1.45, color: V_BODY }}>{prompt}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          )
        ) : (
          visibleMessages.length > 0 &&
          visibleMessages.map((msg, idx) => {
            const isUser = msg.role === 'user';
            if (isBeaconSpace) {
              return (
                <div key={idx} className="px-4 pt-4">
                  <div
                    className={`relative group p-3 rounded-lg overflow-hidden min-w-0 ${
                      isUser ? `${tw.message.user} ml-8` : `${tw.message.assistant} mr-8`
                    }`}
                  >
                    <p className="text-[15px] font-medium mb-1">{isUser ? 'You' : 'Beacon'}</p>
                    <div className="prose prose-base max-w-none text-[17px]">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={markdownComponents}
                        urlTransform={markdownUrlTransform}
                      >
                        {typeof msg.content === 'string' ? msg.content : ''}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              );
            }
            return (
              <div
                key={idx}
                className="relative group min-w-0"
                style={{ padding: '15px 20px', borderTop: idx === 0 ? 'none' : `1px solid ${V_HAIRLINE}` }}
              >
                {/* Speaker label — mono small caps: YOU quiet, BEAU in oxblood. */}
                <div style={vMono(8.5, isUser ? V_FAINT : V_OXBLOOD, '0.13em')}>
                  {isUser ? 'You' : agentLabel}
                </div>

                {/* Edit a previous input — loads it into the composer to correct and resend */}
                {isUser && typeof msg.content === 'string' && msg.content.trim() !== '' && (
                  <button
                    type="button"
                    onClick={() => editMessage(msg.content as string)}
                    className="absolute top-2 right-3 p-1.5 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:opacity-100"
                    style={{ color: V_MUTED, background: 'transparent', border: 'none', cursor: 'pointer' }}
                    title="Edit this message and send again"
                    data-testid="button-edit-message"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}

                {isUser && msg.attachments && msg.attachments.length > 0 && (
                  <div className="flex flex-wrap" style={{ gap: '8px', margin: '7px 0 0' }}>
                    {msg.attachments.map((att) => (
                      <div
                        key={att.id}
                        className="flex items-center gap-1 text-xs"
                        style={{ padding: '3px 8px', border: `1px solid ${V_HAIRLINE}`, color: V_MUTED }}
                      >
                        {att.contentType.startsWith('image/') ? (
                          <FileImage className="w-3 h-3" style={{ color: V_OXBLOOD }} />
                        ) : (
                          <File className="w-3 h-3" />
                        )}
                        <span className="max-w-[120px] truncate">{att.originalName}</span>
                      </div>
                    ))}
                  </div>
                )}

                {typeof msg.content === 'string' || msg.content == null ? (
                  <div
                    className="prose prose-base max-w-none min-w-0"
                    style={{ ...(isUser ? yourVoice : beauVoice), marginTop: '7px' }}
                  >
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={markdownComponents}
                      urlTransform={markdownUrlTransform}
                    >
                      {typeof msg.content === 'string' ? msg.content : ''}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="space-y-2" style={{ marginTop: '7px' }}>
                    {(Array.isArray(msg.content) ? msg.content : []).map((chunk, chunkIdx) => (
                      <div key={chunkIdx}>
                        {chunk.type === 'text' && chunk.text && (
                          <div className="prose prose-base max-w-none min-w-0" style={isUser ? yourVoice : beauVoice}>
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={markdownComponents}
                              urlTransform={markdownUrlTransform}
                            >
                              {chunk.text}
                            </ReactMarkdown>
                          </div>
                        )}
                        {chunk.type === 'tool_use' && (
                          <div className="flex items-center flex-wrap" style={{ gap: '8px', padding: '6px 0 2px' }}>
                            {chunk.name === 'edit_file' ? (
                              <Edit3 className="w-3.5 h-3.5" style={{ color: V_MUTED }} />
                            ) : chunk.name === 'read_file' ? (
                              <BookOpen className="w-3.5 h-3.5" style={{ color: V_MUTED }} />
                            ) : chunk.name === 'write_file' ? (
                              <Save className="w-3.5 h-3.5" style={{ color: V_MUTED }} />
                            ) : (
                              <Sparkles className="w-3.5 h-3.5" style={{ color: V_MUTED }} />
                            )}
                            <span style={vMono(8, V_MUTED)}>
                              {chunk.name === 'read_file'
                                ? 'Viewing'
                                : chunk.name === 'write_file'
                                  ? 'Creating'
                                  : chunk.name === 'edit_file'
                                    ? 'Updating'
                                    : getFriendlyTerm(chunk.name || '', 'Tool Use')}
                            </span>
                            {chunk.input?.file_path && (
                              <span className="font-mono text-xs break-all" style={{ color: V_FAINT }}>
                                {chunk.input.file_path}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Saved Regret Risk assessments — the chat-thread copies, each one
            deletable here without touching its Your Calls record. */}
        {scores.length > 0 && (
          <div className="space-y-3" style={{ padding: '12px 20px 4px' }}>
            {scores.map((s) => (
              <BeauScoreCard key={s.id} score={s} onDelete={() => deleteBeauScore(s.id)} />
            ))}
          </div>
        )}

        {showStarterPromptsBelowWelcome && (
          <>
            <div style={{ ...vMono(8.5, V_FAINT, '0.13em'), padding: '16px 20px 6px' }}>Or ask</div>
            <div className="flex flex-col">
              {starterPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => {
                    void sendMessageWithContent(prompt, []);
                  }}
                  className="flex items-baseline text-left transition-colors hover:bg-[rgba(168,113,44,0.06)]"
                  style={{
                    gap: '11px',
                    padding: '11px 20px',
                    background: 'transparent',
                    border: 'none',
                    borderTop: `1px solid ${V_HAIRLINE}`,
                    cursor: 'pointer',
                  }}
                  data-testid={`starter-prompt-${prompt.slice(0, 24)}`}
                >
                  <span className="flex-shrink-0" style={{ fontFamily: V_MONO, fontSize: 'max(var(--eth-micro, 0px), 9px)', color: V_OXBLOOD }}>→</span>
                  <span className="flex-1 min-w-0" style={{ fontSize: 'max(var(--eth-body, 0px), 14px)', lineHeight: 1.45, color: V_BODY }}>{prompt}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {loading && !streamingContent && (
          <WorkingIndicator lastAction={lastAction} agentLabel={agentLabel} thinkingText={thinkingText} />
        )}

        {streamingContent && (
          <div
            className="overflow-hidden min-w-0"
            style={{ padding: '15px 20px', borderTop: `1px solid ${V_HAIRLINE}` }}
          >
            <div style={vMono(8.5, V_OXBLOOD, '0.13em')}>{agentLabel}</div>
            <div className="prose prose-base max-w-none min-w-0" style={{ ...beauVoice, marginTop: '7px' }}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
                urlTransform={markdownUrlTransform}
              >
                {streamingContent}
              </ReactMarkdown>
              {isStreaming && (
                <span className="inline-block w-0.5 h-4 ml-1 animate-pulse" style={{ background: V_INK }} />
              )}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
        </div>
      </div>

      {/* The composer, anchored to the foot — plus the jump-to-latest arrow
          floating over the end of a long conversation. */}
      <div className="relative flex-shrink-0">
        {showJumpToLatest && (
          <button
            type="button"
            onClick={jumpToLatest}
            className="absolute -top-14 right-5 z-20 w-10 h-10 rounded-full flex items-center justify-center transition-colors hover:bg-[rgba(168,113,44,0.08)]"
            style={{ background: 'var(--space-surface-card)', border: '1px solid rgba(59,43,29,0.34)', boxShadow: '0 6px 20px rgba(36,26,18,0.14)', color: V_INK }}
            title="Jump to the latest message"
            aria-label="Jump to the latest message"
            data-testid="button-jump-to-latest"
          >
            <ArrowDown className="w-4 h-4" />
          </button>
        )}
        {composerElement}
      </div>
      </>
      )}
    </div>
  );
}
