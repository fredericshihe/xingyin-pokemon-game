import fs from 'node:fs/promises'
import sharp from 'sharp'

// Original, transparent material sprites. No fonts, glyphs or icon libraries.
const size = 128
const shapes = {
  flame: '<path d="M64 8C82 38 48 48 90 74C117 100 86 126 59 119C20 120 10 82 37 56C33 79 64 63 64 8Z" fill="url(#body)"/><path d="M64 55Q40 94 58 114Q87 114 75 89Z" fill="url(#light)"/>',
  smoke: '<g filter="url(#soft)"><ellipse cx="62" cy="65" rx="44" ry="36" fill="url(#light)"/><circle cx="45" cy="39" r="29" fill="url(#light)"/><circle cx="91" cy="67" r="27" fill="url(#light)"/><circle cx="49" cy="91" r="25" fill="url(#light)"/></g>',
  mist: '<ellipse cx="64" cy="64" rx="60" ry="22" fill="url(#light)" filter="url(#soft)"/>',
  droplet: '<path d="M65 8C59 40 29 56 29 85C29 133 102 127 102 83C100 58 73 39 65 8Z" fill="url(#body)"/><path d="M45 65Q31 91 55 104" stroke="white" stroke-width="7" fill="none" opacity=".8"/>',
  leaf: '<path d="M16 113Q-3 20 114 12Q134 116 16 113Z" fill="url(#body)"/><path d="M15 114L102 25M37 91L33 53M58 70L91 78M75 53L68 28" stroke="white" stroke-width="3" opacity=".6" fill="none"/>',
  petal: '<path d="M63 118C-11 73 21 5 54 13L65 24L76 12C119 5 142 78 63 118Z" fill="url(#body)"/><path d="M65 37L63 112" stroke="white" stroke-width="3" opacity=".35"/>',
  rock: '<path d="M10 48L38 14L94 22L118 61L96 110L33 116L9 84Z" fill="#a0a0a0"/><path d="M10 48L61 38L94 22L38 14Z" fill="#ededed"/><path d="M61 38L118 61L96 110L60 86Z" fill="#666"/><path d="M10 48L61 38L60 86L33 116L9 84Z" fill="#bdbdbd"/><path d="M35 50L60 62L57 85M75 46L91 62" fill="none" stroke="#555" stroke-width="3"/>',
  ice: '<path d="M65 4L104 43L97 91L61 123L27 84L29 38Z" fill="url(#body)"/><path d="M65 4L58 63L29 38Z" fill="#fff" opacity=".9"/><path d="M58 63L104 43L97 91L61 123Z" fill="#fff" opacity=".45"/><path d="M58 63L61 123L27 84Z" fill="#4a4a4a" opacity=".45"/><path d="M65 4L58 63L61 123M29 38L58 63L104 43" fill="none" stroke="#fff" stroke-width="2"/>',
  spark: '<g fill="none" stroke-linecap="round"><path d="M25 83L43 72L48 78L67 51L76 58L100 33M67 51L61 36L71 23M43 72L28 64M76 58L91 66L104 57" stroke="#888" stroke-width="7" opacity=".55"/><path d="M25 83L43 72L48 78L67 51L76 58L100 33M67 51L61 36L71 23M76 58L91 66L104 57" stroke="white" stroke-width="2.5"/></g>',
  bubble: '<circle cx="64" cy="64" r="43" fill="url(#light)" opacity=".18"/><circle cx="64" cy="64" r="43" fill="none" stroke="#ccc" stroke-width="3"/><path d="M29 53Q39 21 73 26M89 97L98 89" stroke="white" stroke-width="6" fill="none" stroke-linecap="round"/>',
  feather: '<path d="M20 118Q9 25 96 10Q122 41 95 64L68 84L61 96Z" fill="url(#body)"/><path d="M15 125L93 20M33 93L69 81M44 77L41 47M59 60L98 43" stroke="white" opacity=".75" stroke-width="2" fill="none"/>',
  tooth: '<path d="M32 18Q61 7 92 22Q102 65 59 119Q53 69 32 18Z" fill="url(#body)"/><path d="M41 25Q56 56 61 90" stroke="white" stroke-width="5" fill="none" opacity=".8"/>',
  metal: '<ellipse cx="64" cy="64" rx="44" ry="52" fill="url(#body)"/><ellipse cx="64" cy="64" rx="35" ry="43" fill="none" stroke="#eee" stroke-width="3"/><path d="M38 92L87 35" stroke="white" stroke-width="8" opacity=".65"/>',
  thread: '<path d="M4 102C34 9 42 115 65 49S101 81 124 13" fill="none" stroke="#aaa" stroke-width="5"/><path d="M4 100C34 7 42 113 65 47S101 79 124 11" fill="none" stroke="white" stroke-width="2"/>',
  shell: '<path d="M13 68Q2 18 61 9Q119 13 115 68L85 111L40 110Z" fill="url(#body)"/><path d="M61 19L63 102M28 31L50 101M94 32L76 102M16 62L44 102M110 62L83 103" stroke="white" stroke-width="3" fill="none" opacity=".55"/>',
  seed: '<path d="M62 16C113 32 105 110 60 116C13 96 17 35 62 16Z" fill="url(#body)"/><path d="M62 25Q40 63 60 106" fill="none" stroke="white" opacity=".45" stroke-width="4"/>',
  light: '<circle cx="64" cy="64" r="63" fill="url(#light)"/>',
  dust: '<g filter="url(#soft)"><ellipse cx="40" cy="75" rx="29" ry="22" fill="url(#light)"/><ellipse cx="77" cy="57" rx="37" ry="29" fill="url(#light)"/><ellipse cx="75" cy="87" rx="29" ry="22" fill="url(#light)"/></g>',
  splash: '<path d="M13 110Q33 86 17 45Q48 51 53 83Q39 39 63 8Q90 47 74 83Q86 50 114 45Q97 91 112 110Z" fill="url(#body)"/><path d="M50 112Q65 66 66 44Q85 88 81 112Z" fill="white" opacity=".5"/>',
  claw: '<path d="M6 115Q52 41 122 7Q76 62 56 90Z" fill="url(#body)"/><path d="M8 114Q55 49 112 17" fill="none" stroke="white" stroke-width="3"/>',
  bone: '<path d="M48 34C23 42 17 16 34 10Q50 3 63 18Q76 2 93 13C112 27 96 48 81 37L75 88C98 79 111 105 94 116Q77 126 64 109Q51 126 34 114C17 102 30 81 51 90Z" fill="#f3e8ce" stroke="#6c5848" stroke-width="4" stroke-linejoin="round"/><path d="M57 34Q63 59 58 88M37 17Q29 23 39 29M81 99Q93 95 95 105" fill="none" stroke="#fffbed" stroke-width="6" stroke-linecap="round"/><path d="M74 42L68 86" stroke="#b5a186" stroke-width="5" stroke-linecap="round"/>',
  wood: '<path d="M28 14L83 10L107 27L102 104L42 116L22 98Z" fill="url(#body)"/><path d="M40 18L47 102M63 15L68 109M86 28L89 101M30 60Q65 43 103 56" fill="none" stroke="#555" opacity=".65" stroke-width="4"/><ellipse cx="65" cy="28" rx="23" ry="10" fill="none" stroke="#eee" stroke-width="3"/>',
  gem: '<path d="M36 15L88 15L115 49L64 119L13 49Z" fill="url(#body)"/><path d="M36 15L46 49L13 49M88 15L81 49L115 49M46 49L64 119L81 49L46 49L63 15Z" fill="none" stroke="#fff" stroke-width="3"/><path d="M15 49L64 118L46 49Z" fill="#333" opacity=".45"/>',
  needle: '<path d="M57 111L64 6L73 111L65 120Z" fill="url(#body)"/><path d="M64 12L64 109" stroke="white" stroke-width="2"/>',
  pollen: '<circle cx="64" cy="64" r="24" fill="url(#body)"/><circle cx="54" cy="56" r="6" fill="white"/><g fill="#aaa"><circle cx="39" cy="54" r="5"/><circle cx="75" cy="40" r="5"/><circle cx="88" cy="69" r="5"/><circle cx="55" cy="87" r="5"/></g>',
  egg: '<path d="M63 10C41 10 19 62 22 89C27 132 104 128 107 87C107 56 84 10 63 10Z" fill="url(#body)"/><path d="M38 65Q36 44 51 29" stroke="white" opacity=".65" stroke-width="7" fill="none"/>',
  frost: '<path d="M23 102L18 57L38 67L46 21L62 55L85 11L90 58L113 43L101 113L64 105Z" fill="url(#body)"/><path d="M46 24L55 89M85 16L75 98M24 64L45 97M105 55L88 102" stroke="white" stroke-width="3" fill="none"/>',
  coin: '<ellipse cx="67" cy="64" rx="44" ry="52" fill="#666"/><ellipse cx="60" cy="61" rx="42" ry="51" fill="url(#body)"/><ellipse cx="60" cy="61" rx="32" ry="41" fill="none" stroke="#fff" stroke-width="3"/><path d="M40 85L72 33" stroke="white" opacity=".35" stroke-width="9"/>',
  foam: '<g fill="url(#light)"><circle cx="32" cy="77" r="20"/><circle cx="63" cy="59" r="28"/><circle cx="95" cy="75" r="23"/></g><g fill="none" stroke="white" stroke-width="4" opacity=".8"><path d="M16 71Q24 55 38 61M42 50Q61 29 79 51M80 67Q97 51 112 70"/></g>',
  blade: '<path d="M64 5L77 26L73 90L55 90L51 26Z" fill="url(#body)"/><path d="M64 5L64 88L73 90L77 26Z" fill="#666"/><path d="M42 88Q64 95 86 88L84 99L44 99Z" fill="#bbb"/><path d="M59 98H69V119H59Z" fill="#777"/><path d="M57 28L59 83" stroke="white" stroke-width="3"/>',
  pincer: '<path d="M49 119C12 102 8 50 36 17Q51 7 66 9Q28 39 48 64L58 48L67 78Q94 61 89 33Q115 59 106 89Q97 112 75 118Z" fill="url(#body)"/><path d="M33 37Q20 78 50 98M89 67L76 94" stroke="white" opacity=".7" stroke-width="4" fill="none"/>',
  horn: '<path d="M28 104Q71 76 85 7Q112 100 78 116Q52 128 28 104Z" fill="url(#body)"/><path d="M83 23Q79 77 48 104" fill="none" stroke="white" stroke-width="5"/><path d="M48 88L87 95M59 71L93 77" stroke="#777" stroke-width="3" fill="none"/>',
  sole: '<g fill="#f2c189" stroke="#71402d" stroke-width="3"><path d="M44 46C29 49 23 65 35 76Q43 83 40 97C34 120 70 125 78 106Q84 93 77 81Q71 71 82 60Q90 41 71 39Z"/><ellipse cx="83" cy="22" rx="14" ry="18" transform="rotate(15 83 22)"/><ellipse cx="58" cy="21" rx="9" ry="13"/><ellipse cx="40" cy="27" rx="8" ry="11"/><ellipse cx="26" cy="39" rx="7" ry="9"/></g><path d="M40 59Q52 48 72 53M49 97Q47 109 64 108" stroke="#ffe8ba" stroke-width="7" fill="none" stroke-linecap="round"/>',
  fist: '<path d="M30 91Q14 74 21 56L27 30Q31 17 43 23Q52 9 64 22Q81 12 89 29Q106 24 108 42L109 67Q107 81 94 91L83 114L37 111Z" fill="#edbc88" stroke="#643c32" stroke-width="4"/><path d="M27 57Q18 37 34 36L61 45Q78 43 81 55Q82 68 66 69L46 65Q50 83 70 85" fill="#f6d1a3" stroke="#754737" stroke-width="4"/><path d="M45 27L44 39M65 25L64 43M87 33L85 46M37 93L88 96" stroke="#9f6848" stroke-width="4"/><path d="M30 46L59 53M45 102L74 105" stroke="#ffebc7" stroke-width="5" stroke-linecap="round"/>',
  palm: '<path d="M37 115L28 78L10 62Q1 47 17 44L33 59L30 20Q29 8 39 9Q48 8 48 22L51 48L52 10Q53 0 63 3Q70 5 69 17L69 45L75 17Q78 7 87 12Q92 16 88 28L84 50L93 30Q99 18 107 26Q112 31 105 44L95 81L83 115Z" fill="#efc392" stroke="#754330" stroke-width="3"/><path d="M42 66Q61 54 80 65M48 92Q68 80 82 81M55 65L58 91" fill="none" stroke="#b97f53" stroke-width="3"/>',
  hoof: '<path d="M28 29Q63 11 99 29L109 97Q65 126 16 98Z" fill="#c6aa83" stroke="#4d3e36" stroke-width="5"/><path d="M61 28L58 112" stroke="#44342b" stroke-width="8"/><path d="M31 45L27 88M78 36L88 82" stroke="#f4dbb2" stroke-width="8"/>',
  beak: '<path d="M20 36Q53 5 108 63L21 74Z" fill="#e6b762" stroke="#705034" stroke-width="4"/><path d="M21 78L108 63Q59 109 26 98Z" fill="#bf803f" stroke="#705034" stroke-width="4"/><path d="M35 33Q62 29 87 53" stroke="#ffe6a0" stroke-width="6" fill="none"/>',
  wing: '<path d="M12 112Q13 47 104 6Q100 35 77 55L119 34Q113 62 80 74L119 65Q108 91 70 92L101 93Q82 113 43 105L38 122Z" fill="#e8e3d6" stroke="#716f7a" stroke-width="3"/><path d="M24 104Q43 69 96 23M36 97L101 49M43 99L101 79" stroke="#aaa9b2" stroke-width="3" fill="none"/>',
  tail: '<path d="M11 91Q52 112 70 83Q92 58 73 13Q115 42 109 75Q102 135 20 116Z" fill="#b6c4a0" stroke="#425941" stroke-width="4"/><path d="M25 104Q76 123 94 76" stroke="#e7ead0" stroke-width="6" fill="none"/><path d="M80 87L99 91M84 69L107 70M79 49L103 48" stroke="#70876c" stroke-width="4"/>',
  scale: '<path d="M18 42L62 12L110 43Q113 89 63 117Q13 87 18 42Z" fill="#acc3f0" stroke="#48547e" stroke-width="4"/><path d="M27 46L64 27L100 46L64 94Z" fill="#c8dafb"/><path d="M64 27L64 94L100 46" fill="#8298cb"/>',
  kiss: '<path d="M13 64Q30 38 48 40L64 50L78 40Q99 38 115 64Q89 95 64 91Q36 92 13 64Z" fill="#d17690" stroke="#794658" stroke-width="3"/><path d="M17 64Q43 57 64 65Q85 57 111 64Q84 72 64 72Q42 72 17 64Z" fill="#794658"/><path d="M36 53L49 50M49 82L77 82" stroke="#f1b5be" stroke-width="4" stroke-linecap="round"/>',
  axe: '<path d="M49 111L78 29" stroke="#594738" stroke-width="15"/><path d="M43 109L73 28" stroke="#a88252" stroke-width="7"/><path d="M61 18L97 13L115 37L103 74L77 62L64 45L39 46L26 29Z" fill="#96968c" stroke="#454b4a" stroke-width="4"/><path d="M97 13L93 47L103 74L115 37Z" fill="#d0d0c0"/><path d="M61 18L64 45L93 47" fill="none" stroke="#6e746e" stroke-width="4"/>',
  firetongue: '<path d="M65 4C93 35 50 44 82 62L94 42C115 82 102 117 63 122C25 125 7 99 28 63L37 83C65 65 34 37 65 4Z" fill="#d3451c"/><path d="M67 23C74 49 48 63 62 84Q82 78 85 66C109 106 77 119 56 113Q31 109 35 89Q64 102 67 23Z" fill="#ff962d"/><path d="M68 69Q86 100 66 113Q43 113 52 93Q61 104 68 69Z" fill="#ffe79a"/>',
}
const defs='<defs><radialGradient id="light"><stop stop-color="white"/><stop offset=".25" stop-color="#ddd" stop-opacity=".8"/><stop offset=".65" stop-color="#aaa" stop-opacity=".35"/><stop offset="1" stop-color="#888" stop-opacity="0"/></radialGradient><linearGradient id="body" x1="0" y1="0" x2=".7" y2="1"><stop stop-color="white"/><stop offset=".38" stop-color="#ddd"/><stop offset=".74" stop-color="#999"/><stop offset="1" stop-color="#444" stop-opacity=".4"/></linearGradient><filter id="soft"><feGaussianBlur stdDeviation="4"/></filter></defs>'
await fs.mkdir('art/battle-vfx/materials', {recursive:true})
await fs.mkdir('src/assets', {recursive:true})
const tiles=[]
const spriteNames=Object.keys(shapes)
function organicTexture(kind) {
  const rgba=Buffer.alloc(size*size*4)
  const gaussian=(x,y,cx,cy,rx,ry)=>Math.exp(-(((x-cx)/rx)**2+((y-cy)/ry)**2)*2)
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const u=x/size,v=y/size
    const grain=(Math.sin(x*.63+y*.91)+Math.sin(x*.21-y*.35)+Math.sin(x*1.7+y*1.1))/3
    const swirl=Math.sin(v*17+Math.sin(v*8)*2)*.065
    let a
    if(kind==='flame') {
      a=gaussian(u,v,.5+swirl,.7,.28,.3)+.85*gaussian(u,v,.45+swirl,.43,.16,.28)+.48*gaussian(u,v,.57+swirl,.22,.075,.26)
      a=Math.max(0,a-.07)*( .78+grain*.25)
    } else {
      a=gaussian(u,v,.5,.5,kind==='mist'?.58:.42,kind==='mist'?.21:.42)
      a*=.58+.18*Math.sin(u*19+v*11)+.12*Math.sin(u*31-v*19)+grain*.12
    }
    const i=(y*size+x)*4, value=Math.round(220+Math.min(1,a)*35)
    rgba[i]=rgba[i+1]=rgba[i+2]=value
    rgba[i+3]=Math.round(Math.max(0,Math.min(1,a))*255)
  }
  return sharp(rgba,{raw:{width:size,height:size,channels:4}}).png().toBuffer()
}
for(const [index,[name,shape]] of Object.entries(shapes).entries()) {
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">${defs}${shape}</svg>`
  await fs.writeFile(`art/battle-vfx/materials/${name}.svg`,svg)
  const input=name==='flame' ? await sharp(await organicTexture(name)).composite([{input:Buffer.from(svg)}]).png().toBuffer()
    : ['smoke','mist','dust'].includes(name) ? await organicTexture(name) : await sharp(Buffer.from(svg)).png().toBuffer()
  await fs.writeFile(`art/battle-vfx/materials/${name}.png`,input)
  tiles.push({input,left:index%5*size,top:Math.floor(index/5)*size})
}
// Neutral variants keep steel tails/fists silver when tinted. Baking these
// avoids canvas readback or runtime CSS/Canvas filters on iPad Safari.
for(const name of ['sole','fist','palm','hoof','wing','beak','tail','scale','kiss','axe','bone']) {
  const index=spriteNames.length,input=await sharp(`art/battle-vfx/materials/${name}.png`).grayscale().png().toBuffer()
  spriteNames.push(`${name}-neutral`)
  tiles.push({input,left:index%5*size,top:Math.floor(index/5)*size})
}
await sharp({create:{width:size*5,height:size*Math.ceil(tiles.length/5),channels:4,background:'#00000000'}}).composite(tiles).png().toFile('src/assets/battle-vfx-atlas.png')
await fs.writeFile('src/utils/battleVfxAtlas.generated.js',`// Generated by scripts/generate-battle-vfx-atlas.mjs\nexport const VFX_ATLAS = ${JSON.stringify({size,columns:5,sprites:spriteNames},null,2)}\n`)
console.log(`${tiles.length} original material sprites; ${(await fs.stat('src/assets/battle-vfx-atlas.png')).size} bytes`)
