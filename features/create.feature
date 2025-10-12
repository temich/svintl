Feature: Create command

  Scenario: Add locale
    When I run `intl hola`
    And I run `intl set example.hello "Hello world"`
    And I run `intl create es-ES`
    Then the file `src/lib/intl/es-ES.yaml` contains:
      """
      example:
        hello: Hola mundo
      """
