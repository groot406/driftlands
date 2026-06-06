import { normalizeWalletAddress } from '../../../src/shared/looperlands';
import { getLooperlandsApiUrl, getLooperlandsWeb3Url } from './looperlandsAuth';

const DEFAULT_LOOPERLANDS_PROXY_TIMEOUT_MS = 15_000;

class UpstreamTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Looperlands upstream request timed out after ${timeoutMs}ms.`);
    this.name = 'UpstreamTimeoutError';
  }
}

interface UpstreamTextResponse {
  status: number;
  ok: boolean;
  headers: Headers;
  body: string;
}

function getProxyTimeoutMs(): number {
  const raw = Number(process.env.LOOPERLANDS_PROXY_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_LOOPERLANDS_PROXY_TIMEOUT_MS;
}

function maskDebugValue(value: string | null | undefined, visible = 6): string {
  if (!value) return '(empty)';
  if (value.length <= visible * 2) return `${value.slice(0, 2)}...`;
  return `${value.slice(0, visible)}...${value.slice(-visible)}`;
}

function requestMeta(req: any): Record<string, unknown> {
  return {
    origin: req.headers?.origin ?? '-',
    ip: req.ip ?? req.socket?.remoteAddress ?? '-',
  };
}

function logProxy(event: string, details: Record<string, unknown>): void {
  console.log('[looperlands:proxy]', event, details);
}

function warnProxy(event: string, details: Record<string, unknown>): void {
  console.warn('[looperlands:proxy]', event, details);
}

function getSiweWallet(message: unknown): string | null {
  if (typeof message !== 'string') return null;
  return message.split('\n')[1] ?? null;
}

function getHeader(req: any, name: string): string | undefined {
  const value = req.headers?.[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0];
  }

  return typeof value === 'string' ? value : undefined;
}

async function fetchUpstreamText(input: string, init: RequestInit = {}): Promise<UpstreamTextResponse> {
  const timeoutMs = getProxyTimeoutMs();
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new UpstreamTimeoutError(timeoutMs));
    }, timeoutMs);
  });

  try {
    const upstream = await Promise.race([
      fetch(input, {
        ...init,
        signal: controller.signal,
      }),
      timeoutPromise,
    ]);
    const body = await Promise.race([
      upstream.text(),
      timeoutPromise,
    ]);
    return {
      status: upstream.status,
      ok: upstream.ok,
      headers: upstream.headers,
      body,
    };
  } catch (error) {
    throw error;
  } finally {
    clearTimeout(timeout!);
  }
}

async function sendUpstreamResponse(res: any, upstream: UpstreamTextResponse): Promise<void> {
  const contentType = upstream.headers.get('content-type');
  if (contentType) {
    res.set('content-type', contentType);
  }

  res.status(upstream.status).send(upstream.body);
}

async function sendWalletLoopersResponse(res: any, upstream: UpstreamTextResponse): Promise<void> {
  if (upstream.status === 500 && upstream.body.includes('Internal Server Error')) {
    res.status(401).json({ message: 'Looperlands auth token was rejected. Reconnect your wallet and try again.' });
    return;
  }

  const contentType = upstream.headers.get('content-type');
  if (contentType) {
    res.set('content-type', contentType);
  }

  res.status(upstream.status).send(upstream.body);
}

function sendProxyError(res: any, error: unknown): void {
  console.error('Looperlands proxy request failed:', error);
  if (error instanceof UpstreamTimeoutError) {
    res.status(504).json({ message: 'Looperlands API request timed out. Please try again.' });
    return;
  }

  res.status(502).json({ message: 'Could not reach the Looperlands API.' });
}

export function registerLooperlandsProxy(app: any): void {
  app.get('/api/looperlands/web3/nonce', async (req: any, res: any) => {
    const startedAt = Date.now();
    logProxy('nonce request', {
      ...requestMeta(req),
      upstream: `${getLooperlandsWeb3Url()}/web3/nonce`,
    });
    try {
      const upstream = await fetchUpstreamText(`${getLooperlandsWeb3Url()}/web3/nonce`, {
        headers: { 'Accept': 'application/json' },
      });
      logProxy('nonce response', {
        status: upstream.status,
        ok: upstream.ok,
        durationMs: Date.now() - startedAt,
      });
      await sendUpstreamResponse(res, upstream);
    } catch (error) {
      warnProxy('nonce failed', {
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      sendProxyError(res, error);
    }
  });

  app.post('/api/looperlands/web3/verify', async (req: any, res: any) => {
    const startedAt = Date.now();
    const walletAddress = getSiweWallet(req.body?.message);
    logProxy('verify request', {
      ...requestMeta(req),
      upstream: `${getLooperlandsWeb3Url()}/web3/verify`,
      walletAddress: maskDebugValue(walletAddress),
      network: req.body?.network,
      hasMessage: typeof req.body?.message === 'string',
      hasSignature: typeof req.body?.signature === 'string',
    });
    try {
      const upstream = await fetchUpstreamText(`${getLooperlandsWeb3Url()}/web3/verify`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(req.body ?? {}),
      });
      logProxy('verify response', {
        status: upstream.status,
        ok: upstream.ok,
        durationMs: Date.now() - startedAt,
        walletAddress: maskDebugValue(walletAddress),
      });
      await sendUpstreamResponse(res, upstream);
    } catch (error) {
      warnProxy('verify failed', {
        durationMs: Date.now() - startedAt,
        walletAddress: maskDebugValue(walletAddress),
        error: error instanceof Error ? error.message : String(error),
      });
      sendProxyError(res, error);
    }
  });

  app.get('/api/looperlands/game/wallet/:wallet/loopers', async (req: any, res: any) => {
    const startedAt = Date.now();
    let wallet = '(invalid)';
    try {
      const token = getHeader(req, 'x-auth-web3token');
      if (!token) {
        warnProxy('loopers missing token', {
          ...requestMeta(req),
          walletAddress: maskDebugValue(String(req.params.wallet ?? '')),
        });
        res.status(401).json({ message: 'Missing Looperlands auth token.' });
        return;
      }

      wallet = normalizeWalletAddress(decodeURIComponent(String(req.params.wallet ?? '')));
      logProxy('loopers request', {
        ...requestMeta(req),
        upstream: `${getLooperlandsApiUrl()}/game/wallet/${maskDebugValue(wallet)}/loopers`,
        walletAddress: maskDebugValue(wallet),
        hasToken: token.length > 0,
      });
      const upstream = await fetchUpstreamText(`${getLooperlandsApiUrl()}/game/wallet/${wallet}/loopers`, {
        headers: {
          'Accept': 'application/json',
          'X-AUTH-WEB3TOKEN': token,
        },
      });
      logProxy('loopers response', {
        status: upstream.status,
        ok: upstream.ok,
        durationMs: Date.now() - startedAt,
        walletAddress: maskDebugValue(wallet),
      });
      await sendWalletLoopersResponse(res, upstream);
    } catch (error) {
      warnProxy('loopers failed', {
        durationMs: Date.now() - startedAt,
        walletAddress: maskDebugValue(wallet),
        error: error instanceof Error ? error.message : String(error),
      });
      sendProxyError(res, error);
    }
  });
}
