import * as THREE from 'three'

// 地图用的风格化材质补丁、接触阴影、脚下粒子和单 pass 后处理。
// 所有补丁都通过 onBeforeCompile 叠加在内置材质上，保留 three 的光照 / 阴影 / 雾。

const NOISE_GLSL = `
float mapHash( vec2 p ) {
  p = fract( p * vec2( 123.34, 456.21 ) );
  p += dot( p, p + 45.32 );
  return fract( p.x * p.y );
}
float mapNoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix(
    mix( mapHash( i ), mapHash( i + vec2( 1.0, 0.0 ) ), u.x ),
    mix( mapHash( i + vec2( 0.0, 1.0 ) ), mapHash( i + vec2( 1.0, 1.0 ) ), u.x ),
    u.y
  );
}
`

const WORLD_VARYING_VERTEX = `
vec4 mapWorldPos = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
mapWorldPos = instanceMatrix * mapWorldPos;
#endif
vMapWorld = ( modelMatrix * mapWorldPos ).xyz;
`

// 叠加一个 onBeforeCompile 补丁，并让程序缓存键区分不同补丁组合
function chainShaderPatch(material, id, patch) {
  if (!material) return material
  material.userData.shaderPatches = material.userData.shaderPatches || []
  if (material.userData.shaderPatches.includes(id)) return material
  material.userData.shaderPatches.push(id)
  const previousOnBeforeCompile = material.onBeforeCompile
  const previousCacheKey = material.customProgramCacheKey.bind(material)
  material.onBeforeCompile = (shader, renderer) => {
    previousOnBeforeCompile?.call(material, shader, renderer)
    patch(shader)
  }
  material.customProgramCacheKey = () => `${previousCacheKey()}|${id}`
  material.needsUpdate = true
  return material
}

function injectWorldVarying(shader) {
  if (shader.vertexShader.includes('varying vec3 vMapWorld;')) return
  shader.vertexShader = `varying vec3 vMapWorld;\n${shader.vertexShader}`.replace(
    '#include <project_vertex>',
    `#include <project_vertex>\n${WORLD_VARYING_VERTEX}`
  )
  shader.fragmentShader = `varying vec3 vMapWorld;\n${shader.fragmentShader}`
}

// PBR → Lambert：低多边形场景几乎不需要粗糙度/金属度，Lambert 更便宜也更"卡通"
export function toLambertMaterial(material) {
  if (!material) return material
  if (Array.isArray(material)) return material.map(toLambertMaterial)
  if (!material.isMeshStandardMaterial) return material
  const lambert = new THREE.MeshLambertMaterial({
    name: material.name,
    color: material.color,
    map: material.map,
    alphaMap: material.alphaMap,
    normalMap: material.normalMap,
    emissive: material.emissive,
    emissiveMap: material.emissiveMap,
    emissiveIntensity: material.emissiveIntensity,
    vertexColors: material.vertexColors,
    transparent: material.transparent,
    opacity: material.opacity,
    alphaTest: material.alphaTest,
    side: material.side,
    depthWrite: material.depthWrite,
    depthTest: material.depthTest,
    polygonOffset: material.polygonOffset,
    polygonOffsetFactor: material.polygonOffsetFactor,
    polygonOffsetUnits: material.polygonOffsetUnits
  })
  material.dispose()
  return lambert
}

// 角色保留 PBR，给一张很小的环境贴图提亮高光和暗部。
// PMREM 纹理属于具体的 GL 上下文，按渲染器分别缓存。
const environmentTextures = new WeakMap()
export function getMapEnvironmentTexture(renderer) {
  const cached = environmentTextures.get(renderer)
  if (cached) return cached
  const pmrem = new THREE.PMREMGenerator(renderer)
  const envScene = new THREE.Scene()
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(10, 16, 8),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec3 vDir; void main(){ float h = vDir.y; gl_FragColor = vec4(mix(vec3(0.42,0.62,0.36), mix(vec3(0.95,0.97,1.0), vec3(0.55,0.75,1.0), smoothstep(0.0,0.8,h)), smoothstep(-0.2,0.1,h)), 1.0); }'
    })
  )
  envScene.add(sky)
  const texture = pmrem.fromScene(envScene, 0.02).texture
  sky.geometry.dispose()
  sky.material.dispose()
  pmrem.dispose()
  environmentTextures.set(renderer, texture)
  return texture
}

