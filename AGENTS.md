# voice-chat-project

Capacitor Android appId: `com.skat.voicechat` appName: 语音聊天 webDir: `dist` npm install npm run sync:android npm run apk:debug 穿戴输入：按用途未要求则不加（本脚手架仅移动端）。

## 用途与 Target 判定

语音聊天原型

- 移动端：需要
- 智能硬件：可选（可搁置）

## 目标平台

| 平台 | 方式 | 产出 |
|------|------|------|
| 🤖 Android | Capacitor → Gradle | APK |
| 🍎 iOS | Capacitor（若已加 ios/） | IPA |
| 智能硬件 | 可选（非当前里程碑硬门槛） | 戒指/手杖/手表 |

## 技术栈信号

- 检测到：android, capacitor, node

## 命令

```bash
npm install
npm run build
npm run dev
npm run sync:android
npm run apk:debug
```

## 同步说明

原生工程变更后按各栈惯例同步（`cap sync` / `flutter build` / Gradle）。

## 助手约束

- Loop：先定可验证 Done 与停止条件；每切片过验证环；失败回灌；详见 docs/LOOP_ENGINEERING.md
- Harness：遵循根 AGENTS「Harness Engineering」；Guide=本文件，Sensor=测试/CI；同类失误二次须沉淀规则或测试（棘轮）。详见 docs/HARNESS_ENGINEERING.md
- 遵循仓库根 `AGENTS.md`：通用性/扩展性、分阶段里程碑、默认双 Target（**仅当用途适合**）
- 可选 Target 未做时可搁置；不要为不适用形态硬加 APK/穿戴
- 改动保持聚焦；公共逻辑抽到 shared/`tools/`，禁止静默失败

## 验证环 / Done

```bash
npm install
npm test          # 若有
npm run build     # 或 build:web
npx cap sync android   # 若有 android/
# 可选：JAVA_HOME=…/openjdk@21 npm run apk:debug   # 必须 21（llama-cpp-pro 要求 source release 21），非 17
```

**Done 示例**：测试通过（若有）+ web 产物进 `www/`/`dist/` + `cap sync` 无报错。可选穿戴未做可搁置，不纳入强制 Done。

## 已知限制（诚实记录）

- `npm test` 当前 55/58：三个 APK 内容验收测试（`test/voice-plugin.test.js` 的「debug APK 已构建 / 含 sherpa-onnx .so / 含 ASR+TTS 模型」）需要先出 APK。
- APK 构建链未在本机打通，阻塞点是**环境**而非代码：
  1. `dl.google.com` 直连超时；已用 `~/.gradle/init.gradle`（阿里云镜像）+ `~/.gradle/gradle.properties`（显式代理 127.0.0.1:7897）解决 AGP/依赖解析。
  2. **NDK 27.0.12077973 未安装**（llama-cpp-pro 原生编译必需）；需 `sdkmanager "ndk;27.0.12077973"`（约 1GB+）。
  3. `models/`（ASR/TTS 模型）为空且 gitignore，仓库内**无模型下载脚本**——模型来源尚未解决。
- 决策（2026-10-12）：APK 真机验收**后置**，接受 55/58。解封条件：装 NDK + 解决 sherpa-onnx(jitpack) 与模型文件下载。
