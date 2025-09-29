/**
 * Utility functions for handling dictionary partitions
 *
 * @author copilot
 */

import { resolve, join } from 'path'

export interface PartitionedKey {
  partition?: string
  key: string
  fullKey: string
}

/**
 * Parse a key that may include partition syntax (partition/key)
 */
export function parsePartitionedKey(fullKey: string): PartitionedKey {
  const parts = fullKey.split('/')
  if (parts.length === 1) {
    return {
      partition: undefined,
      key: fullKey,
      fullKey
    }
  } else if (parts.length === 2) {
    return {
      partition: parts[0],
      key: parts[1],
      fullKey
    }
  } else {
    throw new Error(`Invalid key format: ${fullKey}. Expected 'key' or 'partition/key'`)
  }
}

/**
 * Get the path to the intl directory for a given partition
 */
export function getPartitionPath(basePath: string, partition?: string): string {
  const baseDir = resolve(process.cwd(), basePath)
  return partition ? join(baseDir, partition) : baseDir
}

/**
 * Check if a path contains partitions (subdirectories with YAML files)
 */
export function hasPartitions(i18nPath: string): boolean {
  const fs = require('fs')
  const path = require('path')

  try {
    const baseDir = resolve(process.cwd(), i18nPath)
    const entries = fs.readdirSync(baseDir, { withFileTypes: true })

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const partitionDir = path.join(baseDir, entry.name)
        const partitionEntries = fs.readdirSync(partitionDir)

        // Check if partition directory contains YAML files
        if (partitionEntries.some((file: string) => file.match(/^[a-z]{2}(-[A-Z]{2})?\.yaml$/))) {
          return true
        }
      }
    }
  } catch (error) {
    // Directory doesn't exist or can't be read
    return false
  }

  return false
}
