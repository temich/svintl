/**
 * `add --from` and `set --from`: many entries from one file, translated together and built once.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { load as yamlLoad } from 'js-yaml'
import { build } from './build'
import { formatTranslations } from './format'
import { logger } from './logger'
import { parsePartitionedKey } from './partition'
import { chunk, TranslationService } from './TranslationService'
import { writeYaml } from './yaml'

/** Phrases per request. */
const BATCH_SIZE = 25

interface Entry {
  fullKey: string
  key: string
  value: string
  context?: string
}

/**
 * Translate every entry of `from` (a YAML file, or `-` for stdin) into every locale of its
 * dictionary. `add` refuses a key that exists, `set` one that does not; a refused key or a
 * failed translation fails the whole batch before any file is written.
 */
export async function batch(mode: 'add' | 'set', from: string, i18nPath = './src/lib/intl/'): Promise<void> {
  const service = new TranslationService()
  const entries = parse(from)

  // entries by mount; the root dictionary is ''
  const groups = new Map<string, Entry[]>()

  for (const entry of entries) {
    const partition = parsePartitionedKey(entry.fullKey).partition ?? ''

    groups.set(partition, [...(groups.get(partition) ?? []), entry])
  }

  const dictionaries = [...groups].map(([partition, entries]) => ({
    partition: partition || undefined,
    entries,
    ...service.getLocaleInfo(i18nPath, partition || undefined),
  }))

  const refused: string[] = []

  for (const { entries, localeFiles, i18nDir } of dictionaries)
    for (const entry of entries) {
      const exists = localeFiles.some(file => service.keyExistsInLocaleFile(join(i18nDir, file), entry.key))

      if (mode === 'add' && exists)
        refused.push(`Key "${entry.fullKey}" already exists. Use 'npx intl set' to update existing keys.`)

      if (mode === 'set' && !exists)
        refused.push(`Key "${entry.fullKey}" does not exist. Use 'npx intl add' to create new keys.`)
    }

  if (refused.length > 0)
    logger.error(refused.join('\n'))

  const projectContext = service.getGlobalProjectContext(i18nPath)
  const files = dictionaries.reduce((count, { localeFiles }) => count + localeFiles.length, 0)

  logger.log(`Translating ${entries.length} entries into ${files} locale files...`)

  // translations[dictionary][locale][entry]
  let translations: string[][][]

  try {
    translations = await Promise.all(dictionaries.map(({ entries, allLocales }) =>
      Promise.all(allLocales.map(async targetLang => {
        const batches = chunk(entries, BATCH_SIZE)

        const translated = await Promise.all(batches.map(async batch => {
          const values = await service.translateBatch({
            values: batch.map(e => e.value),
            contexts: batch.map(e => e.context),
            targetLang,
            i18nPath,
            projectContext,
          })

          if (values.length !== batch.length || values.some(value => typeof value !== 'string'))
            throw new Error(`${targetLang}: expected ${batch.length} translations, got ${JSON.stringify(values)}`)

          return values
        }))

        return translated.flat()
      }))))
  } catch (error) {
    return logger.error(`Failed to translate: ${error}`)
  }

  dictionaries.forEach(({ partition, entries, localeFiles, allLocales, i18nDir }, d) => {
    localeFiles.forEach((file, l) => {
      const path = join(i18nDir, file)
      const data = (yamlLoad(readFileSync(path, 'utf8')) as any) ?? {}

      entries.forEach((entry, e) => service.setNestedValue(data, entry.key, translations[d][l][e]))
      writeYaml(path, data)
    })

    for (const entry of entries)
      service.contextManagerInstance.setContextEntry(i18nDir, entry.key, entry.value, entry.context)

    build(i18nDir, !!partition)

    entries.forEach((entry, e) => {
      const byLocale = Object.fromEntries(allLocales.map((locale, l) => [locale, translations[d][l][e]]))

      console.log(`${entry.fullKey}\n${formatTranslations(byLocale, allLocales)}\n`)
    })
  })
}

/**
 * Keys mapped to a phrase, or to `{ value, context }`; any other map is a group of keys under its
 * own, as in a dictionary: `app: { title: Hello }` is `app.title: Hello`, and
 * `foo/: { title: Hello }` is `foo/title: Hello`.
 */
function parse(from: string): Entry[] {
  let data: unknown

  try {
    data = yamlLoad(readFileSync(from === '-' ? 0 : from, 'utf8'))
  } catch (error) {
    return logger.error(`Failed to read ${from === '-' ? 'stdin' : from}: ${error}`)
  }

  if (!isMap(data))
    logger.error('Expected a map of keys to phrases, e.g. `app.title: Hello`')

  const entries = flatten(data as Record<string, unknown>)

  if (entries.length === 0)
    logger.error('No entries to translate')

  return entries
}

function flatten(map: Record<string, unknown>, prefix = ''): Entry[] {
  return Object.entries(map).flatMap(([name, item]): Entry[] => {
    const fullKey = prefix + name
    const { key } = parsePartitionedKey(fullKey)

    if (typeof item === 'string')
      return [{ fullKey, key, value: item }]

    if (isPhrase(item))
      return [{ fullKey, key, value: item.value, context: item.context }]

    // a mount's prefix, `foo/`, groups the mount's keys
    if (isMap(item) && Object.keys(item).length > 0)
      return flatten(item, fullKey.endsWith('/') ? fullKey : fullKey + '.')

    return logger.error(`Entry "${fullKey}" must be a phrase, { value, context } or a map of entries`)
  })
}

function isPhrase(item: unknown): item is { value: string, context?: string } {
  return isMap(item) && typeof item.value === 'string' &&
    ['undefined', 'string'].includes(typeof item.context) &&
    Object.keys(item).every(name => name === 'value' || name === 'context')
}

function isMap(item: unknown): item is Record<string, unknown> {
  return item !== null && typeof item === 'object' && !Array.isArray(item)
}
