# Markdown Fuser

<div align="center">

[English](./README.md) | [中文](#中文)

[![GitHub stars](https://img.shields.io/github/stars/Thomaszhou22/markdown-fuser?style=social)](https://github.com/Thomaszhou22/markdown-fuser/stargazers)
[![License](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![Deploy with Vercel](https://img.shields.io/badge/Vercel-indigo?style=flat&logo=vercel)](https://markdown-fuser.vercel.app)

[在线演示](https://markdown-fuser.vercel.app) | [GitHub](https://github.com/Thomaszhou22/markdown-fuser) | [研究背景](#研究背景)

</div>

---

<a id="中文"></a>

## 项目简介

Markdown Fuser 是一个 AI 驱动的工具，用于将多个 AI Agent 的 SKILL.md 文件合并压缩为优化输出。基于 [SkillReducer](https://arxiv.org/abs/2603.29919) 研究论文——研究发现 Skill 文件中只有 **38.5%** 是可执行的核心规则，删除非核心内容后 Agent 表现反而 **提升 2.8%**。

## 实机演示

<p align="center"><b>Fusion 50% — 激进压缩</b><br/>仅保留核心规则，移除示例与背景说明</p>

<img src="docs/demo-fusion-50.png" alt="Fusion 50% demo" />

<p align="center"><b>Fusion 90% — 轻度压缩</b><br/>保留大部分细节，仅合并重复内容</p>

<img src="docs/demo-fusion-90.png" alt="Fusion 90% demo" />

<p align="center"><b>Analysis — 内容审查</b><br/>按重要性对每个段落分类，输出统计报告与推荐预算</p>

<img src="docs/demo-analyze.png" alt="Analysis demo" />

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

本项目基于 [GNU Affero General Public License v3.0](LICENSE) 开源。

简单来说：你可以自由使用、学习和修改本项目。但如果你分发修改后的版本（包括作为网络服务），你**必须**以 AGPL-3.0 许可证公开你的源代码。

你可以：
- ✅ 个人使用、学习和研究
- ✅ 修改和适配用于任何目的
- ✅ 作为网络服务使用

你必须：
- 📋 如果你分发或以网络服务形式提供修改版本，必须以 AGPL-3.0 公开源代码
- 📝 保留原始版权声明和许可证文本

核心原则：共享精神 — 如果你改进了它，就把改进分享给社区。
