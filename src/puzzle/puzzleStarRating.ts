export interface PuzzleStarEvaluation {
  stars: 0 | 1 | 2 | 3;
  solved: boolean;
  metric: 'pieces' | 'score';
  playerValue: number;
  targetTwo: number;
  targetThree: number;
  achievedTwo: boolean;
  achievedThree: boolean;
  labelTwo: string;
  labelThree: string;
}

export interface PuzzleEvaluationInput {
  solved: boolean;
  piecesUsed: number;
  score?: number;
  ticksUsed?: number;
  goalKind?: string;
}

export interface PuzzleBaselineMetrics {
  piecesUsed: number;
  score: number;
  ticksUsed: number;
}

export interface CustomStarThresholds {
  metric?: 'pieces' | 'score';
  twoStar?: number;
  threeStar?: number;
}

/**
 * Calculates a 1-3 star rating for a completed puzzle run.
 * 
 * 1 Star: Reaching the goal without topping out.
 * 2 Stars: Efficient solve meeting generous par.
 * 3 Stars: Mastery solve matching or beating bot baseline.
 */
export function calculatePuzzleStars(
  outcome: PuzzleEvaluationInput,
  baseline?: PuzzleBaselineMetrics | null,
  custom?: CustomStarThresholds | null,
): PuzzleStarEvaluation {
  if (!outcome.solved) {
    return {
      stars: 0,
      solved: false,
      metric: 'pieces',
      playerValue: outcome.piecesUsed,
      targetTwo: 0,
      targetThree: 0,
      achievedTwo: false,
      achievedThree: false,
      labelTwo: 'Solve the puzzle',
      labelThree: 'Solve the puzzle',
    };
  }

  // Determine primary metric: custom override > goal-based default
  const isScoreCentric =
    custom?.metric === 'score' ||
    (custom?.metric === undefined &&
      (outcome.goalKind === 'clear-lines' && (baseline?.score ?? 0) > 1500));

  const metric: 'pieces' | 'score' = isScoreCentric ? 'score' : 'pieces';

  if (metric === 'pieces') {
    const basePieces = baseline?.piecesUsed ?? 20;
    const targetThree = custom?.threeStar ?? Math.max(1, basePieces + 1);
    const targetTwo = custom?.twoStar ?? Math.max(targetThree + 1, Math.ceil(basePieces * 1.45) + 2);

    const achievedThree = outcome.piecesUsed <= targetThree;
    const achievedTwo = outcome.piecesUsed <= targetTwo;

    const stars: 1 | 2 | 3 = achievedThree ? 3 : achievedTwo ? 2 : 1;

    return {
      stars,
      solved: true,
      metric: 'pieces',
      playerValue: outcome.piecesUsed,
      targetTwo,
      targetThree,
      achievedTwo,
      achievedThree,
      labelTwo: `≤ ${targetTwo} pcs`,
      labelThree: `≤ ${targetThree} pcs (Par)`,
    };
  }

  // Score-based evaluation
  const baseScore = baseline?.score ?? 1000;
  const targetThree = custom?.threeStar ?? Math.floor(baseScore * 0.95);
  const targetTwo = custom?.twoStar ?? Math.floor(baseScore * 0.70);

  const playerScore = outcome.score ?? 0;
  const achievedThree = playerScore >= targetThree;
  const achievedTwo = playerScore >= targetTwo;

  const stars: 1 | 2 | 3 = achievedThree ? 3 : achievedTwo ? 2 : 1;

  return {
    stars,
    solved: true,
    metric: 'score',
    playerValue: playerScore,
    targetTwo,
    targetThree,
    achievedTwo,
    achievedThree,
    labelTwo: `≥ ${targetTwo.toLocaleString()} pts`,
    labelThree: `≥ ${targetThree.toLocaleString()} pts (Par)`,
  };
}
