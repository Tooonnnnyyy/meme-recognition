import { isClientId, isFileKey, isNodeId } from './figma.js'

// A Figma study travels in the participant link (?study=...), so nothing has
// to be hosted or stored: the researcher builds it on the setup screen.

const MAX_TASKS = 10
const isText = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max
const optionalNode = value => value == null || isNodeId(value)

// Throws with a plain message when the study is not usable.
export function checkStudy(study) {
  if (!study || typeof study !== 'object') throw new Error('The study is empty.')
  if (study.kind !== 'figma') throw new Error('Only Figma studies can be shared by link.')
  if (!isText(study.title, 120)) throw new Error('The study needs a title (up to 120 characters).')
  const { figma } = study
  if (!figma || !isFileKey(figma.fileKey) || !isText(figma.name, 200) || !optionalNode(figma.startNodeId)) throw new Error('The Figma prototype link is not valid.')
  if (!isClientId(figma.clientId)) throw new Error('The Figma client ID is missing or not valid.')
  if (!Array.isArray(study.tasks) || !study.tasks.length || study.tasks.length > MAX_TASKS) throw new Error(`The study needs 1 to ${MAX_TASKS} tasks.`)
  study.tasks.forEach((task, index) => {
    const name = `Task ${index + 1}`
    if (task.id !== `T${index + 1}`) throw new Error(`${name} has the wrong id.`)
    if (!isText(task.prompt, 300)) throw new Error(`${name} needs instructions (up to 300 characters).`)
    if (!optionalNode(task.start) || !optionalNode(task.successPage)) throw new Error(`${name} has a frame that is not a Figma frame link or node id.`)
    if (!Number.isInteger(task.limitSec) || task.limitSec < 30 || task.limitSec > 1800) throw new Error(`${name} needs a time limit from 30 seconds to 30 minutes.`)
  })
  return study
}

// Only the fields a study uses are kept, so a link carries nothing else.
const pick = study => ({
  id: `figma-${study.figma.fileKey}`,
  kind: 'figma',
  title: study.title.trim(),
  figma: { fileKey: study.figma.fileKey, name: study.figma.name, startNodeId: study.figma.startNodeId || null, clientId: study.figma.clientId },
  tasks: study.tasks.map(task => ({ id: task.id, prompt: task.prompt.trim(), start: task.start || null, successPage: task.successPage || null, limitSec: task.limitSec })),
})

const toBase64Url = text => btoa(String.fromCharCode(...new TextEncoder().encode(text))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fromBase64Url = text => new TextDecoder().decode(Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0)))

export const encodeStudy = study => toBase64Url(JSON.stringify(pick(checkStudy(study))))

export function decodeStudy(param) {
  let data
  try { data = JSON.parse(fromBase64Url(param)) } catch { throw new Error('This study link is damaged. Ask the researcher for a new one.') }
  return pick(checkStudy(data))
}

export const studyLink = (study, base = location.origin + location.pathname) => `${base}?study=${encodeStudy(study)}`
