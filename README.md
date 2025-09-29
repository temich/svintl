# Internationalization for Svelte

Developer-friendly internationalization library for Svelte.

- Bulk dictionary manipulation
- Automatic translation via OpenAI

## TL;DR

```bash
npm i svintl -D
```

```bash
npx intl hola # initialize dictionaries in default location
npx intl set example.hello "Hello world" # set a translation
npx intl create es # create a new locale dictionary
```

```svelte
<script lang="ts">
  import { intl, locale } from '$lib/intl'

  // bind $locale to a dropdown or whatever
</script>

<h1>{@render intl.example.hello()}</h1>
```

---

> Everything below this line is written by AI.

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

The translation prompt provides clear guidance on using functions across locales to implement phrases with locale-specific rules.

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

For locales with complex pluralization rules (like Russian), include all required forms:

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

### Partitions

Partitions allow you to organize translations into separate directories within your i18n folder. Each partition acts as an independent dictionary that can be imported separately.

```bash
npx intl part foo # creates foo partition with empty dictionaries for all locales
npx intl set foo/bar.baz "Hello partition" # set key in partition 'foo'
```

Partitions are created with the same languages as the root dictionary but start empty (no `native` key).

Partitions are useful for:

- Organizing large applications by feature/module
- Separate dictionaries for different user roles
- Logical grouping of related translations

```svelte
<script lang="ts">
  import { dict as mainDict } from '$lib/intl'
  import { dict as adminDict } from '$lib/intl/admin'
</script>

<div>$main.foo</div>
<div>$admin.bar</div>
```

### Context

Translation contexts are automatically saved when using the `set` command with a comment parameter. These contexts enhance translation accuracy when creating new locale dictionaries.

```bash
npx intl set app.welcome "Welcome to our application" "greeting shown on homepage"
```

Contexts are stored in `context.yaml` alongside your locale files:

```yaml
inputs:
  app:
    welcome:
      input: "Welcome to our application"
      context: "greeting shown on homepage"
```

When creating new locales with `npx intl create <lang>`, saved contexts are automatically used to provide more accurate translations by giving the AI translator additional context about how each phrase is used.

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

Creates a new locale dictionary. Locale codes must be valid BCP 47 locale tags. The new dictionary will automatically include a `native` key with the locale name in that locale.

Dictionary names must be valid BCP 47 locale tags.

```bash
npx intl set example.hello "Hello world"
npx intl set wardrobe.tops "Tops" "Clothing"
```

Creates a new translation entry with optional context.

```bash
npx intl part <partition>
```

Create a dictionary partition with empty dictionaries for all languages in the root directory. Partitions can be addressed with `partition/key` key syntax. Example: `npx intl set partition/key "value" "context"`.

```bash
npx intl unit items.count "item"
```

Creates pluralized translation entries for all locales using the object-based format. The system automatically generates appropriate plural forms for each locale based on their pluralization rules.

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

Deletes a locale dictionary.

```bash
npx intl sync en
npx intl sync en example.hello # sync specific key
```

Syncs (re-translates) all locales using the source locale dictionary.

```bash
npx intl context "Describe shared project background"
npx intl context --clear
```

Sets or clears project-wide translation guidance stored in `context.yaml`.

```bash
npx intl build
```

Rebuilds (likely after manual changes).
