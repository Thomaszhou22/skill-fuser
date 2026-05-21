import { useState, useCallback } from 'react'

interface SkillInput {
  id: string
  name: string
  content: string
}

type ModelProvider = 'openai' | 'anthropic' | 'google' | 'custom'

function generateId() {
  return Math.random().toString(36).slice(2, 8)
}

function estimateTokens(text: string): number {
  // Rough: 1 token ≈ 4 chars for English, ≈ 2 chars for CJK
  const cjk = (text.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).length
  const rest = text.length - cjk
  return Math.ceil(cjk / 2 + rest / 4)
}

export default function App() {
  const [skills, setSkills] = useState<SkillInput[]>([
    { id: generateId(), name: 'SKILL 1', content: '' },
    { id: generateId(), name: 'SKILL 2', content: '' },
  ])
  const [tokenBudget, setTokenBudget] = useState(2000)
  const [apiKey, setApiKey] = useState('')
  const [provider, setProvider] = useState<ModelProvider>('openai')
  const [customEndpoint, setCustomEndpoint] = useState('')
  const [modelName, setModelName] = useState('gpt-4o-mini')
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'input' | 'output'>('input')

  const totalTokens = skills.reduce((s, sk) => s + estimateTokens(sk.content), 0)

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

  const handleFileUpload = (id: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      updateSkill(id, 'content', text)
      // auto-set name from filename
      const name = file.name.replace(/\.(md|markdown|txt)$/i, '')
      updateSkill(id, 'name', name)
    }
    reader.readAsText(file)
  }

  const handleFuse = useCallback(async () => {
    if (!apiKey) { setError('Please enter your API key'); return }
    if (skills.every(s => !s.content.trim())) { setError('Please add some markdown content'); return }

    setLoading(true)
    setError('')
    setResult('')
    setActiveTab('output')

    const skillsMarkdown = skills
      .filter(s => s.content.trim())
      .map((s, i) => `<skill_${i + 1} name="${s.name}">\n${s.content}\n</skill_${i + 1}>`)
      .join('\n\n')

    const systemPrompt = `You are a Markdown Fusion expert. Your job is to merge multiple AI agent skill/prompt markdown files into a SINGLE optimized markdown document.

RULES:
1. Merge overlapping sections (e.g. multiple "Rules" sections → one consolidated "Rules" section)
2. Remove redundancy and repetition
3. Keep ALL unique, non-overlapping instructions and information
4. The merged output must fit within approximately ${tokenBudget} tokens
5. Prioritize by importance: safety rules > core workflow > guidelines > examples > extras
6. If you must cut content to fit the budget, cut examples and verbose explanations first
7. Use concise language — replace verbose descriptions with bullet points
8. Output ONLY the final merged markdown, no explanations before or after
9. Maintain markdown formatting (headers, lists, code blocks, tables)

Current total: ~${totalTokens} tokens. Target: ~${tokenBudget} tokens.
Compression ratio needed: ${totalTokens > 0 ? ((tokenBudget / totalTokens) * 100).toFixed(0) : '100'}%`

    const userPrompt = `Merge these ${skills.filter(s => s.content.trim()).length} skill documents into one optimized markdown:\n\n${skillsMarkdown}`

    try {
      let merged = ''

      if (provider === 'openai' || provider === 'custom') {
        const endpoint = provider === 'custom' ? customEndpoint : 'https://api.openai.com/v1/chat/completions'
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: modelName,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.3,
            max_tokens: Math.min(tokenBudget * 2, 16000),
          }),
        })
        const data = await res.json()
        if (data.error) throw new Error(data.error.message || JSON.stringify(data.error))
        merged = data.choices?.[0]?.message?.content || ''
      } else if (provider === 'anthropic') {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: modelName || 'claude-sonnet-4-20250514',
            max_tokens: Math.min(tokenBudget * 2, 16000),
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
          }),
        })
        const data = await res.json()
        if (data.error) throw new Error(data.error.message || JSON.stringify(data.error))
        merged = data.content?.[0]?.text || ''
      } else if (provider === 'google') {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelName || 'gemini-2.0-flash'}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemPrompt }] },
              contents: [{ parts: [{ text: userPrompt }] }],
              generationConfig: { temperature: 0.3, maxOutputTokens: Math.min(tokenBudget * 2, 16000) },
            }),
          },
        )
        const data = await res.json()
        if (data.error) throw new Error(data.error.message || JSON.stringify(data.error))
        merged = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
      }

      setResult(merged)
    } catch (err: any) {
      setError(err.message || 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [apiKey, skills, tokenBudget, provider, customEndpoint, modelName, totalTokens])

  const copyResult = () => {
    navigator.clipboard.writeText(result)
  }

  const resultTokens = estimateTokens(result)

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🔀</span>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                Markdown Fuser
              </h1>
              <p className="text-xs text-gray-500">Merge & optimize AI agent skills to save tokens</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="px-3 py-1 rounded-full bg-gray-800 text-gray-400 font-mono">
              {totalTokens.toLocaleString()} tokens input
            </span>
            {result && (
              <span className="px-3 py-1 rounded-full bg-green-900/50 text-green-400 font-mono">
                {resultTokens.toLocaleString()} tokens output
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Settings Bar */}
        <div className="mb-6 p-4 rounded-xl bg-gray-900 border border-gray-800">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-gray-500 mb-1">API Provider</label>
              <select
                value={provider}
                onChange={e => setProvider(e.target.value as ModelProvider)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="google">Google Gemini</option>
                <option value="custom">Custom Endpoint</option>
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-gray-500 mb-1">Model</label>
              <input
                value={modelName}
                onChange={e => setModelName(e.target.value)}
                placeholder={provider === 'openai' ? 'gpt-4o-mini' : provider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gemini-2.0-flash'}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-gray-500 mb-1">API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {provider === 'custom' && (
              <div className="flex-1 min-w-[250px]">
                <label className="block text-xs text-gray-500 mb-1">Endpoint URL</label>
                <input
                  value={customEndpoint}
                  onChange={e => setCustomEndpoint(e.target.value)}
                  placeholder="https://api.example.com/v1/chat/completions"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
            <div className="w-[160px]">
              <label className="block text-xs text-gray-500 mb-1">Token Budget</label>
              <input
                type="number"
                value={tokenBudget}
                onChange={e => setTokenBudget(Number(e.target.value))}
                min={200}
                max={100000}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Tab Switcher (mobile) */}
        <div className="flex mb-4 md:hidden">
          <button
            onClick={() => setActiveTab('input')}
            className={`flex-1 py-2 text-center text-sm font-medium rounded-l-lg ${activeTab === 'input' ? 'bg-gray-800 text-white' : 'bg-gray-900 text-gray-500'}`}
          >Input</button>
          <button
            onClick={() => setActiveTab('output')}
            className={`flex-1 py-2 text-center text-sm font-medium rounded-r-lg ${activeTab === 'output' ? 'bg-gray-800 text-white' : 'bg-gray-900 text-gray-500'}`}
          >Output</button>
        </div>

        {/* Main Grid */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Input Panel */}
          <div className={activeTab !== 'input' ? 'hidden md:block' : ''}>
            <div className="space-y-4">
              {skills.map((skill, idx) => (
                <div key={skill.id} className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 bg-gray-800/50">
                    <input
                      value={skill.name}
                      onChange={e => updateSkill(skill.id, 'name', e.target.value)}
                      className="bg-transparent text-sm font-medium focus:outline-none flex-1"
                      placeholder="Skill name"
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 font-mono">{estimateTokens(skill.content).toLocaleString()} tok</span>
                      <label className="cursor-pointer text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 transition">
                        📎 Upload
                        <input type="file" accept=".md,.markdown,.txt" className="hidden" onChange={handleFileUpload(skill.id)} />
                      </label>
                      {skills.length > 1 && (
                        <button onClick={() => removeSkill(skill.id)} className="text-xs px-2 py-1 rounded bg-red-900/50 hover:bg-red-800/50 text-red-400 transition">
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                  <textarea
                    value={skill.content}
                    onChange={e => updateSkill(skill.id, 'content', e.target.value)}
                    placeholder={`Paste your ${skill.name} markdown here...`}
                    className="w-full h-48 bg-transparent p-4 text-sm font-mono resize-y focus:outline-none placeholder-gray-700"
                  />
                </div>
              ))}

              <button
                onClick={addSkill}
                className="w-full py-3 rounded-xl border-2 border-dashed border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300 transition text-sm"
              >
                + Add Another Skill
              </button>

              <button
                onClick={handleFuse}
                disabled={loading}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition text-sm flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    Fusing...
                  </>
                ) : (
                  <>🔀 Fuse & Optimize</>
                )}
              </button>
            </div>
          </div>

          {/* Output Panel */}
          <div className={activeTab !== 'output' ? 'hidden md:block' : ''}>
            <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden h-full flex flex-col">
              <div className="flex items-center justify-between px-4 py-2 bg-gray-800/50">
                <span className="text-sm font-medium">Fused Output</span>
                <div className="flex items-center gap-2">
                  {result && (
                    <>
                      <span className="text-xs text-gray-500 font-mono">{resultTokens.toLocaleString()} tokens</span>
                      {totalTokens > 0 && (
                        <span className="text-xs text-green-400 font-mono">
                          −{Math.round((1 - resultTokens / totalTokens) * 100)}%
                        </span>
                      )}
                      <button onClick={copyResult} className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 transition">
                        📋 Copy
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="flex-1 p-4 overflow-auto">
                {error && (
                  <div className="p-4 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm mb-4">
                    {error}
                  </div>
                )}
                {result ? (
                  <pre className="whitespace-pre-wrap text-sm font-mono text-gray-300">{result}</pre>
                ) : !loading ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-600 text-sm">
                    <span className="text-4xl mb-3">🔀</span>
                    <p>Fused markdown will appear here</p>
                    <p className="text-xs mt-1">Add skills → set budget → click Fuse</p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 mt-12 py-6 text-center text-xs text-gray-600">
        Markdown Fuser — Merge AI agent skills, save tokens. Open source.
      </footer>
    </div>
  )
}
