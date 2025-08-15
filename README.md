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
- Create `en` empty dictionary file
- Build dictionaries

```bash
npx intl create es
```

Creates a new language dictionary.

```bash
npx intl set example.hello "Hello world"
npx intl set wardrobe.tops "Tops" "Clothing"
```

Creates a new translation entry with optional context.

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