export function disposeMapEnvironmentTexture(renderer) {
  if (!renderer) return
  environmentTextures.get(renderer)?.dispose()
  environmentTextures.delete(renderer)
}

export function applyCharacterEnvironment(material, envMap, intensity = 0.45) {
  if (!material || !envMap) return
  const list = Array.isArray(material) ? material : [material]
  list.forEach((entry) => {
    if (!entry?.isMeshStandardMaterial) return
    entry.envMap = envMap
    entry.envMapIntensity = intensity
    entry.needsUpdate = true
  })
}

// === 地形：世界坐标噪声色斑 + 缓慢滚动的云影 ===
export function applyTerrainShading(material, timeUniform, { cloudShadows = true } = {}) {
  return chainShaderPatch(material, `terrain${cloudShadows ? '+cloud' : ''}`, (shader) => {
    shader.uniforms.uMapTime = timeUniform
    injectWorldVarying(shader)
    shader.fragmentShader = `uniform float uMapTime;\n${NOISE_GLSL}\n${shader.fragmentShader}`.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
{
  vec2 p = vMapWorld.xz;
  float broad = mapNoise( p * 0.075 ) * 0.65 + mapNoise( p * 0.19 ) * 0.35;
  float detail = mapNoise( p * 0.9 );
  float speck = mapNoise( p * 3.7 );
  vec3 base = diffuseColor.rgb;
  // 线性空间里乘法色调很弱，这里偏移要给足才看得出来
  vec3 warm = base * vec3( 1.45, 1.0, 0.62 );
  vec3 cool = base * vec3( 0.62, 0.8, 0.82 );
  vec3 col = mix( base, warm, smoothstep( 0.52, 0.8, broad ) * 0.75 );
  col = mix( col, cool, smoothstep( 0.52, 0.8, 1.0 - broad ) * 0.7 );
  col *= 0.86 + detail * 0.24 + ( speck - 0.5 ) * 0.1;
  ${cloudShadows ? `
  vec2 cp = p * 0.034 + vec2( uMapTime * 0.000042, uMapTime * 0.000018 );
  float cloud = mapNoise( cp ) * 0.7 + mapNoise( cp * 2.3 ) * 0.3;
  col *= mix( 1.0, 0.74, smoothstep( 0.5, 0.7, cloud ) );` : ''}
  diffuseColor.rgb = col;
}`
    )
  })
}

// === 水面：程序化法线波纹 + 菲涅尔天空反射 + 焦散亮带（Phong 高光） ===
export function createWaterMaterial({ color, opacity = 0.97, skyColor = 0xcdeeff }, timeUniform) {
  const material = new THREE.MeshPhongMaterial({
    color,
    specular: 0xf4fbff,
    shininess: 90,
    transparent: opacity < 1,
    opacity
  })
  const sky = new THREE.Color(skyColor)
  return chainShaderPatch(material, 'water', (shader) => {
    shader.uniforms.uMapTime = timeUniform
    shader.uniforms.uWaterSky = { value: sky }
    injectWorldVarying(shader)
    shader.fragmentShader = `uniform float uMapTime;\nuniform vec3 uWaterSky;\n${NOISE_GLSL}\n${shader.fragmentShader}`
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  vec2 p = vMapWorld.xz;
  float t = uMapTime * 0.001;
  float band = mapNoise( p * 0.55 + vec2( t * 0.22, t * 0.15 ) ) + mapNoise( p * 1.1 - vec2( t * 0.18, t * 0.27 ) );
  float caustic = pow( 1.0 - abs( band - 1.0 ), 6.0 );
  diffuseColor.rgb += caustic * 0.07;
}`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
{
  vec2 p = vMapWorld.xz;
  float t = uMapTime * 0.001;
  vec2 g = vec2( 0.0 );
  vec2 d1 = vec2( 0.8, 0.6 ); g += d1 * cos( dot( p, d1 ) * 1.7 + t * 1.6 ) * 0.9;
  vec2 d2 = vec2( -0.5, 0.86 ); g += d2 * cos( dot( p, d2 ) * 2.4 + t * 2.1 ) * 0.6;
  vec2 d3 = vec2( 0.2, -0.98 ); g += d3 * cos( dot( p, d3 ) * 4.1 + t * 2.8 ) * 0.35;
  g *= 0.085;
  normal = normalize( normal + ( viewMatrix * vec4( -g.x, 0.0, -g.y, 0.0 ) ).xyz );
}`
      )
      .replace(
        '#include <opaque_fragment>',
        `{
  float facing = clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 );
  float fresnel = pow( 1.0 - facing, 3.0 );
  outgoingLight = mix( outgoingLight, uWaterSky, fresnel * 0.6 );
}
#include <opaque_fragment>`
      )
  })
}

