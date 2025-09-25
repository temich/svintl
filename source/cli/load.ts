/**
 * YAML loader with JavaScript function support for i18n files
 * Processes !js tagged multiline strings as executable functions
 *
 * @author copilot
 */

import { readFileSync } from 'fs'
import { load as yamlLoad } from 'js-yaml'

/**
 * Load and process YAML i18n files with support for JavaScript functions
 *
 * If a YAML node value is multiline and starts with "!js",
 * it will be converted to a JavaScript function using new Function()
 */
export function load(filePath: string): any {
  const content = readFileSync(filePath, 'utf8')
  const data = yamlLoad(content)

  return processNode(data)
}

function processNode(node: any): any {
  if (node === null || node === undefined)
    return node

  if (typeof node === 'string') {
    // Check if this is a multiline string starting with !js
    if (node.trim().startsWith('!js\n') || node.trim().startsWith('!js ')) {
      // Extract the JavaScript code (everything after !js)
      const jsCode = node.replace(/^\s*!js\s*\n?/, '').trim()

      try {
        // Evaluate the JavaScript code directly
        // We expect the code to be a function expression like: (count) => { ... }
        // eslint-disable-next-line no-new-func
        const func = new Function(`return (${jsCode});`)()

        return func
      } catch (error) {
        console.warn(`Failed to parse JavaScript function: ${jsCode}`, error)

        return node // Return original string if parsing fails
      }
    }

    return node
  }

  if (Array.isArray(node)) {
    // Check if this is a plural forms array (contains objects with plural form keys)
    if (node.length === 1 && typeof node[0] === 'object' && node[0] !== null && !Array.isArray(node[0])) {
      const pluralForms = node[0]
      // Check if this looks like a plural forms object (has keys like 'one', 'other', etc.)
      const pluralKeys = Object.keys(pluralForms)
      const knownPluralCategories = ['zero', 'one', 'two', 'few', 'many', 'other']
      const hasValidPluralKeys = pluralKeys.some(key => knownPluralCategories.includes(key))

      if (hasValidPluralKeys) {
        // This is a plural forms array, convert to function

        return createPluralFunction(pluralForms)
      }
    }

    return node.map(processNode)
  }

  if (typeof node === 'object') {
    const result: any = {}

    for (const [key, value] of Object.entries(node))
      result[key] = processNode(value)

    return result
  }

  return node
}

/**
 * Create a plural function from object-based plural forms
 * Converts { one: 'item', other: 'items' } to a function that uses Intl.PluralRules
 */
function createPluralFunction(pluralForms: Record<string, string>): Function {
  const formsJson = JSON.stringify(pluralForms)

  // Create a function template that uses object property access instead of array indexing
  const functionCode = `
    (count) => {
      const forms = ${formsJson};
      const lang = "__LANG__"; // This will be replaced by the build system
      const pluralRules = new Intl.PluralRules(lang);
      const rule = pluralRules.select(count);
      
      // Direct object property access - no CLDR ordering needed!
      if (forms[rule]) {
        return forms[rule];
      }
      
      // Fallback priority: other > one > first available
      return forms.other || forms.one || Object.values(forms)[0] || '';
    }
  `.trim()

  try {
    // eslint-disable-next-line no-new-func
    return new Function(`return (${functionCode});`)()
  } catch (error) {
    console.warn(`Failed to create plural function:`, error)
    // Return a simple fallback function
    return (count: number) => Object.values(pluralForms)[0] || ''
  }
}
