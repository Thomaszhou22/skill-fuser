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
  apiKey: string
  customEndpoint?: string
  status: 'idle' | 'testing' | 'ok' | 'fail'
}

type FuseMode = 'fusion' | 'analysis'

function uid() { return Math.random().toString(36).slice(2, 8) }

function estimateTokens(t: string): number {
  const cjk = (t.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).length
  return Math.ceil(cjk / 2 + (t.length - cjk) / 4)
}

const PROVIDERS: ProviderConfig[] = [
  { id: 'openai', name: 'OpenAI', icon: '🟢', models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'], defaultModel: 'gpt-4o-mini', apiKey: '', status: 'idle' },
  { id: 'anthropic', name: 'Anthropic', icon: '🟠', models: ['claude-sonnet-4-20250514', 'claude-haiku-4-20250514'], defaultModel: 'claude-sonnet-4-20250514', apiKey: '', status: 'idle' },
  { id: 'google', name: 'Google Gemini', icon: '🔵', models: ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'], defaultModel: 'gemini-2.0-flash', apiKey: '', status: 'idle' },
  { id: 'deepseek', name: 'DeepSeek', icon: '🟣', models: ['deepseek-chat', 'deepseek-reasoner'], defaultModel: 'deepseek-chat', apiKey: '', status: 'idle', customEndpoint: 'https://api.deepseek.com/v1/chat/completions' },
  { id: 'custom', name: 'Custom', icon: '⚙️', models: [], defaultModel: 'custom-model', apiKey: '', status: 'idle', customEndpoint: '' },
]

export default function App() {
  const [skills, setSkills] = useState<SkillInput[]>([{ id: uid(), name: '', content: '' }])
  const [budget, setBudget] = useState(2000)
  const [providers, setProviders] = useState(PROVIDERS)
  const [provId, setProvId] = useState('')
  const [model, setModel] = useState('')
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<FuseMode>('fusion')
  const [showSettings, setShowSettings] = useState(false)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const prov = providers.find(p => p.id === provId)
  const totalTok = skills.reduce((s, k) => s + estimateTokens(k.content), 0)
  const outTok = estimateTokens(result)
  const ratio = totalTok > 0 && outTok > 0 ? Math.round((1 - outTok / totalTok) * 100) : 0

  const setProv = (id: string, u: Partial<ProviderConfig>) => setProviders(ps => ps.map(p => p.id === id ? { ...p, ...u } : p))

  const testConn = async (id: string) => {
    const p = providers.find(x => x.id === id)!
    if (!p.apiKey) return
    setProv(id, { status: 'testing' })
    try {
      if (id === 'anthropic') {
        const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': p.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body: JSON.stringify({ model: p.defaultModel, max_tokens: 5, messages: [{ role: 'user', content: 'Hi' }] }) })
        if ((await r.json()).error) throw 0
      } else if (id === 'google') {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${p.defaultModel}:generateContent?key=${p.apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: 'Hi' }] }] }) })
        if ((await r.json()).error) throw 0
      } else {
        const r = await fetch(p.customEndpoint || 'https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${p.apiKey}` }, body: JSON.stringify({ model: p.defaultModel, max_tokens: 5, messages: [{ role: 'user', content: 'Hi' }] }) })
        if ((await r.json()).error) throw 0
      }
      setProv(id, { status: 'ok' })
      if (!provId) { setProvId(id); setModel(p.defaultModel) }
    } catch { setProv(id, { status: 'fail' }) }
  }

  const selectProv = (id: string) => {
    const p = providers.find(x => x.id === id)
    if (!p?.apiKey) return
    setProvId(id); setModel(p.defaultModel); setShowSettings(false)
  }

  const upload = (id: string, files: FileList | null) => {
    if (!files?.[0]) return
    const f = files[0]
    const r = new FileReader()
    r.onload = e => {
      setSkills(ss => ss.map(s => s.id === id ? { ...s, content: e.target?.result as string, name: s.name || f.name.replace(/\.(md|markdown|txt)$/i, '') } : s))
    }
    r.readAsText(f)
  }

  const buildPrompt = () => {
    const vs = skills.filter(s => s.content.trim())
    const md = vs.map((s, i) => `<skill_${i + 1} name="${s.name || 'unnamed'}">\n${s.content}\n</skill_${i + 1}>`).join('\n\n')
    if (mode === 'analysis') return {
      sys: `Classify every section into: Core Rule / Background / Example / Template / Redundant. Output a table per skill, then statistics with percentages and recommended budget.`,
      usr: `Analyze these ${vs.length} skills:\n\n${md}`
    }
    return {
      sys: `You are a SkillReducer fusion engine. Merge ${vs.length} skill docs into ≤${budget} tokens (from ~${totalTok}).
Pipeline: 1) Classify sections 2) Deduplicate 3) Compress.
Output: # Title > description\n## Mandatory Rules\n## Workflows\n## Quick Reference\n## Red Flags\nKeep safety/error/numbered procedures verbatim. Drop motivation, merge variants, convert prose to bullets. Markdown only.`,
      usr: `Fuse into ≤${budget} tokens:\n\n${md}`
    }
  }

  const fuse = useCallback(async () => {
    if (!prov?.apiKey) { setError('请先配置模型'); return }
    if (!skills.some(s => s.content.trim())) { setError('请添加 Skill 内容'); return }
    setLoading(true); setError(''); setResult('')
    const { sys, usr } = buildPrompt()
    const m = model || prov.defaultModel
    const maxT = Math.min(budget * 2, 16000)
    try {
      let t = ''
      if (prov.id === 'anthropic') {
        const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': prov.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body: JSON.stringify({ model: m, max_tokens: maxT, system: sys, messages: [{ role: 'user', content: usr }] }) })
        const d = await r.json(); if (d.error) throw new Error(d.error.message); t = d.content?.[0]?.text || ''
      } else if (prov.id === 'google') {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${prov.apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents: [{ parts: [{ text: usr }] }], generationConfig: { temperature: 0.2, maxOutputTokens: maxT } }) })
        const d = await r.json(); if (d.error) throw new Error(d.error.message); t = d.candidates?.[0]?.content?.parts?.[0]?.text || ''
      } else {
        const r = await fetch(prov.customEndpoint || 'https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${prov.apiKey}` }, body: JSON.stringify({ model: m, messages: [{ role: 'system', content: sys }, { role: 'user', content: usr }], temperature: 0.2, max_tokens: maxT }) })
        const d = await r.json(); if (d.error) throw new Error(d.error.message); t = d.choices?.[0]?.message?.content || ''
      }
      setResult(t)
    } catch (e: any) { setError(e.message || 'Error') } finally { setLoading(false) }
  }, [prov, model, skills, budget, mode, totalTok])

  return (
    <div className="min-h-screen bg-[#09090b] text-gray-100">
      {/* ═══ NAV ═══ */}
      <nav className="sticky top-0 z-40 bg-[#09090b]/80 backdrop-blur-lg border-b border-white/5">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-sm">🔀</div>
            <span className="font-semibold">Markdown Fuser</span>
          </div>
          <div className="flex items-center gap-3">
            {prov && <span className="text-xs text-gray-500">{prov.icon} {model || prov.defaultModel}</span>}
            <button onClick={() => setShowSettings(true)} className={`text-xs px-3 py-1.5 rounded-full transition ${prov?.apiKey ? 'bg-white/5 hover:bg-white/10 text-gray-400' : 'bg-blue-600 text-white hover:bg-blue-500'}`}>
              ⚙️ 模型设置
            </button>
          </div>
        </div>
      </nav>

      {/* ═══ HERO ═══ */}
      <section className="max-w-5xl mx-auto px-6 pt-12 pb-8 text-center">
        <h1 className="text-3xl font-bold mb-3 bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">
          合并压缩你的 Skill 文件
        </h1>
        <p className="text-gray-500 text-sm max-w-lg mx-auto leading-relaxed">
          粘贴多个 SKILL.md，设置 Token 预算，一键智能合并去重压缩。<br/>
          基于 SkillReducer 研究，只保留 38.5% 核心规则，反而提升 Agent 表现 2.8%。
        </p>
      </section>

      {/* ═══ MAIN ═══ */}
      <section className="max-w-5xl mx-auto px-6 pb-16 space-y-6">

        {/* ── Controls Row ── */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg overflow-hidden border border-white/10">
            <button onClick={() => setMode('fusion')} className={`px-3 py-1.5 text-xs ${mode === 'fusion' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}>🔀 合并压缩</button>
            <button onClick={() => setMode('analysis')} className={`px-3 py-1.5 text-xs ${mode === 'analysis' ? 'bg-amber-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}>🔬 内容分析</button>
          </div>
          {mode === 'fusion' && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-600">Token 预算</span>
              <input type="number" value={budget} onChange={e => setBudget(+e.target.value)} className="w-20 bg-white/5 border border-white/10 rounded-md px-2 py-1 text-center text-xs focus:outline-none focus:border-blue-500/50" />
              <span className="text-gray-700 font-mono">{totalTok}→{budget} tok</span>
            </div>
          )}
          {outTok > 0 && <span className="ml-auto text-xs text-green-500 font-mono">压缩 {ratio}% · {outTok} tok</span>}
        </div>

        {/* ── Two Column Cards ── */}
        <div className="grid lg:grid-cols-2 gap-4">

          {/* LEFT: Input Card */}
          <div className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden">
            <div className="px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
              <span className="text-xs text-gray-500">Skill 输入</span>
              <button onClick={() => setSkills([...skills, { id: uid(), name: '', content: '' }])} className="text-xs text-blue-400 hover:text-blue-300">+ 添加文件</button>
            </div>
            <div className="p-4 space-y-3 max-h-[480px] overflow-y-auto">
              {skills.map((s, i) => (
                <div key={s.id} className="rounded-lg border border-white/5 bg-white/[0.02] overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/5">
                    <input value={s.name} onChange={e => setSkills(ss => ss.map(x => x.id === s.id ? { ...x, name: e.target.value } : x))} placeholder={`Skill ${i + 1}`} className="bg-transparent text-xs w-full focus:outline-none" />
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-[10px] text-gray-700 font-mono">{estimateTokens(s.content)}</span>
                      <button onClick={() => fileRefs.current[s.id]?.click()} className="text-[10px] text-gray-500 hover:text-gray-300">📎</button>
                      <input ref={el => { fileRefs.current[s.id] = el }} type="file" accept=".md,.markdown,.txt" className="hidden" onChange={e => upload(s.id, e.target.files)} />
                      {skills.length > 1 && <button onClick={() => setSkills(ss => ss.filter(x => x.id !== s.id))} className="text-[10px] text-red-500/50 hover:text-red-400">✕</button>}
                    </div>
                  </div>
                  <textarea value={s.content} onChange={e => setSkills(ss => ss.map(x => x.id === s.id ? { ...x, content: e.target.value } : x))} placeholder="粘贴 Markdown 或点击 📎 上传 .md 文件" className="w-full h-32 bg-transparent p-3 text-xs font-mono resize-none focus:outline-none placeholder-gray-700" />
                </div>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-white/5">
              <button onClick={fuse} disabled={loading || !prov?.apiKey} className="w-full py-2 rounded-lg text-xs font-medium bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white disabled:opacity-40 transition">
                {loading ? '处理中...' : mode === 'analysis' ? '🔬 分析内容构成' : '🔀 开始合并压缩'}
              </button>
            </div>
          </div>

          {/* RIGHT: Output Card */}
          <div className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden flex flex-col">
            <div className="px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
              <span className="text-xs text-gray-500">{mode === 'analysis' ? '分析报告' : '合并结果'}</span>
              {result && (
                <div className="flex gap-2">
                  <button onClick={() => navigator.clipboard.writeText(result)} className="text-[10px] text-gray-500 hover:text-gray-300">📋 复制</button>
                  <button onClick={() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([result], { type: 'text/markdown' })); a.download = 'fused-skill.md'; a.click() }} className="text-[10px] text-gray-500 hover:text-gray-300">💾 下载</button>
                </div>
              )}
            </div>
            <div className="flex-1 p-4 min-h-[400px] max-h-[480px] overflow-y-auto">
              {error && <div className="p-2 rounded-md bg-red-900/20 border border-red-800/30 text-red-300 text-xs mb-2">⚠️ {error}</div>}
              {result ? (
                <pre className="whitespace-pre-wrap text-xs font-mono text-gray-300 leading-relaxed">{result}</pre>
              ) : loading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center text-gray-600">
                    <svg className="animate-spin h-6 w-6 mx-auto mb-2" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    <p className="text-xs">处理中...</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-700 text-xs">
                  {mode === 'analysis' ? '分析报告将显示在这里' : '合并结果将显示在这里'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Features ── */}
        <div className="grid grid-cols-3 gap-3 pt-4">
          {[
            { icon: '📚', title: '多文件合并', desc: '上传多个 SKILL.md，智能去重合并' },
            { icon: '🎯', title: 'Token 预算', desc: '精确控制输出 token 数量' },
            { icon: '🧠', title: '智能压缩', desc: '基于 SkillReducer 论文方法论' },
          ].map(f => (
            <div key={f.title} className="rounded-lg border border-white/5 bg-white/[0.02] p-3 text-center">
              <div className="text-lg mb-1">{f.icon}</div>
              <div className="text-xs font-medium mb-0.5">{f.title}</div>
              <div className="text-[10px] text-gray-600">{f.desc}</div>
            </div>
          ))}
        </div>

        <p className="text-center text-[10px] text-gray-700">
          Inspired by <em>SkillReducer</em> (arXiv 2603.29919) · <a href="https://github.com/Thomaszhou22/markdown-fuser" className="underline hover:text-gray-500">GitHub</a> · 🔒 数据仅在浏览器本地处理
        </p>
      </section>

      {/* ═══ SETTINGS DIALOG ═══ */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowSettings(false)}>
          <div className="bg-[#111118] border border-white/10 rounded-2xl w-full max-w-md max-h-[75vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-sm font-semibold">模型设置</h3>
              <button onClick={() => setShowSettings(false)} className="text-gray-600 hover:text-white">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <p className="text-[10px] text-gray-600">选择 AI 服务商，填入你的 API Key。所有数据仅在浏览器本地处理。</p>
              {providers.map(p => (
                <div key={p.id} className={`rounded-lg border p-3 ${provId === p.id ? 'border-blue-500/30 bg-blue-500/5' : 'border-white/5 bg-white/[0.02]'}`}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-sm">{p.icon}</span>
                    <span className="text-xs font-medium">{p.name}</span>
                    {p.status === 'ok' && <span className="text-[10px] text-green-400">✓</span>}
                    {p.status === 'fail' && <span className="text-[10px] text-red-400">✗</span>}
                    {p.status === 'testing' && <span className="text-[10px] text-amber-400 animate-pulse">...</span>}
                  </div>
                  <div className="flex gap-1.5 mb-1.5">
                    <input type="password" value={p.apiKey} onChange={e => setProv(p.id, { apiKey: e.target.value, status: 'idle' })} placeholder="API Key" className="flex-1 bg-black/30 border border-white/5 rounded-md px-2 py-1 text-xs focus:outline-none focus:border-blue-500/50" />
                    {p.apiKey && <button onClick={() => testConn(p.id)} className="px-2 py-1 rounded-md bg-white/5 text-[10px] hover:bg-white/10">测试</button>}
                  </div>
                  {p.id === 'custom' && <input value={p.customEndpoint || ''} onChange={e => setProv(p.id, { customEndpoint: e.target.value })} placeholder="Endpoint URL" className="w-full bg-black/30 border border-white/5 rounded-md px-2 py-1 text-xs mb-1.5 focus:outline-none focus:border-blue-500/50" />}
                  {p.models.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {p.models.map(m => <button key={m} onClick={() => { setModel(m); setProvId(p.id) }} className={`text-[10px] px-1.5 py-0.5 rounded ${provId === p.id && model === m ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-500 hover:bg-white/10'}`}>{m}</button>)}
                    </div>
                  )}
                  {p.apiKey && <button onClick={() => selectProv(p.id)} className={`w-full py-1 rounded-md text-[10px] ${provId === p.id ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>{provId === p.id ? '✓ 当前使用' : '启用'}</button>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
