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
}
