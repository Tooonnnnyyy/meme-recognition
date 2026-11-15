import { isClientId, isFileKey, isNodeId } from './figma.js'
import { TextError, isLang } from '../i18n/index.js'

// A Figma study travels in the participant link (?study=...), so nothing has
// to be hosted or stored: the researcher builds it on the setup screen.

const MAX_TASKS = 10
const isText = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max
const optionalNode = value => value == null || isNodeId(value)

// Throws a TextError (its message is the English text) when the study is not
// usable, so a screen can show it in the reader's language.
export function checkStudy(study) {
  if (!study || typeof study !== 'object') throw new TextError('researcher.link.empty')
  if (study.kind !== 'figma') throw new TextError('researcher.link.notFigma')
  if (!isText(study.title, 120)) throw new TextError('researcher.link.title')
  const { figma } = study
  if (!figma || !isFileKey(figma.fileKey) || !isText(figma.name, 200) || !optionalNode(figma.startNodeId)) throw new TextError('researcher.link.prototype')
  if (!isClientId(figma.clientId)) throw new TextError('researcher.link.clientId')
  if (!Array.isArray(study.tasks) || !study.tasks.length || study.tasks.length > MAX_TASKS) throw new TextError('researcher.link.taskCount', { max: MAX_TASKS })
  study.tasks.forEach((task, index) => {
    if (task.id !== `T${index + 1}`) throw new TextError('researcher.link.taskId', { number: index + 1 })
    if (!isText(task.prompt, 300)) throw new TextError('researcher.link.taskPrompt', { number: index + 1 })
    if (!optionalNode(task.start) || !optionalNode(task.successPage)) throw new TextError('researcher.link.taskFrame', { number: index + 1 })
    if (!Number.isInteger(task.limitSec) || task.limitSec < 30 || task.limitSec > 1800) throw new TextError('researcher.link.taskLimit', { number: index + 1 })
  })
  return study
}

// A short FNV-1a hash of the study's title and tasks.
function fingerprint(study) {
  const text = JSON.stringify([study.title.trim(), study.tasks.map(task => [task.prompt.trim(), task.start || null, task.successPage || null, task.limitSec])])
  let hash = 0x811c9dc5
  for (const char of text) hash = Math.imul(hash ^ char.codePointAt(0), 0x01000193) >>> 0
  return hash.toString(36)
}

// Only the fields a study uses are kept, so a link carries nothing else.
const pick = study => ({
  // Two studies on one Figma file get different ids (title and tasks are
  // part of the id), so the report can tell them apart.
  id: `figma-${study.figma.fileKey}-${fingerprint(study)}`,
  kind: 'figma',
  lang: isLang(study.lang) ? study.lang : 'en',
  title: study.title.trim(),
  figma: { fileKey: study.figma.fileKey, name: study.figma.name, startNodeId: study.figma.startNodeId || null, clientId: study.figma.clientId },
  tasks: study.tasks.map(task => ({ id: task.id, prompt: task.prompt.trim(), start: task.start || null, successPage: task.successPage || null, limitSec: task.limitSec })),
})

const toBase64Url = text => btoa(String.fromCharCode(...new TextEncoder().encode(text))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fromBase64Url = text => new TextDecoder().decode(Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0)))

export const encodeStudy = study => toBase64Url(JSON.stringify(pick(checkStudy(study))))

export function decodeStudy(param) {
  let data
  try { data = JSON.parse(fromBase64Url(param)) } catch { throw new TextError('researcher.link.damaged') }
  return pick(checkStudy(data))
}

export const studyLink = (study, base = location.origin + location.pathname) => `${base}?study=${encodeStudy(study)}`