// 岸边一圈：缓慢流动的白色泡沫/湿沙斑
export function applyShoreFoam(material, timeUniform) {
  return chainShaderPatch(material, 'shoreFoam', (shader) => {
    shader.uniforms.uMapTime = timeUniform
    injectWorldVarying(shader)
    shader.fragmentShader = `uniform float uMapTime;\n${NOISE_GLSL}\n${shader.fragmentShader}`.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
{
  vec2 p = vMapWorld.xz;
  float t = uMapTime * 0.001;
  float foam = mapNoise( p * 1.6 + vec2( t * 0.35, -t * 0.2 ) ) * 0.6 + mapNoise( p * 3.4 - vec2( t * 0.5 ) ) * 0.4;
  float f = smoothstep( 0.5, 0.78, foam );
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.97, 0.99, 1.0 ), f * 0.6 );
  diffuseColor.a = min( 1.0, diffuseColor.a + f * 0.25 );
}`
    )
  })
}

// === 树冠风摆：按世界高度偏移，树根不动 ===
export function applyTreeWind(material, timeUniform, amplitude = 1) {
  return chainShaderPatch(material, `treeWind${amplitude}`, (shader) => {
    shader.uniforms.uMapTime = timeUniform
    shader.vertexShader = `uniform float uMapTime;\n${shader.vertexShader}`.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
{
  vec4 windWorld = vec4( transformed, 1.0 );
  vec3 windOrigin = vec3( 0.0 );
  #ifdef USE_INSTANCING
  windWorld = instanceMatrix * windWorld;
  windOrigin = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
  #else
  windOrigin = ( modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
  #endif
  windWorld = modelMatrix * windWorld;
  float h = max( windWorld.y - windOrigin.y - 0.6, 0.0 );
  float t = uMapTime * 0.001;
  float phase = t * 1.35 + windOrigin.x * 0.37 + windOrigin.z * 0.29;
  float sway = ( sin( phase ) * 0.7 + sin( phase * 2.3 + 1.7 ) * 0.3 ) * 0.022 * ${amplitude.toFixed(2)};
  windWorld.xz += vec2( sway, sway * 0.6 ) * h * h;
  mvPosition = viewMatrix * windWorld;
  gl_Position = projectionMatrix * mvPosition;
}`
    )
  })
}

// === 接触阴影：物体脚下一张径向渐变贴片，全图一个 InstancedMesh ===
function createBlobTexture() {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.7)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.NoColorSpace
  return texture
}

