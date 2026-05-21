import { useState, useCallback, useRef, useEffect } from 'react'

/* ─── Types ─── */
interface SkillInput { id: string; name: string; content: string }
interface ProviderConfig {
  id: string; name: string; models: string[]; defaultModel: string
  apiKey: string; customEndpoint?: string; enabled: boolean; status: 'idle' | 'testing' | 'ok' | 'fail'
}
interface HistoryEntry { id: string; timestamp: number; mode: 'fusion' | 'analysis'; model: string; inputNames: string[]; inputTokens: number; output: string; outputTokens: number; budget: number }
interface FavoriteEntry { id: string; timestamp: number; name: string; content: string; tokens: number }

type FuseMode = 'fusion' | 'analysis'
type Modal = 'none' | 'settings' | 'history' | 'favorites' | 'data'

const uid = () => Math.random().toString(36).slice(2, 8)
const estimateTokens = (t: string) => { const c = (t.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).length; return Math.ceil(c / 2 + (t.length - c) / 4) }
const STORAGE_KEY = 'markdown-fuser-'

/* ─── Default Providers ─── */
const DEFAULT_PROVIDERS: ProviderConfig[] = [
  { id: 'openai', name: 'OpenAI', models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'], defaultModel: 'gpt-4o-mini', apiKey: '', enabled: false, status: 'idle' },
  { id: 'anthropic', name: 'Anthropic', models: ['claude-sonnet-4-20250514', 'claude-haiku-4-20250514'], defaultModel: 'claude-sonnet-4-20250514', apiKey: '', enabled: false, status: 'idle' },
  { id: 'google', name: 'Google Gemini', models: ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'], defaultModel: 'gemini-2.0-flash', apiKey: '', enabled: false, status: 'idle' },
  { id: 'deepseek', name: 'DeepSeek', models: ['deepseek-chat', 'deepseek-reasoner'], defaultModel: 'deepseek-chat', apiKey: '', enabled: false, status: 'idle', customEndpoint: 'https://api.deepseek.com/v1/chat/completions' },
  { id: 'custom', name: 'Custom (OpenAI Compatible)', models: [], defaultModel: 'custom-model', apiKey: '', enabled: false, status: 'idle', customEndpoint: '' },
]

/* ─── Persistence Helpers ─── */
function loadJSON<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(STORAGE_KEY + key); return v ? JSON.parse(v) : fallback } catch { return fallback }
}
function saveJSON(key: string, data: unknown) { localStorage.setItem(STORAGE_KEY + key, JSON.stringify(data)) }

