import type { System } from "./system.js";
import type { DeltaTime } from "./types.js";
import type { World } from "./world.js";

/**
 * ECSEngine
 *
 * エンティティ・コンポーネント・システム (ECS) アーキテクチャにおける
 * システムの管理および実行を担うクラスです。
 *
 * 主な責務:
 * - システムの登録・削除を行う
 * - 登録されたシステムを登録順に走査して World に対する更新を行う
 *
 * @remarks
 * - システムは配列に順序どおりに保持され、実行順序は登録順に従います。
 * - world は読み取り専用で、ECSEngine のライフタイム中に参照されます。
 *
 * @param world - このエンジンが操作する World インスタンス（読み取り専用）
 *
 * @example
 * const engine = new ECSEngine(world);
 * engine.addSystem(renderSystem);
 * engine.addSystem(physicsSystem);
 * // 毎フレーム呼び出す
 * engine.update(deltaTime);
 *
 * @see System
 * @see World
 */
export class ECSEngine {
  /**
   * エンジンが管理するシステムの一覧配列。
   *
   * ECS（エンティティ・コンポーネント・システム）アーキテクチャにおける各 System を格納し、
   * フレームごとの更新や実行順序の決定に使用します。
   *
   * - 配列の順序がシステムの実行順を表すため、順序変更は実行結果に影響します。
   * - フレーム中に直接追加・削除すると不整合が生じる可能性があるため、初期化時や安全なタイミングで操作してください。
   *
   * @private
   * @type {System[]}
   * @remarks
   * ミュータブルな配列のため、反復処理中に外部から変更される恐れがある場合は配列のコピーを作成してから使用してください。
   * @example
   * // システム登録例（初期化時）
   * // this.systems.push(new RenderSystem());
   */
  private systems: System[] = [];

  public constructor(private readonly world: World) {}

  /**
   * 世界内のすべてのシステムを順に更新します。
   *
   * 各システムの update(this.world, deltaTime) を呼び出し、経過時間に基づく処理を実行します。
   * 通常はゲームループやエンジンのフレーム更新で毎フレーム呼び出されます。
   *
   * @param deltaTime 更新に用いる経過時間（時間単位はコードベースでの慣例に従う）を表す数値。
   *                  各システムはこの値を用いて時間依存の計算や補間を行います。
   * @returns なし
   *
   * @remarks
   * - システムは this.systems に格納された順序で実行されます。システム間の依存関係がある場合は登録順に注意してください。
   * - 個々のシステムが例外を投げると以降のシステム更新が中断されるため、必要に応じて例外処理や分離を行ってください。
   * - パフォーマンスに影響する可能性があるため、重い処理は別スレッドやバッチ処理に移譲することを検討してください。
   */
  public update(deltaTime: DeltaTime): void {
    for (const system of this.systems) {
      system.update(this.world, deltaTime);
    }
  }

  /**
   * エンジンにシステムを追加します。
   *
   * 指定した System インスタンスを内部の systems 配列に格納します。
   * このメソッドは重複チェックや自動初期化を行わず、単純に配列へ追加します。
   *
   * @param system 追加する System インスタンス
   * @returns void
   *
   * @remarks
   * 追加されたシステムの実行順序は、実装によっては追加順に依存する場合があります。
   */
  public addSystem(system: System): void {
    this.systems.push(system);
  }

  /**
   * 指定した System インスタンスをエンジンの内部システム配列から削除します。
   *
   * 指定されたシステムが配列内に存在する場合、最初に見つかった要素を破壊的に削除します。
   * 存在しない場合は何も行わず（no-op）、エラーは発生しません。
   *
   * 等価性は参照等価（===）で判定されるため、同一インスタンスのみが削除対象になります。
   * 配列探索を行うため、時間計算量は O(n) です。
   *
   * @param system - 削除したい System インスタンス
   * @returns void
   */
  public removeSystem(system: System): void {
    const index = this.systems.indexOf(system);
    if (index !== -1) {
      this.systems.splice(index, 1);
    }
  }
}
