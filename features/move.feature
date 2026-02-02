Feature: Move command

  Scenario: Move simple string value within same partition
    When I run `npx intl hola -p ./test-move-simple`
    And I modify `test-move-simple/en-US.yaml` to add:
      """
      example:
        hello: Hello world
      """
    And I run `npx intl move example.hello example.greeting -p ./test-move-simple`
    Then the file `test-move-simple/en-US.yaml` contains:
      """
      example:
        greeting: Hello world
      """

  Scenario: Move pluralized value within same partition
    When I run `npx intl hola -p ./test-move-plural`
    And I modify `test-move-plural/en-US.yaml` to add:
      """
      items:
        count:
          - one: item
            other: items
      """
    And I run `npx intl move items.count products.count -p ./test-move-plural`
    Then the file `test-move-plural/en-US.yaml` contains:
      """
      products:
        count:
          - one: item
            other: items
      """

  Scenario: Move nested object within same partition
    When I run `npx intl hola -p ./test-move-nested`
    And I modify `test-move-nested/en-US.yaml` to add:
      """
      example:
        nested:
          value: Hello
          another: World
      """
    And I run `npx intl move example.nested renamed.nested -p ./test-move-nested`
    Then the file `test-move-nested/en-US.yaml` contains:
      """
      renamed:
        nested:
          value: Hello
          another: World
      """

  Scenario: Move simple string value across mounts
    When I run `npx intl hola -p ./test-move-mount-simple`
    And I modify `test-move-mount-simple/en-US.yaml` to add:
      """
      example:
        hello: Hello world
      """
    And I run `npx intl mount foo ./foo -p ./test-move-mount-simple`
    And I run `npx intl move example.hello foo/example.hello -p ./test-move-mount-simple`
    Then the file `foo/en-US.yaml` contains:
      """
      example:
        hello: Hello world
      """

  Scenario: Move pluralized value across mounts
    When I run `npx intl hola -p ./test-move-mount-plural`
    And I modify `test-move-mount-plural/en-US.yaml` to add:
      """
      items:
        count:
          - one: item
            other: items
      """
    And I run `npx intl mount foo ./foo -p ./test-move-mount-plural`
    And I run `npx intl move items.count foo/items.count -p ./test-move-mount-plural`
    Then the file `foo/en-US.yaml` contains:
      """
      items:
        count:
          - one: item
            other: items
      """

  Scenario: Move nested object across mounts
    When I run `npx intl hola -p ./test-move-mount-nested`
    And I modify `test-move-mount-nested/en-US.yaml` to add:
      """
      example:
        nested:
          value: Hello
          another: World
      """
    And I run `npx intl mount foo ./foo -p ./test-move-mount-nested`
    And I run `npx intl move example.nested foo/example.nested -p ./test-move-mount-nested`
    Then the file `foo/en-US.yaml` contains:
      """
      example:
        nested:
          value: Hello
          another: World
      """
