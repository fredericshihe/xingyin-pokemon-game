// 程序化林地 / 草地点缀的标准尺寸。渲染器（ThreeLowPolyMap）、碰撞镜像
// （mapVisualCollision）和尺寸统一（mapModelScaleNormalization）共用这一份，
// 同一模型在所有地图里保持同一尺寸，只有 ±6% 的确定性自然浮动。
import { getTreeModelScale } from './modelScaleReference.js'

export const MODEL_SCALE_JITTER = 0.06

export const PROCEDURAL_MODEL_SCALES = {
  bush: 1.05,
  stone: 0.82,
  rock: 0.95,
  treeOak: getTreeModelScale('treeOak') ?? 0.9,
  treeDefault: getTreeModelScale('treeDefault') ?? 0.9,
  treePine: getTreeModelScale('treePine') ?? 0.9,
  grassLarge: 0.9,
  flowerYellow: 0.74,
  flowerRed: 0.74,
  mushroom: 0.76
}

function hash01(x, y, salt) {
  const v = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453
  return v - Math.floor(v)
}

export function modelScaleJitter(x, y, salt = 0) {
  return 1 + (hash01(x, y, salt) - 0.5) * 2 * MODEL_SCALE_JITTER
}

export function getProceduralModelScale(key, x, y, salt = 0) {
  return (PROCEDURAL_MODEL_SCALES[key] ?? 1) * modelScaleJitter(x, y, salt)
}
