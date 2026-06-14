/**
 * CLI command that opens a local web server with a no-framework browser UI
 * for interactively editing a dictionary, a sub-tree, a single entry, or a mount.
 * Saving runs the same translate-to-all pipeline as the `set` command.
 *
 * @author copilot
 */

import { createServer } from 'http'
import { spawn } from 'child_process'
import { readFileSync } from 'fs'
import { join } from 'path'
import { load as yamlLoad, dump as yamlDump } from 'js-yaml'
import { TranslationService } from './TranslationService'
import { SetCommand } from './SetCommand'
import { parsePartitionedKey } from './partition'
import { logger } from './logger'

interface OpenOptions {
  locale?: string
  port?: number
}

interface Leaf {
  key: string
  value: string
}

const META_KEYS = ['native', 'locale', 'dir']

export class OpenCommand {
  private translationService = new TranslationService()

  async execute(target: string | undefined, i18nPath = './src/lib/intl/', options: OpenOptions = {}): Promise<void> {
    const port = options.port ?? 4567

    // Parse the target into partition + dot key. An empty/undefined target
    // means the whole (root) dictionary. `mount/` yields key === ''.
    const { partition, key } = parsePartitionedKey(target ?? '')

    const { allLocales, i18nDir } = this.translationService.getLocaleInfo(i18nPath, partition)

    if (allLocales.length === 0)
      logger.error(`No locale files found in ${i18nDir}`)

    const locale = this.resolveLocale(options.locale, allLocales)
    const localeFilePath = join(i18nDir, `${locale}.yaml`)

    const root = yamlLoad(readFileSync(localeFilePath, 'utf8')) as any
    const node = key ? this.navigate(root, key) : root

    if (node === undefined || node === null)
      logger.error(`Key "${key}" not found in locale "${locale}"`)

    const leaves = this.flatten(node, key)

    if (leaves.length === 0)
      logger.error(`Nothing editable found at "${target ?? '(root)'}" in locale "${locale}"`)

    const title = target ? target : '(root)'
    const html = this.renderHtml({ title, locale, partition, leaves })

    await this.serve(html, leaves, partition, i18nPath, port, locale)
  }

  private resolveLocale(requested: string | undefined, allLocales: string[]): string {
    if (requested) {
      if (!allLocales.includes(requested))
        logger.error(`Locale "${requested}" not found. Available: ${allLocales.join(', ')}`)
      return requested
    }

    if (allLocales.includes('en-US'))
      return 'en-US'

    return allLocales[0]
  }

  private navigate(root: any, key: string): any {
    let current = root
    for (const part of key.split('.')) {
      if (current && typeof current === 'object' && part in current)
        current = current[part]
      else
        return undefined
    }
    return current
  }

  private flatten(node: any, prefix: string): Leaf[] {
    const leaves: Leaf[] = []
    this.collect(node, prefix, leaves)
    return leaves
  }

  private collect(node: any, prefix: string, leaves: Leaf[]): void {
    if (typeof node === 'string') {
      leaves.push({ key: prefix, value: node })
      return
    }

    if (Array.isArray(node)) {
      // Plural form arrays (e.g. [{ one, other }]) are serialized verbatim.
      leaves.push({ key: prefix, value: yamlDump(node).trimEnd() })
      return
    }

    if (node && typeof node === 'object') {
      for (const [childKey, childValue] of Object.entries(node)) {
        // Skip locale metadata at the root level.
        if (prefix === '' && META_KEYS.includes(childKey))
          continue
        const childPrefix = prefix ? `${prefix}.${childKey}` : childKey
        this.collect(childValue, childPrefix, leaves)
      }
      return
    }

    if (node !== undefined && node !== null)
      leaves.push({ key: prefix, value: String(node) })
  }

