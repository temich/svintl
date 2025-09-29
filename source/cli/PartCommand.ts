/**
 * CLI command for creating dictionary partitions
 * Creates a new partition (subdirectory) with the same structure as the main dictionary
 *
 * @author copilot
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'fs'
import { resolve, join, dirname } from 'path'
import { build } from './build'

export class PartCommand {
  private log(message: string): void {
    console.log(message)
  }

  private error(message: string): never {
    console.error(`❌ ${message}`)
    process.exit(1)
  }

  async execute(partitionName: string, useJavaScript: boolean = false, i18nPath = './src/lib/intl/'): Promise<void> {
    this.log(`🌟 Creating partition '${partitionName}'...`)

    const i18nDir = resolve(process.cwd(), i18nPath)
    const partitionDir = join(i18nDir, partitionName)

    // Check if main directory exists
    if (!existsSync(i18nDir)) {
      this.error(`Main intl directory does not exist: ${i18nDir}. Run 'npx intl hola' first.`)
    }

    // Check if partition already exists
    if (existsSync(partitionDir)) {
      this.log(`⚠️ Partition '${partitionName}' already exists: ${partitionDir}`)
      return
    }

    // Get all locale files from the main directory
    const localeFiles = readdirSync(i18nDir)
      .filter(file => file.match(/^[a-z]{2}(-[A-Z]{2})?\.yaml$/))

    if (localeFiles.length === 0) {
      this.error(`No locale files found in main directory: ${i18nDir}`)
    }

    // Create partition directory
    mkdirSync(partitionDir, { recursive: true })
    this.log(`✓ Created partition directory: ${partitionDir}`)

    // Create empty YAML files for each locale (without native key)
    for (const localeFile of localeFiles) {
      const localeName = localeFile.replace('.yaml', '')
      const partitionFilePath = join(partitionDir, localeFile)

      // Create empty YAML file (just a comment header)
      const initialDict = `# ${localeName} dictionary\n# Add your translations here\n`

      writeFileSync(partitionFilePath, initialDict)
      this.log(`✓ Created empty ${localeName} dictionary: ${partitionFilePath}`)
    }

    // Create index file based on template
    const indexFile = join(partitionDir, 'index.ts')
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

    // Build the partition
    this.log('🔨 Building partition dictionaries...')
    const partitionPath = join(i18nPath, partitionName)
    build(partitionPath)

    this.log(`🎉 Partition '${partitionName}' created successfully!`)
  }
}
