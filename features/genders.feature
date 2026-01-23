Feature: Genders setting

  Scenario: Enable grammatical gender support
    When I run `npx intl hola -p ./test`
    And I run `npx intl genders true -p ./test`
    Then the file `test/context.yaml` contains:
      """
      genders: true
      """
