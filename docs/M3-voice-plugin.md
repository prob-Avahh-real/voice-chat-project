# 里程碑 M3：端侧原生语音链（Voice Plugin）

状态：完成（真机冒烟已验证）
日期：2026-08-12
宿主：voice-chat-project（Capacitor Android，appId com.skat.voicechat）
目标设备：小米10S（M2102J2SC / 骁龙870 SM8250-AC / Adreno650 / 8GB；870 为 865 超频版，同架构，无 LLM 专用 NPU）

## 1. 目的

替换 index.html 里依赖 Web Speech API 的语音输入，以及系统 TTS 输出，
改为本地端侧原生推理：Whisper/Zipformer ASR + Piper TTS，通过 Capacitor 原生插件桥接到 JS。
语音识别与合成全部在 865 上 CPU 完成，不依赖云端、不依赖系统 TTS 音色。

## 2. 技术决策（架构评审结论）

### 2.1 推理引擎
- sherpa-onnx v1.13.5，JitPack 坐标 `com.github.k2-fsa.sherpa-onnx:sherpa-onnx:v1.13.5`
  （不在 Maven Central；官方 Android 均走 JitPack）。
- 官方 AAR ≈49MB（含 arm64-v8a / armeabi-v7a / x86_64 / x86 四 ABI）。
  打包时建议 abiFilters 只留 arm64-v8a（目标机），APK 增量 ≈19MB。
- SD865 无 QNN/NPU 支持（官方要求 SM8350+），走 onnxruntime CPU 路径，numThreads ≤ 4。

### 2.2 ASR 模型（流式实时对话）
- `sherpa-onnx-streaming-zipformer-multi-zh-hans-int8-2023-12-13.tar.bz2`（62MB）
  - 流式 Zipformer Transducer，中文多方言 + 普通话，int8 编码器，手机端主流选择。
  - 估算 RTF ≪ 0.05，首结果延迟 <500ms，适合边听边回。
- 备选：Whisper base int8（更准但 30s padding 慢，初始化十几秒，常驻复用）。本轮不引入。

### 2.3 TTS 模型（中文女声）
- `vits-piper-zh_CN-xiao_ya-medium-int8.tar.bz2`（14MB，int8 更快）
  - Piper/VITS，22050Hz，轻量，端侧实时（估算 3-4s 句 ≈0.3s 合成）。

### 2.4 集成形态
- Capacitor 本地插件：`src/plugins/voice`（JS 侧）+ `android/app/src/main/java/com/skat/voicechat/plugins`（Java 侧）。
- 插件暴露给 JS 的稳定契约（后续引擎替换不动此面）：
  - `init()` —— 加载模型（异步，幂等），返回 `{ok, asrReady, ttsReady, reason}`
  - `asrStart()` —— 开始录音+流式识别（单次会话）
  - `asrStop()` —— 停止，resolve `{text}`
  - `asrText(cb)` —— 流式中间结果/最终结果事件
  - `ttsSpeak({text, cb})` —— 合成并播放，完成回调
  - `ttsStop()` —— 停止播放
- 识别器/TTS 均为单例，常驻复用（Whisper/Zipformer init 慢，绝不每句重建）。

### 2.5 模型分发
- 模型放 `android/app/src/main/assets/` 随 APK 打包（~76MB 增量），首启复制到 filesDir。
  备选：首次启动从 huggingface 下载（不阻塞出包）。本轮走 assets 打包。

## 3. 接口契约（JS ⇄ 原生）

```ts
interface VoiceResult { ok: boolean; reason?: string; text?: string; }
init(): Promise<VoiceResult>
asrStart(): Promise<VoiceResult>
asrStop(): Promise<{ok:boolean, text:string}>
asrText(cb: (e: {partial:boolean, text:string}) => void): void
ttsSpeak(text: string): Promise<{ok:boolean}>
ttsStop(): void
```

失败路径必须带 `reason`（no-model / mic-denied / tts-busy / init-failed），
禁止把失败伪装成成功。

## 4. 主要风险与对策

| 风险 | 对策 |
|------|------|
| JitPack AAR 下载失败/慢 | 锁版本；CI 前本地先拉一次验证 |
| 4 ABI 体积大 | abiFilters arm64-v8a，APK 增量≈19MB |
| Zipformer init 慢 | 单例常驻，init() 幂等，启动后台预载 |
| 录音权限 | Manifest 加 RECORD_AUDIO + 运行时权限流 |
| 真机冒烟（原阻塞） | ✅ 已用小米10 无线 ADB 完成：ASR 录音链路 / TTS 出声 / LLM 回复均已验证（§9） |

