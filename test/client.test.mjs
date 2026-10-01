/**
 * Browser-half checks without a browser: a fake `window.__ModuleLoader__`
 * unpacks the bundle, then the tests check
 *   1. every require() is a platform baseline module;
 *   2. the slot registration shape;
 *   3. presets against the pi-ai 0.87.1 catalog snapshot and real proxy ids;
 *   4. the settings ops and the conflict-retrying commit;
 *   5. the panel's rendering and edit callbacks.
 *
 *   node test/client.test.mjs
 */
import fs from 'node:fs'
import assert from 'node:assert/strict'

const clientSrc = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const catalog = JSON.parse(fs.readFileSync(new URL('./fixtures/pi-ai-0.87.1-reasoning.json', import.meta.url), 'utf8'))

const BASELINE = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
])

let passed = 0
const test = async (name, fn) => {
  await fn()
  passed += 1
  console.log(`ok - ${name}`)
}

// --- fake runtime ---
const reactStub = {
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: (fn) => {
    fn()
  },
  useRef: (value) => ({ current: value }),
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
}
const element = (type, props, key) => ({ type, props, key })
const Fragment = Symbol('Fragment')
const portals = []
const requireStub = (spec) => {
  assert.ok(BASELINE.has(spec), `require("${spec}") must be a platform baseline module`)
  if (spec === 'react') return reactStub
  if (spec === 'react-dom') return { createPortal: (child, host) => (portals.push(host), { portal: child, host }) }
  if (spec === 'react/jsx-runtime') return { jsx: element, jsxs: element, Fragment }
  throw new Error(`unexpected module request: ${spec}`)
}

let record = null
const fakeWindow = { __ModuleLoader__: { load: (entry) => (record = entry) } }
new Function('window', clientSrc)(fakeWindow)
assert.equal(record.id, 'dsh-reasoning-effort', 'module id is the package name')
const mod = record.factory(requireStub)
const { LEVELS, normalizeModelId, presetFor, effortsEqual, classify, computeOps, commitChanges, ReasoningPanel, ProviderCardReasoning } = mod.__test

/** Every element in a rendered tree. */
function walk(node, out = []) {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, out)
  } else if (node !== null && typeof node === 'object') {
    if (node.portal !== undefined) walk(node.portal, out)
    if (node.type !== undefined) {
      out.push(node)
      walk(node.props?.children, out)
    }
  }
  return out
}
const t = (key, params) => (params ? `${key}${JSON.stringify(params)}` : key)

