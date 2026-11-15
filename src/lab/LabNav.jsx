import React from 'react'
import { ViewToggles } from '../ThemeToggle'
import { useT } from '../i18n/react.jsx'

// The workspace header: where you are, and the way back.
const href = (...parts) => `#/${parts.map(encodeURIComponent).join('/')}`
// Each tab with the key of its label.
export const STUDY_TABS = [['plan', 'lab.tab.plan'], ['run', 'lab.tab.run'], ['documents', 'lab.tab.documents'], ['results', 'lab.tab.results']]

export function LabHeader({ study, current, children }) {
  const t = useT()
  return <header className="topbar lab-topbar">
    <div className="brand"><span className="mark">◎</span><div><strong><a className="home-link" href="#/">Usability Lab</a></strong><small>{study ? study.title || t('lab.untitled') : t('lab.tagline')}</small></div></div>
    {study && <nav className="researcher-nav" aria-label={t('lab.nav.study')}>
      {STUDY_TABS.map(([tab, label]) => <a key={tab} href={href('study', study.id, tab)} aria-current={current === tab ? 'page' : undefined}>{t(label)}</a>)}
      <a href={href('report', study.id)} aria-current={current === 'report' ? 'page' : undefined}>{t('lab.tab.report')}</a>
    </nav>}
    <div className="actions">{children}<ViewToggles /></div>
  </header>
}

export const studyHref = href
