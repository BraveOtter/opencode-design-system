const TOKEN_ROLE_PATHS = {
  canvas: ["color.canvas", "color.surface.base", "surface.canvas"],
  surface: ["color.surface", "color.surface.raised", "surface.raised"],
  text: ["color.text", "color.text.primary", "text.primary"],
  muted: ["color.muted", "color.text.secondary", "text.secondary"],
  brand: ["color.brand", "color.accent.primary", "color.primary", "brand"],
  brandHover: ["color.brandHover", "color.accent.hover", "color.accent.primary.hover", "color.brand.hover"],
  brandSubtle: ["color.brandSubtle", "color.accent.subtle", "color.brand.subtle"],
  onBrand: ["color.onBrand", "color.onAccent", "color.on.accent", "color.text.onBrand"],
  border: ["color.border", "color.border.subtle", "border.subtle"],
  borderStrong: ["color.border.strong", "border.strong", "color.border"],
  focus: ["color.focus", "color.focus.ring", "color.focusRing", "focus.ring"],
  success: ["color.success", "color.status.success", "color.status.positive", "status.success"],
  warning: ["color.warning", "color.status.warning", "status.warning"],
  danger: ["color.danger", "color.status.danger", "status.danger"],
  controlRadius: ["radius.control", "borderRadius.control"],
  cardRadius: ["radius.card", "borderRadius.card"],
  tagRadius: ["radius.tag", "radius.pill", "borderRadius.tag"],
  bodyFont: ["typography.body", "typography.fontFamily.sans", "typography.font-family-sans"],
}

const DEFAULT_ROLES = {
  canvas: "#f5f3f0",
  surface: "#ffffff",
  text: "#292724",
  muted: "#6b6862",
  brand: "#5b524b",
  brandHover: "#4a433d",
  brandSubtle: "#e9e4df",
  onBrand: "#ffffff",
  border: "#d9d4ce",
  borderStrong: "#b9b1a8",
  focus: "#8a6d52",
  success: "#43735a",
  warning: "#946b2e",
  danger: "#9b4a47",
  controlRadius: "0.5rem",
  cardRadius: "0.75rem",
  tagRadius: "9999px",
  bodyFont: "Inter, ui-sans-serif, system-ui, sans-serif",
}

