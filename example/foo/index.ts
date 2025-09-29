import { derived, writable } from 'svelte/store'
import { create } from 'svintl'
import { dictionaries, locales } from './built.js'
import type { Language, Dictionary } from './types'

const locale = writable<Language>('en-US')
const intl = create(dictionaries, locale) as Dictionary
const dict = derived(locale, ($locale) => dictionaries[$locale])

export { dict, intl, dictionaries, locales, locale }
export type { Language }
