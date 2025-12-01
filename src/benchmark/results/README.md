# Variable-Reuse Agent Benchmark

This folder contains JSON results for a benchmark that compares **two ways of using tools in an AI agent**:

- A standard agent that treats each question independently.
- A variable‑reuse agent that remembers past tool outputs as named variables and reuses them in later turns.

The core idea is simple: once you’ve fetched expensive data with tools, you shouldn’t have to keep refetching or re‑describing it in every follow‑up. Instead, you keep it around as structured variables and ask the model to operate on those.

The benchmarks here show how that pattern improves **latency**, **token usage**, and **overall efficiency** in realistic analytics flows.

---

## 1. What the approach is (conceptually)

You can think of the agent’s work in two phases:

- **Fetch phase** – tools are used to pull in rich data (customers, transactions, etc.).
- **Reasoning phase** – the model answers follow‑up questions about that data.

In many agents today, every new user question kicks off another partial fetch phase:

- The agent calls the same tools again with similar parameters.
- Large chunks of data are repeatedly pushed back through the model.

The variable‑reuse approach changes this by introducing a shared scratchpad of **named variables**:

- When a tool runs, its output is saved under a meaningful name, like "customers in California" or "last 12 months of transactions".
- Later questions build on these variables instead of asking tools to do the same work again.

Conceptually, it’s like giving the agent a set of persistent dataframes or objects it can reference directly, rather than forcing it to re‑query the world every turn.

**Why this helps:**

- **Less repeated work** – heavy data fetches happen once per session, not once per follow‑up.
- **Fewer tokens** – prompts don’t need to restate the full data; they can refer to variables and operate on summaries.
- **Faster responses** – less tool I/O and less context to read translate to lower end‑to‑end latency.

The low‑level details of how variables are stored and resolved live elsewhere in the project; this README focuses on the behavior and the measurements.

---

## 2. What this benchmark does

The benchmark compares the standard agent and the variable‑reuse agent on the **same synthetic customer + transactions dataset** and the **same underlying model**.

For each scenario, it:

- Runs a multi‑turn conversation with the standard agent.
- Runs the exact same messages with the variable‑reuse agent.
- Records, per turn:
  - Response time.
  - Input, output, and total token usage (using the model’s own accounting, not an external tokenizer).
  - The full text answer.
- Prints an ASCII table comparing the two.
- Saves a detailed JSON file under this folder with all turns and token usage.

There is also a "single‑turn" mode that runs only the first turn with the variable‑reuse agent and prints the raw model output and usage. That mode is mainly for quick inspection and debugging.

---

## 3. The three scenarios

All three scenarios live in a **customer analytics** setting but stress the system in slightly different ways.

### 3.1 Spend in one region

You start by asking for customers in a specific region (for example, California), then ask increasingly detailed questions about that same group:

1. How many customers are there?
2. What is their average spend?
3. How many spend above a certain threshold?

Once the initial "California customers" dataset exists, the variable‑reuse agent can keep using it across turns instead of rediscovering it.

### 3.2 Time‑series reuse

Here the focus is on **time‑based analytics**:

1. Fetch a year of transaction history for a group of customers and summarize total revenue.
2. Break that same history down by quarter.
3. Identify which month had the highest average order value.

The expensive step is pulling the history. All later questions are just different views on the same data, which is exactly where reuse pays off.

### 3.3 Cohort comparison

This scenario introduces **two distinct cohorts**:

1. Customers in California and their total revenue.
2. Customers in New York and their total revenue.
3. A comparison of the two groups (for example, which has higher average spend and by how much).

The agent benefits from being able to name and keep both cohorts around, rather than repeatedly re‑describing them in natural language.

---

## 4. How to run the benchmarks

From the Mastra server project root:

```bash
# Run all scenarios (standard vs variable for each)
npx tsx src/benchmark/run-benchmark.ts

# Run a single quick test with the variable agent on the first scenario
npx tsx src/benchmark/run-benchmark.ts variable-once
```

After a full run you’ll see:

- Console tables summarizing time, tokens, and cost for both agents per scenario.
- One or more JSON files in this folder containing the full, turn‑by‑turn data.

Those files are what you’d use for charts, screenshots, or deeper analysis of how much the variable‑reuse pattern helps.

---

## 5. How to present this in a blog post

If you want to write about this benchmark, you can frame it around three simple points:

- **Problem** – multi‑turn agents keep paying for the same data over and over, both in latency and tokens.
- **Approach** – treat tool outputs as reusable variables that live across turns and can be referenced by name.
- **Evidence** – show the per‑scenario tables where the variable‑reuse agent:
  - Answers just as well (or better).
  - Uses significantly fewer tokens, especially on later turns.
  - Responds faster end‑to‑end.

The implementation details live elsewhere in the repo. This directory is the place where the **results** and the **story** of the pattern come together.
