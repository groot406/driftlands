const PREFIX = '[driftlands:wallet]';

export function maskDebugValue(value: string | null | undefined, visible = 6): string {
  if (!value) return '(empty)';
  if (value.length <= visible * 2) return `${value.slice(0, 2)}...`;
  return `${value.slice(0, visible)}...${value.slice(-visible)}`;
}

export function describeWalletError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  if (error && typeof error === 'object') {
    const candidate = error as { name?: unknown; message?: unknown; code?: unknown; status?: unknown };
    return {
      name: typeof candidate.name === 'string' ? candidate.name : undefined,
      message: typeof candidate.message === 'string' ? candidate.message : String(error),
      code: candidate.code,
      status: candidate.status,
    };
  }

  return { message: String(error) };
}

export function walletLog(event: string, details?: Record<string, unknown>): void {
  if (details) {
    console.info(PREFIX, event, details);
    return;
  }

  console.info(PREFIX, event);
}

export function walletWarn(event: string, details?: Record<string, unknown>): void {
  if (details) {
    console.warn(PREFIX, event, details);
    return;
  }

  console.warn(PREFIX, event);
}
