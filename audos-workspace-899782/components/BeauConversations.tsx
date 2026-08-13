/**
 * BeauConversations — the customer-facing multi-chat layer (Pass Twenty-Nine).
 *
 * Beau is an ongoing advisor, not a single accumulating thread. This component
 * wraps the platform AgentChat with a full conversation system:
 *
 *  - CHAT LIST as the entry point: opening Beau lands on the list of past
 *    conversations (pinned section on top, folders, then chronological), with
 *    a prominent "New chat" button. Tapping a conversation opens that thread.
 *  - CONTEXT ISOLATION: each conversation is its own platform chat thread
 *    (threadId) — the runtime loads and sends ONLY that thread's history.
 *    Profile / wardrobe / Your Style context stays account-level and is
 *    available to Beau in every conversation.
 *  - AUTO-NAMING: on the first user message of a new thread, a 3–6 word title
 *    is generated via the platform OpenAI proxy (the message itself shows
 *    immediately as a placeholder; "Chat [date]" is the last-resort fallback).
 *  - ORGANISATION: rename, pin/unpin (pinned float to the top), folders
 *    (create / rename / delete — deleting a folder releases its conversations
 *    back to the main list via FK SET NULL, never deletes them), and delete
 *    with a confirmation dialog.
 *  - MIGRATION: on first load, existing Beau history (the pre-pass 'main'
 *    thread, plus any server-side threads) is filed into conversations —
 *    the primary thread becomes "Previous chats" so nothing is lost.
 *
 * Metadata lives in the WorkspaceDB tables `chat_conversations` and
 * `chat_folders` (per visitor); message bodies stay in the platform's
 * per-thread chat storage.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Folder,
  FolderInput,
  FolderPlus,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import AgentChat from './AgentChat';
import { useSpaceRuntime } from '../SpaceRuntimeContext';
import { beauChatRoom } from '../lib/colors';
import { looksLikePlaceholderName, smartTitle } from '../lib/smart-title';

// Literal `window.__workspaceDb` references below matter: the platform
// compiler auto-injects the WorkspaceDB SDK when it sees that token in
// app source.
function db(): any {
  return window.__workspaceDb;
}

const PRIMARY_THREAD_ID = 'main';

function makeThreadId(): string {
  return `thr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export interface Conversation {
  id: number;
  thread_id: string;
  name: string;
  name_source: 'auto' | 'user' | null;
  is_pinned: boolean;
  folder_id: number | null;
  last_preview: string | null;
  last_message_at: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ChatFolder {
  id: number;
  name: string;
  created_at?: string;
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max).trimEnd()}…` : clean;
}

function dateLabel(): string {
  return new Date().toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(
    [],
    sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' },
  );
}

function activityStamp(c: Conversation): number {
  const t = Date.parse(c.last_message_at || c.updated_at || c.created_at || '');
  return isNaN(t) ? 0 : t;
}

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

/** 3–6 word conversation title from the first user message, via the platform
 * OpenAI proxy (Beau's existing AI infrastructure). Returns null on failure. */
