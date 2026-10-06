import type { ServerEvent } from '../../shared/events';
import { API_ORIGIN } from './api';

type Listener = (event: ServerEvent) => void;
const listeners = new Set<Listener>();
let started = false;

/** SSE（app://tsugi/api/events）を fetch のストリームで読む。切断されたら再接続する */
const connect = async (): Promise<void> => {
  for (;;) {
    try {
      const response = await fetch(`${API_ORIGIN}/api/events`);
      const reader = response.body?.getReader();
      if (!reader) throw new Error('no body');
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sep: number;
        while ((sep = buffer.indexOf('\n\n')) >= 0) {
          const chunk = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          if (/^event: (ping|ready)/m.test(chunk)) continue;
          const data = chunk
            .split('\n')
            .filter((l) => l.startsWith('data:'))
            .map((l) => l.slice(5).trimStart())
            .join('\n');
          if (!data) continue;
          try {
            const event = JSON.parse(data) as ServerEvent;
            for (const listener of listeners) listener(event);
          } catch {
            // 壊れたイベントは無視する
          }
        }
      }
    } catch {
      // 接続できなければ少し待って再接続する
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
};

export const subscribeEvents = (listener: Listener): (() => void) => {
  listeners.add(listener);
  if (!started) {
    started = true;
    void connect();
  }
  return () => listeners.delete(listener);
};