export function createPreviewHtml({ manifest, tokens, components, patterns }) {
  const themes = tokens?.themes && typeof tokens.themes === "object" ? tokens.themes : {}
  const themeNames = Object.keys(themes)
  const firstTheme = themeNames[0] ?? "light"
  const themeData = Object.fromEntries(themeNames.map((name) => [name, normalizeTheme(themes[name])]))
  const componentCards = components.map((component, index) => componentCard(component, index)).join("\n")
  const patternCards = patterns.map((pattern) => `
    <article class="spec-card">
      <p class="eyebrow">Pattern</p><h3>${escapeHtml(pattern.name)}</h3>
      <p>${escapeHtml(pattern.purpose)}</p>
      <p class="muted">${escapeHtml(pattern.guidance && pattern.guidance !== pattern.purpose ? pattern.guidance : pattern.composition?.join(" · ") || pattern.guidance || "")}</p>
    </article>`).join("\n")
  const componentIndex = manifest.components.map((item) => `<li><a href="../${escapeHtml(item.file)}">${escapeHtml(item.name)}</a></li>`).join("")
  const patternIndex = manifest.patterns.map((item) => `<li><a href="../${escapeHtml(item.file)}">${escapeHtml(item.name)}</a></li>`).join("")

  return `<!doctype html>
<html lang="en" data-theme="${escapeHtml(firstTheme)}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="Generated interactive preview for ${escapeHtml(manifest.name)}." />
  <title>${escapeHtml(manifest.name)} — Design System</title>
  <style>
    :root{color-scheme:light;--preview-canvas:#f5f3f0;--preview-surface:#fff;--preview-text:#292724;--preview-muted:#6b6862;--preview-brand:#5b524b;--preview-brand-hover:#4a433d;--preview-brand-subtle:#e9e4df;--preview-on-brand:#fff;--preview-border:#d9d4ce;--preview-border-strong:#b9b1a8;--preview-focus:#8a6d52;--preview-success:#43735a;--preview-warning:#946b2e;--preview-danger:#9b4a47;--preview-control-radius:.5rem;--preview-card-radius:.75rem;--preview-tag-radius:9999px;--preview-body-font:Inter,ui-sans-serif,system-ui,sans-serif;font-family:var(--preview-body-font);color:var(--preview-text);background:var(--preview-canvas);font-synthesis:none;line-height:1.5}
    *{box-sizing:border-box}body{margin:0;background:var(--preview-canvas);color:var(--preview-text)}button,input,select{font:inherit}button{cursor:pointer}a{color:var(--preview-brand)}
    .shell{min-height:100vh;display:grid;grid-template-columns:250px minmax(0,1fr)}.sidebar{padding:28px 20px;border-right:1px solid var(--preview-border);background:var(--preview-surface)}.brand{font-size:1.05rem;font-weight:750;margin-bottom:4px}.side-note,.muted{color:var(--preview-muted);font-size:.88rem}.nav{display:grid;gap:6px;margin:28px 0}.nav a{padding:8px 10px;text-decoration:none;border-radius:var(--preview-control-radius);color:var(--preview-muted)}.nav a:hover{background:var(--preview-canvas);color:var(--preview-text)}.nav-label{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--preview-muted);margin:20px 8px 8px}
    main{min-width:0;padding:34px clamp(20px,5vw,72px) 72px;max-width:1440px}.topbar{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:34px}.eyebrow{font-size:.72rem;text-transform:uppercase;letter-spacing:.1em;font-weight:700;color:var(--preview-muted);margin:0 0 5px}.hero h1{font-size:clamp(2rem,4vw,3.4rem);letter-spacing:-.045em;line-height:1.08;margin:0}.hero>p{max-width:720px;color:var(--preview-muted)}.status{display:inline-flex;border:1px solid var(--preview-border);border-radius:var(--preview-tag-radius);padding:3px 10px;font-size:.76rem;text-transform:uppercase;letter-spacing:.06em}
    section{margin-top:54px;scroll-margin-top:20px}.section-heading{display:flex;justify-content:space-between;align-items:end;gap:16px;border-bottom:1px solid var(--preview-border);padding-bottom:12px;margin-bottom:18px}.section-heading h2{margin:0;font-size:1.45rem;letter-spacing:-.025em}.section-heading p{margin:0;color:var(--preview-muted);font-size:.9rem}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,290px),1fr));gap:14px}.spec-card,.surface{border:1px solid var(--preview-border);border-radius:var(--preview-card-radius);background:var(--preview-surface);padding:18px}.spec-card h3{margin:0 0 8px;font-size:1.05rem}.spec-card p{color:var(--preview-muted);margin:8px 0}.spec-card small{display:block;margin-top:12px;color:var(--preview-muted)}.spec-heading{display:flex;justify-content:space-between;align-items:center;gap:12px}.tag{border-radius:var(--preview-tag-radius);background:var(--preview-brand-subtle);color:var(--preview-brand);padding:3px 8px;font-size:.75rem}.showcase{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:16px 0 4px}.button{border:1px solid var(--preview-brand);border-radius:var(--preview-control-radius);background:var(--preview-brand);color:var(--preview-on-brand);padding:9px 14px;min-height:40px;font-weight:650;transition:background 140ms ease,border-color 140ms ease,transform 140ms ease,box-shadow 140ms ease}.button:not(.secondary):not(:disabled):hover{background:var(--preview-brand-hover);border-color:var(--preview-brand-hover)}.button.secondary:not(:disabled):hover{background:var(--preview-canvas)}.button:active{transform:translateY(1px)}.button:focus-visible,input:focus-visible,select:focus-visible,.tab:focus-visible,.switch:focus-visible{outline:3px solid var(--preview-focus);outline-offset:2px}.button.secondary{background:var(--preview-surface);color:var(--preview-text);border-color:var(--preview-border-strong)}.button:disabled{opacity:.5;cursor:not-allowed}.button.magnetic{transform:perspective(var(--token-depth-buttonPerspective,600px)) translate3d(var(--magnet-x,0px),var(--magnet-y,0px),0) rotateX(var(--magnet-rx,0deg)) rotateY(var(--magnet-ry,0deg));transform-style:preserve-3d;will-change:transform}.button.magnetic[data-moving="true"]{transition:background 140ms ease,border-color 140ms ease,box-shadow 140ms ease}.button.magnetic:focus-visible{transform:none;will-change:auto}
    .field-label{display:grid;gap:5px;font-size:.82rem;color:var(--preview-text)}.field-label input{min-height:40px;border:1px solid var(--preview-border-strong);border-radius:var(--preview-control-radius);padding:8px 10px;background:var(--preview-canvas);color:var(--preview-text)}.field-label input[aria-invalid="true"]{border-color:var(--preview-danger)}.feedback{min-height:1.5em;font-size:.82rem;color:var(--preview-muted)}.feedback[data-state="error"]{color:var(--preview-danger)}.feedback[data-state="success"]{color:var(--preview-success)}.demo-surface{min-height:72px;padding:14px;border:1px solid var(--preview-border);border-radius:var(--preview-control-radius);background:var(--preview-canvas)}.demo-surface strong{display:block}.badge{display:inline-flex;align-items:center;gap:7px;border-radius:var(--preview-tag-radius);padding:5px 10px;background:var(--preview-brand-subtle);color:var(--preview-brand);font-size:.82rem}.badge::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}.badge.success{background:color-mix(in srgb,var(--preview-success) 14%,var(--preview-surface));color:var(--preview-success)}.badge.warning{background:color-mix(in srgb,var(--preview-warning) 14%,var(--preview-surface));color:var(--preview-warning)}.badge.danger{background:color-mix(in srgb,var(--preview-danger) 14%,var(--preview-surface));color:var(--preview-danger)}
    .token-table{display:grid;gap:18px}.token-group h3{font-size:.95rem;margin:0 0 10px;text-transform:capitalize}.swatches{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.swatch{overflow:hidden;border:1px solid var(--preview-border);border-radius:var(--preview-control-radius);background:var(--preview-surface)}.swatch-color,.token-demo{height:58px;display:grid;place-items:center;border-bottom:1px solid var(--preview-border);background:var(--preview-canvas);overflow:hidden}.swatch-color{background:var(--swatch-color)}.token-demo-sample{display:block;min-width:12px;min-height:8px;background:var(--preview-brand)}.token-demo[data-group="spacing"] .token-demo-sample{height:8px}.token-demo[data-group="typography"] .token-demo-sample{min-width:0;min-height:0;background:transparent;color:var(--preview-text)}.token-label{padding:8px 10px;font-size:.75rem}.token-label code{display:block;overflow-wrap:anywhere;color:var(--preview-muted);font-size:.68rem}
    .magnetic-note{font-size:.75rem;color:var(--preview-muted)}.identity-scene{perspective:var(--token-depth-cardPerspective,var(--token-depth-identityPerspective,1200px));padding:10px 6px 18px;max-width:340px}.identity-card{min-height:190px;padding:18px;border:1px solid var(--preview-border);border-radius:var(--preview-card-radius);background:var(--preview-surface);box-shadow:0 14px 34px color-mix(in srgb,var(--preview-text) 14%,transparent);transform:rotateX(var(--card-rx,0deg)) rotateY(var(--card-ry,0deg)) translateZ(var(--card-lift,0px));transform-style:preserve-3d;transition:transform 240ms ease,box-shadow 240ms ease;will-change:transform}.identity-card[data-moving="true"]{transition:none}.identity-mark{color:var(--preview-brand);font-weight:750;letter-spacing:.04em}.identity-divider{height:1px;margin:12px 0;background:var(--preview-border)}.identity-name{font-size:1.1rem;font-weight:700}.identity-meta{font-size:.78rem;color:var(--preview-muted)}
    .component-nav{padding-left:18px}.component-nav a{color:var(--preview-muted);text-decoration:none}.component-nav a:hover{color:var(--preview-brand)}.warning-note{padding:10px 12px;border:1px solid var(--preview-warning);border-radius:var(--preview-control-radius);color:var(--preview-text);font-size:.85rem}.warning-note[hidden]{display:none}.tabs{display:flex;gap:6px}.tab,.switch{border:1px solid var(--preview-border-strong);border-radius:var(--preview-control-radius);background:var(--preview-surface);color:var(--preview-text);padding:7px 10px}.tab[aria-selected="true"]{border-color:var(--preview-brand);color:var(--preview-brand)}.switch{width:46px;height:26px;padding:2px;border-radius:999px;background:var(--preview-border);position:relative}.switch::after{content:"";display:block;width:20px;height:20px;border-radius:50%;background:var(--preview-surface);transition:transform 140ms ease}.switch[aria-checked="true"]{background:var(--preview-brand)}.switch[aria-checked="true"]::after{transform:translateX(20px)}.switch-row{display:flex;align-items:center;gap:10px}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:.85rem}th,td{text-align:left;padding:9px;border-bottom:1px solid var(--preview-border)}.overlay{position:fixed;inset:0;display:none;place-items:center;padding:20px;background:rgb(0 0 0 / .45);z-index:5}.overlay.open{display:grid}.dialog{width:min(100%,440px);padding:22px;border-radius:var(--preview-card-radius);background:var(--preview-surface);box-shadow:0 20px 60px rgb(0 0 0 / .25)}.toast{position:fixed;right:20px;bottom:20px;z-index:8;padding:12px 16px;border-radius:var(--preview-control-radius);background:var(--preview-text);color:var(--preview-canvas);opacity:0;transform:translateY(8px);pointer-events:none;transition:opacity 160ms ease,transform 160ms ease}.toast.show{opacity:1;transform:translateY(0)}
    @media(max-width:760px){.shell{grid-template-columns:1fr}.sidebar{border-right:0;border-bottom:1px solid var(--preview-border);padding:14px 18px}.nav{display:flex;overflow:auto;margin:12px 0 0}.nav a{white-space:nowrap}.sidebar .nav-label,.sidebar .side-note,.sidebar ul{display:none}main{padding:24px 18px 54px}.topbar{align-items:flex-start}.component-nav{display:none}.section-heading{align-items:flex-start;flex-direction:column}}
    @media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;transition-duration:.01ms!important;animation-duration:.01ms!important;animation-iteration-count:1!important}.button.magnetic,.identity-card{transform:none!important;will-change:auto!important}}
  </style>
</head>
<body>
  <div class="shell">
    <aside class="sidebar" aria-label="Design system navigation">
      <div class="brand">${escapeHtml(manifest.name)}</div><div class="side-note">Design system · v${escapeHtml(manifest.designSystemVersion)}</div>
      <nav class="nav"><a href="#overview">Overview</a><a href="#colors">Tokens</a><a href="#components">Components</a><a href="#patterns">Patterns</a><a href="#interactions">Interactions</a></nav>
      ${manifest.components.length ? `<div class="nav-label">Components</div><ul class="component-nav">${componentIndex}</ul>` : ""}
      ${manifest.patterns.length ? `<div class="nav-label">Patterns</div><ul class="component-nav">${patternIndex}</ul>` : ""}
    </aside>
    <main>
      <div class="topbar"><div class="status">${escapeHtml(manifest.status)}</div><button class="button secondary" id="theme-toggle" type="button" aria-label="Toggle color theme">Toggle theme</button></div>
      <header id="overview" class="hero"><p class="eyebrow">Framework-neutral design language</p><h1>${escapeHtml(manifest.name)}</h1><p>${escapeHtml(manifest.description)}</p></header>
      <p id="token-warning" class="warning-note" role="status" hidden></p>
      <section id="colors"><div class="section-heading"><div><p class="eyebrow">Foundations</p><h2>Semantic tokens</h2></div><p>Values generated from tokens.json</p></div><div id="token-groups" class="token-table"></div></section>
      <section id="components"><div class="section-heading"><div><p class="eyebrow">Building blocks</p><h2>Components</h2></div><p>${components.length} documented</p></div><div class="grid">${componentCards || `<p class="muted">No components documented yet.</p>`}</div></section>
      <section id="patterns"><div class="section-heading"><div><p class="eyebrow">Compositions</p><h2>Patterns</h2></div><p>${patterns.length} documented</p></div><div class="grid">${patternCards || `<p class="muted">No patterns documented yet.</p>`}</div></section>
      <section id="interactions"><div class="section-heading"><div><p class="eyebrow">Try it</p><h2>Interactive states</h2></div><p>Local examples · no application services</p></div>
        <div class="grid">
          <article class="spec-card"><h3>Tabs</h3><div class="tabs" role="tablist" aria-label="Preview tabs"><button class="tab" role="tab" aria-selected="true" aria-controls="tab-a" id="tab-button-a">General</button><button class="tab" role="tab" aria-selected="false" aria-controls="tab-b" id="tab-button-b" tabindex="-1">Advanced</button></div><div id="tab-a" class="tab-panel" role="tabpanel" aria-labelledby="tab-button-a">General settings are visible.</div><div id="tab-b" class="tab-panel" role="tabpanel" aria-labelledby="tab-button-b" hidden>Advanced options are available here.</div></article>
          <article class="spec-card"><h3>Switch</h3><div class="switch-row"><button class="switch" type="button" role="switch" aria-checked="false" aria-label="Enable notifications"></button><span>Enable notifications</span></div></article>
          <article class="spec-card"><h3>Dialog and toast</h3><div class="showcase"><button class="button" type="button" id="open-dialog">Open dialog</button><button class="button secondary" type="button" id="show-toast">Show toast</button></div></article>
          <article class="spec-card"><h3>Data table</h3><div class="table-wrap"><table><thead><tr><th>Name</th><th>Status</th><th>Role</th></tr></thead><tbody><tr><td>Jordan Lee</td><td><span class="tag">Active</span></td><td>Editor</td></tr><tr><td>Sam Rivera</td><td>Invited</td><td>Admin</td></tr></tbody></table></div></article>
        </div>
      </section>
      <footer class="spec-card"><p>Generated from manifest.json, tokens.json, component specifications, and patterns. Edit the structured sources and regenerate this preview.</p></footer>
    </main>
  </div>
  <div class="overlay" id="dialog-overlay" aria-hidden="true"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><h3 id="dialog-title">Confirm an action</h3><p>This local dialog demonstrates the documented surface and focus treatment.</p><div class="showcase"><button class="button" type="button" id="close-dialog">Continue</button><button class="button secondary" type="button" id="cancel-dialog">Cancel</button></div></section></div>
  <div class="toast" id="toast" role="status" aria-live="polite">Changes saved</div>
  <script type="application/json" id="theme-data">${safeJson(themeData)}</script>
  <script>
    const themes=JSON.parse(document.getElementById('theme-data').textContent||'{}');
    const themeNames=Object.keys(themes);const themeToggle=document.getElementById('theme-toggle');
    function flatten(value,prefix='',out=[]){if(value&&typeof value==='object'&&!Array.isArray(value)){for(const [key,item] of Object.entries(value))flatten(item,prefix?prefix+'.'+key:key,out)}else if(['string','number','boolean'].includes(typeof value))out.push({path:prefix,value:String(value)});return out}
    function setTheme(name){const theme=themes[name];if(!theme)return;document.documentElement.dataset.theme=name;document.documentElement.style.colorScheme=/dark/i.test(name)?'dark':'light';for(const [key,value] of Object.entries(theme.roles||{}))document.documentElement.style.setProperty('--preview-'+key.replace(/[A-Z]/g,letter=>'-'+letter.toLowerCase()),value);for(const property of [...document.documentElement.style])if(property.startsWith('--token-'))document.documentElement.style.removeProperty(property);for(const token of flatten(theme.tokens)){if(/^[\w-]+(?:\.[\w-]+)*$/.test(token.path))document.documentElement.style.setProperty('--token-'+token.path.replaceAll('.','-'),token.value)}themeToggle.hidden=themeNames.length<2;renderTokens(theme.tokens);const missing=theme.missing||[];const warning=document.getElementById('token-warning');warning.hidden=missing.length===0;warning.textContent=missing.length?'Some preview roles use neutral defaults because matching semantic tokens were not found: '+missing.join(', ')+'.':''}
    function renderTokens(theme){const holder=document.getElementById('token-groups');holder.replaceChildren();for(const [group,values] of Object.entries(theme||{})){if(!values||typeof values!=='object'||Array.isArray(values))continue;const section=document.createElement('div');section.className='token-group';const heading=document.createElement('h3');heading.textContent=group;section.append(heading);const swatches=document.createElement('div');swatches.className='swatches';for(const token of flatten(values,group)){const card=document.createElement('div');card.className='swatch';const sample=document.createElement('div');if(group==='color'){sample.className='swatch-color';sample.style.setProperty('--swatch-color',token.value)}else{sample.className='token-demo';sample.dataset.group=group;const shape=document.createElement('span');shape.className='token-demo-sample';shape.textContent=group==='typography'?'Aa':'';if(group==='spacing')shape.style.width=token.value;if(group==='radius'){shape.style.width='42px';shape.style.height='28px';shape.style.borderRadius=token.value}if(group==='typography'&&/family|body/i.test(token.path))shape.style.fontFamily=token.value;if(group==='typography'&&/size/i.test(token.path))shape.style.fontSize=token.value;if(group==='elevation')shape.style.boxShadow=token.value;sample.append(shape)}const label=document.createElement('div');label.className='token-label';const name=document.createElement('strong');name.textContent=token.path;const code=document.createElement('code');code.textContent=token.value;label.append(name,code);card.append(sample,label);swatches.append(card)}section.append(swatches);holder.append(section)}}
    themeToggle.addEventListener('click',()=>{const index=themeNames.indexOf(document.documentElement.dataset.theme);setTheme(themeNames[(index+1)%themeNames.length])});
    for(const button of document.querySelectorAll('[role=tab]')){button.addEventListener('click',()=>{for(const tab of document.querySelectorAll('[role=tab]')){const selected=tab===button;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;document.getElementById(tab.getAttribute('aria-controls')).hidden=!selected}});button.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const tabs=[...document.querySelectorAll('[role=tab]')];const next=(tabs.indexOf(button)+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length;tabs[next].focus();tabs[next].click()})}
    document.querySelector('[role=switch]').addEventListener('click',event=>{const control=event.currentTarget;control.setAttribute('aria-checked',String(control.getAttribute('aria-checked')!=='true'))});
    for(const button of document.querySelectorAll('[data-preview-action]'))button.addEventListener('click',()=>{const output=document.getElementById(button.dataset.feedbackTarget);if(output){output.textContent=button.dataset.previewAction+' activated.';output.dataset.state='success'}});
    for(const form of document.querySelectorAll('[data-preview-form]'))form.addEventListener('submit',event=>{event.preventDefault();const field=form.querySelector('input');const output=form.querySelector('.feedback');const valid=field.checkValidity();field.setAttribute('aria-invalid',String(!valid));output.dataset.state=valid?'success':'error';output.textContent=valid?'Example value is valid; no data was sent.':'Enter a valid value to see the success state.';if(!valid)field.focus()});
    const motion=window.matchMedia('(prefers-reduced-motion: reduce)');const finePointer=window.matchMedia('(hover: hover) and (pointer: fine)');
    function resetMagnet(element){element.dataset.moving='false';for(const key of ['--magnet-x','--magnet-y','--magnet-rx','--magnet-ry'])element.style.removeProperty(key)}
    for(const element of document.querySelectorAll('.magnetic')){let frame=0;element.addEventListener('pointermove',event=>{if(motion.matches||!finePointer.matches||event.pointerType==='touch')return;cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const rect=element.getBoundingClientRect();const x=(event.clientX-rect.left-rect.width/2)/rect.width;const y=(event.clientY-rect.top-rect.height/2)/rect.height;const tilt=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--token-depth-buttonTiltMax'))||10;const strength=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--token-depth-buttonTranslation'))||.2;element.dataset.moving='true';element.style.setProperty('--magnet-x',(x*rect.width*strength)+'px');element.style.setProperty('--magnet-y',(y*rect.height*strength)+'px');element.style.setProperty('--magnet-rx',(y*tilt)+'deg');element.style.setProperty('--magnet-ry',(-x*tilt)+'deg')})});for(const type of ['pointerleave','pointercancel','blur'])element.addEventListener(type,()=>{cancelAnimationFrame(frame);resetMagnet(element)});motion.addEventListener('change',()=>resetMagnet(element))}
    for(const card of document.querySelectorAll('[data-tilt-card]')){let frame=0;function reset(){card.dataset.moving='false';for(const key of ['--card-rx','--card-ry','--card-lift'])card.style.removeProperty(key)}card.addEventListener('pointermove',event=>{if(motion.matches||!finePointer.matches||event.pointerType==='touch')return;cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const rect=card.getBoundingClientRect();const x=(event.clientX-rect.left-rect.width/2)/rect.width;const y=(event.clientY-rect.top-rect.height/2)/rect.height;const tilt=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--token-depth-cardTiltMax')||getComputedStyle(document.documentElement).getPropertyValue('--token-depth-identityTiltMax'))||12;const lift=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--token-depth-cardLift')||getComputedStyle(document.documentElement).getPropertyValue('--token-depth-identityLiftMax'))||10;card.dataset.moving='true';card.style.setProperty('--card-rx',(y*tilt)+'deg');card.style.setProperty('--card-ry',(-x*tilt)+'deg');card.style.setProperty('--card-lift',lift+'px')})});for(const type of ['pointerleave','pointercancel'])card.addEventListener(type,()=>{cancelAnimationFrame(frame);reset()});motion.addEventListener('change',reset)}
    const overlay=document.getElementById('dialog-overlay');const open=document.getElementById('open-dialog');function closeDialog(){overlay.classList.remove('open');overlay.setAttribute('aria-hidden','true');open.focus()}open.addEventListener('click',()=>{overlay.classList.add('open');overlay.setAttribute('aria-hidden','false');document.getElementById('close-dialog').focus()});document.getElementById('close-dialog').addEventListener('click',closeDialog);document.getElementById('cancel-dialog').addEventListener('click',closeDialog);overlay.addEventListener('click',event=>{if(event.target===overlay)closeDialog()});document.addEventListener('keydown',event=>{if(event.key==='Escape'&&overlay.classList.contains('open'))closeDialog()});let toastTimeout;document.getElementById('show-toast').addEventListener('click',()=>{const toast=document.getElementById('toast');toast.classList.add('show');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>toast.classList.remove('show'),2200)});
    setTheme(${safeJson(firstTheme)});
  </script>
</body>
</html>
`
}

