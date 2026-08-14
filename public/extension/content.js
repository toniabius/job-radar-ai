// Job Radar Universal AutoFill & AI Extension Content Script
(function () {
  console.log('⚡ Job Radar Universal AutoFill Active');

  let activeProfile = null;
  let isExtensionEnabled = true;
  let isMinimized = true;
  let isClosedByUser = false;
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  let isContextInvalidated = false;
  let lastFocusedElement = null;

  document.addEventListener('focusin', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) {
      lastFocusedElement = e.target;
    }
  }, true);

  document.addEventListener('click', (e) => {
    const inputEl = e.target.closest('input, textarea, [contenteditable="true"]');
    if (inputEl) {
      lastFocusedElement = inputEl;
    }
  }, true);

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

    if (!isExtensionEnabled) {
      const existing = document.getElementById('jr-autofill-panel');
      if (existing) existing.remove();
      return;
    }

    if (activeProfile && activeProfile.extensionEnabled === false) {
      const existing = document.getElementById('jr-autofill-panel');
      if (existing) existing.remove();
      return;
    }

    // Check storage for local override toggle
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['extensionEnabled'], (res) => {
        if (res.extensionEnabled === false) {
          isExtensionEnabled = false;
          const existing = document.getElementById('jr-autofill-panel');
          if (existing) existing.remove();
          return;
        }
        if (!document.getElementById('jr-autofill-panel')) {
          injectControlPanel();
        }
        updateDetectionState();
      });
    } else {
      if (!document.getElementById('jr-autofill-panel')) {
        injectControlPanel();
      }
      updateDetectionState();
    }
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
    if (isMinimized) {
      panel.classList.add('jr-minimized');
    }
    panel.innerHTML = `
      <div class="jr-header" id="jr-panel-header">
        <div class="jr-title">
          <span>⚡ Apply Assistant</span>
        </div>
        <div class="jr-header-actions">
          <span id="jr-detection-badge" class="jr-badge jr-badge-waiting">🔵 Active</span>
          <button id="jr-btn-toggle-min" class="jr-icon-btn" title="${isMinimized ? 'Expand Apply Assistant' : 'Minimize / Expand Panel'}">${isMinimized ? '+' : '_'}</button>
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
          <span>⚡ AutoFill Form</span>
        </button>
        <button id="jr-btn-ai-autofill-all" class="jr-btn-secondary" style="margin-top: 6px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4);">
          <span>🤖 AI AutoFill All Questions</span>
        </button>
        <button id="jr-btn-ai-answer" class="jr-btn-secondary" style="margin-top: 6px;">
          <span>✨ Answer Highlighted Question</span>
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
    const aiAllBtn = document.getElementById('jr-btn-ai-autofill-all');
    if (aiAllBtn) aiAllBtn.addEventListener('click', handleAIAutoFillForm);
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
      if (statusEl) statusEl.innerText = '❌ Error: Candidate profile unavailable';
      alert('Job Radar server is not running or candidate profile is empty. Open http://localhost:3000');
      return;
    }

    if (statusEl) statusEl.innerText = 'Scanning inputs & radio questions...';

    const shouldOverride = document.getElementById('jr-cb-override')?.checked || false;

    let filledCount = 0;
    let skippedFilledCount = 0;

    const workExps = activeProfile.workExperience || [];
    let titleCount = 0;
    let companyCount = 0;
    let locationCount = 0;
    let startDateCount = 0;
    let endDateCount = 0;
    let descCount = 0;

    // Detect work experience section containers on page if present
    const expContainers = Array.from(document.querySelectorAll(
      '[data-automation-id*="workExperience"], [data-automation-id*="experience"], fieldset, .experience-entry, .work-experience-entry, .work-history-item, .jobs-easy-apply-form-section__group, .form-section'
    )).filter((c) => {
      if (c.closest('#jr-autofill-panel')) return false;
      const text = c.textContent.toLowerCase();
      return text.includes('title') || text.includes('company') || text.includes('employer') || text.includes('work') || text.includes('experience');
    });

    // 1. Fill Text Inputs & Textareas & Selects across the page (excluding extension panel)
    const allInputEls = Array.from(document.querySelectorAll(
      'input, textarea, select, [contenteditable="true"]'
    )).filter((el) => {
      if (el.closest('#jr-autofill-panel')) return false;
      const tag = el.tagName.toLowerCase();
      const type = (el.getAttribute('type') || (tag === 'input' ? 'text' : '')).toLowerCase();
      return !['hidden', 'submit', 'button', 'image', 'file', 'reset', 'radio', 'checkbox'].includes(type);
    });

    allInputEls.forEach((input) => {
      try {
        // Check override setting: skip if element already has a value and override is disabled
        if (!shouldOverride) {
          if (input.tagName === 'SELECT') {
            const val = input.options[input.selectedIndex]?.value || '';
            const txt = (input.options[input.selectedIndex]?.text || '').toLowerCase().trim();
            if (input.selectedIndex > 0 && val && !txt.includes('select') && !txt.includes('choose') && txt !== '--') {
              skippedFilledCount++;
              return;
            }
          } else {
            const val = (input.value || input.textContent || '').trim();
            if (val !== '') {
              skippedFilledCount++;
              return;
            }
          }
        }

        const labelText = getLabelForInput(input).toLowerCase();
        const inputName = (input.getAttribute('name') || input.id || input.getAttribute('aria-label') || input.placeholder || '').toLowerCase();
        const combinedKey = `${labelText} ${inputName}`.trim();

        let valueToSet = null;

        // Direct Profile Field Matchers
        if (combinedKey.includes('full name') || combinedKey.includes('complete name') || combinedKey.includes('your name') || (combinedKey.includes('name') && !combinedKey.includes('first') && !combinedKey.includes('last') && !combinedKey.includes('company') && !combinedKey.includes('school') && !combinedKey.includes('file') && !combinedKey.includes('user') && !combinedKey.includes('preferred') && !combinedKey.includes('nick'))) {
          valueToSet = activeProfile.fullName || `${activeProfile.firstName} ${activeProfile.lastName}`.trim();
        } else if (combinedKey.includes('preferred name') || combinedKey.includes('nickname') || combinedKey.includes('go by') || combinedKey.includes('chosen name')) {
          valueToSet = activeProfile.preferredName || activeProfile.firstName;
        } else if (combinedKey.includes('first name') || combinedKey.includes('given name') || combinedKey.includes('fname') || combinedKey.includes('forename') || combinedKey.includes('first')) {
          valueToSet = activeProfile.firstName;
        } else if (combinedKey.includes('last name') || combinedKey.includes('family name') || combinedKey.includes('surname') || combinedKey.includes('lname') || combinedKey.includes('last')) {
          valueToSet = activeProfile.lastName;
        } else if (combinedKey.includes('email') || combinedKey.includes('e-mail')) {
          valueToSet = activeProfile.email;
        } else if (combinedKey.includes('phone device') || combinedKey.includes('phone type') || combinedKey.includes('device type')) {
          valueToSet = activeProfile.phoneDeviceType || 'Mobile';
        } else if (combinedKey.includes('phone') || combinedKey.includes('mobile') || combinedKey.includes('contact number') || combinedKey.includes('cell') || combinedKey.includes('telephone')) {
          valueToSet = activeProfile.phone;
        } else if (combinedKey.includes('how did you hear') || combinedKey.includes('hear about us') || combinedKey.includes('referral source') || combinedKey.includes('how did you find')) {
          valueToSet = activeProfile.howDidYouHear || 'LinkedIn';
        } else if (
          combinedKey.includes('currently located') ||
          combinedKey.includes('where are you located') ||
          combinedKey.includes('your location') ||
          combinedKey.includes('current location') ||
          combinedKey.includes('start typing') ||
          combinedKey.includes('street address') ||
          combinedKey.includes('address line 1') ||
          combinedKey.includes('street') ||
          (combinedKey.includes('address') && !combinedKey.includes('email'))
        ) {
          valueToSet = activeProfile.city ? `${activeProfile.city}, ${activeProfile.state || ''}`.replace(/,\s*$/, '') : activeProfile.streetAddress || activeProfile.city;
        } else if (combinedKey.includes('city') || combinedKey.includes('town')) {
          valueToSet = activeProfile.city;
        } else if (combinedKey.includes('postal') || combinedKey.includes('zip') || combinedKey.includes('postcode')) {
          valueToSet = activeProfile.zipCode;
        } else if (combinedKey.includes('state') || combinedKey.includes('province') || combinedKey.includes('region')) {
          valueToSet = activeProfile.state;
        } else if (combinedKey.includes('country') || combinedKey.includes('nation')) {
          valueToSet = activeProfile.country;
        } else if (combinedKey.includes('linkedin')) {
          valueToSet = activeProfile.linkedInUrl;
        } else if (combinedKey.includes('github')) {
          valueToSet = activeProfile.githubUrl;
        } else if (combinedKey.includes('portfolio') || combinedKey.includes('website') || combinedKey.includes('personal site') || combinedKey.includes('blog')) {
          valueToSet = activeProfile.portfolioUrl;
        } else if (combinedKey.includes('desired salary') || combinedKey.includes('compensation') || combinedKey.includes('expected salary') || combinedKey.includes('pay rate') || combinedKey.includes('desired pay') || combinedKey.includes('target salary')) {
          valueToSet = activeProfile.desiredSalary;
        } else if (combinedKey.includes('years of experience') || combinedKey.includes('years experience') || combinedKey.includes('how many years') || combinedKey.includes('total experience')) {
          valueToSet = activeProfile.yearsExperience;
        } else if (
          combinedKey.includes('notice period') ||
          combinedKey.includes('how soon can you start') ||
          combinedKey.includes('when can you start') ||
          combinedKey.includes('start a new role') ||
          combinedKey.includes('pick date') ||
          combinedKey.includes('availability') ||
          combinedKey.includes('start date')
        ) {
          valueToSet = activeProfile.noticePeriod || '2 weeks';
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
        } else if (combinedKey.includes('gender') || combinedKey.includes('sex identity') || (combinedKey.includes('sex') && !combinedKey.includes('section'))) {
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
          if (combinedKey.includes('job title') || combinedKey.includes('most recent title') || (combinedKey.includes('title') && (combinedKey.includes('job') || combinedKey.includes('work') || combinedKey.includes('role') || combinedKey.includes('position')))) {
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
          else if ((combinedKey.includes('role description') || combinedKey.includes('responsibilities') || combinedKey.includes('job description') || combinedKey.includes('duties') || combinedKey.includes('summary')) && (input.tagName === 'TEXTAREA' || input.isContentEditable)) {
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
            if (pattern && (labelText.includes(pattern) || combinedKey.includes(pattern))) {
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
      } catch (err) {
        console.warn('Error processing input during autofill:', err);
      }
    });

    // 2. Fill Radio Groups & Fieldsets (Sponsorship, Authorization, EEO, Custom Questions)
    const radioContainers = Array.from(document.querySelectorAll(
      'fieldset, div.fb-dash-form-element, div.jobs-easy-apply-form-section__group, div[role="radiogroup"], div.form-group, div.form-entry, div.question-container, div.application-question, div.form-field, div[data-automation-id*="question"], div[data-automation-id*="formField"], div.section-field, .artdeco-form__item, .jobs-easy-apply-form-element, div[data-test-form-element]'
    )).filter((c) => !c.closest('#jr-autofill-panel'));

    radioContainers.forEach((group) => {
      try {
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
        // Transgender / Gender Identity Question
        else if (questionText.includes('transgender') || questionText.includes('gender identity')) {
          targetChoice = activeProfile.transgenderStatus || 'Decline to self-identify';
        }
        // Sexual Orientation Question
        else if (questionText.includes('sexual orientation') || questionText.includes('sexual identity') || questionText.includes('lgbtq')) {
          targetChoice = activeProfile.sexualOrientation || 'Decline to self-identify';
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
      } catch (err) {
        console.warn('Error processing radio group during autofill:', err);
      }
    });

    if (statusEl) {
      if (filledCount > 0) {
        statusEl.innerText = `✅ Auto-filled ${filledCount} fields & choices!`;
      } else if (skippedFilledCount > 0) {
        statusEl.innerText = `ℹ️ ${skippedFilledCount} field(s) already filled. Check "Override existing form values" to replace.`;
      } else {
        statusEl.innerText = `ℹ️ No matching unfilled fields found on page.`;
      }
    }
  }

  // Answer open text question with AI for the single highlighted/focused cell
  async function handleAnswerOpenQuestions() {
    const statusEl = document.getElementById('jr-status-text');

    // Identify active / focused / highlighted element
    let el = document.activeElement;
    if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA' && !el.isContentEditable)) {
      el = lastFocusedElement;
    }

    if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA' && !el.isContentEditable)) {
      if (statusEl) {
        statusEl.innerText = `👉 Please click inside or highlight a question box first!`;
      }
      return;
    }

    const labelText = getLabelForInput(el) || el.getAttribute('aria-label') || el.placeholder || 'Job Application Question';

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
      if (statusEl) {
        statusEl.innerText = `✨ Generated AI answer for current field!`;
      }
    } else {
      if (statusEl) {
        statusEl.innerText = `⚠️ Could not generate answer. Please try again.`;
      }
    }
  }

  // Set input value & trigger native framework events (React, Vue, Angular)
  function setNativeInputValue(element, value) {
    if (!element) return;

    try {
      element.focus();
    } catch (e) {}

    // Reset React internal _valueTracker if present so React registers native change
    const tracker = element._valueTracker;
    if (tracker) {
      tracker.setValue(element.value || '');
    }

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

    // Fire full suite of native events for form validation frameworks
    element.dispatchEvent(new Event('focus', { bubbles: true }));
    element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'a' }));
    element.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true, cancelable: true, key: 'a' }));
    element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true, inputType: 'insertText' }));
    element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'a' }));
    element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));

    try {
      element.blur();
    } catch (e) {}
  }

  // Fill HTML <select> options & trigger completion events
  function fillSelectOption(selectEl, targetValue) {
    if (!selectEl) return false;
    const targetLower = targetValue.toLowerCase().trim();
    let bestIndex = -1;

    try {
      selectEl.focus();
    } catch (e) {}

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
      if (optText.includes(targetLower) || optVal.includes(targetLower) || (targetLower.length > 4 && targetLower.includes(optText))) {
        bestIndex = i;
      }
    }

    if (bestIndex !== -1) {
      const tracker = selectEl._valueTracker;
      if (tracker) tracker.setValue(selectEl.value || '');

      selectEl.selectedIndex = bestIndex;
      selectEl.dispatchEvent(new Event('focus', { bubbles: true }));
      selectEl.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      selectEl.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      selectEl.dispatchEvent(new Event('blur', { bubbles: true }));

      try {
        selectEl.blur();
      } catch (e) {}

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

  // Safely trigger full pointer & click event chain on custom ATS elements (Ashby, Greenhouse, Lever, Workday)
  function triggerClickElement(el) {
    if (!el) return false;
    try {
      el.focus();
    } catch (e) {}

    const opts = { bubbles: true, cancelable: true, view: window };

    // Fire complete mouse & pointer events for React/Vue synthetic listeners
    el.dispatchEvent(new PointerEvent('pointerdown', opts));
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new PointerEvent('pointerup', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.dispatchEvent(new MouseEvent('click', opts));

    if (typeof el.click === 'function') {
      try { el.click(); } catch (e) {}
    }

    // Check for associated input[type="radio"] or input[type="checkbox"]
    const input = el.tagName === 'INPUT' ? el : el.querySelector('input') || (el.getAttribute('for') ? document.getElementById(el.getAttribute('for')) : null);
    if (input) {
      if (!input.checked) {
        input.checked = true;
        const tracker = input._valueTracker;
        if (tracker) tracker.setValue(false);
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('click', { bubbles: true }));
      }
    }
    return true;
  }

  // Check if an option inside a container actually became checked/selected
  function isChoiceChecked(container, targetEl) {
    if (!container) return false;
    // Check if target element itself is checked/active
    if (targetEl) {
      if (targetEl.tagName === 'INPUT' && targetEl.checked) return true;
      const assocInput = targetEl.querySelector('input') || (targetEl.getAttribute('for') ? document.getElementById(targetEl.getAttribute('for')) : null);
      if (assocInput && assocInput.checked) return true;

      const ariaChecked = targetEl.getAttribute('aria-checked');
      const ariaPressed = targetEl.getAttribute('aria-pressed');
      if (ariaChecked === 'true' || ariaPressed === 'true') return true;

      const classList = targetEl.className || '';
      if (typeof classList === 'string' && (classList.includes('active') || classList.includes('selected') || classList.includes('checked') || classList.includes('is-selected'))) {
        return true;
      }
    }

    // Check if container now holds any checked input or aria-checked element
    const checkedChild = container.querySelector('input:checked, [aria-checked="true"], [aria-pressed="true"], .active, .selected, .checked');
    return Boolean(checkedChild);
  }

  // Select radio button or custom option inside group
  function selectRadioInGroup(container, targetChoice) {
    if (!container || !targetChoice) return false;
    const targetLower = targetChoice.toLowerCase().trim();

    const isYes = targetLower === 'yes' || targetLower.startsWith('yes') || targetLower === 'true' || targetLower.includes('authorized') || (targetLower.includes('will require') && !targetLower.includes('not'));
    const isNo = targetLower === 'no' || targetLower.startsWith('no') || targetLower === 'false' || targetLower.includes('will not require') || targetLower.includes('do not require');

    // Find all clickable option targets (inputs, labels, custom buttons, roles)
    const options = Array.from(container.querySelectorAll(
      'input[type="radio"], input[type="checkbox"], label, button, [role="radio"], [role="option"], [role="button"], div[class*="radio"], div[class*="option"], div[class*="choice"], div[class*="button"], span[class*="radio"]'
    ));

    let bestMatchEl = null;

    for (const el of options) {
      let text = el.textContent || el.value || el.getAttribute('aria-label') || '';
      if (el.id && el.tagName === 'INPUT') {
        const lbl = container.querySelector(`label[for="${el.id}"]`);
        if (lbl) text = lbl.textContent;
      }
      const textLower = text.toLowerCase().trim();
      if (!textLower) continue;

      let match = false;
      if (isYes) {
        if (textLower === 'yes' || textLower.startsWith('yes') || textLower.includes('authorized') || (textLower.includes('will require') && !textLower.includes('not'))) {
          match = true;
        }
      } else if (isNo) {
        if (textLower === 'no' || textLower.startsWith('no') || textLower.includes('will not require') || textLower.includes('do not require') || textLower.includes('not require') || textLower.includes('no sponsorship')) {
          match = true;
        }
      }

      if (!match) {
        if (textLower === targetLower || (targetLower.length > 3 && textLower.includes(targetLower)) || (textLower.length > 3 && targetLower.includes(textLower))) {
          match = true;
        }
      }

      if (match) {
        bestMatchEl = el;
        break;
      }
    }

    if (bestMatchEl) {
      triggerClickElement(bestMatchEl);

      // Verify that option actually became checked before marking container as autofilled
      if (isChoiceChecked(container, bestMatchEl)) {
        container.classList.add('jr-autofilled-field');
        return true;
      }
    }

    return false;
  }

  // AI-Powered Universal AutoFill for any complex, ambiguous, or unhandled form questions
  async function handleAIAutoFillForm() {
    const statusEl = document.getElementById('jr-status-text');
    if (statusEl) statusEl.innerText = '🤖 Scanning page questions with AI...';

    await fetchCandidateProfile();

    if (!activeProfile) {
      if (statusEl) statusEl.innerText = '❌ Error: Candidate profile unavailable';
      alert('Job Radar server is not running or candidate profile is empty.');
      return;
    }

    // First perform fast local rule-based pass
    await handleAutoFillCurrentPage();

    // Now gather any remaining unfilled input questions or radio/choice groups on the page
    const unansweredGroups = Array.from(document.querySelectorAll(
      'fieldset, div.fb-dash-form-element, div.jobs-easy-apply-form-section__group, div[role="radiogroup"], div.form-group, div.form-entry, div.question-container, div.application-question, div.form-field, div[data-automation-id*="question"], div[data-automation-id*="formField"], div.section-field, .artdeco-form__item, .jobs-easy-apply-form-element, div[data-test-form-element], div.ashby-application-form-question, div[class*="question"], div[class*="Question"], div[class*="field"], div[class*="Field"]'
    )).filter((group) => {
      if (group.closest('#jr-autofill-panel')) return false;
      const isFilled = isChoiceChecked(group) || Array.from(group.querySelectorAll('input, textarea')).some(i => (i.value || '').trim().length > 0);
      return !isFilled;
    });

    if (unansweredGroups.length === 0) {
      if (statusEl) statusEl.innerText = '✅ All questions on page already filled!';
      return;
    }

    if (statusEl) statusEl.innerText = `🤖 Sending ${unansweredGroups.length} question(s) to Gemini AI...`;

    const questionsPayload = unansweredGroups.slice(0, 15).map((group, idx) => {
      const qText = getQuestionTextForGroup(group);
      const choices = Array.from(group.querySelectorAll('button, label, input[type="radio"], [role="radio"], [role="option"], [role="button"]'))
        .map(el => (el.textContent || el.value || '').trim())
        .filter(t => t && t.length > 0 && t.length < 60);

      // Deduplicate choices
      const uniqueChoices = Array.from(new Set(choices));

      const input = group.querySelector('input[type="text"], textarea, input:not([type])');
      const inputType = input ? input.tagName.toLowerCase() : (uniqueChoices.length > 0 ? 'choice' : 'text');

      return {
        id: idx,
        question: qText,
        choices: uniqueChoices.length > 0 ? uniqueChoices : undefined,
        inputType
      };
    });

    let aiRes = await safeSendMessage({
      action: 'PARSE_FORM_QUESTIONS',
      questions: questionsPayload,
      jobContext: document.title || 'Job Application'
    });

    if (!aiRes || !aiRes.success || !aiRes.mappings) {
      try {
        const directRes = await fetch('http://localhost:3000/api/candidate-profile/parse-form-questions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            questions: questionsPayload,
            jobContext: document.title || 'Job Application'
          })
        });
        if (directRes.ok) {
          const data = await directRes.json();
          if (data && data.mappings) {
            aiRes = { success: true, mappings: data.mappings };
          }
        }
      } catch (e) {
        // ignore
      }
    }

    if (aiRes && aiRes.success && Array.isArray(aiRes.mappings)) {
      let aiFilledCount = 0;
      aiRes.mappings.forEach((m) => {
        const groupIndex = typeof m.id === 'number' ? m.id : parseInt(m.id, 10);
        const group = unansweredGroups[groupIndex];
        if (!group) return;

        if (m.choiceToClick) {
          if (selectRadioInGroup(group, m.choiceToClick)) {
            aiFilledCount++;
          }
        } else if (m.answer) {
          const input = group.querySelector('input, textarea, select');
          if (input) {
            setNativeInputValue(input, m.answer);
            group.classList.add('jr-autofilled-field');
            aiFilledCount++;
          }
        }
      });

      if (statusEl) {
        statusEl.innerText = `✨ AI successfully filled ${aiFilledCount} custom question(s)!`;
      }
    } else {
      if (statusEl) statusEl.innerText = '⚠️ AI processing completed with 0 new fields.';
    }
  }

  // Find label text associated with input
  function getLabelForInput(input) {
    if (!input) return '';

    if (input.id) {
      try {
        const escapedId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(input.id) : input.id.replace(/([^\w-])/g, '\\$1');
        const labelEl = document.querySelector(`label[for="${escapedId}"]`);
        if (labelEl && labelEl.textContent) return labelEl.textContent.trim();
      } catch (e) {
        // Fallback: iterate labels
        const labels = document.getElementsByTagName('label');
        for (let i = 0; i < labels.length; i++) {
          if (labels[i].getAttribute('for') === input.id) {
            return labels[i].textContent.trim();
          }
        }
      }
    }

    const parentLabel = input.closest('label');
    if (parentLabel && parentLabel.textContent) {
      return parentLabel.textContent.trim();
    }

    const parentGroup = input.closest('.fb-dash-form-element, .jobs-easy-apply-form-element, .artdeco-text-input, .form-group, .input-group, [data-automation-id], .form-field, .form-entry, .question-container');
    if (parentGroup) {
      try {
        const label = parentGroup.querySelector('label, .fb-dash-form-element__label, .form-label, span.label, p.label, legend');
        if (label && label.textContent) return label.textContent.trim();
      } catch (e) {}
    }

    const ariaLabelledBy = input.getAttribute('aria-labelledby');
    if (ariaLabelledBy) {
      try {
        const labelEl = document.getElementById(ariaLabelledBy);
        if (labelEl && labelEl.textContent) return labelEl.textContent.trim();
      } catch (e) {}
    }

    return input.getAttribute('aria-label') || input.placeholder || input.name || input.id || '';
  }

  // Listen for messages from extension popup
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'UPDATE_EXTENSION_STATE') {
          isExtensionEnabled = request.enabled !== false;
          if (!isExtensionEnabled) {
            const existing = document.getElementById('jr-autofill-panel');
            if (existing) existing.remove();
          } else {
            isClosedByUser = false;
            checkAndInjectControlPanel();
          }
          if (sendResponse) sendResponse({ success: true });
        } else if (request.action === 'REOPEN_PANEL' || request.action === 'SHOW_PANEL') {
          isClosedByUser = false;
          isExtensionEnabled = true;
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
