import { MONSTERS } from '../src/utils/gameData.js'
const byDex = new Map(MONSTERS.map(m => [m.pokedexId, m]))
const usedIds = new Set(MONSTERS.map(m => m.id))

// 缺失的44只 (dex)，及其官方进化目标(dex)与进化等级
// [dex, name, type1, type2, evoTargetDex|null, evoLevel|null]
const NEW = [
  [10,'绿毛虫','BUG',null,11,7],
  [11,'铁甲蛹','BUG',null,12,10],
  [12,'巴大蝶','BUG','FLYING',null,null],
  [13,'独角虫','BUG','POISON',14,7],
  [14,'铁壳蛹','BUG','POISON',15,10],
  [15,'大针蜂','BUG','POISON',null,null],
  [16,'波波','NORMAL','FLYING',17,18],
  [17,'比比鸟','NORMAL','FLYING',18,36],
  [18,'大比鸟','NORMAL','FLYING',null,null],
  [19,'小拉达','NORMAL',null,20,20],
  [20,'拉达','NORMAL',null,null,null],
  [21,'烈雀','NORMAL','FLYING',22,20],
  [22,'大嘴雀','NORMAL','FLYING',null,null],
  [23,'阿柏蛇','POISON',null,24,22],
  [24,'阿柏怪','POISON',null,null,null],
  [27,'穿山鼠','GROUND',null,28,22],
  [28,'穿山王','GROUND',null,null,null],
  [29,'尼多兰','POISON',null,30,16],
  [30,'尼多娜','POISON',null,31,32],
  [31,'尼多后','POISON','GROUND',null,null],
  [35,'皮皮','FAIRY',null,36,28],
  [36,'皮可西','FAIRY',null,null,null],
  [41,'超音蝠','POISON','FLYING',42,22],
  [42,'大嘴蝠','POISON','FLYING',null,null],
  [43,'走路草','GRASS','POISON',44,21], // 44臭臭花已有(内部id87)
  [46,'派拉斯','BUG','GRASS',47,24],
  [47,'派拉斯特','BUG','GRASS',null,null],
  [48,'毛球','BUG','POISON',49,31],
  [49,'摩鲁蛾','BUG','POISON',null,null],
  [50,'地鼠','GROUND',null,51,26],
  [51,'三地鼠','GROUND',null,null,null],
  [60,'蚊香蝌蚪','WATER',null,61,25],
  [61,'蚊香君','WATER',null,62,38], // 62蚊香泳士已有(内部id33)
  [69,'喇叭芽','GRASS','POISON',70,21],
  [70,'口呆花','GRASS','POISON',71,33],
  [71,'大食花','GRASS','POISON',null,null],
  [72,'玛瑙水母','WATER','POISON',73,30],
  [73,'毒刺水母','WATER','POISON',null,null],
  [86,'小海狮','WATER',null,87,34], // 87白海狮已有(内部id40)
  [104,'卡拉卡拉','GROUND',null,105,28], // 105嘎啦嘎啦已有(内部id47)
  [114,'蔓藤怪','GRASS',null,null,null],
  [118,'角金鱼','WATER',null,119,33],
  [119,'金鱼王','WATER',null,null,null],
  [132,'百变怪','NORMAL',null,null,null],
]

// 分配内部id: 先复用缺口89,118,123, 再148+
const freeIds = [89,118,123]
let next = 148
const dexToInternal = new Map()
// 已有进化形态的内部id映射
const existingEvoInternal = { 44:87, 62:33, 87:40, 105:47 }

const assign = () => freeIds.length ? freeIds.shift() : next++
for (const row of NEW) dexToInternal.set(row[0], assign())

console.log('=== 内部ID分配表 ===')
console.log('dex | 名称 | 分配内部id | 进化→(dex/内部id/等级)')
for (const [dex,name,t1,t2,evoDex,evoLv] of NEW) {
  const iid = dexToInternal.get(dex)
  let evoStr = '—'
  if (evoDex) {
    const targetInternal = dexToInternal.get(evoDex) ?? existingEvoInternal[evoDex] ?? '?'
    evoStr = `dex${evoDex}/id${targetInternal}/Lv${evoLv}`
  }
  console.log(`${String(dex).padStart(3)} | ${name.padEnd(6)} | id:${String(iid).padStart(3)} | ${evoStr}`)
}
// 冲突检查
const allNewIds = [...dexToInternal.values()]
const dup = allNewIds.filter(id => usedIds.has(id))
console.log('\n与现有id冲突:', dup.length ? dup.join(',') : '无 ✓')
console.log('新id范围:', Math.min(...allNewIds), '~', Math.max(...allNewIds), '| 复用缺口89,118,123 + 148~'+next-1)
