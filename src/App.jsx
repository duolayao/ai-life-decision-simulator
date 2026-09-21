import React, { useState } from 'react'
import InputForm from './components/InputForm.jsx'
import ResultDisplay from './components/ResultDisplay.jsx'
import LoadingSpinner from './components/LoadingSpinner.jsx'
import { analyzeDecisions, isApiKeyConfigured } from './utils/api.js'
import { generateMockResults, simulateDelay } from './utils/mockData.js'

// 应用阶段：input（输入）-> loading（加载）-> result（结果）
const STAGE = {
  INPUT: 'input',
  LOADING: 'loading',
  RESULT: 'result',
}

export default function App() {
  const [stage, setStage] = useState(STAGE.INPUT)
  const [results, setResults] = useState([])
  const [summary, setSummary] = useState(null)
  const [isMock, setIsMock] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const apiReady = isApiKeyConfigured()

  // 提交分析
  const handleSubmit = async (userInfo, options) => {
    setErrorMsg('')
    setStage(STAGE.LOADING)
    setResults([])
    setSummary(null)
    setIsMock(false)

    try {
      // 尝试调用真实 API
      const data = await analyzeDecisions(userInfo, options)
      setResults(data.options || [])
      setSummary(data.summary || null)
      setIsMock(false)
    } catch (err) {
      // 降级：API Key 未配置或调用失败时，使用模拟数据
      if (err.message === 'API_KEY_NOT_CONFIGURED') {
        // 静默降级到模拟数据，不展示错误
        await simulateDelay(800)
        const mock = generateMockResults(options)
        setResults(mock.options)
        setSummary(mock.summary)
        setIsMock(true)
      } else {
        // API 调用失败：展示错误并降级到模拟数据
        setErrorMsg(`AI 接口调用失败：${err.message}。已为您切换至模拟数据展示，请稍后重试或检查 API Key。`)
        await simulateDelay(600)
        const mock = generateMockResults(options)
        setResults(mock.options)
        setSummary(mock.summary)
        setIsMock(true)
      }
    } finally {
      setStage(STAGE.RESULT)
    }
  }

  // 重置回输入页
  const handleReset = () => {
    setStage(STAGE.INPUT)
    setResults([])
    setSummary(null)
    setIsMock(false)
    setErrorMsg('')
  }

  return (
    <div className="min-h-full">
      {/* 顶部导航 */}
      <header className="bg-brand-800 text-white shadow-md">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-lg">
              🧭
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-semibold leading-tight">AI 人生决策模拟器</h1>
              <p className="text-xs text-brand-200">AI Life Decision Simulator</p>
            </div>
          </div>
          <div className="text-xs">
            {apiReady ? (
              <span className="px-2.5 py-1 rounded-full bg-green-500/20 text-green-100 border border-green-400/30">
                ● API 已连接
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-100 border border-amber-400/30">
                ● 模拟模式
              </span>
            )}
          </div>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* 错误提示条 */}
        {errorMsg && stage === STAGE.RESULT && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm fade-in-up">
            {errorMsg}
          </div>
        )}

        {stage === STAGE.INPUT && (
          <div className="space-y-6">
            <div className="text-center mb-2 fade-in-up">
              <h2 className="text-2xl md:text-3xl font-bold text-brand-800 mb-2">
                用 AI 看清不同人生选择的发展轨迹
              </h2>
              <p className="text-brand-500 text-sm md:text-base">
                填写您的背景与候选决策，AI 将从能力、收入、职业、压力、机会成本五个维度，
                给出带评分理由、置信度与关键假设的 1 / 3 / 5 年量化预测，并在最后给出推荐选项与排名。
              </p>
            </div>
            <InputForm onSubmit={handleSubmit} apiReady={apiReady} />
          </div>
        )}

        {stage === STAGE.LOADING && (
          <LoadingSpinner fullPage message="AI 正在分析您的决策选项（含思维链、量化预测与关键假设）..." />
        )}

        {stage === STAGE.RESULT && results.length > 0 && (
          <ResultDisplay results={results} summary={summary} isMockData={isMock} onReset={handleReset} />
        )}
      </main>

      {/* 页脚 */}
      <footer className="max-w-5xl mx-auto px-4 py-6 text-center text-xs text-brand-400 border-t border-brand-100 mt-8">
        <p>本工具分析结果由 AI 生成，仅供参考，不构成实际决策建议。</p>
        <p className="mt-1">Powered by DeepSeek · React + Vite + TailwindCSS + Chart.js</p>
      </footer>
    </div>
  )
}
