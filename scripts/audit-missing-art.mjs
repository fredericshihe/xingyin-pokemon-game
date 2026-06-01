import { MONSTERS } from '../src/utils/gameData.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const ART = path.join(root, 'public/assets/pokemon/official-artwork')

const byDex = new Map(MONSTERS.map(m => [m.pokedexId, m]))
const missing = []
for (let d=1; d<=151; d++) if(!byDex.has(d)) missing.push(d)

const NAME = {10:'绿毛虫',11:'铁甲蛹',12:'巴大蝶',13:'独角虫',14:'铁壳蛹',15:'大针蜂',16:'波波',17:'比比鸟',18:'大比鸟',19:'小拉达',20:'拉达',21:'烈雀',22:'大嘴雀',23:'阿柏蛇',24:'阿柏怪',27:'穿山鼠',28:'穿山王',29:'尼多兰',30:'尼多娜',31:'尼多后',35:'皮皮',36:'皮可西',41:'超音蝠',42:'大嘴蝠',43:'走路草',46:'派拉斯',47:'派拉斯特',48:'毛球',49:'摩鲁蛾',50:'地鼠',51:'三地鼠',60:'蚊香蝌蚪',61:'蚊香君',69:'喇叭芽',70:'口呆花',71:'大食花',72:'玛瑙水母',73:'毒刺水母',86:'小海狮',104:'卡拉卡拉',114:'蔓藤怪',118:'角金鱼',119:'金鱼王',132:'百变怪'}

let haveArt = [], needArt = []
for (const d of missing) {
  const hasWebp = fs.existsSync(path.join(ART, `${d}.webp`))
  const hasPng = fs.existsSync(path.join(ART, `${d}.png`))
  if (hasWebp || hasPng) haveArt.push(d); else needArt.push(d)
}
console.log('缺失初代总数:', missing.length)
console.log('其中图片已存在:', haveArt.length, '→', haveArt.map(d=>`${d}${NAME[d]}`).join(' '))
console.log('其中图片需下载:', needArt.length)
needArt.forEach(d => console.log(`  dex ${String(d).padStart(3)} ${NAME[d]}`))
