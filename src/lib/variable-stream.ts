import { RuntimeContext } from '@mastra/core/runtime-context';
import { getVariable } from './variable-store';
import { parseVariableRef, getNestedValue } from './variable-resolver';

// Pattern to match variable references
const VARIABLE_PATTERN = /\$([a-zA-Z_][a-zA-Z0-9_]*)(\.[a-zA-Z_][a-zA-Z0-9_]*)*/g;

// Pattern to detect potential incomplete variable at end of string
// Matches: $ or $partial_name or $name. (waiting for field)
const INCOMPLETE_PATTERN = /\$[a-zA-Z_][a-zA-Z0-9_]*\.?$/;

/**
 * Resolve a single variable reference to its string representation
 */
function resolveVariableToString(match: string, ctx: RuntimeContext): string {
  const parsed = parseVariableRef(match);
  const value = getVariable(ctx, parsed.name);
  
  if (value === undefined) {
    return match; // Keep original if not found
  }
  
  let resolved: unknown = value;
  if (parsed.path.length > 0) {
    resolved = getNestedValue(value, parsed.path);
  }
  
  // Convert to string
  if (resolved === null) return 'null';
  if (resolved === undefined) return 'undefined';
  if (typeof resolved === 'object') {
    return JSON.stringify(resolved);
  }
  return String(resolved);
}

/**
 * Resolve all variable references in a string
 */
function resolveVariablesInText(text: string, ctx: RuntimeContext): string {
  return text.replace(VARIABLE_PATTERN, (match) => resolveVariableToString(match, ctx));
}

/**
 * Check if text ends with a potentially incomplete variable reference
 */
function hasIncompleteVariable(text: string): boolean {
  // Check for $ at the end or $partial_var at the end
  return INCOMPLETE_PATTERN.test(text) || text.endsWith('$');
}

/**
 * Find the start of a potential incomplete variable at the end of text
 */
function findIncompleteStart(text: string): number {
  // Look for the last $ that might be start of incomplete variable
  const lastDollar = text.lastIndexOf('$');
  if (lastDollar === -1) return -1;
  
  const afterDollar = text.slice(lastDollar);
  
  // Check if this looks like an incomplete variable
  if (/^\$[a-zA-Z_][a-zA-Z0-9_]*\.?$/.test(afterDollar) || afterDollar === '$') {
    return lastDollar;
  }
  
  return -1;
}

export interface StreamChunk {
  type: string;
  [key: string]: unknown;
}

export interface TextChunk extends StreamChunk {
  type: 'text-delta';
  textDelta: string;
}

function isTextChunk(chunk: StreamChunk): chunk is TextChunk {
  return chunk.type === 'text-delta' && typeof (chunk as TextChunk).textDelta === 'string';
}

/**
 * Create a TransformStream that resolves variable references in text chunks
 * 
 * Handles edge cases:
 * - Variables split across chunks (e.g., "$weather_" + "nyc")
 * - Variables at end of stream
 * - Non-text chunks (passed through unchanged)
 */
export function createVariableStreamTransform(
  ctx: RuntimeContext
): TransformStream<StreamChunk, StreamChunk> {
  let buffer = '';
  
  return new TransformStream<StreamChunk, StreamChunk>({
    transform(chunk, controller) {
      // Pass through non-text chunks unchanged
      if (!isTextChunk(chunk)) {
        // Flush any buffered text first
        if (buffer) {
          const resolved = resolveVariablesInText(buffer, ctx);
          controller.enqueue({ type: 'text-delta', textDelta: resolved });
          buffer = '';
        }
        controller.enqueue(chunk);
        return;
      }
      
      // Combine buffer with new text
      const text = buffer + chunk.textDelta;
      
      // Check if text ends with incomplete variable
      const incompleteStart = findIncompleteStart(text);
      
      if (incompleteStart >= 0) {
        // Buffer the potentially incomplete part
        const complete = text.slice(0, incompleteStart);
        buffer = text.slice(incompleteStart);
        
        // Resolve and emit the complete part
        if (complete) {
          const resolved = resolveVariablesInText(complete, ctx);
          controller.enqueue({ type: 'text-delta', textDelta: resolved });
        }
      } else {
        // No incomplete variable, resolve and emit everything
        buffer = '';
        const resolved = resolveVariablesInText(text, ctx);
        controller.enqueue({ type: 'text-delta', textDelta: resolved });
      }
    },
    
    flush(controller) {
      // Emit any remaining buffered text
      if (buffer) {
        const resolved = resolveVariablesInText(buffer, ctx);
        controller.enqueue({ type: 'text-delta', textDelta: resolved });
        buffer = '';
      }
    },
  });
}

/**
 * Simpler version for plain text streams (not structured chunks)
 */
export function createTextStreamTransform(
  ctx: RuntimeContext
): TransformStream<string, string> {
  let buffer = '';
  
  return new TransformStream<string, string>({
    transform(chunk, controller) {
      const text = buffer + chunk;
      const incompleteStart = findIncompleteStart(text);
      
      if (incompleteStart >= 0) {
        const complete = text.slice(0, incompleteStart);
        buffer = text.slice(incompleteStart);
        
        if (complete) {
          controller.enqueue(resolveVariablesInText(complete, ctx));
        }
      } else {
        buffer = '';
        controller.enqueue(resolveVariablesInText(text, ctx));
      }
    },
    
    flush(controller) {
      if (buffer) {
        controller.enqueue(resolveVariablesInText(buffer, ctx));
        buffer = '';
      }
    },
  });
}