export default function App() {
  /* ─── State ─── */
  const [skills, setSkills] = useState<SkillInput[]>([{ id: uid(), name: '', content: '' }])
  const [budget, setBudget] = useState(2000)
  const [providers, setProviders] = useState<ProviderConfig[]>(() => loadJSON('providers', DEFAULT_PROVIDERS))
  const [provId, setProvId] = useState(() => loadJSON('active-provider', ''))
  const [model, setModel] = useState(() => loadJSON('active-model', ''))
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<FuseMode>('fusion')
  const [modal, setModal] = useState<Modal>('none')
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadJSON('history', []))
  const [favorites, setFavorites] = useState<FavoriteEntry[]>(() => loadJSON('favorites', []))
  const [historySearch, setHistorySearch] = useState('')
  const [favName, setFavName] = useState('')
  const [editingProv, setEditingProv] = useState<string | null>(null)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const importRef = useRef<HTMLInputElement>(null)

  const prov = providers.find(p => p.id === provId)
  const totalTok = skills.reduce((s, k) => s + estimateTokens(k.content), 0)
  const outTok = estimateTokens(result)
  const ratio = totalTok > 0 && outTok > 0 ? Math.round((1 - outTok / totalTok) * 100) : 0

  /* ─── Persist ─── */
  useEffect(() => { saveJSON('providers', providers) }, [providers])
  useEffect(() => { saveJSON('active-provider', provId) }, [provId])
  useEffect(() => { saveJSON('active-model', model) }, [model])
  useEffect(() => { saveJSON('history', history) }, [history])
  useEffect(() => { saveJSON('favorites', favorites) }, [favorites])

  const setProv = (id: string, u: Partial<ProviderConfig>) => setProviders(ps => ps.map(p => p.id === id ? { ...p, ...u } : p))

  /* ─── Test Connection ─── */
  const testConn = async (id: string) => {
    const p = providers.find(x => x.id === id)!
    if (!p.apiKey) return
    setProv(id, { status: 'testing' })
    try {
      const m = p.defaultModel
      if (id === 'anthropic') {
        const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': p.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body: JSON.stringify({ model: m, max_tokens: 5, messages: [{ role: 'user', content: 'Hi' }] }) })
        if ((await r.json()).error) throw 0
      } else if (id === 'google') {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${p.apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: 'Hi' }] }] }) })
        if ((await r.json()).error) throw 0
      } else {
        const r = await fetch(p.customEndpoint || 'https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${p.apiKey}` }, body: JSON.stringify({ model: m, max_tokens: 5, messages: [{ role: 'user', content: 'Hi' }] }) })
        if ((await r.json()).error) throw 0
      }
      setProv(id, { status: 'ok', enabled: true })
      if (!provId) { setProvId(id); setModel(m) }
    } catch { setProv(id, { status: 'fail' }) }
  }

  const selectProv = (id: string) => {
    const p = providers.find(x => x.id === id)
    if (!p?.apiKey) return
    setProvId(id); setModel(p.defaultModel); setProv(id, { enabled: true })
  }

  /* ─── File Upload ─── */
  const upload = (id: string, files: FileList | null) => {
    if (!files?.[0]) return
    const f = files[0]
    const r = new FileReader()
    r.onload = e => setSkills(ss => ss.map(s => s.id === id ? { ...s, content: e.target?.result as string, name: s.name || f.name.replace(/\.(md|markdown|txt)$/i, '') } : s))
    r.readAsText(f)
  }

  /* ─── Build Prompt ─── */
  const buildPrompt = () => {
    const vs = skills.filter(s => s.content.trim())
    const md = vs.map((s, i) => `<skill_${i + 1} name="${s.name || 'unnamed'}">\n${s.content}\n</skill_${i + 1}>`).join('\n\n')
    if (mode === 'analysis') return {
      sys: `Classify every section into: Core Rule / Background / Example / Template / Redundant. Output a table per skill, then statistics with percentages and recommended budget.`,
      usr: `Analyze these ${vs.length} skills:\n\n${md}`
    }
    return {
      sys: `You are a SkillReducer fusion engine. Merge ${vs.length} skill docs into <=${budget} tokens (from ~${totalTok}).
Pipeline: 1) Classify sections 2) Deduplicate 3) Compress.
Output: # Title>description\n## Mandatory Rules\n## Workflows\n## Quick Reference\n## Red Flags
Keep safety/error/numbered procedures verbatim. Drop motivation, merge variants, convert prose to bullets. Markdown only.`,
      usr: `Fuse into <=${budget} tokens:\n\n${md}`
    }
  }

  /* ─── Run Fusion/Analysis ─── */
  const fuse = useCallback(async () => {
    if (!prov?.apiKey) { setError('Please configure an API Key first (top-right Model Settings)'); return }
    if (!skills.some(s => s.content.trim())) { setError('Please add at least one Skill file'); return }
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
      setHistory(h => [{ id: uid(), timestamp: Date.now(), mode, model: m, inputNames: skills.filter(s => s.content.trim()).map(s => s.name || 'unnamed'), inputTokens: totalTok, output: t, outputTokens: estimateTokens(t), budget }, ...h].slice(0, 200))
    } catch (e: any) { setError(e.message || 'Error') } finally { setLoading(false) }
  }, [prov, model, skills, budget, mode, totalTok])

  /* ─── Data Management ─── */
  const exportData = () => {
    const data = { providers, history, favorites, settings: { provId, model, budget } }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `markdown-fuser-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click()
  }
  const importData = (files: FileList | null) => {
    if (!files?.[0]) return
    const r = new FileReader()
    r.onload = e => {
      try {
        const d = JSON.parse(e.target?.result as string)
        if (d.providers) setProviders(d.providers)
        if (d.history) setHistory(d.history)
        if (d.favorites) setFavorites(d.favorites)
        if (d.settings) { setProvId(d.settings.provId || ''); setModel(d.settings.model || ''); setBudget(d.settings.budget || 2000) }
        alert('Import successful!')
      } catch { alert('Invalid backup file') }
    }
    r.readAsText(files[0])
  }
  const clearAll = () => {
    if (!confirm('Clear all data? This cannot be undone.')) return
    localStorage.removeItem(STORAGE_KEY + 'providers')
    localStorage.removeItem(STORAGE_KEY + 'history')
    localStorage.removeItem(STORAGE_KEY + 'favorites')
    localStorage.removeItem(STORAGE_KEY + 'active-provider')
    localStorage.removeItem(STORAGE_KEY + 'active-model')
    setProviders(DEFAULT_PROVIDERS); setHistory([]); setFavorites([]); setProvId(''); setModel(''); setResult('')
  }

  /* ─── Storage Size ─── */
  const getStorageSize = () => {
    let total = 0
    for (const k of Object.keys(localStorage)) if (k.startsWith(STORAGE_KEY)) total += localStorage.getItem(k)?.length || 0
    return (total / 1024).toFixed(1)
  }

  /* ─── Render ─── */
  return (
    <div className="min-h-screen bg-[#f5f0e8] text-gray-900">
      {/* ═══ NAV ═══ */}
      <nav className="sticky top-0 z-40 bg-[#f5f0e8]/80 backdrop-blur-xl border-b border-[#e0d8c8]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 via-amber-400 to-yellow-600 flex items-center justify-center shadow shadow-amber-600/20">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>
            </div>
            <span className="font-bold text-sm">Markdown Fuser</span>
          </div>
          <div className="flex items-center gap-2">
            {prov && <div className="hidden sm:flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-white border border-[#e0d8c8] text-gray-500"><span className="w-1.5 h-1.5 rounded-full bg-green-500" />{model || prov.defaultModel}</div>}
            <button onClick={() => setModal('favorites')} className="px-2.5 py-1.5 rounded-lg text-[11px] text-gray-500 hover:text-gray-700 hover:bg-white border border-transparent hover:border-[#e0d8c8] transition">Favorites</button>
            <button onClick={() => setModal('history')} className="px-2.5 py-1.5 rounded-lg text-[11px] text-gray-500 hover:text-gray-700 hover:bg-white border border-transparent hover:border-[#e0d8c8] transition">History</button>
            <button onClick={() => setModal('data')} className="px-2.5 py-1.5 rounded-lg text-[11px] text-gray-500 hover:text-gray-700 hover:bg-white border border-transparent hover:border-[#e0d8c8] transition">Data</button>
            <button onClick={() => setModal('settings')} className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${prov?.apiKey ? 'bg-white border border-[#e0d8c8] text-gray-600 hover:bg-gray-50' : 'bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow shadow-amber-600/20'}`}>
              {prov?.apiKey ? 'Model Settings' : 'Get Started'}
            </button>
          </div>
        </div>
      </nav>

      {/* ═══ HERO ═══ */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-amber-600/[0.04] via-amber-500/[0.02] to-transparent pointer-events-none" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-8 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-[#e0d8c8] text-[11px] text-gray-500 mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Based on SkillReducer research (arXiv 2603.29919)
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold mb-3 leading-tight">
            <span className="bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-700 bg-clip-text text-transparent">Merge &amp; Compress</span><br />your Skill files
          </h1>
          <p className="text-gray-500 text-sm max-w-lg mx-auto leading-relaxed mb-6">
            Paste multiple SKILL.md files, set a token budget, and let AI merge, deduplicate, and compress them into one optimized file.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {[
              { t: 'Multi-file Merge', d: 'Smart dedup' },
              { t: 'Token Budget', d: 'Precise control' },
              { t: 'AI Compression', d: 'Research-backed' },
              { t: 'Privacy First', d: 'Browser-only' },
            ].map(f => (
              <div key={f.t} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-[#e0d8c8] text-[11px]">
                <span className="font-medium text-gray-700">{f.t}</span>
                <span className="text-gray-400">{f.d}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ WORKSPACE ═══ */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex rounded-lg overflow-hidden bg-white border border-[#e0d8c8] p-0.5">
            <button onClick={() => setMode('fusion')} className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${mode === 'fusion' ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow shadow-amber-600/20' : 'text-gray-500 hover:text-gray-700'}`}>Fusion</button>
            <button onClick={() => setMode('analysis')} className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${mode === 'analysis' ? 'bg-gradient-to-r from-amber-600 to-orange-500 text-white shadow shadow-orange-500/20' : 'text-gray-500 hover:text-gray-700'}`}>Analysis</button>
          </div>
          {mode === 'fusion' && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-[#e0d8c8]">
              <span className="text-[11px] text-gray-500">Budget</span>
              <input type="range" min={200} max={20000} step={100} value={budget} onChange={e => setBudget(+e.target.value)} className="w-20 accent-amber-500" />
              <input type="number" value={budget} onChange={e => setBudget(+e.target.value)} className="w-16 bg-[#f5f0e8] border border-[#e0d8c8] rounded-md px-2 py-0.5 text-[11px] text-center focus:outline-none focus:border-amber-500/50 font-mono" />
              <span className="text-[10px] text-gray-400 font-mono">{totalTok} tok input</span>
            </div>
          )}
          {outTok > 0 && (
            <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-50 border border-green-200">
              <span className="text-[11px] text-green-600 font-medium">{ratio}% compressed</span>
              <span className="text-[10px] text-green-500 font-mono">{outTok} tok</span>
            </div>
          )}
        </div>

        {/* Two Columns */}
        <div className="grid lg:grid-cols-2 gap-4">
          {/* INPUT */}
          <div className="rounded-xl bg-white border border-[#e0d8c8] overflow-hidden shadow-sm">
            <div className="px-4 py-2.5 border-b border-[#e8e0d0] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                <span className="text-xs font-medium text-gray-600">Skill Input</span>
                <span className="text-[10px] text-gray-400 font-mono">{totalTok} tok</span>
              </div>
              <button onClick={() => setSkills([...skills, { id: uid(), name: '', content: '' }])} className="text-[11px] text-amber-600 hover:text-amber-700 font-medium">+ Add File</button>
            </div>
            <div className="p-3 space-y-2 max-h-[400px] overflow-y-auto">
              {skills.map((s, i) => (
                <div key={s.id} className="rounded-lg border border-[#e8e0d0] overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#ece4d4] bg-[#faf6ee]">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-[10px] text-gray-400 font-mono">{i + 1}</span>
                      <input value={s.name} onChange={e => setSkills(ss => ss.map(x => x.id === s.id ? { ...x, name: e.target.value } : x))} placeholder={`Skill ${i + 1}`} className="bg-transparent text-xs w-full focus:outline-none placeholder-gray-400" />
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <span className="text-[10px] text-gray-400 font-mono">{estimateTokens(s.content)}</span>
                      <button onClick={() => fileRefs.current[s.id]?.click()} className="px-1.5 py-0.5 rounded text-[10px] text-gray-500 hover:text-amber-600 hover:bg-amber-50 transition">Upload</button>
                      <input ref={el => { fileRefs.current[s.id] = el }} type="file" accept=".md,.markdown,.txt" className="hidden" onChange={e => upload(s.id, e.target.files)} />
                      {skills.length > 1 && <button onClick={() => setSkills(ss => ss.filter(x => x.id !== s.id))} className="px-1 py-0.5 rounded text-[10px] text-red-400 hover:text-red-500 hover:bg-red-50 transition">x</button>}
                    </div>
                  </div>
                  <textarea value={s.content} onChange={e => setSkills(ss => ss.map(x => x.id === s.id ? { ...x, content: e.target.value } : x))} placeholder="Paste Markdown content or upload a .md file" className="w-full h-24 bg-transparent p-3 text-xs font-mono resize-none focus:outline-none placeholder-gray-300 leading-relaxed" />
                </div>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-[#e8e0d0]">
              <button onClick={fuse} disabled={loading || !prov?.apiKey} className={`w-full py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed ${mode === 'analysis' ? 'bg-gradient-to-r from-amber-600 to-orange-500 hover:from-amber-500 hover:to-orange-400 text-white shadow shadow-orange-500/20' : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white shadow shadow-amber-600/20'}`}>
                {loading ? <span className="flex items-center justify-center gap-2"><svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Processing...</span> : mode === 'analysis' ? 'Analyze Content' : 'Start Fusion'}
              </button>
              {!prov?.apiKey && !loading && <p className="text-[10px] text-center text-gray-400 mt-1.5">Click "Get Started" (top-right) to configure your API Key</p>}
            </div>
          </div>

          {/* OUTPUT */}
          <div className="rounded-xl bg-white border border-[#e0d8c8] overflow-hidden shadow-sm flex flex-col">
            <div className="px-4 py-2.5 border-b border-[#e8e0d0] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <span className="text-xs font-medium text-gray-600">{mode === 'analysis' ? 'Analysis Report' : 'Fusion Result'}</span>
              </div>
              {result && (
                <div className="flex gap-1.5">
                  <button onClick={() => { setFavName(''); setModal('favorites') /* will need to handle save separately */ }} className="px-2 py-0.5 rounded text-[10px] text-amber-600 hover:bg-amber-50 transition border border-transparent hover:border-amber-200">Save</button>
                  <button onClick={() => navigator.clipboard.writeText(result)} className="px-2 py-0.5 rounded text-[10px] text-gray-500 hover:bg-gray-50 transition border border-transparent hover:border-[#e0d8c8]">Copy</button>
                  <button onClick={() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([result], { type: 'text/markdown' })); a.download = 'fused-skill.md'; a.click() }} className="px-2 py-0.5 rounded text-[10px] text-gray-500 hover:bg-gray-50 transition border border-transparent hover:border-[#e0d8c8]">Download</button>
                </div>
              )}
            </div>
            <div className="flex-1 p-4 min-h-[400px] max-h-[400px] overflow-y-auto">
              {error && <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs mb-2">{error}</div>}
              {result ? (
                <pre className="whitespace-pre-wrap text-xs font-mono text-gray-700 leading-relaxed">{result}</pre>
              ) : loading ? (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <div className="w-10 h-10 rounded-full border-2 border-amber-200 border-t-amber-500 animate-spin" />
                  <p className="text-xs text-gray-400">{mode === 'analysis' ? 'Analyzing content...' : 'Merging and compressing...'}</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400">
                  <svg className="w-10 h-10 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  <p className="text-xs">Results will appear here</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* HOW IT WORKS */}
        <div className="mt-10">
          <h2 className="text-center text-xs font-semibold text-gray-400 mb-4 uppercase tracking-wider">How it works</h2>
          <div className="grid sm:grid-cols-4 gap-3">
            {[
              { n: '1', t: 'Upload Files', d: 'Paste or upload multiple SKILL.md files' },
              { n: '2', t: 'Analyze Content', d: 'AI classifies every paragraph by importance' },
              { n: '3', t: 'Smart Merge', d: 'Deduplicate + compress within your token budget' },
              { n: '4', t: 'Get Results', d: 'Download or copy the optimized output' },
            ].map(s => (
              <div key={s.n} className="rounded-lg bg-white border border-[#e0d8c8] p-3 hover:border-[#c8b898] transition group relative">
                <div className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-[9px] font-bold text-white shadow shadow-amber-600/20">{s.n}</div>
                <div className="text-xs font-medium mt-1 mb-0.5 text-gray-700">{s.t}</div>
                <div className="text-[10px] text-gray-400 leading-relaxed">{s.d}</div>
              </div>
            ))}
          </div>
        </div>

        {/* FOOTER */}
        <div className="mt-8 text-center">
          <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-white border border-[#e0d8c8] text-[10px] text-gray-400">
            <span>Inspired by <em>SkillReducer</em></span>
            <span className="text-gray-300">|</span>
            <a href="https://github.com/Thomaszhou22/markdown-fuser" target="_blank" className="text-gray-500 hover:text-amber-600 underline">GitHub</a>
            <span className="text-gray-300">|</span>
            <span>All data stays in your browser</span>
          </div>
        </div>
      </section>

      {/* ═══ MODALS ═══ */}
      {modal !== 'none' && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setModal('none')}>
          <div className="bg-white border border-[#e0d8c8] rounded-xl w-full shadow-xl max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()} style={{ maxWidth: modal === 'settings' ? '560px' : modal === 'data' ? '500px' : '480px' }}>

            {/* ═══ MODEL MANAGEMENT ═══ */}
            {modal === 'settings' && (<>
              <div className="px-5 py-3.5 border-b border-[#e8e0d0] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-gray-800">Model Management</h3>
                  <p className="text-[10px] text-gray-400 mt-0.5">Configure AI providers and API keys</p>
                </div>
                <button onClick={() => setModal('none')} className="w-6 h-6 rounded-md hover:bg-gray-100 flex items-center justify-center text-gray-400 text-sm transition">x</button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {providers.map(p => (
                  <div key={p.id} className={`rounded-lg border p-3 transition-all ${editingProv === p.id ? 'border-amber-400 bg-amber-50/50' : provId === p.id && p.enabled ? 'border-green-200 bg-green-50/30' : 'border-[#e8e0d0] hover:border-[#c8b898]'}`}>
                    {/* Header */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-gray-700">{p.name}</span>
                        {p.id === provId && p.enabled && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-600 font-medium">Active</span>}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {p.status === 'ok' && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-600">Connected</span>}
                        {p.status === 'fail' && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">Failed</span>}
                        {p.status === 'testing' && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-600 animate-pulse">Testing</span>}
                        <button onClick={() => setEditingProv(editingProv === p.id ? null : p.id)} className="text-[10px] px-2 py-0.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition">{editingProv === p.id ? 'Collapse' : 'Edit'}</button>
                      </div>
                    </div>
                    {/* Edit Panel */}
                    {editingProv === p.id && (
                      <div className="space-y-2 pt-1">
                        <div className="flex gap-2">
                          <input type="password" value={p.apiKey} onChange={e => setProv(p.id, { apiKey: e.target.value, status: 'idle' })} placeholder="API Key" className="flex-1 bg-[#f5f0e8] border border-[#e0d8c8] rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:border-amber-500/50" />
                          <button onClick={() => testConn(p.id)} disabled={!p.apiKey} className="px-3 py-1.5 rounded-md bg-[#f5f0e8] text-xs text-gray-500 hover:bg-gray-200 disabled:opacity-30 transition whitespace-nowrap">Test</button>
                        </div>
                        {p.id === 'custom' && <input value={p.customEndpoint || ''} onChange={e => setProv(p.id, { customEndpoint: e.target.value })} placeholder="https://api.example.com/v1/chat/completions" className="w-full bg-[#f5f0e8] border border-[#e0d8c8] rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:border-amber-500/50" />}
                        {p.models.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {p.models.map(m => <button key={m} onClick={() => { setModel(m); setProvId(p.id) }} className={`text-[10px] px-2 py-0.5 rounded transition ${provId === p.id && model === m ? 'bg-amber-500 text-white' : 'bg-[#f5f0e8] text-gray-500 hover:bg-gray-200'}`}>{m}</button>)}
                          </div>
                        )}
                        <button onClick={() => selectProv(p.id)} className={`w-full py-1.5 rounded-md text-[11px] font-medium transition-all ${provId === p.id && p.enabled ? 'bg-green-100 text-green-700' : 'bg-amber-500 text-white hover:bg-amber-600'}`}>
                          {provId === p.id && p.enabled ? 'Currently Active' : 'Enable'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                <p className="text-[10px] text-gray-400 text-center pt-1">API Keys are stored in your browser only. Never sent to any server.</p>
              </div>
            </>)}

            {/* ═══ HISTORY ═══ */}
            {modal === 'history' && (<>
              <div className="px-5 py-3.5 border-b border-[#e8e0d0] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-gray-800">History</h3>
                  <p className="text-[10px] text-gray-400 mt-0.5">{history.length} entries</p>
                </div>
                <div className="flex items-center gap-2">
                  {history.length > 0 && <button onClick={() => { if (confirm('Clear all history?')) setHistory([]) }} className="text-[10px] text-red-400 hover:text-red-500">Clear All</button>}
                  <button onClick={() => setModal('none')} className="w-6 h-6 rounded-md hover:bg-gray-100 flex items-center justify-center text-gray-400 text-sm transition">x</button>
                </div>
              </div>
              <div className="px-4 py-2 border-b border-[#e8e0d0]">
                <input value={historySearch} onChange={e => setHistorySearch(e.target.value)} placeholder="Search history..." className="w-full bg-[#f5f0e8] rounded-md px-3 py-1.5 text-xs focus:outline-none" />
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {history.filter(h => !historySearch || h.inputNames.some(n => n.toLowerCase().includes(historySearch.toLowerCase())) || h.output.toLowerCase().includes(historySearch.toLowerCase())).length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-xs">No history yet</div>
                ) : history.filter(h => !historySearch || h.inputNames.some(n => n.toLowerCase().includes(historySearch.toLowerCase())) || h.output.toLowerCase().includes(historySearch.toLowerCase())).map(h => (
                  <div key={h.id} className="rounded-lg border border-[#e8e0d0] p-3 hover:border-[#c8b898] transition cursor-pointer" onClick={() => { setResult(h.output); setMode(h.mode); setModal('none') }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${h.mode === 'analysis' ? 'bg-orange-100 text-orange-600' : 'bg-amber-100 text-amber-600'}`}>{h.mode}</span>
                        <span className="text-[10px] text-gray-400">{h.model}</span>
                      </div>
                      <span className="text-[10px] text-gray-400">{new Date(h.timestamp).toLocaleDateString()} {new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="text-[10px] text-gray-500 mb-1">{h.inputNames.join(', ')}</div>
                    <div className="text-[10px] text-gray-400 font-mono">{h.inputTokens} tok {'>'} {h.outputTokens} tok ({h.budget} budget)</div>
                    <div className="text-[11px] text-gray-500 mt-1.5 line-clamp-2 leading-relaxed">{h.output.slice(0, 120)}...</div>
                  </div>
                ))}
              </div>
            </>)}

            {/* ═══ FAVORITES ═══ */}
            {modal === 'favorites' && (<>
              <div className="px-5 py-3.5 border-b border-[#e8e0d0] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-gray-800">Favorites</h3>
                  <p className="text-[10px] text-gray-400 mt-0.5">{favorites.length} saved</p>
                </div>
                <div className="flex items-center gap-2">
                  {result && (
                    <div className="flex items-center gap-1.5">
                      <input value={favName} onChange={e => setFavName(e.target.value)} placeholder="Name..." className="bg-[#f5f0e8] border border-[#e0d8c8] rounded-md px-2 py-1 text-[11px] w-28 focus:outline-none" />
                      <button onClick={() => { if (result) { setFavorites(f => [{ id: uid(), timestamp: Date.now(), name: favName || 'Untitled', content: result, tokens: estimateTokens(result) }, ...f]); setFavName(''); setResult('') } }} className="px-2.5 py-1 rounded-md bg-amber-500 text-white text-[11px] hover:bg-amber-600 transition">Save Current</button>
                    </div>
                  )}
                  <button onClick={() => setModal('none')} className="w-6 h-6 rounded-md hover:bg-gray-100 flex items-center justify-center text-gray-400 text-sm transition">x</button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {favorites.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-xs">
                    <p>No favorites yet</p>
                    <p className="mt-1 text-[10px]">Run a fusion first, then save the result</p>
                  </div>
                ) : favorites.map(f => (
                  <div key={f.id} className="rounded-lg border border-[#e8e0d0] p-3 hover:border-[#c8b898] transition">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-700">{f.name}</span>
                        <span className="text-[10px] text-gray-400 font-mono">{f.tokens} tok</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-gray-400">{new Date(f.timestamp).toLocaleDateString()}</span>
                        <button onClick={() => navigator.clipboard.writeText(f.content)} className="text-[10px] px-1.5 py-0.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100">Copy</button>
                        <button onClick={() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([f.content], { type: 'text/markdown' })); a.download = `${f.name}.md`; a.click() }} className="text-[10px] px-1.5 py-0.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100">Download</button>
                        <button onClick={() => setFavorites(fs => fs.filter(x => x.id !== f.id))} className="text-[10px] px-1.5 py-0.5 rounded text-red-400 hover:text-red-500 hover:bg-red-50">Delete</button>
                      </div>
                    </div>
                    <pre className="text-[10px] text-gray-500 font-mono line-clamp-3 leading-relaxed">{f.content.slice(0, 200)}</pre>
                  </div>
                ))}
              </div>
            </>)}

            {/* ═══ DATA MANAGEMENT ═══ */}
            {modal === 'data' && (<>
              <div className="px-5 py-3.5 border-b border-[#e8e0d0] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-gray-800">Data Management</h3>
                  <p className="text-[10px] text-gray-400 mt-0.5">Export, import, and manage your data</p>
                </div>
                <button onClick={() => setModal('none')} className="w-6 h-6 rounded-md hover:bg-gray-100 flex items-center justify-center text-gray-400 text-sm transition">x</button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-5">
                {/* Storage */}
                <div>
                  <h4 className="text-xs font-semibold text-gray-700 mb-2">Storage Usage</h4>
                  <div className="rounded-lg bg-[#f5f0e8] border border-[#e0d8c8] p-3 text-xs text-gray-500 space-y-1">
                    <div className="flex justify-between"><span>Total (estimated)</span><span className="font-mono">{getStorageSize()} KB</span></div>
                    <div className="flex justify-between"><span>History entries</span><span className="font-mono">{history.length}</span></div>
                    <div className="flex justify-between"><span>Favorites</span><span className="font-mono">{favorites.length}</span></div>
                    <div className="flex justify-between"><span>Configured providers</span><span className="font-mono">{providers.filter(p => p.apiKey).length}</span></div>
                  </div>
                </div>
                {/* Export */}
                <div>
                  <h4 className="text-xs font-semibold text-gray-700 mb-2">Export Data</h4>
                  <p className="text-[10px] text-gray-400 mb-2">Download all your data as a JSON file, including API keys, history, and favorites.</p>
                  <button onClick={exportData} className="px-4 py-2 rounded-lg bg-amber-500 text-white text-xs font-medium hover:bg-amber-600 transition shadow shadow-amber-500/20">Export All Data</button>
                </div>
                {/* Import */}
                <div>
                  <h4 className="text-xs font-semibold text-gray-700 mb-2">Import Data</h4>
                  <p className="text-[10px] text-gray-400 mb-2">Restore from a previously exported backup file. This will overwrite existing data.</p>
                  <button onClick={() => importRef.current?.click()} className="px-4 py-2 rounded-lg bg-[#f5f0e8] border border-[#e0d8c8] text-xs text-gray-600 hover:bg-gray-200 transition">Choose Backup File</button>
                  <input ref={importRef} type="file" accept=".json" className="hidden" onChange={e => importData(e.target.files)} />
                </div>
                {/* Danger Zone */}
                <div>
                  <h4 className="text-xs font-semibold text-red-500 mb-2">Danger Zone</h4>
                  <div className="rounded-lg border border-red-200 p-3 bg-red-50/50">
                    <p className="text-[10px] text-red-400 mb-2">This will permanently delete all your data including API keys, history, and favorites.</p>
                    <button onClick={clearAll} className="px-4 py-1.5 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-600 transition">Clear All Data</button>
                  </div>
                </div>
              </div>
            </>)}
          </div>
        </div>
      )}
    </div>
  )
}
