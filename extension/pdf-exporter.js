/**
 * PDF Export bridge injected into the DeepSeek page context.
 */

(function () {
  const STATUS_ATTR = "data-deepseek-pdf-exporter-ready";
  const EVENTS = {
    READY: "deepseek-exporter:ready",
    LOAD_ERROR: "deepseek-exporter:load-error",
    REQUEST: "deepseek-exporter:generate-pdf",
    SUCCESS: "deepseek-exporter:pdf-success",
    ERROR: "deepseek-exporter:pdf-error",
  };

  const CURRENT_SCRIPT_SRC = (() => {
    if (document.currentScript && document.currentScript.src) {
      return document.currentScript.src;
    }

    const injectedScript = document.querySelector(
      'script[data-deepseek-pdf-exporter="true"]'
    );

    return injectedScript && injectedScript.src ? injectedScript.src : null;
  })();

  const LOCAL_JSPDF_URL = (() => {
    if (!CURRENT_SCRIPT_SRC) {
      return null;
    }

    try {
      const baseUrl = new URL(CURRENT_SCRIPT_SRC);
      baseUrl.pathname = baseUrl.pathname.replace(
        /\/pdf-exporter\.js$/,
        "/vendor/jspdf.umd.min.js"
      );
      baseUrl.search = "";
      baseUrl.hash = "";
      return baseUrl.toString();
    } catch (error) {
      console.error("Failed to resolve local jsPDF URL", error);
      return null;
    }
  })();

  let jsPDFConstructor = null;
  let jsPDFLoadingPromise = null;

  const setStatus = (value) => {
    if (!value) {
      document.documentElement.removeAttribute(STATUS_ATTR);
    } else {
      document.documentElement.setAttribute(STATUS_ATTR, value);
    }
  };

  const dispatch = (name, detail) => {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  };

  const resolveJsPDFConstructor = () => {
    const ctor = window.jsPDF || (window.jspdf && window.jspdf.jsPDF);

    if (!ctor) {
      throw new Error("jsPDF library loaded but constructor was not found");
    }

    jsPDFConstructor = ctor;
    return jsPDFConstructor;
  };

  const ensureJsPDF = () => {
    if (jsPDFConstructor) {
      return Promise.resolve(jsPDFConstructor);
    }

    if (!jsPDFLoadingPromise) {
      jsPDFLoadingPromise = new Promise((resolve, reject) => {
        try {
          resolve(resolveJsPDFConstructor());
          return;
        } catch (initialError) {
          if (!LOCAL_JSPDF_URL) {
            reject(
              new Error(
                "Unable to resolve local jsPDF asset URL from extension script"
              )
            );
            return;
          }

          let script = document.querySelector(
            'script[data-deepseek-jspdf="true"]'
          );

          if (script && script.src !== LOCAL_JSPDF_URL) {
            script.remove();
            script = null;
          }

          if (!script) {
            script = document.createElement("script");
            script.src = LOCAL_JSPDF_URL;
            script.dataset.deepseekJspdf = "true";
            document.head.appendChild(script);
          }

          const handleLoad = () => {
            script.removeEventListener("load", handleLoad, true);
            script.removeEventListener("error", handleError, true);
            try {
              resolve(resolveJsPDFConstructor());
            } catch (ctorError) {
              reject(ctorError);
            }
          };

          const handleError = () => {
            script.removeEventListener("load", handleLoad, true);
            script.removeEventListener("error", handleError, true);
            reject(new Error("Failed to load local jsPDF library"));
          };

          script.addEventListener("load", handleLoad, true);
          script.addEventListener("error", handleError, true);
        }
      });
    }

    return jsPDFLoadingPromise.catch((error) => {
      jsPDFLoadingPromise = null;
      throw error;
    });
  };

  const addWrappedText = (
    doc,
    text,
    x,
    y,
    maxWidth,
    fontSize = 12,
    options = {}
  ) => {
    const {
      align = "left",
      topMargin = 20,
      bottomMargin = 20,
      lineHeightFactor = 1.5,
      beforeSpacing = 0,
      afterSpacing = 0,
    } = options;

    doc.setFontSize(fontSize);

    const normalizedSegments = Array.isArray(text)
      ? text
      : String(text ?? "")
          .replace(/\r\n?/g, "\n")
          .split("\n");

    const textMetrics = doc.getTextDimensions("M");
    const computedLineHeight =
      textMetrics && textMetrics.h
        ? textMetrics.h * lineHeightFactor
        : fontSize * 0.5 * lineHeightFactor;

    const pageHeight = doc.internal.pageSize.getHeight();
    let cursorY = y + beforeSpacing;

    normalizedSegments.forEach((segment) => {
      const segmentText = segment ?? "";

      if (segmentText.trim().length === 0) {
        cursorY += computedLineHeight;
        return;
      }

      const wrappedLines = doc.splitTextToSize(segmentText, maxWidth);

      wrappedLines.forEach((line, index) => {
        if (cursorY > pageHeight - bottomMargin) {
          doc.addPage();
          cursorY = topMargin;
        }

        const isLastLine = index === wrappedLines.length - 1;
        const effectiveAlign =
          align === "justify" && !isLastLine ? "justify" : align;

        doc.text(line, x, cursorY, { maxWidth, align: effectiveAlign });
        cursorY += computedLineHeight;
      });

      cursorY += computedLineHeight * 0.25;
    });

    cursorY += afterSpacing;
    return cursorY;
  };

  const cleanTextForPDF = (text) => {
    if (!text) return "";

    return text
      .replace(/\r\n?/g, "\n")
      .replace(/[^\S\n]+/g, " ")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "")
      .replace(/\u00A0/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) {
      return "Unknown time";
    }

    try {
      const date = new Date(timestamp);
      if (Number.isNaN(date.getTime())) {
        return timestamp;
      }
      return date.toLocaleString();
    } catch (error) {
      return timestamp;
    }
  };

  const normalizeMessageContent = (message) => {
    if (!message) return "";

    if (
      Array.isArray(message.markdownBlocks) &&
      message.markdownBlocks.length
    ) {
      return message.markdownBlocks.join("\n\n");
    }

    if (
      typeof message.markdown === "string" &&
      message.markdown.trim().length
    ) {
      return message.markdown.trim();
    }

    if (typeof message.content === "string") {
      return message.content;
    }

    return "";
  };

  const generatePDFDocument = async (chatData) => {
    const JsPDF = await ensureJsPDF();
    const doc = new JsPDF();

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - 2 * margin;
    let currentY = margin;

    // Enhanced Header with better styling
    doc.setFont(undefined, "bold");
    doc.setTextColor(31, 41, 55); // DeepSeek blue color
    currentY = addWrappedText(
      doc,
      "DeepSeek Chat Export",
      margin,
      currentY + 10,
      contentWidth,
      22
    );

    // Enhanced Metadata with better formatting
    doc.setFont(undefined, "normal");
    doc.setTextColor(100, 100, 100);
    currentY += 8;
    currentY = addWrappedText(
      doc,
      `Exported: ${new Date(chatData.metadata.exportDate).toLocaleString()}`,
      margin,
      currentY,
      contentWidth,
      10
    );
    currentY = addWrappedText(
      doc,
      `Chat ID: ${chatData.metadata.chatId}`,
      margin,
      currentY,
      contentWidth,
      10
    );
    currentY = addWrappedText(
      doc,
      `Total Messages: ${chatData.messages.length}`,
      margin,
      currentY,
      contentWidth,
      10
    );

    // Enhanced Separator with styling
    currentY += 12;
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.line(margin, currentY, pageWidth - margin, currentY);
    currentY += 18;

    // Enhanced Messages with better styling
    for (let i = 0; i < chatData.messages.length; i++) {
      const message = chatData.messages[i];

      if (currentY > pageHeight - 120) {
        doc.addPage();
        currentY = margin;
      }

      // Enhanced Message Header with simplified styling
      currentY = addMessageHeader(doc, message, margin, currentY, contentWidth);

      // Enhanced Message Content with markdown rendering
      currentY += 8;
      doc.setFont(undefined, "normal");
      doc.setFontSize(11);
      doc.setTextColor(50, 50, 50); // Darker grey for better readability

      const sourceContent = cleanTextForPDF(normalizeMessageContent(message));
      const cleanContent = renderMarkdown(sourceContent);
      currentY = addWrappedText(
        doc,
        cleanContent,
        margin + 5,
        currentY,
        contentWidth - 5,
        11,
        {
          align: "justify",
          lineHeightFactor: 1.55,
        }
      );

      // Enhanced Thinking Process display with grey background
      if (message.hasThinking && message.thinkingContent) {
        currentY = addThinkingContent(
          doc,
          message.thinkingContent,
          margin,
          currentY,
          contentWidth
        );
      }

      currentY += 12;

      // Enhanced Separator between messages
      if (i < chatData.messages.length - 1) {
        doc.setDrawColor(230, 230, 230);
        doc.setLineWidth(0.3);
        doc.line(margin + 5, currentY, pageWidth - margin - 5, currentY);
        currentY += 12;
      }
    }

    // Enhanced Footer with better styling
    addFooter(doc, pageWidth, pageHeight, margin);

    const filename = `deepseek-chat-${chatData.metadata.chatId}-${new Date()
      .toISOString()
      .slice(0, 10)}.pdf`;
    doc.save(filename);
  };

  // Add message header with custom icons and styling
  const addMessageHeader = (doc, message, margin, currentY, contentWidth) => {
    doc.setFont(undefined, "bold");
    doc.setFontSize(13);

    // Set custom icon and color based on message type
    const isUser = message.type === "user";
    doc.setTextColor(isUser ? 41 : 235, isUser ? 98 : 87, isUser ? 255 : 87);
    const authorLabel =
      (message.author && message.author.trim().length > 0
        ? message.author
        : isUser
        ? "User"
        : "DeepSeek AI") + ` (${formatTimestamp(message.timestamp)})`;

    currentY = addWrappedText(
      doc,
      authorLabel,
      margin,
      currentY,
      contentWidth,
      13,
      {
        lineHeightFactor: 1.3,
      }
    );

    // Add subtle separator line under header
    currentY += 3;
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.2);
    doc.line(margin, currentY, margin + contentWidth, currentY);
    currentY += 5;

    return currentY;
  };

  // Add thinking content with enhanced grey background styling
  const addThinkingContent = (
    doc,
    thinkingContent,
    margin,
    currentY,
    contentWidth
  ) => {
    currentY += 8;

    // Add background for thinking content
    const sanitizedThinking = renderMarkdown(cleanTextForPDF(thinkingContent));
    if (!sanitizedThinking) {
      return currentY;
    }

    doc.setFontSize(9);
    const lineHeight = doc.getTextDimensions("M").h * 1.4;
    const labelHeight = lineHeight * 1.1;
    const bodyLines = doc.splitTextToSize(sanitizedThinking, contentWidth - 20);
    const padding = 6;
    const boxHeight = labelHeight + bodyLines.length * lineHeight + padding;
    const pageHeight = doc.internal.pageSize.getHeight();
    const bottomMargin = 20;

    if (currentY + boxHeight + padding > pageHeight - bottomMargin) {
      doc.addPage();
      currentY = 20;
    }

    // Draw light grey background with rounded corners effect
    doc.setFillColor(245, 245, 245); // Very light grey background
    doc.rect(margin + 3, currentY, contentWidth - 6, boxHeight, "F");

    // Add border for thinking area
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.1);
    doc.rect(margin + 3, currentY, contentWidth - 6, boxHeight, "S");

    // Add thinking text with enhanced styling
    doc.setFont(undefined, "bold");
    doc.setTextColor(80, 80, 80);
    const labelY = currentY + padding + lineHeight;
    doc.text("Thinking Process:", margin + 8, labelY, {
      maxWidth: contentWidth - 20,
    });

    doc.setFont(undefined, "italic");
    doc.setTextColor(120, 120, 120);
    let textY = labelY + lineHeight;

    bodyLines.forEach((line, index) => {
      const align =
        bodyLines.length > 1 && index < bodyLines.length - 1
          ? "justify"
          : "left";
      doc.text(line, margin + 8, textY, {
        maxWidth: contentWidth - 20,
        align,
      });
      textY += lineHeight;
    });

    doc.setTextColor(50, 50, 50);
    doc.setFont(undefined, "normal");
    doc.setFontSize(11);

    return textY + padding;
  };

  // Simple markdown renderer for enhanced text display
  const renderMarkdown = (text) => {
    if (!text) return "";

    let processed = text.replace(/\r\n?/g, "\n");

    processed = processed.replace(/```([\s\S]*?)```/g, (_, code) => {
      return code
        .split("\n")
        .map((line) => `    ${line}`)
        .join("\n");
    });

    processed = processed.replace(/\*\*(.*?)\*\*/g, "$1");
    processed = processed.replace(/__(.*?)__/g, "$1");
    processed = processed.replace(/\*(.*?)\*/g, "$1");
    processed = processed.replace(/_(.*?)_/g, "$1");
    processed = processed.replace(/~~(.*?)~~/g, "$1");
    processed = processed.replace(/`([^`]+)`/g, "$1");

    processed = processed.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");
    processed = processed.replace(/^#{1,6}\s+(.*)$/gm, "$1");
    processed = processed.replace(/^-\s+(.*)$/gm, "• $1");
    processed = processed.replace(
      /^(\d+)\.\s+(.*)$/gm,
      (_, index, value) => `${index}. ${value}`
    );
    processed = processed.replace(/^>\s+(.*)$/gm, '"$1"');
    processed = processed.replace(/^[-*_]{3,}\s*$/gm, "");

    return processed.replace(/\n{3,}/g, "\n\n").trim();
  };

  // Add enhanced footer with better styling
  const addFooter = (doc, pageWidth, pageHeight, margin) => {
    const pageCount = doc.internal.getNumberOfPages();

    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setFont(undefined, "normal");
      doc.setTextColor(150, 150, 150);

      // Add separator line above footer
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.3);
      doc.line(margin, pageHeight - 18, pageWidth - margin, pageHeight - 18);

      const footerY = pageHeight - 10;
      const linkText = "DeepSeek Chat Exporter";
      const linkWidth = doc.getTextWidth(linkText);
      const linkX = (pageWidth - linkWidth) / 2;

      doc.setTextColor(41, 98, 255);
      doc.textWithLink(linkText, linkX, footerY, {
        url: "https://github.com/RimunAce/Deepseek-Chat-Exporter",
      });

      doc.setTextColor(150, 150, 150);
      doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, footerY, {
        align: "right",
      });
    }
  };

  const handleGenerationRequest = async (event) => {
    const detail = event.detail || {};
    const { id, data } = detail;

    if (!id) {
      return;
    }

    try {
      if (!data || !data.metadata || !Array.isArray(data.messages)) {
        throw new Error("Invalid chat data received for PDF export");
      }

      await generatePDFDocument(data);
      dispatch(EVENTS.SUCCESS, { id });
    } catch (error) {
      dispatch(EVENTS.ERROR, { id, message: error.message || String(error) });
    }
  };

  const initialize = async () => {
    try {
      setStatus("loading");
      await ensureJsPDF();
      setStatus("true");
      dispatch(EVENTS.READY);
    } catch (error) {
      setStatus("error");
      dispatch(EVENTS.LOAD_ERROR, { message: error.message || String(error) });
    }
  };

  window.addEventListener(EVENTS.REQUEST, handleGenerationRequest);
  initialize();
})();
