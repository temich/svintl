# Internationalization for Svelte

## TL;DR

```bash
npx intl hola # initialize dictionaries in default location
npx intl set example.hello "Hello world" # set a translation
npx intl create es # create a new language dictionary
```

```svelte
<script lang="ts">
  import { intl, language } from '$lib/intl'

  // update $language as you like
</script>

<h1>{@render intl.example.hello()}</h1>
```

## CLI docs

```bash
npx intl # prints docs
```
