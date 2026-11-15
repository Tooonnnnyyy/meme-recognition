// The researcher's local workspace: studies and their sessions, kept in this
// browser's IndexedDB on the researcher's own computer. Nothing is uploaded.
// A whole workspace or one study can be exported as a package file (JSON) for
// backup or to move to another computer.
import { TextError, isLang } from '../i18n/index.js'
import { METHODS, newStudy, newTask, POST_SURVEYS, SOURCES, STUDY_FORMAT } from '../research/studyModel.js'
import { reviewCount } from '../research/studyReport.js'
import { isFinished } from '../research/sessionStatus.js'

export const PACKAGE_FORMAT = 'usability-lab/package@1'
const DB_NAME = 'usability-lab'
const DB_VERSION = 1

export const sessionKeyOf = (studyId, session) => `${studyId}|${session.participant}|${session.startedAt}`

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('studies')) db.createObjectStore('studies', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'key' }).createIndex('studyId', 'studyId')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

const done = request => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})

// IndexedDB when the browser allows it; otherwise (private windows in some
// browsers, blocked storage) a store that lives only while the tab is open,
// which the UI then warns about.
function memoryStore() {
  const studies = new Map()
  const sessions = new Map()
  return {
    persistent: false,
    listStudies: async () => [...studies.values()],
    getStudy: async id => studies.get(id) || null,
    putStudy: async study => { studies.set(study.id, study) },
    deleteStudy: async id => { studies.delete(id); [...sessions.values()].filter(row => row.studyId === id).forEach(row => sessions.delete(row.key)) },
    listSessions: async studyId => [...sessions.values()].filter(row => row.studyId === studyId),
    getSession: async key => sessions.get(key) || null,
    putSession: async row => { sessions.set(row.key, row) },
    deleteSession: async key => { sessions.delete(key) },
  }
}

function indexedStore(db) {
  const store = (name, mode = 'readonly') => db.transaction(name, mode).objectStore(name)
  return {
    persistent: true,
    listStudies: () => done(store('studies').getAll()),
    getStudy: async id => (await done(store('studies').get(id))) || null,
    // Committed at once, so a save made as the page closes is not lost.
    putStudy: study => {
      const studies = store('studies', 'readwrite')
      const request = studies.put(study)
      studies.transaction.commit?.()
      return done(request)
    },
    deleteStudy: async id => {
      const keys = await done(store('sessions').index('studyId').getAllKeys(id))
      const transaction = db.transaction(['studies', 'sessions'], 'readwrite')
      transaction.objectStore('studies').delete(id)
      keys.forEach(key => transaction.objectStore('sessions').delete(key))
      await new Promise((resolve, reject) => { transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error) })
    },
    listSessions: studyId => done(store('sessions').index('studyId').getAll(studyId)),
    getSession: async key => (await done(store('sessions').get(key))) || null,
    putSession: row => done(store('sessions', 'readwrite').put(row)),
    deleteSession: key => done(store('sessions', 'readwrite').delete(key)),
  }
}

// Studies are completed from newStudy()'s defaults as they are read, so one
// stored by an older version (no source, no questionnaire…) still shows. A
// study whose tasks cannot be read keeps its title, with no tasks, so it can
// still be opened, backed up or deleted.
const readable = study => normalizeStudy(study) ?? normalizeStudy({ ...study, format: STUDY_FORMAT, title: typeof study?.title === 'string' ? study.title : '', tasks: [] })
const readsNormalized = store => ({
  ...store,
  listStudies: async () => (await store.listStudies()).map(readable).filter(Boolean),
  getStudy: async id => { const study = await store.getStudy(id); return study ? readable(study) : null },
})

let opening = null
export function workspace() {
  if (!opening) {
    opening = (typeof indexedDB === 'undefined' ? Promise.reject(new Error('no IndexedDB')) : openDb())
      .then(indexedStore, () => memoryStore())
      .then(readsNormalized)
      .then(async store => {
        // Ask the browser not to clear this data under storage pressure.
        try { if (store.persistent) await navigator.storage?.persist?.() } catch { /* best effort */ }
        return store
      })
  }
  return opening
}

