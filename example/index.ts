import { readable } from 'svelte/store'
import { create } from '../source/'
import { dictionaries, locales } from './built.js'
import type { Locale, Dictionary } from './types'

const locale = readable<Locale>('en')
const intl = create(dictionaries, locale) as Dictionary

export { intl, dictionaries, locales, locale }
export type { Locale }
