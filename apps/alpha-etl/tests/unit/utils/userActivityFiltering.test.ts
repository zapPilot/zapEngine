import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  shouldUpdateUser,
  filterVipUsersByActivity,
  ACTIVITY_THRESHOLDS,
  type UserFilteringOptions,
} from '../../../src/modules/vip-users/activityFiltering.js';
import type { VipUserWithActivity } from '../../../src/types/index.js';

describe('userActivityFiltering', () => {
  const SEVEN_DAYS_MS = ACTIVITY_THRESHOLDS.SEVEN_DAYS_MS;
  let now: Date;

  beforeEach(() => {
    // Set a fixed "now" for consistent testing
    now = new Date('2025-01-15T12:00:00Z');
    vi.setSystemTime(now);
  });

  describe('shouldUpdateUser', () => {
    describe('never updated before', () => {
      it('should return true when user has never been updated', () => {
        const user: VipUserWithActivity = {
          user_id: 'user1',
          wallet: '0x1234567890abcdef',
          last_activity_at: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
          last_portfolio_update_at: null,
        };

        expect(shouldUpdateUser(user)).toBe(true);
      });

      it('should return true even if user has never had activity', () => {
        const user: VipUserWithActivity = {
          user_id: 'user1',
          wallet: '0x1234567890abcdef',
          last_activity_at: null,
          last_portfolio_update_at: null,
        };

        expect(shouldUpdateUser(user)).toBe(true);
      });
    });

    describe('active users', () => {
      it('should return true for user with activity within 7 days', () => {
        const user: VipUserWithActivity = {
          user_id: 'user1',
          wallet: '0x1234567890abcdef',
          last_activity_at: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
          last_portfolio_update_at: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
        };

        expect(shouldUpdateUser(user)).toBe(true);
      });

      it('should return true for user with activity today', () => {
        const user: VipUserWithActivity = {
          user_id: 'user1',
          wallet: '0x1234567890abcdef',
          last_activity_at: new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString(), // 1 hour ago
          last_portfolio_update_at: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
        };

        expect(shouldUpdateUser(user)).toBe(true);
      });

      it('should return true for user active exactly 6.9 days ago (< 7 days)', () => {
        const user: VipUserWithActivity = {
          user_id: 'user1',
          wallet: '0x1234567890abcdef',
          last_activity_at: new Date(now.getTime() - 6.9 * 24 * 60 * 60 * 1000).toISOString(),
          last_portfolio_update_at: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        };

        expect(shouldUpdateUser(user)).toBe(true);
      });
    });

    describe('inactive users', () => {
      it('should return false for inactive user with last update < 7 days ago', () => {
        const user: VipUserWithActivity = {
          user_id: 'user1',
          wallet: '0x1234567890abcdef',
          last_activity_at: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
          last_portfolio_update_at: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
        };

        expect(shouldUpdateUser(user)).toBe(false);
      });

      it('should return true for inactive user with last update >= 7 days ago', () => {
        const user: VipUserWithActivity = {
          user_id: 'user1',
          wallet: '0x1234567890abcdef',
          last_activity_at: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
          last_portfolio_update_at: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days ago (exactly)
        };

        expect(shouldUpdateUser(user)).toBe(true);
      });

      it('should return true for inactive user with last update > 7 days ago', () => {
        const user: VipUserWithActivity = {
          user_id: 'user1',
          wallet: '0x1234567890abcdef',
          last_activity_at: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
          last_portfolio_update_at: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString(), // 14 days ago
        };

        expect(shouldUpdateUser(user)).toBe(true);
      });

      it('should return false for inactive user with no activity ever but updated recently', () => {
        const user: VipUserWithActivity = {
          user_id: 'user1',
          wallet: '0x1234567890abcdef',
          last_activity_at: null,
          last_portfolio_update_at: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
        };

        expect(shouldUpdateUser(user)).toBe(false);
      });
    });

    describe('custom thresholds', () => {
      it('should use custom inactivity threshold', () => {
        const options: UserFilteringOptions = {
          inactivityThresholdMs: 3 * 24 * 60 * 60 * 1000, // 3 days
          updateThresholdMs: SEVEN_DAYS_MS,
        };

        // User with activity 4 days ago (inactive by custom threshold)
        const user: VipUserWithActivity = {
          user_id: 'user1',
          wallet: '0x1234567890abcdef',
          last_activity_at: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString(),
          last_portfolio_update_at: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString(), // 8 days ago
        };

        // Should update because last update is >= 7 days (even though user is inactive by custom threshold)
        expect(shouldUpdateUser(user, options)).toBe(true);
      });

      it('should use custom update threshold for inactive users', () => {
        const options: UserFilteringOptions = {
          inactivityThresholdMs: SEVEN_DAYS_MS,
          updateThresholdMs: 3 * 24 * 60 * 60 * 1000, // 3 days
        };

        // Inactive user (10 days no activity) but updated 4 days ago
        const user: VipUserWithActivity = {
          user_id: 'user1',
          wallet: '0x1234567890abcdef',
          last_activity_at: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
          last_portfolio_update_at: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString(),
        };

        // Should update because last update is >= 3 days (custom threshold)
        expect(shouldUpdateUser(user, options)).toBe(true);
      });
    });

    describe('boundary conditions', () => {
      it('should handle activity exactly at 7 day boundary (7.0 days)', () => {
        const user: VipUserWithActivity = {
          user_id: 'user1',
          wallet: '0x1234567890abcdef',
          last_activity_at: new Date(now.getTime() - SEVEN_DAYS_MS).toISOString(), // Exactly 7 days
          last_portfolio_update_at: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        };

        // At exactly 7 days, user is considered inactive (>= 7 days)
        expect(shouldUpdateUser(user)).toBe(false); // Updated 2 days ago, so skip
      });

      it('should handle update exactly at 7 day boundary', () => {
        const user: VipUserWithActivity = {
          user_id: 'user1',
          wallet: '0x1234567890abcdef',
          last_activity_at: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
          last_portfolio_update_at: new Date(now.getTime() - SEVEN_DAYS_MS).toISOString(), // Exactly 7 days
        };

        // At exactly 7 days since update, should update
        expect(shouldUpdateUser(user)).toBe(true);
      });
    });
  });

  describe('filterVipUsersByActivity', () => {
    it('should filter users and return correct lists', () => {
      const users: VipUserWithActivity[] = [
        // Never updated - should update
        {
          user_id: 'user1',
          wallet: '0x1111111111111111',
          last_activity_at: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          last_portfolio_update_at: null,
        },
        // Active user - should update
        {
          user_id: 'user2',
          wallet: '0x2222222222222222',
          last_activity_at: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
          last_portfolio_update_at: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        },
        // Inactive, last update < 7 days - should skip
        {
          user_id: 'user3',
          wallet: '0x3333333333333333',
          last_activity_at: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
          last_portfolio_update_at: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        },
        // Inactive, last update >= 7 days - should update
        {
          user_id: 'user4',
          wallet: '0x4444444444444444',
          last_activity_at: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString(),
          last_portfolio_update_at: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString(),
        },
        // Inactive (null activity) but should update (last update > 7 days)
        {
          user_id: 'user5',
          wallet: '0x5555555555555555',
          last_activity_at: null,
          last_portfolio_update_at: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ];

      const result = filterVipUsersByActivity(users);

      expect(result.usersToUpdate).toHaveLength(4);
      expect(result.usersSkipped).toHaveLength(1);
      expect(result.usersToUpdate.map((user) => user.user_id)).toEqual(['user1', 'user2', 'user4', 'user5']);
      expect(result.usersSkipped.map((user) => user.user_id)).toEqual(['user3']);
    });

    it('should calculate correct statistics', () => {
      const users: VipUserWithActivity[] = [
        // Never updated
        {
          user_id: 'user1',
          wallet: '0x1111111111111111',
          last_activity_at: null,
          last_portfolio_update_at: null,
        },
        // Active user
        {
          user_id: 'user2',
          wallet: '0x2222222222222222',
          last_activity_at: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
          last_portfolio_update_at: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        },
        // Inactive but should update
        {
          user_id: 'user3',
          wallet: '0x3333333333333333',
          last_activity_at: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString(),
          last_portfolio_update_at: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString(),
        },
        // Inactive, should skip
        {
          user_id: 'user4',
          wallet: '0x4444444444444444',
          last_activity_at: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
          last_portfolio_update_at: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        },
        // Inactive (null activity) but should update (last update > 7 days)
        {
          user_id: 'user5',
          wallet: '0x5555555555555555',
          last_activity_at: null,
          last_portfolio_update_at: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ];

      const result = filterVipUsersByActivity(users);

      expect(result.stats).toEqual({
        totalUsers: 5,
        neverUpdated: 1,
        activeUsers: 1,
        inactiveUpdated: 2,
        inactiveSkipped: 1,
      });
    });

    it('should calculate correct cost savings percentage', () => {
      const users: VipUserWithActivity[] = [
        // 6 users to update
        { user_id: 'user1', wallet: '0x1', last_activity_at: null, last_portfolio_update_at: null },
        { user_id: 'user2', wallet: '0x2', last_activity_at: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(), last_portfolio_update_at: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString() },
        { user_id: 'user3', wallet: '0x3', last_activity_at: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(), last_portfolio_update_at: null },
        { user_id: 'user4', wallet: '0x4', last_activity_at: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString(), last_portfolio_update_at: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString() },
        { user_id: 'user5', wallet: '0x5', last_activity_at: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(), last_portfolio_update_at: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString() },
        { user_id: 'user6', wallet: '0x6', last_activity_at: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString(), last_portfolio_update_at: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString() },
        // 4 users to skip
        { user_id: 'user7', wallet: '0x7', last_activity_at: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(), last_portfolio_update_at: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString() },
        { user_id: 'user8', wallet: '0x8', last_activity_at: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString(), last_portfolio_update_at: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString() },
        { user_id: 'user9', wallet: '0x9', last_activity_at: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString(), last_portfolio_update_at: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString() },
        { user_id: 'user10', wallet: '0x10', last_activity_at: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(), last_portfolio_update_at: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString() },
      ];

      const result = filterVipUsersByActivity(users);

      // 4 out of 10 users skipped = 40% cost savings
      expect(result.costSavingsPercent).toBe(40);
      expect(result.usersToUpdate).toHaveLength(6);
      expect(result.usersSkipped).toHaveLength(4);
    });

    it('should handle empty user list', () => {
      const result = filterVipUsersByActivity([]);

      expect(result.usersToUpdate).toEqual([]);
      expect(result.usersSkipped).toEqual([]);
      expect(result.costSavingsPercent).toBe(0);
      expect(result.stats).toEqual({
        totalUsers: 0,
        neverUpdated: 0,
        activeUsers: 0,
        inactiveUpdated: 0,
        inactiveSkipped: 0,
      });
    });

    it('should handle all users needing updates (0% savings)', () => {
      const users: VipUserWithActivity[] = [
        { user_id: 'user1', wallet: '0x1', last_activity_at: null, last_portfolio_update_at: null },
        { user_id: 'user2', wallet: '0x2', last_activity_at: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(), last_portfolio_update_at: null },
      ];

      const result = filterVipUsersByActivity(users);

      expect(result.costSavingsPercent).toBe(0);
      expect(result.usersToUpdate).toHaveLength(2);
      expect(result.usersSkipped).toHaveLength(0);
    });

    it('should handle all users skipped (100% savings)', () => {
      const users: VipUserWithActivity[] = [
        { user_id: 'user1', wallet: '0x1', last_activity_at: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(), last_portfolio_update_at: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString() },
        { user_id: 'user2', wallet: '0x2', last_activity_at: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString(), last_portfolio_update_at: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString() },
      ];

      const result = filterVipUsersByActivity(users);

      expect(result.costSavingsPercent).toBe(100);
      expect(result.usersToUpdate).toHaveLength(0);
      expect(result.usersSkipped).toHaveLength(2);
    });

    it('should work with custom thresholds', () => {
      const options: UserFilteringOptions = {
        inactivityThresholdMs: 3 * 24 * 60 * 60 * 1000, // 3 days
        updateThresholdMs: 3 * 24 * 60 * 60 * 1000, // 3 days
      };

      const users: VipUserWithActivity[] = [
        // Activity 4 days ago (inactive by 3-day threshold), updated 4 days ago
        {
          user_id: 'user1',
          wallet: '0x1',
          last_activity_at: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString(),
          last_portfolio_update_at: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString(),
        },
        // Activity 2 days ago (active by 3-day threshold)
        {
          user_id: 'user2',
          wallet: '0x2',
          last_activity_at: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          last_portfolio_update_at: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ];

      const result = filterVipUsersByActivity(users, options);

      expect(result.usersToUpdate).toHaveLength(2); // Both should update
      expect(result.stats.activeUsers).toBe(1); // user2
      expect(result.stats.inactiveUpdated).toBe(1); // user1
    });
  });
});
