# Internationalization for Svelte

Developer-friendly internationalization library for Svelte.

- Bulk dictionary manipulation
- Automatic translation via OpenAI

## TL;DR

```bash
npx intl hola # initialize dictionaries in default location
npx intl set example.hello "Hello world" # set a translation
npx intl create es # create a new language dictionary
```

```svelte
<script lang="ts">
  import { intl, language } from '$lib/intl'

  // bind $language to a dropdown or whatever
</script>

<h1>{@render intl.example.hello()}</h1>
```

## Dictionary format

The dictionary is an object with an arbitrary structure, where strings are located at the leaves.

```yaml
native: English
example:
  hello: "Hello world"
```

```svelte
<h1>{@render intl.example.hello()}</h1>
```

Values can be specified as JavaScript functions using the following syntax:

```yaml
example:
  hello: |
    !js
    () => 'Hello world'
```

> This looks weird, suggestions [are welcome](https://github.com/temich/svintl/issues/).

Functions can accept arguments:

```yaml
example:
  hello: |
    !js
    (count) => `${count || 'No'} item${count === 1 ? '' : 's'}`
```

```svelte
<h1>You have {@render intl.example.hello(count)}</h1>
```

The translation prompt provides clear guidance on using functions across languages to implement phrases with language-specific rules.

### Pluralization

For pluralized content, use arrays containing objects with named plural forms. This format automatically generates functions that use `Intl.PluralRules` for proper pluralization:

```yaml
items:
  count:
    - one: item
      other: items

product:
  count:
    - one: product
      other: products
```

For languages with complex pluralization rules (like Russian), include all required forms:

```yaml
# Russian pluralization
product:
  count:
    - one: товар      # 1, 21, 31, 41...
      few: товара     # 2-4, 22-24, 32-34...
      many: товаров   # 0, 5-20, 25-30...
      other: товаров  # fallback
```

The array format `[{ one: '...', other: '...' }]` serves as an indicator for pluralization. The system automatically:

- Detects the array-with-object format
- Generates optimized functions using direct property access
- Eliminates the need for CLDR ordering complexity
- Supports all standard plural categories: `zero`, `one`, `two`, `few`, `many`, `other`

```svelte
<p>You have {@render intl.items.count(itemCount)}</p>
```

### Context

Translation contexts are automatically saved when using the `set` command with a comment parameter. These contexts enhance translation accuracy when creating new language dictionaries.

```bash
npx intl set app.welcome "Welcome to our application" "greeting shown on homepage"
```

Contexts are stored in `context.yaml` alongside your language files:

```yaml
inputs:
  app:
    welcome:
      input: "Welcome to our application"
      context: "greeting shown on homepage"
```

When creating new languages with `npx intl create <lang>`, saved contexts are automatically used to provide more accurate translations by giving the AI translator additional context about how each phrase is used.

## CLI

> Translations are powered by OpenAI. Ensure you set the `OPENAI_API_KEY` in your environment variables.
> `.env` file is supported.

```bash
npx intl
```

Print help.

```bash
npx intl hola
```

- Create a directory `src/lib/intl/` or specifed with `-p`
- Create `en` dictionary file with `native: English` key
- Build dictionaries

```bash
npx intl create es
npx intl create en-US
npx intl create pt-BR
```

Creates a new language dictionary. Language codes must be valid BCP 47 language tags. The new dictionary will automatically include a `native` key with the language name in that language.

Dictionary names must be valid BCP 47 language tags.

```bash
npx intl set example.hello "Hello world"
npx intl set wardrobe.tops "Tops" "Clothing"
```

Creates a new translation entry with optional context.

```bash
npx intl unit items.count "item"
```

Creates pluralized translation entries for all languages using the object-based format. The system automatically generates appropriate plural forms for each language based on their pluralization rules.

```bash
npx intl const example.hello "Hello"
```

Sets the same value in all dictionaries without translation.

```bash
npx intl move example.hello example.greeting.welcome
```

Moves a translation entry.

```bash
npx intl remove example.hello
```

Removes a translation entry.

```bash
npx intl destroy es
```

Deletes a language dictionary.

```bash
npx intl sync en
npx intl sync en example.hello # sync specific key
```

Syncs (re-translates) all languages using the source language dictionary.

```bash
npx intl build
```

Rebuilds (likely after manual changes).
