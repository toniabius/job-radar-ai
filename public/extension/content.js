// Job Radar Universal AutoFill & AI Extension Content Script
(function () {
  console.log('⚡ Job Radar Universal AutoFill Active');

  let activeProfile = null;
  let isMinimized = false;
  let isClosedByUser = false;
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  let isContextInvalidated = false;

  // Safe wrapper for chrome.runtime.sendMessage to handle extension updates/context invalidation
  function safeSendMessage(message) {
    return new Promise((resolve) => {
      if (isContextInvalidated) {
        resolve({ success: false, error: 'Context invalidated' });
        return;
      }

      try {
        if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id || !chrome.runtime.sendMessage) {
          isContextInvalidated = true;
          resolve({ success: false, error: 'Extension runtime unavailable' });
          return;
        }

        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            const err = chrome.runtime.lastError.message || '';
            if (err.includes('invalidated') || err.includes('context')) {
              isContextInvalidated = true;
            }
            resolve({ success: false, error: err });
            return;
          }
          resolve(response || { success: false });
        });
      } catch (err) {
        const errMsg = err?.message || '';
        if (errMsg.includes('invalidated') || errMsg.includes('context')) {
          isContextInvalidated = true;
        }
        resolve({ success: false, error: errMsg });
      }
    });
  }

  // Direct fetch fallback if extension messaging fails or context is invalidated
  async function fetchDirectProfile() {
    try {
      const res = await fetch('http://localhost:3000/api/candidate-profile');
      if (res.ok) {
        const data = await res.json();
        if (data && (data.firstName || data.email)) {
          activeProfile = data;
          console.log('✅ Job Radar loaded candidate profile directly from server:', activeProfile.firstName, activeProfile.lastName);
          return activeProfile;
        }
      }
    } catch (e) {
      // ignore server fetch errors
    }
    return activeProfile;
  }

  // Request candidate profile from background service worker or direct server fallback
  async function fetchCandidateProfile() {
    const response = await safeSendMessage({ action: 'GET_PROFILE' });
    if (response && response.success && response.profile) {
      activeProfile = response.profile;
      console.log('✅ Job Radar loaded candidate profile via extension:', activeProfile.firstName, activeProfile.lastName);
      return activeProfile;
    }
    return await fetchDirectProfile();
  }

  // Inject floating control panel
  function checkAndInjectControlPanel() {
    if (isClosedByUser) return;
    if (!document.getElementById('jr-autofill-panel')) {
      injectControlPanel();
    }
    updateDetectionState();
  }

  function updateDetectionState() {
    // Detect application modals or form containers across sites
    const formContainer = document.querySelector(
      '.jobs-easy-apply-modal, .jobs-easy-apply-content, div[role="dialog"], .jobs-apply-form, [data-test-modal], form, .application-form, #application-form, .job-application'
    );
    const badgeEl = document.getElementById('jr-detection-badge');
    const hintEl = document.getElementById('jr-modal-hint');

    if (badgeEl) {
      if (formContainer) {
        badgeEl.className = 'jr-badge jr-badge-active';
        badgeEl.innerText = '🟢 Form Detected';
        if (hintEl) hintEl.innerText = 'Click AutoFill to populate all inputs, radios, & dropdowns.';
      } else {
        badgeEl.className = 'jr-badge jr-badge-waiting';
        badgeEl.innerText = '🔵 Active';
        if (hintEl) hintEl.innerText = 'Ready on this page. Open any job application to auto-fill.';
      }
    }
  }

  function injectControlPanel() {
    if (document.getElementById('jr-autofill-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'jr-autofill-panel';
    panel.innerHTML = `
      <div class="jr-header" id="jr-panel-header">
        <div class="jr-title">
          <span>⚡ Apply Assistant</span>
        </div>
        <div class="jr-header-actions">
          <span id="jr-detection-badge" class="jr-badge jr-badge-waiting">🔵 Active</span>
          <button id="jr-btn-toggle-min" class="jr-icon-btn" title="Minimize / Expand Panel">_</button>
          <button id="jr-btn-close" class="jr-icon-btn" title="Close Extension Panel">✕</button>
        </div>
      </div>
      <div id="jr-panel-body" class="jr-body">
        <p id="jr-modal-hint" style="margin-bottom: 8px; font-size: 11px; color: #cbd5e1;">
          Ready on this page. Open any job application to auto-fill.
        </p>
        <div id="jr-override-wrapper" style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px; font-size: 11px; color: #e2e8f0; background: rgba(255,255,255,0.06); padding: 6px 10px; border-radius: 6px;">
          <input type="checkbox" id="jr-cb-override" style="all: unset !important; width: 14px !important; height: 14px !important; min-width: 14px !important; min-height: 14px !important; max-width: 14px !important; max-height: 14px !important; margin: 0 !important; padding: 0 !important; display: inline-block !important; flex-shrink: 0 !important; cursor: pointer !important; accent-color: #10b981 !important; appearance: checkbox !important; -webkit-appearance: checkbox !important;" />
          <label for="jr-cb-override" style="all: unset !important; cursor: pointer !important; user-select: none !important; font-size: 11px !important; color: #e2e8f0 !important; font-family: system-ui, sans-serif !important;">Override existing form values</label>
        </div>
        <button id="jr-btn-autofill" class="jr-btn">
          <span>⚡ AutoFill</span>
        </button>
        <button id="jr-btn-ai-answer" class="jr-btn-secondary">
          <span>✨ Answer Open Questions with AI</span>
        </button>
        <div id="jr-status-text" class="jr-status">Ready</div>
      </div>
    `;

    document.body.appendChild(panel);

    const closeBtn = document.getElementById('jr-btn-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        isClosedByUser = true;
        const p = document.getElementById('jr-autofill-panel');
        if (p) {
          p.style.display = 'none';
          p.remove();
        }
      });
      closeBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    }

    const minBtn = document.getElementById('jr-btn-toggle-min');
    if (minBtn) {
      minBtn.addEventListener('mousedown', (e) => e.stopPropagation());
      minBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMinimizePanel();
      });
    }

    document.getElementById('jr-btn-autofill').addEventListener('click', handleAutoFillCurrentPage);
    document.getElementById('jr-btn-ai-answer').addEventListener('click', handleAnswerOpenQuestions);

    // Make panel draggable
    setupDraggable(panel);

    // Initial fetch profile
    fetchCandidateProfile();
  }

  function setupDraggable(panel) {
    const header = document.getElementById('jr-panel-header');
    if (!header) return;

    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      isDragging = true;
      dragOffsetX = e.clientX - panel.offsetLeft;
      dragOffsetY = e.clientY - panel.offsetTop;
      header.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      panel.style.left = `${e.clientX - dragOffsetX}px`;
      panel.style.top = `${e.clientY - dragOffsetY}px`;
      panel.style.bottom = 'auto';
      panel.style.right = 'auto';
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        if (header) header.style.cursor = 'grab';
      }
    });
  }

  function toggleMinimizePanel() {
    const panel = document.getElementById('jr-autofill-panel');
    const toggleBtn = document.getElementById('jr-btn-toggle-min');

    if (!panel) return;

    isMinimized = !isMinimized;
    if (isMinimized) {
      panel.classList.add('jr-minimized');
      if (toggleBtn) {
        toggleBtn.innerText = '+';
        toggleBtn.title = 'Expand Apply Assistant';
      }
    } else {
      panel.classList.remove('jr-minimized');
      if (toggleBtn) {
        toggleBtn.innerText = '_';
        toggleBtn.title = 'Minimize Panel';
      }
    }
  }

  // AutoFill current page fields, dropdowns, and radios
  async function handleAutoFillCurrentPage() {
    const statusEl = document.getElementById('jr-status-text');
    if (statusEl) statusEl.innerText = 'Refreshing profile data...';

    await fetchCandidateProfile();

    if (!activeProfile) {
      if (statusEl) statusEl.innerText = '❌ Error: App not running on localhost:3000';
      alert('Job Radar server is not running or candidate profile is empty. Open http://localhost:3000');
      return;
    }

    if (statusEl) statusEl.innerText = 'Scanning inputs & radio questions...';

    const shouldOverride = document.getElementById('jr-cb-override')?.checked || false;

    const container = document.querySelector(
      '.jobs-easy-apply-modal, .jobs-easy-apply-content, div[role="dialog"], .jobs-apply-form, [data-test-modal], form, .application-form'
    ) || document.body;

    let filledCount = 0;

    const workExps = activeProfile.workExperience || [];
    let titleCount = 0;
    let companyCount = 0;
    let locationCount = 0;
    let startDateCount = 0;
    let endDateCount = 0;
    let descCount = 0;

    // Detect work experience section containers on page if present
    const expContainers = Array.from(container.querySelectorAll(
      '[data-automation-id*="workExperience"], [data-automation-id*="experience"], fieldset, .experience-entry, .work-experience-entry, .work-history-item, .jobs-easy-apply-form-section__group, .form-section'
    )).filter((c) => {
      const text = c.textContent.toLowerCase();
      return text.includes('title') || text.includes('company') || text.includes('employer') || text.includes('work') || text.includes('experience');
    });

    // 1. Fill Text Inputs & Textareas & Selects
    const textInputs = container.querySelectorAll(
      'input[type="text"], input[type="email"], input[type="tel"], input[type="number"], input[type="url"], textarea, select'
    );

    textInputs.forEach((input) => {
      if (input.type === 'hidden' || input.type === 'radio' || input.type === 'checkbox') return;

      // Check override setting: skip if element already has a value and override is disabled
      if (!shouldOverride) {
        if (input.tagName === 'SELECT') {
          if (input.selectedIndex > 0 && input.options[input.selectedIndex]?.value) {
            return;
          }
        } else {
          if (input.value && input.value.trim() !== '') {
            return;
          }
        }
      }

      const labelText = getLabelForInput(input).toLowerCase();
      const inputName = (input.name || input.id || '').toLowerCase();
      const combinedKey = `${labelText} ${inputName}`;

      let valueToSet = null;

      // Direct Profile Field Matchers
      if (combinedKey.includes('full name') || combinedKey.includes('complete name') || combinedKey.includes('your name')) {
        valueToSet = activeProfile.fullName || `${activeProfile.firstName} ${activeProfile.lastName}`.trim();
      } else if (combinedKey.includes('preferred name') || combinedKey.includes('nickname') || combinedKey.includes('go by')) {
        valueToSet = activeProfile.preferredName || activeProfile.firstName;
      } else if (combinedKey.includes('first name') || combinedKey.includes('given name') || combinedKey.includes('fname')) {
        valueToSet = activeProfile.firstName;
      } else if (combinedKey.includes('last name') || combinedKey.includes('family name') || combinedKey.includes('surname') || combinedKey.includes('lname')) {
        valueToSet = activeProfile.lastName;
      } else if (combinedKey.includes('email')) {
        valueToSet = activeProfile.email;
      } else if (combinedKey.includes('phone device') || combinedKey.includes('phone type') || combinedKey.includes('device type')) {
        valueToSet = activeProfile.phoneDeviceType || 'Mobile';
      } else if (combinedKey.includes('phone') || combinedKey.includes('mobile') || combinedKey.includes('contact number') || combinedKey.includes('cell')) {
        valueToSet = activeProfile.phone;
      } else if (combinedKey.includes('how did you hear') || combinedKey.includes('hear about us') || combinedKey.includes('referral source') || combinedKey.includes('how did you find')) {
        valueToSet = activeProfile.howDidYouHear || 'LinkedIn';
      } else if (combinedKey.includes('city')) {
        valueToSet = activeProfile.city;
      } else if (combinedKey.includes('postal') || combinedKey.includes('zip') || combinedKey.includes('postcode')) {
        valueToSet = activeProfile.zipCode;
      } else if (combinedKey.includes('state') || combinedKey.includes('province') || combinedKey.includes('region')) {
        valueToSet = activeProfile.state;
      } else if (combinedKey.includes('country')) {
        valueToSet = activeProfile.country;
      } else if (combinedKey.includes('linkedin')) {
        valueToSet = activeProfile.linkedInUrl;
      } else if (combinedKey.includes('github')) {
        valueToSet = activeProfile.githubUrl;
      } else if (combinedKey.includes('portfolio') || combinedKey.includes('website') || combinedKey.includes('personal site')) {
        valueToSet = activeProfile.portfolioUrl;
      } else if (combinedKey.includes('desired salary') || combinedKey.includes('compensation') || combinedKey.includes('expected salary') || combinedKey.includes('pay rate')) {
        valueToSet = activeProfile.desiredSalary;
      } else if (combinedKey.includes('years of experience') || combinedKey.includes('years experience') || combinedKey.includes('how many years')) {
        valueToSet = activeProfile.yearsExperience;
      } else if (combinedKey.includes('notice period') || combinedKey.includes('how soon can you start')) {
        valueToSet = activeProfile.noticePeriod;
      } else if (
        combinedKey.includes('sponsorship') ||
        combinedKey.includes('require sponsorship') ||
        combinedKey.includes('immigration-related') ||
        combinedKey.includes('visa sponsorship') ||
        combinedKey.includes('require visa')
      ) {
        valueToSet = activeProfile.sponsorshipRequired || 'No';
      } else if (
        combinedKey.includes('legally authorized') ||
        combinedKey.includes('authorized to work') ||
        combinedKey.includes('legally eligible') ||
        combinedKey.includes('eligible to work') ||
        combinedKey.includes('eligibility') ||
        combinedKey.includes('right to work') ||
        combinedKey.includes('country/region') ||
        combinedKey.includes('lawful permanent resident') ||
        combinedKey.includes('employment eligibility')
      ) {
        valueToSet = activeProfile.legallyAuthorized || 'Yes';
      } else if (combinedKey.includes('work authorization') || combinedKey.includes('visa status') || combinedKey.includes('work permit') || combinedKey.includes('work status')) {
        valueToSet = activeProfile.workAuthorization || 'Authorized to work';
      } else if (combinedKey.includes('veteran status') || combinedKey.includes('veteran')) {
        valueToSet = activeProfile.veteranStatus || 'I am not a protected veteran';
      } else if (combinedKey.includes('gender') || combinedKey.includes('sex')) {
        valueToSet = activeProfile.gender || 'Decline to Self-Identify';
      } else if (combinedKey.includes('ethnicity') || combinedKey.includes('race') || combinedKey.includes('hispanic')) {
        valueToSet = activeProfile.ethnicity || 'Decline to Self-Identify';
      } else if (combinedKey.includes('disability status') || combinedKey.includes('disability') || combinedKey.includes('handicap')) {
        valueToSet = activeProfile.disabilityStatus || 'No, I do not have a disability';
      }

      // Work Experience Field Matchers (Supports Multiple Work Experiences)
      if (!valueToSet && workExps.length > 0) {
        const isMostRecentOrCurrent = combinedKey.includes('most recent') || combinedKey.includes('current employer') || combinedKey.includes('current title') || combinedKey.includes('present company');

        // Job Title
        if (combinedKey.includes('job title') || combinedKey.includes('most recent title') || (combinedKey.includes('title') && (combinedKey.includes('job') || combinedKey.includes('work') || combinedKey.includes('role')))) {
          let idx = 0;
          if (!isMostRecentOrCurrent) {
            const containerIdx = expContainers.findIndex((c) => c.contains(input));
            idx = containerIdx !== -1 ? containerIdx : titleCount;
            titleCount++;
          }
          const exp = workExps[idx];
          if (exp) valueToSet = exp.title;
        }
        // Company / Employer
        else if (combinedKey.includes('company') || combinedKey.includes('employer') || combinedKey.includes('organization')) {
          let idx = 0;
          if (!isMostRecentOrCurrent) {
            const containerIdx = expContainers.findIndex((c) => c.contains(input));
            idx = containerIdx !== -1 ? containerIdx : companyCount;
            companyCount++;
          }
          const exp = workExps[idx];
          if (exp) valueToSet = exp.company;
        }
        // Location
        else if (combinedKey.includes('location') && (combinedKey.includes('work') || combinedKey.includes('job') || combinedKey.includes('company') || combinedKey.includes('employer'))) {
          let idx = 0;
          if (!isMostRecentOrCurrent) {
            const containerIdx = expContainers.findIndex((c) => c.contains(input));
            idx = containerIdx !== -1 ? containerIdx : locationCount;
            locationCount++;
          }
          const exp = workExps[idx];
          if (exp) valueToSet = exp.location || activeProfile.city;
        }
        // Start Date / Month
        else if (combinedKey.includes('start date') || combinedKey.includes('start month') || combinedKey.includes('from month') || combinedKey.includes('from date') || (combinedKey.includes('from') && (combinedKey.includes('work') || combinedKey.includes('job') || combinedKey.includes('date')))) {
          let idx = 0;
          if (!isMostRecentOrCurrent) {
            const containerIdx = expContainers.findIndex((c) => c.contains(input));
            idx = containerIdx !== -1 ? containerIdx : startDateCount;
            startDateCount++;
          }
          const exp = workExps[idx];
          if (exp) valueToSet = exp.startMonth && exp.startYear ? `${exp.startMonth}/${exp.startYear}` : exp.startYear || '2024';
        }
        // End Date / Month
        else if (combinedKey.includes('end date') || combinedKey.includes('end month') || combinedKey.includes('to month') || combinedKey.includes('to date') || (combinedKey.includes('to') && (combinedKey.includes('work') || combinedKey.includes('job') || combinedKey.includes('date')))) {
          let idx = 0;
          if (!isMostRecentOrCurrent) {
            const containerIdx = expContainers.findIndex((c) => c.contains(input));
            idx = containerIdx !== -1 ? containerIdx : endDateCount;
            endDateCount++;
          }
          const exp = workExps[idx];
          if (exp) valueToSet = exp.currentlyWorkHere ? 'Present' : (exp.endMonth && exp.endYear ? `${exp.endMonth}/${exp.endYear}` : exp.endYear || 'Present');
        }
        // Description / Responsibilities
        else if ((combinedKey.includes('role description') || combinedKey.includes('responsibilities') || combinedKey.includes('job description') || combinedKey.includes('duties') || combinedKey.includes('summary')) && input.tagName === 'TEXTAREA') {
          let idx = 0;
          if (!isMostRecentOrCurrent) {
            const containerIdx = expContainers.findIndex((c) => c.contains(input));
            idx = containerIdx !== -1 ? containerIdx : descCount;
            descCount++;
          }
          const exp = workExps[idx];
          if (exp) valueToSet = exp.description;
        }
      }

      // Check Dynamic Custom Personal Contact Fields
      if (!valueToSet && activeProfile.customFields && activeProfile.customFields.length > 0) {
        for (const cf of activeProfile.customFields) {
          const cfLabel = (cf.label || '').toLowerCase().trim();
          if (cfLabel && (combinedKey.includes(cfLabel) || labelText.includes(cfLabel))) {
            valueToSet = cf.value;
            break;
          }
        }
      }

      // Check QA Knowledge Base
      if (!valueToSet && activeProfile.knowledgeBase && activeProfile.knowledgeBase.length > 0) {
        for (const kb of activeProfile.knowledgeBase) {
          const pattern = (kb.questionPattern || '').toLowerCase();
          if (pattern && labelText.includes(pattern)) {
            valueToSet = kb.answer;
            break;
          }
        }
      }

      if (valueToSet !== null && valueToSet !== undefined) {
        if (input.tagName === 'SELECT') {
          if (fillSelectOption(input, String(valueToSet))) filledCount++;
        } else {
          setNativeInputValue(input, String(valueToSet));
          input.classList.add('jr-autofilled-field');
          filledCount++;
        }
      }
    });

    // 2. Fill Radio Groups & Fieldsets (Sponsorship, Authorization, EEO, Custom Questions)
    const radioContainers = container.querySelectorAll(
      'fieldset, div.fb-dash-form-element, div.jobs-easy-apply-form-section__group, div[role="radiogroup"], div.form-group, div.form-entry, div.question-container, div.application-question, div.form-field, div[data-automation-id*="question"], div[data-automation-id*="formField"], div.section-field, .artdeco-form__item, .jobs-easy-apply-form-element'
    );

    radioContainers.forEach((group) => {
      // If override is disabled, check if group already has a checked option
      if (!shouldOverride) {
        const existingChecked = group.querySelector('input[type="radio"]:checked, input[type="checkbox"]:checked, [role="radio"][aria-checked="true"]');
        if (existingChecked) return;
      }

      const questionText = getQuestionTextForGroup(group).toLowerCase();
      if (!questionText) return;

      let targetChoice = null;

      // Sponsorship Question (Checked FIRST to avoid "employment eligibility" overlap)
      if (
        questionText.includes('sponsorship') ||
        questionText.includes('require sponsorship') ||
        questionText.includes('immigration-related') ||
        questionText.includes('sponsorship for employment') ||
        questionText.includes('require visa')
      ) {
        targetChoice = activeProfile.sponsorshipRequired || 'No';
      }
      // Legal Work Authorization Question
      else if (
        questionText.includes('legally authorized') ||
        questionText.includes('authorized to work') ||
        questionText.includes('country/region you are applying') ||
        questionText.includes('right to work') ||
        questionText.includes('lawful permanent resident') ||
        questionText.includes('legally eligible')
      ) {
        targetChoice = activeProfile.legallyAuthorized || 'Yes';
      }
      // Gender Question
      else if (questionText.includes('gender') || questionText.includes('sex identity')) {
        targetChoice = activeProfile.gender || 'Decline to self-identify';
      }
      // Race / Ethnicity Question
      else if (
        questionText.includes('ethnicity') ||
        questionText.includes('race') ||
        questionText.includes('ethnic background') ||
        questionText.includes('hispanic or latino')
      ) {
        targetChoice = activeProfile.ethnicity || 'Decline to self-identify';
      }
      // Veteran Status Question
      else if (questionText.includes('veteran') || questionText.includes('military status')) {
        targetChoice = activeProfile.veteranStatus || 'I am not a protected veteran';
      }
      // Disability Status Question
      else if (questionText.includes('disability') || questionText.includes('handicap')) {
        targetChoice = activeProfile.disabilityStatus || 'No, I don\'t have a disability';
      }
      // Relocation Question
      else if (questionText.includes('relocation') || questionText.includes('relocate') || questionText.includes('willing to move')) {
        targetChoice = activeProfile.relocation || 'Yes';
      }
      // Standard Affirmative Questions (Background Check, Drug Test, Age 18+)
      else if (
        questionText.includes('18 years of age') ||
        questionText.includes('background check') ||
        questionText.includes('drug test') ||
        questionText.includes('truthful') ||
        questionText.includes('certify')
      ) {
        targetChoice = 'Yes';
      }
      // Standard Negative Questions (Felony conviction, fired)
      else if (questionText.includes('felony') || questionText.includes('convicted of a crime')) {
        targetChoice = 'No';
      }

      // Check QA Knowledge Base if no standard field matched
      if (!targetChoice && activeProfile.knowledgeBase) {
        for (const kb of activeProfile.knowledgeBase) {
          const pattern = (kb.questionPattern || '').toLowerCase();
          if (pattern && questionText.includes(pattern)) {
            targetChoice = kb.answer;
            break;
          }
        }
      }

      if (targetChoice) {
        if (selectRadioInGroup(group, targetChoice)) {
          filledCount++;
        }
      }
    });

    if (statusEl) {
      if (filledCount > 0) {
        statusEl.innerText = `✅ Auto-filled ${filledCount} fields & choices!`;
      } else {
        statusEl.innerText = `ℹ️ No matching unfilled fields found on page.`;
      }
    }
  }

  // Answer open text questions with AI
  async function handleAnswerOpenQuestions() {
    const statusEl = document.getElementById('jr-status-text');
    const container = document.querySelector(
      '.jobs-easy-apply-modal, .jobs-easy-apply-content, div[role="dialog"], .jobs-apply-form, [data-test-modal], form'
    ) || document.body;

    const textareas = container.querySelectorAll('textarea, input[type="text"]');

    let aiCount = 0;

    for (const el of Array.from(textareas)) {
      const labelText = getLabelForInput(el);
      if (labelText && labelText.length > 10 && !el.value.trim()) {
        if (statusEl) statusEl.innerText = `Generating AI response for "${labelText.slice(0, 25)}..."`;

        let response = await safeSendMessage({
          action: 'GENERATE_AI_ANSWER',
          question: labelText,
          jobContext: document.title || 'Job Application Question'
        });

        if (!response || !response.success || !response.answer) {
          try {
            const directRes = await fetch('http://localhost:3000/api/candidate-profile/generate-answer', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                question: labelText,
                jobContext: document.title || 'Job Application Question'
              })
            });
            if (directRes.ok) {
              const data = await directRes.json();
              if (data && data.answer) {
                response = { success: true, answer: data.answer };
              }
            }
          } catch (e) {
            // ignore
          }
        }

        if (response && response.success && response.answer) {
          setNativeInputValue(el, response.answer);
          el.classList.add('jr-autofilled-field');
          aiCount++;
        }
      }
    }

    if (statusEl) {
      if (aiCount > 0) {
        statusEl.innerText = `✨ Generated ${aiCount} AI responses. Please review!`;
      } else {
        statusEl.innerText = `ℹ️ No unanswered long-form questions found.`;
      }
    }
  }

  // Set input value & trigger native framework events (React, Vue, Angular)
  function setNativeInputValue(element, value) {
    const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
    const prototype = Object.getPrototypeOf(element);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

    if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
      prototypeValueSetter.call(element, value);
    } else if (valueSetter) {
      valueSetter.call(element, value);
    } else {
      element.value = value;
    }

    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  // Fill HTML <select> options
  function fillSelectOption(selectEl, targetValue) {
    const targetLower = targetValue.toLowerCase().trim();
    let bestIndex = -1;

    for (let i = 0; i < selectEl.options.length; i++) {
      const optText = (selectEl.options[i].text || '').toLowerCase().trim();
      const optVal = (selectEl.options[i].value || '').toLowerCase().trim();

      if (optText === targetLower || optVal === targetLower) {
        bestIndex = i;
        break;
      }
      if (targetLower === 'yes' && (optText.startsWith('yes') || optVal.startsWith('yes'))) {
        bestIndex = i;
        break;
      }
      if (targetLower === 'no' && (optText.startsWith('no') || optVal.startsWith('no'))) {
        bestIndex = i;
        break;
      }
      if (optText.includes(targetLower) || optVal.includes(targetLower)) {
        bestIndex = i;
      }
    }

    if (bestIndex !== -1) {
      selectEl.selectedIndex = bestIndex;
      selectEl.dispatchEvent(new Event('change', { bubbles: true }));
      selectEl.dispatchEvent(new Event('input', { bubbles: true }));
      selectEl.classList.add('jr-autofilled-field');
      return true;
    }
    return false;
  }

  // Find question text for radio/checkbox groups
  function getQuestionTextForGroup(container) {
    const legend = container.querySelector('legend, .fb-dash-form-element__label, .form-group-label, h3, h4, label, .question-text');
    if (legend) return legend.textContent.trim();
    return container.textContent.trim();
  }

  // Select radio button or custom option inside group
  function selectRadioInGroup(container, targetChoice) {
    const targetLower = targetChoice.toLowerCase().trim();
    const radioInputs = container.querySelectorAll('input[type="radio"], input[type="checkbox"], [role="radio"]');

    let clicked = false;

    const isYes = targetLower === 'yes' || targetLower.startsWith('yes') || targetLower === 'true' || targetLower.includes('authorized') || (targetLower.includes('will require') && !targetLower.includes('not'));
    const isNo = targetLower === 'no' || targetLower.startsWith('no') || targetLower === 'false' || targetLower.includes('will not require') || targetLower.includes('do not require');

    // First pass: try input labels
    radioInputs.forEach((input) => {
      let optionText = '';
      if (input.id) {
        const label = container.querySelector(`label[for="${input.id}"]`);
        if (label) optionText = label.textContent;
      }
      if (!optionText) {
        const parentLabel = input.closest('label');
        if (parentLabel) optionText = parentLabel.textContent;
      }
      if (!optionText) {
        optionText = input.value || input.getAttribute('aria-label') || '';
      }

      const optionLower = optionText.toLowerCase().trim();

      let isMatch = false;

      if (isYes) {
        if (
          optionLower === 'yes' ||
          optionLower.startsWith('yes') ||
          optionLower.includes('authorized') ||
          (optionLower.includes('will require') && !optionLower.includes('not'))
        ) {
          isMatch = true;
        }
      } else if (isNo) {
        if (
          optionLower === 'no' ||
          optionLower.startsWith('no') ||
          optionLower.includes('will not require') ||
          optionLower.includes('do not require') ||
          optionLower.includes('not require') ||
          optionLower.includes('no sponsorship')
        ) {
          isMatch = true;
        }
      }

      if (!isMatch) {
        if (optionLower === targetLower || (targetLower.length > 3 && optionLower.includes(targetLower)) || (optionLower.length > 3 && targetLower.includes(optionLower))) {
          isMatch = true;
        }
      }

      if (isMatch) {
        if (!input.checked) {
          input.click();
          input.checked = true;
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.dispatchEvent(new Event('click', { bubbles: true }));
        }
        clicked = true;
      }
    });

    // Fallback: search label elements directly
    if (!clicked) {
      const labels = container.querySelectorAll('label, button, [role="radio"], [role="option"], .radio-label, .form-check-label');
      labels.forEach((label) => {
        const textLower = label.textContent.toLowerCase().trim();
        let isMatch = false;

        if (isYes) {
          if (textLower === 'yes' || textLower.startsWith('yes') || textLower.includes('authorized')) {
            isMatch = true;
          }
        } else if (isNo) {
          if (textLower === 'no' || textLower.startsWith('no') || textLower.includes('will not require') || textLower.includes('do not require') || textLower.includes('not require')) {
            isMatch = true;
          }
        } else if (textLower === targetLower || (targetLower.length > 3 && textLower.includes(targetLower))) {
          isMatch = true;
        }

        if (isMatch) {
          label.click();
          clicked = true;
        }
      });
    }

    if (clicked) {
      container.classList.add('jr-autofilled-field');
    }

    return clicked;
  }

  // Find label text associated with input
  function getLabelForInput(input) {
    if (input.id) {
      const labelEl = document.querySelector(`label[for="${input.id}"]`);
      if (labelEl) return labelEl.textContent.trim();
    }
    const parentLabel = input.closest('label');
    if (parentLabel) return parentLabel.textContent.trim();

    const parentGroup = input.closest('.fb-dash-form-element, .jobs-easy-apply-form-element, .artdeco-text-input, .form-group, .input-group');
    if (parentGroup) {
      const label = parentGroup.querySelector('label, .fb-dash-form-element__label, .form-label');
      if (label) return label.textContent.trim();
    }

    return input.getAttribute('aria-label') || input.placeholder || '';
  }

  // Listen for messages from extension popup
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'REOPEN_PANEL' || request.action === 'SHOW_PANEL') {
          isClosedByUser = false;
          checkAndInjectControlPanel();
          if (sendResponse) sendResponse({ success: true });
        }
      });
    }
  } catch (e) {
    // Context invalidated
  }

  // Periodically check page state & inject panel
  setInterval(checkAndInjectControlPanel, 1200);

})();
