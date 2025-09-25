/**
 * @author claude-4-sonnet
 */

import { TranslationService } from './TranslationService'

export class RemoveCommand {
  private translationService = new TranslationService()

  async execute(key: string, i18nPath = './src/lib/intl/'): Promise<void> {
    this.translationService.log(`Removing "${key}" from all language files...`)

    // Get language information
    const { languageFiles, i18nDir } = this.translationService.getLanguageInfo(i18nPath)

    let keyExists = false

    // Remove key from all language files
    for (const file of languageFiles) {
      const filePath = `${i18nDir}/${file}`

      try {
        const removed = this.translationService.removeFromLanguageFile(filePath, key)
        if (removed) {
          this.translationService.log(`✓ Removed from ${file}`)
          keyExists = true
        }
      } catch (error) {
        this.translationService.warn(`Failed to update ${file}: ${error}`)
      }
    }

    if (!keyExists) {
      this.translationService.warn(`Key "${key}" not found in any language files`)
    }

    // Remove context entry if it exists
    try {
      const removed = this.translationService.contextManagerInstance.removeContextEntry(i18nPath, key)
      if (removed) {
        this.translationService.log(`✓ Removed context for "${key}"`)
      }
    } catch (error) {
      this.translationService.warn(`Failed to remove context: ${error}`)
    }

    this.translationService.log(`✅ Saved`)

    // Auto-build dictionaries
    require('./build').build(i18nPath)
  }
}