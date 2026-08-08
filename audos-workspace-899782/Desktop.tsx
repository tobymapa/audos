import { useState, Suspense, lazy, LazyExoticComponent, ComponentType, useEffect, useRef, useMemo, useCallback, Component, ErrorInfo, ReactNode } from 'react';
import { Bot, Folder, X, Plus, Menu, PanelLeftClose, PanelLeftOpen, ChevronLeft, Activity, Maximize2, Minimize2, Moon, Heart, Calendar, Users, FileText, BarChart, Settings as SettingsIcon, ArrowUp, MessageCircle, ChevronUp, Plane, TrendingUp, LineChart, Dumbbell, Brain, Target, Zap, Star, Clock, CheckCircle, List, BookOpen, Coffee, Music, Camera, MapPin, Wallet, ShoppingCart, Gift, Lightbulb, Sparkles, Rocket, Home, Building, Globe, Mail, Phone, Video, Mic, Image, Play, Pause, Volume2, Wifi, Cloud, Sun, Umbrella, Thermometer, Wind, Droplets, Leaf, Flower2, Mountain, Waves, Compass, Map, Navigation, Car, Bike, Ship, Award, Trophy, Medal, Crown, Diamond, Gem, Key, Lock, Unlock, Shield, Eye, Search, Filter, SortAsc, Download, Upload, Share2, Link, ExternalLink, Copy, Clipboard, Trash2, Edit, Pencil, PenTool, Scissors, Bookmark, Flag, Bell, AlertCircle, Info, HelpCircle, XCircle, CheckCircle2, Circle, Square, Triangle, Hexagon, Octagon, Hash, AtSign, DollarSign, Percent, Calculator, Code, Terminal, Database, Server, Cpu, Monitor, Smartphone, Tablet, Laptop, Watch, Headphones, Speaker, Radio, Tv, Printer, Scan, QrCode, Barcode, CreditCard, Receipt, Banknote, PiggyBank, TrendingDown, AreaChart, PieChart, Shirt, Palette } from 'lucide-react';
import type { SpaceConfig, DesktopBranding, DesktopThemeTokens } from './types';
import { useSpaceRuntime } from './SpaceRuntimeContext';
// ---------------------------------------------------------------------------
// DEFERRED SHELL SURFACES.
//
// These four used to be static imports, which put them — and everything they
// depend on — on the critical path of the FIRST paint.
//
// The worst offender by far is the chat. `AgentChat` pulls in `AgentChatView`,
// which imports `react-markdown` and `remark-gfm`. Those resolve through the
// CDN importmap as unbundled ES modules, so their transitive dependency tree
// (mdast-util-*, micromark-util-*, unist-util-*, zwitch, ccount, devlop,
// longest-streak …) arrives as roughly FORTY separate half-kilobyte requests,
// chained. On a throttled mobile connection that measured as a ~2.9s critical
// path, and the Largest Contentful Paint element — a plain paragraph of text
// on the email gate — spent 2,330ms waiting on it.
//
// Nobody is looking at the chat during that time. `config.json` sets
// `defaultLandingView: "app"` and `customerLandsOnAgent: false`, so a customer
// lands on the wardrobe; Settings, Files and the conversation list all sit
// behind explicit navigation. Deferring them costs nothing visible and takes
// the entire markdown stack off the first paint.
//
// EmailGate stays static on purpose: it IS the first screen for a new visitor.
// ---------------------------------------------------------------------------
const AgentChat = lazy(() => import('./components/AgentChat'));
const BeauConversations = lazy(() => import('./components/BeauConversations'));
const FileBrowser = lazy(() => import('./components/FileBrowser'));
const Settings = lazy(() => import('./components/Settings'));
import EmailGate from './components/EmailGate';
import { isTenantDelegationCanvas } from './lib/tenant-delegation-canvas';
import { beauDarkRoom } from './lib/colors';

// v4: agent-first shell (thread sidebar + primary chat + side app panel).
const DESKTOP_VERSION = 4;

// Canonical primary thread id — mirrors PRIMARY_THREAD_ID on the server.
const PRIMARY_THREAD_ID = 'main';
const THREAD_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

// Hook to detect mobile vs desktop using JS (prevents double-mounting of components)
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768; // md breakpoint
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);

    // Set initial value
    setIsMobile(mediaQuery.matches);

    // Listen for changes
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return isMobile;
}

interface AppErrorBoundaryProps {
  appName?: string;
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  retryKey: number;
}

class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, retryKey: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[AppErrorBoundary] App "${this.props.appName || 'unknown'}" crashed:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '32px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
          <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px', color: 'var(--space-text-primary)' }}>
            {this.props.appName ? `"${this.props.appName}" failed to load` : 'App failed to load'}
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--space-text-muted)', marginBottom: '20px', maxWidth: '400px', margin: '0 auto 20px' }}>
            {this.state.error?.message || 'An unexpected error occurred while loading this app.'}
          </p>
          <button
            onClick={() => {
              this.setState((prev) => ({ hasError: false, error: null, retryKey: prev.retryKey + 1 }));
            }}
            style={{
              padding: '8px 20px',
              borderRadius: '8px',
              border: '1px solid var(--space-border-default)',
              background: 'var(--space-surface-card)',
              color: 'var(--space-text-primary)',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
            }}
          >
            ↻ Retry
          </button>
        </div>
      );
    }
    return <div key={this.state.retryKey}>{this.props.children}</div>;
  }
}

function buildFontFamily(fontName?: string): string {
  if (!fontName) {
    return '"Jost", "Century Gothic", "Futura", system-ui, -apple-system, sans-serif';
  }

  return `"${fontName}", "Century Gothic", "Futura", system-ui, -apple-system, sans-serif`;
}

function resolveGenesisRuntimeTheme(config: SpaceConfig) {
  const branding = (config.desktop?.branding || {}) as DesktopBranding;
  const themeTokens = (config.desktop?.themeTokens || {}) as DesktopThemeTokens;
  const headingFont =
    themeTokens.typography?.headingFont ||
    branding.headingFont ||
    'Jost';
  const bodyFont =
    themeTokens.typography?.bodyFont ||
    branding.bodyFont ||
    headingFont;
  const shellTheme = {
    ...themeTokens.shell,
    accentColor: themeTokens.shell?.accentColor || config.desktop?.theme?.accentColor,
    dockStyle: themeTokens.shell?.dockStyle || config.desktop?.theme?.dockStyle,
  };

  return {
    branding: {
      name: branding.name || config.name || 'Welcome',
      tagline: branding.tagline,
      logoUrl:
        branding.logoUrl ||
        (config as any).iconUrl ||
        (config as any).logoUrl,
      heroVideoUrl:
        branding.heroVideoUrl ||
        (config as any).heroVideoUrl ||
        (config as any).brandAssets?.heroVideoUrl,
    },
    themeTokens: {
      palette: themeTokens.palette || branding.palette || branding.colors,
      typography: {
        headingFont,
        bodyFont,
        fontFamily:
          themeTokens.typography?.fontFamily || buildFontFamily(headingFont),
      },
      shell: shellTheme,
      cssVariables: themeTokens.cssVariables || {},
    },
  };
}

// Icon mapping for app icons - supports both PascalCase and lowercase
const baseIconMap: Record<string, ComponentType<any>> = {
  Activity, Moon, Heart, Calendar, Users, FileText, BarChart, Bot, Folder,
  Plane, TrendingUp, LineChart, Dumbbell, Brain, Target, Zap, Star, Clock,
  CheckCircle, List, BookOpen, Coffee, Music, Camera, MapPin, Wallet,
  ShoppingCart, Gift, Lightbulb, Sparkles, Rocket, Home, Building, Globe,
  Mail, Phone, Video, Mic, Image, Play, Pause, Volume2, Wifi, Cloud, Sun,
  Umbrella, Thermometer, Wind, Droplets, Leaf, Mountain, Waves, Compass,
  Map, Navigation, Car, Bike, Ship, Award, Trophy, Medal, Crown, Diamond,
  Gem, Key, Lock, Unlock, Shield, Eye, Search, Filter, SortAsc, Download,
  Upload, Share2, Link, ExternalLink, Copy, Clipboard, Trash2, Edit, Pencil,
  PenTool, Scissors, Bookmark, Flag, Bell, AlertCircle, Info, HelpCircle,
  XCircle, CheckCircle2, Circle, Square, Triangle, Hexagon, Octagon, Hash,
  AtSign, DollarSign, Percent, Calculator, Code, Terminal, Database, Server,
  Cpu, Monitor, Smartphone, Tablet, Laptop, Watch, Headphones, Speaker,
  Radio, Tv, Printer, Scan, QrCode, Barcode, CreditCard, Receipt, Banknote,
  PiggyBank, TrendingDown, AreaChart, PieChart, Flower2, Shirt, Palette,
};

