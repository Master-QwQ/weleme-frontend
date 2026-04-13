import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import fs from 'fs'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(), 
    tailwindcss(),
    {
      name: 'multi-public-dir',
      configureServer(server) {
        // 在开发环境服务 /asset 路径
        server.middlewares.use((req, res, next) => {
          if (req.url?.startsWith('/asset/')) {
            const relPath = req.url.replace('/asset/', '')
            const filePath = path.resolve(__dirname, 'asset', relPath.split('?')[0])
            if (fs.existsSync(filePath) && fs.lstatSync(filePath).isFile()) {
              res.setHeader('Content-Type', getMimeType(filePath))
              res.end(fs.readFileSync(filePath))
              return
            }
          }
          next()
        })
      },
      closeBundle() {
        // 在构建结束时，将 asset 目录复制到 dist/asset
        const srcDir = path.resolve(__dirname, 'asset')
        const distDir = path.resolve(__dirname, 'dist/asset')
        if (fs.existsSync(srcDir)) {
          if (!fs.existsSync(distDir)) {
            fs.mkdirSync(distDir, { recursive: true })
          }
          fs.cpSync(srcDir, distDir, { recursive: true })
          console.log('\x1b[32m%s\x1b[0m', '✓ assets from "asset" folder copied to dist/asset')
        }
      }
    }
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/ws/chat': {
        target: 'ws://127.0.0.1:8000',
        ws: true,
      }
    }
  }
})

function getMimeType(filePath: string) {
  const ext = path.extname(filePath).toLowerCase()
  const map: Record<string, string> = {
    '.json': 'application/json',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
  }
  return map[ext] || 'application/octet-stream'
}