await test('requires only baseline modules', () => {
  const requested = [...clientSrc.matchAll(/require\("([^"]+)"\)/g)].map((match) => match[1])
  assert.deepEqual(requested.filter((spec) => !BASELINE.has(spec)), [])
})

await test('module face and slot registration', () => {
  assert.equal(mod.name, 'dsh-reasoning-effort')
  assert.deepEqual(mod.inject, ['slots', 'locale', 'remote', 'remote.settings', 'configForms'])
  const registrations = []
  const locales = []
  let ensured = 0
  const mirror = { ensure: () => (ensured += 1), subscribe: () => () => {}, getSnapshot: () => ({ status: 'idle' }) }
  mod.apply({
    effect: (fn) => fn(),
    locale: { register: (ns, dict) => locales.push({ ns, dict }) },
    configForms: { describe: () => mirror },
    remote: {},
    slots: {
      inject: (name, fn) => {
        for (const entry of fn()) registrations.push({ name, entry })
      },
      register: (spec, Component) => ({ spec, Component }),
    },
  })
  assert.equal(ensured, 1)
  assert.deepEqual(locales.map((entry) => entry.ns), ['reasoningEffort'])
  assert.deepEqual(Object.keys(locales[0].dict.zh).sort(), Object.keys(locales[0].dict.en).sort(), 'zh/en have the same keys')
  assert.equal(registrations.length, 1)
  const [{ name, entry }] = registrations
  assert.equal(name, 'settings.models.provider-card')
  assert.equal(entry.spec.name, 'settings.models.provider-card')
  assert.equal(entry.spec.key, 'llm-pi-ai')
  assert.equal(entry.spec.locale, 'reasoningEffort')
  const injected = entry.spec.inject()
  assert.equal(typeof injected.commitReasoning, 'function')
  assert.equal(injected.settingsSource.getSnapshot().status, 'idle')
  assert.equal(entry.Component, ProviderCardReasoning)
})

await test('presets match the pi-ai 0.87.1 catalog', () => {
  // gpt-realtime is a voice model, not a chat model a provider route declares.
  const skipped = new Set(['gpt-realtime-2.1'])
  for (const [provider, id, efforts] of catalog) {
    if (skipped.has(id)) continue
    let expected = efforts === false ? null : { ...efforts }
    // Anthropic's effort scale has no "minimal" (pi-ai maps it to "low").
    if (expected !== null && provider === 'anthropic') delete expected.minimal
    const actual = presetFor(id)
    assert.deepEqual(actual === null ? null : actual.efforts, expected, `${provider}/${id}`)
  }
})

await test('preset families and adaptive flag', () => {
  assert.equal(presetFor('claude-opus-4-7').adaptive, true)
  assert.equal(presetFor('claude-sonnet-4-5').adaptive, false)
  assert.equal(presetFor('gpt-5.5').family, 'GPT')
  assert.equal(presetFor('grok-4.6').family, 'Grok')
  assert.equal(presetFor('glm-5.3').family, 'GLM')
  assert.equal(presetFor('mimo-v2.6-pro').family, 'MiMo')
})

await test('proxy and vendor id variants resolve to the standard model', () => {
  const same = [
    ['gpt-5.6-terra-openai-compact', 'gpt-5.6-terra'],
    ['gpt-5.5-openai-compact', 'gpt-5.5'],
    ['claude-opus-4-6-thinking', 'claude-opus-4-6'],
    ['claude-sonnet-4-5-20250929-thinking', 'claude-sonnet-4-5'],
    ['anthropic/claude-sonnet-4.6', 'claude-sonnet-4-6'],
    ['openai/gpt-5.5', 'gpt-5.5'],
    ['x-ai/grok-4.6:thinking', 'grok-4.6'],
    ['XiaomiMiMo/MiMo-V2.5-Pro', 'mimo-v2.5-pro'],
    ['z-ai/glm-5.3', 'glm-5.3'],
    ['gpt-4o-2024-08-06', 'gpt-4o'],
  ]
  for (const [variant, base] of same) {
    assert.equal(normalizeModelId(variant), base, variant)
  }
  // Newer versions than the catalog fall into their family's latest shape.
  assert.deepEqual(Object.keys(presetFor('gpt-6.1').efforts), ['off', 'low', 'medium', 'high', 'xhigh', 'max'])
  assert.deepEqual(Object.keys(presetFor('claude-opus-6').efforts), ['low', 'medium', 'high', 'xhigh', 'max'])
  assert.deepEqual(Object.keys(presetFor('grok-5').efforts), ['low', 'medium', 'high', 'xhigh'])
  assert.deepEqual(Object.keys(presetFor('glm-6').efforts), ['low', 'high', 'max'])
  assert.deepEqual(Object.keys(presetFor('gpt-oss-120b-free').efforts), ['low', 'medium', 'high'])
  assert.equal(presetFor('claude-3-7-sonnet-20250219').family, 'Claude')
  for (const unknown of ['gpt-image-2', 'gpt-4.1', 'gpt-5-chat-latest', 'codex-auto-review', 'composer-2.5', 'claude-3-5-haiku', 'deepseek-ai/DeepSeek-V4-Flash', 'nemotron-3-super-free']) {
    assert.equal(presetFor(unknown), null, unknown)
  }
  // Every preset is valid for pi-ai: only "off" may send nothing, and some level beyond "off".
  for (const id of ['gpt-5', 'gpt-5.1', 'gpt-6-astra', 'claude-opus-5-5', 'grok-4.3', 'glm-5.2', 'mimo-v2.5', 'o3']) {
    const efforts = presetFor(id).efforts
    for (const [level, wire] of Object.entries(efforts)) {
      assert.ok(LEVELS.includes(level), `${id}: ${level}`)
      assert.ok(wire === null ? level === 'off' : typeof wire === 'string' && wire.length > 0, `${id}: ${level}`)
    }
    assert.ok(Object.keys(efforts).some((level) => level !== 'off'), id)
  }
})

await test('effortsEqual and classify', () => {
  assert.ok(effortsEqual(undefined, undefined))
  assert.ok(!effortsEqual(undefined, false))
  assert.ok(effortsEqual({ high: 'high', off: null }, { off: null, high: 'high' }))
  assert.ok(!effortsEqual({ off: null }, { off: 'none' }))
  assert.ok(!effortsEqual({ off: null }, {}))
  const recommended = presetFor('gpt-5.5')
  assert.equal(classify(undefined, recommended), 'unset')
  assert.equal(classify(false, recommended), 'disabled')
  assert.equal(classify({ ...recommended.efforts }, recommended), 'preset')
  assert.equal(classify({ high: 'high' }, recommended), 'custom')
  assert.equal(classify({ high: 'high' }, null), 'custom')
})

await test('computeOps addresses stored models by index', () => {
  const path = ['providers', 'yapi']
  const user = {
    models: [
      { id: 'gpt-5.5' },
      { id: 'claude-opus-4-7', reasoningEfforts: { high: 'high' } },
      { id: 'grok-4.6', reasoningEfforts: { low: 'low' } },
    ],
  }
  const ops = computeOps(user, user, path, [
    { id: 'gpt-5.5', next: { off: 'none', high: 'high' } },
    { id: 'claude-opus-4-7', next: { off: null, high: 'high' }, adaptive: true },
    { id: 'grok-4.6', next: undefined },
    { id: 'removed-model', next: { high: 'high' } },
  ])
  assert.deepEqual(ops, [
    { op: 'set', path: ['providers', 'yapi', 'models', '0', 'reasoningEfforts'], value: { off: 'none', high: 'high' } },
    { op: 'set', path: ['providers', 'yapi', 'models', '1', 'reasoningEfforts'], value: { off: null, high: 'high' } },
    { op: 'set', path: ['providers', 'yapi', 'models', '1', 'compat', 'forceAdaptiveThinking'], value: true },
    { op: 'unset', path: ['providers', 'yapi', 'models', '2', 'reasoningEfforts'] },
  ])
  // Already stored: nothing to write.
  assert.deepEqual(computeOps(user, user, path, [{ id: 'grok-4.6', next: { low: 'low' } }]), [])
})

await test('computeOps writes the whole list when the user layer lacks it', () => {
  const effective = { models: [{ id: 'glm-5.3', name: 'GLM' }, { id: 'glm-4.7' }] }
  const ops = computeOps({}, effective, ['providers', 'zai'], [{ id: 'glm-5.3', next: { low: 'low', high: 'high' } }])
  assert.deepEqual(ops, [
    {
      op: 'set',
      path: ['providers', 'zai', 'models'],
      value: [{ id: 'glm-5.3', name: 'GLM', reasoningEfforts: { low: 'low', high: 'high' } }, { id: 'glm-4.7' }],
    },
  ])
  assert.notEqual(ops[0].value[1], effective.models[1], 'the effective list is copied, not shared')
})

await test('commitChanges re-reads and retries a revision conflict', async () => {
  const path = ['providers', 'yapi']
  let revision = 4
  const calls = []
  const accepted = []
  const remote = {
    settings: {
      describe: async () => ({
        ok: true,
        value: { writable: true, namespaces: [{ ns: 'llm-pi-ai', revision, user: { providers: { yapi: { models: [{ id: 'gpt-5.5' }] } } }, value: { providers: { yapi: { models: [{ id: 'gpt-5.5' }] } } } }] },
      }),
      mutate: async (ns, ops, expected) => {
        calls.push({ ns, ops, expected })
        if (calls.length === 1) {
          revision = 5
          return { ok: false, error: { code: 'settings/conflict', message: 'changed' } }
        }
        return { ok: true, value: { ns, revision: expected + 1 } }
      },
    },
  }
  const result = await commitChanges(remote, { acceptView: (view) => accepted.push(view) }, path, [{ id: 'gpt-5.5', next: { high: 'high' } }])
  assert.deepEqual(result, { ok: true, count: 1 })
  assert.deepEqual(calls.map((call) => call.expected), [4, 5])
  assert.equal(calls[1].ns, 'llm-pi-ai')
  assert.deepEqual(accepted, [{ ns: 'llm-pi-ai', revision: 6 }])

  const refused = await commitChanges(
    { settings: { describe: remote.settings.describe, mutate: async () => ({ ok: false, error: { code: 'settings/invalid', message: 'bad' } }) } },
    undefined,
    path,
    [{ id: 'gpt-5.5', next: { low: 'low' } }],
  )
  assert.deepEqual(refused, { ok: false, code: 'settings/invalid', message: 'bad' })
})

await test('panel renders rows, options and chips', () => {
  const changes = []
  const tree = ReasoningPanel({
    t,
    api: 'openai-completions',
    declared: true,
    readOnly: false,
    loading: false,
    pending: { 'grok-4.6': { next: { low: 'low', high: 'high' }, custom: true } },
    models: [
      { id: 'gpt-5.5', name: 'GPT 5.5' },
      { id: 'claude-opus-4-7', reasoningEfforts: { off: null, low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' } },
      { id: 'grok-4.6' },
      { id: 'composer-2.5' },
    ],
    onChange: (model, next, options) => changes.push({ id: model.id, next, options }),
    onReset: () => changes.push('reset'),
  })
  const nodes = walk(tree)
  const rows = nodes.filter((node) => node.type === 'li')
  assert.deepEqual(rows.map((row) => row.key), ['gpt-5.5', 'claude-opus-4-7', 'grok-4.6', 'composer-2.5'])
  const selects = nodes.filter((node) => node.type === 'select')
  assert.deepEqual(selects.map((node) => node.props.value), ['unset', 'preset', 'custom', 'unset'])
  const optionsOf = (select) => select.props.children.map((option) => option.props.value)
  assert.deepEqual(optionsOf(selects[0]), ['unset', 'preset', 'custom'], 'declared route: no forced-off option')
  assert.deepEqual(optionsOf(selects[3]), ['unset', 'custom'], 'unrecognized model: no preset option')
  assert.ok(nodes.some((node) => node.type === 'span' && node.props.children === 'dirty'), 'the pending row is marked unsaved')

  // Custom row chips: toggling adds the level, the last non-off level cannot be removed.
  const chips = walk(rows[2]).filter((node) => node.type === 'button')
  assert.equal(chips.length, LEVELS.length)
  chips.find((chip) => chip.key === 'medium').props.onClick()
  assert.deepEqual(changes.pop(), { id: 'grok-4.6', next: { low: 'low', medium: 'medium', high: 'high' }, options: { custom: true } })
  assert.equal(chips.find((chip) => chip.key === 'low').props.disabled, false)

  // Selecting the preset for gpt-5.5 sends its catalog levels.
  selects[0].props.onChange({ target: { value: 'preset' } })
  assert.deepEqual(changes.pop(), {
    id: 'gpt-5.5',
    next: { off: 'none', low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh' },
    options: { adaptive: false },
  })
  selects[0].props.onChange({ target: { value: 'unset' } })
  assert.deepEqual(changes.pop(), { id: 'gpt-5.5', next: undefined, options: {} })

  // Bulk presets cover the recognized rows not already on their preset.
  const buttons = nodes.filter((node) => node.type === 'button' && node.props.className === 'dre-link')
  const bulk = buttons.find((node) => node.key === 'presets')
  assert.equal(bulk.props.children, 'applyPresets{"count":"2"}')
  bulk.props.onClick()
  assert.deepEqual(changes.splice(0).map((change) => change.id), ['gpt-5.5', 'grok-4.6'])
  buttons.find((node) => node.key === 'undo').props.onClick()
  assert.deepEqual(changes.pop(), 'reset')
})

await test('panel on an anthropic route turns on adaptive thinking for Claude presets', () => {
  const changes = []
  const tree = ReasoningPanel({
    t,
    api: 'anthropic-messages',
    declared: true,
    pending: {},
    models: [{ id: 'claude-opus-4-8' }, { id: 'claude-haiku-4-5' }],
    onChange: (model, next, options) => changes.push({ id: model.id, options }),
    onReset: () => {},
  })
  const nodes = walk(tree)
  assert.ok(nodes.some((node) => node.props?.children === 'hint.adaptive'))
  for (const select of nodes.filter((node) => node.type === 'select')) select.props.onChange({ target: { value: 'preset' } })
  assert.deepEqual(changes, [
    { id: 'claude-opus-4-8', options: { adaptive: true } },
    { id: 'claude-haiku-4-5', options: { adaptive: false } },
  ])
})

await test('panel empty and loading states', () => {
  const texts = (tree) => walk(tree).map((node) => node.props?.children).filter((value) => typeof value === 'string')
  assert.ok(texts(ReasoningPanel({ t, models: [], declared: true, pending: {}, loading: true })).includes('hint.loading'))
  assert.ok(texts(ReasoningPanel({ t, models: [], declared: true, pending: {} })).includes('hint.noModels'))
  assert.ok(texts(ReasoningPanel({ t, models: [], declared: false, pending: {} })).includes('hint.catalog'))
})

await test('card renders only an anchor until its editor opens', () => {
  const source = { subscribe: () => () => {}, getSnapshot: () => ({ status: 'ready', view: { writable: true, namespaces: [] } }) }
  const card = ProviderCardReasoning({
    t,
    provider: { provider: 'yapi', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'yapi'], declared: true },
    settingsSource: source,
    commitReasoning: async () => ({ ok: true, count: 0 }),
  })
  const nodes = walk(card)
  assert.deepEqual(nodes.map((node) => node.type), [Fragment, 'span'])
  assert.equal(nodes[1].props.hidden, true)
  assert.equal(portals.length, 0)
  const other = ProviderCardReasoning({ t, provider: { settingsNs: 'llm-deepseek', settingsPath: [] }, settingsSource: source, commitReasoning: async () => ({}) })
  assert.equal(other, null)
})

console.log(`\n${passed} tests passed`)
