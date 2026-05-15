export {
  detectEIP7702Support,
  determineExecutionStrategy,
  type ExecutionStrategy,
} from './capability.detector.js';

export { encodeMulticall3 } from './multicall3.executor.js';

export {
  buildPermitTypedData,
  encodePermitCall,
  wrapPermitAndCallsInMulticall3,
  type BuildPermitTypedDataInput,
  type SignedPermit,
} from './permit.js';

export {
  executeWithEIP7702,
  waitForEIP7702Confirmation,
} from './eip7702.executor.js';
