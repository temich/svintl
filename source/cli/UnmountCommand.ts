/**
 * CLI command for unmounting dictionary partitions
 * Removes a mount from context.yaml but keeps the partition files
 *
 * @author copilot
 */

import { ContextFileManager } from './context'

export class UnmountCommand {
  private log(message: string): void {
    console.log(message)
  }

  private error(message: string): never {
    console.error(`❌ ${message}`)
    process.exit(1)
  }

  async execute(mountName: string, i18nPath = './src/lib/intl/'): Promise<void> {
    this.log(`🔽 Unmounting '${mountName}'...`)

    const contextManager = new ContextFileManager()

    // Check if mount exists
    const existingMount = contextManager.getMountPath(i18nPath, mountName)
    if (!existingMount) {
      this.log(`⚠️ Mount '${mountName}' does not exist`)
      return
    }

    // Remove mount from context
    const removed = contextManager.removeMountPath(i18nPath, mountName)
    if (removed) {
      this.log(`✓ Removed mount '${mountName}' from context.yaml`)
      this.log(`ℹ️  Partition files at '${existingMount}' have been preserved`)
      this.log(`🎉 Mount '${mountName}' unmounted successfully!`)
    } else {
      this.error(`Failed to remove mount '${mountName}'`)
    }
  }
}
