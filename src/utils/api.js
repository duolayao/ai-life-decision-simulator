// API 调用封装：与 DeepSeek（兼容 OpenAI 格式）的接口对接
//
// 可靠性设计：
// 1. 超时控制：AbortController，默认 60s
// 2. 重试机制：网络错误 / 5xx 自动重试 1 次（指数退避）
// 3. 低温度：决策分析需稳定性，temperature=0.3
// 4. schema 校验：score 范围、维度齐全、description 含 1/3/5 年关键词；不合规触发"修复重试"
// 5. 修复重试：把校验问题反馈给 AI 让其修正，最多 1 次（控成本）
// 6. 调试 DOM 仅 DEV 模式启用，且不写 API Key 任何信息
//
// 部署形态：
// - DEV 模式：本地开发用 VITE_DEEPSEEK_API_KEY 直连 DeepSeek（前端持有 Key，仅本地）
// - PROD 模式：走相对路径 /api/deepseek/v1/chat/completions，由 Nginx 反代注入 Key
//   这样 dist 产物不含 API Key，部署到公网也不会泄露

import { buildMessages } from './promptBuilder'

const IS_DEV = Boolean(import.meta.env && import.meta.env.DEV)

// DEV 模式才读取前端环境变量里的 Key（生产模式不再使用，由 Nginx 注入）
const API_KEY = IS_DEV ? import.meta.env.VITE_DEEPSEEK_API_KEY : ''
// DEV 直连官方 API；PROD 走相对路径让 Nginx 反代
const BASE_URL = IS_DEV
  ? (import.meta.env.VITE_DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1')
  : '/api/deepseek/v1'
const MODEL = import.meta.env.VITE_DEEPSEEK_MODEL || 'deepseek-chat'

// 调用参数
const REQUEST_TIMEOUT_MS = 60_000
const MAX_RETRY = 1            // 网络/HTTP 错误重试次数
const MAX_REPAIR_RETRY = 1     // schema 校验失败后的修复重试次数
const TEMPERATURE = 0.3        // 低温度提升稳定性
// 注意：reasoning 模型（如 deepseek-v4-flash / deepseek-reasoner）会先把 token 花在
// reasoning_content 上，最后才输出 content。如果 max_tokens 太小，会被 reasoning 用光
// 导致 content 为空（finish_reason: "length"）。12000 实测可容纳完整思考 + 输出。
const MAX_TOKENS = 12000

/**
 * 检测 API Key 是否已配置
 * DEV：检查前端环境变量
 * PROD：始终返回 true（由 Nginx 反代处理，前端无需知道 Key）
 */
export function isApiKeyConfigured() {
  if (!IS_DEV) return true
  return Boolean(API_KEY && API_KEY.trim().length > 0)
}

/* =========================================================
 *  容错 JSON 解析（保留原有多策略容错能力）
 * ========================================================= */

function sanitizeText(text) {
  return text
    .replace(/^\uFEFF/, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
}

function tryParse(raw) {
  try { return JSON.parse(raw) } catch { return undefined }
}

/**
 * 从字符串中「智能」剥离 JSON 对象或数组（支持多策略）
 * 策略优先级：
 *   1. 直接 JSON.parse
 *   2. 去掉 Markdown code fence
 *   3. 优先对象：截取第一个 { 到最后一个 }
 *   4. 兼容老格式：截取 [ ... ]（数组），包成 { options: [...] }
 *   5. 宽松容错：looseFixJson
 *   6. 兜底：new Function 求值（仅在 DEV 下记录原始内容用于调试）
 */
function extractJson(content) {
  if (!content) throw new Error('AI 返回内容为空')

  const raw = sanitizeText(content.trim())
  const debugInfo = raw.length > 400 ? raw.slice(0, 400) + ' ...[truncated]' : raw

  // 1. 直接整体解析
  let value = tryParse(raw)
  if (value !== undefined) return normalizeShape(value, debugInfo)

  // 2. 去掉 Markdown code fence
  const fencePatterns = [
    /```(?:json|JSON)\s*([\s\S]*?)\s*```/i,
    /```\s*([\s\S]*?)\s*```/,
  ]
  let work = raw
  for (const re of fencePatterns) {
    const m = work.match(re)
    if (m) {
      work = m[1].trim()
      value = tryParse(work)
      if (value !== undefined) return normalizeShape(value, debugInfo)
      break
    }
  }

  // 3. 对象优先：截取 { ... }（新 schema 是对象）
  const firstBrace = work.indexOf('{')
  const lastBrace = work.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const slice = work.slice(firstBrace, lastBrace + 1)
    value = tryParse(slice)
    if (value !== undefined) return normalizeShape(value, debugInfo)

    const fixed = looseFixJson(slice, 'object')
    value = tryParse(fixed)
    if (value !== undefined) return normalizeShape(value, debugInfo)
  }

  // 4. 兼容老格式：纯数组 [ ... ]，包成 { options: [...] }
  const firstBracket = work.indexOf('[')
  const lastBracket = work.lastIndexOf(']')
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    const slice = work.slice(firstBracket, lastBracket + 1)
    value = tryParse(slice)
    if (value !== undefined) return normalizeShape(value, debugInfo)

    const fixed = looseFixJson(slice, 'array')
    value = tryParse(fixed)
    if (value !== undefined) return normalizeShape(value, debugInfo)
  }

  // 5. 兜底：new Function 求值（风险注释：等价 eval，仅对 AI 返回内容使用，
  //    且只在标准 JSON.parse 全部失败后启用）
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('return (' + work + ')')
    const out = fn()
    if (out !== undefined && out !== null) return normalizeShape(out, debugInfo)
  } catch { /* ignore */ }

  throw new Error('AI 返回内容未找到可解析的 JSON。原始内容预览：' + debugInfo)
}

