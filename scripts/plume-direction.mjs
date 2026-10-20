export function plumeTravelDirection(snapshot) {
  if (!snapshot) return 1;
  const sourceCenter = (snapshot.sourceX0 + snapshot.sourceX1) / 2;
  const cellWidth = snapshot.L / snapshot.nx;
  let forwardMoment = 0;
  let backwardMoment = 0;
  let totalMoment = 0;
  let totalMass = 0;

  for (let z = 0; z < snapshot.nz; z++) for (let y = 0; y < snapshot.ny; y++) for (let x = 0; x < snapshot.nx; x++) {
    const concentration = snapshot.field[(z * snapshot.ny + y) * snapshot.nx + x];
    if (concentration < snapshot.threshold) continue;
    const xPosition = (x + 0.5) * cellWidth;
    const offset = xPosition - sourceCenter;
    totalMoment += offset * concentration;
    totalMass += concentration;
    if (xPosition > snapshot.sourceX1 + cellWidth * 0.5) forwardMoment += offset * concentration;
    if (xPosition < snapshot.sourceX0 - cellWidth * 0.5) backwardMoment += -offset * concentration;
  }

  const directionalMoment = forwardMoment - backwardMoment;
  if (Math.abs(directionalMoment) > (forwardMoment + backwardMoment) * 0.04) {
    return directionalMoment > 0 ? 1 : -1;
  }
  if (totalMass > 0 && Math.abs(totalMoment / totalMass) > cellWidth * 0.25) {
    return totalMoment > 0 ? 1 : -1;
  }
  return 1;
}