export function createContactShadowLayer(capacity = 4096) {
  const geometry = new THREE.PlaneGeometry(1, 1)
  geometry.rotateX(-Math.PI / 2)
  const alphaMap = createBlobTexture()
  const material = new THREE.MeshBasicMaterial({
    color: 0x1d3a1f,
    alphaMap,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4
  })
  const mesh = new THREE.InstancedMesh(geometry, material, capacity)
  mesh.name = 'map-contact-shadows'
  mesh.count = 0
  mesh.frustumCulled = false
  mesh.castShadow = false
  mesh.receiveShadow = false
  mesh.renderOrder = 1
  const _blob = new THREE.Matrix4()
  const _inv = new THREE.Matrix4()
  const _pos = new THREE.Vector3()
  const _quat = new THREE.Quaternion()
  const _scale = new THREE.Vector3()
  return {
    mesh,
    // 返回可挂到装饰物 refs 上的 ref（localOffset 相对物体世界矩阵），这样拾取/隐藏时阴影一起消失
    // radiusX / radiusZ 是物体本地 X/Z 方向的半径（世界单位），贴片跟着物体朝向转
    add(worldMatrix, radiusX, radiusZ = radiusX) {
      if (mesh.count >= capacity || !(radiusX > 0.05) || !(radiusZ > 0.05)) return null
      worldMatrix.decompose(_pos, _quat, _scale)
      _pos.y += 0.035
      _scale.set(radiusX * 2, 1, radiusZ * 2)
      _blob.compose(_pos, _quat, _scale)
      const index = mesh.count
      mesh.setMatrixAt(index, _blob)
      mesh.count += 1
      mesh.instanceMatrix.needsUpdate = true
      _inv.copy(worldMatrix).invert()
      return { mesh, index, localOffset: _inv.multiply(_blob).clone() }
    },
    dispose() {
      geometry.dispose()
      material.dispose()
      alphaMap.dispose()
    }
  }
}

// === 脚下粒子：走路扬尘 / 进草丛飘叶 ===
export function createFootstepParticles(maxParticles = 64) {
  const positions = new Float32Array(maxParticles * 3)
  const colors = new Float32Array(maxParticles * 3)
  const sizes = new Float32Array(maxParticles)
  const alphas = new Float32Array(maxParticles)
  const velocities = new Float32Array(maxParticles * 3)
  const lifes = new Float32Array(maxParticles)
  const maxLifes = new Float32Array(maxParticles)
  const kinds = new Uint8Array(maxParticles)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage))
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage))
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage))
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage))
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uPointScale: { value: 400 } }]),
    vertexShader: `
attribute vec3 aColor;
attribute float aSize;
attribute float aAlpha;
uniform float uPointScale;
varying vec3 vColor;
varying float vAlpha;
#include <fog_pars_vertex>
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
  gl_PointSize = aAlpha > 0.0 ? aSize * uPointScale / max( -mvPosition.z, 0.1 ) : 0.0;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,
    fragmentShader: `
