import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

import type { ChangelogTarget } from './changelog.ts';
import { buildClientVersionManifest, CLIENT_VERSION_MANIFEST_PATH } from './clientVersion.ts';
import { generatedChangelogEntries } from './generated.ts';
import {
  appendChangelogEntry,
  applyChangelogDraftAction,
  buildChangelogGenerationPrompt,
  buildManualChangelogEntry,
  parseChangelogSeedNotes,
  serializeClientVersionManifest,
  type ChangelogDraftContent,
  serializeGeneratedChangelog,
  summarizeReleaseCommitLog,
} from './releaseGenerator.ts';

const rootDir = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const generatedPath = resolve(rootDir, 'src/shared/changelog/generated.ts');
const clientVersionPath = resolve(rootDir, 'public', CLIENT_VERSION_MANIFEST_PATH);

async function main() {
  const target = normalizeTarget(process.argv[2]);
  if (!target) {
    console.error('Usage: generate-changelog <frontend|backend|both>');
    process.exitCode = 1;
    return;
  }

  const gitHead = git(['rev-parse', '--short=12', 'HEAD']) || 'worktree';
  const releasedAt = Date.now();
  const summary = collectChangeSummary(target);
  let seedNotes: string[] = [];
  let content = readEnvChangelogContent();

  if (content) {
    seedNotes = content.bullets.slice();
  } else {
    seedNotes = await promptChangelogSeedNotes(target);
    content = await draftChangelogFromSeed(target, summary, seedNotes);
  }

  content = await reviewChangelogDraft(target, content, summary, seedNotes);
  if (!content) {
    console.error('[changelog] release changelog was not approved; aborting release.');
    process.exitCode = 1;
    return;
  }

  const entry = buildManualChangelogEntry({
    target,
    releasedAt,
    gitHead,
    title: content.title,
    bullets: content.bullets,
  });
  const next = appendChangelogEntry({ entries: generatedChangelogEntries }, entry);
  const clientVersion = buildClientVersionManifest(next.entries);
  mkdirSync(dirname(clientVersionPath), { recursive: true });
  writeFileSync(generatedPath, serializeGeneratedChangelog(next.entries));
  writeFileSync(clientVersionPath, serializeClientVersionManifest(clientVersion));
  console.log(`[changelog] wrote ${generatedPath}`);
  console.log(`[changelog] wrote ${clientVersionPath}`);
  console.log(`[changelog] ${entry.title}`);
}

function normalizeTarget(value: string | undefined): ChangelogTarget | null {
  if (value === 'frontend' || value === 'backend' || value === 'both') {
    return value;
  }
  return null;
}

function collectChangeSummary(target: ChangelogTarget) {
  const previous = findPreviousReleasedCommit(target);
  const range = previous ? `${previous}..HEAD` : 'HEAD~20..HEAD';
  const recentCommits = summarizeReleaseCommitLog(
    git(['log', '--oneline', '--decorate', '--no-merges', range]),
    previous ? '' : git(['log', '--oneline', '--decorate', '--no-merges', '-20']),
    previous,
  );
  const changedFiles = git(['diff', '--name-status', previous || 'HEAD~20', 'HEAD']) || (
    previous ? '(no committed file changes since previous changelog)' : '(none)'
  );
  const worktreeChanges = git(['status', '--short']) || '(clean)';
  const diffStat = git(['diff', '--stat', previous || 'HEAD~20']) || (
    worktreeChanges === '(clean)' ? '(none)' : '(worktree changes listed above)'
  );

  return [
    `Target: ${target}`,
    `Current commit: ${git(['rev-parse', '--short=12', 'HEAD']) || 'unknown'}`,
    `Previous release commit: ${previous || '(none found)'}`,
    '',
    'Commits since previous changelog:',
    recentCommits,
    '',
    'Committed files changed since previous changelog:',
    changedFiles,
    '',
    'Current worktree changes to include in this release:',
    worktreeChanges,
    '',
    'Diff stat since previous changelog including worktree:',
    diffStat,
  ].join('\n');
}

