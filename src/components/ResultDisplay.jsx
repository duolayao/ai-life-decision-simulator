import React, { useState, useEffect, useRef } from 'react'
import {
  Chart,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  RadarController,
} from 'chart.js'
import { isApiKeyConfigured } from '../utils/api'

// 注册 Chart.js 所需模块
Chart.register(
  RadarController,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
)

// 维度元数据：key、中文标签、描述含义
const DIMENSION_META = [
  { key: 'ability', label: '能力成长', desc: '技能提升速度与广度' },
  { key: 'income', label: '收入趋势', desc: '预期薪资水平与增长空间' },
  { key: 'career', label: '职业天花板', desc: '上升空间与发展上限' },
  { key: 'pressure', label: '生活压力', desc: '分数越高压力越小' },
  { key: 'opportunityCost', label: '机会成本', desc: '分数越高机会成本越低' },
]

// 时间线分段标签
const TIMELINE_PHASES = [
  { key: '1', label: '1 年后', color: 'bg-brand-100 text-brand-700' },
  { key: '3', label: '3 年后', color: 'bg-brand-200 text-brand-800' },
  { key: '5', label: '5 年后', color: 'bg-brand-300 text-brand-900' },
]

// 雷达图配色：5 个选项用对比度更高的色板（蓝/绿/橙/紫/灰）
// 不再全部走深蓝渐变，避免 5 选项时难以区分
const CHART_COLORS = [
  { stroke: '#1a2a3a', fill: 'rgba(26, 42, 58, 0.22)' },   // 深蓝（主色）
  { stroke: '#2e7d32', fill: 'rgba(46, 125, 50, 0.22)' },   // 绿
  { stroke: '#ef6c00', fill: 'rgba(239, 108, 0, 0.22)' },   // 橙
  { stroke: '#6a1b9a', fill: 'rgba(106, 27, 154, 0.22)' },  // 紫
  { stroke: '#455a64', fill: 'rgba(69, 90, 100, 0.22)' },   // 蓝灰
]

