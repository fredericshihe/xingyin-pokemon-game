import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { CHARACTER_IDENTITY_PROFILES, CHARACTER_MODEL_KEYS, CHARACTER_ASSET_VERSION } from './data/characterAssets.js'
import { assetUrl } from '../utils/assetUrl.js'
import { getMapInfo } from './data/mapCatalog.js'
import { getCachedModelScene, preloadModelKeysStrict } from './threeLowPolyModelCache.js'
import { CHARACTER_SURFACE_CLOCK, configureCharacterSurfaceMaterial } from './characterSurfaceMaterial.js'
import { animateLowPolyPlayer } from './playerFigureVisual.js'
import { createNpcWalkGeometry, hasNpcWalkRig, configureNpcWalkMaterial, configureNpcJointDefines, setNpcWalkGait } from './npcWalkVisual.js'
import './characterUpgradePreview.css'

/** Local art review only: no account, save, economic or gameplay writes. */
export default function CharacterUpgradePreview() {
  const [records, setRecords] = useState([]), [selected, setSelected] = useState('player_child_adventurer')
  const [query, setQuery] = useState(''), [view, setView] = useState('front'), [walking, setWalking] = useState(false)
  const [error, setError] = useState(''), [ready, setReady] = useState(false)
  const host = useRef(null), stage = useRef(null), viewRef = useRef(view), walkingRef = useRef(walking)
  viewRef.current = view; walkingRef.current = walking
  useEffect(() => {
    let cancelled = false
    fetch(assetUrl(`/assets/3d/${CHARACTER_ASSET_VERSION}/manifest.json`)).then(response => {
      if (!response.ok) throw Error('人物清单加载失败')
      return response.json()
    }).then(value => { if (!cancelled) setRecords(value.characters) }).catch(reason => setError(reason.message))
    return () => { cancelled = true }
  }, [])
  useEffect(() => {
    if (!host.current) return
    let disposed = false, frame = null
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setClearColor('#e9eee8')
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(30, 1, .05, 50)
    camera.position.set(0, 1.1, 4.2); camera.lookAt(0, .8, 0)
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8c9d84, 2.2))
    const light = new THREE.DirectionalLight(0xffeee0, 2.7); light.position.set(-3, 5, 4); scene.add(light)
    const fill = new THREE.DirectionalLight(0xd9e8ff, 1.0); fill.position.set(3, 2, -2); scene.add(fill)
    const ground = new THREE.Mesh(new THREE.CircleGeometry(1.4, 64), new THREE.MeshStandardMaterial({ color: '#d8dfd3', roughness: 1 }))
    ground.rotation.x = -Math.PI / 2; ground.position.y = -.015; scene.add(ground)
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(.27, 32), new THREE.MeshBasicMaterial({ color: '#52654d', transparent: true, opacity: .13, depthWrite: false }))
    shadow.rotation.x = -Math.PI / 2; shadow.scale.set(1.2, .7, 1); shadow.position.y = .001; scene.add(shadow)
    host.current.appendChild(renderer.domElement)
    const resize = () => { const width = host.current.clientWidth, height = host.current.clientHeight; renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix() }
    const observer = new ResizeObserver(resize); observer.observe(host.current); resize()
    stage.current = { scene, figure: null }
    let lastTime = 0
    const tick = time => {
      if (disposed) return
      CHARACTER_SURFACE_CLOCK.value = time / 1000
      const figure = stage.current.figure
      if (figure) {
        figure.rotation.y = { front: 0, left: Math.PI / 2, right: -Math.PI / 2, back: Math.PI }[viewRef.current] ?? time * .00025
        if (figure.userData.rig) animateLowPolyPlayer(figure, walkingRef.current, time, 1 / 60)
        const npc = figure.userData.npcWalk
        if (npc) {
          const dt = Math.min(.05, (time - (lastTime || time)) / 1000)
          npc.blend = THREE.MathUtils.lerp(npc.blend, walkingRef.current ? 1 : 0, 1 - Math.exp(-dt * 14))
          if (walkingRef.current) npc.phase += dt * Math.PI * 2 * 1.5
          setNpcWalkGait(npc.mesh, 0, { phase: npc.phase, blend: npc.blend, scale: figure.scale.x })
        }
      }
      lastTime = time
      renderer.render(scene, camera); frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      disposed = true; cancelAnimationFrame(frame); observer.disconnect()
      stage.current?.figure?.traverse(child => { child.geometry?.dispose(); if (child.material) (Array.isArray(child.material) ? child.material : [child.material]).forEach(material => material.dispose()) })
      ground.geometry.dispose(); ground.material.dispose(); shadow.geometry.dispose(); shadow.material.dispose()
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); stage.current = null
    }
  }, [])
  useEffect(() => {
    let cancelled = false
    setReady(false); setError('')
    preloadModelKeysStrict([selected], { allowMissingPlaceholder: false, maxRounds: 2, retries: 1, shouldContinue: () => !cancelled }).then((loaded) => {
      if (cancelled || !stage.current) return
      if (!loaded.ok) throw Error('人物模型未完整加载，请刷新后重试')
      const template = getCachedModelScene(selected)
      if (!template) throw Error('该人物模型未加载')
      const figure = template.clone(true), parts = {}, base = {}
      figure.traverse(child => {
        if (!child.isMesh) return
        child.geometry = child.geometry.clone(); child.material = child.material.clone()
        configureCharacterSurfaceMaterial(child.material, child.geometry)
        parts[child.name] = child; base[child.name] = { position: child.position.clone(), rotation: child.rotation.clone(), scale: child.scale.clone() }
      })
      if (selected === 'player_child_adventurer') figure.userData.rig = { parts, base, walkBlend: 0, authored: true }
      else {
        const source = Object.values(parts).find(mesh => hasNpcWalkRig(mesh.geometry))
        if (source) {
          const geometry = createNpcWalkGeometry(source.geometry, 1)
          configureNpcWalkMaterial(source.material); configureNpcJointDefines(source.material, geometry)
          const mesh = new THREE.InstancedMesh(geometry, source.material, 1)
          mesh.setMatrixAt(0, new THREE.Matrix4())
          mesh.position.copy(source.position); mesh.quaternion.copy(source.quaternion); mesh.scale.copy(source.scale)
          source.parent.add(mesh); source.parent.remove(source); source.geometry.dispose()
          figure.userData.npcWalk = { mesh, phase: 0, blend: 0 }
        }
      }
      const bounds = new THREE.Box3().setFromObject(figure), height = bounds.max.y - bounds.min.y
      figure.scale.setScalar(1.55 / height); figure.position.y = -bounds.min.y * figure.scale.y
      const old = stage.current.figure
      if (old) { stage.current.scene.remove(old); old.traverse(child => { child.geometry?.dispose(); child.material?.dispose() }) }
      stage.current.scene.add(figure); stage.current.figure = figure
      setReady(true)
    }).catch(reason => { if (!cancelled) setError(reason.message) })
    return () => { cancelled = true }
  }, [selected])
  const record = records.find(record => record.id === selected)
  const identity = CHARACTER_IDENTITY_PROFILES.find(profile => profile.id === selected)
  const filtered = records.filter(record => [record.name, record.id, record.mapId].join(' ').toLowerCase().includes(query.toLowerCase()))
  return <main className="character-review" data-character-id={selected} data-character-ready={ready}>
    <aside><div className="character-review-title"><small>BLENDER · 人物精修</small><h1>星音人物图册</h1><p>109 个角色资源 · 地图中的 96 位人物各有独立造型</p></div>
      <input aria-label="搜索人物" value={query} placeholder="搜索姓名或人物模型…" onChange={event => setQuery(event.target.value)} />
      <div className="character-review-list">{filtered.map(record => <button type="button" key={record.id} className={record.id === selected ? 'selected' : ''} onClick={() => setSelected(record.id)}><strong>{record.name}</strong><span>{record.eventId ? '独立地图人物' : record.id.startsWith('elite_') ? '道馆人物' : '主角 / 基础造型'}</span></button>)}</div>
    </aside><section className="character-review-stage"><header><div><h2>{record?.name || '主角'}</h2><p>{identity ? `${getMapInfo(identity.mapId).displayName} · 独立人物造型` : selected}</p></div><a href={`/map-runtime-preview?map=${identity?.mapId || 'GodotMap'}&perf=1`}>在地图中查看</a></header>
      <div className="character-review-canvas" ref={host} />
      <div className="character-review-controls">{[['front','正面'],['left','左侧'],['right','右侧'],['back','背面'],['orbit','旋转']].map(([key,label]) => <button type="button" key={key} aria-pressed={view === key} onClick={() => setView(key)}>{label}</button>)}<button type="button" disabled={selected.startsWith('elite_') || record?.rank === 'boss' || selected === 'trainer_boss'} aria-pressed={walking} onClick={() => setWalking(!walking)}>行走动作</button></div>
      <footer>{error ? <span role="alert">{error}</span> : !ready ? '正在加载人物…' : '布料、皮肤、皮革和金属分区材质 · 本地造型预览'}<span>{record?.triangles?.toLocaleString()} 三角形 · {record ? Math.round(record.bytes / 1024) : '—'} KB</span></footer>
    </section>
  </main>
}
