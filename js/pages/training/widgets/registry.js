/**
 * D.Mike — Course widget implementations (widgets/registry.js)
 *
 * Maps every name of `WIDGETS` (widgets/index.js, Node-safe) to its Alpine
 * component. A unit test keeps both lists identical.
 */

import { samplingSimComponent } from './sampling-distribution.js';
import { valueSimComponent } from './value-distribution.js';
import { sampleEstimateComponent } from './sample-estimate.js';
import { varianceCheckComponent } from './variance-check.js';
import { intervalCoverageComponent } from './interval-coverage.js';
import { nullDistributionComponent } from './null-distribution.js';
import { testErrorsComponent } from './test-errors.js';

/**
 * Widget name -> Alpine component name and factory.
 * @type {Object<string, {component: string, factory: (ctx: object) => object}>}
 */
export const WIDGET_COMPONENTS = {
  'sampling-distribution': { component: 'trainingSamplingSim', factory: samplingSimComponent },
  'value-distribution': { component: 'trainingValueSim', factory: valueSimComponent },
  'sample-estimate': { component: 'trainingSampleEstimate', factory: sampleEstimateComponent },
  'variance-check': { component: 'trainingVarianceCheck', factory: varianceCheckComponent },
  'interval-coverage': { component: 'trainingIntervalCoverage', factory: intervalCoverageComponent },
  'null-distribution': { component: 'trainingNullDistribution', factory: nullDistributionComponent },
  'test-errors': { component: 'trainingTestErrors', factory: testErrorsComponent },
};