varying vec3 vColor;
varying float vAlpha;
#include <fog_pars_fragment>
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot( c, c );
  if ( d > 0.25 ) discard;
  gl_FragColor = vec4( vColor, vAlpha * ( 1.0 - d * 4.0 ) );
  #include <colorspace_fragment>
  #include <fog_fragment>
}`,
    transparent: true,
    depthWrite: false,
    fog: true
  })
  const points = new THREE.Points(geometry, material)
  points.name = 'map-footstep-particles'
  points.frustumCulled = false
  points.renderOrder = 5
  let cursor = 0
  let alive = 0
  const dustColor = new THREE.Color(0xe8d7b0)
  const leafColors = [new THREE.Color(0x7cc75d), new THREE.Color(0x9ad86a), new THREE.Color(0x5fae4c)]

  const emit = (x, y, z, kind, count = 2) => {
    for (let n = 0; n < count; n += 1) {
      const i = cursor
      cursor = (cursor + 1) % maxParticles
      if (lifes[i] <= 0) alive += 1
      kinds[i] = kind
      const angle = Math.random() * Math.PI * 2
      const spread = kind === 1 ? 0.55 : 0.35
      positions[i * 3] = x + Math.cos(angle) * 0.12
      positions[i * 3 + 1] = y + (kind === 1 ? 0.25 : 0.05)
      positions[i * 3 + 2] = z + Math.sin(angle) * 0.12
      velocities[i * 3] = Math.cos(angle) * spread
      velocities[i * 3 + 1] = kind === 1 ? 0.9 + Math.random() * 0.6 : 0.35 + Math.random() * 0.3
      velocities[i * 3 + 2] = Math.sin(angle) * spread
      const life = kind === 1 ? 0.9 + Math.random() * 0.4 : 0.55 + Math.random() * 0.25
      lifes[i] = life
      maxLifes[i] = life
      const color = kind === 1 ? leafColors[Math.floor(Math.random() * leafColors.length)] : dustColor
      colors[i * 3] = color.r
      colors[i * 3 + 1] = color.g
      colors[i * 3 + 2] = color.b
      sizes[i] = kind === 1 ? 0.11 : 0.2
    }
  }

  const update = (dt) => {
    if (alive <= 0) return
    alive = 0
    for (let i = 0; i < maxParticles; i += 1) {
      if (lifes[i] <= 0) continue
      lifes[i] -= dt
      if (lifes[i] <= 0) {
        alphas[i] = 0
        continue
      }
      alive += 1
      const k = lifes[i] / maxLifes[i]
      if (kinds[i] === 1) {
        velocities[i * 3 + 1] -= 2.6 * dt
        velocities[i * 3] += Math.sin(lifes[i] * 9 + i) * 0.9 * dt
        alphas[i] = Math.min(1, k * 2.2)
      } else {
        velocities[i * 3] *= 1 - 2.5 * dt
        velocities[i * 3 + 2] *= 1 - 2.5 * dt
        velocities[i * 3 + 1] *= 1 - 1.5 * dt
        sizes[i] += dt * 0.35
        alphas[i] = k * 0.55
      }
      positions[i * 3] += velocities[i * 3] * dt
      positions[i * 3 + 1] = Math.max(0.03, positions[i * 3 + 1] + velocities[i * 3 + 1] * dt)
      positions[i * 3 + 2] += velocities[i * 3 + 2] * dt
    }
    geometry.attributes.position.needsUpdate = true
    geometry.attributes.aSize.needsUpdate = true
    geometry.attributes.aAlpha.needsUpdate = true
    geometry.attributes.aColor.needsUpdate = true
  }

  return {
    points,
    emit,
    update,
    isActive: () => alive > 0,
    setPointScale(drawingBufferHeight, fovDeg) {
      material.uniforms.uPointScale.value = drawingBufferHeight / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2))
    },
    dispose() {
      geometry.dispose()
      material.dispose()
    }
  }
}

// === 后处理：一个 pass 完成描边 + 调色 + 暗角 + 色调映射 ===
export function createMapPostFx(renderer, { samples = 4 } = {}) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2())
  const depthTexture = new THREE.DepthTexture(size.x, size.y)
  depthTexture.type = THREE.UnsignedIntType
  const target = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    samples,
    depthBuffer: true,
    depthTexture
  })
  const material = new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: target.texture },
      tDepth: { value: depthTexture },
      uTexel: { value: new THREE.Vector2(1 / size.x, 1 / size.y) },
      uNear: { value: 0.5 },
      uFar: { value: 160 },
      uFadeNear: { value: 24 },
      uFadeFar: { value: 55 },
      uFogNear: { value: 24 },
      uFogFar: { value: 62 },
      uOutline: { value: 0.26 },
      uSaturation: { value: 1.0 },
      uContrast: { value: 1.06 },
      uVignette: { value: 0.55 }
    },
    vertexShader: `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4( position.xy, 0.0, 1.0 );
}`,
    fragmentShader: `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uTexel;
