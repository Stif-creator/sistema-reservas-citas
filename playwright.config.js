import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/ui',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    screenshot: 'only-on-failure',
  },
  webServer: [{
    command: 'node functions/server.js',
    url: 'http://127.0.0.1:3001/health',
    reuseExistingServer: false,
    env: { GCLOUD_PROJECT: 'demo-citaspro', BOOKING_USE_EMULATORS: 'true',
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
      PORT: '3001', ALLOWED_ORIGINS: 'http://127.0.0.1:4173' },
  }, {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    env: {
      VITE_USE_FIREBASE_EMULATORS: 'true',
      VITE_BOOKING_ENABLED: 'true',
      VITE_BOOKING_PROVIDER: 'http',
      VITE_BOOKING_API_URL: 'http://127.0.0.1:3001',
      VITE_FIREBASE_API_KEY: 'demo-key',
      VITE_FIREBASE_PROJECT_ID: 'demo-citaspro',
      VITE_FIREBASE_AUTH_DOMAIN: 'demo-citaspro.firebaseapp.com',
    },
  }],
})
