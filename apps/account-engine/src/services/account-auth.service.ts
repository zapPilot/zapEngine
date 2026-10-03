import { createHash, randomBytes } from 'node:crypto';

import { getAddress, verifyMessage } from 'viem';
import { createSiweMessage } from 'viem/siwe';

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '../common/http';
import type { DatabaseService } from '../database/database.service';
import type { Tables } from '../types/database.types';
import {
  canClaimBundleWallet,
  classifyBundleWallet,
} from './bundle-owner.model';

export type AuthPurpose = Tables<'account_auth_challenges'>['purpose'];
const statements: Record<AuthPurpose, string> = {
  session: 'Sign in to manage your Zap Pilot bundle.',
  binding: 'Bind this wallet as an owner of your Zap Pilot bundle.',
  deletion: 'Permanently delete your Zap Pilot bundle.',
  reclaim: 'Move this watched wallet into your own new Zap Pilot bundle.',
};

export function isRecentOwnerSession(createdAt: string): boolean {
  const timestamp = Date.parse(createdAt);
  return Number.isFinite(timestamp) && timestamp >= Date.now() - 10 * 60 * 1000;
}

export function hashOwnerToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const checked = <T>(result: { data: T; error: unknown }): T => {
  if (result.error)
    throw result.error instanceof Error
      ? result.error
      : new Error(String(result.error));
  return result.data;
};

