/**
 * Comprehensive test for tool output variables with the weather agent
 * 
 * Run with: npx tsx src/examples/test-agent-variables.ts
 * 
 * Tests:
 * 1. Single tool call - variable is saved
 * 2. Multiple tool calls - multiple variables saved
 * 3. Variable resolution in tool inputs (simulated)
 * 4. Stream text resolution
 * 5. Dynamic instructions include variables
 */

import 'dotenv/config';
import { RuntimeContext } from '@mastra/core/runtime-context';
import { mastra } from '../mastra';
import { 
  listVariables, 
  getVariable, 
  setVariable,
  resolveVariables,
  getVariableInstructions,
  createTextStreamTransform,
} from '../lib';

async function runTests() {
  console.log('=== Testing Weather Agent with Tool Output Variables ===\n');
  
  const agent = mastra.getAgent('weatherAgent');
  
  // Create a RuntimeContext for this test session
  const runtimeContext = new RuntimeContext();

  // ============================================
  // Test 1: Single city weather query (using stream)
  // ============================================
  console.log('--- Test 1: Single City Weather Query ---');
  console.log('Query: "What is the weather in New York?"');
  
  try {
    const streamResult1 = await agent.stream('What is the weather in New York?', {
      runtimeContext,
    });
    
    // Consume the stream to get full response
    let response1Text = '';
    const reader1 = streamResult1.textStream.getReader();
    while (true) {
      const { done, value } = await reader1.read();
      if (done) break;
      response1Text += value;
    }
    
    console.log('\nAgent Response:', response1Text.slice(0, 200) + '...');
    
    // Check if variable was saved
    const vars1 = listVariables(runtimeContext);
    console.log('\nVariables after query:');
    vars1.forEach(v => console.log(`  - $${v.name} (${v.toolId}): ${v.preview}`));
    
    const nycWeather = getVariable(runtimeContext, 'weather_new_york');
    if (nycWeather) {
      console.log('\n✅ Variable $weather_new_york saved successfully!');
      console.log('   Value:', JSON.stringify(nycWeather, null, 2).slice(0, 200));
    } else {
      console.log('\n⚠️ Variable not found with expected name. Checking all variables...');
      vars1.forEach(v => {
        if (v.toolId === 'get-weather') {
          console.log(`   Found: $${v.name}`);
        }
      });
    }
  } catch (error) {
    console.error('Error in Test 1:', error);
  }

  // ============================================
  // Test 2: Second city - multiple variables (using stream)
  // ============================================
  console.log('\n--- Test 2: Second City Query ---');
  console.log('Query: "What about London?"');
  
  try {
    const streamResult2 = await agent.stream('What about London?', {
      runtimeContext,
    });
    
    // Consume the stream
    let response2Text = '';
    const reader2 = streamResult2.textStream.getReader();
    while (true) {
      const { done, value } = await reader2.read();
      if (done) break;
      response2Text += value;
    }
    
    console.log('\nAgent Response:', response2Text.slice(0, 200) + '...');
    
    const vars2 = listVariables(runtimeContext);
    console.log('\nVariables after second query:');
    vars2.forEach(v => console.log(`  - $${v.name} (${v.toolId}): ${v.preview}`));
    
    if (vars2.length >= 2) {
      console.log('\n✅ Multiple variables saved successfully!');
    }
  } catch (error) {
    console.error('Error in Test 2:', error);
  }

  // ============================================
  // Test 3: Variable resolution simulation
  // ============================================
  console.log('\n--- Test 3: Variable Resolution ---');
  
  // Manually set some test variables to ensure we have data
  setVariable(runtimeContext, 'test_weather_nyc', {
    temperature: 72,
    humidity: 45,
    conditions: 'Sunny',
    location: 'New York',
  }, 'get-weather');
  
  setVariable(runtimeContext, 'test_weather_london', {
    temperature: 58,
    humidity: 80,
    conditions: 'Cloudy',
    location: 'London',
  }, 'get-weather');
  
  // Simulate tool input with variable references
  const toolInput = {
    city1Data: '$test_weather_nyc',
    city2Data: '$test_weather_london',
    city1Temp: '$test_weather_nyc.temperature',
    city2Temp: '$test_weather_london.temperature',
  };
  
  console.log('Input with variables:', JSON.stringify(toolInput, null, 2));
  
  const resolved = resolveVariables(toolInput, runtimeContext);
  console.log('\nResolved values:', JSON.stringify(resolved, null, 2));
  
  const resolvedObj = resolved as Record<string, unknown>;
  if (
    typeof resolvedObj.city1Temp === 'number' &&
    typeof resolvedObj.city2Temp === 'number' &&
    typeof resolvedObj.city1Data === 'object'
  ) {
    console.log('\n✅ Variable resolution working correctly!');
  } else {
    console.log('\n❌ Variable resolution issue');
  }

  // ============================================
  // Test 4: Stream text resolution
  // ============================================
  console.log('\n--- Test 4: Stream Text Resolution ---');
  
  const testText = 'NYC temp is $test_weather_nyc.temperature°F, London is $test_weather_london.temperature°F';
  console.log('Input text:', testText);
  
  // Create a simple test for the stream transformer
  const transform = createTextStreamTransform(runtimeContext);
  const writer = transform.writable.getWriter();
  const reader = transform.readable.getReader();
  
  // Write the text in chunks (simulating streaming)
  const chunks = [
    'NYC temp is $test_',
    'weather_nyc.temperature°F, ',
    'London is $test_weather_',
    'london.temperature°F',
  ];
  
  console.log('Streaming chunks:', chunks);
  
  let output = '';
  const readPromise = (async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      output += value;
    }
  })();
  
  for (const chunk of chunks) {
    await writer.write(chunk);
  }
  await writer.close();
  await readPromise;
  
  console.log('Resolved output:', output);
  
  if (output.includes('72') && output.includes('58')) {
    console.log('\n✅ Stream resolution working correctly!');
  } else {
    console.log('\n⚠️ Stream resolution may have issues');
  }

  // ============================================
  // Test 5: Dynamic instructions
  // ============================================
  console.log('\n--- Test 5: Dynamic Instructions ---');
  
  const instructions = getVariableInstructions(runtimeContext);
  console.log('Generated instructions preview:');
  console.log(instructions.slice(0, 500) + '...');
  
  if (instructions.includes('$test_weather_nyc') || instructions.includes('$weather_')) {
    console.log('\n✅ Dynamic instructions include saved variables!');
  } else {
    console.log('\n⚠️ Variables not appearing in instructions');
  }

  // ============================================
  // Test 6: Streaming response from agent
  // ============================================
  console.log('\n--- Test 6: Agent Streaming Response ---');
  console.log('Query: "What is the weather in Tokyo?" (streaming)');
  
  try {
    const streamResult = await agent.stream('What is the weather in Tokyo?', {
      runtimeContext,
    });
    
    let streamedText = '';
    const textStream = streamResult.textStream;
    const streamReader = textStream.getReader();
    
    process.stdout.write('Streamed response: ');
    while (true) {
      const { done, value } = await streamReader.read();
      if (done) break;
      streamedText += value;
      process.stdout.write(value);
    }
    console.log('\n');
    
    // Check if Tokyo variable was saved
    const vars3 = listVariables(runtimeContext);
    const tokyoVar = vars3.find(v => v.name.includes('tokyo'));
    if (tokyoVar) {
      console.log('✅ Variable saved during streaming:', `$${tokyoVar.name}`);
    }
  } catch (error) {
    console.error('Error in Test 6:', error);
  }

  // ============================================
  // Test 7: Compare cities (agent should use variables)
  // ============================================
  console.log('\n--- Test 7: Compare Cities (Variable Usage) ---');
  console.log('Query: "Compare the weather between New York and London"');
  
  try {
    const streamResult7 = await agent.stream(
      'Compare the weather between New York and London. Which city is warmer?',
      { runtimeContext }
    );
    
    let response7Text = '';
    const reader7 = streamResult7.textStream.getReader();
    while (true) {
      const { done, value } = await reader7.read();
      if (done) break;
      response7Text += value;
    }
    
    console.log('\nAgent Response:', response7Text);
    
    // Check if agent used existing variables or made new calls
    const vars7 = listVariables(runtimeContext);
    const weatherVars = vars7.filter(v => v.toolId === 'get-weather');
    console.log(`\nWeather variables: ${weatherVars.length}`);
    weatherVars.forEach(v => console.log(`  - $${v.name}`));
    
    console.log('\n✅ Comparison completed!');
  } catch (error) {
    console.error('Error in Test 7:', error);
  }

  // ============================================
  // Summary
  // ============================================
  console.log('\n=== Test Summary ===');
  const finalVars = listVariables(runtimeContext);
  console.log(`Total variables saved: ${finalVars.length}`);
  finalVars.forEach(v => console.log(`  - $${v.name}`));
  
  console.log('\n=== All Tests Completed ===');
}

// Run tests
runTests().catch(console.error);
