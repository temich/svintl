import { createRawSnippet } from 'svelte'
import { get, type Readable } from 'svelte/store'

type Dictionary = {
  [key: string]: string | ((...args: any[]) => string) | Dictionary;
}

/**
 * Create i18n snippets from dictionaries.
 *
 * @param dictionaries - A record of dictionaries, keyed by locale.
 * @param locale - A store that contains the current locale.
 * @returns An object with the same structure as each dictionary, but with snippets instead of strings or functions from the dictionaries.
 *
 * @example
 * const en = { wardrobe: { title: 'Wardrobe' } }
 * const ar = { wardrobe: { title: 'الملابس' } }
 *
 * const lang = readable('en')
 * const intl = create({ en, ar }, lang)
 *
 * {@render intl.wardrobe.title()}
 *
 * Renders `wardrobe.title` according to the current locale.
 */
function create<Locale extends string>(
  dictionaries: Record<Locale, Dictionary>,
  locale: Readable<Locale>,
  options: Options = {},
) {
  const def = get(locale)
  const ref = dictionaries[def]

  function snippetify(source: Dictionary, target: any = {}, path: string[] = []) {
    for (const key in source) {
      const value = source[key]

      if (typeof value === 'object') {
        target[key] = {}
        snippetify(value, target[key], [...path, key])
      } else target[key] = createRawSnippet((...getters) => {
        function render(lang: Locale) {
          const dict = dictionaries[lang]
          const node = traverse(dict, [...path, key])

          return typeof value === 'string' ? node : node(...getters.map((getter) => getter()))
        }

        return {
          render: () => {
            const innerHTML = render(get(locale))
            const attr = options.dev ? ` data-intl="${[...path, key].join('.')}"` : ''

            return `<span${attr}>${innerHTML}</span>`
          },
          setup: (element) => locale.subscribe((lang) => (element.innerHTML = render(lang))),
        }
      })
    }

    return target
  }

  return snippetify(ref)
}

function traverse(obj: any, path: string[]) {
  let cur = obj

  for (const p of path)
    cur = cur[p]

  return cur
}

interface Options {
  dev?: boolean
}

export { create }
