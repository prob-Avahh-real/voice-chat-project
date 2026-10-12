#!/bin/bash
# 真机冒烟：小米10 (骁龙865) — 语音链 M3 验收
# 用法: bash tools/smoke-voice.sh
set -uo pipefail

export ANDROID_HOME="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
export PATH="$ANDROID_HOME/platform-tools:$PATH"
APK="android/app/build/outputs/apk/debug/app-debug.apk"
PROJ="$(cd "$(dirname "$0")/.." && pwd)"
APK="$PROJ/$APK"

step() { printf '\n[smoke] %s\n' "$1"; }

if ! adb devices | grep -q $'\tdevice$'; then
  echo "[smoke] ✗ 未检测到已授权设备。请：插 USB → 开 USB 调试 → 授权弹窗点允许。"
  adb devices
  exit 1
fi

step "1/5 安装 APK"
adb install -r "$APK" || { echo "[smoke] ✗ 安装失败"; exit 1; }
echo "[smoke] ✓ 安装完成"

step "2/5 启动应用 + 清日志"
adb logcat -c
adb shell am force-stop com.skat.voicechat
adb shell monkey -p com.skat.voicechat 1 >/dev/null 2>&1
sleep 3

step "3/5 检查 VoicePlugin 初始化（模型加载）"
adb logcat -s VoicePlugin:V -d | tail -20

step "4/5 检查崩溃/ANR"
adb logcat -d | grep -E "FATAL|AndroidRuntime" | tail -5 || echo "[smoke] ✓ 无崩溃"

step "5/5 汇总"
echo "[smoke] 完成。手动验证：
  1. 点麦克风说话 → 应出现流式中文字幕（partial）→ 松手后完整转写
  2. 等小满回复 → 应听到中文女声（xiao_ya）
  3. 记录：ASR 首字延迟 / 整句延迟 / TTS 音质"
