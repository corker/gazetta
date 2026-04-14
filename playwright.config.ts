import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30000,
  // expect() default is 5s — too tight on CI where compare + walk runs
  // 8-12s per test. Individual expect() calls can still override lower.
  expect: { timeout: 15000 },
  retries: 0,
  use: {
    headless: true,
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: 'dev',
      testMatch: 'editor.test.ts',
      // baseURL is set per-worker by the testSite fixture in tests/e2e/fixtures.ts
    },
    {
      name: 'prod-admin',
      testMatch: 'production.test.ts',
      use: { baseURL: 'http://localhost:4002' },
    },
    {
      name: 'prod-static',
      testMatch: 'production-static.test.ts',
      use: { baseURL: 'http://localhost:4003' },
    },
    {
      name: 'prod-esi',
      testMatch: 'production-esi.test.ts',
      use: { baseURL: 'http://localhost:4004' },
    },
  ],
  webServer: [
    // The dev server for editor.test.ts is no longer global — the testSite
    // fixture spawns one per worker against a temp site copy. See tests/e2e/fixtures.ts.
    {
      command: 'cd examples/starter && node ../../packages/gazetta/dist/cli/index.js build sites/main && node ../../packages/gazetta/dist/cli/index.js admin sites/main -p 4002',
      url: 'http://localhost:4002/admin',
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
    {
      command: 'cd examples/starter && npx tsx ../../packages/gazetta/src/cli/index.ts publish staging sites/main && node ../../packages/gazetta/dist/cli/index.js serve staging sites/main -p 4003',
      url: 'http://localhost:4003/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
    {
      command: 'cd examples/starter && npx tsx ../../packages/gazetta/src/cli/index.ts publish esi-test sites/main && node ../../packages/gazetta/dist/cli/index.js serve esi-test sites/main -p 4004',
      url: 'http://localhost:4004/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
  ],
})
