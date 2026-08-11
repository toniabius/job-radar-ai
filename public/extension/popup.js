document.addEventListener('DOMContentLoaded', () => {
  const serverUrlInput = document.getElementById('server-url');
  const saveBtn = document.getElementById('save-server-btn');
  const candidateNameEl = document.getElementById('candidate-name');
  const candidateEmailEl = document.getElementById('candidate-email');
  const connBadge = document.getElementById('conn-badge');
  const statusMsg = document.getElementById('status-msg');

  // Load saved server URL
  chrome.storage.local.get(['serverUrl'], (result) => {
    const url = result.serverUrl || 'http://localhost:3000';
    serverUrlInput.value = url;
    testConnection(url);
  });

  saveBtn.addEventListener('click', () => {
    const newUrl = serverUrlInput.value.trim().replace(/\/+$/, '');
    chrome.storage.local.set({ serverUrl: newUrl }, () => {
      statusMsg.innerText = 'Server URL saved!';
      testConnection(newUrl);
    });
  });

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
      statusMsg.innerText = '✅ Ready! Extension active on LinkedIn Easy Apply.';
    } catch (err) {
      console.error('Extension popup connection error:', err);
      candidateNameEl.innerText = 'Cannot connect to Job Radar';
      candidateEmailEl.innerText = 'Check server URL & ensure app is running';

      connBadge.innerText = 'Offline';
      connBadge.style.background = 'rgba(239, 68, 68, 0.2)';
      connBadge.style.color = '#fca5a5';
      statusMsg.innerText = '❌ Failed to connect to Job Radar app.';
    }
  }
});