function normalizeTheme(theme) {
  const roles = {}
  const missing = []
  for (const [name, paths] of Object.entries(TOKEN_ROLE_PATHS)) {
    const value = firstTokenValue(theme, paths)
    if (value === undefined) {
      roles[name] = DEFAULT_ROLES[name]
      if (["canvas", "surface", "text", "brand", "border"].includes(name)) missing.push(name)
    } else roles[name] = value
  }
  return { roles, missing, tokens: theme }
}

function firstTokenValue(theme, paths) {
  for (const path of paths) {
    let value = theme
    for (const segment of path.split(".")) value = value && typeof value === "object" ? value[segment] : undefined
    if ((typeof value === "string" || typeof value === "number") && String(value).trim()) return String(value)
  }
  return undefined
}

function componentCard(component, index) {
  const name = String(component.name ?? "Component")
  const tokens = component.tokens ?? []
  const evidence = [name, component.behavior, ...(component.variants ?? []), ...(component.states ?? []), ...tokens].filter(Boolean).join(" ")
  const isButton = /button|action/i.test(name)
  const isField = /input|field|search/i.test(name)
  const isStatus = /status|indicator|badge/i.test(name)
  const isIdentityCard = /profile|identity|credential/i.test(name) && /card|identity|credential/i.test(name) || tokens.some((token) => /depth\.(card|identity)(Perspective|TiltMax|Lift)/i.test(token))
  const magnetic = isButton && (/magnet/i.test(evidence) || tokens.some((token) => /depth\.(button|magnetic)/i.test(token)))
  let demo
  if (isIdentityCard) demo = identityCardDemo(name)
  else if (isButton) demo = buttonDemo(name, index, magnetic)
  else if (isField) demo = fieldDemo(name, index)
  else if (isStatus) demo = `<div class="showcase"><span class="badge">In progress</span><span class="badge success">Complete</span><span class="badge warning">Needs review</span><span class="badge danger">Blocked</span></div>`
  else demo = `<div class="demo-surface"><strong>${escapeHtml(name)} preview</strong><span class="muted">Static sample of the documented component.</span></div>`
  const tokensHtml = tokens.length ? `<small>Tokens: ${tokens.map((token) => `<code>${escapeHtml(token)}</code>`).join(" ")}</small>` : ""
  return `
    <article class="spec-card">
      <div class="spec-heading"><div><p class="eyebrow">Component</p><h3>${escapeHtml(name)}</h3></div><span class="tag">${escapeHtml(component.variants?.[0] ?? "base")}</span></div>
      <p>${escapeHtml(component.purpose ?? "")}</p>
      <div class="showcase">${demo}</div>
      ${tokensHtml}
    </article>`
}

