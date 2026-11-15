import React, { useEffect, useState } from 'react'
import { LabHeader } from './LabNav'
import { saveSession, sessionKeyOf, sessionsOf, workspace } from './workspace'
import { Review } from '../research/Review'
import { Report } from '../research/Report'
import { useT } from '../i18n/react.jsx'

// The review and report screens, opened on the workspace's own data. Reviews
// are saved back to the workspace as they are made.
function useStudy(id) {
  const [state, setState] = useState({ study: null, sessions: null })
  useEffect(() => {
    (async () => {
      const study = await (await workspace()).getStudy(id)
      setState({ study: study || false, sessions: study ? await sessionsOf(id) : [] })
    })()
  }, [id])
  return state
}

// what: the key of the heading, lab.study.missing or lab.session.missing.
function Missing({ what }) {
  const t = useT()
  return <div className="screen"><LabHeader /><main className="center-note"><h2>{t(what)}</h2><a className="btn primary" href="#/">{t('lab.backToStudies')}</a></main></div>
}
function Loading() {
  const t = useT()
  return <div className="screen"><LabHeader /><main className="center-note"><p className="muted">{t('lab.loading')}</p></main></div>
}
function BackToResults({ id }) {
  const t = useT()
  return <a className="btn ghost small-btn" href={`#/study/${encodeURIComponent(id)}/results`}>{t('lab.backToResults')}</a>
}

export function LabReview({ id, sessionKey }) {
  const { study, sessions } = useStudy(id)
  if (study === false) { return <Missing what="lab.study.missing" /> }
  if (!study || !sessions) { return <Loading /> }
  const session = sessions.find(item => sessionKeyOf(id, item) === sessionKey)
  if (!session) { return <Missing what="lab.session.missing" /> }
  return <Review initialSession={session} onSave={reviewed => saveSession(id, reviewed)} nav={<BackToResults id={id} />} />
}

export function LabReport({ id }) {
  const { study, sessions } = useStudy(id)
  if (study === false) { return <Missing what="lab.study.missing" /> }
  if (!study || !sessions) { return <Loading /> }
  return <Report initialSessions={sessions} title={study.title} nav={<BackToResults id={id} />} />
}
