import { isLang, translate } from '../i18n/index.js'

// The demo study. To test your own prototype instead: put its pages in a
// folder under public/ (same origin, so clicks and page changes can be
// recorded), set siteBase to that folder, mark the areas you care about with
// data-aoi="name", and describe the tasks here. start is the file a task opens,
// relative to siteBase. successPage is the page whose arrival completes the
// task, as its path under siteBase without .html ('order-48213',
// 'checkout/done'), so it should be reachable only by doing the task right;
// null means the participant decides with "I'm done".
export const DEMO_STUDY = {
  id: 'northwind-returns',
  title: 'Northwind returns flow',
  siteBase: 'research-site/',
  tasks: [
    { id: 'T1', prompt: 'Open the details of your hiking boots order.', start: 'orders.html', successPage: 'order-48213', limitSec: 120 },
    { id: 'T2', prompt: 'Start a return for the hiking boots and submit it.', start: 'orders.html', successPage: 'return-done-48213', limitSec: 240 },
    { id: 'T3', prompt: 'Find out how long a refund takes to reach your card. Click “I’m done” when you know.', start: 'orders.html', successPage: null, limitSec: 120 },
  ],
}

// The demo tasks in another interface language. The demo shop's pages are in
// English, so the Chinese wording names the English items it points at, and
// quotes the runtime's own button label (participant.done).
const DEMO_PROMPTS = {
  zh: {
    T1: '打开你的登山靴（Hiking boots）订单的详情。',
    T2: '为这双登山靴（Hiking boots）发起退货并提交。',
    T3: '查一查退款要多久才能退回你的银行卡。知道答案后，点击“我完成了”。',
  },
}
export const demoTasks = lang => DEMO_STUDY.tasks.map(task => ({ ...task, prompt: DEMO_PROMPTS[lang]?.[task.id] || task.prompt }))
export const demoStudyIn = lang => ({ ...DEMO_STUDY, lang, title: isLang(lang) ? translate(lang, 'study.demo.runtimeTitle') : DEMO_STUDY.title, tasks: demoTasks(lang) })

// Gaze is used only when validation error is at most 3° (about 141 CSS px).
export const GAZE_THRESHOLD_DEGREES = 3
