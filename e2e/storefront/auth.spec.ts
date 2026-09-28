import { test, expect } from '@playwright/test';

/**
 * Customer login/register routes are disabled for dine-in table ordering.
 * These tests assert the routes are unavailable (404) rather than showing auth forms.
 */
test.describe('Storefront Authentication Pages (dine-in)', () => {
  test('login route is disabled', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('404')).toBeVisible();
  });

  test('register route is disabled', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByText('404')).toBeVisible();
  });

  test('account route is disabled', async ({ page }) => {
    await page.goto('/account');
    await expect(page.getByText('404')).toBeVisible();
  });

  test('header does not show Login or Sign Up', async ({ page }) => {
    await page.goto('/');
    const header = page.locator('header');
    await expect(header.getByRole('link', { name: 'Login' })).toHaveCount(0);
    await expect(header.getByRole('link', { name: 'Sign Up' })).toHaveCount(0);
  });
});
