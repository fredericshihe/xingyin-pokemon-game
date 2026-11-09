#!/usr/bin/env node
// Local, editable vector artwork. Species use individually authored silhouettes and markings.
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { FISHING_CATCHES, FISHING_BAITS, FISHING_ROD } from '../src/game/fishingCatalog.js'

const output = resolve('public/assets/fishing')
await mkdir(output, { recursive: true })
const P = (d, fill, extra = '') => `<path d="${d}" fill="${fill}" ${extra}/>`
const E = (cx, cy, rx, ry, fill, extra = '') => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" ${extra}/>`
const C = (cx, cy, r, fill, extra = '') => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${extra}/>`
const L = (d, color = '#203743', width = 2, extra = '') => P(d, 'none', `stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${extra}`)
const outline = 'stroke="#213746" stroke-width="2.6" stroke-linejoin="round"'
const finOutline = 'stroke="#294350" stroke-width="2" stroke-linejoin="round"'
const star = (x, y, size, color = '#fff0b9') => P(`M${x} ${y-size} Q${x+1} ${y-1} ${x+size} ${y} Q${x+1} ${y+1} ${x} ${y+size} Q${x-1} ${y+1} ${x-size} ${y} Q${x-1} ${y-1} ${x} ${y-size}Z`, color)
const eye = (x, y, r = 5, color = '#fff8e8') => C(x, y, r, color, 'stroke="#243d48" stroke-width="1.7"') + C(x+1, y-.3, r*.54, '#112c3a') + C(x+1.6, y-1.7, 1.1, '#fff')
const gradient = (id, light, mid, dark) => `<linearGradient id="${id}" x1="0" y1="0" x2=".7" y2="1"><stop stop-color="${light}"/><stop offset=".47" stop-color="${mid}"/><stop offset="1" stop-color="${dark}"/></linearGradient>`
function document(id, name, colors, art, glow = false) {
  const [light, mid, dark] = colors
  return `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192" role="img" aria-label="${name}"><title>${name}</title><defs>${gradient('body', light, mid, dark)}${gradient('fin', mid, dark, '#243d53')}${gradient('gold', '#fff3b0', '#e2b951', '#997133')}${gradient('metal', '#ecf9ff', '#9ec9d8', '#557d9b')}<radialGradient id="aura"><stop stop-color="${mid}" stop-opacity=".27"/><stop offset="1" stop-color="${mid}" stop-opacity="0"/></radialGradient><filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#112f43" flood-opacity=".16"/></filter></defs>${glow ? C(96,93,81,'url(#aura)') : ''}${E(96,155,62,8,'#164657','opacity=".09"')}<g filter="url(#shadow)">${art}</g></svg>\n`
}

// Body outlines, tail outlines and dorsal silhouettes differ by species, not only colour.
const fish = {
  c01: { c:['#eeeac5','#a1b8a0','#506d67'], body:'M48 99Q70 74 123 84Q144 87 157 100Q141 117 116 116Q68 119 48 105Z', tail:'M52 96L23 82L29 101L22 119L53 108Z', dorsal:'M72 84L82 65L109 80Z', belly:'M81 114L87 132L103 115Z', eye:[143,99,4], lines:['M67 95Q101 88 133 99','M69 103Q103 98 132 105'], dots:[[74,105,1.7],[87,107,1.7],[100,108,1.7],[115,107,1.7]], gill:'M134 91Q128 100 134 109' },
  c02: { c:['#f6e2b6','#c4ba89','#717e62'], body:'M48 100Q64 61 107 65Q143 68 154 96Q155 117 121 128Q76 139 48 104Z', tail:'M52 94L23 75L32 100L23 126L54 110Z', dorsal:'M68 77L80 52L101 57L117 69Z', belly:'M83 125L93 142L113 128Z', eye:[142,94,5], lines:['M65 93Q95 78 122 84','M65 101Q97 89 124 96','M65 111Q95 103 126 107'], gill:'M128 81Q116 101 129 116' },
  c03: { c:['#edcf9f','#a28053','#584d40'], body:'M27 118Q60 90 100 93Q147 86 165 103Q159 122 128 121Q92 112 57 128L30 133Z', tail:'M36 119Q19 104 21 136L37 130Z', dorsal:'M88 95Q101 75 117 93Z', belly:'M112 119L127 136L132 119Z', eye:[153,103,4], lines:['M45 117Q99 99 144 105'], dots:[[68,111,3],[83,107,2.5],[103,105,3],[124,105,2.5]], gill:'M140 102Q136 112 142 118', whisker:'M160 111Q174 115 166 125M158 114Q162 127 153 130' },
  c06: { c:['#eef9e9','#9bc5c6','#466f8c'], body:'M46 95Q91 71 139 84L166 98L148 115Q91 126 46 102Z', tail:'M50 93L23 75L32 97L20 119L51 104Z', dorsal:'M87 82L95 62L111 79Z', belly:'M95 120L105 137L115 116Z', eye:[151,96,4.5], lines:['M65 94Q105 88 140 96','M64 102Q103 99 141 105'], dots:[[76,98,1.5],[86,97,1.5],[96,97,1.5],[106,98,1.5],[116,99,1.5]], gill:'M135 87Q128 99 136 111' },
  c07: { c:['#f3fff9','#b1d9db','#578696'], body:'M44 101Q82 80 121 91L169 103L140 114Q88 126 44 108Z', tail:'M48 99L20 85L29 105L19 126L49 110Z', dorsal:'M83 89L88 72L103 90Z', belly:'M102 119L113 130L125 116Z', eye:[156,102,4], lines:['M57 102Q112 91 148 103'], gill:'M145 97Q138 105 145 112' },
  c10: { c:['#f8feff','#b3d4d8','#5d8394'], body:'M47 99Q71 77 107 81Q144 83 164 101Q144 119 114 120Q68 123 47 104Z', tail:'M50 96L22 82L28 101L21 121L52 107Z', dorsal:'M74 83L81 64L99 63L108 82Z', belly:'M99 119L112 136L122 116Z', eye:[148,98,4.7], lines:['M63 95Q106 85 137 95','M61 105Q106 104 138 107'], gill:'M136 88Q127 104 137 115' },
  u01: { c:['#cfdfba','#669f83','#2d5c56'], body:'M47 99Q69 57 116 72Q146 80 160 101Q142 126 109 128Q70 126 47 106Z', tail:'M54 94L22 75L30 99L19 129L55 111Z', dorsal:'M63 81L77 50L93 49L124 76Z', belly:'M91 127L111 146L122 125Z', eye:[145,99,5], lines:['M72 83L74 120','M83 78L85 125','M96 77L98 127','M108 79L110 126','M121 83L123 122'], gill:'M132 89Q121 103 134 118', whisker:'M155 108Q164 116 168 110' },
  u02: { c:['#f7e9b9','#c8b187','#726b58'], body:'M45 102Q60 64 103 61Q143 61 157 99Q146 133 103 133Q64 132 45 107Z', tail:'M51 94L19 82L27 105L20 126L54 112Z', dorsal:'M68 73L70 51L101 43L119 65Z', belly:'M81 131L94 148L115 132Z', eye:[142,94,5.2], lines:['M71 79Q88 86 75 99Q64 111 82 124','M97 73Q116 86 99 103Q87 113 104 127'], gill:'M129 77Q115 101 130 122' },
  u03: { c:['#ffe69c','#c29b3a','#645922'], body:'M29 127Q64 141 64 111Q56 69 86 66Q113 57 119 87Q125 109 151 95Q170 91 173 103Q172 119 152 122Q112 139 101 100Q98 81 84 85Q75 88 83 118Q84 155 39 149L22 143Z', tail:'M33 129L15 120L18 149L35 145Z', dorsal:'M74 80Q92 49 112 69L122 94L114 98Q105 66 89 73Z', belly:'M144 120L147 137L157 121Z', eye:[161,105,4], lines:['M38 139Q78 157 73 110Q62 76 86 75Q111 72 110 98Q122 131 155 111'], gill:'M150 107L149 118' },
  u04: { c:['#deebaa','#86a678','#3c665f'], body:'M43 102Q61 65 114 77Q146 82 166 101L151 119Q96 135 43 111Z', tail:'M49 97L20 80L29 105L19 132L51 114Z', dorsal:'M67 80L73 55L87 70L95 50L108 74L119 61L130 82Z', belly:'M102 127L117 142L134 123Z', eye:[151,99,5], lines:['M68 83L71 119','M86 79L89 124','M105 80L108 125','M124 85L127 121'], gill:'M136 88Q124 105 137 117' },
  u07: { c:['#e5f2ee','#81b6b4','#355568'], body:'M42 99Q78 67 127 82Q151 87 168 103L149 121Q99 134 42 108Z', tail:'M49 95L21 73L29 102L20 129L50 113Z', dorsal:'M71 80L75 60L86 76L96 54L109 78L120 63L132 84Z', belly:'M105 126L120 143L135 121Z', eye:[153,100,5.2], lines:['M64 100Q110 87 143 99'], gill:'M138 89Q126 103 139 118' },
  u08: { c:['#c9f1e7','#4ea6af','#244d68'], body:'M45 102Q84 70 127 89L169 104L142 122Q91 132 45 108Z', tail:'M50 99L19 78L29 104L18 130L53 111Z', dorsal:'M74 86L82 61L92 68L103 84Z', belly:'M106 126L119 141L131 122Z', eye:[154,101,4.8], lines:['M67 95Q74 83 81 92L84 106','M86 91Q93 79 100 91L103 107','M104 93Q111 85 118 94L121 107','M123 97Q130 89 136 98'], gill:'M141 94Q135 105 142 117' },
  r01: { c:['#e0faff','#86cadd','#386790'], body:'M46 99Q69 55 115 70Q150 79 163 102Q140 131 106 132Q66 131 46 107Z', tail:'M53 92L21 71L28 100L17 133L55 112Z', dorsal:'M65 79L78 47L108 51L128 78Z', belly:'M82 127L101 147L118 130Z', eye:[147,98,5.4], lines:['M72 90L79 82L86 89L79 98Z','M89 90L97 80L105 91L97 101Z','M76 111L84 103L92 111L84 120Z','M95 111L105 102L115 111L105 124Z','M113 93L121 87L129 96L121 104Z'], gill:'M135 86Q122 105 136 121' },
  r02: { c:['#f1dfa7','#bab166','#506851'], body:'M42 102Q67 70 109 75Q150 74 169 103L153 123Q94 138 42 111Z', tail:'M49 96L19 77L28 104L20 133L52 113Z', dorsal:'M64 82L67 56L76 69L83 53L94 71L105 58L116 76L126 64L137 82Z', belly:'M95 129L110 146L131 126Z', eye:[153,98,5], dots:[[66,100,4],[80,89,3.5],[88,111,5],[104,91,4.3],[118,112,3.5],[131,94,3],[110,125,2.8]], gill:'M140 88Q128 104 141 121' },
  r03: { c:['#f1faff','#8dc0d3','#466590'], body:'M22 126Q42 146 72 127Q94 106 86 82Q88 63 111 69Q128 75 124 99Q135 116 161 98Q174 97 176 109Q167 130 139 130Q108 129 108 105Q112 90 104 87Q96 86 102 111Q89 153 49 152L23 141Z', tail:'M31 129L12 123L17 146L34 143Z', dorsal:'M76 96Q78 56 110 57Q139 62 135 101L126 110Q130 72 111 70Q89 60 86 91Z', belly:'M141 130L150 145L160 126Z', eye:[164,109,4.4], lines:['M29 137Q67 161 90 112Q97 102 94 85Q93 74 107 77Q121 82 116 103Q121 131 156 116'], gill:'M151 111L151 122' },
  r06: { c:['#fad6ac','#d59b78','#805b65'], body:'M38 99Q54 64 108 71Q147 74 170 102Q152 133 99 134Q53 133 38 107Z', tail:'M46 93L18 83L21 104L18 126L47 115Z', dorsal:'M53 81L58 63L67 70L74 54L85 69L96 53L107 71L119 58L131 77Z', belly:'M83 131L93 149L119 132Z', eye:[153,99,5.5], dots:[[61,95,5],[72,115,4],[87,87,4],[100,108,6],[118,88,3.8],[125,123,4],[139,111,3.5]], gill:'M136 83Q125 102 139 124' },
  r07: { c:['#fff8dc','#c6d7d0','#698b99'], body:'M46 103Q60 57 108 56Q148 61 163 99Q149 140 108 139Q64 137 46 111Z', tail:'M55 97L23 71L30 105L21 137L55 116Z', dorsal:'M69 74L87 42L100 54L113 42L131 67Z', belly:'M93 136L108 153L128 134Z', eye:[145,92,5.5], lines:['M78 84Q68 110 89 123','M95 73Q78 113 110 130','M113 75Q101 111 127 120'], gill:'M132 74Q116 101 131 126' },
  r08: { c:['#d9f7f4','#6ba5b2','#355577'], body:'M39 102Q76 61 127 79Q155 85 172 103L151 126Q100 139 39 111Z', tail:'M49 96L19 70L28 102L17 137L50 116Z', dorsal:'M66 80L73 53L83 72L93 47L107 74L117 58L132 80Z', belly:'M101 132L119 147L137 125Z', eye:[156,100,5.2], lines:['M78 89Q62 100 80 117','M98 82Q80 101 100 124','M119 84Q100 103 120 124'], gill:'M142 88Q128 107 141 124' },
  e01: { c:['#e5e6ff','#b8aadf','#615d9d'], body:'M26 137Q61 150 82 127Q94 113 84 91Q72 58 105 63Q132 60 134 93Q137 118 162 105Q174 99 178 110Q172 130 147 134Q116 135 116 104Q120 79 105 81Q91 81 101 110Q101 149 60 155L27 151Z', tail:'M36 135L16 118L14 150L36 150Z', dorsal:'M75 94Q49 52 86 45Q138 28 151 83L143 111L131 97Q133 61 105 62Q71 58 83 88Z', belly:'M118 126Q113 153 146 150L163 127Z', eye:[165,116,4.8], lines:['M85 66Q109 47 134 75','M32 145Q69 157 89 123Q97 108 92 91Q83 72 104 72Q128 68 125 97Q122 131 158 119'], gill:'M150 117L150 127', lunar:true },
  e05: { c:['#d3f4ed','#4a9eb2','#254969'], body:'M38 102Q86 58 133 76Q155 83 175 103L155 124Q93 149 38 110Z', tail:'M48 99L17 65L23 102L15 142L49 112Z', dorsal:'M85 75L92 39Q98 38 111 73Z', belly:'M104 134L119 151L131 130Z', eye:[158,100,5], lines:['M119 77L127 62L132 81M129 81L138 69L141 86M137 86L146 78L148 91','M130 126L137 139L141 125M140 122L148 132L151 120'], dots:[[67,101,2.8],[83,90,2.2],[90,108,2.6],[109,101,2.4]], gill:'M143 87Q135 103 145 121' },
  e06: { c:['#94c8e2','#436588','#1f354f'], body:'M40 106Q49 58 97 65Q130 65 157 109L169 116L151 139Q120 151 78 140Q45 129 40 106Z', tail:'M48 98L17 80L21 107L16 132L51 120Z', dorsal:'M58 79L65 50L81 66L99 52L115 70Z', belly:'M90 141L104 157L124 143Z', eye:[137,100,8], lines:['M145 119L150 112L155 123L160 115','M54 105Q76 118 97 123'], gill:'M119 86Q102 107 117 130', lure:true },
  l01: { c:['#fff2b1','#e6b74f','#a36639'], body:'M43 98Q65 49 114 63Q151 72 171 105Q147 139 102 138Q62 135 43 107Z', tail:'M54 92L24 56L23 99L13 144Q36 139 55 117Z', dorsal:'M62 76L76 35L91 48L103 29L124 47L139 76Z', belly:'M74 132L91 158L116 138Z', eye:[151,98,6], lines:['M70 85L82 72L95 84L83 101Z','M94 84L108 69L122 86L109 103Z','M73 112L87 98L103 114L89 131Z','M101 115L116 101L130 116L115 134Z'], gill:'M139 82Q124 103 141 126', royal:true },
  l02: { c:['#f4fbff','#a9d4ec','#5275ad'], body:'M37 100Q74 60 124 76Q153 84 172 102L153 125Q93 145 37 111Z', tail:'M47 94L17 63L23 103L14 144L48 116Z', dorsal:'M70 79L82 42L109 49L124 76Z', belly:'M88 136L110 156L131 130Z', eye:[155,97,5.7], lines:['M53 103Q105 86 142 102'], dots:[[69,91,2],[87,84,2],[93,105,2],[110,91,2],[116,117,2],[69,117,2]], gill:'M141 88Q128 107 143 124', stars:true },
  l04: { c:['#ebf6e7','#78c0b3','#536d99'], body:'M44 103Q61 62 112 66Q146 66 169 99Q148 137 107 138Q60 135 44 111Z', tail:'M52 97Q37 45 15 63L25 101Q15 121 22 148Q43 149 56 118Z', dorsal:'M61 82Q62 34 91 33L113 50L125 33L137 71Z', belly:'M79 133Q76 157 100 157L127 137Z', eye:[148,94,5.8], lines:['M71 82Q60 109 83 126','M93 73Q77 110 107 131','M116 75Q99 108 132 122'], gill:'M134 76Q118 102 134 127', rainbow:true }
}

function drawFish(id, f) {
  let art = P(f.tail,'url(#fin)',finOutline)+P(f.dorsal,'url(#fin)',finOutline)+P(f.belly,'url(#fin)',finOutline)
  art += P(f.body,'url(#body)',outline)
  art += f.lines?.map(d=>L(d, f.rainbow?'#efe6d1':f.c[2], 2, 'opacity=".6"')).join('') || ''
  art += f.dots?.map(([x,y,r])=>C(x,y,r,f.stars?'#f9f4d7':f.c[2], 'opacity=".7"')).join('') || ''
  art += L(f.gill, '#294853',2.1)+eye(...f.eye)
  art += L(`M${f.eye[0]+9} ${f.eye[1]+10}l5 -1`, '#344c54',1.7)
  art += P(`M${f.eye[0]-29} ${f.eye[1]+8}q-14 12 -21 5q4 -13 21 -14Z`,f.c[1],finOutline)
  if(f.whisker) art+=L(f.whisker,'#615339',1.6)
  if(f.lunar) art+=P('M57 55Q58 36 74 38Q59 48 71 62Q64 66 57 55Z','#f5edff')+star(146,65,5,'#ddd9ff')
  if(f.lure) art+=L('M104 69Q113 28 149 46Q159 53 158 66','#80b9cd',3)+C(158,68,8,'#b8ffff','stroke="#dfffff" stroke-width="2"')
  if(f.royal) art+=P('M132 68L132 52L140 58L147 44L155 58L163 52L160 70Z','url(#gold)',outline)+C(147,62,3.3,'#ef9263')+star(49,59,5)
  if(f.stars) art+=star(77,99,4)+star(112,109,4)+star(117,58,7,'#d3f2ff')
  if(f.rainbow) art+=L('M69 79Q86 55 109 59','#e6a9b2',4)+L('M65 74Q82 47 103 47','#d3be74',3)+L('M31 75Q37 97 27 132','#a99ae5',3)+star(144,59,6,'#d6f8e6')
  art+=L(`M${f.eye[0]-65} ${f.eye[1]-10}q15 -8 25 -5`,'#fff',2,'opacity=".5"')
  return document(id,FISHING_CATCHES[id].name,f.c,art,id.startsWith('l')||id.startsWith('e'))
}

const shrimp = {
  c04: { c:['#ffeac9','#e5b897','#b07870'], curve:'M126 55Q72 40 56 78Q38 116 78 138L119 139L119 126L85 125Q58 115 69 85Q83 59 117 70Z', tail:'M116 127L141 116L143 132L134 145L115 141Z', head:[120,65], segments:[[69,82,82,91],[63,100,78,102],[70,118,84,112],[89,130,94,118]], whiskers:'M125 62Q153 28 169 43M126 64Q149 44 171 61', feet:'M73 108L53 132M85 118L71 146M98 126L92 149', claw:false },
  c08: { c:['#f8f1d7','#ccbfa3','#867f69'], curve:'M131 57Q81 33 62 72Q43 110 75 131L112 143L124 132L86 119Q66 111 74 85Q82 62 121 72Z', tail:'M113 131L139 126L150 142L130 155L116 145Z', head:[125,69], segments:[[67,78,80,87],[65,94,80,98],[71,113,86,108],[87,126,97,114]], whiskers:'M129 63Q143 31 160 35M134 67Q153 55 177 57', feet:'M79 108L63 133M90 118L83 145M104 128L103 152', claw:false },
  u05: { c:['#f4dfc2','#c98f77','#815b60'], curve:'M126 52Q79 40 62 70Q44 97 61 121Q76 146 119 140L121 126Q83 130 74 113Q62 91 77 73Q94 56 119 67Z', tail:'M114 127L143 115L146 133L130 152L116 144Z', head:[123,62], segments:[[66,72,80,82],[60,92,75,95],[64,111,82,104],[79,128,92,114]], whiskers:'M128 57Q155 19 177 37M130 61Q161 42 178 53', feet:'M71 104L49 137M87 119L72 150M101 128L99 153', claw:true },
  u10: { c:['#fff1c5','#d8a157','#765b55'], curve:'M131 55Q89 30 66 61Q42 95 62 124Q76 145 116 140L122 126Q92 130 78 113Q64 94 80 72Q94 53 121 70Z', tail:'M116 130L142 119L155 137L140 155L114 145Z', head:[128,66], segments:[[69,63,83,77],[60,83,76,88],[62,105,79,100],[74,124,88,112],[94,137,104,124]], whiskers:'M133 61Q152 23 172 32M136 66Q159 43 179 45', feet:'M70 103L47 133M84 121L74 151M102 133L105 155', claw:false, bands:true },
  r04: { c:['#d7f7fd','#62b5d1','#4a639a'], curve:'M130 50Q84 34 61 69Q43 101 64 128Q82 149 121 138L121 124Q92 131 78 115Q60 94 78 75Q91 56 120 66Z', tail:'M115 124L145 111L157 129L143 151L116 143Z', head:[126,61], segments:[[66,71,82,80],[61,90,78,93],[67,111,83,103],[85,130,94,116]], whiskers:'M131 56Q153 17 175 30M134 60Q155 39 178 42', feet:'M72 109L49 137M88 124L76 151M105 133L108 153', claw:true, crystal:true },
  r10: { c:['#ffe3ce','#dc9c88','#a55a67'], curve:'M128 53Q86 31 63 68Q41 102 66 128Q87 149 119 138L122 123Q91 134 78 111Q65 94 82 72Q97 54 119 68Z', tail:'M116 125L143 106L158 126L147 151L119 144Z', head:[125,63], segments:[[69,68,83,79],[62,89,78,90],[70,110,85,103],[87,128,98,116]], whiskers:'M128 58Q147 20 168 29M132 61Q158 44 175 49', feet:'M74 109L55 137M90 122L82 151M106 130L112 151', claw:false, redTail:true },
  e02: { c:['#efd9fb','#b67bcc','#61518b'], curve:'M113 58Q78 47 60 80Q45 119 83 139L119 138L122 120Q92 124 80 107Q72 90 87 75L120 76Z', tail:'M116 122L146 119L155 142L135 155L115 140Z', head:[122,69], segments:[[68,82,82,87],[67,101,83,100],[82,120,95,111],[99,132,105,118]], whiskers:'M126 64Q134 27 161 30M130 70Q157 45 179 56', feet:'M78 105L55 132M90 120L84 149M107 131L111 153', claw:true, crystal:true, giantClaw:true },
  e04: { c:['#d2f3d4','#68b996','#31706e'], curve:'M116 62Q85 46 66 70Q48 99 67 126Q83 149 119 139L126 120Q94 130 83 111Q70 92 88 78L127 81Z', tail:'M118 122L148 115L162 138L143 159L116 143Z', head:[126,74], segments:[[72,73,86,83],[64,94,83,96],[70,113,87,105],[88,132,101,117]], whiskers:'M131 67Q149 18 176 27M137 76Q165 45 181 56', feet:'M75 111L51 143M94 126L82 154M108 136L112 159', claw:true, giantClaw:true, lobster:true }
}

function drawShrimp(id, s) {
  const art = []
  art.push(P(s.tail, 'url(#fin)', finOutline), P(s.curve, 'url(#body)', outline))
  for (const [x1,y1,x2,y2] of (s.segments || [])) art.push(L(`M${x1} ${y1}Q${(x1+x2)/2+3} ${(y1+y2)/2-4} ${x2} ${y2}`, s.c[2], 2))
  art.push(E(s.head[0], s.head[1], 18, 15, s.c[1], finOutline), eye(s.head[0]+8, s.head[1]-3, 4.2))
  art.push(L(s.whiskers, '#705a58', 1.8), L(s.feet, '#7b5b5f', 2))
  if (s.claw) art.push(P('M105 136Q126 119 144 130L153 145Q132 155 112 147Z', 'url(#gold)', finOutline), P('M131 143Q144 129 166 139L174 152Q151 160 135 151Z', 'url(#gold)', finOutline))
  if (s.giantClaw) art.push(P('M129 141Q146 113 166 126L181 147Q158 164 138 153Z', '#bfa7e9', outline))
  if (s.crystal) for (const [x,y] of [[91,87],[108,102],[78,111]]) art.push(P(`M${x} ${y-7}L${x+6} ${y}L${x} ${y+9}L${x-6} ${y}Z`, '#eff7ff', 'stroke="#7f84cc" stroke-width="1.5"'))
  if (s.bands) for (const [x,y] of [[71,76],[65,96],[76,117]]) art.push(L(`M${x-5} ${y-7}Q${x+5} ${y} ${x-1} ${y+8}`, '#9f4e57', 4))
  if (s.redTail) art.push(L('M120 127L145 114M126 140L150 128', '#bf5860', 4))
  if (s.lobster) art.push(P('M82 88Q53 65 37 81L51 96Q65 88 80 100Z', '#67bd9b', finOutline))
  return document(id,FISHING_CATCHES[id].name,s.c,art.join(''),id.startsWith('e')||id.startsWith('l'))
}

const crabColors = {
  c05:['#f3e0b0','#c6956f','#724e59'], c09:['#f7dfb7','#d39b6a','#814d4d'], u06:['#d4e8cf','#5e9c7c','#315d5d'], u09:['#f4d3ab','#cf825e','#713f4d'],
  r05:['#ffd5c8','#ca6575','#673b5e'], r09:['#dceaf5','#7199c2','#394a76'], e03:['#fff0b2','#d59d4d','#774c37'], l03:['#ffe0a5','#db8a3e','#67444a']
}
function drawCrab(id, colors) {
  const [light,mid,dark]=colors
  const shapes = {
    c05: { shell:'M59 92Q64 68 92 67Q124 66 133 92L134 114Q95 138 59 114Z', left:'M52 98Q25 104 23 82L29 63L36 78L47 63L54 86Z', right:'M138 94Q165 103 173 81L167 63L158 79L148 66L137 83Z', legs:'M60 106L38 118L31 138M62 116L49 141L56 149M132 105L153 119L162 138M128 117L144 140L139 151', pattern:'M75 87Q96 76 117 87M74 112Q96 119 116 111' },
    c09: { shell:'M54 93Q67 73 96 77Q129 73 140 92L129 115Q99 125 65 113Z', left:'M53 93Q27 100 19 86L22 69L34 79L43 70L54 82Z', right:'M142 88Q169 91 171 75L167 58L158 70L146 63L138 75Z', legs:'M58 101L31 107L22 125M65 113L42 127L38 143M137 101L161 109L175 130M127 114L151 128L155 145', pattern:'M68 94L77 87L85 95M94 98L103 86L111 98M116 97L124 88L130 97' },
    u06: { shell:'M57 87Q60 61 98 63Q129 65 137 89L137 113L119 130L74 130L57 113Z', left:'M51 90Q23 88 20 65L29 44L37 62L51 48L60 70Z', right:'M140 88Q167 91 175 68L165 49L157 64L143 50L134 72Z', legs:'M59 104L35 117L28 144M65 117L50 140L57 157M137 103L162 116L170 142M130 119L144 140L136 158', pattern:'M76 86Q95 68 117 87L119 110Q96 124 73 108Z' },
    u09: { shell:'M46 91L62 75L93 68L130 75L146 92L132 116L60 117Z', left:'M48 84Q21 89 16 67L27 52L32 67L48 57L56 73Z', right:'M145 82Q172 88 178 65L167 49L160 65L144 55L137 72Z', legs:'M54 104L31 111L17 129M65 116L43 133L30 149M142 103L163 113L178 132M130 116L153 136L160 151', pattern:'M63 91L76 80L84 95M92 82L104 96L113 83M119 99L133 91' },
    r05: { shell:'M56 86Q65 60 96 60Q130 61 137 88L135 114L119 131L76 133L57 113Z', left:'M50 90Q14 92 16 58L31 39L33 62L51 44L 60 68Z', right:'M138 85Q173 93 178 62L168 44L158  60L146 45L133 68Z', legs:'M58 103L36 119L28 149M65 117L48 144L56 160M137 104L161 122L166 148M130 117L146 140L139 159', pattern:'M76 82L91 74L109 77L121 92L107 105L84 102Z' },
    r09: { shell:'M43 94L 60 73L94 65L128 73L149 93L130 119L61 119Z', left:'M49 81Q21 89 15 63L26 47L31 63L48 53L58 69Z', right:'M145 81Q173 88 180 63L169 45L160 62L145 51L134 69Z', legs:'M51 104L26 113L16 138M66 116L39 137L30 157M145 103L168 115L179 139M129 117L154 139L161 157', pattern:'M66 89L78 83L90 91L103 81L121 90M77 108L86 98L97 109L110 99L122 107' },
    e03: { shell:'M48 84Q59 49 96 51Q134 50 145 83L143 117L121 139L74 139L49 116Z', left:'M47 86Q9 87 14 48L31 29L36 53L55 34L64 64Z', right:'M144 86Q182 84 180 47L161 28L155 52L138 32L129 65Z', legs:'M53 103L28 122L22 158M66 125L43 151L51 168M142 105L168 122L172 157M128 126L150 152L141 168', pattern:'M67 79L83 64L109 65L129 83L120 112L96 125L73 109Z' },
    l03: { shell:'M45 86Q56 48 95 46Q137 48 149 85L144 119L121 144L 70 144L47 119Z', left:'M43 90Q8 92 10  50L25 29L34 49L52 28L 60  60Z', right:'M147 86Q186 89 182 51L168 25L157 48L142 27L131 62Z', legs:'M51 108L23 130L18 164M67 131L42 155L49 171M144 109L169 131L176 163M128 132L153 154L145 172', pattern:'M 60 90Q 90 57 132 90L122 116L95 133L70 115Z' }
  }
  const s=shapes[id]
  let art=L(s.legs,dark,5)+P(s.left,'url(#body)',outline)+P(s.right,'url(#body)',outline)+L('M51 82L68 90M141 81L126 91',dark,9)
  art+=P(s.shell,'url(#body)',outline)+L(s.pattern,light,2.7,'opacity=".8"')+eye(80,87,5)+eye(111,87,5)+L('M85 113Q96 120 107 113',dark,2)
  if(id==='l03') art+=P('M69 68L64 35L80 46L95 23L111 45L130 34L121 69Z','url(#gold)',outline)+C(95,48,6,'#89dde4',finOutline)+star(143,37,7)
  if(id==='r09') art+=star(96,102,8,'#e7fcff')+C(68,99,2,'#effbff')+C(125,99,2,'#effbff')
  if(id==='e03') art+=P('M81 100L96 84L111 100L96 118Z','#f7bd58',finOutline)+L('M96 87L96 114','#fff1b9',2)
  if(id==='c09') art+=C(76,101,2.4,dark)+C(106,96,2.8,dark)+C(118,106,2.2,dark)
  art+=L('M72 78Q86 68 106 73','#fff',2,'opacity=".6"')
  return document(id,FISHING_CATCHES[id].name,colors,art,id.startsWith('e')||id.startsWith('l'))
}

function drawTreasure(id) {
  const item = FISHING_CATCHES[id]
  const index = Number(id.slice(1))
  const colors = index <= 2 ? ['#f6de9b','#ba7b42','#704b3e'] : index <= 4 ? ['#e8fdff','#9fcedb','#4f7691'] : ['#ffe6a5','#d39a4c','#734657']
  let art
  if (id === 't01') art = E(96,112,51,33,'#a46b46',outline)+E(96,106,51,33,'url(#gold)',outline)+E(96,106,36,22,'none','stroke="#a97739" stroke-width="2"')+L('M79 109L95 93L111 107L95 119Z','#87532e',3)+C(65,103,4,'#68a58b')+C(117,119,3,'#65a78f')
  else if(id==='t05') art = P('M63 57L118 47L148 84L139 128L88 149L49 111Z','url(#gold)',outline)+P('M74 76L111 67L127 89L119 116L90 128L70 105Z','#84694c',finOutline)+P('M90 82L106 79L114 95L105 112L91 108L83 95Z','#81c8c1',outline)+L('M56 91L69 91M127 91L141 91M94 51L96 66M93 132L95 146','#fff0ab',2)
  else if (id === 't02') art = P('M42 128Q29 70 68 53Q86 40 95 62Q109 39 127 54Q160 73 150 128L107 144L83 143Z','#ddb7bb',outline)+L('M96 67L96 135M66 63L88 135M124 63L104 135M49 85L 80 133M140 85L112 133','#fff4dd',3)+P('M43 124Q89 108 151 123L145 135Q96 152 50 136Z','#9fc4c7',finOutline)
  else if(id==='t04') art = P('M43 121Q89 95 150 122L145 138Q94 159 48 139Z','#cdb6d1',outline)+P('M43 122Q40 66 74 54L96 82L118 53Q153  70 150 122Q96 105 43 122Z','#e7cdd8',outline)+C(96,109,25,'url(#metal)',outline)+C(88,99,9,'#fffdf5','opacity=".85"')+star(127,90,5,'#fff')
  else if (id === 't03') art = L('M54 88Q95 61 137 86L127 120Q94 133 62 116Z', '#dcecff', 11)+C(97,95,24,'url(#gold)',outline)+C(97,95,11,'#7d5d53',outline)+L('M97 70L97 121','#73505a',3)
  else if (id === 't06') art = C(96,103,41,'url(#gold)',outline)+C(96,103,31,'#f5edce',outline)+L('M96 75L96 82M68 103L76 103M96 125L96 132M117 103L125 103','#536878',3)+L('M96 86L96 103L110 113','#536878',3)+L('M133 81Q164 58 151 40Q133 22 116 48','#bd8c42',4)+C(97,54,10,'none','stroke="#9d703c" stroke-width="5"')+P('M91 52L92 43L102 43L103 52Z','url(#gold)',finOutline)
  else if(id==='t07') art = P('M42 88L96  70L150 87L147 137L96 155L45 137Z','#b27557',outline)+P('M41 88Q42 45 96 48Q148 45 151 87L96 106Z','#e7b485',outline)+L('M 60 80L60 139M132 81L132 139','#efd083',6)+P('M88 102L103 102L105 126L88 127Z','url(#gold)',outline)+L('M96 111L96 119','#705448',3)+L('M57 63L49 45L58 30M58 47L 70 38M133 65L145  40L137 31','#eab7ab',5)
  else art = P('M96 29L117 69L159 96L117 119L96 161L74 119L 30 96L74 72Z','url(#gold)',outline)+P('M96 57L119 96L96 135L73 96Z','#709fb8',outline)+P('M96 70L109 97L96 119L83 97Z','#b2e5ef',finOutline)+L('M96 70L96 119','#e2fdff',2)+star(147,43,7)+star(45,142,5)
  return document(id,item.name,colors,art,true)
}

function drawJunk(id) {
  const item = FISHING_CATCHES[id]
  const art = id === 'j01'
    ? `${P('M63 41L111 45L105 98Q131 99 147 124L149 139L48 139L 40 127L57 113Z','#77685e',outline)}${P('M62 41L113 44L111 59L 60 56Z','#ae9680',outline)}${L('M71 76L103  80M68 88L102 92M64 102L98 104','#d4bca0',3)}${P('M44 132L149 132L151 143L46 146Z','#4d5555',outline)}`
    : id === 'j02'
      ? `${C(98,45,11,'none','stroke="#799aa8" stroke-width="7"')}${L('M98 57L98 118Q94 153  60 139Q 40 123 52 100L65 91','#b4d5df',9)}${P('M60 100L64 83L77  90Z','#698895',outline)}${L('M103 104L 90 111M98 109L105 115','#69818e',2)}`
      : `${L('M97 146Q74 128 85 94Q94 69 78 47M99 145Q118 128 111 97Q105 72 125 43M91 147Q58 121 49  80M109 146Q140 113 146 75','#44866c',5)}${P('M82 108Q 40 94 39  60Q70 60 82 108Z','#78b994',outline)}${P('M111 112Q125 69 158 53Q165 87 111 112Z','#83c9a3',outline)}${P('M86  80Q 60 46 68 32Q94 44 86  80Z','#9cd9b4',outline)}${L('M52 74L 70 91M146 70L124 96','#bceaca',2)}`
  return document(id,item.name,['#e1efdc','#78aa91','#3d6964'],art)
}

const generated = new Set()
for (const [id, item] of Object.entries(FISHING_CATCHES)) {
  const art = fish[id] ? drawFish(id, fish[id]) : shrimp[id] ? drawShrimp(id, shrimp[id]) : crabColors[id] ? drawCrab(id, crabColors[id]) : id.startsWith('t') ? drawTreasure(id) : drawJunk(id)
  await writeFile(resolve(output, `${id}.svg`), art)
  generated.add(id)
}
const equipment = {
  fishing_rod: document('fishing_rod', FISHING_ROD.name, ['#dcb877','#8f5e3b','#483d3e'], `${P('M46 148L69 32L76 34L56 150Z','#7c4f37',outline)}${L('M73 39Q118 34 147 70','#a6794e',5)}${C(148,72,11,'#e6f5ed',outline)}${L('M148 82L148 122','#cce8eb',2)}${C(148,128,9,'#8dbfcd',outline)}`),
  fish_basket: document('fish_basket', '鱼篓', ['#eac18b','#a9784f','#57483e'], `${P('M40 76Q96 56 152 76L142 138Q96 157 50 138Z','#b77b4d',outline)}${L('M47 89Q96 104 145 89M45 108Q96 123 147 108M52 128Q96 143 140 128','#f0ca87',4)}${L('M69 72Q71 40 96 36Q122 41 124 72','#795344',7)}`)
}
const baitArt = {
  common:{ colors:['#e5c7a9','#ca8c6c','#775e55'], art:P('M47 80L137 80L145 140Q96 155  40 140Z','#94775c',outline)+E(92,80,45,14,'#d6b796',outline)+L('M 60  80Q60 59 76 58Q100 60 93 78Q87 94 111 95Q128  90 121  70','#dd9b86',11)+L('M68 65L73 70M84 64L 80 74M99 88L102 96M114 85L124 86','#bd776b',2) },
  aroma:{ colors:['#f5e4ad','#ceab65','#8b6845'], art:P('M51 53L137 53L145 143Q95 162 47 143Z','#d1ac70',outline)+P('M51 53L67 36L123 36L137 53L124 70L66 70Z','#efdaa1',outline)+E(96,114,29,26,'#faf0c1',finOutline)+P('M82  90Q96 74 110 91L109 132L83 132Z','#b89b52',finOutline)+L('M96 85L96 136M95 99L82 94M98 108L111 100M95 119L81 111','#ede4ad',3)+L('M62 25Q55 12 63 8M130 26Q139 17 132 10','#c9b68b',2) },
  pearl:{ colors:['#e7f1ee','#97c5ce','#5a7e99'], art:P('M60 62L131 62L143 132Q96 160 48 132Z','url(#metal)',outline)+E(96,62,35,12,'#ecf9f1',outline)+P('M71 55L74 38L119 38L122 55Z','#becbce',outline)+C(97,105,21,'#fff6e5',outline)+C(91,98,7,'#fff','opacity=".9"')+C(69,122,9,'#deede9',finOutline)+C(125,119,10,'#f9e9d9',finOutline)+star(142,80,5,'#effaff') },
  starlight:{ colors:['#e1dcff','#9581c2','#584579'], art:P('M60 56L131 56L144 136L120 151L70 151L48 136Z','#776793',outline)+P('M61 56L70 36L120 36L131 56Z','#b5a0d6',outline)+P('M91 84L100 104L122 105L106 120L110 142L90 131L71 142L76 120L60 106L82 103Z','#f4d388',outline)+star(43,58,5)+star(149, 80, 4) },
  secret:{ colors:['#aeced2','#577783','#263f54'], art:P('M62 70L129 70L140 126Q96 160  50 126Z','url(#body)',outline)+P('M75 69L 70 45L121 45L116 69Z','#a67f4e',outline)+L('M56 106Q96 83 134 107','#c0b391',5)+P('M82 113L97 96L112 113L97 135Z','url(#gold)',outline)+L('M96 102L97 130','#eddbaf',2)+L('M 70 39L123 39','#d0aa61',8) }
}
for (const [id, item] of Object.entries(FISHING_BAITS)) {
  const art=baitArt[id]
  equipment[`bait_${id}`] = document(`bait_${id}`, item.name, art.colors, art.art, ['pearl','starlight','secret'].includes(id))
}
for (const [id, svg] of Object.entries(equipment)) await writeFile(resolve(output, `${id}.svg`), svg)
console.log(`generated ${generated.size + Object.keys(equipment).length} fishing SVG assets in ${output}`)
