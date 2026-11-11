import assert from "node:assert/strict"
import { onRequest } from "./omp-antigravity-cloak.middleware.js"

const zwsp = "​"

// 1. OMP chat request (role: system & role: developer)
for (const role of ["system", "developer"]) {
  const body = {
    model: "group/argon",
    messages: [
      { role, content: "RFC 2119 keywords: MUST, REQUIRED, SHOULD, RECOMMENDED, MAY, OPTIONAL." },
      { role: "user", content: "RFC 2119 in user message stays untouched" },
    ],
  }
  const out = onRequest(body, { protocol: "chat", options: {} })
  assert.ok(out, `should modify ${role} message`)
  assert.equal(out.messages[0].content, `R${zwsp}F${zwsp}C 2${zwsp}1${zwsp}19 keywords: MUST, REQUIRED, SHOULD, RECOMMENDED, MAY, OPTIONAL.`)
  assert.equal(out.messages[1].content, "RFC 2119 in user message stays untouched")
  // Idempotent on second pass (returns undefined when unchanged)
  assert.equal(onRequest(out, { protocol: "chat", options: {} }), undefined)
}

// 2. Anthropic system blocks
{
  const body = {
    system: [{ type: "text", text: "x-anthropic-billing-header: cc_version=2.1" }],
    messages: [{ role: "user", content: "hi" }],
  }
  const out = onRequest(body, { protocol: "anthropic", options: {} })
  assert.equal(out.system[0].text, `x-a${zwsp}n${zwsp}thropic-b${zwsp}i${zwsp}lling-h${zwsp}e${zwsp}ader: cc_version=2.1`)
}

// 3. off: true returns undefined
{
  const body = { messages: [{ role: "system", content: "RFC 2119" }] }
  assert.equal(onRequest(body, { protocol: "chat", options: { off: true } }), undefined)
  assert.equal(body.messages[0].content, "RFC 2119")
}

console.log("All tests passed")
