import type { ActionType, InputState, PlayerState } from '../../src/types.js';

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer U)[]
    ? readonly DeepReadonly<U>[]
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

export interface PlayerCommand {
  inputState?: Partial<InputState>;
  actions?: readonly ActionType[];
}

export interface PlayerObservation {
  tick: number;
  player: DeepReadonly<PlayerState>;
}

export interface DriverObservation {
  tick: number;
  player: PlayerObservation;
}

export interface InputDriver {
  next(observation: DriverObservation): PlayerCommand;
}

export function clonePlayer<T extends object>(player: T): T {
  return JSON.parse(JSON.stringify(player)) as T;
}

export class ScriptedDriver implements InputDriver {
  private readonly script: Map<number, PlayerCommand>;

  constructor(
    script:
      | Record<number, PlayerCommand>
      | Map<number, PlayerCommand>
      | Array<{ tick: number; command: PlayerCommand }>,
  ) {
    if (Array.isArray(script)) {
      this.script = new Map(script.map((item) => [item.tick, item.command]));
    } else if (script instanceof Map) {
      this.script = new Map(script);
    } else {
      this.script = new Map(
        Object.entries(script).map(([k, v]) => [Number(k), v]),
      );
    }
  }

  next(observation: DriverObservation): PlayerCommand {
    const cmd = this.script.get(observation.tick);
    if (!cmd) {
      return {
        inputState: { left: false, right: false, softDrop: false },
        actions: [],
      };
    }
    return {
      inputState: cmd.inputState
        ? {
            left: !!cmd.inputState.left,
            right: !!cmd.inputState.right,
            softDrop: !!cmd.inputState.softDrop,
          }
        : undefined,
      actions: cmd.actions ? [...cmd.actions] : [],
    };
  }
}
