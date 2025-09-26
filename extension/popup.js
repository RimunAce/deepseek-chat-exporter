document.addEventListener("DOMContentLoaded", () => {
  const statusEl = document.getElementById("status");

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url && tabs[0].url.includes("chat.deepseek.com")) {
      statusEl.textContent = "Active on DeepSeek";
      statusEl.className = "status active";
    } else {
      statusEl.textContent = "Visit chat.deepseek.com";
      statusEl.className = "status inactive";
    }
  });
});
