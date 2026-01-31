export function formatTranslations(translations: Record<string, string>, locales: string[]): string {
  const entries = locales.map(locale => ({ locale, value: translations[locale] ?? '' }))
  const isCompact = entries.every(
    e => !e.value.includes('\n') && e.value.length < 40
  )

  if (isCompact)
    return entries.map(e => `${e.locale}: ${e.value}`).join('\n')

  return entries.map(e => `${e.locale} ---\n${e.value}`).join('\n\n')
}
