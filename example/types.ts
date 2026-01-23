/**
 * Auto-generated TypeScript definitions for i18n dictionaries
 *
 * @author copilot
 */

export type Locale = 'en-US' | 'ru-RU'

export type Grammar = 'he' | 'she' | 'none'

export type Dictionary = {
      native: string
      hello: string
      bye: string
      example: {
        hello: string
      }
      items: {
        count: {
          0: {
            one: string
            other: string
          }
        }
      }
      product: {
        count: {
          0: {
            one: string
            other: string
          }
        }
      }
      buttons: {
        catalog: string
      }
      test: (value: number) => string
      formatName: (...args: [any, any]) => string
      ran: (...args: [any, any]) => string
    }
