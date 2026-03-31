# Internationalization for Svelte

Developer-friendly CLI tool for managing internationalization dictionaries with automatic translation via OpenAI.

- Bulk dictionary manipulation
- Automatic translation via OpenAI
- Generates typed JavaScript modules

## TL;DR

```bash
npm i svintl -D
```

```bash
npx intl hola # initialize dictionaries in default location
npx intl set example.hello "Hello world" # set a translation
npx intl create es # create a new locale dictionary
npx intl build # generate JavaScript dictionaries
```

```svelte
<script lang="ts">
  import { dict, locale } from '$lib/intl'

  // bind $locale to a dropdown or whatever
</script>

<h1>{$dict.example.hello}</h1>
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
<h1>{$dict.example.hello}</h1>
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
<h1>You have {$dict.example.hello(count)}</h1>
```

The translation prompt provides clear guidance on using functions across locales to implement phrases with locale-specific rules.

If a phrase contains placeholders like `{name}` or `{itemId}`, store it as a `!js` function with matching parameters.

If a phrase contains placeholders like `[names]` in square brackets, treat them as array-of-strings parameters and format them with `Intl.ListFormat` using `style: "long"` and `type: "conjunction"`. Make the phrase grammatically correct based on the number of items in the array.

Example input:

```bash
npx intl set joined "[names] have joined the {groupName}"
```

Example function output:

```yaml
joined: |
  !js
  (names, groupName) => {
    const list = new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(names)
    return names.length === 1
      ? `${list} has joined the ${groupName}`
      : `${list} have joined the ${groupName}`
  }
```

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
<p>You have {$dict.items.count(itemCount)}</p>
```

### Mounts

Mounts allow you to organize translations into separate directories anywhere in your filesystem. Each mount acts as an independent dictionary that can be imported separately.

```bash
npx intl mount foo ./any/path # creates foo mount with empty dictionaries for all locales
npx intl set foo/bar.baz "Hello mount" # set key in mount 'foo'
```

Mounts are created with the same languages as the root dictionary but start empty (no `native` key).

Mounts are useful for:

- Organizing large applications by feature/module
- Separate dictionaries for different user roles
- Logical grouping of related translations
- Storing dictionaries in different locations

```svelte
<script lang="ts">
  import { dict as mainDict } from '$lib/intl'
  import { dict as adminDict } from '$lib/intl/admin'
</script>

<div>{$mainDict.foo}</div>
<div>{$adminDict.bar}</div>
```

### Context

Translation contexts are automatically saved when using the `set` command with a comment parameter. These contexts enhance translation accuracy when creating new locale dictionaries.

```bash
npx intl set app.welcome "Welcome to our application" "greeting shown on homepage"
```

Contexts are stored in `context.yaml` alongside your locale files:

```yaml
mounts:
  foo: ../../any/path # path relative to this main context file

inputs:
  app:
    welcome:
      input: "Welcome to our application"
      context: "greeting shown on homepage"
```

When creating new locales with `npx intl create <lang>`, saved per-key contexts under `inputs` are passed into batch translation.

The optional **global** product description (`npx intl context "…"`), stored as the top-level `context` field in `context.yaml`, is sent on **every** OpenAI translation: `add`, `set`, `unit`, `create` (when translating from a source locale), and `sync`.

## CLI

> Translations are powered by OpenAI. Ensure you set the `OPENAI_API_KEY` in your environment variables.
> `.env` file is supported.

On `add` and `set`, pass `--debug` to print the full translation request (model, system and user messages) to stdout before the OpenAI call.

```bash
npx intl
```

Print help.

```bash
npx intl hola
```

- Create a directory `src/lib/intl/` or specified with `-p`
- Create `en-US` dictionary
- Generate JavaScript dictionaries and TypeScript types

```bash
npx intl create es
npx intl create en-US
npx intl create pt-BR
```

Creates a new locale dictionary. Locale codes must be valid BCP 47 locale tags. The new dictionary will automatically include a `native` key with the locale name in that locale.

Dictionary names must be valid BCP 47 locale tags.

```bash
npx intl add example.hello "Hello world"   # new key (fails if key already exists)
npx intl set example.hello "Hello world"   # update existing key
npx intl set wardrobe.tops "Tops" "Clothing"
npx intl set example.hello "Hello world" --debug   # log OpenAI request before sending
```

`add` creates an entry; `set` updates an existing one. Optional third argument is context for the translator.

```bash
npx intl mount <mount> <dir>
```

Create a dictionary mount at the specified path with empty dictionaries for all languages in the root directory. Mounts can be addressed with `mount/key` key syntax. Example: `npx intl set mount/key "value" "context"`.

```bash
npx intl unmount <mount>
```

Remove a mount from context.yaml but keep the partition files on disk. The mount can be re-added later using the `mount` command.

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

Moves a translation entry or a branch.

```bash
npx intl del example.hello
```

Deletes a translation entry or a branch.

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
npx intl genders true
npx intl genders false
```

Enables or disables grammatical gender guidance for translations. When enabled, phrases that vary by gender should be stored as functions that accept `gender: 'he' | 'she' | 'none'`. Use the neutral form when possible; otherwise use a combined form (e.g., `бежал(а)`, `должен(на)`), and avoid neuter forms for people.

Example:

```yaml
run: |
  !js
  (gender) => gender === "she" ? "бежала" : gender === "he" ? "бежал" : "бежал(а)"
```

```bash
npx intl build
```

Generates JavaScript dictionaries and TypeScript types from YAML files. Creates `built.js` and `types.ts` files that can be imported in your Svelte application.
