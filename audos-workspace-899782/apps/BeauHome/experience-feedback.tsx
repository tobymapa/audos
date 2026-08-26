import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';

export type PrimaryTabId = 'wardrobe' | 'beau' | 'fitting-room' | 'hunt' | 'index';

export const TAB_PRIMARY_READY_EVENT = 'ethaion:tab-primary-ready';
const MUTATION_CONFIRM_EVENT = 'ethaion:mutation-confirmed';
let installedRuntime: any = null;

const USER_MUTATION_TABLES = new Set([
  'style_profile',
  'style_prefs',
  'style_measurements',
  'measurement_extras',
  'dossier_details',
  'dossier_measurements',
  'category_budgets',
  'wardrobe_items',
  'wardrobe_pieces',
  'scout_requests',
  'scout_hunts',
  'scout_item_meta',
  'discovery_log',
  'radar_items',
  'dismissed_recommendations',
  'candidate_meta',
  'piece_details',
  'piece_materials',
  'piece_attributes',
  'piece_condition',
  'piece_ledger',
  'piece_value',
  'care_reminders',
  'saved_items',
  'saved_outfits',
  'saved_looks',
  'look_meta',
  'trips',
  'brand_index',
  'trusted_brands',
  'taste_references',
  'beau_style_memory',
  'hunt_calls',
  'hunt_directory_brands',
  'hunt_hidden_brands',
  'watchlist',
  'coverage_prefs',
  'briefings',
  'avatar_profiles',
  'tryon_photos',
  'purchase_feedback',
]);

const PROFILE_CONTEXT_TABLES = new Set([
  'style_profile',
  'style_prefs',
  'style_measurements',
  'measurement_extras',
  'dossier_details',
  'dossier_measurements',
  'category_budgets',
  'wardrobe_items',
  'wardrobe_pieces',
  'dismissed_recommendations',
  'piece_details',
  'piece_materials',
  'piece_attributes',
  'piece_condition',
  'piece_ledger',
  'brand_index',
  'hunt_hidden_brands',
  'trusted_brands',
  'taste_references',
  'beau_style_memory',
  'coverage_prefs',
  'avatar_profiles',
  'purchase_feedback',
]);

const WRITE_METHODS = new Set(['insert', 'bulkInsert', 'update', 'delete', 'upsert']);

function confirmationFor(method: string): 'Saved' | 'Added' | 'Removed' {
  if (method === 'delete') return 'Removed';
  if (method === 'insert' || method === 'bulkInsert') return 'Added';
  return 'Saved';
}

export function signalTabPrimaryReady(tab: PrimaryTabId): void {
  window.dispatchEvent(new CustomEvent(TAB_PRIMARY_READY_EVENT, { detail: { tab } }));
}

/**
 * Installs one transparent observer around WorkspaceDB writes. This keeps the
 * confirmation treatment consistent even when a new editor is added later:
 * successful user-facing inserts, updates and deletes all announce through
 * one quiet toast. Profile-context writes also advance the single freshness
 * clock used by every Beau verdict.
 */
