import { derived, writable } from 'svelte/store'
import { dictionaries, locales } from './built.js'

const locale = writable('en-US')
const dict = derived(locale, ($locale) => dictionaries[$locale])

export { dict, dictionaries, locales, locale }