/**
 * 把解析出的任意结构统一为对象：
 *  - 对象 → 原样返回
 *  - 数组 → 包成 { options: [...] }（兼容旧格式）
 *  - null/undefined → 抛错
 */
function normalizeShape(anyValue, debugInfo) {
  if (anyValue && typeof anyValue === 'object' && !Array.isArray(anyValue)) return anyValue
  if (Array.isArray(anyValue)) return { options: anyValue }
  if (anyValue === null || anyValue === undefined) {
    throw new Error('AI 返回内容解析后为空。预览：' + debugInfo)
  }
  throw new Error('AI 返回内容解析后不是 JSON 对象/数组。预览：' + debugInfo)
}

/**
 * 常见 AI JSON 问题的宽松修复
 */
function looseFixJson(text, kind) {
  let s = text
  s = s.replace(/,[\s\t]*\/\/[^\n]*/g, ',')
  s = s.replace(/[\s\t]\/\/[^\n]*/g, '')
  s = s.replace(/([{,])[\s\r\n]*([a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*)[\s\r\n]*:/g, (m, prefix, name) => `${prefix}"${name}":`)
  s = s.replace(/,\s*([}\]])/g, '$1')
  if (kind === 'array' && !/\]\s*$/.test(s)) s = s.replace(/\s*$/, ']')
  if (kind === 'object' && !/\}\s*$/.test(s)) s = s.replace(/\s*$/, '}')
  return s
}

/* =========================================================
 *  schema 校验与结果规范化
 * ========================================================= */

const DIMENSION_KEYS = ['ability', 'income', 'career', 'pressure', 'opportunityCost']
const VALID_CONFIDENCE = new Set(['high', 'medium', 'low'])

function clampScore(n) {
  const v = Number(n)
  if (Number.isNaN(v)) return 5
  return Math.max(1, Math.min(10, Math.round(v)))
}

function normalizeConfidence(c) {
  const v = typeof c === 'string' ? c.trim().toLowerCase() : ''
  return VALID_CONFIDENCE.has(v) ? v : 'medium'
}

function normalizeNonEmptyString(s, fallback) {
  if (typeof s === 'string' && s.trim()) return s.trim()
  return fallback
}

function normalizeStringArray(arr, fallback) {
  if (!Array.isArray(arr)) return fallback
  const list = arr.map((x) => (typeof x === 'string' ? x.trim() : String(x))).filter(Boolean)
  return list.length ? list : fallback
}

/**
 * 规范化单个维度对象
 */
