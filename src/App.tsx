import { useState, useCallback } from 'react'

interface SkillInput {
  id: string
  name: string
  content: string
}

type ModelProvider = 'openai' | 'anthropic' | 'google' | 'custom'
type FuseMode = 'fusion' | 'analysis'

function generateId() {
  return Math.random().toString(36).slice(2, 8)
}

function estimateTokens(text: string): number {
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
  const [showSettings, setShowSettings] = useState(false)
  const [fuseMode, setFuseMode] = useState<FuseMode>('fusion')

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
      const name = file.name.replace(/\.(md|markdown|txt)$/i, '')
      updateSkill(id, 'name', name)
    }
    reader.readAsText(file)
  }

  // ── SkillReducer-inspired two-stage prompt ──

  const buildPrompts = () => {
    const skillCount = skills.filter(s => s.content.trim()).length
    const skillsMarkdown = skills
      .filter(s => s.content.trim())
      .map((s, i) => `<skill_${i + 1} name="${s.name}">\n${s.content}\n</skill_${i + 1}>`)
      .join('\n\n')

    if (fuseMode === 'analysis') {
      // Stage 1: Taxonomy classification (inspired by SkillReducer §III-B)
      return {
        system: `You are a skill content analyst. Classify every paragraph-level item in the given skill documents into exactly one of 5 categories:

1. **Core Rule** — Actionable instructions the agent MUST follow (commands, constraints, procedures)
2. **Background** — Explanations, rationale, "why this matters", motivational text
3. **Example** — Code snippets, input/output pairs, usage demonstrations
4. **Template** — Boilerplate patterns, formatters, reusable structures
5. **Redundant** — Content repeated across multiple input skills

For each skill, output a classification table in this exact format:

| # | Category | Original (truncated) | Keep? |
|---|----------|---------------------|-------|

Then provide statistics:
- Total items: N
- Core Rules: N (X%) — ALWAYS KEEP
- Background: N (X%) — CUT FIRST
- Examples: N (X%) — CUT SECOND
- Templates: N (X%) — MERGE & COMPRESS
- Redundant: N (X%) — DELETE
- Estimated keepable tokens: N
- Recommended token budget for full retention: N

Output the analysis report only.`,
        user: `Classify all content in these ${skillCount} skills:\n\n${skillsMarkdown}`,
      }
    }

    // Stage 2: SkillReducer-inspired fusion with progressive disclosure
    return {
      system: `You are a SkillReducer-class fusion engine. Merge ${skillCount} AI agent skill documents into one compressed file.
Budget: ≤${tokenBudget} tokens (from ~${totalTokens}).

BACKGROUND: Research shows only 38.5% of skill content is actionable core rules. Over 60% is background, examples, or redundancy. Removing non-essential content IMPROVES agent performance by 2.8% (less-is-more effect). Apply this finding aggressively.

## STEP 1 — CLASSIFY & SEGMENT
For each input skill, mentally classify every section as:
- CORE (actionable rules, safety constraints, mandatory steps) → ALWAYS include
- BACKGROUND (rationale, "why this matters", motivation) → DELETE
- EXAMPLE (code snippets, demonstrations) → Replace with 1-line inline pattern
- TEMPLATE (boilerplate, formatters) → MERGE into one canonical template
- REDUNDANT (repeated across inputs) → Keep only the best version

## STEP 2 — DEDUPLICATE
- Merge overlapping rules into single consolidated rules
- Combine similar step-by-step procedures
- Unify checklists, keeping every unique item
- Cross-reference instead of repeating

## STEP 3 — PROGRESSIVE DISCLOSURE OUTPUT
Structure the output in two tiers:

### Tier 1 — Core (always loaded, must fit budget)
The compressed essentials:

# [Fused Skill Name]

> One-line description of what this fused skill does

## Mandatory Rules
[Safety constraints, "never do X", "always do Y" — non-negotiable]

## Workflows
[Numbered step-by-step procedures, merged and deduplicated]

## Quick Reference
[Tables, checklists, decision trees — compressed]

## Red Flags
[Anti-patterns, common mistakes, warning signs]

### Tier 2 — On-Demand (append as collapsible references)
\`\`\`markdown
<!-- REFERENCE: Examples and extended patterns (load when needed) -->
- Pattern 1: [inline code pattern, not full example]
- Pattern 2: [inline code pattern]
\`\`\`

## COMPRESSION RULES
• Drop ALL motivation/rationale paragraphs
• Convert prose to bullets: "You should always make sure to" → "Always"
• Merge variants: N "commit early" rules → 1 definitive rule
• Replace code blocks with inline patterns: \`pattern\` not 10-line blocks
• Remove headers with ≤2 items (fold into parent)
• Tables > repeated sections
• Keep "never"/"always"/"must" directives verbatim

Output markdown only. No commentary.`,
      user: `Fuse these ${skillCount} skills into one within ${tokenBudget} tokens:\n\n${skillsMarkdown}`,
    }
  }

  const handleFuse = useCallback(async () => {
    if (!apiKey) { setError('Please enter your API key'); return }
    if (skills.every(s => !s.content.trim())) { setError('Please add some markdown content'); return }

    setLoading(true)
    setError('')
    setResult('')
    setActiveTab('output')

    const { system: systemPrompt, user: userPrompt } = buildPrompts()

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
            temperature: 0.2,
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
              generationConfig: { temperature: 0.2, maxOutputTokens: Math.min(tokenBudget * 2, 16000) },
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
  }, [apiKey, skills, tokenBudget, provider, customEndpoint, modelName, totalTokens, fuseMode])

  const copyResult = () => {
    navigator.clipboard.writeText(result)
  }

  const downloadResult = () => {
    const blob = new Blob([result], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'fused-skill.md'
    a.click()
    URL.revokeObjectURL(url)
  }

  const resultTokens = estimateTokens(result)
  const compressionPct = totalTokens > 0 && resultTokens > 0
    ? Math.round((1 - resultTokens / totalTokens) * 100)
    : 0

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
              <p className="text-xs text-gray-500">SkillReducer-inspired skill merging · save tokens · less is more</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="px-3 py-1 rounded-full bg-gray-800 text-gray-400 font-mono">
              {totalTokens.toLocaleString()} tok in
            </span>
            {result && (
              <span className="px-3 py-1 rounded-full bg-green-900/50 text-green-400 font-mono">
                {resultTokens.toLocaleString()} tok out
              </span>
            )}
            {compressionPct > 0 && (
              <span className="px-3 py-1 rounded-full bg-purple-900/50 text-purple-400 font-mono">
                −{compressionPct}%
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Controls Row */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          {/* Mode Selector */}
          <div className="flex rounded-lg overflow-hidden border border-gray-700">
            <button
              onClick={() => setFuseMode('fusion')}
              className={`px-4 py-2 text-sm transition ${fuseMode === 'fusion' ? 'bg-blue-600 text-white' : 'bg-gray-900 text-gray-400 hover:bg-gray-800'}`}
            >
              🔀 Fuse & Compress
            </button>
            <button
              onClick={() => setFuseMode('analysis')}
              className={`px-4 py-2 text-sm transition ${fuseMode === 'analysis' ? 'bg-amber-600 text-white' : 'bg-gray-900 text-gray-400 hover:bg-gray-800'}`}
            >
              🔬 Analyze Only
            </button>
          </div>

          <button
            onClick={() => setShowSettings(!showSettings)}
            className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition text-sm text-gray-400 flex items-center gap-2"
          >
            ⚙️ API {showSettings ? '▲' : '▼'}
          </button>

          {/* Research Insight Pill */}
          <div className="ml-auto px-3 py-1.5 rounded-full bg-gray-900 border border-gray-800 text-xs text-gray-500 hidden md:flex items-center gap-2">
            <span className="text-amber-400">💡</span>
            Research shows 60%+ of skill content is non-actionable. Removing it improves agent performance by 2.8%.
          </div>
        </div>

        {/* Settings Panel */}
        {showSettings && (
        <div className="mb-6 p-4 rounded-xl bg-gray-900 border border-gray-800">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs text-gray-500 mb-1">Provider</label>
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
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs text-gray-500 mb-1">Model</label>
              <input
                value={modelName}
                onChange={e => setModelName(e.target.value)}
                placeholder={provider === 'openai' ? 'gpt-4o-mini' : provider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gemini-2.0-flash'}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex-1 min-w-[180px]">
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
              <div className="flex-1 min-w-[220px]">
                <label className="block text-xs text-gray-500 mb-1">Endpoint URL</label>
                <input
                  value={customEndpoint}
                  onChange={e => setCustomEndpoint(e.target.value)}
                  placeholder="https://api.example.com/v1/chat/completions"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
            {fuseMode === 'fusion' && (
              <div className="w-[140px]">
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
            )}
          </div>
        </div>
        )}

        {/* Mode Description */}
        {fuseMode === 'analysis' && (
          <div className="mb-4 p-3 rounded-lg bg-amber-900/20 border border-amber-800/50 text-amber-300 text-sm">
            🔬 <strong>Analysis Mode</strong> — Classifies every paragraph into Core Rule / Background / Example / Template / Redundant, shows statistics and recommended budget. Based on SkillReducer's taxonomy (38.5% core, 40.7% background, 12.9% examples).
          </div>
        )}
        {fuseMode === 'fusion' && (
          <div className="mb-4 p-3 rounded-lg bg-blue-900/20 border border-blue-800/50 text-blue-300 text-sm">
            🔀 <strong>Fusion Mode</strong> — Two-stage pipeline: (1) Classify & segment content, (2) Deduplicate & compress with progressive disclosure. Outputs Tier 1 core + Tier 2 on-demand references.
          </div>
        )}

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
              {skills.map((skill) => (
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

              {/* Token Budget Visual (fusion mode only) */}
              {fuseMode === 'fusion' && totalTokens > 0 && (
                <div className="p-3 rounded-lg bg-gray-900 border border-gray-800">
                  <div className="flex justify-between text-xs text-gray-400 mb-2">
                    <span>Input: {totalTokens.toLocaleString()} tokens</span>
                    <span>Budget: {tokenBudget.toLocaleString()} tokens</span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        tokenBudget >= totalTokens ? 'bg-green-500' : tokenBudget >= totalTokens * 0.5 ? 'bg-amber-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(100, (tokenBudget / totalTokens) * 100)}%` }}
                    />
                  </div>
                  <div className="text-xs text-gray-600 mt-1 text-right">
                    Target compression: {Math.round((tokenBudget / totalTokens) * 100)}%
                  </div>
                </div>
              )}

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
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    {fuseMode === 'analysis' ? 'Analyzing...' : 'Fusing...'}
                  </>
                ) : (
                  fuseMode === 'analysis' ? '🔬 Analyze Content' : '🔀 Fuse & Optimize'
                )}
              </button>
            </div>
          </div>

          {/* Output Panel */}
          <div className={activeTab !== 'output' ? 'hidden md:block' : ''}>
            <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden h-full flex flex-col min-h-[400px]">
              <div className="flex items-center justify-between px-4 py-2 bg-gray-800/50">
                <span className="text-sm font-medium">
                  {fuseMode === 'analysis' ? '📊 Analysis Report' : '🔀 Fused Output'}
                </span>
                <div className="flex items-center gap-2">
                  {result && (
                    <>
                      <span className="text-xs text-gray-500 font-mono">{resultTokens.toLocaleString()} tok</span>
                      {fuseMode === 'fusion' && compressionPct > 0 && (
                        <span className="text-xs text-green-400 font-mono">−{compressionPct}%</span>
                      )}
                      <button onClick={copyResult} className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 transition" title="Copy to clipboard">
                        📋
                      </button>
                      <button onClick={downloadResult} className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 transition" title="Download as .md">
                        💾
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="flex-1 p-4 overflow-auto">
                {error && (
                  <div className="p-4 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm mb-4">
                    ⚠️ {error}
                  </div>
                )}
                {result ? (
                  <pre className="whitespace-pre-wrap text-sm font-mono text-gray-300 leading-relaxed">{result}</pre>
                ) : !loading ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-600 text-sm gap-2">
                    <span className="text-5xl">{fuseMode === 'analysis' ? '🔬' : '🔀'}</span>
                    <p className="font-medium">{fuseMode === 'analysis' ? 'Content analysis will appear here' : 'Fused markdown will appear here'}</p>
                    <div className="text-xs text-gray-700 max-w-xs text-center mt-1">
                      {fuseMode === 'analysis'
                        ? 'Classifies content into Core Rule / Background / Example / Template / Redundant'
                        : 'Two-stage pipeline: Classify → Deduplicate → Progressive Disclosure output'}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {/* Research Citation */}
        <div className="mt-8 p-4 rounded-xl bg-gray-900/50 border border-gray-800/50">
          <h3 className="text-sm font-medium text-gray-400 mb-2">📚 Based on Research</h3>
          <div className="grid md:grid-cols-3 gap-4 text-xs text-gray-500">
            <div>
              <span className="text-amber-400 font-medium">38.5% Core</span> — Only 38.5% of skill content is actionable core rules. The rest is background (40.7%), examples (12.9%), templates, and redundancy.
            </div>
            <div>
              <span className="text-green-400 font-medium">Less is More</span> — Removing non-essential content improves agent performance by 2.8%. Reducing context distraction outweighs information loss.
            </div>
            <div>
              <span className="text-blue-400 font-medium">Progressive Disclosure</span> — Core rules always loaded. Examples and background become on-demand references, loaded only when needed.
            </div>
          </div>
          <p className="text-xs text-gray-600 mt-3">
            Inspired by <em>SkillReducer: Optimizing LLM Agent Skills for Token Efficiency</em> (arXiv 2603.29919, 2026)
          </p>
        </div>
      </main>

      <footer className="border-t border-gray-800 mt-8 py-6 text-center text-xs text-gray-600">
        Markdown Fuser — SkillReducer-inspired skill merging · <a href="https://github.com/Thomaszhou22/markdown-fuser" className="text-gray-500 hover:text-gray-400 underline">GitHub</a>
      </footer>
    </div>
  )
}