export async function saveStudy(study) {
  const store = await workspace()
  const saved = { ...study, updatedAt: new Date().toISOString() }
  await store.putStudy(saved)
  return saved
}

// Sessions are stored as { key, studyId, session }. saveSession replaces the
// stored copy: the console saves as it goes and the review screen saves the
// reviews.
export async function saveSession(studyId, session) {
  const store = await workspace()
  const row = { key: sessionKeyOf(studyId, session), studyId, session }
  await store.putSession(row)
  return row
}

// Whether a copy of a session that arrives (a results file added again, a
// package) should replace the stored copy of the same session. The copy with
// more reviews wins, as in the report; with as many, a finished copy beats an
// unfinished one, then the copy with more recorded. Otherwise the stored copy
// stays, so reviews made here are never lost.
const recorded = session => (session.tasks || []).filter(task => task?.end != null).length + (session.notes?.length || 0) + (session.events?.length || 0)
export function replaces(incoming, stored) {
  if (!stored) return true
  const reviews = reviewCount(incoming) - reviewCount(stored)
  if (reviews) return reviews > 0
  if (isFinished(incoming) !== isFinished(stored)) return isFinished(incoming)
  return recorded(incoming) > recorded(stored)
}

// A session from outside (a participant's results file). Returns what
// happened: 'added', 'replaced' (the new copy had more reviews) or 'kept'
// (the copy already here stays), and the kept copy's reviewed moments.
export async function addSession(studyId, session) {
  const store = await workspace()
  const key = sessionKeyOf(studyId, session)
  const stored = (await store.getSession(key))?.session
  if (stored && !replaces(session, stored)) return { status: 'kept', session: stored, reviews: reviewCount(stored) }
  await store.putSession({ key, studyId, session })
  return { status: stored ? 'replaced' : 'added', session, reviews: reviewCount(session) }
}

export async function deleteSession(studyId, session) {
  await (await workspace()).deleteSession(sessionKeyOf(studyId, session))
}

export async function sessionsOf(studyId) {
  const store = await workspace()
  return (await store.listSessions(studyId)).map(row => row.session).sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)))
}

// A package holds studies and their sessions. exportPackage(ids) limits it to
// some studies; no ids exports everything.
export async function exportPackage(ids) {
  const store = await workspace()
  const studies = (await store.listStudies()).filter(study => !ids || ids.includes(study.id))
  const sessions = []
  for (const study of studies) (await store.listSessions(study.id)).forEach(row => sessions.push({ studyId: row.studyId, session: row.session }))
  return { format: PACKAGE_FORMAT, exportedAt: new Date().toISOString(), studies, sessions }
}

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const textOr = (value, fallback) => (typeof value === 'string' ? value : fallback)
const nodeOr = value => (typeof value === 'string' && value ? value : null)