function normalizeDimension(d) {
  const obj = (d && typeof d === 'object') ? d : {}
  return {
    score: clampScore(obj.score),
    description: normalizeNonEmptyString(obj.description, '暂无描述'),
    rationale: normalizeNonEmptyString(obj.rationale, '暂无评分理由'),
    confidence: normalizeConfidence(obj.confidence),
  }
}

/**
 * 规范化单个选项
 */
function normalizeOption(item, fallbackName) {
  const obj = (item && typeof item === 'object') ? item : {}
  const dims = (obj.dimensions && typeof obj.dimensions === 'object') ? obj.dimensions : {}

  return {
    optionName: normalizeNonEmptyString(obj.optionName, fallbackName || '未知选项'),
    dimensions: {
      ability: normalizeDimension(dims.ability),
      income: normalizeDimension(dims.income),
      career: normalizeDimension(dims.career),
      pressure: normalizeDimension(dims.pressure),
      opportunityCost: normalizeDimension(dims.opportunityCost),
    },
    overallAdvice: normalizeNonEmptyString(obj.overallAdvice, '暂无综合建议'),
    riskTip: normalizeNonEmptyString(obj.riskTip, '暂无风险提示'),
    keyAssumptions: normalizeStringArray(obj.keyAssumptions, ['暂无关键假设']),
  }
}

/**
 * 规范化 summary 对象
 */
function normalizeSummary(summary, options) {
  const obj = (summary && typeof summary === 'object') ? summary : {}
  const optionNames = options.map((o) => o.optionName)

  // ranking 校验：必须包含全部选项名且不重复
  let ranking = Array.isArray(obj.ranking)
    ? obj.ranking.map((x) => (typeof x === 'string' ? x.trim() : String(x))).filter(Boolean)
    : []
  const rankingSet = new Set(ranking)
  const allMatched = optionNames.every((n) => rankingSet.has(n)) && ranking.length === optionNames.length
  if (!allMatched) ranking = [...optionNames] // 不合规时回退为输入顺序

  // recommendedOption 校验：必须是 options 中的某个名
  let recommended = normalizeNonEmptyString(obj.recommendedOption, '')
  if (!optionNames.includes(recommended)) {
    recommended = ranking[0] || optionNames[0] || ''
  }

  return {
    recommendedOption: recommended,
    ranking,
    keyTradeoffs: normalizeNonEmptyString(obj.keyTradeoffs, '暂无关键取舍说明'),
    macroContext: normalizeNonEmptyString(obj.macroContext, '暂无宏观背景分析'),
    userFitAnalysis: normalizeNonEmptyString(obj.userFitAnalysis, '暂无用户适配度分析'),
  }
}

/**
 * 语义校验：检查 description 是否含 1/3/5 年关键词
 * 返回问题列表（空数组表示通过）
 */
function validateTimelineCoverage(options) {
  const issues = []
  options.forEach((opt, i) => {
    DIMENSION_KEYS.forEach((dimKey) => {
      const dim = opt.dimensions[dimKey]
      const desc = dim.description || ''
      const missing = []
      if (!/1\s*年后/.test(desc)) missing.push('1年后')
      if (!/3\s*年后/.test(desc)) missing.push('3年后')
      if (!/5\s*年后/.test(desc)) missing.push('5年后')
      if (missing.length) {
        issues.push(`选项 ${i + 1}（${opt.optionName}）的 ${dimKey} 维度缺少 ${missing.join('、')} 描述`)
      }
    })
  })
  return issues
}

/* =========================================================
 *  调试 DOM（仅 DEV，不写 Key 任何信息）
 * ========================================================= */

function writeDebugDom(hook, payload) {
  if (!IS_DEV || typeof window === 'undefined') return
  try {
    const id = '__debug_' + hook
    let el = document.getElementById(id)
    if (!el) {
      el = document.createElement('pre')
      el.id = id
      el.setAttribute('data-debug', 'true')
      el.style.position = 'absolute'
      el.style.left = '-9999px'
      el.style.top = '0'
      el.style.whiteSpace = 'pre-wrap'
      el.style.wordBreak = 'break-all'
      el.style.maxWidth = '800px'
      document.body.appendChild(el)
    }
    const ts = new Date().toISOString()
    el.textContent = '[time ' + ts + ']\\n' + (typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)).slice(0, 5000)
  } catch { /* ignore */ }
}

