# 里程碑 M4：端侧 LLM 引擎（llama.cpp + Qwen3-1.7B）

状态：完成（真机冒烟已验证：小米10 上 Qwen3-1.7B 端侧实际回复，见 M3 §9）
日期：2026-08-12
宿主：voice-chat-project（Capacitor Android，appId com.skat.voicechat）
目标设备：小米10S（骁龙870 / Adreno650 / 8GB RAM；870 为 865 超频版，性能略优）

## 1. 目的

填掉 APK 真机上的最后缺口：LLM 目前指向 `http://localhost:11434`（开发机 Ollama），
真机连不上。M4 把 LLM 换为端侧原生推理（llama.cpp），彻底离线可用。

## 2. 技术决策（变更记录：偏离早期选型）

> 变更：早期选型「Gemma 4 E2B QAT + MLC LLM」在 Android 端**无成品**（MLC org 无 gemma-4，
> HF 第三方仅 WebGPU wasm、无 android .so）。按变更控制显式记录：模型换 Qwen3-1.7B，引擎换 llama.cpp。

> 二次变更（2026-08-12，实测）：`llama-cpp-capacitor@0.1.5` 判死（peerDep Cap≥8 与工程 Cap6 冲突、
> 原生层流式桩/no-op）。改用 `llama-cpp-pro@0.2.4`：peerDep `@capacitor/core>=6.0.0` 兼容，
> 预编译 `libllama-cpp-arm64.so`（无需 CMake/NDK 构建）。Android 端 completion 为**同步阻塞返回完整文本**
> （无原生 token 流），对陪伴场景可接受（等完整回复再 TTS）。

### 2.1 引擎
- `llama-cpp-pro@0.2.4`（npm，Capacitor 插件，预编译 arm64 .so）。
  JS 高阶 API：`initLlama({model,n_ctx,n_batch,n_threads,temperature})` → `LlamaContext`
  `completion({messages:[{role,content}], n_predict, temperature})`（内置 chat template 格式化）。
  `releaseContext`/`stopCompletion`/`downloadModel(url,filename)`（下载进 filesDir）。
- 870/865 走 CPU NEON（无 SME/AMX），1–3B Q4 约 8–18 tok/s，实时对话可接受。

### 2.2 模型
- **Qwen3-1.7B Q4_K_M GGUF**（~1GB，单文件），峰值内存 ~3GB（8GB 手机安全余量）。
- 模型放 filesDir（`getModelSearchPaths` 自动搜 `filesDir/<filename>`、`filesDir/Documents/`、
  external files、Downloads；JS 侧 `initLlama({model})` 传文件名即可，插件按 search paths 定位）。
- 备选（质量优先时）：Gemma 3 4B Q4_K_M（~2.5GB，峰值 ~4GB，紧）。本轮不上。

### 2.3 分发
- 模型已下载到 `models/qwen3-1.7b-q4_k_m.gguf`（1.2GB，bartowski imatrix Q4_K_M，
  原始文件 `Qwen_Qwen3-1.7B-Q4_K_M.gguf`，GGUF v3 / qwen3 架构已验证）。
- 上真机：`adb push models/qwen3-1.7b-q4_k_m.gguf /data/local/tmp/ && adb shell run-as com.skat.voicechat cp /data/local/tmp/qwen3-1.7b-q4_k_m.gguf files/`
  （或 App 内 `downloadModel(url, filename)` 到 filesDir）。
- 插件 search paths 自动命中 `filesDir/<filename>`，bridge 传文件名 `qwen3-1.7b-q4_k_m.gguf`。
- 预置 assets 双路径：模型不打包进 APK（113MB 已含 llama.so + sherpa 模型，GGUF 再进包会膨胀）。

### 2.4 真机条件（2026-08-12 实测记录）
- 实测设备：天翼定制华为 TYH631M（麦芒20，LUI-AN00，骁龙4 Gen1，8GB，Android 12）
  已被 ADB 识别（arm64-v8a / SDK 31 满足），但**放弃作为冒烟机**，原因：
  - USB 传输线物理不稳定（枚举时有时无），无法稳定完成 装APK+推模型；
  - 华为系「拔线/锁屏后自动关闭 `adb tcpip` 无线端口」，无线冒烟需保持 USB 常驻，与不稳定线冲突；
  - 运营商定制 ROM 对 adb 有额外限制，不符合 "验证即可 E2E 离线链" 的可重复性要求。
