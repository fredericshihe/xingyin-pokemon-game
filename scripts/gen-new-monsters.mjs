// 生成44只新增初代宝可梦的定义代码块（官方Gen1种族值 + 合适技能）
// 字段: [dex, name, t1, t2, hp, atk, def, spa, spd_stat, spe, evoTargetInternalId|null, evoLv|null, movesArr, learnsetObj]
// 注: maxMp = floor(spAtk*0.8)+20 (与游戏现有规则一致), 这里直接给 maxMp
const T = (s)=>`TYPES.${s}`
// 种族值来自官方; maxMp 用 floor(spAtk*0.8)+20
const rows = [
  // 内部id, dex, name, t1,t2, hp,atk,def,spa,spd,spe, evoTargetId, evoLv, moves[], learnset{}
  [89,10,'绿毛虫','BUG',null, 45,30,35,20,20,45, 118,7, ['tackle'], {}],
  [118,11,'铁甲蛹','BUG',null, 50,20,55,25,25,30, 123,10, ['flail'], {}],
  [123,12,'巴大蝶','BUG','FLYING', 60,45,50,90,80,70, null,null, ['peck','razorleaf','psychic','hurricane'], {}],
  [148,13,'独角虫','BUG','POISON', 40,35,30,20,20,50, 149,7, ['poison_sting','tackle'], {}],
  [149,14,'铁壳蛹','BUG','POISON', 45,25,50,25,25,35, 150,10, ['flail'], {}],
  [150,15,'大针蜂','BUG','POISON', 65,90,40,45,80,75, null,null, ['fury_attack','poison_jab','double_kick','rock_slide'], {}],
  [151,16,'波波','NORMAL','FLYING', 40,45,40,35,35,56, 152,18, ['tackle','peck','quickattack'], {}],
  [152,17,'比比鸟','NORMAL','FLYING', 63,60,55,50,50,71, 153,36, ['peck','wing_attack','quickattack','fly'], {}],
  [153,18,'大比鸟','NORMAL','FLYING', 83,80,75,70,70,101, null,null, ['wing_attack','fly','drill_peck','hurricane'], {}],
  [154,19,'小拉达','NORMAL',null, 30,56,35,25,35,72, 155,20, ['tackle','quickattack','bite'], {}],
  [155,20,'拉达','NORMAL',null, 55,81,60,50,70,97, null,null, ['quickattack','bite','bodyslam','slash'], {}],
  [156,21,'烈雀','NORMAL','FLYING', 40,60,30,31,31,70, 157,20, ['peck','quickattack','fury_attack'], {}],
  [157,22,'大嘴雀','NORMAL','FLYING', 65,90,65,61,61,100, null,null, ['drill_peck','wing_attack','fly','sky_attack'], {}],
  [158,23,'阿柏蛇','POISON',null, 35,60,44,40,54,55, 159,22, ['poison_sting','bite','rollout'], {}],
  [159,24,'阿柏怪','POISON',null, 60,95,69,65,79,80, null,null, ['poison_jab','bite','slash','rock_slide'], {}],
  [160,27,'穿山鼠','GROUND',null, 50,75,85,20,30,40, 161,22, ['scratch','rollout','rock_throw'], {}],
  [161,28,'穿山王','GROUND',null, 75,100,110,45,55,65, null,null, ['slash','earthquake','rock_slide','rollout'], {}],
  [162,29,'尼多兰','POISON',null, 55,47,52,40,40,41, 163,16, ['scratch','poison_sting','double_kick'], {}],
  [163,30,'尼多娜','POISON',null, 70,62,67,55,55,56, 164,32, ['poison_sting','double_kick','bite','bodyslam'], {}],
  [164,31,'尼多后','POISON','GROUND', 90,92,87,75,85,76, null,null, ['poison_jab','earthquake','bodyslam','double_kick'], {}],
  [165,35,'皮皮','FAIRY',null, 70,45,48,60,65,35, 166,28, ['pound','moonblast','bodyslam'], {}],
  [166,36,'皮可西','FAIRY',null, 95,70,73,95,90,60, null,null, ['moonblast','bodyslam','psychic','recover'], {}],
  [167,41,'超音蝠','POISON','FLYING', 40,45,35,30,40,55, 168,22, ['bite','wing_attack','quickattack'], {}],
  [168,42,'大嘴蝠','POISON','FLYING', 75,80,70,65,75,90, null,null, ['wing_attack','poison_jab','bite','fly'], {}],
  [169,43,'走路草','GRASS','POISON', 45,50,55,75,65,30, 87,21, ['vinewhip','poison_sting','razorleaf'], {}],
  [170,46,'派拉斯','BUG','GRASS', 35,70,55,45,55,25, 171,24, ['scratch','fury_cutter','poison_sting'], {}],
  [171,47,'派拉斯特','BUG','GRASS', 60,95,80,60,80,30, null,null, ['slash','fury_cutter','poison_jab','razorleaf'], {}],
  [172,48,'毛球','BUG','POISON', 60,55,50,40,55,45, 173,31, ['tackle','poison_sting','fury_cutter'], {}],
  [173,49,'摩鲁蛾','BUG','POISON', 70,45,50,90,75,66, null,null, ['psychic','poison_jab','razorleaf','hurricane'], {}],
  [174,50,'地鼠','GROUND',null, 10,55,25,35,45,95, 175,26, ['scratch','rock_throw','quickattack'], {}],
  [175,51,'三地鼠','GROUND',null, 35,100,50,50,70,120, null,null, ['earthquake','slash','rock_slide','quickattack'], {}],
  [176,60,'蚊香蝌蚪','WATER',null, 40,50,40,40,40,90, 177,25, ['watergun','tackle','flail'], {}],
  [177,61,'蚊香君','WATER',null, 65,65,65,50,50,90, 33,38, ['watergun','bodyslam','surf'], {}],
  [178,69,'喇叭芽','GRASS','POISON', 50,75,35,70,30,40, 179,21, ['vinewhip','poison_sting','razorleaf'], {}],
  [179,70,'口呆花','GRASS','POISON', 65,90,50,85,45,55, 180,33, ['razorleaf','poison_jab','vinewhip'], {}],
  [180,71,'大食花','GRASS','POISON', 80,105,65,100,70,70, null,null, ['razorleaf','poison_jab','hydropump','vinewhip'], {}],
  [181,72,'玛瑙水母','WATER','POISON', 40,40,35,50,100,70, 182,30, ['watergun','poison_sting','flail'], {}],
  [182,73,'毒刺水母','WATER','POISON', 80,70,65,80,120,100, null,null, ['surf','poison_jab','icebeam','hydropump'], {}],
  [183,86,'小海狮','WATER',null, 65,45,55,45,70,45, 40,34, ['watergun','quickattack','icebeam'], {}],
  [184,104,'卡拉卡拉','GROUND',null, 50,50,95,40,50,35, 47,28, ['rock_throw','bite','rollout'], {}],
  [185,114,'蔓藤怪','GRASS',null, 65,55,115,100,40,60, null,null, ['vinewhip','razorleaf','bodyslam','recover'], {}],
  [186,118,'角金鱼','WATER',null, 45,67,60,35,50,63, 187,33, ['peck','watergun','horn_attack'], {}],
  [187,119,'金鱼王','WATER',null, 80,92,65,65,80,68, null,null, ['surf','horn_attack','bodyslam','hydropump'], {}],
  [188,132,'百变怪','NORMAL',null, 48,48,48,48,48,48, null,null, ['tackle','mimic'], {}],
]

const maxMp = (spa) => Math.floor(spa*0.8)+20
const lines = []
for (const [id,dex,name,t1,t2,hp,atk,def,spa,spd,spe,evoT,evoLv,moves] of rows) {
  const typeLine = t2 ? `    type: ${T(t1)}, type2: ${T(t2)},` : `    type: ${T(t1)},`
  const movesLine = `    moves: [${moves.map(m=>`'${m}'`).join(', ')}],`
  const evoLine = evoT ? `    evolvesTo: { level: ${evoLv}, targetId: ${evoT} },\n` : ''
  lines.push(
`  {
    id: ${id}, dexNo: ${dex}, name: '${name}',
${typeLine}
    maxHp: ${hp}, maxMp: ${maxMp(spa)}, atk: ${atk}, def: ${def}, spAtk: ${spa}, spDef: ${spd}, spd: ${spe},
${movesLine}
${evoLine}    ...sp(${dex}),
  },`)
}
import fs from 'node:fs'
fs.writeFileSync('/tmp/new_monsters_block.txt', lines.join('\n')+'\n')
console.log('生成', rows.length, '只定义, 写入 /tmp/new_monsters_block.txt')
console.log('校验技能引用...')
