/**
 * CLI command for mounting dictionary partitions
 * Creates a new partition at the specified path and registers it as a mount
 *
 * @author copilot
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'fs'
import { resolve, join, relative } from 'path'
import { build } from './build'
import { ContextFileManager } from './context'

export class MountCommand {
  private error(message: string): never {
    console.error(`❌ ${message}`)
    process.exit(1)
  }

  async execute(mountName: string, mountPath: string, useJavaScript: boolean = false, i18nPath = './src/lib/intl/'): Promise<void> {
    const i18nDir = resolve(process.cwd(), i18nPath)
    const absoluteMountPath = resolve(process.cwd(), mountPath)
    const relativeMountPath = relative(i18nDir, absoluteMountPath)

    // Check if main directory exists
    if (!existsSync(i18nDir)) {
      this.error(`Main intl directory does not exist: ${i18nDir}. Run 'npx intl hola' first.`)
    }

    // Check if mount already exists in context
    const contextManager = new ContextFileManager()
    const existingMount = contextManager.getMountPath(i18nPath, mountName)
    if (existingMount)
      return

    if (!existsSync(absoluteMountPath))
      mkdirSync(absoluteMountPath, { recursive: true })

    // Get all locale files from the main directory
    const localeFiles = readdirSync(i18nDir)
      .filter(file => file.match(/^[a-z]{2}(-[A-Z]{2})?\.yaml$/))

    if (localeFiles.length === 0) {
      this.error(`No locale files found in main directory: ${i18nDir}`)
    }

    // Create empty YAML files for each locale (without native key)
    for (const localeFile of localeFiles) {
      const localeName = localeFile.replace('.yaml', '')
      const mountFilePath = join(absoluteMountPath, localeFile)

      // Only create if it doesn't exist
      if (!existsSync(mountFilePath)) {
        // Create empty YAML file (just a comment header)
        const initialDict = `# ${localeName} dictionary\n# Add your translations here\n`

        writeFileSync(mountFilePath, initialDict)
      }
    }

    // Create context.yaml file for the mount
    const mountContextFile = join(absoluteMountPath, 'context.yaml')
    if (!existsSync(mountContextFile)) {
      const mountContext = `context: Mount '${mountName}' context
inputs: {}
`
      writeFileSync(mountContextFile, mountContext)
    }

    // Create index file based on template
    const indexFileName = useJavaScript ? 'index.js' : 'index.ts'
    const indexFile = join(absoluteMountPath, indexFileName)
    if (!existsSync(indexFile)) {
      const templateFile = useJavaScript ? 'mount.js' : 'mount.ts'
      const packageRoot = resolve(__dirname, '..')
      const templatePath = join(packageRoot, 'index', templateFile)

      if (!existsSync(templatePath)) {
        this.error(`Template file not found: ${templatePath}`)
      }

      const templateContent = readFileSync(templatePath, 'utf8')
      writeFileSync(indexFile, templateContent)
    }

    // Register mount in context.yaml
    contextManager.setMountPath(i18nPath, mountName, relativeMountPath)
    // Run full build from root - same as "intl build". Mount = copy + build.
    build(i18nPath)
  }
}
