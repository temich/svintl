import { derived } from 'svelte/store'
import { locale } from '$lib/intl'
import { dictionaries } from './built.js'

const dict = derived(locale, ($locale) => dictionaries[$locale])

export { dict, dictionaries }
