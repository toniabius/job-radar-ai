document.addEventListener('DOMContentLoaded', () => {
  const serverUrlInput = document.getElementById('server-url');
  const saveBtn = document.getElementById('save-server-btn');
  const reopenBtn = document.getElementById('reopen-panel-btn');
  const candidateNameEl = document.getElementById('candidate-name');
  const candidateEmailEl = document.getElementById('candidate-email');
  const connBadge = document.getElementById('conn-badge');
  const statusMsg = document.getElementById('status-msg');
  const extToggle = document.getElementById('extension-toggle');
  const extStatusLabel = document.getElementById('ext-status-label');

  function updateExtToggleUI(enabled) {
    if (extToggle) extToggle.checked = enabled;
    if (extStatusLabel) {
      if (enabled) {
        extStatusLabel.innerText = 'Enabled';
        extStatusLabel.style.color = '#34d399';
      } else {
        extStatusLabel.innerText = 'Disabled';
        extStatusLabel.style.color = '#f87171';
      }
    }
  }

  // Load saved extension state & server URL
  chrome.storage.local.get(['serverUrl', 'extensionEnabled'], (result) => {
    const url = result.serverUrl || 'http://localhost:3000';
    serverUrlInput.value = url;
    const enabled = result.extensionEnabled !== false;
    updateExtToggleUI(enabled);
    testConnection(url);
  });

  if (extToggle) {
    extToggle.addEventListener('change', () => {
      const isEnabled = extToggle.checked;
      updateExtToggleUI(isEnabled);
      chrome.storage.local.set({ extensionEnabled: isEnabled }, () => {
        statusMsg.innerText = isEnabled ? 'Extension AutoFill Enabled!' : 'Extension AutoFill Disabled.';
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0] && tabs[0].id) {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'UPDATE_EXTENSION_STATE', enabled: isEnabled });
          }
        });
      });
    });
  }

  saveBtn.addEventListener('click', () => {
    const newUrl = serverUrlInput.value.trim().replace(/\/+$/, '');
    chrome.storage.local.set({ serverUrl: newUrl }, () => {
      statusMsg.innerText = 'Server URL saved!';
      testConnection(newUrl);
    });
  });

  if (reopenBtn) {
    reopenBtn.addEventListener('click', () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].id) {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'REOPEN_PANEL' }, () => {
            if (chrome.runtime.lastError) {
              statusMsg.innerText = '⚠️ Please open a job site tab (e.g. LinkedIn)';
            } else {
              statusMsg.innerText = '⚡ Floating assistant re-opened!';
            }
          });
        }
      });
    });
  }

  async function testConnection(url) {
    connBadge.innerText = 'Testing...';
    connBadge.style.background = 'rgba(234, 179, 8, 0.2)';
    connBadge.style.color = '#fde047';

    try {
      const res = await fetch(`${url}/api/candidate-profile`);
      if (!res.ok) throw new Error('Profile endpoint returned error');
      const profile = await res.json();

      candidateNameEl.innerText = `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || 'Candidate Profile Active';
      candidateEmailEl.innerText = `${profile.email || ''} • ${profile.yearsExperience || 0} yrs exp`;

      connBadge.innerText = 'Connected';
      connBadge.style.background = 'rgba(16, 185, 129, 0.2)';
      connBadge.style.color = '#34d399';
      statusMsg.innerText = '✅ Ready!';
    } catch (err) {
      console.error('Extension popup connection error:', err);
      candidateNameEl.innerText = 'Cannot connect to Apply Assistant';
      candidateEmailEl.innerText = 'Check server URL & ensure app is running';

      connBadge.innerText = 'Offline';
      connBadge.style.background = 'rgba(239, 68, 68, 0.2)';
      connBadge.style.color = '#fca5a5';
      statusMsg.innerText = '❌ Failed to connect to Apply Assistant app.';
    }
  }
});
