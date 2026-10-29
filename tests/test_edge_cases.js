// Quick education match test (avoids shell quote issues)
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const code = fs.readFileSync(path.join(__dirname, '..', 'matcher.js'), 'utf8');
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(code, ctx);
const M = ctx.window.SurveyMatcher;

const profile = { education: "Bachelor's Degree" };
const q = {
  question: 'What is your highest level of education completed?',
  type: 'select',
  options: [
    { label: 'High School', value: 'High School' },
    { label: "Bachelor's Degree", value: "Bachelor's Degree" },
    { label: "Master's Degree", value: "Master's Degree" },
    { label: 'Doctorate or Professional Degree', value: 'Doctorate' }
  ]
};
const result = M.matchQuestion(q, profile);
console.log('Education match result:', JSON.stringify(result));
if (result.answer === "Bachelor's Degree") {
  console.log('[PASS] Education matches correctly');
} else {
  console.error('[FAIL] Expected "Bachelor\'s Degree", got:', result.answer);
  process.exit(1);
}

// Also test employment match with the demo survey's exact radio values
const profile2 = { employmentStatus: 'Employed full-time' };
const q2 = {
  question: 'Which best describes your current employment status?',
  type: 'radio',
  options: [
    { label: 'Employed full-time', value: 'Employed full-time' },
    { label: 'Employed part-time', value: 'Employed part-time' },
    { label: 'Self-employed', value: 'Self-employed' },
    { label: 'Student', value: 'Student' },
    { label: 'Retired', value: 'Retired' }
  ]
};
const result2 = M.matchQuestion(q2, profile2);
console.log('Employment match result:', JSON.stringify(result2));
if (result2.answer === 'Employed full-time') {
  console.log('[PASS] Employment matches correctly');
} else {
  console.error('[FAIL] Expected "Employed full-time", got:', result2.answer);
  process.exit(1);
}

// Test device checkbox_group matching (demo uses "devices" group with Computer, Smartphone)
const profile3 = { deviceUsage: 'Computer, Smartphone' };
const q3 = {
  question: 'Which digital devices do you use on a daily basis?',
  type: 'checkbox_group',
  options: [
    { label: 'Computer / Laptop', value: 'Computer' },
    { label: 'Smartphone', value: 'Smartphone' },
    { label: 'Tablet', value: 'Tablet' },
    { label: 'Smartwatch / Fitness Tracker', value: 'Smartwatch' }
  ]
};
const result3 = M.matchQuestion(q3, profile3);
console.log('Devices match result:', JSON.stringify(result3));
if (result3.answer === 'Computer, Smartphone') {
  console.log('[PASS] Devices matches profile value (content.js will split on comma for checkbox_group)');
} else {
  console.error('[FAIL] Expected "Computer, Smartphone", got:', result3.answer);
  process.exit(1);
}

console.log('\nAll edge case tests passed!');

