import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const sourceDir = path.join(root, 'node_modules/three/examples/jsm/libs/draco/gltf')
const targetDir = path.join(root, 'public/draco/gltf')

await fs.mkdir(targetDir, { recursive: true })
const files = await fs.readdir(sourceDir)

for (const fileName of files) {
  await fs.copyFile(
    path.join(sourceDir, fileName),
    path.join(targetDir, fileName)
  )
}

console.log(JSON.stringify({ copied: files.length, targetDir: 'public/draco/gltf' }, null, 2))
