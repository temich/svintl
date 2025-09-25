/**
 * CLI command for setting values in all i18n dictionaries without translation
 * Sets the same value across all language files without using OpenAI API
 *
 * @author claude-4-sonnet
 */

import { TranslationService } from './TranslationService'

export class ConstCommand {
  private translationService = new TranslationService()

  async execute(key: string, value: string, i18nPath = './src/lib/intl/'): Promise<void> {
    this.translationService.log(`Setting constant "${key}" with value "${value}" in all dictionaries...`)

    // Get language information
    const { languageFiles, i18nDir } = this.translationService.getLanguageInfo(i18nPath)

    if (languageFiles.length === 0) {
      this.translationService.error(`No language files found in ${i18nDir}. Run 'npx intl hola' first.`)
    }

    this.translationService.log(`Updating ${languageFiles.length} language files...`)

    // Update all language files with the same value
    for (const file of languageFiles) {
      const filePath = `${i18nDir}/${file}`
      try {
        this.translationService.updateLanguageFile(filePath, key, value)
        this.translationService.log(`✓ Updated ${file}`)
      } catch (error) {
        this.translationService.error(`Failed to update ${file}: ${error}`)
      }
    }

    this.translationService.log(`✅ Successfully set constant "${key}" in all language files`)

    // Auto-build dictionaries
    this.translationService.finalize(i18nPath, key, value)
  }
}
