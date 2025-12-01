/**
 * Variable-Reuse Analytics Agent
 * 
 * This agent uses our withToolVariables wrapper to:
 * - Save tool outputs as variables in RuntimeContext
 * - Resolve $variable references in tool inputs
 * - Inject available variables into dynamic instructions
 */

import { Agent } from '@mastra/core/agent';
import {
  searchCustomersTool,
  getTransactionsTool,
  filterDataTool,
  aggregateDataTool,
} from '../tools/analytics-tools';
import { withToolVariables } from '../../lib';

// Base agent without variable wrapper
const baseAnalyticsAgent = new Agent({
  name: 'Variable-Reuse Analytics Agent',
  instructions: `
You are a data analytics assistant that helps users analyze customer and transaction data.

You have access to these tools:
- search-customers: Find customers by region
- get-transactions: Get transaction history for customers  
- filter-data: Filter datasets by criteria
- aggregate-data: Calculate statistics on data

When analyzing data:
1. Use the appropriate tools to fetch data
2. For follow-up operations, use saved variables instead of re-fetching
3. Pass variable references (like $customers_california) to tools that need data

IMPORTANT: Always return your final response as a JSON object with this structure:
{
  "answer": "Your natural language answer here",
  "data": { ... any relevant data summaries ... },
  "variablesUsed": ["list of variable names you referenced"]
}
`,
  model: 'openai/gpt-4o-mini',
  tools: {
    'search-customers': searchCustomersTool,
    'get-transactions': getTransactionsTool,
    'filter-data': filterDataTool,
    'aggregate-data': aggregateDataTool,
  },
});

// Export agent wrapped with variable support
export const variableAgent = withToolVariables(baseAnalyticsAgent, {
  // Custom naming for analytics tools
  naming: (toolId, input) => {
    const inputObj = input as Record<string, unknown>;
    
    if (toolId === 'search-customers' && typeof inputObj?.region === 'string') {
      const region = inputObj.region.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      return `customers_${region}`;
    }
    
    if (toolId === 'get-transactions') {
      return `transactions_${Date.now()}`;
    }
    
    if (toolId === 'filter-data') {
      const dataType = inputObj?.dataType || 'data';
      return `filtered_${dataType}_${Date.now()}`;
    }
    
    if (toolId === 'aggregate-data') {
      return `stats_${Date.now()}`;
    }
    
    return `${toolId.replace(/-/g, '_')}_${Date.now()}`;
  },
});
