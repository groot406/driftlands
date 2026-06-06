#!/usr/bin/env node

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const uiDir = resolve(rootDir, 'tools/perf-monitor');
const defaultTarget = normalizeTarget(
  readArg('target') || process.env.PERF_MONITOR_TARGET || 'https://driftlands.ddns.net/debug/perf',
);
const port = parsePort(readArg('port') || process.env.PERF_MONITOR_PORT || process.env.PORT || '8787');
const upstreamTimeoutMs = Math.max(1000, Math.floor(Number(readArg('timeout-ms') || process.env.PERF_MONITOR_TIMEOUT_MS || '8000')));

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function readArg(name) {
  const prefix = `--${name}=`;
  const direct = process.argv.find((arg) => arg.startsWith(prefix));
  if (direct) return direct.slice(prefix.length);

  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];

  return null;
}

function parsePort(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid PERF_MONITOR_PORT: ${value}`);
  }

  return parsed;
}

function normalizeTarget(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`Perf monitor target must be http or https: ${value}`);
  }

  if (url.pathname === '/' || url.pathname === '') {
    url.pathname = '/debug/perf';
  }

  return url.toString();
}

function json(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
  });
  res.end(JSON.stringify(payload));
}

async function proxyPerf(req, res, requestUrl) {
  let target;
  try {
    target = normalizeTarget(requestUrl.searchParams.get('target') || defaultTarget);
  } catch (error) {
    json(res, 400, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), upstreamTimeoutMs);
  try {
    const upstream = await fetch(target, {
      headers: {
        accept: 'application/json',
        'user-agent': 'driftlands-local-perf-monitor',
      },
      cache: 'no-store',
      signal: controller.signal,
    });
    const body = await upstream.text();
    clearTimeout(timeout);

    res.writeHead(upstream.status, {
      'content-type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'x-perf-monitor-target': target,
      'x-perf-monitor-upstream-ms': String(Date.now() - startedAt),
    });
    res.end(body);
  } catch (error) {
    clearTimeout(timeout);
    const timedOut = error instanceof Error && error.name === 'AbortError';
    json(res, timedOut ? 504 : 502, {
      ok: false,
      target,
      timeoutMs: timedOut ? upstreamTimeoutMs : undefined,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function serveStatic(res, pathname) {
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = resolve(uiDir, relativePath);

  if (!filePath.startsWith(`${uiDir}/`) && filePath !== resolve(uiDir, 'index.html')) {
    json(res, 403, { ok: false, error: 'Forbidden path' });
    return;
  }

  try {
    const body = await readFile(filePath);
    res.writeHead(200, {
      'content-type': mimeTypes[extname(filePath)] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch {
    json(res, 404, { ok: false, error: 'Not found' });
  }
}

const server = createServer((req, res) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || `localhost:${port}`}`);

  if (requestUrl.pathname === '/api/perf') {
    void proxyPerf(req, res, requestUrl);
    return;
  }

  void serveStatic(res, requestUrl.pathname);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Driftlands perf monitor: http://localhost:${port}`);
  console.log(`Proxy target: ${defaultTarget}`);
  console.log(`Upstream timeout: ${upstreamTimeoutMs} ms`);
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
