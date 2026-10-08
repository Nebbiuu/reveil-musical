import { IHttpClient, HttpRequestOptions, HttpResponse } from '../../src/domain/ports/IHttpClient.js';

export type HttpHandler = (url: string, options?: HttpRequestOptions) => HttpResponse<unknown> | Promise<HttpResponse<unknown>>;

export class FakeHttpClient implements IHttpClient {
  private readonly routes = new Map<string, HttpHandler>();
  private defaultHandler: HttpHandler | undefined;
  public requestHistory: Array<{ url: string; options?: HttpRequestOptions }> = [];

  public onGet(urlPattern: string, handler: HttpHandler): this {
    this.routes.set(urlPattern, handler);
    return this;
  }

  public setDefaultHandler(handler: HttpHandler): this {
    this.defaultHandler = handler;
    return this;
  }

  public async get<T>(url: string, options?: HttpRequestOptions): Promise<HttpResponse<T>> {
    this.requestHistory.push({ url, options });

    for (const [pattern, handler] of this.routes.entries()) {
      if (url.includes(pattern)) {
        const res = await handler(url, options);
        return res as HttpResponse<T>;
      }
    }

    if (this.defaultHandler) {
      const res = await this.defaultHandler(url, options);
      return res as HttpResponse<T>;
    }

    throw new Error(`FakeHttpClient: Unhandled GET request for URL: ${url}`);
  }
}
