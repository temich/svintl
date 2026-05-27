/**
 * CLI command for importing an existing dictionary directory as a mount.
 * Registers the directory under the root `mounts:`, then reconciles its locale
 * set to the root project: drops mount-only locales, generates root-only ones
 * (by translating the imported `context.yaml` inputs), leaves the intersection
 * untouched. The imported `context.yaml` is never modified.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join, relative, resolve } from 'path'
import { dump as yamlDump } from 'js-yaml'
import { build } from './build'
import { ContextFileManager } from './context'
import { CreateCommand } from './CreateCommand'
import { TranslationService } from './TranslationService'

const LOCALE_FILE = /^[a-z]{2}(-[A-Z]{2})?\.yaml$/

export class ImportCommand {
  private contextManager = new ContextFileManager()
  private translationService = new TranslationService()
  private createCommand = new CreateCommand()

  private error(message: string): never {
    console.error(`❌ ${message}`)
    process.exit(1)
  }

  async execute(name: string, dir: string, useJavaScript = false, i18nPath = './src/lib/intl/'): Promise<void> {
    const i18nDir = resolve(process.cwd(), i18nPath)
    const absImportPath = resolve(process.cwd(), dir)
    const relativeImportPath = relative(i18nDir, absImportPath)

    if (!existsSync(i18nDir))
      this.error(`Main intl directory does not exist: ${i18nDir}. Run 'npx intl hola' first.`)

    if (!existsSync(absImportPath) || !existsSync(join(absImportPath, 'context.yaml')))
      this.error(`Import directory must exist and contain a context.yaml: ${absImportPath}`)

    if (this.contextManager.getMountPath(i18nPath, name))
      this.error(`Mount '${name}' already exists`)

    // Create an index file from the mount template only when absent.
    const indexFileName = useJavaScript ? 'index.js' : 'index.ts'
    const indexFile = join(absImportPath, indexFileName)
    if (!existsSync(indexFile)) {
      const templateFile = useJavaScript ? 'mount.js' : 'mount.ts'
      const templatePath = join(resolve(__dirname, '..'), 'index', templateFile)

      if (!existsSync(templatePath))
        this.error(`Template file not found: ${templatePath}`)

      writeFileSync(indexFile, readFileSync(templatePath, 'utf8'))
    }

    // Register the mount before reconciling so it participates in `build`.
    this.contextManager.setMountPath(i18nPath, name, relativeImportPath)

    const rootLocales = this.translationService.getLocaleInfo(i18nPath).allLocales
    const mountLocales = readdirSync(absImportPath)
      .filter(file => LOCALE_FILE.test(file))
      .map(file => file.replace('.yaml', ''))

    // Mount-only locales: delete the YAML file (no other artifact cleanup).
    for (const locale of mountLocales)
      if (!rootLocales.includes(locale))
        unlinkSync(join(absImportPath, `${locale}.yaml`))

    // Root-only locales: generate from the imported inputs.
    const missing = rootLocales.filter(locale => !mountLocales.includes(locale))
    if (missing.length > 0) {
      const inputs = this.contextManager.getAllContextEntries(dir)
      const entries = Object.entries(inputs).map(([key, entry]) => ({
        key,
        value: entry.input,
        context: entry.context,
      }))

      // Enrichment comes from the root project, not the external mount.
      const projectContext = this.translationService.getGlobalProjectContext(i18nPath)
      const genderInstructions = this.translationService.getGenderInstructions(i18nPath)

      for (const locale of missing) {
        const data = await this.createCommand.translateEntries(entries, locale, projectContext, genderInstructions)
        const yamlContent = yamlDump(data, { lineWidth: -1, quotingType: '"', forceQuotes: false })

        writeFileSync(join(absImportPath, `${locale}.yaml`), yamlContent)
      }
    }

    build(i18nPath)
  }
}
