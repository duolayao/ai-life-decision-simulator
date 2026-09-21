# AI 人生决策模拟器

> AI Life Decision Simulator — 通过 AI 分析不同人生选择的发展轨迹，提供多维度决策参考。

## 功能概览

- **背景信息表单**：年龄、学历、专业、职业、性格、技能
- **多决策选项**：2-5 个候选路径并行分析（如 考研 / 就业 / 出国）
- **AI 多维预测**：1 / 3 / 5 年的能力成长、收入趋势、职业天花板、生活压力、机会成本
- **可视化展示**：单选项雷达图 + 多选项横向对比 + 时间线叙事
- **综合建议与风险提示**：每个选项底部由 AI 给出建议
- **降级方案**：API Key 未配置或调用失败时，使用内置模拟数据展示界面

## 技术栈

| 类型 | 选型 |
| --- | --- |
| 框架 | React 18 + Vite 5 |
| 样式 | TailwindCSS 3（PostCSS 接入） |
| 图表 | Chart.js 4（雷达图） |
| HTTP | 浏览器原生 fetch |
| 部署 | 静态产物，可部署至 Vercel / Netlify / GitHub Pages |

## 本地运行

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 然后编辑 .env 填入真实 API Key（可选，未配置时使用模拟数据）

# 3. 启动开发服务器
npm run dev
# 浏览器访问 http://localhost:5173

# 4. 构建生产产物
npm run build
# 产物在 dist/ 目录

# 5. 本地预览生产构建
npm run preview
```

## 环境变量

在项目根目录创建 `.env` 文件（参考 `.env.example`）：

```text
VITE_DEEPSEEK_API_KEY=sk_your_real_api_key_here
VITE_DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
VITE_DEEPSEEK_MODEL=deepseek-chat
```

- 未配置 `VITE_DEEPSEEK_API_KEY` 时，应用自动切换至模拟数据模式，界面右上角显示「模拟模式」徽章。
- DeepSeek API Key 可在 https://platform.deepseek.com/ 获取。

## 部署说明

### Vercel

```bash
npm i -g vercel
vercel --prod
```

部署后在 Vercel 项目 Settings → Environment Variables 中设置 `VITE_DEEPSEEK_API_KEY` 等变量。

### Netlify

```bash
npm run build
# 将 dist/ 目录拖入 Netlify 面板，或使用 Netlify CLI
npm i -g netlify-cli
netlify deploy --prod --dir=dist
```

在 Netlify 项目 Site settings → Environment variables 中配置环境变量。

### GitHub Pages

```bash
npm run build
# 将 dist/ 内容推送到 gh-pages 分支
```

注意：GitHub Pages 是纯静态托管，环境变量需在构建时（CI 中）注入。

## 项目结构

```
ai-life-decision-simulator/
├── public/
│   └── favicon.svg
├── src/
│   ├── components/
│   │   ├── InputForm.jsx        # 表单组件
│   │   ├── ResultDisplay.jsx    # 结果展示（含雷达图与时间线）
│   │   └── LoadingSpinner.jsx   # 加载状态（骨架屏）
│   ├── utils/
│   │   ├── api.js               # DeepSeek API 封装
│   │   ├── promptBuilder.js     # 提示词构建
│   │   └── mockData.js          # 模拟数据生成器（降级方案）
│   ├── styles/
│   │   └── index.css            # Tailwind 导入与全局样式
│   ├── App.jsx                  # 主应用
│   └── main.jsx                 # 入口
├── index.html
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── .env.example
└── package.json
```

## API 集成说明

- 接口地址：`https://api.deepseek.com/v1/chat/completions`（兼容 OpenAI 格式）
- 模型：`deepseek-chat`
- 温度：0.7
- 最大 tokens：2500
- 返回格式：JSON 数组，每项包含 `optionName`、`dimensions`（5 维度评分+描述）、`overallAdvice`、`riskTip`

## UI 设计

- 极简、理性风格
- 主色：深蓝 `#1a2a3a`
- 背景：浅灰白 `#f5f7fa`
- 字体：系统默认

## 免责声明

本工具的分析结果由 AI 生成，仅供参考，不构成实际人生决策建议。请结合个人实际情况与专业意见综合判断。
