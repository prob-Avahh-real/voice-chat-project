package com.skat.voicechat.plugins;

import android.Manifest;
import android.content.Context;
import android.content.res.AssetManager;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.AudioTrack;
import android.media.MediaRecorder;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.k2fsa.sherpa.onnx.GeneratedAudio;
import com.k2fsa.sherpa.onnx.OfflineTts;
import com.k2fsa.sherpa.onnx.OfflineTtsConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsVitsModelConfig;
import com.k2fsa.sherpa.onnx.OnlineModelConfig;
import com.k2fsa.sherpa.onnx.OnlineRecognizer;
import com.k2fsa.sherpa.onnx.OnlineRecognizerConfig;
import com.k2fsa.sherpa.onnx.OnlineStream;
import com.k2fsa.sherpa.onnx.OnlineTransducerModelConfig;

import java.io.File;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(
    name = "Voice",
    permissions = {
        @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO })
    }
)
public class VoicePlugin extends Plugin {
  private static final String TAG = "VoicePlugin";

  private static final int SAMPLE_RATE = 16000;
  private static final int CHUNK = 320; // 20ms @16k

  private OnlineRecognizer recognizer;
  private OfflineTts tts;
  private volatile boolean asrReady;
  private volatile boolean ttsReady;

  private AudioRecord recorder;
  private volatile boolean recording;
  private ExecutorService io = Executors.newSingleThreadExecutor();

  private synchronized void stopRecordingThread() {}

  @PluginMethod
  public void init(PluginCall call) {
    io.execute(() -> {
      try {
        JSObject ret = new JSObject();
        ret.put("ok", true);
        ret.put("asrReady", loadAsr());
        ret.put("ttsReady", loadTts());
        ret.put("modelsDir", getActivity().getFilesDir().getAbsolutePath() + "/");
        if (!ret.getBoolean("asrReady") && !ret.getBoolean("ttsReady")) {
          ret.put("ok", false);
          ret.put("reason", "init-failed");
        }
        call.resolve(ret);
      } catch (Throwable t) {
        Log.e(TAG, "init failed", t);
        JSObject ret = new JSObject();
        ret.put("ok", false);
        ret.put("reason", "init-failed");
        ret.put("detail", String.valueOf(t.getMessage()));
        call.resolve(ret);
      }
    });
  }

  private AssetManager assetManager() {
    return getActivity().getAssets();
  }

  private static final String ASR_ASSET_DIR = "models/asr/zipformer";
  private static final String TTS_ASSET_DIR = "models/tts/piper";

  private boolean loadAsr() {
    try {
      String encoder = ASR_ASSET_DIR + "/encoder-epoch-20-avg-1-chunk-16-left-128.int8.onnx";
      String decoder = ASR_ASSET_DIR + "/decoder-epoch-20-avg-1-chunk-16-left-128.onnx";
      String joiner = ASR_ASSET_DIR + "/joiner-epoch-20-avg-1-chunk-16-left-128.int8.onnx";
      String tokens = ASR_ASSET_DIR + "/tokens.txt";

      OnlineTransducerModelConfig transducer = new OnlineTransducerModelConfig();
      transducer.setEncoder(encoder);
      transducer.setDecoder(decoder);
      transducer.setJoiner(joiner);

      OnlineModelConfig modelConfig = new OnlineModelConfig();
      modelConfig.setTransducer(transducer);
      modelConfig.setTokens(tokens);
      modelConfig.setNumThreads(4);

      OnlineRecognizerConfig config = new OnlineRecognizerConfig();
      config.setModelConfig(modelConfig);
      config.setDecodingMethod("greedy_search");

      recognizer = new OnlineRecognizer(assetManager(), config);
      asrReady = true;
      Log.i(TAG, "ASR ready (asset mode)");
      return true;
    } catch (Throwable t) {
      Log.e(TAG, "ASR load failed", t);
      asrReady = false;
      return false;
    }
  }

  private boolean loadTts() {
    try {
      String model = TTS_ASSET_DIR + "/zh_CN-xiao_ya-medium.onnx";
      String tokens = TTS_ASSET_DIR + "/tokens.txt";
      String lexicon = TTS_ASSET_DIR + "/lexicon.txt";
      String ruleFsts = TTS_ASSET_DIR + "/phone.fst" + ","
          + TTS_ASSET_DIR + "/date.fst" + ","
          + TTS_ASSET_DIR + "/number.fst";

      OfflineTtsVitsModelConfig vits = new OfflineTtsVitsModelConfig();
      vits.setModel(model);
      vits.setTokens(tokens);
      vits.setLexicon(lexicon);

      OfflineTtsModelConfig modelConfig = new OfflineTtsModelConfig();
      modelConfig.setVits(vits);
      modelConfig.setNumThreads(4);

      OfflineTtsConfig config = new OfflineTtsConfig();
      config.setModel(modelConfig);
      config.setRuleFsts(ruleFsts);

      tts = new OfflineTts(assetManager(), config);
      ttsReady = true;
      Log.i(TAG, "TTS ready (asset mode), sampleRate=" + tts.sampleRate() + " speakers=" + tts.numSpeakers());
      return true;
    } catch (Throwable t) {
      Log.e(TAG, "TTS load failed", t);
      ttsReady = false;
      return false;
    }
  }

  @PluginMethod
  public void asrStart(PluginCall call) {
    if (!asrReady || recognizer == null) {
      call.reject("ASR not ready", "asr-not-ready");
      return;
    }
    if (recording) {
      call.reject("already recording", "recording");
      return;
    }
    if (getPermissionState("microphone") != PermissionState.GRANTED) {
      requestPermissionForAlias("microphone", call, "microphonePermissionCallback");
      return;
    }
    startAsrInternal(call);
  }

