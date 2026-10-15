/**
 * Build system for i18n dictionaries with JavaScript function support
 * Converts YAML files to browser-compatible JavaScript module
 *
 * @author copilot
 */

import { writeFileSync, readdirSync } from 'fs'
import { join, resolve } from 'path'
import { load } from './load'
import { hasPartitions } from './partition'
import { ContextFileManager } from './context'
import { rootDictionarySpecifier } from './libAlias'

/**
 * Generate TypeScript type definitions for the dictionary structure
 * Partitions (mounts) only export Dictionary - Locale and Grammar come from root
 */
function generateTypeDefinitions(
  dictionaries: Record<string, any>,
  i18nPath: string,
  isPartition: boolean
): string {
  const firstDict = dictionaries.en || Object.values(dictionaries)[0]
  const dictionaryType = generateDictionaryType(firstDict, 2)

  if (isPartition)
    return `/**
 * Auto-generated TypeScript definitions for i18n dictionaries
 *
 * @author copilot
 */

export type Dictionary = ${dictionaryType}
`

  const locales = Object.keys(dictionaries).map(lang => `'${lang}'`).join(' | ')
  const contextManager = new ContextFileManager()
  const genderValues = contextManager.getGlobalGenders(i18nPath)
  const grammarType = genderValues && Array.isArray(genderValues) && genderValues.length > 0
    ? genderValues.map(g => `'${g}'`).join(' | ')
    : 'string'

  return `/**
 * Auto-generated TypeScript definitions for i18n dictionaries
 *
 * @author copilot
 */

export type Locale = ${locales}

export type Grammar = ${grammarType}

export type Dictionary = ${dictionaryType}
`
}

/** Matches keys that can be emitted bare (valid JS identifiers). */
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/

/** Quote a dictionary key unless it is a valid JS identifier. */
function keyLabel(key: string): string {
  return IDENTIFIER.test(key) ? key : JSON.stringify(key)
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

    if (typeof value === 'function')
      type = functionType(value)
    else if (typeof value === 'string')
      type = 'string'
    else if (typeof value === 'object' && value !== null)
      type = generateDictionaryType(value, indent + 1)
    else
      type = 'unknown'

    return `${nextSpaces}${keyLabel(key)}: ${type}`
  })

  return `{\n${entries.join('\n')}\n${spaces}}`
}



/**
 * TypeScript type of a dictionary function, shared by `types.ts` and the JSDoc casts in `built.js`.
 */
function functionType(func: Function): string {
  if (func.length === 0)
    return '() => string'

  if (func.length === 1)
    // Plural functions (with the __LANG__ placeholder) take a number; other !js functions take a number or a string
    return func.toString().includes('__LANG__') ? '(value: number) => string' : '(value: any) => string'

  return `(...args: [${Array(func.length).fill('any').join(', ')}]) => string`
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

      return typed(obj, processedFunc)
    }

    return typed(obj, funcStr)
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
 * Cast a function to its dictionary type, so its parameters are typed under `strict`.
 */
function typed(func: Function, source: string): string {
  return `/** @type {${functionType(func)}} */ (${source})`
}

const LOCALE_FILE = /^[a-z]{2}(-[A-Z]{2})?\.yaml$/

/**
 * Build all YAML dictionaries into a single JavaScript file
 * that can be imported in the browser.
 *
 * A partition is built for `rootLocales` only: its `built.js` is typed by the root `Locale`,
 * so a locale the root lacks is skipped and a root locale it lacks is reported.
 */
export function build(i18nPath = './src/lib/intl/', isPartition = false, rootLocales?: string[]): void {
  const i18nDir = resolve(process.cwd(), i18nPath)

  const fs = require('fs')
  const path = require('path')

  let localeFiles = readdirSync(i18nDir).filter(file => LOCALE_FILE.test(file))

  if (!isPartition) {
    const locales = localeFiles.length > 0 ? localeFiles.map(file => file.replace('.yaml', '')) : undefined
    const contextManager = new (require('./context').ContextFileManager)()
    const allMounts = contextManager.getAllMounts(i18nPath)

    for (const [mountName, mountPath] of Object.entries(allMounts)) {
      const partitionI18nDir = path.resolve(i18nDir, mountPath)
      if (fs.existsSync(partitionI18nDir))
        build(path.relative(process.cwd(), partitionI18nDir), true, locales)
    }

    if (hasPartitions(i18nPath)) {
      const entries = fs.readdirSync(i18nDir, { withFileTypes: true })

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const partitionDir = path.join(i18nDir, entry.name)
          const partitionPath = path.join(i18nPath, entry.name)

          const partitionEntries = fs.readdirSync(partitionDir)
          if (partitionEntries.some((file: string) => LOCALE_FILE.test(file)))
            build(partitionPath, true, locales)
        }
      }
    }
  }

  if (rootLocales !== undefined) {
    for (const file of localeFiles)
      if (!rootLocales.includes(file.replace('.yaml', '')))
        console.warn(`⚠️  Skipping ${join(i18nPath, file)}: the root dictionary has no such locale`)

    for (const locale of rootLocales)
      if (!localeFiles.includes(`${locale}.yaml`))
        console.warn(`⚠️  Missing ${join(i18nPath, `${locale}.yaml`)}: the root dictionary has this locale`)

    localeFiles = localeFiles.filter(file => rootLocales.includes(file.replace('.yaml', '')))
  }

  if (localeFiles.length === 0) {
    console.error('No YAML locale files found')
    return
  }

  const dictionaries: Record<string, any> = {}

  // Load each locale and process functions
  for (const file of localeFiles) {
    const lang = file.replace('.yaml', '')
    const filePath = resolve(i18nDir, file)

    try {
      // A comment-only file loads as undefined
      dictionaries[lang] = load(filePath) ?? {}
    } catch (error) {
      console.error(`Failed to process ${lang}.yaml:`, error)
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

  const dictTypeRef = isPartition
    ? `Record<import('${rootDictionarySpecifier()}').Locale, import('./types').Dictionary>`
    : "Record<import('./types').Locale, import('./types').Dictionary>"
  const localesTypeRef = "import('./types').Locale[]"
  const localesExport = isPartition
    ? ''
    : `\n\n/** @type {${localesTypeRef}} */\nexport const locales = ${JSON.stringify(Object.keys(dictionaries))};\n`

  const jsContent = `// Auto-generated by i18n CLI - do not edit manually

/** @type {${dictTypeRef}} */
export const dictionaries = ${dictionariesStr};${localesExport}
`

  // Generate TypeScript definitions
  const tsContent = generateTypeDefinitions(dictionaries, i18nPath, isPartition)

  // Write both files in the same directory as i18n files
  const jsOutputPath = resolve(i18nDir, 'built.js')
  const tsOutputPath = resolve(i18nDir, 'types.ts')

  writeFileSync(jsOutputPath, jsContent)
  writeFileSync(tsOutputPath, tsContent)
}
