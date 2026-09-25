import { defineConfig, devices } from '@playwright/test';

const PORT = 4178;
const baseURL = `http://127.0.0.1:${PORT}/`;

/**
 * e2e runs against a production build of the deterministic fixture data
 * (tests/fixtures/races), served by `vite preview`.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 45_000,
  use: {
    baseURL,
    trace: 'retain-on-failure',
    launchOptions: {
      // WebGL for maplibre in headless Chromium.
      args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /screenshots\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'screenshots',
      testMatch: /screenshots\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npm run build:fixtures && npx vite preview --outDir dist-fixtures --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { VITE_REPO_URL: 'https://github.com/OWNER/tri-map' },
  },
});
