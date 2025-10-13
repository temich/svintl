Feature: Help

  Scenario: Print help
    When I run `npx intl help`
    Then the output contains:
        """
        Usage: intl <command> [options]

        Commands:
        """
