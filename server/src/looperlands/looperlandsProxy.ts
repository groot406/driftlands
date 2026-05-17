import { normalizeWalletAddress } from '../../../src/shared/looperlands';
import { getLooperlandsApiUrl, getLooperlandsWeb3Url } from './looperlandsAuth';

function getHeader(req: any, name: string): string | undefined {
  const value = req.headers?.[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0];
  }

  return typeof value === 'string' ? value : undefined;
}

async function sendUpstreamResponse(res: any, upstream: Response): Promise<void> {
  const contentType = upstream.headers.get('content-type');
  if (contentType) {
    res.set('content-type', contentType);
  }

  res.status(upstream.status).send(await upstream.text());
}

async function sendWalletLoopersResponse(res: any, upstream: Response): Promise<void> {
  const body = await upstream.text();
  if (upstream.status === 500 && body.includes('Internal Server Error')) {
    res.status(401).json({ message: 'Looperlands auth token was rejected. Reconnect your wallet and try again.' });
    return;
  }

  const contentType = upstream.headers.get('content-type');
  if (contentType) {
    res.set('content-type', contentType);
  }

  res.status(upstream.status).send(body);
}

function sendProxyError(res: any, error: unknown): void {
  console.error('Looperlands proxy request failed:', error);
  res.status(502).json({ message: 'Could not reach the Looperlands API.' });
}

export function registerLooperlandsProxy(app: any): void {
  app.get('/api/looperlands/web3/nonce', async (_req: any, res: any) => {
    try {
      const upstream = await fetch(`${getLooperlandsWeb3Url()}/web3/nonce`, {
        headers: { 'Accept': 'application/json' },
      });
      await sendUpstreamResponse(res, upstream);
    } catch (error) {
      sendProxyError(res, error);
    }
  });

  app.post('/api/looperlands/web3/verify', async (req: any, res: any) => {
    try {
      const upstream = await fetch(`${getLooperlandsWeb3Url()}/web3/verify`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(req.body ?? {}),
      });
      await sendUpstreamResponse(res, upstream);
    } catch (error) {
      sendProxyError(res, error);
    }
  });

  app.get('/api/looperlands/game/wallet/:wallet/loopers', async (req: any, res: any) => {
    try {
      const token = getHeader(req, 'x-auth-web3token');
      if (!token) {
        res.status(401).json({ message: 'Missing Looperlands auth token.' });
        return;
      }

      const wallet = encodeURIComponent(normalizeWalletAddress(decodeURIComponent(String(req.params.wallet ?? ''))));
      const upstream = await fetch(`${getLooperlandsApiUrl()}/game/wallet/${wallet}/loopers`, {
        headers: {
          'Accept': 'application/json',
          'X-AUTH-WEB3TOKEN': token,
        },
      });
      await sendWalletLoopersResponse(res, upstream);
    } catch (error) {
      sendProxyError(res, error);
    }
  });
}
