import { RuntimeContext } from '@mastra/core/runtime-context';

const STORE_KEY = '__tool_variables';

export interface StoredVariable {
  value: unknown;
  toolId: string;
  timestamp: number;
}

export interface VariableInfo {
  name: string;
  toolId: string;
  timestamp: number;
  preview: string;
}

/**
 * Get the variable store from RuntimeContext, creating it if it doesn't exist
 */
export function getStore(ctx: RuntimeContext): Map<string, StoredVariable> {
  let store = ctx.get(STORE_KEY) as Map<string, StoredVariable> | undefined;
  if (!store) {
    store = new Map();
    ctx.set(STORE_KEY, store);
  }
  return store;
}

/**
 * Save a variable to the store
 */
export function setVariable(
  ctx: RuntimeContext,
  name: string,
  value: unknown,
  toolId: string
): void {
  const store = getStore(ctx);
  store.set(name, {
    value,
    toolId,
    timestamp: Date.now(),
  });
}

/**
 * Get a variable's value from the store
 */
export function getVariable(ctx: RuntimeContext, name: string): unknown | undefined {
  const store = getStore(ctx);
  return store.get(name)?.value;
}

/**
 * Get a variable with its metadata
 */
export function getVariableWithMeta(
  ctx: RuntimeContext,
  name: string
): StoredVariable | undefined {
  const store = getStore(ctx);
  return store.get(name);
}

/**
 * Check if a variable exists
 */
export function hasVariable(ctx: RuntimeContext, name: string): boolean {
  const store = getStore(ctx);
  return store.has(name);
}

/**
 * List all variables with previews for display
 */
export function listVariables(ctx: RuntimeContext): VariableInfo[] {
  const store = getStore(ctx);
  const result: VariableInfo[] = [];

  for (const [name, stored] of store.entries()) {
    result.push({
      name,
      toolId: stored.toolId,
      timestamp: stored.timestamp,
      preview: generatePreview(stored.value),
    });
  }

  // Sort by timestamp (most recent first)
  return result.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Clear all variables
 */
export function clearVariables(ctx: RuntimeContext): void {
  const store = getStore(ctx);
  store.clear();
}

/**
 * Generate a short preview of a value for display in prompts
 */
function generatePreview(value: unknown, maxLength: number = 100): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';

  if (typeof value === 'string') {
    return value.length > maxLength ? value.slice(0, maxLength) + '...' : value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    const preview = `Array(${value.length})`;
    if (value.length > 0) {
      const firstItem = generatePreview(value[0], 30);
      return `${preview} [${firstItem}, ...]`;
    }
    return preview;
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value);
    const keyPreview = keys.slice(0, 3).join(', ');
    const suffix = keys.length > 3 ? ', ...' : '';
    
    // Try to show some values
    const entries = Object.entries(value).slice(0, 2);
    const valuePreview = entries
      .map(([k, v]) => `${k}: ${generatePreview(v, 20)}`)
      .join(', ');
    
    if (valuePreview.length < maxLength) {
      return `{${valuePreview}${suffix}}`;
    }
    return `{${keyPreview}${suffix}}`;
  }

  return String(value).slice(0, maxLength);
}
