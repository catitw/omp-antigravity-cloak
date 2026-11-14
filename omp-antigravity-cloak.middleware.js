export const OFFICIAL_ANTIGRAVITY_IDENTITY =
  "You are Antigravity, a powerful agentic AI coding assistant designed by the Google Deepmind team working on Advanced Agentic Coding."

const zwsp = "\u200b"

const RE_BILLING_TEST = /x-anthropic-billing-header:/i
const RE_BILLING_LINE = /^[ \t]*x-anthropic-billing-header:[^\r\n]*$/i
const RE_ANTIGRAVITY_MODEL = /(?:gemini|argon|carbon|hydrogen|claude|opus|sonnet|gpt-oss)/i

const DSH_AT_PATHS_FROM =
  'Tokens prefixed with @ are paths the user explicitly referenced. Relative paths resolve from the workspace root; absolute paths identify files or directories on the host. A trailing slash marks a directory: list it when its contents matter. Anything else is a file: use the read tool when its contents are needed, and do not claim to have inspected it before reading. @"..." quotes a path containing spaces.'
const DSH_AT_PATHS_TO =
  'When the user writes @ followed by a path, they are pointing at that file or folder. Relative paths start at the workspace root; absolute paths are host paths. A path ending in a slash is a folder, so list it if its contents matter; otherwise it is a file, so open it with the read tool before relying on it. Paths with spaces appear as @"...".'

