/**
 * RPC Types
 */

export interface RPCRequest {
  id: string;
  method: string;
  params?: unknown;
}

export interface RPCResponse {
  id: string;
  result?: unknown;
  error?: RPCError;
}

export interface RPCError {
  code: number;
  message: string;
  data?: unknown;
}

export interface RPCHandler {
  (params?: unknown): Promise<unknown>;
}

export type RPCHandlers = Record<string, RPCHandler>;
