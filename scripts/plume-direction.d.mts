export type PlumeSnapshot = {
  nx: number;
  ny: number;
  nz: number;
  L: number;
  threshold: number;
  field: number[];
  sourceX0: number;
  sourceX1: number;
};

export function plumeTravelDirection(snapshot: PlumeSnapshot | null): 1 | -1;
