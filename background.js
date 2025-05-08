chrome.action.onClicked.addListener(async (tab) => {
  const dictionary = await fetch(chrome.runtime.getURL("dictionary.json"))
    .then(res => res.json());

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    args: [dictionary],
    func: (DICT) => {
      const ATTR = "__original_text";

      function getAllStaticTextElements() {
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: (node) => {
              if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
              const parent = node.parentElement;
              const style = window.getComputedStyle(parent);
              if (style.visibility === 'hidden' || style.display === 'none') return NodeFilter.FILTER_REJECT;
              return NodeFilter.FILTER_ACCEPT;
            }
          }
        );

        const textNodes = [];
        while (walker.nextNode()) {
          textNodes.push(walker.currentNode);
        }

        return textNodes;
      }

      function replaceKeywords(nodes) {
        const patterns = Object.keys(DICT).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const regex = new RegExp(`(${patterns.join("|")})`, "g");

        nodes.forEach(node => {
          const originalText = node.nodeValue;
          if (!regex.test(originalText)) return;

          const replacedText = originalText.replace(regex, match => DICT[match] || match);

          // Store original in dataset
          const span = document.createElement("span");
          span.dataset[ATTR] = originalText;
          span.textContent = replacedText;

          node.parentNode.replaceChild(span, node);
        });
      }

      function restoreOriginals() {
        document.querySelectorAll(`span[data-${ATTR}]`).forEach(span => {
          const originalText = span.dataset[ATTR];
          const textNode = document.createTextNode(originalText);
          span.parentNode.replaceChild(textNode, span);
        });
      }

      if (window.__replacedKeywordToggle) {
        restoreOriginals();
        window.__replacedKeywordToggle = false;
      } else {
        const nodes = getAllStaticTextElements();
        replaceKeywords(nodes);
        window.__replacedKeywordToggle = true;
      }
    }
  });
});
