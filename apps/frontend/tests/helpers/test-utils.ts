import { expect, Page, test } from "@playwright/test";

/**
 * Test utilities for robust navigation and element interaction
 */

export class NavigationHelper {
  constructor(private page: Page) {}

  /**
   * Navigate to a tab using viewport-appropriate selector
   * Handles both desktop and mobile navigation patterns
   */
  async navigateToTab(tabId: string) {
    const viewport = this.page.viewportSize();
    const isDesktop = viewport && viewport.width >= 1024;

    try {
      if (isDesktop) {
        // Try desktop navigation first
        const desktopTab = this.page.getByTestId(`desktop-tab-${tabId}`);
        await expect(desktopTab).toBeVisible({ timeout: 5000 });
        await desktopTab.click();
      } else {
        // Mobile navigation - try bottom nav first
        const mobileTab = this.page.getByTestId(`tab-${tabId}`);
        await expect(mobileTab).toBeVisible({ timeout: 5000 });
        await mobileTab.click();
      }
    } catch {
      // Fallback: try any available navigation for this tab
      const fallbackSelectors = [
        `desktop-tab-${tabId}`,
        `tab-${tabId}`,
        `mobile-menu-tab-${tabId}`,
      ];

      for (const selector of fallbackSelectors) {
        try {
          const element = this.page.getByTestId(selector);
          if (await element.isVisible()) {
            await element.click();
            return;
          }
        } catch {
          continue;
        }
      }
      throw new Error(`Could not find navigation element for tab: ${tabId}`);
    }
  }

  /**
   * Wait for page to be ready (navigation loaded)
   */
  async waitForNavigationReady() {
    // Wait for any navigation element to be visible
    await this.page.waitForFunction(() => {
      return (
        document.querySelector('[data-testid^="desktop-tab-"]') ||
        document.querySelector('[data-testid^="tab-"]')
      );
    });
  }

  /**
   * Check if a tab is currently active
   */
  async isTabActive(tabId: string): Promise<boolean> {
    const viewport = this.page.viewportSize();
    const isDesktop = viewport && viewport.width >= 1024;

    try {
      const selector = isDesktop ? `desktop-tab-${tabId}` : `tab-${tabId}`;
      const element = this.page.getByTestId(selector);

      if (!(await element.isVisible())) return false;

      // Check for active styling (gradient background)
      const hasActiveClass = await element.evaluate(el => {
        return (
          el.className.includes("bg-gradient-to-r") ||
          el.className.includes("text-purple-400")
        );
      });

      return hasActiveClass;
    } catch {
      return false;
    }
  }
}

export class PageHelper {
  constructor(private page: Page) {}

  /**
   * Setup page with optimal viewport and wait for load
   */
  async setupPage(width = 1200, height = 800) {
    await this.page.goto("/");
    await this.page.setViewportSize({ width, height });

    // Use a more forgiving wait strategy
    try {
      await this.page.waitForLoadState("domcontentloaded", { timeout: 10000 });
    } catch {
      // Continue if load state fails
    }

    // Wait for app to be ready with shorter timeout
    await this.page.waitForFunction(
      () => {
        return document.querySelector("main") !== null;
      },
      { timeout: 8000 }
    );
  }

  /**
   * Wait for any element to be visible with timeout
   */
  async waitForAnyElement(selectors: string[], timeout = 5000) {
    return this.page.waitForFunction(
      sels => {
        return sels.some(sel => {
          const element = document.querySelector(
            `[data-testid="${sel}"]`
          ) as HTMLElement;
          return element && element.offsetHeight > 0;
        });
      },
      selectors,
      { timeout }
    );
  }
}

/**
 * Extended test function with helpers
 */
export const testWithHelpers = test.extend<{
  navigationHelper: NavigationHelper;
  pageHelper: PageHelper;
}>({
  navigationHelper: async ({ page }, use) => {
    await use(new NavigationHelper(page));
  },
  pageHelper: async ({ page }, use) => {
    await use(new PageHelper(page));
  },
});
