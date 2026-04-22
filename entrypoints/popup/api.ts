import type {
  ProxyStatus,
  RuntimeErrorResponse,
  RuntimeMessage,
  RuntimeMessageAction,
  RuntimeMessageByAction,
  RuntimeResponseByAction,
} from "../shared/messages";

export function sendMessage<A extends RuntimeMessageAction>(
  message: RuntimeMessageByAction<A>
): Promise<RuntimeResponseByAction<A>> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message as RuntimeMessage, (response: RuntimeResponseByAction<A> | undefined) => {
      if (chrome.runtime.lastError) {
        resolve({
          success: false,
          error: chrome.runtime.lastError.message || "Message channel failed",
        } as RuntimeResponseByAction<A>);
        return;
      }

      if (response) {
        resolve(response);
        return;
      }

      resolve({
        success: false,
        error: "No response from background",
      } as RuntimeResponseByAction<A>);
    });
  });
}

export function isRuntimeError(response: RuntimeErrorResponse | ProxyStatus | { success: true }): response is RuntimeErrorResponse {
  return "success" in response && response.success === false;
}

export function storageGet(keys: string | string[]): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (items) => {
      resolve(items as Record<string, unknown>);
    });
  });
}

export function storageSet(data: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => chrome.storage.local.set(data, () => resolve()));
}
