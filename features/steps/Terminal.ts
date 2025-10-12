import { execSync } from 'child_process'
import { mkdtempSync, readdirSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { When, Then, Before } from '@cucumber/cucumber'
import { expect } from 'expect'

let output: string = ''
let tempDir: string = ''

Before(function() {
  // Create a new temp directory for each scenario
  tempDir = mkdtempSync(join(tmpdir(), 'intl-test-'))
})

When(/I run `([^`]+)`/, function(command: string) {
  try {
    output = execSync(command, {
      encoding: 'utf8',
      cwd: tempDir,
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

Then(/the directory `([^`]+)` contains:/, function(dirPath: string, docString: string) {
  const fullPath = join(tempDir, dirPath)
  const files = readdirSync(fullPath)
  const expectedFiles = docString.trim().split('\n').map(line => line.trim().replace(/^-\s*/, '')).filter(line => line.length > 0)

  for (const expectedFile of expectedFiles)
    expect(files).toContain(expectedFile)
})

Then(/the file `([^`]+)` contains:/, function(filePath: string, docString: string) {
  const fullPath = join(tempDir, filePath)
  const content = readFileSync(fullPath, 'utf8')

  expect(content).toContain(docString.trim())
})