/* =========================================================
 *  HTTP 调用（带超时 + 重试）
 * ========================================================= */

/**
 * 单次 fetch 调用，带超时
 * DEV 模式带 Authorization（前端持有 Key）
 * PROD 模式不带（由 Nginx 反代注入，避免 Key 进入浏览器请求）
 */
async function fetchOnce(url, body, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const headers = { 'Content-Type': 'application/json' }
    if (IS_DEV && API_KEY) {
      headers.Authorization = `Bearer ${API_KEY}`
    }
    return await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 带重试的调用：网络错误 / 5xx / 429 重试 1 次（指数退避）
 */
async function fetchWithRetry(url, body, { timeoutMs = REQUEST_TIMEOUT_MS, maxRetry = MAX_RETRY } = {}) {
  let lastErr
  for (let attempt = 0; attempt <= maxRetry; attempt++) {
    try {
      const response = await fetchOnce(url, body, timeoutMs)
      // 5xx / 429 触发重试
      if ((response.status >= 500 || response.status === 429) && attempt < maxRetry) {
        const backoff = 800 * Math.pow(2, attempt)
        await new Promise((r) => setTimeout(r, backoff))
        writeDebugDom('retry', { attempt: attempt + 1, status: response.status, backoff })
        continue
      }
      return response
    } catch (err) {
      lastErr = err
      // 超时 / 网络错误重试
      if (attempt < maxRetry) {
        const backoff = 800 * Math.pow(2, attempt)
        await new Promise((r) => setTimeout(r, backoff))
        writeDebugDom('retry', { attempt: attempt + 1, reason: err.name || err.message, backoff })
        continue
      }
    }
  }
  // 重试用尽
  if (lastErr && lastErr.name === 'AbortError') {
    throw new Error(`AI 接口响应超时（${REQUEST_TIMEOUT_MS / 1000}s）`)
  }
  throw lastErr || new Error('AI 接口调用失败')
}

/**
 * 解析 HTTP 响应 content
 */
async function parseHttpResponse(response) {
  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    writeDebugDom('http_err', { status: response.status, statusText: response.statusText, body: errText.slice(0, 600) })
    // 4xx 不重试，直接抛出
    throw new Error(`API 请求失败 (${response.status}): ${errText.slice(0, 200) || response.statusText}`)
  }

  const data = await response.json()
  const finishReason = data?.choices?.[0]?.finish_reason
  const usage = data?.usage
  const reasoningContent = data?.choices?.[0]?.message?.reasoning_content || ''

  writeDebugDom('data_meta', {
    model: data?.model,
    finishReason,
    usage,
    reasoningContentLength: typeof reasoningContent === 'string' ? reasoningContent.length : 0,
  })

  let content =
    data?.choices?.[0]?.message?.content ||
    data?.choices?.[0]?.delta?.content ||
    data?.choices?.[0]?.text ||
    ''

  // reasoning 模型特判：content 为空但 reasoning_content 有内容
  // 可能原因：
  //   (a) finish_reason === 'length'：reasoning 把 max_tokens 用光，没机会输出最终答案
  //   (b) 流式响应中断
  // 此时不要让前端静默卡住，立即抛清晰错误，让上层降级到 mock
  if (typeof content !== 'string' || content.trim() === '') {
    if (finishReason === 'length') {
      throw new Error('AI 思考超出 token 上限（reasoning 模型把预算用在了推理上，未输出最终答案）。请减少决策选项数量或在 .env 中切换到非 reasoning 模型。')
    }
    if (typeof reasoningContent === 'string' && reasoningContent.trim()) {
      // 兜底：尝试从 reasoning_content 里提取 JSON（部分模型会把答案写在推理里）
      content = reasoningContent
      writeDebugDom('fallback_to_reasoning', { length: reasoningContent.length })
    } else {
      throw new Error('AI 返回的 content 为空（既无 content 也无 reasoning_content），无法解析。')
    }
  }

  // 处理 DeepSeek / 豆包 reasoning 模型过度转义
  if (typeof content === 'string') {
    const overEscaped = content.match(/^[\s\n\r]*[\\"`\[\{]/) && (
      content.indexOf('\\\\"') !== -1 ||
      content.indexOf('\\\\n') !== -1 ||
      (content.match(/\\\\/g) || []).length > 5
    )
    if (overEscaped) {
      try {
        // eslint-disable-next-line no-new-func
        const unescaped = new Function('return (' + content + ')')()
        if (typeof unescaped === 'string') content = unescaped
        else if (unescaped && typeof unescaped === 'object') content = JSON.stringify(unescaped)
      } catch { /* ignore */ }
    }
    if (typeof content === 'string') {
      const trimmed = content.trim()
      if (
        (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ) {
        try {
          // eslint-disable-next-line no-new-func
          const inner = new Function('return (' + trimmed + ')')()
          if (typeof inner === 'string') content = inner
        } catch { /* ignore */ }
      }
    }
  }

  writeDebugDom('content_final', { length: content?.length, finishReason, preview: typeof content === 'string' ? content.slice(0, 600) : 'NON_STRING' })
  if (IS_DEV && typeof window !== 'undefined') {
    // eslint-disable-next-line no-console
    console.info('[AI 响应]', 'finish:', finishReason, 'content 长度:', typeof content === 'string' ? content.length : 'NON_STRING', '预览:', typeof content === 'string' ? content.slice(0, 300) : content)
  }

  return content
}

/**
 * 构建修复重试消息：把校验问题反馈给 AI
 */
function buildRepairMessages(originalMessages, issues) {
  const issueText = issues.map((s, i) => `${i + 1}. ${s}`).join('\n')
  return [
    ...originalMessages,
    {
      role: 'assistant',
      content: '（上次输出的 JSON 不符合要求，请按下方提示修复后重新输出完整 JSON 对象）',
    },
    {
      role: 'user',
      content: [
        '你上一次输出的 JSON 存在以下问题，请修复后重新输出一个完整的 JSON 对象（仅输出 JSON，不要任何解释或代码块标记）：',
        '',
        issueText,
        '',
        '请确保：每个维度的 description 都显式包含 "1年后"、"3年后"、"5年后" 三个时段；summary.recommendedOption 与 options 中的某个 optionName 完全一致；summary.ranking 包含所有选项名且不重复；options 数组长度与决策选项数量一致。',
      ].join('\n'),
    },
  ]
}

/* =========================================================
 *  主接口
 * ========================================================= */

/**
 * 调用 AI 接口分析决策选项
 * @param {Object} userInfo 用户信息
 * @param {string[]} options 决策选项列表
 * @returns {Promise<{ summary: Object, options: Array }>} 标准化后的分析结果
 */
export async function analyzeDecisions(userInfo, options) {
  if (!isApiKeyConfigured()) {
    throw new Error('API_KEY_NOT_CONFIGURED')
  }

  const url = `${BASE_URL.replace(/\/$/, '')}/chat/completions`
  const messages = buildMessages(userInfo, options)

  writeDebugDom('env', { model: MODEL, url, hasKey: !!API_KEY })

  const baseBody = {
    model: MODEL,
    temperature: TEMPERATURE,
    max_tokens: MAX_TOKENS,
  }

  // 第 1 次调用
  let parsed
  let issues = []
  let attempt = 0

  while (attempt <= MAX_REPAIR_RETRY) {
    const currentMessages = attempt === 0 ? messages : buildRepairMessages(messages, issues)
    const body = { ...baseBody, messages: currentMessages }

    const response = await fetchWithRetry(url, body, { timeoutMs: REQUEST_TIMEOUT_MS, maxRetry: MAX_RETRY })
    const content = await parseHttpResponse(response)
    parsed = extractJson(content)

    // 规范化
    const rawOptions = Array.isArray(parsed.options) ? parsed.options : (parsed.options ? [parsed.options] : [])
    const normalizedOptions = options.map((opt, idx) => normalizeOption(rawOptions[idx] || {}, opt))
    const normalizedSummary = normalizeSummary(parsed.summary, normalizedOptions)

    // 语义校验
    issues = validateTimelineCoverage(normalizedOptions)

    if (issues.length === 0 || attempt >= MAX_REPAIR_RETRY) {
      return { summary: normalizedSummary, options: normalizedOptions }
    }

    writeDebugDom('repair', { attempt: attempt + 1, issues })
    attempt++
  }

  // 理论上不会到这里
  return parsed
}
