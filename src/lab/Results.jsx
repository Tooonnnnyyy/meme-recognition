import React, { useEffect, useState } from 'react'
import { LabHeader } from './LabNav'
import { saveSession, sessionKeyOf, sessionsOf, workspace } from './workspace'
import { Review } from '../research/Review'
import { Report } from '../research/Report'

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

const Missing = ({ what }) => <div className="screen"><LabHeader /><main className="center-note"><h2>{what} is not in this browser</h2><a className="btn primary" href="#/">Back to studies</a></main></div>
const Loading = () => <div className="screen"><LabHeader /><main className="center-note"><p className="muted">Loading…</p></main></div>

export function LabReview({ id, sessionKey }) {
  const { study, sessions } = useStudy(id)
  if (study === false) return <Missing what="This study" />
  if (!study || !sessions) return <Loading />
  const session = sessions.find(item => sessionKeyOf(id, item) === sessionKey)
  if (!session) return <Missing what="This session" />
  return <Review initialSession={session} onSave={reviewed => saveSession(id, reviewed)} nav={<a className="btn ghost small-btn" href={`#/study/${encodeURIComponent(id)}/results`}>Back to results</a>} />
}

export function LabReport({ id }) {
  const { study, sessions } = useStudy(id)
  if (study === false) return <Missing what="This study" />
  if (!study || !sessions) return <Loading />
  return <Report initialSessions={sessions} title={study.title} nav={<a className="btn ghost small-btn" href={`#/study/${encodeURIComponent(id)}/results`}>Back to results</a>} />
}
