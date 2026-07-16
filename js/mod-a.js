// mod-a.js — shares a large identical block with mod-b.js (deliberate clone).
export function computeProcessCapability(values, lowerSpec, upperSpec) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('values must be a non-empty array');
  }
  const n = values.length;
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    sum += values[i];
  }
  const mean = sum / n;
  let varianceAccumulator = 0;
  for (let i = 0; i < n; i += 1) {
    const delta = values[i] - mean;
    varianceAccumulator += delta * delta;
  }
  const variance = varianceAccumulator / (n - 1);
  const stdDev = Math.sqrt(variance);
  const cp = (upperSpec - lowerSpec) / (6 * stdDev);
  const cpkLower = (mean - lowerSpec) / (3 * stdDev);
  const cpkUpper = (upperSpec - mean) / (3 * stdDev);
  const cpk = Math.min(cpkLower, cpkUpper);
  return { mean, stdDev, variance, cp, cpk, cpkLower, cpkUpper };
}

export const labelA = 'module-a';
