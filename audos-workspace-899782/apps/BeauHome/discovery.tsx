/**
 * Ethaion Saved tab — the discovery log (“things I've seen”).
 *
 * One place for everything the user comes across: free text, any URL
 * (product pages, Instagram, YouTube, editorial), uploaded pictures, and
 * uploaded lists (CSV / Excel / PDF). Ethaion extracts what it can into a
 * structured, searchable database (WorkspaceDB `discovery_log`):
 *  - default view groups entries by category, newest first, behind a
 *    prominent free-text search;
 *  - a sheet view mirrors the Scout history table;
 *  - every entry expands to edit notes, tags and status (maybe / want /
 *    decided against), can be PROMOTED to the Scout workspace for a proper
 *    hunt, or marked as owned (which files it into the wardrobe tracker).
 */
import { Fragment, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  Check,
  ChevronRight,
  ExternalLink,
  FileUp,
  LayoutList,
  Loader2,
  Plus,
  Search,
  StickyNote,
  Table2,
  Trash2,
  X,
} from 'lucide-react';
import { tw, typography } from '../../lib/colors';
import {
  WARDROBE_CATEGORIES,
  categorizeItem,
  categoryLabel,
  extractColors,
  insertPieces,
  insertRadarItem,
  logBrand,
} from './profile-data';
import {
  analyzeDiscoveryImage,
  extractFromUrl,
  parseDiscoveryDocument,
  parseDiscoveryText,
  splitUrl,
  type DiscoveryDraft,
} from './discovery-ai';
import { Illo } from './illustrations';
import { HairlineRowsSkeleton } from './skeleton';

// ---------------------------------------------------------------------------
// Types & shared bits
// ---------------------------------------------------------------------------

export interface DiscoveryRow {
  id: number;
  name: string;
  brand: string | null;
  category: string | null;
  source_type: string;
  source_url: string | null;
  image_url: string | null;
  price: string | null;
  description: string | null;
  notes: string | null;
  status: string | null;
  tags: string[] | string | null;
  created_at?: string;
}

function rowTags(row: DiscoveryRow): string[] {
  if (Array.isArray(row.tags)) return row.tags.filter((t) => typeof t === 'string');
  if (typeof row.tags === 'string') {
    try {
      const parsed = JSON.parse(row.tags);
      return Array.isArray(parsed) ? parsed.filter((t: unknown) => typeof t === 'string') : [];
    } catch {
      return [];
    }
  }
  return [];
}

type EntryStatus = 'maybe' | 'want' | 'decided-against' | 'owned' | 'promoted';

const STATUSES: Array<{ id: EntryStatus; label: string; cls: string; idleCls: string }> = [
  {
    id: 'want',
    label: 'Want',
    cls: 'bg-[color-mix(in_srgb,var(--space-semantic-success)_16%,var(--space-surface-card))] text-[var(--space-semantic-success)] border-[var(--space-semantic-success)]',
    idleCls: 'border-[var(--space-border-default)] text-[var(--space-text-muted)] hover:border-[var(--space-border-strong)]',
  },
  {
    id: 'maybe',
    label: 'Maybe',
    cls: 'bg-[color-mix(in_srgb,var(--space-semantic-warning)_16%,var(--space-surface-card))] text-[var(--space-semantic-warning)] border-[var(--space-semantic-warning)]',
    idleCls: 'border-[var(--space-border-default)] text-[var(--space-text-muted)] hover:border-[var(--space-border-strong)]',
  },
  {
    id: 'decided-against',
    label: 'Decided against',
    cls: 'bg-[color-mix(in_srgb,var(--space-semantic-danger)_16%,var(--space-surface-card))] text-[var(--space-semantic-danger)] border-[var(--space-semantic-danger)]',
    idleCls: 'border-[var(--space-border-default)] text-[var(--space-text-muted)] hover:border-[var(--space-border-strong)]',
  },
  {
    id: 'owned',
    label: 'Owned',
    cls: 'bg-[var(--space-surface-accent-soft)] text-[var(--space-text-brand)] border-[var(--space-brand-primary-200)]',
    idleCls: 'border-[var(--space-border-default)] text-[var(--space-text-muted)] hover:border-[var(--space-border-strong)]',
  },
  {
    id: 'promoted',
    label: 'With Beau',
    cls: 'bg-[var(--space-surface-accent-soft)] text-[var(--space-text-brand)] border-[var(--space-brand-primary-200)]',
    idleCls: 'border-[var(--space-border-default)] text-[var(--space-text-muted)] hover:border-[var(--space-border-strong)]',
  },
];

function StatusBadge({ status }: { status: string | null | undefined }) {
  const def = STATUSES.find((s) => s.id === status);
  if (!def) return null;
  return <span className={`${tw.badge.default} border ${def.cls}`} style={{ fontSize: 'max(var(--eth-micro, 0px), 10px)' }}>{def.label}</span>;
}

