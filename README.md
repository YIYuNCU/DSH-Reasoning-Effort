# dsh-reasoning-effort

DSH 插件：在 **设置 → 模型** 里，给 pi-ai 自定义服务商（OpenAI / Anthropic 兼容接口）的每个模型配置思考强度。

DSH 自带的设置页不提供这个控件。手工声明的模型没有 `reasoningEfforts` 时，pi-ai 会把它当成不支持思考的模型，模型选择器里也就不会出现强度选项。本插件在服务商编辑卡片的「自定义设置」里，「API 协议」下方、模型目录上方加了一块「思考强度」面板：

- 每个已声明的模型一行，可以选「未设置」「推荐预设」「自定义」（逐个勾选 Off / Minimal / Low / Medium / High / XHigh / Max）。
- 「套用推荐预设」会一次把所有能识别的模型设成预设。
- 改动随编辑卡片底部的「应用」一起保存，点「取消」会放弃。

保存位置是 `llm-pi-ai` 配置里的 `providers.<服务商>.models[i].reasoningEfforts`。

## 预设

预设按 pi-ai 0.87.1 内置目录整理，会自动去掉 `-thinking`、`-openai-compact`、日期后缀和 `vendor/` 前缀再匹配。

| 系列 | 规则 |
|---|---|
| GPT | gpt-5：minimal–high；gpt-5.1：off(none)–high；gpt-5.2–5.5：off(none)–xhigh；gpt-5.6 / gpt-6：off(none)–max（gpt-6-astra 没有 off）；`-pro`：medium–xhigh；o1/o3/o4、gpt-oss：low–high |
| Claude | 4.5：off–high；4.6：off–high 加上 max；4.7 / 4.8 / sonnet-5：off–max；opus-5 及以上、fable：low–max。不提供 minimal，因为 Anthropic 的强度档位里没有它 |
| Grok | 4.3：off(none)–high；4.5：low–high；4.6 及以上：low–xhigh；grok-3-mini：low / high |
| GLM | 4.5–5.1：off–high；5.2：off(none) / high / max；5.3 及以上：low / high / max |
| MiMo | v2.5 及以上：off–high |

`off` 不带值时表示「不发送思考参数」，`off(none)` 表示发送 `none`。如果路由协议是 `anthropic-messages`，4.6 及以上 Claude 的预设还会写入 `compat.forceAdaptiveThinking: true`，和内置目录的做法一致。

## 安装

`dsh.cmd` 在 DSH 安装目录的 `resources\runtime\cli\bin\` 下：

```bat
dsh.cmd plugin --profile desktop add link:G:\Code\DSH\DSH-Reasoning-Effort
```

正常情况下这一步会同时把包加进 profile 的 `dsh.profile.bundles`。如果插件没有被加载，再补跑一次：

```bat
node G:\Code\DSH\DSH-Reasoning-Effort\scripts\enable-bundle.mjs desktop
```

装完后重启 DSH。卸载时，从 `%USERPROFILE%\.dsh\profiles\desktop\package.json` 的 `dependencies` 和 `dsh.profile.bundles` 里去掉 `dsh-reasoning-effort`，删掉 `node_modules` 下的同名联接，然后重启。已经写进配置的 `reasoningEfforts` 会保留，pi-ai 照样认。

## 说明

- 面板只列出已经保存的模型。新加的模型需要先点「应用」保存，再打开编辑。
- 设置页在编辑器里没有开放插槽。插件注册到 `settings.models.provider-card` 插槽，再把面板挂进编辑器的 DOM（按 CSS module 类名后缀 `_customizedBody` / `_modelCatalog` 定位）。如果以后 DSH 改了这块结构，面板会直接不显示，不会影响编辑器本身。
- 请求时发送的值由 pi-ai 决定：Chat Completions 发 `reasoning_effort`（或按 `compat.thinkingFormat` 转换），Responses 发 `reasoning.effort`，Anthropic 发 effort 或思考预算。

## 测试

```bat
node test/client.test.mjs
```

## 许可

MIT，见 [LICENSE](LICENSE)。