function buttonDemo(name, index, magnetic) {
  const className = magnetic ? "button magnetic" : "button"
  const hint = magnetic ? `<span class="magnetic-note">Move the pointer to try the magnetic response.</span>` : ""
  return `<div class="showcase"><button class="${className}" type="button" data-preview-action="${escapeHtml(name)}" data-feedback-target="component-feedback-${index}">${escapeHtml(name)} action</button><button class="button secondary" type="button" data-preview-action="Secondary" data-feedback-target="component-feedback-${index}">Secondary</button><button class="button" type="button" disabled>Disabled</button></div><p class="feedback" id="component-feedback-${index}" role="status" aria-live="polite"></p>${hint}`
}

function fieldDemo(name, index) {
  const id = `preview-field-${index}`
  return `<form data-preview-form><label class="field-label" for="${id}">${escapeHtml(name)}<input id="${id}" type="email" autocomplete="off" placeholder="name@example.com" required aria-describedby="field-feedback-${index}" /></label><div class="showcase"><button class="button" type="submit">Validate example</button></div><p class="feedback" id="field-feedback-${index}" role="status" aria-live="polite"></p></form>`
}

function identityCardDemo(name) {
  return `<div class="identity-scene"><article class="identity-card" data-tilt-card><div class="identity-mark">${escapeHtml(name)}</div><div class="identity-divider"></div><div class="identity-name">Alex Martin</div><div class="identity-meta">Workshop coordinator · sample identity</div></article></div><span class="magnetic-note">Move the pointer to explore the 3D identity card.</span>`
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character])
}

function safeJson(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (character) => ({ "<": "\\u003c", ">": "\\u003e", "&": "\\u0026", "\u2028": "\\u2028", "\u2029": "\\u2029" })[character])
}
