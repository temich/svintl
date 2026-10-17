Feature: Sync command

  Scenario: Sync re-derives dir per target from target BCP-47
    When I run `npx intl hola`
    And I run `npx intl create ar-SA`
    And I modify `src/lib/intl/ar-SA.yaml` to update `dir` to `ltr`
    And I run `npx intl sync en-US`
    Then the file `src/lib/intl/ar-SA.yaml` contains:
      """
      dir: rtl
      """

  Scenario: Sync from RTL source does not propagate rtl to LTR targets
    When I run `npx intl hola`
    And I run `npx intl create ar-SA`
    And I run `npx intl sync ar-SA`
    Then the file `src/lib/intl/en-US.yaml` contains:
      """
      dir: ltr
      """

  Scenario: Sync writes no reserved keys into a mount
    When I run `npx intl hola`
    And I run `npx intl create pt-BR`
    And I run `npx intl mount foo ./src/foo`
    And I run `npx intl add foo/title "Admin dashboard"`
    And I run `npx intl sync en-US`
    Then the file `src/foo/pt-BR.yaml` matches `^title: .+`
    And the file `src/foo/pt-BR.yaml` does not contain:
      """
      native:
      """
    And the file `src/lib/intl/pt-BR.yaml` contains:
      """
      native: Português
      """
