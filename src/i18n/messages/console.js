// Messages for the moderated session console (src/lab/Console.jsx), looked
// up as "console.key". Keep en and zh keys identical. Outcome and note-kind
// labels come from study.outcome.<id> and study.note.<kind>.
export default {
  en: {
    // When the study cannot be opened.
    'missing.title': 'This study is not in this browser',
    'missing.back': 'Back to studies',
    loading: 'Loading…',

    // Before the session: the moderator's checklist.
    'setup.kickerPilot': 'Pilot session · kept out of the report',
    'setup.kicker': 'Moderated session',
    session: 'Session {code}',
    'setup.order': ({ count }) => `${count === 1 ? '1 task' : `${count} tasks`} in this order: {order}.`,
    'setup.seq': 'An ease rating after each task.',
    'setup.post': '{scale} at the end.',
    'setup.langMismatch': 'Participants in this study see {lang}. When you begin, the session screens switch to {lang} until the session ends.',
    'setup.welcome': 'Welcome the participant and explain that you are testing the design, not them.',
    'setup.consent': 'Go through the consent form and answer questions.',
    'setup.consentGenerate': 'Go through the consent form (generate it under Documents) and answer questions.',
    'setup.thinkAloud': 'Ask them to think aloud. Close other tabs and notifications.',
    'setup.consented': 'The participant has given consent (signed or verbal, as your ethics approval says)',
    'setup.begin': 'Begin session',
    'setup.back': 'Back',

    // After the last task.
    'done.kicker': 'Saved in this browser',
    'done.title': 'Session {code} is complete',
    'done.ease': 'ease {value}/7',
    'done.notes': ({ count }) => (count === 1 ? '1 note' : `${count} notes`),
    fullStop: '.',
    'done.next': 'Next participant ({code})',
    'done.review': 'Review this session',
    'done.results': 'All results',

    // The session bar.
    'bar.pilot': 'pilot',
    'bar.task': 'task {n} of {total}',
    over: 'OVER {minutes} MIN',
    end: 'End session',
    endNow: 'End session now',
    cancel: 'Cancel',

    // What the participant sees.
    'stage.frameTitle': 'Prototype being tested',
    'stage.previous': 'PREVIOUS · {outcome}',
    'stage.task': 'Task {n} of {total}',
    'stage.start': 'Start task <kbd>Enter</kbd>',
    'stage.thinkAloud': 'Take your time and think aloud. Tell the moderator when you are done.',
    // <prompt></prompt> is where the task instructions go.
    'stage.ribbon': '<b>Task {n}:</b> <prompt></prompt>',

    // The moderator's panel.
    'panel.label': 'Moderator panel',
    'panel.success': 'Success looks like',
    'panel.noSuccess': 'Not written down; add it in Plan.',
    'panel.outcome': 'Outcome',
    'panel.notes': 'Notes',
    'panel.noteType': 'Note type',
    'panel.noteText': '{kind} text',
    'panel.quotePlaceholder': 'What they said, word for word',
    'panel.notePlaceholder': 'What happened  #tag groups it',
    'panel.add': 'Add <kbd>Enter</kbd>',
    'panel.deleteNote': 'Delete note',
    'panel.hotkeys': 'Keys: <kbd>N</kbd> note <kbd>P</kbd> problem <kbd>Q</kbd> quote <kbd>A</kbd> assist <kbd>E</kbd> error · <kbd>1</kbd>–<kbd>4</kbd> outcome · <kbd>Esc</kbd> leaves the note field.',
  },
  zh: {
    'missing.title': '这个浏览器中没有这项研究',
    'missing.back': '返回研究列表',
    loading: '正在加载……',

    'setup.kickerPilot': '预测试场次 · 不计入报告',
    'setup.kicker': '有主持的场次',
    session: '场次 {code}',
    'setup.order': '共{count}个任务，顺序为：{order}。',
    'setup.seq': '每个任务结束后进行难易度评分（SEQ）。',
    'setup.post': '最后填写 {scale} 问卷。',
    'setup.langMismatch': '本研究的参与者看到的是 {lang}。开始场次后，场次界面会切换为 {lang}，直到场次结束。',
    'setup.welcome': '欢迎参与者，并说明这次测试的是设计，而不是参与者本人。',
    'setup.consent': '和参与者一起阅读知情同意书，并解答疑问。',
    'setup.consentGenerate': '和参与者一起阅读知情同意书（可在“文档”中生成），并解答疑问。',
    'setup.thinkAloud': '请参与者边操作边说出想法。关闭其他标签页和通知。',
    'setup.consented': '参与者已表示知情同意（按伦理审批的要求，签字或口头同意）',
    'setup.begin': '开始场次',
    'setup.back': '返回',

    'done.kicker': '已保存在这个浏览器中',
    'done.title': '{code} 的场次已完成',
    'done.ease': '难易度{value}/7',
    'done.notes': '{count}条笔记',
    fullStop: '。',
    'done.next': '下一位参与者（{code}）',
    'done.review': '审阅这个场次',
    'done.results': '全部结果',

    'bar.pilot': '预测试',
    'bar.task': '任务{n}/{total}',
    over: '超出{minutes}分钟时限',
    end: '结束场次',
    endNow: '立即结束场次',
    cancel: '取消',

    'stage.frameTitle': '正在测试的原型',
    'stage.previous': '上一个任务 · {outcome}',
    'stage.task': '第{n}个任务，共{total}个',
    'stage.start': '开始任务 <kbd>Enter</kbd>',
    'stage.thinkAloud': '不用着急，边做边说出你的想法。完成后告诉主持人就好。',
    'stage.ribbon': '<b>任务{n}：</b><prompt></prompt>',

    'panel.label': '主持人面板',
    'panel.success': '成功标准',
    'panel.noSuccess': '尚未填写，可在“计划”中补充。',
    'panel.outcome': '结果',
    'panel.notes': '笔记',
    'panel.noteType': '笔记类型',
    'panel.noteText': '{kind}内容',
    'panel.quotePlaceholder': '参与者的原话，逐字记录',
    'panel.notePlaceholder': '发生了什么  用 #标签 归类',
    'panel.add': '添加 <kbd>Enter</kbd>',
    'panel.deleteNote': '删除笔记',
    'panel.hotkeys': '快捷键：<kbd>N</kbd> 笔记 <kbd>P</kbd> 问题 <kbd>Q</kbd> 原话 <kbd>A</kbd> 协助 <kbd>E</kbd> 错误 · <kbd>1</kbd>\u2060–\u2060<kbd>4</kbd> 结果 · <kbd>Esc</kbd> 退出笔记输入框。',
  },
}
