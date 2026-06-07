import type { ChangelogTarget, ReleaseChangelogEntry } from './changelog.ts';

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

function sanitizeGitHead(gitHead: string) {
  return gitHead.trim().replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) || 'worktree';
}
