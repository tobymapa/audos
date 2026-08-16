/**
 * Genesis Space Design System
 * 
 * A cohesive color, typography, and component style system for the genesis space template.
 * All components should reference these constants for visual consistency.
 * 
 * IMPORTANT FOR APP BUILDERS:
 * When building apps, you MUST update the brand colors below to match the workspace branding.
 * Replace WORKSPACE_PRIMARY_COLOR and WORKSPACE_HIGHLIGHT_COLOR with actual brand hex values.
 * 
 * Color Philosophy:
 * - Brand: The main brand color used for primary actions (from workspace branding)
 * - Accent: Secondary brand color for highlights and agent elements (from workspace branding)
 * - Semantic: Green (success), Red (danger), Yellow (warning)
 * - Neutrals: Grays for backgrounds, text, and borders
 */

// =============================================================================
// CORE THEME CONFIGURATION - UPDATE THESE WITH WORKSPACE BRAND COLORS!
// =============================================================================

/**
 * Brand colors - These define the visual identity
 * IMPORTANT: Replace these hex values with the workspace brand colors:
 * - primary.600 should be WORKSPACE_PRIMARY_COLOR
 * - accent.600 should be WORKSPACE_HIGHLIGHT_COLOR (or primary if no distinct highlight)
 */
export const brand = {
  // Primary brand color - used for main actions, buttons, links
  primary: {
    50: 'var(--space-brand-primary-50)',
    100: 'var(--space-brand-primary-100)',
    200: 'var(--space-brand-primary-200)',
    500: 'var(--space-brand-primary-500)',
    600: 'var(--space-brand-primary-600)',
    700: 'var(--space-brand-primary-700)',
    900: 'var(--space-brand-primary-900)',
  },
  accent: {
    50: 'var(--space-brand-highlight-50)',
    100: 'var(--space-brand-highlight-100)',
    200: 'var(--space-brand-highlight-200)',
    500: 'var(--space-brand-highlight-500)',
    600: 'var(--space-brand-highlight-600)',
    700: 'var(--space-brand-highlight-700)',
    900: 'var(--space-brand-highlight-900)',
  },
} as const;

/**
 * Semantic colors - Use for status and feedback
 */
export const semantic = {
  success: {
    50: 'var(--space-semantic-success-50)',
    100: 'var(--space-semantic-success-100)',
    500: 'var(--space-semantic-success-500)',
    600: 'var(--space-semantic-success-600)',
    700: 'var(--space-semantic-success-700)',
  },
  warning: {
    50: 'var(--space-semantic-warning-50)',
    100: 'var(--space-semantic-warning-100)',
    500: 'var(--space-semantic-warning-500)',
    600: 'var(--space-semantic-warning-600)',
    700: 'var(--space-semantic-warning-700)',
  },
  danger: {
    50: 'var(--space-semantic-danger-50)',
    100: 'var(--space-semantic-danger-100)',
    500: 'var(--space-semantic-danger-500)',
    600: 'var(--space-semantic-danger-600)',
    700: 'var(--space-semantic-danger-700)',
  },
} as const;

/**
 * Neutral colors - Brand-tinted surfaces and text derived from theme tokens
 */
export const neutral = {
  0: 'var(--space-neutral-0, var(--space-surface-card))',
  50: 'var(--space-neutral-50, var(--space-surface-muted))',
  100: 'var(--space-neutral-100, var(--space-surface-page))',
  200: 'var(--space-neutral-200, var(--space-brand-primary-100))',
  300: 'var(--space-neutral-300, var(--space-brand-primary-200))',
  400: 'var(--space-neutral-400, var(--space-border-strong))',
  500: 'var(--space-neutral-500, var(--space-text-muted))',
  600: 'var(--space-neutral-600, var(--space-text-secondary))',
  700: 'var(--space-neutral-700, var(--space-text-primary))',
  800: 'var(--space-neutral-800, var(--space-brand-primary-900))',
  900: 'var(--space-neutral-900, var(--space-text-primary))',
  950: 'var(--space-neutral-950, var(--space-text-primary))',
} as const;

// =============================================================================
// TYPOGRAPHY SYSTEM
// =============================================================================

/**
 * Typography configuration
 * Font family is injected via Google Fonts in Desktop.tsx
 * IMPORTANT: Update the fontFamily to match workspace brand fonts from config.json!
 */
