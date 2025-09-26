(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.DeepSeekMarkdown = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  const ELEMENT_NODE = typeof Node !== "undefined" ? Node.ELEMENT_NODE : 1;
  const TEXT_NODE = typeof Node !== "undefined" ? Node.TEXT_NODE : 3;

  const isElementNode = (node) => node && node.nodeType === ELEMENT_NODE;
  const isTextNode = (node) => node && node.nodeType === TEXT_NODE;

  const normalizeWhitespace = (value) =>
    value.replace(/\u00A0/g, " ").replace(/[ \t\f\v]+/g, " ");

  const collapseBlankLines = (value) =>
    value.replace(/\s+$/g, "").replace(/\n{3,}/g, "\n\n");

  const trimLines = (value) =>
    value
      .split("\n")
      .map((line) => line.replace(/[ \t]+$/g, ""))
      .join("\n");

  const convertChildren = (node, context) => {
    if (!node || !node.childNodes) return "";
    let result = "";
    for (const child of Array.from(node.childNodes)) {
      result += convertNode(child, context);
    }
    return result;
  };

  const appendList = (node, context, type) => {
    const listContext = type === "ol" ? { type, index: 0 } : { type };
    context.listStack.push(listContext);
    const content = convertChildren(node, context).replace(/\n{3,}/g, "\n\n");
    context.listStack.pop();
    return content ? `${content}\n` : "";
  };

  const handleBlockContainer = (node, context) => {
    const content = convertChildren(node, context).trim();
    return content ? `${content}\n\n` : "";
  };

  const handleInlineWrapper = (node, context) => convertChildren(node, context);

  const handleStrong = (node, context) => {
    const content = convertChildren(node, context).trim();
    return content ? `**${content}**` : "";
  };

  const handleEmphasis = (node, context) => {
    const content = convertChildren(node, context).trim();
    return content ? `*${content}*` : "";
  };

  const isInsidePreformatted = (node) => {
    if (!node || !node.parentElement || !node.parentElement.tagName) {
      return false;
    }
    return node.parentElement.tagName.toLowerCase() === "pre";
  };

  const handleCode = (node) => {
    if (isInsidePreformatted(node)) {
      return node.textContent || "";
    }
    const content = normalizeWhitespace(node.textContent || "").trim();
    return content ? `\`${content}\`` : "";
  };

  const handlePre = (node) => {
    const text = node.textContent || "";
    const cleaned = text.replace(/\r\n?/g, "\n").replace(/\n+$/g, "\n");
    const body = cleaned.trimEnd();
    return body
      ? `\n\n\*\*\*CODE_BLOCK_START\*\*\*\n${body}\n\*\*\*CODE_BLOCK_END\*\*\*\n\n`
      : "";
  };

  const handleBlockquote = (node, context) => {
    const inner = convertChildren(node, context).trim();
    if (!inner) return "";
    return (
      inner
        .split(/\n+/)
        .map((line) => `> ${line}`)
        .join("\n") + "\n\n"
    );
  };

  const handleListItem = (node, context) => {
    const currentList = context.listStack[context.listStack.length - 1];
    const indent = "  ".repeat(Math.max(0, context.listStack.length - 1));
    let prefix = "- ";
    if (currentList && currentList.type === "ol") {
      currentList.index = (currentList.index || 0) + 1;
      prefix = `${currentList.index}. `;
    }
    const content = convertChildren(node, context).trim();
    const nestedFix = content.replace(/\n(?!$)/g, `\n${indent}  `);
    return `${indent}${prefix}${nestedFix}\n`;
  };

  const handleAnchor = (node, context) => {
    const href = node.getAttribute ? node.getAttribute("href") : null;
    const content = convertChildren(node, context).trim() || href || "";
    if (!content) return "";
    if (!href) {
      return content;
    }
    return `[${content}](${href})`;
  };

  const handleImage = (node) => {
    const alt = normalizeWhitespace(
      node.getAttribute ? node.getAttribute("alt") || "" : ""
    );
    const src = node.getAttribute ? node.getAttribute("src") || "" : "";
    if (!src) return alt;
    return `![${alt}](${src})`;
  };

  const blockHandlers = {
    h1: (node, context) => {
      const content = convertChildren(node, context).trim();
      return content ? `# ${content}\n\n` : "";
    },
    h2: (node, context) => {
      const content = convertChildren(node, context).trim();
      return content ? `## ${content}\n\n` : "";
    },
    h3: (node, context) => {
      const content = convertChildren(node, context).trim();
      return content ? `### ${content}\n\n` : "";
    },
    h4: (node, context) => {
      const content = convertChildren(node, context).trim();
      return content ? `#### ${content}\n\n` : "";
    },
    h5: (node, context) => {
      const content = convertChildren(node, context).trim();
      return content ? `##### ${content}\n\n` : "";
    },
    h6: (node, context) => {
      const content = convertChildren(node, context).trim();
      return content ? `###### ${content}\n\n` : "";
    },
    p: handleBlockContainer,
    div: handleBlockContainer,
    section: handleBlockContainer,
    article: handleBlockContainer,
    header: handleBlockContainer,
    footer: handleBlockContainer,
    main: handleBlockContainer,
    figure: handleBlockContainer,
    blockquote: handleBlockquote,
    ul: (node, context) => appendList(node, context, "ul"),
    ol: (node, context) => appendList(node, context, "ol"),
    li: handleListItem,
    pre: handlePre,
  };

  const inlineHandlers = {
    br: () => "\n",
    strong: handleStrong,
    b: handleStrong,
    em: handleEmphasis,
    i: handleEmphasis,
    code: handleCode,
    a: handleAnchor,
    span: handleInlineWrapper,
    mark: handleInlineWrapper,
    small: handleInlineWrapper,
    label: handleInlineWrapper,
    hr: () => "\n\n---\n\n",
    img: handleImage,
  };

  const convertNode = (node, context) => {
    if (!node) return "";

    if (isTextNode(node)) {
      const text = node.textContent || "";
      return normalizeWhitespace(text);
    }

    if (!isElementNode(node)) {
      return "";
    }

    const tag = (node.tagName || "").toLowerCase();

    if (blockHandlers[tag]) {
      return blockHandlers[tag](node, context);
    }

    if (inlineHandlers[tag]) {
      return inlineHandlers[tag](node, context);
    }

    return convertChildren(node, context);
  };

  const finalize = (value) => {
    const replacedCodeBlocks = value.replace(
      /\n\n\*\*\*CODE_BLOCK_START\*\*\*\n([\s\S]*?)\n\*\*\*CODE_BLOCK_END\*\*\*\n\n/g,
      (match, code) => {
        const trimmed = code.replace(/\n$/, "");
        return `\n\n\`\`\`\n${trimmed}\n\`\`\`\n\n`;
      }
    );

    return collapseBlankLines(trimLines(replacedCodeBlocks)).trim();
  };

  const elementToMarkdown = (element) => {
    if (!element) return "";
    const context = { listStack: [] };
    const markdown = convertChildren(element, context);
    return finalize(markdown);
  };

  const htmlToMarkdown = (html) => {
    if (!html) return "";
    if (typeof document !== "undefined" && document.createElement) {
      const container = document.createElement("div");
      container.innerHTML = html;
      return elementToMarkdown(container);
    }
    return html
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  };

  const api = {
    elementToMarkdown,
    htmlToMarkdown,
  };

  if (typeof window !== "undefined") {
    window.DeepSeekMarkdown = api;
  }

  return api;
});
