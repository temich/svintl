import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'

const TEMPLATE_DIR = join(resolve(__dirname, '..'), 'index')

/**
 * Create the mount's `index.ts` (or `index.js`) from the package template unless the mount already has one.
 * Exits the process when the package template is missing.
 *
 * @param mountDir Absolute path of the mount directory.
 * @param useJavaScript Write `index.js` instead of `index.ts`.
 */
export function createMountIndex(mountDir: string, useJavaScript: boolean): void {
  const extension = useJavaScript ? 'js' : 'ts'
  const indexFile = join(mountDir, `index.${extension}`)

  if (!existsSync(indexFile))
    writeFileSync(indexFile, readTemplate(`mount.${extension}`))
}

function readTemplate(name: string): string {
  const templatePath = join(TEMPLATE_DIR, name)

  if (!existsSync(templatePath)) {
    console.error(`❌ Template file not found: ${templatePath}`)
    process.exit(1)
  }

  return readFileSync(templatePath, 'utf8')
}