- **结论（已落地，2026-08-13）**：真机冒烟实际用 **小米10S（thyme / M2102J2SC / 骁龙870 SM8250-AC / Android 13）** 经**无线 ADB** 完成，
  ASR 录音链路 + TTS 出声 + LLM(Qwen3-1.7B) 中文回复全验证（详见 M3 §9）。865 与 870 性能相近，满足实时对话。

## 2.5 node_modules 修复与可复现（patch-package）

- 实测 `llama-cpp-pro@0.2.4` 端侧 `init` 抛非致命异常：`modelInfoNative` 硬编码 `/data/data/ai.annadata.llamacpp/files/`
  路径，永远 not found → 把本已成功的 init 判失败。修复：Kotlin 端 `modelInfoNative` 包 try/catch 降级。
- JS 侧 `isLlamaChatSupported / isJinjaSupported` 在 `chatTemplates` 未定义时崩溃 → 加空值守卫
  （`dist/plugin.js` / `dist/esm/index.js`）。
- 三处改动固化于 `patches/llama-cpp-pro+0.2.4.patch`；`package.json` 已加 `"postinstall":"patch-package"`，
  `npm ci` 后自动重应用，避免 node_modules 修复在重装后丢失。

## 3. 接口契约（JS ⇄ 原生，贴近现有 ollama-bridge）

消息构建复用在 `companion-core.buildMessages`（persona/history/user → `[{role,content}]`），
`llm-engines.js` 是**传输层**（只收 messages 数组，不重复拼消息）。

```ts
interface LlmResult { ok: boolean; reason?: string; detail?: string; text?: string; }
createLlmBridge({ env, nativeApi, windowObj, ollama })  // 依赖注入，纯逻辑可测
  engine: 'native' | 'web'      // env.Capacitor.isNativePlatform() 分流
  init({ model, nCtx, nPredict }): Promise<LlmResult>   // native 加载 GGUF（幂等）
  chat(messages, opts): Promise<LlmResult>              // native→completion; web→ollama client
  release(): void                                        // native 释放 context
```

- 壳 `src/llm-bridge.js` 暴露 `window.companion`：`askCompanion(text)`（persona+危机短路+8轮历史）、
  `clearHistory()`、`init()`（native 启动预载）、`getConfig()`。index.html 已切到该桥。
- web/dev fallback：走 Ollama `gemma4:e2b-it-qat`（与 M1 一致），原生不可用时自动回落。
- 失败不伪装：`empty-response`/`llm-init-failed`/`llm-chat-failed` 均带 `reason`+`detail` 透传 UI。

## 4. 主要风险与对策

| 风险 | 对策 | 现状 |
|------|------|------|
| 插件 API 与预期不符 | 先读插件源码，确认加载+chat 方法签名 | ✅ 已核（initLlama/completion/release） |
| 模型下载慢/无网 | 支持预置 assets 与 filesDir 双路径；下载进度回调 | filesDir 路径由插件 search paths 命中；downloadModel 可用 |
| 峰值内存超 8GB | 压 context_window、用 Q4_K_M；实测 logcat 内存 | n_ctx=2048、n_batch=128；真机待测 |
| 865 tok/s 太慢 | 降到 Qwen2.5-1.5B（~1GB）或压 n_ctx | 待真机测 |
| 插件 CMake 编译失败 | 预编译 .so 版本规避 | ✅ llama-cpp-pro 自带 arm64 .so，无需 CMake |
| 工具链升级（JDK21/AGP/Gradle/NDK） | 分步升级逐项验证 | ✅ JDK21+AGP8.7.2(随插件)+Gradle8.11.1 已跑通 |

## 5. 验收标准（Done）

1. `npm test` 绿 + `npm run build` 过 — ✅（40/40 绿；build 过）
2. 插件加载成功（真机/单元 mock），失败带 reason — ✅（llm-engines.test.js 覆盖 init 幂等/异常 reason）
3. cap sync + apk:debug 出包，含 libllama.so — ✅（113MB APK，lib/arm64-v8a/libllama-cpp-arm64.so 已进包）
4. 全量测试覆盖 llm 引擎双路径（native / web-Ollama fallback） — ✅（test/llm-engines.test.js 13 用例）
5. 真机冒烟：Qwen3-1.7B 按「小满」persona 回复 — ✅ 见 M3 §9（小米10，首调含加载 ~144s，推理实时；tok/s 待细测）

