Feature: Open command
  As a developer
  I want to edit my dictionary in the browser
  So that I can review and update translations interactively

  Scenario: Render a sub-tree as an editable page
    When I run `npx intl hola -p ./test-open-tree`
    And I modify `test-open-tree/en-US.yaml` to add:
      """
      example:
        hello: Hello world
        bye: Goodbye
      """
    And I open the editor with `example -p ./test-open-tree` on port 4711
    Then the editor page contains:
      """
      example.hello
      """
    And the editor page contains:
      """
      Hello world
      """
    And the editor page contains:
      """
      Goodbye
      """
    When I save the editor with no changes
    Then the editor save succeeds
    And the editor saved 0 change(s)
    And the editor server has stopped

  Scenario: Hide plural and js entries
    When I run `npx intl hola -p ./test-open-hide`
    And I modify `test-open-hide/en-US.yaml` to add:
      """
      example:
        hello: Hello world
      items:
        count:
          - one: item
            other: items
      formatName: |
        !js
        (name) => `Hi ${name}`
      """
    And I open the editor with ` -p ./test-open-hide` on port 4714
    Then the editor page contains:
      """
      example.hello
      """
    And the editor page does not contain:
      """
      items.count
      """
    And the editor page does not contain:
      """
      formatName
      """
    When I save the editor with no changes
    Then the editor save succeeds

  Scenario: Open a single entry
    When I run `npx intl hola -p ./test-open-single`
    And I modify `test-open-single/en-US.yaml` to add:
      """
      example:
        hello: Hello world
      """
    And I open the editor with `example.hello -p ./test-open-single` on port 4712
    Then the editor page contains:
      """
      example.hello
      """
    When I save the editor with no changes
    Then the editor save succeeds

  Scenario: Pre-fill per-field context
    When I run `npx intl hola -p ./test-open-ctx`
    And I modify `test-open-ctx/en-US.yaml` to add:
      """
      example:
        hello: Hello world
      """
    And a file `test-open-ctx/context.yaml`:
      """
      inputs:
        example:
          hello:
            input: Hello world
            context: greeting on the homepage
      """
    And I open the editor with `example -p ./test-open-ctx` on port 4716
    Then the editor page contains:
      """
      greeting on the homepage
      """
    When I save the editor with no changes
    Then the editor save succeeds

  Scenario: Open a whole mount
    When I run `npx intl hola -p ./test-open-mount`
    And I run `npx intl mount foo ./foo -p ./test-open-mount`
    And a file `foo/en-US.yaml`:
      """
      greeting: Hi there
      """
    And I open the editor with `foo/ -p ./test-open-mount` on port 4713
    Then the editor page contains:
      """
      Hi there
      """
    When I save the editor with no changes
    Then the editor save succeeds
