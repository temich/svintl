import { derived, writable } from 'svelte/store'
import { create } from 'svintl'
import { dictionaries, languages } from './built.js'
import type { Language, Dictionary } from './types'

const language = writable<Language>('en-US')
const intl = create(dictionaries, language) as Dictionary
const dict = derived(language, ($language) => dictionaries[$language])

export { dict, intl, dictionaries, languages, language }
export type { Language }