export function createAccountAuthService(database: DatabaseService) {
  const db = database.getClient();

  async function bundle(userId: string, address: string) {
    const [userResult, walletResult] = await Promise.all([
      db.from('users').select('created_at').eq('id', userId).maybeSingle(),
      db.from('user_crypto_wallets').select('*').eq('user_id', userId),
    ]);
    const user = checked(userResult);
    const wallets = checked(walletResult) ?? [];
    const wallet = wallets.find(
      (candidate) => candidate.wallet.toLowerCase() === address.toLowerCase(),
    );
    if (!user || !wallet)
      throw new NotFoundException('Wallet not registered in this bundle');
    return { user, wallets, wallet };
  }

  async function requireOwner(userId: string, address: string) {
    const { user, wallets, wallet } = await bundle(userId, address);
    if (!canClaimBundleWallet(wallet, wallets, user.created_at)) {
      const error = new ConflictException('WALLET_NOT_OWNER');
      Object.assign(error, {
        code: 'WALLET_NOT_OWNER',
        canReclaim:
          classifyBundleWallet(wallet, wallets, user.created_at) === 'watch',
      });
      throw error;
    }
    if (wallet.owner_bound_at) return { wallet, claimed: false };
    const result = await database.rpc('claim_bundle_owner', {
      p_user_id: userId,
      p_wallet_id: wallet.id,
    });
    return result as unknown as {
      wallet: Tables<'user_crypto_wallets'>;
      claimed: boolean;
    };
  }

  async function consume(
    challengeId: string,
    signature: string,
    purpose: AuthPurpose,
  ) {
    const challenge = checked(
      await db
        .from('account_auth_challenges')
        .select('*')
        .eq('id', challengeId)
        .maybeSingle(),
    );
    if (
      challenge?.purpose !== purpose ||
      challenge.consumed_at ||
      Date.parse(challenge.expires_at) <= Date.now()
    ) {
      throw new BadRequestException(
        'Challenge invalid, expired, or already consumed',
      );
    }
    if (!/^0x[0-9a-fA-F]{130}$/.test(signature))
      throw new BadRequestException('暫不支援智能合約錢包');
    let verified = false;
    try {
      verified = await verifyMessage({
        address: getAddress(challenge.wallet),
        message: challenge.message,
        signature: signature as `0x${string}`,
      });
    } catch {
      throw new BadRequestException('Invalid wallet signature');
    }
    if (!verified) throw new BadRequestException('Invalid wallet signature');
    const consumed = checked(
      await db
        .from('account_auth_challenges')
        .update({ consumed_at: new Date().toISOString() })
        .eq('id', challengeId)
        .is('consumed_at', null)
        .gt('expires_at', new Date().toISOString())
        .select('*')
        .maybeSingle(),
    );
    if (!consumed)
      throw new BadRequestException('Challenge expired or already consumed');
    return consumed;
  }

  async function issueSession(
    wallet: Tables<'user_crypto_wallets'>,
    claimed: boolean,
  ) {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    checked(
      await db.from('account_sessions').insert({
        token_hash: hashOwnerToken(token),
        user_id: wallet.user_id,
        wallet_id: wallet.id,
        expires_at: expiresAt,
      }),
    );
    return { token, userId: wallet.user_id, expiresAt, claimed };
  }

  return {
    async challenge(input: {
      purpose: AuthPurpose;
      userId: string;
      wallet: string;
      domain: string;
    }) {
      if (
        !/^(v2\.zap-pilot\.org|localhost(?::\d{1,5})?|127\.0\.0\.1(?::\d{1,5})?)$/.test(
          input.domain,
        )
      )
        throw new BadRequestException('Untrusted signing domain');
      const { wallet } = await bundle(input.userId, input.wallet);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 5 * 60 * 1000);
      const message = createSiweMessage({
        address: getAddress(input.wallet),
        chainId: 1,
        domain: input.domain,
        nonce: randomBytes(16).toString('hex'),
        uri: `${input.domain === 'v2.zap-pilot.org' ? 'https' : 'http'}://${input.domain}`,
        version: '1',
        statement: `${statements[input.purpose]} Bundle: ${input.userId}`,
        issuedAt: now,
        expirationTime: expiresAt,
      });
      checked(
        await db
          .from('account_auth_challenges')
          .delete()
          .lt(
            'expires_at',
            new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
          ),
      );
      const challenge = checked(
        await db
          .from('account_auth_challenges')
          .insert({
            purpose: input.purpose,
            user_id: input.userId,
            wallet_id: wallet.id,
            wallet: wallet.wallet,
            message,
            expires_at: expiresAt.toISOString(),
          })
          .select('id')
          .single(),
      );
      return {
        challengeId: challenge!.id,
        message,
        expiresAt: expiresAt.toISOString(),
      };
    },
    async session(challengeId: string, signature: string) {
      const challenge = await consume(challengeId, signature, 'session');
      const { wallet, claimed } = await requireOwner(
        challenge.user_id,
        challenge.wallet,
      );
      return issueSession(wallet, claimed);
    },
    async reclaim(challengeId: string, signature: string) {
      const challenge = await consume(challengeId, signature, 'reclaim');
      const { user, wallets, wallet } = await bundle(
        challenge.user_id,
        challenge.wallet,
      );
      if (classifyBundleWallet(wallet, wallets, user.created_at) !== 'watch')
        throw new ConflictException('WALLET_NOT_RECLAIMABLE');
      const reclaimed = await database.rpc('reclaim_bundle_wallet', {
        p_user_id: challenge.user_id,
        p_wallet_id: wallet.id,
      });
      return issueSession(
        reclaimed as unknown as Tables<'user_crypto_wallets'>,
        true,
      );
    },
    async authenticate(token: string) {
      const session = checked(
        await db
          .from('account_sessions')
          .select('*')
          .eq('token_hash', hashOwnerToken(token))
          .gt('expires_at', new Date().toISOString())
          .maybeSingle(),
      );
      if (!session)
        throw new UnauthorizedException(
          '請重新簽名，若使用舊版 Zap Pilot 請先更新',
        );
      return session;
    },
    async revoke(token: string) {
      checked(
        await db
          .from('account_sessions')
          .delete()
          .eq('token_hash', hashOwnerToken(token)),
      );
    },
    async verifyBinding(
      userId: string,
      address: string,
      challengeId: string,
      signature: string,
    ) {
      const challenge = await consume(challengeId, signature, 'binding');
      if (
        challenge.user_id !== userId ||
        challenge.wallet.toLowerCase() !== address.toLowerCase()
      )
        throw new BadRequestException(
          'Challenge does not match this wallet and bundle',
        );
      const { wallet } = await bundle(userId, address);
      const now = new Date().toISOString();
      checked(
        await db
          .from('user_crypto_wallets')
          .update({ owner_bound_at: now, ownership_verified_at: now })
          .eq('id', wallet.id),
      );
      return {
        success: true,
        message: 'Wallet ownership verified successfully',
        ownership_verified_at: now,
      };
    },
    async verifyDeletion(
      userId: string,
      challengeId: string,
      signature: string,
    ) {
      const challenge = await consume(challengeId, signature, 'deletion');
      if (challenge.user_id !== userId)
        throw new BadRequestException('Challenge does not match this bundle');
      await requireOwner(userId, challenge.wallet);
    },
  };
}

export type AccountAuthService = ReturnType<typeof createAccountAuthService>;
