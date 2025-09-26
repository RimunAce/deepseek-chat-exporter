/* eslint-disable complexity, max-lines, max-statements, sonarjs/cognitive-complexity */
/**
 * DeepSeek Exporter Test Validation
 * Run this in the browser console on DeepSeek chat page to test functionality
 */

function validateDeepSeekExporter() {
  console.log("🧪 DeepSeek Exporter Validation Starting...");

  const results = {
    extensionLoaded: false,
    buttonInjected: false,
    modalWorks: false,
    dataExtraction: false,
    exportCapabilities: false,
    messageParsing: null,
    errors: [],
  };

  try {
    // Test 1: Check if content script is loaded
    if (
      typeof DeepSeekExporter !== "undefined" ||
      document.querySelector(".deepseek-export-button")
    ) {
      results.extensionLoaded = true;
      console.log("✅ Extension loaded successfully");
    } else {
      results.errors.push("Extension not loaded or not running on this page");
      console.log("❌ Extension not loaded");
    }

    // Test 2: Check if export button is injected
    const exportButton = document.querySelector(".deepseek-export-button");
    if (exportButton) {
      results.buttonInjected = true;
      console.log("✅ Export button found in DOM");

      // Test 3: Try to trigger modal
      exportButton.click();
      setTimeout(() => {
        const modal = document.querySelector(".deepseek-export-modal");
        if (modal) {
          results.modalWorks = true;
          console.log("✅ Export modal opens correctly");

          // Close modal
          const cancelBtn = modal.querySelector("#cancel-export");
          if (cancelBtn) cancelBtn.click();
        } else {
          results.errors.push("Modal does not open when button is clicked");
          console.log("❌ Modal does not open");
        }
      }, 500);
    } else {
      results.errors.push("Export button not found in DOM");
      console.log("❌ Export button not found");
    }

    // Test 4: Check data extraction capabilities
    const messageElements = document.querySelectorAll(
      '.ds-message, [class*="message"], div'
    );
    const textContent = Array.from(messageElements)
      .map((el) => el.textContent.trim())
      .filter((text) => text.length > 50);

    if (textContent.length > 0) {
      results.dataExtraction = true;
      console.log(`✅ Found ${textContent.length} potential message elements`);
    } else {
      results.errors.push("No extractable content found on page");
      console.log("❌ No extractable content found");
    }

    // Test 6: Validate message parsing heuristics for thinking content and roles
    const parsingCheck = runMessageParsingSmokeTest();
    if (parsingCheck.passed) {
      results.messageParsing = true;
      console.log("✅ Message parsing heuristics validated");
    } else if (parsingCheck.warning) {
      results.messageParsing = null;
      console.log(`⚠️ Message parsing check skipped: ${parsingCheck.warning}`);
    } else {
      results.messageParsing = false;
      results.errors.push(
        parsingCheck.error || "Message parsing validation failed"
      );
      console.log("❌ Message parsing heuristics failed");
    }

    // Test 5: Check export capabilities
    if (typeof chrome !== "undefined" && chrome.runtime) {
      results.exportCapabilities = true;
      console.log("✅ Chrome extension APIs available");
    } else {
      results.errors.push("Chrome extension APIs not available");
      console.log("❌ Chrome extension APIs not available");
    }
  } catch (error) {
    results.errors.push(`Validation error: ${error.message}`);
    console.error("❌ Validation failed:", error);
  }

  // Summary
  console.log("\n📋 Validation Summary:");
  console.log("Extension Loaded:", results.extensionLoaded ? "✅" : "❌");
  console.log("Button Injected:", results.buttonInjected ? "✅" : "❌");
  console.log("Modal Works:", results.modalWorks ? "✅" : "❌");
  console.log("Data Extraction:", results.dataExtraction ? "✅" : "❌");
  const parsingStatus =
    results.messageParsing === true
      ? "✅"
      : results.messageParsing === null
      ? "⚠️"
      : "❌";
  console.log("Message Parsing:", parsingStatus);
  console.log("Export APIs:", results.exportCapabilities ? "✅" : "❌");

  if (results.errors.length > 0) {
    console.log("\n🐛 Errors Found:");
    results.errors.forEach((error) => console.log(`  - ${error}`));
  }

  const booleanResults = [
    results.extensionLoaded,
    results.buttonInjected,
    results.modalWorks,
    results.dataExtraction,
    results.messageParsing,
    results.exportCapabilities,
  ].filter((v) => typeof v === "boolean");

  const passedTests = booleanResults.filter((v) => v === true).length;
  const totalTests = booleanResults.length;

  console.log(`\n🎯 Score: ${passedTests}/${totalTests} tests passed`);

  if (passedTests === totalTests) {
    console.log("🎉 All tests passed! Extension is working correctly.");
  } else if (passedTests >= 3) {
    console.log(
      "⚠️ Most tests passed. Extension should work with minor issues."
    );
  } else {
    console.log("🚨 Multiple tests failed. Extension may not work properly.");
  }

  return results;
}

// Auto-run validation if this script is loaded
if (document.readyState === "complete") {
  setTimeout(validateDeepSeekExporter, 2000);
} else {
  window.addEventListener("load", () => {
    setTimeout(validateDeepSeekExporter, 2000);
  });
}