export function installMutationFeedback(): void {
  const runtime = (window as any).__workspaceDb;
  if (!runtime || installedRuntime === runtime) return;

  const originalFrom = runtime.from.bind(runtime);
  let bumpInFlight: Promise<void> | null = null;
  let bumpQueued = false;

  const bumpProfileClock = (): Promise<void> => {
    if (bumpInFlight) {
      bumpQueued = true;
      return bumpInFlight;
    }
    const run = async () => {
      const stamp = new Date().toISOString();
      try {
        const { data } = await originalFrom('style_profile').orderBy('created_at', 'asc').limit(1).get();
        const profile = data?.[0];
        if (!profile?.id) return;
        await originalFrom('style_profile').update(profile.id, { profile_last_updated: stamp });
        window.dispatchEvent(new CustomEvent('ethaion:profile-context-updated', { detail: { profileLastUpdated: stamp } }));
        window.dispatchEvent(new CustomEvent('ethaion:profile'));
      } catch (error) {
        console.warn('[Ethaion] profile freshness clock could not be advanced:', error);
      }
    };
    bumpInFlight = run().finally(() => {
      bumpInFlight = null;
      if (bumpQueued) {
        bumpQueued = false;
        void bumpProfileClock();
      }
    });
    return bumpInFlight;
  };

  const wrapBuilder = (builder: any, table: string): any => new Proxy(builder, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function' || typeof prop !== 'string') return value;
      return (...args: unknown[]) => {
        const result = value.apply(target, args);
        if (WRITE_METHODS.has(prop)) {
          const completed = Promise.resolve(result).then((ok) => {
            if (USER_MUTATION_TABLES.has(table)) {
              window.dispatchEvent(new CustomEvent(MUTATION_CONFIRM_EVENT, {
                detail: { message: confirmationFor(prop) },
              }));
            }
            if (PROFILE_CONTEXT_TABLES.has(table)) void bumpProfileClock();
            return ok;
          });
          return result && typeof result.then === 'function' ? completed : result;
        }
        if (result === target) return receiver;
        if (result && typeof result === 'object' && typeof result.get === 'function') {
          return wrapBuilder(result, table);
        }
        return result;
      };
    },
  });

  runtime.from = (table: string, options?: unknown) => {
    const builder = options === undefined ? originalFrom(table) : originalFrom(table, options);
    return wrapBuilder(builder, table);
  };
  installedRuntime = runtime;
}

export function MutationConfirmationHost() {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    installMutationFeedback();
    const onConfirmed = (event: Event) => {
      const next = String((event as CustomEvent).detail?.message || 'Saved');
      if (timer.current != null) window.clearTimeout(timer.current);
      setMessage(next);
      timer.current = window.setTimeout(() => setMessage(null), 1500);
    };
    window.addEventListener(MUTATION_CONFIRM_EVENT, onConfirmed);
    return () => {
      window.removeEventListener(MUTATION_CONFIRM_EVENT, onConfirmed);
      if (timer.current != null) window.clearTimeout(timer.current);
    };
  }, []);

  return (
    <div
      className={`fixed left-1/2 z-[70] -translate-x-1/2 transition-all duration-200 ${message ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0 pointer-events-none'}`}
      style={{ bottom: 'max(20px, calc(env(safe-area-inset-bottom) + 68px))' }}
      role="status"
      aria-live="polite"
    >
      <span
        className="inline-flex items-center gap-1.5 whitespace-nowrap border border-[var(--space-border-default)] bg-[var(--space-surface-card)] px-3 py-2 text-[var(--space-text-secondary)] shadow-sm"
        style={{ fontFamily: 'var(--space-font-family)', fontSize: '12px' }}
      >
        <Check className="h-3.5 w-3.5 text-[var(--space-brand-primary)]" strokeWidth={1.8} aria-hidden="true" />
        {message || 'Saved'}
      </span>
    </div>
  );
}

export function GlobalTopProgress({ transitionKey, complete }: { transitionKey: number; complete: boolean }) {
  const [percent, setPercent] = useState(6);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(true);
    setPercent(6);
    const quick = window.setTimeout(() => setPercent(58), 35);
    const settle = window.setTimeout(() => setPercent(80), 210);
    return () => {
      window.clearTimeout(quick);
      window.clearTimeout(settle);
    };
  }, [transitionKey]);

  useEffect(() => {
    if (!complete) return;
    setPercent(100);
    const fade = window.setTimeout(() => setVisible(false), 190);
    return () => window.clearTimeout(fade);
  }, [complete, transitionKey]);

  return (
    <div
      className="fixed left-0 right-0 top-0 z-[10000] h-[2px] overflow-hidden transition-opacity duration-200"
      style={{ opacity: visible ? 1 : 0, pointerEvents: 'none' }}
      aria-hidden="true"
    >
      <div
        className="h-full transition-[width] duration-300 ease-out"
        style={{
          width: `${percent}%`,
          background: 'var(--space-brand-primary, #a8712c)',
          boxShadow: '0 0 8px color-mix(in srgb, var(--space-brand-primary, #a8712c) 34%, transparent)',
        }}
      />
    </div>
  );
}
