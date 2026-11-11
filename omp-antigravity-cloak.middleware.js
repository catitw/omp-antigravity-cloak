export const words = [
  "RFC 2119",
  "system-conventions",
  "system_conventions",
  "system-directive",
  "system_directive",
  "x-anthropic-billing-header",
  "Claude Agent SDK",
  "Claude Code",
  "Anthropic's official CLI",
  "You are Codex, an agent based on GPT-5",
  "You are Codex, a coding agent based on GPT-5",
  "Hermes Agent, an intelligent AI assistant created by Nous Research",
]

const zwsp = "​"

export function onRequest(body, ctx) {
  const o = ctx?.options || {}
  if (o.off || !body || typeof body !== "object") return
  const extra = Array.isArray(o.extraWords) ? o.extraWords : []
  const cloak = cloaker(words.concat(extra))
  let changed = false
  const text = (s) => {
    if (typeof s !== "string") return s
    const t = cloak(s)
    if (t !== s) changed = true
    return t
  }
  switch (ctx?.protocol) {
    case "anthropic":
      body.system = typeof body.system === "string" ? text(body.system) : parts(body.system, text)
      break
    case "chat":
      if (Array.isArray(body.messages)) for (const m of body.messages) system(m, text)
      break
    case "responses":
      body.instructions = text(body.instructions)
      if (Array.isArray(body.input)) for (const m of body.input) system(m, text)
      break
    case "gemini":
      for (const k of ["systemInstruction", "system_instruction"]) if (body[k]) parts(body[k].parts, text)
      break
    default:
      if (body.system !== undefined) body.system = typeof body.system === "string" ? text(body.system) : parts(body.system, text)
      if (body.instructions !== undefined) body.instructions = text(body.instructions)
      if (Array.isArray(body.messages)) for (const m of body.messages) system(m, text)
      if (Array.isArray(body.input)) for (const m of body.input) system(m, text)
      for (const k of ["systemInstruction", "system_instruction"]) if (body[k]) parts(body[k].parts, text)
      break
  }
  return changed ? body : undefined
}

function system(m, text) {
  if (!m || (m.role !== "system" && m.role !== "developer")) return
  m.content = typeof m.content === "string" ? text(m.content) : parts(m.content, text)
}

function parts(list, text) {
  if (Array.isArray(list)) for (const p of list) if (p && typeof p.text === "string") p.text = text(p.text)
  return list
}

function cloaker(list) {
  const seen = new Set()
  const res = []
  for (const w of list) {
    if (typeof w !== "string" || w.length < 2 || w.includes(zwsp)) continue
    const k = w.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    res.push(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"))
  }
  const two = (m) => {
    const out = m.replace(/[A-Za-z0-9]{3,}/g, (w) => w[0] + zwsp + w[1] + zwsp + w.slice(2))
    return out !== m ? out : m[0] + zwsp + m.slice(1)
  }
  return (s) => {
    for (const re of res) s = s.replace(re, two)
    return s
  }
}
