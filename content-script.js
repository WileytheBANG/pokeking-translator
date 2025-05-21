let translated = false;
let observer = null;

(async () => {
  const dictionary = await fetch(chrome.runtime.getURL("dictionary.json"))
    .then(res => res.json());

  const ATTR = "__original_text";

  function getAllStaticTextElements(root = document.body) {
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
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
    const patterns = Object.keys(dictionary).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`(${patterns.join("|")})`, "g");

    nodes.forEach(node => {
      const originalText = node.nodeValue;
      if (!regex.test(originalText)) return;

      // Prevent double translation
      if (node.parentNode?.dataset?.[ATTR]) return;

      const replacedText = originalText.replace(regex, match => dictionary[match] || match);

      const span = document.createElement("span");
      span.dataset[ATTR] = originalText;
      span.textContent = replacedText;

      node.parentNode.replaceChild(span, node);
    });

    translated = true;
  }

  function restoreOriginals() {
    document.querySelectorAll(`span[data-${ATTR}]`).forEach(span => {
      const originalText = span.dataset[ATTR];
      const textNode = document.createTextNode(originalText);
      span.parentNode.replaceChild(textNode, span);
    });

    translated = false;
  }

  function activateObserver() {
    if (observer) observer.disconnect();

    observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.TEXT_NODE) {
            replaceKeywords([node]);
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            const textNodes = getAllStaticTextElements(node);
            replaceKeywords(textNodes);
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function applyInitialTranslationWithDelay() {
    setTimeout(() => {
      const nodes = getAllStaticTextElements();
      replaceKeywords(nodes);
      activateObserver();
    }, 2000); // 2 second delay after page load
  }

  // Start everything
  applyInitialTranslationWithDelay();

  // Toggle handler
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "TOGGLE_TRANSLATION") {
      if (translated) {
        restoreOriginals();
        if (observer) observer.disconnect();
      } else {
        const nodes = getAllStaticTextElements();
        replaceKeywords(nodes);
        activateObserver();
      }
    }
  });
})();
