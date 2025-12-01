/**
 * Test script for tool output variables
 * 
 * Run with: npx tsx src/examples/test-variables.ts
 */

import { RuntimeContext } from '@mastra/core/runtime-context';
import {
  setVariable,
  getVariable,
  listVariables,
  resolveVariables,
  resolveString,
  parseVariableRef,
} from '../lib';

console.log('=== Testing Tool Output Variables ===\n');

// Create a RuntimeContext (simulates a request context)
const ctx = new RuntimeContext();

// Test 1: Store and retrieve variables
console.log('1. Testing variable store...');
setVariable(ctx, 'weather_nyc', {
  temperature: 72,
  humidity: 45,
  conditions: 'Sunny',
  location: 'New York',
}, 'get-weather');

setVariable(ctx, 'weather_london', {
  temperature: 58,
  humidity: 80,
  conditions: 'Cloudy',
  location: 'London',
}, 'get-weather');

console.log('   Stored: $weather_nyc and $weather_london');

const nycWeather = getVariable(ctx, 'weather_nyc');
console.log('   Retrieved $weather_nyc:', nycWeather);

// Test 2: List variables
console.log('\n2. Testing listVariables...');
const vars = listVariables(ctx);
console.log('   Available variables:');
vars.forEach(v => console.log(`   - $${v.name} (${v.toolId}): ${v.preview}`));

// Test 3: Parse variable references
console.log('\n3. Testing parseVariableRef...');
const ref1 = parseVariableRef('$weather_nyc');
console.log('   $weather_nyc ->', ref1);

const ref2 = parseVariableRef('$weather_nyc.temperature');
console.log('   $weather_nyc.temperature ->', ref2);

const ref3 = parseVariableRef('$weather_nyc.nested.field');
console.log('   $weather_nyc.nested.field ->', ref3);

// Test 4: Resolve string with exact variable
console.log('\n4. Testing resolveString (exact match)...');
const resolved1 = resolveString('$weather_nyc', ctx);
console.log('   "$weather_nyc" ->', resolved1);

const resolved2 = resolveString('$weather_nyc.temperature', ctx);
console.log('   "$weather_nyc.temperature" ->', resolved2);

// Test 5: Resolve string with interpolation
console.log('\n5. Testing resolveString (interpolation)...');
const resolved3 = resolveString('The temperature in NYC is $weather_nyc.temperature°F', ctx);
console.log('   "The temperature in NYC is $weather_nyc.temperature°F"');
console.log('   ->', resolved3);

// Test 6: Resolve object with variable references
console.log('\n6. Testing resolveVariables (object)...');
const input = {
  city1Weather: '$weather_nyc',
  city2Weather: '$weather_london',
  city1Temp: '$weather_nyc.temperature',
  city2Temp: '$weather_london.temperature',
  message: 'Comparing $weather_nyc.location and $weather_london.location',
};
console.log('   Input:', JSON.stringify(input, null, 2));

const resolved4 = resolveVariables(input, ctx);
console.log('   Resolved:', JSON.stringify(resolved4, null, 2));

// Test 7: Non-existent variable
console.log('\n7. Testing non-existent variable...');
const resolved5 = resolveString('$unknown_var', ctx);
console.log('   "$unknown_var" ->', resolved5, '(kept as-is)');

// Test 8: Array resolution
console.log('\n8. Testing array resolution...');
const arrayInput = ['$weather_nyc.temperature', '$weather_london.temperature', 'static'];
const resolved6 = resolveVariables(arrayInput, ctx);
console.log('   Input:', arrayInput);
console.log('   Resolved:', resolved6);

console.log('\n=== All tests completed! ===');