// Create case-insensitive lookup with common aliases
const iconMap: Record<string, ComponentType<any>> = {};
Object.entries(baseIconMap).forEach(([key, value]) => {
  iconMap[key] = value;
  iconMap[key.toLowerCase()] = value;
  // Handle kebab-case (e.g., "line-chart" -> LineChart)
  const kebabKey = key.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '');
  iconMap[kebabKey] = value;
});
// Common aliases
iconMap['chart'] = BarChart;
iconMap['graph'] = LineChart;
iconMap['workout'] = Dumbbell;
iconMap['fitness'] = Dumbbell;
iconMap['gym'] = Dumbbell;
iconMap['stock'] = TrendingUp;
iconMap['stocks'] = TrendingUp;
iconMap['trip'] = Plane;
iconMap['travel'] = Plane;
iconMap['flight'] = Plane;
iconMap['money'] = Wallet;
iconMap['finance'] = DollarSign;
iconMap['health'] = Heart;
iconMap['wellness'] = Heart;
iconMap['notes'] = FileText;
iconMap['note'] = FileText;
iconMap['log'] = List;
iconMap['tracker'] = Activity;
iconMap['tracking'] = Activity;
iconMap['ai'] = Sparkles;
iconMap['smart'] = Brain;
iconMap['idea'] = Lightbulb;
iconMap['ideas'] = Lightbulb;
iconMap['time'] = Clock;
iconMap['schedule'] = Calendar;
iconMap['event'] = Calendar;
iconMap['events'] = Calendar;
iconMap['people'] = Users;
iconMap['team'] = Users;
iconMap['community'] = Users;
iconMap['book'] = BookOpen;
iconMap['read'] = BookOpen;
iconMap['reading'] = BookOpen;
iconMap['shop'] = ShoppingCart;
iconMap['shopping'] = ShoppingCart;
iconMap['cart'] = ShoppingCart;
iconMap['location'] = MapPin;
iconMap['place'] = MapPin;
iconMap['weather'] = Cloud;
iconMap['photo'] = Camera;
iconMap['photos'] = Camera;
iconMap['video'] = Video;
iconMap['movie'] = Play;
iconMap['audio'] = Music;
iconMap['sound'] = Volume2;
iconMap['call'] = Phone;
iconMap['email'] = Mail;
iconMap['message'] = MessageCircle;
iconMap['messages'] = MessageCircle;
iconMap['chat'] = MessageCircle;
iconMap['wardrobe'] = Shirt;
iconMap['clothes'] = Shirt;
iconMap['clothing'] = Shirt;
iconMap['style'] = Palette;
iconMap['settings'] = SettingsIcon;
iconMap['config'] = SettingsIcon;
iconMap['gear'] = SettingsIcon;

interface SpaceDesktopProps {
  mode: 'entrepreneur' | 'customer';
  spaceId: string;
  sessionId?: string;
  config: SpaceConfig;
  apps: Record<string, LazyExoticComponent<any>>;
  LoadingSpinner: ComponentType;
  initialAppId?: string | null;
}

// Right-panel identifier: 'files' | 'settings' | app id.
type PanelId = 'files' | 'settings' | string;

interface FileAccessLog {
  timestamp: number;
  path: string;
  action: 'read' | 'write';
  tool: string;
}

interface ThreadSummary {
  threadId: string;
  title: string;
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string | null;
}

