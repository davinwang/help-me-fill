<div align="center">

# Help Me Fill 帮我填

**隐私优先的 AI 表单填写工具 —— 密钥在你手上，数据在你设备上，不经任何服务器。**

把任意 PDF、DOCX、XLSX、Markdown 或纯文本文档，一键映射为网页表单的答案。
自带 API Key，填写前逐字段审核，随时一键撤销。

[![CI](https://github.com/davinwang/help-me-fill/actions/workflows/ci.yml/badge.svg)](https://github.com/davinwang/help-me-fill/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](./LICENSE)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-4c8bf5)](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)
[![GitHub stars](https://img.shields.io/github/stars/davinwang/help-me-fill?style=social)](https://github.com/davinwang/help-me-fill/stargazers)

**[English README](./README.md)** · **[隐私政策](./docs/PRIVACY.md)** · **[路线图](./ROADMAP.md)** · **[贡献指南](./CONTRIBUTING.md)** · **[安全披露](./SECURITY.md)** · **[更新日志](./CHANGELOG.md)**

</div>

---

## 为什么要做这个

市面上所有 "AI 表单填写" 工具，几乎都把用户文档上传到**它们自己的服务器**处理：
你的简历、你的税务材料、你的医疗表、你的签证申请 —— 全部落到别人家的云、
用别人家的账号调用大模型、被别人的日志策略留存。

Help Me Fill 走了相反的路：

> **你的文档不离开浏览器，你的 API Key 不离开浏览器。没有服务端，没有账号体系，
> 因此也没有"数据库被拖走"这回事。**

整个插件运行在你的 Chrome / Edge 进程里。当你调用 AI 映射时，请求
**从你的浏览器直接发往你自己选择的模型提供方** —— Anthropic、OpenAI、Google、
DeepSeek、Moonshot（Kimi）、智谱 GLM、OpenRouter、你自己的阿里云百炼端点，
甚至可以是 **Chrome 内置的 Gemini Nano 端侧模型**（零联网调用）。

其他所有环节 —— PDF 解析、DOCX 解析、XLSX 解析、表单扫描、字段映射、
安全填写、撤销 —— 全部在本地浏览器进程完成，不上报任何埋点。

## 使用流程

1. **拖入文档** —— 支持 PDF、DOCX、XLSX、Markdown、纯文本。
2. **打开目标网页表单**（任意标签页）。
3. **点击插件图标** —— 侧边栏扫描当前表单、提取文档内容，
   调用你选择的 AI 提供方生成字段映射建议。
4. **逐条审核** —— 表格形式展示，逐字段编辑、拒绝或接受。
5. **点击"填写"** —— 使用兼容 React / Vue / Angular 的安全事件写入。
   不满意？一键撤销。

## 隐私保证

| 关心点 | 回答 |
|---|---|
| 我的文档去哪了？ | 由 `pdf.js` / `mammoth` / `xlsx` 在浏览器内解析，不上传。 |
| AI 请求发往哪里？ | 由浏览器直接发往你配置的模型提供方，无中间人。 |
| 插件会回传数据吗？ | 不会。零埋点、零遥测、没有任何 `fetch` 指向 help-me-fill 域名。 |
| API Key 存在哪？ | `chrome.storage.local` —— 由操作系统密钥链加密，仅本插件可读。 |
| 插件能读所有标签页吗？ | 不能。权限只有 `activeTab` + `sidePanel` + `scripting` + `storage`。host 权限是**可选**的，只在你启用某个提供方时才请求对应域名。 |
| 每个页面都注入内容脚本吗？ | 不。脚本只在你主动填写的那个标签页按需注入。 |
| 能完全离线使用吗？ | 可以。启用 **Chrome 内置 AI**（Gemini Nano）后，零联网调用、零 Key、零费用。 |
| 代码可审计吗？ | 可以。MIT 许可，约 5000 行 TypeScript，发布包不做混淆。 |

完整政策见 [docs/PRIVACY.md](./docs/PRIVACY.md)。

## 安装

### Chrome 应用商店

_即将上线，见 [#1](https://github.com/davinwang/help-me-fill/issues)。_

### 开发者模式加载

```bash
git clone https://github.com/davinwang/help-me-fill.git
cd help-me-fill
npm install
npm run build
```

然后在 Chrome 或 Edge 里：

1. 打开 `chrome://extensions/`
2. 开启右上角 **开发者模式**
3. 点击 **加载已解压的扩展程序**，选择 `dist/` 目录

## 快速开始

1. 点击插件图标打开侧边栏。
2. 在 **设置** 中选择一个提供方并粘贴 API Key，或启用 **Chrome 内置 AI**
   （需 Chrome 138+ 并开启对应 flag）。
3. 拖入文档。
4. 打开任意 HTML 表单，点击 **扫描并映射**。
5. 审核建议，点击 **填写**。

## 支持的模型提供方

全部为 BYO-Key 模式，插件本身不持有任何共享 Key，也不代理请求。

| 提供方 | 传输方式 | 端侧 | 获取 Key |
|---|---|---|---|
| Chrome 内置 AI（Gemini Nano） | `chrome.aiOrigin` | ✅ **是** | — （无需 Key） |
| Anthropic（Claude） | HTTPS 直连 | ❌ | [console.anthropic.com](https://console.anthropic.com/settings/keys) |
| OpenAI | HTTPS 直连 | ❌ | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| Google Gemini | HTTPS 直连 | ❌ | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) |
| DeepSeek | HTTPS 直连（OpenAI 兼容） | ❌ | [platform.deepseek.com](https://platform.deepseek.com/api_keys) |
| Moonshot（Kimi） | HTTPS 直连（OpenAI 兼容） | ❌ | [platform.moonshot.cn](https://platform.moonshot.cn/console/info) |
| 智谱 GLM | HTTPS 直连（OpenAI 兼容） | ❌ | [open.bigmodel.cn](https://open.bigmodel.cn/usercenter/apikeys) |
| OpenRouter | HTTPS 直连（OpenAI 兼容） | ❌ | [openrouter.ai/keys](https://openrouter.ai/keys) |
| 阿里云百炼（Qwen 专属端点） | HTTPS 直连（OpenAI 兼容） | ❌ | [bailian.console.aliyun.com](https://bailian.console.aliyun.com/?apiKey=1) |
| 任意其他 OpenAI 兼容端点 | HTTPS 直连 | ❌ | 你的提供方 |

新增提供方只需修改 `src/ai/registry.ts` 和 `src/ai/transports/`，约 50 行代码。
详见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 支持的文档格式

| 格式 | 后缀 | 解析器 | 说明 |
|---|---|---|---|
| PDF | `.pdf` | `pdf.js` | 支持文本层 PDF；扫描件 OCR 在路线图上 |
| Word | `.docx` | `mammoth` | 保留标题、列表等语义结构 |
| Excel | `.xlsx` | SheetJS | 首个工作表，支持 `标签: 值` 与两列布局 |
| Markdown | `.md` | 内置 | Front-matter、标题、定义列表 |
| 纯文本 | `.txt` | 内置 | 基于行的启发式提取 |

## 与同类产品对比

| | **Help Me Fill** | page-assist | Magically | LastPass / 1Password 自动填充 | Chrome 原生自动填充 |
|---|---|---|---|---|---|
| 开源 | ✅ MIT | ✅ MIT | ❌ | ❌ | ❌ |
| 自带 AI Key | ✅ | ✅ | ❌ | ❌ | — |
| 端侧 AI | ✅ Chrome 内置 | ✅ Chrome AI | ❌ | ❌ | — |
| 支持 PDF / DOCX / XLSX 填写 | ✅ | ❌ | 部分（PDF） | ❌ | ❌ |
| 填写前审核 | ✅ 完整表格 | ❌ | ❌ | ❌ | ❌ |
| 撤销 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 无遥测 | ✅ | ✅ | ❌ | ❌ | 部分 |
| 多提供方选择 | ✅ 9+ | ✅ | ❌ | ❌ | — |
| 框架感知填写（React/Vue/Angular） | ✅ | — | ✅ | ✅ | ✅ |

## 架构

```
┌───────────────────────────────────────────────────────────────────────┐
│                          Chrome 扩展                                   │
│                                                                       │
│  ┌────────────────┐    消息     ┌──────────────────────────────┐      │
│  │  侧边栏         │◄──────────►│  后台 Service Worker          │     │
│  │  (React 19)    │            │  • 提供方传输路由              │     │
│  │  • 拖放区       │            │  • chrome.storage 访问         │     │
│  │  • 审核 UI      │            │  • AI 注册表                   │     │
│  │  • 设置        │            └──────────────────────────────┘      │
│  │  • 结果        │                          │                        │
│  └────────────────┘                          │ BYO-Key HTTPS         │
│           │                                  ▼                        │
│           │ 消息                  ┌────────────────────────────┐      │
│           ▼                      │  你选择的 AI 提供方          │     │
│  ┌────────────────┐              │  （或端侧 Gemini Nano）      │     │
│  │ 内容脚本        │              └────────────────────────────┘      │
│  │ • scan.ts      │                                                   │
│  │ • fill.ts      │                                                   │
│  │ • undo.ts      │                                                   │
│  └────────────────┘                                                   │
│                                                                       │
│  解析器（懒加载分包）：pdf.js · mammoth · SheetJS · md · txt           │
└───────────────────────────────────────────────────────────────────────┘
```

三段式管线：**解析 → 映射 → 填写**，在映射与填写之间插入人工审核。
每一步都支持 `AbortSignal` 取消，每一步的错误都通过带类型的 `UserError`
反馈到 UI，可以优雅展示。

内部 wiki 详见 [.qoder/repowiki/en/content/Architecture Overview/](./.qoder/repowiki/en/content/Architecture%20Overview/)。

## 开发

前置：**Node 22.18+ 或 24+**，npm 10+。

```bash
npm install
npm run typecheck        # tsc --noEmit
npm run test             # vitest 单元测试
npm run test:e2e         # playwright（会先跑 build）
npm run build            # 产出 dist/
npm run benchmark        # 真实调用各提供方的基准测试（需要 .env 中的 Key）
npm run fixtures         # 重新生成合成测试 PDF
npm run fixtures:serve   # 在 http://127.0.0.1:5173 提供测试表单
```

构建产物是 `dist/` 下的 Manifest V3 未打包扩展，并会在构建后自动
校验权限清单、CSP、内容脚本分包。任一校验失败则构建失败 —— 这是刻意的，
不要在没有讨论的情况下放松这些约束。

## 测试

- **单元测试**（`tests/unit/`）—— 解析器、映射校验、提供方传输、内置 AI 能力门禁
- **集成测试**（`tests/integration/`）—— 在 jsdom 中运行内容脚本填写器
- **端到端测试**（`tests/e2e/`）—— Playwright 驱动真实 Chrome / Edge，加载构建后的扩展，填写真实的测试表单

一次跑完：`npm test && npm run test:e2e`

## 路线图

详见 [ROADMAP.md](./ROADMAP.md)。未来 3 个月重点：

- **iframe 支持** —— Workday / Greenhouse / Lever / SmartRecruiters 等招聘系统
- **文件输入支持** —— 自动上传简历 PDF 到 "上传附件" 字段
- **Firefox 移植** —— Manifest V3 + 浏览器差异 shim
- **UI 国际化** —— 中英双语先行，之后由社区驱动
- **表单档案** —— 跨站点保存常用答案
- **扫描件 OCR** —— 端侧 `tesseract.js`

## 参与贡献

请先阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)。简版：

1. 除非是小修小补，先开 issue 描述你的想法再写代码。
2. Fork 仓库，从 `main` 拉分支，保持提交原子化。
3. 本地跑通 `npm run typecheck && npm test && npm run build` —— CI 也是这套。
4. 向 `main` 提 PR，填好模板，关联对应 issue。

参与本项目即表示同意 [行为准则](./CODE_OF_CONDUCT.md)。

## 安全

本插件处理个人可识别信息（PII），安全缺陷按最高优先级处理。
**请不要在公开 issue 中披露漏洞** —— 使用 [SECURITY.md](./SECURITY.md)
中描述的私密披露流程。

## 许可

MIT © 2026 Davin Wang，详见 [LICENSE](./LICENSE)。

## 赞助

如果 Help Me Fill 帮你节省了时间，欢迎赞助开发：

- [GitHub Sponsors](https://github.com/sponsors/davinwang) _(配置中)_
- Buy Me a Coffee _(配置中)_

企业赞助方案可洽谈 —— `davin.wang@live.com`。

## 致谢

站在优秀的开源项目肩膀上：

- [pdf.js](https://github.com/mozilla/pdf.js) —— Mozilla 的 PDF 文本抽取
- [mammoth](https://github.com/mwilliamson/mammoth.js) —— DOCX 到语义 HTML
- [SheetJS](https://sheetjs.com/) —— XLSX 解析
- [React](https://react.dev/) 19
- [Vite](https://vite.dev/) 8
- [Zod](https://zod.dev/) —— 模式校验
- [Playwright](https://playwright.dev/) —— E2E 测试
- [Vitest](https://vitest.dev/) —— 单元测试

灵感来自每一个"第十五次把简历重新敲进 Workday 表单"的人的痛苦。

---

<div align="center">

**如果这个项目帮你节省了时间，请点个 Star。** 这是帮助更多人发现它的最有效信号。

</div>
