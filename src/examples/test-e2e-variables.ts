/**
 * End-to-End Test for Tool Output Variables
 * 
 * This test simulates a real multi-turn conversation to verify:
 * 1. Variables are saved when tools are called
 * 2. Agent uses saved variables for subsequent tool calls
 * 3. Agent references saved variables in responses
 * 4. Variables persist across multiple messages in the same session
 * 
 * Run with: npx tsx src/examples/test-e2e-variables.ts
 */

import 'dotenv/config';
import { RuntimeContext } from '@mastra/core/runtime-context';
import { mastra } from '../mastra';
import { listVariables, getVariable } from '../lib';

// Helper to consume a stream and return the full text
async function consumeStream(textStream: ReadableStream<string>): Promise<string> {
  const reader = textStream.getReader();
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += value;
  }
  return text;
}

// Helper to print a separator
function separator(title: string) {
  console.log('\n' + '='.repeat(60));
  console.log(`  ${title}`);
  console.log('='.repeat(60) + '\n');
}

// Helper to print variables state
function printVariables(ctx: RuntimeContext, label: string) {
  const vars = listVariables(ctx);
  console.log(`\n📦 ${label} (${vars.length} variables):`);
  if (vars.length === 0) {
    console.log('   (none)');
  } else {
    vars.forEach(v => {
      const value = getVariable(ctx, v.name);
      const preview = typeof value === 'object' 
        ? JSON.stringify(value).slice(0, 80) + '...'
        : String(value);
      console.log(`   $${v.name}: ${preview}`);
    });
  }
}

