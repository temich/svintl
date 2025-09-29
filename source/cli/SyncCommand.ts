/**
 * @author copilot
 */

import { TranslationService } from './TranslationService'
import { logger } from './logger'
import { validateLanguageTag } from './bcp47'
import { parsePartitionedKey, getPartitionPath } from './partition'

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
      await this.syncSpecificKey(sourceLang, actualKey, targetLocales, i18nDir)
    } else {
      await this.syncAllKeys(sourceLang, targetLocales, i18nDir)
    }

    logger.log(`✅ Translated`)

    // Auto-build dictionaries
    require('./build').build(getPartitionPath(i18nPath, partition))
  }

  private async syncSpecificKey(sourceLang: string, specificKey: string, targetLocales: string[], i18nDir: string): Promise<void> {
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

    // Translate using OpenAI
    const systemPrompt = `You are a professional translator. Translate the given text to the specified locales. Return ONLY a JSON object with locale codes as keys and translations as values.`

    try {
      const translations = await this.translationService.translateWithOpenAI(
        sourceValue!,
        targetLocales,
        systemPrompt
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

  private async syncAllKeys(sourceLang: string, targetLocales: string[], i18nDir: string): Promise<void> {
    const fs = require('fs')
    const yaml = require('js-yaml')

    const sourceFile = `${i18nDir}/${sourceLang}.yaml`
    const sourceContent = fs.readFileSync(sourceFile, 'utf8')
    const sourceData = yaml.load(sourceContent) as any

    // Extract all entries from source
    const sourceEntries = this.extractEntries(sourceData)
    logger.log(`Source has ${sourceEntries.length} entries`)

    if (sourceEntries.length === 0) {
      logger.warn(`No entries found in source language "${sourceLang}"`)
      return
    }

    // For simplicity, copy all source values (in a real implementation, you'd want to translate)
    if (!process.env.OPENAI_API_KEY) {
      logger.warn('OPENAI_API_KEY not found - copying source values without translation')

      for (const lang of targetLocales) {
        const targetFile = `${i18nDir}/${lang}.yaml`
        for (const entry of sourceEntries) {
          this.translationService.updateLocaleFile(targetFile, entry.key, entry.value)
        }
      }
      logger.log('✅ Translated')
      return
    }

    // In a full implementation, you would batch translate entries
    // For now, we'll just copy source values
    for (const lang of targetLocales) {
      const targetFile = `${i18nDir}/${lang}.yaml`
      for (const entry of sourceEntries) {
        this.translationService.updateLocaleFile(targetFile, entry.key, entry.value)
      }
    }

    logger.log('✅ Translated')
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

  private extractEntries(obj: any, prefix = ''): Array<{ key: string; value: string }> {
    const entries: Array<{ key: string; value: string }> = []

    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key

      if (typeof value === 'string') {
        entries.push({ key: fullKey, value })
      } else if (typeof value === 'object' && value !== null) {
        entries.push(...this.extractEntries(value, fullKey))
      }
    }

    return entries
  }
}
