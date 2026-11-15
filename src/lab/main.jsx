import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../research/research.css'
import './lab.css'
import { Studies } from './Studies'
import { StudyPage } from './StudyPage'
import { Console } from './Console'
import { LabReport, LabReview } from './Results'
import { LabHeader } from './LabNav'
import { download } from './Studies'
import { exportPackage } from './workspace'
import { useT } from '../i18n/react.jsx'

// Usability Lab: the researcher workspace. Hash routes:
//   #/                      studies
//   #/study/<id>/<tab>      plan, run, documents or results of one study
//   #/run/<id>/<slot>       a moderated session (slot: participant index, or "pilot")
//   #/review/<id>/<key>     one session in the review screen
//   #/report/<id>           the study report
const parse = () => {
  const [view = '', id = '', ...rest] = location.hash.replace(/^#\/?/, '').split('/').map(part => { try { return decodeURIComponent(part) } catch { return '' } })
  return { view: view || 'studies', id, extra: rest.join('/') }
}
export const go = (...parts) => { location.hash = `#/${parts.map(encodeURIComponent).join('/')}` }

// When a screen fails to draw (a damaged study or session), this shows
// instead of a blank page, with a backup of the workspace and the way home.
// Another route draws again.
class Boundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false } }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidUpdate(previous) { if (this.state.failed && previous.route !== this.props.route) this.setState({ failed: false }) }
  render() { return this.state.failed ? <Failed /> : this.props.children }
}
function Failed() {
  const t = useT()
  const backup = async () => download(JSON.stringify(await exportPackage()), `usability-lab-backup-${new Date().toISOString().slice(0, 10)}.json`)
  return <div className="screen"><LabHeader /><main className="center-note">
    <h2>{t('lab.failed.title')}</h2>
    <p className="muted">{t('lab.failed.hint')}</p>
    <div className="actions"><button className="btn primary" onClick={backup}>{t('lab.studies.backupAll')}</button><button className="btn ghost" onClick={() => { location.hash = '#/'; location.reload() }}>{t('lab.backToStudies')}</button></div>
  </main></div>
}

function App() {
  const [route, setRoute] = useState(parse)
  useEffect(() => {
    const onHash = () => { setRoute(parse()); window.scrollTo(0, 0) }
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])
  const { view, id, extra } = route
  return <Boundary route={`${view}/${id}/${extra}`}>{screen(view, id, extra)}</Boundary>
}
function screen(view, id, extra) {
  if (view === 'study' && id) { return <StudyPage key={id} id={id} tab={extra || 'plan'} /> }
  if (view === 'run' && id) { return <Console key={`${id}/${extra}`} id={id} slot={extra} /> }
  if (view === 'review' && id) { return <LabReview key={`${id}/${extra}`} id={id} sessionKey={extra} /> }
  if (view === 'report' && id) { return <LabReport key={id} id={id} /> }
  return <Studies />
}

createRoot(document.getElementById('root')).render(<App />)
