/**
 * BCP 47 language tag validation utilities
 */

/**
 * Validates if a string is a valid BCP 47 language tag using Intl.Locale
 * @param languageTag - The language tag to validate
 * @returns true if valid, false otherwise
 */
export function isValidBCP47(languageTag: string): boolean {
  try {
    // The Intl.Locale constructor will throw if the tag is invalid
    new Intl.Locale(languageTag)
    return true
  } catch {
    return false
  }
}

/**
 * Gets the native name of a language using its BCP 47 tag
 * Returns a best-effort guess based on the language code
 * @param languageTag - The BCP 47 language tag
 * @returns Native language name or fallback
 */
export function getNativeLanguageName(languageTag: string): string {
  try {
    const locale = new Intl.Locale(languageTag)

    // Common language mappings for native names
    const nativeNames: Record<string, string> = {
      'en': 'English',
      'es': 'Español',
      'fr': 'Français',
      'de': 'Deutsch',
      'it': 'Italiano',
      'pt': 'Português',
      'ru': 'Русский',
      'zh': '中文',
      'ja': '日本語',
      'ko': '한국어',
      'ar': 'العربية',
      'hi': 'हिन्दी',
      'th': 'ไทย',
      'vi': 'Tiếng Việt',
      'tr': 'Türkçe',
      'pl': 'Polski',
      'nl': 'Nederlands',
      'sv': 'Svenska',
      'da': 'Dansk',
      'no': 'Norsk',
      'fi': 'Suomi',
      'cs': 'Čeština',
      'sk': 'Slovenčina',
      'hu': 'Magyar',
      'ro': 'Română',
      'bg': 'Български',
      'hr': 'Hrvatski',
      'sr': 'Српски',
      'sl': 'Slovenščina',
      'et': 'Eesti',
      'lv': 'Latviešu',
      'lt': 'Lietuvių',
      'mt': 'Malti',
      'ga': 'Gaeilge',
      'cy': 'Cymraeg',
      'eu': 'Euskera',
      'ca': 'Català',
      'gl': 'Galego',
      'is': 'Íslenska',
      'fo': 'Føroyskt',
      'sq': 'Shqip',
      'mk': 'Македонски',
      'be': 'Беларуская',
      'uk': 'Українська',
      'ka': 'ქართული',
      'hy': 'Հայերեն',
      'az': 'Azərbaycan',
      'kk': 'Қазақша',
      'ky': 'Кыргызча',
      'uz': 'Oʻzbekcha',
      'tg': 'Тоҷикӣ',
      'mn': 'Монгол',
      'he': 'עברית',
      'fa': 'فارسی',
      'ur': 'اردو',
      'ps': 'پښتو',
      'bn': 'বাংলা',
      'ta': 'தமிழ்',
      'te': 'తెలుగు',
      'ml': 'മലയാളം',
      'kn': 'ಕನ್ನಡ',
      'gu': 'ગુજરાતી',
      'pa': 'ਪੰਜਾਬੀ',
      'or': 'ଓଡ଼ିଆ',
      'as': 'অসমীয়া',
      'ne': 'नेपाली',
      'si': 'සිංහල',
      'my': 'မြန်မာ',
      'km': 'ខ្មែរ',
      'lo': 'ລາວ',
      'am': 'አማርኛ',
      'sw': 'Kiswahili',
      'zu': 'isiZulu',
      'xh': 'isiXhosa',
      'af': 'Afrikaans',
      'ms': 'Bahasa Melayu',
      'id': 'Bahasa Indonesia',
      'tl': 'Filipino',
      'ceb': 'Cebuano',
      'haw': 'ʻŌlelo Hawaiʻi'
    }

    // Extract the base language code
    const baseLanguage = locale.language

    return nativeNames[baseLanguage] || baseLanguage.toUpperCase()
  } catch {
    return languageTag.toUpperCase()
  }
}

/**
 * Returns the text direction ('ltr' | 'rtl') for a BCP 47 tag.
 * Throws on invalid tags (consistent with Intl.Locale constructor).
 */
export function getTextDirection(languageTag: string): 'ltr' | 'rtl' {
  const info = (new Intl.Locale(languageTag) as any).getTextInfo()
  return info.direction
}

/**
 * Validates a language tag and provides error message if invalid
 * @param languageTag - The language tag to validate
 * @returns null if valid, error message if invalid
 */
export function validateLanguageTag(languageTag: string): string | null {
  if (!languageTag || typeof languageTag !== 'string') {
    return 'Language tag must be a non-empty string'
  }

  if (!isValidBCP47(languageTag)) {
    return `"${languageTag}" is not a valid BCP 47 language tag. Examples: en, es, fr, en-US, pt-BR, zh-CN`
  }

  return null
}
