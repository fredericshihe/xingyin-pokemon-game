# 战斗招式表现清单

由当前 322 条招式数据与实际渲染配置生成。机制栏对应游戏数据；动作栏是已实现的表现方式。本表是覆盖核对依据，不代表每个设备上每一帧均已人工验收。

| 招式 | 游戏机制 | 动作／材料 | 表现方式 |
|---|---|---|---|
| 撞击 (tackle) | 威力 40 | strike / dust / body | 肩身前冲，接触处凹缩后散开短尘团 |
| 抓 (scratch) | 威力 40 | slash / claw / body | 三道细爪痕依挥抓方向露出，留深色边缘 |
| 角撞 (horn_attack) | 威力 65 | anatomy / horn / body | 带横纹的弯角尖端先到，刺点迸出小尘屑 |
| 电光一闪 (quickattack) | 威力 40 | dash / mist / body | 身后短促残影，快速贴身碰撞 |
| 挣扎 (flail) | 威力 50 | strike / dust / body | 身体失衡左右挣动，攻击落点不规则偏移 |
| 乱击 (fury_attack) | 威力 45 | frenzy / horn / body | 尖角从敌人周围不同方位突入，每击改变位置与角度 |
| 咬住 (bite) | 威力 60；畏缩 | fang / tooth / body | 上下实体牙齿合拢，留下成对齿痕 |
| 泰山压顶 (bodyslam) | 威力 85；30% 麻痹 | slam / dust / body | 身体高起下压，宽阔着地点向两侧挤出尘土 |
| 劈开 (slash) | 威力 70 | slash / claw / body | 一条宽而尖的深切痕横斜切开 |
| 神速 (extremespeed) | 威力 80 | dash / mist / body | 极短的紧束残影，接触后空气压缩向外扩开 |
| 自我再生 (recover) | 回复 | heal / light / meditate | 再生微光从身体轮廓向内修复汇聚 |
| 模仿 (mimic) | 模仿技能 | warp / mist / body | 柔和双重轮廓靠拢，表现观察与复现 |
| 变身 (transform) | 模仿技能 | warp / smoke / body | 外形收缩再展开，流动烟雾遮住变化过程 |
| 火花 (ember) | 威力 40；10% 灼伤 | volley / flame / body | 小火种分散飞出，在落点留下短促火舌 |
| 喷射火焰 (flamethrower) | 威力 90；10% 灼伤 | jet / flame / body | 连续翻卷火舌由窄到宽喷出，火星向上飘散 |
| 大字爆炎 (fire_blast) | 威力 110；10% 灼伤 | burst / flame / body | 五股不规则烈焰向外炸开，火团接续翻卷而非文字符号 |
| 水枪 (watergun) | 威力 40 | jet / droplet / body | 细密蓝色水滴连续射出，落点水花四溅 |
| 冲浪 (surf) | 威力 90 | wave / foam / body | 宽水墙卷着白色泡沫推进，浪头翻覆目标 |
| 水炮 (hydropump) | 威力 110 | jet / splash / body | 粗密高速水流向前压出，大水花覆盖落点 |
| 藤鞭 (vinewhip) | 威力 45 | vine / leaf / body | 有粗细变化、节纹和小叶的柔性藤条抽打后回弹 |
| 飞叶快刀 (razorleaf) | 威力 55 | volley / leaf / body | 有叶脉的尖叶侧向旋转切入，散落叶片 |
| 电击 (thundershock) | 威力 40；10% 麻痹 | lightning / spark / body | 一束细分叉电流，局部短暂放电 |
| 十万伏特 (thunderbolt) | 威力 90；10% 麻痹 | lightning / spark / body | 多股粗细分明的电弧分叉包围目标 |
| 电磁炮 (zap_cannon) | 威力 120；100% 麻痹 | orb / spark / body | 压缩电球带跳动电弧飞出，落点强烈放电 |
| 冰冻光束 (icebeam) | 威力 90；10% 冰冻 | beam / ice / body | 冰冷透明束带细冰晶，接触处向外结霜 |
| 暴风雪 (blizzard) | 威力 110；10% 冰冻 | storm / ice / body | 密集冰晶与雪雾斜向吹落，覆盖整个目标区域 |
| 空手劈 (karate_chop) | 威力 50 | anatomy / spark / chop | 手掌侧缘由上往下切入，留下窄掌缘压痕 |
| 二连踢 (double_kick) | 威力 60 | anatomy / dust / kick | 每次真实命中留下一只实体脚印，左右交替 |
| 下踢 (low_kick) | 威力 60 | anatomy / dust / kick | 脚底从低处扫入，脚印落在对手下部 |
| 毒针 (poison_sting) | 威力 15；30% 中毒 | volley / needle / body | 单枚紫色尖针刺入，刺点附着少量毒液 |
| 毒击 (poison_jab) | 威力 80；30% 中毒 | anatomy / droplet / body | 沾毒手掌指端前刺，毒滴从接触处溅出 |
| 地震 (earthquake) | 威力 100 | quake / rock / body | 地面裂纹向四周伸展，岩屑沿地表抛起 |
| 啄 (peck) | 威力 35 | anatomy / spark / body | 短尖喙直接啄入，喙尖和轻微啄痕清楚可见 |
| 翅膀攻击 (wing_attack) | 威力 60 | anatomy / feather / body | 带分层飞羽的翅膀扇击，命中处飘落羽毛 |
| 飞翔 (fly) | 威力 90 | anatomy / feather / body | 双翼上举后从高处俯冲，羽片向后拖曳 |
| 钻孔啄 (drill_peck) | 威力 80 | anatomy / feather / body | 尖喙旋转推进，短螺旋气流环绕喙尖 |
| 暴风 (hurricane) | 威力 110；混乱 | vortex / feather / body | 高而宽的旋风卷起羽片，层层气流向上收束 |
| 神鸟猛击 (sky_attack) | 威力 140；畏缩；蓄力 | anatomy / light / body | 张开的双翼带金色羽流高速俯冲，形成重击 |
| 精神强念 (psychic) | 威力 90；对方特防降低 1 级 | levitate / light / body | 精神波从外向内紧压目标，悬浮微粒向中心收缩 |
| 催眠术 (hypnosis) | 100% 睡眠 | sound / mist / body | 缓慢扩张的柔和同心波，落点睡雾下沉 |
| 食梦 (dream_eater) | 威力 100；吸取 | drain / smoke / body | 从目标梦雾中抽出细能量流，回归施术者 |
| 连斩 (fury_cutter) | 威力 40 | slash / claw / body | 交替方向的短切痕，每击保持清楚的刀锋收尾 |
| 落石 (rock_throw) | 威力 50 | volley / rock / body | 单块有棱面的石头抛物线落下，碎屑沿落点散开 |
| 岩崩 (rock_slide) | 威力 75；畏缩 | storm / rock / body | 多块大岩石从上方错落下坠，落地扬尘 |
| 滚动 (rollout) | 威力 30 | roll / rock / body | 身体随环绕石屑滚动冲向对方 |
| 舔 (lick) | 威力 30；30% 麻痹 | tongue / droplet / body | 圆钝湿润的粉红舌头伸展，舔过目标后缩回 |
| 暗影球 (shadowball) | 威力 80；对方特防降低 1 级 | orb / smoke / body | 旋动暗影聚成浓密球体，命中后散成黑紫烟丝 |
| 愤怒之拳 (rage_fist) | 威力 50 | anatomy / smoke / punch | 清楚拳骨轮廓包裹愤怒暗雾，重拳压入 |
| 龙爪 (dragonclaw) | 威力 80 | slash / claw / body | 三道宽阔龙爪抓痕，爪缘蓝紫能量沿切口散开 |
| 铁尾 (iron_tail) | 威力 100；对方防御降低 1 级 | anatomy / metal / tail | 分节金属尾巴大幅横甩，接触处飞出金属屑 |
| 月亮之力 (moonblast) | 威力 95；对方特攻降低 1 级 | orb / light / body | 月色光球从高位弧线坠向目标，柔光碎片扩散 |
| 吸取 (absorb) | 威力 20；吸取 | drain / light / body | 少量细小生命微粒从对方回流自身 |
| 溶解液 (acid) | 威力 40；对方特防降低 1 级 | jet / droplet / body | 稀薄酸液向外喷溅，湿润斑点附着落点 |
| 溶化 (acid_armor) | 自身防御提升 2 级 | armor / droplet / curl | 身体外层变成流动液膜，液滴下滑后重新聚合 |
| 酸液炸弹 (acid_spray) | 威力 40；对方特防降低 2 级 | volley / droplet / body | 酸液团抛出破裂，散成更密的腐蚀液滴 |
| 燕返 (aerial_ace) | 威力 60 | dash / feather / body | 侧向掠过再折回切入，羽流形成折返轨迹 |
| 高速移动 (agility) | 自身速度提升 2 级 | warp / mist / vanish | 自身左右短残影快速收拢，表现加速步伐 |
| 空气利刃 (air_cutter) | 威力 60 | slash / mist / body | 多道透明尖端风刃并行切过 |
| 空气斩 (air_slash) | 威力 75；畏缩 | slash / mist / body | 一道宽风刃斜切，细气流沿切面散开 |
| 瞬间失忆 (amnesia) | 自身特防提升 2 级 | shroud / mist / meditate | 头部轻雾向上散开，随后安静凝聚 |
| 原始之力 (ancient_power) | 威力 60；自身攻击提升 1 级；自身防御提升 1 级；自身特攻提升 1 级；自身特防提升 1 级；自身速度提升 1 级 | levitate / rock / body | 几块古岩从地面悬起，再向对手压落 |
| 水流喷射 (aqua_jet) | 威力 40 | dash / droplet / body | 水包裹身体前冲，身后拖着细水滴 |
| 水流尾 (aqua_tail) | 威力 90 | anatomy / splash / tail | 弯曲实体尾巴裹着流动水层抽打，甩出水花 |
| 恶意追击 (assurance) | 威力 60 | strike / smoke / body | 从侧面追近再击中，低沉烟尘留在接触点 |
| 惊吓 (astonish) | 威力 30；畏缩 | burst / smoke / body | 目标近处突然爆出幽暗雾团，压迫轮廓短暂放大 |
| 波导弹 (aura_sphere) | 威力 80 | orb / light / body | 能量沿球面旋动，弯曲飞向目标后解体 |
| 极光束 (aurora_beam) | 威力 65；对方攻击降低 1 级 | beam / mist / body | 柔和极光带沿光束起伏，落点留冷色微雾 |
| 身体轻量化 (autotomize) | 自身速度提升 2 级 | shatter / metal / body | 金属外层碎片向外脱落，身体附近逐渐轻盈 |
| 下压踢 (axe_kick) | 威力 120 | anatomy / spark / kick | 脚跟高举后垂直下劈，竖向脚印压在目标上 |
| 圆瞳 (baby_doll_eyes) | 对方攻击降低 1 级 | gaze / light / plead | 双眼温和湿润反光，动作小而轻柔 |
| 打嗝 (belch) | 威力 120 | jet / smoke / body | 不均匀浓稠毒气从口前喷出，扩成巨大气团 |
| 火焰踢 (blaze_kick) | 威力 85；10% 灼伤 | anatomy / flame / kick | 实体脚印压在目标身上，脚缘火舌向上燃烧并留下焦痕 |
| 骨棒乱打 (bone_rush) | 威力 25 | bone-swing / bone / body | 带双球关节的象牙色骨棒左右挥打，骨质轮廓不发光 |
| 骨头回力镖 (bonemerang) | 威力 50 | boomerang / bone / body | 完整骨头旋转飞出，经过目标后沿另一条弧线收回 |
| 弹跳 (bounce) | 威力 85；30% 麻痹 | anatomy / dust / body | 高高跃起再脚底落下，尘土向两边弹开 |
| 勇鸟猛攻 (brave_bird) | 威力 120 | anatomy / feather / body | 双翼收拢成锋锐冲势，羽流从身体两侧猛烈散开 |
| 劈瓦 (brick_break) | 威力 75 | anatomy / rock / chop | 手掌侧劈压下，接触处硬质碎片崩开 |
| 盐水 (brine) | 威力 65 | jet / droplet / body | 盐水流裹着浅白水沫扑向目标 |
| 狂舞挥打 (brutal_swing) | 威力 60 | frenzy / smoke / body | 近身绕身大幅摆击，打击方位持续改变 |
| 泡沫光线 (bubble_beam) | 威力 65；对方速度降低 1 级 | jet / bubble / body | 透明圆泡连续射出，命中泡壁破裂成小水滴 |
| 虫咬 (bug_bite) | 威力 60 | fang / tooth / body | 小型尖齿快速合拢，留下紧凑咬痕 |
| 虫鸣 (bug_buzz) | 威力 90；对方特防降低 1 级 | sound / mist / body | 密集小振幅空气波从身体发出，持续振动 |
| 健美 (bulk_up) | 自身攻击提升 1 级；自身防御提升 1 级 | aura / dust / flex | 身体轮廓逐渐绷紧，短上升气流强调发力 |
| 重踏 (bulldoze) | 威力 60；对方速度降低 1 级 | anatomy / dust / body | 蹄印压向地表，低矮土浪沿脚边扩散 |
| 子弹拳 (bullet_punch) | 威力 40 | anatomy / metal / punch | 金属质感拳头短距离急冲，命中痕迅速显现 |
| 种子机关枪 (bullet_seed) | 威力 25 | volley / seed / body | 有硬壳的种子依实际连击逐枚射入 |
| 冥想 (calm_mind) | 自身特攻提升 1 级；自身特防提升 1 级 | aura / mist / meditate | 慢速精神微粒平稳绕行，再凝聚于头部 |
| 充电 (charge) | 自身特防提升 1 级 | aura / spark / body | 细小电弧向身体汇入，电荷沿外轮廓积聚 |
| 充电光束 (charge_beam) | 威力 50；自身特攻提升 1 级 | beam / spark / body | 电荷先聚紧再沿细束释放，落点轻微分叉 |
| 撒娇 (charm) | 对方攻击降低 2 级 | shroud / petal / plead | 柔和花瓣随讨好动作轻摆，对方附近缓慢飘散 |
| 清除之烟 (clear_smog) | 威力 50 | shroud / mist / body | 浅淡干净烟雾扩散冲刷目标，然后消散 |
| 近身战 (close_combat) | 威力 120；自身防御降低 1 级；自身特防降低 1 级 | frenzy / spark / punch | 拳印与脚印在近身不同部位接连出现，保持一个伤害结算 |
| 盘蜷 (coil) | 自身攻击提升 1 级；自身防御提升 1 级；自身命中提升 1 级 | armor / mist / curl | 粗细变化的盘绕轮廓一圈圈收紧自身 |
| 奇异之光 (confuse_ray) | 混乱 | orb / light / body | 飘忽光团绕曲线接近，目标头顶轻雾旋转 |
| 念力 (confusion) | 威力 50；混乱 | levitate / mist / body | 小范围精神涟漪挤压目标，微粒向内收束 |
| 宇宙力量 (cosmic_power) | 自身防御提升 1 级；自身特防提升 1 级 | aura / light / meditate | 不规则星尘绕身体成层运行，逐渐聚向自身 |
| 渴望 (covet) | 威力 60 | anatomy / dust / plead | 伸出的实体手掌从侧面接近，接触后回收 |
| 蟹钳锤 (crabhammer) | 威力 100 | hammer / pincer / body | 沉重蟹钳高举砸下，水花从钳尖炸开 |
| 十字劈 (cross_chop) | 威力 100 | anatomy / spark / chop | 两只手掌侧缘交叉劈入，留下两道相交掌痕 |
| 十字毒刃 (cross_poison) | 威力 70；10% 中毒 | slash / droplet / body | 两条沾毒切痕交叉，交点滴落紫色毒液 |
| 咬碎 (crunch) | 威力 80；对方防御降低 1 级 | fang / tooth / body | 粗大尖齿上下压碎，少量硬屑从齿缝散开 |
| 撕裂爪 (crush_claw) | 威力 75；对方防御降低 1 级 | slash / claw / body | 粗爪深入后向外撕开，四道宽抓痕错落伸展 |
| 居合斩 (cut) | 威力 50 | slash / claw / body | 短而干净的侧向刃痕，收尾利落 |
| 恶之波动 (dark_pulse) | 威力 80；畏缩 | sound / smoke / body | 暗色压缩波一圈圈推进，边缘破成烟丝 |
| 魔法闪耀 (dazzling_gleam) | 威力 80 | burst / light / body | 目标附近柔亮光面展开，细碎光尘逐渐散去 |
| 变圆 (defense_curl) | 自身防御提升 1 级 | armor / mist / curl | 身体缩成紧实轮廓，外侧护膜收拢 |
| 清除浓雾 (defog) | 对方闪避降低 1 级 | wave / mist / body | 宽气流把雾丝推向两侧，中心逐渐清空 |
| 挖洞 (dig) | 威力 80 | burrow / dust / body | 自身钻入土中，对手脚下土块隆起后破土 |
| 魅惑之声 (disarming_voice) | 威力 40 | sound / petal / body | 轻柔空气波夹带少量花瓣，平缓到达对手 |
| 放电 (discharge) | 威力 80；30% 麻痹 | lightning / spark / body | 从身体向多个方向跳出分叉电弧 |
| 潜水 (dive) | 威力 80 | burrow / splash / body | 自身沉入水涡，目标下方涌起水柱和水花 |
| 舍身冲撞 (double_edge) | 威力 120 | dash / dust / body | 全身猛烈前撞，厚尘团在接触时挤向两侧 |
| 二连击 (double_hit) | 威力 35 | anatomy / spark / body | 每个结算在不同部位留下掌击痕，左右交替 |
| 影子分身 (double_team) | 自身闪避提升 1 级 | warp / mist / vanish | 数个短暂身形残影在两侧错开再消失 |
| 龙息 (dragon_breath) | 威力 60；30% 麻痹 | jet / flame / body | 蓝紫龙焰由口前连续吐出，热流翻滚 |
| 龙之舞 (dragon_dance) | 自身攻击提升 1 级；自身速度提升 1 级 | aura / mist / dance | 鳞片能量随身体旋绕升起，舞步绕身展开 |
| 龙之波动 (dragon_pulse) | 威力 85 | sound / light / body | 蓝紫脉冲逐层推进，鳞片状光质沿波面翻动 |
| 龙之俯冲 (dragon_rush) | 威力 100；畏缩 | dragon-dive / flame / body | 角与鳞片勾出龙形冲势，裹着龙焰俯冲撞入 |
| 龙尾 (dragon_tail) | 威力 60 | anatomy / mist / tail | 有鳞节的厚尾甩击，尾端清楚经过接触点 |
| 吸取拳 (drain_punch) | 威力 75；吸取 | anatomy / light / punch | 拳印先命中，再从拳印处抽回细能量流 |
| 吸取之吻 (draining_kiss) | 威力 50；吸取 | anatomy / petal / plead | 柔软唇印短暂贴近，生命微粒沿弧线回流 |
| 直冲钻 (drill_run) | 威力 80 | drill / dust / body | 身体前端钻势旋转，旋起土屑并在接触点穿入 |
| 双翼 (dual_wingbeat) | 威力 40 | anatomy / feather / body | 左右有飞羽的翅膀随真实连击交替拍中 |
| 爆裂拳 (dynamic_punch) | 威力 100；混乱 | anatomy / spark / punch | 握紧的拳头猛烈命中，拳缘压缩气流爆散 |
| 大地之力 (earth_power) | 威力 90；对方特防降低 1 级 | eruption / rock / body | 目标脚下裂开，岩土从裂隙向上喷出 |
| 回声 (echoed_voice) | 威力 40 | sound / mist / body | 一圈主声波后跟较淡回声，间距逐渐拉开 |
| 怪异电波 (eerie_impulse) | 对方特攻降低 2 级 | sound / spark / body | 低强度电波不规则振动，轻微分叉围绕目标 |
| 电球 (electro_ball) | 威力 60 | orb / spark / body | 紧凑电球高速旋转，短电弧贴着球面 |
| 能量球 (energy_ball) | 威力 90；对方特防降低 1 级 | orb / leaf / body | 自然能量球带叶脉微粒，沿曲线撞入目标 |
| 大爆炸 (explosion) | 威力 250 | explosion / flame / body | 自身瞬间大范围爆发，冲击前缘后接翻卷烟尘 |
| 神通力 (extrasensory) | 威力 80；畏缩 | levitate / spark / body | 多层精神压力由外收紧，目标周围空间扭动 |
| 妖精之风 (fairy_wind) | 威力 40 | wave / petal / body | 柔和花瓣随着轻风成片掠过 |
| 击掌奇袭 (fake_out) | 威力 40；畏缩 | anatomy / spark / palm | 两只实体手掌从两侧急合，拍击点迸出短气浪 |
| 假哭 (fake_tears) | 对方特防降低 2 级 | tears / droplet / cry | 眼边大量泪滴沿脸颊落下并向外甩落 |
| 点到为止 (false_swipe) | 威力 40 | slash / claw / body | 细短刃痕擦过身体边缘，收手时迅速变细 |
| 羽毛舞 (feather_dance) | 对方攻击降低 2 级 | storm / feather / dance | 大羽片缓慢左右飘落，围绕对手落下 |
| 佯攻 (feint) | 威力 30 | dash / mist / body | 短暂向一侧虚晃，反向突入接触 |
| 致命针刺 (fell_stinger) | 威力 50 | drill / needle / body | 锐利长刺贴身刺入，刺根保留实体厚度 |
| 火焰牙 (fire_fang) | 威力 65；10% 灼伤；畏缩 | fang / flame / body | 实体齿列咬合，火焰附着齿尖与齿痕 |
| 火焰拳 (fire_punch) | 威力 75；10% 灼伤 | anatomy / flame / punch | 清楚的握拳形状裹火前击，拳印边缘燃烧 |
| 迎头一击 (first_impression) | 威力 90 | dash / claw / body | 从上侧迅猛贴身突击，短爪痕留在接触点 |
| 蓄能焰袭 (flame_charge) | 威力 50；自身速度提升 1 级 | dash / flame / body | 小型火焰贴住身体前冲，火星沿身后拖出 |
| 火焰轮 (flame_wheel) | 威力 60；10% 灼伤 | roll / flame / body | 翻滚火环紧贴身体转动，火舌随旋转甩开 |
| 闪焰冲锋 (flare_blitz) | 威力 120；10% 灼伤 | dash / flame / body | 厚烈焰包住全身冲撞，火流沿两侧拖曳 |
| 加农光炮 (flash_cannon) | 威力 80；对方特防降低 1 级 | beam / metal / body | 密集银白能量收束发射，金属冷光从落点散开 |
| 吹捧 (flatter) | 混乱；对方特攻提升 1 级 | sound / smoke / body | 施术者轻摆，柔软气流绕着目标头部上升 |
| 真气拳 (focus_punch) | 威力 150 | anatomy / light / punch | 蓄势后的大拳头清楚压入，厚压缩气浪向外展开 |
| 发劲 (force_palm) | 威力 60；30% 麻痹 | anatomy / mist / palm | 张开的掌心前推，掌纹命中后局部气劲扩散 |
| 冷冻干燥 (freeze_dry) | 威力 70；10% 冰冻 | shatter / frost / body | 薄霜从目标外缘向内结成干燥冰壳 |
| 乱抓 (fury_swipes) | 威力 18 | frenzy / claw / body | 短爪痕从敌人周围不同落点交错抓过 |
| 预知未来 (future_sight) | 威力 120 | levitate / light / body | 上方聚集的精神光质向下压落，不额外改变结算回合 |
| 终极吸取 (giga_drain) | 威力 75；吸取 | drain / leaf / body | 多股粗密生命微粒从目标涌回自身 |
| 终极冲击 (giga_impact) | 威力 150 | dash / light / body | 蓄满力量全身冲击，宽压缩气浪在目标处爆开 |
| 大蛇瞪眼 (glare) | 100% 麻痹 | gaze / light / body | 双眼狭长反光压低，目标附近紧缩电压感 |
| 叫声 (growl) | 对方攻击降低 1 级 | sound / mist / body | 几圈低强度空气波从口前传向对方 |
| 生长 (growth) | 自身攻击提升 1 级；自身特攻提升 1 级 | aura / leaf / flex | 新叶从身体周围舒展，生机微粒向上生长 |
| 垃圾射击 (gunk_shot) | 威力 120；30% 中毒 | volley / droplet / body | 厚重不规则毒污团抛落，黏稠污液大片溅开 |
| 起风 (gust) | 威力 40 | vortex / mist / body | 小型旋风沿目标周围上旋，细雾线清楚可见 |
| 陀螺球 (gyro_ball) | 威力 60 | roll / metal / body | 金属外缘随身体滚转，紧凑回旋接触目标 |
| 臂锤 (hammer_arm) | 威力 100；自身速度降低 1 级 | anatomy / dust / body | 握拳手臂从上方砸下，重拳印与地面尘浪同现 |
| 变硬 (harden) | 自身防御提升 1 级 | armor / light / curl | 身体外层逐渐加厚，硬质片贴合轮廓 |
| 双刃头锤 (head_smash) | 威力 150 | anatomy / rock / head | 额部硬壳先接触，巨大碎岩压痕从撞点散开 |
| 头锤 (headbutt) | 威力 70；畏缩 | anatomy / dust / head | 额部向前顶入，圆弧额痕与尘屑形成局部重击 |
| 治愈波动 (heal_pulse) | 回复 | heal / mist / body | 治疗涟漪逐层包住自身，柔光回流体内 |
| 热风 (heat_wave) | 威力 95；10% 灼伤 | wave / flame / body | 宽幅热气携火星推进，目标附近热雾上升 |
| 重磅冲撞 (heavy_slam) | 威力 60 | slam / metal / body | 金属质感的身体重压，地表厚尘向外挤出 |
| 祸不单行 (hex) | 威力 65 | shroud / smoke / body | 暗雾从目标脚边缠上来，局部收紧再消散 |
| 十万马力 (high_horsepower) | 威力 95 | anatomy / dust / body | 沉重蹄印前蹬命中，土屑沿冲势飞散 |
| 飞膝踢 (high_jump_kick) | 威力 130 | anatomy / spark / kick | 身体跃起用弯曲膝部冲入，紧实膝痕压住目标 |
| 磨爪 (hone_claws) | 自身攻击提升 1 级；自身命中提升 1 级 | aura / claw / body | 实体爪片互相摩擦，磨出细小硬屑 |
| 长嚎 (howl) | 自身攻击提升 1 级 | sound / light / flex | 头部抬高，宽声波从身前向外上扬 |
| 破坏光线 (hyper_beam) | 威力 150 | beam / light / body | 宽大能量束经过蓄势贯出，落点强光缓慢衰减 |
| 巨声 (hyper_voice) | 威力 90 | sound / mist / body | 大幅空气压缩波密集推进，边缘震动 |
| 冰冻牙 (ice_fang) | 威力 65；10% 冰冻；畏缩 | fang / ice / body | 冰覆实体尖牙合拢，咬痕凝出碎冰 |
| 冰冻拳 (ice_punch) | 威力 75；10% 冰冻 | anatomy / ice / punch | 拳头覆上冰晶，命中拳印后冰屑崩散 |
| 冰砾 (ice_shard) | 威力 40 | volley / ice / body | 短锐冰片快速投出，落点碎成小冰棱 |
| 冰柱坠击 (icicle_crash) | 威力 85；畏缩 | storm / ice / body | 粗长冰柱由上落下，底部崩成冰片 |
| 冰锥 (icicle_spear) | 威力 25 | volley / ice / body | 每次实际命中发出一支尖冰锥 |
| 冰冻之风 (icy_wind) | 威力 55；对方速度降低 1 级 | wave / frost / body | 细碎霜晶随低温气流斜向掠过 |
| 烧尽 (incinerate) | 威力 60 | jet / flame / body | 宽而短的火舌掠过目标，细余烬上升 |
| 炼狱 (inferno) | 威力 100；100% 灼伤 | eruption / flame / body | 目标下方烈焰升腾，数股火柱持续翻卷 |
| 铁壁 (iron_defense) | 自身防御提升 2 级 | armor / metal / curl | 厚金属甲片贴合身体外层，硬边冷光逐渐稳定 |
| 铁头 (iron_head) | 威力 80；畏缩 | anatomy / metal / head | 银色额甲前撞，圆额痕与少量金属碎屑同现 |
| 拍落 (knock_off) | 威力 65 | anatomy / smoke / body | 手掌由上向下拍落，碎屑顺势往下散开 |
| 珍藏 (last_resort) | 威力 140 | burst / dust / body | 聚紧全身力量后爆发局部强冲击，材料快速外扩 |
| 喷烟 (lava_plume) | 威力 80；30% 灼伤 | eruption / flame / body | 热灰和暗红火舌从低处翻腾，烟尘随后上升 |
| 叶刃 (leaf_blade) | 威力 90 | anatomy / leaf / body | 宽尖实体叶刃斜向切入，叶脉保持可见 |
| 飞叶风暴 (leaf_storm) | 威力 130；自身特攻降低 2 级 | vortex / leaf / body | 大量尖叶卷成高密旋风，从外围向中心掠过 |
| 吸血 (leech_life) | 威力 80；吸取 | fang / tooth / body | 细尖齿先贴近咬入，再抽回深红生命微粒 |
| 瞪眼 (leer) | 对方防御降低 1 级 | gaze / mist / body | 施术者双眼压低，冷光逼视目标 |
| 生命水滴 (life_dew) | 回复 | heal / droplet / drink | 几颗清透水滴缓缓落到自身，水润光泽汇入身体 |
| 水流裂破 (liquidation) | 威力 85；对方防御降低 1 级 | slash / splash / body | 紧束水刃切开目标，水膜断裂后溅散 |
| 恶魔之吻 (lovely_kiss) | 100% 睡眠 | anatomy / smoke / plead | 暗粉唇印短暂接触，柔和睡雾在周围下沉 |
| 下盘踢 (low_sweep) | 威力 65；对方速度降低 1 级 | anatomy / dust / kick | 侧向扫腿打在低处，横斜脚印与少量尘土同现 |
| 音速拳 (mach_punch) | 威力 40 | anatomy / spark / punch | 小幅度拳头极速前伸，短残影跟在拳后 |
| 魔法叶 (magical_leaf) | 威力 60 | volley / leaf / body | 叶片沿弯曲追踪轨迹飞向对手，叶脉明晰 |
| 磁场操控 (magnetic_flux) | 自身防御提升 1 级；自身特防提升 1 级 | aura / spark / body | 金属微片沿两条相交轨道绕自身转动 |
| 超级吸取 (mega_drain) | 威力 40；吸取 | drain / leaf / body | 中等密度生命微粒沿两侧弧线回流 |
| 百万吨重踢 (mega_kick) | 威力 120 | anatomy / spark / kick | 大脚底重重横踢，宽脚印与压缩气浪留在敌人身上 |
| 百万吨重拳 (mega_punch) | 威力 80 | anatomy / spark / punch | 大拳头正面命中，拳骨压痕持续可见 |
| 超级角击 (megahorn) | 威力 120 | anatomy / horn / body | 巨大的弯角先蓄后刺，粗角根与尖端同时清楚可见 |
| 临别礼物 (memento) | 对方攻击降低 2 级；对方特攻降低 2 级 | shroud / smoke / body | 自身暗雾向外散尽，在对方附近形成压迫薄雾 |
| 金属爪 (metal_claw) | 威力 50；自身攻击提升 1 级 | slash / metal / body | 三片金属爪尖划过，银色抓痕保留深色边缘 |
| 金属音 (metal_sound) | 对方特防降低 2 级 | sound / metal / body | 细而密的振动波从金属屑附近发出 |
| 流星突击 (meteor_assault) | 威力 150 | dive / dust / body | 长尖冲势带流星碎尘冲入，接触点猛烈爆散 |
| 彗星拳 (meteor_mash) | 威力 90；自身攻击提升 1 级 | anatomy / metal / punch | 银色拳頭沿下斜方向猛击，身后拖着彗星尘尾 |
| 喝牛奶 (milk_drink) | 回复 | heal / droplet / drink | 乳白液滴从嘴边进入，柔和恢复微粒下沉体内 |
| 变小 (minimize) | 自身闪避提升 2 级 | warp / light / vanish | 自身轮廓与附近微粒一起收缩，残影迅速消失 |
| 月光 (moonlight) | 回复 | heal / light / body | 上方月色柔光洒落，淡蓝微粒缓慢落入身体 |
| 晨光 (morning_sun) | 回复 | heal / spark / body | 暖金晨光斜落，温暖微粒从上汇入自身 |
| 泥巴射击 (mud_shot) | 威力 55；对方速度降低 1 级 | volley / droplet / body | 深棕泥团抛出，接触处黏泥溅散 |
| 掷泥 (mud_slap) | 威力 20；对方命中降低 1 级 | wave / dust / body | 贴地泥点向上扬到目标，留下湿泥斑 |
| 浊流 (muddy_water) | 威力 90；对方命中降低 1 级 | wave / splash / body | 浑浊水浪夹泥沙推进，浪头留浅色泡沫 |
| 魔法火焰 (mystical_fire) | 威力 75；对方特攻降低 1 级 | volley / flame / body | 数团绕曲线飞行的火种，到达后翻卷成小火舌 |
| 诡计 (nasty_plot) | 自身特攻提升 2 级 | aura / smoke / meditate | 头部附近暗雾缓慢凝聚，细能量向头部收紧 |
| 暗袭要害 (night_slash) | 威力 70 | slash / claw / body | 窄深色切痕突现，暗紫边缘随后散去 |
| 蹭蹭脸颊 (nuzzle) | 威力 20；100% 麻痹 | anatomy / spark / body | 贴近脸侧轻蹭，小范围电火花在接触面跳动 |
| 逆鳞 (outrage) | 威力 120 | frenzy / flame / body | 龙鳞和龙焰随暴怒冲击从多方位撕扯，爪痕交错出现 |
| 过热 (overheat) | 威力 130；自身特攻降低 2 级 | explosion / flame / body | 自身高热向外猛然释放，火舌爆散后烟气衰减 |
| 聚宝功 (pay_day) | 威力 40 | volley / coin / body | 金属硬币旋转抛出，边缘和厚度清楚可辨 |
| 以牙还牙 (payback) | 威力 50 | anatomy / smoke / body | 后撤蓄势再从另一侧回击，深色拳印压入 |
| 落英缤纷 (petal_blizzard) | 威力 90 | storm / petal / body | 大片花瓣被强风翻卷，斜向覆盖目标 |
| 花瓣舞 (petal_dance) | 威力 120 | vortex / petal / dance | 花瓣围绕身体旋舞，再形成旋涡袭向目标 |
| 飞弹针 (pin_missile) | 威力 25 | volley / needle / body | 每次命中发出独立尖针，落点留下小刺痕 |
| 和睦相处 (play_nice) | 对方攻击降低 1 级 | sound / light / plead | 温和身形轻摆，柔光在双方附近平缓消散 |
| 嬉闹 (play_rough) | 威力 90；对方攻击降低 1 级 | frenzy / dust / body | 小型拳掌脚印在尘团里换位打闹，尘团不遮住全部动作 |
| 啄食 (pluck) | 威力 60 | anatomy / feather / body | 尖喙侧向啄入再回收，少量羽片轻飘 |
| 剧毒牙 (poison_fang) | 威力 50；50% 中毒 | fang / droplet / body | 尖齿合拢，毒液挂在齿尖并留在咬痕 |
| 毒瓦斯 (poison_gas) | 100% 中毒 | shroud / smoke / body | 大团紫色毒气贴近并包围目标，逐渐上浮 |
| 毒粉 (poison_powder) | 100% 中毒 | spore / pollen / body | 细紫色粉末从空中飘下，颗粒可见而不结成大球 |
| 拍击 (pound) | 威力 40 | anatomy / dust / palm | 张开的手掌横向拍中，留下清楚掌印 |
| 细雪 (powder_snow) | 威力 40；10% 冰冻 | wave / frost / body | 轻薄细霜随风缓慢洒落，保留细雪颗粒 |
| 力量宝石 (power_gem) | 威力 80 | volley / gem / body | 有切面的宝石折射出晶亮碎片，向目标散射 |
| 强力鞭打 (power_whip) | 威力 120 | vine / leaf / body | 粗藤带明显叶节，抬高后猛抽，尾端甩动回弹 |
| 幻象光线 (psybeam) | 威力 65；混乱 | beam / light / body | 精神光束沿传播方向起伏，落点轻雾散开 |
| 精神利刃 (psycho_cut) | 威力 70 | slash / light / body | 薄而锐的精神刃斜向划过，边缘渐细 |
| 精神冲击 (psyshock) | 威力 80 | volley / light / body | 精神光质在目标四周聚成小块再压入 |
| 精神击破 (psystrike) | 威力 100 | levitate / ice / body | 密集精神结晶从外侧紧压目标，随后碎成光尘 |
| 蝶舞 (quiver_dance) | 自身特攻提升 1 级；自身特防提升 1 级；自身速度提升 1 级 | aura / petal / dance | 薄翼轻颤，花粉随柔和舞步向上盘旋 |
| 怒牛 (raging_bull) | 威力 90 | anatomy / dust / body | 低头冲势伴随弯角和蹄尘，厚尘沿身侧扬起 |
| 高速旋转 (rapid_spin) | 威力 50；自身速度提升 1 级 | roll / dust / body | 身体附近低矮尘环高速旋转，贴近目标后散开 |
| 贝壳刃 (razor_shell) | 威力 75；对方防御降低 1 级 | anatomy / shell / body | 有扇形纹理的贝壳锐缘切过，壳屑向后散落 |
| 报仇 (retaliate) | 威力 70 | strike / spark / body | 压低身体后迅速反击，接触印迹由内向外展开 |
| 起死回生 (reversal) | 威力 50 | strike / light / body | 由低处奋力抬击，冲击微粒向上扬起 |
| 岩石爆击 (rock_blast) | 威力 25 | volley / rock / body | 每次真实命中投出一块小岩石，碎石独立散开 |
| 岩石打磨 (rock_polish) | 自身速度提升 2 级 | shatter / dust / body | 细砂从身体外层剥落，露出平滑反光轮廓 |
| 碎岩 (rock_smash) | 威力 40；对方防御降低 1 级 | anatomy / rock / palm | 拳掌先接触硬石，岩屑从压痕处崩开 |
| 岩石封锁 (rock_tomb) | 威力 60；对方速度降低 1 级 | rock-prison / rock / body | 重岩从上方落在周围，逐渐围住目标 |
| 岩石炮 (rock_wrecker) | 威力 150 | orb / rock / body | 巨大的棱面岩球抛落，碎岩和地表尘浪接续展开 |
| 轮唱 (round) | 威力 60 | sound / mist / body | 等距声波重复传出，后续波面与前波相接 |
| 圣剑 (sacred_sword) | 威力 90 | anatomy / blade / body | 有剑锋与剑脊的实体长刃划过，切线干净锐利 |
| 泼沙 (sand_attack) | 对方命中降低 1 级 | wave / dust / body | 低处细沙成扇形扬起，颗粒落到目标周围 |
| 鬼面 (scary_face) | 对方速度降低 2 级 | gaze / smoke / body | 双眼狭长暗亮，压迫雾从外围向目标收紧 |
| 刺耳声 (screech) | 对方防御降低 2 级 | sound / spark / body | 细密高频气流波快速振动，外圈边缘起伏 |
| 种子炸弹 (seed_bomb) | 威力 80 | orb / seed / body | 厚实种子被抛出，硬壳在目标处裂开 |
| 自爆 (self_destruct) | 威力 200 | explosion / dust / body | 自身压缩后爆出强尘浪，外缘尘屑快速扩散 |
| 暗影拳 (shadow_punch) | 威力 60 | anatomy / smoke / punch | 深色实体拳印从短暗雾中打出，边缘散成烟丝 |
| 影子偷袭 (shadow_sneak) | 威力 40 | dash / smoke / body | 影雾沿地面滑近，再从目标脚边向上突袭 |
| 破壳 (shell_smash) | 自身防御降低 1 级；自身特防降低 1 级；自身攻击提升 2 级；自身特攻提升 2 级；自身速度提升 2 级 | shatter / shell / body | 外壳大块断裂并落下，碎片形状有壳纹 |
| 电击波 (shock_wave) | 威力 60 | wave / spark / body | 圆形电波逐层推进，波缘跳出细电弧 |
| 唱歌 (sing) | 100% 睡眠 | sound / mist / body | 间距宽缓的气流波柔和传出，目标处睡雾轻落 |
| 摔打 (slam) | 威力 80 | anatomy / dust / tail | 实体尾部抬高后重重摔下，底部尘浪四散 |
| 催眠粉 (sleep_powder) | 100% 睡眠 | spore / pollen / body | 淡紫细粉慢慢飘向目标，落点轻雾下沉 |
| 污泥攻击 (sludge) | 威力 65；30% 中毒 | volley / droplet / body | 小团黏稠污泥抛落，接触处散成湿污斑 |
| 污泥炸弹 (sludge_bomb) | 威力 90；30% 中毒 | orb / droplet / body | 厚污泥球落下爆裂，毒污沿四周溅出 |
| 污泥波 (sludge_wave) | 威力 95；10% 中毒 | wave / droplet / body | 低矮黏稠污泥波推动，液滴顺着浪头飞散 |
| 浊雾 (smog) | 威力 30；40% 中毒 | shroud / smoke / body | 灰紫稀薄浊雾逐渐笼罩目标 |
| 烟幕 (smokescreen) | 对方命中降低 1 级 | shroud / smoke / body | 灰黑烟团向外膨胀，边缘变淡后散去 |
| 大声咆哮 (snarl) | 威力 55；对方特攻降低 1 级 | sound / smoke / body | 短而粗重的暗色声波向前压出 |
| 打鼾 (snore) | 威力 50；畏缩 | sound / dust / body | 几圈不均匀低频空气波从嘴前重复扩开 |
| 生蛋 (soft_boiled) | 回复 | egg-heal / egg / drink | 完整鸡蛋举起裂开，蛋壳落下，恢复微粒汇入体内 |
| 日光束 (solar_beam) | 威力 120 | beam / light / body | 阳光积聚后形成宽亮束，草绿色微粒沿束流动 |
| 电光 (spark) | 威力 65；30% 麻痹 | dash / spark / body | 电弧紧贴身体冲刺，命中局部跳火花 |
| 跃起 (splash) | 无效果 | hop / dust / body | 自身轻轻无力跃起，地面少量尘土，无对手命中痕 |
| 蘑菇孢子 (spore) | 100% 睡眠 | spore / pollen / body | 有颗粒纹理的孢子慢慢扩散，沉降到目标周围 |
| 蓄力 (stockpile) | 自身防御提升 1 级；自身特防提升 1 级 | aura / dust / flex | 能量从腹部周围缓缓吸入，身体轮廓逐渐稳固 |
| 踩踏 (stomp) | 威力 65；畏缩 | anatomy / dust / body | 粗厚蹄底向下踩中，清楚蹄印压在目标下部 |
| 跺脚 (stomping_tantrum) | 威力 75 | anatomy / rock / body | 蹄底反复跺地扬起岩土，裂纹从脚边展开 |
| 岩斧 (stone_axe) | 威力 65 | anatomy / rock / body | 有棱面的石斧挥入，厚刃和木柄均可辨认 |
| 尖石攻击 (stone_edge) | 威力 100 | eruption / rock / body | 尖锐岩柱由目标脚下突起，石屑沿柱缘崩散 |
| 辅助力量 (stored_power) | 威力 20 | orb / light / body | 身体周围聚集的能量压成小球后向目标释放 |
| 山岚摔 (storm_throw) | 威力 60 | toss / mist / body | 近身借势侧向翻摔，落地尘土向一侧散开 |
| 怪力 (strength) | 威力 80 | anatomy / dust / palm | 大掌握紧发力推撞，接触面厚重压缩 |
| 吐丝 (string_shot) | 对方速度降低 2 级 | bind / thread / body | 细白丝从施术者延伸，缠住目标后收紧 |
| 麻痹粉 (stun_spore) | 100% 麻痹 | spore / pollen / body | 细黄粉末飘落，小电火花仅贴近粉末接触区 |
| 地狱翻滚 (submission) | 威力 80 | toss / dust / body | 近身抱住翻滚后着地，低矮尘土沿滚动方向散开 |
| 突袭 (sucker_punch) | 威力 70 | anatomy / smoke / punch | 侧面突然打出暗色拳头，短拳印迅速浮现 |
| 蛮力 (superpower) | 威力 120；自身攻击降低 1 级；自身防御降低 1 级 | anatomy / light / palm | 厚重拳掌猛推目标，强压缩气浪向两侧展开 |
| 超音波 (supersonic) | 混乱 | sound / mist / body | 密集窄幅空气波重复穿过，落点轻雾旋转 |
| 虚张声势 (swagger) | 混乱；对方攻击提升 2 级 | aura / smoke / flex | 身体挺起夸张发力，头部气流外扩 |
| 吞下 (swallow) | 回复 | heal / light / drink | 周围储能向口腹收回，再缓慢融入身体 |
| 天使之吻 (sweet_kiss) | 混乱 | anatomy / petal / plead | 浅粉唇印轻触后淡去，头部柔雾绕行 |
| 甜甜香气 (sweet_scent) | 对方闪避降低 2 级 | spore / pollen / body | 花粉随柔和香气缓慢飘动，包围目标 |
| 高速星星 (swift) | 威力 60 | volley / gem / body | 尖锐金色流星光质成束飞出，带短尘尾而非图标 |
| 剑舞 (swords_dance) | 自身攻击提升 2 级 | sword-dance / blade / dance | 有剑柄剑脊的实体刀剑绕自身起舞 |
| 光合作用 (synthesis) | 回复 | heal / leaf / body | 上方阳光落在舒展叶片上，再汇入身体 |
| 摇尾巴 (tail_whip) | 对方防御降低 1 级 | anatomy / mist / tail | 自身旁边实体尾巴左右摇摆，不抽打对方 |
| 猛撞 (take_down) | 威力 90 | dash / dust / body | 身体俯低猛撞，厚尘沿前进方向压开 |
| 泪眼汪汪 (tearful_look) | 对方攻击降低 1 级；对方特攻降低 1 级 | tears / droplet / cry | 双眼下挂着大泪珠，少量泪滴慢慢滑下 |
| 摇晃舞 (teeter_dance) | 混乱 | aura / mist / dance | 身体左右失衡摆动，柔雾随着舞步错位 |
| 瞬间移动 (teleport) | 脱离战斗 | warp / light / vanish | 身形收紧到一点，余光与薄雾迅速消失 |
| 大闹一番 (thrash) | 威力 120 | frenzy / dust / body | 拳掌与撞击尘团在敌人周围胡乱换位，表现暴烈挣动 |
| 打雷 (thunder) | 威力 110；30% 麻痹 | lightning / spark / body | 粗大分叉雷电从高处劈落，接地电弧向两侧散开 |
| 雷电牙 (thunder_fang) | 威力 65；10% 麻痹；畏缩 | fang / spark / body | 齿列合拢时细电弧沿齿尖跳动 |
| 雷电拳 (thunder_punch) | 威力 75；10% 麻痹 | anatomy / spark / punch | 拳印先可见，电流贴着拳骨与指节跳跃 |
| 电磁波 (thunder_wave) | 100% 麻痹 | sound / spark / body | 低能电波贴近目标，短电弧沿轮廓跳动 |
| 剧毒 (toxic) | 100% 中毒 | shroud / droplet / body | 浓稠深紫毒滴从上方滴落，黏附目标后冒薄雾 |
| 三连踢 (triple_kick) | 威力 10 | anatomy / spark / kick | 三次真实命中分别留下脚印，落点逐次上移 |
| 龙卷风 (twister) | 威力 40；畏缩 | vortex / mist / body | 小范围旋风卷住目标，尘雾从低向高盘旋 |
| 吵闹 (uproar) | 威力 90 | sound / dust / body | 不规则大声浪连续扩开，波缘随强弱抖动 |
| 真空波 (vacuum_wave) | 威力 40 | wave / mist / body | 短而紧束的空气压力波冲出，边缘细雾很快散去 |
| 毒液冲击 (venoshock) | 威力 65 | jet / droplet / body | 浓毒液流射向目标，湿润紫色液斑沿落点散开 |
| 夹住 (vice_grip) | 威力 55 | clamp / pincer / body | 两侧实体钳刃张开再夹紧，钳体有厚度 |
| 借力摔 (vital_throw) | 威力 70 | toss / dust / body | 接近后借力反向翻摔，落点尘土偏向甩出方向 |
| 水之波动 (water_pulse) | 威力 60；混乱 | sound / bubble / body | 层叠水环夹着透明水泡推进，落点水滴四散 |
| 攀瀑 (waterfall) | 威力 80；畏缩 | eruption / foam / body | 泡沫水柱从低处向上冲起，水滴随后向下回落 |
| 波动冲 (wave_crash) | 威力 120 | dash / foam / body | 厚浪包裹身体前冲，白色浪沫在接触处翻卷 |
| 鬼火 (will_o_wisp) | 100% 灼伤 | volley / flame / body | 三团冷蓝小火苗缓慢飘向目标，火舌向上跳动 |
| 缩入壳中 (withdraw) | 自身防御提升 1 级 | armor / shell / curl | 实体壳片合拢包住身体，壳纹与硬边清楚 |
| 木槌 (wood_hammer) | 威力 120 | hammer / wood / body | 粗木槌高举砸下，木纹横截面可辨，木屑从落点散出 |
| 十字剪 (x_scissor) | 威力 80 | slash / claw / body | 两片锋锐爪刃交叉切入，交点与两个方向明确 |
| 意念头锤 (zen_headbutt) | 威力 80；畏缩 | anatomy / light / head | 额部包住精神气流前顶，接触额痕后微粒外扩 |