function StatusPicker({
  value,
  onChange,
  compact = false,
}: {
  value: string | null;
  onChange: (status: EntryStatus | null) => void;
  compact?: boolean;
}) {
  const pickable = STATUSES.filter((s) => s.id !== 'promoted');
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      {pickable.map((s) => {
        const active = value === s.id;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onChange(active ? null : s.id)}
            className={`rounded-full border transition-colors ${compact ? 'px-2 py-0.5' : 'px-2.5 py-1'} ${typography.size.xs} ${active ? s.cls : s.idleCls}`}
            style={compact ? { fontSize: 'max(var(--eth-micro, 0px), 10px)' } : undefined}
            title={active ? `Clear ${s.label}` : `Mark as ${s.label}`}
          >
            {s.label}
          </button>
        );
      })}
    </span>
  );
}

function formatDate(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function sourceLabel(t: string): string {
  switch (t) {
    case 'url': return 'Link';
    case 'image': return 'Picture';
    case 'document': return 'Document';
    case 'curated': return 'From Curated';
    default: return 'Note';
  }
}

function EntryVisual({ row, size = 'md' }: { row: DiscoveryRow; size?: 'md' | 'sm' }) {
  const box = size === 'sm' ? 'w-11 h-11' : 'w-16 h-16';
  if (row.image_url) {
    return <img src={row.image_url} alt={row.name} className={`${box} rounded-lg object-cover`} loading="lazy" />;
  }
  // No product photo stored — the clean neutral placeholder (a
  // walnut-bordered paper rectangle). Never an illustration standing in
  // for a product image (Product Images rule).
  return (
    <span
      className={`${box} block`}
      aria-hidden="true"
      style={{ background: 'var(--color-paper,#fbf8f1)', border: '1px solid var(--color-text,#3b2b1d)', boxSizing: 'border-box' }}
    />
  );
}

// ---------------------------------------------------------------------------
// Search — free text across every field, incl. month names (“shoes · october”)
// ---------------------------------------------------------------------------

function entryHaystack(row: DiscoveryRow): string {
  const date = row.created_at ? new Date(row.created_at) : null;
  const dateWords = date
    ? `${date.toLocaleDateString('en-GB', { month: 'long' })} ${date.toLocaleDateString('en-GB', { month: 'short' })} ${date.getFullYear()}`
    : '';
  return [
    row.name,
    row.brand,
    categoryLabel(row.category),
    row.category,
    row.price,
    row.description,
    row.notes,
    row.status,
    sourceLabel(row.source_type),
    row.source_url,
    rowTags(row).join(' '),
    dateWords,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function matchesSearch(row: DiscoveryRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = entryHaystack(row);
  // Every word must appear somewhere — “navy jacket instagram” style queries.
  return q.split(/\s+/).every((word) => haystack.includes(word));
}

// ---------------------------------------------------------------------------
// Intake — one composer for text, links, pictures, and documents
// ---------------------------------------------------------------------------

function DraftCard({
  draft,
  onChange,
  onRemove,
}: {
  draft: DiscoveryDraft;
  onChange: (next: DiscoveryDraft) => void;
  onRemove: () => void;
}) {
  const [showCats, setShowCats] = useState(false);
  const needsName = !draft.confident;
  return (
    <div
      className={`rounded-xl border bg-[var(--space-surface-card)] p-2.5 ${
        needsName ? 'border-[var(--space-semantic-warning)]' : 'border-[var(--space-border-default)]'
      }`}
    >
      <div className="flex items-start gap-2.5">
        {draft.image_url ? (
          <img src={draft.image_url} alt="" className="w-11 h-11 rounded-lg object-cover flex-shrink-0" />
        ) : (
          <span className="w-11 h-11 rounded-lg bg-[var(--space-surface-muted)] flex-shrink-0" aria-hidden="true" />
        )}
        <div className="flex-1 min-w-0">
          {needsName && (
            <p className={`${typography.size.xs} text-[var(--space-semantic-warning)] mb-1`} style={{ fontSize: 'max(var(--eth-micro, 0px), 10px)' }}>
              Ethaion couldn’t tell exactly what this is — name it yourself:
            </p>
          )}
          <input
            type="text"
            value={draft.name}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
            placeholder="e.g. Peregrine Cream Rollneck"
            className={`w-full px-2 py-1 rounded-lg border border-[var(--space-border-default)] bg-[var(--space-surface-card)] ${typography.size.sm} ${typography.weight.medium} focus:outline-none focus:ring-1 focus:ring-[var(--space-brand-primary)]`}
            aria-label="Entry name"
          />
          <div className="flex items-center flex-wrap gap-1.5 mt-1.5">
            <button
              type="button"
              onClick={() => setShowCats((s) => !s)}
              className={`${tw.badge.default} ${tw.badge.primary} inline-flex items-center gap-1`}
              style={{ fontSize: 'max(var(--eth-micro, 0px), 10px)' }}
              title="Change category"
            >
              {draft.category ? categoryLabel(draft.category) : 'No category'}
            </button>
            {draft.brand && <span className={`${tw.badge.default} ${tw.badge.neutral}`} style={{ fontSize: 'max(var(--eth-micro, 0px), 10px)' }}>{draft.brand}</span>}
            {draft.price && <span className={`${tw.badge.default} ${tw.badge.neutral}`} style={{ fontSize: 'max(var(--eth-micro, 0px), 10px)' }}>{draft.price}</span>}
            <span className={`${tw.badge.default} ${tw.badge.neutral}`} style={{ fontSize: 'max(var(--eth-micro, 0px), 10px)' }}>{sourceLabel(draft.source_type)}</span>
          </div>
          {showCats && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {WARDROBE_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onChange({ ...draft, category: c.id });
                    setShowCats(false);
                  }}
                  className={`px-2 py-0.5 rounded-full border transition-colors ${typography.size.xs} ${
                    draft.category === c.id
                      ? 'bg-[var(--space-surface-accent-soft)] text-[var(--space-brand-primary-700)] border-[var(--space-brand-primary)]'
                      : 'border-[var(--space-border-default)] text-[var(--space-text-secondary)] hover:border-[var(--space-border-strong)]'
                  }`}
                  style={{ fontSize: 'max(var(--eth-micro, 0px), 10px)' }}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
          {draft.description && (
            <p className={`${typography.size.xs} ${typography.color.muted} mt-1 leading-snug`}>{draft.description}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="p-1 rounded-lg hover:bg-[var(--space-surface-muted)] text-[var(--space-text-muted)] flex-shrink-0"
          aria-label={`Remove ${draft.name || 'entry'} from the list`}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function IntakeCard({ onSaved }: { onSaved: () => void }) {
  const [text, setText] = useState('');
  const [drafts, setDrafts] = useState<DiscoveryDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  const runIntake = async (job: () => Promise<DiscoveryDraft[]>, failMessage: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const found = await job();
      if (found.length === 0) {
        setError(failMessage);
      } else {
        setDrafts((cur) => [...cur, ...found]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : failMessage);
    } finally {
      setBusy(false);
      setPhase('');
    }
  };

  const submitText = () => {
    const raw = text.trim();
    if (!raw) return;
    const { url, rest } = splitUrl(raw);
    setText('');
    if (url) {
      setPhase('Reading the page\u2026');
      void runIntake(async () => {
        const { draft, pageBlocked } = await extractFromUrl(url, rest || null);
        if (draft) return [draft];
        // Blocked or unreadable page — keep the link, ask the user to name it.
        setError(
          pageBlocked
            ? 'Ethaion couldn\u2019t read that page \u2014 tell it what it is by editing the card below.'
            : 'Ethaion couldn\u2019t make out an item on that page \u2014 name it below.',
        );
        return [
          {
            name: rest || 'Saved link',
            brand: null,
            category: null,
            price: null,
            description: null,
            notes: rest || null,
            source_type: 'url',
            source_url: url,
            image_url: null,
            confident: false,
          },
        ];
      }, 'That link didn\u2019t work \u2014 try again.');
    } else {
      setPhase('Tidying it up\u2026');
      void runIntake(() => parseDiscoveryText(raw), 'Couldn\u2019t make anything of that \u2014 try naming the brand or item.');
    }
  };

  const onImagePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (imageInputRef.current) imageInputRef.current.value = '';
    if (!file) return;
    setPhase('Looking at the picture\u2026');
    void runIntake(async () => {
      const { draft, imageUrl } = await analyzeDiscoveryImage(file);
      if (draft) return [draft];
      setError('Ethaion couldn\u2019t identify what\u2019s in that picture \u2014 give it a name below.');
      return [
        {
          name: '',
          brand: null,
          category: null,
          price: null,
          description: null,
          notes: null,
          source_type: 'image',
          source_url: null,
          image_url: imageUrl,
          confident: false,
        },
      ];
    }, 'That picture didn\u2019t upload \u2014 try again.');
  };

  const onDocPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (docInputRef.current) docInputRef.current.value = '';
    if (!file) return;
    setPhase('Reading your list\u2026');
    void runIntake(
      () => parseDiscoveryDocument(file),
      'Ethaion couldn\u2019t pull anything from that file \u2014 CSV, Excel (.xlsx) and PDF work best.',
    );
  };

  const saveAll = async () => {
    const keep = drafts.filter((d) => d.name.trim());
    if (keep.length === 0 || saving) return;
    setSaving(true);
    try {
      for (const d of keep) {
        await window.__workspaceDb.from('discovery_log').insert({
          name: d.name.trim(),
          brand: d.brand,
          category: d.category,
          source_type: d.source_type,
          source_url: d.source_url,
          image_url: d.image_url,
          price: d.price,
          description: d.description,
          notes: d.notes,
          status: null,
          tags: JSON.stringify([]),
        });
        // Brand intelligence: every brand kept in the log is remembered.
        if (d.brand) {
          logBrand({
            brand: d.brand,
            source: d.source_type === 'document' ? 'document' : 'saved',
            item_name: d.name.trim(),
            category: d.category,
            url: d.source_url,
          });
        }
      }
      setDrafts([]);
      setError(null);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const unnamed = drafts.filter((d) => !d.name.trim()).length;

  return (
    <div className={`${tw.card.default} rounded-2xl p-4`}>
      <h3 className={`${typography.size.base} ${typography.weight.semibold} ${typography.color.primary} flex items-center gap-1.5`}>
        Seen something worth keeping?
      </h3>
      <p className={`${typography.size.xs} ${typography.color.muted} mt-0.5`}>
        A brand, a link from anywhere, a screenshot, or that old spreadsheet — drop it in and Ethaion files it,
        structured and searchable.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submitText();
          }
        }}
        placeholder="e.g. Peregrine cream rollneck — saw it at £95 — or paste any link"
        rows={2}
        disabled={busy}
        className={`${tw.input.base} ${tw.input.default} ${typography.size.sm} resize-none mt-3`}
      />

      <div className="flex items-center gap-2 mt-2.5 flex-wrap">
        <button
          type="button"
          onClick={submitText}
          disabled={busy || !text.trim()}
          className={`px-4 py-2 rounded-lg ${typography.size.sm} flex items-center gap-1.5 ${tw.button.primary} disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {busy ? phase || 'Working\u2026' : 'Log it'}
        </button>
        <button
          type="button"
          onClick={() => imageInputRef.current?.click()}
          disabled={busy}
          className={`px-3 py-2 rounded-lg ${typography.size.sm} flex items-center gap-1.5 ${tw.button.secondary} disabled:opacity-40`}
          title="Upload a picture or screenshot"
        >
          <Camera className="w-4 h-4" />
          Picture
        </button>
        <button
          type="button"
          onClick={() => docInputRef.current?.click()}
          disabled={busy}
          className={`px-3 py-2 rounded-lg ${typography.size.sm} flex items-center gap-1.5 ${tw.button.secondary} disabled:opacity-40`}
          title="Upload a list — CSV, Excel (.xlsx) or PDF"
        >
          <FileUp className="w-4 h-4" />
          Upload a list
        </button>
        <input ref={imageInputRef} type="file" accept="image/*" onChange={onImagePicked} className="hidden" aria-label="Upload a picture" />
        <input
          ref={docInputRef}
          type="file"
          accept=".csv,.tsv,.txt,.xlsx,.xls,.pdf,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={onDocPicked}
          className="hidden"
          aria-label="Upload a document"
        />
      </div>

      {error && <p className={`${typography.size.xs} text-[var(--space-semantic-warning)] mt-2`}>{error}</p>}

      {drafts.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className={`${typography.size.xs} ${typography.color.secondary}`}>
            Here’s how I’d file {drafts.length === 1 ? 'it' : `these ${drafts.length}`} — correct anything before saving:
          </p>
          {drafts.map((draft, idx) => (
            <DraftCard
              key={`${draft.source_type}-${idx}`}
              draft={draft}
              onChange={(next) => setDrafts((cur) => cur.map((d, i) => (i === idx ? next : d)))}
              onRemove={() => setDrafts((cur) => cur.filter((_, i) => i !== idx))}
            />
          ))}
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            <button
              type="button"
              onClick={() => void saveAll()}
              disabled={saving || drafts.every((d) => !d.name.trim())}
              className={`px-4 py-2 rounded-lg ${typography.size.sm} flex items-center gap-1.5 ${tw.button.primary} disabled:opacity-50`}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Save {drafts.filter((d) => d.name.trim()).length} to the log
            </button>
            {unnamed > 0 && (
              <span className={`${typography.size.xs} ${typography.color.muted}`}>
                {unnamed} unnamed {unnamed === 1 ? 'entry' : 'entries'} will be skipped
              </span>
            )}
            <button
              type="button"
              onClick={() => setDrafts([])}
              className={`px-3 py-2 rounded-lg ${typography.size.xs} ${tw.button.ghost} border border-[var(--space-border-default)]`}
            >
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entry detail — expand, edit notes/tags/status, promote, mark owned, delete
// ---------------------------------------------------------------------------

function EntryDetail({
  row,
  onBack,
  onUpdate,
  onDelete,
}: {
  row: DiscoveryRow;
  onBack: () => void;
  onUpdate: (id: number, fields: Record<string, unknown>) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [noteDraft, setNoteDraft] = useState(row.notes || '');
  const [tagDraft, setTagDraft] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const tags = rowTags(row);

  const run = async (key: string, job: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    try {
      await job();
    } finally {
      setBusy(null);
    }
  };

  const addTag = () => {
    const t = tagDraft.trim();
    if (!t || tags.includes(t)) {
      setTagDraft('');
      return;
    }
    setTagDraft('');
    void run('tags', () => onUpdate(row.id, { tags: JSON.stringify([...tags, t]) }));
  };

  // "Move to Radar" is the high-commitment step of the pipeline — Saved is
  // "considering", Radar is "I know exactly what I want, watch it for me".

  const [radarDone, setRadarDone] = useState(false);
  const toRadar = () =>
    run('radar', async () => {
      const guess = categorizeItem(`${row.name} ${row.description || ''}`);
      await insertRadarItem({
        name: row.name,
        brand: row.brand,
        category: row.category || guess.category,
        color: extractColors(row.name)[0] || null,
        price_seen: row.price,
        product_url: row.source_url,
        watch_price: !!row.source_url,
        notes: row.notes,
        source: 'saved',
      });
      setRadarDone(true);
    });

  const markOwned = () =>
    run('owned', async () => {
      const guess = categorizeItem(`${row.name} ${row.description || ''}`);
      const category = row.category || guess.category || 'other';
      await insertPieces([
        {
          name: row.name,
          brand: row.brand,
          category,
          slot: guess.category === category ? guess.slot : null,
          colors: extractColors(row.name),
          photo_url: row.image_url,
        },
      ]);
      await onUpdate(row.id, { status: 'owned' });
    });

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className={`inline-flex items-center gap-1.5 ${typography.size.xs} ${typography.color.brand} hover:underline`}
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Saved
      </button>

      <div className={`${tw.card.default} rounded-2xl p-4`}>
        <div className="flex items-start gap-3">
          <EntryVisual row={row} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`${tw.badge.default} ${tw.badge.neutral}`}>{sourceLabel(row.source_type)}</span>
              {row.category && <span className={`${tw.badge.default} ${tw.badge.primary}`}>{categoryLabel(row.category)}</span>}
              <StatusBadge status={row.status} />
              <span className={`${typography.size.xs} ${typography.color.muted}`}>{formatDate(row.created_at)}</span>
            </div>
            {row.brand && (
              <p className={`${typography.size.xs} uppercase tracking-[0.15em] ${typography.color.muted} mt-1.5`}>{row.brand}</p>
            )}
            <h3 className={`${typography.size.xl} ${typography.weight.semibold} ${typography.color.primary}`}>{row.name}</h3>
            {row.price && <p className={`${typography.size.sm} ${typography.color.secondary} mt-0.5`}>{row.price}</p>}
            {row.description && (
              <p className={`${typography.size.sm} ${typography.color.secondary} mt-1.5 leading-relaxed`}>
                {row.description}
              </p>
            )}
            {row.source_url && (
              <a
                href={row.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1 mt-2 ${typography.size.xs} ${typography.color.brand} hover:underline break-all`}
              >
                {row.source_url.length > 60 ? `${row.source_url.slice(0, 60)}\u2026` : row.source_url}
                <ExternalLink className="w-3 h-3 flex-shrink-0" />
              </a>
            )}
          </div>
        </div>

        {row.image_url && (
          <img src={row.image_url} alt={row.name} className="mt-3 max-h-64 rounded-xl object-contain border border-[var(--space-border-default)]" />
        )}

        {/* Own / watch — the bridges into the rest of Ethaion */}
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <button
            type="button"
            onClick={() => void toRadar()}
            disabled={!!busy || radarDone}
            className={`px-3.5 py-2 rounded-lg ${typography.size.sm} flex items-center gap-1.5 ${tw.button.secondary} disabled:opacity-60`}
            title="Serious about this exact piece — move it to The Reserve and Beau watches price and stock"
          >
            {busy === 'radar' ? <Loader2 className="w-4 h-4 animate-spin" /> : radarDone ? <Check className="w-4 h-4" /> : null}
            {radarDone ? 'Moved to the Reserve' : 'Move to the Reserve'}
          </button>
          {row.status !== 'owned' && (
            <button
              type="button"
              onClick={() => void markOwned()}
              disabled={!!busy}
              className={`px-3.5 py-2 rounded-lg ${typography.size.sm} flex items-center gap-1.5 ${tw.button.secondary} disabled:opacity-50`}
              title="Bought it since? File it into your wardrobe tracker"
            >
              {busy === 'owned' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              I own it now
            </button>
          )}
        </div>
      </div>

      {/* Status, tags, notes */}
      <div className={`${tw.card.default} rounded-2xl p-4`}>
        <h4 className={`${typography.size.base} ${typography.weight.semibold} ${typography.color.primary} flex items-center gap-1.5`}>
          <StickyNote className={`w-4 h-4 ${tw.icon.primary}`} />
          Your take
        </h4>
        <p className={`${typography.size.xs} ${typography.color.muted} mt-0.5 mb-3`}>
          Status, tags and notes — all searchable, all kept for next time.
        </p>

        <StatusPicker value={row.status} onChange={(status) => void run('status', () => onUpdate(row.id, { status }))} />

        <div className="flex items-center gap-1.5 mt-3 flex-wrap">
          {tags.map((t) => (
            <span key={t} className={`${tw.badge.default} ${tw.badge.neutral} inline-flex items-center gap-1`}>
              {t}
              <button
                type="button"
                onClick={() => void run('tags', () => onUpdate(row.id, { tags: JSON.stringify(tags.filter((x) => x !== t)) }))}
                aria-label={`Remove tag ${t}`}
                className="hover:text-[var(--space-semantic-danger)]"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <input
            type="text"
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTag();
              }
            }}
            placeholder="+ add tag"
            className={`w-28 px-2 py-1 rounded-lg border border-dashed border-[var(--space-border-strong)] bg-transparent ${typography.size.xs} focus:outline-none focus:ring-1 focus:ring-[var(--space-brand-primary)]`}
            aria-label="Add a tag"
          />
        </div>

        <div className="mt-3">
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="Your note — e.g. “would pair with the navy chinos — wait for a sale?”"
            rows={3}
            className={`${tw.input.base} ${tw.input.default} ${typography.size.sm} resize-none`}
          />
          <button
            type="button"
            onClick={() => void run('note', () => onUpdate(row.id, { notes: noteDraft.trim() || null }))}
            disabled={!!busy || noteDraft.trim() === (row.notes || '').trim()}
            className={`mt-1.5 px-3 py-1.5 rounded-lg ${typography.size.xs} inline-flex items-center gap-1.5 ${tw.button.primary} disabled:opacity-40`}
          >
            {busy === 'note' ? <Loader2 className="w-3 h-3 animate-spin" /> : <StickyNote className="w-3 h-3" />}
            Save note
          </button>
        </div>

        <div className="flex justify-end mt-3 pt-3 border-t border-[var(--space-border-default)]">
          {!confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg ${typography.size.xs} ${tw.button.ghost} border border-[var(--space-border-default)]`}
            >
              <Trash2 className="w-3 h-3" /> Delete entry
            </button>
          ) : (
            <span className="inline-flex items-center gap-2">
              <span className={`${typography.size.xs} ${typography.color.primary}`}>Delete “{row.name}”?</span>
              <button
                type="button"
                onClick={() => void run('delete', () => onDelete(row.id))}
                disabled={!!busy}
                className={`px-2.5 py-1 rounded-lg ${typography.size.xs} ${tw.button.danger} inline-flex items-center gap-1 disabled:opacity-50`}
              >
                {busy === 'delete' && <Loader2 className="w-3 h-3 animate-spin" />}
                Yes, delete
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className={`px-2.5 py-1 rounded-lg ${typography.size.xs} ${tw.button.ghost} border border-[var(--space-border-default)]`}
              >
                Keep
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Saved tab root — search + card/sheet views over the log
// ---------------------------------------------------------------------------

export function SavedTab() {
  const { data: rows, loading: rowsLoading, refresh } = window.useWorkspaceDB<DiscoveryRow>('discovery_log', {
    orderBy: { column: 'created_at', direction: 'desc' },
    limit: 100,
  });

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [layout, setLayout] = useState<'cards' | 'sheet'>('cards');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  // Optimistic status overlay: pills confirm instantly; the write follows.
  const [optimisticStatus, setOptimisticStatus] = useState<Record<number, string | null>>({});

  const all = useMemo(
    () =>
      (rows || []).map((row) =>
        row.id in optimisticStatus ? { ...row, status: optimisticStatus[row.id] } : row,
      ),
    [rows, optimisticStatus],
  );
  const filtered = useMemo(
    () =>
      all.filter((row) => {
        if (statusFilter !== 'all' && (row.status || '') !== statusFilter) return false;
        return matchesSearch(row, query);
      }),
    [all, query, statusFilter],
  );

  // Card view: grouped by category (tracker order), newest first inside each.
  const groups = useMemo(() => {
    const byCat = new Map<string, DiscoveryRow[]>();
    for (const row of filtered) {
      const key = row.category || 'other';
      const list = byCat.get(key) || [];
      list.push(row);
      byCat.set(key, list);
    }
    const ordered: Array<{ id: string; label: string; rows: DiscoveryRow[] }> = [];
    for (const cat of WARDROBE_CATEGORIES) {
      const list = byCat.get(cat.id);
      if (list && list.length > 0 && cat.id !== 'other') {
        ordered.push({ id: cat.id, label: cat.label, rows: list });
        byCat.delete(cat.id);
      }
    }
    for (const [key, list] of byCat) {
      ordered.push({ id: key, label: key === 'other' ? 'Uncategorised' : categoryLabel(key), rows: list });
    }
    return ordered;
  }, [filtered]);

  const updateEntry = async (id: number, fields: Record<string, unknown>) => {
    if ('status' in fields) {
      setOptimisticStatus((cur) => ({ ...cur, [id]: (fields.status as string | null) ?? null }));
    }
    try {
      await window.__workspaceDb.from('discovery_log').update(id, fields);
    } catch (e) {
      if ('status' in fields) {
        setOptimisticStatus((cur) => {
          const next = { ...cur };
          delete next[id];
          return next;
        });
      }
      throw e;
    }
    refresh();
  };

  const deleteEntry = async (id: number) => {
    await window.__workspaceDb.from('discovery_log').delete(id);
    if (selectedId === id) setSelectedId(null);
    refresh();
  };

  const selected = all.find((r) => r.id === selectedId) || null;

  if (selected) {
    return (
      <div className="px-5 py-5 max-w-3xl mx-auto w-full pb-24">
        <EntryDetail row={selected} onBack={() => setSelectedId(null)} onUpdate={updateEntry} onDelete={deleteEntry} />
      </div>
    );
  }

  return (
    <div className="px-5 py-5 space-y-5 max-w-4xl mx-auto w-full pb-24">
      <div>
        <h3 className={`hab-page-title ${typography.color.primary}`}>Saved</h3>
        <p className={`${typography.size.sm} ${typography.color.secondary} mt-1`}>
          Bookmarked, not decided — the stage between Beau suggesting and you committing. Picks saved from Beau’s recommendations
          land here, alongside anything you’ve seen and didn’t want to lose. When you’re serious, move a piece to
          The Reserve; when you’ve bought it, mark it owned and it files into your wardrobe.
        </p>
      </div>

      <IntakeCard onSaved={refresh} />

      {all.length > 0 && (
        <>
          {/* Search — prominent, across every field */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--space-text-muted)]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the log — “navy jacket instagram”, “shoes october”, a brand…"
              className={`w-full pl-9 pr-3 py-2.5 rounded-xl border border-[var(--space-border-default)] bg-[var(--space-surface-card)] ${typography.size.sm} focus:outline-none focus:ring-1 focus:ring-[var(--space-brand-primary)]`}
              aria-label="Search saved entries"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 rounded-full border ${typography.size.xs} transition-colors ${
                statusFilter === 'all'
                  ? 'bg-[var(--space-surface-accent-soft)] text-[var(--space-brand-primary-700)] border-[var(--space-brand-primary)]'
                  : 'border-[var(--space-border-default)] text-[var(--space-text-muted)] hover:border-[var(--space-border-strong)]'
              }`}
            >
              All
            </button>
            {STATUSES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStatusFilter(statusFilter === s.id ? 'all' : s.id)}
                className={`px-2.5 py-1 rounded-full border ${typography.size.xs} transition-colors ${statusFilter === s.id ? s.cls : s.idleCls}`}
              >
                {s.label}
              </button>
            ))}
            <span className="flex-1" />
            <div className="inline-flex rounded-lg border border-[var(--space-border-default)] overflow-hidden">
              {([
                { id: 'cards', label: 'Cards', Icon: LayoutList },
                { id: 'sheet', label: 'Sheet', Icon: Table2 },
              ] as const).map(({ id, label: viewLabel, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setLayout(id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 ${typography.size.xs} transition-colors ${
                    layout === id
                      ? 'bg-[var(--space-surface-accent-soft)] text-[var(--space-brand-primary-700)] font-medium ring-1 ring-inset ring-[var(--space-brand-primary)]'
                      : 'bg-[var(--space-surface-card)] text-[var(--space-text-secondary)] hover:bg-[var(--space-surface-muted)]'
                  }`}
                  aria-pressed={layout === id}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {viewLabel}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className={`${typography.size.sm} ${typography.color.muted} py-6 text-center`}>
              Nothing matches that — try fewer words, or clear the status filter.
            </p>
          ) : layout === 'cards' ? (
            <div className="space-y-4">
              {groups.map((group) => (
                <div key={group.id}>
                  <p className={`${typography.size.xs} uppercase tracking-[0.18em] ${typography.weight.medium} ${typography.color.secondary} mb-1.5`}>
                    {group.label} · {group.rows.length}
                  </p>
                  <ul className="space-y-1.5">
                    {group.rows.map((row) => (
                      <li key={row.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(row.id)}
                          className={`w-full text-left ${tw.card.default} rounded-xl px-3 py-2.5 flex items-center gap-3 group`}
                        >
                          <EntryVisual row={row} size="sm" />
                          <span className="flex-1 min-w-0">
                            <span className={`block ${typography.size.sm} ${typography.weight.medium} ${typography.color.primary} truncate`}>
                              {row.brand ? `${row.brand} · ` : ''}{row.name}
                            </span>
                            <span className={`block ${typography.size.xs} ${typography.color.muted} truncate`}>
                              {[sourceLabel(row.source_type), row.price, formatDate(row.created_at), row.notes ? 'has note' : '']
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                          </span>
                          <StatusBadge status={row.status} />
                          <ChevronRight className="w-4 h-4 text-[var(--space-text-muted)] flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <div className={`${tw.card.default} rounded-2xl overflow-hidden`}>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse" style={{ minWidth: '680px' }}>
                  <thead>
                    <tr className="border-b border-[var(--space-border-default)] bg-[var(--space-surface-muted)]">
                      {['Item', 'Brand', 'Category', 'Price', 'Status', 'Seen', 'Source'].map((h) => (
                        <th key={h} className={`px-3 py-2 ${typography.size.xs} uppercase tracking-wide ${typography.weight.medium} ${typography.color.muted} whitespace-nowrap`}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--space-border-default)]">
                    {filtered.map((row) => (
                      <Fragment key={row.id}>
                        <tr className="align-top">
                          <td className="px-3 py-2.5 max-w-[220px]">
                            <button
                              type="button"
                              onClick={() => setSelectedId(row.id)}
                              className={`${typography.size.sm} ${typography.weight.medium} ${typography.color.primary} hover:underline text-left leading-snug`}
                              title="Open this entry"
                            >
                              {row.name}
                            </button>
                            {row.notes && (
                              <span className={`block ${typography.size.xs} ${typography.color.muted} truncate`} style={{ fontSize: 'max(var(--eth-micro, 0px), 10px)' }}>
                                {row.notes}
                              </span>
                            )}
                          </td>
                          <td className={`px-3 py-2.5 ${typography.size.xs} ${typography.color.secondary} whitespace-nowrap`}>
                            {row.brand || '\u2014'}
                          </td>
                          <td className={`px-3 py-2.5 ${typography.size.xs} ${typography.color.secondary} whitespace-nowrap`}>
                            {row.category ? categoryLabel(row.category) : '\u2014'}
                          </td>
                          <td className={`px-3 py-2.5 ${typography.size.xs} ${typography.color.secondary} whitespace-nowrap`}>
                            {row.price || '\u2014'}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <StatusPicker compact value={row.status} onChange={(status) => void updateEntry(row.id, { status })} />
                          </td>
                          <td className={`px-3 py-2.5 ${typography.size.xs} ${typography.color.muted} whitespace-nowrap`}>
                            {formatDate(row.created_at)}
                          </td>
                          <td className={`px-3 py-2.5 ${typography.size.xs} ${typography.color.muted} whitespace-nowrap`}>
                            {row.source_url ? (
                              <a
                                href={row.source_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 hover:underline"
                              >
                                {sourceLabel(row.source_type)} <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : (
                              sourceLabel(row.source_type)
                            )}
                          </td>
                        </tr>
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Saved rows loading — shimmer hairline rows (Pass Forty-Eight):
          never the misleading “Nothing saved yet” while the data is still
          on its way. */}
      {all.length === 0 && rowsLoading && <HairlineRowsSkeleton rows={4} />}

      {all.length === 0 && !rowsLoading && (
        <div className="text-center py-8">
          <span className="inline-block w-16 h-16 rounded-xl bg-[var(--space-surface-muted)] overflow-hidden">
            <Illo id="bag" muted title="Nothing saved yet" className="w-full h-full" />
          </span>
          <p className={`${typography.size.sm} ${typography.color.primary} font-medium mt-2`}>Nothing saved yet</p>
          <p className={`${typography.size.xs} ${typography.color.muted} mt-1 max-w-sm mx-auto`}>
            Tap Save on any of Beau’s picks and it lands here — or drop in a brand, a link or a screenshot
            above the next time something catches your eye.
          </p>
        </div>
      )}
    </div>
  );
}
