#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const systemRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const projectRoot = path.resolve(systemRoot, '..')

function insideSystem(relative) {
  const target = path.resolve(systemRoot, relative)
  const prefix = systemRoot.endsWith(path.sep) ? systemRoot : systemRoot + path.sep
  if (target !== systemRoot && !target.startsWith(prefix)) throw new Error('Design System path escapes its root: ' + relative)
  return target
}

async function json(relative) {
  return JSON.parse(await readFile(insideSystem(relative), 'utf8'))
}

async function text(relative) {
  return readFile(insideSystem(relative), 'utf8')
}

function escape(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
}

function safeJson(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (character) => ({ '<': '\\u003c', '>': '\\u003e', '&': '\\u0026', '\u2028': '\\u2028', '\u2029': '\\u2029' })[character])
}

function section(markdown, heading) {
  const expression = new RegExp('^## ' + heading + '\\s*\\n([\\s\\S]*?)(?=\\n## |$)', 'mi')
  return (markdown.match(expression)?.[1] ?? '').replace(/^- None specified\.$/m, '').trim()
}

function bullets(markdown, heading) {
  return section(markdown, heading).split('\n').map((line) => line.match(/^\s*-\s+(.*)$/)?.[1]?.trim()).filter(Boolean)
}

function flatten(value, prefix = '', out = []) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, item] of Object.entries(value)) flatten(item, prefix ? prefix + '.' + key : key, out)
  } else if (typeof value === 'string' || typeof value === 'number') out.push({ path: prefix, value: String(value) })
  return out
}