async function runE2ETest() {
  console.log('🧪 End-to-End Test: Tool Output Variables');
  console.log('=========================================\n');
  
  const agent = mastra.getAgent('weatherAgent');
  
  // Create a RuntimeContext that persists across the conversation
  // This simulates a single user session
  const runtimeContext = new RuntimeContext();
  
  // Get memory for thread management
  const memory = await agent.getMemory();
  
  // Create a thread for this conversation
  const thread = await memory?.createThread({
    resourceId: 'test-user-e2e',
    title: 'E2E Variable Test',
    metadata: { test: 'e2e-variables' },
  });
  
  const threadId = thread?.id ?? `test-thread-${Date.now()}`;
  const resourceId = thread?.resourceId ?? 'test-user-e2e';
  
  console.log(`📝 Thread created: ${threadId}`);
  console.log(`👤 Resource ID: ${resourceId}\n`);

  // ============================================
  // Message 1: Get weather for first city
  // ============================================
  separator('MESSAGE 1: Get weather for New York');
  
  const message1 = "What's the weather in New York?";
  console.log(`👤 User: ${message1}`);
  
  const result1 = await agent.stream(message1, {
    runtimeContext,
    memory: { thread: threadId, resource: resourceId },
  });
  
  const response1 = await consumeStream(result1.textStream);
  console.log(`\n🤖 Agent: ${response1}`);
  
  printVariables(runtimeContext, 'Variables after Message 1');
  
  // Verify variable was saved
  const nycWeather = getVariable(runtimeContext, 'weather_new_york');
  if (nycWeather) {
    console.log('\n✅ TEST PASSED: $weather_new_york saved');
  } else {
    console.log('\n❌ TEST FAILED: $weather_new_york not found');
    // Check what variables exist
    const vars = listVariables(runtimeContext);
    if (vars.length > 0) {
      console.log('   Found variables:', vars.map(v => v.name).join(', '));
    }
  }

  // ============================================
  // Message 2: Get weather for second city
  // ============================================
  separator('MESSAGE 2: Get weather for London');
  
  const message2 = "What about London?";
  console.log(`👤 User: ${message2}`);
  
  const result2 = await agent.stream(message2, {
    runtimeContext,
    memory: { thread: threadId, resource: resourceId },
  });
  
  const response2 = await consumeStream(result2.textStream);
  console.log(`\n🤖 Agent: ${response2}`);
  
  printVariables(runtimeContext, 'Variables after Message 2');
  
  // Verify second variable was saved
  const londonWeather = getVariable(runtimeContext, 'weather_london');
  if (londonWeather) {
    console.log('\n✅ TEST PASSED: $weather_london saved');
  } else {
    console.log('\n❌ TEST FAILED: $weather_london not found');
  }

  // ============================================
  // Message 3: Compare cities (should use saved variables)
  // ============================================
  separator('MESSAGE 3: Compare cities (should use saved variables)');
  
  const message3 = "Which city is warmer, New York or London? Compare them.";
  console.log(`👤 User: ${message3}`);
  
  // Count variables before
  const varsBefore = listVariables(runtimeContext).filter(v => v.toolId === 'get-weather').length;
  
  const result3 = await agent.stream(message3, {
    runtimeContext,
    memory: { thread: threadId, resource: resourceId },
  });
  
  const response3 = await consumeStream(result3.textStream);
  console.log(`\n🤖 Agent: ${response3}`);
  
  // Count variables after
  const varsAfter = listVariables(runtimeContext).filter(v => v.toolId === 'get-weather').length;
  
  printVariables(runtimeContext, 'Variables after Message 3');
  
  // Check if agent made new API calls or used existing data
  if (varsAfter === varsBefore) {
    console.log('\n✅ TEST PASSED: Agent used existing variables (no new API calls)');
  } else {
    console.log(`\n⚠️ Agent made ${varsAfter - varsBefore} new API call(s)`);
    console.log('   This might be okay if the agent decided to refresh the data');
  }

  // ============================================
  // Message 4: Get weather for third city
  // ============================================
  separator('MESSAGE 4: Get weather for Tokyo');
  
  const message4 = "What's the weather in Tokyo?";
  console.log(`👤 User: ${message4}`);
  
  const result4 = await agent.stream(message4, {
    runtimeContext,
    memory: { thread: threadId, resource: resourceId },
  });
  
  const response4 = await consumeStream(result4.textStream);
  console.log(`\n🤖 Agent: ${response4}`);
  
  printVariables(runtimeContext, 'Variables after Message 4');
  
  // Verify Tokyo variable was saved
  const tokyoWeather = getVariable(runtimeContext, 'weather_tokyo');
  if (tokyoWeather) {
    console.log('\n✅ TEST PASSED: $weather_tokyo saved');
  } else {
    console.log('\n❌ TEST FAILED: $weather_tokyo not found');
  }

  // ============================================
  // Message 5: Compare all three cities
  // ============================================
  separator('MESSAGE 5: Compare all three cities');
  
  const message5 = "Rank all three cities (New York, London, Tokyo) by temperature from warmest to coldest.";
  console.log(`👤 User: ${message5}`);
  
  const varsBeforeRank = listVariables(runtimeContext).filter(v => v.toolId === 'get-weather').length;
  
  const result5 = await agent.stream(message5, {
    runtimeContext,
    memory: { thread: threadId, resource: resourceId },
  });
  
  const response5 = await consumeStream(result5.textStream);
  console.log(`\n🤖 Agent: ${response5}`);
  
  const varsAfterRank = listVariables(runtimeContext).filter(v => v.toolId === 'get-weather').length;
  
  printVariables(runtimeContext, 'Variables after Message 5');
  
  if (varsAfterRank === varsBeforeRank) {
    console.log('\n✅ TEST PASSED: Agent used existing variables for ranking');
  } else {
    console.log(`\n⚠️ Agent made ${varsAfterRank - varsBeforeRank} new API call(s)`);
  }

  // ============================================
  // Message 6: Ask about specific variable data
  // ============================================
  separator('MESSAGE 6: Ask about specific data from variables');
  
  const message6 = "What was the humidity in New York?";
  console.log(`👤 User: ${message6}`);
  
  const result6 = await agent.stream(message6, {
    runtimeContext,
    memory: { thread: threadId, resource: resourceId },
  });
  
  const response6 = await consumeStream(result6.textStream);
  console.log(`\n🤖 Agent: ${response6}`);
  
  // Check if the response contains the actual humidity value
  const nycData = getVariable(runtimeContext, 'weather_new_york') as Record<string, unknown> | undefined;
  if (nycData?.humidity) {
    const humidityStr = String(nycData.humidity);
    if (response6.includes(humidityStr)) {
      console.log(`\n✅ TEST PASSED: Agent correctly reported humidity (${humidityStr}%)`);
    } else {
      console.log(`\n⚠️ Agent response may not include exact humidity value (${humidityStr}%)`);
    }
  }

  // ============================================
  // Final Summary
  // ============================================
  separator('TEST SUMMARY');
  
  const finalVars = listVariables(runtimeContext);
  const weatherVars = finalVars.filter(v => v.toolId === 'get-weather');
  
  console.log('📊 Final Statistics:');
  console.log(`   Total variables saved: ${finalVars.length}`);
  console.log(`   Weather variables: ${weatherVars.length}`);
  console.log(`   Messages sent: 6`);
  
  console.log('\n📦 All saved weather variables:');
  weatherVars.forEach(v => {
    const data = getVariable(runtimeContext, v.name) as Record<string, unknown>;
    console.log(`   $${v.name}:`);
    console.log(`      Temperature: ${data?.temperature}°`);
    console.log(`      Humidity: ${data?.humidity}%`);
    console.log(`      Conditions: ${data?.conditions}`);
  });
  
  // Calculate efficiency
  const expectedMinCalls = 3; // NYC, London, Tokyo
  const actualCalls = weatherVars.length;
  const efficiency = actualCalls <= expectedMinCalls 
    ? '✅ Optimal (no redundant API calls)'
    : `⚠️ ${actualCalls - expectedMinCalls} extra API call(s) made`;
  
  console.log(`\n🎯 Efficiency: ${efficiency}`);
  
  console.log('\n' + '='.repeat(60));
  console.log('  END-TO-END TEST COMPLETED');
  console.log('='.repeat(60) + '\n');
}

// Run the test
runE2ETest().catch(console.error);
