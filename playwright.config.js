import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/ui',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    env: {
      VITE_USE_FIREBASE_EMULATORS: 'true',
      VITE_FIREBASE_API_KEY: 'demo-key',
      VITE_FIREBASE_PROJECT_ID: 'demo-citaspro',
      VITE_FIREBASE_AUTH_DOMAIN: 'demo-citaspro.firebaseapp.com',
    },
  },
})
