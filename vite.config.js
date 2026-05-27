import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Cloudflare Pages 部署在站点根路径，应使用 VITE_BASE_PATH=/
// GitHub Pages 项目页部署在 /xingyin-pokemon-game/ 子路径
const normalizeBasePath = (value) => {
  const raw = typeof value === 'string' && value.trim().length > 0 ? value.trim() : '/xingyin-pokemon-game/'
  if (raw === './' || raw === '.') return './'
  const withLeading = raw.startsWith('/') ? raw : `/${raw}`
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`
}

const base = normalizeBasePath(process.env.VITE_BASE_PATH)

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      includeAssets: [
        'draco/gltf/draco_decoder.wasm',
        'draco/gltf/draco_wasm_wrapper.js'
      ],
      manifest: {
        name: '星音宝可梦',
        short_name: '星音宝可梦',
        description: '星音学院宝可梦养成游戏',
        theme_color: '#08111f',
        background_color: '#08111f',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          {
            src: `${base}assets/pokemon/official-artwork/25.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          }
        ]
      },
      workbox: {
        navigateFallback: `${base}index.html`,
        // 不要把全量立绘/3D 模型打进 install 预缓存：移动端首次打开会与 JS 抢带宽，表现为长期停在「加载中」
        globPatterns: [
          '**/*.{js,css,html,wasm,svg}',
          'assets/characters/**/*.{png,svg,webp}',
          'assets/items/official-artwork/*.{png,webp}',
          'assets/tiles/*.{png,webp}',
          'draco/**/*'
        ],
        globIgnores: [
          '**/assets/pokemon/official-artwork/**',
          '**/assets/3d/**',
          '**/assets/maps/**'
        ],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.endsWith('.glb'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'game-glb-models',
              expiration: {
                maxEntries: 220,
                maxAgeSeconds: 60 * 60 * 24 * 30
              }
            }
          },
          {
            urlPattern: ({ url }) => url.pathname.includes('/assets/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'game-static-assets',
              expiration: {
                maxEntries: 800,
                maxAgeSeconds: 60 * 60 * 24 * 30
              }
            }
          }
        ]
      }
    })
  ],
  optimizeDeps: {
    include: [
      'three',
      'three/examples/jsm/loaders/GLTFLoader.js',
      'three/examples/jsm/loaders/DRACOLoader.js',
      'three/examples/jsm/utils/SkeletonUtils.js'
    ]
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/three/')) {
            return 'vendor-three'
          }
          if (
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/react-router/') ||
            id.includes('/node_modules/react-router-dom/')
          ) {
            return 'vendor-react'
          }
          if (id.includes('/node_modules/@supabase/')) {
            return 'vendor-supabase'
          }
          if (id.includes('/src/utils/gameData') || id.endsWith('/utils/gameData.js')) {
            return 'game-data'
          }
          return undefined
        }
      }
    }
  },
  server: {
    port: 3000
  }
})
