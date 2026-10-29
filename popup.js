/**
 * SurveyAssistant - Popup Controller
 * 
 * Orchestrates page scanning, rule-based matching, local Ollama LLM queries,
 * interactive human-in-the-loop answer review, overwrite protection, and safe field filling.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements
  const scanBtn = document.getElementById('scan-page-btn');
  const fillBtn = document.getElementById('fill-approved-btn');
  const openSettingsBtn = document.getElementById('open-settings-btn');
  const launchDemoBtn = document.getElementById('launch-demo-btn');
  const noticeBanner = document.getElementById('notice-banner');
  const noticeText = document.getElementById('notice-text');

  const emptyView = document.getElementById('empty-view');
  const loadingView = document.getElementById('loading-view');
  const loadingText = document.getElementById('loading-text');
  const reviewView = document.getElementById('review-view');
  const questionsListEl = document.getElementById('questions-list');

  const statTotalEl = document.getElementById('stat-total');
  const statMatchedEl = document.getElementById('stat-matched');
  const statNeedsInputEl = document.getElementById('stat-needs-input');
  const statExistingEl = document.getElementById('stat-existing');
  const toggleSelectAll = document.getElementById('toggle-select-all');
  const toggleOverwriteExisting = document.getElementById('toggle-overwrite-existing');

  // Demo Profile Indicator & Switcher Elements
  const demoProfileBanner = document.getElementById('demo-profile-banner');
  const switchToRealBtn = document.getElementById('switch-to-real-btn');
  const activeProfileNameEl = document.getElementById('active-profile-name');
  const toggleProfileModeBtn = document.getElementById('toggle-profile-mode-btn');

  const llmStatusPill = document.getElementById('llm-status-pill');
  const llmStatusText = document.getElementById('llm-status-text');

  // State
  let currentQuestions = [];
  let userProfile = {};
  let savedRealProfile = {};
  let activeProfileMode = 'real'; // 'real' or 'demo'
  let userSettings = {
    enableOllama: false,
    ollamaUrl: 'http://localhost:11434',
    ollamaModel: 'llama3.2:1b'
  };

  // 1. Initialize Settings and Profile
  await loadState();
  initOllamaIndicator();

  // Event Handlers
  openSettingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  launchDemoBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'http://localhost:8080/demo_survey.html' });
  });

  scanBtn.addEventListener('click', handleScanPage);
  fillBtn.addEventListener('click', handleFillFields);

  // Toggle "Select all ready"
  toggleSelectAll.addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    const allowOverwrite = toggleOverwriteExisting ? toggleOverwriteExisting.checked : false;

    document.querySelectorAll('.q-include-cb').forEach(cb => {
      const card = cb.closest('.q-card');
      const idx = parseInt(card.dataset.index, 10);
      const isNeedsInput = card.classList.contains('needs-input');
      const q = currentQuestions[idx];

      // If selecting all, don't auto-check items needing input or already answered unless overwrite is allowed
      if (!isNeedsInput || !isChecked) {
        if (q && q.hasExistingAnswer && !allowOverwrite && isChecked) {
          // Keep existing answered items unchecked unless overwrite is toggled
          cb.checked = false;
          q.included = false;
        } else {
          cb.checked = isChecked;
          if (q) {
            q.included = isChecked && !isNeedsInput;
          }
        }
      }
    });
    updateFillButtonState();
  });

  // Toggle "Overwrite existing"
  if (toggleOverwriteExisting) {
    toggleOverwriteExisting.addEventListener('change', (e) => {
      const overwrite = e.target.checked;
      currentQuestions.forEach((q, idx) => {
        if (q.hasExistingAnswer && q.suggestedAnswer && q.suggestedAnswer !== 'NEEDS USER INPUT') {
          q.included = overwrite;
          const card = document.querySelector(`.q-card[data-index="${idx}"]`);
          if (card) {
            const cb = card.querySelector('.q-include-cb');
            if (cb) cb.checked = overwrite;
          }
        }
      });
      updateFillButtonState();
    });
  }

  // Switch to Real Profile button handler (on Demo Profile banner)
  if (switchToRealBtn) {
    switchToRealBtn.addEventListener('click', () => {
      chrome.storage.local.set({ activeProfileMode: 'real' }, async () => {
        await loadState();
        showNotice('Returned to your real personal profile.', 'info');
        if (currentQuestions.length > 0) {
          handleScanPage();
        }
      });
    });
  }

  // Toggle Profile Mode button handler (in profile bar)
  if (toggleProfileModeBtn) {
    toggleProfileModeBtn.addEventListener('click', () => {
      const nextMode = activeProfileMode === 'demo' ? 'real' : 'demo';
      chrome.storage.local.set({ activeProfileMode: nextMode }, async () => {
        await loadState();
        const msg = nextMode === 'demo'
          ? 'Demo profile active (Age: 35, Male, IT professional, ₹20 LPA, Delhi). Real profile is safely preserved.'
          : 'Returned to your real personal profile.';
        showNotice(msg, 'info');
        if (currentQuestions.length > 0) {
          handleScanPage();
        }
      });
    });
  }

  /**
   * Load stored profile and settings from chrome.storage.local
   */
  async function loadState() {
    return new Promise(resolve => {
      chrome.storage.local.get(['surveyAssistantProfile', 'surveyAssistantSettings', 'activeProfileMode'], (res) => {
        savedRealProfile = res.surveyAssistantProfile || {};
        userSettings = Object.assign(userSettings, res.surveyAssistantSettings || {});
        activeProfileMode = res.activeProfileMode || 'real';

        if (activeProfileMode === 'demo') {
          // Use Demo Sample Profile strictly without overwriting real profile
          userProfile = Object.assign({}, (window.DEMO_SAMPLE_PROFILE || {}));
          if (demoProfileBanner) demoProfileBanner.style.display = 'flex';
          if (activeProfileNameEl) activeProfileNameEl.textContent = 'DEMO Profile (Rahul Sharma)';
          if (toggleProfileModeBtn) toggleProfileModeBtn.textContent = 'Switch to My Profile';
        } else {
          // Use real saved user profile
          userProfile = savedRealProfile;
          if (demoProfileBanner) demoProfileBanner.style.display = 'none';
          if (activeProfileNameEl) {
            activeProfileNameEl.textContent = savedRealProfile.fullName 
              ? `${savedRealProfile.fullName} (Real Profile)`
              : 'My Real Profile';
          }
          if (toggleProfileModeBtn) toggleProfileModeBtn.textContent = 'Use Demo Profile';
        }

        resolve();
      });
    });
  }

  /**
   * Check Ollama connectivity in the background and update header pill
   */
  async function initOllamaIndicator() {
    if (!userSettings.enableOllama) {
      llmStatusText.textContent = 'Rules Engine (Local)';
      llmStatusPill.className = 'header-sub';
      return;
    }

    llmStatusText.textContent = 'Checking Ollama...';
    const status = await LlmAdapter.checkHealth(userSettings.ollamaUrl);
    if (status.online) {
      llmStatusText.textContent = `Ollama: ${userSettings.ollamaModel}`;
      llmStatusPill.className = 'header-sub connected';
    } else {
      llmStatusText.textContent = 'Ollama: Offline (Rules fallback)';
      llmStatusPill.className = 'header-sub offline';
    }
  }

  /**
   * Display notice banner
   */
  function showNotice(msg, type = 'info') {
    noticeText.textContent = msg;
    noticeBanner.className = `notice-banner ${type}`;
    noticeBanner.style.display = 'flex';
  }

  function hideNotice() {
    noticeBanner.style.display = 'none';
  }

  /**
   * Safely inject content script if not already present on active tab
   */
  async function ensureContentScriptInjected(tabId) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { action: 'PING' });
      if (response && response.pong) return true;
    } catch {
      // Content script is not yet injected; inject dynamically
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ['content.js']
        });
        return true;
      } catch (err) {
        throw new Error('Cannot inject into this page: ' + err.message);
      }
    }
    return true;
  }

  /**
   * Main Scan Workflow
   */
  async function handleScanPage() {
    hideNotice();
    emptyView.style.display = 'none';
    reviewView.style.display = 'none';
    loadingView.style.display = 'flex';
    loadingText.textContent = 'Scanning survey elements...';
    fillBtn.disabled = true;

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        throw new Error('No active browser tab found.');
      }

      // Check for browser restricted URLs (chrome://, edge://, about:)
      if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
        throw new Error('Extensions cannot interact with browser system pages (chrome://). Please open a web survey or http://localhost:8080/demo_survey.html.');
      }

      // Check for chrome-extension:// pages
      if (tab.url.startsWith('chrome-extension://')) {
        throw new Error('Chrome forbids injecting scripts into extension pages (chrome-extension://). Please test using http://localhost:8080/demo_survey.html (run node server.js) or a local file:// URL.');
      }

      // Check for file:// URLs permission
      if (tab.url.startsWith('file://')) {
        const isAllowed = await new Promise(resolve => {
          if (chrome.extension && chrome.extension.isAllowedFileSchemeAccess) {
            chrome.extension.isAllowedFileSchemeAccess(resolve);
          } else {
            resolve(true);
          }
        });
        if (!isAllowed) {
          throw new Error('To use SurveyAssistant on local file:// pages, please enable "Allow access to file URLs" in chrome://extensions -> SurveyAssistant -> Details.');
        }
      }

      // Ensure content script is active
      await ensureContentScriptInjected(tab.id);

      // Request question detection from content.js
      const scanResponse = await chrome.tabs.sendMessage(tab.id, { action: 'SCAN_QUESTIONS' });

      if (!scanResponse || !scanResponse.success) {
        throw new Error(scanResponse?.error || 'Failed to scan page questions.');
      }

      const detected = scanResponse.questions || [];
      if (detected.length === 0) {
        loadingView.style.display = 'none';
        emptyView.style.display = 'flex';
        showNotice('No survey input fields detected on this page.', 'warn');
        return;
      }

      // Refresh profile state in case user edited it recently
      await loadState();

      // Process and match each question
      loadingText.textContent = `Matching ${detected.length} questions against profile...`;
      const processed = [];
      const allowOverwrite = toggleOverwriteExisting ? toggleOverwriteExisting.checked : false;

      for (let i = 0; i < detected.length; i++) {
        const item = detected[i];
        
        // 1. Phase 1: Rule-based deterministic profile matching
        const ruleMatch = SurveyMatcher.matchQuestion(item, userProfile);
        let finalAnswer = ruleMatch.answer;
        let matchSource = ruleMatch.confidence; // 'rule_matched' or 'needs_input'

        // 2. Phase 2: Local Ollama LLM (only if rule was unsure & Ollama is enabled)
        if (ruleMatch.confidence === 'needs_input' && userSettings.enableOllama) {
          loadingText.textContent = `Asking local LLM (${i + 1}/${detected.length})...`;
          const llmResult = await LlmAdapter.interpretQuestion({
            questionText: item.question,
            fieldType: item.type,
            options: item.options,
            profile: userProfile,
            settings: userSettings
          });

          if (llmResult.success && llmResult.answer !== 'NEEDS USER INPUT') {
            finalAnswer = llmResult.answer;
            matchSource = 'llm_matched';
          }
        }

        // Do not auto-check items that already have existing answers unless overwrite is requested
        const hasExisting = !!item.hasExistingAnswer;
        const isReady = finalAnswer !== 'NEEDS USER INPUT' && finalAnswer.trim() !== '';
        const shouldInclude = isReady && (!hasExisting || allowOverwrite);

        processed.push({
          ...item,
          suggestedAnswer: finalAnswer,
          matchSource: matchSource,
          included: shouldInclude,
          overwriteApproved: false
        });
      }

      currentQuestions = processed;
      renderQuestionsList(processed);

      loadingView.style.display = 'none';
      reviewView.style.display = 'block';

      // Quick hint if profile was empty
      if (Object.keys(userProfile).length === 0) {
        showNotice('Your profile is currently empty. Open settings ⚙️ to add your info.', 'warn');
      }

    } catch (err) {
      loadingView.style.display = 'none';
      emptyView.style.display = 'flex';
      showNotice(err.message, 'error');
    }
  }

  /**
   * Render detected and matched questions for user review
   */
  function renderQuestionsList(questions) {
    questionsListEl.innerHTML = '';

    let matchedCount = 0;
    let needsInputCount = 0;
    let existingCount = 0;

    questions.forEach((q, index) => {
      const isNeedsInput = q.suggestedAnswer === 'NEEDS USER INPUT' || !q.suggestedAnswer;
      if (isNeedsInput) {
        needsInputCount++;
      } else {
        matchedCount++;
      }

      if (q.hasExistingAnswer) {
        existingCount++;
      }

      const card = document.createElement('div');
      const cardTypeClass = isNeedsInput ? 'needs-input' : (q.matchSource === 'llm_matched' ? 'llm-matched' : 'matched');
      card.className = `q-card ${cardTypeClass}`;
      card.dataset.index = index;

      // Badges
      let sourceBadgeText = 'Profile Match';
      let sourceBadgeClass = 'badge-profile';

      if (isNeedsInput) {
        sourceBadgeText = 'NEEDS USER INPUT';
        sourceBadgeClass = 'badge-needs-input';
      } else if (q.matchSource === 'llm_matched') {
        sourceBadgeText = 'Local LLM';
        sourceBadgeClass = 'badge-llm';
      }

      const typeBadgeText = formatTypeBadge(q.type);
      const existingBadgeHtml = q.hasExistingAnswer 
        ? `<span class="badge badge-existing" title="Field already filled on page">Has Answer</span>` 
        : '';
      const existingNoteHtml = q.hasExistingAnswer && q.existingValue
        ? `<span class="q-existing-note">Page currently has: <strong>${escapeHtml(q.existingValue)}</strong></span>`
        : '';

      card.innerHTML = `
        <div class="q-card-header">
          <div class="q-card-title-group">
            <input type="checkbox" class="q-include-cb" ${q.included ? 'checked' : ''} title="Include in auto-fill">
            <div>
              <div class="q-label">${escapeHtml(q.question)}</div>
              ${existingNoteHtml}
            </div>
          </div>
          <div class="q-badges">
            <span class="badge badge-type">${typeBadgeText}</span>
            ${existingBadgeHtml}
            <span class="badge ${sourceBadgeClass}">${sourceBadgeText}</span>
          </div>
        </div>
        <div class="q-answer-wrapper">
          <input type="text" class="q-answer-input ${isNeedsInput ? 'input-needs-attention' : ''}" 
                 value="${escapeHtml(isNeedsInput ? '' : q.suggestedAnswer)}" 
                 placeholder="${isNeedsInput ? 'NEEDS USER INPUT (Type here if you wish to fill)' : 'Suggested answer'}">
        </div>
      `;

      // Event listener for user editing the answer directly
      const inputEl = card.querySelector('.q-answer-input');
      const cbEl = card.querySelector('.q-include-cb');

      inputEl.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        currentQuestions[index].suggestedAnswer = val;
        if (val.length > 0) {
          cbEl.checked = true;
          currentQuestions[index].included = true;
          currentQuestions[index].overwriteApproved = true;
          card.classList.remove('needs-input');
          card.classList.add('matched');
        }
        updateFillButtonState();
      });

      cbEl.addEventListener('change', (e) => {
        currentQuestions[index].included = e.target.checked;
        if (e.target.checked && currentQuestions[index].hasExistingAnswer) {
          currentQuestions[index].overwriteApproved = true;
        }
        updateFillButtonState();
      });

      questionsListEl.appendChild(card);
    });

    // Update stats
    statTotalEl.textContent = `${questions.length} detected`;
    statMatchedEl.textContent = `${matchedCount} ready`;
    statNeedsInputEl.textContent = `${needsInputCount} needs input`;
    
    if (statExistingEl) {
      if (existingCount > 0) {
        statExistingEl.textContent = `${existingCount} has answer`;
        statExistingEl.style.display = 'inline-block';
      } else {
        statExistingEl.style.display = 'none';
      }
    }

    updateFillButtonState();
  }

  /**
   * Updates state of Fill Form button based on selected questions
   */
  function updateFillButtonState() {
    const activeReady = currentQuestions.filter(q => {
      const answer = q.suggestedAnswer ? q.suggestedAnswer.trim() : '';
      return q.included && answer !== '' && answer !== 'NEEDS USER INPUT';
    });

    fillBtn.disabled = activeReady.length === 0;
    fillBtn.textContent = activeReady.length > 0 
      ? `✏️ Fill Form (${activeReady.length})` 
      : '✏️ Fill Form';
  }

  /**
   * Send approved answers to content script to safely fill
   */
  async function handleFillFields() {
    hideNotice();
    const approvedToFill = currentQuestions.filter(q => {
      const answer = q.suggestedAnswer ? q.suggestedAnswer.trim() : '';
      return q.included && answer !== '' && answer !== 'NEEDS USER INPUT';
    });

    if (approvedToFill.length === 0) {
      showNotice('No answers selected to fill.', 'warn');
      return;
    }

    const allowOverwrite = toggleOverwriteExisting ? toggleOverwriteExisting.checked : false;

    fillBtn.disabled = true;
    fillBtn.textContent = 'Filling...';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const fillResponse = await chrome.tabs.sendMessage(tab.id, {
        action: 'FILL_FIELDS',
        approvedAnswers: approvedToFill,
        overwriteExisting: allowOverwrite
      });

      if (fillResponse && fillResponse.success) {
        const filled = fillResponse.filledCount || 0;
        const skipped = fillResponse.skippedCount || 0;
        const failed = fillResponse.failedCount || 0;

        const isWarning = failed > 0;
        let msg = `Form updated! Filled: ${filled} | Skipped: ${skipped} | Failed: ${failed}.`;

        if (failed > 0 && fillResponse.failed && fillResponse.failed.length > 0) {
          msg += ` Issue: ${fillResponse.failed[0].reason}.`;
        } else {
          msg += ` Review values on page before submitting manually.`;
        }

        showNotice(msg, isWarning ? 'warn' : 'success');
      } else {
        showNotice(fillResponse?.error || 'Some fields could not be filled.', 'warn');
      }
    } catch (err) {
      showNotice('Error filling fields: ' + err.message, 'error');
    } finally {
      updateFillButtonState();
    }
  }

  function formatTypeBadge(type) {
    switch (type) {
      case 'radio': return 'Radio';
      case 'checkbox_group': return 'Checkbox Group';
      case 'checkbox': return 'Checkbox';
      case 'select': return 'Dropdown';
      case 'textarea': return 'Textarea';
      case 'email': return 'Email';
      case 'number': return 'Number';
      default: return 'Text';
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
