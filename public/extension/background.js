// Background service worker for Job Radar Chrome Extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('Job Radar LinkedIn AutoFill Extension installed');
  // Set default server URL
  chrome.storage.local.get(['serverUrl'], (result) => {
    if (!result.serverUrl) {
      chrome.storage.local.set({ serverUrl: 'http://localhost:3000' });
    }
  });
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'GET_PROFILE') {
    chrome.storage.local.get(['serverUrl'], async (result) => {
      const serverUrl = result.serverUrl || 'http://localhost:3000';
      try {
        const res = await fetch(`${serverUrl}/api/candidate-profile`);
        if (!res.ok) throw new Error('Failed to fetch profile');
        const data = await res.json();
        sendResponse({ success: true, profile: data });
      } catch (err) {
        console.error('Extension background profile fetch error:', err);
        sendResponse({ success: false, error: err.message });
      }
    });
    return true; // Keep message channel open for async response
  }

  if (request.action === 'GENERATE_AI_ANSWER') {
    chrome.storage.local.get(['serverUrl'], async (result) => {
      const serverUrl = result.serverUrl || 'http://localhost:3000';
      try {
        const res = await fetch(`${serverUrl}/api/candidate-profile/generate-answer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: request.question,
            jobContext: request.jobContext
          })
        });
        const data = await res.json();
        if (data.answer) {
          sendResponse({ success: true, answer: data.answer });
        } else {
          sendResponse({ success: false, error: data.error || 'No answer generated' });
        }
      } catch (err) {
        console.error('Extension AI answer error:', err);
        sendResponse({ success: false, error: err.message });
      }
    });
    return true;
  }

  if (request.action === 'PARSE_FORM_QUESTIONS') {
    chrome.storage.local.get(['serverUrl'], async (result) => {
      const serverUrl = result.serverUrl || 'http://localhost:3000';
      try {
        const res = await fetch(`${serverUrl}/api/candidate-profile/parse-form-questions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            questions: request.questions,
            jobContext: request.jobContext
          })
        });
        const data = await res.json();
        if (data.mappings) {
          sendResponse({ success: true, mappings: data.mappings });
        } else {
          sendResponse({ success: false, error: data.error || 'No mappings generated' });
        }
      } catch (err) {
        console.error('Extension AI parse questions error:', err);
        sendResponse({ success: false, error: err.message });
      }
    });
    return true;
  }
});