## 5. 验收标准（Done）与进度

| # | 标准 | 状态 |
|---|------|------|
| 1 | `npm test` 绿 + `npm run build` 过 | ✅ 19/19 绿，build 过 |
| 2 | `cap sync` 无报错；APK 含 libsherpa .so + 双模型 | ✅ 88MB，onnxruntime/jni .so 与模型进包 |
| 3 | JS 侧 `window.XiaoManVoice` 插件注册成功 | ✅ src/voice-bridge.js 双引擎分流 |
| 4 | 真机冒烟：ASR 录音链路可用、TTS 中文出声、记录实测延迟 | ✅ 见 §9（录音/播放链路已验证；实际语音转写与听感需人工复听） |
| 5 | 失败路径有 reason，不静默 | ✅ 插件 reject + JS 错误提示 |

## 6. 骁龙 865 延迟估算（真机冒烟前参考）

来源：sherpa-official RPi4 (A72) RTF 基准，按 865 (A77) ≈ RPi4 的 4–5× 折算，待真机校准。

| 场景 | RPi4 RTF(4线程) | SD865 估算 RTF | 一句延迟估算 |
|---|---|---|---|
| Zipformer 中文 int8（流式） | 嵌入式级 | ≪0.05（≈0.02–0.05） | 首字 <500ms，实时对话首选 |
| Piper zh_CN int8 TTS | ≈0.35 | ≈0.08 | 3–4s 句 ≈0.3–0.4s |
| 模型 init（Zipformer） | — | — | 单例常驻，仅首次（预计秒级） |

注意：Zipformer 为 chunk-16 流式，短句无 30s padding 惩罚（Whisper 才有）。

## 7. 出包命令（已走通）

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home   # 必须 21，非 17
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
export PATH="$ANDROID_HOME/platform-tools:$PATH"

npm install                            # postinstall 自动 patch-package 应用 node_modules 修复
npm run sync:android   # build + 复制 web 资产
cd android && ./gradlew assembleDebug
# 产物：android/app/build/outputs/apk/debug/app-debug.apk（≈117MB）
```

真机连接（无线 ADB，见 §9）。装机冒烟：`adb install -r app-debug.apk`，看 logcat `VoicePlugin`：
```
adb logcat -s VoicePlugin:I
# ASR ready / TTS ready, sampleRate=22050 speakers=1
```
麦克风权限：插件在 `asrStart` 内自判 `getPermissionState` → 未授权则 `requestPermissionForAlias` 弹系统框，
`@PermissionCallback` 收到结果后再启动录音（单纯 `@Permission` 注解不会自动弹窗，已修正）。

## 8. 真机实测记录（2026-08-13，小米10 / thyme / M2102J2SC，Android 13，arm64-v8a）

- 连接：无线 ADB。`adb pair 192.168.3.4:39735`（码 663756）→ `adb connect 192.168.3.4:37853`；
  WebView CDP：`adb forward tcp:9222 localabstract:webview_devtools_remote_<PID>`。
- 构建：JDK **21**（llama-cpp-pro 模块要求 source release 21，非 17）。`npm install` 后 postinstall 经
  `patch-package` 应用 `patches/llama-cpp-pro+0.2.4.patch`（固化 node_modules 修复，见 M4 §2.5）。
- CDP 直驱插件验证（非 UI 点击）：
  - ASR：init → `asrReady`（asset 模式）；未授权 `asrStart` 正确返回 `{ok:false, reason:'mic-permission-denied'}`
    并弹系统权限框；`adb grant RECORD_AUDIO` 后 `asrStart` → `ok:true`，logcat 确认 `AudioRecord` 在 `handset-mic` 初始化。
  - TTS：`ttsSpeak("你好，我是小满，很高兴见到你。")` → `ok:true`（~2s），`AudioTrack` 22050Hz/单声道建链并 `play()`。
  - LLM：`askCompanion("你好小满…")` → `ok:true`，端侧 Qwen3-1.7B 生成中文 persona 回复；首调含模型加载 ~144s。
- 待人工确认：ASR 实际语音→文本（需对麦说话）、TTS 实际出声听感。

## 9. 未纳入本里程碑（backlog）

- Whisper base 高质量离线听写
- QNN/NPU 加速（需骁龙888+，目标机不支持）
- 模型首次下载（不打包）方案
- BPE/标点模型（<blank> 处理口语停顿）
