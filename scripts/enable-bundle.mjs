/**
 * 安装收尾：把本插件选进 profile 的 `dsh.profile.bundles`。
 * `dsh plugin add` 只把包装进 node_modules，DSH 启动时按这个列表叠加 bundle patch。
 *
 * 用法：node scripts/enable-bundle.mjs [profile]   # 默认 desktop
 * 环境变量 DSH_HOME 可覆盖 DSH 主目录（默认 ~/.dsh）。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const NAME = 'dsh-desktop-ui-reasoning-effort'
const profile = process.argv[2] ?? 'desktop'
const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const file = path.join(home, 'profiles', profile, 'package.json')

if (!fs.existsSync(file)) {
  console.error(`找不到 profile 清单：${file}`)
  process.exit(1)
}

const doc = JSON.parse(fs.readFileSync(file, 'utf8'))
doc.dsh ??= {}
doc.dsh.profile ??= {}
doc.dsh.profile.bundles ??= []

if (doc.dsh.profile.bundles.includes(NAME)) {
  console.log(`${NAME} 已经在 bundles 列表里，无需改动。`)
} else {
  doc.dsh.profile.bundles.push(NAME)
  fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
  console.log(`已把 ${NAME} 写进 ${file} 的 dsh.profile.bundles`)
}
console.log(`bundles: ${doc.dsh.profile.bundles.join(', ')}`)
