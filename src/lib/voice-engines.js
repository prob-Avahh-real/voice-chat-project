export function createVoiceBridge({ env, nativeApi, windowObj, config = {} }) {
  const win = windowObj;
  const asrLang = config.asrLang || 'zh-CN';
  function isNative() {
    return !!(env && env.Capacitor && (env.Capacitor.isNativePlatform ? env.Capacitor.isNativePlatform() : true));
  }

  async function initNative() {
    let result;
    try {
      result = await nativeApi.init();
    } catch (e) {
      return { ok: false, reason: 'native-init-error', detail: String(e?.message || e) };
    }
    return result || { ok: false, reason: 'no-result' };
  }

  function nativeStartASR({ onPartial, onFinal }) {
    return new Promise((resolve, reject) => {
      try {
        const listener = nativeApi.addListener('asrText', (e) => {
          if (e.partial && onPartial) onPartial(e.text);
          else if (!e.partial && onFinal) onFinal(e.text);
        });
        nativeApi.asrStart()
          .then((r) => {
            const res = r || {};
            if (res.ok === false) { listener?.remove?.(); reject({ ok: false, reason: res.reason || 'asr-start-failed', detail: res.detail }); return; }
            resolve({ ok: true, cleanup: () => listener?.remove?.() });
          })
          .catch((e) => { listener?.remove?.(); reject({ ok: false, reason: e?.code || 'asr-start-failed', detail: String(e?.message || e) }); });
      } catch (e) {
        reject({ ok: false, reason: 'native-asr-error', detail: String(e?.message || e) });
      }
    });
  }

  async function nativeStopASR() {
    try { await nativeApi.asrStop(); return { ok: true }; }
    catch (e) { return { ok: false, reason: 'asr-stop-failed', detail: String(e) }; }
  }

  async function nativeSpeak(text) {
    try {
      const r = await nativeApi.ttsSpeak({ text });
      const res = r || {};
      return { ok: res.ok !== false, reason: res.reason, detail: res.detail };
    } catch (e) {
      return { ok: false, reason: 'tts-speak-failed', detail: String(e?.message || e) };
    }
  }

  function nativeStopSpeaking() { try { nativeApi.ttsStop(); } catch (e) {} }

  function webInit() {
    const SR = win.SpeechRecognition || win.webkitSpeechRecognition;
    return { ok: true, asrReady: !!SR, ttsReady: !!(win.speechSynthesis), engine: 'web' };
  }

  function webStartASR({ onPartial, onFinal }) {
    const SR = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SR) return Promise.reject({ ok: false, reason: 'no-web-speech' });
    return new Promise((resolve, reject) => {
      try {
        let finalAccum = '';
        let lastFinal = null;
        const rec = new SR();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = asrLang;
        rec.onresult = (event) => {
          let interim = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const r = event.results[i];
            if (r.isFinal) finalAccum += r[0].transcript;
            else interim += r[0].transcript;
          }
          const shown = (finalAccum + interim).trim();
          if (interim) onPartial?.(shown);
          const fin = finalAccum.trim();
          if (fin && fin !== lastFinal) { lastFinal = fin; onFinal?.(fin); }
        };
        rec.onerror = (event) => reject({ ok: false, reason: 'web-speech-error', detail: event.error });
        rec.onend = () => {
          const fin = finalAccum.trim();
          if (fin && fin !== lastFinal) { lastFinal = fin; onFinal?.(fin); }
        };
        rec.start();
        let resolved = false;
        rec.onstart = () => { if (!resolved) { resolved = true; resolve({ ok: true, cleanup: () => { try { rec.stop(); } catch (e) {} } }); } };
        setTimeout(() => { if (!resolved) { resolved = true; resolve({ ok: true, cleanup: () => { try { rec.stop(); } catch (e) {} } }); } }, 1500);
      } catch (e) {
        reject({ ok: false, reason: 'web-speech-error', detail: String(e?.message || e) });
      }
    });
  }

  async function webStopASR() { return { ok: true }; }

  function webSpeak(text, { onEnd } = {}) {
    try {
      win.speechSynthesis.cancel();
      const u = new win.SpeechSynthesisUtterance(text);
      u.rate = 1.05; u.pitch = 1.0;
      const voices = win.speechSynthesis.getVoices();
      const good = voices.find(v => v.lang.startsWith('zh')) ||
                   voices.find(v => v.lang.startsWith('en') && v.name.includes('Premium')) ||
                   voices[0];
      if (good) u.voice = good;
      u.onend = () => onEnd?.();
      u.onerror = () => onEnd?.();
      win.speechSynthesis.speak(u);
      return Promise.resolve({ ok: true });
    } catch (e) {
      return Promise.resolve({ ok: false, reason: 'web-tts-error', detail: String(e?.message || e) });
    }
  }

  function webStopSpeaking() { try { win.speechSynthesis.cancel(); } catch (e) {} }

  const engine = isNative() ? 'native' : 'web';

  return {
    engine,
    get supported() {
      return engine === 'native' ? true : !!(win.SpeechRecognition || win.webkitSpeechRecognition);
    },
    init: engine === 'native' ? initNative : webInit,
    startASR: engine === 'native' ? nativeStartASR : webStartASR,
    stopASR: engine === 'native' ? nativeStopASR : webStopASR,
    speak: engine === 'native' ? nativeSpeak : webSpeak,
    stopSpeaking: engine === 'native' ? nativeStopSpeaking : webStopSpeaking,
  };
}