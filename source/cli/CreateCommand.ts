/**
 * @author copilot
 */

import { TranslationService } from './TranslationService'
import { logger } from './logger'
import { validateLanguageTag, getNativeLanguageName, getTextDirection } from './bcp47'
import { getPartitionPath } from './partition'
import { writeYaml } from './yaml'

export class CreateCommand {
  private translationService = new TranslationService()

  async execute(targetLang: string, sourceLang?: string, i18nPath = './src/lib/intl/'): Promise<void> {
    const validationError = validateLanguageTag(targetLang)
    if (validationError)
      logger.error(validationError)

    const fs = require('fs')
    const { i18nDir } = this.translationService.getLocaleInfo(i18nPath)
    const targetFile = `${i18nDir}/${targetLang}.yaml`

    if (fs.existsSync(targetFile))
      logger.error(`Language "${targetLang}" already exists at ${targetFile}`)

    const sourceLanguage = sourceLang === undefined ? undefined : this.resolveSource(i18nDir, sourceLang)
    const projectContext = this.translationService.getGlobalProjectContext(i18nPath)

    if (sourceLanguage !== undefined)
      logger.log(`Creating "${targetLang}" language from "${sourceLanguage}" source...`)
    else
      logger.log(`Creating language file for "${targetLang}"...`)

    // Translate the root and every mount before writing anything, so a failed translation
    // leaves no locale half-created across dictionaries. Their requests run concurrently.
    // Mounts hold only their own keys: `native`, `locale` and `dir` belong to the root dictionary.
    const mounts = this.translationService.contextManagerInstance.getAllMounts(i18nPath)
    const pending: Array<Promise<{ file: string, data: Record<string, any> }>> = []

    pending.push(this.translateDictionary(i18nDir, i18nPath, sourceLanguage, targetLang, projectContext)
      .then(root => ({
        file: targetFile,
        data: { native: getNativeLanguageName(targetLang), locale: targetLang, dir: getTextDirection(targetLang), ...root },
      })))

    for (const mountName of Object.keys(mounts)) {
      const mountDir = getPartitionPath(i18nPath, mountName)
      const file = `${mountDir}/${targetLang}.yaml`

      if (fs.existsSync(file)) {
        logger.log(`Keeping existing ${file} in mount "${mountName}"`)
        continue
      }

      logger.log(`Translating mount "${mountName}"...`)
      pending.push(this.translateDictionary(mountDir, i18nPath, sourceLanguage, targetLang, projectContext)
        .then(data => ({ file, data })))
    }

    const files = await Promise.all(pending)

    for (const { file, data } of files) {
      fs.mkdirSync(require('path').dirname(file), { recursive: true })
      writeYaml(file, data)
      logger.log(`✅ Created ${file}`)
    }

    require('./build').build(i18nPath)
  }

  /**
   * Source locale in the root directory: `sourceLang` itself, or any English variant for `en`.
   */
  private resolveSource(i18nDir: string, sourceLang: string): string {
    const fs = require('fs')

    if (fs.existsSync(`${i18nDir}/${sourceLang}.yaml`))
      return sourceLang

    if (sourceLang !== 'en')
      logger.error(`Source language "${sourceLang}" does not exist`)

    const english = fs.readdirSync(i18nDir)
      .find((file: string) => /^en(-[A-Z]{2})?\.yaml$/.test(file))

    if (!english)
      logger.error(`Source language "${sourceLang}" does not exist and no English variants found`)

    return english.replace('.yaml', '')
  }

  /**
   * Translate the keys of the source dictionary in `dir` (reserved root keys excluded),
   * using the contexts saved next to it. A missing source dictionary yields no keys.
   */
  private async translateDictionary(
    dir: string,
    i18nPath: string,
    sourceLanguage: string | undefined,
    targetLang: string,
    projectContext: string | undefined
  ): Promise<Record<string, any>> {
    const fs = require('fs')
    const yaml = require('js-yaml')
    const file = `${dir}/${sourceLanguage}.yaml`

    if (sourceLanguage === undefined || !fs.existsSync(file))
      return {}

    const { native, locale, dir: _dir, ...source } = yaml.load(fs.readFileSync(file, 'utf8')) ?? {}
    const contexts = this.translationService.contextManagerInstance.getAllContextEntries(dir)
    const entries = this.translationService.extractEntries(source)
      .map(entry => ({ ...entry, context: contexts[entry.key]?.input }))

    logger.log(`Found ${entries.length} entries to translate in ${file}`)

    try {
      return overlay(source, await this.translateEntries(entries, targetLang, projectContext, i18nPath))
    } catch (error) {
      return logger.error(`Failed to translate ${file}: ${error}`)
    }
  }

  /**
   * Batch-translate a flat list of entries (with per-key context) into a nested
   * object of translated keys only — no reserved native/locale/dir keys.
   * Shared with ImportCommand to avoid duplicating the translation pipeline.
   */
  translateEntries(
    entries: Array<{ key: string; value: string; context?: string }>,
    targetLang: string,
    projectContext?: string,
    i18nPath = './src/lib/intl/'
  ): Promise<Record<string, any>> {
    return this.translationService.translateEntries(entries, targetLang, projectContext, i18nPath)
  }
}

/**
 * The source structure with each string replaced by its translation: keeps lists, such as plural
 * forms, that the translated object holds as index-keyed objects.
 */
export function overlay(source: any, translated: any): any {
  if (typeof source === 'string')
    return typeof translated === 'string' ? translated : source

  if (Array.isArray(source))
    return source.map((item, index) => overlay(item, translated?.[index]))

  if (source !== null && typeof source === 'object')
    return Object.fromEntries(Object.entries(source).map(([key, value]) => [key, overlay(value, translated?.[key])]))

  return source
}
