import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { pointAtRootDictionary } from './libAlias'

const TEMPLATE_DIR = join(resolve(__dirname, '..'), 'index')

/**
 * Create the mount's `index.ts` (or `index.js`) from the package template unless the mount already has one,
 * then point its root dictionary import, new or existing, at the app's lib alias.
 * Exits the process when the package template is missing.
 *
 * @param mountDir Absolute path of the mount directory.
 * @param useJavaScript Write `index.js` instead of `index.ts`.
 */
export function writeMountIndex(mountDir: string, useJavaScript: boolean): void {
  const extension = useJavaScript ? 'js' : 'ts'
  const indexFile = join(mountDir, `index.${extension}`)
  const source = existsSync(indexFile) ? readFileSync(indexFile, 'utf8') : readTemplate(`mount.${extension}`)

  writeFileSync(indexFile, pointAtRootDictionary(source))
}

function readTemplate(name: string): string {
  const templatePath = join(TEMPLATE_DIR, name)

  if (!existsSync(templatePath)) {
    console.error(`❌ Template file not found: ${templatePath}`)
    process.exit(1)
  }

  return readFileSync(templatePath, 'utf8')
}
