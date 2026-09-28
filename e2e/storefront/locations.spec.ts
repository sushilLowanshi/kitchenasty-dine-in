import { test, expect } from '@playwright/test';

test.describe('Storefront Locations Page', () => {
  test('displays locations page heading', async ({ page }) => {
    await page.goto('/locations');
    await expect(page.getByRole('heading', { name: 'Our Locations' })).toBeVisible();
  });

  test('displays locations description', async ({ page }) => {
    await page.goto('/locations');
    await expect(page.getByText('Find a KitchenAsty near you')).toBeVisible();
  });

  test('locations page is reachable by URL (header link removed for dine-in)', async ({ page }) => {
    await page.goto('/locations');
    await expect(page).toHaveURL(/\/locations/);
    await expect(page.getByRole('heading', { name: 'Our Locations' })).toBeVisible();
    // Header no longer includes Locations nav
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Locations' })).toHaveCount(0);
  });
});
