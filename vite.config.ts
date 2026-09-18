import { cpSync, mkdirSync, readdirSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

function copyTesseractAssets(): Plugin {
  const copy = () => {
    const coreDir = fileURLToPath(new URL('./node_modules/tesseract.js-core', import.meta.url))
    const destDir = fileURLToPath(new URL('./public/tesseract-core', import.meta.url))
    mkdirSync(destDir, { recursive: true })
    for (const name of readdirSync(coreDir)) {
      if (!/-lstm\.(wasm|wasm\.js)$/.test(name)) continue
      cpSync(`${coreDir}/${name}`, `${destDir}/${name}`)
    }
    cpSync(
      fileURLToPath(new URL('./node_modules/tesseract.js/dist/worker.min.js', import.meta.url)),
      fileURLToPath(new URL('./public/tesseract-worker.min.js', import.meta.url)),
    )
  }
  return {
    name: 'copy-tesseract-assets',
    buildStart: copy,
    configureServer: copy,
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), copyTesseractAssets()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
  worker: {
    format: 'es',
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
})
