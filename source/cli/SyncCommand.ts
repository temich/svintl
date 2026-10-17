/**
 * @author copilot
 */

import { TranslationService } from './TranslationService'
import { logger } from './logger'
import { validateLanguageTag, getNativeLanguageName, getTextDirection } from './bcp47'
import { parsePartitionedKey, getPartitionPath } from './partition'
import { overlay } from './CreateCommand'
import { writeYaml } from './yaml'

interface SyncEntry {
  key: string
  value: string
  action: 'add' | 'update' | 'unchanged'
}

export class SyncCommand {
  private translationService = new TranslationService()

  async execute(sourceLang: string, specificKey?: string, i18nPath = './src/lib/intl/'): Promise<void> {
    // Validate BCP 47 language tag
    const validationError = validateLanguageTag(sourceLang)
    if (validationError) {
      logger.error(validationError)
    }

    // Parse partitioned key if provided
    const partition = specificKey ? parsePartitionedKey(specificKey).partition : undefined

    const { localeFiles, i18nDir } = this.translationService.getLocaleInfo(i18nPath, partition)
    const sourceFile = `${i18nDir}/${sourceLang}.yaml`

    // Check if source locale exists
    const fs = require('fs')
    if (!fs.existsSync(sourceFile)) {
      logger.error(`Source locale "${sourceLang}" does not exist at ${sourceFile}`)
    }

    // Get target locales (all except source)
    const targetLocales = localeFiles
      .map(file => file.replace('.yaml', ''))
      .filter(lang => lang !== sourceLang)

    if (targetLocales.length === 0) {
      logger.error(`No target locales found to sync. Source "${sourceLang}" is the only locale.`)
    }

    logger.log(`Syncing ${targetLocales.length} locales with "${sourceLang}" source...`)

    if (specificKey) {
      const { key: actualKey } = parsePartitionedKey(specificKey)
      await this.syncSpecificKey(sourceLang, actualKey, targetLocales, i18nDir, i18nPath)
    } else {
      await this.syncAllKeys(sourceLang, targetLocales, i18nDir, i18nPath)
    }

    logger.log(`✅ Translated`)

    // Auto-build dictionaries
    require('./build').build(getPartitionPath(i18nPath, partition), !!partition)
  }

  private async syncSpecificKey(
    sourceLang: string,
    specificKey: string,
    targetLocales: string[],
    i18nDir: string,
    i18nPath: string
  ): Promise<void> {
    const fs = require('fs')
    const yaml = require('js-yaml')

    const sourceFile = `${i18nDir}/${sourceLang}.yaml`
    const sourceContent = fs.readFileSync(sourceFile, 'utf8')
    const sourceData = yaml.load(sourceContent) as any

    const sourceValue = this.extractValue(sourceData, specificKey)
    if (sourceValue === undefined) {
      logger.error(`Key "${specificKey}" not found in source locale "${sourceLang}"`)
    }

    logger.log(`Syncing key "${specificKey}" to ${targetLocales.length} locales...`)

    if (!process.env.OPENAI_API_KEY) {
      logger.warn('OPENAI_API_KEY not found - copying source value without translation')

      for (const lang of targetLocales) {
        const targetFile = `${i18nDir}/${lang}.yaml`
        this.translationService.updateLocaleFile(targetFile, specificKey, sourceValue!)
      }
      return
    }

    // Translate using OpenAI — same full instruction set as every other path.
    const systemPrompt = this.translationService.buildSystemPrompt({ mode: 'jsonObject', i18nPath })

    const projectContext = this.translationService.getGlobalProjectContext(i18nPath)

    try {
      const translations = await this.translationService.translateWithOpenAI(
        sourceValue!,
        targetLocales,
        systemPrompt,
        undefined,
        projectContext
      )

      for (const lang of targetLocales) {
        const targetFile = `${i18nDir}/${lang}.yaml`
        const translation = translations[lang] || sourceValue!
        this.translationService.updateLocaleFile(targetFile, specificKey, translation)
      }
    } catch (error) {
      logger.warn(`Translation failed: ${error}`)
      // Fallback to source values
      for (const lang of targetLocales) {
        const targetFile = `${i18nDir}/${lang}.yaml`
        this.translationService.updateLocaleFile(targetFile, specificKey, sourceValue!)
      }
    }
  }

