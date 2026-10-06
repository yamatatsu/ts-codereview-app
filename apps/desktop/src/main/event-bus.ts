import { EventEmitter } from 'node:events';

import type { ServerEvent } from '../shared/events';

/** main 内の型付きイベントバス。SSE で renderer に配信する */
export class EventBus {
  readonly #emitter = new EventEmitter();

  constructor() {
    this.#emitter.setMaxListeners(50);
  }

  emit(event: ServerEvent): void {
    this.#emitter.emit('event', event);
  }

  subscribe(listener: (event: ServerEvent) => void): () => void {
    this.#emitter.on('event', listener);
    return () => this.#emitter.off('event', listener);
  }
}