// A study from a package, completed from newStudy()'s defaults, so a study
// written by hand or by an older version shows like any other. null when it
// cannot be used: no id, title or task list, a task without instructions, or
// another study format.
export function normalizeStudy(study) {
  if (!isRecord(study) || typeof study.id !== 'string' || !study.id || typeof study.title !== 'string' || !Array.isArray(study.tasks)) return null
  if (study.format != null && study.format !== STUDY_FORMAT) return null
  if (!study.tasks.every(task => isRecord(task) && typeof task.prompt === 'string')) return null
  const base = newStudy({ lang: isLang(study.lang) ? study.lang : 'en' })
  const kind = isRecord(study.source) && Object.hasOwn(SOURCES, study.source.kind) ? study.source.kind : 'none'
  const figma = isRecord(study.source?.figma) ? study.source.figma : null
  const q = isRecord(study.questionnaire) ? study.questionnaire : {}
  const consent = isRecord(study.consent) ? study.consent : {}
  const planned = study.plannedParticipants
  return {
    ...base,
    ...study,
    format: STUDY_FORMAT,
    method: Object.hasOwn(METHODS, study.method) ? study.method : base.method,
    source: figma ? { kind, figma: { ...figma, fileKey: nodeOr(figma.fileKey), name: textOr(figma.name, ''), startNodeId: nodeOr(figma.startNodeId), clientId: textOr(figma.clientId, '') } } : { kind },
    tasks: study.tasks.map((task, index) => ({
      ...newTask(index + 1),
      ...task,
      id: typeof task.id === 'string' && task.id ? task.id : `T${index + 1}`,
      success: textOr(task.success, ''),
      limitSec: Number.isInteger(task.limitSec) ? task.limitSec : 300,
      start: nodeOr(task.start),
      successPage: nodeOr(task.successPage),
    })),
    questionnaire: { seq: typeof q.seq === 'boolean' ? q.seq : true, post: Object.hasOwn(POST_SURVEYS, q.post) ? q.post : 'sus' },
    counterbalance: study.counterbalance === true,
    plannedParticipants: Number.isInteger(planned) && planned >= 1 && planned <= 100 ? planned : base.plannedParticipants,
    consent: Object.fromEntries(Object.entries(base.consent).map(([key, value]) => [key, key === 'durationMin'
      ? (Number.isFinite(consent.durationMin) && consent.durationMin >= 5 && consent.durationMin <= 240 ? consent.durationMin : value)
      : textOr(consent[key], value)])),
    createdAt: textOr(study.createdAt, base.createdAt),
  }
}

const timeOf = value => {
  const time = Date.parse(value)
  return Number.isNaN(time) ? -Infinity : time
}

// checkSession(session) throws on a session that is not valid (the review
// screen's readSession, given as a function so this module stays UI-free).
// Everything is checked before anything is written, so a damaged package
// changes nothing. A study already here that was changed later than the
// package's copy is kept; a session already here is kept unless the
// package's copy replaces() it, so reviews made here are not lost.
// Returns { studies, sessions } written, plus, when there were any,
// keptStudies, keptSessions and skipped (sessions whose study is not in the
// package).
export async function importPackage(data, checkSession) {
  if (!data || data.format !== PACKAGE_FORMAT || !Array.isArray(data.studies) || !Array.isArray(data.sessions)) throw new TextError('study.import.notPackage')
  const studies = data.studies.map(study => {
    const normal = normalizeStudy(study)
    if (!normal) throw new TextError('study.import.damagedStudy')
    return { normal, updatedAt: study.updatedAt }
  })
  const ids = new Set(studies.map(({ normal }) => normal.id))
  let skipped = 0
  const sessions = []
  data.sessions.forEach((row, index) => {
    if (!isRecord(row) || !ids.has(row.studyId)) { skipped += 1; return }
    try {
      sessions.push({ studyId: row.studyId, session: checkSession(JSON.stringify(row.session)) })
    } catch (problem) {
      const participant = typeof row.session?.participant === 'string' && row.session.participant ? row.session.participant : `#${index + 1}`
      throw Object.assign(new TextError('lab.import.badSession', { participant }), { cause: problem })
    }
  })

  const store = await workspace()
  const result = { studies: 0, sessions: 0, keptStudies: 0, keptSessions: 0, skipped }
  for (const { normal, updatedAt } of studies) {
    const stored = await store.getStudy(normal.id)
    if (stored && timeOf(stored.updatedAt) > timeOf(updatedAt)) { result.keptStudies += 1; continue }
    await store.putStudy(normal)
    result.studies += 1
  }
  for (const { studyId, session } of sessions) {
    const key = sessionKeyOf(studyId, session)
    if (!replaces(session, (await store.getSession(key))?.session)) { result.keptSessions += 1; continue }
    await store.putSession({ key, studyId, session })
    result.sessions += 1
  }
  // The counts of what was kept or skipped appear only when there were some.
  return Object.fromEntries(Object.entries(result).filter(([key, value]) => value || key === 'studies' || key === 'sessions'))
}
