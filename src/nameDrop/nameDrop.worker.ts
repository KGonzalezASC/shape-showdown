/// <reference lib="webworker" />

import { createNameDropPlan } from './nameDrop';
import { getPrebakedNameDropPlan } from './nameDropPrebaked';

declare const self: DedicatedWorkerGlobalScope;

self.addEventListener('message', (event: MessageEvent<string>) => {
  self.postMessage(getPrebakedNameDropPlan(event.data) ?? createNameDropPlan(event.data));
});

export {};
