/** Per-step structured feedback from the authoritative player simulation. */
export interface StepResult {
  linesClearedThisStep: number;
  attackLinesQueued: number;
  topOut: boolean;
  locked: boolean;
  shopRolled: boolean;
  tectonic: {
    active: boolean;
    advanced: boolean;
    completed: boolean;
    rowsCleared: number;
  };
  poisonSpreadCells: number;
}

/** Configurable simulation options for stepPlayer(). */
export interface StepOptions {
  /** Disable shop behavior for training dummies or non-player simulations. */
  enableShop?: boolean;
  /** Do not replenish a preloaded finite piece source after it is exhausted. */
  finitePieceSource?: boolean;
}

/** Options for one authoritative two-player match tick. */
export interface MatchStepOptions extends StepOptions {
  /** Suppress outgoing attack-to-garbage commits while retaining line clears. */
  enableGarbage?: boolean;
}
