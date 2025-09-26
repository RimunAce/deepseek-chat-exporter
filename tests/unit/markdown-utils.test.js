const assert = require("assert");

global.window = {};

const { elementToMarkdown } = require("../../extension/markdown-utils.js");

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

const createTextNode = (text) => ({
  nodeType: TEXT_NODE,
  textContent: text,
  parentElement: null,
  childNodes: [],
  querySelectorAll() {
    return [];
  }
});

const createElementNode = (tag, children = [], attributes = {}) => {
  const node = {
    nodeType: ELEMENT_NODE,
    tagName: tag.toUpperCase(),
    childNodes: [],
    parentElement: null,
    attributes: Object.entries(attributes).map(([name, value]) => ({
      name,
      value
    })),
    getAttribute(name) {
      const attr = this.attributes.find((item) => item.name === name);
      return attr ? attr.value : null;
    },
    querySelectorAll(selector) {
      const target = selector.toUpperCase();
      const matches = [];

      const visit = (current) => {
        if (!current || current.nodeType !== ELEMENT_NODE) {
          return;
        }

        if (current.tagName && current.tagName.toUpperCase() === target) {
          matches.push(current);
        }

        if (current.childNodes) {
          current.childNodes.forEach((child) => visit(child));
        }
      };

      visit(node);
      return matches;
    }
  };

  node.childNodes = children.map((child) => {
    if (typeof child === "string") {
      return createTextNode(child);
    }
    return child;
  });

  return node;
};

const assignParents = (node, parent = null) => {
  if (!node) return;
  node.parentElement = parent;
  if (node.childNodes) {
    node.childNodes.forEach((child) => assignParents(child, node));
  }
};

const headingSample = createElementNode("div", [
  createElementNode("h2", ["Chapter 2: Ghosts and Gears"]),
  createElementNode("p", [
    "The return journey felt longer than the outward trek. The silence within the trio was heavier, " +
    "charged with the lingering echo of crystalline claws and the spectral imprint on 850W's thermal sensors."
  ]),
  createElementNode("p", [
    "The airlock cycle this time was a ritual of decontamination. Jets of pressurized solvent hissed over " +
    "their chassis, scouring away radioactive dust and crystalline shards."
  ])
]);
assignParents(headingSample);

const headingMarkdown = elementToMarkdown(headingSample);
assert(headingMarkdown.includes("Chapter 2: Ghosts and Gears"));
assert(
  headingMarkdown.includes(
    "The return journey felt longer than the outward trek."
  )
);
assert(
  headingMarkdown.includes(
    "\n\nThe airlock cycle this time was a ritual of decontamination."
  )
);

const listSample = createElementNode("ul", [
  createElementNode("li", ["First item"]),
  createElementNode("li", ["Second item"]),
  createElementNode("li", [createElementNode("strong", ["Bold detail"])])
]);
assignParents(listSample);

const listMarkdown = elementToMarkdown(listSample);
assert(listMarkdown.includes("- First item"));
assert(listMarkdown.includes("- Second item"));
assert(listMarkdown.includes("- **Bold detail**"));

const nestedSample = createElementNode("div", [
  createElementNode("p", [
    "Visit ",
    createElementNode("a", ["DeepSeek"], { href: "https://chat.deepseek.com" }),
    " for more details."
  ])
]);
assignParents(nestedSample);
const nestedMarkdown = elementToMarkdown(nestedSample);
assert(nestedMarkdown.includes("[DeepSeek](https://chat.deepseek.com)"));

console.log("Markdown conversion tests passed.");
