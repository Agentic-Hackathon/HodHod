import type { Action } from "../data/types";
const subscribers = new Set<(action: Action) => void>();
export const uiEvents = {
  emit(action: Action) {
    subscribers.forEach((fn) => fn(action));
  },
  subscribe(fn: (action: Action) => void) {
    subscribers.add(fn);
    return () => {
      subscribers.delete(fn);
    };
  },
};
