Feature: Output-token limit

  Scenario: A translation within the limit succeeds
    When I run `npx intl hola -p ./test`
    And I run `npx intl add hello "Hello" --tokens 20000 -p ./test`
    Then the file `test/en-US.yaml` contains:
      """
      hello: Hello
      """

  Scenario: Add reports a response truncated at the limit
    When I run `npx intl hola -p ./test`
    And I run `npx intl add bye "Goodbye, see you tomorrow at the usual place" --tokens 16 -p ./test`
    Then the output contains:
      """
      exceeded the 16 output-token limit; raise it with --tokens
      """
    And the file `test/en-US.yaml` does not contain:
      """
      bye:
      """

  Scenario: Add reports a request OpenAI refuses at the limit
    When I run `npx intl hola -p ./test`
    And I run `npx intl add bye "Goodbye" --tokens 1 -p ./test`
    Then the output contains:
      """
      exceeded the 1 output-token limit; raise it with --tokens
      """

  Scenario: Create reports a batch truncated at the limit
    When I run `npx intl hola -p ./test`
    And I run `npx intl add bye "Goodbye, see you tomorrow at the usual place" -p ./test`
    And I run `npx intl create de-DE --tokens 16 -p ./test`
    Then the output contains:
      """
      exceeded the 16 output-token limit; raise it with --tokens
      """

  Scenario: The limit must be a positive integer
    When I run `npx intl build --tokens 0 -p ./test`
    Then the output contains:
      """
      --tokens must be a positive integer
      """
