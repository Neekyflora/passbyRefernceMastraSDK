# Tool Output Variables for Mastra Agents

A pattern for making multi-turn AI agents **faster** and **cheaper** by letting them pass data by reference instead of forcing the model to re-write the same tool outputs over and over.

---

## The Problem
When an agent uses tools across multiple turns, it often ends up doing redundant work:
1. **Step 1** – The user asks a question. The agent calls a tool, gets back a big chunk of data (say, 50 customer records)

2. **Step 2** – The agent now can either pass this data to a tool for further analysis or to the user if thet asked for it
    - Re-write Issue now the agent has to remember the whole json and either write it again as a tool input or steam it to the user.
    - This leads to a lot of time and token waste,

The tool output is already present in the history; the waste comes from the model having to **re-author and re-paste** large structures every time it wants to pass that data along. That costs tokens and time.

---

## The Idea

What if the agent could just say "use the data from before" instead of spelling it all out again?

That's what this pattern does:

- When a tool runs, its output is automatically saved as a **named variable** (e.g., `$customers_california`).
- On later turns, the agent can **reference that variable** instead of writing the whole thing out again from scratch.
- Tools can accept variable references as inputs, so the agent can say "filter `$customers_california` by spend > 20k" without reconstructing the full JSON payload in its own words.

The tool still gives the model whatever it needs to answer the question, but the model doesn't have to keep **re‑authoring** that data in subsequent turns. It can point to a short variable instead of regenerating a long, detailed structure.

---

## Why This Saves Tokens and Time

| Without variables | With variables |
|-------------------|----------------|
| Agent must reconstruct full outputs in its own words | Agent can point to a short variable name |
| Agent writes large structures back into responses | Agent writes a compact reference |
| Tools may be called repeatedly with similar inputs | Tools can be called once and reused via variables |
| Token usage grows with each follow-up | Token usage stays flat after the first fetch |

The savings compound over multi-turn conversations. The more follow-ups, the bigger the gap.

---

## How It Works (High Level)

1. **Wrap your agent** with a thin layer that:
   - Intercepts tool calls and saves their outputs as variables.
   - Injects a short instruction telling the model how to use `$variable` syntax.
   - Resolves `$variable` references in tool inputs and streamed text.

2. **Use the agent normally** – call `.stream()` or `.generate()` as usual.

3. **On follow-up turns**, the model naturally starts referencing variables instead of repeating data, because:
   - It's told that variables exist.
   - It's faster and easier than re-describing everything.

No changes to your original agent prompts or tool definitions are required.

---

## Example Flow

**Turn 1**

> User: "Find all customers in California and tell me how many there are."

- Agent calls `search-customers` tool.
- Tool returns 50 records.
- Output is saved as `$customers_california`.
- Agent responds: "There are 50 customers in California."

**Turn 2**

> User: "What's the average spend for those customers?"

- Agent sees `$customers_california` is available.
- Instead of re-fetching or re-reading 50 records, it calls `aggregate-data` with input `{ data: "$customers_california", operation: "average", field: "totalSpend" }`.
- The system resolves `$customers_california` to the actual data before the tool runs.
- Agent responds with the average.

**Turn 3**

> User: "How many of them spent over $20,000?"

- Agent calls `filter-data` with `{ data: "$customers_california", condition: "totalSpend > 20000" }`.
- The system resolves the variable into the full dataset for the tool, but the model itself doesn't have to re-write that dataset again.
- Agent responds with the count.

In the standard approach, each of these turns would involve the model **reconstructing** or **re-describing** big chunks of the customer list so the next step can see them. With variables, it just passes short references and lets the system handle the heavy data.

---

## What's in This Repo

```
mastra-server/
├── src/
│   ├── lib/                    # The variable-reuse pattern implementation
│   │   ├── variable-store      # Store/retrieve variables in runtime context
│   │   ├── variable-resolver   # Parse and resolve $var.field references
│   │   ├── variable-agent      # Agent wrapper (main entry point)
│   │   ├── variable-stream     # Resolve variables in streamed output
│   │   └── prompts             # Dynamic instructions for the model
│   │
│   ├── benchmark/              # Benchmark comparing standard vs variable agents
│   │   ├── agents/             # Standard and variable-wrapped agents
│   │   ├── tools/              # Synthetic analytics tools
│   │   ├── run-benchmark.ts    # Benchmark runner
│   │   └── results/            # JSON output from benchmark runs
│   │
│   └── mastra/                 # Mastra server setup
│
└── README.md                   # This file
```

---

## Running the Benchmark

The benchmark runs the same multi-turn analytics scenarios with both agent types and compares:

- Response time per turn
- Token usage (input, output, total)
- Cost estimate

```bash
cd mastra-server

# Run all scenarios
npx tsx src/benchmark/run-benchmark.ts

# Quick single-turn test
npx tsx src/benchmark/run-benchmark.ts variable-once
```

Results are saved to `src/benchmark/results/` as JSON files.

### Sample Benchmark Result (Scenario 1)

**Scenario:** Customer Analytics – Spend in One Region  
3 turns: initial cohort fetch + two follow-ups on the same cohort.

| Metric              | Standard     | Variable-Reuse | Improvement |
|---------------------|--------------|----------------|------------:|
| Response Time (ms)  | 263,137      | 18,868         |      -92.8% |
| Response Length     | 4,769 chars  | 539 chars      |      -88.7% |
| Total Tokens        | 79,440       | 14,004         |      -82.4% |

**Estimated cost (GPT-4o-mini pricing):**

- Standard: `$0.017342`
- Variable-reuse: `$0.002230`
- Savings: `87.1%` on this scenario alone

All of this comes from a single command:

```bash
npx tsx src/benchmark/run-benchmark.ts
```

---

## Quick Example: Analytics Agent

If you just want to *feel* the difference between a standard agent and a variable-reuse agent without running the full benchmark, there is a small example wired up under `src/examples/analytics-agent/`.

It runs a single analytics-style question through both agents on the same mock data tools and prints:

- Response time
- Token usage (input / output / total)
- The final answer text

From the `mastra-server` folder:

```bash
npm install
npm run example:analytics
```

You can also pass your own question:

```bash
npm run example:analytics -- "Compare revenue between California and New York"
```

This is the simplest way to see the pattern in action on a single turn.

---

## Key Takeaway

The core insight is simple:

> **Don't make the model re-write large tool outputs just to pass data along. Let it pass references instead.**

This pattern wraps that idea into a reusable layer for Mastra agents. The benchmarks show it can cut token usage by 50–80% and response time by similar margins on multi-turn flows.
