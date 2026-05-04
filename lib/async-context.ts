import { AsyncLocalStorage } from "async_hooks";

interface UserContext {
  userId: string;
}

export const userContextStorage = new AsyncLocalStorage<UserContext>();

export function getCurrentUserId(): string | undefined {
  return userContextStorage.getStore()?.userId;
}

export function withUserContext<T>(userId: string, fn: () => T): T {
  return userContextStorage.run({ userId }, fn);
}
