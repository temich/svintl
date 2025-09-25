/**
 * Simple logging utilities for CLI commands
 * 
 * @author copilot
 */

export const logger = {
  log(message: string): void {
    console.log(message)
  },

  warn(message: string): void {
    console.warn(`⚠️  ${message}`)
  },

  error(message: string): never {
    console.error(`❌ ${message}`)
    process.exit(1)
  }
}