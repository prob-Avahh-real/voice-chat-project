import { registerPlugin } from '@capacitor/core';

const Voice = registerPlugin('Voice');

export default Voice;
export function voiceInit() {
  return Voice.init();
}
export function asrStart() {
  return Voice.asrStart();
}
export function asrStop() {
  return Voice.asrStop();
}
export function ttsSpeak(text) {
  return Voice.ttsSpeak({ text });
}
export function ttsStop() {
  return Voice.ttsStop();
}
export function onAsrText(handler) {
  return Voice.addListener('asrText', handler);
}