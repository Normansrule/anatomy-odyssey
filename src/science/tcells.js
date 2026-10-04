// T cells: clonal expansion and the geometry of recognition.
// Tested in tests/tcells.test.js.

/** Cells after n rounds of division from one founder: N = 2ⁿ. */
export function clonalCells(generations) {
  if (!(generations >= 0)) throw new RangeError('generations must be zero or more');
  return 2 ** generations;
}

/** Divisions needed to reach N cells from one: n = log₂ N. */
export function divisionsToReach(cells) {
  if (!(cells >= 1)) throw new RangeError('need at least one cell');
  return Math.log2(cells);
}

/** Time to reach N cells at a fixed division time: t = t_d · log₂ N (same unit as t_d). */
export function timeToReach(cells, divisionTime) {
  return divisionTime * divisionsToReach(cells);
}

/** A typical division time for an activated T cell, in hours (Yoon et al., 2010: about 2 to 6 hours). */
export const T_CELL_DIVISION_HOURS = 6;

/** Gap between the two membranes where a T-cell receptor holds a peptide–MHC, in nm (about 15). */
export const SYNAPSE_GAP_NM = 15;
/** The span of the LFA-1–ICAM-1 adhesion pair that rings the synapse, in nm. */
export const LFA1_SPAN_NM = [36, 45];
/** Peptide lengths held by MHC class I, in amino acids. */
export const MHC_I_PEPTIDE_LENGTH = [8, 10];
/** Rise per amino acid in an extended chain, in nm (about 0.33–0.35). */
export const EXTENDED_RISE_NM = 0.34;

/** Length of an extended peptide of n amino acids, end to end, in nm. */
export function peptideLength(n, rise = EXTENDED_RISE_NM) {
  return (n - 1) * rise;
}
