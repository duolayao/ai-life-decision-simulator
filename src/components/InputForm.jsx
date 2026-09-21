import React, { useState } from 'react'

// 学历下拉选项（补全大专、MBA、其他）
const EDUCATION_OPTIONS = ['高中', '大专', '本科', '硕士', 'MBA', '博士', '其他']

// 收入区间下拉选项（年化）
const INCOME_OPTIONS = [
  '10 万以下',
  '10-20 万',
  '20-40 万',
  '40-70 万',
  '70 万以上',
]

// 风险偏好
const RISK_OPTIONS = [
  { value: '保守', hint: '规避不确定性，优先稳定' },
  { value: '稳健', hint: '适度冒险，平衡收益与风险' },
  { value: '进取', hint: '愿承担较高风险换取高回报' },
  { value: '激进', hint: '全力押注高增长路径' },
]

// 决策时间窗
const TIME_WINDOW_OPTIONS = ['立即（1 个月内）', '3 个月内', '6 个月内', '1 年内', '2 年内']

// 目标优先级
const PRIORITY_OPTIONS = [
  '能力成长优先',
  '收入最大化优先',
  '工作生活平衡优先',
  '长期职业天花板优先',
  '风险最小化优先',
]

const MIN_OPTIONS = 2
const MAX_OPTIONS = 5

// 表单初始值
const INITIAL_FORM = {
  age: '',
  education: '本科',
  major: '',
  job: '',
  personality: '',
  skills: '',
  incomeRange: '',
  region: '',
  family: '',
  riskPreference: '稳健',
  timeWindow: '6 个月内',
  priority: '能力成长优先',
}

// 一键示例模板
const EXAMPLE_TEMPLATE = {
  age: '27',
  education: '本科',
  major: '计算机科学',
  job: '前端工程师',
  personality: '内向、注重细节、抗压能力较强、偏好稳定但愿意学习新事物',
  skills: 'React, TypeScript, 工程化, 基础 Node.js, 沟通协调',
  incomeRange: '20-40 万',
  region: '上海',
  family: '单身，无房贷压力，父母健康',
  riskPreference: '稳健',
  timeWindow: '6 个月内',
  priority: '能力成长优先',
}
const EXAMPLE_OPTIONS = ['继续深耕前端走技术专家路线', '转后端 / 全栈方向拓宽', '转产品经理']

/**
 * 输入表单组件
 * @param {Object} props
 * @param {Function} props.onSubmit 提交回调 (userInfo, options) => void
 * @param {boolean} props.apiReady API 是否可用
 */
