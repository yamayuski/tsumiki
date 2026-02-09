/**
 * WebSocket RPC Implementation
 * Inspired by kataribe
 */

import type { WebSocket } from 'ws';
import type { RPCRequest, RPCResponse, RPCHandlers, RPCError } from './types';

export class RPCServer {
  private handlers: RPCHandlers = {};

  constructor() {}

  /**
   * Register an RPC method handler
   */
  register(method: string, handler: RPCHandlers[string]): void {
    this.handlers[method] = handler;
  }

  /**
   * Handle incoming RPC request
   */
  async handleRequest(ws: WebSocket, request: RPCRequest): Promise<void> {
    const handler = this.handlers[request.method];

    if (!handler) {
      const error: RPCError = {
        code: -32601,
        message: `Method not found: ${request.method}`,
      };
      const response: RPCResponse = {
        id: request.id,
        error,
      };
      ws.send(JSON.stringify(response));
      return;
    }

    try {
      const result = await handler(request.params);
      const response: RPCResponse = {
        id: request.id,
        result,
      };
      ws.send(JSON.stringify(response));
    } catch (err) {
      const error: RPCError = {
        code: -32603,
        message: err instanceof Error ? err.message : 'Internal error',
      };
      const response: RPCResponse = {
        id: request.id,
        error,
      };
      ws.send(JSON.stringify(response));
    }
  }
}

export class RPCClient {
  private ws: WebSocket;
  private requestId = 0;
  private pendingRequests = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
  }>();

  constructor(ws: WebSocket) {
    this.ws = ws;
    this.ws.on('message', (data) => {
      this.handleResponse(JSON.parse(data.toString()));
    });
  }

  /**
   * Call remote method
   */
  async call(method: string, params?: unknown): Promise<unknown> {
    const id = `${++this.requestId}`;
    const request: RPCRequest = {
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(request));
    });
  }

  private handleResponse(response: RPCResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      return;
    }

    this.pendingRequests.delete(response.id);

    if (response.error) {
      pending.reject(new Error(response.error.message));
    } else {
      pending.resolve(response.result);
    }
  }
}