function runMessageParsingSmokeTest() {
  if (typeof DeepSeekExporter === "undefined") {
    return {
      passed: false,
      error: "DeepSeekExporter class is not available in the page context",
    };
  }

  const exporter = Object.create(DeepSeekExporter.prototype);

  // Helper to safely parse a message element
  const parseElement = (element) => {
    try {
      return exporter.parseMessage(element);
    } catch (err) {
      return { error: err };
    }
  };

  const allMessages = Array.from(
    document.querySelectorAll(".ds-message, [class*='ds-message']")
  );

  if (allMessages.length === 0) {
    return {
      passed: false,
      error: "No chat message elements found for parsing validation",
    };
  }

  const assistantWithThinking = allMessages.find((el) =>
    el.querySelector(".ds-think-content, [class*='think-content']")
  );

  if (!assistantWithThinking) {
    return {
      passed: false,
      warning:
        "No assistant messages with thinking content present; skipping parsing verification",
    };
  }

  const parsedAssistant = parseElement(assistantWithThinking);
  if (!parsedAssistant || parsedAssistant.error) {
    return {
      passed: false,
      error: "Failed to parse assistant message with thinking content",
    };
  }

  const assistantChecksPassed =
    parsedAssistant.type === "assistant" &&
    parsedAssistant.hasThinking === true &&
    parsedAssistant.thinkingContent &&
    !parsedAssistant.content.includes("Thought for");

  if (!assistantChecksPassed) {
    return {
      passed: false,
      error:
        "Assistant message parsing did not separate thinking content correctly",
    };
  }

  const probableUserMessage = allMessages.find(
    (el) =>
      el.classList.contains("d29f3d7d") ||
      !el.querySelector(".ds-think-content")
  );

  if (!probableUserMessage) {
    return {
      passed: false,
      warning: "No clear user message detected; skipping role verification",
    };
  }

  const parsedUser = parseElement(probableUserMessage);
  if (!parsedUser || parsedUser.error) {
    return {
      passed: false,
      error: "Failed to parse user message for role detection",
    };
  }

  if (parsedUser.type !== "user") {
    return {
      passed: false,
      error: "User message was not classified with type 'user'",
    };
  }

  return { passed: true };
}

/**
 * Test function to validate PDF export functionality fixes
 */
async function testPDFExportFix() {
  console.log("🔧 Testing PDF export fix...");

  try {
    const readyAttr = document.documentElement.getAttribute(
      "data-deepseek-pdf-exporter-ready"
    );

    if (readyAttr !== "true") {
      console.log("Injecting PDF exporter bridge script for testing...");
      const existingScript = document.querySelector(
        'script[data-deepseek-pdf-exporter="true"]'
      );

      if (!existingScript) {
        const script = document.createElement("script");
        script.src = chrome.runtime.getURL("pdf-exporter.js");
        script.dataset.deepseekPdfExporter = "true";
        document.head.appendChild(script);
      }

      await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          window.removeEventListener("deepseek-exporter:ready", onReady, true);
          window.removeEventListener(
            "deepseek-exporter:load-error",
            onError,
            true
          );
          reject(new Error("Timed out waiting for PDF bridge to initialize"));
        }, 10000);

        const onReady = () => {
          clearTimeout(timeoutId);
          window.removeEventListener("deepseek-exporter:ready", onReady, true);
          window.removeEventListener(
            "deepseek-exporter:load-error",
            onError,
            true
          );
          resolve();
        };

        const onError = (event) => {
          clearTimeout(timeoutId);
          window.removeEventListener("deepseek-exporter:ready", onReady, true);
          window.removeEventListener(
            "deepseek-exporter:load-error",
            onError,
            true
          );
          const message =
            (event && event.detail && event.detail.message) ||
            "Unknown bridge loading error";
          reject(new Error(message));
        };

        window.addEventListener("deepseek-exporter:ready", onReady, {
          once: true,
          capture: true,
        });
        window.addEventListener("deepseek-exporter:load-error", onError, {
          once: true,
          capture: true,
        });
      });
    } else {
      console.log("PDF exporter bridge already initialized.");
    }

    console.log(
      "Dispatching PDF generation request (this will download a test PDF)..."
    );

    const requestId = `test-${Date.now().toString(36)}`;
    const result = new Promise((resolve, reject) => {
      const cleanup = () => {
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
      };

      const onSuccess = (event) => {
        const detail = event && event.detail;
        if (!detail || detail.id !== requestId) {
          return;
        }
        cleanup();
        resolve();
      };

      const onError = (event) => {
        const detail = event && event.detail;
        if (!detail || detail.id !== requestId) {
          return;
        }
        cleanup();
        const message = detail.message || "Unknown PDF generation error";
        reject(new Error(message));
      };

      window.addEventListener("deepseek-exporter:pdf-success", onSuccess, {
        capture: true,
      });
      window.addEventListener("deepseek-exporter:pdf-error", onError, {
        capture: true,
      });

      const sampleData = {
        metadata: {
          exportDate: new Date().toISOString(),
          chatId: "test",
        },
        messages: [
          {
            id: "sample-user",
            type: "user",
            content: "Hello, can you summarize our conversation?",
            timestamp: new Date().toISOString(),
            hasThinking: false,
          },
          {
            id: "sample-ai",
            type: "assistant",
            content: "Sure! Here's a concise summary of our chat...",
            timestamp: new Date().toISOString(),
            hasThinking: true,
            thinkingContent:
              "Analyzing the conversation and extracting the main points...",
          },
        ],
      };

      window.dispatchEvent(
        new CustomEvent("deepseek-exporter:generate-pdf", {
          detail: { id: requestId, data: sampleData },
        })
      );
    });

    await result;

    console.log("✅ PDF exporter bridge responded successfully!");
    return true;
  } catch (error) {
    console.error("❌ PDF export fix test failed:", error);
    return false;
  }
}

console.log(
  "DeepSeek Exporter Validation Script Loaded. Run validateDeepSeekExporter() to test basic functionality, or testPDFExportFix() to test the PDF fix."
);
