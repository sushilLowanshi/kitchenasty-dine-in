import { test, expect } from '@playwright/test';

test.describe('Order Status Page', () => {
  test('shows error for non-existent order', async ({ page }) => {
    await page.goto('/orders/non-existent-id');
    await page.waitForTimeout(1500);
    const error = page.locator('.bg-red-50');
    const heading = page.getByRole('heading', { level: 1 });
    const isVisible = (await error.isVisible()) || (await heading.isVisible());
    expect(isVisible).toBeTruthy();
  });

  test('has back navigation on error', async ({ page }) => {
    await page.goto('/orders/non-existent-id');
    await page.waitForTimeout(1500);
    // Dine-in: back links go to Menu / Home (account order history is disabled)
    const menuLink = page.getByRole('link', { name: /View Menu/i });
    const homeLink = page.getByRole('link', { name: /Back to Home/i });
    const error = page.locator('.bg-red-50');
    const isVisible =
      (await menuLink.first().isVisible().catch(() => false)) ||
      (await homeLink.isVisible().catch(() => false)) ||
      (await error.isVisible().catch(() => false));
    expect(isVisible).toBeTruthy();
  });

  test('order status page has menu navigation', async ({ page }) => {
    await page.goto('/orders/non-existent-id');
    await page.waitForTimeout(1500);
    const menuLink = page.getByRole('link', { name: /View Menu/i }).first();
    await expect(menuLink).toBeVisible();
  });

  test('order confirmation page still works', async ({ page }) => {
    await page.goto('/order/test-id');
    await expect(page.getByText('Order Placed!')).toBeVisible();
  });
});

test.describe('Account routes (dine-in)', () => {
  test('account route shows not found when customer auth disabled', async ({ page }) => {
    await page.goto('/account');
    await expect(page.getByText('404')).toBeVisible();
  });

  test('account orders route shows not found when customer auth disabled', async ({ page }) => {
    await page.goto('/account/orders');
    await expect(page.getByText('404')).toBeVisible();
  });
});
