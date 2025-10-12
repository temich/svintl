import { execSync } from 'child_process'
import { mkdtempSync, readdirSync, readFileSync } from 'fs'
import { strict as assert } from 'node:assert'
import { tmpdir } from 'os'
import { join } from 'path'
import { When, Then, Before } from '@cucumber/cucumber'
import dotenv from 'dotenv'
import * as YAML from 'js-yaml'

dotenv.config()

let output: string = ''
let cwd: string = ''

Before(function() {
  // Create a new temp directory for each scenario
  cwd = mkdtempSync(join(tmpdir(), 'intl-test-'))
})

When(/I run `([^`]+)`/, function(command: string) {
  try {
    output = execSync(command, {
      encoding: 'utf8',
      cwd,
    })
  } catch (error: any) {
    output = (error.stdout || '') + (error.stderr || '')
    throw error
  }
})

Then('the output contains:', function(expected: string) {
  assert(output.includes(expected))
})

Then(/the directory `([^`]+)` contains:/, function(dir: string, yaml: string) {
  const fullPath = join(cwd, dir)
  const files = readdirSync(fullPath)
  const expected = YAML.load(yaml) as string[]

  for (const expectedFile of expected)
    assert(files.includes(expectedFile))
})

Then(/the file `([^`]+)` contains:/, function(rel: string, expected: string) {
  const path = join(cwd, rel)
  const content = readFileSync(path, 'utf8')

  assert(content.includes(expected))
})
