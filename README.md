# Markdown Fuser

<div align="center">

[English](#english) | [中文](#中文)

[![GitHub stars](https://img.shields.io/github/stars/Thomaszhou22/markdown-fuser?style=social)](https://github.com/Thomaszhou22/markdown-fuser/stargazers)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Deploy with Vercel](https://img.shields.io/badge/Vercel-indigo?style=flat&logo=vercel)](https://markdown-fuser.vercel.app)

[Live Demo](https://markdown-fuser.vercel.app) | [GitHub](https://github.com/Thomaszhou22/markdown-fuser) | [Research](#-research-background)

</div>

---

<a id="english"></a>

## Introduction

Markdown Fuser is an AI-powered tool that merges and compresses multiple AI Agent SKILL.md files into optimized outputs. Based on the [SkillReducer](https://arxiv.org/abs/2603.29919) research paper, which found that only **38.5%** of Skill content is actionable core rules — and removing the rest actually **improves** Agent performance by **2.8%**.

## How It Works

### Fusion Mode (Core Feature)

```
Upload Skills → Classify by Type → Merge Same-Type Skills → Present All Results
```

**Step 1: AI Classification**
Each uploaded Skill is classified into one of 30 categories (based on the [VoltAgent/awesome-openclaw-skills](https://github.com/VoltAgent/awesome-openclaw-skills) taxonomy):

| Category | Examples |
|----------|----------|
| Web & Frontend | React patterns, CSS conventions, accessibility |
| AI & LLMs | Prompt engineering, model selection, API usage |
| Security | OWASP checklists, auth procedures, threat models |
| DevOps & Cloud | CI/CD, deployment, Docker, monitoring |
| Git & GitHub | Branching, PR workflows, commit conventions |
| + 25 more | CLI, Data, Gaming, Health, IoT, Media... |

**Step 2: Type-Aware Merging**
- Skills of the **same category** are merged using a **category-specific prompt** (28 custom prompts total)
  - e.g., Security skills merge with "NEVER remove any security rule"
  - e.g., Web skills merge with "Unify component patterns, keep the most robust version"
- Skills in categories not suited for merging are **kept as-is**
- Budget is split equally across mergeable groups

**Step 3: Grouped Results**
Results are presented in collapsible groups:
- **Merged groups** — show merged output with skill names
- **Kept Separate** — show original content for standalone skills

### Analysis Mode

Upload Skills → AI classifies every paragraph by importance (Core Rule / Background / Example / Template / Redundant) → outputs statistics report with recommended token budget

## Core Features

- **30 Skill Categories** — classification based on VoltAgent/awesome-openclaw-skills taxonomy
- **28 Custom Merge Prompts** — each category has a specialized prompt for higher quality merges
- **Unknown Category Detection** — if AI returns an unrecognized type, it's reported to the user and kept separate
- **Token Budget Control** — set output limit, budget auto-split across merge groups
- **Multi-model Support** — OpenAI, Anthropic, Google Gemini, DeepSeek, custom endpoints
- **Privacy First** — pure frontend, all data stays in your browser, no backend
- **History & Favorites** — save, search, and revisit past fusion results
- **Data Management** — export/import all data as JSON backup

## Quick Start

### Use Online (Recommended)

Visit: **[https://markdown-fuser.vercel.app](https://markdown-fuser.vercel.app)** — no signup, no install.

### How to Use

1. Click **"Add API Key"** (top right) → select AI provider → enter API Key
2. Paste Skill content or upload `.md` files in the left panel
3. Set **Target Output** token budget
4. Click **"Start Fusion"**
5. Review grouped results — copy or download

### Self-Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Thomaszhou22/markdown-fuser)

```bash
git clone https://github.com/Thomaszhou22/markdown-fuser.git
cd markdown-fuser
npm install
npm run dev    # Development
npm run build  # Production
```

## Supported AI Models

| Provider | Default Model | Notes |
|----------|--------------|-------|
| OpenAI | gpt-4o-mini | gpt-4o, gpt-4.1 series |
| Anthropic | claude-sonnet-4 | Sonnet/Haiku |
| Google Gemini | gemini-2.0-flash | Flash/Pro series |
| DeepSeek | deepseek-chat | Auto-configured |
| Custom | — | Any OpenAI-compatible endpoint |

> **Recommended**: Gemini Flash or GPT-4o-mini — fast, cheap, good enough.

## Research Background

Based on [SkillReducer: Optimizing LLM Agent Skills for Token Efficiency](https://arxiv.org/abs/2603.29919):

| Finding | Data |
|---------|------|
| Core rules in Skill files | Only 38.5% |
| Agent performance after removing non-essential content | **+2.8%** |
| Max compression ratio (lossless) | 60%+ |

**5-Level Classification**: Core Rule → Background → Example → Template → Redundant

**Compression Pipeline**: Classify → Deduplicate → Compress → Progressive Disclosure

## Tech Stack

React 19 + TypeScript + Tailwind CSS v4 + Vite 6 + Vercel

## License

MIT

---

<a id="中文"></a>

## 项目简介

Markdown Fuser 是一个 AI 驱动的 Skill 文件合并压缩工具。基于 [SkillReducer](https://arxiv.org/abs/2603.29919) 论文——研究发现 Skill 文件中只有 **38.5%** 是可执行的核心规则，删除非核心内容后 Agent 表现反而 **提升 2.8%**。

## 工作原理

### 合并压缩模式（核心功能）

```
上传 Skills → 按类型分类 → 同类型智能合并 → 分组展示结果
```

**第一步：AI 分类**
每个上传的 Skill 被自动分类到 30 种类型之一（基于 [VoltAgent/awesome-openclaw-skills](https://github.com/VoltAgent/awesome-openclaw-skills) 分类体系）：

| 类型 | 示例 |
|------|------|
| Web & 前端开发 | React 模式、CSS 规范、无障碍 |
| AI & LLMs | Prompt 工程、模型选择、API 调用 |
| 安全 | OWASP 检查清单、认证流程、威胁模型 |
| DevOps & 云 | CI/CD、部署、Docker、监控 |
| Git & GitHub | 分支策略、PR 流程、提交规范 |
| + 其他 25 种 | CLI、数据分析、游戏、健康、IoT、媒体... |

**第二步：类型感知合并**
- **同类型**的多个 Skill 用**该类型专属 prompt** 合并（共 28 个定制 prompt）
  - 比如：安全类合并时"绝不删除任何安全规则"
  - 比如：前端类合并时"统一组件模式，保留最健壮的版本"
- 不适合合并的类型**原样保留**
- Token 预算在可合并分组间平均分配

**第三步：分组展示**
结果按分组折叠展示：
- **已合并** — 显示合并结果和原始 Skill 名称
- **独立保留** — 显示原始内容

### 内容分析模式

上传 Skills → AI 按段落分类重要性（Core Rule / Background / Example / Template / Redundant）→ 输出统计报告和推荐预算

## 核心功能

- **30 种 Skill 类型** — 基于 VoltAgent/awesome-openclaw-skills 分类体系
- **28 个定制合并 Prompt** — 每种可合并类型都有专属 prompt，提高合并质量
- **未知类型检测** — AI 返回未识别类型时自动报告用户并独立保留
- **Token 预算控制** — 设定输出上限，预算自动分配到合并分组
- **多模型支持** — OpenAI、Anthropic、Google Gemini、DeepSeek、自定义端点
- **隐私安全** — 纯前端，所有数据仅在浏览器本地处理
- **历史记录 & 收藏** — 保存、搜索、回溯合并结果
- **数据管理** — JSON 导出/导入全量备份

## 快速开始

### 在线使用（推荐）

直接访问 **[https://markdown-fuser.vercel.app](https://markdown-fuser.vercel.app)** — 无需注册。

### 使用步骤

1. 点击右上角 **「Add API Key」** → 选择 AI 服务商 → 填入 API Key
2. 粘贴 Skill 内容或上传 `.md` 文件
3. 设置 **Target Output** token 预算
4. 点击 **「Start Fusion」**
5. 查看分组结果 — 复制或下载

### 自部署

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Thomaszhou22/markdown-fuser)

```bash
git clone https://github.com/Thomaszhou22/markdown-fuser.git
cd markdown-fuser
npm install
npm run dev    # 开发
npm run build  # 生产
```

## 支持的 AI 模型

| 服务商 | 默认模型 | 说明 |
|--------|---------|------|
| OpenAI | gpt-4o-mini | gpt-4o、gpt-4.1 系列 |
| Anthropic | claude-sonnet-4 | Sonnet/Haiku |
| Google Gemini | gemini-2.0-flash | Flash/Pro 系列 |
| DeepSeek | deepseek-chat | 自动配置 |
| 自定义 | — | 任何 OpenAI 兼容端点 |

> 推荐 **Gemini Flash** 或 **GPT-4o-mini**。

## 研究背景

基于 [SkillReducer](https://arxiv.org/abs/2603.29919) 论文：核心规则仅占 38.5%，删除非核心内容后 Agent 表现提升 2.8%，最大无损压缩比 60%+。

**5 级分类**：Core Rule → Background → Example → Template → Redundant

**压缩管线**：分类 → 去重 → 压缩 → Progressive Disclosure

## 技术栈

React 19 + TypeScript + Tailwind CSS v4 + Vite 6 + Vercel

## 许可证

MIT
