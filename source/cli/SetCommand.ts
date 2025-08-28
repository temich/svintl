/**
 * CLI command for adding new i18n entries with automatic translation
 * Translates entries to all available languages using OpenAI API
 *
 * @author claude-4-sonnet
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { join, resolve } from 'path'
import { load as yamlLoad, dump as yamlDump } from 'js-yaml'
import OpenAI from 'openai'
import { build } from './build'
import { ContextFileManager } from './context'

// OpenAI will be told the target is a language code

export class SetCommand {
  private contextManager = new ContextFileManager()

  private log(message: string): void {
    console.log(message)
  }

  private warn(message: string): void {
    console.warn(`⚠️  ${message}`)
  }

  private error(message: string): never {
    console.error(`❌ ${message}`)
    process.exit(1)
  }

  async execute(key: string, value: string, comment?: string, i18nPath = './src/lib/intl/'): Promise<void> {
    const commentText = comment ? ` (${comment})` : ''
    this.log(`Setting "${key}" with value "${value}"${commentText}...`)

    // Store input and context in context.yaml first (before API key check)
    try {
      this.contextManager.setContextEntry(i18nPath, key, value, comment)
      this.log(`✓ Saved input and context to context.yaml`)
    } catch (error) {
      this.warn(`Failed to save context: ${error}`)
    }

    if (!process.env.OPENAI_API_KEY)
      this.error('OPENAI_API_KEY environment variable is required')

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })

    // Get all language files
    const i18nDir = resolve(process.cwd(), i18nPath)

    const languageFiles = readdirSync(i18nDir)
      .filter(file => file.match(/^[a-z]{2}\.yaml$/))

    // Get all target languages
    const allLanguages = languageFiles.map(file => file.replace('.yaml', ''))

    this.log(`Translating to ${allLanguages.length} languages...`)

    // Translate to all languages
    const translations: Record<string, string> = {}

    try {
      const contextPrompt = comment
        ? `Context: ${comment}\n\nText to translate: ${value}`
        : value

      const completion = await openai.chat.completions.create({
        model: 'gpt-4.1',
        messages: [
          {
            role: 'system',
            content: `You are a professional translator for an internationalization system. You will receive text in ANY language and must translate it to ALL specified target languages.

IMPORTANT RULES:
1. DETECT the input language automatically - do not assume it's English
2. If the input starts with "!js", it's a JavaScript function that returns localized strings
3. For !js functions: Keep the "!js" tag but ADAPT the JavaScript logic to match each target language's grammar rules
4. You can modify conditions, logic, and structure to fit each target language's pluralization and grammar rules
5. For regular text: Translate from the detected source language to each target language
6. Always maintain the exact same function parameters (don't change parameter names or count)
7. Use DOUBLE QUOTES for all string literals to avoid JavaScript syntax errors
8. Translate ALL parts of compound phrases completely
9. Return translations in JSON format as requested

GRAMMAR ADAPTATION EXAMPLES (any source language):

Source language to Russian (any → complex pluralization):
Input: "!js\\n(count) => count === 1 ? 'one item' : \`\${count} items\`"
Russian: "!js\\n(count) => { const rem = count % 10; const tens = Math.floor(count / 10) % 10; if (tens === 1) return \`\${count} предметов\`; if (rem === 1) return \`\${count} предмет\`; if (rem >= 2 && rem <= 4) return \`\${count} предмета\`; return \`\${count} предметов\`; }"

Source language to German (any → simple pluralization):
Input: "!js\\n(count) => count === 1 ? 'une chose' : \`\${count} choses\`" (French)
German: "!js\\n(count) => count === 1 ? \"1 Ding\" : \`\${count} Dinge\`"

Russian to other languages (complex → simpler pluralization):
Input: "!js\\n(count) => { const rem = count % 10; if (rem === 1) return '1 предмет'; return \`\${count} предметов\`; }"
English: "!js\\n(count) => count === 1 ? \"1 item\" : \`\${count} items\`"
French: "!js\\n(count) => count === 1 ? \"1 article\" : \`\${count} articles\`"

CRITICAL: 
- Automatically detect the source language from input text
- Always use double quotes (") for string literals in JavaScript, never single quotes (')
- For !js functions, ALWAYS include the "!js" tag at the beginning of each translation
- Escape quotes properly in JSON: use \\" for literal quotes in the function
- ADAPT the logic to match each target language's grammar, don't just translate strings
- Keep the same function parameters but change conditions and return values as needed

Target languages: ${allLanguages.join(', ')}

Return ONLY a JSON object with language codes as keys and translations as values. 

For regular text:
{
  "de": "German translation",
  "fr": "French translation"
}

For !js functions:
{
  "de": "!js\\n(count) => count === 1 ? \\"1 Artikel\\" : \`\${count} Artikel\`",
  "fr": "!js\\n(count) => count === 1 ? \\"1 article\\" : \`\${count} articles\`"
}`,
          },
          {
            role: 'user',
            content: contextPrompt,
          },
        ],
        max_tokens: 2000,
        temperature: 0.1,
      })

      const response = completion.choices[0]?.message?.content?.trim()

      if (response) {
        try {
          // Parse the JSON response
          const parsedTranslations = JSON.parse(response)

          // Validate and collect translations for all languages
          for (const lang of allLanguages) {
            if (parsedTranslations[lang]) {
              translations[lang] = parsedTranslations[lang]
              this.log(`✓ Translated to ${lang}`)
            } else {
              this.warn(`No translation received for ${lang}, using original value as fallback`)
              translations[lang] = value // fallback to original value
            }
          }
        } catch (parseError) {
          this.warn(`Failed to parse OpenAI response as JSON: ${parseError}`)
          this.warn(`Response was: ${response}`)

          // Fallback to original value for all languages
          for (const lang of allLanguages) {
            translations[lang] = value
          }
        }
      } else {
        this.warn('No response from OpenAI, using original value fallback for all languages')

        // Fallback to original value for all languages
        for (const lang of allLanguages) {
          translations[lang] = value
        }
      }
    } catch (error) {
      this.warn(`Translation request failed: ${error}`)
      this.log('Using original value fallback for all languages')

      // Fallback to original value for all languages
      for (const lang of allLanguages) {
        translations[lang] = value
      }
    }

    // Update all language files
    for (const file of languageFiles) {
      const lang = file.replace('.yaml', '')
      const filePath = join(i18nDir, file)

      try {
        this.updateLanguageFile(filePath, key, translations[lang])
        this.log(`✓ Updated ${file}`)
      } catch (error) {
        this.error(`Failed to update ${file}: ${error}`)
      }
    }

    this.log(`✅ Successfully set "${key}" in all language files`)

    // Auto-build dictionaries
    build(i18nPath)
  }

  private updateLanguageFile(filePath: string, key: string, value: string): void {
    // Read and parse YAML file
    const content = readFileSync(filePath, 'utf8')
    const yamlData = yamlLoad(content) as any

    // Parse the key path and set the value
    const keyParts = key.split('.')
    let current = yamlData

    // Navigate to the parent object
    for (let i = 0; i < keyParts.length - 1; i++) {
      const part = keyParts[i]

      if (!current[part])
        current[part] = {}

      current = current[part]
    }

    // Set the final key
    const finalKey = keyParts[keyParts.length - 1]

    current[finalKey] = value

    // Write back to file in YAML format
    writeFileSync(filePath, yamlDump(yamlData, {
      lineWidth: -1, // Prevent line wrapping
      quotingType: '"', // Use double quotes
      forceQuotes: false, // Only quote when necessary
    }))
  }
}
