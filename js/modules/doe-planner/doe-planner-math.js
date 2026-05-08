/**
 * D.Mike — DoE Planner: Math Library (doe-planner-math.js)
 *
 * Thin re-export layer. All implementations now live in the shared
 * regression engine (js/engines/regression-engine.js).
 *
 * This file exists for backwards compatibility — existing imports
 * from doe-planner-analysis.js and other DoE files continue to work.
 */

export {
  // Matrix operations
  matTranspose,
  matMul,
  matTrace,
  matIdentity,
  matDeterminant,
  matInverse,

  // Model matrix (coded DOE designs)
  buildModelMatrix,

  // OLS regression
  olsRegression,

  // Type III sum of squares
  typeIIISS,

  // Distribution functions
  erfc,
  normalCDF,
  fDistCDF,
  fDistQuantile,
  tDistCDF,
  tDistPValue,

  // Normal inverse (aliased for backwards compatibility)
  normalInv as inverseNormalCDF,

  // Helpers
  fPValue,
  tPValue,
} from '../../engines/regression-engine.js';
