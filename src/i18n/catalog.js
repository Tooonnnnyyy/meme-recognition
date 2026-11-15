// Every namespace's messages, flattened to "namespace.key" per language.
import common from './messages/common.js'
import lab from './messages/lab.js'
import consoleMessages from './messages/console.js'
import participant from './messages/participant.js'
import researcher from './messages/researcher.js'
import report from './messages/report.js'
import study from './messages/study.js'
import studio from './messages/studio.js'

export const NAMESPACES = { common, lab, console: consoleMessages, participant, researcher, report, study, studio }

const flatten = lang => Object.fromEntries(Object.entries(NAMESPACES).flatMap(([namespace, messages]) => Object.entries(messages[lang] || {}).map(([key, value]) => [`${namespace}.${key}`, value])))

export const CATALOG = { en: flatten('en'), zh: flatten('zh') }
