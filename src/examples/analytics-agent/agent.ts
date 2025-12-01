import { Agent } from "@mastra/core/agent";
import { RuntimeContext } from "@mastra/core/runtime-context";
import { withToolVariables } from "../../lib";
import {
  searchCustomersTool,
  getTransactionsTool,
  filterDataTool,
  aggregateDataTool,
} from "./tools";

export const standardAgent = new Agent({
  name: "Standard Analytics Agent (Example)",
  instructions: `You are a data analytics assistant. Use the tools to explore customer and transaction data and answer the user's question.

Always return a JSON object with:
{
  "answer": "natural language answer",
  "data": { "any": "supporting details or aggregates" }
}
`,
  model: "openai/gpt-4o-mini",
  tools: {
    "search-customers": searchCustomersTool,
    "get-transactions": getTransactionsTool,
    "filter-data": filterDataTool,
    "aggregate-data": aggregateDataTool,
  },
});

// A wrapped version that saves tool outputs as variables and reuses them
export const variableAgent = withToolVariables(standardAgent, {
  naming: (toolId, input) => {
    const inputObj = (input || {}) as Record<string, unknown>;

    if (toolId === "search-customers" && typeof inputObj.region === "string") {
      const region = inputObj.region.toLowerCase().replace(/[^a-z0-9]+/g, "_");
      return `customers_${region}`;
    }

    if (toolId === "get-transactions") {
      return `transactions_${Date.now()}`;
    }

    if (toolId === "filter-data") {
      const dataType = (inputObj.dataType as string) || "data";
      return `filtered_${dataType}_${Date.now()}`;
    }

    if (toolId === "aggregate-data") {
      return `stats_${Date.now()}`;
    }

    return `${toolId.replace(/-/g, "_")}_${Date.now()}`;
  },
});

export function createRuntimeContext() {
  return new RuntimeContext();
}
