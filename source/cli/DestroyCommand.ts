/**
 * @author claude-4-sonnet
 */

import { unlinkSync, existsSync } from 'fs'
import { resolve, join } from 'path'
import { build } from './build'
import { validateLanguageTag } from './bcp47'

export class DestroyCommand {
  private log(message: string): void {
    console.log(message)
  }

  private warn(message: string): void {
    console.warn(`⚠️  ${message}`)
  }

  private error(message: string): never {
    console.error(`❌ ${message}`)
    process.exit(1)
  }

  async execute(targetLang: string, force = false, i18nPath = './src/lib/intl/'): Promise<void> {
    // Validate BCP 47 language tag
    const validationError = validateLanguageTag(targetLang)
    if (validationError) {
      this.translationService.error(validationError)
    }

    const i18nDir = resolve(process.cwd(), i18nPath)
    const targetFile = join(i18nDir, `${targetLang}.yaml`)

    // Check if target language exists
    if (!existsSync(targetFile)) {
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
      unlinkSync(targetFile)
      this.translationService.log(`✅ Deleted ${targetFile}`)

      // Rebuild dictionaries
      build(i18nPath)
      this.translationService.log(`✅ Updated dictionaries`)
    } catch (error) {
      this.translationService.error(`Failed to delete ${targetFile}: ${error}`)
    }
  }
}
