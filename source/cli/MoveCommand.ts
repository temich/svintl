/**
 * CLI command for moving/renaming i18n entries across all language files
 * Preserves translations while updating key paths
 *
 * @author claude-4-sonnet
 */

import { TranslationService } from './TranslationService'

export class MoveCommand {
  private translationService = new TranslationService()

  async execute(from: string, to: string, i18nPath = './src/lib/intl/'): Promise<void> {
    this.translationService.log(`Moving "${from}" to "${to}"...`)

    // Get language information
    const { languageFiles, i18nDir } = this.translationService.getLanguageInfo(i18nPath)

    // Store the values from all languages
    const values: Record<string, string> = {}
    let keyExists = false

    // First pass: collect all values and check if key exists
    for (const file of languageFiles) {
      const lang = file.replace('.yaml', '')
      const filePath = `${i18nDir}/${file}`

      try {
        const value = this.extractValue(filePath, from)
        if (value !== null) {
          values[lang] = value
          keyExists = true
        }
      } catch (error) {
        this.translationService.warn(`Failed to read ${file}: ${error}`)
      }
    }

    if (!keyExists) {
      this.translationService.error(`Key "${from}" not found in any language files`)
    }

    // Second pass: move the values
    for (const file of languageFiles) {
      const lang = file.replace('.yaml', '')
      const filePath = `${i18nDir}/${file}`

      if (values[lang]) {
        try {
          // Remove from old location and add to new location
          this.translationService.removeFromLanguageFile(filePath, from)
          this.translationService.updateLanguageFile(filePath, to, values[lang])
          this.translationService.log(`✓ Moved in ${file}`)
        } catch (error) {
          this.translationService.error(`Failed to update ${file}: ${error}`)
        }
      }
    }

    // Move context entry if it exists
    try {
      const moved = this.translationService.contextManagerInstance.moveContextEntry(i18nPath, from, to)
      if (moved) {
        this.translationService.log(`✓ Moved context from "${from}" to "${to}"`)
      }
    } catch (error) {
      this.translationService.warn(`Failed to move context: ${error}`)
    }

    this.translationService.log(`✅ Saved`)

    // Auto-build dictionaries
    require('./build').build(i18nPath)
  }

  private extractValue(filePath: string, key: string): string | null {
    const fs = require('fs')
    const yaml = require('js-yaml')
    
    const content = fs.readFileSync(filePath, 'utf8')
    const yamlData = yaml.load(content) as any

    // Navigate to the key
    const keyParts = key.split('.')
    let current = yamlData

    for (const part of keyParts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part]
      } else {
        return null
      }
    }

    return typeof current === 'string' ? current : null
  }
}