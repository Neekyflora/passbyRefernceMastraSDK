/**
 * Benchmark Runner: Standard vs Variable-Reuse Agent
 * 
 * Compares token usage and response time for multi-turn data analytics tasks.
 * Saves full results to JSON file for analysis.
 * 
 * Run with: npx tsx src/benchmark/run-benchmark.ts
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { RuntimeContext } from '@mastra/core/runtime-context';

// ESM compatibility for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { standardAgent } from './agents/standard-agent';
import { variableAgent } from './agents/variable-agent';
import { listVariables } from '../lib';

// Types for metrics
interface TurnMetrics {
  turn: number;
  message: string;
  response: string;  // Full response text
  responseTimeMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  toolCalls: number;
  responseLength: number;
  rawStreamOutput?: unknown;
}

interface BenchmarkResult {
  agentType: 'standard' | 'variable-reuse';
  scenario: string;
  turns: TurnMetrics[];
  totals: {
    responseTimeMs: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    toolCalls: number;
  };
}

// Scenario definitions: all use existing tools & prompts

type ScenarioDef = {
  id: string;
  name: string;
  messages: string[];
};

// Scenario 1: Reuse one regional cohort across multiple questions
const scenarioDataReuse: ScenarioDef = {
  id: 'data-reuse',
  name: 'Customer Analytics – Spend in One Region',
  messages: [
    'Find all customers in California and tell me how many there are.',
    'From those California customers you just found, what is the average totalSpend?',
    'How many of those California customers have totalSpend over $20000?',
  ],
};

// Scenario 2: Heavy time-series fetch, then reuse for follow-up analytics
const scenarioTimeSeries: ScenarioDef = {
  id: 'time-series',
  name: 'Customer Analytics – Time Series on Reused Data',
  messages: [
    'Get the full transaction history for all customers in California for the last 12 months and summarize total revenue.',
    'Using that same transaction data, what was the revenue in each quarter (Q1, Q2, Q3, Q4)?',
    'Using the same data, which month had the highest average order value?',
  ],
};

// Scenario 3: Two cohorts, then compare them
const scenarioCohortCompare: ScenarioDef = {
  id: 'cohort-compare',
  name: 'Customer Analytics – Cohort Comparison',
  messages: [
    'Find all customers in California and summarize their total revenue.',
    'Find all customers in New York and summarize their total revenue.',
    'Compare the California and New York cohorts: which has higher average totalSpend, and by how much?',
  ],
};

const scenarios: ScenarioDef[] = [
  scenarioDataReuse,
  scenarioTimeSeries,
  scenarioCohortCompare,
];

// Helper to run a single turn
async function runAgentTurn(
  agent: any,
  message: string,
  runtimeContext: RuntimeContext,
  previousVarCount: number,
): Promise<{
  response: string;
  metrics: Omit<TurnMetrics, 'turn' | 'message'>;
}> {
  const startTime = Date.now();
  
  // Use stream 
  const result = await agent.stream(message, { runtimeContext });
  
  // Prefer Mastra's getFullOutput which aggregates text, usage, tools, etc.
  let response = '';
  let usage: any = undefined;
  let rawStreamOutput: unknown = undefined;

  if (typeof (result as any).getFullOutput === 'function') {
    const full = await (result as any).getFullOutput();
    response = full?.text ?? '';
    usage = full?.usage;
    rawStreamOutput = full;
  } else {
    // Fallback: consume textStream/text and usage separately
    if (result.textStream?.getReader) {
      const reader = result.textStream.getReader();
      let text = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += value;
      }
      response = text;
    } else if (result.text) {
      response = await result.text;
    }
    usage = await (result as any).usage;
  }

  const endTime = Date.now();
  
  // Read token usage from Mastra stream
  const inputTokens: number =
    usage?.inputTokens ?? usage?.promptTokens ?? 0;
  const outputTokens: number =
    usage?.outputTokens ?? usage?.completionTokens ?? 0;
  const totalTokens: number =
    usage?.totalTokens ?? inputTokens + outputTokens;

  // Count new tool calls by checking new variables (for variable agent)
  const currentVars = listVariables(runtimeContext);
  const newToolCalls = currentVars.length - previousVarCount;
  
  return {
    response,
    metrics: {
      response,  // Include full response
      responseTimeMs: endTime - startTime,
      inputTokens,
      outputTokens,
      totalTokens,
      toolCalls: Math.max(newToolCalls, 0),
      responseLength: response.length,
      rawStreamOutput,
    },
  };
}

async function runBenchmark(
  agent: any,
  agentType: 'standard' | 'variable-reuse',
  scenario: ScenarioDef
): Promise<BenchmarkResult> {
  console.log(`\n🔄 Running ${agentType} agent on "${scenario.name}"...\n`);
  
  const turns: TurnMetrics[] = [];
  const runtimeContext = new RuntimeContext();
  let previousVarCount = 0;
  
  for (let i = 0; i < scenario.messages.length; i++) {
    const message = scenario.messages[i];
    console.log(`  Turn ${i + 1}: "${message.slice(0, 50)}..."`);
    
    try {
      const { response, metrics } = await runAgentTurn(
        agent, 
        message, 
        runtimeContext, 
        previousVarCount,
      );
      previousVarCount = listVariables(runtimeContext).length;
      
      // metrics already contains response, so just spread it
      turns.push({
        turn: i + 1,
        message,
        ...metrics,
      });
      
      console.log(`    ✓ ${metrics.responseTimeMs}ms, ${metrics.inputTokens} in / ${metrics.outputTokens} out tokens, ${metrics.toolCalls} tool calls`);
      
    } catch (error) {
      console.error(`    ✗ Error: ${error}`);
      turns.push({
        turn: i + 1,
        message,
        response: `Error: ${error}`,
        responseTimeMs: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        toolCalls: 0,
        responseLength: 0,
      });
    }
  }
  
  // Calculate totals
  const totals = turns.reduce(
    (acc, t) => ({
      responseTimeMs: acc.responseTimeMs + t.responseTimeMs,
      inputTokens: acc.inputTokens + t.inputTokens,
      outputTokens: acc.outputTokens + t.outputTokens,
      totalTokens: acc.totalTokens + t.totalTokens,
      toolCalls: acc.toolCalls + t.toolCalls,
    }),
    { responseTimeMs: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, toolCalls: 0 }
  );
  
  return {
    agentType,
    scenario: scenario.name,
    turns,
    totals,
  };
}

function printComparison(standard: BenchmarkResult, variable: BenchmarkResult) {
  console.log('\n' + '='.repeat(70));
  console.log('                    BENCHMARK RESULTS');
  console.log('='.repeat(70));
  
  console.log(`\nScenario: ${standard.scenario}`);
  console.log(`Turns: ${standard.turns.length}`);
  
  console.log('\n┌─────────────────────┬──────────────┬──────────────┬─────────────┐');
  console.log('│ Metric              │ Standard     │ Variable     │ Improvement │');
  console.log('├─────────────────────┼──────────────┼──────────────┼─────────────┤');
  
  // Calculate total response length
  const stdResponseLen = standard.turns.reduce((sum, t) => sum + t.responseLength, 0);
  const varResponseLen = variable.turns.reduce((sum, t) => sum + t.responseLength, 0);
  
  const metrics = [
    { name: 'Response Time (ms)', std: standard.totals.responseTimeMs, var: variable.totals.responseTimeMs },
    { name: 'Response Length', std: stdResponseLen, var: varResponseLen },
    { name: 'Total Tokens', std: standard.totals.totalTokens, var: variable.totals.totalTokens },
  ];
  
  for (const m of metrics) {
    const improvement = m.std > 0 ? ((m.std - m.var) / m.std * 100).toFixed(1) : '0.0';
    const sign = parseFloat(improvement) >= 0 ? '-' : '+';
    const absImprovement = Math.abs(parseFloat(improvement)).toFixed(1);
    
    console.log(
      `│ ${m.name.padEnd(19)} │ ${String(m.std).padStart(12)} │ ${String(m.var).padStart(12)} │ ${(sign + absImprovement + '%').padStart(11)} │`
    );
  }
  
  console.log('└─────────────────────┴──────────────┴──────────────┴─────────────┘');
  
  // Cost estimate (GPT-4o-mini pricing: $0.15/1M input, $0.60/1M output)
  const stdCost = (standard.totals.inputTokens * 0.15 + standard.totals.outputTokens * 0.60) / 1000000;
  const varCost = (variable.totals.inputTokens * 0.15 + variable.totals.outputTokens * 0.60) / 1000000;
  const costSavings = stdCost > 0 ? ((stdCost - varCost) / stdCost * 100).toFixed(1) : '0.0';
  
  console.log(`\n💰 Estimated Cost (GPT-4o-mini):`);
  console.log(`   Standard: $${stdCost.toFixed(6)}`);
  console.log(`   Variable: $${varCost.toFixed(6)}`);
  console.log(`   Savings:  ${costSavings}%`);
  
  // Per-turn breakdown
  console.log('\n📊 Per-Turn Breakdown:');
  console.log('┌──────┬────────────────────────────────────┬───────────┬───────────┐');
  console.log('│ Turn │ Message                            │ Std Time  │ Var Time  │');
  console.log('├──────┼────────────────────────────────────┼───────────┼───────────┤');
  
  for (let i = 0; i < standard.turns.length; i++) {
    const stdTurn = standard.turns[i];
    const varTurn = variable.turns[i];
    const msgPreview = stdTurn.message.slice(0, 34).padEnd(34);
    
    console.log(
      `│ ${String(i + 1).padStart(4)} │ ${msgPreview} │ ${(stdTurn.responseTimeMs + 'ms').padStart(9)} │ ${(varTurn.responseTimeMs + 'ms').padStart(9)} │`
    );
  }
  
  console.log('└──────┴────────────────────────────────────┴───────────┴───────────┘');
  
  console.log('\n' + '='.repeat(70));
}

async function main() {
  console.log('🧪 Agent Benchmark: Standard vs Variable-Reuse');
  console.log('================================================\n');
  
  console.log('📋 Scenarios:');
  scenarios.forEach((s, i) => console.log(`   ${i + 1}. ${s.name}`));
  
  const scenarioResults: {
    scenario: ScenarioDef;
    standard: BenchmarkResult;
    variable: BenchmarkResult;
  }[] = [];

  for (const scenario of scenarios) {
    console.log('\n' + '-'.repeat(70));
    console.log(`Scenario: ${scenario.name}`);
    console.log('Messages:');
    scenario.messages.forEach((m, i) => console.log(`  ${i + 1}. ${m}`));

    const standardResult = await runBenchmark(standardAgent, 'standard', scenario);
    const variableResult = await runBenchmark(variableAgent, 'variable-reuse', scenario);

    printComparison(standardResult, variableResult);

    scenarioResults.push({ scenario, standard: standardResult, variable: variableResult });
  }

  // Prepare results object
  const results = {
    timestamp: new Date().toISOString(),
    scenarios: scenarioResults,
  };
  
  // Create results directory if it doesn't exist
  const resultsDir = path.join(__dirname, 'results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  
  // Generate filename with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `benchmark-${timestamp}.json`;
  const filepath = path.join(resultsDir, filename);
  
  // Save to file
  fs.writeFileSync(filepath, JSON.stringify(results, null, 2));
  console.log(`\n📁 Results saved to: ${filepath}`);
  
  // Also save a "latest" file for easy access
  const latestPath = path.join(resultsDir, 'latest.json');
  fs.writeFileSync(latestPath, JSON.stringify(results, null, 2));
  console.log(`📁 Latest results: ${latestPath}`);
}

async function mainCli() {
  const mode = process.argv[2];

  // Quick test mode: single turn with variable agent only
  if (mode === 'variable-once') {
    console.log('🧪 Single-turn test: Variable-Reuse Agent');
    console.log('========================================\n');

    const runtimeContext = new RuntimeContext();
    const message = scenarioDataReuse.messages[0];
    console.log(`Turn 1 message: ${message}\n`);

    const { response, metrics } = await runAgentTurn(
      variableAgent,
      message,
      runtimeContext,
      0,
    );

    console.log('Response:\n');
    console.log(response);
    console.log('\nMetrics:');
    console.log(`  Time:          ${metrics.responseTimeMs}ms`);
    console.log(`  Tokens:        ${metrics.inputTokens} in / ${metrics.outputTokens} out (total ${metrics.totalTokens})`);
    console.log(`  Tool calls:    ${metrics.toolCalls}`);
    console.log(`  Response len:  ${metrics.responseLength}`);

    if (metrics.rawStreamOutput !== undefined) {
      console.log('\nRaw stream output (from getFullOutput):');
      console.log(JSON.stringify(metrics.rawStreamOutput, null, 2));
    }

    return;
  }

  // Default: full benchmark
  await main();
}

mainCli().catch(console.error);
