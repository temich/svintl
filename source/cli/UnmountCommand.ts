/**
 * CLI command for unmounting dictionary partitions
 * Removes a mount from context.yaml but keeps the partition files
 *
 * @author copilot
 */

import { ContextFileManager } from './context'

export class UnmountCommand {
  private error(message: string): never {
    console.error(`❌ ${message}`)
    process.exit(1)
  }

  async execute(mountName: string, i18nPath = './src/lib/intl/'): Promise<void> {
    const contextManager = new ContextFileManager()
    const existingMount = contextManager.getMountPath(i18nPath, mountName)
    if (!existingMount)
      return

    const removed = contextManager.removeMountPath(i18nPath, mountName)
    if (!removed)
      this.error(`Failed to remove mount '${mountName}'`)
  }
}
