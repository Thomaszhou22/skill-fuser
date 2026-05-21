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
  color: string
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
  { id: 'openai', name: 'OpenAI', icon: '🟢', color: 'from-green-500/20 to-emerald-500/20', models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'], defaultModel: 'gpt-4o-mini', apiKey: '', status: 'idle' },
  { id: 'anthropic', name: 'Anthropic', icon: '🟠', color: 'from-orange-500/20 to-amber-500/20', models: ['claude-sonnet-4-20250514', 'claude-haiku-4-20250514'], defaultModel: 'claude-sonnet-4-20250514', apiKey: '', status: 'idle' },
  { id: 'google', name: 'Google Gemini', icon: '🔵', color: 'from-blue-500/20 to-cyan-500/20', models: ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'], defaultModel: 'gemini-2.0-flash', apiKey: '', status: 'idle' },
  { id: 'deepseek', name: 'DeepSeek', icon: '🟣', color: 'from-purple-500/20 to-violet-500/20', models: ['deepseek-chat', 'deepseek-reasoner'], defaultModel: 'deepseek-chat', apiKey: '', status: 'idle', customEndpoint: 'https://api.deepseek.com/v1/chat/completions' },
  { id: 'custom', name: 'Custom', icon: '⚙️', color: 'from-gray-500/20 to-slate-500/20', models: [], defaultModel: 'custom-model', apiKey: '', status: 'idle', customEndpoint: '' },
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
    if (!prov?.apiKey) { setError('请先点击右上角「模型设置」配置 API Key'); return }
    if (!skills.some(s => s.content.trim())) { setError('请至少添加一个 Skill 文件'); return }
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
    <div className="min-h-screen bg-[#f5f0e8] text-gray-900">
      {/* ═══ NAV ═══ */}
      <nav className="sticky top-0 z-40 bg-[#f5f0e8]/80 backdrop-blur-xl border-b border-[#e0d8c8]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 via-violet-500 to-purple-600 flex items-center justify-center text-sm shadow-lg shadow-violet-500/20">🔀</div>
            <div>
              <span className="font-bold text-sm">Markdown Fuser</span>
              <span className="hidden sm:inline text-gray-400 text-xs ml-2">Skill 文件合并压缩工具</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {prov && (
              <div className="hidden sm:flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-white/90 border border-[#e0d8c8]">
                <span>{prov.icon}</span>
                <span className="text-gray-400">{model || prov.defaultModel}</span>
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              </div>
            )}
            <button onClick={() => setShowSettings(true)} className={`text-xs px-4 py-2 rounded-full font-medium transition-all ${prov?.apiKey ? 'bg-white/[0.06] hover:bg-white/[0.1] text-gray-400 border border-[#e0d8c8]' : 'bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-lg shadow-violet-500/20 hover:shadow-violet-500/30'}`}>
              {prov?.apiKey ? '⚙️ 模型设置' : '🚀 开始配置'}
            </button>
          </div>
        </div>
      </nav>

      {/* ═══ HERO ═══ */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-600/[0.07] via-violet-600/[0.05] to-transparent pointer-events-none" />
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-gradient-to-r from-blue-500/10 to-violet-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative max-w-6xl mx-auto px-6 pt-16 pb-12 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/90 border border-[#e0d8c8] text-xs text-gray-400 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            基于 SkillReducer 研究 · arXiv 2603.29919
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold mb-4 leading-tight">
            <span className="bg-gradient-to-r from-blue-400 via-violet-400 to-purple-400 bg-clip-text text-transparent">合并压缩</span>
            <br />你的 Skill 文件
          </h1>
          <p className="text-gray-500 text-sm max-w-xl mx-auto leading-relaxed mb-8">
            粘贴多个 SKILL.md，设置 Token 预算，一键智能合并去重压缩。<br />
            <span className="text-gray-400">研究证明只保留 38.5% 核心规则，Agent 表现反而提升 2.8%。</span>
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/90 border border-[#e0d8c8]">
              <span className="text-lg">📚</span>
              <div className="text-left"><div className="text-xs font-medium">多文件合并</div><div className="text-[10px] text-gray-400">智能去重</div></div>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/90 border border-[#e0d8c8]">
              <span className="text-lg">🎯</span>
              <div className="text-left"><div className="text-xs font-medium">Token 预算</div><div className="text-[10px] text-gray-400">精确控制</div></div>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/90 border border-[#e0d8c8]">
              <span className="text-lg">🧠</span>
              <div className="text-left"><div className="text-xs font-medium">智能压缩</div><div className="text-[10px] text-gray-400">论文驱动</div></div>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/90 border border-[#e0d8c8]">
              <span className="text-lg">🔒</span>
              <div className="text-left"><div className="text-xs font-medium">隐私安全</div><div className="text-[10px] text-gray-400">浏览器本地</div></div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ WORKSPACE ═══ */}
      <section className="max-w-6xl mx-auto px-6 pb-20">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex rounded-xl overflow-hidden bg-white/90 border border-[#e0d8c8] p-0.5">
            <button onClick={() => setMode('fusion')} className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${mode === 'fusion' ? 'bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-lg shadow-violet-500/20' : 'text-gray-500 hover:text-gray-700'}`}>🔀 合并压缩</button>
            <button onClick={() => setMode('analysis')} className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${mode === 'analysis' ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-lg shadow-orange-500/20' : 'text-gray-500 hover:text-gray-700'}`}>🔬 内容分析</button>
          </div>
          {mode === 'fusion' && (
            <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-white/90 border border-[#e0d8c8]">
              <span className="text-xs text-gray-500">Token 预算</span>
              <input type="range" min={200} max={20000} step={100} value={budget} onChange={e => setBudget(+e.target.value)} className="w-24 accent-violet-500" />
              <input type="number" value={budget} onChange={e => setBudget(+e.target.value)} className="w-20 bg-white/[0.06] border border-[#e0d8c8] rounded-lg px-2 py-1 text-xs text-center focus:outline-none focus:border-violet-500/50 font-mono" />
              <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-mono">
                <span className="text-gray-400">{totalTok}</span>
                <span className="text-gray-500">→</span>
                <span className="text-violet-400">{budget}</span>
                <span className="text-gray-500">tok</span>
              </div>
            </div>
          )}
          {outTok > 0 && (
            <div className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20">
              <span className="text-xs text-green-400 font-medium">✓ 压缩 {ratio}%</span>
              <span className="text-[10px] text-green-500/60 font-mono">{outTok} tok</span>
            </div>
          )}
        </div>

        {/* Two Columns */}
        <div className="grid lg:grid-cols-2 gap-5">
          {/* INPUT */}
          <div className="rounded-2xl bg-white border border-[#e0d8c8] overflow-hidden shadow-2xl shadow-black/20">
            <div className="px-5 py-3 border-b border-[#e0d8c8] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-xs font-medium text-gray-400">Skill 输入</span>
                <span className="text-[10px] text-gray-500 font-mono">{totalTok} tokens</span>
              </div>
              <button onClick={() => setSkills([...skills, { id: uid(), name: '', content: '' }])} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                <span>+</span> 添加文件
              </button>
            </div>
            <div className="p-4 space-y-3 max-h-[420px] overflow-y-auto">
              {skills.map((s, i) => (
                <div key={s.id} className="rounded-xl bg-white border border-[#e0d8c8] overflow-hidden hover:border-[#c8b898] transition">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-[#e8e0d0]">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-[10px] text-gray-500 font-mono w-4">{i + 1}</span>
                      <input value={s.name} onChange={e => setSkills(ss => ss.map(x => x.id === s.id ? { ...x, name: e.target.value } : x))} placeholder={`Skill ${i + 1}`} className="bg-transparent text-xs w-full focus:outline-none placeholder-gray-700" />
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-[10px] text-gray-500 font-mono">{estimateTokens(s.content)} tok</span>
                      <button onClick={() => fileRefs.current[s.id]?.click()} className="px-2 py-0.5 rounded-md bg-white/90 text-[10px] text-gray-500 hover:text-gray-700 hover:bg-white/[0.08] transition">📎 上传</button>
                      <input ref={el => { fileRefs.current[s.id] = el }} type="file" accept=".md,.markdown,.txt" className="hidden" onChange={e => upload(s.id, e.target.files)} />
                      {skills.length > 1 && <button onClick={() => setSkills(ss => ss.filter(x => x.id !== s.id))} className="px-1.5 py-0.5 rounded-md text-[10px] text-red-500/40 hover:text-red-400 hover:bg-red-500/10 transition">✕</button>}
                    </div>
                  </div>
                  <textarea value={s.content} onChange={e => setSkills(ss => ss.map(x => x.id === s.id ? { ...x, content: e.target.value } : x))} placeholder="粘贴 Markdown 内容，或点击上方「📎 上传」导入 .md 文件" className="w-full h-28 bg-transparent p-3 text-xs font-mono resize-none focus:outline-none placeholder-gray-700/50 leading-relaxed" />
                </div>
              ))}
            </div>
            <div className="px-5 py-4 border-t border-[#e0d8c8]">
              <button onClick={fuse} disabled={loading || !prov?.apiKey} className={`w-full py-2.5 rounded-xl text-xs font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                mode === 'analysis'
                  ? 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-lg shadow-orange-500/20'
                  : 'bg-gradient-to-r from-blue-600 via-violet-600 to-purple-600 hover:from-blue-500 hover:via-violet-500 hover:to-purple-500 text-white shadow-lg shadow-violet-500/20'
              }`}>
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    处理中...
                  </span>
                ) : mode === 'analysis' ? '🔬 分析内容构成' : '🔀 开始合并压缩'}
              </button>
              {!prov?.apiKey && !loading && <p className="text-[10px] text-center text-gray-400 mt-2">请先点击右上角「🚀 开始配置」设置 API Key</p>}
            </div>
          </div>

          {/* OUTPUT */}
          <div className="rounded-2xl bg-white border border-[#e0d8c8] overflow-hidden shadow-2xl shadow-black/20 flex flex-col">
            <div className="px-5 py-3 border-b border-[#e0d8c8] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-violet-500" />
                <span className="text-xs font-medium text-gray-400">{mode === 'analysis' ? '分析报告' : '合并结果'}</span>
              </div>
              {result && (
                <div className="flex gap-2">
                  <button onClick={() => navigator.clipboard.writeText(result)} className="px-2.5 py-1 rounded-lg bg-white/90 text-[10px] text-gray-500 hover:text-gray-700 hover:bg-white/[0.08] transition">📋 复制</button>
                  <button onClick={() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([result], { type: 'text/markdown' })); a.download = 'fused-skill.md'; a.click() }} className="px-2.5 py-1 rounded-lg bg-white/90 text-[10px] text-gray-500 hover:text-gray-700 hover:bg-white/[0.08] transition">💾 下载</button>
                </div>
              )}
            </div>
            <div className="flex-1 p-5 min-h-[420px] max-h-[420px] overflow-y-auto">
              {error && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs mb-3">⚠️ {error}</div>}
              {result ? (
                <pre className="whitespace-pre-wrap text-xs font-mono text-gray-700 leading-relaxed">{result}</pre>
              ) : loading ? (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full border-2 border-violet-500/20 border-t-violet-500 animate-spin" />
                  </div>
                  <p className="text-xs text-gray-500">{mode === 'analysis' ? '正在分析内容...' : '正在合并压缩...'}</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-500">
                  <span className="text-4xl opacity-20">🔀</span>
                  <p className="text-xs">{mode === 'analysis' ? '内容分析报告将显示在这里' : '合并结果将显示在这里'}</p>
                  <p className="text-[10px] text-gray-400 max-w-xs text-center">
                    {mode === 'analysis' ? '将内容分为 Core Rule / Background / Example / Template / Redundant' : '分类 → 去重 → 压缩 → Progressive Disclosure 输出'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* HOW IT WORKS */}
        <div className="mt-12">
          <h2 className="text-center text-sm font-semibold text-gray-400 mb-6">工作原理</h2>
          <div className="grid sm:grid-cols-4 gap-4">
            {[
              { step: '1', icon: '📂', title: '上传文件', desc: '粘贴或上传多个 SKILL.md 文件' },
              { step: '2', icon: '🔬', title: '内容分析', desc: 'AI 自动分类每个段落的重要性' },
              { step: '3', icon: '🔀', title: '智能合并', desc: '去重 + 压缩到你的 Token 预算内' },
              { step: '4', icon: '✅', title: '获取结果', desc: '下载或复制压缩后的最优 Skill' },
            ].map(s => (
              <div key={s.step} className="relative rounded-xl bg-white border border-[#e0d8c8] p-4 text-center hover:bg-white/90 hover:border-[#c8b898] transition group">
                <div className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center text-[10px] font-bold shadow-lg shadow-violet-500/20">{s.step}</div>
                <div className="text-2xl mb-2 mt-1">{s.icon}</div>
                <div className="text-xs font-medium mb-1">{s.title}</div>
                <div className="text-[10px] text-gray-400 leading-relaxed">{s.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* FOOTER */}
        <div className="mt-12 text-center">
          <div className="inline-flex items-center gap-4 px-4 py-2 rounded-full bg-white border border-[#e0d8c8]">
            <span className="text-[10px] text-gray-400">Inspired by <em>SkillReducer</em> (arXiv 2603.29919)</span>
            <span className="text-gray-400">·</span>
            <a href="https://github.com/Thomaszhou22/markdown-fuser" target="_blank" className="text-[10px] text-gray-500 hover:text-gray-700 underline">GitHub</a>
            <span className="text-gray-400">·</span>
            <span className="text-[10px] text-gray-400">🔒 数据仅在浏览器本地处理</span>
          </div>
        </div>
      </section>

      {/* ═══ SETTINGS DIALOG ═══ */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setShowSettings(false)}>
          <div className="bg-white border border-[#e0d8c8] rounded-2xl w-full max-w-md max-h-[75vh] overflow-hidden flex flex-col shadow-2xl shadow-black/40" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-[#e0d8c8] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold">模型设置</h3>
                <p className="text-[10px] text-gray-400 mt-0.5">选择 AI 服务商，填入你的 API Key</p>
              </div>
              <button onClick={() => setShowSettings(false)} className="w-7 h-7 rounded-lg bg-white/90 flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/[0.08] transition">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {providers.map(p => (
                <div key={p.id} className={`rounded-xl border p-4 transition-all ${provId === p.id ? 'border-violet-500/30 bg-gradient-to-br ' + p.color : 'border-[#e0d8c8] bg-white hover:border-[#c8b898]'}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">{p.icon}</span>
                    <span className="text-sm font-semibold">{p.name}</span>
                    <div className="ml-auto">
                      {p.status === 'ok' && <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">✓ 已连接</span>}
                      {p.status === 'fail' && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">✗ 失败</span>}
                      {p.status === 'testing' && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">测试中</span>}
                    </div>
                  </div>
                  <div className="flex gap-2 mb-2">
                    <input type="password" value={p.apiKey} onChange={e => setProv(p.id, { apiKey: e.target.value, status: 'idle' })} placeholder="输入 API Key" className="flex-1 bg-[#f5f0e8] border border-[#e0d8c8] rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-violet-500/50 transition" />
                    {p.apiKey && <button onClick={() => testConn(p.id)} className="px-3 py-2 rounded-lg bg-white/[0.06] text-xs text-gray-400 hover:bg-white/[0.1] transition whitespace-nowrap">测试连接</button>}
                  </div>
                  {p.id === 'custom' && <input value={p.customEndpoint || ''} onChange={e => setProv(p.id, { customEndpoint: e.target.value })} placeholder="https://api.example.com/v1/chat/completions" className="w-full bg-[#f5f0e8] border border-[#e0d8c8] rounded-lg px-3 py-2 text-xs mb-2 focus:outline-none focus:border-violet-500/50 transition" />}
                  {p.models.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {p.models.map(m => <button key={m} onClick={() => { setModel(m); setProvId(p.id) }} className={`text-[10px] px-2.5 py-1 rounded-lg transition ${provId === p.id && model === m ? 'bg-violet-600 text-white shadow shadow-violet-500/20' : 'bg-white/90 text-gray-500 hover:bg-white/[0.08]'}`}>{m}</button>)}
                    </div>
                  )}
                  {p.apiKey && (
                    <button onClick={() => selectProv(p.id)} className={`w-full py-2 rounded-lg text-xs font-medium transition-all ${provId === p.id ? 'bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow shadow-violet-500/20' : 'bg-white/[0.06] text-gray-400 hover:bg-white/[0.1]'}`}>
                      {provId === p.id ? '✓ 当前使用' : '启用此模型'}
                    </button>
                  )}
                </div>
              ))}
              <p className="text-[10px] text-gray-500 text-center pt-1">🔒 API Key 仅保存在浏览器本地，不会上传到任何服务器</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
