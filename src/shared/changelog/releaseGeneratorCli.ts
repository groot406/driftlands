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
  buildManualChangelogEntry,
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
  let content: { title: string; bullets: string[] } | null = null;

  if (process.env.OPENAI_API_KEY) {
    try {
      content = await generateWithOpenAI(target, summary);
    } catch (error) {
      console.warn(`[changelog] AI generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!content) {
    content = await promptManualChangelog(target, summary);
  }

  content = await reviewChangelogDraft(target, content, summary);
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

async function generateWithOpenAI(target: ChangelogTarget, summary: string) {
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
        'Use only the supplied git summary. Do not mention commits, files, or internal tooling.',
        'Return strict JSON with shape {"title": string, "bullets": string[]}.',
        'Use 2 to 5 bullets. Keep each bullet under 120 characters.',
      ].join('\n'),
      input: `Release target: ${target}\n\n${summary}`,
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

async function promptManualChangelog(target: ChangelogTarget, summary: string) {
  const envTitle = process.env.DRIFTLANDS_CHANGELOG_TITLE?.trim();
  const envBullets = process.env.DRIFTLANDS_CHANGELOG_BULLETS?.split('|').map((bullet) => bullet.trim()).filter(Boolean);
  if (envTitle && envBullets?.length) {
    return { title: envTitle, bullets: envBullets };
  }

  if (!input.isTTY || !output.isTTY) {
    throw new Error('OPENAI_API_KEY is not set and manual changelog input is unavailable outside an interactive terminal.');
  }

  console.log('\n[changelog] AI generation is unavailable. Please write player-facing release notes.');
  console.log('[changelog] Git summary follows:\n');
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
): Promise<ChangelogDraftContent | null> {
  if (isTruthy(process.env.DRIFTLANDS_CHANGELOG_ASSUME_APPROVED) || !input.isTTY || !output.isTTY) {
    return applyChangelogDraftAction(content, { type: 'approve' }).content;
  }

  const rl = readline.createInterface({ input, output });
  let draft = applyChangelogDraftAction(content, { type: 'approve' }).content;

  try {
    while (true) {
      printChangelogDraft(target, draft);
      const answer = (await rl.question('[changelog] Approve, edit title, edit bullets, show summary, or abort? [a/t/b/s/x]: '))
        .trim()
        .toLowerCase();

      if (!answer || answer === 'a' || answer === 'approve') {
        return applyChangelogDraftAction(draft, { type: 'approve' }).content;
      }

      if (answer === 't' || answer === 'title') {
        const title = await rl.question(`[changelog] Title [${draft.title}]: `);
        draft = applyChangelogDraftAction(draft, {
          type: 'edit',
          title: title.trim() || draft.title,
        }).content;
        continue;
      }

      if (answer === 'b' || answer === 'bullets') {
        console.log('[changelog] Enter bullets separated by |');
        const bullets = await rl.question(`[changelog] Bullets [${draft.bullets.join(' | ')}]: `);
        draft = applyChangelogDraftAction(draft, {
          type: 'edit',
          bullets: parseBulletInput(bullets, draft.bullets),
        }).content;
        continue;
      }

      if (answer === 's' || answer === 'summary') {
        console.log('\n[changelog] Git summary used for this draft:\n');
        console.log(summary);
        console.log('');
        continue;
      }

      if (answer === 'x' || answer === 'abort' || answer === 'cancel') {
        return null;
      }

      console.log('[changelog] Please choose a, t, b, s, or x.');
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

function parseBulletInput(value: string, fallback: string[]) {
  const bullets = value.split('|').map((bullet) => bullet.trim()).filter(Boolean);
  return bullets.length ? bullets : fallback;
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
