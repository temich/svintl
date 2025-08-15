/**
 * YAML loader with JavaScript function support for i18n files
 * Processes !js tagged multiline strings as executable functions
 *
 * @author claude-4-sonnet
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
        // eslint-disable-next-line no-eval
        const func = eval(jsCode)

        return func
      } catch (error) {
        console.warn(`Failed to parse JavaScript function: ${jsCode}`, error)

        return node // Return original string if parsing fails
      }
    }

    return node
  }

  if (Array.isArray(node))
    return node.map(processNode)

  if (typeof node === 'object') {
    const result: any = {}

    for (const [key, value] of Object.entries(node))
      result[key] = processNode(value)

    return result
  }

  return node
}
