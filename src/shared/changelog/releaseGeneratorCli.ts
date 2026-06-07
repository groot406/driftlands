import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

import type { ChangelogTarget } from './changelog.ts';
import { generatedChangelogEntries } from './generated.ts';
import {
  appendChangelogEntry,
  buildManualChangelogEntry,
  serializeGeneratedChangelog,
} from './releaseGenerator.ts';

const rootDir = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const generatedPath = resolve(rootDir, 'src/shared/changelog/generated.ts');

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

  const entry = buildManualChangelogEntry({
    target,
    releasedAt,
    gitHead,
    title: content.title,
    bullets: content.bullets,
  });
  const next = appendChangelogEntry({ entries: generatedChangelogEntries }, entry);
  writeFileSync(generatedPath, serializeGeneratedChangelog(next.entries));
  console.log(`[changelog] wrote ${generatedPath}`);
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
  return [
    `Target: ${target}`,
    `Current commit: ${git(['rev-parse', '--short=12', 'HEAD']) || 'unknown'}`,
    `Previous release commit: ${previous || '(none found)'}`,
    '',
    'Recent commits:',
    git(['log', '--oneline', '--decorate', '--no-merges', range]) || git(['log', '--oneline', '--decorate', '--no-merges', '-20']) || '(none)',
    '',
    'Changed files:',
    git(['diff', '--name-status', previous || 'HEAD~20', 'HEAD']) || '(none)',
    '',
    'Worktree changes:',
    git(['status', '--short']) || '(clean)',
    '',
    'Diff stat including worktree:',
    git(['diff', '--stat', previous || 'HEAD~20']) || '(none)',
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
