Feature: Hola command

  Scenario: Create a dictionary project
    When I run `intl hola`
    Then the directory `src/lib/intl` contains:
      """yaml
      - en-US.yaml
      - built.js
      - types.ts
      - index.ts
      """
    And the file `src/lib/intl/en-US.yaml` contains:
      """yaml
      native: English
      locale: en-US
      """