function makeThreadId(): string {
  return `thr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export default function SpaceDesktop({
  mode,
  spaceId,
  sessionId: _unusedProp, // Ignore prop, read from context instead
  config,
  apps,
  LoadingSpinner,
  initialAppId
}: SpaceDesktopProps) {
  const { sessionId, email, isBootstrappingSession, trackEvent, subscriptionReady, subscription } = useSpaceRuntime();
  const isMobile = useIsMobile(); // JS-based media query to prevent double-mounting AgentChat

  // The thread/apps sidebar is builder scaffolding (conversation list, app
  // registry, memory) — internal navigation for the founder in App Studio.
  // Customers never see it: the Beau button opens the chat interface only,
  // and Settings stays reachable from the chat header / top bar.
  const isBuilderView = mode === 'entrepreneur';

  // Timeout guard: if subscriptionReady stays false for too long, unblock the UI
  // so the user isn't stuck on an infinite spinner (fixes EmailGate hang bug).
  const [subscriptionTimedOut, setSubscriptionTimedOut] = useState(false);
  useEffect(() => {
    if (subscriptionReady) return;
    if (!sessionId) return;
    const timer = setTimeout(() => setSubscriptionTimedOut(true), 8000);
    return () => clearTimeout(timer);
  }, [subscriptionReady, sessionId]);

  // Browser-tab favicon: assert the Ethaion "H" mark from the shell itself,
  // not only from the EmailGate (which never mounts in App Studio /
  // entrepreneur previews — the state where the stale pre-rebrand "B" kept
  // surviving). Strips every icon link the served page shipped with and
  // installs the hosted Ethaion "H", cache-busted with ?v=habitus4 (matches
  // EmailGate.tsx) so no favicon cache can resurrect the old mark. Skips
  // work if our links are already in place.
  useEffect(() => {
    const HABITUS_FAVICON =
      'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/img-1785281369484-t6ystn.png?v=habitus4';
    const existing = document.querySelectorAll<HTMLLinkElement>(
      'link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"], link[rel="mask-icon"]'
    );
    const alreadyOurs =
      existing.length > 0 &&
      Array.from(existing).every((el) => el.href === HABITUS_FAVICON);
    if (alreadyOurs) return;
    existing.forEach((el) => el.parentNode?.removeChild(el));
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

  // Lock body/html scroll on mobile to prevent iOS Safari from scrolling
  // the page when the keyboard opens or the address bar animates.
  useEffect(() => {
    if (!isMobile) return;
    const html = document.documentElement;
    const body = document.body;
    html.style.overflow = 'hidden';
    html.style.height = '100%';
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.width = '100%';
    body.style.height = '100%';
    body.style.top = '0';
    body.style.left = '0';
    const raf = requestAnimationFrame(() => {
      body.style.opacity = '0.999';
      requestAnimationFrame(() => { body.style.opacity = ''; });
    });
    return () => {
      cancelAnimationFrame(raf);
      html.style.overflow = '';
      html.style.height = '';
      body.style.overflow = '';
      body.style.position = '';
      body.style.width = '';
      body.style.height = '';
      body.style.top = '';
      body.style.left = '';
    };
  }, [isMobile]);

  // --- Shell state -----------------------------------------------------
  // The chat is ALWAYS the primary surface; apps/files/settings open in a
  // side panel next to it (never replacing it on desktop).
  const [activePanelId, setActivePanelId] = useState<PanelId | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  // Mobile: when a panel is open, chat and panel toggle full-screen.
  const [mobileView, setMobileView] = useState<'chat' | 'panel'>('chat');
  const [isPanelExpanded, setIsPanelExpanded] = useState(false);
  // Papa Principle "app home" shell: true while the visitor is in the
  // app-first landing state (fully-expanded home app with branded header +
  // assistant pill). Cleared the moment they navigate anywhere else.
  const [isAppHomeShell, setIsAppHomeShell] = useState(false);
  const [fileAccessLogs, setFileAccessLogs] = useState<FileAccessLog[]>([]);
  const [pendingAgentMessage, setPendingAgentMessage] = useState<string | null>(null);
  // Customer-mode right overlays (Pass Twenty-Eight, Linear-style): the Beau
  // chat and Settings each slide in from the RIGHT over the page — the main
  // content stays put underneath. ONE state field holds which overlay is
  // open, so the two are mutually exclusive by construction: opening one
  // closes the other.
  const [overlayView, setOverlayView] = useState<'chat' | 'settings' | null>(null);
  // Settings mounts lazily on first open (it fetches subscription status),
  // then stays mounted so the slide-out animation works on close.
  const [hasOpenedSettings, setHasOpenedSettings] = useState(false);
  useEffect(() => {
    if (overlayView === 'settings') setHasOpenedSettings(true);
  }, [overlayView]);

  // --- Thread state ----------------------------------------------------
  const threadStorageKey = `space_thread_${spaceId}`;
  const [activeThreadId, setActiveThreadId] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(threadStorageKey);
      if (stored && THREAD_ID_PATTERN.test(stored)) return stored;
    } catch (e) { /* ignore */ }
    return PRIMARY_THREAD_ID;
  });
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  // Thread ids the user has explicitly started this session (clicked "New
  // conversation" or sent a first message). These stay visible even when the
  // server thread list hasn't caught up yet (brand-new/empty thread), but we
  // do NOT fabricate one on first load before the user has done anything.
  const [startedThreadIds, setStartedThreadIds] = useState<Set<string>>(() => new Set());
  // Deleted conversations (ChatGPT-style "Delete chat"). The platform keeps
  // thread history server-side, so deletion is a persistent local hide — the
  // thread disappears from the list and stays gone across reloads.
  const hiddenThreadsKey = `space_hidden_threads_${spaceId}`;
  const [hiddenThreadIds, setHiddenThreadIds] = useState<Set<string>>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(hiddenThreadsKey) || '[]');
      if (Array.isArray(stored)) return new Set(stored.filter((t) => typeof t === 'string'));
    } catch (e) { /* ignore */ }
    return new Set();
  });
  // Which thread is showing its inline delete confirmation.
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(hiddenThreadsKey, JSON.stringify(Array.from(hiddenThreadIds)));
    } catch (e) { /* ignore */ }
  }, [hiddenThreadIds, hiddenThreadsKey]);

  useEffect(() => {
    try {
      localStorage.setItem(threadStorageKey, activeThreadId);
    } catch (e) { /* ignore */ }
  }, [activeThreadId, threadStorageKey]);

  const canListThreads = !!sessionId && sessionId.startsWith('wses_');

  const refreshThreads = useCallback(async () => {
    if (!sessionId || !sessionId.startsWith('wses_')) return;
    try {
      const res = await fetch(
        `/api/space/${spaceId}/chat/threads?sessionId=${encodeURIComponent(sessionId)}`,
      );
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.threads)) {
        setThreads(data.threads);
      }
    } catch (e) {
      console.error('[Desktop] Failed to load threads:', e);
    }
  }, [sessionId, spaceId]);

  // Load thread list on session availability and re-sync when switching
  // threads (titles derive from each thread's first user message).
  useEffect(() => {
    if (canListThreads) {
      refreshThreads();
    }
  }, [canListThreads, refreshThreads, activeThreadId]);

  // Display list: only threads that actually exist server-side (primary first),
  // plus the active thread when the user has explicitly started it (clicked
  // "New conversation" or sent a first message) but the server list hasn't
  // caught up yet. On a brand-new space with no started/real threads, the
  // sidebar stays empty instead of showing a fabricated "New conversation".
  const displayThreads = useMemo(() => {
    const visible = threads.filter(t => !hiddenThreadIds.has(t.threadId));
    const main = visible.find(t => t.threadId === PRIMARY_THREAD_ID);
    const rest = visible.filter(t => t.threadId !== PRIMARY_THREAD_ID);
    const list: ThreadSummary[] = main ? [main, ...rest] : [...rest];
    if (
      startedThreadIds.has(activeThreadId) &&
      !hiddenThreadIds.has(activeThreadId) &&
      !list.some(t => t.threadId === activeThreadId)
    ) {
      const synthesized: ThreadSummary = {
        threadId: activeThreadId,
        title: 'New conversation',
        messageCount: 0,
        lastMessageAt: null,
        createdAt: null,
      };
      // Keep the freshly-started thread near the top, after the primary thread.
      if (main) list.splice(1, 0, synthesized);
      else list.unshift(synthesized);
    }
    return list;
  }, [threads, activeThreadId, startedThreadIds, hiddenThreadIds]);

  const selectThread = (threadId: string) => {
    if (threadId === activeThreadId) {
      setIsMobileDrawerOpen(false);
      setMobileView('chat');
      return;
    }
    setActiveThreadId(threadId);
    setIsMobileDrawerOpen(false);
    setMobileView('chat');
    trackEvent('thread_switched', { threadId });
  };

  // Auto-title threads from the first user message. The server derives
  // titles the same way for real (wses_) sessions; this local fallback makes
  // titles appear instantly and covers guest/preview sessions where the
  // server thread list isn't available.
  useEffect(() => {
    const onUserMessage = (e: Event) => {
      const detail = (e as CustomEvent).detail as { threadId?: string; content?: string } | undefined;
      const threadId = detail?.threadId;
      const content = typeof detail?.content === 'string' ? detail.content.trim() : '';
      if (!threadId || !content) return;
      const title = content.length > 48 ? `${content.slice(0, 48).trimEnd()}…` : content;
      setStartedThreadIds(prev => (prev.has(threadId) ? prev : new Set(prev).add(threadId)));
      setThreads(prev => {
        const existing = prev.find(t => t.threadId === threadId);
        if (existing) {
          if (existing.title && existing.title !== 'New conversation') return prev;
          return prev.map(t => (t.threadId === threadId ? { ...t, title } : t));
        }
        return [
          { threadId, title, messageCount: 1, lastMessageAt: new Date().toISOString(), createdAt: new Date().toISOString() },
          ...prev,
        ];
      });
    };
    window.addEventListener('audos:chat-user-message', onUserMessage);
    return () => window.removeEventListener('audos:chat-user-message', onUserMessage);
  }, []);

  const createThread = () => {
    const id = makeThreadId();
    setStartedThreadIds(prev => (prev.has(id) ? prev : new Set(prev).add(id)));
    setThreads(prev => [
      { threadId: id, title: 'New conversation', messageCount: 0, lastMessageAt: null, createdAt: new Date().toISOString() },
      ...prev,
    ]);
    setActiveThreadId(id);
    setIsMobileDrawerOpen(false);
    // Customer shell: the chat lives in the right overlay — flipping the
    // mobile view here would swap the page behind it out for the chat.
    if (isBuilderView) setMobileView('chat');
    trackEvent('thread_created', { threadId: id });
    return id;
  };

  // Delete a conversation (with confirmation, ChatGPT-style). Hides it
  // persistently; if it was active, move to the primary thread or a fresh one.
  const deleteThread = (threadId: string) => {
    setConfirmingDeleteId(null);
    setHiddenThreadIds(prev => new Set(prev).add(threadId));
    setThreads(prev => prev.filter(t => t.threadId !== threadId));
    setStartedThreadIds(prev => {
      if (!prev.has(threadId)) return prev;
      const next = new Set(prev);
      next.delete(threadId);
      return next;
    });
    if (threadId === activeThreadId) {
      const fallback = threads.find(
        t => t.threadId !== threadId && !hiddenThreadIds.has(t.threadId),
      );
      if (fallback) {
        setActiveThreadId(fallback.threadId);
      } else {
        createThread();
      }
    }
    trackEvent('thread_deleted', { threadId });
  };

  // Track whether hash change was triggered internally (to avoid reacting to our own updates)
  const isInternalHashChange = useRef(false);
  // Track if initial deep-link setup has been done
  const hasInitialized = useRef(false);
  // Track if space_entered has been tracked to avoid duplicates
  const hasTrackedSpaceEntry = useRef(false);

  const openPanel = (panelId: PanelId) => {
    setIsPanelExpanded(false);
    setIsAppHomeShell(false);
    const app = config.apps.find(a => a.id === panelId);
    if (app) {
      trackEvent('app_opened', { appId: panelId, appName: app.name });
    }
    setActivePanelId(panelId);
    setMobileView('panel');
    setIsMobileDrawerOpen(false);
  };

  const closePanel = () => {
    setActivePanelId(null);
    setIsPanelExpanded(false);
    setIsAppHomeShell(false);
    setOverlayView(null);
    setMobileView('chat');
  };

  // --- Top-right toggles (no dead-end states) ---------------------------
  // Settings is a TRUE TOGGLE: open it, tap again and you're back where you
  // were (the app you had open, else the default landing app / dashboard,
  // else the chat) — never a one-way door.
  const panelBeforeSettingsRef = useRef<PanelId | null>(null);
  const toggleSettings = () => {
    if (!isBuilderView) {
      // Customer shell: Settings is a right-side overlay panel — it slides
      // in over the page (never a split), and opening it closes the Beau
      // chat overlay automatically.
      setOverlayView((prev) => (prev === 'settings' ? null : 'settings'));
      return;
    }
    if (activePanelId === 'settings') {
      const previous = panelBeforeSettingsRef.current;
      panelBeforeSettingsRef.current = null;
      if (previous && previous !== 'settings') {
        openPanel(previous);
      } else if (defaultLandingApp) {
        openPanel(defaultLandingApp.id);
      } else {
        closePanel();
      }
    } else {
      panelBeforeSettingsRef.current = activePanelId;
      openPanel('settings');
    }
  };

  // The Beau/chat button is a TRUE TOGGLE too: tap to open the conversation,
  // tap again to return to the screen you were on.
  const toggleAgentView = () => {
    if (!isBuilderView) {
      // Customer shell: the Beau button toggles the right-side chat overlay
      // over the page. When no app is open the chat IS the main surface —
      // the button just dismisses any open overlay.
      if (activePanelId) {
        setOverlayView((prev) => (prev === 'chat' ? null : 'chat'));
      } else {
        setOverlayView(null);
      }
      return;
    }
    if (isMobile) {
      if (activePanelId && mobileView === 'chat') {
        setMobileView('panel');
      } else {
        returnToAgentView();
      }
      return;
    }
    if (activePanelId && !isPanelExpanded) {
      // Chat is already visible beside the page — toggle back to the page.
      setIsPanelExpanded(true);
      return;
    }
    returnToAgentView();
  };

  // Papa Principle (app-vs-agent default face). Every product here is part
  // app + part agent; the v0 planning agent decides which face it leads with
  // and records it as desktop.layout.defaultLandingView in config.json:
  //   - 'agent' (or absent): land in the conversation (v4 default,
  //     back-compat with configs that predate the field).
  //   - 'app': land on the fully-expanded app view ("app home"), with a
  //     clear path back to the agent (assistant pill in the header).
  const layoutConfig = config?.desktop?.layout as
    | { defaultLandingView?: string; defaultLandingAppId?: string }
    | undefined;
  const defaultLandingApp = (() => {
    if (layoutConfig?.defaultLandingView !== 'app') return null;
    if (!config.apps.length) return null;
    const wanted = layoutConfig?.defaultLandingAppId?.toLowerCase();
    const byId = wanted
      ? config.apps.find(a => a.id.toLowerCase() === wanted)
      : undefined;
    return byId || config.apps[0];
  })();

  // Leave the app-home landing state and return to the agent-centric view:
  // panel stays open but un-expanded (side-by-side with the chat on wide
  // viewports), sidebar reopens, and narrow viewports switch to the chat.
  const returnToAgentView = () => {
    setIsAppHomeShell(false);
    setIsPanelExpanded(false);
    if (isBuilderView) setIsSidebarOpen(true);
    setMobileView('chat');
    trackEvent('agent_view_opened', { source: 'app_home_header' });
  };

  // Show email gate for customer mode if no session (from context)
  const publicAppBypass = (() => {
    if (typeof window === 'undefined') return false;
    // space-app-only mode: the config designates a specific app as the public
    // entry for the root URL — no email gate required regardless of session state.
    const configEntryMode = (config as any).publicEntry?.mode;
    const configEntryAppId = (config as any).publicEntry?.appId;
    if (configEntryMode === 'space-app-only' && configEntryAppId) {
      return true;
    }
    const params = new URLSearchParams(window.location.search);
    const requestedAppId = params.get('app') || (window as any).__DEEP_LINK_APP_ID__ || initialAppId;
    if (!requestedAppId) return false;
    const matchingApp = config.apps.find(a => a.id.toLowerCase() === String(requestedAppId).toLowerCase());
    return !!matchingApp && (matchingApp as any).public === true;
  })();
  const forceVisitor =
    typeof window !== 'undefined' && (window as any).__AUDOS_FORCE_VISITOR__ === true;
  const showEmailGate =
    mode === 'customer' &&
    (forceVisitor || (!sessionId && !isBootstrappingSession && !publicAppBypass));

  // Track space_entered when session becomes available (first entry after email gate)
  useEffect(() => {
    if (sessionId && !hasTrackedSpaceEntry.current) {
      hasTrackedSpaceEntry.current = true;
      trackEvent('space_entered', {
        referrer: document.referrer || null,
        url: window.location.href,
      });
    }
  }, [sessionId, trackEvent]);

  // Handle URL hash-based deep linking (ONLY on initial mount).
  // Agent-first default: no panel open — the conversation is the landing surface.
  useEffect(() => {
    if (hasInitialized.current) return;
    if (!sessionId && !publicAppBypass) return;

    hasInitialized.current = true;

    const hash = window.location.hash.slice(1).toLowerCase();
    const urlAppParam = new URLSearchParams(window.location.search).get('app') || (window as any).__DEEP_LINK_APP_ID__ || initialAppId;

    const deepLinkId = hash || urlAppParam?.toLowerCase() || '';

    if (deepLinkId) {
      const matchingApp = config.apps.find(
        app => app.id.toLowerCase() === deepLinkId || app.name.toLowerCase() === deepLinkId
      );

      if (matchingApp) {
        openPanel(matchingApp.id);
        return;
      }

      if (deepLinkId === 'files' || deepLinkId === 'memory') {
        openPanel('files');
        return;
      }

      if (deepLinkId === 'settings') {
        if (isBuilderView) {
          openPanel('settings');
          return;
        }
        // Customer shell: settings is an overlay — fall through so the
        // default landing surface renders behind it.
        setOverlayView('settings');
      }
    }

    // Papa Principle: when the planning agent marked this product app-first
    // (desktop.layout.defaultLandingView === 'app'), land on the fully
    // expanded app view instead of the conversation. The agent stays one
    // tap away (assistant pill in the app-home header; browser back also
    // returns to the chat). Deep links above always take precedence.
    if (defaultLandingApp) {
      setActivePanelId(defaultLandingApp.id);
      setIsPanelExpanded(true);
      setIsSidebarOpen(false);
      setMobileView('panel');
      setIsAppHomeShell(true);
      trackEvent('app_opened', {
        appId: defaultLandingApp.id,
        appName: defaultLandingApp.name,
        source: 'default_landing',
      });
      return;
    }
    // Default: land in the agent conversation, no panel.
  }, [sessionId, config.apps]);

  // Update URL hash when active panel changes
  useEffect(() => {
    if (activePanelId) {
      const currentHash = window.location.hash.slice(1);
      if (currentHash !== activePanelId) {
        isInternalHashChange.current = true;
        window.location.hash = activePanelId;
        setTimeout(() => {
          isInternalHashChange.current = false;
        }, 0);
      }
    } else {
      if (window.location.hash) {
        isInternalHashChange.current = true;
        window.location.hash = '';
        setTimeout(() => {
          isInternalHashChange.current = false;
        }, 0);
      }
    }
  }, [activePanelId]);

  // Listen for browser back/forward navigation via hash changes
  useEffect(() => {
    const handleHashChange = () => {
      if (isInternalHashChange.current) {
        return;
      }

      const hash = window.location.hash.slice(1).toLowerCase();

      if (!hash) {
        closePanel();
        return;
      }

      const matchingApp = config.apps.find(
        app => app.id.toLowerCase() === hash || app.name.toLowerCase() === hash
      );

      if (matchingApp) {
        openPanel(matchingApp.id);
        return;
      }

      if (hash === 'files' || hash === 'memory') {
        openPanel('files');
        return;
      }

      if (hash === 'settings') {
        if (isBuilderView) {
          openPanel('settings');
        } else {
          setOverlayView('settings');
        }
        return;
      }

      closePanel();
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [config.apps]);

  // Listen for app deep-link events from agent chat (openApp contract)
  useEffect(() => {
    const handleOpenApp = (event: CustomEvent) => {
      const { appId } = event.detail;
      if (appId) {
        setActivePanelId(appId);
        setMobileView('panel');
      }
    };

    window.addEventListener('openApp', handleOpenApp as EventListener);
    return () => window.removeEventListener('openApp', handleOpenApp as EventListener);
  }, []);

  // Listen for closeApp events dispatched by mini-apps (e.g. VoiceBuddy)
  useEffect(() => {
    const handleCloseApp = () => {
      setActivePanelId(null);
      setOverlayView(null);
      setMobileView('chat');
    };

    window.addEventListener('closeApp', handleCloseApp as EventListener);
    return () => window.removeEventListener('closeApp', handleCloseApp as EventListener);
  }, []);

  // Keyboard shortcut: Cmd+M (Mac) / Ctrl+M (Windows) to toggle Memory panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        if (activePanelId === 'files') {
          closePanel();
        } else {
          openPanel('files');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activePanelId]);

  const handleFileAccess = (log: FileAccessLog) => {
    setFileAccessLogs(prev => [...prev, log]);
  };

  // Resolve the active panel's metadata
  const isAppPanel = activePanelId && !['files', 'settings'].includes(activePanelId);
  const currentAppConfig = isAppPanel ? config.apps.find(app => app.id === activePanelId) : null;
  const CurrentApp = isAppPanel && activePanelId ? apps[activePanelId] : null;

  const agentDisplayName = ((config as any).agent?.name as string | undefined) || 'Assistant';

  const runtimeTheme = resolveGenesisRuntimeTheme(config);
  const themeVariables = (runtimeTheme.themeTokens.cssVariables || {}) as Record<string, string>;
  const rootStyle = {
    ...themeVariables,
    ['--space-font-family' as any]:
      runtimeTheme.themeTokens.typography?.fontFamily ||
      buildFontFamily(runtimeTheme.themeTokens.typography?.headingFont),
    // Warm Editorial typography (Pass Thirty-One): headlines carry Cormorant
    // Garamond via --space-font-heading (see the global h1–h4 rule below);
    // body text runs on Lora from --space-font-family — one serif pair.
    ['--space-font-heading' as any]:
      themeVariables['--space-font-heading'] ||
      `"${runtimeTheme.themeTokens.typography?.headingFont || 'Jost'}", Georgia, serif`,
    fontFamily:
      runtimeTheme.themeTokens.typography?.fontFamily ||
      buildFontFamily(runtimeTheme.themeTokens.typography?.headingFont),
    background: 'linear-gradient(135deg, var(--space-surface-gradient-from), var(--space-surface-gradient-via), var(--space-surface-gradient-to))',
    color: 'var(--space-text-primary)',
  } as React.CSSProperties;

  const activeThread = displayThreads.find(t => t.threadId === activeThreadId);
  const activeThreadTitle = activeThread?.title || 'Conversation';

  // Show brief loading indicator while post-checkout auto-session is being established
  if (isBootstrappingSession) {
    return (
      <div
        style={{ background: 'var(--space-surface-page)' } as React.CSSProperties}
        className="fixed inset-0 flex items-center justify-center"
      >
        <div className="flex flex-col items-center gap-3 opacity-70">
          {LoadingSpinner ? <LoadingSpinner /> : <div className="w-8 h-8 rounded-full border-2 border-current border-t-transparent animate-spin" />}
          <span className="text-sm" style={{ color: 'var(--space-text-primary)' }}>Setting up your account…</span>
        </div>
      </div>
    );
  }

  // Show email gate if no session in customer mode
  if (showEmailGate) {
    return (
      <EmailGate
        spaceId={spaceId}
        branding={runtimeTheme.branding}
        themeTokens={runtimeTheme.themeTokens}
      />
    );
  }

  // Block rendering until subscription status resolves to prevent
  // flashing protected content before the access check redirects.
  //
  // A CACHED VERDICT COUNTS. This used to wait for the network every time,
  // holding a returning customer behind a full-screen spinner for as long as
  // the entitlement endpoint took — up to the 8s timeout below — even though
  // their status was already known locally. Note that the timeout fallback
  // unblocks with NO verdict at all, so proceeding on a cached one is strictly
  // safer than the behaviour that already existed. Revalidation continues in
  // the background and `checkAppAccess` redirects if the fresh answer differs.
  const hasVerdict = subscriptionReady || subscription != null;
  if (mode === 'customer' && sessionId && !hasVerdict && !subscriptionTimedOut) {
    return (
      <div
        style={{ background: 'var(--space-surface-page)' } as React.CSSProperties}
        className="fixed inset-0 flex items-center justify-center"
      >
        <div className="flex flex-col items-center gap-3 opacity-70">
          {LoadingSpinner ? <LoadingSpinner /> : <div className="w-8 h-8 rounded-full border-2 border-current border-t-transparent animate-spin" />}
        </div>
      </div>
    );
  }

  // Tenant agent handoff (Product Run iframe): render the target app edge-to-edge
  // with no sidebar, chat, or panel chrome.
  if (isTenantDelegationCanvas()) {
    if (!isAppPanel || !CurrentApp || !currentAppConfig) {
      return (
        <div className="fixed inset-0 flex items-center justify-center" style={rootStyle}>
          {LoadingSpinner ? <LoadingSpinner /> : <div className="w-8 h-8 rounded-full border-2 border-current border-t-transparent animate-spin" />}
        </div>
      );
    }

    return (
      <div
        className="fixed inset-0 overflow-hidden bg-[var(--space-surface-card)]"
        style={rootStyle}
        data-testid="tenant-delegation-canvas"
      >
        <AppErrorBoundary key={currentAppConfig.id} appName={currentAppConfig.name}>
          <Suspense fallback={LoadingSpinner ? <LoadingSpinner /> : null}>
            <CurrentApp appConfig={currentAppConfig} dataFile={currentAppConfig.dataFile || ''} />
          </Suspense>
        </AppErrorBoundary>
      </div>
    );
  }

  // --- Shared render pieces ---------------------------------------------

  const renderSidebarContent = (opts: { onClose?: () => void }) => (
    <div className="flex flex-col h-full min-h-0">
      {/* Sidebar header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {runtimeTheme.branding.logoUrl && (
            <img
              src={runtimeTheme.branding.logoUrl}
              alt=""
              className="w-9 h-9 rounded-lg object-contain flex-shrink-0"
            />
          )}
          <span className="text-sm font-semibold truncate text-[var(--space-text-primary)]">
            {runtimeTheme.branding.name}
          </span>
        </div>
        {opts.onClose && (
          <button
            onClick={opts.onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--space-surface-muted)] transition-colors text-[var(--space-text-secondary)]"
            title="Hide sidebar"
            data-testid="button-sidebar-close"
          >
            {isMobile ? <X className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* New conversation */}
      <div className="px-3 pb-2">
        <button
          onClick={createThread}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors bg-transparent border border-[var(--space-brand-primary)] text-[var(--space-brand-primary-700)] hover:bg-[var(--space-surface-accent-soft)]"
          data-testid="button-new-thread"
        >
          <Plus className="w-4 h-4" />
          New conversation
        </button>
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto min-h-0 px-3 py-1">
        {displayThreads.length > 0 && (
          <div className="text-[11px] font-medium uppercase tracking-wide px-2 pt-2 pb-1 text-[var(--space-text-muted)]">
            Conversations
          </div>
        )}
        <div className="flex flex-col gap-0.5">
          {displayThreads.map(thread => {
            const isActive = thread.threadId === activeThreadId;
            const isConfirming = confirmingDeleteId === thread.threadId;
            return (
              <div
                key={thread.threadId}
                className={`group flex items-center gap-1 pr-1.5 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-[var(--space-surface-muted)]'
                    : 'hover:bg-[var(--space-surface-muted)]'
                }`}
              >
                <button
                  onClick={() => selectThread(thread.threadId)}
                  className={`flex-1 min-w-0 flex items-center gap-2 px-2.5 py-2 text-left text-sm ${
                    isActive
                      ? 'text-[var(--space-text-primary)] font-medium'
                      : 'text-[var(--space-text-secondary)]'
                  }`}
                  data-testid={`button-thread-${thread.threadId}`}
                >
                  <MessageCircle className="w-4 h-4 flex-shrink-0 opacity-60" />
                  <span className="truncate">{thread.title || 'New conversation'}</span>
                </button>
                {isConfirming ? (
                  <span className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => deleteThread(thread.threadId)}
                      className="px-1.5 py-1 rounded-md text-[11px] font-medium bg-[var(--space-semantic-danger)] text-[var(--space-text-on-primary)]"
                      title="Confirm delete"
                      data-testid={`button-confirm-delete-thread-${thread.threadId}`}
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setConfirmingDeleteId(null)}
                      className="p-1 rounded-md hover:bg-[var(--space-surface-card)] text-[var(--space-text-secondary)]"
                      title="Keep conversation"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmingDeleteId(thread.threadId)}
                    className="flex-shrink-0 p-1 rounded-md text-[var(--space-text-muted)] hover:text-[var(--space-semantic-danger)] hover:bg-[var(--space-surface-card)] transition-all md:opacity-0 md:group-hover:opacity-100 focus:opacity-100"
                    title="Delete conversation"
                    data-testid={`button-delete-thread-${thread.threadId}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Apps section */}
        {config.apps.length > 0 && (
          <>
            <div className="text-[11px] font-medium uppercase tracking-wide px-2 pt-4 pb-1 text-[var(--space-text-muted)]">
              Apps
            </div>
            <div className="flex flex-col gap-2 px-0.5 pt-1">
              {config.apps.map(app => {
                const isActive = activePanelId === app.id;
                const IconComponent = app.icon && iconMap[app.icon] ? iconMap[app.icon] : Activity;
                return (
                  <button
                    key={app.id}
                    onClick={() => openPanel(app.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left transition-all border ${
                      isActive
                        ? 'bg-[var(--space-surface-card)] border-[var(--space-brand-primary-500)]/40 shadow-[0_4px_14px_rgba(0,0,0,0.08)]'
                        : 'bg-[var(--space-surface-card)] border-[var(--space-border-default)] shadow-[0_1px_4px_rgba(0,0,0,0.05)] hover:shadow-[0_4px_14px_rgba(0,0,0,0.09)] hover:-translate-y-px'
                    }`}
                    data-testid={`button-app-${app.id}`}
                  >
                    <span className="w-9 h-9 rounded-xl bg-[var(--space-surface-accent-soft)] flex items-center justify-center flex-shrink-0">
                      <IconComponent className="w-[18px] h-[18px] text-[var(--space-text-brand)]" />
                    </span>
                    <span className="min-w-0 flex flex-col">
                      <span className="truncate text-sm font-medium text-[var(--space-text-primary)]">{app.name}</span>
                      <span className="truncate text-[11px] text-[var(--space-text-muted)]">{isActive ? 'Open now' : 'Open app'}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Sidebar footer: memory + settings */}
      <div className="px-3 py-3 flex flex-col gap-0.5">
        {mode === 'entrepreneur' && (
          <button
            onClick={() => openPanel('files')}
            className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-sm transition-colors ${
              activePanelId === 'files'
                ? 'bg-[var(--space-surface-muted)] text-[var(--space-text-primary)] font-medium'
                : 'text-[var(--space-text-secondary)] hover:bg-[var(--space-surface-muted)]'
            }`}
            data-testid="button-panel-files"
          >
            <Folder className="w-4 h-4 opacity-60" />
            Memory
          </button>
        )}
        <button
          onClick={() => openPanel('settings')}
          className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-sm transition-colors ${
            activePanelId === 'settings'
              ? 'bg-[var(--space-surface-muted)] text-[var(--space-text-primary)] font-medium'
              : 'text-[var(--space-text-secondary)] hover:bg-[var(--space-surface-muted)]'
          }`}
          data-testid="button-panel-settings"
        >
          <SettingsIcon className="w-4 h-4 opacity-60" />
          Settings
        </button>
      </div>
    </div>
  );

  const renderPanelHeader = () => {
    // The Warm Editorial masthead belongs to every Ethaion app screen, not
    // only the initial app-home state. Keeping it outside transient
    // isAppHomeShell state prevents navigation, edits and refreshes from
    // replacing the wordmark with the generic small app icon header.
    if (isAppPanel && currentAppConfig) {
      // The wordmark IS the identity — ETHAION centred in Cormorant Garamond
      // with a 1px accent rule running out from each side, utilities
      // right-aligned, all on a --paper header. No pictorial mark or logo
      // image appears in the app masthead.
      return (
        <div
          className="grid items-center px-4 flex-shrink-0 border-b border-[var(--space-border-default)] bg-[var(--space-surface-card)] min-h-[88px] sm:min-h-[104px]"
          style={{ gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)' }}
        >
          {/* Three columns, and the two outer ones are minmax(0,1fr) — so they
              are always EXACTLY equal in width whatever the controls on the
              right happen to measure. The wordmark therefore sits at the true
              centre of the header (which spans the full viewport), not in the
              space left over beside the toggles. The left slot is an empty
              mirror of the right one; nothing may be added to it. */}
          <span aria-hidden="true" className="min-w-0" />
          <div className="flex items-center justify-center gap-3 sm:gap-4 min-w-0">
            <span className="hidden sm:block w-[110px] md:w-[200px] min-w-0 h-px bg-[var(--space-brand-primary)]" aria-hidden="true" />
            <span className="hab-wordmark text-[19px] sm:text-[30px] md:text-[34px] leading-none text-[#241a12] whitespace-nowrap flex-shrink-0" style={{ paddingLeft: '0.28em' }}>
              {runtimeTheme.branding.name}
            </span>
            <span className="hidden sm:block w-[110px] md:w-[200px] min-w-0 h-px bg-[var(--space-brand-primary)]" aria-hidden="true" />
          </div>
          {/* Clean top-right corner: the Beau chat toggle plus a distinct
              Settings toggle — both true toggles, no dead ends. Right-anchored
              inside the right-hand slot; neither their size nor their number
              can move the wordmark. */}
          <div className="flex items-center justify-end gap-2 min-w-0">
            <button
              onClick={toggleAgentView}
              className="flex items-center gap-1.5 px-3 sm:px-4 min-h-[42px] rounded text-[13px] font-medium flex-shrink-0 bg-transparent text-[var(--color-accent-700,#7c4a17)] border border-[var(--color-accent,#a8712c)] hover:bg-[var(--color-accent-100,#fbf1de)] transition-all"
              title="Talk to Beau — tap again to come back"
              aria-label="Ask Beau"
              data-testid="button-open-assistant"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              {/* Narrow viewports drop the verb so the right-hand controls stay
                  slim enough for a truly centred wordmark to clear them. */}
              <span className="hidden sm:inline">Ask&nbsp;</span>Beau
            </button>
            {!isBuilderView && (
              <button
                onClick={toggleSettings}
                className="p-1.5 rounded-lg hover:bg-[var(--space-surface-muted)] transition-colors text-[var(--space-text-secondary)]"
                title="Settings"
                data-testid="button-apphome-settings"
              >
                <SettingsIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      );
    }
    return (
    <div className="flex items-center justify-between px-4 py-3 flex-shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        {/* Pass Six: no top-left arrow. The header leads with the page's
            identity; all navigation lives in the Beau + Settings toggles on
            the right, so the bar stays uncluttered. */}
        {activePanelId === 'files' && (
          <>
            <Folder className="w-4 h-4 text-[var(--space-text-secondary)]" />
            <span className="text-sm font-semibold text-[var(--space-text-primary)]">Memory</span>
          </>
        )}
        {activePanelId === 'settings' && (
          <>
            <SettingsIcon className="w-4 h-4 text-[var(--space-text-secondary)]" />
            <span className="text-sm font-semibold text-[var(--space-text-primary)]">Settings</span>
          </>
        )}
        {isAppPanel && currentAppConfig && (
          <>
            {(() => {
              const IconComponent = currentAppConfig.icon && iconMap[currentAppConfig.icon] ? iconMap[currentAppConfig.icon] : Activity;
              return (
                <span className="w-7 h-7 rounded-lg bg-[var(--space-surface-accent-soft)] flex items-center justify-center flex-shrink-0">
                  <IconComponent className="w-4 h-4 text-[var(--space-text-brand)]" />
                </span>
              );
            })()}
            <span className="text-sm font-semibold text-[var(--space-text-primary)]">{currentAppConfig.name}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        {/* Assistant is a distinct destination, visually separated from
            window/navigation controls so it cannot be mistaken for Back.
            It's a toggle: open Beau, tap again to return to this page. */}
        <button
          onClick={toggleAgentView}
          className="flex items-center gap-1.5 px-4 min-h-[42px] rounded text-[13px] font-medium flex-shrink-0 bg-transparent text-[var(--color-accent-700,#7c4a17)] border border-[var(--color-accent,#a8712c)] hover:bg-[var(--color-accent-100,#fbf1de)] transition-all"
          title="Open Beau beside this page — tap again to come back"
          data-testid="button-panel-beau"
        >
          <MessageCircle className="w-3.5 h-3.5" />
          Ask Beau
        </button>
        {!isBuilderView && (
          <button
            onClick={toggleSettings}
            className={`p-1.5 rounded-lg transition-colors ${
              activePanelId === 'settings'
                ? 'bg-[var(--space-surface-muted)] text-[var(--space-text-primary)]'
                : 'hover:bg-[var(--space-surface-muted)] text-[var(--space-text-secondary)]'
            }`}
            title={activePanelId === 'settings' ? 'Close settings' : 'Settings'}
            data-testid="button-panel-settings-toggle"
          >
            <SettingsIcon className="w-4 h-4" />
          </button>
        )}
        {/* Pass Six: the expand/collapse arrow is gone — the Beau button IS
            the toggle (open the chat beside the page, tap again to close it
            and give the page the full width). */}
      </div>
    </div>
    );
  };

  const renderPanelBody = () => (
    <div className="flex-1 overflow-y-auto min-h-0 bg-[var(--space-surface-card)]">
      {activePanelId === 'files' && (
        <Suspense fallback={LoadingSpinner ? <LoadingSpinner /> : null}>
          <FileBrowser fileAccessLogs={fileAccessLogs} />
        </Suspense>
      )}
      {activePanelId === 'settings' && (
        <div>
          {/* Back lives INSIDE the settings screen (no top-bar arrow):
              one tap returns to wherever the visitor came from — the app
              they had open, else the dashboard. */}
          {!isBuilderView && (
            <div className="px-4 pt-4 -mb-1">
              <button
                onClick={toggleSettings}
                className="inline-flex items-center gap-1 text-sm font-medium text-[var(--space-text-brand)] hover:underline"
                data-testid="button-settings-back"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
            </div>
          )}
          <Suspense fallback={LoadingSpinner ? <LoadingSpinner /> : null}>
            <Settings spaceId={spaceId} />
          </Suspense>
        </div>
      )}
      {isAppPanel && CurrentApp && currentAppConfig && (
        <AppErrorBoundary key={currentAppConfig.id} appName={currentAppConfig.name}>
          <Suspense fallback={<LoadingSpinner />}>
            <CurrentApp appConfig={currentAppConfig} dataFile={currentAppConfig.dataFile || ''} />
          </Suspense>
        </AppErrorBoundary>
      )}
    </div>
  );

  const agentChatElement = (
    <Suspense fallback={LoadingSpinner ? <LoadingSpinner /> : null}>
      <AgentChat
        key={activeThreadId}
        spaceId={spaceId}
        threadId={activeThreadId}
        onFileAccess={handleFileAccess}
        pendingMessage={pendingAgentMessage}
        onPendingMessageConsumed={() => setPendingAgentMessage(null)}
      />
    </Suspense>
  );

  // Pass Twenty-Nine (multi-chat Beau): customers get the full conversation
  // system — a chat-list entry screen, arbitrary new clean-slate chats,
  // auto-named threads, folders, pin and delete — wrapped around the same
  // per-thread AgentChat. The builder view keeps its own thread sidebar.
  const customerChatElement = (
    <Suspense fallback={LoadingSpinner ? <LoadingSpinner /> : null}>
      <BeauConversations
        spaceId={spaceId}
        onFileAccess={handleFileAccess}
        pendingMessage={pendingAgentMessage}
        onPendingMessageConsumed={() => setPendingAgentMessage(null)}
      />
    </Suspense>
  );

  return (
    <>
      {/* Google Fonts - load brand typography */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      {/* Pass Thirty-Six: the founder's visual spec pins the exact families
          and weights — Cormorant Garamond (300–600 + italic 400) for display,
          Lora (400/500 + italic 400) for body. Never bold: 600 exists only
          for rare small-caps emphasis; headings cap at 500. */}
      <link
        href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,400&family=Lora:ital,wght@0,400;0,500;1,400&display=swap"
        rel="stylesheet"
      />
      {/* Beau chat slide-in: the conversation eases in from the left instead
          of snapping, so the Beau toggle feels like a panel, not a page
          navigation. Re-runs whenever the chat surface reappears. */}
      <style>{`@keyframes habitusChatIn{from{opacity:0;transform:translateX(-32px)}to{opacity:1;transform:translateX(0)}}`}</style>
      {/* Warm Editorial design system (Pass Thirty-One). One global sheet
          enforces the editorial geometry everywhere:
          — serif display headings (Cormorant Garamond, never bolder than 500)
          — 4px maximum corner radius (photographs and plates are square)
          — no drop shadows: hairlines carry the structure
          — accent-outline keyboard focus on every interactive element
          — shared utility classes: .hab-wordmark, .hab-page-title,
            .hab-section-head, .hab-kicker, .hab-plate, .hab-reason.
          rounded-full pills are deliberately untouched. */}
      <style>{`
        :root{
          /* grounds */
          --color-bg:#efe7d9;
          --paper:#fbf8f1;
          --walnut:#241a12;
          --color-surface:#e4d8c3;
          --color-text:#3b2b1d;
          --color-divider:color-mix(in srgb, #3b2b1d 18%, transparent);
          /* neutrals */
          --color-neutral-100:#f7f2e9;
          --color-neutral-200:#eadfcb;
          --color-neutral-300:#dccdb2;
          --color-neutral-400:#c5b193;
          --color-neutral-500:#a68e70;
          --color-neutral-600:#856c51;
          --color-neutral-700:#634e38;
          --color-neutral-800:#453325;
          --color-neutral-900:#2b1e14;
          /* accent — antique gold */
          --color-accent:#a8712c;
          --color-accent-100:#fbf1de;
          --color-accent-200:#f3ddb6;
          --color-accent-300:#e3c184;
          --color-accent-400:#cb9d51;
          --color-accent-500:#b07d31;
          --color-accent-600:#96631f;
          --color-accent-700:#7c4a17;
          --color-accent-800:#5c3413;
          --color-accent-900:#3d2210;
          --color-accent-2:#7d2a24;
        }
        a{color:var(--color-accent-700)}
        a:hover{color:var(--color-accent)}
        h1,h2,h3,h4{font-family:var(--space-font-heading, var(--space-font-family, inherit));font-weight:400;letter-spacing:-0.015em;}
        button{font-family:var(--space-font-heading, inherit);}
        input,textarea,select{font-family:var(--space-font-family, inherit);}
        /* Pass Forty-One shape rules: radius 0 everywhere; 4px ONLY on
           buttons, text inputs, tag pills and links-as-buttons. Colour dot
           swatches (span.rounded-full) stay circular. */
        .rounded-3xl,.rounded-2xl,.rounded-xl,.rounded-lg,.rounded-md{border-radius:0!important}
        button.rounded-3xl,button.rounded-2xl,button.rounded-xl,button.rounded-lg,button.rounded-md,a.rounded-3xl,a.rounded-2xl,a.rounded-xl,a.rounded-lg,a.rounded-md,input,textarea,select{border-radius:4px!important}
        button.rounded-full,a.rounded-full,label.rounded-full{border-radius:4px!important}
        .rounded-t-2xl{border-top-left-radius:0!important;border-top-right-radius:0!important}
        /* Pass Forty-One: NO box-shadow anywhere. No exceptions. */
        *,*::before,*::after{box-shadow:none!important}
        /* Pass Forty-One: nothing white, nothing cool-grey — warm paper instead. */
        .bg-white{background-color:var(--paper,#fbf8f1)!important}
        [class*="bg-gray-"],[class*="bg-slate-"],[class*="bg-zinc-"]{background-color:var(--paper,#fbf8f1)!important}
        .font-semibold,.font-bold,.font-extrabold{font-weight:500!important}
        :focus-visible{outline:2px solid var(--space-brand-primary,#a8712c);outline-offset:2px}
        ::selection{background:rgba(168,113,44,0.28)}
        .hab-wordmark{font-family:var(--space-font-heading);font-weight:400;text-transform:uppercase;letter-spacing:0.28em}
        .hab-page-title{font-family:var(--space-font-heading);font-weight:400!important;font-size:52px;line-height:1.04;letter-spacing:-0.015em}
        @media (max-width:640px){.hab-page-title{font-size:38px}}
        .hab-section-head{font-family:var(--space-font-heading);font-weight:400!important;font-size:24px;line-height:1.15}
        .hab-standfirst{font-family:var(--space-font-family);font-size:16px;line-height:1.55;max-width:54ch}
        .hab-kicker{font-family:var(--space-font-heading);font-weight:500;font-size:12px;text-transform:uppercase;letter-spacing:0.16em}
        .hab-plate{border:1px solid var(--color-neutral-300,#dccdb2);padding:5px;background:var(--paper,#fbf8f1);border-radius:0!important}
        .hab-plate-empty{border:1px dashed var(--color-neutral-300,#dccdb2);padding:5px;background:var(--paper,#fbf8f1);border-radius:0!important}
        .hab-caption{font-family:ui-monospace,Menlo,monospace;font-size:9.5px;color:var(--color-neutral-700,#634e38)}
        .hab-row-title{font-family:var(--space-font-heading);font-size:19px;font-weight:400;line-height:1.2}
        .hab-fig{font-family:var(--space-font-heading);font-weight:400;font-variant-numeric:tabular-nums;line-height:1}
        .hab-fig .pct{font-size:.33em;color:var(--color-neutral-600,#856c51)}
        .hab-ticks{display:flex;gap:3px}
        .hab-ticks i{display:block;flex:1;height:3px;background:var(--color-neutral-300,#dccdb2)}
        .hab-ticks i.on{background:var(--color-accent,#a8712c)}
        .hab-input{background:transparent;border:1px solid var(--color-divider,rgba(59,43,29,0.18));border-radius:4px;min-height:46px;padding:0 14px;font-family:var(--space-font-family);font-size:14px;color:var(--color-text,#3b2b1d)}
        .hab-reason{border-left:2px solid var(--space-brand-primary,#a8712c);padding-left:16px}
        table,.tabular-nums{font-variant-numeric:tabular-nums}
        /* GLOBAL MOBILE LEGIBILITY (no-clipping rule): at phone widths no
           label may clip, truncate unintentionally or overflow. This is a
           blanket rule for every tab — current and future — not a per-screen
           fix: single-line truncation unwinds into wrapping, nowrap text
           blocks wrap, table cells wrap, and long words break instead of
           overflowing their container. Buttons/links keep their one-line
           behaviour so horizontal chip bars and carousels still scroll. */
        @media (max-width: 480px){
          .truncate{white-space:normal!important;overflow:visible!important;text-overflow:clip!important;overflow-wrap:anywhere}
          span.whitespace-nowrap:not(button *):not(a *),p.whitespace-nowrap,div.whitespace-nowrap{white-space:normal!important;overflow-wrap:anywhere}
          th.whitespace-nowrap,td.whitespace-nowrap{white-space:normal!important}
          h1,h2,h3,h4,h5,p,li,dt,dd,label,legend,figcaption{overflow-wrap:break-word}
          img,video{max-width:100%}
          /* Flex/grid children default to min-width:auto, which lets one
             long label force its row wider than the phone and clip —
             min-width:0 lets text wrap inside its cell instead. Fixed-width
             children (icons, thumbnails, flex-shrink-0 chips) keep their
             explicit sizes and are unaffected. */
          .flex>*{min-width:0}
          [class*="grid-cols-"]>*{min-width:0}
        }
      `}</style>

      {/* Unified responsive shell — a single layout tree (sidebar | chat |
          app panel) that reflows via CSS across the mobile/desktop threshold.
          AgentChat is rendered from ONE stable location so it is never
          unmounted just because the viewport crossed the breakpoint. */}
      <div className="fixed inset-0 flex overflow-hidden" style={rootStyle}>
        {/* Narrow-only backdrop for the off-canvas sidebar drawer */}
        {isBuilderView && isMobileDrawerOpen && (
          <div
            className="md:hidden fixed inset-0 z-40"
            style={{ backgroundColor: 'color-mix(in srgb, var(--space-text-primary) 40%, transparent)' }}
            onClick={() => setIsMobileDrawerOpen(false)}
            data-testid="mobile-drawer-backdrop"
          />
        )}

        {/* Left sidebar — inline collapsible column on wide viewports, an
            off-canvas drawer on narrow ones. One element; presentation is
            driven by responsive CSS so its content/state survives a resize. */}
        {isBuilderView && (
        <aside
          className={`z-50 flex-shrink-0 flex flex-col min-h-0 overflow-hidden transition-all duration-300 ease-in-out max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:w-72 max-md:max-w-[85vw] max-md:shadow-[0_22px_56px_var(--space-shell-shadow-strong)] ${
            isMobileDrawerOpen ? 'max-md:translate-x-0' : 'max-md:-translate-x-full'
          } ${isSidebarOpen ? 'md:w-64' : 'md:w-0'}`}
          style={{ backgroundColor: 'var(--space-surface-panel)' }}
        >
          <div className="w-72 md:w-64 h-full">
            {renderSidebarContent({
              onClose: () => {
                if (isMobile) setIsMobileDrawerOpen(false);
                else setIsSidebarOpen(false);
              },
            })}
          </div>
        </aside>
        )}

        {/* Column to the right of the sidebar: optional narrow top bar + the
            chat/panel content row. */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Narrow-only top bar. For customers with a page open full-screen
              the panel's own header (brand + Beau + Settings) IS the top bar,
              so this one hides — one clean bar, never two stacked. */}
          {!(!isBuilderView && activePanelId && mobileView === 'panel') && (
          <div className="md:hidden flex items-center gap-2 px-3 py-3 border-b border-[var(--space-border-default)] bg-[var(--space-surface-card)] flex-shrink-0">
            {isBuilderView && (
              <button
                onClick={() => setIsMobileDrawerOpen(true)}
                className="p-1.5 rounded-lg hover:bg-[var(--space-surface-muted)] transition-colors text-[var(--space-text-secondary)]"
                title="Menu"
                data-testid="button-mobile-menu"
              >
                <Menu className="w-5 h-5" />
              </button>
            )}
            <span className="flex-1 text-sm font-semibold truncate text-[var(--space-text-primary)]">
              {activePanelId && mobileView === 'panel'
                ? (currentAppConfig?.name || (activePanelId === 'files' ? 'Memory' : activePanelId === 'settings' ? 'Settings' : 'App'))
                : isBuilderView ? activeThreadTitle : runtimeTheme.branding.name}
            </span>
            {isBuilderView && (!activePanelId || mobileView === 'chat') && (
              <button
                onClick={createThread}
                className="p-1.5 rounded-lg hover:bg-[var(--space-surface-muted)] transition-colors text-[var(--space-text-secondary)]"
                title="New conversation"
                data-testid="button-mobile-new-thread"
              >
                <Plus className="w-5 h-5" />
              </button>
            )}
            {/* Beau toggle, active state: the chat is open — tapping it again
                closes the chat and returns the page to full screen. */}
            {activePanelId && mobileView === 'chat' && (
              <button
                onClick={toggleAgentView}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors bg-[var(--space-surface-accent-soft)] text-[var(--space-brand-primary-700)] ring-1 ring-[var(--space-brand-primary)]"
                title="Close the chat and go back"
                data-testid="button-mobile-toggle-view"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                Beau
              </button>
            )}
            {!isBuilderView && (
              <button
                onClick={toggleSettings}
                className={`p-1.5 rounded-lg transition-colors ${
                  activePanelId === 'settings' && mobileView === 'panel'
                    ? 'bg-[var(--space-surface-muted)] text-[var(--space-text-primary)]'
                    : 'hover:bg-[var(--space-surface-muted)] text-[var(--space-text-secondary)]'
                }`}
                title={activePanelId === 'settings' && mobileView === 'panel' ? 'Close settings' : 'Settings'}
                data-testid="button-mobile-settings"
              >
                <SettingsIcon className="w-5 h-5" />
              </button>
            )}
          </div>
          )}

          {/* Content row: chat card + app panel float as separate cards on
              wide viewports; full-bleed and single-surface on narrow ones. */}
          <div className="flex-1 flex min-w-0 min-h-0 md:gap-3 md:p-3">
            {/* Center: agent conversation. Always mounted; hidden on wide when
                a panel is full-screen, and on narrow when the panel view is
                active — via CSS display, never by unmounting. */}
            <main
              className={`flex-1 flex-col min-w-0 min-h-0 overflow-hidden bg-[var(--space-surface-card)] md:rounded-2xl md:shadow-[0_2px_16px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)] ${
                activePanelId && (mobileView === 'panel' || !isBuilderView) ? 'max-md:hidden' : 'max-md:flex'
              } ${activePanelId && (isPanelExpanded || !isBuilderView) ? 'md:hidden' : 'md:flex'}`}
              style={{
                // Warm Editorial: the Beau conversation column is the ONE dark
                // surface — the dark room (#2b1e14 ground, #f7f2e9 text,
                // #e3c184 accent) — a different room from the paper-and-oatmeal
                // pages around it.
                ...beauDarkRoom,
                ...(activePanelId ? { animation: 'habitusChatIn 0.32s cubic-bezier(0.22,1,0.36,1) both' } : null),
              }}
            >
              {/* Wide-only chat header (show-sidebar + thread title + chat management) */}
              <div className="max-md:hidden flex items-center gap-2 px-4 py-3 flex-shrink-0">
                {isBuilderView && !isSidebarOpen && (
                  <button
                    onClick={() => setIsSidebarOpen(true)}
                    className="p-1.5 -ml-1.5 rounded-lg hover:bg-[var(--space-surface-muted)] transition-colors text-[var(--space-text-secondary)]"
                    title="Show sidebar"
                    data-testid="button-sidebar-open"
                  >
                    <PanelLeftOpen className="w-4 h-4" />
                  </button>
                )}
                <span className="text-sm font-semibold truncate text-[var(--space-text-primary)]">
                  {isBuilderView ? activeThreadTitle : runtimeTheme.branding.name}
                </span>
                <span className="flex-1" />
                {/* Chat management — new conversation + delete (with confirm) */}
                {confirmingDeleteId === `header:${activeThreadId}` ? (
                  <span className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-xs text-[var(--space-text-secondary)]">Delete this conversation?</span>
                    <button
                      onClick={() => deleteThread(activeThreadId)}
                      className="px-2 py-1 rounded-md text-[11px] font-medium bg-[var(--space-semantic-danger)] text-[var(--space-text-on-primary)]"
                      data-testid="button-confirm-delete-active-thread"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setConfirmingDeleteId(null)}
                      className="px-2 py-1 rounded-md text-[11px] text-[var(--space-text-secondary)] hover:bg-[var(--space-surface-muted)]"
                    >
                      Keep
                    </button>
                  </span>
                ) : (
                  <span className="flex items-center gap-0.5 flex-shrink-0">
                    {/* Customer conversation management (new chat / rename /
                        pin / folders / delete) lives inside BeauConversations;
                        these header controls are builder-sidebar companions. */}
                    {isBuilderView && (
                    <button
                      onClick={createThread}
                      className="p-1.5 rounded-lg hover:bg-[var(--space-surface-muted)] transition-colors text-[var(--space-text-secondary)]"
                      title="New conversation"
                      data-testid="button-header-new-thread"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                    )}
                    {isBuilderView && (
                    <button
                      onClick={() => setConfirmingDeleteId(`header:${activeThreadId}`)}
                      className="p-1.5 rounded-lg hover:bg-[var(--space-surface-muted)] transition-colors text-[var(--space-text-secondary)] hover:text-[var(--space-semantic-danger)]"
                      title="Delete conversation"
                      data-testid="button-header-delete-thread"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    )}
                    {!isBuilderView && (
                      <button
                        onClick={toggleSettings}
                        className={`p-1.5 rounded-lg transition-colors ${
                          activePanelId === 'settings'
                            ? 'bg-[var(--space-surface-muted)] text-[var(--space-text-primary)]'
                            : 'hover:bg-[var(--space-surface-muted)] transition-colors text-[var(--space-text-secondary)]'
                        }`}
                        title={activePanelId === 'settings' ? 'Close settings' : 'Settings'}
                        data-testid="button-header-settings"
                      >
                        <SettingsIcon className="w-4 h-4" />
                      </button>
                    )}
                  </span>
                )}
              </div>
              <div className="flex-1 overflow-hidden bg-[var(--space-surface-card)]">
                {/* Customer shell with a page open: the chat lives in the
                    right-side overlay instead — never mounted twice. */}
                {!(!isBuilderView && activePanelId) && (isBuilderView ? agentChatElement : customerChatElement)}
              </div>
            </main>

            {/* Right: app panel — a side card on wide (full-width when
                expanded), full-screen on narrow when the panel view is active.
                Kept mounted alongside the chat so state is preserved. */}
            {activePanelId && (
              <section
                className={`flex-col min-h-0 overflow-hidden bg-[var(--space-surface-card)] md:flex md:rounded-2xl md:shadow-[0_2px_16px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)] max-md:flex-1 max-md:min-w-0 ${
                  mobileView === 'panel' ? 'max-md:flex' : 'max-md:hidden'
                } ${isPanelExpanded || !isBuilderView ? 'md:flex-1 md:min-w-0' : 'md:flex-shrink-0 md:w-[clamp(360px,42vw,680px)]'}`}
                data-testid="app-panel"
              >
                {renderPanelHeader()}
                {renderPanelBody()}
              </section>
            )}
          </div>
        </div>

        {/* Customer right-side overlays (Pass Twenty-Eight, Linear-style):
            Beau chat and Settings slide in from the RIGHT over the page —
            ~40% width on desktop, full width on mobile — never a split.
            Dismiss by tapping the backdrop or the X. One overlayView state
            means the two can never appear simultaneously. */}
        {!isBuilderView && (
          <>
            {(overlayView === 'settings' || (overlayView === 'chat' && !!activePanelId)) && (
              <div
                className="fixed inset-0 z-[60]"
                style={{ backgroundColor: 'color-mix(in srgb, var(--space-text-primary) 28%, transparent)' }}
                onClick={() => setOverlayView(null)}
                aria-hidden="true"
                data-testid="overlay-backdrop"
              />
            )}

            {/* Beau chat overlay — kept mounted (translated off-screen when
                closed) so the conversation state survives open/close. Only
                exists while a page is the main surface; otherwise the chat
                IS the main surface and needs no overlay. */}
            {activePanelId && (
              <aside
                className={`fixed inset-y-0 right-0 z-[70] w-full md:w-[40vw] md:min-w-[400px] md:max-w-[680px] flex flex-col bg-[var(--space-surface-card)] md:border-l md:border-[var(--space-border-default)] transition-transform duration-300 ease-out ${
                  overlayView === 'chat' ? 'translate-x-0 shadow-[-12px_0_44px_rgba(0,0,0,0.16)]' : 'translate-x-full'
                }`}
                aria-hidden={overlayView !== 'chat'}
                data-testid="overlay-chat"
                style={beauDarkRoom}
              >
                <div className="flex items-center justify-between px-4 py-3 flex-shrink-0 border-b border-[var(--space-border-default)]">
                  <span className="flex items-center gap-2 min-w-0">
                    <MessageCircle className="w-4 h-4 text-[var(--space-text-brand)]" />
                    <span className="text-sm font-semibold truncate text-[var(--space-text-primary)]">{agentDisplayName}</span>
                  </span>
                  <span className="flex items-center gap-0.5 flex-shrink-0">
                    {/* New chat / conversation management live inside the
                        BeauConversations list — the overlay chrome only closes. */}
                    <button
                      onClick={() => setOverlayView(null)}
                      className="p-1.5 rounded-lg hover:bg-[var(--space-surface-muted)] transition-colors text-[var(--space-text-secondary)]"
                      title="Close"
                      data-testid="button-overlay-chat-close"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </span>
                </div>
                <div className="flex-1 overflow-hidden bg-[var(--space-surface-card)]">
                  {!isBuilderView && activePanelId ? customerChatElement : null}
                </div>
              </aside>
            )}

            {/* Settings overlay — same panel pattern, same dismissal. */}
            <aside
              className={`fixed inset-y-0 right-0 z-[70] w-full md:w-[40vw] md:min-w-[400px] md:max-w-[680px] flex flex-col bg-[var(--space-surface-card)] md:border-l md:border-[var(--space-border-default)] transition-transform duration-300 ease-out ${
                overlayView === 'settings' ? 'translate-x-0 shadow-[-12px_0_44px_rgba(0,0,0,0.16)]' : 'translate-x-full'
              }`}
              aria-hidden={overlayView !== 'settings'}
              data-testid="overlay-settings"
            >
              <div className="flex items-center justify-between px-4 py-3 flex-shrink-0 border-b border-[var(--space-border-default)]">
                <span className="flex items-center gap-2 min-w-0">
                  <SettingsIcon className="w-4 h-4 text-[var(--space-text-secondary)]" />
                  <span className="text-sm font-semibold text-[var(--space-text-primary)]">Settings</span>
                </span>
                <button
                  onClick={() => setOverlayView(null)}
                  className="p-1.5 rounded-lg hover:bg-[var(--space-surface-muted)] transition-colors text-[var(--space-text-secondary)]"
                  title="Close settings"
                  data-testid="button-overlay-settings-close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0">
                {hasOpenedSettings && (
                  <Suspense fallback={LoadingSpinner ? <LoadingSpinner /> : null}>
                    <Settings spaceId={spaceId} />
                  </Suspense>
                )}
              </div>
            </aside>
          </>
        )}
      </div>
    </>
  );
}
