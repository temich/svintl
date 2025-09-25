/**
 * @author claude-4-sonnet
 */

import { TranslationService } from './TranslationService'
import { validateLanguageTag } from './bcp47'

export class DestroyCommand {
  private translationService = new TranslationService()

  async execute(targetLang: string, force = false, i18nPath = './src/lib/intl/'): Promise<void> {
    // Validate BCP 47 language tag
    const validationError = validateLanguageTag(targetLang)
    if (validationError) {
      this.translationService.error(validationError)
    }

    const { i18nDir } = this.translationService.getLanguageInfo(i18nPath)
    const targetFile = `${i18nDir}/${targetLang}.yaml`

    // Check if target language exists
    const fs = require('fs')
    if (!fs.existsSync(targetFile)) {
      this.translationService.error(`Language "${targetLang}" does not exist at ${targetFile}`)
    }

    // Ask for confirmation unless force flag is used
    if (!force) {
      this.translationService.log(`⚠️  This will permanently delete the "${targetLang}" language dictionary.`)
      this.translationService.log(`File: ${targetFile}`)
      this.translationService.log('')
      this.translationService.log('Are you sure? This action cannot be undone.')
      this.translationService.log('Use the -y flag to skip this confirmation.')
      this.translationService.error('Operation cancelled. Use -y flag to force deletion.')
    }

    try {
      // Delete the file
      fs.unlinkSync(targetFile)
      this.translationService.log(`✅ Deleted ${targetFile}`)

      // Rebuild dictionaries
      require('./build').build(i18nPath)
      this.translationService.log(`✅ Updated dictionaries`)
    } catch (error) {
      this.translationService.error(`Failed to delete ${targetFile}: ${error}`)
    }
  }
}
