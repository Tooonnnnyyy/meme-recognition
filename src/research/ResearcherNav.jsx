import React from 'react'
import { useT } from '../i18n/react.jsx'

// Links between the researcher screens, which are hash routes of research.html.
const SCREENS = [['#setup', 'researcher.nav.setup'], ['#review', 'researcher.nav.review'], ['#report', 'researcher.nav.report']]

export function ResearcherNav({ current }) {
  const t = useT()
  return <nav className="researcher-nav" aria-label={t('researcher.nav.label')}>
    <a href="lab.html">Usability Lab</a>
    {SCREENS.map(([hash, label]) => <a key={hash} href={hash} aria-current={current === hash ? 'page' : undefined}>{t(label)}</a>)}
  </nav>
}
