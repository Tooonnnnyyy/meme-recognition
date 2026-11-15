import { translate } from './i18n/index.js'

// Faces available in Meme Lookalike mode. To add one, drop an image into
// public/reactions/ and add a line here. Photos of real faces are analysed
// automatically; for cartoons or animals, record your own version in the app.
// The title and hint shown in other languages are studio.meme.<id>.title and
// studio.meme.<id>.hint in src/i18n/messages/studio.js; until a face has them,
// it shows the English written here.
export const MEME_LIBRARY = [
  { id: 'pained-smile', title: 'Pained smile', image: 'reactions/grin-meme.jpeg', hint: 'Smile wide with your mouth, but not your eyes.' },
  { id: 'squeeze', title: 'Squeeze', image: 'reactions/eyes-pursed.jpeg', hint: 'Shut your eyes tight and push your lips out.' },
  { id: 'big-brain', title: 'Big brain', image: 'reactions/think-about-it.jpeg', hint: 'Small smirk, eyebrows relaxed, look sly.' },
  { id: 'shh', title: 'Shh!', image: 'reactions/shh-character.jpeg', hint: 'Eyes wide open, lips in a small “o”.' },
  { id: 'just-a-girl', title: 'Just a girl', image: 'reactions/girl-meme.jpeg', hint: 'Big innocent eyes, mouth closed.' },
]

// A face's title or hint (field 'title' or 'hint') in lang.
export function memeText(meme, field, lang = 'en') {
  const key = `studio.meme.${meme.id}.${field}`
  const text = translate(lang, key)
  return text === key ? meme[field] : text
}
