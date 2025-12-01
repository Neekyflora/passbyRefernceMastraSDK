# Tool Output Variables Pattern - Final Implementation Plan

## Overview

An npm package (`mastra-tool-variables`) that improves AI agent accuracy, speed, and token efficiency by:
- Storing tool outputs as named variables in `RuntimeContext`
- Resolving `$variable` references in tool inputs automatically
- Resolving `$variable` references in streamed text output
- Dynamically injecting variable usage instructions into agent prompts

---

## Package API

### Primary Export: `withToolVariables(agent, options?)`

A single agent wrapper that handles everything:

```typescript
import { Agent } from '@mastra/core/agent';
import { withToolVariables } from 'mastra-tool-variables';

const baseAgent = new Agent({
  name: 'Weather Agent',
  instructions: 'You help with weather and activities.',
  model: 'openai/gpt-4o-mini',
  tools: { weatherTool, activityTool },
});

// One line to enable the pattern
export const agent = withToolVariables(baseAgent);
```

### What the wrapper does:

1. **Wraps all tools** to:
   - Resolve `$var` references in inputs before execution
   - Save outputs as variables after execution
   
2. **Makes instructions dynamic** to:
   - Append variable usage guide
   - List currently available variables
   
3. **Wraps `stream()` method** to:
   - Resolve `$var` references in streamed text chunks

---

## File Structure

```
src/lib/
├── variable-store.ts        # Get/set variables in RuntimeContext
├── variable-resolver.ts     # Parse and resolve $var.field references
├── variable-tool-wrapper.ts # Wrap tools to save outputs + resolve inputs
├── variable-stream.ts       # Transform stream to resolve $var in text
├── variable-agent.ts        # Agent wrapper (main export)
├── prompts.ts               # System prompt templates
└── index.ts                 # Public exports
```

---

## Implementation Details

### 1. Variable Store (`variable-store.ts`)

Uses `RuntimeContext` as the backing store (session-scoped, no cleanup needed).

```typescript
const STORE_KEY = '__tool_variables';

interface StoredVariable {
  value: unknown;
  toolId: string;
  timestamp: number;
}

export function getStore(ctx: RuntimeContext): Map<string, StoredVariable>;
export function setVariable(ctx: RuntimeContext, name: string, value: unknown, toolId: string): void;
export function getVariable(ctx: RuntimeContext, name: string): unknown | undefined;
export function listVariables(ctx: RuntimeContext): Array<{ name: string; toolId: string; preview: string }>;
```

### 2. Variable Resolver (`variable-resolver.ts`)

Parses `$var` and `$var.field.subfield` syntax.

```typescript
// Regex: /\$([a-zA-Z_][a-zA-Z0-9_]*)(\.[a-zA-Z_][a-zA-Z0-9_]*)*/g

export function resolveVariables(value: unknown, ctx: RuntimeContext): unknown;
export function resolveString(str: string, ctx: RuntimeContext): string | unknown;
export function containsVariableRef(value: unknown): boolean;
```

**Resolution rules:**
- `"$weather_nyc"` → returns full stored value
- `"$weather_nyc.temperature"` → returns nested field
- `"The temp is $weather_nyc.temperature°F"` → returns string with value interpolated
- Objects/arrays → recursively resolve all string values

### 3. Tool Wrapper (`variable-tool-wrapper.ts`)

```typescript
export interface WrapOptions {
  // Custom naming function (default: toolId_timestamp)
  naming?: (toolId: string, input: unknown, output: unknown) => string;
}

export function wrapTools(
  tools: Record<string, Tool>,
  options?: WrapOptions
): Record<string, Tool>;
```

**Wrapped tool behavior:**
1. Before execute: `resolveVariables(context, runtimeContext)`
2. Call original `execute()`
3. After execute: `setVariable(runtimeContext, varName, result, toolId)`
4. Return original result (no modification)

### 4. Stream Transformer (`variable-stream.ts`)

```typescript
export function createVariableStreamTransform(
  ctx: RuntimeContext
): TransformStream<TextStreamPart, TextStreamPart>;
```

**How it works:**
- Buffers text chunks to handle split tokens (e.g., `$weather_` + `nyc`)
- Detects complete `$var` patterns using regex
- Resolves and replaces before forwarding
- Flushes buffer on stream end

**Edge cases handled:**
- `$var` split across chunks → buffer until complete
- `$var.field` at end of chunk → wait for more or flush
- Non-text chunks (tool calls, etc.) → pass through unchanged

### 5. Agent Wrapper (`variable-agent.ts`)