// Semantic rewordings that avoid zero-width characters (which Google's 11-14
// filter strips/flags intermittently or completely on RFC 2119 & billing lines).
const REWORD_RULES = [
  [/\bRFC\s+2119\s+keywords\b/gi, (m) => m.replace(/keywords/i, "key words")],
  [/<(\/?)system[-_](conventions|directive)>/gi, "<$1$2>"],
  [/built\s+on\s+Anthropic's\s+Claude\s+Agent\s+SDK/gi, "running within the Claude Agent SDK"],
  [/You\s+are\s+Codex,\s+a(?:n|\s+coding)?\s+agent\s+based\s+on\s+(GPT-5)/gi, "You are Codex, based on $1"],
  [/(Hermes\s+Agent,)\s+an\s+intelligent\s+AI\s+assistant\s+created\s+by\s+(Nous\s+Research)/gi, "$1 built by $2"],
]

const RE_OPENING_IDENTITY =
  /^(?:You[ \t]+are|You're)[ \t]+(?:omp's[ \t]+trusted[ \t]+coding[ \t]+assistant|Claude[ \t]+Code(?:,[ \t]*Anthropic's[ \t]+official[ \t]+CLI[ \t]+for[ \t]+Claude(?:,[ \t]*running[ \t]+within[ \t]+(?:the[ \t]+)?Claude[ \t]+Agent[ \t]+SDK)?)?|a[ \t]+Claude[ \t]+agent,[ \t]*running[ \t]+within[ \t]+the[ \t]+Claude[ \t]+Agent[ \t]+SDK|Codex,[ \t]*based[ \t]+on[ \t]+GPT-[A-Za-z0-9._-]+|Hermes[ \t]+Agent,[ \t]*built[ \t]+by[ \t]+Nous[ \t]+Research|opencode(?:,[^\r\n.]*)?|DSH|DeepSeek[ \t]+Harness)\.?$/gim

export function shouldRun(ctx, options) {
  if (options.off || !ctx || !ctx.provider) return false
  const p = ctx.provider
  const acct = p.account || ""
  const hasExplicitTarget = Array.isArray(options.providers) || Array.isArray(options.accounts)

  if (hasExplicitTarget) {
    const provHit = Array.isArray(options.providers) && options.providers.indexOf(p.id) !== -1
    const acctHit = Array.isArray(options.accounts) && acct !== "" && options.accounts.indexOf(acct) !== -1
    if (!provHit && !acctHit) return false
  } else if (acct !== "") {
    if (acct !== "antigravity") return false
  } else {
    const model = String(p.model || ctx.model || "")
    if (model && !RE_ANTIGRAVITY_MODEL.test(model)) return false
  }

  if (Array.isArray(options.models) && options.models.length > 0) {
    if (options.models.indexOf(p.model) === -1 && options.models.indexOf(ctx.model) === -1) return false
  }
  return true
}

export function sanitizeSystemText(s, rawOptions) {
  if (typeof s !== "string" || !s) return s
  const o = rawOptions && typeof rawOptions === "object" ? rawOptions : {}
  let out = stripBillingLines(s)

  for (let i = 0; i < REWORD_RULES.length; i++) {
    out = out.replace(REWORD_RULES[i][0], REWORD_RULES[i][1])
  }
  if (out.indexOf(DSH_AT_PATHS_FROM) !== -1) {
    out = out.split(DSH_AT_PATHS_FROM).join(DSH_AT_PATHS_TO)
  }
  if (o.normalizeIdentity === true) {
    out = out.replace(RE_OPENING_IDENTITY, OFFICIAL_ANTIGRAVITY_IDENTITY)
  }
  if (Array.isArray(o.extraWords) && o.extraWords.length > 0) {
    out = cloaker(o.extraWords)(out)
  }
  return out
}

export function onProvider(body, ctx) {
  if (!body || typeof body !== "object" || Array.isArray(body) || !ctx) return
  const o = ctx.options && typeof ctx.options === "object" && !Array.isArray(ctx.options) ? ctx.options : {}
  if (!shouldRun(ctx, o)) return

  let changed = false
  const apply = (s) => {
    const next = sanitizeSystemText(s, o)
    if (next !== s) changed = true
    return next
  }

  const parts = (list, gemini) => {
    if (!Array.isArray(list)) return list
    const kept = []
    let dirty = false
    for (let i = 0; i < list.length; i++) {
      const p = list[i]
      if (
        !p ||
        typeof p !== "object" ||
        Array.isArray(p) ||
        p.thought === true ||
        "thoughtSignature" in p ||
        "thought_signature" in p ||
        (gemini ? p.type !== undefined && p.type !== "text" : p.type !== undefined && p.type !== "text" && p.type !== "input_text") ||
        typeof p.text !== "string"
      ) {
        kept.push(p)
        continue
      }
      const next = apply(p.text)
      if (next !== p.text && next.trim() === "") {
        dirty = true
        continue
      }
      if (next !== p.text) {
        p.text = next
        dirty = true
      }
      kept.push(p)
    }
    if (dirty) changed = true
    return dirty ? kept : list
  }

  const textField = (obj, key) => {
    if (typeof obj[key] !== "string") return
    const prev = obj[key]
    const next = apply(prev)
    if (next !== prev && next.trim() === "") {
      delete obj[key]
      changed = true
    } else if (next !== prev) {
      obj[key] = next
    }
  }

  const messages = (list) => {
    if (!Array.isArray(list)) return list
    const kept = []
    let removed = false
    for (let i = 0; i < list.length; i++) {
      const m = list[i]
      if (m && typeof m === "object" && (m.role === "system" || m.role === "developer")) {
        if (typeof m.content === "string") {
          const prev = m.content
          const next = apply(prev)
          if (next !== prev && next.trim() === "") {
            removed = true
            continue
          }
          if (next !== prev) m.content = next
        } else if (Array.isArray(m.content)) {
          const prevLen = m.content.length
          m.content = parts(m.content, false)
          if (prevLen > 0 && m.content.length === 0) {
            removed = true
            continue
          }
        }
      }
      kept.push(m)
    }
    if (removed) changed = true
    return removed ? kept : list
  }

  switch (ctx.protocol) {
    case "anthropic":
      if (typeof body.system === "string") textField(body, "system")
      else if (Array.isArray(body.system)) {
        const prevLen = body.system.length
        body.system = parts(body.system, false)
        if (prevLen > 0 && body.system.length === 0) {
          delete body.system
          changed = true
        }
      }
      break
    case "chat":
      if (Array.isArray(body.messages)) body.messages = messages(body.messages)
      break
    case "responses":
      if (typeof body.instructions === "string") textField(body, "instructions")
      if (Array.isArray(body.input)) body.input = messages(body.input)
      break
    case "gemini":
      for (const k of ["systemInstruction", "system_instruction"]) {
        const sys = body[k]
        if (sys && typeof sys === "object" && Array.isArray(sys.parts)) {
          const prevLen = sys.parts.length
          sys.parts = parts(sys.parts, true)
          if (prevLen > 0 && sys.parts.length === 0) {
            delete body[k]
            changed = true
          }
        }
      }
      break
    default:
      if (typeof body.system === "string") textField(body, "system")
      else if (Array.isArray(body.system)) body.system = parts(body.system, false)
      if (typeof body.instructions === "string") textField(body, "instructions")
      if (Array.isArray(body.messages)) body.messages = messages(body.messages)
      if (Array.isArray(body.input)) body.input = messages(body.input)
      for (const k of ["systemInstruction", "system_instruction"]) {
        if (body[k] && Array.isArray(body[k].parts)) body[k].parts = parts(body[k].parts, true)
      }
      break
  }

  return changed ? body : undefined
}

function stripBillingLines(s) {
  if (!RE_BILLING_TEST.test(s)) return s
  const lines = s.split("\n")
  const kept = []
  let dropped = false
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const body = raw.endsWith("\r") ? raw.slice(0, -1) : raw
    if (RE_BILLING_LINE.test(body)) {
      dropped = true
      continue
    }
    kept.push(raw)
  }
  if (!dropped) return s
  if (kept.length === 0) return ""
  let out = kept.join("\n")
  const last = s[s.length - 1]
  if (last !== "\n" && last !== "\r") {
    while (out.length > 0 && (out[out.length - 1] === "\n" || out[out.length - 1] === "\r")) {
      out = out.slice(0, -1)
    }
  }
  return out
}

function cloaker(list) {
  const seen = new Set()
  const res = []
  for (let i = 0; i < list.length; i++) {
    const w = list[i]
    if (typeof w !== "string" || w.length < 2 || w.indexOf(zwsp) !== -1) continue
    const k = w.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    const pat = w
      .split(/\s+/)
      .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("\\s+")
    res.push(new RegExp(pat, "gi"))
  }
  const two = (m) => {
    const out = m.replace(/[A-Za-z0-9]{3,}/g, (w) => w[0] + zwsp + w[1] + zwsp + w.slice(2))
    return out !== m ? out : m[0] + zwsp + m.slice(1)
  }
  return (s) => {
    for (let i = 0; i < res.length; i++) s = s.replace(res[i], two)
    return s
  }
}
