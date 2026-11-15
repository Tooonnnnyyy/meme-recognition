import React, { useEffect, useRef, useState } from 'react'
import { LabHeader, studyHref } from './LabNav'
import { exportPackage, importPackage, saveStudy, sessionsOf, workspace } from './workspace'
import { demoStudy, METHODS, newStudy, SOURCES } from '../research/studyModel'
import { readSession } from '../research/Review'

export const download = (text, name, type = 'application/json') => {
  const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type })), download: name })
  link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}
export const slugOf = text => (text || 'study').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'study'

// The workspace home: every study in this browser, with its progress.
export function Studies() {
  const [rows, setRows] = useState(null)
  const [persistent, setPersistent] = useState(true)
  const [message, setMessage] = useState('')
  const [confirming, setConfirming] = useState(null)
  const fileRef = useRef(null)

  const refresh = async () => {
    const store = await workspace()
    setPersistent(store.persistent)
    const studies = (await store.listStudies()).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    setRows(await Promise.all(studies.map(async study => {
      const sessions = await sessionsOf(study.id)
      return { study, done: sessions.filter(session => !session.pilot).length, pilots: sessions.filter(session => session.pilot).length }
    })))
  }
  useEffect(() => { refresh() }, [])

  const create = async study => {
    const saved = await saveStudy(study)
    location.hash = studyHref('study', saved.id, 'plan')
  }
  const remove = async id => {
    await (await workspace()).deleteStudy(id)
    setConfirming(null)
    setMessage('The study and its sessions were deleted from this browser.')
    refresh()
  }
  const importFile = async file => {
    try {
      const result = await importPackage(JSON.parse(await file.text()), readSession)
      setMessage(`Imported ${result.studies} ${result.studies === 1 ? 'study' : 'studies'} and ${result.sessions} ${result.sessions === 1 ? 'session' : 'sessions'}.`)
      refresh()
    } catch (problem) {
      setMessage(problem instanceof SyntaxError ? 'That file is not valid JSON.' : problem.message)
    }
  }
  const exportAll = async () => download(JSON.stringify(await exportPackage()), `usability-lab-backup-${new Date().toISOString().slice(0, 10)}.json`)

  return <div className="screen">
    <LabHeader>
      <label className="btn ghost file-button" htmlFor="import-package">Import<input ref={fileRef} id="import-package" type="file" accept="application/json,.json" onChange={event => { const [file] = event.target.files; event.target.value = ''; if (file) importFile(file) }} /></label>
      {rows?.length > 0 && <button className="btn ghost" onClick={exportAll}>Back up all</button>}
    </LabHeader>
    <main className="lab-main">
      <section className="lab-intro">
        <span className="kicker">Usability Lab</span>
        <h1>Plan, run and report usability tests</h1>
        <p className="lede">Everything stays in this browser on this computer: no account, no upload. Moderate sessions here with any prototype or app, or send a link for unmoderated Figma studies.</p>
        <div className="actions">
          <button className="btn primary" onClick={() => create(newStudy())}>New study</button>
          <button className="btn secondary" onClick={() => create(demoStudy())}>Try the demo study</button>
        </div>
        {!persistent && <p className="warning" role="alert">This browser is not letting the page store data (private window or blocked storage). Studies last only while this tab is open; back them up before closing it.</p>}
        {message && <p className="muted small" role="status">{message}</p>}
      </section>
      {rows === null && <p className="muted">Loading your studies…</p>}
      {rows?.length === 0 && <p className="muted">No studies yet. Start with the demo to see the whole flow in a few minutes.</p>}
      {rows?.length > 0 && <ul className="study-list">
        {rows.map(({ study, done, pilots }) => <li key={study.id} className="panel study-card">
          <div>
            <a className="study-title" href={studyHref('study', study.id, 'plan')}>{study.title || 'Untitled study'}</a>
            <p className="muted small">{METHODS[study.method]} · {SOURCES[study.source.kind]} · {study.tasks.length} {study.tasks.length === 1 ? 'task' : 'tasks'}</p>
          </div>
          <div className="progress" aria-label={`${done} of ${study.plannedParticipants} participants done`}>
            <b>{done}/{study.plannedParticipants}</b><span className="muted small">participants{pilots ? ` · ${pilots} pilot` : ''}</span>
            <div className="bar"><i className="bar-fill" style={{ width: `${Math.min(1, done / Math.max(1, study.plannedParticipants)) * 100}%` }} /></div>
          </div>
          <div className="actions">
            <a className="btn primary small-btn" href={studyHref('study', study.id, 'run')}>Run</a>
            <a className="btn ghost small-btn" href={studyHref('study', study.id, 'results')}>Results</a>
            <button className="btn ghost small-btn" onClick={async () => download(JSON.stringify(await exportPackage([study.id])), `${slugOf(study.title)}.usability-lab.json`)}>Export</button>
            {confirming === study.id
              ? <><button className="btn danger small-btn" onClick={() => remove(study.id)}>Delete study and sessions</button><button className="btn ghost small-btn" autoFocus onClick={() => setConfirming(null)}>Cancel</button></>
              : <button className="btn ghost small-btn" onClick={() => setConfirming(study.id)}>Delete</button>}
          </div>
        </li>)}
      </ul>}
    </main>
  </div>
}
