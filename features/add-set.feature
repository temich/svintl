Feature: Add and Set commands

  Scenario: Add command creates new key
    When I run `npx intl hola -p ./test-add`
    And I run `npx intl add example.hello "Hello world" -p ./test-add`
    Then the file `test-add/en-US.yaml` contains:
      """
      example:
        hello: Hello world
      """

  Scenario: Add command errors when key already exists
    When I run `npx intl hola -p ./test-add-exists`
    And I run `npx intl add example.hello "Hello world" -p ./test-add-exists`
    And I run `npx intl add example.hello "Hello again" -p ./test-add-exists`
    Then the output contains:
      """
      Key "example.hello" already exists
      """

  Scenario: Set command updates existing key
    When I run `npx intl hola -p ./test-set`
    And I run `npx intl add example.hello "Hello world" -p ./test-set`
    And I run `npx intl set example.hello "Hello updated" -p ./test-set`
    Then the file `test-set/en-US.yaml` contains:
      """
      example:
        hello: Hello updated
      """

  Scenario: Set command errors when key doesn't exist
    When I run `npx intl hola -p ./test-set-missing`
    And I run `npx intl set example.hello "Hello world" -p ./test-set-missing`
    Then the output contains:
      """
      Key "example.hello" does not exist
      """