function findPreviousReleasedCommit(target: ChangelogTarget) {
  const entries = generatedChangelogEntries
    .filter((entry) => entry.gitHead && isRelevantTarget(target, entry.target))
    .sort((left, right) => right.releasedAt - left.releasedAt);
  return entries[0]?.gitHead ?? null;
}

function isRelevantTarget(target: ChangelogTarget, entryTarget: ChangelogTarget) {
  if (target === 'both') {
    return true;
  }
  return entryTarget === target || entryTarget === 'both';
}

async function draftChangelogFromSeed(
  target: ChangelogTarget,
  summary: string,
  seedNotes: string[],
  previousDraft?: ChangelogDraftContent | null,
  revisionPrompt?: string | null,
) {
  if (process.env.OPENAI_API_KEY) {
    try {
      return await generateWithOpenAI(target, summary, seedNotes, previousDraft, revisionPrompt);
    } catch (error) {
      console.warn(`[changelog] AI generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return promptManualChangelog(target, summary, seedNotes);
}

async function generateWithOpenAI(
  target: ChangelogTarget,
  summary: string,
  seedNotes: string[],
  previousDraft?: ChangelogDraftContent | null,
  revisionPrompt?: string | null,
) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_CHANGELOG_MODEL || 'gpt-4.1-mini',
      instructions: [
        'Write concise Driftlands player-facing release notes.',
        'Use the releaser supplied bulletpoints/keywords as the primary source.',
        'Use git context only to sanity check wording; do not add unrelated git changes.',
        'Do not mention commits, files, AI, prompts, or internal tooling.',
        'Return strict JSON with shape {"title": string, "bullets": string[]}.',
        'Use 2 to 5 bullets. Keep each bullet under 120 characters.',
      ].join('\n'),
      input: buildChangelogGenerationPrompt({
        target,
        seedNotes,
        gitSummary: summary,
        previousDraft,
        revisionPrompt,
      }),
      max_output_tokens: 600,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API returned HTTP ${response.status}`);
  }

  const payload = await response.json() as any;
  const text = extractResponseText(payload);
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed.title !== 'string' || !Array.isArray(parsed.bullets)) {
    throw new Error('OpenAI response did not contain a valid changelog JSON object.');
  }

  return {
    title: parsed.title,
    bullets: parsed.bullets.map((bullet: unknown) => String(bullet)).filter(Boolean),
  };
}

function extractResponseText(payload: any) {
  if (typeof payload.output_text === 'string') {
    return payload.output_text;
  }

  const parts: string[] = [];
  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === 'string') {
        parts.push(content.text);
      }
    }
  }
  return parts.join('\n').trim();
}

function readEnvChangelogContent(): ChangelogDraftContent | null {
  const envTitle = process.env.DRIFTLANDS_CHANGELOG_TITLE?.trim();
  const envBullets = process.env.DRIFTLANDS_CHANGELOG_BULLETS?.split('|').map((bullet) => bullet.trim()).filter(Boolean);
  if (envTitle && envBullets?.length) {
    return { title: envTitle, bullets: envBullets };
  }

  return null;
}

async function promptChangelogSeedNotes(target: ChangelogTarget) {
  const envNotes = parseChangelogSeedNotes(process.env.DRIFTLANDS_CHANGELOG_NOTES ?? '');
  if (envNotes.length) {
    return envNotes;
  }

  const envBullets = parseChangelogSeedNotes(process.env.DRIFTLANDS_CHANGELOG_BULLETS ?? '');
  if (envBullets.length) {
    return envBullets;
  }

  if (!input.isTTY || !output.isTTY) {
    throw new Error('DRIFTLANDS_CHANGELOG_NOTES is not set and changelog seed input is unavailable outside an interactive terminal.');
  }

  const rl = readline.createInterface({ input, output });
  try {
    console.log(`\n[changelog] ${target} release notes`);
    console.log('[changelog] Enter bulletpoints or keywords. Separate items with |, or press Enter after each item.');
    console.log('[changelog] Submit an empty line when done.\n');
    const notes: string[] = [];
    while (true) {
      const note = (await rl.question(`[changelog] Note ${notes.length + 1}: `)).trim();
      if (!note) {
        break;
      }
      notes.push(...parseChangelogSeedNotes(note));
    }

    if (!notes.length) {
      throw new Error('No changelog bulletpoints or keywords were provided.');
    }

    return notes;
  } finally {
    rl.close();
  }
}

