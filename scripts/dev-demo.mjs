import { spawn } from 'node:child_process'

const server = spawn(process.execPath, ['functions/server.js'], {
  stdio: 'inherit', env: { ...process.env, GCLOUD_PROJECT: 'demo-citaspro', BOOKING_USE_EMULATORS: 'true',
    PORT: '3001', ALLOWED_ORIGINS: 'http://127.0.0.1:5173' },
})
const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], {
  stdio: 'inherit', env: { ...process.env, VITE_USE_FIREBASE_EMULATORS: 'true', VITE_BOOKING_ENABLED: 'true',
    VITE_BOOKING_PROVIDER: 'http', VITE_BOOKING_API_URL: 'http://127.0.0.1:3001',
    VITE_FIREBASE_API_KEY: 'demo-key', VITE_FIREBASE_PROJECT_ID: 'demo-citaspro', VITE_FIREBASE_AUTH_DOMAIN: 'demo-citaspro.firebaseapp.com' },
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { child.kill(signal); server.kill(signal) })
child.on('exit', code => { server.kill(); process.exitCode = code ?? 0 })
server.on('exit', code => { child.kill(); if (code) process.exitCode = code })
