import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig(({ mode }) => {
  /* proxy segue a mesma PORT do .env da raiz — assim não desalinha do backend */
  const raiz = fileURLToPath(new URL('../..', import.meta.url))
  const porta = loadEnv(mode, raiz, '').PORT ?? '3335'

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: { '/api': `http://localhost:${porta}` }
    },
    // atrás do Traefik: libera o domínio no `vite preview` (senão ele bloqueia o host)
    preview: {
      host: true,
      port: 5173,
      allowedHosts: true
    }
  }
})
