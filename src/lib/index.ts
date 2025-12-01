// Main export - the agent wrapper
export { withToolVariables } from './variable-agent';
export type { ToolVariablesOptions } from './variable-agent';

// Variable store utilities
export {
  getStore,
  setVariable,
  getVariable,
  getVariableWithMeta,
  hasVariable,
  listVariables,
  clearVariables,
} from './variable-store';
export type { StoredVariable, VariableInfo } from './variable-store';

// Variable resolver utilities
export {
  resolveVariables,
  resolveString,
  containsVariableRef,
  extractVariableNames,
  parseVariableRef,
  getNestedValue,
} from './variable-resolver';

// Tool wrapper (for advanced use cases)
export { wrapTools, wrapTool } from './variable-tool-wrapper';
export type { WrapToolsOptions } from './variable-tool-wrapper';

// Stream transformer (for advanced use cases)
export {
  createVariableStreamTransform,
  createTextStreamTransform,
} from './variable-stream';

// Prompt utilities
export { getVariableInstructions } from './prompts';
export type { InstructionStyle } from './prompts';
