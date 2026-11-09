// The demo study. To test your own prototype instead: put its pages under
// public/ (same origin, so clicks and page changes can be recorded), mark the
// areas you care about with data-aoi="name", and describe the tasks here.
// successPage is the page whose arrival completes the task; null means the
// participant decides with "I'm done".
export const DEMO_STUDY = {
  id: 'northwind-returns',
  title: 'Northwind returns flow',
  siteBase: 'research-site/',
  tasks: [
    { id: 'T1', prompt: 'Open the details of your hiking boots order.', start: 'orders.html', successPage: 'order', limitSec: 120 },
    { id: 'T2', prompt: 'Start a return for the hiking boots and submit it.', start: 'orders.html', successPage: 'return-done', limitSec: 240 },
    { id: 'T3', prompt: 'Find out how long a refund takes to reach your card. Click “I’m done” when you know.', start: 'orders.html', successPage: null, limitSec: 120 },
  ],
}

// Gaze is used only when validation error is at most 3° (about 141 CSS px).
export const GAZE_THRESHOLD_DEGREES = 3
