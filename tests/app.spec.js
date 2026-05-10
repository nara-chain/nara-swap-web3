import { expect, test } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'

const distDir = path.resolve(process.cwd(), 'dist')

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'],
])

test.beforeEach(async ({ page }) => {
  await page.route('**/*', async route => {
    const requestUrl = new URL(route.request().url())
    if (requestUrl.hostname !== 'nara.local') return route.fallback()

    let pathname = decodeURIComponent(requestUrl.pathname)
    if (pathname === '/') pathname = '/index.html'
    const filePath = path.normalize(path.join(distDir, pathname))

    if (!filePath.startsWith(distDir)) return route.abort()

    try {
      const body = await fs.readFile(filePath)
      const contentType = contentTypes.get(path.extname(filePath)) || 'application/octet-stream'
      return route.fulfill({ status: 200, body, contentType })
    } catch {
      if (!path.extname(filePath)) {
        const body = await fs.readFile(path.join(distDir, 'index.html'))
        return route.fulfill({ status: 200, body, contentType: 'text/html; charset=utf-8' })
      }
      return route.fulfill({ status: 404, body: 'Not found' })
    }
  })
})

test.describe('Nara Swap dapp', () => {
  test('renders the swap workstation', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'Swap and bridge' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Swap' })).toHaveClass(/active/)
    await expect(page.getByText('Nara Mainnet')).toBeVisible()
    await expect(page.locator('appkit-button')).toBeVisible()
    await expect(page.getByText('Nara NARA')).toBeVisible()
    await expect(page.getByText('Solana SOL')).toBeVisible()
  })

  test('switches to bridge mode and preserves expected controls', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Bridge' }).click()

    await expect(page.getByRole('button', { name: 'Bridge' })).toHaveClass(/active/)
    await expect(page.getByRole('button', { name: 'Nara' })).toHaveClass(/active/)
    await expect(page.getByRole('button', { name: 'USDC' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'USDT' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'SOL' })).toBeVisible()
    await expect(page.getByText('Source balance')).toBeVisible()
  })

  test('mobile layout keeps primary controls visible', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'Swap and bridge' })).toBeVisible()
    await expect(page.getByPlaceholder('0.0').first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Connect wallet|Swap on Nara/ })).toBeVisible()
  })
})
