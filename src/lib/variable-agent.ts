import { Agent } from '@mastra/core/agent';
import { RuntimeContext } from '@mastra/core/runtime-context';
import { Tool } from '@mastra/core/tools';
import { wrapTools, WrapToolsOptions } from './variable-tool-wrapper';
import { getVariableInstructions, InstructionStyle } from './prompts';
import { getVariable } from './variable-store';
import { parseVariableRef, getNestedValue } from './variable-resolver';

export interface ToolVariablesOptions extends WrapToolsOptions {
  /**
   * Style of instructions to inject
   * - 'full': Detailed explanation with examples (default)
   * - 'minimal': Brief one-liner
   */
  instructionStyle?: InstructionStyle;
}

type RuntimeInput = {
  runtimeContext: RuntimeContext;
  [key: string]: unknown;
};

/**
 * Create dynamic instructions that append variable info
 */
function createDynamicInstructions(
  originalInstructions: unknown,
  instructionStyle: InstructionStyle
) {
  return async (input: RuntimeInput) => {
    const { runtimeContext } = input;
    const ctx = runtimeContext ?? new RuntimeContext();
    
    // Get base instructions
    let base: string;
    if (typeof originalInstructions === 'function') {
      const result = await originalInstructions(input);
      base = typeof result === 'string' ? result : String(result ?? '');
    } else {
      base = typeof originalInstructions === 'string' ? originalInstructions : '';
    }
    
    // Append variable instructions
    const varInstructions = getVariableInstructions(ctx, instructionStyle);
    return `${base}\n\n${varInstructions}`;
  };
}

/**
 * Create dynamic tools that wrap with variable support
 */
function createDynamicTools(
  originalTools: unknown,
  naming?: WrapToolsOptions['naming']
) {
  return async (input: RuntimeInput) => {
    let tools: Record<string, Tool>;
    if (typeof originalTools === 'function') {
      tools = await originalTools(input);
    } else {
      tools = (originalTools as Record<string, Tool>) ?? {};
    }
    
    // Wrap with variable support
    return wrapTools(tools, { naming });
  };
}

/**
 * Wrap an agent to enable tool output variables
 * 
 * This creates a NEW agent with:
 * 1. Dynamic instructions that include available variables
 * 2. Wrapped tools that save outputs as variables and resolve variable inputs
 * 3. Wrapped stream() that resolves variables in streamed text
 * 
 * @example
 * ```typescript
 * import { Agent } from '@mastra/core/agent';
 * import { withToolVariables } from './lib';
 * 
 * const baseAgent = new Agent({
 *   name: 'My Agent',
 *   instructions: 'You help users.',
 *   model: 'openai/gpt-4o-mini',
 *   tools: { myTool },
 * });
 * 
 * export const agent = withToolVariables(baseAgent);
 * ```
 */
export function withToolVariables<T extends Agent>(
  agent: T,
  options: ToolVariablesOptions = {}
): T {
  const { naming, instructionStyle = 'full' } = options;

  // Access agent's private config
  // The Agent class stores config in private fields, we need to extract them
  const agentAny = agent as any;
  
  // Try to get the original config - Mastra stores it in __config or similar
  // We'll extract what we can from the agent instance
  const originalName = agentAny.name ?? agentAny.__name ?? 'agent';
  const originalModel = agentAny.model ?? agentAny.__model;
  const originalInstructions = agentAny.__instructions ?? agentAny.instructions;
  const originalTools = agentAny.__tools ?? agentAny.tools;
  const originalMemory = agentAny.__memory ?? agentAny.memory;
  const originalScorers = agentAny.__scorers ?? agentAny.scorers;
  const originalVoice = agentAny.__voice ?? agentAny.voice;
  
  // Create new agent with wrapped config
  const wrappedAgent = new Agent({
    name: originalName,
    model: originalModel,
    instructions: createDynamicInstructions(originalInstructions, instructionStyle),
    tools: createDynamicTools(originalTools, naming),
    memory: originalMemory,
    scorers: originalScorers,
    voice: originalVoice,
  });

  // Wrap the stream method to resolve variables in output
  const originalStream = wrappedAgent.stream.bind(wrappedAgent);
  
  (wrappedAgent as any).stream = async function(
    messages: Parameters<typeof wrappedAgent.stream>[0],
    opts?: Parameters<typeof wrappedAgent.stream>[1]
  ) {
    const result = await originalStream(messages, opts);
    const ctx = opts?.runtimeContext ?? new RuntimeContext();
    
    // If there's a textStream, wrap it with variable resolution
    if (result.textStream) {
      const originalTextStream = result.textStream;
      
      const VARIABLE_PATTERN = /\$([a-zA-Z_][a-zA-Z0-9_]*)(\.[a-zA-Z_][a-zA-Z0-9_]*)*/g;
      
      const resolveText = (text: string): string => {
        return text.replace(VARIABLE_PATTERN, (match) => {
          const parsed = parseVariableRef(match);
          const value = getVariable(ctx, parsed.name);
          
          if (value === undefined) return match;
          
          let resolved: unknown = value;
          if (parsed.path.length > 0) {
            resolved = getNestedValue(value, parsed.path);
          }
          
          if (resolved === null) return 'null';
          if (resolved === undefined) return 'undefined';
          if (typeof resolved === 'object') return JSON.stringify(resolved);
          return String(resolved);
        });
      };
      
      const findIncompleteStart = (text: string): number => {
        const lastDollar = text.lastIndexOf('$');
        if (lastDollar === -1) return -1;
        const afterDollar = text.slice(lastDollar);
        if (/^\$[a-zA-Z_][a-zA-Z0-9_]*\.?$/.test(afterDollar) || afterDollar === '$') {
          return lastDollar;
        }
        return -1;
      };
      
      // Create a new ReadableStream that resolves variables
      const transformedStream = new ReadableStream<string>({
        async start(controller) {
          const reader = originalTextStream.getReader();
          let buffer = '';
          
          try {
            while (true) {
              const { done, value } = await reader.read();
              
              if (done) {
                if (buffer) {
                  controller.enqueue(resolveText(buffer));
                }
                controller.close();
                break;
              }
              
              const text = buffer + value;
              const incompleteStart = findIncompleteStart(text);
              
              if (incompleteStart >= 0) {
                const complete = text.slice(0, incompleteStart);
                buffer = text.slice(incompleteStart);
                if (complete) {
                  controller.enqueue(resolveText(complete));
                }
              } else {
                buffer = '';
                controller.enqueue(resolveText(text));
              }
            }
          } catch (error) {
            controller.error(error);
          }
        },
      });

      // Return a proxy that overrides only textStream while preserving
      // the original MastraModelOutput instance (usage, toolCalls, etc.)
      const proxiedResult = new Proxy(result as any, {
        get(target, prop, receiver) {
          if (prop === 'textStream') {
            return transformedStream;
          }
          return Reflect.get(target, prop, receiver);
        },
      });

      return proxiedResult as typeof result;
    }
    
    return result;
  };

  return wrappedAgent as T;
}
