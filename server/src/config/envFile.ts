import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function parseEnvLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }

  const assignment = trimmed.startsWith('export ') ? trimmed.slice('export '.length).trimStart() : trimmed;
  const separatorIndex = assignment.indexOf('=');
  if (separatorIndex <= 0) {
    return null;
  }

  const key = assignment.slice(0, separatorIndex).trim();
  if (!ENV_KEY_PATTERN.test(key)) {
    return null;
  }

  let value = assignment.slice(separatorIndex + 1).trim();
  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
    value = value.slice(1, -1);
    if (quote === '"') {
      value = value
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    }
  } else {
    value = value.replace(/\s+#.*$/, '').trim();
  }

  return { key, value };
}

function loadEnvFile(path: string, lockedKeys: Set<string>): void {
  if (!existsSync(path)) {
    return;
  }

  const contents = readFileSync(path, 'utf8');
  for (const line of contents.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed || lockedKeys.has(parsed.key)) {
      continue;
    }

    process.env[parsed.key] = parsed.value;
  }
}

const lockedKeys = new Set(Object.keys(process.env));
const envFiles = process.env.DRIFTLANDS_ENV_FILE
  ? [resolve(process.cwd(), process.env.DRIFTLANDS_ENV_FILE)]
  : [resolve(process.cwd(), '.env'), resolve(process.cwd(), '.env.local')];

for (const envFile of envFiles) {
  loadEnvFile(envFile, lockedKeys);
}