async function generateTitle(message: string): Promise<string | null> {
  try {
    const response = await fetch('/proxy/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You name chat conversations for Ethaion, a classic menswear advisor. Summarise the user message below as a short conversation title of 3 to 6 words. Sentence case, no punctuation, no quotes, no emoji. Return STRICT JSON: {"title": string}.',
          },
          { role: 'user', content: message.slice(0, 600) },
        ],
        max_tokens: 40,
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    const parsed = typeof content === 'string' ? extractJson(content) : null;
    const title = typeof parsed?.title === 'string' ? parsed.title.replace(/["'.]/g, '').trim() : '';
    return title || null;
  } catch (e) {
    console.warn('[BeauChats] title generation failed:', e);
    return null;
  }
}

function normalizeConvo(row: any): Conversation {
  return {
    id: row.id,
    thread_id: row.thread_id,
    name: row.name || 'New chat',
    name_source: row.name_source === 'auto' || row.name_source === 'user' ? row.name_source : null,
    is_pinned: row.is_pinned === true || row.is_pinned === 'true',
    folder_id: typeof row.folder_id === 'number' ? row.folder_id : row.folder_id ? Number(row.folder_id) : null,
    last_preview: row.last_preview || null,
    last_message_at: row.last_message_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

interface BeauConversationsProps {
  spaceId: string;
  onFileAccess?: (log: { timestamp: number; path: string; action: 'read' | 'write'; tool: string }) => void;
  pendingMessage?: string | null;
  onPendingMessageConsumed?: () => void;
}

export default function BeauConversations({
  spaceId,
  onFileAccess,
  pendingMessage,
  onPendingMessageConsumed,
}: BeauConversationsProps) {
  const { sessionId, trackEvent } = useSpaceRuntime();

  const navKey = `beau_chat_nav_${spaceId}`;
  const mainClaimKey = `beau_main_claimed_${spaceId}`;

  // Restore where the visitor was (list vs a specific thread) across the
  // shell's mount/unmount cycles (e.g. the chat moving between the main
  // surface and the app overlay). A fresh browser session lands on the list.
  const [view, setView] = useState<'list' | 'thread'>(() => {
    try {
      const stored = JSON.parse(sessionStorage.getItem(navKey) || 'null');
      if (stored?.view === 'thread' && typeof stored.threadId === 'string' && stored.threadId) return 'thread';
    } catch (e) { /* ignore */ }
    return 'list';
  });
  const [activeThreadId, setActiveThreadId] = useState<string | null>(() => {
    try {
      const stored = JSON.parse(sessionStorage.getItem(navKey) || 'null');
      if (stored?.view === 'thread' && typeof stored.threadId === 'string' && stored.threadId) return stored.threadId;
    } catch (e) { /* ignore */ }
    return null;
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(navKey, JSON.stringify({ view, threadId: activeThreadId }));
    } catch (e) { /* ignore */ }
  }, [view, activeThreadId, navKey]);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [folders, setFolders] = useState<ChatFolder[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Refs so window-event handlers always see current data without rebinding.
  const conversationsRef = useRef<Conversation[]>([]);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);
  const ensuringRef = useRef<Set<string>>(new Set());

  // --- List UI state ------------------------------------------------------
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [moveMenuFor, setMoveMenuFor] = useState<number | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<Conversation | null>(null);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<number>>(() => new Set());
  const [renamingFolderId, setRenamingFolderId] = useState<number | null>(null);
  const [folderDraft, setFolderDraft] = useState('');
  const [confirmDeleteFolder, setConfirmDeleteFolder] = useState<ChatFolder | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renamingHeader, setRenamingHeader] = useState(false);
  const [headerDraft, setHeaderDraft] = useState('');

  // Dismiss overflow menus on any outside tap.
  useEffect(() => {
    if (menuFor === null && moveMenuFor === null) return;
    const close = () => {
      setMenuFor(null);
      setMoveMenuFor(null);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menuFor, moveMenuFor]);

  // --- Data loading -------------------------------------------------------
  const refresh = useCallback(async () => {
    try {
      const [convoRes, folderRes] = await Promise.all([
        db().from('chat_conversations').orderBy('created_at', 'desc').limit(200).get(),
        db().from('chat_folders').orderBy('created_at', 'asc').limit(100).get(),
      ]);
      setConversations(((convoRes?.data as any[]) || []).map(normalizeConvo));
      setFolders(
        (((folderRes?.data as any[]) || []) as any[]).map((f) => ({ id: f.id, name: f.name || 'Folder', created_at: f.created_at })),
      );
    } catch (e) {
      console.warn('[BeauChats] failed to load conversations:', e);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, sessionId]);

  // --- One-time migration: file existing Beau history into conversations ---
  // migrationSettled gates the "claim the primary thread for the first new
  // chat" shortcut: until we KNOW the main thread has no unfiled history, new
  // chats use fresh thread ids so a clean slate can never show old messages.
  const [migrationSettled, setMigrationSettled] = useState(false);
  const migrationRan = useRef(false);
  useEffect(() => {
    if (!loaded || migrationRan.current || !sessionId) return;
    const migratedKey = `beau_chat_migrated_${spaceId}_${sessionId}`;
    let alreadyMigrated = false;
    try {
      alreadyMigrated = localStorage.getItem(migratedKey) === 'true';
    } catch (e) { /* ignore */ }
    if (alreadyMigrated || conversations.length > 0) {
      migrationRan.current = true;
      setMigrationSettled(true);
      return;
    }
    migrationRan.current = true;

    const migrate = async () => {
      let made = false;
      try {
        if (sessionId.startsWith('wses_')) {
          const res = await fetch(
            `/api/space/${spaceId}/chat/threads?sessionId=${encodeURIComponent(sessionId)}`,
          );
          if (res.ok) {
            const data = await res.json();
            const threads: any[] = Array.isArray(data?.threads) ? data.threads : [];
            for (const t of threads) {
              if (!t?.threadId || (t.messageCount ?? 0) <= 0) continue;
              const isMain = t.threadId === PRIMARY_THREAD_ID;
              await db().from('chat_conversations').insert({
                thread_id: t.threadId,
                name: isMain ? 'Previous chats' : truncate(String(t.title || 'Previous chats'), 60),
                name_source: 'user',
                is_pinned: false,
                folder_id: null,
                last_preview: null,
                last_message_at: t.lastMessageAt || t.createdAt || new Date().toISOString(),
              });
              made = true;
            }
          }
        }
        if (!made) {
          // Guest sessions (and any wses_ session the threads endpoint missed):
          // check the primary thread's history directly.
          const params = new URLSearchParams({ contextType: 'space', sessionId });
          const res = await fetch(`/api/space/${spaceId}/chat/history?${params.toString()}`);
          if (res.ok) {
            const data = await res.json();
            const msgs: any[] = Array.isArray(data?.messages) ? data.messages : [];
            if (msgs.length > 0) {
              await db().from('chat_conversations').insert({
                thread_id: PRIMARY_THREAD_ID,
                name: 'Previous chats',
                name_source: 'user',
                is_pinned: false,
                folder_id: null,
                last_preview: null,
                last_message_at: new Date().toISOString(),
              });
              made = true;
            }
          }
        }
        try {
          localStorage.setItem(migratedKey, 'true');
        } catch (e) { /* ignore */ }
        if (made) {
          trackEvent('chat_history_migrated', {});
          await refresh();
        }
      } catch (e) {
        console.warn('[BeauChats] history migration failed (will not retry this session):', e);
      } finally {
        setMigrationSettled(true);
      }
    };
    void migrate();
  }, [loaded, sessionId, spaceId, conversations.length, refresh, trackEvent]);

  // --- Recording user messages: previews + auto-naming ---------------------
  const applyLocal = useCallback((id: number, patch: Partial<Conversation>) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  const autoName = useCallback(
    async (convoId: number, firstMessage: string, placeholder: string) => {
      const title = await generateTitle(firstMessage);
      const current = conversationsRef.current.find((c) => c.id === convoId);
      if (current && current.name_source === 'user') return; // renamed meanwhile — theirs wins
      // When the model call fails, the LOCAL summariser (lib/smart-title.ts)
      // still produces a real title from the message's own words — the
      // "Chat [date]" fallback is now the last resort of the last resort.
      const finalName = title || smartTitle(firstMessage) || placeholder || `Chat ${dateLabel()}`;
      applyLocal(convoId, { name: finalName, name_source: 'auto' });
      try {
        await db().from('chat_conversations').update(convoId, { name: finalName, name_source: 'auto' });
      } catch (e) {
        console.warn('[BeauChats] failed to save auto-name:', e);
      }
    },
    [applyLocal],
  );

  // SMART-TITLE BACKFILL (one-time per mount, local, no model calls):
  // conversations still wearing a placeholder — raw first-message text
  // (name_source null) or a "Chat 8 Aug" date stamp — get a short descriptive
  // title regenerated from their stored content (the placeholder name itself,
  // or the last message preview for date-stamped rows). User renames
  // (name_source 'user') are never touched.
  const smartBackfillRan = useRef(false);
  useEffect(() => {
    if (!loaded || smartBackfillRan.current) return;
    smartBackfillRan.current = true;
    const candidates = conversationsRef.current.filter(
      (c) => c.name_source !== 'user' && (c.name_source === null || looksLikePlaceholderName(c.name)),
    );
    if (candidates.length === 0) return;
    void (async () => {
      for (const convo of candidates) {
        const source = looksLikePlaceholderName(convo.name) ? convo.last_preview || '' : convo.name;
        const title = smartTitle(source);
        if (!title || title === convo.name) continue;
        applyLocal(convo.id, { name: title, name_source: 'auto' });
        try {
          await db().from('chat_conversations').update(convo.id, { name: title, name_source: 'auto' });
        } catch (e) {
          console.warn('[BeauChats] smart-title backfill failed (non-fatal):', e);
        }
      }
    })();
  }, [loaded, applyLocal]);

  const recordUserMessage = useCallback(
    async (threadId: string, content: string) => {
      const preview = content ? truncate(content, 120) : '';
      const now = new Date().toISOString();
      const existing = conversationsRef.current.find((c) => c.thread_id === threadId);

      if (existing) {
        applyLocal(existing.id, {
          last_preview: preview || existing.last_preview,
          last_message_at: now,
        });
        try {
          await db().from('chat_conversations').update(existing.id, {
            last_preview: preview || existing.last_preview,
            last_message_at: now,
          });
        } catch (e) {
          console.warn('[BeauChats] failed to update conversation activity:', e);
        }
        // A placeholder-named conversation still wants its AI title.
        if (existing.name_source === null && content) {
          void autoName(existing.id, content, truncate(content, 48));
        }
        return;
      }

      // First message of a draft thread — create the conversation row now.
      if (ensuringRef.current.has(threadId)) return;
      ensuringRef.current.add(threadId);
      const placeholder = content ? truncate(content, 48) : `Chat ${dateLabel()}`;
      try {
        await db().from('chat_conversations').insert({
          thread_id: threadId,
          name: placeholder,
          name_source: null,
          is_pinned: false,
          folder_id: null,
          last_preview: preview || null,
          last_message_at: now,
        });
        const { data } = await db().from('chat_conversations').eq('thread_id', threadId).limit(1).get();
        const row = data && data[0] ? normalizeConvo(data[0]) : null;
        if (row) {
          setConversations((prev) =>
            prev.some((c) => c.id === row.id) ? prev : [row, ...prev],
          );
          trackEvent('conversation_created', { threadId });
          if (content) void autoName(row.id, content, placeholder);
        }
      } catch (e) {
        console.warn('[BeauChats] failed to create conversation record:', e);
      } finally {
        ensuringRef.current.delete(threadId);
      }
    },
    [applyLocal, autoName, trackEvent],
  );

  useEffect(() => {
    const onUserMessage = (e: Event) => {
      const detail = (e as CustomEvent).detail as { threadId?: string; content?: string } | undefined;
      const threadId = detail?.threadId;
      if (!threadId) return;
      const raw = typeof detail?.content === 'string' ? detail.content.trim() : '';
      if (raw.startsWith('[SYSTEM:')) return;
      void recordUserMessage(threadId, raw);
    };
    window.addEventListener('audos:chat-user-message', onUserMessage);
    return () => window.removeEventListener('audos:chat-user-message', onUserMessage);
  }, [recordUserMessage]);

  // --- Actions --------------------------------------------------------------
  const openConversation = (threadId: string) => {
    setActiveThreadId(threadId);
    setView('thread');
    setMenuFor(null);
    setMoveMenuFor(null);
    trackEvent('thread_switched', { threadId });
  };

  const startNewChat = () => {
    // The very first chat a brand-new visitor starts claims the primary
    // thread id, so the configured Beau welcome message greets them there.
    let mainClaimed = conversationsRef.current.some((c) => c.thread_id === PRIMARY_THREAD_ID);
    try {
      mainClaimed = mainClaimed || sessionStorage.getItem(mainClaimKey) === 'true';
    } catch (e) { /* ignore */ }
    const id = !mainClaimed && loaded && migrationSettled ? PRIMARY_THREAD_ID : makeThreadId();
    if (id === PRIMARY_THREAD_ID) {
      try {
        sessionStorage.setItem(mainClaimKey, 'true');
      } catch (e) { /* ignore */ }
    }
    trackEvent('thread_created', { threadId: id });
    openConversation(id);
  };

  const togglePin = async (convo: Conversation) => {
    setMenuFor(null);
    applyLocal(convo.id, { is_pinned: !convo.is_pinned });
    try {
      await db().from('chat_conversations').update(convo.id, { is_pinned: !convo.is_pinned });
    } catch (e) {
      console.warn('[BeauChats] failed to toggle pin:', e);
      applyLocal(convo.id, { is_pinned: convo.is_pinned });
    }
  };

  const commitRename = async (convo: Conversation, rawName: string) => {
    const name = truncate(rawName, 80);
    setRenamingId(null);
    setRenamingHeader(false);
    if (!name || name === convo.name) return;
    applyLocal(convo.id, { name, name_source: 'user' });
    try {
      await db().from('chat_conversations').update(convo.id, { name, name_source: 'user' });
    } catch (e) {
      console.warn('[BeauChats] failed to rename conversation:', e);
    }
  };

  const moveToFolder = async (convo: Conversation, folderId: number | null) => {
    setMenuFor(null);
    setMoveMenuFor(null);
    applyLocal(convo.id, { folder_id: folderId });
    try {
      await db().from('chat_conversations').update(convo.id, { folder_id: folderId });
    } catch (e) {
      console.warn('[BeauChats] failed to move conversation:', e);
      applyLocal(convo.id, { folder_id: convo.folder_id });
    }
  };

  const deleteConversation = async (convo: Conversation) => {
    setConfirmDelete(null);
    setConversations((prev) => prev.filter((c) => c.id !== convo.id));
    if (convo.thread_id === activeThreadId) {
      // Deleting the open conversation closes the thread and returns to the list.
      setActiveThreadId(null);
      setView('list');
    }
    try {
      await db().from('chat_conversations').delete(convo.id);
      trackEvent('conversation_deleted', { threadId: convo.thread_id });
    } catch (e) {
      console.warn('[BeauChats] failed to delete conversation:', e);
    }
  };

  const createFolder = async (rawName: string) => {
    const name = truncate(rawName, 60);
    setCreatingFolder(false);
    setNewFolderName('');
    if (!name) return;
    try {
      await db().from('chat_folders').insert({ name });
      trackEvent('chat_folder_created', {});
      await refresh();
    } catch (e) {
      console.warn('[BeauChats] failed to create folder:', e);
    }
  };

  const commitFolderRename = async (folder: ChatFolder, rawName: string) => {
    const name = truncate(rawName, 60);
    setRenamingFolderId(null);
    if (!name || name === folder.name) return;
    setFolders((prev) => prev.map((f) => (f.id === folder.id ? { ...f, name } : f)));
    try {
      await db().from('chat_folders').update(folder.id, { name });
    } catch (e) {
      console.warn('[BeauChats] failed to rename folder:', e);
    }
  };

  const deleteFolder = async (folder: ChatFolder) => {
    setConfirmDeleteFolder(null);
    // Conversations are preserved: they drop back to the main list.
    setFolders((prev) => prev.filter((f) => f.id !== folder.id));
    setConversations((prev) => prev.map((c) => (c.folder_id === folder.id ? { ...c, folder_id: null } : c)));
    try {
      await db().from('chat_folders').delete(folder.id);
      trackEvent('chat_folder_deleted', {});
    } catch (e) {
      console.warn('[BeauChats] failed to delete folder:', e);
    }
  };

  const toggleFolderCollapsed = (folderId: number) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  // --- Derived lists --------------------------------------------------------
  const pinned = useMemo(
    () => conversations.filter((c) => c.is_pinned).sort((a, b) => activityStamp(b) - activityStamp(a)),
    [conversations],
  );
  const byFolder = useMemo(() => {
    const map = new Map<number, Conversation[]>();
    for (const c of conversations) {
      if (c.is_pinned || c.folder_id === null) continue;
      const list = map.get(c.folder_id) || [];
      list.push(c);
      map.set(c.folder_id, list);
    }
    for (const list of map.values()) list.sort((a, b) => activityStamp(b) - activityStamp(a));
    return map;
  }, [conversations]);
  const unfiled = useMemo(
    () =>
      conversations
        .filter((c) => !c.is_pinned && (c.folder_id === null || !folders.some((f) => f.id === c.folder_id)))
        .sort((a, b) => activityStamp(b) - activityStamp(a)),
    [conversations, folders],
  );

  const activeConvo = activeThreadId
    ? conversations.find((c) => c.thread_id === activeThreadId) || null
    : null;
  const activeTitle = activeConvo?.name || 'New chat';

  // --- Renderers -------------------------------------------------------------
  const renderConvoCard = (convo: Conversation, indent = false) => {
    const isRenaming = renamingId === convo.id;
    const menuOpen = menuFor === convo.id;
    const moveOpen = moveMenuFor === convo.id;
    return (
      <div key={convo.id} className={`relative group ${indent ? 'ml-6' : ''}`}>
        {isRenaming ? (
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--space-brand-primary-500)] bg-[var(--space-surface-card)]">
            <input
              autoFocus
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void commitRename(convo, renameDraft);
                if (e.key === 'Escape') setRenamingId(null);
              }}
              className="flex-1 min-w-0 bg-transparent text-sm font-medium text-[var(--space-text-primary)] focus:outline-none"
              placeholder="Conversation name"
              data-testid={`input-rename-convo-${convo.id}`}
            />
            <button
              onClick={() => void commitRename(convo, renameDraft)}
              className="p-1 rounded-md text-[var(--space-semantic-success)] hover:bg-[var(--space-surface-muted)]"
              title="Save name"
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              onClick={() => setRenamingId(null)}
              className="p-1 rounded-md text-[var(--space-text-muted)] hover:bg-[var(--space-surface-muted)]"
              title="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => openConversation(convo.thread_id)}
            className="w-full text-left px-3 py-2.5 rounded-xl border border-transparent hover:border-[var(--space-border-default)] hover:bg-[var(--space-surface-muted)] transition-colors"
            data-testid={`button-open-convo-${convo.id}`}
          >
            <span className="flex items-center gap-1.5 pr-14">
              {convo.is_pinned && <Pin className="w-3 h-3 flex-shrink-0 text-[var(--space-text-brand)] fill-current" />}
              <span className="truncate text-base font-medium text-[var(--space-text-primary)]">{convo.name}</span>
              <span className="ml-auto flex-shrink-0 text-xs text-[var(--space-text-muted)]">
                {formatWhen(convo.last_message_at || convo.created_at)}
              </span>
            </span>
            <span className="block truncate mt-0.5 text-sm text-[var(--space-text-muted)]">
              {convo.last_preview || 'No messages yet'}
            </span>
          </button>
        )}

        {!isRenaming && (
          <div className="absolute right-2 top-2 flex items-center gap-0.5 md:opacity-0 md:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                void togglePin(convo);
              }}
              className="p-1.5 rounded-md bg-[var(--space-surface-card)] text-[var(--space-text-muted)] hover:text-[var(--space-text-brand)] hover:bg-[var(--space-surface-accent-soft)] transition-colors"
              title={convo.is_pinned ? 'Unpin' : 'Pin to top'}
              data-testid={`button-pin-convo-${convo.id}`}
            >
              {convo.is_pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMoveMenuFor(null);
                setMenuFor(menuOpen ? null : convo.id);
              }}
              className="p-1.5 rounded-md bg-[var(--space-surface-card)] text-[var(--space-text-muted)] hover:text-[var(--space-text-primary)] hover:bg-[var(--space-surface-muted)] transition-colors"
              title="Conversation options"
              data-testid={`button-convo-menu-${convo.id}`}
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {(menuOpen || moveOpen) && (
          <div
            className="absolute right-2 top-9 z-30 w-52 rounded-xl border border-[var(--space-border-default)] bg-[var(--space-surface-card)] shadow-[0_10px_34px_rgba(0,0,0,0.14)] py-1"
            onClick={(e) => e.stopPropagation()}
          >
            {moveOpen ? (
              <>
                <p className="px-3 pt-1.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-[var(--space-text-muted)]">
                  Move to folder
                </p>
                {folders.length === 0 && (
                  <p className="px-3 py-1.5 text-xs text-[var(--space-text-muted)]">
                    No folders yet — create one from the list.
                  </p>
                )}
                {folders.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => void moveToFolder(convo, f.id)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--space-text-primary)] hover:bg-[var(--space-surface-muted)]"
                  >
                    <Folder className="w-3.5 h-3.5 opacity-60" />
                    <span className="truncate">{f.name}</span>
                    {convo.folder_id === f.id && <Check className="w-3.5 h-3.5 ml-auto text-[var(--space-text-brand)]" />}
                  </button>
                ))}
                {convo.folder_id !== null && (
                  <button
                    onClick={() => void moveToFolder(convo, null)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--space-text-primary)] hover:bg-[var(--space-surface-muted)]"
                  >
                    <X className="w-3.5 h-3.5 opacity-60" />
                    Remove from folder
                  </button>
                )}
                <button
                  onClick={() => {
                    setMoveMenuFor(null);
                    setMenuFor(convo.id);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--space-text-muted)] hover:bg-[var(--space-surface-muted)]"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Back
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    setMenuFor(null);
                    setRenameDraft(convo.name);
                    setRenamingId(convo.id);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--space-text-primary)] hover:bg-[var(--space-surface-muted)]"
                  data-testid={`button-rename-convo-${convo.id}`}
                >
                  <Pencil className="w-3.5 h-3.5 opacity-60" />
                  Rename
                </button>
                <button
                  onClick={() => void togglePin(convo)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--space-text-primary)] hover:bg-[var(--space-surface-muted)]"
                >
                  {convo.is_pinned ? <PinOff className="w-3.5 h-3.5 opacity-60" /> : <Pin className="w-3.5 h-3.5 opacity-60" />}
                  {convo.is_pinned ? 'Unpin' : 'Pin to top'}
                </button>
                <button
                  onClick={() => {
                    setMenuFor(null);
                    setMoveMenuFor(convo.id);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--space-text-primary)] hover:bg-[var(--space-surface-muted)]"
                  data-testid={`button-move-convo-${convo.id}`}
                >
                  <FolderInput className="w-3.5 h-3.5 opacity-60" />
                  Move to folder
                  <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-50" />
                </button>
                <button
                  onClick={() => {
                    setMenuFor(null);
                    setConfirmDelete(convo);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--space-semantic-danger)] hover:bg-[var(--space-surface-muted)]"
                  data-testid={`button-delete-convo-${convo.id}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  const sectionLabel = (text: string) => (
    <p className="px-3 pt-4 pb-1 text-[11px] font-medium uppercase tracking-wide text-[var(--space-text-muted)]">{text}</p>
  );

  const renderList = () => {
    const isEmpty = conversations.length === 0 && folders.length === 0;
    return (
      <div className="h-full flex flex-col bg-[var(--space-surface-card)]" data-testid="beau-chat-list">
        <div className="px-4 sm:px-6 pt-5 pb-3 flex-shrink-0">
          <div className="mx-auto w-full max-w-2xl">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold text-[var(--space-text-primary)]">Conversations</h1>
                <p className="text-sm text-[var(--space-text-muted)] mt-0.5">
                  Beau knows your style profile in every thread — each conversation keeps its own history.
                </p>
              </div>
              <button
                onClick={startNewChat}
                className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-transparent border border-[var(--space-brand-primary)] text-[var(--space-brand-primary-700)] hover:bg-[var(--space-surface-accent-soft)] transition-colors"
                data-testid="button-new-chat"
              >
                <Plus className="w-4 h-4" />
                New chat
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 px-2 sm:px-4 pb-6">
          <div className="mx-auto w-full max-w-2xl">
            {!loaded ? (
              <div className="flex items-center justify-center py-16 text-[var(--space-text-muted)]">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : isEmpty ? (
              <div className="text-center py-16 px-6">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--space-surface-accent-soft)]">
                  <MessageCircle className="h-6 w-6 text-[var(--space-text-brand)]" />
                </div>
                <h2 className="text-lg font-semibold text-[var(--space-text-primary)]">Start a conversation with Beau</h2>
                <p className="mx-auto mt-1.5 max-w-sm text-base leading-7 text-[var(--space-text-secondary)]">
                  Ask about a piece you're eyeing, plan a trip capsule, or work a wardrobe gap. Each conversation
                  keeps its own thread — and Beau knows your profile in all of them.
                </p>
                <button
                  onClick={startNewChat}
                  className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-transparent border border-[var(--space-brand-primary)] text-[var(--space-brand-primary-700)] hover:bg-[var(--space-surface-accent-soft)] transition-colors"
                  data-testid="button-new-chat-empty"
                >
                  <Plus className="w-4 h-4" />
                  New chat
                </button>
              </div>
            ) : (
              <>
                {pinned.length > 0 && (
                  <>
                    {sectionLabel('Pinned')}
                    <div className="flex flex-col gap-0.5">{pinned.map((c) => renderConvoCard(c))}</div>
                  </>
                )}

                {folders.length > 0 && (
                  <>
                    {sectionLabel('Folders')}
                    <div className="flex flex-col gap-0.5">
                      {folders.map((folder) => {
                        const items = byFolder.get(folder.id) || [];
                        const collapsed = collapsedFolders.has(folder.id);
                        const isRenamingFolder = renamingFolderId === folder.id;
                        return (
                          <div key={folder.id}>
                            {isRenamingFolder ? (
                              <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--space-brand-primary-500)] bg-[var(--space-surface-card)]">
                                <Folder className="w-4 h-4 flex-shrink-0 text-[var(--space-text-brand)]" />
                                <input
                                  autoFocus
                                  value={folderDraft}
                                  onChange={(e) => setFolderDraft(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') void commitFolderRename(folder, folderDraft);
                                    if (e.key === 'Escape') setRenamingFolderId(null);
                                  }}
                                  className="flex-1 min-w-0 bg-transparent text-sm font-medium text-[var(--space-text-primary)] focus:outline-none"
                                  placeholder="Folder name"
                                />
                                <button
                                  onClick={() => void commitFolderRename(folder, folderDraft)}
                                  className="p-1 rounded-md text-[var(--space-semantic-success)] hover:bg-[var(--space-surface-muted)]"
                                  title="Save name"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setRenamingFolderId(null)}
                                  className="p-1 rounded-md text-[var(--space-text-muted)] hover:bg-[var(--space-surface-muted)]"
                                  title="Cancel"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <div className="group flex items-center gap-1 rounded-xl hover:bg-[var(--space-surface-muted)] transition-colors">
                                <button
                                  onClick={() => toggleFolderCollapsed(folder.id)}
                                  className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 text-left"
                                  data-testid={`button-folder-${folder.id}`}
                                >
                                  {collapsed ? (
                                    <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 text-[var(--space-text-muted)]" />
                                  ) : (
                                    <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 text-[var(--space-text-muted)]" />
                                  )}
                                  <Folder className="w-4 h-4 flex-shrink-0 text-[var(--space-text-brand)]" />
                                  <span className="truncate text-sm font-medium text-[var(--space-text-primary)]">{folder.name}</span>
                                  <span className="flex-shrink-0 text-[11px] text-[var(--space-text-muted)]">{items.length}</span>
                                </button>
                                <span className="flex items-center gap-0.5 pr-1.5 md:opacity-0 md:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => {
                                      setFolderDraft(folder.name);
                                      setRenamingFolderId(folder.id);
                                    }}
                                    className="p-1.5 rounded-md text-[var(--space-text-muted)] hover:text-[var(--space-text-primary)] hover:bg-[var(--space-surface-card)]"
                                    title="Rename folder"
                                    data-testid={`button-rename-folder-${folder.id}`}
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setConfirmDeleteFolder(folder)}
                                    className="p-1.5 rounded-md text-[var(--space-text-muted)] hover:text-[var(--space-semantic-danger)] hover:bg-[var(--space-surface-card)]"
                                    title="Delete folder (conversations are kept)"
                                    data-testid={`button-delete-folder-${folder.id}`}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </span>
                              </div>
                            )}
                            {!collapsed && items.length > 0 && (
                              <div className="flex flex-col gap-0.5 mt-0.5 mb-1">{items.map((c) => renderConvoCard(c, true))}</div>
                            )}
                            {!collapsed && items.length === 0 && (
                              <p className="ml-9 mb-1 text-xs text-[var(--space-text-muted)]">Empty folder</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                {unfiled.length > 0 && (
                  <>
                    {sectionLabel(pinned.length > 0 || folders.length > 0 ? 'Recent' : 'Conversations')}
                    <div className="flex flex-col gap-0.5">{unfiled.map((c) => renderConvoCard(c))}</div>
                  </>
                )}

                <div className="px-1 pt-4">
                  {creatingFolder ? (
                    <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--space-brand-primary-500)] bg-[var(--space-surface-card)]">
                      <FolderPlus className="w-4 h-4 flex-shrink-0 text-[var(--space-text-brand)]" />
                      <input
                        autoFocus
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void createFolder(newFolderName);
                          if (e.key === 'Escape') {
                            setCreatingFolder(false);
                            setNewFolderName('');
                          }
                        }}
                        className="flex-1 min-w-0 bg-transparent text-sm text-[var(--space-text-primary)] focus:outline-none"
                        placeholder="Folder name — e.g. Barcelona trip"
                        data-testid="input-new-folder"
                      />
                      <button
                        onClick={() => void createFolder(newFolderName)}
                        className="p-1 rounded-md text-[var(--space-semantic-success)] hover:bg-[var(--space-surface-muted)]"
                        title="Create folder"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setCreatingFolder(false);
                          setNewFolderName('');
                        }}
                        className="p-1 rounded-md text-[var(--space-text-muted)] hover:bg-[var(--space-surface-muted)]"
                        title="Cancel"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setCreatingFolder(true)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-[var(--space-text-secondary)] hover:bg-[var(--space-surface-muted)] transition-colors"
                      data-testid="button-new-folder"
                    >
                      <FolderPlus className="w-4 h-4 opacity-70" />
                      New folder
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderThread = () => (
    <div className="h-full flex flex-col bg-[var(--space-surface-card)]" data-testid="beau-chat-thread">
      <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 flex-shrink-0 border-b border-[var(--space-border-default)]">
        <button
          onClick={() => {
            setView('list');
            setRenamingHeader(false);
          }}
          className="flex items-center gap-1 px-2 py-1.5 -ml-1 rounded-lg text-sm font-medium text-[var(--space-text-secondary)] hover:bg-[var(--space-surface-muted)] transition-colors flex-shrink-0"
          title="Back to all conversations"
          data-testid="button-back-to-chats"
        >
          <ChevronLeft className="w-4 h-4" />
          Chats
        </button>
        {renamingHeader && activeConvo ? (
          <div className="flex-1 min-w-0 flex items-center gap-1.5">
            <input
              autoFocus
              value={headerDraft}
              onChange={(e) => setHeaderDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void commitRename(activeConvo, headerDraft);
                if (e.key === 'Escape') setRenamingHeader(false);
              }}
              className="flex-1 min-w-0 px-2 py-1 rounded-lg border border-[var(--space-brand-primary-500)] bg-[var(--space-surface-card)] text-sm font-medium text-[var(--space-text-primary)] focus:outline-none"
              placeholder="Conversation name"
              data-testid="input-rename-thread"
            />
            <button
              onClick={() => void commitRename(activeConvo, headerDraft)}
              className="p-1.5 rounded-md text-[var(--space-semantic-success)] hover:bg-[var(--space-surface-muted)]"
              title="Save name"
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              onClick={() => setRenamingHeader(false)}
              className="p-1.5 rounded-md text-[var(--space-text-muted)] hover:bg-[var(--space-surface-muted)]"
              title="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={() => {
                if (!activeConvo) return;
                setHeaderDraft(activeConvo.name);
                setRenamingHeader(true);
              }}
              disabled={!activeConvo}
              className="flex-1 min-w-0 flex items-center gap-1.5 px-1 text-left group disabled:cursor-default"
              title={activeConvo ? 'Rename this conversation' : undefined}
              data-testid="button-thread-title"
            >
              <span className="truncate text-base font-semibold text-[var(--space-text-primary)]">{activeTitle}</span>
              {activeConvo && (
                <Pencil className="w-3 h-3 flex-shrink-0 text-[var(--space-text-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </button>
            <span className="flex items-center gap-0.5 flex-shrink-0">
              {activeConvo && (
                <button
                  onClick={() => void togglePin(activeConvo)}
                  className={`p-1.5 rounded-lg transition-colors ${
                    activeConvo.is_pinned
                      ? 'text-[var(--space-text-brand)] bg-[var(--space-surface-accent-soft)]'
                      : 'text-[var(--space-text-muted)] hover:bg-[var(--space-surface-muted)]'
                  }`}
                  title={activeConvo.is_pinned ? 'Unpin conversation' : 'Pin conversation'}
                  data-testid="button-thread-pin"
                >
                  <Pin className={`w-4 h-4 ${activeConvo.is_pinned ? 'fill-current' : ''}`} />
                </button>
              )}
              {activeConvo && (
                <button
                  onClick={() => setConfirmDelete(activeConvo)}
                  className="p-1.5 rounded-lg text-[var(--space-text-muted)] hover:text-[var(--space-semantic-danger)] hover:bg-[var(--space-surface-muted)] transition-colors"
                  title="Delete conversation"
                  data-testid="button-thread-delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={startNewChat}
                className="p-1.5 rounded-lg text-[var(--space-text-muted)] hover:text-[var(--space-text-primary)] hover:bg-[var(--space-surface-muted)] transition-colors"
                title="New chat"
                data-testid="button-thread-new-chat"
              >
                <Plus className="w-4 h-4" />
              </button>
            </span>
          </>
        )}
      </div>
      <div className="flex-1 overflow-hidden">
        {activeThreadId && (
          <AgentChat
            key={activeThreadId}
            spaceId={spaceId}
            threadId={activeThreadId}
            onFileAccess={onFileAccess}
            pendingMessage={pendingMessage}
            onPendingMessageConsumed={onPendingMessageConsumed}
          />
        )}
      </div>
    </div>
  );

  return (
    // The whole Beau surface (chat list + threads) shares the dashboard's
    // warm cream/linen palette (founder's correction, August 2026) — the
    // token override below hands it to every child, so the conversations
    // list, the thread, the new-chat button and the folder controls all pick
    // up the same ground, ink, buttons and type as the tabs.
    <div className="h-full relative" style={beauChatRoom}>
      {view === 'thread' && activeThreadId ? renderThread() : renderList()}

      {/* Delete-conversation confirmation dialog */}
      {confirmDelete && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center p-6"
          style={{ backgroundColor: 'color-mix(in srgb, var(--space-text-primary) 32%, transparent)' }}
          onClick={() => setConfirmDelete(null)}
          data-testid="dialog-delete-convo"
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-[var(--space-surface-card)] border border-[var(--space-border-default)] shadow-[0_18px_50px_rgba(0,0,0,0.22)] p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-[var(--space-text-primary)]">Delete this conversation?</h3>
            <p className="mt-1.5 text-sm text-[var(--space-text-secondary)]">
              “{confirmDelete.name}” and its messages will be removed. This cannot be undone.
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-3.5 py-2 rounded-xl text-sm font-medium text-[var(--space-text-secondary)] hover:bg-[var(--space-surface-muted)] transition-colors"
                data-testid="button-cancel-delete"
              >
                Cancel
              </button>
              <button
                onClick={() => void deleteConversation(confirmDelete)}
                className="px-3.5 py-2 rounded-xl text-sm font-medium bg-[var(--space-semantic-danger)] text-[var(--space-text-on-primary)] hover:opacity-90 transition-opacity"
                data-testid="button-confirm-delete"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete-folder confirmation dialog (conversations are preserved) */}
      {confirmDeleteFolder && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center p-6"
          style={{ backgroundColor: 'color-mix(in srgb, var(--space-text-primary) 32%, transparent)' }}
          onClick={() => setConfirmDeleteFolder(null)}
          data-testid="dialog-delete-folder"
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-[var(--space-surface-card)] border border-[var(--space-border-default)] shadow-[0_18px_50px_rgba(0,0,0,0.22)] p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-[var(--space-text-primary)]">Delete this folder?</h3>
            <p className="mt-1.5 text-sm text-[var(--space-text-secondary)]">
              “{confirmDeleteFolder.name}” will be removed. Its conversations move back to the main list — they
              won't be deleted.
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirmDeleteFolder(null)}
                className="px-3.5 py-2 rounded-xl text-sm font-medium text-[var(--space-text-secondary)] hover:bg-[var(--space-surface-muted)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => void deleteFolder(confirmDeleteFolder)}
                className="px-3.5 py-2 rounded-xl text-sm font-medium bg-[var(--space-semantic-danger)] text-[var(--space-text-on-primary)] hover:opacity-90 transition-opacity"
                data-testid="button-confirm-delete-folder"
              >
                Delete folder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
