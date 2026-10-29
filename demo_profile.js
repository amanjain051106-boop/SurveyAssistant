/**
 * SurveyAssistant - Demo Sample Profile
 * 
 * Pre-configured testing profile containing the Phase 5 specified facts:
 * - Age: 35
 * - Gender: Male
 * - Occupation: IT professional
 * - Annual income: ₹20 LPA
 * - Marital status: Married
 * - Children: 2
 * - Residence: Delhi
 * - Housing: Own apartment
 * 
 * Safety Guarantee:
 * - This profile is isolated from the user's real saved profile.
 * - Switching to or testing this profile NEVER overwrites the user's real profile data.
 */

const DEMO_SAMPLE_PROFILE = {
  fullName: "Rahul Sharma",
  firstName: "Rahul",
  lastName: "Sharma",
  email: "rahul.sharma@example.com",
  phone: "+91 98765 43210",
  gender: "Male",
  age: "35",
  birthYear: "1991",
  occupation: "IT professional",
  jobTitle: "IT professional",
  employmentStatus: "Employed full-time",
  industry: "Information Technology",
  annualIncome: "₹20 LPA",
  householdIncome: "₹20 LPA",
  maritalStatus: "Married",
  hasChildren: "Yes",
  numberOfChildren: "2",
  children: "2",
  residence: "Delhi",
  city: "Delhi",
  stateProvince: "Delhi",
  country: "India",
  postalCode: "110001",
  housingStatus: "Own apartment",
  housing: "Own apartment",
  education: "Bachelor's Degree",
  primaryLanguage: "English",
  deviceUsage: "Computer, Smartphone",
  hobbies: "Reading, Technology",
  customFacts: [
    { key: "Housing Status", value: "Own apartment" },
    { key: "Occupation", value: "IT professional" },
    { key: "Annual Income", value: "₹20 LPA" },
    { key: "Number of Children", value: "2" },
    { key: "Residence", value: "Delhi" }
  ]
};

if (typeof window !== 'undefined') {
  window.DEMO_SAMPLE_PROFILE = DEMO_SAMPLE_PROFILE;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DEMO_SAMPLE_PROFILE;
}

