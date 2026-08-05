/**
 * Human-readable names for agent tools
 */

const TOOL_NAME_PREFIX_RE = /^(?:functions\.|tools\.)/;

const toolNameAliases: Record<string, string> = {
  'edit_file': 'edit',
  'read_file': 'read',
  'list_files': 'ls',
  'run_command': 'bash',
  'shell': 'bash',
};

const toolTerms: Record<string, string> = {
  // File operations
  'read': 'reading file',
  'write': 'writing file',
  'edit': 'editing file',
  'glob': 'finding files',
  'grep': 'searching code',
  'ls': 'listing files',

  // Search operations
  'search_codebase': 'searching codebase',
  'do_web_search': 'searching the web',
  'web_fetch': 'fetching webpage',

  // Code operations
  'bash': 'running command',
  'get_server_logs': 'checking logs',

  // Generation
  'generate_image_tool': 'generating image',
  'generate_video_tool': 'generating video',

  // Default actions
  'thinking': 'thinking',
};

// Warm Editorial register: one tobacco-gold accent for activity, muted warm
// browns for everything else — no rainbow of tool colours fighting the palette.
const toolColors: Record<string, string> = {
  // File operations
  'read': 'text-[var(--space-text-brand)]',
  'write': 'text-[var(--space-semantic-success)]',
  'edit': 'text-[var(--space-text-accent)]',
  'glob': 'text-[var(--space-text-secondary)]',
  'grep': 'text-[var(--space-text-secondary)]',
  'ls': 'text-[var(--space-text-secondary)]',

  // Search
  'search_codebase': 'text-[var(--space-text-brand)]',
  'do_web_search': 'text-[var(--space-text-brand)]',
  'web_fetch': 'text-[var(--space-text-brand)]',

  // Code
  'bash': 'text-[var(--space-text-secondary)]',
  'get_server_logs': 'text-[var(--space-text-muted)]',

  // Generation
  'generate_image_tool': 'text-[var(--space-text-accent)]',
  'generate_video_tool': 'text-[var(--space-text-accent)]',

  // Default
  'thinking': 'text-[var(--space-text-muted)]',
};

export function normalizeToolName(toolName?: string | null): string {
  if (!toolName) {
    return '';
  }

  const strippedName = String(toolName).trim().replace(TOOL_NAME_PREFIX_RE, '');
  return toolNameAliases[strippedName] || strippedName;
}

export function getFriendlyTerm(toolName: string, fallback?: string): string {
  const normalizedToolName = normalizeToolName(toolName);
  return toolTerms[normalizedToolName] || fallback || normalizedToolName || toolName;
}

export function getToolColor(toolName: string): string {
  return toolColors[normalizeToolName(toolName)] || 'text-[var(--space-text-muted)]';
}
