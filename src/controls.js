import { translate } from './i18n/index.js'

// Labels are in lang ('en' by default), from the studio.control.* messages.
export const neutral = (lang = 'en') => ({ x: 0, z: 0, action: null, label: translate(lang, 'studio.control.noHand') })
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0))
// Scale-relative pinch works at different camera distances. Movement follows mirrored video.
export function interpret(result, center = { x: .5, y: .5 }, lang = 'en') {
  const label = key => translate(lang, `studio.control.${key}`)
  const hand = result.landmarks?.[0]
  if (!hand) return neutral(lang)
  const scale = distance(hand[0], hand[9])
  if (scale < .025) return neutral(lang)
  if (distance(hand[4], hand[8]) / scale < .28) return { ...neutral(lang), action: 'interact', label: label('pinch') }
  const gesture = result.gestures?.[0]?.[0]
  if (!gesture || gesture.score < .65) return { ...neutral(lang), label: label('uncertain') }
  if (gesture.categoryName === 'Victory') return { ...neutral(lang), action: 'jump', label: label('victory') }
  if (gesture.categoryName !== 'Open_Palm') return { ...neutral(lang), label: label('rest') }
  const dx = 1 - hand[9].x - center.x
  const dy = hand[9].y - center.y
  const axis = v => Math.abs(v) < .10 ? 0 : Math.sign(v) * Math.min(1, (Math.abs(v) - .10) / .17)
  return { x: axis(dx), z: axis(dy), action: null, label: label('steer') }
}
export function createGate() {
  let candidate = null, since = 0, fired = false
  return (action, now) => {
    if (action !== candidate) { candidate = action; since = now; fired = false }
    if (action && !fired && now - since >= 220) { fired = true; return action }
    return null
  }
}
// A station's title and text in other languages are studio.station.<id>.title
// and .text; stationText(station, 'title' or 'text', lang) gives them.
export const stations = [{ id: 'discover', x: -5, z: -4, title: 'Discover', text: 'Explore a new idea. This station can open your portfolio projects.' }, { id: 'build', x: 0, z: -6, title: 'Build', text: 'Make something real. Connect this station to a challenge or lesson.' }, { id: 'connect', x: 5, z: -4, title: 'Connect', text: 'Start a conversation. Connect this station to your contact page.' }]
export function stationText(station, field, lang = 'en') {
  const key = `studio.station.${station.id}.${field}`
  const text = translate(lang, key)
  return text === key ? station[field] : text
}
export function createWorld() { return { x: 0, z: 4, y: 0, vy: 0, yaw: 0, nearby: -1, moving: false } }
export function step(world, input, dt) {
  dt = Math.min(dt, .05)
  const length = Math.max(1, Math.hypot(input.x, input.z))
  const x = Math.max(-8, Math.min(8, world.x + input.x / length * dt * 4))
  const z = Math.max(-8, Math.min(7, world.z + input.z / length * dt * 4))
  const blocked = (a,b) => stations.some(s => Math.abs(a-s.x)<1.25 && Math.abs(b-s.z)<.85)
  if (!blocked(x,world.z)) world.x=x
  if (!blocked(world.x,z)) world.z=z
  world.moving = Math.hypot(input.x,input.z) > .05
  if (world.moving) world.yaw = Math.atan2(input.x,input.z)
  if (input.jump && world.y === 0) world.vy = 5.5
  world.vy -= 16 * dt; world.y = Math.max(0,world.y + world.vy * dt)
  if (world.y === 0) world.vy = 0
  world.nearby = stations.findIndex(s => Math.hypot(world.x-s.x,world.z-s.z) < 2.5)
}
