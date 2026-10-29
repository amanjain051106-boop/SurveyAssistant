/**
 * SurveyAssistant - Content Script
 * 
 * Safely inspects visible survey form fields, extracts contextual question text,
 * and fills approved values when requested by the popup.
 * 
 * Safety Guarantees:
 * - NEVER triggers form submissions or clicks submit buttons.
 * - NEVER interacts with CAPTCHA or security challenges.
 * - NEVER touches password fields or hidden fields.
 * - Respects existing answers unless user explicitly approves overwriting.
 */

(function () {
  // Prevent duplicate listener registration if injected multiple times
  if (window.__surveyAssistantInitialized) {
    return;
  }
  window.__surveyAssistantInitialized = true;

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'SCAN_QUESTIONS') {
      try {
        const questions = scanPageQuestions();
        sendResponse({ success: true, count: questions.length, questions });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }

    if (request.action === 'FILL_FIELDS') {
      try {
        const result = fillSurveyFields(
          request.approvedAnswers || [],
          !!request.overwriteExisting
        );
        sendResponse({ success: true, ...result });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }

    if (request.action === 'PING') {
      sendResponse({ success: true, pong: true });
      return true;
    }
  });

  /**
   * Helper: check if element is visible and not hidden
   */
  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      return false;
    }
    return true;
  }

  /**
   * Helper: get clean text content without extra whitespace
   */
  function cleanText(str) {
    if (!str) return '';
    return str.replace(/\s+/g, ' ').trim();
  }

  /**
   * Extracts question label/text for a single input element
   */
  function getQuestionTextForElement(el) {
    // 1. Check aria-labelledby
    if (el.getAttribute('aria-labelledby')) {
      const ids = el.getAttribute('aria-labelledby').split(' ');
      const text = ids.map(id => {
        const target = document.getElementById(id);
        return target ? target.innerText : '';
      }).join(' ');
      if (cleanText(text)) return cleanText(text);
    }

    // 2. Check aria-label
    if (el.getAttribute('aria-label')) {
      const text = cleanText(el.getAttribute('aria-label'));
      if (text) return text;
    }

    // 3. Check explicit <label for="id">
    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label && cleanText(label.innerText)) {
        return cleanText(label.innerText);
      }
    }

    // 4. Check enclosing <label>
    const parentLabel = el.closest('label');
    if (parentLabel && cleanText(parentLabel.innerText)) {
      return cleanText(parentLabel.innerText);
    }

    // 5. Check placeholder
    if (el.placeholder && cleanText(el.placeholder)) {
      return cleanText(el.placeholder);
    }

    // 6. Look for nearest preceding label, heading, or question title in container
    const container = el.closest('.form-group, .question, .survey-question, .question-block, .field, .form-row, .q-item, div');
    if (container) {
      const heading = container.querySelector('h1, h2, h3, h4, h5, h6, .question-title, .label, .title, strong, p');
      if (heading && isVisible(heading) && cleanText(heading.innerText)) {
        return cleanText(heading.innerText);
      }
    }

    // 7. Fallback to name or title attribute
    if (el.name && cleanText(el.name)) {
      return cleanText(el.name);
    }
    if (el.title && cleanText(el.title)) {
      return cleanText(el.title);
    }

    return 'Untitled Question';
  }

  /**
   * Extracts group question text (for radio buttons and checkbox sets)
   */
  function getGroupQuestionText(elements) {
    if (!elements || elements.length === 0) return 'Untitled Group';
    const first = elements[0];

    // 1. Check enclosing <fieldset> with <legend>
    const fieldset = first.closest('fieldset');
    if (fieldset) {
      const legend = fieldset.querySelector('legend');
      if (legend && cleanText(legend.innerText)) {
        return cleanText(legend.innerText);
      }
    }

    // 2. Check enclosing role="radiogroup" or role="group"
    const groupRole = first.closest('[role="radiogroup"], [role="group"]');
    if (groupRole) {
      if (groupRole.getAttribute('aria-labelledby')) {
        const target = document.getElementById(groupRole.getAttribute('aria-labelledby'));
        if (target && cleanText(target.innerText)) return cleanText(target.innerText);
      }
      if (groupRole.getAttribute('aria-label')) {
        return cleanText(groupRole.getAttribute('aria-label'));
      }
      const heading = groupRole.querySelector('h1, h2, h3, h4, h5, h6, .question-title, strong, p');
      if (heading && cleanText(heading.innerText)) return cleanText(heading.innerText);
    }

    // 3. Check common container heading
    const container = first.closest('.question, .survey-question, .question-block, .form-group, .q-item, .survey-item, div');
    if (container) {
      const heading = container.querySelector('h1, h2, h3, h4, h5, h6, .question-title, .title, strong, p');
      if (heading && cleanText(heading.innerText)) {
        return cleanText(heading.innerText);
      }
    }

    // 4. Fallback to element's name attribute
    if (first.name) {
      return cleanText(first.name.replace(/[-_]/g, ' '));
    }

    return 'Multiple Choice Question';
  }

  /**
   * Helper: extract label text for a specific radio or checkbox option
   */
  function getOptionLabel(inputEl) {
    // 1. Explicit <label for="...">
    if (inputEl.id) {
      const label = document.querySelector(`label[for="${CSS.escape(inputEl.id)}"]`);
      if (label && cleanText(label.innerText)) {
        return cleanText(label.innerText);
      }
    }
    // 2. Parent <label>
    const parentLabel = inputEl.closest('label');
    if (parentLabel && cleanText(parentLabel.innerText)) {
      return cleanText(parentLabel.innerText);
    }
    // 3. Sibling text or span
    if (inputEl.nextElementSibling && cleanText(inputEl.nextElementSibling.innerText)) {
      return cleanText(inputEl.nextElementSibling.innerText);
    }
    // 4. Value or aria-label
    return cleanText(inputEl.getAttribute('aria-label') || inputEl.value || '');
  }

  /**
   * Scan page and return structured question metadata including existing answers
   */
  function scanPageQuestions() {
    const questions = [];
    let fieldCounter = 0;

    // Remove any previous temporary tags
    document.querySelectorAll('[data-survey-assistant-id]').forEach(el => {
      el.removeAttribute('data-survey-assistant-id');
    });

    // 1. Process Radio button groups
    const radioInputs = Array.from(document.querySelectorAll('input[type="radio"]')).filter(isVisible);
    const radioGroups = {};
    radioInputs.forEach(radio => {
      const groupKey = radio.name || ('radio_group_' + Math.random().toString(36).substring(2, 7));
      if (!radioGroups[groupKey]) {
        radioGroups[groupKey] = [];
      }
      radioGroups[groupKey].push(radio);
    });

    Object.keys(radioGroups).forEach(groupKey => {
      const inputs = radioGroups[groupKey];
      const questionText = getGroupQuestionText(inputs);
      const options = inputs.map((r, idx) => {
        const optionId = `sa_radio_${++fieldCounter}`;
        r.setAttribute('data-survey-assistant-id', optionId);
        return {
          id: optionId,
          value: r.value,
          label: getOptionLabel(r) || r.value || `Option ${idx + 1}`
        };
      });

      // Existing answer detection
      const checkedInput = inputs.find(r => r.checked);
      const existingVal = checkedInput ? (getOptionLabel(checkedInput) || checkedInput.value) : null;

      questions.push({
        id: `question_${questions.length + 1}`,
        type: 'radio',
        question: questionText,
        options: options,
        name: inputs[0].name || '',
        existingValue: existingVal,
        hasExistingAnswer: !!checkedInput
      });
    });

    // 2. Process Checkbox groups and individual checkboxes
    const checkboxInputs = Array.from(document.querySelectorAll('input[type="checkbox"]')).filter(isVisible);
    const checkboxGroups = {};
    const standaloneCheckboxes = [];

    checkboxInputs.forEach(cb => {
      const fieldset = cb.closest('fieldset');
      const name = cb.name;
      if (name && name.length > 0) {
        checkboxGroups[name] = checkboxGroups[name] || [];
        checkboxGroups[name].push(cb);
      } else if (fieldset) {
        const fsKey = fieldset.id || ('fs_' + fieldset.offsetTop);
        checkboxGroups[fsKey] = checkboxGroups[fsKey] || [];
        checkboxGroups[fsKey].push(cb);
      } else {
        standaloneCheckboxes.push(cb);
      }
    });

    // Multi-checkbox groups
    Object.keys(checkboxGroups).forEach(groupKey => {
      const inputs = checkboxGroups[groupKey];
      if (inputs.length > 1) {
        const questionText = getGroupQuestionText(inputs);
        const options = inputs.map((cb, idx) => {
          const optionId = `sa_check_${++fieldCounter}`;
          cb.setAttribute('data-survey-assistant-id', optionId);
          return {
            id: optionId,
            value: cb.value,
            label: getOptionLabel(cb) || cb.value || `Option ${idx + 1}`
          };
        });

        // Existing answer detection
        const checkedInputs = inputs.filter(cb => cb.checked);
        const existingVal = checkedInputs.length > 0
          ? checkedInputs.map(cb => getOptionLabel(cb) || cb.value).join(', ')
          : null;

        questions.push({
          id: `question_${questions.length + 1}`,
          type: 'checkbox_group',
          question: questionText,
          options: options,
          name: inputs[0].name || '',
          existingValue: existingVal,
          hasExistingAnswer: checkedInputs.length > 0
        });
      } else {
        standaloneCheckboxes.push(inputs[0]);
      }
    });

    // Standalone checkboxes
    standaloneCheckboxes.forEach(cb => {
      const questionId = `sa_field_${++fieldCounter}`;
      cb.setAttribute('data-survey-assistant-id', questionId);
      const label = getOptionLabel(cb) || getQuestionTextForElement(cb);
      const isChecked = cb.checked;

      questions.push({
        id: `question_${questions.length + 1}`,
        fieldId: questionId,
        type: 'checkbox',
        question: label,
        options: [{ id: questionId, value: cb.value || 'true', label: label }],
        existingValue: isChecked ? (getOptionLabel(cb) || 'Checked') : null,
        hasExistingAnswer: isChecked
      });
    });

    // 3. Process Select Dropdowns
    const selects = Array.from(document.querySelectorAll('select')).filter(isVisible);
    selects.forEach(sel => {
      const questionId = `sa_field_${++fieldCounter}`;
      sel.setAttribute('data-survey-assistant-id', questionId);
      const questionText = getQuestionTextForElement(sel);
      const options = Array.from(sel.options).map(opt => ({
        value: opt.value,
        label: cleanText(opt.text)
      })).filter(opt => opt.value !== '' && opt.label !== '' && !opt.label.toLowerCase().includes('select'));

      // Check for current non-placeholder selection
      const selOpt = sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex] : null;
      const hasRealValue = selOpt && selOpt.value !== '' && !cleanText(selOpt.text).toLowerCase().includes('select');
      const existingVal = hasRealValue ? cleanText(selOpt.text) : null;

      questions.push({
        id: `question_${questions.length + 1}`,
        fieldId: questionId,
        type: 'select',
        question: questionText,
        options: options,
        existingValue: existingVal,
        hasExistingAnswer: !!hasRealValue
      });
    });

    // 4. Process Text, Number, Email, Tel, Date, and Textarea inputs
    const standardInputs = Array.from(document.querySelectorAll(
      'input[type="text"], input[type="email"], input[type="number"], input[type="tel"], input[type="date"], input:not([type]), textarea'
    )).filter(el => {
      if (!isVisible(el)) return false;
      const type = (el.getAttribute('type') || '').toLowerCase();
      if (['password', 'hidden', 'file', 'submit', 'button', 'reset', 'image'].includes(type)) {
        return false;
      }
      return true;
    });

    standardInputs.forEach(inputEl => {
      const questionId = `sa_field_${++fieldCounter}`;
      inputEl.setAttribute('data-survey-assistant-id', questionId);
      const questionText = getQuestionTextForElement(inputEl);
      const tag = inputEl.tagName.toLowerCase();
      const inputType = tag === 'textarea' ? 'textarea' : (inputEl.getAttribute('type') || 'text');
      const curVal = inputEl.value ? inputEl.value.trim() : '';
      const hasRealValue = curVal.length > 0;

      questions.push({
        id: `question_${questions.length + 1}`,
        fieldId: questionId,
        type: inputType,
        question: questionText,
        options: [],
        existingValue: hasRealValue ? curVal : null,
        hasExistingAnswer: hasRealValue
      });
    });

    return questions;
  }

  /**
   * Dispatches standard input, change, and blur events so reactive frameworks detect updates
   */
  function dispatchInputEvents(element) {
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  /**
   * Vibrant green highlight for filled elements and their labels
   */
  function highlightFilled(element) {
    if (!element) return;
    const originalOutline = element.style.outline;
    const originalTransition = element.style.transition;
    const originalBg = element.style.backgroundColor;
    const originalShadow = element.style.boxShadow;

    element.style.transition = 'outline 0.3s ease, background-color 0.3s ease, box-shadow 0.3s ease';
    element.style.outline = '2px solid #10b981'; // Emerald green
    element.style.backgroundColor = 'rgba(16, 185, 129, 0.12)';
    element.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.2)';

    setTimeout(() => {
      element.style.outline = originalOutline;
      element.style.backgroundColor = originalBg;
      element.style.boxShadow = originalShadow;
      element.style.transition = originalTransition;
    }, 3000);
  }

  /**
   * Helper: check if element currently has a non-empty user answer on the page
   */
  function elementHasAnswer(item) {
    const { type, fieldId, options } = item;

    if (['text', 'email', 'number', 'tel', 'date', 'textarea'].includes(type)) {
      const el = document.querySelector(`[data-survey-assistant-id="${fieldId}"]`);
      return el && el.value && el.value.trim().length > 0;
    }

    if (type === 'select') {
      const sel = document.querySelector(`[data-survey-assistant-id="${fieldId}"]`);
      if (!sel || sel.selectedIndex < 0) return false;
      const opt = sel.options[sel.selectedIndex];
      return opt && opt.value !== '' && !cleanText(opt.text).toLowerCase().includes('select');
    }

    if (type === 'radio' && options) {
      return options.some(opt => {
        const r = document.querySelector(`[data-survey-assistant-id="${opt.id}"]`);
        return r && r.checked;
      });
    }

    if (type === 'checkbox_group' && options) {
      return options.some(opt => {
        const cb = document.querySelector(`[data-survey-assistant-id="${opt.id}"]`);
        return cb && cb.checked;
      });
    }

    if (type === 'checkbox') {
      const cb = document.querySelector(`[data-survey-assistant-id="${fieldId}"]`);
      return cb && cb.checked;
    }

    return false;
  }

  /**
   * Safely fills approved answers into matching DOM fields.
   * 
   * Safety Guarantees:
   * - Never auto-submits form.
   * - Does NOT overwrite existing answers without explicit user approval.
   * - Returns clear counts of filled, skipped, and failed fields.
   */
  function fillSurveyFields(approvedAnswers, overwriteExisting = false) {
    const filledList = [];
    const skippedList = [];
    const failedList = [];

    approvedAnswers.forEach(item => {
      const { type, suggestedAnswer, options, fieldId, overwriteApproved } = item;

      // 1. Skip if empty or needs user input
      if (!suggestedAnswer || suggestedAnswer.trim() === '' || suggestedAnswer === 'NEEDS USER INPUT') {
        skippedList.push({
          question: item.question,
          reason: 'Answer is missing or marked as NEEDS USER INPUT'
        });
        return;
      }

      const answerClean = suggestedAnswer.trim();

      // 2. Overwrite Protection: do not overwrite existing answers without user approval
      const canOverwrite = overwriteExisting || !!overwriteApproved;
      if (!canOverwrite && elementHasAnswer(item)) {
        skippedList.push({
          question: item.question,
          reason: 'Field already contains an answer (overwrite not approved)'
        });
        return;
      }

      // Case 1: Standard input (text, email, number, tel, date, textarea)
      if (['text', 'email', 'number', 'tel', 'date', 'textarea'].includes(type)) {
        const el = document.querySelector(`[data-survey-assistant-id="${fieldId}"]`);
        if (!el) {
          failedList.push({ question: item.question, reason: 'Element no longer found in DOM' });
          return;
        }

        try {
          el.focus();
          // Support React / Vue property setters
          const prototype = el.tagName.toLowerCase() === 'textarea'
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype;
          const nativeSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
          if (nativeSetter) {
            nativeSetter.call(el, answerClean);
          } else {
            el.value = answerClean;
          }
          dispatchInputEvents(el);
          highlightFilled(el);
          filledList.push({ question: item.question, value: answerClean });
        } catch (err) {
          failedList.push({ question: item.question, reason: 'Failed to set value: ' + err.message });
        }
        return;
      }

      // Case 2: Select dropdown
      if (type === 'select') {
        const sel = document.querySelector(`[data-survey-assistant-id="${fieldId}"]`);
        if (!sel) {
          failedList.push({ question: item.question, reason: 'Select dropdown element not found in DOM' });
          return;
        }

        const matchLower = answerClean.toLowerCase();
        let matchedOption = null;

        // Pass 1: Exact match on text or value
        for (let i = 0; i < sel.options.length; i++) {
          const opt = sel.options[i];
          const optText = cleanText(opt.text).toLowerCase();
          const optVal = cleanText(opt.value).toLowerCase();
          if (optText === matchLower || optVal === matchLower) {
            matchedOption = opt;
            break;
          }
        }

        // Pass 2: Prefix match
        if (!matchedOption) {
          for (let i = 0; i < sel.options.length; i++) {
            const opt = sel.options[i];
            const optText = cleanText(opt.text).toLowerCase();
            const optVal = cleanText(opt.value).toLowerCase();
            if (optText.startsWith(matchLower) || optVal.startsWith(matchLower)) {
              matchedOption = opt;
              break;
            }
          }
        }

        // Pass 3: Substring match
        if (!matchedOption) {
          for (let i = 0; i < sel.options.length; i++) {
            const opt = sel.options[i];
            const optText = cleanText(opt.text).toLowerCase();
            const optVal = cleanText(opt.value).toLowerCase();
            if (optText.includes(matchLower) || (optVal && matchLower.includes(optVal))) {
              matchedOption = opt;
              break;
            }
          }
        }

        if (matchedOption) {
          sel.focus();
          matchedOption.selected = true;
          sel.value = matchedOption.value;
          sel.selectedIndex = Array.from(sel.options).indexOf(matchedOption);
          dispatchInputEvents(sel);
          highlightFilled(sel);
          filledList.push({ question: item.question, value: cleanText(matchedOption.text) });
        } else {
          failedList.push({ question: item.question, reason: `No matching dropdown option for "${answerClean}"` });
        }
        return;
      }

      // Case 3: Radio button group
      if (type === 'radio') {
        let matchedRadio = null;
        let matchedLabel = '';
        const matchLower = answerClean.toLowerCase();

        if (options && options.length > 0) {
          // Pass 1: Exact match
          for (const opt of options) {
            const optLabel = cleanText(opt.label).toLowerCase();
            const optVal = cleanText(opt.value).toLowerCase();
            if (optLabel === matchLower || optVal === matchLower) {
              matchedRadio = document.querySelector(`[data-survey-assistant-id="${opt.id}"]`);
              matchedLabel = opt.label;
              break;
            }
          }

          // Pass 2: Inclusion match
          if (!matchedRadio) {
            for (const opt of options) {
              const optLabel = cleanText(opt.label).toLowerCase();
              const optVal = cleanText(opt.value).toLowerCase();
              if (optLabel.includes(matchLower) || matchLower.includes(optLabel) ||
                  (optVal && (optVal.includes(matchLower) || matchLower.includes(optVal)))) {
                matchedRadio = document.querySelector(`[data-survey-assistant-id="${opt.id}"]`);
                matchedLabel = opt.label;
                break;
              }
            }
          }
        }

        if (matchedRadio) {
          matchedRadio.focus();
          if (!matchedRadio.checked) {
            matchedRadio.click();
          }
          matchedRadio.checked = true;
          matchedRadio.dispatchEvent(new Event('change', { bubbles: true }));
          matchedRadio.dispatchEvent(new Event('input', { bubbles: true }));
          highlightFilled(matchedRadio);
          if (matchedRadio.closest('label')) {
            highlightFilled(matchedRadio.closest('label'));
          }
          filledList.push({ question: item.question, value: matchedLabel });
        } else {
          failedList.push({ question: item.question, reason: `No matching radio option for "${answerClean}"` });
        }
        return;
      }

      // Case 4: Checkbox group (can match multiple values)
      if (type === 'checkbox_group') {
        const answers = answerClean.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        const matchedLabels = [];

        if (options && options.length > 0) {
          options.forEach(opt => {
            const optLabel = cleanText(opt.label).toLowerCase();
            const optVal = cleanText(opt.value).toLowerCase();

            const shouldCheck = answers.some(ans =>
              ans === optLabel || ans === optVal ||
              optLabel.includes(ans) || (optVal && ans.includes(optVal)) ||
              ans.includes(optLabel)
            );

            const cbEl = document.querySelector(`[data-survey-assistant-id="${opt.id}"]`);
            if (cbEl && shouldCheck) {
              cbEl.focus();
              if (!cbEl.checked) {
                cbEl.click();
              }
              cbEl.checked = true;
              cbEl.dispatchEvent(new Event('change', { bubbles: true }));
              cbEl.dispatchEvent(new Event('input', { bubbles: true }));
              highlightFilled(cbEl);
              if (cbEl.closest('label')) {
                highlightFilled(cbEl.closest('label'));
              }
              matchedLabels.push(opt.label);
            }
          });
        }

        if (matchedLabels.length > 0) {
          filledList.push({ question: item.question, value: matchedLabels.join(', ') });
        } else {
          failedList.push({ question: item.question, reason: `No matching checkboxes found for "${answerClean}"` });
        }
        return;
      }

      // Case 5: Standalone checkbox (e.g. Yes/No, Agree)
      if (type === 'checkbox') {
        const cbEl = document.querySelector(`[data-survey-assistant-id="${fieldId}"]`);
        if (!cbEl) {
          failedList.push({ question: item.question, reason: 'Checkbox element not found in DOM' });
          return;
        }

        const isTruthy = ['yes', 'true', 'agree', 'checked', '1'].includes(answerClean.toLowerCase());
        cbEl.focus();
        if (cbEl.checked !== isTruthy) {
          cbEl.click();
        }
        cbEl.checked = isTruthy;
        cbEl.dispatchEvent(new Event('change', { bubbles: true }));
        cbEl.dispatchEvent(new Event('input', { bubbles: true }));
        highlightFilled(cbEl);
        if (cbEl.closest('label')) {
          highlightFilled(cbEl.closest('label'));
        }
        filledList.push({ question: item.question, value: isTruthy ? 'Checked' : 'Unchecked' });
        return;
      }
    });

    return {
      filledCount: filledList.length,
      skippedCount: skippedList.length,
      failedCount: failedList.length,
      filled: filledList,
      skipped: skippedList,
      failed: failedList
    };
  }
})();
