import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../research/research.css'
import './lab.css'
import { Studies } from './Studies'
import { StudyPage } from './StudyPage'
import { Console } from './Console'
import { LabReport, LabReview } from './Results'

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

function App() {
  const [route, setRoute] = useState(parse)
  useEffect(() => {
    const onHash = () => { setRoute(parse()); window.scrollTo(0, 0) }
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])
  const { view, id, extra } = route
  if (view === 'study' && id) return <StudyPage key={id} id={id} tab={extra || 'plan'} />
  if (view === 'run' && id) return <Console key={`${id}/${extra}`} id={id} slot={extra} />
  if (view === 'review' && id) return <LabReview key={`${id}/${extra}`} id={id} sessionKey={extra} />
  if (view === 'report' && id) return <LabReport key={id} id={id} />
  return <Studies />
}

createRoot(document.getElementById('root')).render(<App />)