## 6. 未纳入本里程碑（backlog）

- Gemma 3 4B 高质档（峰值内存评估后）
- MLC LLM 全构建链（等 Gemma4 官方 Android 支持）
- 模型增量更新 / 多模型切换 UI

## 7. 真机性能实测与 llama-cpp-pro 修复（2026-08-16）

> 文档 §2.1「870/865 CPU 8–18 tok/s」为估算。真机实测（小米10S，Qwen3-1.7B Q4_K_M，
> llama-cpp-pro@0.2.4 预编译 arm64 .so）与估算有偏差，记录如下。

### 7.1 实测吞吐（logcat 时间戳拆解）

| 阶段 | prompt | 耗时 | 速率 |
|------|--------|------|------|
| prefill n_threads=4 | 40 tok | **3.2s** | **12.5 tok/s** |
| prefill n_threads=1 | 40 tok | >6 min | <0.1 tok/s |
| prefill n_threads=4 | 160 tok | 78–143s | 1.1–2.0 tok/s |
| prefill n_threads=8 | 40 tok | 12.9s | 3.1 tok/s |
| 生成（采样循环） | — | ~0.38s/tok | ~2.6 tok/s |

- **prefill 随 token 数超线性退化（≈O(n²)）**：40→160 token（4×）耗时 3.2s→78s（24×）。
  根因是 Qwen3 全 attention 在 CPU 上的 KV-cache 矩阵成本，非配置 bug。
- **n_threads=4 明显优于 1 与 8**（8 超订退化、1 单核）。
- 生成段（EOS 后大量 ID:-1 空 token）日志看似 60+ tok/s 是假象，真实 ~2.6 tok/s。
- **实战对策 = prompt 瘦身，而非调线程**：persona 5 行 + maxHistory 4 + 去 thinking 头，
  目标把常见对话 prompt 压到 ~80 token → prefill <15s。

### 7.2 llama-cpp-pro@0.2.4 三处 patch（patches/llama-cpp-pro+0.2.4.patch）

补丁 4 文件 167 行，均带 `PATCH(xiaoman)` 注释：

1. **`jni.cpp` `n_threads` 未读取（性能 bug，已修）**
   `apply_params_from_jsobject` 只读 `n_ctx/n_batch/n_gpu_layers`，`n_threads` 被静默丢弃
   → 线程恒为默认（真机可能 1 核）。补：读 `n_threads` → `cparams.cpuparams.n_threads` +
   `cpuparams_batch.n_threads`。效果：prefill 提升明显。
2. **`jni.cpp` `string_to_jstring` UTF-8 崩溃（SIGABRT，已修）**
   llama byte token 可拼接出非法 UTF-8 续字节，`NewStringUTF` 直接 abort 进程
   （`input is not valid Modified UTF-8`）。改为手写 UTF-8→UTF-16 解码、非法字节→U+FFFD。
3. **`LlamaCpp.java` completion 同步阻塞 Capacitor bridge（已修）**
   `completionNative` 在主线程阻塞跑完整个生成，期间所有其他插件调用（release/init/eval）
   排队数分钟。改为 `new Thread` + 静态 `chatLock` 串行化，主桥立即返回。
   验证：completion 运行 5s 后 `getConfig()` 即时返回（修复前会排队到生成结束）。
4. **`LlamaCpp.java` modelInfo 容错 + `dist/` 两处 chatTemplates 空值守卫**
   模型在用户目录而非包内时 modelInfoNative 抛错破坏成功 init → try/catch non-fatal。

- 真机验证：修复后多轮中文对话零崩溃，bridge 不再被长生成锁死。
- ⚠️ patch 重建注意：`npx patch-package llama-cpp-pro` 会用 npm 干净包 + 本地 node_modules 比对，
  但 llama-cpp-pro 构建会产生 `android/.cxx/`、`android/build/` 残留进 diff。
  重建后必须裁剪：仅留 `src/main/...`、`dist/...` 4 个源文件（脚本见仓库 tools，或 rstrip 掉 `.cxx/`、`build/` 段）。

### 7.3 待办（backlog）

- prompt 瘦身落地后重新计时（常见对话 ≤80 token → prefill <15s）
- n_threads 最优值自动化 A/B（脚本化，避免手动多次轮番）
- 更长 prompt（>400 token，多轮长历史）是否触发 context shift / KV 退化再测
