import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { buildEarlyVersionGuardScript } from './scripts/early-version-guard-snippet.mjs'
import { resolveBuildId } from './scripts/resolve-build-id.mjs'

const appBuildId = resolveBuildId()

// 生产：https://pokemongame.site/（根路径）
const normalizeBasePath = (value) => {
  const raw = typeof value === 'string' && value.trim().length > 0 ? value.trim() : '/'
  if (raw === './' || raw === '.') return './'
  const withLeading = raw.startsWith('/') ? raw : `/${raw}`
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`
}

const base = normalizeBasePath(process.env.VITE_BASE_PATH)

export default defineConfig({
  base,
  define: {
    __APP_BUILD_ID__: JSON.stringify(appBuildId)
  },
  plugins: [
    react(),
    {
      name: 'inject-early-version-guard',
      transformIndexHtml() {
        return [
          {
            tag: 'script',
            injectTo: 'head-prepend',
            children: `(function(){var h=location.hostname||"";var p=location.pathname||"";if(h==="pokemongame.site"||h==="www.pokemongame.site"){if(p.indexOf("/xingyin-pokemon-game")===0){var r=p.slice("/xingyin-pokemon-game".length)||"/";if(r.charAt(0)!=="/")r="/"+r;location.replace(r+location.search+location.hash)}}})();`
          },
          {
            tag: 'script',
            injectTo: 'head-prepend',
            children: buildEarlyVersionGuardScript(base)
          }
        ]
      }
    },
    {
      name: 'emit-version-json',
      writeBundle(options) {
        const outDir = options.dir || 'dist'
        let entryHash = appBuildId
        try {
          const indexHtml = readFileSync(path.join(outDir, 'index.html'), 'utf8')
          const match = indexHtml.match(/assets\/index-([A-Za-z0-9_-]+)\.js/)
          if (match?.[1]) entryHash = match[1]
        } catch {
          // ignore
        }
        const payload = JSON.stringify({
          buildId: appBuildId,
          entryHash,
          builtAt: new Date().toISOString()
        }, null, 2)
        writeFileSync(path.join(outDir, 'version.json'), payload)
      }
    },
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
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
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        navigateFallback: `${base}index.html`,
        // 不要把全量立绘/3D 模型打进 install 预缓存：移动端首次打开会与 JS 抢带宽，表现为长期停在「加载中」
        // 不预缓存 index.html，避免旧 SW 长期返回过期入口并引用已删除的 JS hash
        globPatterns: [
          '**/*.{js,css,wasm,svg}',
          'assets/characters/**/*.{png,svg,webp}',
          'assets/items/official-artwork/*.{png,webp}',
          'assets/tiles/*.{png,webp}',
          'draco/**/*'
        ],
        globIgnores: [
          '**/index.html',
          '**/assets/pokemon/official-artwork/**',
          '**/assets/3d/**',
          '**/assets/maps/**'
        ],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: `game-pages-${appBuildId}`,
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 4,
                maxAgeSeconds: 60 * 60
              }
            }
          },
          {
            urlPattern: ({ url }) => url.pathname.endsWith('.glb'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'game-glb',
              expiration: {
                maxEntries: 220,
                maxAgeSeconds: 60 * 60 * 24 * 180
              }
            }
          },
          {
            urlPattern: ({ url }) => /\/assets\/audio\/.+\.(ogg|wav|mp3|webm)$/i.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'game-audio',
              expiration: {
                maxEntries: 160,
                maxAgeSeconds: 60 * 60 * 24 * 180
              }
            }
          },
          {
            urlPattern: ({ url }) => /\/assets\/pokemon\/official-artwork\/.+\.(webp|png)$/i.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'game-pokemon-art',
              expiration: {
                maxEntries: 520,
                maxAgeSeconds: 60 * 60 * 24 * 180
              }
            }
          },
          {
            urlPattern: ({ url }) => url.pathname.includes('/assets/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: `game-static-${appBuildId}`,
              networkTimeoutSeconds: 10,
              expiration: {
                maxEntries: 800,
                maxAgeSeconds: 60 * 60 * 24 * 14
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
      'three/examples/jsm/utils/SkeletonUtils.js',
      'three/examples/jsm/utils/BufferGeometryUtils.js'
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
          if (id.includes('/src/game/data/overworldMaps')) {
            return 'overworld-maps'
          }
          return undefined
        }
      }
    }
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    strictPort: false
  }
})
