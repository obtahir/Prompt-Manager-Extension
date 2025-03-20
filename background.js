chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "saveAsPrompt",
    title: "Save as Prompt",
    contexts: ["selection"]
  });
});

// Function to sanitize user input to prevent XSS
function sanitizeInput(input) {
  if (!input) return '';
  
  // Simple HTML escaping for service worker context
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Function to animate the extension icon using badge
function animateIconBadge() {
  // Step 1: Show a green badge with a checkmark
  chrome.action.setBadgeBackgroundColor({ color: '#2ecc71' });
  chrome.action.setBadgeText({ text: '✓' });
  
  // Step 2: After a delay, clear the badge
  setTimeout(() => {
    chrome.action.setBadgeText({ text: '' });
  }, 1500);
}

// Function to save a prompt directly to storage
function savePromptToStorage(title, text) {
  chrome.storage.sync.get(['prompts'], (result) => {
    const prompts = result.prompts || [];
    
    // Check if prompts have been manually ordered
    const hasManuallyOrderedPrompts = prompts.some(p => p.manuallyOrdered);
    
    // If prompts have been manually ordered, reset the flag for all prompts
    // This ensures new prompts appear at the top
    if (hasManuallyOrderedPrompts) {
      prompts.forEach(prompt => {
        delete prompt.manuallyOrdered;
      });
    }
    
    // Add new prompt to the beginning of the array with a timestamp
    prompts.unshift({ 
      title: sanitizeInput(title), 
      text: sanitizeInput(text),
      favorite: false,
      createdAt: Date.now() // Add timestamp for sorting
    });
    
    chrome.storage.sync.set({ prompts }, () => {
      console.log('Prompt saved from context menu');
      // Animate the icon badge to provide visual feedback
      animateIconBadge();
      // Notify any open popup to reload prompts
      chrome.runtime.sendMessage({ action: "reloadPrompts" });
    });
  });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "saveAsPrompt") {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: promptAndSave,
      args: [info.selectionText]
    });
  }
});

function promptAndSave(selectedText) {
  const title = prompt("Enter a title for this prompt:");
  if (title) {
    // Use chrome.runtime.sendMessage to communicate with the background script
    chrome.runtime.sendMessage({
      action: "savePromptFromContextMenu",
      title: title,
      text: selectedText
    });
    return "Prompt saved!"; // Return a message to indicate success
  }
  return "Cancelled"; // Return a message to indicate cancellation
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "savePrompt") {
    // Handle messages from the popup
    chrome.storage.sync.get(['prompts'], (result) => {
      const prompts = result.prompts || [];
      
      // Check if prompts have been manually ordered
      const hasManuallyOrderedPrompts = prompts.some(p => p.manuallyOrdered);
      
      // If prompts have been manually ordered, reset the flag for all prompts
      // This ensures new prompts appear at the top
      if (hasManuallyOrderedPrompts) {
        prompts.forEach(prompt => {
          delete prompt.manuallyOrdered;
        });
      }
      
      // Add new prompt to the beginning of the array with a timestamp
      prompts.unshift({ 
        title: request.title, 
        text: request.text,
        favorite: false,
        createdAt: Date.now() // Add timestamp for sorting
      });
      
      chrome.storage.sync.set({ prompts }, () => {
        console.log('Prompt saved from popup');
        // Animate the icon badge to provide visual feedback
        animateIconBadge();
        // Notify the popup to reload prompts
        chrome.runtime.sendMessage({ action: "reloadPrompts" });
      });
    });
  } else if (request.action === "savePromptFromContextMenu") {
    // Handle messages from the context menu
    savePromptToStorage(request.title, request.text);
  }
});