export default function InputForm({ onSubmit, apiReady = false }) {
  const [form, setForm] = useState(INITIAL_FORM)
  const [options, setOptions] = useState(['', ''])
  const [errors, setErrors] = useState({})

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleOptionChange = (idx, value) => {
    setOptions((prev) => {
      const next = [...prev]
      next[idx] = value
      return next
    })
  }

  const addOption = () => {
    if (options.length >= MAX_OPTIONS) return
    setOptions((prev) => [...prev, ''])
  }

  const removeOption = (idx) => {
    if (options.length <= MIN_OPTIONS) return
    setOptions((prev) => prev.filter((_, i) => i !== idx))
  }

  // 一键填充示例
  const fillExample = () => {
    setForm(EXAMPLE_TEMPLATE)
    setOptions(EXAMPLE_OPTIONS)
    setErrors({})
  }

  // 校验：必填字段 + 选项非空且不重复
  const validate = () => {
    const next = {}
    const ageNum = Number(form.age)
    if (!form.age || Number.isNaN(ageNum) || ageNum < 16 || ageNum > 80) {
      next.age = '请输入 16-80 之间的年龄'
    }
    if (!form.major.trim()) next.major = '请填写专业'
    if (!form.job.trim()) next.job = '请填写当前职业'
    if (!form.personality.trim()) next.personality = '请填写性格特点'
    if (!form.skills.trim()) next.skills = '请填写核心技能'
    // 可选字段不强制校验，但 region / incomeRange 强烈建议填写
    if (!form.region.trim()) next.region = '请填写目标地域（影响行业判断）'

    const trimmed = options.map((o) => o.trim()).filter(Boolean)
    if (trimmed.length < MIN_OPTIONS) {
      next.options = `请至少填写 ${MIN_OPTIONS} 个决策选项`
    } else if (new Set(trimmed).size !== trimmed.length) {
      next.options = '决策选项不能重复'
    }

    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!validate()) return
    const trimmedOptions = options.map((o) => o.trim()).filter(Boolean)
    onSubmit(
      {
        ...form,
        age: Number(form.age),
      },
      trimmedOptions,
    )
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-brand-100 p-6 md:p-8 fade-in-up">
      {/* 标题与一键示例 */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <h2 className="text-xl md:text-2xl font-semibold text-brand-800">
          填写您的背景信息
        </h2>
        <button
          type="button"
          onClick={fillExample}
          className="self-start md:self-auto px-3 py-1.5 text-xs rounded-lg bg-brand-50 text-brand-700 border border-brand-200 hover:bg-brand-100 transition"
        >
          ✨ 一键填充示例
        </button>
      </div>

      {/* 基本信息网格 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
        {/* 年龄 */}
        <div>
          <label className="block text-sm font-medium text-brand-700 mb-2">
            年龄 <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            name="age"
            value={form.age}
            onChange={handleChange}
            min="16"
            max="80"
            placeholder="如 25"
            className="w-full px-4 py-2.5 rounded-lg border border-brand-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none transition"
          />
          {errors.age && <p className="mt-1 text-sm text-red-500">{errors.age}</p>}
        </div>

        {/* 学历 */}
        <div>
          <label className="block text-sm font-medium text-brand-700 mb-2">
            学历 <span className="text-red-500">*</span>
          </label>
          <select
            name="education"
            value={form.education}
            onChange={handleChange}
            className="w-full px-4 py-2.5 rounded-lg border border-brand-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none transition bg-white"
          >
            {EDUCATION_OPTIONS.map((edu) => (
              <option key={edu} value={edu}>{edu}</option>
            ))}
          </select>
        </div>

        {/* 专业 */}
        <div>
          <label className="block text-sm font-medium text-brand-700 mb-2">
            专业 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="major"
            value={form.major}
            onChange={handleChange}
            placeholder="如 计算机科学"
            className="w-full px-4 py-2.5 rounded-lg border border-brand-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none transition"
          />
          {errors.major && <p className="mt-1 text-sm text-red-500">{errors.major}</p>}
        </div>

        {/* 当前职业 */}
        <div>
          <label className="block text-sm font-medium text-brand-700 mb-2">
            当前职业 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="job"
            value={form.job}
            onChange={handleChange}
            placeholder="如 前端工程师"
            className="w-full px-4 py-2.5 rounded-lg border border-brand-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none transition"
          />
          {errors.job && <p className="mt-1 text-sm text-red-500">{errors.job}</p>}
        </div>

        {/* 性格特点 */}
        <div>
          <label className="block text-sm font-medium text-brand-700 mb-2">
            性格特点 <span className="text-red-500">*</span>
          </label>
          <textarea
            name="personality"
            value={form.personality}
            onChange={handleChange}
            rows="3"
            placeholder="如 内向、注重细节、抗压能力较强、偏好稳定..."
            className="w-full px-4 py-2.5 rounded-lg border border-brand-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none transition resize-y"
          />
          {errors.personality && <p className="mt-1 text-sm text-red-500">{errors.personality}</p>}
        </div>

        {/* 核心技能 */}
        <div>
          <label className="block text-sm font-medium text-brand-700 mb-2">
            核心技能 <span className="text-red-500">*</span>
            <span className="ml-1 text-xs text-brand-400">（逗号分隔）</span>
          </label>
          <textarea
            name="skills"
            value={form.skills}
            onChange={handleChange}
            rows="3"
            placeholder="如 React, TypeScript, 产品思维, 沟通协调..."
            className="w-full px-4 py-2.5 rounded-lg border border-brand-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none transition resize-y"
          />
          {errors.skills && <p className="mt-1 text-sm text-red-500">{errors.skills}</p>}
        </div>

        {/* 当前年收入区间 */}
        <div>
          <label className="block text-sm font-medium text-brand-700 mb-2">
            当前年收入区间
            <span className="ml-1 text-xs text-brand-400">（影响收入维度评分校准）</span>
          </label>
          <select
            name="incomeRange"
            value={form.incomeRange}
            onChange={handleChange}
            className="w-full px-4 py-2.5 rounded-lg border border-brand-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none transition bg-white"
          >
            <option value="">不透露</option>
            {INCOME_OPTIONS.map((inc) => (
              <option key={inc} value={inc}>{inc}</option>
            ))}
          </select>
        </div>

        {/* 目标地域 */}
        <div>
          <label className="block text-sm font-medium text-brand-700 mb-2">
            目标地域 <span className="text-red-500">*</span>
            <span className="ml-1 text-xs text-brand-400">（如 北京 / 上海 / 新一线）</span>
          </label>
          <input
            type="text"
            name="region"
            value={form.region}
            onChange={handleChange}
            placeholder="如 上海"
            className="w-full px-4 py-2.5 rounded-lg border border-brand-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none transition"
          />
          {errors.region && <p className="mt-1 text-sm text-red-500">{errors.region}</p>}
        </div>

        {/* 家庭情况 */}
        <div>
          <label className="block text-sm font-medium text-brand-700 mb-2">
            家庭情况
            <span className="ml-1 text-xs text-brand-400">（可选，影响压力与机会成本判断）</span>
          </label>
          <input
            type="text"
            name="family"
            value={form.family}
            onChange={handleChange}
            placeholder="如 单身无娃 / 已婚有娃 / 赡养父母"
            className="w-full px-4 py-2.5 rounded-lg border border-brand-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none transition"
          />
        </div>

        {/* 风险偏好 */}
        <div>
          <label className="block text-sm font-medium text-brand-700 mb-2">风险偏好</label>
          <select
            name="riskPreference"
            value={form.riskPreference}
            onChange={handleChange}
            className="w-full px-4 py-2.5 rounded-lg border border-brand-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none transition bg-white"
          >
            {RISK_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.value} — {r.hint}</option>
            ))}
          </select>
        </div>

        {/* 决策时间窗 */}
        <div>
          <label className="block text-sm font-medium text-brand-700 mb-2">决策时间窗</label>
          <select
            name="timeWindow"
            value={form.timeWindow}
            onChange={handleChange}
            className="w-full px-4 py-2.5 rounded-lg border border-brand-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none transition bg-white"
          >
            {TIME_WINDOW_OPTIONS.map((w) => (
              <option key={w} value={w}>{w}</option>
            ))}
          </select>
        </div>

        {/* 目标优先级 */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-brand-700 mb-2">目标优先级</label>
          <select
            name="priority"
            value={form.priority}
            onChange={handleChange}
            className="w-full px-4 py-2.5 rounded-lg border border-brand-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none transition bg-white"
          >
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 决策选项 */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-brand-700">
            决策选项 <span className="text-red-500">*</span>
            <span className="ml-1 text-xs text-brand-400">（{MIN_OPTIONS}-{MAX_OPTIONS} 个，建议互斥可对比）</span>
          </label>
          <button
            type="button"
            onClick={addOption}
            disabled={options.length >= MAX_OPTIONS}
            className="text-sm text-brand-600 hover:text-brand-800 disabled:text-brand-300 disabled:cursor-not-allowed"
          >
            + 添加选项
          </button>
        </div>

        <div className="space-y-3">
          {options.map((opt, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="flex-shrink-0 w-7 h-7 rounded-full bg-brand-100 text-brand-700 text-sm font-medium flex items-center justify-center">
                {idx + 1}
              </span>
              <input
                type="text"
                value={opt}
                onChange={(e) => handleOptionChange(idx, e.target.value)}
                placeholder={`如 ${idx === 0 ? '考研' : idx === 1 ? '直接就业' : '出国深造'}`}
                className="flex-1 px-4 py-2.5 rounded-lg border border-brand-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none transition"
              />
              {options.length > MIN_OPTIONS && (
                <button
                  type="button"
                  onClick={() => removeOption(idx)}
                  className="flex-shrink-0 w-8 h-8 rounded-lg text-red-500 hover:bg-red-50 transition flex items-center justify-center"
                  aria-label="删除该选项"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        {errors.options && <p className="mt-1 text-sm text-red-500">{errors.options}</p>}
      </div>

      {/* API 状态提示 */}
      {!apiReady && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm">
          <strong>提示：</strong>API Key 未配置，本次分析将使用模拟数据展示界面效果。
          请参考 <code className="px-1 py-0.5 bg-amber-100 rounded">.env.example</code> 配置真实 Key 后调用 DeepSeek API。
        </div>
      )}

      {/* 提交按钮 */}
      <button
        type="submit"
        className="w-full md:w-auto px-8 py-3 bg-brand-800 hover:bg-brand-700 text-white font-medium rounded-lg shadow-sm transition active:scale-[0.98]"
      >
        开始分析
      </button>
    </form>
  )
}
