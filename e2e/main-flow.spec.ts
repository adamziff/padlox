import { test, expect } from '@playwright/test';

test.describe('Main User Flow', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('landing page shows correct content', async ({ page }) => {
        await expect(page.getByText('Padlox')).toBeVisible();
        await expect(page.getByText("Your Insurance Company Doesn't Trust You")).toBeVisible();
        await expect(page.getByText('We can help with that')).toBeVisible();
    });

    test('can navigate to login page', async ({ page }) => {
        await page.getByText('Sign Up Now').click();
        await expect(page).toHaveURL('/login');
    });

    test('complete user journey', async ({ page }) => {
        // Login flow
        await page.goto('/login');
        await page.getByLabel('Email').fill('test@example.com');
        await page.getByRole('button', { name: 'Continue with Email' }).click();

        // Mock email verification (in real tests, you'd need to handle this differently)
        await page.goto('/dashboard');

        // Verify dashboard elements
        await expect(page.getByRole('heading', { name: 'Your Assets' })).toBeVisible();

        // Open asset modal
        await page.getByRole('button', { name: 'Add Asset' }).click();
        await expect(page.getByRole('dialog')).toBeVisible();

        // Mock file upload (since we can't access real camera in tests)
        await page.setInputFiles('input[type="file"]', {
            name: 'test-image.jpg',
            mimeType: 'image/jpeg',
            buffer: Buffer.from('fake-image-content'),
        });

        // Fill in asset details
        await page.getByLabel('Description').fill('Test asset description');
        await page.getByRole('button', { name: 'Save' }).click();

        // Verify asset appears in list
        await expect(page.getByText('Test asset description')).toBeVisible();
    });

    test('theme switching works', async ({ page }) => {
        // Check initial theme
        await expect(page.locator('html')).toHaveAttribute('class', /light/);

        // Switch theme
        await page.getByRole('button', { name: 'Toggle theme' }).click();

        // Verify theme changed
        await expect(page.locator('html')).toHaveAttribute('class', /dark/);
    });

    test('user menu functionality', async ({ page }) => {
        // Login first
        await page.goto('/login');
        await page.getByLabel('Email').fill('test@example.com');
        await page.getByRole('button', { name: 'Continue with Email' }).click();
        await page.goto('/dashboard');

        // Open user menu
        await page.getByRole('button', { name: 'User menu' }).click();

        // Check menu items
        await expect(page.getByRole('menuitem', { name: 'Profile' })).toBeVisible();
        await expect(page.getByRole('menuitem', { name: 'Settings' })).toBeVisible();
        await expect(page.getByRole('menuitem', { name: 'Sign out' })).toBeVisible();

        // Test sign out
        await page.getByRole('menuitem', { name: 'Sign out' }).click();
        await expect(page).toHaveURL('/');
    });
}); 