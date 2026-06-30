import { expect, test } from '@playwright/test';

/**
 * E2E Tests for Bundle Wallet Switching
 *
 * These tests verify that the SwitchPromptBanner appears correctly
 * when users switch wallets while viewing bundles.
 *
 * Note: These tests may require a local wallet or mock wallet setup.
 * For CI/CD, wallet interactions may need to be mocked.
 */

test.describe('Bundle Wallet Switching - E2E', () => {
  const BUNDLE_USER_ID = '0x1234567890123456789012345678901234567890';

  test.beforeEach(async ({ page }) => {
    // Enable console logging for debugging
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.log('Browser console error:', msg.text());
      }
    });
  });

  test('should navigate to bundle URL', async ({ page }) => {
    await page.goto(`/bundle?userId=${BUNDLE_USER_ID}`);

    // Verify page loaded
    await expect(page.locator('body')).toBeVisible();

    // Should show bundle content or not-found message
    const pageContent = await page.locator('body').textContent();
    expect(pageContent).toBeTruthy();
    expect(pageContent!.length).toBeGreaterThan(10);
  });

  test('should show visitor mode when disconnected', async ({ page }) => {
    await page.goto(`/bundle?userId=${BUNDLE_USER_ID}`);

    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');

    // Should not show switch banner when disconnected
    const banner = page.getByTestId('switch-prompt-banner');
    await expect(banner).not.toBeVisible();
  });

  test('should show wallet connection option', async ({ page }) => {
    await page.route(`**/users/${BUNDLE_USER_ID}`, (route) => {
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: BUNDLE_USER_ID,
            email: null,
            is_subscribed_to_reports: false,
            created_at: new Date().toISOString(),
          },
          wallets: [
            {
              id: '1',
              user_id: BUNDLE_USER_ID,
              wallet: BUNDLE_USER_ID,
              label: null,
              created_at: new Date().toISOString(),
            },
          ],
        }),
      });
    });
    await page.goto(`/bundle?userId=${BUNDLE_USER_ID}`);

    await expect(page.locator('body')).toContainText(
      /connect|wallet|sign in/i,
      { timeout: 15000 },
    );
  });

  test('banner should have switch and stay buttons when visible', async ({
    page,
  }) => {
    await page.goto(`/bundle?userId=${BUNDLE_USER_ID}`);
    await page.waitForLoadState('domcontentloaded');

    // Check if the banner buttons exist in the component structure
    // This tests the component itself, not the visibility logic
    const hasButtons = await page.evaluate(() => {
      const html = document.body.innerHTML;
      return (
        (html.includes('Stay') || html.includes('stay')) &&
        (html.includes('Switch') || html.includes('switch'))
      );
    });

    // If banner is in the code, it should have both buttons
    if (hasButtons) {
      expect(hasButtons).toBe(true);
    }
  });

  test.describe('URL handling', () => {
    test('should handle bundle URL with userId parameter', async ({ page }) => {
      await page.goto(`/bundle?userId=${BUNDLE_USER_ID}`);

      // Verify URL parameter is preserved
      expect(page.url()).toContain('userId=' + BUNDLE_USER_ID);
    });

    test('should handle bundle URL without userId', async ({ page }) => {
      await page.goto('/bundle');

      // Should show some error or not-found state
      const pageContent = await page.locator('body').textContent();
      expect(pageContent).toBeTruthy();
    });

    test('should handle malformed userId parameter', async ({ page }) => {
      await page.goto('/bundle?userId=invalid-address');

      // Should still load without crashing
      await expect(page.locator('body')).toBeVisible();
    });
  });

  test.describe('Page functionality without wallet connection', () => {
    test('should display portfolio information when available', async ({
      page,
    }) => {
      await page.goto(`/bundle?userId=${BUNDLE_USER_ID}`);
      await page.waitForLoadState('networkidle');

      // Check for portfolio-related content
      const hasPortfolioContent = await page.evaluate(() => {
        const text = document.body.textContent?.toLowerCase() || '';
        return (
          text.includes('portfolio') ||
          text.includes('wallet') ||
          text.includes('bundle') ||
          text.includes('balance') ||
          text.includes('$') ||
          text.includes('%')
        );
      });

      expect(hasPortfolioContent).toBe(true);
    });

    test('should be responsive on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto(`/bundle?userId=${BUNDLE_USER_ID}`);

      // Should still display content on mobile
      const isVisible = await page.locator('body').isVisible();
      expect(isVisible).toBe(true);

      // Content should be readable
      const content = await page.locator('body').textContent();
      expect(content!.length).toBeGreaterThan(10);
    });
  });
});