export const typography = {
  // Font family - loaded via Google Fonts link in Desktop.tsx
  // UPDATE: Replace "Inter" with the workspace headingFont from config.desktop.branding
  fontFamily: 'var(--space-font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
  
  // Font sizes with line heights
  size: {
    xs: 'text-xs',      // 12px
    sm: 'text-sm',      // 14px
    base: 'text-base',  // 16px
    lg: 'text-lg',      // 18px
    xl: 'text-xl',      // 20px
    '2xl': 'text-2xl',  // 24px
    '3xl': 'text-3xl',  // 30px
    '4xl': 'text-4xl',  // 36px
  },
  
  // Font weights — Warm Editorial rule: NEVER bolder than 500. Hierarchy is
  // size and space, not weight, so semibold/bold resolve to medium (500).
  weight: {
    light: 'font-light',      // 300
    normal: 'font-normal',    // 400
    medium: 'font-medium',    // 500
    semibold: 'font-medium',  // capped at 500 (editorial ceiling)
    bold: 'font-medium',      // capped at 500 (editorial ceiling)
  },
  
  // Text colors
  // NOTE: All colors resolve from --space-* theme tokens (see theme.generated.ts)
  color: {
    primary: 'text-[var(--space-text-primary)]',      // Headings, important text
    secondary: 'text-[var(--space-text-secondary)]',  // Body text, descriptions
    tertiary: 'text-[var(--space-text-muted)]',       // Subtle text, captions
    muted: 'text-[var(--space-text-muted)]',          // Placeholder, disabled
    inverse: 'text-[var(--space-text-on-primary)]',   // On dark backgrounds
    brand: 'text-[var(--space-text-brand)]',
    accent: 'text-[var(--space-text-accent)]',
    danger: 'text-[var(--space-semantic-danger)]',    // Error text
    success: 'text-[var(--space-semantic-success-700)]', // Success text
  },
} as const;

// =============================================================================
// LEGACY COLORS OBJECT (for backwards compatibility)
// =============================================================================

export const colors = {
  primary: brand.primary,
  accent: brand.accent,
  success: semantic.success,
  warning: semantic.warning,
  danger: semantic.danger,
  neutral,
  
  // Gradient backgrounds (for Desktop background) — all recipes resolve from
  // the theme gradient tokens; restyling is a token swap, not a class edit.
  gradients: {
    default: 'from-[var(--space-surface-gradient-from)] via-[var(--space-surface-gradient-via)] to-[var(--space-surface-gradient-to)]',
    warm: 'from-[var(--space-surface-gradient-from)] via-[var(--space-surface-gradient-via)] to-[var(--space-surface-gradient-to)]',
    cool: 'from-[var(--space-surface-gradient-from)] via-[var(--space-surface-gradient-via)] to-[var(--space-surface-gradient-to)]',
    nature: 'from-[var(--space-surface-gradient-from)] via-[var(--space-surface-gradient-via)] to-[var(--space-surface-gradient-to)]',
    purple: 'from-[var(--space-surface-gradient-from)] via-[var(--space-surface-gradient-via)] to-[var(--space-surface-gradient-to)]',
  },
  
  // Glass/frosted effect
  glass: {
    background: 'bg-[var(--space-surface-panel)] backdrop-blur-lg',
    border: 'border-[var(--space-border-default)]',
  }
} as const;

// =============================================================================
// TAILWIND CLASS HELPERS
// =============================================================================

/**
 * Tailwind class helpers for common UI patterns
 * Use these in your components for consistency
 */
