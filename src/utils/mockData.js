// 模拟数据生成器：当 API Key 未配置或调用失败时，使用内置模拟数据展示界面效果
//
// 数据结构已升级为 { summary, options }，与真实 AI 输出保持一致
// 包含 rationale / confidence / keyAssumptions 等新字段

const DIMENSION_KEYS = ['ability', 'income', 'career', 'pressure', 'opportunityCost']

// 维度描述模板：1/3/5 年分段（含量化锚点）
const TEMPLATES = {
  ability: {
    good: ['1年后：掌握核心技能体系，能够独立完成中等复杂度任务，技能深度达到 L3；3年后：在垂直领域形成个人方法论，可指导他人，预计晋升为资深岗；5年后：成为该方向资深专家，具备跨领域整合能力，预计达到 L5+ 级别。'],
    mid: ['1年后：熟悉业务流程，能完成基础执行工作，技能深度 L2；3年后：技能有提升但深度有限，需补充新方向，预计晋升普通；5年后：技能曲线趋于平缓，需主动突破舒适区，存在被新人赶超风险。'],
    low: ['1年后：技能积累有限，主要停留在表层认知；3年后：能力提升遇瓶颈，竞争力下降，晋升概率 < 20%；5年后：技能老化风险增加，需考虑转型。'],
  },
  income: {
    good: ['1年后：薪资较当前提升 20-40%（区间 15-25K/月），处于行业偏上水平；3年后：进入高薪区间（25-40K/月），现金流稳健；5年后：具备议价权（40-70K/月），可借助资源杠杆放大收益。'],
    mid: ['1年后：薪资小幅提升 10-15%（10-15K/月）；3年后：进入稳定增长期（15-22K/月），但增幅受限；5年后：收入达中产水平（22-30K/月），但天花板可见。'],
    low: ['1年后：收入波动大，依赖项目或兼职（8-12K/月）；3年后：增速低于通胀，实际购买力下降；5年后：收入见顶，需寻找第二曲线。'],
  },
  career: {
    good: ['1年后：进入核心团队或管理层预备役；3年后：承担关键项目，晋升路径清晰，预计达到 P7/M2；5年后：到达行业头部岗位，具备行业影响力，预计 P8/M3。'],
    mid: ['1年后：职位小幅晋升（P5→P6）；3年后：进入中层，但层级晋升放缓；5年后：面临天花板，需要新机会突破。'],
    low: ['1年后：岗位无显著变化；3年后：晋升机会有限，竞争激烈；5年后：上升空间收窄，存在被替代风险。'],
  },
  pressure: {
    good: ['1年后：工作节奏可控（周工时 40-50h），生活与工作平衡较好；3年后：压力趋于平稳，时间管理成熟；5年后：进入主动掌控阶段，生活品质稳定提升。'],
    mid: ['1年后：项目期压力较大，加班较频繁（周工时 50-60h）；3年后：节奏持续紧张但可控；5年后：需要长期管理身心负荷。'],
    low: ['1年后：高压常态，需应对多重冲突（周工时 60h+）；3年后：身心资源透支风险增加；5年后：健康与人际关系需重点关注。'],
  },
  opportunityCost: {
    good: ['1年后：放弃的其他路径价值有限，当前选择更具优势；3年后：积累复利效应显现，机会成本持续下降；5年后：选择正确性得到验证，路径依赖成本低。'],
    mid: ['1年后：放弃的部分收益尚可，存在轻微犹豫；3年后：机会成本中性，需关注是否错失新风口；5年后：路径锁定，转型成本上升。'],
    low: ['1年后：错失的备选项吸引力较高；3年后：机会成本持续累积；5年后：路径切换代价大，需提前规划备选方案。'],
  },
}

// 维度评分理由模板
const RATIONALE_TEMPLATES = {
  ability: {
    good: '用户技能基础扎实，该方向有系统化的能力跃迁路径。',
    mid: '该方向有成长空间，但需要用户主动补充新领域知识。',
    low: '用户当前技能与该方向匹配度有限，能力积累速度受限。',
  },
  income: {
    good: '该方向薪资带宽宽，且用户背景具备议价权。',
    mid: '薪资增长稳定但受行业天花板限制。',
    low: '收入波动大且不稳定，与用户当前收入预期存在差距。',
  },
  career: {
    good: '该方向晋升路径清晰，用户背景有助于快速进入核心团队。',
    mid: '晋升通道存在但竞争较激烈。',
    low: '晋升空间有限，长期存在被替代风险。',
  },
  pressure: {
    good: '该方向工作节奏可控，与用户性格匹配度较高。',
    mid: '压力处于中等水平，需要持续的时间管理。',
    low: '该方向高压常态，与用户风险偏好存在冲突。',
  },
  opportunityCost: {
    good: '相比其他选项，此路径放弃的收益较少，复利效应明显。',
    mid: '机会成本中性，需要关注行业新风口。',
    low: '此路径可能错失更高收益的备选项，机会成本较高。',
  },
}

