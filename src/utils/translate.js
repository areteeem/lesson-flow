const LANGS = [
  { code: 'uk', label: 'Ukrainian' },
  { code: 'ru', label: 'Russian' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'it', label: 'Italian' },
  { code: 'pl', label: 'Polish' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh-CN', label: 'Chinese' },
  { code: 'ar', label: 'Arabic' },
  { code: 'tr', label: 'Turkish' },
  { code: 'vi', label: 'Vietnamese' },
];

export function getTranslateUrl(text, targetLang = 'uk', sourceLang = 'en') {
  return `https://translate.google.com/?sl=${encodeURIComponent(sourceLang)}&tl=${encodeURIComponent(targetLang)}&text=${encodeURIComponent(text)}&op=translate`;
}

export function getAvailableLanguages() {
  return LANGS;
}
