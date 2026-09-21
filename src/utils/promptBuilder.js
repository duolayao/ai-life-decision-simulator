// 提示词构建器：根据用户输入构建发送给 AI 的提示词
//
// 设计目标：
// 1. 思维链引导：让 AI 先做宏观/适配分析，再分维度评分，再给风险情景与综合建议
// 2. 量化锚点：评分必须带 rationale（评分理由）+ confidence（置信度），描述尽量给出可量化区间
// 3. 反幻觉：每个选项给出 keyAssumptions（关键假设），让用户自行判断前提是否成立
// 4. 横向对比：summary 字段要求 AI 主动给出推荐项、排名、关键取舍

/**
 * 字段标签映射：把表单字段转成可读的中文名，便于 AI 理解
 */
const FIELD_LABELS = {
  age: '年龄',
  education: '学历',
  major: '专业',
  job: '当前职业',
  personality: '性格特点',
  skills: '核心技能',
  incomeRange: '当前年收入区间',
  region: '目标地域',
  family: '家庭情况',
  riskPreference: '风险偏好',
  timeWindow: '决策时间窗',
  priority: '目标优先级',
}

/**
 * 把用户信息对象格式化为「字段名：值」的可读行
 * 跳过空字段（可选字段未填时不输出，避免误导 AI）
 */
function formatUserInfo(userInfo) {
  return Object.keys(FIELD_LABELS)
    .filter((k) => userInfo[k] !== undefined && userInfo[k] !== null && String(userInfo[k]).trim() !== '')
    .map((k) => `- ${FIELD_LABELS[k]}：${userInfo[k]}`)
    .join('\n')
}

/**
 * 构建系统提示词（强制返回合法 JSON 对象）
 * 关键约束：
 *  - 只输出 JSON，无任何额外文字
 *  - 字符串包裹必须用标准英文双引号
 *  - 字段名严格固定（前后端契约）
 */
export function buildSystemPrompt() {
  return [
    '你是一位资深的职业规划师与人生决策分析师，具备以下能力：',
    '(1) 熟悉中国主流行业的职业发展曲线、薪资带宽与晋升节奏；',
    '(2) 能结合宏观经济、行业周期、地域差异做结构化推理；',
    '(3) 善于识别决策中的关键假设与不确定性，并诚实标注置信度。',
    '\n本次任务你必须只输出一个机器可解析的合法 JSON 对象（最外层是 { }，不是数组），',
    '不要输出任何 JSON 之外的文字、解释、Markdown 代码块标记（如 ```json 或 ```）。',
    '\n在 JSON 字符串内部，中文标点（顿号、书名号、破折号等）均可使用，',
    '但字符串的包裹必须使用标准英文双引号（"），字符串内的英文双引号必须以反斜杠转义（\\"），',
    '字符串内允许换行（按 JSON 规则写成 \\n），也允许用分号（；或;）代替换行分段。',
    '\n你必须严格遵守下面给出的字段名与取值约束，不得自行增删字段或重命名字段。',
  ].join('')
}

/**
 * 构建用户提示词
 * 包含：
 *  - 用户背景（含可选字段）
 *  - 决策选项
 *  - 思维链引导（4 阶段思考）
 *  - 严格的输出 schema 与示例
 */
