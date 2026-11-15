import React from 'react'
import { ThemeToggle } from '../ThemeToggle'

// The workspace header: where you are, and the way back.
const href = (...parts) => `#/${parts.map(encodeURIComponent).join('/')}`
export const STUDY_TABS = [['plan', 'Plan'], ['run', 'Run'], ['documents', 'Documents'], ['results', 'Results']]

export function LabHeader({ study, current, children }) {
  return <header className="topbar lab-topbar">
    <div className="brand"><span className="mark">◎</span><div><strong><a className="home-link" href="#/">Usability Lab</a></strong><small>{study ? study.title || 'Untitled study' : 'Your studies, stored in this browser'}</small></div></div>
    {study && <nav className="researcher-nav" aria-label="Study">
      {STUDY_TABS.map(([tab, label]) => <a key={tab} href={href('study', study.id, tab)} aria-current={current === tab ? 'page' : undefined}>{label}</a>)}
      <a href={href('report', study.id)} aria-current={current === 'report' ? 'page' : undefined}>Report</a>
    </nav>}
    <div className="actions">{children}<ThemeToggle /></div>
  </header>
}

export const studyHref = href
