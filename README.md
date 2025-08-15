# Internationalization for Svelte

A type-safe, developer-friendly internationalization library for Svelte with automatic translation support (via OpenAI).

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

## CLI

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

Create a new language dictionary.

```bash
npx intl set example.hello "Hello world"
```

Create a new translation entry.

```bash
npx intl move example.hello example.greeting.welcome
```

Move a translation entry.

```bash
npx intl remove example.hello
```

Remove a translation entry.

```bash
npx intl destroy es
```

Delete a language dictionary.

```bash
npx intl sync en
```

Sync (re-translate) all languages using source language dictionary.

```bash
npx intl sync en example.hello
```

Sync specific key across all languages.

```bash
npx intl build
```

Rebuild (after manual changes).
