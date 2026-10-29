/**
 * SurveyAssistant - Rule-Based Question Matcher
 * 
 * Inspects detected question text, labels, and choices to match against
 * the user's verified profile data deterministically.
 * 
 * Safety:
 * - If no confident match is found, strictly returns "NEEDS USER INPUT".
 * - Never hallucinates or fabricates personal facts.
 */

const SurveyMatcher = (function () {
  /**
   * Helper: checks if a string contains any of the search keywords
   */
  function containsKeywords(text, keywords) {
    if (!text) return false;
    const lower = text.toLowerCase();
    return keywords.some(kw => {
      // Word boundary regex for single words or phrases
      const regex = new RegExp(`(^|[^a-z0-9])${kw.toLowerCase()}([^a-z0-9]|$)`, 'i');
      return regex.test(lower);
    });
  }

  /**
   * Smart numeric range matcher for options like "18-24", "25-34", "$50,000 - $74,999"
   */
  function matchOptionRange(numVal, options) {
    if (isNaN(numVal) || !options || options.length === 0) return null;

    for (const opt of options) {
      const text = (opt.label || opt.value || '').replace(/[$,]/g, '').toLowerCase();

      // Case: "under 18", "less than 20", "< 18"
      const underMatch = text.match(/(?:under|less than|<)\s*(\d+)/i);
      if (underMatch) {
        const max = parseInt(underMatch[1], 10);
        if (numVal < max) return opt.label || opt.value;
      }

      // Case: "65+", "65 or older", "over 60", "> 60"
      const overMatch = text.match(/(?:over|older than|>)\s*(\d+)|(\d+)\s*(?:\+|or older)/i);
      if (overMatch) {
        const min = parseInt(overMatch[1] || overMatch[2], 10);
        if (numVal >= min) return opt.label || opt.value;
      }

      // Case: "25-34", "25 to 34"
      const rangeMatch = text.match(/(\d+)\s*(?:-|to)\s*(\d+)/i);
      if (rangeMatch) {
        const min = parseInt(rangeMatch[1], 10);
        const max = parseInt(rangeMatch[2], 10);
        if (numVal >= min && numVal <= max) {
          return opt.label || opt.value;
        }
      }
    }
    return null;
  }

  /**
   * Smart range matcher for Indian LPA (Lakhs Per Annum) income options like "15-25 LPA", "10-20 Lakhs"
   */
  function matchLpaRange(lpaNum, options) {
    if (isNaN(lpaNum) || !options || options.length === 0) return null;

    for (const opt of options) {
      // Strip currency signs to allow clean number extraction
      const text = (opt.label || opt.value || '').replace(/[₹$,]/g, '').toLowerCase();

      // Case: "15-25 LPA", "15 to 25 Lakhs", "15-20 Lakh"
      const rangeMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*(?:lpa|lakh|lac)?/i);
      if (rangeMatch) {
        const min = parseFloat(rangeMatch[1]);
        const max = parseFloat(rangeMatch[2]);
        if (lpaNum >= min && lpaNum <= max) {
          return opt.label || opt.value;
        }
      }

      // Case: "under 10 LPA", "less than 15 Lakhs"
      const underMatch = text.match(/(?:under|less than|<)\s*(\d+(?:\.\d+)?)\s*(?:lpa|lakh)?/i);
      if (underMatch) {
        const max = parseFloat(underMatch[1]);
        if (lpaNum < max) return opt.label || opt.value;
      }

      // Case: "above 20 LPA", "25 LPA+"
      const overMatch = text.match(/(?:above|more than|>)\s*(\d+(?:\.\d+)?)\s*(?:lpa|lakh)?|(\d+(?:\.\d+)?)\s*(?:lpa|lakh)?\s*(?:\+|or more)/i);
      if (overMatch) {
        const min = parseFloat(overMatch[1] || overMatch[2]);
        if (lpaNum >= min) return opt.label || opt.value;
      }

      // Also check full numeric representations (e.g. 15,00,000 - 25,00,000)
      const cleanNumericText = text.replace(/[^0-9-]/g, '');
      const fullNumRange = cleanNumericText.match(/(\d{6,})\s*(?:-|to)\s*(\d{6,})/);
      if (fullNumRange) {
        const minAmt = parseInt(fullNumRange[1], 10);
        const maxAmt = parseInt(fullNumRange[2], 10);
        const lpaAmt = lpaNum * 100000;
        if (lpaAmt >= minAmt && lpaAmt <= maxAmt) {
          return opt.label || opt.value;
        }
      }
    }
    return null;
  }

  /**
   * Finds the best matching option from a list of choices given a target value
   */
  function findBestOptionMatch(targetValue, options) {
    if (!targetValue || !options || options.length === 0) return null;
    const targetClean = String(targetValue).trim().toLowerCase();

    // 1. Exact match
    for (const opt of options) {
      const optLabel = (opt.label || '').trim().toLowerCase();
      const optVal = (opt.value || '').trim().toLowerCase();
      if (optLabel === targetClean || optVal === targetClean) {
        return opt.label || opt.value;
      }
    }

    // 2. LPA / Lakhs income range matching
    const lpaMatch = targetClean.match(/(\d+(?:\.\d+)?)\s*(?:lpa|lakh|lac)/i);
    if (lpaMatch) {
      const lpaNum = parseFloat(lpaMatch[1]);
      const matchedLpa = matchLpaRange(lpaNum, options);
      if (matchedLpa) return matchedLpa;
    }

    // 3. Housing status semantic compatibility
    if (targetClean.includes('own')) {
      for (const opt of options) {
        const ol = (opt.label || opt.value || '').toLowerCase();
        if (ol === 'own' || ol === 'owns home' || ol === 'homeowner') {
          return opt.label || opt.value;
        }
      }
    }
    if (targetClean.includes('rent')) {
      for (const opt of options) {
        const ol = (opt.label || opt.value || '').toLowerCase();
        if (ol === 'rent' || ol === 'rents home' || ol === 'tenant' || ol === 'renter') {
          return opt.label || opt.value;
        }
      }
    }

    // 4. Substring or inclusion match (require minimum 3 characters or exact word to avoid false positives)
    for (const opt of options) {
      const optLabel = (opt.label || '').trim().toLowerCase();
      const optVal = (opt.value || '').trim().toLowerCase();

      // Gender check: strictly prevent "Male" matching "Female"
      if (targetClean === 'male' && (optLabel === 'female' || optVal === 'female')) {
        continue;
      }
      if (targetClean === 'female' && optLabel === 'male') {
        continue;
      }

      if (optLabel.length >= 3 && optLabel.includes(targetClean)) {
        return opt.label || opt.value;
      }
      if (targetClean.length >= 3 && targetClean.includes(optLabel)) {
        return opt.label || opt.value;
      }
      if (optVal && optVal.length >= 3 && (optVal.includes(targetClean) || targetClean.includes(optVal))) {
        return opt.label || opt.value;
      }
    }

    // 5. If target is a number, try numeric range matching
    const parsedNum = parseInt(targetClean.replace(/[^\d]/g, ''), 10);
    if (!isNaN(parsedNum)) {
      const rangeMatch = matchOptionRange(parsedNum, options);
      if (rangeMatch) return rangeMatch;
    }

    return null;
  }

  /**
   * Deterministically match question against user profile
   * 
   * @param {Object} questionItem Detected question object from content.js
   * @param {Object} profile User profile object from storage
   * @returns {{ answer: string, confidence: 'rule_matched' | 'needs_input', matchedField: string }}
   */
  function matchQuestion(questionItem, profile) {
    if (!profile) {
      return { answer: 'NEEDS USER INPUT', confidence: 'needs_input', matchedField: 'none' };
    }

    const qText = questionItem.question || '';
    const qName = questionItem.name || '';
    const qType = questionItem.type || '';
    const fullSearchText = `${qText} ${qName}`;
    const options = questionItem.options || [];

    // Helper to return value after checking options if applicable.
    // For checkbox_group, return the raw profile value so content.js can split on commas.
    const resolveValue = (val, fieldName) => {
      if (!val || String(val).trim() === '') {
        return { answer: 'NEEDS USER INPUT', confidence: 'needs_input', matchedField: fieldName };
      }
      // Multi-select checkbox groups: return raw profile value; content.js does the splitting
      if (qType === 'checkbox_group') {
        return { answer: String(val).trim(), confidence: 'rule_matched', matchedField: fieldName };
      }
      // For single-choice fields (radio, select), match against options list
      if (options.length > 0) {
        const matchedOpt = findBestOptionMatch(val, options);
        if (matchedOpt) {
          return { answer: matchedOpt, confidence: 'rule_matched', matchedField: fieldName };
        }
        // If choices are provided but NONE matches the profile fact, strictly return NEEDS USER INPUT
        return { answer: 'NEEDS USER INPUT', confidence: 'needs_input', matchedField: fieldName };
      }
      return { answer: String(val).trim(), confidence: 'rule_matched', matchedField: fieldName };
    };

    // 1. Full Name vs First/Last Name
    if (containsKeywords(fullSearchText, ['first name', 'given name', 'forename'])) {
      return resolveValue(profile.firstName, 'firstName');
    }
    if (containsKeywords(fullSearchText, ['last name', 'surname', 'family name'])) {
      return resolveValue(profile.lastName, 'lastName');
    }
    if (containsKeywords(fullSearchText, ['full name', 'your name', 'contact name', 'legal name'])) {
      const name = profile.fullName || ([profile.firstName, profile.lastName].filter(Boolean).join(' '));
      return resolveValue(name, 'fullName');
    }

    // 2. Email Address
    if (containsKeywords(fullSearchText, ['email', 'e-mail', 'mail address'])) {
      return resolveValue(profile.email, 'email');
    }

    // 3. Phone Number
    if (containsKeywords(fullSearchText, ['phone', 'mobile', 'cell', 'telephone', 'contact number'])) {
      return resolveValue(profile.phone, 'phone');
    }

    // 4. Age & Birth Year
    if (containsKeywords(fullSearchText, ['birth year', 'year of birth', 'born in'])) {
      return resolveValue(profile.birthYear, 'birthYear');
    }
    if (containsKeywords(fullSearchText, ['age', 'how old', 'age group', 'age bracket', 'age in years'])) {
      let ageVal = profile.age;
      if (!ageVal && profile.birthYear) {
        const currentYear = new Date().getFullYear();
        ageVal = String(currentYear - parseInt(profile.birthYear, 10));
      }
      return resolveValue(ageVal, 'age');
    }

    // 5. Gender / Sex (strictly preventing "Male" matching "Female")
    if (containsKeywords(fullSearchText, ['gender', 'sex', 'gender identity'])) {
      return resolveValue(profile.gender, 'gender');
    }

    // 6. Number of Children vs Has Children
    if (containsKeywords(fullSearchText, ['how many children', 'number of children', 'number of kids', 'how many kids', 'how many dependents', 'count of children'])) {
      const count = profile.numberOfChildren || profile.children;
      return resolveValue(count, 'numberOfChildren');
    }
    if (containsKeywords(fullSearchText, ['children', 'dependents', 'kids', 'parent', 'any children', 'have children'])) {
      return resolveValue(profile.hasChildren, 'hasChildren');
    }
    if (containsKeywords(fullSearchText, ['household size', 'people in household', 'size of your household'])) {
      return resolveValue(profile.householdSize, 'householdSize');
    }

    // 7. Marital Status
    if (containsKeywords(fullSearchText, ['marital', 'relationship status', 'marriage', 'are you married'])) {
      return resolveValue(profile.maritalStatus, 'maritalStatus');
    }

    // 8. Housing Status & Home Ownership
    if (containsKeywords(fullSearchText, ['housing status', 'housing', 'home ownership', 'do you own or rent', 'living situation', 'residential status', 'type of housing', 'homeowner'])) {
      const housingVal = profile.housingStatus || profile.housing;
      return resolveValue(housingVal, 'housingStatus');
    }

    // 9. Country of Residence (checked before general residence to avoid "country of residence" matching city)
    if (containsKeywords(fullSearchText, ['country of residence', 'country', 'nation'])) {
      return resolveValue(profile.country, 'country');
    }

    // 10. Location / City / State / Residence
    if (containsKeywords(fullSearchText, ['city of residence', 'current city', 'city', 'town', 'municipality'])) {
      const cityVal = profile.city || profile.residence;
      return resolveValue(cityVal, 'city');
    }
    if (containsKeywords(fullSearchText, ['residence', 'place of residence', 'where do you live', 'which city'])) {
      const resVal = profile.residence || profile.city;
      return resolveValue(resVal, 'residence');
    }
    if (containsKeywords(fullSearchText, ['state', 'province', 'region', 'territory'])) {
      return resolveValue(profile.stateProvince, 'stateProvince');
    }
    if (containsKeywords(fullSearchText, ['zip', 'postal code', 'postcode', 'zip code', 'pincode'])) {
      return resolveValue(profile.postalCode, 'postalCode');
    }

    // 10. Education
    if (containsKeywords(fullSearchText, ['education', 'degree', 'highest level of education', 'schooling', 'qualification'])) {
      return resolveValue(profile.education, 'education');
    }

    // 11. Occupation & Employment Status
    if (containsKeywords(fullSearchText, ['occupation', 'profession', 'job title', 'current role', 'designation', 'what do you do'])) {
      const occVal = profile.occupation || profile.jobTitle;
      return resolveValue(occVal, 'occupation');
    }
    if (containsKeywords(fullSearchText, ['employment', 'employed', 'work status', 'job status', 'labor force'])) {
      return resolveValue(profile.employmentStatus, 'employmentStatus');
    }
    if (containsKeywords(fullSearchText, ['industry', 'sector', 'field of work', 'business sector'])) {
      return resolveValue(profile.industry, 'industry');
    }

    // 12. Income & Salary (supporting LPA, Lakhs, USD, and rupee amounts)
    if (containsKeywords(fullSearchText, ['annual income', 'household income', 'income', 'salary', 'earnings', 'lpa', 'ctc'])) {
      const incVal = profile.annualIncome || profile.householdIncome;
      return resolveValue(incVal, 'income');
    }

    // 13. Language & Habits
    if (containsKeywords(fullSearchText, ['primary language', 'native language', 'first language', 'mother tongue', 'language'])) {
      return resolveValue(profile.primaryLanguage, 'primaryLanguage');
    }
    if (containsKeywords(fullSearchText, ['device', 'devices', 'computer', 'smartphone', 'gadgets'])) {
      return resolveValue(profile.deviceUsage, 'deviceUsage');
    }
    if (containsKeywords(fullSearchText, ['hobbies', 'hobby', 'interests', 'free time'])) {
      return resolveValue(profile.hobbies, 'hobbies');
    }

    // 14. Check Custom Facts (user-defined facts)
    if (Array.isArray(profile.customFacts) && profile.customFacts.length > 0) {
      for (const fact of profile.customFacts) {
        if (fact.key && fact.value) {
          const keyWords = fact.key.toLowerCase().split(/\s+/).filter(w => w.length > 2);
          if (keyWords.length > 0 && containsKeywords(fullSearchText, keyWords)) {
            return resolveValue(fact.value, `custom:${fact.key}`);
          }
        }
      }
    }

    // Default: strict fallback
    return {
      answer: 'NEEDS USER INPUT',
      confidence: 'needs_input',
      matchedField: 'none'
    };
  }

  return {
    matchQuestion,
    findBestOptionMatch,
    matchOptionRange,
    matchLpaRange
  };
})();

if (typeof window !== 'undefined') {
  window.SurveyMatcher = SurveyMatcher;
}
