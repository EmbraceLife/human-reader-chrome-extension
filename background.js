chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    "id": "readOutLoud",
    "title": "Human Reader - Start reading",
    "contexts": ["selection"],
  });
});

// Offscreen document management
let creatingOffscreen = null;

async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
  });
  if (existingContexts.length > 0) return;
  
  if (creatingOffscreen) {
    await creatingOffscreen;
  } else {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["AUDIO_PLAYBACK"],
      justification: "Play TTS audio without page CSP restrictions",
    });
    await creatingOffscreen;
    creatingOffscreen = null;
  }
}

// Relay audio messages from content script to offscreen document
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target === "offscreen") {
    ensureOffscreenDocument().then(() => {
      chrome.runtime.sendMessage(message.data).then(sendResponse);
    });
    return true;
  }
  
  // Handle Minimax TTS API call (to avoid CORS issues)
  if (message.action === "minimaxTTS") {
    fetchMinimaxAudio(message.text, message.voice, message.model, message.apiKey)
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true; // Keep channel open for async response
  }
});

// Minimax TTS API call from background (no CORS restrictions)
async function fetchMinimaxAudio(text, voice, model, apiKey) {
  const response = await fetch("https://api.minimax.io/v1/t2a_v2", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model || "speech-2.8-hd",
      text: text,
      voice_setting: {
        voice_id: voice,
        speed: 1,
        vol: 1,
        pitch: 0,
      },
      audio_setting: {
        format: "mp3",
      },
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Minimax API error: ${response.status}`);
  }
  
  const json = await response.json();
  console.log("Minimax API response:", json);
  
  if (json.base_resp && json.base_resp.status_code !== 0) {
    throw new Error(`Minimax API error: ${json.base_resp.status_msg}`);
  }
  
  // Return the hex-encoded audio
  const hexAudio = json.data?.audio || json.audio_file;
  if (!hexAudio) {
    throw new Error("No audio data in response");
  }
  
  return { hexAudio };
}

// Could be adde in future
//chrome.contextMenus.create({
//    "id": "stopReading",
//    "title": "Stop reading",
//    "contexts": ["all"],
//});

// Detect click on context menu
chrome.contextMenus.onClicked.addListener(function (info, tab) {
    transmitSignal();
})

// Send message to content.js file
async function transmitSignal() {
    const tabs = await chrome.tabs.query({active: true, currentWindow: true});
    if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {action: "readOutLoud"});
    }
}