  private void startAsrInternal(PluginCall call) {
    int minBuf = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
    recorder = new AudioRecord(MediaRecorder.AudioSource.MIC, SAMPLE_RATE,
        AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, Math.max(minBuf, CHUNK * 4));
    if (recorder.getState() != AudioRecord.STATE_INITIALIZED) {
      call.reject("mic init failed", "mic-init-failed");
      recorder.release();
      recorder = null;
      return;
    }
    recording = true;
    OnlineStream stream = recognizer.createStream("");
    recorder.startRecording();

    JSObject ret = new JSObject();
    ret.put("ok", true);
    call.resolve(ret);

    io.execute(() -> {
      short[] buf = new short[CHUNK];
      StringBuilder lastPartial = new StringBuilder();
      try {
        while (recording) {
          int n = recorder.read(buf, 0, CHUNK);
          if (n <= 0) continue;
          float[] fbuf = new float[n];
          for (int i = 0; i < n; i++) fbuf[i] = buf[i] / 32768.0f;
          stream.acceptWaveform(fbuf, SAMPLE_RATE);
          while (recognizer.isReady(stream)) {
            recognizer.decode(stream);
          }
          String text = recognizer.getResult(stream).getText().trim();
          if (text.length() > 0 && !text.equals(lastPartial.toString())) {
            lastPartial.setLength(0);
            lastPartial.append(text);
            notifyListener("asrText", "partial", text);
          }
        }
        while (recognizer.isReady(stream)) {
          recognizer.decode(stream);
        }
        String finalText = recognizer.getResult(stream).getText().trim();
        stream.release();
        lastPartial.setLength(0);
        notifyListener("asrText", "final", finalText);
      } catch (Throwable t) {
        Log.e(TAG, "asr loop failed", t);
      } finally {
        try { recorder.stop(); } catch (Throwable ignored) {}
        recorder.release();
        recorder = null;
      }
    });
  }

  @PermissionCallback
  private void microphonePermissionCallback(PluginCall call) {
    if (getPermissionState("microphone") == PermissionState.GRANTED) {
      startAsrInternal(call);
      return;
    }
    JSObject ret = new JSObject();
    ret.put("ok", false);
    ret.put("reason", "mic-permission-denied");
    call.resolve(ret);
  }

  @PluginMethod
  public void asrStop(PluginCall call) {
    recording = false;
    JSObject ret = new JSObject();
    ret.put("ok", true);
    call.resolve(ret);
  }

  @PluginMethod
  public void ttsSpeak(PluginCall call) {
    String text = call.getString("text");
    if (text == null || text.trim().isEmpty()) {
      call.reject("empty text", "empty-text");
      return;
    }
    if (!ttsReady || tts == null) {
      call.reject("TTS not ready", "tts-not-ready");
      return;
    }
    AudioManager am = (AudioManager) getActivity().getSystemService(Context.AUDIO_SERVICE);
    if (am != null) am.setMode(AudioManager.MODE_NORMAL);
    io.execute(() -> {
      try {
        GeneratedAudio audio = tts.generate(text.trim(), 0, 1.0f);
        float[] samples = audio.getSamples();
        int sr = audio.getSampleRate();
        short[] pcm = new short[samples.length];
        for (int i = 0; i < samples.length; i++) {
          float s = samples[i];
          if (s > 1.0f) s = 1.0f;
          else if (s < -1.0f) s = -1.0f;
          pcm[i] = (short) (s * Short.MAX_VALUE);
        }
        playPcm(pcm, sr);
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
      } catch (Throwable t) {
        Log.e(TAG, "tts failed", t);
        JSObject ret = new JSObject();
        ret.put("ok", false);
        ret.put("reason", "tts-failed");
        ret.put("detail", String.valueOf(t.getMessage() == null ? t : t.getMessage()));
        call.resolve(ret);
      }
    });
  }

  private void playPcm(short[] pcm, int sr) {
    stopPlayback();
    AudioTrack track = new AudioTrack.Builder()
        .setAudioFormat(new AudioFormat.Builder()
            .setSampleRate(sr)
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
            .build())
        .setBufferSizeInBytes(Math.max(pcm.length * 2, 4096))
        .setTransferMode(AudioTrack.MODE_STATIC)
        .build();
    if (track.getState() != AudioTrack.STATE_INITIALIZED) {
      track.release();
      return;
    }
    track.write(pcm, 0, pcm.length);
    lastTrack = track;
    track.setNotificationMarkerPosition(pcm.length);
    track.setPlaybackPositionUpdateListener(new AudioTrack.OnPlaybackPositionUpdateListener() {
      @Override public void onMarkerReached(AudioTrack t) {
        try { t.stop(); t.release(); } catch (Throwable ignored) {}
        if (lastTrack == t) lastTrack = null;
      }
      @Override public void onPeriodicNotification(AudioTrack t) {}
    });
    track.play();
  }

  private AudioTrack lastTrack;

  private void stopPlayback() {
    if (lastTrack != null) {
      try { lastTrack.stop(); lastTrack.release(); } catch (Throwable ignored) {}
      lastTrack = null;
    }
  }

  @PluginMethod
  public void ttsStop(PluginCall call) {
    stopPlayback();
    JSObject ret = new JSObject();
    ret.put("ok", true);
    call.resolve(ret);
  }

  private void notifyListener(String eventName, String type, String text) {
    JSObject ret = new JSObject();
    ret.put("partial", type.equals("partial"));
    ret.put("text", text);
    notifyListeners(eventName, ret);
  }
}