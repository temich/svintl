Feature: Add and Set commands

  Scenario: Add command creates new entry
    When I run `npx intl hola -p ./test`
    And I run `npx intl const test.greeting "Hello" -p ./test`
    Then the file `test/en-US.yaml` contains:
      """
      test:
        greeting: Hello
      """

  Scenario: Add command fails when key already exists
    When I run `npx intl hola -p ./test`
    And I run `npx intl const test.greeting "Hello" -p ./test`
    And I run `npx intl add test.greeting "Hi" -p ./test` and it fails
    Then the output contains:
      """
      Key "test.greeting" already exists. Use 'set' to update existing keys.
      """

  Scenario: Set command updates existing entry
    When I run `npx intl hola -p ./test`
    And I run `npx intl const test.greeting "Hello" -p ./test`
    And I run `npx intl const test.greeting "Hi" -p ./test`
    Then the file `test/en-US.yaml` contains:
      """
      test:
        greeting: Hi
      """

  Scenario: Set command fails when key does not exist
    When I run `npx intl hola -p ./test`
    And I run `npx intl set test.missing "Value" -p ./test` and it fails
    Then the output contains:
      """
      Key "test.missing" does not exist. Use 'add' to create new keys.
      """
