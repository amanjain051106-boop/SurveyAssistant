/**
 * SurveyAssistant - Local LLM Adapter for Ollama
 * 
 * Communicates strictly with a local Ollama instance (default: http://localhost:11434).
 * Enforces strict grounding in user-provided profile facts.
 * 
 * Safety & Privacy:
 * - NEVER contacts external servers or remote cloud APIs.
 * - If profile lacks data, instructs model to reply strictly "NEEDS USER INPUT".
 * - Graceful fallback if Ollama is offline or unresponsive.
 */

const LlmAdapter = (function () {
  const DEFAULT_URL = 'http://localhost:11434';
  const DEFAULT_TIMEOUT_MS = 6000;

  /**
   * Check if local Ollama service is running and fetch available models
   * @param {string} baseUrl
   * @returns {Promise<{online: boolean, models: string[], error?: string}>}
   */
  async function checkHealth(baseUrl = DEFAULT_URL) {
    const url = (baseUrl || DEFAULT_URL).replace(/\/+$/, '');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
      const response = await fetch(`${url}/api/tags`, {
        method: 'GET',
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          online: false,
          models: [],
          error: `Ollama returned HTTP status ${response.status}`
        };
      }

      const data = await response.json();
      const models = (data.models || []).map(m => m.name);
      return { online: true, models };
    } catch (err) {
      clearTimeout(timeoutId);
      const isAbort = err.name === 'AbortError';
      return {
        online: false,
        models: [],
        error: isAbort ? 'Connection timed out' : 'Ollama is offline or unreachable on ' + url
      };
    }
  }

  /**
   * Format user profile facts into a clear, bulleted text summary for LLM context
   */
  function formatProfileContext(profile) {
    if (!profile) return 'No user profile information provided.';

    const lines = [];
    const pushIf = (label, val) => {
      if (val && String(val).trim() !== '') {
        lines.push(`- ${label}: ${String(val).trim()}`);
      }
    };

    pushIf('Full Name', profile.fullName);
    pushIf('First Name', profile.firstName);
    pushIf('Last Name', profile.lastName);
    pushIf('Email', profile.email);
    pushIf('Phone', profile.phone);
    pushIf('Age', profile.age);
    pushIf('Birth Year', profile.birthYear);
    pushIf('Gender', profile.gender);
    pushIf('Country', profile.country);
    pushIf('State/Province', profile.stateProvince);
    pushIf('City', profile.city);
    pushIf('Postal / Zip Code', profile.postalCode);
    pushIf('Education Level', profile.education);
    pushIf('Employment Status', profile.employmentStatus);
    pushIf('Job Title', profile.jobTitle);
    pushIf('Industry', profile.industry);
    pushIf('Household Income', profile.householdIncome);
    pushIf('Marital Status', profile.maritalStatus);
    pushIf('Has Children', profile.hasChildren);
    pushIf('Household Size', profile.householdSize);
    pushIf('Primary Language', profile.primaryLanguage);
    pushIf('Primary Devices', profile.deviceUsage);
    pushIf('Hobbies & Interests', profile.hobbies);

    // Custom facts
    if (Array.isArray(profile.customFacts)) {
      profile.customFacts.forEach(fact => {
        if (fact.key && fact.value) {
          pushIf(fact.key, fact.value);
        }
      });
    }

    if (lines.length === 0) {
      return 'The profile is currently empty.';
    }

    return lines.join('\n');
  }

  /**
   * Ask local Ollama to resolve an ambiguous question grounded strictly in profile data
   * 
   * @param {Object} params
   * @param {string} params.questionText
   * @param {string} params.fieldType
   * @param {Array<{label: string, value: string}>} [params.options]
   * @param {Object} params.profile
   * @param {Object} params.settings
   * @returns {Promise<{success: boolean, answer: string, confidence: string, error?: string}>}
   */
  async function interpretQuestion({ questionText, fieldType, options = [], profile, settings }) {
    const baseUrl = (settings.ollamaUrl || DEFAULT_URL).replace(/\/+$/, '');
    const model = settings.ollamaModel || 'llama3.2:1b';
    const profileContext = formatProfileContext(profile);

    const choicesText = (options && options.length > 0)
      ? options.map(o => `"${o.label}"`).join(', ')
      : 'Freeform text (provide direct answer)';

    const systemPrompt = `You are a privacy-preserving assistant assisting a human in completing an online survey.
You MUST follow these rules strictly:
1. Base your answer EXCLUSIVELY on the verified facts in the USER PROFILE below.
2. If the user profile does NOT mention or clearly deduce the information to answer this question, or if you have any doubt, respond with EXACTLY: NEEDS USER INPUT
3. If choices are provided, choose ONLY from the listed choices.
4. Output ONLY the raw answer text or choice. Do NOT include quotes, explanations, markdown, or pleasantries.
5. NEVER fabricate or guess any personal details.`;

    const userPrompt = `USER PROFILE:
${profileContext}

SURVEY QUESTION: "${questionText}"
FIELD TYPE: ${fieldType}
AVAILABLE CHOICES: [ ${choicesText} ]

What is the accurate answer for this survey question based ONLY on the user profile above?`;

    const controller = new AbortController();
    const timeoutMs = settings.ollamaTimeoutMs || DEFAULT_TIMEOUT_MS;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model,
          prompt: `${systemPrompt}\n\n${userPrompt}`,
          stream: false,
          options: {
            temperature: 0.0,
            num_predict: 80
          }
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          success: false,
          answer: 'NEEDS USER INPUT',
          confidence: 'error',
          error: `Ollama returned status ${response.status}`
        };
      }

      const data = await response.json();
      let rawAnswer = (data.response || '').trim();

      // Clean up common model quotation wraps
      rawAnswer = rawAnswer.replace(/^["'`]|["'`]$/g, '').trim();

      // Check if model admitted it needs input
      if (
        !rawAnswer ||
        rawAnswer.toUpperCase().includes('NEEDS USER INPUT') ||
        rawAnswer.toLowerCase().includes('not mentioned') ||
        rawAnswer.toLowerCase().includes('unknown') ||
        rawAnswer.toLowerCase().includes('not provided')
      ) {
        return {
          success: true,
          answer: 'NEEDS USER INPUT',
          confidence: 'needs_input'
        };
      }

      // If choices were given, verify if answer matches one of the choices
      if (options && options.length > 0) {
        const match = options.find(o => 
          o.label.toLowerCase() === rawAnswer.toLowerCase() ||
          rawAnswer.toLowerCase().includes(o.label.toLowerCase()) ||
          o.label.toLowerCase().includes(rawAnswer.toLowerCase())
        );

        if (match) {
          return {
            success: true,
            answer: match.label,
            confidence: 'llm_matched'
          };
        }
      }

      return {
        success: true,
        answer: rawAnswer,
        confidence: 'llm_suggested'
      };
    } catch (err) {
      clearTimeout(timeoutId);
      const isAbort = err.name === 'AbortError';
      return {
        success: false,
        answer: 'NEEDS USER INPUT',
        confidence: 'fallback',
        error: isAbort ? 'Ollama request timed out' : 'Could not reach local Ollama'
      };
    }
  }

  return {
    checkHealth,
    interpretQuestion,
    formatProfileContext,
    DEFAULT_URL
  };
})();

// Attach to window for standard script access
if (typeof window !== 'undefined') {
  window.LlmAdapter = LlmAdapter;
}

