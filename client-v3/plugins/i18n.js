import enUsStrings from '../strings/en-us.json'
import { supplant } from './utils'

const defaultCode = 'en-us'

const languageCodeMap = {
  ar: { label: 'عربي', dateFnsLocale: 'ar' },
  be: { label: 'Беларуская', dateFnsLocale: 'be' },
  bg: { label: 'Български', dateFnsLocale: 'bg' },
  bn: { label: 'বাংলা', dateFnsLocale: 'bn' },
  ca: { label: 'Català', dateFnsLocale: 'ca' },
  cs: { label: 'Čeština', dateFnsLocale: 'cs' },
  da: { label: 'Dansk', dateFnsLocale: 'da' },
  de: { label: 'Deutsch', dateFnsLocale: 'de' },
  'en-us': { label: 'English', dateFnsLocale: 'enUS' },
  es: { label: 'Español', dateFnsLocale: 'es' },
  et: { label: 'Eesti', dateFnsLocale: 'et' },
  fi: { label: 'Suomi', dateFnsLocale: 'fi' },
  fr: { label: 'Français', dateFnsLocale: 'fr' },
  he: { label: 'עברית', dateFnsLocale: 'he' },
  hr: { label: 'Hrvatski', dateFnsLocale: 'hr' },
  it: { label: 'Italiano', dateFnsLocale: 'it' },
  lt: { label: 'Lietuvių', dateFnsLocale: 'lt' },
  hu: { label: 'Magyar', dateFnsLocale: 'hu' },
  ko: { label: '한국어', dateFnsLocale: 'ko' },
  nl: { label: 'Nederlands', dateFnsLocale: 'nl' },
  no: { label: 'Norsk', dateFnsLocale: 'no' },
  pl: { label: 'Polski', dateFnsLocale: 'pl' },
  'pt-br': { label: 'Português (Brasil)', dateFnsLocale: 'ptBR' },
  ru: { label: 'Русский', dateFnsLocale: 'ru' },
  sk: { label: 'Slovenčina', dateFnsLocale: 'sk' },
  sl: { label: 'Slovenščina', dateFnsLocale: 'sl' },
  sv: { label: 'Svenska', dateFnsLocale: 'sv' },
  tr: { label: 'Türkçe', dateFnsLocale: 'tr' },
  uk: { label: 'Українська', dateFnsLocale: 'uk' },
  'vi-vn': { label: 'Tiếng Việt', dateFnsLocale: 'vi' },
  'zh-cn': { label: '简体中文 (Simplified Chinese)', dateFnsLocale: 'zhCN' },
  'zh-tw': { label: '正體中文 (Traditional Chinese)', dateFnsLocale: 'zhTW' }
}

const podcastSearchRegionMap = {
  au: { label: 'Australia' },
  br: { label: 'Brasil' },
  be: { label: 'België / Belgique / Belgien' },
  by: { label: 'Беларусь' },
  cz: { label: 'Česko' },
  dk: { label: 'Danmark' },
  de: { label: 'Deutschland' },
  ee: { label: 'Eesti' },
  es: { label: 'España / Espanya / Espainia' },
  fr: { label: 'France' },
  hr: { label: 'Hrvatska' },
  il: { label: 'ישראל / إسرائيل' },
  it: { label: 'Italia' },
  lu: { label: 'Luxembourg / Luxemburg / Lëtezebuerg' },
  hu: { label: 'Magyarország' },
  nl: { label: 'Nederland' },
  no: { label: 'Norge' },
  nz: { label: 'New Zealand' },
  at: { label: 'Österreich' },
  pl: { label: 'Polska' },
  pt: { label: 'Portugal' },
  ru: { label: 'Россия' },
  ch: { label: 'Schweiz / Suisse / Svizzera' },
  sk: { label: 'Slovensko' },
  se: { label: 'Sverige' },
  vn: { label: 'Việt Nam' },
  ua: { label: 'Україна' },
  gb: { label: 'United Kingdom' },
  us: { label: 'United States' },
  cn: { label: '中国' }
}

const translations = {
  [defaultCode]: enUsStrings
}

function loadTranslationStrings(code) {
  return new Promise((resolve) => {
    import(`../strings/${code}.json`)
      .then((fileContents) => resolve(fileContents.default))
      .catch((error) => {
        console.error('Failed to load i18n strings', code, error)
        resolve(null)
      })
  })
}

export default defineNuxtPlugin((nuxtApp) => {
  const gp = nuxtApp.vueApp.config.globalProperties

  gp.$languageCodeOptions = Object.keys(languageCodeMap).map((code) => ({
    text: languageCodeMap[code].label,
    value: code
  }))

  gp.$podcastSearchRegionOptions = Object.keys(podcastSearchRegionMap).map((code) => ({
    text: podcastSearchRegionMap[code].label,
    value: code
  }))

  gp.$languageCodes = {
    default: defaultCode,
    current: defaultCode,
    local: null,
    server: null
  }

  gp.$strings = { ...enUsStrings }

  gp.$getString = (key, subs = []) => {
    if (!gp.$strings[key]) return ''
    if (subs?.length && Array.isArray(subs)) {
      return supplant(gp.$strings[key], subs)
    }
    return gp.$strings[key]
  }

  gp.$formatNumber = (num) => {
    return Intl.NumberFormat(gp.$languageCodes.current).format(num)
  }

  gp.$getDaysOfWeek = () => {
    const days = []
    for (let i = 0; i < 7; i++) {
      days.push(new Date(2025, 0, 5 + i).toLocaleString(gp.$languageCodes.current, { weekday: 'long' }))
    }
    return days
  }

  async function loadi18n(code) {
    if (!code) return false
    if (gp.$languageCodes.current == code) return false

    const strings = translations[code] || (await loadTranslationStrings(code))
    if (!strings) {
      console.warn(`Invalid lang code ${code}`)
      return false
    }

    translations[code] = strings
    gp.$languageCodes.current = code
    localStorage.setItem('lang', code)

    for (const key in gp.$strings) {
      gp.$strings[key] = strings[key] || translations[defaultCode][key]
    }

    gp.$setDateFnsLocale(languageCodeMap[code].dateFnsLocale)
    gp.$eventBus?.$emit('change-lang', code)

    return true
  }

  gp.$setLanguageCode = loadi18n

  gp.$setServerLanguageCode = (code) => {
    if (!code) return
    if (!languageCodeMap[code]) {
      console.warn('invalid server language in', code)
    } else {
      gp.$languageCodes.server = code
      if (!gp.$languageCodes.local && code !== defaultCode) {
        loadi18n(code)
      }
    }
  }

  // Initialize with language code in localStorage if valid
  const localLanguage = localStorage.getItem('lang')
  if (localLanguage) {
    if (!languageCodeMap[localLanguage]) {
      console.warn('Invalid local language code', localLanguage)
      localStorage.setItem('lang', defaultCode)
    } else {
      gp.$languageCodes.local = localLanguage
      loadi18n(localLanguage)
    }
  }
})
