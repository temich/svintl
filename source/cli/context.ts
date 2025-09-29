/**
 * Context file management utilities for storing inputs and contexts
 * Maintains an extensible YAML structure for translation context information
 *
 * @author copilot
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, resolve } from 'path'
import { load as yamlLoad, dump as yamlDump } from 'js-yaml'

export interface ContextEntry {
  input: string
  context?: string
}

export interface ContextData {
  context?: string
  inputs: Record<string, any>
}

export class ContextFileManager {
  private getContextFilePath(i18nPath: string): string {
    const i18nDir = resolve(process.cwd(), i18nPath)
    return join(i18nDir, 'context.yaml')
  }

  /**
   * Read context data from context.yaml file
   */
  readContextFile(i18nPath: string): ContextData {
    const contextFilePath = this.getContextFilePath(i18nPath)

    if (!existsSync(contextFilePath)) {
      return { context: undefined, inputs: {} }
    }

    try {
      const content = readFileSync(contextFilePath, 'utf8')
      const data = yamlLoad(content) as Partial<ContextData> | undefined

      const inputs = data && typeof data === 'object' && data.inputs && typeof data.inputs === 'object'
        ? data.inputs
        : {}

      const context = data && typeof data === 'object' && typeof data.context === 'string'
        ? data.context
        : undefined

      return { context, inputs }
    } catch (error) {
      console.warn(`⚠️  Failed to read context file: ${error}`)
      return { context: undefined, inputs: {} }
    }
  }

  /**
   * Write context data to context.yaml file
   */
  writeContextFile(i18nPath: string, data: ContextData): void {
    const contextFilePath = this.getContextFilePath(i18nPath)

    try {
      const normalizedData: ContextData = {
        ...(data.context !== undefined ? { context: data.context } : {}),
        inputs: data.inputs || {},
      }

      const yamlContent = yamlDump(normalizedData, {
        lineWidth: -1,
        quotingType: '"',
        forceQuotes: false,
      })

      writeFileSync(contextFilePath, yamlContent)
    } catch (error) {
      throw new Error(`Failed to write context file: ${error}`)
    }
  }

  /**
   * Set context entry for a specific key path
   */
  setContextEntry(i18nPath: string, key: string, input: string, context?: string): void {
    const data = this.readContextFile(i18nPath)

    // Parse key path and navigate to create nested structure
    const keyParts = key.split('.')
    let current = data.inputs

    // Navigate to parent object, creating nested objects as needed
    for (let i = 0; i < keyParts.length - 1; i++) {
      const part = keyParts[i]

      if (!current[part]) {
        current[part] = {}
      }

      current = current[part]
    }

    // Set the final key with input and context
    const finalKey = keyParts[keyParts.length - 1]
    current[finalKey] = { input, context }

    this.writeContextFile(i18nPath, data)
  }

  setGlobalContext(i18nPath: string, context: string): void {
    const data = this.readContextFile(i18nPath)
    data.context = context
    this.writeContextFile(i18nPath, data)
  }

  clearGlobalContext(i18nPath: string): void {
    const data = this.readContextFile(i18nPath)
    if ('context' in data)
      delete data.context
    this.writeContextFile(i18nPath, data)
  }

  getGlobalContext(i18nPath: string): string | undefined {
    const data = this.readContextFile(i18nPath)

    // If global context exists in current directory, use it
    if (data.context) {
      return data.context
    }

    // Check if this is a partition and get global context from parent directory
    const path = require('path')
    const fs = require('fs')
    const parentPath = path.dirname(path.resolve(i18nPath))

    // Only check parent if it's different from current and has a context.yaml
    if (parentPath !== path.resolve(i18nPath) && fs.existsSync(path.join(parentPath, 'context.yaml'))) {
      const parentData = this.readContextFile(parentPath)
      return parentData.context
    }

    return data.context
  }

  /**
   * Get context entry for a specific key path
   * For partitions, also checks parent directory as fallback
   */
  getContextEntry(i18nPath: string, key: string): ContextEntry | null {
    const data = this.readContextFile(i18nPath)

    // Navigate to the key
    const keyParts = key.split('.')
    let current: Record<string, any> | null = data.inputs

    for (const part of keyParts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part]
      } else {
        current = null
        break
      }
    }

    // Check if current is a valid context entry
    if (current && typeof current === 'object' && 'input' in current) {
      return current as ContextEntry
    }

    // If not found in current directory, check parent directory for partitions
    const path = require('path')
    const fs = require('fs')
    const parentPath = path.dirname(path.resolve(i18nPath))

    // Only check parent if it's different from current and has a context.yaml
    if (parentPath !== path.resolve(i18nPath) && fs.existsSync(path.join(parentPath, 'context.yaml'))) {
      const parentData = this.readContextFile(parentPath)
      let parentCurrent = parentData.inputs

      for (const part of keyParts) {
        if (parentCurrent && typeof parentCurrent === 'object' && part in parentCurrent) {
          parentCurrent = parentCurrent[part]
        } else {
          return null
        }
      }

      // Check if parent has a valid context entry
      if (parentCurrent && typeof parentCurrent === 'object' && 'input' in parentCurrent) {
        return parentCurrent as ContextEntry
      }
    }

    return null
  }

  /**
   * Remove context entry for a specific key path
   */
  removeContextEntry(i18nPath: string, key: string): boolean {
    const data = this.readContextFile(i18nPath)

    // Navigate to parent object
    const keyParts = key.split('.')
    let current = data.inputs

    for (let i = 0; i < keyParts.length - 1; i++) {
      const part = keyParts[i]

      if (current && typeof current === 'object' && part in current) {
        current = current[part]
      } else {
        return false // Key doesn't exist
      }
    }

    // Remove the final key
    const finalKey = keyParts[keyParts.length - 1]
    if (current && typeof current === 'object' && finalKey in current) {
      delete current[finalKey]

      // Clean up empty parent objects
      this.cleanupEmptyParents(data.inputs, key)
      this.writeContextFile(i18nPath, data)
      return true
    }

    return false
  }

  /**
   * Move context entry from one key to another
   */
  moveContextEntry(i18nPath: string, fromKey: string, toKey: string): boolean {
    const contextEntry = this.getContextEntry(i18nPath, fromKey)

    if (!contextEntry) {
      return false
    }

    // Set at new location
    this.setContextEntry(i18nPath, toKey, contextEntry.input, contextEntry.context)

    // Remove from old location
    this.removeContextEntry(i18nPath, fromKey)

    return true
  }

  /**
   * Get all context entries as flat key-value pairs
   * For partitions, also includes contexts from the parent (main) directory
   */
  getAllContextEntries(i18nPath: string): Record<string, ContextEntry> {
    const data = this.readContextFile(i18nPath)
    let entries = this.flattenContextEntries(data.inputs)

    // Check if this is a partition (subdirectory) and also get contexts from parent directory
    const path = require('path')
    const fs = require('fs')
    const parentPath = path.dirname(path.resolve(i18nPath))

    // Only check parent if it's different from current and has a context.yaml
    if (parentPath !== path.resolve(i18nPath) && fs.existsSync(path.join(parentPath, 'context.yaml'))) {
      const parentData = this.readContextFile(parentPath)
      const parentEntries = this.flattenContextEntries(parentData.inputs)

      // Merge parent entries, but current directory entries take precedence
      entries = { ...parentEntries, ...entries }
    }

    return entries
  }

  /**
   * Flatten nested context entries into flat key-value pairs
   */
  private flattenContextEntries(obj: any, prefix = ''): Record<string, ContextEntry> {
    const entries: Record<string, ContextEntry> = {}

    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key

      if (value && typeof value === 'object' && 'input' in value) {
        // This is a context entry
        entries[fullKey] = value as ContextEntry
      } else if (typeof value === 'object' && value !== null) {
        // This is a nested object, recurse
        Object.assign(entries, this.flattenContextEntries(value, fullKey))
      }
    }

    return entries
  }

  /**
   * Clean up empty parent objects after removing a key
   */
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
