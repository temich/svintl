/**
 * @author claude-4-sonnet
 */

import { unlinkSync, existsSync } from 'fs'
import { resolve, join } from 'path'
import { build } from './build'

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
    if (!/^[a-z]{2}$/.test(targetLang)) {
      this.error('Language code must be exactly 2 lowercase letters (e.g., jp, fr, de)')
    }

    const i18nDir = resolve(process.cwd(), i18nPath)
    const targetFile = join(i18nDir, `${targetLang}.yaml`)

    // Check if target language exists
    if (!existsSync(targetFile)) {
      this.error(`Language "${targetLang}" does not exist at ${targetFile}`)
    }

    // Ask for confirmation unless force flag is used
    if (!force) {
      this.log(`⚠️  This will permanently delete the "${targetLang}" language dictionary.`)
      this.log(`File: ${targetFile}`)
      this.log('')
      this.log('Are you sure? This action cannot be undone.')
      this.log('Use the -y flag to skip this confirmation.')
      this.error('Operation cancelled. Use -y flag to force deletion.')
    }

    try {
      // Delete the file
      unlinkSync(targetFile)
      this.log(`✅ Deleted ${targetFile}`)

      // Rebuild dictionaries
      build(i18nPath)
      this.log(`✅ Updated dictionaries`)
    } catch (error) {
      this.error(`Failed to delete ${targetFile}: ${error}`)
    }
  }
}