async function promptManualChangelog(target: ChangelogTarget, summary: string, seedNotes: string[]) {
  if (!input.isTTY || !output.isTTY) {
    throw new Error('OPENAI_API_KEY is not set and manual changelog input is unavailable outside an interactive terminal.');
  }

  console.log('\n[changelog] AI generation is unavailable. Please write player-facing release notes from your notes.');
  console.log('[changelog] Your notes:');
  for (const note of seedNotes) {
    console.log(`[changelog] - ${note}`);
  }
  console.log('\n[changelog] Git context follows:\n');
  console.log(summary);
  console.log('');

  const rl = readline.createInterface({ input, output });
  try {
    const title = (await rl.question(`[changelog] Title for ${target} release: `)).trim();
    const bulletsRaw = (await rl.question('[changelog] Bullets, separated by | : ')).trim();
    return {
      title,
      bullets: bulletsRaw.split('|').map((bullet) => bullet.trim()).filter(Boolean),
    };
  } finally {
    rl.close();
  }
}

async function reviewChangelogDraft(
  target: ChangelogTarget,
  content: ChangelogDraftContent,
  summary: string,
  seedNotes: string[],
): Promise<ChangelogDraftContent | null> {
  if (isTruthy(process.env.DRIFTLANDS_CHANGELOG_ASSUME_APPROVED) || !input.isTTY || !output.isTTY) {
    return applyChangelogDraftAction(content, { type: 'approve' }).content;
  }

  const rl = readline.createInterface({ input, output });
  let draft = applyChangelogDraftAction(content, { type: 'approve' }).content;

  try {
    while (true) {
      printChangelogDraft(target, draft);
      const answer = (await rl.question('[changelog] Approve, suggest changes, show context, or abort? [a/r/s/x]: '))
        .trim()
        .toLowerCase();

      if (!answer || answer === 'a' || answer === 'approve') {
        return applyChangelogDraftAction(draft, { type: 'approve' }).content;
      }

      if (answer === 'r' || answer === 'revise' || answer === 'revision' || answer === 'suggest') {
        const revisionPrompt = (await rl.question('[changelog] What should change? ')).trim();
        if (!revisionPrompt) {
          console.log('[changelog] No revision prompt entered; keeping current draft.');
          continue;
        }
        draft = await draftChangelogFromSeed(target, summary, seedNotes, draft, revisionPrompt);
        continue;
      }

      if (answer === 's' || answer === 'summary') {
        console.log('\n[changelog] Your source notes:');
        for (const note of seedNotes) {
          console.log(`[changelog] - ${note}`);
        }
        console.log('\n[changelog] Git context used for sanity checking:\n');
        console.log(summary);
        console.log('');
        continue;
      }

      if (answer === 'x' || answer === 'abort' || answer === 'cancel') {
        return null;
      }

      console.log('[changelog] Please choose a, r, s, or x.');
    }
  } finally {
    rl.close();
  }
}

function printChangelogDraft(target: ChangelogTarget, content: ChangelogDraftContent) {
  console.log(`\n[changelog] Proposed ${target} release notes`);
  console.log(`[changelog] Title: ${content.title}`);
  console.log('[changelog] Bullets:');
  for (const bullet of content.bullets) {
    console.log(`[changelog] - ${bullet}`);
  }
  console.log('');
}

function isTruthy(value: unknown) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function git(args: string[]) {
  if (!existsSync(resolve(rootDir, '.git'))) {
    return '';
  }

  const result = spawnSync('git', args, {
    cwd: rootDir,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    return '';
  }
  return result.stdout.trim();
}

await main();