export const tw = {
  // ---------------------------------------------------------------------------
  // BUTTONS
  // ---------------------------------------------------------------------------
  button: {
    // Warm Editorial (Pass Thirty-One): colour is a stroke, never a fill.
    // The primary action is a 1px accent outline on transparent — hover is a
    // quiet accent wash, never a solid gold block.
    primary: 'bg-transparent border border-[var(--space-brand-primary)] text-[var(--space-brand-primary-700)] hover:bg-[var(--space-surface-accent-soft)] font-medium transition-all',
    brand: 'bg-transparent border border-[var(--space-brand-primary)] text-[var(--space-brand-primary-700)] hover:bg-[var(--space-surface-accent-soft)] font-medium transition-all',
    accent: 'bg-transparent border border-[var(--space-brand-highlight)] text-[var(--space-brand-highlight-700)] hover:bg-[var(--space-surface-accent-soft)] font-medium transition-all',
    // Secondary button: hairline-bordered, ink text; hover is a soft warm wash
    secondary: 'bg-transparent border border-[var(--space-border-default)] hover:bg-[var(--space-surface-muted)] text-[var(--space-text-primary)] font-medium transition-all',
    // Danger button: oxblood as a stroke, held in reserve — never a red block
    danger: 'bg-transparent border border-[var(--space-semantic-danger)] text-[var(--space-semantic-danger)] hover:bg-[var(--space-semantic-danger-100)] font-medium transition-all',
    // Ghost button (transparent)
    ghost: 'hover:bg-[var(--space-surface-muted)] text-[var(--space-text-secondary)] transition-all',
    // Disabled state modifier
    disabled: 'opacity-50 cursor-not-allowed',
  },
  
  // ---------------------------------------------------------------------------
  // FORM INPUTS
  // ---------------------------------------------------------------------------
  input: {
    // Base input styles
    base: 'w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent transition-all',
    // Default state
    default: 'border-[var(--space-border-default)] bg-[var(--space-surface-card)] text-[var(--space-text-primary)] focus:ring-[var(--space-brand-primary)]',
    // Error state
    error: 'border-[var(--space-semantic-danger)] focus:ring-[var(--space-semantic-danger-500)]',
    // Disabled state
    disabled: 'bg-[var(--space-surface-muted)] text-[var(--space-text-muted)] cursor-not-allowed',
  },
  
  // ---------------------------------------------------------------------------
  // DOCK (left navigation)
  // ---------------------------------------------------------------------------
  dock: {
    active: 'bg-[var(--space-surface-accent-soft)] text-[var(--space-brand-primary-700)] ring-1 ring-[var(--space-brand-primary)]',
    inactive: 'bg-[var(--space-surface-card)] hover:bg-[var(--space-surface-muted)] text-[var(--space-text-primary)]',
    glass: 'bg-[var(--space-surface-panel)] backdrop-blur-lg rounded-2xl border border-[var(--space-border-default)]',
  },
  
  // ---------------------------------------------------------------------------
  // MESSAGE BUBBLES (chat)
  // ---------------------------------------------------------------------------
  message: {
    user: 'bg-[var(--space-surface-accent-soft)] text-[var(--space-text-primary)]',
    assistant: 'bg-[var(--space-surface-panel)] text-[var(--space-text-primary)]',
  },
  
  // ---------------------------------------------------------------------------
  // ICONS - UPDATE accent with brand color (NOT purple)
  // ---------------------------------------------------------------------------
  icon: {
    primary: 'text-[var(--space-text-brand)]',
    accent: 'text-[var(--space-text-accent)]',
    neutral: 'text-[var(--space-text-secondary)]',
    muted: 'text-[var(--space-text-muted)]',
    danger: 'text-[var(--space-semantic-danger)]',
    success: 'text-[var(--space-semantic-success)]',
  },
  
  // ---------------------------------------------------------------------------
  // CARDS
  // ---------------------------------------------------------------------------
  // Warm Editorial: card interiors are --paper (surface-card), edges are
  // hairlines — never a drop shadow.
  card: {
    default: 'bg-[var(--space-surface-card)] border border-[var(--space-border-default)] rounded-lg transition-colors',
    elevated: 'bg-[var(--space-surface-card)] rounded-2xl border border-[var(--space-border-default)]',
    glass: 'bg-[var(--space-surface-panel)] backdrop-blur-md border border-[var(--space-border-default)] rounded-2xl',
    flat: 'bg-[var(--space-surface-muted)] rounded-lg border border-[var(--space-border-default)]',
  },
  
  // ---------------------------------------------------------------------------
  // BADGES / PILLS - UPDATE accent with brand color (NOT purple)
  // ---------------------------------------------------------------------------
  badge: {
    // Pass Forty-One: tag pills carry the 4px maximum radius — never fully round.
    default: 'px-2 py-0.5 text-xs font-medium rounded',
    primary: 'bg-[var(--space-surface-accent-soft)] text-[var(--space-text-brand)]',
    accent: 'bg-[var(--space-brand-highlight-100)] text-[var(--space-text-accent)]',
    success: 'bg-[var(--space-semantic-success-100)] text-[var(--space-semantic-success-700)]',
    warning: 'bg-[var(--space-semantic-warning-100)] text-[var(--space-semantic-warning-700)]',
    danger: 'bg-[var(--space-semantic-danger-100)] text-[var(--space-semantic-danger-700)]',
    neutral: 'bg-[var(--space-surface-muted)] text-[var(--space-text-secondary)]',
  },
  
  // ---------------------------------------------------------------------------
  // LAYOUTS
  // ---------------------------------------------------------------------------
  layout: {
    // Full-screen centered layout (for gates, modals)
    centerScreen: 'min-h-screen flex items-center justify-center',
    // Container with padding
    container: 'max-w-md w-full mx-auto p-8',
  },
  
  // ---------------------------------------------------------------------------
  // BACKGROUNDS & GRADIENTS - UPDATE accent with brand color (NOT purple)
  // ---------------------------------------------------------------------------
  bg: {
    page: 'bg-[linear-gradient(135deg,var(--space-surface-gradient-from),var(--space-surface-gradient-via),var(--space-surface-gradient-to))]',
    gate: 'bg-[linear-gradient(135deg,var(--space-surface-gradient-from),var(--space-surface-gradient-via),var(--space-surface-gradient-to))]',
    card: 'bg-[var(--space-surface-card)]',
    muted: 'bg-[var(--space-surface-muted)]',
    accent: 'bg-[var(--space-surface-accent-soft)]',
  },
  
  // ---------------------------------------------------------------------------
  // AGENT (AI Assistant styling) - UPDATE ALL with brand color (NOT purple!)
  // ---------------------------------------------------------------------------
  agent: {
    icon: 'text-[var(--space-shell-icon)]',
    fab: 'bg-[var(--space-surface-card)] border border-[var(--space-brand-highlight)] text-[var(--space-brand-highlight-700)] hover:bg-[var(--space-surface-accent-soft)] shadow-[0_6px_20px_var(--space-shell-shadow)]',
    headerIcon: 'text-[var(--space-shell-icon)]',
    dockActive: 'bg-[var(--space-surface-accent-soft)] text-[var(--space-brand-highlight-700)] ring-1 ring-[var(--space-brand-highlight)]',
    dockInactive: 'bg-[var(--space-surface-muted)] text-[var(--space-text-primary)]',
  },
  
  // ---------------------------------------------------------------------------
  // APP ICONS (mini app icon colors) - UPDATE active with brand color (NOT purple)
  // ---------------------------------------------------------------------------
  appIcon: {
    // Default app icon color
    default: 'text-[var(--space-text-brand)]',
    // Files/Memory icon
    files: 'text-[var(--space-text-brand)]',
    // Settings icon  
    settings: 'text-[var(--space-text-secondary)]',
    active: 'text-[var(--space-text-accent)]',
  },
  
  // ---------------------------------------------------------------------------
  // LEGACY (for backwards compatibility)
  // ---------------------------------------------------------------------------
  priority: {
    high: 'bg-[var(--space-semantic-danger-100)] text-[var(--space-semantic-danger-700)]',
    medium: 'bg-[var(--space-semantic-warning-100)] text-[var(--space-semantic-warning-700)]',
    low: 'bg-[var(--space-semantic-success-100)] text-[var(--space-semantic-success-700)]',
  },
  
  category: {
    work: 'bg-[var(--space-surface-accent-soft)] text-[var(--space-text-brand)]',
    ideas: 'bg-[var(--space-brand-highlight-100)] text-[var(--space-text-accent)]',
    personal: 'bg-[var(--space-semantic-success-100)] text-[var(--space-semantic-success-700)]',
    other: 'bg-[var(--space-surface-muted)] text-[var(--space-text-secondary)]',
  },

  typography,
} as const;

