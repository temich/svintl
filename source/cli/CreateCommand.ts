/**
 * @author claude-4-sonnet
 */

import { TranslationService } from './TranslationService'
import { validateLanguageTag, getNativeLanguageName } from './bcp47'

export class CreateCommand {
  private translationService = new TranslationService()

  async execute(targetLang: string, sourceLang?: string, i18nPath = './src/lib/intl/'): Promise<void> {
    // Validate BCP 47 language tag
    const validationError = validateLanguageTag(targetLang)
    if (validationError) {
      this.translationService.error(validationError)
    }

    const { i18nDir } = this.translationService.getLanguageInfo(i18nPath)
    const targetFile = `${i18nDir}/${targetLang}.yaml`

    const fs = require('fs')
    const yaml = require('js-yaml')
    const path = require('path')

    // Create directory if it doesn't exist
    if (!fs.existsSync(i18nDir)) {
      fs.mkdirSync(i18nDir, { recursive: true })
      this.translationService.log(`Created directory: ${i18nDir}`)
    }

    // Check if target language already exists
    if (fs.existsSync(targetFile)) {
      this.translationService.error(`Language "${targetLang}" already exists at ${targetFile}`)
    }

    // Get native language name
    const nativeName = getNativeLanguageName(targetLang)

    // If no source language is provided, create minimal file with native name
    if (!sourceLang) {
      this.translationService.log(`Creating language file for "${targetLang}"...`)

      const initialContent = {
        native: nativeName,
      }

      const yamlContent = yaml.dump(initialContent, {
        lineWidth: -1,
        quotingType: '"',
        forceQuotes: false,
      })

      fs.writeFileSync(targetFile, yamlContent)

      require('./build').build(i18nPath)
      this.translationService.log(`✅ Created ${targetFile} with native name: ${nativeName}`)
      return
    }

    // Get existing files to determine source language
    const existingFiles = fs.readdirSync(i18nDir)
      .filter((file: string) => file.match(/^[a-z]{2}(-[A-Z]{2})?\.yaml$/))

    // Validate source language
    if (sourceLang) {
      const sourceFile = path.join(i18nDir, `${sourceLang}.yaml`)
      if (!fs.existsSync(sourceFile)) {
        this.translationService.error(`Source language "${sourceLang}" does not exist`)
      }
    } else if (!existingFiles.includes('en.yaml')) {
      this.translationService.error(`No English (en) language found. Please specify source language: npx intl create ${targetLang} <source-lang>`)
    }

    const sourceLanguage = sourceLang || 'en'
    this.translationService.log(`Creating "${targetLang}" language from "${sourceLanguage}" source...`)

    // Load source dictionary
    const sourceFile = path.join(i18nDir, `${sourceLanguage}.yaml`)
    const sourceContent = fs.readFileSync(sourceFile, 'utf8')
    const sourceData = yaml.load(sourceContent) as any

    // Extract all key-value pairs for translation (excluding native key)
    const { native, ...sourceDataWithoutNative } = sourceData
    const entries = this.extractEntries(sourceDataWithoutNative)

    // Get saved contexts for enriched translation
    const savedContexts = this.translationService.contextManagerInstance.getAllContextEntries(i18nPath)

    this.translationService.log(`Found ${entries.length} entries to translate`)
    if (Object.keys(savedContexts).length > 0) {
      this.translationService.log(`Found ${Object.keys(savedContexts).length} saved contexts for enhanced translation`)
    }

    if (entries.length === 0) {
      // Create minimal file with just native name
      const initialContent = {
        native: nativeName,
      }

      const yamlContent = yaml.dump(initialContent, {
        lineWidth: -1,
        quotingType: '"',
        forceQuotes: false,
      })

      fs.writeFileSync(targetFile, yamlContent)
      require('./build').build(i18nPath)
      this.translationService.log(`✅ Created ${targetFile} with native name: ${nativeName}`)
      return
    }

    // For now, just copy source values (in a real implementation, you'd translate them)
    const targetContent = {
      native: nativeName,
      ...sourceDataWithoutNative
    }

    const yamlContent = yaml.dump(targetContent, {
      lineWidth: -1,
      quotingType: '"',
      forceQuotes: false,
    })

    fs.writeFileSync(targetFile, yamlContent)

    // Build dictionaries
    require('./build').build(i18nPath)
    this.translationService.log(`✅ Created ${targetFile} from ${sourceLanguage} with ${entries.length} entries`)
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