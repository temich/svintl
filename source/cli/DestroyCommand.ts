/**
 * @author copilot
 */

import { TranslationService } from './TranslationService'
import { logger } from './logger'
import { validateLanguageTag } from './bcp47'
import { ContextFileManager } from './context'
import { getPartitionPath } from './partition'

export class DestroyCommand {
  private translationService = new TranslationService()
  private contextManager = new ContextFileManager()

  async execute(targetLang: string, force = false, i18nPath = './src/lib/intl/'): Promise<void> {
    // Validate BCP 47 language tag
    const validationError = validateLanguageTag(targetLang)
    if (validationError) {
      logger.error(validationError)
    }

    const { i18nDir } = this.translationService.getLocaleInfo(i18nPath)
    const targetFile = `${i18nDir}/${targetLang}.yaml`

    // Check if target locale exists
    const fs = require('fs')
    if (!fs.existsSync(targetFile)) {
      logger.error(`Locale "${targetLang}" does not exist at ${targetFile}`)
    }

    // Get all mounted partitions
    const mounts = this.contextManager.getAllMounts(i18nPath)

    // Ask for confirmation unless force flag is used
    if (!force) {
      logger.log(`⚠️  This will permanently delete the "${targetLang}" language dictionary.`)
      logger.log(`File: ${targetFile}`)

      // Show mounted dictionaries that will also be affected
      if (Object.keys(mounts).length > 0) {
        logger.log('')
        logger.log('This will also delete the locale from the following mounted dictionaries:')
        Object.entries(mounts).forEach(([mountName, mountPath]) => {
          const mountDir = getPartitionPath(i18nPath, mountName)
          logger.log(`  - ${mountName}: ${mountDir}/${targetLang}.yaml`)
        })
      }

      logger.log('')
      logger.log('Are you sure? This action cannot be undone.')
      logger.log('Use the -y flag to skip this confirmation.')
      logger.error('Operation cancelled. Use -y flag to force deletion.')
    }

    try {
      // Delete the file from main directory
      fs.unlinkSync(targetFile)
      logger.log(`✅ Deleted ${targetFile}`)

      // Delete from all mounted partitions
      for (const [mountName, mountPath] of Object.entries(mounts)) {
        const mountDir = getPartitionPath(i18nPath, mountName)
        const mountTargetFile = `${mountDir}/${targetLang}.yaml`

        if (fs.existsSync(mountTargetFile)) {
          fs.unlinkSync(mountTargetFile)
          logger.log(`✅ Deleted ${mountTargetFile}`)
        } else {
          logger.log(`⚠️  Mount file not found: ${mountTargetFile}`)
        }
      }

      // Rebuild dictionaries
      require('./build').build(i18nPath)
      logger.log(`✅ Updated dictionaries`)
    } catch (error) {
      logger.error(`Failed to delete locale "${targetLang}": ${error}`)
    }
  }
}
