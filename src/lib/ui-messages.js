const MESSAGES = {
  'network': '本地引擎没连上：请先运行 `ollama serve`',
  'fetch-failed': '本地引擎没连上：请先运行 `ollama serve`',
  'timeout': '本地引擎响应超时，重试一下？',
  'http-404': '模型不存在：先 `ollama pull <model>`',
  'http-500': '本地引擎报错（500），看 Ollama 日志',
  'http-400': '请求参数有误（400），看 Ollama 日志',
  'empty-response': '引擎没生成内容，重试一下？',
  'bad-json': '引擎返回异常数据，重试一下？',
  'llm-init-failed': '端侧模型加载失败，看状态灯与日志',
  'llm-chat-failed': '端侧生成失败，重试一下？',
  'asr-not-ready': '语音识别未就绪，等模型加载完成',
  'asr-start-failed': '麦克风不可用：检查录音权限',
  'mic-init-failed': '麦克风初始化失败，重试一下？',
  'mic-permission-denied': '麦克风权限被拒绝：请在系统设置里开启录音权限',
  'tts-not-ready': '语音合成未就绪，等模型加载完成',
  'tts-speak-failed': '语音合成失败，重试一下？',
  'tts-failed': '语音合成失败，重试一下？',
  'no-web-speech': '浏览器不支持 Web Speech（用 Chrome/Edge）',
  'no-fetch-impl': '当前环境不支持网络请求',
  'unknown': '出了点问题，重试一下？',
};

export function reasonToMessage(reason) {
  if (!reason) return MESSAGES['unknown'];
  const normalized = String(reason).toLowerCase();
  if (MESSAGES[normalized]) return MESSAGES[normalized];
  if (normalized.startsWith('http-')) {
    return `本地引擎返回 HTTP ${reason.replace('http-', '')}，看 Ollama 日志`;
  }
  return MESSAGES['unknown'];
}