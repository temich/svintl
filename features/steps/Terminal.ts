import { execSync } from 'child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { strict as assert } from 'node:assert'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { When, Then, Given, Before } from '@cucumber/cucumber'
import dotenv from 'dotenv'
import * as YAML from 'js-yaml'

dotenv.config()

let output: string = ''
let cwd: string = ''

Before(function() {
  // Create a new temp directory for each scenario
  cwd = mkdtempSync(join(tmpdir(), 'intl-test-'))
})

Given(/a file `([^`]+)`:/, function(rel: string, content: string) {
  const path = join(cwd, rel)

  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
})

Then(/the file `([^`]+)` does not exist/, function(rel: string) {
  assert(!existsSync(join(cwd, rel)), `${rel} should not exist`)
})

Then(/the file `([^`]+)` does not contain:/, function(rel: string, unexpected: string) {
  const content = readFileSync(join(cwd, rel), 'utf8')

  assert(!content.includes(unexpected.trim()), `${rel} unexpectedly includes:\n${unexpected.trim()}`)
})

When(/I run `([^`]+)`/, function(command: string) {
  try {
    output = execSync(command, {
      encoding: 'utf8',
      cwd,
    })
  } catch (error: any) {
    output = (error.stdout || '') + (error.stderr || '')
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

  if (!content.includes(expected.trim())) {
    console.error('\n------------ EXPECTED ------------')
    console.error(expected.trim())
    console.error('\n------------ ACTUAL ------------')
    console.error(content)

    throw new Error(`${rel} does not include expected content`)
  }
})

When(/I modify `([^`]+)` to update `([^`]+)` to `([^`]+)`/, function(file: string, key: string, value: string) {
  const path = join(cwd, file)
  const content = readFileSync(path, 'utf8')
  const data = YAML.load(content) as any

  data[key] = value

  const updatedContent = YAML.dump(data)

  writeFileSync(path, updatedContent)
})

When(/I modify `([^`]+)` to add:/, function(file: string, yamlContent: string) {
  const path = join(cwd, file)
  const content = readFileSync(path, 'utf8')
  const data = YAML.load(content) as any
  const newData = YAML.load(yamlContent) as any

  // Merge the new data into existing data
  Object.assign(data, newData)

  const updatedContent = YAML.dump(data)

  writeFileSync(path, updatedContent)
})
