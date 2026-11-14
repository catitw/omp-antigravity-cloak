import assert from "node:assert/strict"
import { OFFICIAL_ANTIGRAVITY_IDENTITY, onProvider } from "./omp-antigravity-cloak.middleware.js"

const zwsp = "\u200b"
const magpie2Carbon = { id: "magpie-2", name: "日本-magpie", model: "group/carbon" }
const directAg = { id: "antigravity", name: "Antigravity", account: "antigravity", model: "gemini-4-argon" }

// 1. OMP chat request: semantic rewording ("key words", no ZWSP) + <system-conventions>
for (const role of ["system", "developer"]) {
  const body = {
    model: "group/carbon",
    messages: [
      {
        role,
        content:
          "RFC 2119 keywords: MUST, REQUIRED, SHOULD, RECOMMENDED, MAY, OPTIONAL. `NEVER` = `MUST NOT`.\n<system-conventions>\nRule\n</system-conventions>",
      },
      { role: "user", content: "RFC 2119 keywords: MUST stay untouched in user message" },
    ],
  }
  const out = onProvider(body, { protocol: "chat", provider: magpie2Carbon, options: {} })
  assert.ok(out, `should modify ${role} message`)
  assert.equal(
    out.messages[0].content,
    "RFC 2119 key words: MUST, REQUIRED, SHOULD, RECOMMENDED, MAY, OPTIONAL. `NEVER` = `MUST NOT`.\n<conventions>\nRule\n</conventions>",
  )
  assert.ok(!out.messages[0].content.includes(zwsp), "should not rely on zero-width spaces")
  assert.equal(out.messages[1].content, "RFC 2119 keywords: MUST stay untouched in user message")
  // Idempotent on second pass
  assert.equal(onProvider(out, { protocol: "chat", provider: magpie2Carbon, options: {} }), undefined)
}

// 2. OMP RFC 2119 line wrapped with CRLF, tabs, NBSP
for (const sample of [
  "RFC 2119\r\nkeywords:\tMUST, REQUIRED, SHOULD, RECOMMENDED, MAY, OPTIONAL.",
  "RFC\u00a02119  keywords: MUST, REQUIRED, SHOULD, RECOMMENDED, MAY, OPTIONAL.",
]) {
  const body = { systemInstruction: { parts: [{ text: sample }] }, contents: [] }
  const out = onProvider(body, { protocol: "gemini", provider: directAg, options: {} })
  assert.ok(out)
  assert.equal(out.systemInstruction.parts[0].text, sample.replace("keywords", "key words"))
  assert.equal(onProvider(out, { protocol: "gemini", provider: directAg, options: {} }), undefined)
}

// 3. Anthropic Claude Code 2.1.x: billing block pruned + SDK line reworded without ZWSP
{
  const body = {
    system: [
      { type: "text", text: "x-anthropic-billing-header: cc_version=2.1.322; cc_entrypoint=cli;" },
      { type: "text", text: "You are a Claude agent, built on Anthropic's Claude Agent SDK.", cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: "hi" }],
  }
  const out = onProvider(body, { protocol: "anthropic", provider: magpie2Carbon, options: {} })
  assert.ok(out)
  assert.equal(out.system.length, 1, "empty billing block should be dropped")
  assert.equal(out.system[0].text, "You are a Claude agent, running within the Claude Agent SDK.")
  assert.deepEqual(out.system[0].cache_control, { type: "ephemeral" })
  assert.equal(onProvider(out, { protocol: "anthropic", provider: magpie2Carbon, options: {} }), undefined)
}

// 4. Codex & Hermes semantic rewordings
{
  const body = {
    instructions:
      "You are Codex, a coding agent based on GPT-5. Work carefully.\nYou are Hermes Agent, an intelligent AI assistant created by Nous Research.",
    input: [],
  }
  const out = onProvider(body, { protocol: "responses", provider: directAg, options: {} })
  assert.equal(
    out.instructions,
    "You are Codex, based on GPT-5. Work carefully.\nYou are Hermes Agent, built by Nous Research.",
  )
  assert.equal(onProvider(out, { protocol: "responses", provider: directAg, options: {} }), undefined)
}

// 5. Provider & model targeting: skips non-Antigravity subscriptions and non-Antigravity relay models
{
  const make = () => ({ messages: [{ role: "system", content: "RFC 2119 keywords: MUST." }] })
  // Direct Claude subscription skipped
  assert.equal(
    onProvider(make(), {
      protocol: "chat",
      provider: { id: "claude", name: "Claude", account: "claude", model: "claude-opus-4-6" },
      options: {},
    }),
    undefined,
  )
  // Relay DeepSeek / GLM skipped
  assert.equal(
    onProvider(make(), {
      protocol: "chat",
      provider: { id: "remote-magpie", name: "HK", model: "auto/deepseek-v4.1-flash" },
      options: {},
    }),
    undefined,
  )
  // off: true skipped
  assert.equal(onProvider(make(), { protocol: "chat", provider: magpie2Carbon, options: { off: true } }), undefined)
}

// 6. Optional normalizeIdentity & extraWords
{
  const body = {
    messages: [{ role: "system", content: "You are omp's trusted coding assistant.\nSecretTokenWord" }],
  }
  const out = onProvider(body, {
    protocol: "chat",
    provider: magpie2Carbon,
    options: { normalizeIdentity: true, extraWords: ["SecretTokenWord"] },
  })
  assert.equal(
    out.messages[0].content,
    `${OFFICIAL_ANTIGRAVITY_IDENTITY}\nS${zwsp}e${zwsp}cretTokenWord`,
  )
  assert.equal(
    onProvider(out, {
      protocol: "chat",
      provider: magpie2Carbon,
      options: { normalizeIdentity: true, extraWords: ["SecretTokenWord"] },
    }),
    undefined,
  )
}

console.log("All tests passed")
