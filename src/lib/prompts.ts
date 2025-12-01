import { RuntimeContext } from '@mastra/core/runtime-context';
import { listVariables } from './variable-store';

export type InstructionStyle = 'full' | 'minimal';

/**
 * Generate the variable usage instructions to append to agent prompts
 */
export function getVariableInstructions(
  ctx: RuntimeContext,
  style: InstructionStyle = 'full'
): string {
  const vars = listVariables(ctx);
  
  if (style === 'minimal') {
    return getMinimalInstructions(vars);
  }
  
  return getFullInstructions(vars);
}

function getFullInstructions(vars: Array<{ name: string; toolId: string; preview: string }>): string {
  const header = `
## Tool Output Variables

When you call tools, their outputs are automatically saved as variables that you can reference in subsequent tool calls.

### How to use:
- Reference full output: \`"$variable_name"\`
- Reference a field: \`"$variable_name.field"\`
- Reference nested field: \`"$variable_name.field.subfield"\`

### Example:
If you call get-weather for NYC and it saves as \`$get_weather_nyc\`, you can then call another tool with:
\`\`\`json
{ "weatherData": "$get_weather_nyc", "temperature": "$get_weather_nyc.temperature" }
\`\`\`

The system automatically resolves these to the actual values. This is faster and more accurate than re-describing data.

### Important:
- Use variables in tool call arguments, not in your text responses
- Variables are resolved automatically before tools execute
- This saves tokens and ensures data accuracy
`;

  if (vars.length === 0) {
    return header + '\n### Available Variables:\nNo variables saved yet. Call a tool to create one.\n';
  }
  
  const varList = vars
    .map(v => `- \`$${v.name}\` (from ${v.toolId}): ${v.preview}`)
    .join('\n');
  
  return header + `\n### Available Variables:\n${varList}\n`;
}

function getMinimalInstructions(vars: Array<{ name: string; toolId: string; preview: string }>): string {
  if (vars.length === 0) {
    return `Tool outputs are saved as variables (e.g., \`$tool_result\`). Use them in subsequent tool calls.`;
  }
  
  const varList = vars
    .map(v => `\`$${v.name}\``)
    .join(', ');
  
  return `Available variables: ${varList}. Use in tool calls like: \`{ "data": "$variable_name" }\``;
}
