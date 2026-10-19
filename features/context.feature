Feature: Context of a mount

  Scenario: Const keeps the other inputs and the context of a mount
    When I run `npx intl hola`
    And I run `npx intl mount foo ./src/foo`
    And I run `npx intl const foo/title "Dashboard"`
    Given a file `src/foo/context.yaml`:
      """
      context: an admin dashboard
      inputs:
        title:
          input: Dashboard
          context: page title
      """
    When I run `npx intl const foo/probe "Probe"`
    Then the file `src/foo/context.yaml` contains:
      """
      context: an admin dashboard
      inputs:
        title:
          input: Dashboard
          context: page title
        probe:
          input: Probe
      """

  Scenario: Const refuses a mount whose context is not valid YAML
    When I run `npx intl hola`
    And I run `npx intl mount foo ./src/foo`
    And I run `npx intl const foo/title "Dashboard"`
    Given a file `src/foo/context.yaml`:
      """
      context: an admin dashboard
      inputs:
        title:
          input: Dashboard
          context: page title: the first thing seen
      """
    When I run `npx intl const foo/probe "Probe"`
    Then the command fails
    And the output contains:
      """
      src/foo/context.yaml
      """
    And the file `src/foo/context.yaml` contains:
      """
          context: page title: the first thing seen
      """
    And the file `src/foo/en-US.yaml` does not contain:
      """
      probe
      """
