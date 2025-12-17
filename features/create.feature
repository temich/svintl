Feature: Create command

  Scenario: Add locale
    When I run `npx intl hola`
    And I run `npx intl set example.hello "Hello world"`
    And I run `npx intl create es-ES`
    Then the file `src/lib/intl/es-ES.yaml` contains:
      """
      native: Español
      locale: es-ES
      example:
        hello: Hola mundo
      """

  Scenario: Add locale to mount
    When I run `npx intl hola`
    And I run `npx intl mount foo src/foo/intl`
    Then the file `src/lib/intl/context.yaml` contains:
      """
      mounts:
        foo: ../../foo/intl
      """
    When I run `npx intl set foo/hello "Hello world"`
    Then the file `src/foo/intl/en-US.yaml` contains:
      """
      native: English
      locale: en-US
      hello: Hello world
      """
    When I run `npx intl create es-ES`
    Then the file `src/foo/intl/es-ES.yaml` contains:
      """
      native: Español
      locale: es-ES
      hello: Hola mundo
      """