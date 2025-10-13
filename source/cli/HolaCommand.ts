/**
 * @author copilot
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs'
import { resolve, join } from 'path'
import { build } from './build'

export class HolaCommand {
  private log(message: string): void {
    console.log(message)
  }

  private error(message: string): never {
    console.error(`❌ ${message}`)
    process.exit(1)
  }

  async execute(useJavaScript: boolean = false, i18nPath = './src/lib/intl/'): Promise<void> {
    this.log('🌟 Initializing new intl dictionary project...')

    const i18nDir = resolve(process.cwd(), i18nPath)

    // 1. Create dictionary directory
    if (!existsSync(i18nDir)) {
      mkdirSync(i18nDir, { recursive: true })
      this.log(`✓ Created directory: ${i18nDir}`)
    } else {
      this.log(`✓ Directory already exists: ${i18nDir}`)
    }

    // 2. Create index file based on template
    const indexFileName = useJavaScript ? 'index.js' : 'index.ts'
    const indexFile = join(i18nDir, indexFileName)
    if (existsSync(indexFile)) {
      this.log(`⚠️ Index file already exists: ${indexFile}`)
    } else {
      const templateFile = useJavaScript ? 'js' : 'ts'
      // Get the path to the intl package root
      // When bundled, __dirname points to where the bundled CLI runs
      // We need to look for the template relative to the package installation
      const packageRoot = resolve(__dirname, '..')
      const templatePath = join(packageRoot, 'index', templateFile)

      if (!existsSync(templatePath)) {
        this.error(`Template file not found for ${useJavaScript ? 'JavaScript' : 'TypeScript'}: ${templatePath}`)
      }

      const templateContent = readFileSync(templatePath, 'utf8')
      writeFileSync(indexFile, templateContent)
      this.log(`✓ Created ${useJavaScript ? 'JavaScript' : 'TypeScript'} index file: ${indexFile}`)
    }

    // 3. Create context.yaml file
    const contextFile = join(i18nDir, 'context.yaml')
    if (!existsSync(contextFile)) {
      const initialContext = `context: Internationalization project
inputs:
  locale:
    input: locale
    context: BCP 47 language tag, should not be translated, always use the target language code
  native:
    input: native
    context: native name of the language in that language, should not be translated
`
      writeFileSync(contextFile, initialContext)
      this.log(`✓ Created context file: ${contextFile}`)
    }

    // 5. Create empty en-US dictionary
    const enFile = join(i18nDir, 'en-US.yaml')
    if (existsSync(enFile)) {
      this.log(`⚠️ English dictionary already exists: ${enFile}`)
    } else {
      const initialDict = `# English dictionary
# The 'native' key contains the language name in its own language
native: English
locale: en-US

# Add your translations here
# Example:
# hello: "Hello"
# greeting:
#   welcome: "Welcome to our app"
`
      writeFileSync(enFile, initialDict)
      this.log(`✓ Created English dictionary with native name: ${enFile}`)
    }

    // 6. Build
    this.log('🔨 Building dictionaries...')
    build(i18nPath)

    this.log('🎉 Project initialization complete!')
    this.log('')
    this.log('Next steps:')
    this.log('  1. Add translations to en.yaml')
    this.log('  2. Run "npx intl create <lang>" to add more languages')
    this.log('  3. Import and use intl in your app from the index file')
  }
}
