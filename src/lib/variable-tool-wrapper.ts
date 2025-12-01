import { createTool, Tool } from '@mastra/core/tools';
import { RuntimeContext } from '@mastra/core/runtime-context';
import { setVariable } from './variable-store';
import { resolveVariables } from './variable-resolver';

export interface WrapToolsOptions {
  /**
   * Custom function to generate variable names
   * Default: `${toolId}_${timestamp}`
   */
  naming?: (toolId: string, input: unknown, output: unknown) => string;
}

/**
 * Default naming function for variables
 */
function defaultNaming(toolId: string, input: unknown, _output: unknown): string {
  // Try to extract a meaningful identifier from input
  if (input && typeof input === 'object') {
    const inputObj = input as Record<string, unknown>;
    // Common patterns: location, name, id, query, etc.
    const identifiers = ['location', 'name', 'id', 'query', 'city', 'symbol', 'ticker'];
    for (const key of identifiers) {
      if (typeof inputObj[key] === 'string') {
        const value = inputObj[key] as string;
        const sanitized = value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
        if (sanitized) {
          return `${toolId.replace(/-/g, '_')}_${sanitized}`;
        }
      }
    }
  }
  
  // Fallback: toolId + timestamp
  return `${toolId.replace(/-/g, '_')}_${Date.now()}`;
}

/**
 * Wrap a single tool to:
 * 1. Resolve variable references in inputs before execution
 * 2. Save outputs as variables after execution
 */
export function wrapTool<TInput extends Record<string, unknown>, TOutput>(
  tool: Tool<TInput, TOutput>,
  options?: WrapToolsOptions
): Tool<TInput, TOutput> {
  const namingFn = options?.naming ?? defaultNaming;

  return createTool({
    id: tool.id,
    description: tool.description,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema,
    execute: async (params) => {
      const { context, runtimeContext, ...rest } = params;
      
      // Ensure we have a RuntimeContext
      const ctx = runtimeContext ?? new RuntimeContext();
      
      // 1. Resolve any variable references in the input
      const resolvedContext = resolveVariables(context, ctx) as TInput;
      
      // 2. Execute the original tool with resolved inputs
      const result = await tool.execute({
        context: resolvedContext,
        runtimeContext: ctx,
        ...rest,
      });
      
      // 3. Save the output as a variable
      const varName = namingFn(tool.id, context, result);
      setVariable(ctx, varName, result, tool.id);
      
      // 4. Return the original result (unmodified)
      return result;
    },
  }) as Tool<TInput, TOutput>;
}

/**
 * Wrap multiple tools at once
 */
export function wrapTools<T extends Record<string, Tool>>(
  tools: T,
  options?: WrapToolsOptions
): T {
  const wrapped: Record<string, Tool> = {};
  
  for (const [key, tool] of Object.entries(tools)) {
    wrapped[key] = wrapTool(tool, options);
  }
  
  return wrapped as T;
}
