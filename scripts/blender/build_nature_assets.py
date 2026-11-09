"""Build the unified, human-scale nature props used throughout the maps."""
import json
import math
import random
import subprocess
import sys
from pathlib import Path
import bpy
sys.path.insert(0, str(Path(__file__).resolve().parent))
from environment_modeling import setup, limb, orb, leaf, blossom, mesh, finish, PARTS

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/assets/3d/xingyin-environment-v2/nature'
SOURCE = ROOT / 'art/environment/unified-nature.blend'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE.parent.mkdir(parents=True, exist_ok=True)
random.seed(27)
setup()
ASSETS = []
OBJECTS = []


def export(name, label, tags):
    obj, triangles = finish(name, OUT / (name + '.glb'))
    ASSETS.append({'name': name, 'label': label, 'themeTags': tags, 'triangles': triangles,
                   'file': '/assets/3d/xingyin-environment-v2/nature/' + name + '.glb',
                   'grounded': True, 'material': 'vertex-colour satin palette'})
    OBJECTS.append(obj)


# Dense, ground-hugging foliage reads as a shrub even when repeated at a forest edge.
# The previous exposed trunk made hundreds of these look like miniature trees.
for x, y, z, sx, sy, sz, shade in [
    (-.36, .04, .38, .44, .38, .37, '527C54'),
    (.30, .12, .43, .48, .41, .40, '638F59'),
    (.02, -.34, .36, .42, .37, .34, '729D62'),
    (-.05, .03, .54, .47, .41, .36, '638F59'),
]:
    orb((x, y, z), (sx, sy, sz), shade, 2)
for angle in [i * math.tau / 7 for i in range(7)]:
    direction = (math.cos(angle), math.sin(angle))
    limb((direction[0] * .12, direction[1] * .12, .05),
         (direction[0] * .43, direction[1] * .43, .03),
         .08, .025, '70513E', 5)
export('bush_large', '统一阔叶灌木', ['nature', 'bush', 'edge'])


# Broad grounded rock with a deliberately irregular shoulder, never a floating orb.
vertices = []
jitters = [1.00, .88, 1.08, .94, 1.04, .90, 1.06, .97]
for ring in range(3):
    for i, jitter in enumerate(jitters):
        angle = i * math.tau / 8
        rx, ry, z = (.82, .61, .04) if ring == 0 else (.70, .52, .43 + (i % 2) * .05) if ring == 1 else (.30, .24, .72 + (i % 3) * .045)
        vertices.append((math.cos(angle) * rx * jitter, math.sin(angle) * ry * jitter, z))
vertices.append((0, 0, .76))
faces = []
for ring in range(2):
    for i in range(8):
        j = (i + 1) % 8
        faces.append((ring * 8 + i, ring * 8 + j, (ring + 1) * 8 + j, (ring + 1) * 8 + i))
for i in range(8):
    faces.append((16 + i, 16 + (i + 1) % 8, 24))
mesh('irregular grounded sandstone', vertices, faces, '968E80')
export('rock_large', '统一低多边形巨石', ['nature', 'rock', 'boundary'])


def flowers(name, label, shade, tag):
    for x, y, z in [(-.40, .02, .48), (0, .05, .70), (.39, .02, .52), (-.16, -.24, .42), (.20, -.18, .46)]:
        limb((x * .85, y * .85, 0), (x, y, z), .024, .014, '4B784B', 5)
        leaf((x * .76, y * .76, z * .42), (x + .16, y + .04, z * .50), .055, '6E9D5D')
        blossom((x, y, z), .15, shade)
    export(name, label, ['nature', 'flower', tag])


flowers('flower_yellow_cluster', '统一黄花簇', 'E2B65F', 'yellow')
flowers('flower_red_cluster', '统一红花簇', 'C96867', 'red')

# Preserve the authoring collection with one readable asset per row.
for i, obj in enumerate(OBJECTS):
    obj.location.x = (i % 2) * 3.4
    obj.location.y = (i // 2) * 3.4
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
(OUT / 'authoring-metadata.json').write_text(json.dumps(ASSETS, indent=2, ensure_ascii=False) + '\n')
subprocess.run([
    'node', '--input-type=module', '-e', r'''
import fs from 'node:fs/promises';
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, weld, prune, draco } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.encoder': await draco3d.createEncoderModule(),
  'draco3d.decoder': await draco3d.createDecoderModule()
});
const folder = 'public/assets/3d/xingyin-environment-v2/nature';
const metadata = JSON.parse(await fs.readFile(`${folder}/authoring-metadata.json`, 'utf8'));
const records = [];
for (const item of metadata) {
  const file = `${folder}/${item.name}.glb`;
  const doc = await io.read(file);
  await doc.transform(dedup(), weld(), prune(), draco({ quantizePosition: 14, quantizeNormal: 12, quantizeColor: 8 }));
  await io.write(file, doc);
  const root = (await io.read(file)).getRoot();
  const bounds = getBounds(root.listScenes()[0]);
  const primitive = root.listMeshes()[0]?.listPrimitives()[0];
  if (root.listMeshes().length !== 1 || root.listMaterials().length !== 1 || root.listTextures().length || root.listAnimations().length || !primitive?.getAttribute('COLOR_0') || Math.abs(bounds.min[1]) > .002) throw new Error(`Invalid nature model: ${item.name}`);
  records.push({ ...item, source: 'Blender 5.2 original nature assets', bounds, heightMetres: bounds.max[1] - bounds.min[1], triangles: primitive.getIndices().getCount() / 3, bytes: (await fs.stat(file)).size });
}
await fs.writeFile(`${folder}/manifest.json`, JSON.stringify(records, null, 2) + '\n');
console.log(`Validated ${records.length} Blender nature exports.`);
'''
], cwd=ROOT, check=True)
print('NATURE_BLENDER_EXPORT_COMPLETE', len(ASSETS))
