Feature: Create command

  Scenario: Add locale
    When I run `npx intl hola`
    And I run `npx intl add example.hello "Hello world"`
    And I run `npx intl create es-ES`
    Then the file `src/lib/intl/es-ES.yaml` contains:
      """
      native: Español
      locale: es-ES
      dir: ltr
      example:
        hello: Hola mundo
      """

  Scenario: Create RTL locale
    When I run `npx intl hola`
    And I run `npx intl create ar-SA`
    Then the file `src/lib/intl/ar-SA.yaml` contains:
      """
      dir: rtl
      """

  Scenario: Create LTR locale
    When I run `npx intl hola`
    And I run `npx intl create de-DE`
    Then the file `src/lib/intl/de-DE.yaml` contains:
      """
      dir: ltr
      """
