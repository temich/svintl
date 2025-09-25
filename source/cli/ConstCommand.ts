/**
 * CLI command for setting values in all i18n dictionaries without translation
 * Sets the same value across all language files without using OpenAI API
 *
 * @author claude-4-sonnet
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { join, resolve } from 'path'
import { load as yamlLoad, dump as yamlDump } from 'js-yaml'
import { build } from './build'

export class ConstCommand {
  private log(message: string): void {
    console.log(message)
  }

  private error(message: string): never {
    console.error(`❌ ${message}`)
    process.exit(1)
  }

  async execute(key: string, value: string, i18nPath = './src/lib/intl/'): Promise<void> {
    this.log(`Setting constant "${key}" with value "${value}" in all dictionaries...`)

    // Get all language files
    const i18nDir = resolve(process.cwd(), i18nPath)

    const languageFiles = readdirSync(i18nDir)
      .filter(file => file.match(/^[a-z]{2}(-[A-Z]{2})?\.yaml$/))

    if (languageFiles.length === 0) {
      this.error(`No language files found in ${i18nDir}. Run 'npx intl hola' first.`)
    }

    this.log(`Updating ${languageFiles.length} language files...`)

    // Update all language files with the same value
    for (const file of languageFiles) {
      const filePath = join(i18nDir, file)

      try {
        this.updateLanguageFile(filePath, key, value)
        this.log(`✓ Updated ${file}`)
      } catch (error) {
        this.error(`Failed to update ${file}: ${error}`)
      }
    }

    this.log(`✅ Successfully set constant "${key}" in all language files`)

    // Auto-build dictionaries
    build(i18nPath)
  }

  private updateLanguageFile(filePath: string, key: string, value: string): void {
    // Read and parse YAML file
    const content = readFileSync(filePath, 'utf8')
    const yamlData = yamlLoad(content) as any

    // Parse the key path and set the value
    const keyParts = key.split('.')
    let current = yamlData

    // Navigate to the parent object
    for (let i = 0; i < keyParts.length - 1; i++) {
      const part = keyParts[i]

      if (!current[part])
        current[part] = {}

      current = current[part]
    }

    // Set the final key
    const finalKey = keyParts[keyParts.length - 1]

    current[finalKey] = value

    // Write back to file in YAML format
    writeFileSync(filePath, yamlDump(yamlData, {
      lineWidth: -1, // Prevent line wrapping
      quotingType: '"', // Use double quotes
      forceQuotes: false, // Only quote when necessary
    }))
  }
}