// 置信度徽章配色
const CONFIDENCE_STYLES = {
  high: { label: '高置信', cls: 'bg-green-100 text-green-700 border-green-200' },
  medium: { label: '中置信', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  low: { label: '低置信', cls: 'bg-red-100 text-red-700 border-red-200' },
}

function ConfidenceBadge({ confidence }) {
  const meta = CONFIDENCE_STYLES[confidence] || CONFIDENCE_STYLES.medium
  return (
    <span className={`inline-block px-1.5 py-0.5 text-[10px] rounded border ${meta.cls}`}>
      {meta.label}
    </span>
  )
}

/**
 * 从维度描述中拆分出 1/3/5 年的段落
 * 修复：原 `/1\s*年/` 会误命中 "3年后"，改为显式匹配 "N 年后"
 */
function splitTimeline(description) {
  const phases = { '1': '', '3': '', '5': '' }
  if (!description) return phases

  // 先按分号/换行切片
  const segments = description.split(/[；;\n]+/).map((s) => s.trim()).filter(Boolean)

  segments.forEach((seg) => {
    // 严格匹配 "1年后" / "3年后" / "5年后"，必须包含 "年后" 才算命中
    // 避免 "1年" 误匹配（理论上原 prompt 也不会出现 "3 年" 含 "1 年"，但加 "年后" 更精确）
    if (/1\s*年后/.test(seg)) {
      phases['1'] += (phases['1'] ? '；' : '') + seg.replace(/^.*?1\s*年后[：:]?\s*/, '')
    } else if (/3\s*年后/.test(seg)) {
      phases['3'] += (phases['3'] ? '；' : '') + seg.replace(/^.*?3\s*年后[：:]?\s*/, '')
    } else if (/5\s*年后/.test(seg)) {
      phases['5'] += (phases['5'] ? '；' : '') + seg.replace(/^.*?5\s*年后[：:]?\s*/, '')
    } else {
      // 兜底：按顺序填入未填充的段落
      if (!phases['1']) phases['1'] = seg
      else if (!phases['3']) phases['3'] = seg
      else if (!phases['5']) phases['5'] = seg
    }
  })
  return phases
}

/**
 * 单选项详情卡片：雷达图 + 维度详情（含 rationale/confidence）+ 时间线 + 综合建议 + 风险 + 关键假设
 */
function OptionDetail({ option, index, isRecommended }) {
  const canvasRef = useRef(null)
  const chartRef = useRef(null)

  useEffect(() => {
    if (!canvasRef.current) return

    if (chartRef.current) {
      chartRef.current.destroy()
      chartRef.current = null
    }

    const labels = DIMENSION_META.map((d) => d.label)
    const data = DIMENSION_META.map((d) => option.dimensions[d.key].score)
    const color = CHART_COLORS[index % CHART_COLORS.length]

    chartRef.current = new Chart(canvasRef.current, {
      type: 'radar',
      data: {
        labels,
        datasets: [
          {
            label: option.optionName,
            data,
            backgroundColor: color.fill,
            borderColor: color.stroke,
            borderWidth: 2,
            pointBackgroundColor: color.stroke,
            pointBorderColor: '#fff',
            pointHoverBackgroundColor: '#fff',
            pointHoverBorderColor: color.stroke,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const meta = DIMENSION_META[ctx.dataIndex]
                const dim = option.dimensions[meta.key]
                return [
                  `${meta.label}: ${ctx.parsed.r} 分`,
                  `理由：${dim.rationale || '暂无'}`,
                  `置信度：${dim.confidence || 'medium'}`,
                ]
              },
            },
          },
        },
        scales: {
          r: {
            min: 0,
            max: 10,
            ticks: { stepSize: 2, color: '#9eb1c8', backdropColor: 'transparent' },
            grid: { color: '#cbd6e3' },
            angleLines: { color: '#cbd6e3' },
            pointLabels: { color: '#2b3d56', font: { size: 13 } },
          },
        },
      },
    })

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy()
        chartRef.current = null
      }
    }
  }, [option, index])

  return (
    <div className="space-y-6 fade-in-up">
      {/* 推荐徽章 */}
      {isRecommended && (
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 border border-green-200 text-green-700 text-xs font-medium">
          <span>★</span> AI 最推荐
        </div>
      )}

      {/* 雷达图 + 评分列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-brand-50 rounded-xl p-4">
          <h4 className="text-sm font-medium text-brand-600 mb-2">维度评分对比</h4>
          <div className="relative h-72">
            <canvas ref={canvasRef}></canvas>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-medium text-brand-600">维度评分详情（含理由与置信度）</h4>
          {DIMENSION_META.map((meta) => {
            const dim = option.dimensions[meta.key]
            return (
              <div key={meta.key} className="bg-white border border-brand-100 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1.5 gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-brand-800">{meta.label}</span>
                    <ConfidenceBadge confidence={dim.confidence} />
                  </div>
                  <span className={`text-sm font-semibold px-2 py-0.5 rounded ${dim.score >= 8 ? 'bg-green-100 text-green-700' : dim.score >= 6 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                    {dim.score} / 10
                  </span>
                </div>
                <p className="text-xs text-brand-400 mb-1">{meta.desc}</p>
                <p className="text-xs text-brand-500 italic mb-1.5">
                  <span className="font-medium not-italic text-brand-600">评分理由：</span>
                  {dim.rationale || '暂无评分理由'}
                </p>
                <p className="text-sm text-brand-700 leading-relaxed">{dim.description}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* 时间线叙事 */}
      <div>
        <h4 className="text-sm font-medium text-brand-600 mb-3">时间线发展</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {TIMELINE_PHASES.map((phase) => {
            const segments = DIMENSION_META.map((meta) => {
              const text = splitTimeline(option.dimensions[meta.key].description)[phase.key]
              return text ? `${meta.label}：${text}` : ''
            }).filter(Boolean)

            return (
              <div key={phase.key} className="bg-white border border-brand-100 rounded-xl p-4">
                <div className={`inline-block px-2.5 py-1 rounded text-xs font-medium mb-2 ${phase.color}`}>
                  {phase.label}
                </div>
                <div className="space-y-2">
                  {segments.length ? (
                    segments.map((seg, i) => (
                      <p key={i} className="text-sm text-brand-700 leading-relaxed">{seg}</p>
                    ))
                  ) : (
                    <p className="text-sm text-brand-400">暂无该时段描述</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 综合建议 + 风险提示 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <h4 className="text-sm font-medium text-green-700 mb-2 flex items-center gap-1.5">
            <span>✓</span> 综合建议
          </h4>
          <p className="text-sm text-green-800 leading-relaxed">{option.overallAdvice}</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <h4 className="text-sm font-medium text-amber-700 mb-2 flex items-center gap-1.5">
            <span>!</span> 风险提示
          </h4>
          <p className="text-sm text-amber-800 leading-relaxed">{option.riskTip}</p>
        </div>
      </div>

      {/* 关键假设 */}
      {Array.isArray(option.keyAssumptions) && option.keyAssumptions.length > 0 && (
        <div className="bg-brand-50 border border-brand-200 rounded-xl p-4">
          <h4 className="text-sm font-medium text-brand-700 mb-2 flex items-center gap-1.5">
            <span>◇</span> 关键假设（请判断这些前提是否成立）
          </h4>
          <ul className="space-y-1.5 list-disc list-inside">
            {option.keyAssumptions.map((a, i) => (
              <li key={i} className="text-sm text-brand-700 leading-relaxed">{a}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/**
 * Summary 卡片：推荐选项 / 排名 / 关键取舍 / 宏观背景 / 用户适配度
 */
function SummaryPanel({ summary, results }) {
  if (!summary) return null
  const { recommendedOption, ranking, keyTradeoffs, macroContext, userFitAnalysis } = summary

  return (
    <div className="bg-gradient-to-br from-brand-50 to-white rounded-2xl shadow-sm border border-brand-200 p-6 fade-in-up">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">🏆</span>
        <h3 className="text-lg font-semibold text-brand-800">综合决策摘要</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 最推荐 */}
        <div className="bg-white border border-green-200 rounded-xl p-4">
          <div className="text-xs text-brand-500 mb-1">AI 最推荐</div>
          <div className="text-base font-semibold text-brand-800">{recommendedOption || '—'}</div>
        </div>

        {/* 排名 */}
        <div className="bg-white border border-brand-100 rounded-xl p-4">
          <div className="text-xs text-brand-500 mb-1">完整排名</div>
          <ol className="text-sm text-brand-700 list-decimal list-inside space-y-0.5">
            {ranking && ranking.length > 0 ? (
              ranking.map((name, i) => (
                <li key={i} className={name === recommendedOption ? 'text-green-700 font-medium' : ''}>
                  {name}
                </li>
              ))
            ) : (
              <li>暂无排名</li>
            )}
          </ol>
        </div>
      </div>

      {/* 关键取舍 */}
      {keyTradeoffs && (
        <div className="mt-4 bg-white border border-brand-100 rounded-xl p-4">
          <div className="text-xs text-brand-500 mb-1">关键取舍</div>
          <p className="text-sm text-brand-700 leading-relaxed">{keyTradeoffs}</p>
        </div>
      )}

      {/* 宏观背景 */}
      {macroContext && (
        <div className="mt-3 bg-white border border-brand-100 rounded-xl p-4">
          <div className="text-xs text-brand-500 mb-1">宏观 / 行业背景</div>
          <p className="text-sm text-brand-700 leading-relaxed">{macroContext}</p>
        </div>
      )}

      {/* 用户适配度 */}
      {userFitAnalysis && (
        <div className="mt-3 bg-white border border-brand-100 rounded-xl p-4">
          <div className="text-xs text-brand-500 mb-1">用户背景与选项匹配度</div>
          <p className="text-sm text-brand-700 leading-relaxed">{userFitAnalysis}</p>
        </div>
      )}
    </div>
  )
}

/**
 * 结果展示组件
 * - 顶部：综合决策摘要（推荐/排名/取舍/宏观/适配度）
 * - 选项卡切换：单选项雷达图 + 时间线 + 综合建议/风险 + 关键假设
 * - 底部：跨选项对比雷达图
 */
export default function ResultDisplay({ results, summary = null, isMockData = false, onReset = () => {} }) {
  const [activeIdx, setActiveIdx] = useState(0)
  const compareCanvasRef = useRef(null)
  const compareChartRef = useRef(null)

  // results 变化时重置 activeIdx
  useEffect(() => {
    if (results.length > 0 && activeIdx >= results.length) {
      setActiveIdx(0)
    }
  }, [results, activeIdx])

  // 跨选项对比雷达图
  useEffect(() => {
    if (!compareCanvasRef.current || results.length === 0) return

    if (compareChartRef.current) {
      compareChartRef.current.destroy()
      compareChartRef.current = null
    }

    const labels = DIMENSION_META.map((d) => d.label)
    const datasets = results.map((opt, idx) => {
      const color = CHART_COLORS[idx % CHART_COLORS.length]
      return {
        label: opt.optionName,
        data: DIMENSION_META.map((d) => opt.dimensions[d.key].score),
        backgroundColor: color.fill,
        borderColor: color.stroke,
        borderWidth: 2,
        pointBackgroundColor: color.stroke,
        pointBorderColor: '#fff',
      }
    })

    compareChartRef.current = new Chart(compareCanvasRef.current, {
      type: 'radar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#2b3d56', font: { size: 12 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label} - ${DIMENSION_META[ctx.dataIndex].label}: ${ctx.parsed.r} 分`,
            },
          },
        },
        scales: {
          r: {
            min: 0,
            max: 10,
            ticks: { stepSize: 2, color: '#9eb1c8', backdropColor: 'transparent' },
            grid: { color: '#cbd6e3' },
            angleLines: { color: '#cbd6e3' },
            pointLabels: { color: '#2b3d56', font: { size: 13 } },
          },
        },
      },
    })

    return () => {
      if (compareChartRef.current) {
        compareChartRef.current.destroy()
        compareChartRef.current = null
      }
    }
  }, [results])

  const active = results[activeIdx]
  const recommended = summary?.recommendedOption

  return (
    <div className="space-y-6 fade-in-up">
      {/* 模拟数据提示 */}
      {isMockData && !isApiKeyConfigured() && (
        <div className="px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm">
          当前展示为<strong>模拟数据</strong>，仅用于演示界面效果。配置 DeepSeek API Key 后将获得真实 AI 分析。
        </div>
      )}

      {/* 综合决策摘要 */}
      <SummaryPanel summary={summary} results={results} />

      {/* 选项卡 */}
      <div className="bg-white rounded-2xl shadow-sm border border-brand-100 overflow-hidden">
        <div className="border-b border-brand-100 flex overflow-x-auto">
          {results.map((opt, idx) => (
            <button
              key={idx}
              onClick={() => setActiveIdx(idx)}
              className={`flex-shrink-0 px-5 py-3 text-sm font-medium transition whitespace-nowrap flex items-center gap-1.5 ${
                idx === activeIdx
                  ? 'text-brand-800 border-b-2 border-brand-800 bg-brand-50'
                  : 'text-brand-400 hover:text-brand-600 hover:bg-brand-50'
              }`}
            >
              {opt.optionName}
              {opt.optionName === recommended && (
                <span className="text-[10px] text-green-600">★</span>
              )}
            </button>
          ))}
        </div>

        <div className="p-6">
          {active && (
            <OptionDetail
              option={active}
              index={activeIdx}
              isRecommended={active.optionName === recommended}
            />
          )}
        </div>
      </div>

      {/* 跨选项对比 */}
      {results.length > 1 && (
        <div className="bg-white rounded-2xl shadow-sm border border-brand-100 p-6 fade-in-up">
          <h3 className="text-lg font-semibold text-brand-800 mb-4">多选项横向对比</h3>
          <div className="relative h-96">
            <canvas ref={compareCanvasRef}></canvas>
          </div>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex justify-center">
        <button
          onClick={onReset}
          className="px-6 py-2.5 bg-white border border-brand-200 text-brand-700 rounded-lg hover:bg-brand-50 transition"
        >
          重新分析
        </button>
      </div>
    </div>
  )
}
