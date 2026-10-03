export interface OwnerAuthOptions {
  userId: string;
  interactive?: boolean;
  recent?: boolean;
}

export interface AccountOwnerSessionProvider {
  getToken(options: OwnerAuthOptions): Promise<string | null>;
  invalidate(userId: string): Promise<void> | void;
}

export class AccountSessionRequiredError extends Error {
  readonly code = 'ACCOUNT_SESSION_REQUIRED';
  readonly status = 401;
  constructor() {
    super('請重新簽名，若使用舊版 Zap Pilot 請先更新');
    this.name = 'AccountSessionRequiredError';
  }
}

let provider: AccountOwnerSessionProvider | null = null;

export function configureAccountOwnerSession(
  next: AccountOwnerSessionProvider,
): () => void {
  provider = next;
  return () => {
    if (provider === next) provider = null;
  };
}

export async function withOwnerAuth<T>(
  options: OwnerAuthOptions,
  request: (headers: Record<string, string>) => Promise<T>,
): Promise<T> {
  const current = provider;
  if (!current) throw new AccountSessionRequiredError();
  const token = await current.getToken(options);
  if (!token) throw new AccountSessionRequiredError();
  try {
    return await request({ Authorization: `Bearer ${token}` });
  } catch (error) {
    if (
      !error ||
      typeof error !== 'object' ||
      !('status' in error) ||
      error.status !== 401
    )
      throw error;
    await current.invalidate(options.userId);
    if (!options.interactive) throw new AccountSessionRequiredError();
    const replacement = await current.getToken({ ...options, recent: true });
    if (!replacement) throw new AccountSessionRequiredError();
    return request({ Authorization: `Bearer ${replacement}` });
  }
}
