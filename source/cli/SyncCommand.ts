/**
 * @author copilot
 */

import { TranslationService } from './TranslationService'
import { logger } from './logger'
import { validateLanguageTag, getNativeLanguageName, getTextDirection } from './bcp47'
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

        const yamlContent = yaml.dump(translatedData, {
          lineWidth: -1,
          quotingType: '"',
          forceQuotes: false,
        })

        fs.writeFileSync(targetFile, yamlContent)
      }
      logger.log('✅ Synced without translation')
      return
    }

    const projectContext = this.translationService.getGlobalProjectContext(i18nPath)

    // For each target locale, translate all entries in batches of 10
    for (const targetLang of targetLocales) {
      logger.log(`Syncing to "${targetLang}"...`)

      const targetFile = `${i18nDir}/${targetLang}.yaml`
      const nativeName = getNativeLanguageName(targetLang)
      const translatedData: any = {
        native: nativeName,
        locale: targetLang,
        dir: getTextDirection(targetLang),
      }

      // Translate entries in batches of 10
      const batchSize = 10
      for (let i = 0; i < sourceEntries.length; i += batchSize) {
        const batch = sourceEntries.slice(i, i + batchSize)
        const batchKeys = batch.map(e => e.key)
        const batchValues = batch.map(e => e.value)
        const batchContexts = batch.map(e => savedContexts[e.key]?.input)

        logger.log(`Translating batch ${Math.floor(i / batchSize) + 1}: ${batchKeys.join(', ')}`)

        try {
          const batchTranslations = await this.translationService.translateBatch({
            values: batchValues,
            contexts: batchContexts,
            targetLang,
            i18nPath,
            projectContext,
          })

          // Apply translations to the data structure
          for (let j = 0; j < batch.length; j++) {
            const entry = batch[j]
            const translation = batchTranslations[j]
            if (translation) {
              this.translationService.setNestedValue(translatedData, entry.key, translation)
            } else {
              // Fallback to original value
              this.translationService.setNestedValue(translatedData, entry.key, entry.value)
            }
          }
        } catch (error) {
          logger.error(`Failed to translate batch: ${error}`)
          // Fallback to original values for the entire batch
          for (const entry of batch) {
            this.translationService.setNestedValue(translatedData, entry.key, entry.value)
          }
        }
      }

      const yamlContent = yaml.dump(translatedData, {
        lineWidth: -1,
        quotingType: '"',
        forceQuotes: false,
      })

      fs.writeFileSync(targetFile, yamlContent)
      logger.log(`✅ Synced ${targetLang} with ${sourceEntries.length} entries`)
    }

    // Sync files in all mounted partitions as well
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
        // No locale files in partition, skip syncing
        logger.log(`Skipping partition "${mountName}" - no locale files found`)
        continue
      }

      // Sync each target locale to partition
      for (const targetLang of targetLocales) {
        const partitionTargetFile = `${partitionI18nDir}/${targetLang}.yaml`
        const nativeName = getNativeLanguageName(targetLang)
        const partitionTranslatedData: any = {
          native: nativeName,
          locale: targetLang,
          dir: getTextDirection(targetLang),
        }

        // Check if partition has its own source file
        const partitionSourceFile = `${partitionI18nDir}/${sourceLang}.yaml`
        if (fs.existsSync(partitionSourceFile)) {
          // Partition has its own source file, sync from that
          const partitionSourceContent = fs.readFileSync(partitionSourceFile, 'utf8')
          const partitionSourceData = yaml.load(partitionSourceContent) as any
          const partitionSourceDataWithoutNative = { ...partitionSourceData }
          delete partitionSourceDataWithoutNative.native
          delete partitionSourceDataWithoutNative.locale
          delete partitionSourceDataWithoutNative.dir

          const partitionEntries = this.translationService.extractEntries(partitionSourceDataWithoutNative)
          const partitionSavedContexts = this.translationService.contextManagerInstance.getAllContextEntries(partitionI18nDir)

          logger.log(`Syncing ${partitionEntries.length} entries for partition "${mountName}" to "${targetLang}"...`)

          // Translate partition entries in batches
          const partitionBatchSize = 10
          for (let i = 0; i < partitionEntries.length; i += partitionBatchSize) {
            const batch = partitionEntries.slice(i, i + partitionBatchSize)
            const batchKeys = batch.map(e => e.key)
            const batchValues = batch.map(e => e.value)
            const batchContexts = batch.map(e => partitionSavedContexts[e.key]?.input)

            logger.log(`Translating partition batch ${Math.floor(i / partitionBatchSize) + 1}: ${batchKeys.join(', ')}`)

            if (!process.env.OPENAI_API_KEY) {
              // Copy source values without translation
              for (const entry of batch) {
                this.translationService.setNestedValue(partitionTranslatedData, entry.key, entry.value)
              }
            } else {
              try {
                const batchTranslations = await this.translationService.translateBatch({
                  values: batchValues,
                  contexts: batchContexts,
                  targetLang,
                  i18nPath,
                  projectContext,
                })

                // Apply translations to the partition data structure
                for (let j = 0; j < batch.length; j++) {
                  const entry = batch[j]
                  const translation = batchTranslations[j]
                  if (translation) {
                    this.translationService.setNestedValue(partitionTranslatedData, entry.key, translation)
                  } else {
                    // Fallback to original value
                    this.translationService.setNestedValue(partitionTranslatedData, entry.key, entry.value)
                  }
                }
              } catch (error) {
                logger.error(`Failed to translate partition batch: ${error}`)
                // Fallback to original values for the entire batch
                for (const entry of batch) {
                  this.translationService.setNestedValue(partitionTranslatedData, entry.key, entry.value)
                }
              }
            }
          }
        } else {
          // Partition doesn't have source file, copy from main source
          if (!process.env.OPENAI_API_KEY) {
            // Copy source values without translation
            for (const entry of sourceEntries) {
              this.translationService.setNestedValue(partitionTranslatedData, entry.key, entry.value)
            }
          } else {
            // Use already translated data from main sync
            const mainTranslatedFile = `${i18nDir}/${targetLang}.yaml`
            if (fs.existsSync(mainTranslatedFile)) {
              const mainTranslatedContent = fs.readFileSync(mainTranslatedFile, 'utf8')
              const mainTranslatedData = yaml.load(mainTranslatedContent) as any
              const mainTranslatedDataWithoutNative = { ...mainTranslatedData }
              delete mainTranslatedDataWithoutNative.native
              delete mainTranslatedDataWithoutNative.locale
              delete mainTranslatedDataWithoutNative.dir

              const mainTranslatedEntries = this.translationService.extractEntries(mainTranslatedDataWithoutNative)
              for (const entry of mainTranslatedEntries) {
                this.translationService.setNestedValue(partitionTranslatedData, entry.key, entry.value)
              }
            } else {
              // Fallback to source values
              for (const entry of sourceEntries) {
                this.translationService.setNestedValue(partitionTranslatedData, entry.key, entry.value)
              }
            }
          }
        }

        const partitionYamlContent = yaml.dump(partitionTranslatedData, {
          lineWidth: -1,
          quotingType: '"',
          forceQuotes: false,
        })

        fs.writeFileSync(partitionTargetFile, partitionYamlContent)
        logger.log(`✅ Synced ${partitionTargetFile} in partition "${mountName}"`)
      }
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
