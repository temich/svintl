Feature: Mounts import the root dictionary through the host's lib alias

  Scenario: Mount in a SvelteKit 2 app uses $lib
    When I run `npx intl hola`
    And I run `npx intl mount foo ./src/foo`
    Then the file `src/foo/built.js` contains:
      """
      /** @type {Record<import('$lib/intl').Locale, import('./types').Dictionary>} */
      """
    And the file `src/foo/index.ts` contains:
      """
      import { locale } from '$lib/intl'
      """

  Scenario: Mount in a SvelteKit 3 app uses #lib subpath import
    Given a file `package.json`:
      """
      { "imports": { "#lib": "./src/lib/index.ts", "#lib/*": "./src/lib/*" } }
      """
    When I run `npx intl hola`
    And I run `npx intl mount foo ./src/foo`
    Then the file `src/foo/built.js` contains:
      """
      /** @type {Record<import('#lib/intl/index.js').Locale, import('./types').Dictionary>} */
      """
    And the file `src/foo/index.ts` contains:
      """
      import { locale } from '#lib/intl/index.js'
      """

  Scenario: Mount with JavaScript index in a SvelteKit 3 app uses #lib subpath import
    Given a file `package.json`:
      """
      { "imports": { "#lib/*": "./src/lib/*" } }
      """
    When I run `npx intl hola --js`
    And I run `npx intl mount foo ./src/foo --js`
    Then the file `src/foo/index.js` contains:
      """
      import { locale } from '#lib/intl/index.js'
      """

  Scenario: Import a SvelteKit 3 mount into a SvelteKit 2 app
    When I run `npx intl hola`
    Given a file `external/context.yaml`:
      """
      context: External
      inputs: {}
      """
    And a file `external/en-US.yaml`:
      """
      hi: Hello
      """
    And a file `external/built.js`:
      """
      /** @type {Record<import('#lib/intl/index.js').Locale, import('./types').Dictionary>} */
      """
    And a file `external/index.ts`:
      """
      import { derived } from 'svelte/store'
      import { locale } from '#lib/intl/index.js'
      """
    When I run `npx intl import ext ./external`
    Then the file `external/built.js` contains:
      """
      /** @type {Record<import('$lib/intl').Locale, import('./types').Dictionary>} */
      """
    And the file `external/index.ts` contains:
      """
      import { locale } from '$lib/intl'
      """

  Scenario: Import a SvelteKit 2 mount into a SvelteKit 3 app
    Given a file `package.json`:
      """
      { "imports": { "#lib/*": "./src/lib/*" } }
      """
    When I run `npx intl hola`
    Given a file `external/context.yaml`:
      """
      context: External
      inputs: {}
      """
    And a file `external/en-US.yaml`:
      """
      hi: Hello
      """
    And a file `external/index.ts`:
      """
      import { derived } from 'svelte/store'
      import { locale } from '$lib/intl'
      """
    When I run `npx intl import ext ./external`
    Then the file `external/built.js` contains:
      """
      /** @type {Record<import('#lib/intl/index.js').Locale, import('./types').Dictionary>} */
      """
    And the file `external/index.ts` contains:
      """
      import { locale } from '#lib/intl/index.js'
      """
