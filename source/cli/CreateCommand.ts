/**
 * @author copilot
 */

import { TranslationService } from './TranslationService'
import { logger } from './logger'
import { validateLanguageTag, getNativeLanguageName, getTextDirection } from './bcp47'
import { parsePartitionedKey } from './partition'
import OpenAI from 'openai'

export class CreateCommand {
  private translationService = new TranslationService()

  async execute(targetLang: string, sourceLang?: string, i18nPath = './src/lib/intl/'): Promise<void> {
    // Validate BCP 47 language tag
    const validationError = validateLanguageTag(targetLang)
    if (validationError) {
      logger.error(validationError)
    }

    const { i18nDir } = this.translationService.getLocaleInfo(i18nPath)
    const targetFile = `${i18nDir}/${targetLang}.yaml`

    const fs = require('fs')
    const yaml = require('js-yaml')
    const path = require('path')

    // Create directory if it doesn't exist
    if (!fs.existsSync(i18nDir)) {
      fs.mkdirSync(i18nDir, { recursive: true })
      logger.log(`Created directory: ${i18nDir}`)
    }

    // Check if target language already exists
    if (fs.existsSync(targetFile)) {
      logger.error(`Language "${targetLang}" already exists at ${targetFile}`)
    }

    // Get native language name
    const nativeName = getNativeLanguageName(targetLang)
    const dir = getTextDirection(targetLang)

    // If no source language is provided, create minimal file with native name
    if (!sourceLang) {
      logger.log(`Creating language file for "${targetLang}"...`)

      const initialContent = {
        native: nativeName,
        locale: targetLang,
        dir,
      }

      const yamlContent = yaml.dump(initialContent, {
        lineWidth: -1,
        quotingType: '"',
        forceQuotes: false,
      })

      fs.writeFileSync(targetFile, yamlContent)

      require('./build').build(i18nPath)
      logger.log(`✅ Created ${targetFile} with native name: ${nativeName}`)
      return
    }

    // Get existing files to determine source language
    const existingFiles = fs.readdirSync(i18nDir)
      .filter((file: string) => file.match(/^[a-z]{2}(-[A-Z]{2})?\.yaml$/))

    // Validate source language
    let sourceLanguage = sourceLang
    if (sourceLang) {
      const sourceFile = path.join(i18nDir, `${sourceLang}.yaml`)
      if (!fs.existsSync(sourceFile)) {
        // If the exact source file doesn't exist and it's 'en', try to find any English variant
        if (sourceLang === 'en') {
          const englishFile = existingFiles.find((file: string) => file.startsWith('en') && file.endsWith('.yaml'))
          if (englishFile) {
            sourceLanguage = englishFile.replace('.yaml', '')
            logger.log(`Using "${sourceLanguage}" as source language (found English variant)`)
          } else {
            logger.error(`Source language "${sourceLang}" does not exist and no English variants found`)
          }
        } else {
          logger.error(`Source language "${sourceLang}" does not exist`)
        }
      } else {
        sourceLanguage = sourceLang
      }
    } else {
      // If no source language provided, look for any English locale file
      const englishFile = existingFiles.find((file: string) => file.startsWith('en') && file.endsWith('.yaml'))
      if (!englishFile) {
        logger.error(`No English (en*) language found. Please specify source language: npx intl create ${targetLang} <source-lang>`)
      }
      sourceLanguage = englishFile.replace('.yaml', '')
    }
    logger.log(`Creating "${targetLang}" language from "${sourceLanguage}" source...`)

    // Load source dictionary
    const sourceFile = path.join(i18nDir, `${sourceLanguage}.yaml`)
    const sourceContent = fs.readFileSync(sourceFile, 'utf8')
    const sourceData = yaml.load(sourceContent) as any

    // Extract all key-value pairs for translation (excluding reserved keys)
    const { native, locale, dir: _dir, ...sourceDataWithoutNative } = sourceData
    const entries = this.extractEntries(sourceDataWithoutNative)

    // Get saved contexts for enriched translation
    const savedContexts = this.translationService.contextManagerInstance.getAllContextEntries(i18nPath)

    logger.log(`Found ${entries.length} entries to translate`)
    if (Object.keys(savedContexts).length > 0) {
      logger.log(`Found ${Object.keys(savedContexts).length} saved contexts for enhanced translation`)
    }

    if (entries.length === 0) {
      // Create minimal file with just native name
      const initialContent = {
        native: nativeName,
        locale: targetLang,
        dir,
      }

      const yamlContent = yaml.dump(initialContent, {
        lineWidth: -1,
        quotingType: '"',
        forceQuotes: false,
      })

      fs.writeFileSync(targetFile, yamlContent)
      require('./build').build(i18nPath)
      logger.log(`✅ Created ${targetFile} with native name: ${nativeName}`)
      return
    }

    // Create system prompt for translations
    const systemPrompt = `You are a professional translator for an internationalization system. You will receive text in ANY locale and must translate it to the specified target locale.

${this.translationService.getCommonTranslationPromptBody()}

Target language: ${targetLang}

Return ONLY the translation as a string.`

    const genderInstructions = this.translationService.getGenderInstructions(i18nPath)
    const systemPromptWithGender = genderInstructions ? `${systemPrompt}\n\n${genderInstructions}` : systemPrompt

    const projectContext = this.translationService.getGlobalProjectContext(i18nPath)

    // Translate entries in batches of 10
    const translatedData: any = {
      native: nativeName,
      locale: targetLang,
      dir,
    }

    const batchSize = 10
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize)
      const batchKeys = batch.map(e => e.key)
      const batchValues = batch.map(e => e.value)
      const batchContexts = batch.map(e => savedContexts[e.key]?.input)

