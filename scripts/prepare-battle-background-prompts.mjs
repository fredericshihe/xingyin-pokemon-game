import fs from 'node:fs/promises'
import { BATTLE_BACKGROUNDS } from '../src/game/data/battleBackgroundCatalog.js'

const shared = `Use case: stylized-concept
Asset type: production background plate for a turn-based creature-battle browser game.
Primary request: an exquisite Japanese anime game environment, painterly three-dimensional depth, refined natural materials, clean shapes and coherent believable geography, visually compatible with friendly colorful cartoon creatures.
Composition/framing: landscape 3:2 composition. A gently elevated view across the fighting ground; horizon near the upper 28 percent. Broad unobstructed fighting ground covers the lower two thirds. Reserve empty ground at 25% horizontal / 72% vertical and 75% horizontal / 40% vertical for characters composited later. Keep quiet space in the upper-left and lower-right for the game's HUD. The central 55 percent must also work when cropped to a portrait tablet screen. Put the recognizable geographic landmark in the upper central distance; place small props only at the far perimeter. Natural continuous terrain, no floating discs or painted battle circles.
Lighting/mood: soft directional light, clear midtones, restrained atmospheric depth, no blown-out highlights. Readable silhouettes without harsh noisy texture.
Constraints: environment only, no characters, no creatures, no people, no text, no letters, no signs with writing, no logos, no UI, no watermark, no symbols, no icons, no pixel art, no blocky low-poly surfaces, no extreme fisheye perspective, no foreground objects obstructing the two combatant positions.`

const jobs = Object.values(BATTLE_BACKGROUNDS).map(scene => ({
  model: 'gpt-image-2', size: '1536x1024', quality: 'high', output_format: 'png', n: 1,
  out: `${scene.id}.png`, prompt: `${shared}\nScene/backdrop: ${scene.scene}`,
}))
await fs.mkdir('art/battle-backgrounds', { recursive: true })
await fs.writeFile('art/battle-backgrounds/prompts.jsonl', jobs.map(job => JSON.stringify(job)).join('\n') + '\n')
console.log(`Prepared ${jobs.length} distinct image-generation prompts; no images generated.`)
