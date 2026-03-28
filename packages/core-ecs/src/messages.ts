import type { Entity } from "./entity.js";

/**
 * ECS ネットワーキング用メッセージ
 *
 * ここに定義されるインターフェースは、クライアントとオーソリタティブな
 * サーバ間で送受信される JSON シリアライズ可能なメッセージを表します。
 * `Messagable` のようなバイトストリーム上で送受信する用途を想定しています。
 */
// クライアントとサーバの両方で使用する共通型

// Basic identifiers
// 注意: ランタイムでは識別子に `bigint` を使用します。JSON にシリアライズ
// する際は `bigint` を復元可能なマーカー文字列に変換します（下のエンコード/デコード参照）。
export type ComponentId = bigint;
export type Timestamp = bigint; // エポックミリ秒またはシミュレーションティック

// Generic component payload type — concrete components should serialize to JSON-compatible values.
export type ComponentData = Record<string, unknown> | unknown[] | string | number | boolean | null;

// Base message with discriminant
export interface BaseMessage {
  type: string;
}

// ------------------------- Client -> Server messages -------------------------

/** Client -> Server: エンティティ作成要求（クライアント発） */
export interface ClientCreateEntityMessage extends BaseMessage {
  type: "client.create_entity";
  // クライアント側の一時 ID（サーバ応答と突合するための任意フィールド）
  clientTempId?: number;
  // initial components to attach
  components?: Array<{ id?: ComponentId; name?: string; data: ComponentData }>;
}

/** Client -> Server: エンティティ削除要求 */
export interface ClientRemoveEntityMessage extends BaseMessage {
  type: "client.remove_entity";
  entityId: Entity;
}

/** Client -> Server: コンポーネント更新要求（入力や予測結果など、クライアント発の変更） */
export interface ClientUpdateComponentMessage extends BaseMessage {
  type: "client.update_component";
  entityId: Entity;
  component: { id?: ComponentId; name?: string };
  data: ComponentData;
  // 順序付けのためのクライアントティック/タイムスタンプ（任意）
  tick?: number;
}

/** Client -> Server: 入力/アクションメッセージ（プレイヤー操作） */
export interface ClientInputMessage extends BaseMessage {
  type: "client.input";
  clientId: string;
  tick: number;
  input: unknown;
}

/** Client -> Server: RPC 呼び出し（クライアント -> サーバ） */
export interface ClientRpcMessage extends BaseMessage {
  type: "client.rpc";
  entityId?: Entity;
  method: string;
  args?: unknown[];
  callId?: string | number; // for matching replies
}

/** Client -> Server: ACK / 確認応答（スナップショットや RPC の確認など） */
export interface ClientAckMessage extends BaseMessage {
  type: "client.ack";
  ackId: string | number;
}

// Union of all client->server messages
export type ClientToServerMessage =
  | ClientCreateEntityMessage
  | ClientRemoveEntityMessage
  | ClientUpdateComponentMessage
  | ClientInputMessage
  | ClientRpcMessage
  | ClientAckMessage;

// ------------------------- Server (Authoritative) -> Client messages -------------------------

/** Server -> Client: エンティティ作成通知（サーバが付与した正規の ID を含む） */
export interface ServerCreateEntityMessage extends BaseMessage {
  type: "server.create_entity";
  entityId: Entity;
  // クライアントから作成要求が来ている場合は一時 ID をエコーすることがある
  clientTempId?: number;
  components?: Array<{ id?: ComponentId; name?: string; data: ComponentData }>;
}

/** Server -> Client: エンティティ削除通知 */
export interface ServerRemoveEntityMessage extends BaseMessage {
  type: "server.remove_entity";
  entityId: Entity;
}

/** Server -> Client: コンポーネントのサーバ側（権威）更新通知（完全/差分） */
export interface ServerUpdateComponentMessage extends BaseMessage {
  type: "server.update_component";
  entityId: Entity;
  component: { id?: ComponentId; name?: string };
  // Either a full component state or a delta/patch depending on component semantics
  data: ComponentData;
  tick?: number; // サーバティックまたはスナップショット ID
}