const ADVICE_TEMPLATES = [
  '结合您的年龄与背景，此选项在能力积累与职业发展上具备一定优势，建议在 1-2 年内建立核心竞争力，并主动拓展行业人脉。',
  '此路径与您当前技能匹配度较高，可作为短期过渡方案。建议同时保留学习与转型通道，避免长期路径依赖。',
  '此选择短期收益有限，但中长期上升空间可观，需要您具备耐心与持续投入。建议制定阶段性里程碑，定期复盘。',
  '该选项与您性格特点契合，工作生活平衡相对可控，适合追求稳健发展的路径，但需警惕天花板提前到来。',
  '此选项机会成本较高，若选择需做好充分准备，建议设置 6 个月的试错窗口，及时调整方向。',
]

const RISK_TEMPLATES = [
  '行业政策与宏观经济波动可能影响预期收入曲线，需建立应急储备。',
  'AI 与自动化对岗位的替代风险正在上升，需持续更新不可替代技能。',
  '长期高压可能带来健康透支，需关注身心平衡。',
  '职业路径锁定后转型成本递增，建议每 1-2 年评估一次方向。',
  '若备选路径在新风口上加速，可能放大机会成本，需建立跟踪机制。',
]

const ASSUMPTION_TEMPLATES = [
  '假设未来 3 年行业整体维持当前增速（年化 8-12%）。',
  '假设用户能持续投入每周 10 小时以上的主动学习时间。',
  '假设家庭可承担 6-12 个月的收入波动期。',
  '假设 AI 替代率不超过 30%，且不可替代技能溢价持续。',
  '假设用户所在地域政策环境维持稳定。',
  '假设用户能够完成该方向必要的资质或学历提升。',
]

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function genScore() {
  return Math.floor(Math.random() * 6) + 4
}

function tierOf(score) {
  return score >= 8 ? 'good' : score >= 6 ? 'mid' : 'low'
}

function buildDimension(dimKey, score) {
  const tier = tierOf(score)
  return {
    score,
    description: pick(TEMPLATES[dimKey][tier]),
    rationale: pick(RATIONALE_TEMPLATES[dimKey][tier]),
    confidence: score >= 8 ? 'high' : score >= 6 ? 'medium' : 'low',
  }
}

/**
 * 生成单个选项的模拟数据
 */
function generateOption(optionName) {
  const dimensions = {}
  DIMENSION_KEYS.forEach((key) => {
    dimensions[key] = buildDimension(key, genScore())
  })

  return {
    optionName,
    dimensions,
    overallAdvice: pick(ADVICE_TEMPLATES),
    riskTip: pick(RISK_TEMPLATES),
    keyAssumptions: [pick(ASSUMPTION_TEMPLATES), pick(ASSUMPTION_TEMPLATES)],
  }
}

/**
 * 根据 options 总分生成 summary 排名
 */
function buildSummary(options) {
  const scored = options.map((opt) => {
    const total = DIMENSION_KEYS.reduce((sum, k) => sum + opt.dimensions[k].score, 0)
    return { name: opt.optionName, total }
  }).sort((a, b) => b.total - a.total)

  const ranking = scored.map((x) => x.name)
  const top = ranking[0]
  const second = ranking[1]

  return {
    recommendedOption: top,
    ranking,
    keyTradeoffs: `综合五维度评分，「${top}」总分最高，但「${second}」在部分维度上同样具备竞争力。建议结合您最看重的目标优先级（如收入 vs 平衡）做最终选择。`,
    macroContext: '当前行业整体处于成熟期向转型期过渡阶段，AI 与自动化对中端执行岗的替代率持续上升，对高阶复合型人才的需求与溢价同步增长。建议在决策中重点关注不可替代技能的积累。',
    userFitAnalysis: '根据您填写的背景信息，技能与性格的匹配度是决定长期可持续性的关键因素。短期内薪资差异有限，但 3-5 年后的分化主要取决于能力复利与路径锁定效应。',
  }
}

/**
 * 批量生成模拟数据
 * @param {string[]} options
 * @returns {{ summary: Object, options: Array }}
 */
export function generateMockResults(options) {
  const opts = options.map((opt) => generateOption(opt))
  return {
    summary: buildSummary(opts),
    options: opts,
  }
}

/**
 * 模拟网络延迟，便于演示加载状态
 */
export function simulateDelay(ms = 800) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