      logger.log(`Translating batch ${Math.floor(i / batchSize) + 1}: ${batchKeys.join(', ')}`)

      try {
          const batchTranslations = await this.translateBatch(
          batchValues,
          batchContexts,
          targetLang,
          systemPromptWithGender,
          projectContext
        )

        // Apply translations to the data structure
        for (let j = 0; j < batch.length; j++) {
          const entry = batch[j]
          const translation = batchTranslations[j]
          if (translation) {
            this.setNestedValue(translatedData, entry.key, translation)
          } else {
            // Fallback to original value
            this.setNestedValue(translatedData, entry.key, entry.value)
          }
        }
      } catch (error) {
        logger.error(`Failed to translate batch: ${error}`)
        // Fallback to original values for the entire batch
        for (const entry of batch) {
          this.setNestedValue(translatedData, entry.key, entry.value)
        }
      }
    }

    const yamlContent = yaml.dump(translatedData, {
      lineWidth: -1,
      quotingType: '"',
      forceQuotes: false,
    })

    fs.writeFileSync(targetFile, yamlContent)
    logger.log(`✅ Created ${targetFile} from ${sourceLanguage} with ${entries.length} entries`)

    // Create files in all mounted partitions as well
    const allMounts = this.translationService.contextManagerInstance.getAllMounts(i18nPath)
    for (const [mountName, mountPath] of Object.entries(allMounts)) {
      const partitionI18nDir = `${i18nPath}/${mountPath}`
      const partitionTargetFile = `${partitionI18nDir}/${targetLang}.yaml`

      // Create directory if it doesn't exist
      if (!fs.existsSync(partitionI18nDir)) {
        fs.mkdirSync(partitionI18nDir, { recursive: true })
        logger.log(`Created partition directory: ${partitionI18nDir}`)
      }

      // Check if target language already exists in partition
      if (fs.existsSync(partitionTargetFile)) {
        logger.error(`Language "${targetLang}" already exists in partition "${mountName}" at ${partitionTargetFile}`)
        continue
      }

      // For partitions, we need to check if they have their own locale files
      const partitionLocaleFiles = fs.readdirSync(partitionI18nDir)
        .filter((file: string) => file.match(/^[a-z]{2}(-[A-Z]{2})?\.yaml$/))

      if (partitionLocaleFiles.length === 0) {
        // No locale files in partition, create minimal file
        const minimalContent = {
          native: nativeName,
          locale: targetLang,
          dir,
        }
        const minimalYamlContent = yaml.dump(minimalContent, {
          lineWidth: -1,
          quotingType: '"',
          forceQuotes: false,
        })
        fs.writeFileSync(partitionTargetFile, minimalYamlContent)
        logger.log(`✅ Created minimal ${partitionTargetFile} in partition "${mountName}"`)
      } else {
        // Translate content for partition - use the same source data but check if partition has specific entries
        const partitionSourceFile = `${partitionI18nDir}/${sourceLanguage}.yaml`
        if (fs.existsSync(partitionSourceFile)) {
          // Partition has its own source file, translate from that
          const partitionSourceContent = fs.readFileSync(partitionSourceFile, 'utf8')
          const partitionSourceData = yaml.load(partitionSourceContent) as any
          const partitionSourceDataWithoutNative = { ...partitionSourceData }
          delete partitionSourceDataWithoutNative.native
          delete partitionSourceDataWithoutNative.locale
          delete partitionSourceDataWithoutNative.dir

          const partitionEntries = this.extractEntries(partitionSourceDataWithoutNative)
          const partitionTranslatedData: any = {
            native: nativeName,
            locale: targetLang,
            dir,
          }

          logger.log(`Translating ${partitionEntries.length} entries for partition "${mountName}"...`)

          // Translate partition entries in batches
          const partitionBatchSize = 10
          for (let i = 0; i < partitionEntries.length; i += partitionBatchSize) {
            const batch = partitionEntries.slice(i, i + partitionBatchSize)
            const batchKeys = batch.map(e => e.key)
            const batchValues = batch.map(e => e.value)
            const batchContexts = batch.map(e => savedContexts[e.key]?.input)

            logger.log(`Translating partition batch ${Math.floor(i / partitionBatchSize) + 1}: ${batchKeys.join(', ')}`)

            try {
              const batchTranslations = await this.translateBatch(
                batchValues,
                batchContexts,
                targetLang,
                systemPromptWithGender,
                projectContext
              )

              // Apply translations to the partition data structure
              for (let j = 0; j < batch.length; j++) {
                const entry = batch[j]
                const translation = batchTranslations[j]
                if (translation) {
                  this.setNestedValue(partitionTranslatedData, entry.key, translation)
                } else {
                  // Fallback to original value
                  this.setNestedValue(partitionTranslatedData, entry.key, entry.value)
                }
              }
            } catch (error) {
              logger.error(`Failed to translate partition batch: ${error}`)
              // Fallback to original values for the entire batch
              for (const entry of batch) {
                this.setNestedValue(partitionTranslatedData, entry.key, entry.value)
              }
            }
          }

          const partitionYamlContent = yaml.dump(partitionTranslatedData, {
            lineWidth: -1,
            quotingType: '"',
            forceQuotes: false,
          })

          fs.writeFileSync(partitionTargetFile, partitionYamlContent)
          logger.log(`✅ Created ${partitionTargetFile} in partition "${mountName}"`)
        } else {
          // Partition doesn't have source file, create minimal file
          const minimalContent = {
            native: nativeName,
            locale: targetLang,
            dir,
          }
          const minimalYamlContent = yaml.dump(minimalContent, {
            lineWidth: -1,
            quotingType: '"',
            forceQuotes: false,
          })
          fs.writeFileSync(partitionTargetFile, minimalYamlContent)
          logger.log(`✅ Created minimal ${partitionTargetFile} in partition "${mountName}"`)
        }
      }
    }

    // Build dictionaries
    require('./build').build(i18nPath)
  }

  /**
   * Batch-translate a flat list of entries (with per-key context) into a nested
   * object of translated keys only — no reserved native/locale/dir keys.
   * Reuses the same OpenAI batch logic as `execute`. Empty input → empty object.
   * Shared with ImportCommand to avoid duplicating the translation pipeline.
   */
  async translateEntries(
    entries: Array<{ key: string; value: string; context?: string }>,
    targetLang: string,
    projectContext?: string,
    genderInstructions?: string | null
  ): Promise<Record<string, any>> {
    const result: any = {}

    if (entries.length === 0)
      return result

    const systemPrompt = `You are a professional translator for an internationalization system. You will receive text in ANY locale and must translate it to the specified target locale.

${this.translationService.getCommonTranslationPromptBody()}

Target language: ${targetLang}

Return ONLY the translation as a string.`
    const systemPromptWithGender = genderInstructions ? `${systemPrompt}\n\n${genderInstructions}` : systemPrompt

    const batchSize = 10
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize)
      const batchValues = batch.map(e => e.value)
      const batchContexts = batch.map(e => e.context)

      const batchTranslations = await this.translateBatch(
        batchValues,
        batchContexts,
        targetLang,
        systemPromptWithGender,
        projectContext
      )

      for (let j = 0; j < batch.length; j++)
        this.setNestedValue(result, batch[j].key, batchTranslations[j] ?? batch[j].value)
    }

    return result
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

  private async translateBatch(
    values: string[],
    contexts: (string | undefined)[],
    targetLang: string,
    baseSystemPrompt: string,
    projectContext?: string
  ): Promise<string[]> {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required')
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })

    // Create batch prompt
    const batchItems = values.map((value, index) => {
      const context = contexts[index]
      return `Item ${index + 1}:
Phrase: ${value}
Context: ${context || 'None provided'}`
    }).join('\n\n')

    const pc = this.translationService.projectContextPromptPrefix(projectContext)
    const systemPrompt = baseSystemPrompt.replace(
      'Return ONLY the translation as a string.',
      `${pc}Translate all ${values.length} items below to ${targetLang}.

${batchItems}

Return ONLY a JSON array of translations in the same order as the items above.`
    )

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4.1',
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: `Translate all ${values.length} items to ${targetLang}. Return a JSON array of strings.`,
          },
        ],
        max_completion_tokens: 4000,
      })

      const response = completion.choices[0]?.message?.content
      if (!response) {
        throw new Error('No response from OpenAI')
      }

      // Parse JSON response
      let cleanResponse = response.trim()
      if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '')
      } else if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '')
      }

      const parsed = JSON.parse(cleanResponse)
      if (Array.isArray(parsed)) {
        return parsed
      } else {
        throw new Error(`Expected JSON array, got: ${typeof parsed}`)
      }
    } catch (error: any) {
      throw new Error(`Batch translation failed: ${error.message}`)
    }
  }

  private setNestedValue(obj: any, keyPath: string, value: any): void {
    const keys = keyPath.split('.')
    let current = obj

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i]
      if (!current[key]) {
        current[key] = {}
      }
      current = current[key]
    }

    current[keys[keys.length - 1]] = value
  }
}
