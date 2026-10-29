/**
 * SurveyAssistant - Options & Profile Manager
 * 
 * Manages user profile persistence via chrome.storage.local,
 * custom facts list, and local Ollama connection testing.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Navigation tabs
  initTabs();

  // Profile Form Elements
  const fields = [
    'fullName', 'firstName', 'lastName', 'email', 'phone', 'gender',
    'age', 'birthYear', 'country', 'stateProvince', 'city', 'postalCode',
    'education', 'employmentStatus', 'jobTitle', 'industry', 'householdIncome',
    'maritalStatus', 'hasChildren', 'householdSize', 'primaryLanguage',
    'deviceUsage', 'hobbies'
  ];

  // LLM Settings Elements
  const enableOllamaEl = document.getElementById('enableOllama');
  const ollamaUrlEl = document.getElementById('ollamaUrl');
  const ollamaModelEl = document.getElementById('ollamaModel');
  const testOllamaBtn = document.getElementById('test-ollama-btn');
  const ollamaStatusMsg = document.getElementById('ollama-status-message');

  // Custom Facts Elements
  const customFactsContainer = document.getElementById('custom-facts-container');
  const addCustomFactBtn = document.getElementById('add-custom-fact-btn');
  const factTemplate = document.getElementById('custom-fact-row-template');

  // Actions
  const saveTopBtn = document.getElementById('save-top-btn');
  const saveBottomBtn = document.getElementById('save-bottom-btn');
  const saveStatusEl = document.getElementById('save-status');
  const openDemoBtn = document.getElementById('open-demo-survey-btn');
  const exportBtn = document.getElementById('export-profile-btn');
  const importInput = document.getElementById('import-profile-input');
  const clearBtn = document.getElementById('clear-profile-btn');

  // Demo Profile Controls
  const activateDemoBtn = document.getElementById('activate-demo-profile-btn');
  const activateRealBtn = document.getElementById('activate-real-profile-btn');
  const modeTitleEl = document.getElementById('options-active-mode-title');
  const modeDetailsEl = document.getElementById('options-active-mode-details');

  // Load existing profile from chrome.storage.local
  loadProfile();

  // Attach Save Handlers
  saveTopBtn.addEventListener('click', saveProfile);
  saveBottomBtn.addEventListener('click', saveProfile);

  // Add Custom Fact row
  addCustomFactBtn.addEventListener('click', () => {
    addCustomFactRow('', '');
  });

  // Test Ollama Connection
  testOllamaBtn.addEventListener('click', async () => {
    ollamaStatusMsg.className = 'status-msg';
    ollamaStatusMsg.textContent = 'Testing connection to local Ollama...';

    const url = ollamaUrlEl.value.trim() || 'http://localhost:11434';
    const result = await LlmAdapter.checkHealth(url);

    if (result.online) {
      const modelsList = result.models.length > 0
        ? `Found models: ${result.models.join(', ')}`
        : 'Ollama is online, but no models found. (Run: ollama pull llama3.2:1b)';
      
      ollamaStatusMsg.className = 'status-msg success';
      ollamaStatusMsg.textContent = `Connected successfully! ${modelsList}`;

      // If user hasn't set model or it's default, pick first available
      if (result.models.length > 0 && (!ollamaModelEl.value.trim() || ollamaModelEl.value === 'llama3.2:1b')) {
        ollamaModelEl.value = result.models[0];
      }
    } else {
      ollamaStatusMsg.className = 'status-msg error';
      ollamaStatusMsg.textContent = `Failed: ${result.error || 'Ollama offline'}. Profile matching remains fully functional without Ollama.`;
    }
  });

  // Activate Demo Profile for Testing (Never overwrites real profile)
  if (activateDemoBtn) {
    activateDemoBtn.addEventListener('click', () => {
      chrome.storage.local.set({ activeProfileMode: 'demo' }, () => {
        updateActiveModeUI('demo');
        showStatus('Demo Sample Profile activated for testing! Real profile is safely preserved.', true);
      });
    });
  }

  // Activate Real Profile
  if (activateRealBtn) {
    activateRealBtn.addEventListener('click', () => {
      chrome.storage.local.set({ activeProfileMode: 'real' }, () => {
        updateActiveModeUI('real');
        showStatus('Switched to your real personal profile.', true);
      });
    });
  }

  function updateActiveModeUI(mode) {
    if (!modeTitleEl || !modeDetailsEl) return;
    if (mode === 'demo') {
      modeTitleEl.textContent = 'Active Profile: DEMO SAMPLE PROFILE (Rahul Sharma)';
      modeTitleEl.style.color = '#b45309';
      modeDetailsEl.textContent = 'Using Demo Profile facts (Age: 35, Male, IT professional, ₹20 LPA, Married, 2 Children, Delhi, Own apartment). Your real profile is untouched and safely saved.';
    } else {
      modeTitleEl.textContent = 'Active Profile: My Real Profile';
      modeTitleEl.style.color = '#0f172a';
      modeDetailsEl.textContent = 'Using your saved personal profile for question matching.';
    }
  }

  // Open Built-in Demo Survey Tab
  openDemoBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'http://localhost:8080/demo_survey.html' });
  });

  // Export Profile (JSON)
  exportBtn.addEventListener('click', () => {
    chrome.storage.local.get(['surveyAssistantProfile', 'surveyAssistantSettings'], (res) => {
      const exportData = {
        profile: res.surveyAssistantProfile || {},
        settings: res.surveyAssistantSettings || {},
        exportedAt: new Date().toISOString()
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'survey_assistant_profile.json';
      a.click();
      URL.revokeObjectURL(url);
    });
  });

  // Import Profile (JSON)
  importInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        if (imported.profile) {
          populateForm(imported.profile);
          if (imported.settings) {
            enableOllamaEl.checked = !!imported.settings.enableOllama;
            ollamaUrlEl.value = imported.settings.ollamaUrl || 'http://localhost:11434';
            ollamaModelEl.value = imported.settings.ollamaModel || 'llama3.2:1b';
          }
          showStatus('Profile imported from file. Click "Save Profile" to commit.', true);
        } else {
          alert('Invalid profile JSON structure.');
        }
      } catch (err) {
        alert('Could not parse imported JSON file: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  });

  // Clear Profile
  clearBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to completely erase all saved profile data?')) {
      chrome.storage.local.remove(['surveyAssistantProfile'], () => {
        fields.forEach(id => {
          const el = document.getElementById(id);
          if (el) el.value = '';
        });
        customFactsContainer.innerHTML = '';
        showStatus('All profile data cleared.', false);
      });
    }
  });

  // Tab switching logic
  function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        btn.classList.add('active');
        const targetId = btn.getAttribute('data-tab');
        const targetContent = document.getElementById(targetId);
        if (targetContent) {
          targetContent.classList.add('active');
        }
      });
    });
  }

  // Add custom fact row to DOM
  function addCustomFactRow(key = '', value = '') {
    const clone = factTemplate.content.cloneNode(true);
    const row = clone.querySelector('.custom-fact-row');
    const keyInput = row.querySelector('.fact-key');
    const valInput = row.querySelector('.fact-value');
    const removeBtn = row.querySelector('.remove-fact-btn');

    keyInput.value = key;
    valInput.value = value;

    removeBtn.addEventListener('click', () => {
      row.remove();
    });

    customFactsContainer.appendChild(row);
  }

  // Populate HTML inputs from an object
  function populateForm(data) {
    if (!data) return;

    fields.forEach(id => {
      const el = document.getElementById(id);
      if (el && data[id] !== undefined) {
        el.value = data[id];
      }
    });

    // Custom facts
    customFactsContainer.innerHTML = '';
    if (Array.isArray(data.customFacts)) {
      data.customFacts.forEach(fact => {
        if (fact.key || fact.value) {
          addCustomFactRow(fact.key, fact.value);
        }
      });
    }
  }

  // Load from chrome.storage.local
  function loadProfile() {
    chrome.storage.local.get(['surveyAssistantProfile', 'surveyAssistantSettings', 'activeProfileMode'], (res) => {
      if (res.surveyAssistantProfile) {
        populateForm(res.surveyAssistantProfile);
      }

      const settings = res.surveyAssistantSettings || {};
      enableOllamaEl.checked = !!settings.enableOllama;
      ollamaUrlEl.value = settings.ollamaUrl || 'http://localhost:11434';
      ollamaModelEl.value = settings.ollamaModel || 'llama3.2:1b';

      updateActiveModeUI(res.activeProfileMode || 'real');
    });
  }

  // Save to chrome.storage.local
  function saveProfile() {
    const profile = {};
    fields.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        profile[id] = el.value.trim();
      }
    });

    // Collect custom facts
    const customFacts = [];
    document.querySelectorAll('.custom-fact-row').forEach(row => {
      const k = row.querySelector('.fact-key').value.trim();
      const v = row.querySelector('.fact-value').value.trim();
      if (k || v) {
        customFacts.push({ key: k, value: v });
      }
    });
    profile.customFacts = customFacts;

    // Collect settings
    const settings = {
      enableOllama: enableOllamaEl.checked,
      ollamaUrl: ollamaUrlEl.value.trim() || 'http://localhost:11434',
      ollamaModel: ollamaModelEl.value.trim() || 'llama3.2:1b',
      ollamaTimeoutMs: 6000
    };

    chrome.storage.local.set({
      surveyAssistantProfile: profile,
      surveyAssistantSettings: settings
    }, () => {
      showStatus('All changes saved locally to chrome.storage.local!', true);
    });
  }

  function showStatus(text, isSuccess) {
    saveStatusEl.textContent = text;
    saveStatusEl.className = 'save-status-indicator ' + (isSuccess ? 'saved' : '');
    setTimeout(() => {
      saveStatusEl.textContent = 'All changes saved locally.';
      saveStatusEl.className = 'save-status-indicator';
    }, 4000);
  }

  // Pre-configured sample profile for rapid testing
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
    hobbies: "Hiking, Photography, Open Source",
    customFacts: [
      { key: "Primary Commute", value: "Bicycle and Public Transit" },
      { key: "Pet Owner", value: "Yes, 1 Cat" },
      { key: "Dietary Preference", value: "Vegetarian" }
    ]
  };
});

