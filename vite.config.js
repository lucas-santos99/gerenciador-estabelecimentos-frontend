import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Identificação automática do build (data + commit), mostrada na barra do sistema.
const commit = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7)
const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10).split('-').reverse().join('/')
const BUILD_ID = commit ? `${hoje} · ${commit}` : hoje

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
})
