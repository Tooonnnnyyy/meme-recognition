// The researcher's local workspace: studies and their sessions, kept in this
// browser's IndexedDB on the researcher's own computer. Nothing is uploaded.
// A whole workspace or one study can be exported as a package file (JSON) for
// backup or to move to another computer.
import { TextError } from '../i18n/index.js'

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
    putStudy: study => done(store('studies', 'readwrite').put(study)),
    deleteStudy: async id => {
      const keys = await done(store('sessions').index('studyId').getAllKeys(id))
      const transaction = db.transaction(['studies', 'sessions'], 'readwrite')
      transaction.objectStore('studies').delete(id)
      keys.forEach(key => transaction.objectStore('sessions').delete(key))
      await new Promise((resolve, reject) => { transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error) })
    },
    listSessions: studyId => done(store('sessions').index('studyId').getAll(studyId)),
    putSession: row => done(store('sessions', 'readwrite').put(row)),
    deleteSession: key => done(store('sessions', 'readwrite').delete(key)),
  }
}

let opening = null
export function workspace() {
  if (!opening) {
    opening = (typeof indexedDB === 'undefined' ? Promise.reject(new Error('no IndexedDB')) : openDb())
      .then(indexedStore, () => memoryStore())
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

// Sessions are stored as { key, studyId, session }.
export async function saveSession(studyId, session) {
  const store = await workspace()
  const row = { key: sessionKeyOf(studyId, session), studyId, session }
  await store.putSession(row)
  return row
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

// checkSession(session) throws on a session that is not valid (the review
// screen's readSession, given as a function so this module stays UI-free).
// Existing studies with the same id are replaced; sessions are merged by key.
export async function importPackage(data, checkSession) {
  if (!data || data.format !== PACKAGE_FORMAT || !Array.isArray(data.studies) || !Array.isArray(data.sessions)) throw new TextError('study.import.notPackage')
  const store = await workspace()
  const ids = new Set()
  for (const study of data.studies) {
    if (!study || typeof study.id !== 'string' || !Array.isArray(study.tasks) || typeof study.title !== 'string') throw new TextError('study.import.damagedStudy')
    await store.putStudy(study)
    ids.add(study.id)
  }
  let sessions = 0
  for (const row of data.sessions) {
    if (!row || !ids.has(row.studyId)) continue
    const session = checkSession(JSON.stringify(row.session))
    await store.putSession({ key: sessionKeyOf(row.studyId, session), studyId: row.studyId, session })
    sessions += 1
  }
  return { studies: ids.size, sessions }
}
