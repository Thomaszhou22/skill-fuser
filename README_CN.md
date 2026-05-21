# Markdown Fuser

<div align="center">

[English](./README.md) | [中文](#中文)

[![GitHub stars](https://img.shields.io/github/stars/Thomaszhou22/markdown-fuser?style=social)](https://github.com/Thomaszhou22/markdown-fuser/stargazers)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Deploy with Vercel](https://img.shields.io/badge/Vercel-indigo?style=flat&logo=vercel)](https://markdown-fuser.vercel.app)

[Live Demo](https://markdown-fuser.vercel.app) | [GitHub](https://github.com/Thomaszhou22/markdown-fuser) | [Research](#-研究背景)

</div>

---

---|------|
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
