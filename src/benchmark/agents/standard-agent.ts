/**
 * Standard Analytics Agent (No Variable Reuse)
 * 
 * This agent uses tools normally without any variable storage/reuse pattern.
 */

import { Agent } from '@mastra/core/agent';
import {
  searchCustomersTool,
  getTransactionsTool,
  filterDataTool,
  aggregateDataTool,
} from '../tools/analytics-tools';

export const standardAgent = new Agent({
  name: 'Standard Analytics Agent',
  instructions: `
You are a data analytics assistant that helps users analyze customer and transaction data.

You have access to these tools:
- search-customers: Find customers by region
- get-transactions: Get transaction history for customers
- filter-data: Filter datasets by criteria
- aggregate-data: Calculate statistics on data

When the user asks for analysis:
1. Use the appropriate tools to fetch data
2. Process the data as requested
3. Return results in a structured JSON format

IMPORTANT: Always return your final response as a JSON object with this structure:
{
  "answer": "Your natural language answer here",
  "data": { ... any relevant data summaries ... }
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
