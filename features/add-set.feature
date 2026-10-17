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

  Scenario: Add many keys from a file
    Given a file `strings.yaml`:
      """
      example.hello: Hello world
      example.delete:
        value: Delete this record?
        context: confirmation before deleting a transaction
      example.greeting: Hello, {name}!
      foo/title: Admin dashboard
      """
    When I run `npx intl hola`
    And I run `npx intl create pt-BR`
    And I run `npx intl mount foo ./src/foo`
    And I run `npx intl add --from strings.yaml`
    Then the file `src/lib/intl/en-US.yaml` contains:
      """
      example:
        hello: Hello world
      """
    And the file `src/lib/intl/pt-BR.yaml` matches `^  delete: .+`
    And the file `src/lib/intl/pt-BR.yaml` matches `^    \(name\) =>`
    And the file `src/foo/pt-BR.yaml` matches `^title: .+`
    And the file `src/lib/intl/context.yaml` contains:
      """
          delete:
            input: Delete this record?
            context: confirmation before deleting a transaction
      """
    And the dictionaries typecheck

  Scenario: A batch with an existing key writes nothing
    Given a file `strings.yaml`:
      """
      example.hello: Hello again
      example.other: Something else
      """
    When I run `npx intl hola`
    And I run `npx intl add example.hello "Hello world"`
    And I run `npx intl add --from strings.yaml`
    Then the command fails
    And the output contains:
      """
      Key "example.hello" already exists
      """
    And the file `src/lib/intl/en-US.yaml` does not contain:
      """
      other
      """

  Scenario: A batch with a missing key sets nothing
    Given a file `strings.yaml`:
      """
      example.hello: Hello updated
      example.missing: Missing
      """
    When I run `npx intl hola`
    And I run `npx intl add example.hello "Hello world"`
    And I run `npx intl set --from strings.yaml`
    Then the command fails
    And the output contains:
      """
      Key "example.missing" does not exist
      """
    And the file `src/lib/intl/en-US.yaml` contains:
      """
      hello: Hello world
      """

  Scenario: Set many keys from stdin
    When I run `npx intl hola`
    And I run `npx intl add example.hello "Hello world"`
    And I run `echo 'example.hello: Hello updated' | npx intl set --from -`
    Then the file `src/lib/intl/en-US.yaml` contains:
      """
      hello: Hello updated
      """

  Scenario: Add takes either an entry or a file
    When I run `npx intl hola`
    And I run `npx intl add example.hello "Hello world" --from strings.yaml`
    Then the command fails
    And the output contains:
      """
      not both
      """
