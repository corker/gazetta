import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30000,
  retries: 0,
  use: {
    headless: true,
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: 'dev',
      testMatch: 'editor.test.ts',
      use: { baseURL: 'http://localhost:3000' },
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
    {
      command: 'npm run dev',
      url: 'http://localhost:3000/admin',
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
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