// =============================================================================
// COMPONENT-SPECIFIC STYLES
// =============================================================================

/**
 * EmailGate and authentication screen styles
 * Mobile-first responsive design with safe area support
 */
export const authStyles = {
  // Container - full screen centered with gradient, mobile-friendly padding
  container: `${tw.layout.centerScreen} ${tw.bg.gate} p-4 sm:p-8 safe-top safe-bottom`,
  // Card - elevated white card with responsive padding
  card: `${tw.card.elevated} p-6 sm:p-8 max-w-md w-full mx-4 sm:mx-auto`,
  // Title - responsive font size
  title: `text-xl sm:text-2xl ${typography.weight.semibold} ${typography.color.primary} text-center mb-2`,
  // Subtitle
  subtitle: `${typography.size.sm} ${typography.color.secondary} text-center`,
  // Input wrapper
  inputWrapper: 'space-y-4',
  // Input field - larger touch targets on mobile
  input: (hasError: boolean) => 
    `${tw.input.base} ${hasError ? tw.input.error : tw.input.default} text-base`,
  // Error message
  errorText: `mt-1.5 ${typography.size.xs} ${typography.color.danger}`,
  // Submit button - larger touch target on mobile
  submitButton: (disabled: boolean) =>
    `w-full px-4 py-3.5 sm:py-3 rounded-lg ${tw.button.primary} ${disabled ? tw.button.disabled : ''} text-base`,
  // Footer text
  footerText: `${typography.size.xs} ${typography.color.tertiary} text-center mt-4`,
} as const;

