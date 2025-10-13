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
