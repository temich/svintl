import { execSync } from 'child_process'
import { When, Then } from '@cucumber/cucumber'
import { expect } from 'expect'

let output: string = ''

When(/I run `([^`]+)`/, function(command: string) {
  try {
    output = execSync(command, {
      encoding: 'utf8',
      cwd: process.cwd(),
    })
  } catch (error: any) {
    // Capture stderr as well for error cases
    output = (error.stdout || '') + (error.stderr || '')
    // Re-throw to fail the test if command fails
    throw error
  }
})

Then('the output contains:', function(docString: string) {
  expect(output).toContain(docString.trim())
})
