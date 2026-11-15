import React, { useEffect, useRef, useState } from 'react'
import { LabHeader, studyHref } from './LabNav'
import { exportPackage, importPackage, saveStudy, sessionsOf, workspace } from './workspace'
import { demoStudy, newStudy } from '../research/studyModel'
import { readSession } from '../research/Review'
import { errorText } from '../i18n/index.js'
import { useT } from '../i18n/react.jsx'

export const download = (text, name, type = 'application/json') => {
  const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type })), download: name })
  link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}
export const slugOf = text => (text || 'study').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'study'

// The workspace home: every study in this browser, with its progress.
export function Studies() {
  const t = useT()
  const [rows, setRows] = useState(null)
  const [persistent, setPersistent] = useState(true)
  // { key, vars } or { error }, shown in the current language.
  const [message, setMessage] = useState(null)
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
    setMessage({ key: 'lab.studies.deleted' })
    refresh()
  }
  const importFile = async file => {
    try {
      const result = await importPackage(JSON.parse(await file.text()), readSession)
      setMessage({ key: 'lab.studies.imported', vars: { studies: result.studies, sessions: result.sessions } })
      refresh()
    } catch (problem) {
      setMessage(problem instanceof SyntaxError ? { key: 'lab.studies.notJson' } : { error: problem })
    }
  }
  const exportAll = async () => download(JSON.stringify(await exportPackage()), `usability-lab-backup-${new Date().toISOString().slice(0, 10)}.json`)

  return <div className="screen">
    <LabHeader>
      <label className="btn ghost file-button" htmlFor="import-package">{t('lab.studies.import')}<input ref={fileRef} id="import-package" type="file" accept="application/json,.json" onChange={event => { const [file] = event.target.files; event.target.value = ''; if (file) importFile(file) }} /></label>
      {rows?.length > 0 && <button className="btn ghost" onClick={exportAll}>{t('lab.studies.backupAll')}</button>}
    </LabHeader>
    <main className="lab-main">
      <section className="lab-intro">
        <span className="kicker">Usability Lab</span>
        <h1>{t('lab.studies.title')}</h1>
        <p className="lede">{t('lab.studies.lede')}</p>
        <div className="actions">
          <button className="btn primary" onClick={() => create(newStudy({ lang: t.lang }))}>{t('lab.studies.new')}</button>
          <button className="btn secondary" onClick={() => create(demoStudy(t.lang))}>{t('lab.studies.demo')}</button>
        </div>
        {!persistent && <p className="warning" role="alert">{t('lab.studies.notPersistent')}</p>}
        {message && <p className="muted small" role="status">{message.error ? errorText(t, message.error) : t(message.key, message.vars)}</p>}
      </section>
      {rows === null && <p className="muted">{t('lab.studies.loading')}</p>}
      {rows?.length === 0 && <p className="muted">{t('lab.studies.empty')}</p>}
      {rows?.length > 0 && <ul className="study-list">
        {rows.map(({ study, done, pilots }) => <li key={study.id} className="panel study-card">
          <div>
            <a className="study-title" href={studyHref('study', study.id, 'plan')}>{study.title || t('lab.untitled')}</a>
            <p className="muted small">{t(`study.method.${study.method}`)} · {t(`study.source.${study.source.kind}`)} · {t('lab.tasks', { count: study.tasks.length })}</p>
          </div>
          <div className="progress" aria-label={t('lab.studies.progress', { done, planned: study.plannedParticipants })}>
            <b>{done}/{study.plannedParticipants}</b><span className="muted small">{t('lab.studies.participants')}{pilots ? ` · ${t('lab.studies.pilots', { count: pilots })}` : ''}</span>
            <div className="bar"><i className="bar-fill" style={{ width: `${Math.min(1, done / Math.max(1, study.plannedParticipants)) * 100}%` }} /></div>
          </div>
          <div className="actions">
            <a className="btn primary small-btn" href={studyHref('study', study.id, 'run')}>{t('lab.tab.run')}</a>
            <a className="btn ghost small-btn" href={studyHref('study', study.id, 'results')}>{t('lab.tab.results')}</a>
            <button className="btn ghost small-btn" onClick={async () => download(JSON.stringify(await exportPackage([study.id])), `${slugOf(study.title)}.usability-lab.json`)}>{t('lab.studies.export')}</button>
            {confirming === study.id
              ? <><button className="btn danger small-btn" onClick={() => remove(study.id)}>{t('lab.studies.deleteConfirm')}</button><button className="btn ghost small-btn" autoFocus onClick={() => setConfirming(null)}>{t('lab.cancel')}</button></>
              : <button className="btn ghost small-btn" onClick={() => setConfirming(study.id)}>{t('lab.delete')}</button>}
          </div>
        </li>)}
      </ul>}
    </main>
  </div>
}
