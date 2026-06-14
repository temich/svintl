import { execSync, spawn, type ChildProcess } from 'child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { strict as assert } from 'node:assert'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { When, Then, Given, Before, After } from '@cucumber/cucumber'
import dotenv from 'dotenv'
import * as YAML from 'js-yaml'

dotenv.config()

let output: string = ''
let cwd: string = ''

let openServer: ChildProcess | null = null
let openExited: Promise<void> | null = null
let openPort = 0
let openPage = ''
let openSaveResponse: any = null

Before(function() {
  // Create a new temp directory for each scenario
  cwd = mkdtempSync(join(tmpdir(), 'intl-test-'))
  openServer = null
  openExited = null
  openPort = 0
  openPage = ''
  openSaveResponse = null
})

After(function() {
  if (openServer && openServer.exitCode === null)
    openServer.kill()
})

async function waitForOpenServer(port: number, timeoutMs = 15000): Promise<string> {
  const start = Date.now()

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`)

      if (res.ok)
        return await res.text()
    } catch {
      // server not ready yet
    }

    await new Promise(resolve => setTimeout(resolve, 150))
  }

  throw new Error(`open server did not start on port ${port}`)
}

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

When(/I open the editor with `([^`]+)` on port (\d+)/, async function(args: string, portStr: string) {
  openPort = Number(portStr)

  const cliArgs = args.split(' ').filter(Boolean)

  openServer = spawn('npx', ['intl', 'open', ...cliArgs, '--port', portStr], {
    cwd,
    env: { ...process.env, INTL_OPEN_NO_BROWSER: '1' },
    stdio: 'ignore',
  })

  openExited = new Promise(resolve => openServer!.on('close', () => resolve()))
  openPage = await waitForOpenServer(openPort)
})

Then('the editor page contains:', function(expected: string) {
  assert(openPage.includes(expected.trim()), `editor page does not include:\n${expected.trim()}`)
})

Then('the editor page does not contain:', function(unexpected: string) {
  assert(!openPage.includes(unexpected.trim()), `editor page unexpectedly includes:\n${unexpected.trim()}`)
})

When('I save the editor with no changes', async function() {
  const res = await fetch(`http://127.0.0.1:${openPort}/api/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ changes: [] }),
  })

  openSaveResponse = await res.json()
  await openExited
})

Then('the editor save succeeds', function() {
  assert(openSaveResponse && openSaveResponse.ok === true, `save did not succeed: ${JSON.stringify(openSaveResponse)}`)
})

Then(/the editor saved (\d+) change\(s\)/, function(count: string) {
  assert.equal(openSaveResponse.saved, Number(count))
})

Then('the editor server has stopped', function() {
  assert(openServer && openServer.exitCode !== null, 'editor server is still running')
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
