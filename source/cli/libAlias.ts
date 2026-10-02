import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

const LIB_SUBPATH_IMPORT = '#lib/*'
const SVELTEKIT_2_ROOT_DICTIONARY = '$lib/intl'
// TypeScript resolves subpath imports only with an explicit extension.
const SVELTEKIT_3_ROOT_DICTIONARY = '#lib/intl/index.js'
const ROOT_DICTIONARY_LITERAL = new RegExp(
  `(['"])(?:${escapeRegExp(SVELTEKIT_2_ROOT_DICTIONARY)}|${escapeRegExp(SVELTEKIT_3_ROOT_DICTIONARY)})\\1`,
  'g'
)

/**
 * Module specifier of the root dictionary for the app in the working directory:
 * `#lib/intl/index.js` when its `package.json` maps the `#lib/*` subpath import (SvelteKit 3),
 * otherwise `$lib/intl` (SvelteKit 2).
 *
 * @returns The specifier, without quotes.
 */
export function rootDictionarySpecifier(): string {
  return hasLibSubpathImport() ? SVELTEKIT_3_ROOT_DICTIONARY : SVELTEKIT_2_ROOT_DICTIONARY
}

/**
 * Rewrite every quoted root dictionary specifier, in either SvelteKit form, to the working directory app's form.
 *
 * @param source Module source text.
 * @returns The source with each specifier replaced.
 */
export function pointAtRootDictionary(source: string): string {
  const specifier = rootDictionarySpecifier()

  return source.replace(ROOT_DICTIONARY_LITERAL, (_, quote) => `${quote}${specifier}${quote}`)
}

function hasLibSubpathImport(): boolean {
  const manifest = resolve(process.cwd(), 'package.json')

  if (!existsSync(manifest))
    return false

  const { imports } = JSON.parse(readFileSync(manifest, 'utf8'))

  return Object.hasOwn(imports ?? {}, LIB_SUBPATH_IMPORT)
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
