// Words shared by every page: the language and theme switches, and the
// vision engine's errors (Gesture Meme Studio and the participant runtime).
export default {
  en: {
    language: 'Language',
    languageAuto: 'Auto',
    languageAutoHint: 'Follow the language of your system or browser',
    theme: 'Colour theme',
    themeAuto: 'Auto',
    themeLight: 'Light',
    themeDark: 'Dark',
    'vision.noSteadyFace': 'No steady face found · face the camera and try again',
    'vision.webglOff': 'WebGL is turned off in this browser, and MediaPipe needs it to read camera frames',
    'vision.cameraStopped': 'Camera stopped',
    'vision.calibrationRestarted': 'Calibration restarted',
    // A time limit or duration, from durationText().
    'duration.seconds': ({ count }) => (count === 1 ? '1 second' : `${count} seconds`),
    'duration.minutes': ({ count }) => (count === 1 ? '1 minute' : `${count} minutes`),
    'duration.minSec': '{min} min {sec} s',
  },
  zh: {
    language: '语言',
    languageAuto: '自动',
    languageAutoHint: '跟随系统或浏览器的语言',
    theme: '颜色主题',
    themeAuto: '自动',
    themeLight: '浅色',
    themeDark: '深色',
    'vision.noSteadyFace': '没有找到稳定的面部 · 请面向摄像头再试一次',
    'vision.webglOff': '这个浏览器已关闭 WebGL，而 MediaPipe 需要它来读取摄像头画面',
    'vision.cameraStopped': '摄像头已停止',
    'vision.calibrationRestarted': '校准已重新开始',
    'duration.seconds': '{count}秒',
    'duration.minutes': '{count}分钟',
    'duration.minSec': '{min}分{sec}秒',
  },
}
