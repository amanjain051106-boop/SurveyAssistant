/**
 * SurveyAssistant - Unit Tests for LlmAdapter
 */

const fs = require('fs');
const vm = require('vm');

const path = require('path');
const adapterCode = fs.readFileSync(path.join(__dirname, '../llm_adapter.js'), 'utf8');
const context = { window: {}, fetch: null, AbortController: global.AbortController, setTimeout: global.setTimeout, clearTimeout: global.clearTimeout };
vm.createContext(context);
vm.runInContext(adapterCode, context);
const LlmAdapter = context.window.LlmAdapter;

console.log("Testing LlmAdapter functions...\n");

// 1. Test profile context formatting
const sampleProfile = {
  fullName: "Alex Morgan",
  email: "alex@example.com",
  age: "29",
  customFacts: [{ key: "Pet", value: "Cat" }]
};

const contextText = LlmAdapter.formatProfileContext(sampleProfile);
console.log("Profile Context Output:\n" + contextText);

if (contextText.includes("Full Name: Alex Morgan") && contextText.includes("Pet: Cat")) {
  console.log("\n[PASS] formatProfileContext properly formatted profile facts.");
} else {
  console.error("\n[FAIL] formatProfileContext failed.");
  process.exit(1);
}

// 2. Test empty profile formatting
const emptyText = LlmAdapter.formatProfileContext({});
if (emptyText === "The profile is currently empty.") {
  console.log("[PASS] formatProfileContext handles empty profiles safely.");
} else {
  console.error("[FAIL] formatProfileContext empty test failed.");
  process.exit(1);
}

console.log("\nALL LLM ADAPTER LOGIC TESTS PASSED!");
