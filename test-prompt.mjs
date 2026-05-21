// Test script to evaluate different fusion prompts
// Usage: node test-prompt.mjs <apikey>

import { readFileSync } from 'fs';
import { join } from 'path';

const SKILLS_DIR = '/Users/zhouhanchen/clawd-zhouhanchenbot/skills';
const files = [
  { name: 'git-workflow-and-versioning', path: join(SKILLS_DIR, 'git-workflow-and-versioning/SKILL.md') },
  { name: 'code-review-and-quality', path: join(SKILLS_DIR, 'code-review-and-quality/SKILL.md') },
  { name: 'debugging-and-error-recovery', path: join(SKILLS_DIR, 'debugging-and-error-recovery/SKILL.md') },
  { name: 'incremental-implementation', path: join(SKILLS_DIR, 'incremental-implementation/SKILL.md') },
];

const skills = files.map(f => ({ name: f.name, content: readFileSync(f.path, 'utf-8') }));

function estimateTokens(text) {
  const cjk = (text.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
  return Math.ceil(cjk / 2 + (text.length - cjk) / 4);
}

const totalInputTokens = skills.reduce((s, sk) => s + estimateTokens(sk.content), 0);
const TOKEN_BUDGET = 2000;

const skillsText = skills.map((s, i) => `<skill_${i+1} name="${s.name}">\n${s.content}\n</skill_${i+1}>`).join('\n\n');

// ===== PROMPT VARIANTS =====

const prompts = {
  v1_basic: `You are a Markdown Fusion expert. Merge multiple AI agent skill markdown files into a SINGLE optimized document.

RULES:
1. Merge overlapping sections
2. Remove redundancy
3. Keep ALL unique instructions
4. Target ~${TOKEN_BUDGET} tokens
5. Prioritize: safety > workflow > guidelines > examples
6. Cut examples first if needed
7. Use concise language
8. Output ONLY markdown, no explanations`,

  v2_structured: `You are a Markdown Fusion expert specializing in compressing AI agent skill documents while preserving all essential instructions.

TASK: Merge ${skills.length} skill documents into ONE unified document under ${TOKEN_BUDGET} tokens.

STRATEGY (execute in order):
1. ANALYZE: Read all inputs. Identify each skill's core purpose and unique instructions.
2. DEDUPLICATE: Find overlapping sections (e.g. multiple "Commit early" rules, overlapping review checklists). Merge into single consolidated sections.
3. RESTRUCTURE: Organize into a clean hierarchy:
   - Core Rules (safety-critical, non-negotiable)
   - Workflows (step-by-step processes)
   - Guidelines (best practices, conventions)
   - Quick Reference (tables, checklists compressed)
4. COMPRESS: Apply these compression techniques:
   - Replace prose explanations with bullet points
   - Merge similar rules: "Commit early" + "Commit often" → "Commit each working increment"
   - Replace verbose examples with one-line pattern: BAD → GOOD
   - Remove transitional phrases, motivation paragraphs, and "Why" sections
   - Keep code snippets only if they demonstrate non-obvious patterns
5. VERIFY: Ensure no unique rule or constraint is lost.

OUTPUT: Only the merged markdown. No preamble, no meta-commentary.`,

  v3_analytical: `You are compressing ${skills.length} AI coding agent skill files into one file within a ${TOKEN_BUDGET}-token budget (current total: ~${totalInputTokens} tokens).

The skills define how an AI agent should write and review code. Your merged output will be loaded as the agent's operating instructions.

APPROACH:

Phase 1 — Extract
From each skill, extract:
- Mandatory rules (things the agent MUST do)
- Forbidden actions (things the agent MUST NOT do)  
- Decision procedures (step-by-step processes)
- Quick-reference data (tables, checklists)

Phase 2 — Merge
- Combine rules about the same topic into single rules
- Merge decision procedures that share steps
- Unify checklists, keeping every unique item

Phase 3 — Compress
- Bullet points, not paragraphs
- Remove all "Why" explanations — keep only "What" and "How"
- Replace multiple examples with one canonical example
- Use tables instead of repeated sections
- Abbreviate section headers

Phase 4 — Prioritize (if over budget)
Cut in this order: examples → rationale → edge case details → formatting rules
NEVER cut: safety rules, mandatory steps, error handling requirements

Output the final merged markdown only.`,

  v4_expert: `Merge these ${skills.length} AI agent skill documents into one compressed file. Target: ≤${TOKEN_BUDGET} tokens (from ~${totalInputTokens}).

You are writing instructions that will be loaded into an AI coding agent's context window. Every token counts — but losing a critical rule costs more than the tokens saved.

COMPRESSION TECHNIQUES (apply aggressively):
• Drop ALL motivation/rationale paragraphs ("Why git is important", "Why reviews matter")
• Convert prose to bullets: "You should always make sure to" → "Always"
• Merge similar items: 5 "commit early" variants → 1 definitive rule
• Consolidate tables: separate "Rationalization" tables → one combined table
• Replace code examples with inline patterns: \`git commit -m "type: desc"\` not 10-line blocks
• Remove section headers that only contain 1-2 items (fold into parent)
• Use references not repetition: "See commit rules above" not restating

PRESERVATION RULES (never cut these):
• Safety/security constraints
• Step-by-step procedures (numbered workflows)
• Error handling rules
• "Never do X" / "Always do Y" directives
• Red flag lists

STRUCTURE:
# Fused Agent Instructions
## Core Rules
## Workflows  
## Quick Reference (tables/checklists)
## Red Flags

Output markdown only. No commentary.`,
};

async function testPrompt(apiKey, promptName, systemPrompt) {
  const startTime = Date.now();
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Merge these ${skills.length} skill documents:\n\n${skillsText}` },
        ],
        temperature: 0.3,
        max_tokens: 8000,
      }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    
    const output = data.choices?.[0]?.message?.content || '';
    const outputTokens = estimateTokens(output);
    const elapsed = Date.now() - startTime;
    const usage = data.usage;
    
    return {
      prompt: promptName,
      outputTokens,
      apiInputTokens: usage?.prompt_tokens,
      apiOutputTokens: usage?.completion_tokens,
      elapsed,
      output,
      compressionRatio: ((1 - outputTokens / totalInputTokens) * 100).toFixed(1),
    };
  } catch (err) {
    return { prompt: promptName, error: err.message };
  }
}

async function main() {
  const apiKey = process.argv[2];
  if (!apiKey) { console.error('Usage: node test-prompt.mjs <apikey>'); process.exit(1); }
  
  console.log(`Input: ${totalInputTokens} estimated tokens across ${skills.length} files`);
  console.log(`Budget: ${TOKEN_BUDGET} tokens\n`);
  console.log('='.repeat(60));
  
  const results = [];
  for (const [name, prompt] of Object.entries(prompts)) {
    console.log(`\n🧪 Testing ${name}...`);
    const result = await testPrompt(apiKey, name, prompt);
    results.push(result);
    
    if (result.error) {
      console.log(`  ❌ Error: ${result.error}`);
    } else {
      console.log(`  ✅ Output: ${result.outputTokens} tokens (${result.compressionRatio}% compression)`);
      console.log(`  📊 API: ${result.apiInputTokens} in → ${result.apiOutputTokens} out`);
      console.log(`  ⏱️  ${result.elapsed}ms`);
      console.log(`  📝 Preview: ${result.output.slice(0, 200)}...`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY:');
  console.log('-'.repeat(60));
  for (const r of results) {
    if (r.error) {
      console.log(`${r.prompt}: ERROR - ${r.error}`);
    } else {
      console.log(`${r.prompt}: ${r.outputTokens} tok | ${r.compressionRatio}% reduction | ${r.elapsed}ms`);
    }
  }
  
  // Save full outputs for manual review
  for (const r of results) {
    if (r.output) {
      const fs = await import('fs');
      fs.default.writeFileSync(`/tmp/fuse-${r.prompt}.md`, r.output);
      console.log(`  Saved: /tmp/fuse-${r.prompt}.md`);
    }
  }
}

main();
