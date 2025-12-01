import { RuntimeContext } from "@mastra/core/runtime-context";
import { standardAgent, variableAgent } from "./agent";

async function runOnce() {
  const message =
    process.argv.slice(2).join(" ") ||
    "Find high-value customers in California and summarize their total spend.";

  const runtimeContext = new RuntimeContext();

  async function runAgent(label: string, agent: any) {
    const start = Date.now();
    const result = await agent.stream(message, { runtimeContext });

    let text = "";
    let usage: any = undefined;

    if (typeof result.getFullOutput === "function") {
      const full = await result.getFullOutput();
      text = full?.text ?? "";
      usage = full?.usage;
    } else {
      if (result.textStream?.getReader) {
        const reader = result.textStream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          text += value;
        }
      } else if (result.text) {
        text = await result.text;
      }
      usage = await (result as any).usage;
    }

    const end = Date.now();
    const ms = end - start;

    const inputTokens =
      usage?.inputTokens ?? usage?.promptTokens ?? 0;
    const outputTokens =
      usage?.outputTokens ?? usage?.completionTokens ?? 0;
    const totalTokens =
      usage?.totalTokens ?? inputTokens + outputTokens;

    console.log(`\n=== ${label} ===`);
    console.log(`Prompt: ${message}`);
    console.log(`Time:   ${ms}ms`);
    console.log(
      `Tokens: ${inputTokens} in / ${outputTokens} out (total ${totalTokens})`,
    );
    console.log("\nResponse:\n");
    console.log(text);
  }

  await runAgent("Standard agent (no variables)", standardAgent);
  await runAgent("Variable-reuse agent", variableAgent);
}

runOnce().catch((err) => {
  console.error(err);
  process.exit(1);
});
