/**
 * DeepSeek Chat Exporter Content Script
 * Injects export functionality into DeepSeek chat interface
 */

class DeepSeekExporter {
  constructor() {
    this.exportButton = null;
    this.modal = null;
    this.isInitialized = false;
    this.chatData = {
      messages: [],
      metadata: {}
    };
    this.pdfExporterLoadPromise = null;
    this.markdownUtils =
      (typeof window.DeepSeekMarkdown !== "undefined" &&
        window.DeepSeekMarkdown) ||
      null;
    this.mutationObserver = null;
    this.currentUrl = window.location.href;

    // Initialize when DOM is ready
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.init());
    } else {
      this.init();
    }
  }

  init() {
    if (this.isInitialized) return;

    console.log("DeepSeek Exporter: Initializing...");

    // Wait for the chat interface to load
    this.waitForChatInterface();

    // Set up observers for SPA navigation
    this.setupSPAObservers();

    this.isInitialized = true;
  }

  waitForChatInterface() {
    // Look for the input area where we'll add the export button
    const checkInterval = setInterval(() => {
      // Based on the HTML structure, look for input area with file attachment button
      const inputContainer = this.findInputContainer();

      if (inputContainer && !this.exportButton) {
        console.log(
          "DeepSeek Exporter: Chat interface found, injecting export button"
        );
        this.injectExportButton(inputContainer);
        clearInterval(checkInterval);
      }
    }, 1000);

    // Stop checking after 30 seconds
    setTimeout(() => clearInterval(checkInterval), 30000);
  }

  setupSPAObservers() {
    // Monitor URL changes for SPA navigation
    this.setupURLObserver();

    // Monitor DOM changes to detect when input area is replaced
    this.setupDOMObserver();
  }

  setupURLObserver() {
    // Listen for URL changes (SPA navigation)
    const checkURL = () => {
      if (window.location.href !== this.currentUrl) {
        console.log(
          "DeepSeek Exporter: URL changed, checking for export button"
        );
        this.currentUrl = window.location.href;
        this.handleNavigation();
      }
    };

    // Check URL periodically since SPA navigation doesn't trigger popstate reliably
    setInterval(checkURL, 1000);

    // Also listen for popstate events
    window.addEventListener("popstate", checkURL);
  }

  setupDOMObserver() {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
    }

    this.mutationObserver = new MutationObserver((mutations) => {
      let shouldCheck = false;

      for (const mutation of mutations) {
        // Check if nodes were added or removed
        if (
          mutation.type === "childList" &&
          (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0)
        ) {
          // Check if our export button was removed
          for (const node of mutation.removedNodes) {
            if (
              node === this.exportButton ||
              (node.nodeType === Node.ELEMENT_NODE &&
                node.contains &&
                node.contains(this.exportButton))
            ) {
              console.log(
                "DeepSeek Exporter: Export button removed, will re-inject"
              );
              this.exportButton = null;
              shouldCheck = true;
              break;
            }
          }

          // Check if input area was added
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const inputContainer = this.findInputContainerInNode(node);
              if (inputContainer && !this.exportButton) {
                console.log("DeepSeek Exporter: New input area detected");
                shouldCheck = true;
                break;
              }
            }
          }
        }
      }

      if (shouldCheck) {
        setTimeout(() => this.handleNavigation(), 100);
      }
    });

    // Observe the entire document for changes
    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  findInputContainerInNode(node) {
    // Look for input containers within a specific node
    const fileInput = node.querySelector
      ? node.querySelector("input[type=\"file\"][multiple]")
      : null;
    if (fileInput) {
      const container =
        fileInput.closest("[class*=\"ec4f5d61\"]") ||
        fileInput.closest("div").closest("div").closest("div");
      if (container && this.isValidInputContainer(container)) {
        return container;
      }
    }

    const textarea = node.querySelector
      ? node.querySelector("textarea[placeholder*=\"Message DeepSeek\"]")
      : null;
    if (textarea) {
      const container = textarea.closest("div").parentElement;
      if (container && this.isValidInputContainer(container)) {
        return container;
      }
    }

    return null;
  }

  handleNavigation() {
    console.log("DeepSeek Exporter: Handling navigation");

    // Reset export button reference if it no longer exists
    if (this.exportButton && !document.contains(this.exportButton)) {
      this.exportButton = null;
    }

    // Check if we need to inject the export button
    if (!this.exportButton) {
      const inputContainer = this.findInputContainer();
      if (inputContainer) {
        console.log(
          "DeepSeek Exporter: Re-injecting export button after navigation"
        );
        this.injectExportButton(inputContainer);
      } else {
        // If no input container found, wait for it
        this.waitForChatInterface();
      }
    }
  }

  findInputContainer() {
    // Look for the specific DeepSeek input structure based on our analysis
    // Priority 1: Look for the file input element and work backwards
    const fileInput = document.querySelector("input[type=\"file\"][multiple]");
    if (fileInput) {
      // The file input is nested deep, we need the container that holds all the buttons
      const container =
        fileInput.closest("[class*=\"ec4f5d61\"]") ||
        fileInput.closest("div").closest("div").closest("div");
      if (container && this.isValidInputContainer(container)) {
        console.log(
          "DeepSeek Exporter: Found input container via file input",
          container
        );
        return container;
      }
    }

    // Priority 2: Look for the textarea with "Message DeepSeek" placeholder
    const textarea = document.querySelector(
      "textarea[placeholder*=\"Message DeepSeek\"]"
    );
    if (textarea) {
      // Find the parent container that includes both textarea and buttons
      const container = textarea.closest("div").parentElement;
      if (container && this.isValidInputContainer(container)) {
        console.log(
          "DeepSeek Exporter: Found input container via textarea",
          container
        );
        return container;
      }
    }

    // Priority 3: Look for DeepThink button and find its container
    const deepThinkButton = Array.from(
      document.querySelectorAll("button")
    ).find((btn) => btn.textContent.includes("DeepThink"));
    if (deepThinkButton) {
      const container = deepThinkButton.closest("div").parentElement;
      if (container && this.isValidInputContainer(container)) {
        console.log(
          "DeepSeek Exporter: Found input container via DeepThink button",
          container
        );
        return container;
      }
    }

    // Priority 4: Look for specific DeepSeek classes
    const selectors = [
      "[class*=\"ec4f5d61\"]", // Button container class we saw in HTML
      "[class*=\"bf38813a\"]", // Another button container class
      "textarea[placeholder*=\"message\"]",
      "div[contenteditable=\"true\"]"
    ];

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        const container =
          element.closest("div").parentElement || element.parentElement;
        if (container && this.isValidInputContainer(container)) {
          console.log(
            "DeepSeek Exporter: Found input container via selector",
            selector,
            container
          );
          return container;
        }
      }
    }

    // Fallback: look for the bottom-most interactive area
    const candidates = [
      ...document.querySelectorAll("input, textarea, [contenteditable]"),
      ...document.querySelectorAll("button[role=\"button\"]")
    ];

    let bestCandidate = null;
    let highestY = 0;

    for (const candidate of candidates) {
      const rect = candidate.getBoundingClientRect();
      if (rect.y > highestY && rect.height > 0) {
        const container =
          candidate.closest("div").parentElement || candidate.parentElement;
        if (container && this.isValidInputContainer(container)) {
          bestCandidate = container;
          highestY = rect.y;
        }
      }
    }

    return bestCandidate;
  }

  isValidInputContainer(container) {
    // Validate that this container is likely the input area
    const rect = container.getBoundingClientRect();

    // Should be visible and have reasonable dimensions
    if (rect.width < 100 || rect.height < 20) return false;

    // Should be near the bottom of the viewport (input areas usually are)
    const viewportHeight = window.innerHeight;
    const isNearBottom = rect.bottom > viewportHeight * 0.5;

    // Should contain interactive elements
    const hasInteractiveElements = container.querySelector(
      "input, textarea, button, [contenteditable]"
    );

    return isNearBottom && hasInteractiveElements;
  }

  injectExportButton(container) {
    // Create export button
    this.exportButton = document.createElement("div");
    this.exportButton.className = "_17e543b f02f0e25 deepseek-export-button";
    this.exportButton.tabIndex = 0;
    this.exportButton.role = "button";
    this.exportButton.ariaDisabled = "false";
    this.exportButton.title = "Export chat conversation";
    this.exportButton.style.cssText = `
      --hover-size: 34px;
      width: 34px;
      height: 34px;
      cursor: pointer;
      margin-right: 8px;
    `;

    this.exportButton.innerHTML = `
      <div class="_001e3bb"></div>
      <div class="ds-icon" style="font-size: 16px; width: 16px; height: 16px;">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M2 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4z
                   m2-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H4z" 
                fill="currentColor"/>
          <path d="M8.5 2.5a.5.5 0 0 0-1 0V6H5.354a.5.5 0 0 0-.354.854l2.5 2.5a.5.5 0 0 0 .708 0
                   l2.5-2.5A.5.5 0 0 0 10.354 6H8.5V2.5z"
                 fill="currentColor"/>
        </svg>
      </div>
    `;

    // Add click handler with proper event handling
    this.exportButton.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log("DeepSeek Exporter: Export button clicked");
      this.showExportModal();
    });

    // Add keyboard support
    this.exportButton.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        console.log("DeepSeek Exporter: Export button activated via keyboard");
        this.showExportModal();
      }
    });

    // Add focus/blur handlers for accessibility
    this.exportButton.addEventListener("focus", () => {
      this.exportButton.style.outline =
        "2px solid var(--dsw-alias-primary, #4f46e5)";
    });

    this.exportButton.addEventListener("blur", () => {
      this.exportButton.style.outline = "none";
    });

    // Find the specific button container that holds the file upload button
    // Look for the container with class "bf38813a" or similar pattern that contains file upload buttons
    const buttonContainer =
      container.querySelector(".bf38813a") ||
      container.querySelector("[class*=\"bf38813a\"]") ||
      container.querySelector("div[class*=\"ec4f5d61\"] ~ div");

    if (buttonContainer) {
      // Insert the export button at the beginning of the button container (before file upload)
      buttonContainer.insertBefore(
        this.exportButton,
        buttonContainer.firstChild
      );
    } else {
      // Fallback: try to find the file upload button directly and insert before it
      const fileUploadButton = container.querySelector("input[type=\"file\"]");
      if (fileUploadButton && fileUploadButton.parentElement) {
        const fileButtonContainer = fileUploadButton.parentElement;
        // Insert our button before the file upload button container
        fileButtonContainer.parentElement.insertBefore(
          this.exportButton,
          fileButtonContainer
        );
      } else {
        // Last resort: append to the container
        container.appendChild(this.exportButton);
      }
    }

    console.log("DeepSeek Exporter: Export button injected successfully");
  }

  showExportModal() {
    if (this.modal) {
      this.modal.remove();
    }

    // Create modal
    this.modal = document.createElement("div");
    this.modal.className = "deepseek-export-modal";
    this.modal.innerHTML = `
            <div class="deepseek-export-modal-content">
                <h2>Export Chat Conversation</h2>
                
                <div class="deepseek-export-options">
                    <div class="deepseek-export-section">
                        <h3>Export Format</h3>
                        <div class="deepseek-export-radio-group">
                            <div class="deepseek-export-radio-item">
                                <input type="radio" id="format-json" name="format" value="json" checked>
                                <label for="format-json">JSON (Structured data)</label>
                            </div>
                            <div class="deepseek-export-radio-item">
                                <input type="radio" id="format-pdf" name="format" value="pdf">
                                <label for="format-pdf">PDF (Readable document)</label>
                            </div>
                        </div>
                    </div>
                    
                    <div class="deepseek-export-section">
                        <h3>Include Messages</h3>
                        <div class="deepseek-export-radio-group">
                            <div class="deepseek-export-radio-item">
                                <input type="radio" id="messages-both" name="messages" value="both" checked>
                                <label for="messages-both">Both user and AI messages</label>
                            </div>
                            <div class="deepseek-export-radio-item">
                                <input type="radio" id="messages-user" name="messages" value="user">
                                <label for="messages-user">User messages only</label>
                            </div>
                            <div class="deepseek-export-radio-item">
                                <input type="radio" id="messages-ai" name="messages" value="ai">
                                <label for="messages-ai">AI responses only</label>
                            </div>
                        </div>
                        
                        <div class="deepseek-export-checkbox">
                            <input type="checkbox" id="include-thinking" checked>
                            <label for="include-thinking">Include AI thinking process (if available)</label>
                        </div>
                    </div>
                </div>
                
                <div class="deepseek-export-actions">
                    <button class="deepseek-export-btn" id="cancel-export">Cancel</button>
                    <button class="deepseek-export-btn primary" id="start-export">Export</button>
                </div>
                
                <div class="deepseek-export-progress" id="export-progress">
                    Preparing export...
                </div>
            </div>
        `;

    document.body.appendChild(this.modal);

    // Add event handlers
    this.modal.querySelector("#cancel-export").addEventListener("click", () => {
      this.modal.remove();
    });

    this.modal.querySelector("#start-export").addEventListener("click", () => {
      this.startExport();
    });

    // Close on backdrop click
    this.modal.addEventListener("click", (e) => {
      if (e.target === this.modal) {
        this.modal.remove();
      }
    });
  }

  async startExport() {
    const format = this.modal.querySelector(
      "input[name=\"format\"]:checked"
    ).value;
    const messageFilter = this.modal.querySelector(
      "input[name=\"messages\"]:checked"
    ).value;
    const includeThinking =
      this.modal.querySelector("#include-thinking").checked;

    const progressEl = this.modal.querySelector("#export-progress");
    progressEl.classList.add("show");
    progressEl.textContent = "Extracting chat data...";

    try {
      // Extract chat data
      await this.extractChatData();

      // Filter messages based on user selection
      const filteredData = this.filterChatData(messageFilter, includeThinking);

      progressEl.textContent = `Generating ${format.toUpperCase()} export...`;

      // Generate export
      if (format === "json") {
        this.exportAsJSON(filteredData);
      } else if (format === "pdf") {
        await this.exportAsPDF(filteredData);
      }

      progressEl.textContent = "Export completed successfully!";

      setTimeout(() => {
        this.modal.remove();
      }, 2000);
    } catch (error) {
      console.error("Export failed:", error);
      progressEl.textContent = "Export failed. Please try again.";
      progressEl.style.color = "red";
    }
  }

  async extractChatData() {
    console.log("DeepSeek Exporter: Extracting chat data...");

    // Reset chat data
    this.chatData = {
      messages: [],
      metadata: {
        exportDate: new Date().toISOString(),
        url: window.location.href,
        title: document.title,
        chatId: this.extractChatId()
      }
    };

    // Find message containers - based on the HTML structure we analyzed
    const messageSelectors = [
      // DeepSeek specific classes from our analysis
      ".ds-message",
      ".d29f3d7d.ds-message", // Combined class we saw
      "div[class*=\"fbb737a4\"]", // Message content class
      "[class*=\"message\"]",
      // Generic message patterns
      "[role=\"article\"]",
      "[data-message-id]",
      ".message",
      ".chat-message",
      ".conversation-message"
    ];

    let messages = [];

    for (const selector of messageSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        messages = Array.from(elements);
        console.log(
          `Found ${messages.length} messages using selector: ${selector}`
        );
        break;
      }
    }

    if (messages.length === 0) {
      console.warn(
        "No messages found with standard selectors, trying content-based detection..."
      );

      // Advanced fallback: look for structured text content that looks like messages
      const potentialMessages = document.querySelectorAll(
        "div, section, article"
      );
      messages = Array.from(potentialMessages).filter((el) => {
        const text = el.textContent.trim();

        // Must have substantial text content
        if (text.length < 30) return false;

        // Shouldn't contain interactive elements (likely UI, not content)
        if (el.querySelector("input, button, select, textarea")) return false;

        // Shouldn't be navigation or header content
        if (el.closest("nav, header, footer, aside")) return false;

        // Should be in a reasonable location (not fixed positioned UI)
        const styles = window.getComputedStyle(el);
        if (styles.position === "fixed" || styles.position === "sticky")
          return false;

        // Should have reasonable dimensions
        const rect = el.getBoundingClientRect();
        if (rect.width < 200 || rect.height < 20) return false;

        return true;
      });

      // Sort by position to maintain conversation order
      messages.sort((a, b) => {
        const rectA = a.getBoundingClientRect();
        const rectB = b.getBoundingClientRect();
        return rectA.top - rectB.top;
      });

      console.log(
        `Found ${messages.length} potential messages using content-based detection`
      );
    }

    // Process each message
    for (const messageEl of messages) {
      const messageData = this.parseMessage(messageEl);
      if (messageData) {
        this.chatData.messages.push(messageData);
      }
    }

    console.log(
      `DeepSeek Exporter: Extracted ${this.chatData.messages.length} messages`
    );
    return this.chatData;
  }

  parseMessage(messageEl) {
    const text = messageEl.textContent.trim();
    if (!text || text.length < 10) return null;

    // Try to determine if this is a user or AI message
    // This is heuristic-based since we need to analyze the actual structure
    const thinkingInfo = this.extractThinkingInfo(messageEl);
    const isUserMessage = this.detectUserMessage(messageEl, text);
    const content = this.extractMessageContent(messageEl);

    return {
      type: isUserMessage ? "user" : "assistant",
      content,
      timestamp: this.extractTimestamp(messageEl),
      hasThinking: Boolean(thinkingInfo),
      thinkingContent: thinkingInfo ? thinkingInfo.fullText : null
    };
  }

  detectUserMessage(element, text) {
    const classList = Array.from(element.classList || []);

    // Explicit DeepSeek user bubble class
    if (classList.some((cls) => cls.includes("d29f3d7d"))) {
      return true;
    }

    // Data attributes occasionally mark user messages
    if (
      element.matches("[data-role=\"user\"], [data-author=\"user\"]") ||
      element.closest("[data-role=\"user\"], [data-author=\"user\"]")
    ) {
      return true;
    }

    // Thinking blocks are exclusive to assistant responses
    if (this.extractThinkingInfo(element)) {
      return false;
    }

    const userBubble = element.querySelector(".fbb737a4");

    const userIndicators = [
      userBubble,
      element.querySelector(
        "[class*=\"avatar-user\"], [data-testid=\"user-avatar\"]"
      ),
      element.querySelector("[class*=\"icon-user\"]"),
      classList.some((cls) => cls.includes("human")),
      text.length < 600
    ];

    const aiIndicators = [
      element.querySelector(".ds-markdown"),
      element.querySelector("pre, code"),
      classList.some(
        (cls) => cls.includes("assistant") || cls.includes("_7d763a7")
      ),
      text.startsWith("Thought for"),
      text.length > 900
    ];

    const userScore = userIndicators.filter(Boolean).length;
    const aiScore = aiIndicators.filter(Boolean).length;

    if (userScore === aiScore) {
      return text.length < 800;
    }

    return userScore > aiScore;
  }

  detectThinkingBlock(element) {
    return Boolean(this.extractThinkingInfo(element));
  }

  extractThinkingContent(element) {
    const info = this.extractThinkingInfo(element);
    return info ? info.fullText : null;
  }

  extractThinkingInfo(element) {
    // Try multiple selectors for thinking content containers
    const thinkingContainer = element.querySelector(
      ".ds-think-content, [class*=\"think-content\"], [data-testid=\"think-content\"], " +
        ".thinking-content, [class*=\"thinking\"], .thought-process"
    );

    if (!thinkingContainer) {
      // Try to find thinking content by looking for specific patterns
      const allElements = element.querySelectorAll("*");
      for (const el of allElements) {
        const text = el.textContent.trim();
        // Look for elements that contain thinking-related keywords
        if (
          text &&
          (text.toLowerCase().includes("thinking") ||
            text.toLowerCase().includes("thought") ||
            text.toLowerCase().includes("reasoning") ||
            text.toLowerCase().includes("analyzing"))
        ) {
          // Check if this element might be a thinking container
          const parent = el.parentElement;
          if (
            parent &&
            (parent.textContent.includes("💭") ||
              parent.className.includes("think") ||
              parent.className.includes("thought"))
          ) {
            return {
              header: "Thinking Process",
              body: text,
              fullText: `Thinking Process\n\n${text}`
            };
          }
        }
      }
      return null;
    }

    // Try multiple selectors for thinking headers
    const headerEl =
      element.querySelector("span._5255ff8") ||
      element.querySelector("[class*=\"think-title\"]") ||
      element.querySelector("[class*=\"thought-title\"]") ||
      element.querySelector(".thinking-header") ||
      element.querySelector("[class*=\"thinking-header\"]");

    const headerText = headerEl
      ? headerEl.textContent.trim()
      : "Thinking Process";

    let bodyText = thinkingContainer.textContent.trim();
    if (
      this.markdownUtils &&
      typeof this.markdownUtils.elementToMarkdown === "function"
    ) {
      bodyText = this.markdownUtils
        .elementToMarkdown(thinkingContainer)
        .split("\n")
        .filter((line) => line.trim().length > 0 && line.trim() !== headerText)
        .join("\n")
        .trim();
    }

    return {
      header: headerText,
      body: bodyText,
      fullText: `${headerText}\n\n${bodyText}`
    };
  }

  extractMessageContent(element) {
    const markdownBlocks = Array.from(
      element.querySelectorAll(".ds-markdown")
    ).filter((block) => !block.closest(".ds-think-content"));

    const convertToMarkdown = (node) => {
      if (!node) return "";
      if (
        this.markdownUtils &&
        typeof this.markdownUtils.elementToMarkdown === "function"
      ) {
        return this.markdownUtils.elementToMarkdown(node);
      }
      return node.textContent ? node.textContent.trim() : "";
    };

    const normalizeContent = (value) =>
      value
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[\s\u00A0]+$/g, "")
        .trim();

    const markdownText = markdownBlocks
      .map((block) => normalizeContent(convertToMarkdown(block)))
      .filter((text) => text.length > 0);

    if (markdownText.length > 0) {
      return normalizeContent(markdownText.join("\n\n"));
    }

    const userBubble = element.querySelector(".fbb737a4");
    if (userBubble) {
      return normalizeContent(convertToMarkdown(userBubble));
    }

    const fallbackClone = element.cloneNode(true);
    const selectorsToRemove = [
      ".ds-think-content",
      "[class*=\"think-content\"]",
      "[data-testid=\"think-content\"]",
      "[class*=\"thinking\"]",
      "[class*=\"thought\"]"
    ];

    selectorsToRemove.forEach((selector) => {
      fallbackClone.querySelectorAll(selector).forEach((node) => node.remove());
    });

    return normalizeContent(convertToMarkdown(fallbackClone));
  }

  extractTimestamp(element) {
    // Look for timestamp elements
    const timeSelectors = [
      "time",
      "[class*=\"timestamp\"]",
      "[class*=\"time\"]",
      "[datetime]"
    ];

    for (const selector of timeSelectors) {
      const timeEl = element.querySelector(selector);
      if (timeEl) {
        return timeEl.dateTime || timeEl.textContent || null;
      }
    }

    // Fallback to current time
    return new Date().toISOString();
  }

  extractChatId() {
    // Extract chat ID from URL
    const urlMatch = window.location.pathname.match(/\/s\/([a-f0-9-]+)/);
    return urlMatch ? urlMatch[1] : "unknown";
  }

  generateMessageId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  filterChatData(messageFilter, includeThinking) {
    const filteredData = { ...this.chatData };

    // Filter messages by type
    if (messageFilter === "user") {
      filteredData.messages = this.chatData.messages.filter(
        (msg) => msg.type === "user"
      );
    } else if (messageFilter === "ai") {
      filteredData.messages = this.chatData.messages.filter(
        (msg) => msg.type === "assistant"
      );
    }

    // Handle thinking content
    if (!includeThinking) {
      filteredData.messages = filteredData.messages.map((msg) => ({
        ...msg,
        hasThinking: false,
        thinkingContent: null
      }));
    }

    return filteredData;
  }

  exportAsJSON(data) {
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const filename = `deepseek-chat-${data.metadata.chatId}-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async exportAsPDF(data) {
    try {
      console.log("Ensuring PDF exporter bridge is loaded...");
      await this.ensurePDFExporterLoaded();
      console.log("Requesting PDF generation...");
      await this.requestPDFGeneration(data);
      console.log("PDF generated successfully");
    } catch (error) {
      console.error("PDF export failed:", error);
      throw new Error(
        `PDF export failed: ${error.message}. Please try JSON format instead.`
      );
    }
  }

  async ensurePDFExporterLoaded() {
    if (this.pdfExporterLoadPromise) {
      return this.pdfExporterLoadPromise;
    }

    const readinessAttribute = document.documentElement.getAttribute(
      "data-deepseek-pdf-exporter-ready"
    );

    if (readinessAttribute === "true") {
      this.pdfExporterLoadPromise = Promise.resolve();
      return this.pdfExporterLoadPromise;
    }

    this.pdfExporterLoadPromise = new Promise((resolve, reject) => {
      let timeoutId = null;

      const cleanup = () => {
        window.removeEventListener("deepseek-exporter:ready", onReady, true);
        window.removeEventListener(
          "deepseek-exporter:load-error",
          onError,
          true
        );
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      };

      const onReady = () => {
        cleanup();
        resolve();
      };

      const onError = (event) => {
        cleanup();
        const message =
          (event && event.detail && event.detail.message) ||
          "PDFExporter failed to load";
        reject(new Error(message));
      };

      timeoutId = setTimeout(() => {
        cleanup();
        this.pdfExporterLoadPromise = null;
        reject(new Error("PDFExporter timed out while loading"));
      }, 15000);

      window.addEventListener("deepseek-exporter:ready", onReady, {
        once: true,
        capture: true
      });
      window.addEventListener("deepseek-exporter:load-error", onError, {
        once: true,
        capture: true
      });

      const existingScript = document.querySelector(
        "script[data-deepseek-pdf-exporter=\"true\"]"
      );

      const currentStatus = document.documentElement.getAttribute(
        "data-deepseek-pdf-exporter-ready"
      );

      if (currentStatus === "error") {
        cleanup();
        this.pdfExporterLoadPromise = null;
        reject(
          new Error(
            "PDFExporter previously failed to initialize. Reload the page."
          )
        );
        return;
      }

      if (!existingScript) {
        const script = document.createElement("script");
        script.src = chrome.runtime.getURL("pdf-exporter.js");
        script.dataset.deepseekPdfExporter = "true";
        script.onerror = () => {
          cleanup();
          this.pdfExporterLoadPromise = null;
          reject(new Error("Failed to load pdf-exporter.js script"));
        };
        document.head.appendChild(script);
      }
    });

    this.pdfExporterLoadPromise = this.pdfExporterLoadPromise.catch((error) => {
      this.pdfExporterLoadPromise = null;
      throw error;
    });

    return this.pdfExporterLoadPromise;
  }

  async requestPDFGeneration(data) {
    const requestId = `pdf-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    return new Promise((resolve, reject) => {
      const cleanup = (timeoutId) => {
        window.removeEventListener(
          "deepseek-exporter:pdf-success",
          onSuccess,
          true
        );
        window.removeEventListener(
          "deepseek-exporter:pdf-error",
          onError,
          true
        );
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      };

      const onSuccess = (event) => {
        if (!event || !event.detail || event.detail.id !== requestId) {
          return;
        }
        cleanup(timeoutId);
        resolve();
      };

      const onError = (event) => {
        if (!event || !event.detail || event.detail.id !== requestId) {
          return;
        }
        cleanup(timeoutId);
        const message =
          (event.detail && event.detail.message) ||
          "An unknown error occurred during PDF export";
        reject(new Error(message));
      };

      const timeoutId = setTimeout(() => {
        cleanup(timeoutId);
        reject(new Error("PDF generation timed out"));
      }, 30000);

      window.addEventListener("deepseek-exporter:pdf-success", onSuccess, {
        capture: true
      });
      window.addEventListener("deepseek-exporter:pdf-error", onError, {
        capture: true
      });

      window.dispatchEvent(
        new CustomEvent("deepseek-exporter:generate-pdf", {
          detail: { id: requestId, data }
        })
      );
    });
  }

  cleanup() {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }

    if (this.exportButton) {
      this.exportButton.remove();
      this.exportButton = null;
    }

    if (this.modal) {
      this.modal.remove();
      this.modal = null;
    }
  }
}

// Initialize the exporter
new DeepSeekExporter();
