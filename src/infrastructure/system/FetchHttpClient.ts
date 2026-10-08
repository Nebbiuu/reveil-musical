import { IHttpClient, HttpRequestOptions, HttpResponse } from '../../domain/ports/IHttpClient.js';

export class FetchHttpClient implements IHttpClient {
  constructor(private readonly defaultTimeoutMs: number = 5000) {}

  public async get<T>(url: string, options?: HttpRequestOptions): Promise<HttpResponse<T>> {
    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const init: RequestInit = {
        method: 'GET',
        signal: controller.signal,
      };
      if (options?.headers) {
        init.headers = options.headers;
      }
      const response = await fetch(url, init);

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as T;
      return {
        status: response.status,
        statusText: response.statusText,
        data,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timed out after ${timeoutMs}ms for URL: ${url}`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
