# <img src="icon.svg" width="32" height="32" alt="" align="top"> dsh-desktop-ui-reasoning-effort

在 DSH 里接入第三方模型服务（比如 OpenAI 兼容的中转站、Anthropic 兼容接口）后，模型选择器里没有「思考强度」可选，GPT、Claude 这些明明支持思考的模型也只能用默认档位。这个插件在 **设置 → 模型** 里补上思考强度的配置，并给常见模型准备好推荐档位，点一下就能用。

## 目录

- [它做什么](#what-it-does)
- [安装](#install)
- [怎么用](#use-it)
- [推荐预设](#presets)
- [常见问题](#troubleshooting)
- [卸载](#uninstall)
- [维护者备注](#for-maintainers)
- [许可证](#license)

-----

<a id="what-it-does"></a>
## 它做什么

打开一个自定义服务商的编辑卡片，展开 **自定义设置**，在「API 协议」下面会多出一块 **思考强度** 面板：

- 这个服务商的每个模型占一行，可以选 **未设置**、**推荐预设** 或 **自定义**；
- 选「自定义」时，可以逐个开关 Off / Minimal / Low / Medium / High / XHigh / Max 七个档位；
- 右上角的 **套用推荐预设** 会把所有认得出的模型一次设好；
- 改动跟卡片底部的 **应用** 一起保存，点 **取消** 就全部放弃。

保存后，在对话框的模型选择器里选中这个模型，就能切换思考强度了。

支持 GPT、Claude、Grok、GLM、MiMo 系列的推荐预设，其他模型也可以自己勾选档位。

> npm 上另有一个名字相近的 `dsh-reasoning-effort`，那是另一个作者的插件：它会在后台自动给所有模型填上统一的五个档位。两者写的是同一处配置，不建议同时安装。

<a id="install"></a>
## 安装

用 DSH 自带的命令行安装，`dsh.cmd` 在 DSH 安装目录的 `resources\runtime\cli\bin\` 下。

**从 npm 安装**（推荐）：

```bat
dsh.cmd plugin --profile desktop add dsh-desktop-ui-reasoning-effort
```

**从 GitHub 安装**：拿到 main 分支上的最新代码。

```bat
dsh.cmd plugin --profile desktop add github:YIYuNCU/DSH-Reasoning-Effort
```

**从本机目录安装**：适合自己检出了一份代码，或者没法联网的情况。

```bat
git clone https://github.com/YIYuNCU/DSH-Reasoning-Effort.git
dsh.cmd plugin --profile desktop add link:<克隆下来的目录>
```

装完 **重启一次 DSH**。

如果重启后还是看不到面板，多半是插件没被选进 profile 的插件列表，补跑一次：

```bat
node "%USERPROFILE%\.dsh\profiles\desktop\node_modules\dsh-desktop-ui-reasoning-effort\scripts\enable-bundle.mjs" desktop
```

然后再重启。

**更新**：从 npm 或 GitHub 安装的，再跑一次同样的 `add` 命令，然后重启。从本机目录安装的，在目录里 `git pull`，然后重启。

<a id="use-it"></a>
## 怎么用

1. 打开 **设置 → 模型**，在要配置的服务商那一行点 **编辑**。
2. 展开 **自定义设置**，找到「API 协议」下面的 **思考强度**。
3. 给模型挑档位：
   - 想省事就点 **套用推荐预设**；
   - 或者在某个模型的下拉框里选「推荐预设」或「自定义」，自定义时点亮需要的档位。
   
   改过的行会标上「未保存」。
4. 点卡片底部的 **应用**。卡片收起后，那一行下面会提示「已保存 N 个模型的思考强度」。
5. 回到对话，在模型选择器里选中这个模型，就能看到思考强度选项。如果没有立刻出现，刷新一下页面。

想恢复原样，把模型改回「未设置」再应用就行。

<a id="presets"></a>
## 推荐预设

预设跟 DSH 内置模型目录里官方模型的档位保持一致。模型名带 `-thinking`、`-openai-compact`、日期后缀，或者带 `openai/`、`anthropic/` 这类前缀时，也能认出来。比目录更新的版本，按同系列最新一档处理。

| 系列 | 档位 |
|---|---|
| GPT | gpt-5：Minimal–High<br>gpt-5.1：Off–High<br>gpt-5.2 ～ 5.5：Off–XHigh<br>gpt-5.6、gpt-6：Off–Max（gpt-6-astra 没有 Off）<br>`-pro` 系列：Medium–XHigh<br>o1 / o3 / o4、gpt-oss：Low–High |
| Claude | 4.5：Off–High<br>4.6：Off–High，外加 Max<br>4.7、4.8、Sonnet 5：Off–Max<br>Opus 5 及以上：Low–Max |
| Grok | 4.3：Off–High<br>4.5：Low–High<br>4.6 及以上：Low–XHigh<br>grok-3-mini：Low / High |
| GLM | 4.5 ～ 5.1：Off–High<br>5.2：Off / High / Max<br>5.3 及以上：Low / High / Max |
| MiMo | v2.5 及以上：Off–High |

几点说明：

- **Off** 分两种：GPT 5.1 以后、Grok 4.3、GLM 5.2 选 Off 时，会明确告诉服务端「不思考」；其余模型选 Off 只是不带思考参数，由服务端按默认行为处理。
- Claude 的预设不含 Minimal，因为 Anthropic 自己没有这一档。
- 接口协议选的是 Anthropic Messages 时，Claude 4.6 及以上的预设会同时开启自适应思考，做法和 DSH 内置目录一致。
- 图像模型、gpt-4 系列、带 `chat` 的非思考版本，以及认不出的模型，都不提供预设。这些模型需要的话可以选「自定义」。

<a id="troubleshooting"></a>
## 常见问题

**编辑卡片里没有「思考强度」。** 先确认装完后重启过 DSH，并且已经展开了「自定义设置」。面板只出现在通过「自定义」添加的第三方服务商，和内置目录里的第三方服务商上；DeepSeek 官方服务商本来就自带思考强度，不会显示这块。还是没有的话，跑一下 [安装](#install) 里那条补充命令再重启。

**刚加的模型不在列表里。** 面板只列出已经保存的模型。先点「应用」把新模型存下来，再打开编辑配置思考强度。

**保存后模型选择器里还是没有思考强度。** 刷新页面。如果还是没有，回到编辑卡片看看这个模型是不是仍是「未设置」：那说明保存没成功，卡片下方会有失败原因。

**对话时报错，提示参数不支持或不认识某个档位。** 有些中转站只认一部分档位（比如不认 XHigh、Max 或 Minimal）。把这个模型改成「自定义」，去掉对方不认的档位后再应用。

**选了 Off，模型还是会思考。** 对多数模型来说，Off 的意思是「不发送思考参数」，有的服务端默认就会思考。这取决于服务商，插件改变不了。

**提示「配置在别处被修改了」。** 保存时，配置刚好被别的页面或命令改过。重新打开编辑卡片，再设一次。

**用的是内置目录里的服务商（比如智谱），面板显示「沿用内置目录」。** 内置目录里的模型本来就带思考强度，不用配置。只有想改掉默认档位时，才需要选「自定义」。

其他问题欢迎到 [Issues](https://github.com/YIYuNCU/DSH-Reasoning-Effort/issues) 反馈。反馈时请附上 DSH 版本、服务商的接口协议，以及出问题的模型名。

<a id="uninstall"></a>
## 卸载

打开 `%USERPROFILE%\.dsh\profiles\desktop\package.json`：

1. 从 `dependencies` 和 `dsh.profile.bundles` 里删掉 `dsh-desktop-ui-reasoning-effort`；
2. 删掉同目录 `node_modules` 下的 `dsh-desktop-ui-reasoning-effort` 联接；
3. 重启 DSH。

已经保存的思考强度留在模型配置里，卸载后照样生效。想去掉的话，卸载前先把模型改回「未设置」。

-----

<a id="for-maintainers"></a>
## 维护者备注

<details>
<summary>实现与测试，点击展开</summary>

### 目录结构

```
lib/client.js    页面半边：思考强度面板、预设表、配置写入（手写 bundle，不需要构建）
lib/index.js     宿主半边：空实现，只让 DSH 提供页面 bundle
cordis.patch.yml bundle 挂载声明
scripts/         enable-bundle.mjs，把包选进 profile 的 bundle 列表
test/            离线测试，附带 pi-ai 0.87.1 目录快照
```

### 工作方式

- 写入位置：`llm-pi-ai` 配置命名空间下的 `providers.<服务商>.models[i].reasoningEfforts`。Anthropic 协议下还会写 `compat.forceAdaptiveThinking`。写入走 `remote.settings.mutate`，按模型 id 定位下标。遇到 revision 冲突会重新读取后重试。
- 面板位置：设置页没有在编辑器内部开放插槽。插件注册在带 key 的 `settings.models.provider-card` 插槽上（key 为 `llm-pi-ai`），再用 portal 把面板挂进编辑器的 `customizedBody`，放在 `modelCatalog` 前面。定位靠 CSS module 类名后缀，DSH 改了这块结构时，面板只是不显示，不影响编辑器。
- 保存时机：改动先留在草稿里。用户点了编辑器的「应用」（`editorActions` 里的 `primaryButton`），并且编辑器在 30 秒内关闭时，才写入配置。编辑器以任何其他方式关闭，草稿都会丢弃。这样不会和编辑器自己的 revision 抢写。

### 测试

```bat
node test/client.test.mjs
```

测试不依赖 DSH。它用一个假的 `window.__ModuleLoader__` 拆开 bundle，然后检查：
- 每个 `require` 都在平台种子表里；
- 插槽注册的形状正确；
- 预设和 pi-ai 0.87.1 目录逐条一致；
- 模型名变体和新版本号能正确识别；
- 写入操作和冲突重试符合预期；
- 面板的渲染和交互正常。

### 发布

推送到 main 或提 PR 时，[CI](.github/workflows/ci.yml) 会在 Node 20 / 22 上跑测试，并检查打包内容。

发版本时推一个 `v*` 标签，[Publish](.github/workflows/publish.yml) 会跑测试、发布到 npm（带 provenance），再创建 GitHub Release：

```bat
npm version patch
git push --follow-tags
```

- 标签必须和 `package.json` 的 version 一致，否则发布失败。
- 版本号带 `-`（如 `0.2.0-rc.1`）时发到 npm 的 `next` 标签，不覆盖 `latest`。
- 这个版本已经在 npm 上时，跳过发布。
- 认证走 npm Trusted Publishing，不需要 token：在 npm 包设置的 Trusted Publisher 里登记仓库 `YIYuNCU/DSH-Reasoning-Effort` 和 workflow 文件 `publish.yml`。

</details>

<a id="license"></a>
## 许可证

MIT，见 [LICENSE](LICENSE)。
