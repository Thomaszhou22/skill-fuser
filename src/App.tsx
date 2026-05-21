import { useState, useCallback, useRef } from 'react'

interface SkillInput {
  id: string
  name: string
  content: string
}

interface ProviderConfig {
  id: string
  name: string
  icon: string
  models: string[]
  defaultModel: string
  enabled: boolean
  apiKey: string
  customEndpoint?: string
  status: 'idle' | 'testing' | 'ok' | 'fail'
}

type FuseMode = 'fusion' | 'analysis'

function generateId() {
  return Math.random().toString(36).slice(2, 8)
}

function estimateTokens(text: string): number {
  const cjk = (text.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).length
  const rest = text.length - cjk
  return Math.ceil(cjk / 2 + rest / 4)
}

const DEFAULT_PROVIDERS: ProviderConfig[] = [
  { id: 'openai', name: 'OpenAI', icon: '🟢', models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'], defaultModel: 'gpt-4o-mini', enabled: false, apiKey: '', status: 'idle' },
  { id: 'anthropic', name: 'Anthropic', icon: '🟠', models: ['claude-sonnet-4-20250514', 'claude-haiku-4-20250514'], defaultModel: 'claude-sonnet-4-20250514', enabled: false, apiKey: '', status: 'idle' },
  { id: 'google', name: 'Google Gemini', icon: '🔵', models: ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'], defaultModel: 'gemini-2.0-flash', enabled: false, apiKey: '', status: 'idle' },
  { id: 'deepseek', name: 'DeepSeek', icon: '🟣', models: ['deepseek-chat', 'deepseek-reasoner'], defaultModel: 'deepseek-chat', enabled: false, apiKey: '', status: 'idle', customEndpoint: 'https://api.deepseek.com/v1/chat/completions' },
  { id: 'custom', name: 'OpenAI Compatible', icon: '⚙️', models: [], defaultModel: 'custom-model', enabled: false, apiKey: '', status: 'idle', customEndpoint: '' },
]

export default function App() {
  const [skills, setSkills] = useState<SkillInput[]>([
    { id: generateId(), name: 'SKILL 1', content: '' },
    { id: generateId(), name: 'SKILL 2', content: '' },
  ])
  const [tokenBudget, setTokenBudget] = useState(2000)
  const [providers, setProviders] = useState<ProviderConfig[]>(DEFAULT_PROVIDERS)
  const [selectedProviderId, setSelectedProviderId] = useState<string>('')
  const [selectedModel, setSelectedModel] = useState('')
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'input' | 'output'>('input')
  const [showModelManager, setShowModelManager] = useState(false)
  const [fuseMode, setFuseMode] = useState<FuseMode>('fusion')
  const [showLanding, setShowLanding] = useState(true)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const activeProvider = providers.find(p => p.id === selectedProviderId)
  const totalTokens = skills.reduce((s, sk) => s + estimateTokens(sk.content), 0)
  const resultTokens = estimateTokens(result)
  const compressionPct = totalTokens > 0 && resultTokens > 0 ? Math.round((1 - resultTokens / totalTokens) * 100) : 0

  // ── Provider Management ──

  const updateProvider = (id: string, updates: Partial<ProviderConfig>) => {
    setProviders(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p))
  }

  const testConnection = async (id: string) => {
    const p = providers.find(x => x.id === id)
    if (!p || !p.apiKey) return
    updateProvider(id, { status: 'testing' })
    try {
      let endpoint = p.customEndpoint || 'https://api.openai.com/v1/chat/completions'
      if (id === 'anthropic') {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': p.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
          body: JSON.stringify({ model: p.defaultModel, max_tokens: 5, messages: [{ role: 'user', content: 'Hi' }] }),
        })
        const data = await res.json()
        if (data.error) throw new Error(data.error.message)
      } else if (id === 'google') {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${p.defaultModel}:generateContent?key=${p.apiKey}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'Hi' }] }] }),
        })
        const data = await res.json()
        if (data.error) throw new Error(data.error.message)
      } else {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${p.apiKey}` },
          body: JSON.stringify({ model: p.defaultModel, max_tokens: 5, messages: [{ role: 'user', content: 'Hi' }] }),
        })
        const data = await res.json()
        if (data.error) throw new Error(data.error.message)
      }
      updateProvider(id, { status: 'ok', enabled: true })
      if (!selectedProviderId) {
        setSelectedProviderId(id)
        setSelectedModel(p.defaultModel)
      }
    } catch {
      updateProvider(id, { status: 'fail' })
    }
  }

  const enableAndSelect = (id: string) => {
    const p = providers.find(x => x.id === id)
    if (!p || !p.apiKey) return
    updateProvider(id, { enabled: true })
    setSelectedProviderId(id)
    setSelectedModel(p.defaultModel)
    setShowModelManager(false)
  }

  // ── Skill Management ──

  const addSkill = () => {
    setSkills([...skills, { id: generateId(), name: `SKILL ${skills.length + 1}`, content: '' }])
  }

  const removeSkill = (id: string) => {
    if (skills.length <= 1) return
    setSkills(skills.filter(s => s.id !== id))
  }

  const updateSkill = (id: string, field: 'name' | 'content', value: string) => {
    setSkills(skills.map(s => s.id === id ? { ...s, [field]: value } : s))
  }

  const handleFileUpload = (id: string, files: FileList | null) => {
    if (!files?.[0]) return
    const file = files[0]
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      updateSkill(id, 'content', text)
      updateSkill(id, 'name', file.name.replace(/\.(md|markdown|txt)$/i, ''))
    }
    reader.readAsText(file)
  }

  const handleDrop = (id: string) => (e: React.DragEvent) => {
    e.preventDefault()
    handleFileUpload(id, e.dataTransfer.files)
  }

  // ── Fusion Logic ──

  const buildPrompts = () => {
    const skillCount = skills.filter(s => s.content.trim()).length
    const skillsMarkdown = skills
      .filter(s => s.content.trim())
      .map((s, i) => `<skill_${i + 1} name="${s.name}">\n${s.content}\n</skill_${i + 1}>`)
      .join('\n\n')

    if (fuseMode === 'analysis') {
      return {
        system: `You are a skill content analyst. Classify every paragraph-level item in the given skill documents into exactly one of 5 categories:

1. **Core Rule** — Actionable instructions the agent MUST follow (commands, constraints, procedures)
2. **Background** — Explanations, rationale, "why this matters", motivational text
3. **Example** — Code snippets, input/output pairs, usage demonstrations
4. **Template** — Boilerplate patterns, formatters, reusable structures
5. **Redundant** — Content repeated across multiple input skills

For each skill, output a classification table:

| # | Category | Original (truncated) | Keep? |
|---|----------|---------------------|-------|

Then provide statistics:
- Total items / Core Rules / Background / Examples / Templates / Redundant (with percentages)
- Estimated keepable tokens / Recommended token budget for full retention

Output the analysis report only.`,
        user: `Classify all content in these ${skillCount} skills:\n\n${skillsMarkdown}`,
      }
    }

    return {
      system: `You are a SkillReducer-class fusion engine. Merge ${skillCount} AI agent skill documents into one compressed file.
Budget: ≤${tokenBudget} tokens (from ~${totalTokens}).

BACKGROUND: Research shows only 38.5% of skill content is actionable core rules. Over 60% is background, examples, or redundancy. Removing non-essential content IMPROVES agent performance by 2.8% (less-is-more effect).

## STEP 1 — CLASSIFY & SEGMENT
Classify every section as CORE / BACKGROUND / EXAMPLE / TEMPLATE / REDUNDANT.

## STEP 2 — DEDUPLICATE
Merge overlapping rules, combine similar procedures, unify checklists, cross-reference instead of repeating.

## STEP 3 — PROGRESSIVE DISCLOSURE OUTPUT
Structure output in two tiers:

### Tier 1 — Core (must fit budget)
# [Fused Skill Name]
> One-line description

## Mandatory Rules
## Workflows
## Quick Reference
## Red Flags

### Tier 2 — On-Demand (collapsible references)
\`\`\`markdown
<!-- REFERENCE: Extended patterns (load when needed) -->
- Pattern 1: [inline code pattern]
\`\`\`

## COMPRESSION RULES
• Drop ALL motivation/rationale paragraphs
• Convert prose to bullets: "You should always make sure to" → "Always"
• Merge variants: N similar rules → 1 definitive rule
• Replace code blocks with inline patterns
• Remove headers with ≤2 items
• Keep "never"/"always"/"must" directives verbatim

Output markdown only. No commentary.`,
      user: `Fuse these ${skillCount} skills into one within ${tokenBudget} tokens:\n\n${skillsMarkdown}`,
    }
  }

  const handleFuse = useCallback(async () => {
    if (!activeProvider?.apiKey) { setError('请先在「模型设置」中配置 API Key'); return }
    if (skills.every(s => !s.content.trim())) { setError('请至少添加一个 Skill 文件'); return }

    setLoading(true)
    setError('')
    setResult('')
    setActiveTab('output')

    const { system: systemPrompt, user: userPrompt } = buildPrompts()
    const p = activeProvider
    const model = selectedModel || p.defaultModel

    try {
      let merged = ''

      if (p.id === 'anthropic') {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': p.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
          body: JSON.stringify({ model, max_tokens: Math.min(tokenBudget * 2, 16000), system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] }),
        })
        const data = await res.json()
        if (data.error) throw new Error(data.error.message || JSON.stringify(data.error))
        merged = data.content?.[0]?.text || ''
      } else if (p.id === 'google') {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${p.apiKey}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt }] }, contents: [{ parts: [{ text: userPrompt }] }], generationConfig: { temperature: 0.2, maxOutputTokens: Math.min(tokenBudget * 2, 16000) } }),
        })
        const data = await res.json()
        if (data.error) throw new Error(data.error.message || JSON.stringify(data.error))
        merged = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
      } else {
        const endpoint = p.customEndpoint || 'https://api.openai.com/v1/chat/completions'
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${p.apiKey}` },
          body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], temperature: 0.2, max_tokens: Math.min(tokenBudget * 2, 16000) }),
        })
        const data = await res.json()
        if (data.error) throw new Error(data.error.message || JSON.stringify(data.error))
        merged = data.choices?.[0]?.message?.content || ''
      }

      setResult(merged)
      setShowLanding(false)
    } catch (err: any) {
      setError(err.message || 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [activeProvider, selectedModel, skills, tokenBudget, fuseMode, totalTokens])

  const copyResult = () => { navigator.clipboard.writeText(result) }
  const downloadResult = () => {
    const blob = new Blob([result], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'fused-skill.md'; a.click()
    URL.revokeObjectURL(url)
  }

  // ── Render ──

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      {/* ═══ HEADER ═══ */}
      <header className="border-b border-gray-800 bg-gray-950/90 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔀</span>
            <div>
              <h1 className="text-lg font-bold text-white">Markdown Fuser</h1>
              <p className="text-[11px] text-gray-500 leading-tight">合并 & 压缩 AI Agent Skill 文件 · 节省 Token</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activeProvider && (
              <span className="hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-gray-800 border border-gray-700">
                <span>{activeProvider.icon}</span>
                <span className="text-gray-300">{activeProvider.name}</span>
                <span className="text-gray-600">·</span>
                <span className="text-gray-400 font-mono">{selectedModel || activeProvider.defaultModel}</span>
              </span>
            )}
            <button
              onClick={() => setShowModelManager(true)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                activeProvider ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' : 'bg-blue-600 hover:bg-blue-500 text-white animate-pulse'
              }`}
            >
              ⚙️ 模型设置
            </button>
          </div>
        </div>
      </header>

      {/* ═══ MAIN ═══ */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
        {/* ── Landing (first visit) ── */}
        {showLanding && !result && !loading && (
          <div className="mb-8 text-center py-8">
            <div className="text-6xl mb-4">🔀</div>
            <h2 className="text-2xl font-bold text-white mb-2">Markdown Fuser</h2>
            <p className="text-gray-400 max-w-lg mx-auto mb-6 text-sm leading-relaxed">
              你装了很多 Skill MD 文件？每次加载时间长、耗 token 多？<br/>
              贴进来 → 设预算 → 一键合并去重压缩 → 输出最优 Skill 文件
            </p>
            <div className="flex flex-wrap justify-center gap-3 text-xs text-gray-500">
              <span className="px-3 py-1.5 rounded-full bg-gray-900 border border-gray-800">📚 多文件合并</span>
              <span className="px-3 py-1.5 rounded-full bg-gray-900 border border-gray-800">🎯 Token 预算控制</span>
              <span className="px-3 py-1.5 rounded-full bg-gray-900 border border-gray-800">🧠 智能去重压缩</span>
              <span className="px-3 py-1.5 rounded-full bg-gray-900 border border-gray-800">🔬 内容分析</span>
            </div>
          </div>
        )}

        {/* ── Mode + Budget Row ── */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex rounded-lg overflow-hidden border border-gray-700">
            <button
              onClick={() => setFuseMode('fusion')}
              className={`px-4 py-2 text-sm font-medium transition ${fuseMode === 'fusion' ? 'bg-blue-600 text-white' : 'bg-gray-900 text-gray-400 hover:bg-gray-800'}`}
            >🔀 合并压缩</button>
            <button
              onClick={() => setFuseMode('analysis')}
              className={`px-4 py-2 text-sm font-medium transition ${fuseMode === 'analysis' ? 'bg-amber-600 text-white' : 'bg-gray-900 text-gray-400 hover:bg-gray-800'}`}
            >🔬 仅分析</button>
          </div>

          {fuseMode === 'fusion' && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-900 border border-gray-800">
              <label className="text-xs text-gray-500 whitespace-nowrap">Token 预算</label>
              <input
                type="range" min={200} max={20000} step={100}
                value={tokenBudget}
                onChange={e => setTokenBudget(Number(e.target.value))}
                className="w-24 sm:w-32 accent-blue-500"
              />
              <input
                type="number" min={200} max={100000}
                value={tokenBudget}
                onChange={e => setTokenBudget(Number(e.target.value))}
                className="w-20 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm font-mono text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-gray-500 font-mono">{totalTokens.toLocaleString()} tok 输入</span>
            {resultTokens > 0 && (
              <>
                <span className="text-xs text-gray-600">→</span>
                <span className="text-xs text-green-400 font-mono">{resultTokens.toLocaleString()} tok 输出</span>
                {compressionPct > 0 && <span className="text-xs text-purple-400 font-mono">(−{compressionPct}%)</span>}
              </>
            )}
          </div>
        </div>

        {/* ── Compression Bar ── */}
        {fuseMode === 'fusion' && totalTokens > 0 && (
          <div className="mb-4 px-1">
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  tokenBudget >= totalTokens ? 'bg-green-500' : tokenBudget >= totalTokens * 0.5 ? 'bg-amber-500' : 'bg-red-500'
                }`}
                style={{ width: `${Math.min(100, (tokenBudget / totalTokens) * 100)}%` }}
              />
            </div>
            <p className="text-[10px] text-gray-600 mt-1 text-right">目标保留 {Math.round((tokenBudget / totalTokens) * 100)}%</p>
          </div>
        )}

        {/* ── Mobile Tab ── */}
        <div className="flex mb-4 md:hidden">
          <button onClick={() => setActiveTab('input')} className={`flex-1 py-2 text-center text-sm font-medium rounded-l-lg ${activeTab === 'input' ? 'bg-gray-800 text-white' : 'bg-gray-900 text-gray-500'}`}>📥 输入</button>
          <button onClick={() => setActiveTab('output')} className={`flex-1 py-2 text-center text-sm font-medium rounded-r-lg ${activeTab === 'output' ? 'bg-gray-800 text-white' : 'bg-gray-900 text-gray-500'}`}>📤 输出</button>
        </div>

        {/* ── Main Grid ── */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* INPUT */}
          <div className={activeTab !== 'input' ? 'hidden md:block' : ''}>
            <div className="space-y-3">
              {skills.map(skill => (
                <div key={skill.id}
                  className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden"
                  onDrop={handleDrop(skill.id)}
                  onDragOver={e => e.preventDefault()}
                >
                  <div className="flex items-center justify-between px-3 py-2 bg-gray-800/50 border-b border-gray-800">
                    <input
                      value={skill.name}
                      onChange={e => updateSkill(skill.id, 'name', e.target.value)}
                      className="bg-transparent text-sm font-medium focus:outline-none flex-1 min-w-0"
                      placeholder="Skill 名称"
                    />
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] text-gray-600 font-mono">{estimateTokens(skill.content).toLocaleString()} tok</span>
                      <button
                        onClick={() => fileInputRefs.current[skill.id]?.click()}
                        className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 transition"
                      >📎 上传</button>
                      <input
                        ref={el => { fileInputRefs.current[skill.id] = el }}
                        type="file" accept=".md,.markdown,.txt" className="hidden"
                        onChange={e => handleFileUpload(skill.id, e.target.files)}
                      />
                      {skills.length > 1 && (
                        <button onClick={() => removeSkill(skill.id)} className="text-xs px-1.5 py-1 rounded bg-red-900/40 hover:bg-red-800/40 text-red-400 transition">✕</button>
                      )}
                    </div>
                  </div>
                  {skill.content ? (
                    <textarea
                      value={skill.content}
                      onChange={e => updateSkill(skill.id, 'content', e.target.value)}
                      className="w-full h-40 bg-transparent p-3 text-sm font-mono resize-y focus:outline-none placeholder-gray-700"
                    />
                  ) : (
                    <div
                      onClick={() => fileInputRefs.current[skill.id]?.click()}
                      className="h-32 flex flex-col items-center justify-center text-gray-600 hover:text-gray-400 cursor-pointer transition"
                    >
                      <span className="text-2xl mb-1">📄</span>
                      <p className="text-xs">拖拽 .md 文件到此处，或点击上传</p>
                      <p className="text-[10px] text-gray-700 mt-1">支持 .md / .markdown / .txt</p>
                    </div>
                  )}
                </div>
              ))}

              <button
                onClick={addSkill}
                className="w-full py-2.5 rounded-xl border border-dashed border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300 transition text-sm"
              >+ 添加 Skill 文件</button>

              {/* Action Button */}
              <button
                onClick={handleFuse}
                disabled={loading}
                className={`w-full py-3 rounded-xl font-semibold transition text-sm flex items-center justify-center gap-2 ${
                  fuseMode === 'analysis'
                    ? 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500'
                    : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {loading ? (
                  <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>处理中...</>
                ) : (
                  fuseMode === 'analysis' ? '🔬 分析内容构成' : '🔀 开始合并压缩'
                )}
              </button>

              {!activeProvider?.apiKey && (
                <p className="text-xs text-center text-amber-500/80">↑ 请先点击右上角「模型设置」配置 API Key</p>
              )}
            </div>
          </div>

          {/* OUTPUT */}
          <div className={activeTab !== 'output' ? 'hidden md:block' : ''}>
            <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden flex flex-col min-h-[400px]">
              <div className="flex items-center justify-between px-3 py-2 bg-gray-800/50 border-b border-gray-800">
                <span className="text-sm font-medium">
                  {fuseMode === 'analysis' ? '📊 分析报告' : '🔀 合并结果'}
                </span>
                {result && (
                  <div className="flex items-center gap-1.5">
                    <button onClick={copyResult} className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 transition">📋 复制</button>
                    <button onClick={downloadResult} className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 transition">💾 下载</button>
                  </div>
                )}
              </div>
              <div className="flex-1 p-4 overflow-auto">
                {error && (
                  <div className="p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm mb-3">⚠️ {error}</div>
                )}
                {result ? (
                  <pre className="whitespace-pre-wrap text-sm font-mono text-gray-300 leading-relaxed">{result}</pre>
                ) : !loading ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-600 text-sm gap-2">
                    <span className="text-4xl">{fuseMode === 'analysis' ? '🔬' : '🔀'}</span>
                    <p>{fuseMode === 'analysis' ? '内容分析报告将显示在这里' : '合并后的 Markdown 将显示在这里'}</p>
                    <p className="text-[10px] text-gray-700 max-w-xs text-center">
                      {fuseMode === 'analysis'
                        ? '将内容分为 Core Rule / Background / Example / Template / Redundant 五类'
                        : '分类 → 去重 → 压缩 → Progressive Disclosure 输出'}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {/* ── Research Footer ── */}
        <div className="mt-10 p-4 rounded-xl bg-gray-900/50 border border-gray-800/50">
          <div className="grid md:grid-cols-3 gap-4 text-xs text-gray-500">
            <div><span className="text-amber-400 font-medium">38.5% Core</span> — 只有 38.5% 的 Skill 内容是可执行的核心规则</div>
            <div><span className="text-green-400 font-medium">Less is More</span> — 删掉非核心内容后 Agent 表现反而提升 2.8%</div>
            <div><span className="text-blue-400 font-medium">渐进式加载</span> — 核心规则常驻，示例和背景按需加载</div>
          </div>
          <p className="text-[10px] text-gray-700 mt-2">Inspired by <em>SkillReducer</em> (arXiv 2603.29919) · <a href="https://github.com/Thomaszhou22/markdown-fuser" className="hover:text-gray-500 underline">GitHub</a></p>
        </div>
      </main>

      {/* ═══ MODEL MANAGER DIALOG ═══ */}
      {showModelManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col shadow-2xl">
            {/* Dialog Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
              <h2 className="text-lg font-bold text-white">⚙️ 模型设置</h2>
              <button onClick={() => setShowModelManager(false)} className="text-gray-500 hover:text-white text-xl leading-none">✕</button>
            </div>

            {/* Dialog Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <p className="text-xs text-gray-500">选择一个 AI 服务商，填入你的 API Key，然后点击「启用」。所有数据仅在浏览器本地处理。</p>

              {providers.map(p => (
                <div key={p.id} className={`rounded-xl border p-4 transition ${
                  selectedProviderId === p.id ? 'border-blue-500/50 bg-blue-900/10' : 'border-gray-800 bg-gray-800/30'
                }`}>
                  {/* Provider Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{p.icon}</span>
                      <span className="font-medium text-sm">{p.name}</span>
                      {p.enabled && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-900/50 text-green-400">已启用</span>
                      )}
                      {p.status === 'ok' && <span className="text-green-400 text-xs">✓</span>}
                      {p.status === 'fail' && <span className="text-red-400 text-xs">✗ 连接失败</span>}
                      {p.status === 'testing' && <span className="text-amber-400 text-xs animate-pulse">测试中...</span>}
                    </div>
                  </div>

                  {/* API Key Input */}
                  <div className="flex gap-2 mb-2">
                    <input
                      type="password"
                      value={p.apiKey}
                      onChange={e => updateProvider(p.id, { apiKey: e.target.value, status: 'idle' })}
                      placeholder="API Key"
                      className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    {p.apiKey && (
                      <button
                        onClick={() => testConnection(p.id)}
                        disabled={p.status === 'testing'}
                        className="px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm transition whitespace-nowrap"
                      >测试连接</button>
                    )}
                  </div>

                  {/* Custom Endpoint */}
                  {p.id === 'custom' && (
                    <input
                      value={p.customEndpoint || ''}
                      onChange={e => updateProvider(p.id, { customEndpoint: e.target.value })}
                      placeholder="https://api.example.com/v1/chat/completions"
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  )}

                  {/* Model Selector */}
                  {p.models.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {p.models.map(m => (
                        <button
                          key={m}
                          onClick={() => { setSelectedModel(m); setSelectedProviderId(p.id); }}
                          className={`text-[11px] px-2 py-1 rounded-md transition ${
                            (selectedProviderId === p.id && selectedModel === m)
                              ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                          }`}
                        >{m}</button>
                      ))}
                    </div>
                  )}

                  {/* Enable Button */}
                  {p.apiKey && (
                    <button
                      onClick={() => enableAndSelect(p.id)}
                      className={`w-full py-2 rounded-lg text-sm font-medium transition ${
                        selectedProviderId === p.id
                          ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      {selectedProviderId === p.id ? '✓ 当前使用' : '启用并选择'}
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Dialog Footer */}
            <div className="px-5 py-3 border-t border-gray-800 flex justify-between items-center">
              <p className="text-[10px] text-gray-600">🔒 API Key 仅保存在浏览器本地，不会上传到任何服务器</p>
              <button
                onClick={() => setShowModelManager(false)}
                className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm transition"
              >完成</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
