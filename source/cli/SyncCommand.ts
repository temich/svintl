/**
 * @author claude-4-sonnet
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, join } from 'path'
import { load as yamlLoad, dump as yamlDump } from 'js-yaml'
import OpenAI from 'openai'
import { build } from './build'

interface SyncEntry {
  key: string
  value: string
  action: 'add' | 'update' | 'unchanged'
}

export class SyncCommand {
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

  async execute(sourceLang: string, specificKey?: string, i18nPath = './src/lib/intl/'): Promise<void> {
    if (!/^[a-z]{2}$/.test(sourceLang)) {
      this.error('Language code must be exactly 2 lowercase letters (e.g., en, ru, de)')
    }

    const i18nDir = resolve(process.cwd(), i18nPath)
    const sourceFile = join(i18nDir, `${sourceLang}.yaml`)

    // Check if source language exists
    if (!existsSync(sourceFile)) {
      this.error(`Source language "${sourceLang}" does not exist at ${sourceFile}`)
    }

    // Get all target language files (excluding source)
    const languageFiles = readdirSync(i18nDir)
      .filter(file => file.match(/^[a-z]{2}\.yaml$/))
      .filter(file => file !== `${sourceLang}.yaml`)

    if (languageFiles.length === 0) {
      this.error(`No target languages found to sync. Source "${sourceLang}" is the only language.`)
    }

    this.log(`Syncing ${languageFiles.length} languages with "${sourceLang}" source...`)

    // Load source dictionary
    const sourceContent = readFileSync(sourceFile, 'utf8')
    const sourceData = yamlLoad(sourceContent) as any

    // Extract source entries
    const sourceEntries = this.extractEntries(sourceData)

    if (specificKey) {
      // Sync only specific key
      await this.syncSpecificKey(specificKey, sourceEntries, sourceLang, languageFiles, i18nDir)
    } else {
      // Sync all entries
      await this.syncAllEntries(sourceEntries, sourceLang, languageFiles, i18nDir)
    }

    // Rebuild dictionaries
    build(i18nPath)
  }

  private async syncSpecificKey(
    specificKey: string,
    sourceEntries: Array<{ key: string; value: string }>,
    sourceLang: string,
    languageFiles: string[],
    i18nDir: string
  ): Promise<void> {
    // Find the specific key in source
    const sourceEntry = sourceEntries.find(entry => entry.key === specificKey)

    if (!sourceEntry) {
      this.error(`Key "${specificKey}" not found in source language "${sourceLang}"`)
    }

    this.log(`Syncing key "${specificKey}" to ${languageFiles.length} languages...`)

    // Check if OpenAI is available
    if (!process.env.OPENAI_API_KEY) {
      this.warn('OPENAI_API_KEY not found - copying source value without translation')

      for (const file of languageFiles) {
        const lang = file.replace('.yaml', '')
        this.updateSingleKey(join(i18nDir, file), specificKey, sourceEntry.value)
      }
      return
    }

    // Translate to all target languages
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const targetLangs = languageFiles.map(file => file.replace('.yaml', ''))

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4.1',
        messages: [
          {
            role: 'system',
            content: `You are a professional translator. Translate the provided text from ${sourceLang} to the target languages.

IMPORTANT RULES:
1. If the input starts with "!js", it's a JavaScript function that returns localized strings
2. For !js functions: Keep the "!js" tag but ADAPT the JavaScript logic to match target language grammar rules
3. You can modify conditions, logic, and structure to fit the target language's pluralization and grammar rules
4. For regular text: translate normally
5. Always maintain the exact same function parameters (don't change parameter names or count)
6. Use DOUBLE QUOTES for all string literals to avoid JavaScript syntax errors
7. Return ONLY a JSON object with language codes as keys and translations as values

GRAMMAR ADAPTATION EXAMPLES:

Russian to English (complex → simple pluralization):
Input: "!js\\n(count) => { const rem = count % 10; if (rem === 1) return '1 предмет'; return \`\${count} предметов\`; }"
Output: "!js\\n(count) => count === 1 ? \"1 item\" : \`\${count} items\`"

English to Russian (simple → complex pluralization):
Input: "!js\\n(count) => count === 1 ? '1 item' : \`\${count} items\`"
Output: "!js\\n(count) => { const rem = count % 10; const tens = Math.floor(count / 10) % 10; if (tens === 1) return \`\${count} предметов\`; if (rem === 1) return \`\${count} предмет\`; if (rem >= 2 && rem <= 4) return \`\${count} предмета\`; return \`\${count} предметов\`; }"

Target languages: ${targetLangs.join(', ')}

CRITICAL: ADAPT the logic to match target language grammar, don't just translate strings!`,
          },
          {
            role: 'user',
            content: sourceEntry.value,
          },
        ],
        max_tokens: 1000,
        temperature: 0.1,
      })

      const response = completion.choices[0]?.message?.content?.trim()

      if (response) {
        try {
          const translations = JSON.parse(response)

          for (const file of languageFiles) {
            const lang = file.replace('.yaml', '')
            const translation = translations[lang] || sourceEntry.value

            this.updateSingleKey(join(i18nDir, file), specificKey, translation)
          }
        } catch (parseError) {
          this.warn('Failed to parse translation response, using source value')

          for (const file of languageFiles) {
            const lang = file.replace('.yaml', '')
            this.updateSingleKey(join(i18nDir, file), specificKey, sourceEntry.value)
          }
        }
      } else {
        this.warn('No translation response, using source value')

        for (const file of languageFiles) {
          const lang = file.replace('.yaml', '')
          this.updateSingleKey(join(i18nDir, file), specificKey, sourceEntry.value)
        }
      }
    } catch (error) {
      this.warn(`Translation failed: ${error}`)

      for (const file of languageFiles) {
        const lang = file.replace('.yaml', '')
        this.updateSingleKey(join(i18nDir, file), specificKey, sourceEntry.value)
      }
    }

    this.log(`✅ Translated`)
  }

  private async syncAllEntries(
    sourceEntries: Array<{ key: string; value: string }>,
    sourceLang: string,
    languageFiles: string[],
    i18nDir: string
  ): Promise<void> {
    this.log(`Source has ${sourceEntries.length} entries`)

    // Analyze what needs to be synced for each target language
    const syncTasks: Record<string, SyncEntry[]> = {}

    for (const file of languageFiles) {
      const lang = file.replace('.yaml', '')
      const targetFile = join(i18nDir, file)

      // Load target dictionary
      const targetContent = readFileSync(targetFile, 'utf8')
      const targetData = yamlLoad(targetContent) as any
      const targetEntries = this.extractEntries(targetData)

      // Build a map of existing target entries
      const targetMap = new Map(targetEntries.map(entry => [entry.key, entry.value]))

      // Determine what needs to be synced
      const tasksForLang: SyncEntry[] = []

      for (const sourceEntry of sourceEntries) {
        if (!targetMap.has(sourceEntry.key)) {
          // New key - needs to be added
          tasksForLang.push({
            key: sourceEntry.key,
            value: sourceEntry.value,
            action: 'add'
          })
        } else if (targetMap.get(sourceEntry.key) !== sourceEntry.value) {
          // Key exists but value changed - needs update
          tasksForLang.push({
            key: sourceEntry.key,
            value: sourceEntry.value,
            action: 'update'
          })
        }
        // If key exists and value is same, no action needed
      }

      syncTasks[lang] = tasksForLang

      const addCount = tasksForLang.filter(t => t.action === 'add').length
      const updateCount = tasksForLang.filter(t => t.action === 'update').length
    }

    // Check if OpenAI is available
    if (!process.env.OPENAI_API_KEY) {
      this.warn('OPENAI_API_KEY not found - copying source values without translation')

      for (const [lang, tasks] of Object.entries(syncTasks)) {
        if (tasks.length > 0) {
          const targetFile = join(i18nDir, `${lang}.yaml`)
          this.applySyncTasks(targetFile, tasks, false)
        }
      }

      this.log('✅ Translated')
      return
    }

    // Translate updated entries in batches
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    for (const [lang, tasks] of Object.entries(syncTasks)) {
      if (tasks.length === 0) {
        continue
      }

      // Process in batches of 10
      const batchSize = 10
      const batches = []

      for (let i = 0; i < tasks.length; i += batchSize) {
        batches.push(tasks.slice(i, i + batchSize))
      }

      const translatedTasks: SyncEntry[] = []

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i]
        const progress = batches.length > 1 ? `[${i + 1}/${batches.length}] ` : ''

        try {
          const batchObject = batch.reduce((obj, task) => {
            obj[task.key] = task.value
            return obj
          }, {} as Record<string, string>)

          const completion = await openai.chat.completions.create({
            model: 'gpt-4.1',
            messages: [
              {
                role: 'system',
                content: `You are a professional translator. Translate the provided JSON object from ${sourceLang} to ${lang}.

IMPORTANT RULES:
1. If a value starts with "!js", it's a JavaScript function that returns localized strings
2. For !js functions: Keep the "!js" tag but ADAPT the JavaScript logic to match target language grammar rules
3. You can modify conditions, logic, and structure to fit the target language's pluralization and grammar rules
4. For regular text: translate normally
5. Always maintain the exact same function parameters (don't change parameter names or count)
6. Use DOUBLE QUOTES for all string literals to avoid JavaScript syntax errors
7. Return ONLY a JSON object with the same keys but translated values

GRAMMAR ADAPTATION EXAMPLES:

Russian to English (complex → simple pluralization):
Input: "!js\\n(count) => { const rem = count % 10; if (rem === 1) return '1 предмет'; return \`\${count} предметов\`; }"
Output: "!js\\n(count) => count === 1 ? \"1 item\" : \`\${count} items\`"

English to Russian (simple → complex pluralization):
Input: "!js\\n(count) => count === 1 ? '1 item' : \`\${count} items\`"
Output: "!js\\n(count) => { const rem = count % 10; const tens = Math.floor(count / 10) % 10; if (tens === 1) return \`\${count} предметов\`; if (rem === 1) return \`\${count} предмет\`; if (rem >= 2 && rem <= 4) return \`\${count} предмета\`; return \`\${count} предметов\`; }"

Target language: ${lang}

CRITICAL: ADAPT the logic to match target language grammar, don't just translate strings!`,
              },
              {
                role: 'user',
                content: JSON.stringify(batchObject, null, 2),
              },
            ],
            max_tokens: 2000,
            temperature: 0.1,
          })

          const response = completion.choices[0]?.message?.content?.trim()

          if (response) {
            try {
              const translatedBatch = JSON.parse(response)

              for (const task of batch) {
                translatedTasks.push({
                  ...task,
                  value: translatedBatch[task.key] || task.value
                })
              }


            } catch (parseError) {
              this.warn(`${progress}Failed to parse response, using source values`)
              translatedTasks.push(...batch)
            }
          } else {
            this.warn(`${progress}No response, using source values`)
            translatedTasks.push(...batch)
          }
        } catch (error) {
          this.warn(`${progress}Translation failed: ${error}`)
          translatedTasks.push(...batch)
        }

        // Small delay to avoid rate limiting
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }

      // Apply the translated tasks
      const targetFile = join(i18nDir, `${lang}.yaml`)
      this.applySyncTasks(targetFile, translatedTasks, true)
    }

    this.log('✅ Translated')
  }

  private updateSingleKey(filePath: string, key: string, value: string): void {
    const content = readFileSync(filePath, 'utf8')
    const data = yamlLoad(content) as any

    // Navigate to the key and set the value
    const keyParts = key.split('.')
    let current = data

    // Navigate to parent, creating objects as needed
    for (let i = 0; i < keyParts.length - 1; i++) {
      const part = keyParts[i]
      if (!current[part]) {
        current[part] = {}
      }
      current = current[part]
    }

    // Set the final value
    const finalKey = keyParts[keyParts.length - 1]
    current[finalKey] = value

    // Write back to file
    const yamlContent = yamlDump(data, {
      lineWidth: -1,
      quotingType: '"',
      forceQuotes: false,
    })

    writeFileSync(filePath, yamlContent)
  }

  private applySyncTasks(filePath: string, tasks: SyncEntry[], removeOrphans: boolean): void {
    const content = readFileSync(filePath, 'utf8')
    const data = yamlLoad(content) as any

    if (removeOrphans) {
      // Remove keys that don't exist in source (orphaned keys)
      const currentEntries = this.extractEntries(data)
      const sourceKeys = new Set(tasks.map(t => t.key))

      // Find orphaned keys
      const orphanedKeys = currentEntries
        .map(e => e.key)
        .filter(key => !sourceKeys.has(key))

      // Remove orphaned keys
      for (const orphanKey of orphanedKeys) {
        this.removeKey(data, orphanKey)
      }
    }

    // Apply sync tasks
    for (const task of tasks) {
      const keyParts = task.key.split('.')
      let current = data

      // Navigate to parent, creating objects as needed
      for (let i = 0; i < keyParts.length - 1; i++) {
        const part = keyParts[i]
        if (!current[part]) {
          current[part] = {}
        }
        current = current[part]
      }

      // Set the final value
      const finalKey = keyParts[keyParts.length - 1]
      current[finalKey] = task.value
    }

    // Write back to file
    const yamlContent = yamlDump(data, {
      lineWidth: -1,
      quotingType: '"',
      forceQuotes: false,
    })

    writeFileSync(filePath, yamlContent)
  }

  private removeKey(obj: any, key: string): void {
    const keyParts = key.split('.')
    let current = obj

    // Navigate to parent
    for (let i = 0; i < keyParts.length - 1; i++) {
      if (!current[keyParts[i]]) return
      current = current[keyParts[i]]
    }

    // Remove the final key
    const finalKey = keyParts[keyParts.length - 1]
    delete current[finalKey]

    // Clean up empty parent objects
    this.cleanupEmptyParents(obj, key)
  }

  private cleanupEmptyParents(obj: any, key: string): void {
    const keyParts = key.split('.')

    // Work backwards to remove empty parent objects
    for (let i = keyParts.length - 2; i >= 0; i--) {
      const parentPath = keyParts.slice(0, i + 1)
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

  private extractEntries(obj: any, prefix = ''): Array<{ key: string; value: string }> {
    const entries: Array<{ key: string; value: string }> = []

    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key

      if (typeof value === 'string') {
        entries.push({ key: fullKey, value })
      } else if (typeof value === 'object' && value !== null) {
        entries.push(...this.extractEntries(value, fullKey))
      }
    }

    return entries
  }
}
