Feature: Import command

  Scenario: Error when directory has no context.yaml
    When I run `npx intl hola`
    And I run `npx intl import ext ./external`
    Then the output contains:
      """
      ❌
      """

  Scenario: Error when mount name already registered
    When I run `npx intl hola`
    Given a file `external/context.yaml`:
      """
      context: External
      inputs: {}
      """
    When I run `npx intl import ext ./external`
    And I run `npx intl import ext ./external`
    Then the output contains:
      """
      Mount 'ext' already exists
      """

  Scenario: Import an external mount and reconcile its locales
    When I run `npx intl hola`
    And I run `npx intl create ru-RU`
    Given a file `external/context.yaml`:
      """
      context: External greeting module
      inputs:
        greeting:
          hi:
            input: Hello
            context: a friendly greeting
      """
    And a file `external/en-US.yaml`:
      """
      greeting:
        hi: Hello
      """
    And a file `external/fr-FR.yaml`:
      """
      greeting:
        hi: Bonjour
      """
    When I run `npx intl import ext ./external`
    Then the file `src/lib/intl/context.yaml` contains:
      """
      ext: ../../../external
      """
    And the file `external/fr-FR.yaml` does not exist
    And the file `external/ru-RU.yaml` contains:
      """
      greeting:
        hi:
      """
    And the file `external/ru-RU.yaml` does not contain:
      """
      hi: Hello
      """
    And the file `external/ru-RU.yaml` does not contain:
      """
      native:
      """
    And the file `external/en-US.yaml` contains:
      """
      hi: Hello
      """
    And the file `external/built.js` contains:
      """
      "en-US": {
          "greeting": {
            "hi": "Hello"
          }
        }
      """
    And the file `external/built.js` contains:
      """
      "ru-RU": {
          "greeting": {
            "hi":
      """
