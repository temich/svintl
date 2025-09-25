/**
 * @author copilot
 */

import { TranslationService } from './TranslationService'
import { logger } from './logger'
import { validateLanguageTag } from './bcp47'

export class DestroyCommand {
  private translationService = new TranslationService()

  async execute(targetLang: string, force = false, i18nPath = './src/lib/intl/'): Promise<void> {
    // Validate BCP 47 language tag
    const validationError = validateLanguageTag(targetLang)
    if (validationError) {
      logger.error(validationError)
    }

    const { i18nDir } = this.translationService.getLanguageInfo(i18nPath)
    const targetFile = `${i18nDir}/${targetLang}.yaml`

    // Check if target language exists
    const fs = require('fs')
    if (!fs.existsSync(targetFile)) {
      logger.error(`Language "${targetLang}" does not exist at ${targetFile}`)
    }

    // Ask for confirmation unless force flag is used
    if (!force) {
      logger.log(`⚠️  This will permanently delete the "${targetLang}" language dictionary.`)
      logger.log(`File: ${targetFile}`)
      logger.log('')
      logger.log('Are you sure? This action cannot be undone.')
      logger.log('Use the -y flag to skip this confirmation.')
      logger.error('Operation cancelled. Use -y flag to force deletion.')
    }

    try {
      // Delete the file
      fs.unlinkSync(targetFile)
      logger.log(`✅ Deleted ${targetFile}`)

      // Rebuild dictionaries
      require('./build').build(i18nPath)
      logger.log(`✅ Updated dictionaries`)
    } catch (error) {
      logger.error(`Failed to delete ${targetFile}: ${error}`)
    }
  }
}