/** Server -> Client: スナップショット（あるティックの複数エンティティ/コンポーネント状態） */
export interface ServerSnapshotMessage extends BaseMessage {
  type: "server.snapshot";
  tick: number;
  timestamp?: Timestamp;
  // entityId -> コンポーネント列 のマップ（配列形式で表現）
  entities: Array<{
    entityId: Entity;
    components?: Array<{
      id?: ComponentId;
      name?: string;
      data: ComponentData;
    }>;
  }>;
}

/** Server -> Client: RPC 呼び出し（サーバ -> クライアント） */
export interface ServerRpcMessage extends BaseMessage {
  type: "server.rpc";
  entityId?: Entity;
  method: string;
  args?: unknown[];
  callId?: string | number; // for matching replies
}

/** Server -> Client: ACK / 制御メッセージ */
export interface ServerAckMessage extends BaseMessage {
  type: "server.ack";
  ackId: string | number;
}

/** Server -> Client: 権限移譲通知（サーバがエンティティの権限を誰に与えるか） */
export interface ServerAuthorityMessage extends BaseMessage {
  type: "server.authority";
  entityId: Entity;
  // 'server' | 'client' or a client id string when authority granted to a client
  owner: "server" | { clientId: string };
}

// Union of all server->client messages
export type ServerToClientMessage =
  | ServerCreateEntityMessage
  | ServerRemoveEntityMessage
  | ServerUpdateComponentMessage
  | ServerSnapshotMessage
  | ServerRpcMessage
  | ServerAckMessage
  | ServerAuthorityMessage;

// ------------------------- Helpers for transport -------------------------

/** Top-level wrapper for messages when sent over `Messagable` byte streams. */
export interface WireMessage {
  // versioning and encoding hints can be added here
  v?: number;
  payload: ClientToServerMessage | ServerToClientMessage;
}

/**
 * `WireMessage` を JSON 化して `Uint8Array` に変換します。
 * `Messagable.writable` に書き込む用途（必要に応じて `sendTransforms` を適用）を想定しています。
 */
// JSON は `bigint` を直接サポートしないため、`bigint` を文字列化して
// マーカーを付与し（"__bigint__:<値>"）、復元時に BigInt に戻す仕組みを用意します。
const BIGINT_MARKER = "__bigint__:";

function bigintReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") {
    return `${BIGINT_MARKER}${value.toString()}`;
  }
  return value;
}

export function encodeWireMessage(m: WireMessage): Uint8Array {
  const s = JSON.stringify(m, bigintReplacer);
  return new TextEncoder().encode(s);
}

/**
 * `Uint8Array`（`Messagable.readable` から取得）を `WireMessage` に復元します。
 * JSON パースを使用するため、入力が不正な場合は例外が発生します。
 */
function bigintReviver(_key: string, value: unknown): unknown {
  if (typeof value === "string" && value.startsWith(BIGINT_MARKER)) {
    // safe to use BigInt since the marker ensures numeric string
    return BigInt(value.slice(BIGINT_MARKER.length));
  }
  return value;
}

export function decodeWireMessage(bytes: Uint8Array): WireMessage {
  const s = new TextDecoder().decode(bytes);
  return JSON.parse(s, bigintReviver) as WireMessage;
}

export function isClientToServerMessage(m: WireMessage): m is { payload: ClientToServerMessage } {
  // naive runtime check based on type prefix
  if (m.payload && typeof m.payload === "object") {
    const t = (m.payload as { type?: unknown }).type;
    return typeof t === "string" && t.startsWith("client.");
  }
  return false;
}

export function isServerToClientMessage(m: WireMessage): m is { payload: ServerToClientMessage } {
  if (m.payload && typeof m.payload === "object") {
    const t = (m.payload as { type?: unknown }).type;
    return typeof t === "string" && t.startsWith("server.");
  }
  return false;
}
