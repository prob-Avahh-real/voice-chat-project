export const STATUS_OK = 'ok';
export const STATUS_PENDING = 'pending';
export const STATUS_ERROR = 'error';

function combineStatuses(statuses) {
  if (statuses.some((s) => s === STATUS_ERROR)) return STATUS_ERROR;
  if (statuses.some((s) => s === STATUS_PENDING)) return STATUS_PENDING;
  return STATUS_OK;
}

export function computeEngineStatus({ companionInit, voiceInit, webSpeechOk, ollamaOk, engine }) {
  const details = [];

  let asr, tts, llm;
  if (engine === 'native') {
    asr = voiceInit?.asrReady ? STATUS_OK : STATUS_PENDING;
    tts = voiceInit?.ttsReady ? STATUS_OK : STATUS_PENDING;
    llm = companionInit?.ok ? STATUS_OK : STATUS_ERROR;
    if (voiceInit?.asrReady === false) { asr = STATUS_ERROR; details.push({ part: 'asr', reason: voiceInit?.reason || 'asr-init-failed' }); }
    if (voiceInit?.ttsReady === false) { tts = STATUS_ERROR; details.push({ part: 'tts', reason: 'tts-init-failed' }); }
    if (!companionInit?.ok) { llm = STATUS_ERROR; details.push({ part: 'llm', reason: companionInit?.reason || 'llm-init-failed' }); }
  } else {
    asr = webSpeechOk ? STATUS_OK : STATUS_ERROR;
    tts = webSpeechOk ? STATUS_OK : STATUS_ERROR;
    llm = ollamaOk ? STATUS_OK : STATUS_ERROR;
    if (!webSpeechOk) { details.push({ part: 'asr', reason: 'no-web-speech' }); details.push({ part: 'tts', reason: 'no-web-speech' }); }
    if (!ollamaOk) { details.push({ part: 'llm', reason: 'network' }); }
  }

  return { asr, tts, llm, details, overall: combineStatuses([asr, tts, llm]) };
}

export function isReady(status) {
  return status && status.overall === STATUS_OK;
}