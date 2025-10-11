/**
 * Build system for i18n dictionaries with JavaScript function support
 * Converts YAML files to browser-compatible JavaScript module
 *
 * @author copilot
 */

import { writeFileSync, readdirSync } from 'fs'
import { resolve } from 'path'
import { load } from './load'
import { hasPartitions } from './partition'

/**
 * Generate TypeScript type definitions for the dictionary structure
 */
function generateTypeDefinitions(dictionaries: Record<string, any>): string {
  const locales = Object.keys(dictionaries).map(lang => `'${lang}'`).join(' | ')

  // Use the English dictionary as the structure reference since it's the source
  const firstDict = dictionaries.en || Object.values(dictionaries)[0]
  const dictionaryType = generateDictionaryType(firstDict, 2)

  return `/**
 * Auto-generated TypeScript definitions for i18n dictionaries
 *
 * @author copilot
 */

export type Locale = ${locales}

export type Dictionary = ${dictionaryType}
`
}

/**
 * Recursively generate TypeScript type definition for dictionary structure
 */
function generateDictionaryType(obj: any, indent = 0): string {
  const spaces = '  '.repeat(indent)
  const nextSpaces = '  '.repeat(indent + 1)

  // Handle empty or null objects
  if (!obj || typeof obj !== 'object') {
    return '{}'
  }

  const entries = Object.entries(obj).map(([key, value]) => {
    let type: string

    if (typeof value === 'function') {
      const paramCount = value.length

      if (paramCount === 0)
        type = '() => string'
      else if (paramCount === 1)
        // Plural functions always take a single number parameter
        type = '(value: number) => string'
      else {
        const params = Array(paramCount).fill('any').join(', ')

        type = `(...args: [${params}]) => string`
      }
    } else if (typeof value === 'string')
      type = 'string'

    else if (typeof value === 'object' && value !== null)
      type = generateDictionaryType(value, indent + 1)
    else
      type = 'unknown'

    return `${nextSpaces}${key}: ${type}`
  })

  return `{\n${entries.join('\n')}\n${spaces}}`
}



/**
 * Serialize object with functions to JavaScript code
 */
function serializeWithFunctions(obj: any, indent = 0, locale?: string): string {
  const spaces = '  '.repeat(indent)
  const nextSpaces = '  '.repeat(indent + 1)

  if (typeof obj === 'function') {
    const funcStr = obj.toString()

    // Check if this is a plural function by looking for the __LANG__ placeholder
    if (funcStr.includes('__LANG__')) {
      // This is a plural function - inject the locale and fix the forms reference
      let processedFunc = funcStr.replace(
        '"__LANG__"',
        locale ? `"${locale}"` : '"en"'
      )

      // Also replace any single quotes version
      processedFunc = processedFunc.replace(
        "'__LANG__'",
        locale ? `'${locale}'` : "'en'"
      )

      return processedFunc
    }

    return funcStr
  }

  if (Array.isArray(obj)) {
    const items = obj.map(item => nextSpaces + serializeWithFunctions(item, indent + 1, locale))

    return `[\n${items.join(',\n')}\n${spaces}]`
  }

  if (obj !== null && typeof obj === 'object') {
    const entries = Object.entries(obj).map(([key, value]) => {
      const serializedValue = serializeWithFunctions(value, indent + 1, locale)

      return `${nextSpaces}"${key}": ${serializedValue}`
    })

    return `{\n${entries.join(',\n')}\n${spaces}}`
  }

  return JSON.stringify(obj)
}

/**
 * Build all YAML dictionaries into a single JavaScript file
 * that can be imported in the browser
 */
export function build(i18nPath = './src/lib/intl/'): void {
  console.log('🔨 Building dictionaries...')

  const i18nDir = resolve(process.cwd(), i18nPath)

  // Check if this is a partition directory or main directory
  const fs = require('fs')
  const path = require('path')
  const isPartition = i18nDir !== resolve(process.cwd(), './src/lib/intl/') &&
    fs.existsSync(path.join(path.dirname(i18nDir), 'built.js'))

  if (!isPartition && hasPartitions(i18nPath)) {
    // Build all partitions when building from main directory
    const entries = fs.readdirSync(i18nDir, { withFileTypes: true })

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const partitionDir = path.join(i18nDir, entry.name)
        const partitionPath = path.join(i18nPath, entry.name)

        // Check if this directory contains YAML files (is a partition)
        const partitionEntries = fs.readdirSync(partitionDir)
        if (partitionEntries.some((file: string) => file.match(/^[a-z]{2}(-[A-Z]{2})?\.yaml$/))) {
          console.log(`Building mount: ${entry.name}`)
          build(partitionPath)
        }
      }
    }
  }

  // Get all YAML locale files (supporting BCP 47 format like en-US, zh-CN, etc.)
  const localeFiles = readdirSync(i18nDir)
    .filter(file => file.match(/^[a-z]{2}(-[A-Z]{2})?\.yaml$/))

  if (localeFiles.length === 0) {
    console.log('❌ No YAML locale files found')

    return
  }

  const dictionaries: Record<string, any> = {}

  // Load each locale and process functions
  for (const file of localeFiles) {
    const lang = file.replace('.yaml', '')
    const filePath = resolve(i18nDir, file)

    try {
      const dictionary = load(filePath)
      dictionaries[lang] = dictionary
    } catch (error) {
      console.error(`❌ Failed to process ${lang}.yaml:`, error)
      throw error
    }
  }

  // Generate JavaScript file content with proper function serialization
  const serializedDictionaries = Object.entries(dictionaries).reduce((acc, [lang, dict]) => {
    acc[lang] = serializeWithFunctions(dict, 1, lang)
    return acc
  }, {} as Record<string, string>)

  const dictionariesStr = `{\n${Object.entries(serializedDictionaries).map(([lang, dictStr]) =>
    `  "${lang}": ${dictStr}`
  ).join(',\n')}\n}`

  const jsContent = `// Auto-generated by i18n CLI - do not edit manually

/** @type {Record<import('./types').Locale, import('./types').Dictionary>} */
export const dictionaries = ${dictionariesStr};

export const locales = ${JSON.stringify(Object.keys(dictionaries))};
`

  // Generate TypeScript definitions
  const tsContent = generateTypeDefinitions(dictionaries)

  // Write both files in the same directory as i18n files
  const jsOutputPath = resolve(i18nDir, 'built.js')
  const tsOutputPath = resolve(i18nDir, 'types.ts')

  writeFileSync(jsOutputPath, jsContent)
  writeFileSync(tsOutputPath, tsContent)

  console.log(`✅ Built`)
}