  private serve(html: string, leaves: Leaf[], partition: string | undefined, i18nPath: string, port: number, locale: string): Promise<void> {
    const original = new Map(leaves.map(leaf => [leaf.key, leaf.value]))

    return new Promise((resolve) => {
      const server = createServer((req, res) => {
        if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(html)
          return
        }

        if (req.method === 'GET' && req.url === '/favicon.ico') {
          res.writeHead(204)
          res.end()
          return
        }

        if (req.method === 'POST' && req.url === '/api/save') {
          let body = ''
          req.on('data', chunk => { body += chunk })
          req.on('end', async () => {
            try {
              const payload = JSON.parse(body || '{}') as { changes?: Leaf[] }
              const changes = (payload.changes ?? []).filter(c => original.get(c.key) !== c.value)

              await this.applyChanges(changes, partition, i18nPath)

              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ok: true, saved: changes.length }))
              logger.log(`Saved ${changes.length} change(s) from "${locale}".`)
            } catch (error: any) {
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ok: false, error: String(error?.message ?? error) }))
            } finally {
              server.close(() => resolve())
            }
          })
          return
        }

        res.writeHead(404)
        res.end()
      })

      server.listen(port, '127.0.0.1', () => {
        const url = `http://127.0.0.1:${port}/`
        logger.log(`Editing "${locale}" at ${url} — opening browser…`)
        this.openBrowser(url)
      })
    })
  }

  private async applyChanges(changes: Leaf[], partition: string | undefined, i18nPath: string): Promise<void> {
    const setCommand = new SetCommand()
    for (const change of changes) {
      const fullKey = partition ? `${partition}/${change.key}` : change.key
      await setCommand.execute(fullKey, change.value, undefined, i18nPath)
    }
  }

  private openBrowser(url: string): void {
    if (process.env.INTL_OPEN_NO_BROWSER)
      return

    const platform = process.platform
    const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open'
    const args = platform === 'win32' ? ['', url] : [url]
    try {
      const child = spawn(command, args, { stdio: 'ignore', detached: true, shell: platform === 'win32' })
      child.unref()
    } catch {
      logger.warn(`Could not open the browser automatically. Visit ${url}`)
    }
  }

  private renderHtml(data: { title: string, locale: string, partition?: string, leaves: Leaf[] }): string {
    const json = JSON.stringify(data).replace(/</g, '\\u003c')
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>intl open — ${escapeHtml(data.title)}</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { font: 14px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; padding: 0 0 96px; }
  header { position: sticky; top: 0; background: Canvas; border-bottom: 1px solid color-mix(in srgb, CanvasText 18%, transparent); padding: 14px 20px; display: flex; align-items: center; gap: 12px; }
  header h1 { font-size: 15px; margin: 0; font-weight: 600; }
  header .meta { font-size: 12px; opacity: .7; }
  main { padding: 16px 20px; max-width: 900px; }
  details { margin: 2px 0; }
  details > summary { cursor: pointer; font-weight: 600; padding: 2px 0; list-style: none; }
  details > summary::-webkit-details-marker { display: none; }
  details > summary::before { content: "▸"; display: inline-block; width: 1em; opacity: .6; transition: transform .1s; }
  details[open] > summary::before { transform: rotate(90deg); }
  .children { margin-left: 1.1em; border-left: 1px solid color-mix(in srgb, CanvasText 12%, transparent); padding-left: 12px; }
  .leaf { margin: 6px 0; }
  .leaf label { display: block; font-size: 12px; opacity: .8; margin-bottom: 2px; }
  textarea { width: 100%; font: inherit; padding: 6px 8px; border: 1px solid color-mix(in srgb, CanvasText 25%, transparent); border-radius: 6px; background: Canvas; color: CanvasText; resize: vertical; }
  textarea.changed { border-color: #d98a00; box-shadow: 0 0 0 1px #d98a00; }
  footer { position: fixed; bottom: 0; left: 0; right: 0; background: Canvas; border-top: 1px solid color-mix(in srgb, CanvasText 18%, transparent); padding: 12px 20px; display: flex; align-items: center; gap: 12px; }
  button { font: inherit; font-weight: 600; padding: 8px 18px; border: 0; border-radius: 6px; background: #2563eb; color: #fff; cursor: pointer; }
  button:disabled { opacity: .5; cursor: default; }
  #status { font-size: 13px; opacity: .8; }
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(data.title)}</h1>
  <span class="meta">locale: <b>${escapeHtml(data.locale)}</b>${data.partition ? ` · mount: <b>${escapeHtml(data.partition)}</b>` : ''}</span>
</header>
<main id="tree"></main>
<footer>
  <button id="save">Save</button>
  <span id="status"></span>
</footer>
<script id="data" type="application/json">${json}</script>
<script>
(function () {
  var data = JSON.parse(document.getElementById('data').textContent);
  var original = {};
  data.leaves.forEach(function (l) { original[l.key] = l.value; });

  // Build a nested tree from dot-separated keys.
  var rootNode = { children: {}, leaves: [] };
  data.leaves.forEach(function (leaf) {
    var parts = leaf.key.split('.');
    var node = rootNode;
    for (var i = 0; i < parts.length - 1; i++) {
      var seg = parts[i];
      node.children[seg] = node.children[seg] || { children: {}, leaves: [] };
      node = node.children[seg];
    }
    node.leaves.push({ key: leaf.key, label: parts[parts.length - 1], value: leaf.value });
  });

  function makeLeaf(leaf) {
    var wrap = document.createElement('div');
    wrap.className = 'leaf';
    var label = document.createElement('label');
    label.textContent = leaf.label;
    var ta = document.createElement('textarea');
    ta.value = leaf.value;
    ta.dataset.key = leaf.key;
    ta.rows = Math.min(10, leaf.value.split('\\n').length);
    ta.addEventListener('input', function () {
      ta.classList.toggle('changed', ta.value !== original[leaf.key]);
    });
    wrap.appendChild(label);
    wrap.appendChild(ta);
    return wrap;
  }

  function makeNode(node) {
    var frag = document.createDocumentFragment();
    Object.keys(node.children).forEach(function (seg) {
      var details = document.createElement('details');
      details.open = true;
      var summary = document.createElement('summary');
      summary.textContent = seg;
      details.appendChild(summary);
      var childWrap = document.createElement('div');
      childWrap.className = 'children';
      childWrap.appendChild(makeNode(node.children[seg]));
      details.appendChild(childWrap);
      frag.appendChild(details);
    });
    node.leaves.forEach(function (leaf) { frag.appendChild(makeLeaf(leaf)); });
    return frag;
  }

  var tree = document.getElementById('tree');
  tree.appendChild(makeNode(rootNode));

  var saveBtn = document.getElementById('save');
  var status = document.getElementById('status');
  saveBtn.addEventListener('click', function () {
    var changes = [];
    document.querySelectorAll('textarea').forEach(function (ta) {
      if (ta.value !== original[ta.dataset.key])
        changes.push({ key: ta.dataset.key, value: ta.value });
    });
    saveBtn.disabled = true;
    status.textContent = changes.length ? 'Saving & translating ' + changes.length + ' entr' + (changes.length === 1 ? 'y' : 'ies') + '…' : 'No changes — finishing…';
    fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes: changes })
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (res.ok) {
        status.textContent = 'Saved ' + res.saved + ' change(s). You may close this tab.';
        window.close();
      } else {
        status.textContent = 'Error: ' + res.error;
        saveBtn.disabled = false;
      }
    }).catch(function (e) {
      status.textContent = 'Error: ' + e;
      saveBtn.disabled = false;
    });
  });
})();
</script>
</body>
</html>`
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