```typescript
export interface ToolVariablesOptions {
  naming?: (toolId: string, input: unknown, output: unknown) => string;
  instructionStyle?: 'full' | 'minimal';
}

export function withToolVariables<T extends Agent>(
  agent: T,
  options?: ToolVariablesOptions
): T;
```

**Implementation:**
```typescript
export function withToolVariables(agent, options = {}) {
  // 1. Get original config
  const originalTools = agent.tools;
  const originalInstructions = agent.instructions;
  
  // 2. Wrap tools
  const wrappedTools = wrapTools(originalTools, { naming: options.naming });
  
  // 3. Make instructions dynamic
  const dynamicInstructions = ({ runtimeContext, ...rest }) => {
    const base = typeof originalInstructions === 'function'
      ? originalInstructions({ runtimeContext, ...rest })
      : originalInstructions;
    
    return `${base}\n\n${getVariableInstructions(runtimeContext)}`;
  };
  
  // 4. Create new agent with wrapped config
  const wrappedAgent = new Agent({
    ...agent.config,
    tools: wrappedTools,
    instructions: dynamicInstructions,
  });
  
  // 5. Wrap stream method
  const originalStream = wrappedAgent.stream.bind(wrappedAgent);
  wrappedAgent.stream = async (prompt, opts) => {
    const result = await originalStream(prompt, opts);
    const runtimeContext = opts?.runtimeContext ?? new RuntimeContext();
    
    return {
      ...result,
      textStream: result.textStream.pipeThrough(
        createVariableStreamTransform(runtimeContext)
      ),
    };
  };
  
  return wrappedAgent;
}
```

### 6. Prompts (`prompts.ts`)

```typescript
export function getVariableInstructions(ctx: RuntimeContext): string {
  const vars = listVariables(ctx);
  
  const header = `
## Tool Output Variables

Tool outputs are automatically saved as variables. Use them in subsequent tool calls:
- Pass full data: \`{ "weather": "$weather_nyc" }\`
- Access fields: \`{ "temp": "$weather_nyc.temperature" }\`

This is faster and more accurate than re-describing data.
`;

  if (vars.length === 0) {
    return header + '\nNo variables saved yet.';
  }
  
  const list = vars.map(v => `- \`$${v.name}\` (${v.toolId}): ${v.preview}`).join('\n');
  return header + `\n### Available Variables:\n${list}`;
}
```

---

## Usage Example

```typescript
// src/mastra/agents/weather-agent.ts
import { Agent } from '@mastra/core/agent';
import { withToolVariables } from '../../lib';
import { weatherTool } from '../tools/weather-tool';

const baseAgent = new Agent({
  name: 'Weather Agent',
  instructions: `
    You are a helpful weather assistant.
    Always ask for a location if none is provided.
  `,
  model: 'openai/gpt-4o-mini',
  tools: { weatherTool },
});

export const weatherAgent = withToolVariables(baseAgent, {
  naming: (toolId, input) => {
    if (toolId === 'get-weather' && input?.location) {
      return `weather_${input.location.toLowerCase().replace(/\s+/g, '_')}`;
    }
    return `${toolId}_${Date.now()}`;
  },
});
```

**Conversation flow:**

```
User: What's the weather in NYC?

→ Agent calls get-weather({ location: "NYC" })
→ Tool executes, returns { temperature: 72, humidity: 45, ... }
→ Output saved as $weather_nyc
→ Agent sees in instructions: "Available: $weather_nyc (get-weather): {temperature: 72, ...}"

Agent: It's 72°F in NYC with 45% humidity.

User: What about London? Then compare them.

→ Agent calls get-weather({ location: "London" })
→ Output saved as $weather_london

→ Agent calls compare-weather({ city1: "$weather_nyc", city2: "$weather_london" })
→ System resolves to actual data before calling tool
→ Tool receives full weather objects, not strings

Agent: NYC is warmer at 72°F vs London's 58°F...
```

---

## Benefits

| Metric | Without | With Variables |
|--------|---------|----------------|
| Token usage | Full data repeated | Reference only (~70% reduction) |
| Accuracy | LLM may misremember | Exact data passed |
| Speed | More tokens = slower | Fewer tokens = faster |
| Tool chaining | Re-describe data | Pass by reference |

---

## Next Steps

1. [x] Finalize this spec
2. [ ] Implement `variable-store.ts`
3. [ ] Implement `variable-resolver.ts`
4. [ ] Implement `variable-tool-wrapper.ts`
5. [ ] Implement `variable-stream.ts`
6. [ ] Implement `variable-agent.ts` + `prompts.ts`
7. [ ] Create `index.ts` exports
8. [ ] Update weather agent example
9. [ ] Test end-to-end
