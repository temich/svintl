import { derived, readable } from 'svelte/store'
import { dictionaries, locales } from './built.js'
import type { Locale, Dictionary } from './types'

const locale = readable<Locale>('en-US')
const dict = derived(locale, ($locale) => dictionaries[$locale])

export { dict, dictionaries, locales, locale }
export type { Locale, Dictionary }
