/**
 * CLI command for mounting dictionary partitions
 * Creates a new partition at the specified path and registers it as a mount
 *
 * @author copilot
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'fs'
import { resolve, join, dirname, relative } from 'path'
import { build } from './build'
import { ContextFileManager } from './context'

export class MountCommand {
  private log(message: string): void {
    console.log(message)
  }

  private error(message: string): never {
    console.error(`❌ ${message}`)
    process.exit(1)
  }

  async execute(mountName: string, mountPath: string, useJavaScript: boolean = false, i18nPath = './src/lib/intl/'): Promise<void> {
    this.log(`🌟 Mounting '${mountName}' at '${mountPath}'...`)

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
    if (existingMount) {
      this.log(`⚠️ Mount '${mountName}' already exists: ${existingMount}`)
      return
    }

    // Check if mount directory already exists
    if (existsSync(absoluteMountPath)) {
      this.log(`⚠️ Mount directory already exists: ${absoluteMountPath}`)
      // Still register it as a mount
    } else {
      // Create mount directory
      mkdirSync(absoluteMountPath, { recursive: true })
      this.log(`✓ Created mount directory: ${absoluteMountPath}`)
    }

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
        this.log(`✓ Created empty ${localeName} dictionary: ${mountFilePath}`)
      }
    }

    // Create index file based on template
    const indexFile = join(absoluteMountPath, 'index.ts')
    if (!existsSync(indexFile)) {
      const templateFile = useJavaScript ? 'js' : 'ts'
      const packageRoot = resolve(__dirname, '..')
      const templatePath = join(packageRoot, 'index', templateFile)

      if (!existsSync(templatePath)) {
        this.error(`Template file not found: ${templatePath}`)
      }

      const templateContent = readFileSync(templatePath, 'utf8')
      writeFileSync(indexFile, templateContent)
      this.log(`✓ Created ${useJavaScript ? 'JavaScript' : 'TypeScript'} index file: ${indexFile}`)
    }

    // Register mount in context.yaml
    contextManager.setMountPath(i18nPath, mountName, relativeMountPath)
    this.log(`✓ Registered mount '${mountName}' -> '${relativeMountPath}' in context.yaml`)

    // Build the mount
    this.log('🔨 Building mount dictionaries...')
    const mountI18nPath = mountPath
    build(mountI18nPath)

    this.log(`🎉 Mount '${mountName}' created successfully!`)
  }
}
