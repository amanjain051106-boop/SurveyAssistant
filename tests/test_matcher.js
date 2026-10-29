/**
 * SurveyAssistant - Automated Unit Tests for Matching Logic
 */

// Load SurveyMatcher in Node environment
const fs = require('fs');
const path = require('path');
const matcherCode = fs.readFileSync(path.join(__dirname, '../matcher.js'), 'utf8');
const vm = require('vm');

const context = { window: {} };
vm.createContext(context);
vm.runInContext(matcherCode, context);
const SurveyMatcher = context.window.SurveyMatcher;

const sampleProfile = {
  fullName: "Alex Morgan",
  firstName: "Alex",
  lastName: "Morgan",
  email: "alex.morgan@example.com",
  phone: "+1 555-0199",
  age: "29",
  birthYear: "1997",
  gender: "Non-binary",
  country: "United States",
  stateProvince: "California",
  city: "San Francisco",
  postalCode: "94107",
  education: "Bachelor's Degree",
  employmentStatus: "Employed full-time",
  jobTitle: "Software Developer",
  industry: "Technology",
  householdIncome: "$75,000 - $99,999",
  maritalStatus: "Single",
  hasChildren: "No",
  householdSize: "1",
  primaryLanguage: "English",
  deviceUsage: "Computer, Smartphone",
  hobbies: "Hiking, Photography",
  customFacts: [
    { key: "Primary Commute", value: "Bicycle and Public Transit" },
    { key: "Pet Owner", value: "Yes, 1 Cat" }
  ]
};

const testCases = [
  {
    name: "Full Name field",
    question: { question: "1. What is your full name?", type: "text", options: [] },
    expected: "Alex Morgan"
  },
  {
    name: "Email address",
    question: { question: "Please enter your email address", type: "email", options: [] },
    expected: "alex.morgan@example.com"
  },
  {
    name: "Age direct input",
    question: { question: "What is your age in years?", type: "number", options: [] },
    expected: "29"
  },
  {
    name: "Age bracket matching (25-34)",
    question: {
      question: "Which age group do you belong to?",
      type: "radio",
      options: [
        { label: "Under 18", value: "u18" },
        { label: "18-24", value: "18-24" },
        { label: "25-34", value: "25-34" },
        { label: "35-44", value: "35-44" },
        { label: "45+", value: "45+" }
      ]
    },
    expected: "25-34"
  },
  {
    name: "Gender radio group",
    question: {
      question: "What is your gender identity?",
      type: "radio",
      options: [
        { label: "Male", value: "m" },
        { label: "Female", value: "f" },
        { label: "Non-binary", value: "nb" },
        { label: "Prefer not to say", value: "pnts" }
      ]
    },
    expected: "Non-binary"
  },
  {
    name: "Country dropdown",
    question: {
      question: "Select your country of residence",
      type: "select",
      options: [
        { label: "Canada", value: "CA" },
        { label: "United Kingdom", value: "UK" },
        { label: "United States", value: "US" },
        { label: "Australia", value: "AU" }
      ]
    },
    expected: "United States"
  },
  {
    name: "Employment dropdown",
    question: {
      question: "What is your current employment status?",
      type: "select",
      options: [
        { label: "Employed full-time", value: "ft" },
        { label: "Employed part-time", value: "pt" },
        { label: "Student", value: "st" }
      ]
    },
    expected: "Employed full-time"
  },
  {
    name: "Custom fact match (Primary Commute)",
    question: { question: "What is your primary commute method?", type: "text", options: [] },
    expected: "Bicycle and Public Transit"
  },
  {
    name: "Unknown / Unprovided fact strictly returns NEEDS USER INPUT",
    question: { question: "How often do you purchase luxury sports cars?", type: "text", options: [] },
    expected: "NEEDS USER INPUT"
  }
];

let passed = 0;
let failed = 0;

console.log("Running SurveyMatcher verification tests...\n");

testCases.forEach((tc, idx) => {
  const result = SurveyMatcher.matchQuestion(tc.question, sampleProfile);
  const match = result.answer === tc.expected;
  if (match) {
    console.log(`[PASS] Case ${idx + 1}: ${tc.name} -> "${result.answer}"`);
    passed++;
  } else {
    console.error(`[FAIL] Case ${idx + 1}: ${tc.name} -> Got "${result.answer}", Expected "${tc.expected}"`);
    failed++;
  }
});

console.log(`\nResults: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log("ALL LOGIC TESTS PASSED SUCCESSFULLY!");
}
