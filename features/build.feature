Feature: Build

  Scenario: Build
    When I run `intl hola -p ./test`
    And I run `intl set hello "Hello" -p ./test`
    And I run `intl create ru-RU -p ./test`
    Then the directory `test` contains:
      """
      - en-US.yaml
      - ru-RU.yaml
      - built.js
      - types.ts
      - index.ts
      """
    And the file `test/en-US.yaml` contains:
      """
      hello: Hello
      """
    And the file `test/ru-RU.yaml` contains:
      """
      hello: Здравствуйте
      """
    When I modify `test/en-US.yaml` to update `hello` to `Hello2`
    Then the file `test/en-US.yaml` contains:
      """
      hello: Hello2
      """
    When I run `intl build -p ./test`
    And the directory `test` contains:
      """
      - en-US.yaml
      - ru-RU.yaml
      - built.js
      - types.ts
      - index.ts
      """
    And the file `test/built.js` contains:
      """
      export const dictionaries = {
        "en-US": {
          "native": "English",
          "locale": "en-US",
          "hello": "Hello2"
        },
        "ru-RU": {
          "native": "Русский",
          "locale": "ru-RU",
          "hello": "Здравствуйте"
        }
      };

      export const locales = ["en-US","ru-RU"];
      """
    When I run `intl mount foo ./test-foo/foo -p ./test`
    And I run `intl set foo/hello "Hello" -p ./test`
    Then the directory `test-foo/foo` contains:
      """
      - en-US.yaml
      - ru-RU.yaml
      - built.js
      - types.ts
      - index.ts
      """
    And the file `test-foo/foo/en-US.yaml` contains:
      """
      hello: Hello
      """
    And the file `test-foo/foo/ru-RU.yaml` contains:
      """
      hello: Здравствуйте
      """
    And the file `test-foo/foo/built.js` contains:
      """
      export const dictionaries = {
        "en-US": {
          "hello": "Hello"
        },
        "ru-RU": {
          "hello": "Здравствуйте"
        }
      };

      export const locales = ["en-US","ru-RU"];
      """
    When I modify `test-foo/foo/en-US.yaml` to update `hello` to `Hello2`
    Then the file `test-foo/foo/en-US.yaml` contains:
      """
      hello: Hello2
      """
    When I run `intl build -p ./test`
    And the file `test-foo/foo/built.js` contains:
      """
      export const dictionaries = {
        "en-US": {
          "hello": "Hello2"
        },
        "ru-RU": {
          "hello": "Здравствуйте"
        }
      };

      export const locales = ["en-US","ru-RU"];
      """