async function main() {
  const manifest = await json('manifest.json')
  const tokenFile = manifest.tokens || 'tokens.json'
  const tokenDocument = await json(tokenFile)
  const themes = tokenDocument.themes || {}
  const initialTheme = Object.keys(themes)[0] || 'light'
  const components = await Promise.all((manifest.components || []).map(async (item) => {
    const markdown = await text(item.file)
    return { name: item.name, file: item.file, purpose: section(markdown, 'Purpose'), variants: bullets(markdown, 'Variants'), tokens: item.tokens || bullets(markdown, 'Tokens').map((token) => token.replaceAll('`', '')) }
  }))
  const patterns = await Promise.all((manifest.patterns || []).map(async (item) => {
    const markdown = await text(item.file)
    return { name: item.name, file: item.file, purpose: section(markdown, 'Purpose'), guidance: section(markdown, 'Guidance'), tokens: item.tokens || [] }
  }))
  const tokens = Object.entries(themes[initialTheme] || {}).map(([group, values]) => {
    const entries = flatten(values, group).map((item) => {
      let sampleStyle = ''
      if (group === 'spacing') sampleStyle = 'width:' + escape(item.value) + ';height:8px'
      if (group === 'radius') sampleStyle = 'width:42px;height:28px;border-radius:' + escape(item.value)
      if (group === 'typography' && /family/i.test(item.path)) sampleStyle = 'font-family:' + escape(item.value)
      if (group === 'typography' && /size/i.test(item.path)) sampleStyle = 'font-size:' + escape(item.value)
      if (group === 'elevation') sampleStyle = 'box-shadow:' + escape(item.value)
      const visual = group === 'color'
        ? '<div class="sample-color" style="background:' + escape(item.value) + '"></div>'
        : '<div class="sample-value" data-group="' + escape(group) + '"><span style="' + sampleStyle + '">' + (group === 'typography' ? 'Aa' : '') + '</span></div>'
      return '<article class="token"><div class="token-sample">' + visual + '</div><div><code>' + escape(item.path) + '</code><br><small>' + escape(item.value) + '</small></div></article>'
    }).join('')
    return '<div class="token-group"><h3>' + escape(group) + '</h3><div class="token-grid">' + entries + '</div></div>'
  }).join('')
  const componentCards = components.map((item) => '<article class="card"><p class="eyebrow">Component</p><h3>' + escape(item.name) + '</h3><p>' + escape(item.purpose) + '</p><div class="examples">' + (item.name.toLowerCase().includes('button') ? '<button class="button">Primary action</button><button class="button secondary">Secondary</button><button class="button" disabled>Disabled</button>' : item.name.toLowerCase().includes('input') || item.name.toLowerCase().includes('search') ? '<label>Default<input placeholder="Enter a value"></label><label>Error<input aria-invalid="true" value="Check this value"></label>' : '<button class="button secondary">' + escape(item.name) + ' example</button>') + '</div><p class="token-refs">' + item.tokens.map((token) => '<code>' + escape(token) + '</code>').join(' ') + '</p></article>').join('')
  const patternCards = patterns.map((item) => '<article class="card"><p class="eyebrow">Pattern</p><h3>' + escape(item.name) + '</h3><p>' + escape(item.purpose) + '</p><p class="muted">' + escape(item.guidance) + '</p></article>').join('')
  const componentNav = components.map((item) => '<li><a href="../' + escape(item.file) + '">' + escape(item.name) + '</a></li>').join('')
  const patternNav = patterns.map((item) => '<li><a href="../' + escape(item.file) + '">' + escape(item.name) + '</a></li>').join('')
  const html = `<!doctype html>
<html lang="en" data-theme="${escape(initialTheme)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(manifest.name)} — Design System</title>
<style>
.sample-value{height:68px;display:flex;align-items:center;justify-content:center;background:var(--color-surface-base,#f6f8f7);border-bottom:1px solid var(--color-border-subtle,#dbe2de);overflow:hidden}.sample-value[data-group=spacing]{justify-content:flex-start}.sample-value[data-group=typography]>span{background:transparent!important}
:root{font-family:var(--typography-font-family-sans,Inter,system-ui,sans-serif);color:var(--color-text-primary,#17211f);background:var(--color-surface-base,#f6f8f7);line-height:1.5}*{box-sizing:border-box}body{margin:0;background:var(--color-surface-base,#f6f8f7);color:var(--color-text-primary,#17211f)}button,input{font:inherit}.layout{display:grid;grid-template-columns:235px 1fr;min-height:100vh}.side{padding:24px 18px;background:var(--color-surface-raised,#fff);border-right:1px solid var(--color-border-subtle,#dbe2de)}.brand{font-weight:750}.nav{display:grid;gap:8px;margin:25px 0}.nav a{color:var(--color-text-secondary,#65726d);text-decoration:none}.side li{font-size:.85rem;margin:4px 0}main{max-width:1400px;padding:32px clamp(18px,5vw,64px)}.top{display:flex;justify-content:space-between;align-items:center}.eyebrow{font-size:.7rem;text-transform:uppercase;letter-spacing:.1em;color:var(--color-text-secondary,#65726d)}h1{font-size:clamp(2rem,4vw,3.1rem);line-height:1.1;letter-spacing:-.04em}.muted,p{color:var(--color-text-secondary,#65726d)}section{margin-top:50px;scroll-margin-top:18px}.heading{border-bottom:1px solid var(--color-border-subtle,#dbe2de);margin-bottom:16px}.grid,.token-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,270px),1fr));gap:14px}.card{padding:18px;border:1px solid var(--color-border-subtle,#dbe2de);border-radius:var(--radius-card,10px);background:var(--color-surface-raised,#fff)}.card h3{margin:4px 0}.button{background:var(--color-accent-primary,#276f55);color:var(--color-on-accent,#fff);border:1px solid var(--color-accent-primary,#276f55);border-radius:var(--radius-control,6px);padding:9px 14px;min-height:40px;cursor:pointer}.button:hover{filter:brightness(.93)}.button:focus-visible,input:focus-visible,.tab:focus-visible,.switch:focus-visible{outline:3px solid var(--color-focus-ring,#79b8a0);outline-offset:2px}.button.secondary{background:var(--color-surface-raised,#fff);color:var(--color-text-primary,#17211f);border-color:var(--color-border-strong,#9aa9a1)}.button:disabled{opacity:.5;cursor:not-allowed}.examples{display:flex;flex-wrap:wrap;align-items:end;gap:8px}label{display:grid;gap:4px;font-size:.85rem;color:var(--color-text-secondary,#65726d)}input{min-height:40px;border:1px solid var(--color-border-strong,#9aa9a1);border-radius:var(--radius-control,6px);padding:8px;background:var(--color-surface-base,#f6f8f7);color:var(--color-text-primary,#17211f)}input[aria-invalid=true]{border-color:var(--color-status-danger,#b83d48)}.token{display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--color-border-subtle,#dbe2de);border-radius:var(--radius-control,6px);background:var(--color-surface-raised,#fff);overflow-wrap:anywhere}.sample-color{width:42px;height:36px;border:1px solid var(--color-border-subtle,#dbe2de);border-radius:4px}.sample-value{min-width:42px;height:36px;display:grid;place-items:center;background:var(--color-surface-base,#f6f8f7);border:1px solid var(--color-border-subtle,#dbe2de);font-size:12px}.sample-value[data-group=spacing]{width:var(--sample-width,42px)}.token code,.token small{font-size:.75rem}.tabs{display:flex;border-bottom:1px solid var(--color-border-subtle,#dbe2de)}.tab{background:transparent;border:0;padding:9px 12px;color:var(--color-text-secondary,#65726d);cursor:pointer}.tab[aria-selected=true]{border-bottom:2px solid var(--color-accent-primary,#276f55);color:var(--color-accent-primary,#276f55)}.switch{width:44px;height:25px;border:0;border-radius:99px;background:var(--color-border-strong,#9aa9a1);padding:3px}.switch:before{content:"";display:block;width:19px;height:19px;border-radius:50%;background:white;transition:transform .15s}.switch[aria-checked=true]{background:var(--color-accent-primary,#276f55)}.switch[aria-checked=true]:before{transform:translateX(19px)}.overlay{display:none;position:fixed;inset:0;place-items:center;background:#0007;padding:20px}.overlay.open{display:grid}.dialog{max-width:460px;background:var(--color-surface-raised,#fff);padding:22px;border-radius:var(--radius-dialog,12px)}.toast{display:none;position:fixed;right:20px;bottom:20px;padding:12px 16px;background:var(--color-text-primary,#17211f);color:var(--color-surface-raised,#fff);border-radius:var(--radius-control,6px)}.toast.show{display:block}table{width:100%;border-collapse:collapse;background:var(--color-surface-raised,#fff)}th,td{text-align:left;padding:10px;border-bottom:1px solid var(--color-border-subtle,#dbe2de)}@media(max-width:720px){.layout{grid-template-columns:1fr}.side{border-right:0;border-bottom:1px solid var(--color-border-subtle,#dbe2de)}.side ul{display:none}.nav{display:flex;overflow:auto;margin:10px 0 0}.nav a{white-space:nowrap}main{padding:24px 16px}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{transition-duration:.01ms!important;scroll-behavior:auto!important}}
</style></head><body><div class="layout"><aside class="side"><div class="brand">${escape(manifest.name)}</div><small>Design system · v${escape(manifest.designSystemVersion)}</small><nav class="nav"><a href="#tokens">Tokens</a><a href="#components">Components</a><a href="#patterns">Patterns</a><a href="#interactions">Interactions</a></nav>${componentNav ? '<small>COMPONENTS</small><ul>' + componentNav + '</ul>' : ''}${patternNav ? '<small>PATTERNS</small><ul>' + patternNav + '</ul>' : ''}</aside><main><div class="top"><span>${escape(manifest.status)}</span><button class="button secondary" id="theme-toggle">Toggle theme</button></div><header><p class="eyebrow">Framework-neutral design language</p><h1>${escape(manifest.name)}</h1><p>${escape(manifest.description)}</p></header>
<section id="tokens"><div class="heading"><p class="eyebrow">Foundations</p><h2>Semantic tokens</h2></div><div id="token-content">${tokens}</div></section><section id="components"><div class="heading"><p class="eyebrow">Building blocks</p><h2>Components</h2></div><div class="grid">${componentCards || '<p>No components documented.</p>'}</div></section><section id="patterns"><div class="heading"><p class="eyebrow">Compositions</p><h2>Patterns</h2></div><div class="grid">${patternCards || '<p>No patterns documented.</p>'}</div></section>
<section id="interactions"><div class="heading"><p class="eyebrow">Try it</p><h2>Interactive states</h2></div><div class="grid"><article class="card"><h3>Tabs</h3><div class="tabs" role="tablist"><button class="tab" role="tab" aria-selected="true" aria-controls="panel-a">General</button><button class="tab" role="tab" aria-selected="false" aria-controls="panel-b">Advanced</button></div><p id="panel-a" role="tabpanel">General settings are visible.</p><p id="panel-b" role="tabpanel" hidden>Advanced options are available here.</p></article><article class="card"><h3>Switch</h3><button class="switch" type="button" role="switch" aria-checked="false" aria-label="Enable notifications"></button> Enable notifications</article><article class="card"><h3>Dialog and toast</h3><div class="examples"><button class="button" id="open-dialog">Open dialog</button><button class="button secondary" id="show-toast">Show toast</button></div></article><article class="card"><h3>Table</h3><table><thead><tr><th>Name</th><th>Status</th></tr></thead><tbody><tr><td>Jordan Lee</td><td>Active</td></tr><tr><td>Sam Rivera</td><td>Invited</td></tr></tbody></table></article></div></section><footer><hr><p>Generated from manifest, tokens, component specifications, and patterns. Edit structured files and regenerate this preview; the HTML is not design-system source.</p></footer></main></div><div class="overlay" id="overlay" aria-hidden="true"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><h3 id="dialog-title">Confirm an action</h3><p>Review the action before continuing.</p><button class="button" id="close-dialog">Continue</button><button class="button secondary" id="cancel-dialog">Cancel</button></section></div><div class="toast" id="toast" role="status" aria-live="polite">Changes saved</div><script type="application/json" id="theme-data">${safeJson(themes)}</script>
<script>
const themes=JSON.parse(document.getElementById('theme-data').textContent||'{}');function flatten(v,p='',o={}){for(const [k,x] of Object.entries(v||{})){const n=p?p+'-'+k:k;if(x&&typeof x==='object'&&!Array.isArray(x))flatten(x,n,o);else if(['string','number'].includes(typeof x))o[n]=String(x)}return o}function setTheme(n){const t=themes[n];if(!t)return;document.documentElement.dataset.theme=n;for(const [k,v] of Object.entries(flatten(t)))document.documentElement.style.setProperty('--'+k,v);document.getElementById('theme-toggle').hidden=Object.keys(themes).length<2}document.getElementById('theme-toggle').addEventListener('click',()=>{const names=Object.keys(themes),i=names.indexOf(document.documentElement.dataset.theme);setTheme(names[(i+1)%names.length])});for(const tab of document.querySelectorAll('[role=tab]'))tab.addEventListener('click',()=>{for(const item of document.querySelectorAll('[role=tab]')){const active=item===tab;item.setAttribute('aria-selected',String(active));document.getElementById(item.getAttribute('aria-controls')).hidden=!active}});document.querySelector('[role=switch]').addEventListener('click',e=>e.currentTarget.setAttribute('aria-checked',String(e.currentTarget.getAttribute('aria-checked')!=='true')));const overlay=document.getElementById('overlay'),open=document.getElementById('open-dialog');function closeDialog(){overlay.classList.remove('open');overlay.setAttribute('aria-hidden','true');open.focus()}open.addEventListener('click',()=>{overlay.classList.add('open');overlay.setAttribute('aria-hidden','false');document.getElementById('close-dialog').focus()});document.getElementById('close-dialog').addEventListener('click',closeDialog);document.getElementById('cancel-dialog').addEventListener('click',closeDialog);document.addEventListener('keydown',e=>{if(e.key==='Escape'&&overlay.classList.contains('open'))closeDialog()});let timeout;document.getElementById('show-toast').addEventListener('click',()=>{const toast=document.getElementById('toast');toast.classList.add('show');clearTimeout(timeout);timeout=setTimeout(()=>toast.classList.remove('show'),2200)});setTheme(${safeJson(initialTheme)});
</script></body></html>`
  const previewPath = insideSystem(manifest.preview || 'preview/index.html')
  await mkdir(path.dirname(previewPath), { recursive: true })
  await writeFile(previewPath, html, 'utf8')
  console.log('Generated ' + path.relative(projectRoot, previewPath).split(path.sep).join('/'))
}

main().catch((error) => {
  console.error('Could not generate Design System preview: ' + (error instanceof Error ? error.message : String(error)))
  process.exitCode = 1
})