export function buildUserPrompt(userInfo, options) {
  const userInfoText = formatUserInfo(userInfo)
  const optionsText = options.map((opt, idx) => `  ${idx + 1}. ${opt}`).join('\n')

  return `# 用户背景

${userInfoText}

# 决策选项（共 ${options.length} 个）

${optionsText}

# 你的分析任务（请在内心完成下列思考链，不要把思考过程写进输出，只输出最终 JSON）

1. **宏观与行业分析**：基于用户的目标地域、专业、职业，判断当前行业所处的周期阶段（成长/成熟/衰退）、人才供需、AI 与自动化对该职业的冲击程度。
2. **用户与选项适配度**：评估用户的学历、技能、性格、风险偏好、家庭情况与每个选项的匹配度，识别出最契合与最不契合的选项。
3. **分维度量化评分**：为每个选项的 5 个维度打分（1-10 整数），每个分数必须给出：
   - rationale：1 句话说明为什么打这个分（结合用户背景与行业事实，不要泛泛而谈）
   - confidence：标注 high / medium / low，对预测距离越远（5 年）或数据越稀缺的维度，置信度应越低
4. **时间线量化描述**：每个维度的 description 必须显式包含 "1年后"、"3年后"、"5年后" 三个时段，并尽量给出可量化的预测（如薪资区间、晋升概率、技能深度等级），而非"提升较大"这类空话。
5. **关键假设识别**：为每个选项列出 1-3 条 keyAssumptions（影响结论成立的关键前提，如"假设 AI 替代率 < 30%"、"假设家庭可承担 2 年无收入"），让用户能自行判断前提是否成立。
6. **横向对比与推荐**：在 summary 中明确给出推荐选项（recommendedOption）、完整排名（ranking）、关键取舍说明（keyTradeoffs）。

# 严格输出 Schema（必须完全匹配，字段名不可更改）

{
  "summary": {
    "recommendedOption": "字符串，必须与某个选项名完全一致",
    "ranking": ["字符串数组，按推荐度从高到低排列，包含所有选项名"],
    "keyTradeoffs": "字符串，简述前 2 名选项之间的核心取舍（2-3 句话）",
    "macroContext": "字符串，简述当前行业/经济环境对该决策的影响（2-3 句话）",
    "userFitAnalysis": "字符串，简述用户背景与各选项的整体匹配度（2-3 句话）"
  },
  "options": [
    {
      "optionName": "选项名（与用户输入完全一致）",
      "dimensions": {
        "ability":       { "score": 8, "description": "1年后...；3年后...；5年后...", "rationale": "评分理由（1 句话）", "confidence": "high|medium|low" },
        "income":        { "score": 7, "description": "1年后...；3年后...；5年后...", "rationale": "评分理由", "confidence": "high|medium|low" },
        "career":        { "score": 6, "description": "1年后...；3年后...；5年后...", "rationale": "评分理由", "confidence": "high|medium|low" },
        "pressure":      { "score": 5, "description": "1年后...；3年后...；5年后...", "rationale": "评分理由", "confidence": "high|medium|low" },
        "opportunityCost": { "score": 4, "description": "1年后...；3年后...；5年后...", "rationale": "评分理由", "confidence": "high|medium|low" }
      },
      "overallAdvice": "综合建议（结合用户背景给出 2-3 句话，可执行）",
      "riskTip": "风险提示（列出 1-2 条最关键风险）",
      "keyAssumptions": ["假设 1（可证伪的前提）", "假设 2"]
    }
  ]
}

# 维度评分约定

- score 为 1-10 的整数，10 分为最优/最有利。
- ability（能力成长）：技能提升速度与广度，分数越高成长越快。
- income（收入趋势）：预期薪资水平与增长空间，分数越高收入越高。请在 description 给出可量化的薪资或收入区间。
- career（职业天花板）：上升空间与发展上限，分数越高天花板越高。
- pressure（生活压力）：工作强度、竞争、生活平衡，分数越高压力越小。
- opportunityCost（机会成本）：选择此路径放弃的其他收益，分数越高机会成本越低（即此选择更优）。
- 不同选项在同一维度上应体现差异化，避免所有选项都打 6-8 分这种"中庸"分布。

# 输出要求（极其重要）

1. 只输出上述 schema 对应的 JSON 对象本身，最外层是 { }，不要包裹在数组里。
2. options 数组长度必须为 ${options.length}，顺序与用户输入一致。
3. 所有字段名严格使用：optionName、dimensions、ability、income、career、pressure、opportunityCost、overallAdvice、riskTip、keyAssumptions、score、description、rationale、confidence、summary、recommendedOption、ranking、keyTradeoffs、macroContext、userFitAnalysis。
4. summary.recommendedOption 必须是 options 中某个 optionName 的精确匹配。
5. summary.ranking 必须包含全部 ${options.length} 个选项名，不能遗漏或重复。
6. 不要输出任何解释、前后缀文字、Markdown 代码块标记。`
}

/**
 * 完整的提示词消息数组
 * @param {Object} userInfo
 * @param {string[]} options
 */
export function buildMessages(userInfo, options) {
  return [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content: buildUserPrompt(userInfo, options) },
  ]
}
