/**
 * SurveyAssistant - Phase 5 Demo Sample Profile & Profile Matching Tests
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// 1. Load SurveyMatcher
const matcherCode = fs.readFileSync(path.join(__dirname, '..', 'matcher.js'), 'utf8');
const matcherCtx = { window: {} };
vm.createContext(matcherCtx);
vm.runInContext(matcherCode, matcherCtx);
const SurveyMatcher = matcherCtx.window.SurveyMatcher;

// 2. Load DEMO_SAMPLE_PROFILE
const demoProfile = require(path.join(__dirname, '..', 'demo_profile.js'));

console.log("==================================================");
console.log("🧪 RUNNING PHASE 5 DEMO PROFILE & MATCHING TESTS");
console.log("==================================================\n");

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passed++;
  } else {
    console.error(`[FAIL] ${message}`);
    failed++;
  }
}

// TEST 1: Inspect Demo Profile schema & required fields
console.log("-- 1. Inspecting Demo Sample Profile Schema --");
assert(demoProfile.age === "35", `Age is 35 (got ${demoProfile.age})`);
assert(demoProfile.gender === "Male", `Gender is Male (got ${demoProfile.gender})`);
assert(demoProfile.occupation === "IT professional", `Occupation is IT professional (got ${demoProfile.occupation})`);
assert(demoProfile.annualIncome === "₹20 LPA", `Annual income is ₹20 LPA (got ${demoProfile.annualIncome})`);
assert(demoProfile.maritalStatus === "Married", `Marital status is Married (got ${demoProfile.maritalStatus})`);
assert(demoProfile.children === "2" || demoProfile.numberOfChildren === "2", `Children count is 2 (got ${demoProfile.children})`);
assert(demoProfile.residence === "Delhi" || demoProfile.city === "Delhi", `Residence is Delhi (got ${demoProfile.residence})`);
assert(demoProfile.housingStatus === "Own apartment", `Housing status is Own apartment (got ${demoProfile.housingStatus})`);

// TEST 2: Test Demo Profile against all questions in demo_survey.html
console.log("\n-- 2. Testing Matching Against demo_survey.html Questions --");

const demoSurveyQuestions = [
  { id: "q1", name: "fullName", type: "text", question: "1. What is your full name?", options: [] },
  { id: "q2", name: "email", type: "email", question: "2. What is your email address?", options: [] },
  { id: "q3", name: "age", type: "number", question: "3. What is your age in years?", options: [] },
  {
    id: "q4", name: "gender", type: "radio", question: "4. What is your gender identity?",
    options: [
      { label: "Male", value: "Male" },
      { label: "Female", value: "Female" },
      { label: "Non-binary", value: "Non-binary" },
      { label: "Prefer not to say", value: "Prefer not to say" }
    ]
  },
  {
    id: "q5", name: "country", type: "select", question: "5. What is your country of residence?",
    options: [
      { label: "United States", value: "United States" },
      { label: "Canada", value: "Canada" },
      { label: "United Kingdom", value: "United Kingdom" },
      { label: "India", value: "India" },
      { label: "Germany", value: "Germany" },
      { label: "Australia", value: "Australia" },
      { label: "Other", value: "Other" }
    ]
  },
  {
    id: "q6", name: "education", type: "select", question: "6. What is your highest level of education completed?",
    options: [
      { label: "High School", value: "High School" },
      { label: "Bachelor's Degree", value: "Bachelor's Degree" },
      { label: "Master's Degree", value: "Master's Degree" },
      { label: "Doctorate or Professional Degree", value: "Doctorate" }
    ]
  },
  {
    id: "q7", name: "employment", type: "radio", question: "7. Which best describes your current employment status?",
    options: [
      { label: "Employed full-time", value: "Employed full-time" },
      { label: "Employed part-time", value: "Employed part-time" },
      { label: "Self-employed / Freelance", value: "Self-employed" },
      { label: "Student", value: "Student" },
      { label: "Retired", value: "Retired" }
    ]
  },
  {
    id: "q8", name: "occupation", type: "select", question: "8. What is your occupation / primary field of work?",
    options: [
      { label: "Information Technology / IT professional", value: "IT professional" },
      { label: "Healthcare & Medicine", value: "Healthcare" },
      { label: "Financial Services & Banking", value: "Finance" },
      { label: "Education & Academia", value: "Education" },
      { label: "Other", value: "Other" }
    ]
  },
  {
    id: "q9", name: "income", type: "select", question: "9. What is your annual income bracket?",
    options: [
      { label: "Under ₹5 LPA", value: "Under ₹5 LPA" },
      { label: "₹5 - ₹10 LPA", value: "₹5 - ₹10 LPA" },
      { label: "₹10 - ₹15 LPA", value: "₹10 - ₹15 LPA" },
      { label: "₹15 - ₹25 LPA", value: "₹15 - ₹25 LPA" },
      { label: "Above ₹25 LPA", value: "Above ₹25 LPA" }
    ]
  },
  {
    id: "q10", name: "maritalStatus", type: "radio", question: "10. What is your marital status?",
    options: [
      { label: "Single", value: "Single" },
      { label: "Married", value: "Married" },
      { label: "Divorced", value: "Divorced" },
      { label: "Widowed", value: "Widowed" }
    ]
  },
  {
    id: "q11", name: "children", type: "radio", question: "11. How many children do you have?",
    options: [
      { label: "None", value: "None" },
      { label: "1", value: "1" },
      { label: "2", value: "2" },
      { label: "3 or more", value: "3 or more" }
    ]
  },
  { id: "q12", name: "city", type: "text", question: "12. What is your city of residence?", options: [] },
  {
    id: "q13", name: "housing", type: "radio", question: "13. What is your housing status?",
    options: [
      { label: "Own apartment", value: "Own apartment" },
      { label: "Own independent house", value: "Own independent house" },
      { label: "Rented apartment", value: "Rented apartment" },
      { label: "Rented house", value: "Rented house" }
    ]
  },
  {
    id: "q14", name: "devices", type: "checkbox_group", question: "14. Which digital devices do you use on a daily basis?",
    options: [
      { label: "Computer / Laptop", value: "Computer" },
      { label: "Smartphone", value: "Smartphone" },
      { label: "Tablet", value: "Tablet" },
      { label: "Smartwatch / Fitness Tracker", value: "Smartwatch" }
    ]
  },
  { id: "q15", name: "commute", type: "text", question: "15. What is your primary commute method?", options: [] },
  { id: "q16", name: "comments", type: "textarea", question: "16. Additional comments or feedback:", options: [] }
];

const expectedDemoResults = {
  q1: "Rahul Sharma",
  q2: "rahul.sharma@example.com",
  q3: "35",
  q4: "Male",
  q5: "India",
  q6: "Bachelor's Degree",
  q7: "Employed full-time",
  q8: "Information Technology / IT professional",
  q9: "₹15 - ₹25 LPA",
  q10: "Married",
  q11: "2",
  q12: "Delhi",
  q13: "Own apartment",
  q14: "Computer, Smartphone",
  q15: "NEEDS USER INPUT", // Not in Demo Profile facts
  q16: "NEEDS USER INPUT"  // Open textarea, not in Demo facts
};

demoSurveyQuestions.forEach(q => {
  const result = SurveyMatcher.matchQuestion(q, demoProfile);
  const expected = expectedDemoResults[q.id];
  assert(
    result.answer === expected,
    `${q.id.toUpperCase().padEnd(4)} ${q.name.padEnd(14)} -> "${result.answer}" (Expected: "${expected}")`
  );
});

// TEST 3: Incompatible Options Fallback to NEEDS USER INPUT
console.log("\n-- 3. Testing Incompatible Options Handling --");

// Incompatible Gender options (no Male)
const incompGender = {
  question: "Gender identity:",
  type: "radio",
  options: [{ label: "Female", value: "Female" }, { label: "Non-binary", value: "Non-binary" }]
};
assert(
  SurveyMatcher.matchQuestion(incompGender, demoProfile).answer === "NEEDS USER INPUT",
  "Incompatible Gender options return NEEDS USER INPUT"
);

// Incompatible Marital Status (no Married)
const incompMarital = {
  question: "What is your relationship status?",
  type: "select",
  options: [{ label: "Single", value: "Single" }, { label: "Divorced", value: "Divorced" }]
};
assert(
  SurveyMatcher.matchQuestion(incompMarital, demoProfile).answer === "NEEDS USER INPUT",
  "Incompatible Marital options return NEEDS USER INPUT"
);

// Incompatible Income options (no 20 LPA bracket)
const incompIncome = {
  question: "Annual income bracket:",
  type: "select",
  options: [{ label: "Under ₹5 LPA", value: "u5" }, { label: "₹5 - ₹10 LPA", value: "5-10" }]
};
assert(
  SurveyMatcher.matchQuestion(incompIncome, demoProfile).answer === "NEEDS USER INPUT",
  "Incompatible Income bracket returns NEEDS USER INPUT"
);

// TEST 4: Real User Profile Separation Guarantee
console.log("\n-- 4. Testing Profile Isolation Guarantee --");
const userRealProfile = {
  fullName: "Priya Patel",
  age: "26",
  city: "Mumbai",
  maritalStatus: "Single"
};

// Verify user profile produces its own results
const realAgeResult = SurveyMatcher.matchQuestion(demoSurveyQuestions[2], userRealProfile);
assert(realAgeResult.answer === "26", "Real profile age matches Priya's age 26");

const realCityResult = SurveyMatcher.matchQuestion(demoSurveyQuestions[11], userRealProfile);
assert(realCityResult.answer === "Mumbai", "Real profile city matches Priya's city Mumbai");

// Verify demo profile does not mutate real profile
assert(userRealProfile.fullName === "Priya Patel", "Real profile name is unchanged");
assert(userRealProfile.age === "26", "Real profile age is unchanged");
assert(userRealProfile.city === "Mumbai", "Real profile city is unchanged");

console.log("\n==================================================");
console.log(`Phase 5 Results: ${passed} passed, ${failed} failed.`);
console.log("==================================================");

if (failed > 0) {
  process.exit(1);
}

