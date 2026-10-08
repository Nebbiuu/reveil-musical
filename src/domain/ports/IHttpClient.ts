export interface HttpRequestOptions {
  readonly headers?: Record<string, string>;
  readonly timeoutMs?: number;
}

export interface HttpResponse<T> {
  readonly status: number;
  readonly statusText: string;
  readonly data: T;
}

export interface IHttpClient {
  get<T>(url: string, options?: HttpRequestOptions): Promise<HttpResponse<T>>;
}
