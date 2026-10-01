/**
 * dsh-reasoning-effort, browser half.
 *
 * Adds a "reasoning effort" (思考强度) editor to the Models settings page, inside
 * a pi-ai provider's 自定义设置 body, right below the API protocol select and
 * above the model catalog. It writes `providers.<route>.models[i].reasoningEfforts`
 * in the `llm-pi-ai` settings namespace, which is what makes a hand-declared
 * model offer effort levels in the model picker.
 *
 * Placement: the page exposes no slot inside the provider editor, so the plugin
 * registers into the keyed `settings.models.provider-card` slot (one occurrence
 * per provider card) and portals its panel into the open editor's
 * customizedBody. Edits are held as a draft and written right after the editor's
 * own 「应用」 succeeds (the editor closes), so they never race the editor's
 * revision; 「取消」 discards them.
 *
 * Hand-written bundle: it only requires platform baseline modules, so it needs
 * no build step.
 */
window.__ModuleLoader__.load({
	id: "dsh-reasoning-effort",
	factory: (require) => {
		var module = { exports: {} }
		var exports = module.exports
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" })

		const react = require("react")
		const react_dom = require("react-dom")
		const react_jsx_runtime = require("react/jsx-runtime")
		const jsx = react_jsx_runtime.jsx
		const jsxs = react_jsx_runtime.jsxs

		const PLUGIN = "dsh-reasoning-effort"
		/** Dictionary namespace owned by this plugin. */
		const NS = "reasoningEffort"
		/** The pi-ai adapter's settings namespace (the only one with `reasoningEfforts`). */
		const SETTINGS_NS = "llm-pi-ai"
		/** pi-ai thinking levels, weakest first. */
		const LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"]
		/** How long after a click on the editor's 「应用」 its closing still counts as "applied". */
		const ARM_WINDOW_MS = 30000
		const EMPTY = Object.freeze({})

		//#region dictionaries

		const zh = {
			title: "思考强度",
			intro: "为每个模型声明可选的思考强度，保存后可在模型选择器里切换。改动随下方「应用」一起保存，「取消」会放弃。",
			applyPresets: "套用推荐预设（{count}）",
			undo: "撤销改动",
			"option.unsetDeclared": "未设置（不支持思考）",
			"option.unsetCatalog": "未设置（沿用内置目录）",
			"option.preset": "推荐预设 · {family}",
			"option.custom": "自定义",
			"option.disabled": "强制关闭思考",
			"chip.wire": "发送值：{wire}",
			"chip.silent": "不发送思考参数",
			"chip.group": "{model} 的思考级别",
			"select.label": "{model} 的思考强度",
			none: "—",
			dirty: "未保存",
			"hint.pending": "{count} 个模型有改动，点击下方「应用」后保存。",
			"hint.adaptive": "Claude 推荐预设会同时开启自适应思考（compat.forceAdaptiveThinking）。",
			"hint.noModels": "这个服务商还没有声明模型。先在下方模型目录里添加模型并点击「应用」，再回来配置思考强度。",
			"hint.catalog": "这个服务商使用内置模型目录，目录里的模型已自带思考强度。",
			"hint.loading": "正在读取配置…",
			"hint.readOnly": "当前配置只读。",
			"status.saved": "已保存 {count} 个模型的思考强度。如果模型选择器里没有立即出现，刷新页面即可。",
			"status.failed": "思考强度保存失败：{message}",
			"status.conflict": "配置在别处被修改了，请重新打开编辑后再试。",
		}

		const en = {
			title: "Reasoning effort",
			intro: "Declare the effort levels each model offers; the model picker can switch between them once saved. Changes are saved with Apply below, Cancel discards them.",
			applyPresets: "Apply recommended presets ({count})",
			undo: "Undo changes",
			"option.unsetDeclared": "Not set (no reasoning)",
			"option.unsetCatalog": "Not set (built-in catalog)",
			"option.preset": "Recommended · {family}",
			"option.custom": "Custom",
			"option.disabled": "Force reasoning off",
			"chip.wire": "Sends: {wire}",
			"chip.silent": "Sends no reasoning parameter",
			"chip.group": "Reasoning levels of {model}",
			"select.label": "Reasoning effort of {model}",
			none: "—",
			dirty: "Unsaved",
			"hint.pending": "{count} model(s) changed. Click Apply below to save.",
			"hint.adaptive": "Claude presets also turn on adaptive thinking (compat.forceAdaptiveThinking).",
			"hint.noModels": "This provider declares no models yet. Add models in the catalog below and Apply, then come back to set reasoning effort.",
			"hint.catalog": "This provider uses the built-in model catalog, whose models already carry reasoning effort.",
			"hint.loading": "Loading configuration…",
			"hint.readOnly": "The configuration is read-only.",
			"status.saved": "Saved reasoning effort for {count} model(s). Refresh the page if the model picker does not show it yet.",
			"status.failed": "Could not save reasoning effort: {message}",
			"status.conflict": "The configuration changed elsewhere. Reopen the editor and try again.",
		}

		//#endregion

		//#region presets

		/**
		 * Parse a compact effort spec: `"off=none,low,high"` declares `off` sending
		 * "none" and `low`/`high` sending their own names. A bare `off` sends nothing.
		 */
		function effortsOf(spec) {
			const out = {}
			for (const part of spec.split(",")) {
				const [level, wire] = part.split("=")
				out[level] = wire !== undefined ? wire : level === "off" ? null : level
			}
			return out
		}

		function preset(family, spec, adaptive) {
			return { family, efforts: effortsOf(spec), adaptive: adaptive === true }
		}

		/** `[major, minor]` is at least `[a, b]`. */
		function atLeast(major, minor, a, b) {
			return major > a || (major === a && minor >= b)
		}

		/**
		 * Reduce a provider-specific model id to its standard form: drop a vendor
		 * prefix (`openai/`), routing tags (`:thinking`, `@date`), proxy variant
		 * suffixes (`-thinking`, `-openai-compact`) and date stamps, and spell
		 * Claude versions with dashes (`claude-opus-4.7` → `claude-opus-4-7`).
		 */
		function normalizeModelId(id) {
			let s = String(id).trim().toLowerCase()
			s = s.slice(s.lastIndexOf("/") + 1)
			s = s.replace(/[:@].*$/, "")
			let previous
			do {
				previous = s
				s = s.replace(/-(?:thinking|nothinking|openai-compact|compact|preview|exp|\d{8}|\d{4}-\d{2}-\d{2})$/, "")
			} while (s !== previous)
			s = s.replace(/^claude-(opus|sonnet|haiku|fable)-(\d+)\.(\d+)/, "claude-$1-$2-$3")
			s = s.replace(/^claude-3\.7-/, "claude-3-7-")
			return s
		}

		/**
		 * The recommended effort levels of a standard GPT, Claude, Grok, GLM or
		 * MiMo model, mirroring the pi-ai 0.87.1 catalog. Claude drops `minimal`,
		 * which Anthropic's effort scale does not have (pi-ai maps it to `low`).
		 * @returns `{ family, efforts, adaptive }`, or null for an unrecognized or
		 * non-reasoning model.
		 */
		function presetFor(id) {
			const n = normalizeModelId(id)
			let m

			if ((m = /^gpt-(\d+)(?:\.(\d+))?(.*)$/.exec(n)) !== null) {
				const major = Number(m[1])
				const minor = m[2] === undefined ? 0 : Number(m[2])
				const rest = m[3]
				const at = (a, b) => atLeast(major, minor, a, b)
				if (!at(5, 0)) return null
				if (/^-chat(?:-|$)/.test(rest)) return major === 5 && minor === 2 ? preset("GPT", "medium,xhigh") : null
				if (/-pro(?:-|$)/.test(rest)) return preset("GPT", at(5, 2) ? "medium,high,xhigh" : "high")
				if (/-codex-spark(?:-|$)/.test(rest)) return preset("GPT", "low,medium,high,xhigh")
				if (at(6, 0)) return preset("GPT", /astra/.test(rest) ? "low,medium,high,xhigh,max" : "off=none,low,medium,high,xhigh,max")
				if (at(5, 6)) return preset("GPT", "off=none,low,medium,high,xhigh,max")
				if (at(5, 2)) return preset("GPT", "off=none,low,medium,high,xhigh")
				if (at(5, 1)) return preset("GPT", "off=none,low,medium,high")
				return preset("GPT", "minimal,low,medium,high")
			}

			if (/^gpt-oss(?:-|$)/.test(n)) return preset("GPT", "low,medium,high")
			if (/^o[134](?:-|$)/.test(n)) return preset("OpenAI o", "low,medium,high")

			if ((m = /^claude-(opus|sonnet|haiku|fable)-(\d+)(?:-(\d{1,2}))?(?:-|$)/.exec(n)) !== null) {
				const tier = m[1]
				const major = Number(m[2])
				const minor = m[3] === undefined ? 0 : Number(m[3])
				const at = (a, b) => atLeast(major, minor, a, b)
				if (tier === "fable" || (tier === "opus" && at(5, 0))) return preset("Claude", "low,medium,high,xhigh,max", true)
				if (at(4, 7)) return preset("Claude", "off,low,medium,high,xhigh,max", true)
				if (at(4, 6)) return preset("Claude", "off,low,medium,high,max", true)
				if (at(4, 0) && (tier !== "haiku" || at(4, 5))) return preset("Claude", "off,low,medium,high")
				return null
			}
			if (/^claude-3-7-sonnet(?:-|$)/.test(n)) return preset("Claude", "off,low,medium,high")

			if ((m = /^grok-(\d+)(?:\.(\d+))?(.*)$/.exec(n)) !== null) {
				const major = Number(m[1])
				const minor = m[2] === undefined ? 0 : Number(m[2])
				const at = (a, b) => atLeast(major, minor, a, b)
				if (at(4, 6)) return preset("Grok", "low,medium,high,xhigh")
				if (at(4, 5)) return preset("Grok", "low,medium,high")
				if (at(4, 3)) return preset("Grok", "off=none,low,medium,high")
				if (major === 3 && /mini/.test(m[3])) return preset("Grok", "low,high")
				return null
			}

			if ((m = /^glm-(\d+)(?:\.(\d+))?/.exec(n)) !== null) {
				const major = Number(m[1])
				const minor = m[2] === undefined ? 0 : Number(m[2])
				const at = (a, b) => atLeast(major, minor, a, b)
				if (at(5, 3)) return preset("GLM", "low,high,max")
				if (at(5, 2)) return preset("GLM", "off=none,high,max")
				if (at(4, 5)) return preset("GLM", "off,minimal,low,medium,high")
				return null
			}

			if ((m = /^(?:xiaomi-)?mimo-v(\d+)(?:\.(\d+))?/.exec(n)) !== null) {
				const major = Number(m[1])
				const minor = m[2] === undefined ? 0 : Number(m[2])
				return atLeast(major, minor, 2, 5) ? preset("MiMo", "off,minimal,low,medium,high") : null
			}

			return null
		}

		//#endregion

		//#region effort values

		const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key)
		const isEfforts = (value) => typeof value === "object" && value !== null && !Array.isArray(value)

		/** Same declared value: both absent, both `false`, or the same levels with the same wire values. */
		function effortsEqual(a, b) {
			if (!isEfforts(a) || !isEfforts(b)) return a === b
			for (const level of LEVELS) {
				if (hasOwn(a, level) !== hasOwn(b, level)) return false
				if (hasOwn(a, level) && a[level] !== b[level]) return false
			}
			return true
		}

		/** Copy an efforts dict, keyed weakest level first (keeps the YAML readable). */
		function orderEfforts(value) {
			const out = {}
			for (const level of LEVELS) if (hasOwn(value, level)) out[level] = value[level]
			return out
		}

		/** Display state of one model's declared value. */
		function classify(value, recommended) {
			if (value === undefined) return "unset"
			if (value === false) return "disabled"
			if (recommended !== null && effortsEqual(value, recommended.efforts)) return "preset"
			return "custom"
		}

		const DEFAULT_CUSTOM = effortsOf("off,low,medium,high")

		/** Whether a draft entry differs from what the model stores. */
		function isDirty(entry, model) {
			if (entry === undefined) return false
			if (!effortsEqual(entry.next, model.reasoningEfforts)) return true
			return entry.adaptive === true && model.compat?.forceAdaptiveThinking !== true
		}

		//#endregion

		//#region settings writes

		function getPath(value, path) {
			let current = value
			for (const key of path) {
				if (current === null || typeof current !== "object") return undefined
				current = current[key]
			}
			return current
		}

		const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)))

		/**
		 * Path ops applying `changes` (`{ id, next, adaptive }`) to one provider
		 * section. Each model is addressed by its index in the stored (user) list;
		 * when the user layer has no list holding every model, the whole effective
		 * list is written instead. Models no longer present are skipped.
		 */
		function computeOps(userSection, effectiveSection, settingsPath, changes) {
			const userModels = getPath(userSection, ["models"])
			const effectiveModels = getPath(effectiveSection, ["models"])
			const indexIn = (list, id) => (Array.isArray(list) ? list.findIndex((entry) => entry !== null && typeof entry === "object" && entry.id === id) : -1)
			const live = changes.filter((change) => indexIn(userModels, change.id) >= 0 || indexIn(effectiveModels, change.id) >= 0)
			const ops = []
			if (live.length === 0) return ops

			if (Array.isArray(userModels) && live.every((change) => indexIn(userModels, change.id) >= 0)) {
				for (const change of live) {
					const index = indexIn(userModels, change.id)
					const entry = userModels[index]
					const base = [...settingsPath, "models", String(index)]
					if (change.next === undefined) {
						if (entry.reasoningEfforts !== undefined) ops.push({ op: "unset", path: [...base, "reasoningEfforts"] })
					} else if (!effortsEqual(entry.reasoningEfforts, change.next)) {
						ops.push({ op: "set", path: [...base, "reasoningEfforts"], value: clone(change.next) })
					}
					if (change.adaptive === true && entry.compat?.forceAdaptiveThinking !== true) {
						ops.push({ op: "set", path: [...base, "compat", "forceAdaptiveThinking"], value: true })
					}
				}
				return ops
			}

			if (!Array.isArray(effectiveModels)) return ops
			const next = effectiveModels.map((entry) => {
				const change = live.find((candidate) => entry !== null && typeof entry === "object" && candidate.id === entry.id)
				const copy = clone(entry)
				if (change === undefined) return copy
				if (change.next === undefined) delete copy.reasoningEfforts
				else copy.reasoningEfforts = clone(change.next)
				if (change.adaptive === true) copy.compat = { ...(copy.compat ?? {}), forceAdaptiveThinking: true }
				return copy
			})
			ops.push({ op: "set", path: [...settingsPath, "models"], value: next })
			return ops
		}

		/**
		 * Write `changes` against a fresh read of the namespace, retrying a
		 * revision conflict twice (the editor may have written just before).
		 * @returns `{ ok: true, count }` or `{ ok: false, code, message }`.
		 */
		async function commitChanges(remote, mirror, settingsPath, changes) {
			for (let attempt = 0; attempt < 3; attempt += 1) {
				const described = await remote.settings.describe()
				if (!described.ok) return { ok: false, code: described.error.code, message: described.error.message }
				const view = described.value.namespaces.find((row) => row.ns === SETTINGS_NS)
				if (view === undefined) return { ok: false, code: "unavailable", message: `${SETTINGS_NS} is not served` }
				const ops = computeOps(getPath(view.user, settingsPath), getPath(view.value, settingsPath), settingsPath, changes)
				if (ops.length === 0) return { ok: true, count: 0 }
				const written = await remote.settings.mutate(SETTINGS_NS, ops, view.revision)
				if (written.ok) {
					try {
						mirror?.acceptView?.(written.value)
					} catch {
						/* the mirror re-reads on the document-updated event anyway */
					}
					return { ok: true, count: changes.length }
				}
				if (written.error.code !== "settings/conflict") return { ok: false, code: written.error.code, message: written.error.message }
			}
			return { ok: false, code: "settings/conflict", message: "conflict" }
		}

		//#endregion

		//#region DOM placement

		/** Whether an element carries a CSS-module class `name` (hashed as `_<hash>_name`). */
		function hasModuleClass(element, name) {
			if (element === null || element === undefined || element.classList === undefined) return false
			for (const value of element.classList) if (value === name || value.endsWith(`_${name}`)) return true
			return false
		}

		function findModuleClass(root, name) {
			for (const element of root.querySelectorAll(`[class*="${name}"]`)) if (hasModuleClass(element, name)) return element
			return null
		}

		/** The page's hashed class for `name` inside `root`, or "" when absent. */
		function moduleClassName(root, name) {
			const element = findModuleClass(root, name)
			if (element === null) return ""
			for (const value of element.classList) if (value === name || value.endsWith(`_${name}`)) return value
			return ""
		}

		/** The provider card around the slot occurrence: its row `li`, else the direct parent (the add panel). */
		function scopeOf(anchor) {
			let element = anchor.parentElement
			for (let depth = 0; depth < 3 && element !== null; depth += 1) {
				if (element.tagName === "LI") return element
				element = element.parentElement
			}
			return anchor.parentElement
		}

		/** Keep the host right below the protocol field, i.e. before the model catalog section. */
		function placeHost(body, host) {
			let catalog = null
			for (const child of body.children) {
				if (child === host) continue
				if (hasModuleClass(child, "modelCatalog") || findModuleClass(child, "modelCatalog") !== null) {
					catalog = child
					break
				}
			}
			if (catalog !== null) {
				if (host.parentElement !== body || host.nextElementSibling !== catalog) body.insertBefore(host, catalog)
			} else if (host.parentElement !== body) {
				body.appendChild(host)
			}
		}

		function classesFrom(body) {
			return {
				label: moduleClassName(body, "fieldLabel"),
				input: moduleClassName(body, "input"),
				select: moduleClassName(body, "selectInput"),
			}
		}

		const NO_CLASSES = Object.freeze({ label: "", input: "", select: "" })
		const cx = (...names) => names.filter(Boolean).join(" ")

		//#endregion

		//#region components

		const levelName = (level) => level.charAt(0).toUpperCase() + level.slice(1)

		function rowStateOf(model, pending) {
			const recommended = presetFor(model.id)
			const entry = hasOwn(pending, model.id) ? pending[model.id] : undefined
			const draft = entry !== undefined ? entry.next : model.reasoningEfforts
			const mode = entry !== undefined && entry.custom === true && isEfforts(draft) ? "custom" : classify(draft, recommended)
			return { model, recommended, entry, draft, mode, dirty: isDirty(entry, model) }
		}

		/**
		 * The effort editor body: one row per declared model with a mode select
		 * and its level chips. Stateless; the owner holds the draft.
		 */
		function ReasoningPanel(props) {
			const { t, models, api, declared, pending, readOnly, loading } = props
			const classes = props.classes ?? NO_CLASSES
			const label = jsx("span", { className: cx("dre-label", classes.label), children: t("title") }, "label")
			const hint = (text, key) => jsx("p", { className: "dre-hint", children: text }, key)

			if (loading) return jsxs("div", { className: "dre-panel", children: [label, hint(t("hint.loading"), "loading")] })
			if (models.length === 0) {
				return jsxs("div", { className: "dre-panel", children: [label, hint(declared ? t("hint.noModels") : t("hint.catalog"), "empty")] })
			}

			const anthropic = api === "anthropic-messages"
			const rows = models.map((model) => rowStateOf(model, pending))
			const presettable = rows.filter((row) => row.recommended !== null && row.mode !== "preset")
			const dirtyCount = rows.filter((row) => row.dirty).length
			const hasPending = Object.keys(pending).length > 0

			const applyPreset = (row) => {
				props.onChange(row.model, orderEfforts(row.recommended.efforts), { adaptive: anthropic && row.recommended.adaptive })
			}

			const choose = (row, value) => {
				if (value === "unset") props.onChange(row.model, undefined, {})
				else if (value === "disabled") props.onChange(row.model, false, {})
				else if (value === "preset") applyPreset(row)
				else {
					const base = isEfforts(row.draft) ? row.draft : row.recommended !== null ? row.recommended.efforts : DEFAULT_CUSTOM
					props.onChange(row.model, orderEfforts(base), { custom: true })
				}
			}

			const wireFor = (row, level) => {
				if (row.recommended !== null && hasOwn(row.recommended.efforts, level)) return row.recommended.efforts[level]
				return level === "off" ? null : level
			}

			const toggle = (row, level) => {
				const next = { ...row.draft }
				if (hasOwn(next, level)) delete next[level]
				else next[level] = wireFor(row, level)
				props.onChange(row.model, orderEfforts(next), { custom: true })
			}

			const chipTitle = (wire) => (typeof wire === "string" ? t("chip.wire", { wire }) : t("chip.silent"))

			const renderChips = (row) => {
				const name = typeof row.model.name === "string" && row.model.name.length > 0 ? row.model.name : row.model.id
				if (row.mode === "custom") {
					const nonOff = LEVELS.filter((level) => level !== "off" && hasOwn(row.draft, level)).length
					return jsx("div", {
						className: "dre-chips",
						role: "group",
						"aria-label": t("chip.group", { model: name }),
						children: LEVELS.map((level) => {
							const on = hasOwn(row.draft, level)
							return jsx(
								"button",
								{
									type: "button",
									className: cx("dre-chip", on && "dre-chip--on"),
									"aria-pressed": on,
									title: on ? chipTitle(row.draft[level]) : undefined,
									disabled: readOnly || (on && level !== "off" && nonOff === 1),
									onClick: () => toggle(row, level),
									children: levelName(level),
								},
								level,
							)
						}),
					})
				}
				if (!isEfforts(row.draft)) return null
				return jsx("div", {
					className: "dre-chips",
					children: LEVELS.filter((level) => hasOwn(row.draft, level)).map((level) =>
						jsx("span", { className: "dre-chip dre-chip--on", title: chipTitle(row.draft[level]), children: levelName(level) }, level),
					),
				})
			}

			const renderRow = (row) => {
				const { model } = row
				const name = typeof model.name === "string" && model.name.length > 0 ? model.name : model.id
				const options = [jsx("option", { value: "unset", children: declared ? t("option.unsetDeclared") : t("option.unsetCatalog") }, "unset")]
				if (row.recommended !== null) options.push(jsx("option", { value: "preset", children: t("option.preset", { family: row.recommended.family }) }, "preset"))
				options.push(jsx("option", { value: "custom", children: t("option.custom") }, "custom"))
				if (!declared || row.mode === "disabled") options.push(jsx("option", { value: "disabled", children: t("option.disabled") }, "disabled"))
				return jsxs(
					"li",
					{
						className: "dre-row",
						children: [
							jsxs("span", {
								className: "dre-model",
								children: [
									jsx("span", { className: "dre-name", title: model.id, children: name }),
									name !== model.id ? jsx("span", { className: "dre-id", children: model.id }) : null,
									row.dirty ? jsx("span", { className: "dre-tag", children: t("dirty") }) : null,
								],
							}),
							jsx("select", {
								className: cx(classes.input, classes.select, "dre-select"),
								value: row.mode,
								"aria-label": t("select.label", { model: name }),
								disabled: readOnly,
								onChange: (event) => choose(row, event.target.value),
								children: options,
							}),
							renderChips(row),
						],
					},
					model.id,
				)
			}

			const children = [
				jsxs(
					"div",
					{
						className: "dre-head",
						children: [
							label,
							jsxs("span", {
								className: "dre-actions",
								children: [
									hasPending
										? jsx("button", { type: "button", className: "dre-link", disabled: readOnly, onClick: props.onReset, children: t("undo") }, "undo")
										: null,
									jsx(
										"button",
										{
											type: "button",
											className: "dre-link",
											disabled: readOnly || presettable.length === 0,
											onClick: () => {
												for (const row of presettable) applyPreset(row)
											},
											children: t("applyPresets", { count: String(presettable.length) }),
										},
										"presets",
									),
								],
							}),
						],
					},
					"head",
				),
				hint(readOnly ? t("hint.readOnly") : t("intro"), "intro"),
				jsx("ul", { className: "dre-rows", children: rows.map(renderRow) }, "rows"),
			]
			if (anthropic && rows.some((row) => row.recommended !== null && row.recommended.adaptive)) children.push(hint(t("hint.adaptive"), "adaptive"))
			if (dirtyCount > 0) children.push(jsx("p", { className: "dre-hint dre-hint--pending", children: t("hint.pending", { count: String(dirtyCount) }) }, "pending"))
			return jsx("div", { className: "dre-panel", children })
		}

		/**
		 * One provider card's occurrence of the keyed provider-card slot. Renders a
		 * hidden anchor (and the last save status) in the slot position, and the
		 * panel through a portal while this card's provider editor is open.
		 */
		function ProviderCardReasoning(props) {
			const { provider, t, settingsSource, commitReasoning } = props
			const settingsPath = Array.isArray(provider?.settingsPath) ? provider.settingsPath : null
			const enabled = provider?.settingsNs === SETTINGS_NS && settingsPath !== null && settingsPath.length > 0

			const snapshot = react.useSyncExternalStore(settingsSource.subscribe, settingsSource.getSnapshot)
			const anchorRef = react.useRef(null)
			const hostRef = react.useRef(null)
			const armedRef = react.useRef(0)
			const mountedRef = react.useRef(true)
			const [host, setHost] = react.useState(null)
			const [classes, setClasses] = react.useState(NO_CLASSES)
			const [pending, setPending] = react.useState(EMPTY)
			const [status, setStatus] = react.useState(null)

			const view = snapshot?.view?.namespaces?.find((row) => row.ns === SETTINGS_NS)
			const section = enabled && view !== undefined ? getPath(view.value, settingsPath) : undefined
			const models = Array.isArray(section?.models)
				? section.models.filter((entry) => entry !== null && typeof entry === "object" && typeof entry.id === "string")
				: []
			const api = typeof section?.api === "string" ? section.api : undefined

			// The latest render's facts, read by the editor-closed handler.
			const latest = react.useRef(null)
			latest.current = { pending, models, settingsPath, commitReasoning }

			react.useEffect(() => {
				mountedRef.current = true
				return () => {
					mountedRef.current = false
				}
			}, [])

			react.useEffect(() => {
				if (status?.kind !== "saved") return undefined
				const timer = setTimeout(() => {
					if (mountedRef.current) setStatus(null)
				}, 8000)
				return () => clearTimeout(timer)
			}, [status])

			react.useEffect(() => {
				const anchor = anchorRef.current
				if (!enabled || anchor === null || typeof MutationObserver === "undefined") return undefined
				const scope = scopeOf(anchor)
				if (scope === null) return undefined

				/** The editor closed: write the draft if its 「应用」 closed it, else drop the draft. */
				const finish = () => {
					const armedAt = armedRef.current
					armedRef.current = 0
					const facts = latest.current
					const changes = facts.models
						.filter((model) => isDirty(facts.pending[model.id], model))
						.map((model) => ({ id: model.id, next: facts.pending[model.id].next, adaptive: facts.pending[model.id].adaptive === true }))
					if (mountedRef.current) setPending(EMPTY)
					latest.current = { ...facts, pending: EMPTY }
					if (changes.length === 0 || armedAt === 0 || Date.now() - armedAt > ARM_WINDOW_MS) return
					facts.commitReasoning(facts.settingsPath, changes).then(
						(result) => {
							if (!mountedRef.current) return
							if (result.ok) setStatus(result.count > 0 ? { kind: "saved", count: result.count } : null)
							else setStatus({ kind: "error", code: result.code, message: result.message })
						},
						(error) => {
							if (mountedRef.current) setStatus({ kind: "error", message: String(error?.message ?? error) })
						},
					)
				}

				const release = () => {
					const current = hostRef.current
					if (current === null) return
					hostRef.current = null
					current.remove()
					setHost(null)
					finish()
				}

				const sync = () => {
					const body = findModuleClass(scope, "customizedBody")
					if (body === null) {
						release()
						return
					}
					// When the editor remounts its body, placeHost moves the host along and the draft survives.
					let current = hostRef.current
					if (current === null) {
						current = document.createElement("div")
						current.className = "dre-host"
						current.dataset.plugin = PLUGIN
						hostRef.current = current
						setClasses(classesFrom(body))
						setStatus(null)
						setHost(current)
					}
					placeHost(body, current)
				}

				const onClick = (event) => {
					const target = event.target
					const button = target !== null && typeof target.closest === "function" ? target.closest("button") : null
					if (button === null || !hasModuleClass(button.parentElement, "editorActions")) return
					armedRef.current = hasModuleClass(button, "primaryButton") ? Date.now() : 0
				}

				const observer = new MutationObserver(sync)
				observer.observe(scope, { childList: true, subtree: true })
				scope.addEventListener("click", onClick, true)
				sync()
				return () => {
					observer.disconnect()
					scope.removeEventListener("click", onClick, true)
					const current = hostRef.current
					if (current !== null) {
						hostRef.current = null
						current.remove()
						finish()
					}
				}
			}, [enabled])

			if (!enabled) return null

			const onChange = (model, next, options) => {
				setPending((previous) => {
					const copy = { ...previous }
					const entry = { next, adaptive: options.adaptive === true, custom: options.custom === true }
					if (!entry.custom && !isDirty(entry, model)) delete copy[model.id]
					else copy[model.id] = entry
					return copy
				})
			}

			const statusText =
				status === null
					? null
					: status.kind === "saved"
						? t("status.saved", { count: String(status.count) })
						: status.code === "settings/conflict"
							? t("status.conflict")
							: t("status.failed", { message: status.message })

			const panel =
				host === null
					? null
					: react_dom.createPortal(
							jsx(ReasoningPanel, {
								t,
								models,
								api,
								declared: provider.declared === true,
								pending,
								readOnly: snapshot?.view?.writable === false,
								loading: view === undefined,
								classes,
								onChange,
								onReset: () => setPending(EMPTY),
							}),
							host,
						)

			return jsxs(react_jsx_runtime.Fragment, {
				children: [
					jsx("span", { ref: anchorRef, hidden: true, className: "dre-anchor" }, "anchor"),
					host === null && statusText !== null
						? jsx(
								"p",
								{ className: cx("dre-status", status.kind === "error" && "dre-status--error"), role: status.kind === "error" ? "alert" : "status", children: statusText },
								"status",
							)
						: null,
					panel,
				],
			})
		}

		//#endregion

		//#region styles

		const CSS = `
.dre-host{display:flex;flex-direction:column}
.dre-anchor{display:none}
.dre-panel{display:flex;flex-direction:column;gap:6px}
.dre-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.dre-label{color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:500;line-height:18px}
.dre-actions{display:inline-flex;align-items:center;gap:12px}
.dre-link{background:none;border:none;padding:0;font:inherit;font-size:12px;line-height:18px;color:var(--dsw-alias-brand-primary,#4d6bfe);cursor:pointer}
.dre-link:disabled{opacity:.45;cursor:default}
.dre-hint{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.dre-hint--pending{color:var(--dsw-alias-state-warn-label,#b26b00)}
.dre-rows{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;max-height:420px;overflow:auto;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md,8px)}
.dre-row{display:grid;grid-template-columns:minmax(0,1fr) 200px;gap:6px 10px;align-items:center;padding:8px 10px}
.dre-row+.dre-row{border-top:.5px solid var(--dsw-alias-border-l3)}
.dre-model{display:flex;align-items:baseline;gap:6px;min-width:0}
.dre-name{color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dre-id{color:var(--dsw-alias-label-tertiary);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dre-tag{flex:none;border:.5px solid currentColor;border-radius:4px;padding:0 5px;font-size:11px;line-height:16px;color:var(--dsw-alias-state-warn-label,#b26b00)}
.dre-select{width:100%;min-width:0}
.dre-chips{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:4px}
.dre-chip{font:inherit;font-size:11px;line-height:16px;padding:1px 8px;border-radius:999px;border:.5px solid var(--dsw-alias-border-l3);background:transparent;color:var(--dsw-alias-label-tertiary)}
button.dre-chip{cursor:pointer}
button.dre-chip:disabled{cursor:default}
.dre-chip--on{background:var(--dsw-alias-fill-l2,rgba(127,127,127,.14));border-color:var(--dsw-alias-border-l4);color:var(--dsw-alias-label-primary)}
.dre-status{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-state-success-primary)}
.dre-status--error{color:var(--dsw-alias-state-error-primary,#d33)}
`

		const STYLE_TAG_ID = "dsh-reasoning-effort/styles.css"

		function installStyles() {
			if (typeof document === "undefined") return
			if (document.querySelector(`style[data-plugin-css="${STYLE_TAG_ID}"]`) !== null) return
			const tag = document.createElement("style")
			tag.dataset.plugin = PLUGIN
			tag.dataset.pluginCss = STYLE_TAG_ID
			tag.textContent = CSS
			document.head.appendChild(tag)
		}

		//#endregion

		/** Client services this plugin needs. */
		const inject = ["slots", "locale", "remote", "remote.settings", "configForms"]

		function apply(ctx) {
			installStyles()
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), `${PLUGIN}: dictionaries`)

			const mirror = ctx.configForms.describe()
			mirror.ensure()
			// Stable identities: useSyncExternalStore resubscribes when `subscribe` changes.
			const settingsSource = {
				subscribe: (listener) => mirror.subscribe(listener),
				getSnapshot: () => mirror.getSnapshot(),
			}
			const commitReasoning = (settingsPath, changes) => commitChanges(ctx.remote, mirror, settingsPath, changes)
			const injected = () => ({ settingsSource, commitReasoning })

			ctx.slots.inject("settings.models.provider-card", function* () {
				yield ctx.slots.register(
					{ name: "settings.models.provider-card", key: SETTINGS_NS, locale: NS, inject: injected },
					ProviderCardReasoning,
				)
			})
		}

		exports.name = PLUGIN
		exports.apply = apply
		exports.inject = inject
		/** Pure helpers, exposed for the bundle's tests. */
		exports.__test = { LEVELS, normalizeModelId, presetFor, effortsEqual, classify, computeOps, commitChanges, ReasoningPanel, ProviderCardReasoning }
		return module.exports
	},
})
