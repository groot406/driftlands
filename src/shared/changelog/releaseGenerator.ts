import type { ChangelogTarget, ReleaseChangelogEntry } from './changelog.ts';
import type { ClientVersionManifest } from './clientVersion.ts';

export interface ExistingChangelogModule {
  entries: ReleaseChangelogEntry[];
}

export interface ManualChangelogEntryInput {
  target: ChangelogTarget;
  releasedAt: number;
  gitHead: string;
  title: string;
  bullets: string[];
}

export interface ChangelogDraftContent {
  title: string;
  bullets: string[];
}

export type ChangelogDraftAction =
  | { type: 'approve' }
  | { type: 'edit'; title?: string; bullets?: string[] }
  | { type: 'abort' };

export interface ChangelogGenerationPromptInput {
  target: ChangelogTarget;
  seedNotes: string[];
  gitSummary: string;
  previousDraft?: ChangelogDraftContent | null;
  revisionPrompt?: string | null;
}

export function parseChangelogSeedNotes(value: string): string[] {
  return value
    .split(/\r?\n|\|/)
    .map((note) => note.trim())
    .filter(Boolean);
}

export function buildChangelogGenerationPrompt(input: ChangelogGenerationPromptInput): string {
  const notes = input.seedNotes.length
    ? input.seedNotes.map((note) => `- ${note}`).join('\n')
    : '- General Driftlands update';
  const previousDraft = input.previousDraft
    ? `\nPrevious draft:\n${JSON.stringify(input.previousDraft, null, 2)}\n`
    : '';
  const revision = input.revisionPrompt?.trim()
    ? `\nRevision request from releaser:\n${input.revisionPrompt.trim()}\n`
    : '';

  return [
    `Release target: ${input.target}`,
    '',
    'Releaser supplied bulletpoints/keywords. Treat these as the primary source:',
    notes,
    previousDraft,
    revision,
    'Git context for sanity checking only. Do not invent notes from this if the releaser notes do not mention them:',
    input.gitSummary,
  ].join('\n');
}

export function summarizeReleaseCommitLog(
  commitLog: string,
  fallbackCommitLog: string,
  previousReleaseCommit: string | null,
): string {
  const normalizedCommitLog = commitLog.trim();
  if (normalizedCommitLog) {
    return normalizedCommitLog;
  }

  if (previousReleaseCommit) {
    return '(no commits since previous changelog)';
  }

  return fallbackCommitLog.trim() || '(none)';
}

export function buildManualChangelogEntry(input: ManualChangelogEntryInput): ReleaseChangelogEntry {
  const sanitizedTitle = input.title.trim() || 'Driftlands update';
  const bullets = input.bullets
    .map((bullet) => bullet.trim())
    .filter(Boolean);

  return {
    id: `${input.target}-${input.releasedAt}-${sanitizeGitHead(input.gitHead)}`,
    releasedAt: input.releasedAt,
    target: input.target,
    title: sanitizedTitle,
    bullets: bullets.length ? bullets : ['A new Driftlands update is available.'],
    gitHead: input.gitHead,
  };
}

export function normalizeChangelogDraftContent(content: ChangelogDraftContent): ChangelogDraftContent {
  const title = content.title.trim() || 'Driftlands update';
  const bullets = content.bullets
    .map((bullet) => bullet.trim())
    .filter(Boolean);

  return {
    title,
    bullets: bullets.length ? bullets : ['A new Driftlands update is available.'],
  };
}

export function applyChangelogDraftAction(
  content: ChangelogDraftContent,
  action: ChangelogDraftAction,
): { content: ChangelogDraftContent; approved: boolean; aborted: boolean } {
  if (action.type === 'abort') {
    return {
      content: normalizeChangelogDraftContent(content),
      approved: false,
      aborted: true,
    };
  }

  if (action.type === 'approve') {
    return {
      content: normalizeChangelogDraftContent(content),
      approved: true,
      aborted: false,
    };
  }

  return {
    content: normalizeChangelogDraftContent({
      title: action.title ?? content.title,
      bullets: action.bullets ?? content.bullets,
    }),
    approved: false,
    aborted: false,
  };
}

export function appendChangelogEntry(
  existing: ExistingChangelogModule,
  entry: ReleaseChangelogEntry,
): ExistingChangelogModule {
  const entries = existing.entries.filter((candidate) => candidate.id !== entry.id);
  entries.push({ ...entry, bullets: entry.bullets.slice() });
  entries.sort((left, right) => left.releasedAt - right.releasedAt || left.id.localeCompare(right.id));
  return { entries };
}

export function serializeGeneratedChangelog(entries: ReleaseChangelogEntry[]): string {
  const serialized = JSON.stringify(entries, null, 2);
  return `import type { ReleaseChangelogEntry } from './changelog.ts';\n\n// This file is updated by scripts/generate-changelog.mjs during release.\nexport const generatedChangelogEntries: ReleaseChangelogEntry[] = ${serialized};\n`;
}

export function serializeClientVersionManifest(manifest: ClientVersionManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function sanitizeGitHead(gitHead: string) {
  return gitHead.trim().replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) || 'worktree';
}
