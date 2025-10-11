/**
 * @author copilot
 */

import { TranslationService } from './TranslationService'
import { logger } from './logger'
import { validateLanguageTag, getNativeLanguageName } from './bcp47'
import { parsePartitionedKey, getPartitionPath } from './partition'
import OpenAI from 'openai'

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
      await this.syncAllKeys(sourceLang, targetLocales, i18nDir, i18nPath)
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

  private async syncAllKeys(sourceLang: string, targetLocales: string[], i18nDir: string, i18nPath: string): Promise<void> {
    const fs = require('fs')
    const yaml = require('js-yaml')

    const sourceFile = `${i18nDir}/${sourceLang}.yaml`
    const sourceContent = fs.readFileSync(sourceFile, 'utf8')
    const sourceData = yaml.load(sourceContent) as any

    // Extract all entries from source (excluding native and locale keys)
    const { native, locale, ...sourceDataWithoutNative } = sourceData
    const sourceEntries = this.extractEntries(sourceDataWithoutNative)
    logger.log(`Source has ${sourceEntries.length} entries`)

    if (sourceEntries.length === 0) {
      logger.warn(`No entries found in source language "${sourceLang}"`)
      return
    }

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
          locale: lang
        }

        for (const entry of sourceEntries) {
          this.setNestedValue(translatedData, entry.key, entry.value)
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

    // Create system prompt for translations
    const systemPrompt = `You are a professional translator for an internationalization system. You will receive text in ANY locale and must translate it to the specified target locale.

IMPORTANT RULES:
1. DETECT the input locale automatically - do not assume it's English
2. If the input starts with "!js", it's a JavaScript function that returns localized strings
3. For !js functions: Keep the "!js" tag but ADAPT the JavaScript logic to match the target locale's grammar rules
4. You can modify conditions, logic, and structure to fit the target locale's pluralization and grammar rules
5. For regular text: Translate from the detected source locale to the target locale
6. Always maintain the exact same function parameters (don't change parameter names or count)
7. Use DOUBLE QUOTES for all string literals to avoid JavaScript syntax errors
8. Translate ALL parts of compound phrases completely
9. Ensure translations sound natural and commonly used within the provided context
10. For UI elements (buttons, links, menus), choose idiomatic, inviting phrasing that native speakers expect in that scenario
11. When translating navigation or call-to-action text, prefer natural, inviting prompts that encourage exploration over literal location descriptors

GRAMMAR ADAPTATION EXAMPLES (any source language):

Source language to Russian (any → complex pluralization):
Input: "!js\n(count) => count === 1 ? 'one item' : \`\${count} items\`"
Russian: "!js\n(count) => { const rem = count % 10; const tens = Math.floor(count / 10) % 10; if (tens === 1) return \`\${count} предметов\`; if (rem === 1) return \`\${count} предмет\`; if (rem >= 2 && rem <= 4) return \`\${count} предмета\`; return \`\${count} предметов\`; }"

Source language to German (any → simple pluralization):
Input: "!js\n(count) => count === 1 ? 'une chose' : \`\${count} choses\`" (French)
German: "!js\n(count) => count === 1 ? \"1 Ding\" : \`\${count} Dinge\`"

Russian to other languages (complex → simpler pluralization):
Input: "!js\n(count) => { const rem = count % 10; if (rem === 1) return '1 предмет'; return \`\${count} предметов\`; }"
English: "!js\n(count) => count === 1 ? \"1 item\" : \`\${count} items\`"
French: "!js\n(count) => count === 1 ? \"1 article\" : \`\${count} articles\`"

CRITICAL:
- Automatically detect the source language from input text
- Always use double quotes (") for string literals in JavaScript, never single quotes (')
- For !js functions, ALWAYS include the "!js" tag at the beginning of each translation
- Escape quotes properly in JSON: use \\" for literal quotes in the function
- ADAPT the logic to match the target language's grammar, don't just translate strings
- Keep the same function parameters but change conditions and return values as needed

Target language: {targetLang}

Return ONLY the translation as a string.`

    // For each target locale, translate all entries in batches of 10
    for (const targetLang of targetLocales) {
      logger.log(`Syncing to "${targetLang}"...`)

      const targetFile = `${i18nDir}/${targetLang}.yaml`
      const nativeName = getNativeLanguageName(targetLang)
      const translatedData: any = {
        native: nativeName,
        locale: targetLang
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
          const batchTranslations = await this.translateBatch(
            batchValues,
            batchContexts,
            targetLang,
            systemPrompt.replace('{targetLang}', targetLang)
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
          locale: targetLang
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

          const partitionEntries = this.extractEntries(partitionSourceDataWithoutNative)
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
                this.setNestedValue(partitionTranslatedData, entry.key, entry.value)
              }
            } else {
              try {
                const batchTranslations = await this.translateBatch(
                  batchValues,
                  batchContexts,
                  targetLang,
                  systemPrompt.replace('{targetLang}', targetLang)
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
          }
        } else {
          // Partition doesn't have source file, copy from main source
          if (!process.env.OPENAI_API_KEY) {
            // Copy source values without translation
            for (const entry of sourceEntries) {
              this.setNestedValue(partitionTranslatedData, entry.key, entry.value)
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

              const mainTranslatedEntries = this.extractEntries(mainTranslatedDataWithoutNative)
              for (const entry of mainTranslatedEntries) {
                this.setNestedValue(partitionTranslatedData, entry.key, entry.value)
              }
            } else {
              // Fallback to source values
              for (const entry of sourceEntries) {
                this.setNestedValue(partitionTranslatedData, entry.key, entry.value)
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
    baseSystemPrompt: string
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

    const systemPrompt = baseSystemPrompt.replace(
      'Return ONLY the translation as a string.',
      `Translate all ${values.length} items below to ${targetLang}.

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
