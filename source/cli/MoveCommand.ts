/**
 * CLI command for moving/renaming i18n entries across all language files
 * Preserves translations while updating key paths
 *
 * @author claude-4-sonnet
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { join, resolve } from 'path'
import { load as yamlLoad, dump as yamlDump } from 'js-yaml'
import { build } from './build'
import { ContextFileManager } from './context'

export class MoveCommand {
  private contextManager = new ContextFileManager()

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

  async execute(from: string, to: string, i18nPath = './src/lib/intl/'): Promise<void> {
    this.translationService.log(`Moving "${from}" to "${to}"...`)

    // Get all language files
    const i18nDir = resolve(process.cwd(), i18nPath)

    const languageFiles = readdirSync(i18nDir)
      .filter(file => file.match(/^[a-z]{2}(-[A-Z]{2})?\.yaml$/))

    // First, extract values from all files
    const values: Record<string, string> = {}

    for (const file of languageFiles) {
      const lang = file.replace('.yaml', '')
      const filePath = join(i18nDir, file)

      try {
        const value = this.extractValue(filePath, from)

        if (value !== null)
          values[lang] = value
      } catch (error) {
        this.translationService.warn(`Could not extract value from ${file}: ${error}`)
      }
    }

    if (Object.keys(values).length === 0)
      this.translationService.error(`Key "${from}" not found in any language files`)

    // Add to new location and remove from old location
    for (const file of languageFiles) {
      const lang = file.replace('.yaml', '')
      const filePath = join(i18nDir, file)

      if (values[lang])
        try {
          // Add to new location
          this.translationService.updateLanguageFile(filePath, to, values[lang])
          // Remove from old location
          this.removeKey(filePath, from)
        } catch (error) {
          this.translationService.error(`Failed to update ${file}: ${error}`)
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
    build(i18nPath)
  }

  private extractValue(filePath: string, key: string): string | null {
    const content = readFileSync(filePath, 'utf8')
    const yamlData = yamlLoad(content) as any

    // Navigate to the key
    const keyParts = key.split('.')
    let current = yamlData

    for (const part of keyParts)
      if (current && typeof current === 'object' && part in current)
        current = current[part]
      else
        return null

    return typeof current === 'string' ? current : null
  }

  private removeKey(filePath: string, key: string): void {
    const content = readFileSync(filePath, 'utf8')
    const yamlData = yamlLoad(content) as any

    // Navigate to the parent object
    const keyParts = key.split('.')
    let current = yamlData

    for (let i = 0; i < keyParts.length - 1; i++) {
      const part = keyParts[i]

      if (current && typeof current === 'object' && part in current)
        current = current[part]
      else
        return // Key doesn't exist
    }

    // Remove the final key
    const finalKey = keyParts[keyParts.length - 1]

    if (current && typeof current === 'object')
      delete current[finalKey]

    writeFileSync(filePath, yamlDump(yamlData, {
      lineWidth: -1,
      quotingType: '"',
      forceQuotes: false,
    }))
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
      lineWidth: -1,
      quotingType: '"',
      forceQuotes: false,
    }))
  }
}
