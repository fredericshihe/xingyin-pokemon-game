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
  spark: '<ellipse cx="64" cy="64" rx="61" ry="9" fill="url(#light)"/><ellipse cx="64" cy="64" rx="31" ry="4" fill="white"/>',
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
}
const defs='<defs><radialGradient id="light"><stop stop-color="white"/><stop offset=".25" stop-color="#ddd" stop-opacity=".8"/><stop offset=".65" stop-color="#aaa" stop-opacity=".35"/><stop offset="1" stop-color="#888" stop-opacity="0"/></radialGradient><linearGradient id="body" x1="0" y1="0" x2=".7" y2="1"><stop stop-color="white"/><stop offset=".38" stop-color="#ddd"/><stop offset=".74" stop-color="#999"/><stop offset="1" stop-color="#444" stop-opacity=".4"/></linearGradient><filter id="soft"><feGaussianBlur stdDeviation="4"/></filter></defs>'
await fs.mkdir('art/battle-vfx/materials', {recursive:true})
await fs.mkdir('src/assets', {recursive:true})
const tiles=[]
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
  const input=['flame','smoke','mist','dust'].includes(name) ? await organicTexture(name) : await sharp(Buffer.from(svg)).png().toBuffer()
  await fs.writeFile(`art/battle-vfx/materials/${name}.png`,input)
  tiles.push({input,left:index%5*size,top:Math.floor(index/5)*size})
}
await sharp({create:{width:size*5,height:size*4,channels:4,background:'#00000000'}}).composite(tiles).png().toFile('src/assets/battle-vfx-atlas.png')
await fs.writeFile('src/utils/battleVfxAtlas.generated.js',`// Generated by scripts/generate-battle-vfx-atlas.mjs\nexport const VFX_ATLAS = ${JSON.stringify({size,columns:5,sprites:Object.keys(shapes)},null,2)}\n`)
console.log(`20 original material sprites; ${(await fs.stat('src/assets/battle-vfx-atlas.png')).size} bytes`)