  private async syncAllKeys(sourceLang: string, targetLocales: string[], i18nDir: string, i18nPath: string): Promise<void> {
    const fs = require('fs')
    const yaml = require('js-yaml')

    const sourceFile = `${i18nDir}/${sourceLang}.yaml`
    const sourceContent = fs.readFileSync(sourceFile, 'utf8')
    const sourceData = yaml.load(sourceContent) as any

    // Extract all entries from source (excluding reserved keys)
    const { native, locale, dir: _dir, ...sourceDataWithoutNative } = sourceData
    const sourceEntries = this.translationService.extractEntries(sourceDataWithoutNative)
    logger.log(`Source has ${sourceEntries.length} entries`)

    // Get saved contexts for enriched translation
    const savedContexts = this.translationService.contextManagerInstance.getAllContextEntries(i18nDir)

    logger.log(`Found ${Object.keys(savedContexts).length} saved contexts for enhanced translation`)

    if (!process.env.OPENAI_API_KEY) {
      logger.warn('OPENAI_API_KEY not found - copying source values without translation')

      for (const lang of targetLocales) {
        const targetFile = `${i18nDir}/${lang}.yaml`
        const nativeName = getNativeLanguageName(lang)
        const translatedData: any = {
          native: nativeName,
          locale: lang,
          dir: getTextDirection(lang),
        }

        for (const entry of sourceEntries) {
          this.translationService.setNestedValue(translatedData, entry.key, entry.value)
        }

        writeYaml(targetFile, translatedData)
      }
      logger.log('✅ Synced without translation')
      return
    }

    const projectContext = this.translationService.getGlobalProjectContext(i18nPath)

    // Every request of the root and the mounts runs concurrently; the files are written once all
    // are translated, so a failed batch leaves every dictionary as it was.
    const translate = async (entries: Array<{ key: string, value: string, context?: string }>, targetLang: string): Promise<Record<string, any>> => {
      try {
        return await this.translationService.translateEntries(entries, targetLang, projectContext, i18nPath)
      } catch (error) {
        return logger.error(`Failed to translate batch: ${error}`)
      }
    }

    const rootEntries = sourceEntries.map(entry => ({ ...entry, context: savedContexts[entry.key]?.input }))

    const root = Promise.all(targetLocales.map(async targetLang => {
      logger.log(`Syncing ${sourceEntries.length} entries to "${targetLang}"...`)

      return { targetLang, data: overlay(sourceDataWithoutNative, await translate(rootEntries, targetLang)) }
    }))

    const files: Array<Promise<{ file: string, data: Record<string, any>, mount: string }>> = []

    // Mounts hold only their own keys: `native`, `locale` and `dir` belong to the root dictionary.
    const allMounts = this.translationService.contextManagerInstance.getAllMounts(i18nPath)
    for (const [mountName, mountPath] of Object.entries(allMounts)) {
      const partitionI18nDir = `${i18nPath}/${mountPath}`

      // Create directory if it doesn't exist
      if (!fs.existsSync(partitionI18nDir)) {
        fs.mkdirSync(partitionI18nDir, { recursive: true })
        logger.log(`Created partition directory: ${partitionI18nDir}`)
      }

      // For partitions, we need to check if they have their own locale files
      const partitionLocaleFiles = fs.readdirSync(partitionI18nDir)
        .filter((file: string) => file.match(/^[a-z]{2}(-[A-Z]{2})?\.yaml$/))

      if (partitionLocaleFiles.length === 0) {
        logger.log(`Skipping partition "${mountName}" - no locale files found`)
        continue
      }

      const partitionSourceFile = `${partitionI18nDir}/${sourceLang}.yaml`

      if (fs.existsSync(partitionSourceFile)) {
        // Partition has its own source file, sync from that
        const { native: _native, locale: _locale, dir: _partitionDir, ...partitionSource } = yaml.load(fs.readFileSync(partitionSourceFile, 'utf8')) ?? {}
        const partitionSavedContexts = this.translationService.contextManagerInstance.getAllContextEntries(partitionI18nDir)
        const partitionEntries = this.translationService.extractEntries(partitionSource)
          .map(entry => ({ ...entry, context: partitionSavedContexts[entry.key]?.input }))

        for (const targetLang of targetLocales) {
          logger.log(`Syncing ${partitionEntries.length} entries for partition "${mountName}" to "${targetLang}"...`)
          files.push(translate(partitionEntries, targetLang)
            .then(data => ({ file: `${partitionI18nDir}/${targetLang}.yaml`, data: overlay(partitionSource, data), mount: mountName })))
        }
      } else {
        // Partition doesn't have source file: it takes the root's translations
        for (const targetLang of targetLocales)
          files.push(root.then(translated => ({
            file: `${partitionI18nDir}/${targetLang}.yaml`,
            data: translated.find(t => t.targetLang === targetLang)!.data,
            mount: mountName,
          })))
      }
    }

    const rootFiles = (await root).map(({ targetLang, data }) => ({
      file: `${i18nDir}/${targetLang}.yaml`,
      data: { native: getNativeLanguageName(targetLang), locale: targetLang, dir: getTextDirection(targetLang), ...data },
    }))

    const mountFiles = await Promise.all(files)

    for (const { file, data } of rootFiles) {
      writeYaml(file, data)
      logger.log(`✅ Synced ${file} with ${sourceEntries.length} entries`)
    }

    for (const { file, data, mount } of mountFiles) {
      writeYaml(file, data)
      logger.log(`✅ Synced ${file} in partition "${mount}"`)
    }
  }

  private extractValue(obj: any, path: string): string | undefined {
    const keys = path.split('.')
    let current = obj

    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key]
      } else {
        return undefined
      }
    }

    return typeof current === 'string' ? current : undefined
  }
}
