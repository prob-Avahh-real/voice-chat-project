import { reasonToMessage } from './lib/ui-messages.js';
import { computeEngineStatus } from './lib/engine-status.js';

if (typeof window !== 'undefined') {
  window.xmUi = { reasonToMessage, computeEngineStatus };
}
