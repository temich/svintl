/**
 * Translation service with shared functionality for all translation commands
 * Extracted from BaseTranslationCommand to reduce duplication
 * 
 * @author copilot
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { join, resolve } from 'path'
import { load as yamlLoad, dump as yamlDump } from 'js-yaml'
import OpenAI from 'openai'
import { build } from './build'
import { ContextFileManager } from './context'
import { getPartitionPath } from './partition'

export class TranslationService {
  private contextManager = new ContextFileManager()

  get contextManagerInstance(): ContextFileManager {
    return this.contextManager
  }

  /**
   * Get all locale files and codes from i18n directory
   */
  getLocaleInfo(i18nPath: string, partition?: string): { localeFiles: string[], allLocales: string[], i18nDir: string } {
    const i18nDir = getPartitionPath(i18nPath, partition)

    // Check if directory exists and provide user-friendly error
    try {
      const localeFiles = readdirSync(i18nDir).filter(file => file.match(/^[a-z]{2}(-[A-Z]{2})?\.yaml$/))
      const allLocales = localeFiles.map(file => file.replace('.yaml', ''))

      return { localeFiles, allLocales, i18nDir }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`Context not found in ${i18nDir}`)
      }
      throw error
    }
  }

  /**
   * Translate content using OpenAI with custom system prompt
   */
  async translateWithOpenAI(
    content: string,
    allLocales: string[],
    systemPrompt: string,
    comment?: string,
    projectContext?: string
  ): Promise<Record<string, string>> {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required')
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })

    const translations: Record<string, string> = {}

    try {
      const trimmedProjectContext = projectContext?.trim()
      const trimmedComment = comment?.trim()

      const hasProjectContext = Boolean(trimmedProjectContext && trimmedProjectContext.length > 0)
      const hasPhraseContext = Boolean(trimmedComment && trimmedComment.length > 0)

      const promptSections: string[] = []

      if (hasProjectContext)
        promptSections.push(`Project context: ${trimmedProjectContext}`)

      promptSections.push(`Phrase: ${content}`)

      promptSections.push(`Phrase context: ${hasPhraseContext ? trimmedComment : 'None provided'}`)

      promptSections.push('Instructions: Provide translations that sound natural, commonly used, and idiomatic for the described context.')

      const contextPrompt = promptSections.join('\n\n')

      const completion = await openai.chat.completions.create({
        model: 'gpt-4.1',
        messages: [
          {
            role: 'system',
            content: systemPrompt.replace('${allLocales}', allLocales.join(', ')),
          },
          {
            role: 'user',
            content: contextPrompt,
          },
        ],
        max_completion_tokens: 2000,
      })

      const response = completion.choices[0]?.message?.content
      if (!response) {
        throw new Error('No response from OpenAI')
      }

      // Parse JSON response, handling markdown code blocks
      try {
        let cleanResponse = response.trim()

        // Remove markdown code block syntax if present
        if (cleanResponse.startsWith('```json')) {
          cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '')
        } else if (cleanResponse.startsWith('```')) {
          cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '')
        }

        const parsed = JSON.parse(cleanResponse)
        Object.assign(translations, parsed)
      } catch (parseError) {
        throw new Error(`Failed to parse OpenAI response as JSON: ${response}`)
      }

      return translations
    } catch (error: any) {
      throw new Error(`Translation failed: ${error.message}`)
    }
  }

  /**
   * Update a specific locale file with a key-value pair
   */
  updateLocaleFile(filePath: string, key: string, value: string | Record<string, string> | string[] | Array<Record<string, string>>): void {
    // Read and parse YAML file
    const content = readFileSync(filePath, 'utf8')
    let yamlData = yamlLoad(content) as any

    // Handle empty files
    if (yamlData === null) {
      yamlData = {}
    }

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

  /**
   * Remove a key from a locale file
   */
  removeFromLocaleFile(filePath: string, key: string): boolean {
    const content = readFileSync(filePath, 'utf8')
    let yamlData = yamlLoad(content) as any

    // Handle empty files
    if (yamlData === null) {
      yamlData = {}
    }

    const keyParts = key.split('.')
    let current = yamlData

    // Navigate to the parent object
    for (let i = 0; i < keyParts.length - 1; i++) {
      const part = keyParts[i]
      if (!current[part]) {
        return false // Key doesn't exist
      }
      current = current[part]
    }

    // Remove the final key
    const finalKey = keyParts[keyParts.length - 1]
    if (finalKey in current) {
      delete current[finalKey]
      writeFileSync(filePath, yamlDump(yamlData, {
        lineWidth: -1,
        quotingType: '"',
        forceQuotes: false,
      }))
      return true
    }
    return false
  }

  /**
   * Update all locale files with translations
   */
  updateAllLocaleFiles(
    localeFiles: string[],
    i18nDir: string,
    key: string,
    translations: Record<string, string | Record<string, string> | string[] | Array<Record<string, string>>>
  ): void {
    for (const file of localeFiles) {
      const lang = file.replace('.yaml', '')
      const filePath = join(i18nDir, file)

      try {
        this.updateLocaleFile(filePath, key, translations[lang])
      } catch (error) {
        throw new Error(`Failed to update ${file}: ${error}`)
      }
    }
  }

  /**
   * Store input and build dictionaries
   */
  finalize(i18nPath: string, key: string, input: string, comment?: string, partition?: string): void {
    const partitionPath = getPartitionPath(i18nPath, partition)

    // Store input and context in context.yaml
    try {
      this.contextManager.setContextEntry(partitionPath, key, input, comment)
    } catch (error) {
      // Context saving failure is not critical
    }

    // Auto-build dictionaries
    build(partitionPath)
  }
}
