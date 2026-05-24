#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

export const ROOT_DIR = path.resolve(fileURLToPath(new URL('..', import.meta.url)))

export async function withViteAuditServer(run) {
  const server = await createServer({
    root: ROOT_DIR,
    configFile: false,
    publicDir: false,
    appType: 'custom',
    logLevel: 'error',
    server: {
      middlewareMode: true,
      hmr: false,
      ws: false,
    },
  })

  try {
    return await run({
      rootDir: ROOT_DIR,
      loadModule: (moduleId) => server.ssrLoadModule(moduleId),
    })
  } finally {
    await server.close()
  }
}