/**
 * Settings screen styles.
 *
 * The Settings overlay is a DASHBOARD SURFACE, not a separate product: it
 * borrows the same furniture every Ethaion tab is built from — the global
 * `hab-section-head` (Cormorant), `hab-kicker` (small-caps field labels) and
 * `hab-input` (one hairline text box) utilities declared in Desktop.tsx —
 * plus the house outlined-gold button. Nothing here invents a colour, a
 * radius or a type scale of its own.
 */
export const settingsStyles = {
  container: 'h-full overflow-y-auto bg-[var(--space-surface-card)]',
  // Phone gets real edge padding instead of the desktop 32px inset.
  innerContainer: 'max-w-md mx-auto px-5 py-6 sm:px-8 sm:py-8',
  section: 'space-y-5',
  /** Section headings — the same Cormorant head the tabs use. */
  sectionHead: `hab-section-head ${typography.color.primary}`,
  /** Field labels — the house small-caps kicker. */
  label: `hab-kicker block ${typography.color.tertiary} mb-2`,
  input: (hasError: boolean) =>
    `hab-input w-full ${hasError ? 'border-[var(--space-semantic-danger)]' : ''}`,
  errorText: `mt-1.5 ${typography.size.xs} ${typography.color.danger}`,
  /** The primary action — outlined warm gold, uppercase Cormorant. */
  saveButton: (disabled: boolean) =>
    `w-full px-4 min-h-[46px] ${tw.button.primary} inline-flex items-center justify-center gap-2 uppercase tracking-[0.12em] text-[13px] ${disabled ? tw.button.disabled : ''}`,
  /** The quieter companion action (Manage billing, Sign out). */
  secondaryButton:
    `px-4 min-h-[44px] ${tw.button.secondary} inline-flex items-center justify-center gap-2 uppercase tracking-[0.12em] text-[12px]`,
} as const;

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Get gradient class from config or return default
 */
export function getGradientClass(gradient?: string): string {
  return gradient || tw.bg.page;
}

/**
 * Get font family style object for inline styles
 */
export function getFontFamily(): React.CSSProperties {
  return { fontFamily: "var(--space-font-family, system-ui, sans-serif)" };
}

/**
 * Combine class names (simple utility)
 */
