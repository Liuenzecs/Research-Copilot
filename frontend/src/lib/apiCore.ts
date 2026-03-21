import { getApiBase } from "./runtime";

function buildConnectionError(message: string) {
  return `无法连接后端服务：${getApiBase()}。请确认桌面后端已启动，或开发环境中的 VITE_API_BASE 配置正确。原始错误：${message}`;
}

function buildRequestError(status: number, message: string) {
  return `接口请求失败（${status}）：${message}`;
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${getApiBase()}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      ...init,
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    const message = error instanceof Error ? error.message : "未知网络错误";
    throw new Error(buildConnectionError(message));
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(buildRequestError(response.status, message));
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
}

export async function streamNdjson(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    signal?: AbortSignal;
    onEvent: (event: Record<string, unknown>) => void;
  },
) {
  let response: Response;
  try {
    response = await fetch(`${getApiBase()}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return;
    }
    const message = error instanceof Error ? error.message : "未知网络错误";
    throw new Error(buildConnectionError(message));
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(buildRequestError(response.status, message));
  }

  if (!response.body) {
    throw new Error("当前环境未返回可读取的流式响应。");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) {
        options.onEvent(JSON.parse(line) as Record<string, unknown>);
      }
      newlineIndex = buffer.indexOf("\n");
    }

    if (done) {
      break;
    }
  }

  if (buffer.trim()) {
    options.onEvent(JSON.parse(buffer.trim()) as Record<string, unknown>);
  }
}

export async function requestStream<T>(
  path: string,
  init: RequestInit,
  options: {
    onDelta?: (delta: string) => void;
    pickComplete: (event: Record<string, unknown>) => T | undefined;
  },
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${getApiBase()}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      ...init,
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    const message = error instanceof Error ? error.message : "未知网络错误";
    throw new Error(buildConnectionError(message));
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(buildRequestError(response.status, message));
  }

  if (!response.body) {
    throw new Error("当前环境未返回可读取的流式响应。");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed: T | undefined;

  const processLine = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as Record<string, unknown>;
    if (event.type === "error") {
      throw new Error(typeof event.message === "string" ? event.message : "流式请求失败");
    }
    if (event.type === "delta" && typeof event.delta === "string") {
      options.onDelta?.(event.delta);
    }
    const maybeCompleted = options.pickComplete(event);
    if (maybeCompleted !== undefined) {
      completed = maybeCompleted;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      processLine(line);
      newlineIndex = buffer.indexOf("\n");
    }

    if (done) {
      break;
    }
  }

  if (buffer.trim()) {
    processLine(buffer);
  }

  if (completed === undefined) {
    throw new Error("流式响应已结束，但未收到完成结果。");
  }

  return completed;
}

export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    sp.set(key, String(value));
  });
  const query = sp.toString();
  return query ? `?${query}` : "";
}

export function resolveApiAssetUrl(path: string): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${getApiBase()}${path}`;
}
