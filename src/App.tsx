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
  { id: 'custom', name: 'Custom (OpenAI)', icon: '⚙️', models: [], defaultModel: 'custom-model', enabled: false, apiKey: '', status: 'idle', customEndpoint: '' },
]

export default function App() {
  const [skills, setSkills] = useState<SkillInput[]>([
    { id: generateId(), name: '', content: '' },
  ])
  const [tokenBudget, setTokenBudget] = useState(2000)
  const [providers, setProviders] = useState<ProviderConfig[]>(DEFAULT_PROVIDERS)
  const [selectedProviderId, setSelectedProviderId] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showModelDialog, setShowModelDialog] = useState(false)
  const [fuseMode, setFuseMode] = useState<FuseMode>('fusion')
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const resultRef = useRef<HTMLPreElement>(null)

  const activeProvider = providers.find(p => p.id === selectedProviderId)
  const totalTokens = skills.reduce((s, sk) => s + estimateTokens(sk.content), 0)
  const resultTokens = estimateTokens(result)
  const compressionRatio = totalTokens > 0 && resultTokens > 0 ? Math.round((1 - resultTokens / totalTokens) * 100) : 0
  const hasContent = skills.some(s => s.content.trim())

  const updateProvider = (id: string, updates: Partial<ProviderConfig>) => {
    setProviders(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p))
  }

  const testConnection = async (id: string) => {
    const p = providers.find(x => x.id === id)
    if (!p?.apiKey) return
    updateProvider(id, { status: 'testing' })
    try {
      if (id === 'anthropic') {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': p.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
          body: JSON.stringify({ model: p.defaultModel, max_tokens: 5, messages: [{ role: 'user', content: 'Hi' }] }),
        })
        const d = await res.json()
        if (d.error) throw new Error()
      } else if (id === 'google') {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${p.defaultModel}:generateContent?key=${p.apiKey}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'Hi' }] }] }),
        })
        const d = await res.json()
        if (d.error) throw new Error()
      } else {
        const endpoint = p.customEndpoint || 'https://api.openai.com/v1/chat/completions'
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${p.apiKey}` },
          body: JSON.stringify({ model: p.defaultModel, max_tokens: 5, messages: [{ role: 'user', content: 'Hi' }] }),
        })
        const d = await res.json()
        if (d.error) throw new Error()
      }
      updateProvider(id, { status: 'ok', enabled: true })
      if (!selectedProviderId) { setSelectedProviderId(id); setSelectedModel(p.defaultModel) }
    } catch {
      updateProvider(id, { status: 'fail' })
    }
  }

  const enableProvider = (id: string) => {
    const p = providers.find(x => x.id === id)
    if (!p?.apiKey) return
    updateProvider(id, { enabled: true })
    setSelectedProviderId(id)
    setSelectedModel(p.defaultModel)
    setShowModelDialog(false)
  }

  const addSkill = () => setSkills([...skills, { id: generateId(), name: '', content: '' }])
  const removeSkill = (id: string) => { if (skills.length > 1) setSkills(skills.filter(s => s.id !== id)) }
  const updateSkill = (id: string, field: 'name' | 'content', value: string) => {
    setSkills(skills.map(s => s.id === id ? { ...s, [field]: value } : s))
  }

  const handleFileUpload = (id: string, files: FileList | null) => {
    if (!files?.[0]) return
    const file = files[0]
    const reader = new FileReader()
    reader.onload = (ev) => {
      updateSkill(id, 'content', ev.target?.result as string)
      if (!skills.find(s => s.id === id)?.name) {
        updateSkill(id, 'name', file.name.replace(/\.(md|markdown|txt)$/i, ''))
      }
    }
    reader.readAsText(file)
  }

  const buildPrompts = () => {
    const validSkills = skills.filter(s => s.content.trim())
    const md = validSkills.map((s, i) => `<skill_${i + 1} name="${s.name || 'unnamed'}">\n${s.content}\n</skill_${i + 1}>`).join('\n\n')
    const n = validSkills.length

    if (fuseMode === 'analysis') {
      return {
        system: `You are a skill content analyst. Classify every section in the given skill documents into one of 5 categories:
1. Core Rule — Actionable instructions (commands, constraints, procedures)
2. Background — Explanations, rationale, motivational text
3. Example — Code snippets, input/output demos
4. Template — Boilerplate, formatters, reusable structures
5. Redundant — Repeated across multiple skills

Output a table per skill with columns: # | Category | Content Summary | Keep?
Then: statistics with percentages, recommended token budget.`,
        user: `Analyze these ${n} skills:\n\n${md}`,
      }
    }

    return {
      system: `You are a SkillReducer-class fusion engine. Merge ${n} AI agent skill documents into one compressed file.
Budget: ≤${tokenBudget} tokens (from ~${totalTokens}).

BACKGROUND: Research shows only 38.5% of skill content is actionable. Removing non-essential content IMPROVES agent performance by 2.8%.

## PIPELINE
1. CLASSIFY — Tag every section: CORE / BACKGROUND / EXAMPLE / TEMPLATE / REDUNDANT
2. DEDUPLICATE — Merge overlapping rules, combine similar procedures, unify checklists
3. COMPRESS — Drop motivation text, convert prose to bullets, merge variants, replace code blocks with inline patterns

## OUTPUT STRUCTURE
# [Fused Skill Name]
> One-line description

## Mandatory Rules
## Workflows
## Quick Reference
## Red Flags

<!-- REFERENCE: Extended patterns (load when needed) -->
(only if budget allows)

## RULES: Keep safety/security directives, numbered procedures, error handling, red flag lists verbatim. Drop everything else that isn't actionable.

Output markdown only.`,
      user: `Fuse these ${n} skills into ≤${tokenBudget} tokens:\n\n${md}`,
    }
  }

  const handleFuse = useCallback(async () => {
    if (!activeProvider?.apiKey) { setError('请先配置模型（点击顶部「模型设置」）'); return }
    if (!hasContent) { setError('请至少添加一个 Skill 文件内容'); return }
    setLoading(true); setError(''); setResult('')
    const { system: sys, user: usr } = buildPrompts()
    const p = activeProvider
    const model = selectedModel || p.defaultModel
    const maxOut = Math.min(tokenBudget * 2, 16000)
    try {
      let text = ''
      if (p.id === 'anthropic') {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': p.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
          body: JSON.stringify({ model, max_tokens: maxOut, system: sys, messages: [{ role: 'user', content: usr }] }),
        })
        const d = await res.json()
        if (d.error) throw new Error(d.error.message || JSON.stringify(d.error))
        text = d.content?.[0]?.text || ''
      } else if (p.id === 'google') {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${p.apiKey}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents: [{ parts: [{ text: usr }] }], generationConfig: { temperature: 0.2, maxOutputTokens: maxOut } }),
        })
        const d = await res.json()
        if (d.error) throw new Error(d.error.message || JSON.stringify(d.error))
        text = d.candidates?.[0]?.content?.parts?.[0]?.text || ''
      } else {
        const endpoint = p.customEndpoint || 'https://api.openai.com/v1/chat/completions'
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${p.apiKey}` },
          body: JSON.stringify({ model, messages: [{ role: 'system', content: sys }, { role: 'user', content: usr }], temperature: 0.2, max_tokens: maxOut }),
        })
        const d = await res.json()
        if (d.error) throw new Error(d.error.message || JSON.stringify(d.error))
        text = d.choices?.[0]?.message?.content || ''
      }
      setResult(text)
    } catch (err: any) {
      setError(err.message || 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [activeProvider, selectedModel, skills, tokenBudget, fuseMode, totalTokens, hasContent])

  const copyResult = () => { navigator.clipboard.writeText(result) }
  const downloadResult = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([result], { type: 'text/markdown' }))
    a.download = 'fused-skill.md'; a.click()
  }

  return (
    <div className="h-screen flex flex-col bg-[#0a0a0f] text-gray-100 overflow-hidden">
      {/* ═══ TOP TOOLBAR ═══ */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-gray-800/60 bg-[#0d0d14] shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔀</span>
            <span className="font-semibold text-sm">Markdown Fuser</span>
          </div>
          <div className="h-4 w-px bg-gray-800" />
          <div className="flex rounded-md overflow-hidden border border-gray-700/50">
            <button
              onClick={() => setFuseMode('fusion')}
              className={`px-3 py-1 text-xs transition ${fuseMode === 'fusion' ? 'bg-blue-600 text-white' : 'bg-transparent text-gray-500 hover:text-gray-300'}`}
            >🔀 合并压缩</button>
            <button
              onClick={() => setFuseMode('analysis')}
              className={`px-3 py-1 text-xs transition ${fuseMode === 'analysis' ? 'bg-amber-600 text-white' : 'bg-transparent text-gray-500 hover:text-gray-300'}`}
            >🔬 内容分析</button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {activeProvider && (
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-400">
              <span>{activeProvider.icon}</span>
              <span>{selectedModel || activeProvider.defaultModel}</span>
            </div>
          )}
          <button
            onClick={() => setShowModelDialog(true)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs transition ${
              activeProvider ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            模型设置
          </button>
          <a href="https://github.com/Thomaszhou22/markdown-fuser" target="_blank" className="text-gray-600 hover:text-gray-400">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
          </a>
        </div>
      </div>

      {/* ═══ MAIN CONTENT — LEFT / RIGHT SPLIT ═══ */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── LEFT: INPUT PANEL ── */}
        <div className="w-1/2 flex flex-col border-r border-gray-800/60">
          {/* Input Header */}
          <div className="h-10 flex items-center justify-between px-4 border-b border-gray-800/40 bg-[#0d0d14]/50 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">输入</span>
              <span className="text-[10px] text-gray-700 font-mono">{totalTokens.toLocaleString()} tokens</span>
            </div>
            {fuseMode === 'fusion' && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-600">预算</span>
                <input
                  type="number" min={200} max={100000}
                  value={tokenBudget}
                  onChange={e => setTokenBudget(Number(e.target.value))}
                  className="w-16 bg-gray-800/60 border border-gray-700/50 rounded px-1.5 py-0.5 text-xs font-mono text-center focus:outline-none focus:border-blue-500/50"
                />
                <div className="w-20 h-1 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${tokenBudget >= totalTokens ? 'bg-green-500' : tokenBudget >= totalTokens * 0.5 ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{ width: totalTokens > 0 ? `${Math.min(100, (tokenBudget / totalTokens) * 100)}%` : '100%' }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Skill Tabs + Content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Tabs Row */}
            <div className="flex items-center gap-0.5 px-2 pt-2 bg-[#0c0c12] shrink-0">
              {skills.map((s, i) => (
                <div key={s.id} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-t-lg text-xs cursor-pointer transition ${
                  i === 0 ? 'bg-[#12121a] text-gray-300' : 'bg-transparent text-gray-600 hover:text-gray-400'
                }`}>
                  <span className="truncate max-w-[80px]">{s.name || `Skill ${i + 1}`}</span>
                  {skills.length > 1 && (
                    <button onClick={(e) => { e.stopPropagation(); removeSkill(s.id) }} className="text-gray-700 hover:text-red-400 ml-0.5">×</button>
                  )}
                </div>
              ))}
              <button onClick={addSkill} className="px-2 py-1.5 text-xs text-gray-600 hover:text-gray-400">+</button>
            </div>

            {/* Active Skill Editor */}
            <div className="flex-1 overflow-hidden bg-[#12121a] relative">
              {/* File Upload Bar */}
              <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
                <input
                  ref={el => { fileInputRefs.current[skills[0]?.id] = el }}
                  type="file" accept=".md,.markdown,.txt" className="hidden"
                  onChange={e => handleFileUpload(skills[0]?.id, e.target.files)}
                />
                <button
                  onClick={() => fileInputRefs.current[skills[0]?.id]?.click()}
                  className="px-2 py-1 rounded text-[10px] bg-gray-800/80 hover:bg-gray-700 text-gray-400 transition"
                >📎 上传文件</button>
              </div>

              <textarea
                value={skills[0]?.content || ''}
                onChange={e => updateSkill(skills[0]?.id, 'content', e.target.value)}
                placeholder={`将 Skill Markdown 内容粘贴到此处...\n\n或点击右上角「📎 上传文件」导入 .md 文件\n\n你可以添加多个 Skill 文件（点击顶部 + 号）`}
                className="w-full h-full bg-transparent p-4 pt-10 text-sm font-mono resize-none focus:outline-none placeholder-gray-700/50 leading-relaxed"
              />
            </div>

            {/* Bottom Action Bar */}
            <div className="shrink-0 p-3 bg-[#0c0c12] border-t border-gray-800/40">
              <button
                onClick={handleFuse}
                disabled={loading || !activeProvider?.apiKey || !hasContent}
                className={`w-full py-2.5 rounded-lg font-medium text-sm transition flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${
                  fuseMode === 'analysis'
                    ? 'bg-gradient-to-r from-amber-600/90 to-orange-600/90 hover:from-amber-500 hover:to-orange-500 text-white'
                    : 'bg-gradient-to-r from-blue-600/90 to-violet-600/90 hover:from-blue-500 hover:to-violet-500 text-white'
                }`}
              >
                {loading ? (
                  <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>处理中...</>
                ) : fuseMode === 'analysis' ? '🔬 分析内容构成' : '🔀 开始合并压缩'}
              </button>
              {!activeProvider?.apiKey && (
                <p className="text-[10px] text-center text-gray-600 mt-1.5">请先点击右上角「模型设置」配置 API Key</p>
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT: OUTPUT PANEL ── */}
        <div className="w-1/2 flex flex-col">
          {/* Output Header */}
          <div className="h-10 flex items-center justify-between px-4 border-b border-gray-800/40 bg-[#0d0d14]/50 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">输出</span>
              {resultTokens > 0 && (
                <span className="text-[10px] text-gray-700 font-mono">
                  {resultTokens.toLocaleString()} tokens {compressionRatio > 0 && <span className="text-green-500/70">−{compressionRatio}%</span>}
                </span>
              )}
            </div>
            {result && (
              <div className="flex items-center gap-1">
                <button onClick={copyResult} className="px-2 py-0.5 rounded text-[10px] bg-gray-800/60 hover:bg-gray-700 text-gray-400 transition">📋 复制</button>
                <button onClick={downloadResult} className="px-2 py-0.5 rounded text-[10px] bg-gray-800/60 hover:bg-gray-700 text-gray-400 transition">💾 下载</button>
              </div>
            )}
          </div>

          {/* Output Content */}
          <div className="flex-1 overflow-auto bg-[#12121a] p-4">
            {error && (
              <div className="p-3 rounded-lg bg-red-900/20 border border-red-800/40 text-red-300 text-xs mb-3">⚠️ {error}</div>
            )}
            {loading && (
              <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-3">
                <svg className="animate-spin h-8 w-8 text-blue-500/40" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                <p className="text-sm">{fuseMode === 'analysis' ? '正在分析内容构成...' : '正在合并压缩...'}</p>
              </div>
            )}
            {result ? (
              <pre ref={resultRef} className="whitespace-pre-wrap text-sm font-mono text-gray-300 leading-relaxed">{result}</pre>
            ) : !loading ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-700 gap-3">
                <span className="text-5xl opacity-30">🔀</span>
                <div className="text-center">
                  <p className="text-sm text-gray-600">输出结果将显示在这里</p>
                  <p className="text-[10px] text-gray-700 mt-1 max-w-xs">
                    {fuseMode === 'analysis' ? '分类: Core Rule / Background / Example / Template / Redundant' : '分类 → 去重 → 压缩 → Progressive Disclosure 输出'}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* ═══ STATUS BAR ═══ */}
      <div className="h-6 flex items-center justify-between px-4 border-t border-gray-800/60 bg-[#0d0d14] text-[10px] text-gray-700 shrink-0">
        <span>Inspired by <em>SkillReducer</em> (arXiv 2603.29919) · 38.5% Core Rule · Less is More (+2.8%)</span>
        <span>🔒 数据仅在浏览器本地处理</span>
      </div>

      {/* ═══ MODEL SETTINGS DIALOG ═══ */}
      {showModelDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowModelDialog(false)}>
          <div className="bg-[#12121a] border border-gray-700/50 rounded-xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800/60">
              <h2 className="font-semibold text-sm">⚙️ 模型设置</h2>
              <button onClick={() => setShowModelDialog(false)} className="text-gray-600 hover:text-white text-lg">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <p className="text-[10px] text-gray-600 mb-2">选择服务商，填入 API Key，点击「启用」。所有数据仅在浏览器本地处理。</p>
              {providers.map(p => (
                <div key={p.id} className={`rounded-lg border p-3 transition ${
                  selectedProviderId === p.id ? 'border-blue-500/40 bg-blue-900/10' : 'border-gray-800/50 bg-gray-800/20'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span>{p.icon}</span>
                    <span className="text-sm font-medium">{p.name}</span>
                    {p.status === 'ok' && <span className="text-green-400 text-[10px]">✓ 已连接</span>}
                    {p.status === 'fail' && <span className="text-red-400 text-[10px]">✗ 连接失败</span>}
                    {p.status === 'testing' && <span className="text-amber-400 text-[10px] animate-pulse">测试中...</span>}
                  </div>
                  <div className="flex gap-1.5 mb-2">
                    <input
                      type="password"
                      value={p.apiKey}
                      onChange={e => updateProvider(p.id, { apiKey: e.target.value, status: 'idle' })}
                      placeholder="API Key"
                      className="flex-1 bg-[#0a0a0f] border border-gray-700/50 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500/50"
                    />
                    {p.apiKey && (
                      <button onClick={() => testConnection(p.id)} disabled={p.status === 'testing'} className="px-2 py-1.5 rounded bg-gray-700/50 hover:bg-gray-600/50 text-[10px] transition whitespace-nowrap disabled:opacity-50">测试</button>
                    )}
                  </div>
                  {p.id === 'custom' && (
                    <input
                      value={p.customEndpoint || ''}
                      onChange={e => updateProvider(p.id, { customEndpoint: e.target.value })}
                      placeholder="https://api.example.com/v1/chat/completions"
                      className="w-full bg-[#0a0a0f] border border-gray-700/50 rounded px-2 py-1.5 text-xs mb-2 focus:outline-none focus:border-blue-500/50"
                    />
                  )}
                  {p.models.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {p.models.map(m => (
                        <button
                          key={m}
                          onClick={() => { setSelectedModel(m); setSelectedProviderId(p.id); }}
                          className={`text-[10px] px-1.5 py-0.5 rounded transition ${
                            (selectedProviderId === p.id && selectedModel === m) ? 'bg-blue-600 text-white' : 'bg-gray-700/50 text-gray-500 hover:bg-gray-600/50'
                          }`}
                        >{m}</button>
                      ))}
                    </div>
                  )}
                  {p.apiKey && (
                    <button
                      onClick={() => enableProvider(p.id)}
                      className={`w-full py-1.5 rounded text-xs font-medium transition ${
                        selectedProviderId === p.id ? 'bg-blue-600 text-white' : 'bg-gray-700/40 text-gray-400 hover:bg-gray-600/40'
                      }`}
                    >{selectedProviderId === p.id ? '✓ 当前使用' : '启用并选择'}</button>
                  )}
                </div>
              ))}
            </div>
            <div className="px-4 py-2 border-t border-gray-800/60 flex justify-end">
              <button onClick={() => setShowModelDialog(false)} className="px-3 py-1.5 rounded bg-gray-700/50 hover:bg-gray-600/50 text-xs transition">完成</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