export function cn(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

// =============================================================================
// THE ROOMS Beau can speak in
// =============================================================================

/**
 * THE BEAU CHAT ROOM (founder's correction, August 2026) — the customer-
 * facing conversation is NOT a separate dark room any more. It shares the
 * dashboard's warm cream/linen palette, its walnut ink and its outlined gold
 * controls, so moving between a tab and Beau reads as one product.
 *
 * The object re-asserts the dashboard token values rather than merely
 * omitting the dark overrides, so a chat surface nested inside any panel
 * lands on the page palette whatever its ancestor set.
 */
export const beauChatRoom: React.CSSProperties = {
  background: '#fbf8f1',
  color: '#3b2b1d',
  ['--space-surface-page' as any]: '#efe7d9',
  ['--space-surface-page-alt' as any]: '#eadfcb',
  ['--space-surface-card' as any]: '#fbf8f1',
  ['--space-surface-card-hover' as any]: '#eadfcb',
  ['--space-surface-panel' as any]: '#fbf8f1',
  ['--space-surface-panel-strong' as any]: '#e4d8c3',
  ['--space-surface-muted' as any]: '#eadfcb',
  ['--space-surface-accent-soft' as any]: '#fbf1de',
  ['--space-border-default' as any]: 'rgba(59,43,29,0.18)',
  ['--space-border-strong' as any]: 'rgba(59,43,29,0.34)',
  ['--space-text-primary' as any]: '#3b2b1d',
  ['--space-text-secondary' as any]: '#634e38',
  ['--space-text-muted' as any]: '#856c51',
  ['--space-text-brand' as any]: '#7c4a17',
  ['--space-text-accent' as any]: '#7c4a17',
  ['--space-text-on-primary' as any]: '#fbf1de',
  ['--space-text-on-highlight' as any]: '#fbf1de',
  ['--space-brand-primary' as any]: '#a8712c',
  ['--space-brand-primary-50' as any]: '#fbf1de',
  ['--space-brand-primary-100' as any]: '#f3ddb6',
  ['--space-brand-primary-200' as any]: '#e3c184',
  ['--space-brand-primary-500' as any]: '#b07d31',
  ['--space-brand-primary-600' as any]: '#a8712c',
  ['--space-brand-primary-700' as any]: '#7c4a17',
  ['--space-brand-highlight' as any]: '#a8712c',
  ['--space-brand-highlight-100' as any]: '#f3ddb6',
  ['--space-brand-highlight-600' as any]: '#a8712c',
  ['--space-brand-highlight-700' as any]: '#7c4a17',
  ['--space-semantic-danger' as any]: '#7d2a24',
  ['--space-shell-icon' as any]: '#a8712c',
  ['--space-neutral-800' as any]: '#453325',
  ['--space-neutral-100' as any]: '#fbf8f1',
};

/**
 * The dark room — walnut ground #241a12, text #f6f0e5, accent-300 #e3c184
 * kickers. Applying it to a surface's root re-maps every `--space-*` token
 * the descendants consume without touching any child component.
 *
 * NOTHING USES IT AS OF August 2026: the customer chat, which was its only
 * consumer, moved onto `beauChatRoom` above so it matches the dashboard. It
 * is kept because it is the complete, working definition of the dark
 * treatment — re-darkening a surface is one import away.
 */
export const beauDarkRoom: React.CSSProperties = {
  background: '#241a12',
  color: '#f6f0e5',
  ['--space-surface-page' as any]: '#241a12',
  ['--space-surface-page-alt' as any]: '#1d1510',
  ['--space-surface-card' as any]: '#241a12',
  ['--space-surface-card-hover' as any]: '#32251a',
  ['--space-surface-panel' as any]: '#2e2117',
  ['--space-surface-panel-strong' as any]: '#3b2c1e',
  ['--space-surface-muted' as any]: '#32251a',
  ['--space-surface-accent-soft' as any]: 'rgba(227,193,132,0.14)',
  ['--space-border-default' as any]: 'rgba(246,240,229,0.15)',
  ['--space-border-strong' as any]: 'rgba(246,240,229,0.32)',
  ['--space-text-primary' as any]: '#f6f0e5',
  ['--space-text-secondary' as any]: '#e3d7c0',
  ['--space-text-muted' as any]: '#c5b193',
  ['--space-text-brand' as any]: '#e3c184',
  ['--space-text-accent' as any]: '#e3c184',
  ['--space-text-on-primary' as any]: '#241a12',
  ['--space-text-on-highlight' as any]: '#241a12',
  ['--space-brand-primary' as any]: '#e3c184',
  ['--space-brand-primary-50' as any]: 'rgba(227,193,132,0.12)',
  ['--space-brand-primary-100' as any]: 'rgba(227,193,132,0.22)',
  ['--space-brand-primary-200' as any]: '#e3c184',
  ['--space-brand-primary-500' as any]: '#e3c184',
  ['--space-brand-primary-600' as any]: '#e3c184',
  ['--space-brand-primary-700' as any]: '#e3c184',
  ['--space-brand-highlight' as any]: '#e3c184',
  ['--space-brand-highlight-100' as any]: 'rgba(227,193,132,0.22)',
  ['--space-brand-highlight-600' as any]: '#e3c184',
  ['--space-brand-highlight-700' as any]: '#e3c184',
  ['--space-semantic-danger' as any]: '#e09e92',
  ['--space-shell-icon' as any]: '#e3c184',
  ['--space-neutral-800' as any]: '#1a120b',
  ['--space-neutral-100' as any]: '#f6f0e5',
};