uniform float uNear;
uniform float uFar;
uniform float uFadeNear;
uniform float uFadeFar;
uniform float uFogNear;
uniform float uFogFar;
uniform float uOutline;
uniform float uSaturation;
uniform float uContrast;
uniform float uVignette;
varying vec2 vUv;
float linearDepth( vec2 uv ) {
  float z = texture2D( tDepth, uv ).x * 2.0 - 1.0;
  return ( 2.0 * uNear * uFar ) / ( uFar + uNear - z * ( uFar - uNear ) );
}
void main() {
  vec4 color = texture2D( tColor, vUv );
  float dc = linearDepth( vUv );
  float dl = linearDepth( vUv - vec2( uTexel.x, 0.0 ) );
  float dr = linearDepth( vUv + vec2( uTexel.x, 0.0 ) );
  float dd = linearDepth( vUv - vec2( 0.0, uTexel.y ) );
  float du = linearDepth( vUv + vec2( 0.0, uTexel.y ) );
  // 深度拉普拉斯：平面上接近 0，只在轮廓/折角处跳变，比一阶差分更不容易把斜地面描黑
  float lap = abs( dl + dr + dd + du - 4.0 * dc ) / max( dc, 0.001 );
  float edge = smoothstep( 0.04, 0.16, lap );
  edge *= 1.0 - smoothstep( uFadeNear, uFadeFar, dc );
  color.rgb *= 1.0 - edge * uOutline;
  float luma = dot( color.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
  color.rgb = mix( vec3( luma ), color.rgb, uSaturation );
  color.rgb = ( color.rgb - 0.18 ) * uContrast + 0.18;
  color.rgb = max( color.rgb, 0.0 );
  vec2 q = vUv - 0.5;
  color.rgb *= 1.0 - dot( q, q ) * uVignette;
  gl_FragColor = vec4( color.rgb, 1.0 );
  #ifdef TONE_MAPPING
  // 旧管线里天空不做色调映射、雾在色调映射之后混入；这里按深度还原，避免天空和远景发灰
  float rawDepth = texture2D( tDepth, vUv ).x;
  float fogMix = rawDepth >= 0.99999 ? 1.0 : smoothstep( uFogNear, uFogFar, dc );
  gl_FragColor.rgb = mix( toneMapping( gl_FragColor.rgb ), gl_FragColor.rgb, fogMix );
  #endif
  #include <colorspace_fragment>
}`,
    depthTest: false,
    depthWrite: false
  })
  const quadGeometry = new THREE.BufferGeometry()
  quadGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3))
  const quad = new THREE.Mesh(quadGeometry, material)
  quad.frustumCulled = false
  const quadScene = new THREE.Scene()
  quadScene.add(quad)
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const _size = new THREE.Vector2()

  return {
    material,
    setFade(near, far) {
      material.uniforms.uFadeNear.value = near
      material.uniforms.uFadeFar.value = far
    },
    setFog(near, far) {
      material.uniforms.uFogNear.value = near
      material.uniforms.uFogFar.value = far
    },
    syncSize() {
      renderer.getDrawingBufferSize(_size)
      if (_size.x === target.width && _size.y === target.height) return
      target.setSize(_size.x, _size.y)
      // 描边固定 1 物理像素：高 DPR 下更细、更柔和
      const thickness = 1
      material.uniforms.uTexel.value.set(thickness / _size.x, thickness / _size.y)
    },
    render(scene, camera) {
      material.uniforms.uNear.value = camera.near
      material.uniforms.uFar.value = camera.far
      renderer.setRenderTarget(target)
      renderer.render(scene, camera)
      renderer.setRenderTarget(null)
      renderer.render(quadScene, quadCamera)
    },
    dispose() {
      target.dispose()
      depthTexture.dispose()
      quadGeometry.dispose()
      material.dispose()
    }
  }
}
