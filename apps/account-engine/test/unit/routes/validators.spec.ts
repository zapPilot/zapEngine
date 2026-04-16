import {
  addWalletBodySchema,
  dailySuggestionBatchBodySchema,
  jobIdParamSchema,
  singleUserReportBodySchema,
  updateEmailBodySchema,
  updateWalletLabelBodySchema,
  uuidParamSchema,
  walletAddressParamSchema,
  walletBodySchema,
  walletIdParamSchema,
} from '@routes/validators';

const validUuid = '12345678-1234-1234-8234-123456789abc';
const validWallet = '0x1234567890abcdef1234567890abcdef12345678';

describe('Route validators', () => {
  describe('uuidParamSchema', () => {
    it('accepts valid UUID v4', () => {
      expect(uuidParamSchema.safeParse({ userId: validUuid }).success).toBe(
        true,
      );
    });

    it('rejects invalid UUID', () => {
      expect(uuidParamSchema.safeParse({ userId: 'not-uuid' }).success).toBe(
        false,
      );
    });
  });

  describe('jobIdParamSchema', () => {
    it('accepts non-empty jobId', () => {
      expect(jobIdParamSchema.safeParse({ jobId: 'j-1' }).success).toBe(true);
    });

    it('rejects empty jobId', () => {
      expect(jobIdParamSchema.safeParse({ jobId: '' }).success).toBe(false);
    });
  });

  describe('walletAddressParamSchema', () => {
    it('accepts valid userId + wallet address', () => {
      const result = walletAddressParamSchema.safeParse({
        userId: validUuid,
        walletAddress: validWallet,
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid wallet address', () => {
      const result = walletAddressParamSchema.safeParse({
        userId: validUuid,
        walletAddress: 'not-a-wallet',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('walletIdParamSchema', () => {
    it('accepts valid userId + walletId', () => {
      const result = walletIdParamSchema.safeParse({
        userId: validUuid,
        walletId: validUuid,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('walletBodySchema', () => {
    it('accepts valid wallet', () => {
      expect(walletBodySchema.safeParse({ wallet: validWallet }).success).toBe(
        true,
      );
    });

    it('rejects invalid wallet', () => {
      expect(walletBodySchema.safeParse({ wallet: 'bad' }).success).toBe(false);
    });
  });

  describe('addWalletBodySchema', () => {
    it('accepts wallet with optional label', () => {
      const result = addWalletBodySchema.safeParse({
        wallet: validWallet,
        label: 'My Wallet',
      });
      expect(result.success).toBe(true);
    });

    it('rejects label over 100 characters', () => {
      const result = addWalletBodySchema.safeParse({
        wallet: validWallet,
        label: 'x'.repeat(101),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('updateEmailBodySchema', () => {
    it('accepts valid email', () => {
      expect(
        updateEmailBodySchema.safeParse({ email: 'user@test.com' }).success,
      ).toBe(true);
    });

    it('rejects invalid email', () => {
      expect(
        updateEmailBodySchema.safeParse({ email: 'not-an-email' }).success,
      ).toBe(false);
    });

    it('rejects email with spaces', () => {
      expect(
        updateEmailBodySchema.safeParse({ email: 'user @test.com' }).success,
      ).toBe(false);
    });
  });

  describe('updateWalletLabelBodySchema', () => {
    it('accepts valid label', () => {
      expect(
        updateWalletLabelBodySchema.safeParse({ label: 'My Wallet' }).success,
      ).toBe(true);
    });

    it('rejects empty label', () => {
      expect(updateWalletLabelBodySchema.safeParse({ label: '' }).success).toBe(
        false,
      );
    });
  });

  describe('singleUserReportBodySchema', () => {
    it('accepts valid body', () => {
      const result = singleUserReportBodySchema.safeParse({
        userId: validUuid,
      });
      expect(result.success).toBe(true);
    });

    it('accepts with optional fields', () => {
      const result = singleUserReportBodySchema.safeParse({
        userId: validUuid,
        testMode: true,
        testRecipient: 'qa@test.com',
        note: 'debug',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid testRecipient email', () => {
      const result = singleUserReportBodySchema.safeParse({
        userId: validUuid,
        testRecipient: 'not-email',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('dailySuggestionBatchBodySchema', () => {
    it('accepts empty body', () => {
      expect(dailySuggestionBatchBodySchema.safeParse({}).success).toBe(true);
    });

    it('accepts valid userIds array', () => {
      const result = dailySuggestionBatchBodySchema.safeParse({
        userIds: [validUuid],
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid UUIDs in userIds', () => {
      const result = dailySuggestionBatchBodySchema.safeParse({
        userIds: ['not-uuid'],
      });
      expect(result.success).toBe(false);
    });
  });
});
