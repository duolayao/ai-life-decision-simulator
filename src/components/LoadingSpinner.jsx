import React from 'react'
import { isApiKeyConfigured } from '../utils/api'

// 诊断信息：显示当前运行时参数，方便确认浏览器加载的是最新代码
// 仅在 DEV 模式下显示
const IS_DEV = Boolean(import.meta.env && import.meta.env.DEV)
const DIAGNOSTIC_INFO = IS_DEV ? {
  model: import.meta.env.VITE_DEEPSEEK_MODEL || '(默认)',
  maxTokens: '12000',
  temperature: '0.3',
  keyConfigured: isApiKeyConfigured(),
} : null

/**
 * 加载状态组件
 * 支持两种模式：
 * - fullPage：全页加载（带骨架屏）
 * - inline：行内加载（带 Spinner）
 */
export default function LoadingSpinner({ fullPage = false, message = 'AI 正在分析中...' }) {
  if (fullPage) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-brand-100 p-8 fade-in-up">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-5 h-5 rounded-full border-2 border-brand-200 border-t-brand-800 animate-spin"></div>
          <span className="text-brand-700 font-medium">{message}</span>
        </div>

        {/* DEV 模式诊断信息 */}
        {DIAGNOSTIC_INFO && (
          <div className="mb-6 px-3 py-2 rounded-lg bg-brand-50 border border-brand-100 text-xs text-brand-600 font-mono">
            <div>⚙ DEV 诊断 · model: <span className="font-semibold">{DIAGNOSTIC_INFO.model}</span> | max_tokens: <span className="font-semibold">{DIAGNOSTIC_INFO.maxTokens}</span> | temp: <span className="font-semibold">{DIAGNOSTIC_INFO.temperature}</span></div>
            <div>⚙ API Key: <span className={DIAGNOSTIC_INFO.keyConfigured ? 'text-green-600' : 'text-red-600'}>{DIAGNOSTIC_INFO.keyConfigured ? '已配置' : '未配置'}</span></div>
          </div>
        )}

        {/* 骨架屏：模拟雷达图与时间线 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="skeleton h-4 w-3/4 rounded"></div>
            <div className="skeleton h-48 w-full rounded-xl"></div>
          </div>
          <div className="space-y-3">
            <div className="skeleton h-4 w-1/2 rounded"></div>
            <div className="skeleton h-24 w-full rounded-xl"></div>
            <div className="skeleton h-24 w-full rounded-xl"></div>
            <div className="skeleton h-24 w-full rounded-xl"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="inline-flex items-center gap-2 text-brand-600">
      <div className="w-4 h-4 rounded-full border-2 border-brand-200 border-t-brand-800 animate-spin"></div>
      <span className="text-sm">{message}</span>
    </div>
  )
}
