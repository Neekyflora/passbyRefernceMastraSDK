import { RuntimeContext } from '@mastra/core/runtime-context';
import { getVariable } from './variable-store';

// Matches $variable_name or $variable_name.field.subfield
// Variable names: start with letter/underscore, then alphanumeric/underscore
const VARIABLE_PATTERN = /\$([a-zA-Z_][a-zA-Z0-9_]*)(\.[a-zA-Z_][a-zA-Z0-9_]*)*/g;

// For checking if a string is ONLY a variable reference (no surrounding text)
const EXACT_VARIABLE_PATTERN = /^\$([a-zA-Z_][a-zA-Z0-9_]*)(\.[a-zA-Z_][a-zA-Z0-9_]*)*$/;

interface ParsedRef {
  name: string;
  path: string[];
}

/**
 * Parse a variable reference like "$weather_nyc.temperature.value"
 * Returns { name: "weather_nyc", path: ["temperature", "value"] }
 */
export function parseVariableRef(ref: string): ParsedRef {
  // Remove the leading $
  const withoutDollar = ref.slice(1);
  const parts = withoutDollar.split('.');
  
  return {
    name: parts[0],
    path: parts.slice(1),
  };
}

/**
 * Get a nested value from an object using a path array
 */
export function getNestedValue(obj: unknown, path: string[]): unknown {
  let current: unknown = obj;
  
  for (const key of path) {
    if (current === null || current === undefined) {
      return undefined;
    }
    
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  
  return current;
}

/**
 * Check if a string contains any variable references
 */
export function containsVariableRef(value: unknown): boolean {
  if (typeof value === 'string') {
    return VARIABLE_PATTERN.test(value);
  }
  
  if (Array.isArray(value)) {
    return value.some(containsVariableRef);
  }
  
  if (typeof value === 'object' && value !== null) {
    return Object.values(value).some(containsVariableRef);
  }
  
  return false;
}

/**
 * Extract all variable names from a value
 */
export function extractVariableNames(value: unknown): string[] {
  const names = new Set<string>();
  
  function extract(v: unknown) {
    if (typeof v === 'string') {
      const matches = v.matchAll(VARIABLE_PATTERN);
      for (const match of matches) {
        const parsed = parseVariableRef(match[0]);
        names.add(parsed.name);
      }
    } else if (Array.isArray(v)) {
      v.forEach(extract);
    } else if (typeof v === 'object' && v !== null) {
      Object.values(v).forEach(extract);
    }
  }
  
  extract(value);
  return Array.from(names);
}

/**
 * Resolve a single string that may contain variable references
 * 
 * If the string is EXACTLY a variable reference (e.g., "$weather_nyc"),
 * returns the actual value (could be object, array, etc.)
 * 
 * If the string contains variable references mixed with text
 * (e.g., "Temperature is $weather_nyc.temperature°F"),
 * returns a string with values interpolated
 */
export function resolveString(str: string, ctx: RuntimeContext): unknown {
  // Check if the entire string is just a variable reference
  if (EXACT_VARIABLE_PATTERN.test(str)) {
    const parsed = parseVariableRef(str);
    const value = getVariable(ctx, parsed.name);
    
    if (value === undefined) {
      // Variable not found, return original string
      return str;
    }
    
    if (parsed.path.length > 0) {
      return getNestedValue(value, parsed.path);
    }
    
    return value;
  }
  
  // String contains variable references mixed with other text
  // Replace each reference with its string representation
  return str.replace(VARIABLE_PATTERN, (match) => {
    const parsed = parseVariableRef(match);
    const value = getVariable(ctx, parsed.name);
    
    if (value === undefined) {
      return match; // Keep original if not found
    }
    
    let resolved: unknown = value;
    if (parsed.path.length > 0) {
      resolved = getNestedValue(value, parsed.path);
    }
    
    // Convert to string for interpolation
    if (resolved === null) return 'null';
    if (resolved === undefined) return 'undefined';
    if (typeof resolved === 'object') {
      return JSON.stringify(resolved);
    }
    return String(resolved);
  });
}

/**
 * Recursively resolve all variable references in a value
 * 
 * - Strings: resolve variable references
 * - Arrays: resolve each element
 * - Objects: resolve each value
 * - Other types: return as-is
 */
export function resolveVariables(value: unknown, ctx: RuntimeContext): unknown {
  if (typeof value === 'string') {
    return resolveString(value, ctx);
  }
  
  if (Array.isArray(value)) {
    return value.map((item) => resolveVariables(item, ctx));
  }
  
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      result[key] = resolveVariables(val, ctx);
    }
    return result;
  }
  
  return value;
}
