# Markdown Fuser 🔀

<div align="center">

[English](#english) | [中文](#中文)

[![GitHub stars](https://img.shields.io/github/stars/Thomaszhou22/markdown-fuser?style=social)](https://github.com/Thomaszhou22/markdown-fuser/stargazers)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Deploy with Vercel](https://img.shields.io/badge/Vercel-indigo?style=flat&logo=vercel)](https://markdown-fuser.vercel.app)

[🌐 在线使用](https://markdown-fuser.vercel.app) | [📦 GitHub](https://github.com/Thomaszhou22/markdown-fuser) | [📖 技术背景](#-研究背景)

</div>

---

<a id="中文"></a>

## 📖 项目简介

Markdown Fuser 是一个 AI 驱动的 **Skill 文件合并压缩工具**。当你安装了大量 AI Agent 的 SKILL.md 文件时，每次加载都消耗大量 Token。这个工具帮你：

- 📚 **合并多个 Skill 文件** — 上传或粘贴多个 .md 文件
- 🎯 **精确控制 Token 预算** — 设定输出上限，自动压缩
- 🧠 **智能去重压缩** — 基于 [SkillReducer](https://arxiv.org/abs/2603.29919) 研究方法论
- 🔬 **内容分析** — 分类每个段落的重要性（Core Rule / Background / Example / Template / Redundant）

> 研究表明：只有 **38.5%** 的 Skill 内容是可执行的核心规则。删掉非核心内容后，Agent 表现反而 **提升 2.8%**。

## 🎥 功能演示

### 合并压缩模式
粘贴多个 SKILL.md → 设置 Token 预算 → 一键合并去重 → 输出压缩后的最优 Skill 文件

### 内容分析模式
上传 Skill 文件 → AI 自动分类每个段落 → 输出统计报告 + 推荐预算

## ✨ 核心功能

- 🔀 **智能合并** — 多文件去重合并，消除重叠内容
- 🎯 **Token 预算控制** — 精确设定输出 token 数量
- 🧠 **SkillReducer 方法论** — 5级分类 → 去重 → 压缩 → Progressive Disclosure 输出
- 🔬 **内容分析** — 按段落分类：Core Rule / Background / Example / Template / Redundant
- 🤖 **多模型支持** — OpenAI、Anthropic、Google Gemini、DeepSeek、自定义端点
- 📎 **文件上传** — 支持拖拽或点击上传 .md / .markdown / .txt
- 📋 **一键复制/下载** — 复制到剪贴板或下载为 .md 文件
- 🔒 **隐私安全** — 纯前端，所有数据仅在浏览器本地处理，不上传任何服务器
- 📊 **压缩统计** — 实时显示压缩比例和 token 数

## 🚀 快速开始

### 1. 在线使用（推荐）

直接访问：**[https://markdown-fuser.vercel.app](https://markdown-fuser.vercel.app)**

无需注册，无需安装，打开即用。

### 2. 使用步骤

```
1. 点击右上角「⚙️ 模型设置」→ 选择 AI 服务商 → 填入 API Key → 点击「启用」
2. 在左侧面板粘贴 Skill 内容，或点击「📎 上传」导入 .md 文件
3. 设置 Token 预算（合并模式）
4. 点击「🔀 开始合并压缩」或「🔬 分析内容构成」
5. 在右侧面板查看结果，一键复制或下载
```

### 3. 自部署

#### Vercel 一键部署

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Thomaszhou22/markdown-fuser)

#### 手动部署

```bash
git clone https://github.com/Thomaszhou22/markdown-fuser.git
cd markdown-fuser
npm install
npm run build
# 将 dist/ 目录部署到任意静态托管服务
```

#### 本地开发

```bash
git clone https://github.com/Thomaszhou22/markdown-fuser.git
cd markdown-fuser
npm install
npm run dev
# 打开 http://localhost:5173
```

## ⚙️ 支持的 AI 模型

| 服务商 | 默认模型 | 说明 |
|--------|---------|------|
| 🟢 OpenAI | gpt-4o-mini | 支持 gpt-4o、gpt-4.1 系列 |
| 🟠 Anthropic | claude-sonnet-4 | 支持 Claude Sonnet/Haiku |
| 🔵 Google Gemini | gemini-2.0-flash | 支持 Flash/Pro 系列 |
| 🟣 DeepSeek | deepseek-chat | 自动配置端点 |
| ⚙️ Custom | 自定义 | 任何 OpenAI 兼容端点 |

> 💡 推荐 **Gemini Flash** 或 **GPT-4o-mini** — 速度快、成本低，压缩效果足够好。

## 📖 研究背景

本项目基于 [SkillReducer: Optimizing LLM Agent Skills for Token Efficiency](https://arxiv.org/abs/2603.29919) 论文的核心方法论：

### 核心发现

| 发现 | 数据 |
|------|------|
| Skill 文件中核心规则占比 | 仅 38.5% |
| 删掉非核心内容后 Agent 表现 | **+2.8%** |
| 最大压缩比（无损性能） | 60%+ |

### 5 级分类体系

```
Core Rule    → 可执行指令（必须保留）
Background   → 解释说明（可删除）
Example      → 代码示例（按需保留）
Template     → 模板格式（合并去重）
Redundant    → 重复内容（必须删除）
```

### 压缩管线

```
1. CLASSIFY   — 分类每个段落的重要性等级
2. DEDUPLICATE — 合并重叠规则，消除重复内容
3. COMPRESS   — 压缩到 Token 预算内，输出 Progressive Disclosure 结构
```

## 🗺️ Roadmap

- [x] 多文件合并压缩
- [x] Token 预算控制
- [x] 内容分析模式
- [x] 多模型支持（OpenAI / Anthropic / Gemini / DeepSeek / Custom）
- [x] 文件上传（拖拽 + 点击）
- [x] 复制 / 下载结果
- [ ] Markdown 预览渲染
- [ ] 批量处理（一次处理多组 Skill）
- [ ] 压缩质量评分（对比原始 vs 压缩后的信息保留度）
- [ ] 历史记录（本地存储）
- [ ] Chrome 扩展版本

## 🛠️ 技术栈

- **前端框架**: React 19 + TypeScript
- **样式**: Tailwind CSS v4
- **构建工具**: Vite 6
- **部署**: Vercel
- **AI 调用**: 浏览器直连 API（无后端）

## 🤝 贡献

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some feature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 发起 Pull Request

## 📄 License

MIT License — 可自由使用、修改和商业分发。

---

<a id="english"></a>

## 📖 Introduction

Markdown Fuser is an AI-powered **Skill file merger & compressor**. When you have many SKILL.md files for AI Agents, each load costs tokens. This tool helps you:

- 📚 **Merge multiple Skill files** — upload or paste .md files
- 🎯 **Control Token budget** — set output limit, auto-compress
- 🧠 **Smart deduplication** — based on [SkillReducer](https://arxiv.org/abs/2603.29919) methodology
- 🔬 **Content analysis** — classify each paragraph's importance

> Research shows only **38.5%** of Skill content is actionable core rules. Removing non-essential content **improves** Agent performance by **2.8%**.

## 🚀 Quick Start

**[Try it online →](https://markdown-fuser.vercel.app)** — no signup, no install.

```
1. Click ⚙️ Model Settings → select provider → enter API Key → Enable
2. Paste Skill content or upload .md files
3. Set Token budget
4. Click "🔀 Start Fusion" or "🔬 Analyze"
5. Copy or download the result
```

## 🤝 Contributing

PRs welcome! Fork → Branch → Commit → Push → Pull Request.

## 📄 License

MIT License.
