# 里程碑 M5：端到端体验闭环（无真机可验收）

状态：完成（51/51 测试绿 + build 过 + dev 预览验证；真机冒烟已完成，见 M3 §9）
日期：2026-08-12
宿主：voice-chat-project（Capacitor Android，appId com.skat.voicechat）
目标设备：小米10S（M2102J2SC / 骁龙870 SM8250-AC / Adreno650 / 8GB RAM）

## 1. 目的

M3（语音链）、M4（端侧 LLM）代码、打包与真机冒烟均已完成（见 M3 §9）。
M5 聚焦**不依赖真机**的端到端体验闭环：在浏览器 dev 环境跑通
「说 → 转写 → 陪伴回复 → 语音播报」全链路，并把 UI 状态/失败/加载打磨到可演示、
可诊断；真机验收项现已完成并归入 Done（见 M3 §9）。

## 2. 现状基线（已核实）

| 层 | 现状 | 引擎 |
|----|------|------|
| ASR | src/voice-bridge.js 双引擎分流 | native=sherpa / web=Web Speech |
| LLM | src/llm-bridge.js 双引擎分流 | native=llama.cpp Qwen3 / web=Ollama |
| TTS | 同 voice-bridge | native=Piper / web=speechSynthesis |
| UI | index.html 单文件，`window.companion` + `window.XiaoManVoice` | — |
| 测试 | 51/51 绿（M3+M4+M5 全量） | — |
| 打包 | ~117MB APK 含 libllama + sherpa .so + 双模型 | — |

缺口（本里程碑要补）：
1. **启动引导/引擎状态指示**：现无「ASR/TTS/LLM 就绪」可见状态，原生 init 慢无反馈。
2. **失败可诊断性 UI**：Ollama 未起、模型缺失、引擎 init 失败 → 只有一次性 status 文本。
3. **端到端演示路径**：浏览器 dev 下无「一键自检 → 全链路可用」入口。
4. **Web 引擎的 ASR 语言**：当前强制 zh-CN，且 Web 引擎下无 TTS 音色确认。

## 3. 方案（体验闭环，策略表驱动）

### 3.1 引擎状态指示器（UI）
- 顶栏加小状态胶囊：`ASR ● TTS ● LLM ●`，三灯：
  - native：由 `companion.init()` + `voice.init()` 结果驱动（asrReady/ttsReady + LLM init）
  - web：检测 Web Speech 可用性 + Ollama 可达性（ping `/api/tags`）
  - 每种灯含 `ok | pending | error` 三态，hover 显示 reason
- 纯展示组件，不侵入对话循环。

### 3.2 启动自检（demo 入口）
- 页面底部「自检」按钮（仅在 web/dev 显示）：顺序跑
  ASR(短句转写)→LLM(一句 persona 回复)→TTS(播报回复)，逐步标注 ✓/✗ + reason。
- 复用现有 `companion.askCompanion` + `voice.*`，不自造推理路径（回归既有管线）。

### 3.3 失败诊断文案（复用 reason）
- 把现有 `（本地引擎没连上：<reason>）` 扩展为映射表：
  | reason | 文案 |
  |--------|------|
  | network / fetch-failed | 本地 Ollama 未启动：`ollama serve` |
  | http-404 | 模型不存在：`ollama pull <model>` |
  | llm-init-failed / tts-not-ready / asr-not-ready | 原生引擎未就绪，见状态灯 |
  | empty-response / llm-chat-failed | 生成失败，重试 |
- 文案映射放 `src/lib/ui-messages.js`（纯函数，可测）。

### 3.4 Web ASR 语言
- webStartASR 的 lang 参数化：优先 zh-CN，允许外部覆盖（`getConfig` 扩展）。

## 4. 接口契约（本里程碑新增）

