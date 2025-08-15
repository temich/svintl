/**
 * @author claude-4-sonnet
 */

import { readdirSync, readFileSync, writeFileSync } from 'fs'
import { resolve, join } from 'path'
import { load as yamlLoad, dump as yamlDump } from 'js-yaml'
import { build } from './build'

export class RemoveCommand {
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

  async execute(key: string, i18nPath = './src/lib/intl/'): Promise<void> {
    this.log(`Removing "${key}" from all language files...`)

    // Get all language files
    const i18nDir = resolve(process.cwd(), i18nPath)

    const languageFiles = readdirSync(i18nDir)
      .filter(file => file.match(/^[a-z]{2}\.yaml$/))

    if (languageFiles.length === 0)
      this.error(`No language files found in ${i18nDir}`)

    let removedCount = 0

    // Remove from all language files
    for (const file of languageFiles) {
      const lang = file.replace('.yaml', '')
      const filePath = join(i18nDir, file)

      try {
        // Read and parse YAML
        const content = readFileSync(filePath, 'utf8')
        const data = yamlLoad(content) as any

        // Check if key exists and remove it
        const removed = this.removeNestedKey(data, key)

        if (removed) {
          // Write back to file
          const yamlContent = yamlDump(data, {
            lineWidth: -1,
            quotingType: '"',
            forceQuotes: false,
          })

          writeFileSync(filePath, yamlContent)
          this.log(`✓ Removed from ${file}`)
          removedCount++
        } else {
          this.warn(`Key "${key}" not found in ${file}`)
        }
      } catch (error) {
        this.error(`Failed to process ${file}: ${error}`)
      }
    }

    if (removedCount === 0) {
      this.error(`Key "${key}" was not found in any language files`)
    }

    this.log(`✅ Successfully removed "${key}" from ${removedCount} language files`)

    // Rebuild dictionaries
    build(i18nPath)
  }

  private removeNestedKey(obj: any, key: string): boolean {
    const keys = key.split('.')
    let current = obj

    // Navigate to the parent of the target key
    for (let i = 0; i < keys.length - 1; i++) {
      if (current[keys[i]] === undefined)
        return false
      current = current[keys[i]]
    }

    // Remove the final key
    const finalKey = keys[keys.length - 1]
    if (current[finalKey] !== undefined) {
      delete current[finalKey]

      // Clean up empty parent objects
      this.cleanupEmptyParents(obj, key)
      return true
    }

    return false
  }

  private cleanupEmptyParents(obj: any, key: string): void {
    const keys = key.split('.')

    // Work backwards to remove empty parent objects
    for (let i = keys.length - 2; i >= 0; i--) {
      const parentPath = keys.slice(0, i + 1)
      let current = obj

      // Navigate to the parent
      for (const k of parentPath.slice(0, -1)) {
        current = current[k]
      }

      const parentKey = parentPath[parentPath.length - 1]
      const parent = current[parentKey]

      // If parent is an empty object, remove it
      if (typeof parent === 'object' && parent !== null && Object.keys(parent).length === 0) {
        delete current[parentKey]
      } else {
        // Stop if parent is not empty
        break
      }
    }
  }
}
