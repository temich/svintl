Feature: Hola command

  Scenario: Create a dictionary project
    When I run `npx intl hola`
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

  Scenario: Create a dictionary project with given path and using JavaScript
    When I run `npx intl hola --js -p ./intl`
    Then the directory `intl` contains:
      """yaml
      - en-US.yaml
      - built.js
      - types.ts
      - index.js
      """
    And the file `intl/en-US.yaml` contains:
      """yaml
      native: English
      locale: en-US
      """