```ts
// src/lib/ui-messages.js
reasonToMessage(reason: string): string   // 纯函数，reason → 用户文案

// src/lib/engine-status.js（纯逻辑，可测）
computeEngineStatus({ companionInit, voiceInit, webSpeechOk, ollamaOk }):
  { asr: 'ok'|'pending'|'error', tts: ..., llm: ..., details: { reason }[] }
```

## 5. 验收标准（Done）与进度

| # | 标准 | 状态 |
|---|------|------|
| 1 | `npm test` 绿 + build 过 | ✅ 50/50，build 过 |
| 2 | 三灯状态正确反映引擎可用性 | ✅ engine-status 纯逻辑 + UI 胶囊 |
| 3 | 自检按钮跑通 说→转写→回复→播报 | ✅ web/dev 全链路 + 分步 ✓/✗ |
| 4 | 失败路径显示映射文案 | ✅ reasonToMessage + UI 接入 |
| 5 | 真机冒烟（M3/M4 阻塞项） | ✅ 已完成（小米10，见 M3 §9） |

## 6. 未纳入本里程碑（backlog）

- 真机冒烟（M3/M4 阻塞项，需设备）
- 语音唤醒（始终监听 + VAD 判定说话）
- 加载进度条（模型下载/init 分阶段 %）
- 多语言 TTS 音色切换 UI

## 7. 真机回归（2026-08-16，小米10S）

### 7.1 现象
用户报告「点麦克风图标，闪了一下后没反应」。CDP 复现确认：
`BEFORE/AFTER` 状态栏均 `"Tap to speak"`，按钮无 `recording` 类，
无错误文案，logcat 空（`VoicePlugin/AndroidRuntime/Capacitor` 均无输出）。

### 7.2 根因（已确认）
1. **权限首次点击挂起**：权限未授予时，原生 `asrStart` 调
   `requestPermissionForAlias` → MIUI 权限框弹出，但 JS 的
   `await voice.startASR()` 挂起等权限回调，**UI 无任何反馈** →
   「点一下没反应」（logcat 证实权限框弹出 + 授权后 AudioRecord 正常启动）。
2. **asr-not-ready 被吞**：启动后立即点麦克风（ASR 模型未加载完）→ 原生
   `call.reject(..., "asr-not-ready")` → 前端 `.catch` 把 `e.code` 丢掉，
   一律归一化为 `'asr-start-failed'` → 显示误导性文案
   「麦克风不可用，检查权限」。

### 7.3 已落地修复（本轮）
- `src/lib/voice-engines.js`：`.catch` 保留 `e?.code`（CapacitorException.code），
  不再吞成 `asr-start-failed`；detail 用 `e.message`。
- `index.html`：错误分支新增 `asr-not-ready` → 「语音引擎加载中，请稍后再试」。
- 错误分支统一由 `'recording'`（绿=伪装成功）改为 `'error'`（红），
  新增 `.status-line.error` 样式；`mic-permission-denied` 时重置
  `micPermissionGranted` 并提示「请到系统设置中允许录音权限后重试」。
- 新增回归测试：native asrStart reject 透传原生 code。
- `npm test` 52/52 绿；`npm run build` + `cap sync` + `assembleDebug` 通过。

### 7.4 真机验证（2026-08-16 小米10S USB/无线）
- 权限未授予首次点击 → MIUI 权限框弹出，授权后 AudioRecord 正常启动
  （`AudioRecord start()` + `[audioRecordData] 5s` 数据流入）。
- 重启后 ASR 未就绪立即点击 → 显示「语音引擎加载中，请稍后再试」✅
  （修复前误显示「麦克风不可用，检查权限」）。
- 模型就绪后再点击 → `Listening` + `recording` 类 + AudioRecord 启动 ✅

### 7.5 待办/后续
- [ ] 「小满在想」卡住：真机上 LLM（llama.cpp Qwen）无 logcat 输出，需确认
      `askCompanion` 初始化/推理是否正常（独立于本 bug，另查）。
- [ ] 首次点击权限框时 UI 无反馈：考虑在原生侧先 `checkPermissions` 或
      前端给「等待系统授权」提示。

