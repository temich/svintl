Feature: Locales across mounts

  Background:
    Given a file `src/@/accounts/ui/intl/context.yaml`:
      """
      inputs:
        title:
          input: Accounts
      """
    And a file `src/@/accounts/ui/intl/en-US.yaml`:
      """
      title: Accounts
      at: |
        !js
        (time) => `at ${time}`
      items:
        - one: "{n} item"
          other: "{n} items"
      """
    When I run `npx intl hola`
    And I run `npx intl add greeting "Hello"`
    And I run `npx intl import accounts src/@/accounts/ui/intl`

  Scenario: Create a locale in mounts with their own keys only
    When I run `npx intl create pt-BR`
    Then the file `src/@/accounts/ui/intl/pt-BR.yaml` matches `^title: `
    And the file `src/@/accounts/ui/intl/pt-BR.yaml` matches `^  - (one|other): `
    And the file `src/@/accounts/ui/intl/pt-BR.yaml` does not contain:
      """
      native:
      """
    And the file `src/@/accounts/ui/intl/pt-BR.yaml` does not contain:
      """
      locale:
      """
    And the file `src/@/accounts/ui/intl/built.js` contains:
      """
      "at": /** @type {(value: any) => string} */ ((time) => `at ${time}`)
      """
    And the dictionaries typecheck

  Scenario: Destroy a locale in every mount
    When I run `npx intl create ar-SA`
    And I run `npx intl destroy ar-SA -y`
    Then the file `src/@/accounts/ui/intl/ar-SA.yaml` does not exist
    And the file `src/@/accounts/ui/intl/built.js` does not contain:
      """
      ar-SA
      """
    And the dictionaries typecheck

  Scenario: Build a mount for the root locales only
    Given a file `src/@/accounts/ui/intl/ar-SA.yaml`:
      """
      title: الحسابات
      """
    When I run `npx intl build`
    Then the file `src/@/accounts/ui/intl/built.js` does not contain:
      """
      ar-SA
      """
    And the dictionaries typecheck

  Scenario: Destroy without confirmation outside a terminal
    When I run `npx intl create de-DE`
    And I run `npx intl destroy de-DE`
    Then the command fails
    And the output contains:
      """
      -y
      """
    And the file `src/lib/intl/de-DE.yaml` matches `^locale: de-DE$`
