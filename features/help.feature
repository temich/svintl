Feature: Help

  Scenario: Print help
    When I run `intl help`
    Then the output contains:
        """
        Usage: intl <command> [options]

        Commands:
        """
