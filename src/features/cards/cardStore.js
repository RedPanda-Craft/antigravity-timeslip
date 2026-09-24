  // --------------------------------------------------------------------------
  // Feature: Timeslip Context Cards - Storage, Sanitization & State Engine
  // --------------------------------------------------------------------------

  const STORAGE_CARDS_KEY = "__bg_timeslip_cards_v1";
  const LEGACY_CARDS_KEY_V1 = "__bg_voyager_cards_v1";
  const LEGACY_STORAGE_CARDS_KEY = "__bg_side_chat_cards_v1";
  const STORAGE_RECENT_BTW_KEY = "__bg_side_questions_recent_v1";
  const MAX_CARDS = 60;
  const MAX_RECENT_BTW = 25;

  let timeslipCards = [];
  let recentBtw = [];
  const cardChangeListeners = new Set();

  function notifyCardsChange() {
    cardChangeListeners.forEach((fn) => {
      try {
        fn(timeslipCards);
      } catch (err) {
        plugin.log?.warn?.(`[CARDS_NOTIFY_ERR] ${err.message}`);
      }
    });
  }

  function sanitizeCardContent(text) {
    let clean = String(text || "")
      .replace(/\/\*[\s\S]*?\*\//g, "") // Strip CSS block comments
      .replace(/@media[^{]*\{[\s\S]*?\}\s*\}/g, "") // Strip nested @media CSS blocks
      .replace(/@media[^{]*\{[\s\S]*?\}/g, "") // Strip single @media CSS blocks
      .replace(/\.markdown-alert[^{]*\{[\s\S]*?\}/g, "") // Strip .markdown-alert styles
      .replace(/--color-[a-z0-9-]+:[^;]+;/g, "") // Strip CSS variable declarations
      .replace(/<context_card[^>]*>([\s\S]*?)<\/context_card>/gi, "$1") // Strip any legacy <context_card> tags
      .replace(/---\s*\n+\[Task Instruction\]:\s*/gi, "") // Strip legacy separators
      .replace(/\n{3,}/g, "\n\n") // Normalize excessive blank lines
      .trim();

    clean = clean.replace(/^\[Side Question\]:\s*(.*?)\n+\[Key Points\]:\s*/i, "Context Note: $1\n\n");
    return clean;
  }

  function loadCards() {
    let list = null;
    // 1. Primary: BetterGravity physical disk storage
    try {
      const diskData = plugin.storage?.get?.("cards", null);
      if (Array.isArray(diskData) && diskData.length > 0) {
        list = diskData;
      }
    } catch (_) {}

    // 2. Secondary: Primary Timeslip localStorage
    if (!list) {
      try {
        const raw = localStorage.getItem(STORAGE_CARDS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) list = parsed;
        }
      } catch (_) {}
    }

    // 3. Fallback / Migration: Legacy storage
    if (!list) {
      for (const legacyKey of [LEGACY_CARDS_KEY_V1, LEGACY_STORAGE_CARDS_KEY]) {
        try {
          const raw = localStorage.getItem(legacyKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) {
              list = parsed;
              try {
                plugin.storage?.set?.("cards", list);
              } catch (_) {}
              break;
            }
          }
        } catch (_) {}
      }
    }

    if (!Array.isArray(list)) list = [];

    // Sanitize and ensure consistent fields
    return list.map((c) => {
      const clean = sanitizeCardContent(c.content);
      return {
        id: c.id || `card_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title: c.title || "Context Note",
        content: clean,
        tags: Array.isArray(c.tags) && c.tags.length > 0 ? c.tags : ["context"],
        isPinned: Boolean(c.isPinned),
        timestamp: c.timestamp || Date.now(),
        origin: c.origin || {
          conversationId: "unknown",
          source: "manual",
          timestamp: c.timestamp || Date.now()
        }
      };
    });
  }

  let saveCardsDebounceTimer = null;
  function saveCards(list, immediate = false) {
    timeslipCards = (Array.isArray(list) ? list : []).slice(-MAX_CARDS);
    notifyCardsChange();

    if (immediate) {
      clearTimeout(saveCardsDebounceTimer);
      flushSaveCards();
      return;
    }
    clearTimeout(saveCardsDebounceTimer);
    saveCardsDebounceTimer = setTimeout(flushSaveCards, 300);
  }

  function flushSaveCards() {
    try {
      plugin.storage?.set?.("cards", timeslipCards);
    } catch (err) {
      plugin.log?.warn?.(`[STORAGE_WARN] Failed to save cards to disk: ${err.message}`);
    }
    try {
      localStorage.setItem(STORAGE_CARDS_KEY, JSON.stringify(timeslipCards));
    } catch (err) {
      plugin.log?.warn?.(`[STORAGE_WARN] Failed to save cards to localStorage: ${err.message}`);
    }
  }

  function sortCardsPinnedFirst(cardList) {
    return [...cardList].sort((a, b) => {
      if (Boolean(a.isPinned) !== Boolean(b.isPinned)) {
        return a.isPinned ? -1 : 1;
      }
      return (b.timestamp || 0) - (a.timestamp || 0);
    });
  }

  function collectAllCardTags(cardList) {
    const set = new Set();
    for (const c of cardList) {
      if (Array.isArray(c.tags)) {
        for (const t of c.tags) {
          const clean = String(t).trim().toLowerCase();
          if (clean) set.add(clean);
        }
      }
    }
    return Array.from(set).sort();
  }

  function addCard(rawContent, title = "", origin = null, tags = ["context"]) {
    const clean = sanitizeCardContent(rawContent);
    if (!clean) return null;

    let displayTitle = title ? String(title).trim() : "";
    if (!displayTitle) {
      const firstLine = clean.split("\n")[0].replace(/^[#*\-•\s💡🗂️]+/, "").trim();
      displayTitle = firstLine.length > 28 ? `${firstLine.slice(0, 28)}...` : firstLine || "Context Note";
    }

    const newCard = {
      id: `card_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: displayTitle,
      content: clean,
      tags: Array.isArray(tags) && tags.length > 0 ? tags : ["context"],
      isPinned: false,
      timestamp: Date.now(),
      origin: origin || {
        conversationId: getCurrentConversationId(),
        source: "manual",
        timestamp: Date.now()
      }
    };

    timeslipCards.unshift(newCard);
    saveCards(timeslipCards);
    showToast(`Saved card: "${displayTitle}"`, "success");
    return newCard;
  }

  function deleteCard(cardId) {
    const prevLen = timeslipCards.length;
    timeslipCards = timeslipCards.filter((c) => c.id !== cardId);
    if (timeslipCards.length !== prevLen) {
      saveCards(timeslipCards);
      showToast("Card deleted", "info");
    }
  }

  function togglePinCard(cardId) {
    const target = timeslipCards.find((c) => c.id === cardId);
    if (target) {
      target.isPinned = !target.isPinned;
      saveCards(timeslipCards);
    }
  }

  function formatRelativeTime(ts) {
    if (!ts) return "";
    const now = Date.now();
    const diff = Math.max(0, now - ts);
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return "Just now";
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day}d ago`;
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  function loadRecentBtw() {
    let list = null;
    // 1. Primary: BetterGravity physical disk storage
    try {
      const diskData = plugin.storage?.get?.("recent_btw", null);
      if (Array.isArray(diskData) && diskData.length > 0) {
        list = diskData;
      }
    } catch (_) {}

    // 2. Fallback: side-chat plugin storage in storage.json or localStorage
    if (!list) {
      try {
        const raw = localStorage.getItem(STORAGE_RECENT_BTW_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            list = parsed;
          }
        }
      } catch (_) {}
    }

    if (!Array.isArray(list)) list = [];

    return list.map((it) => ({
      id: it.id || `recent_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: it.title || "Side Note",
      question: it.question || "",
      content: sanitizeCardContent(it.content || ""),
      timestamp: it.timestamp || Date.now(),
      conversationId: it.conversationId || "default_convo",
      isPromoted: Boolean(it.isPromoted)
    }));
  }

  function saveRecentBtw(list) {
    const sliced = (Array.isArray(list) ? list : []).slice(0, MAX_RECENT_BTW);
    recentBtw = sliced;
    try {
      plugin.storage?.set?.("recent_btw", sliced);
    } catch (err) {
      plugin.log?.warn?.(`[STORAGE_WARN] Failed to save recent btw to disk: ${err.message}`);
    }
    try {
      localStorage.setItem(STORAGE_RECENT_BTW_KEY, JSON.stringify(sliced));
    } catch (err) {
      plugin.log?.warn?.(`[STORAGE_WARN] Failed to save recent btw to localStorage: ${err.message}`);
    }
  }

  function pushToRecentBtw(fullQuestion, cleanAnswer, cid) {
    const q = String(fullQuestion || "").trim();
    const a = sanitizeCardContent(cleanAnswer || "");
    if (!q && !a) return;
    if (!a || a.startsWith("Thinking...") || a.includes("Thinking...")) return;

    let structuredContent = a;
    if (!structuredContent.toLowerCase().startsWith("side question:")) {
      structuredContent = q ? `Side Question: ${q}\n\n${a}` : a;
    }

    let recent = loadRecentBtw();
    const existingIdx = recent.findIndex(
      (it) => (q && it.question === q) || it.content === structuredContent
    );

    if (existingIdx !== -1) {
      if (recent[existingIdx].content === structuredContent) {
        return;
      }
      recent[existingIdx].content = structuredContent;
      recent[existingIdx].timestamp = Date.now();
    } else {
      let title = q;
      if (title.length > 24) title = title.slice(0, 24) + "...";
      if (!title) {
        const firstLine = a.split("\n")[0].replace(/^[#*\-•\s💡🗂️]+/, "").trim();
        title = firstLine.length > 24 ? firstLine.slice(0, 24) + "..." : firstLine || "Side Note";
      }

      const newItem = {
        id: `recent_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title,
        question: q,
        content: structuredContent,
        timestamp: Date.now(),
        conversationId: cid || getCurrentConversationId(),
        isPromoted: false
      };
      recent.unshift(newItem);
    }

    // Enforce 25 items limit (FIFO with promotion immunity)
    if (recent.length > MAX_RECENT_BTW) {
      let removeIdx = -1;
      for (let i = recent.length - 1; i >= 0; i--) {
        if (!recent[i].isPromoted) {
          removeIdx = i;
          break;
        }
      }
      if (removeIdx !== -1) {
        recent.splice(removeIdx, 1);
      } else {
        recent.pop();
      }
    }

    saveRecentBtw(recent);
    if (typeof updateCardsPopoverCounts === "function") {
      updateCardsPopoverCounts();
    }
  }

  function promoteRecentToCard(item) {
    if (!item || item.isPromoted) return;

    const originMeta = {
      conversationId: item.conversationId || getCurrentConversationId(),
      anchorQuestion: item.question || item.title,
      source: "btw",
      timestamp: item.timestamp || Date.now()
    };

    const newCard = addCard(item.content, item.title, originMeta, ["btw"]);
    item.promotedCardId = newCard ? newCard.id : null;
    item.isPromoted = true;
    saveRecentBtw(recentBtw);
    if (typeof updateCardsPopoverCounts === "function") {
      updateCardsPopoverCounts();
    }
  }

  function unpromoteRecentCard(item) {
    if (!item || !item.isPromoted) return;

    const targetCardId = item.promotedCardId;
    if (targetCardId) {
      timeslipCards = timeslipCards.filter((c) => c.id !== targetCardId);
    } else {
      timeslipCards = timeslipCards.filter((c) => {
        const contentMatch = (c.content || "").trim() === (item.content || "").trim();
        const titleMatch = c.title === item.title;
        return !(contentMatch && titleMatch);
      });
    }
    saveCards(timeslipCards);

    item.isPromoted = false;
    delete item.promotedCardId;
    saveRecentBtw(recentBtw);

    if (typeof updateCardsPopoverCounts === "function") {
      updateCardsPopoverCounts();
    }
  }

  function clearRecentStash() {
    const unpromotedCount = recentBtw.filter((it) => !it.isPromoted).length;
    if (unpromotedCount === 0) return 0;
    recentBtw = recentBtw.filter((it) => it.isPromoted);
    saveRecentBtw(recentBtw);
    if (typeof updateCardsPopoverCounts === "function") {
      updateCardsPopoverCounts();
    }
    return unpromotedCount;
  }

  function harvestAndPersistSideQuestions() {
    const cid = getCurrentConversationId();
    if (!cid || cid === "default_convo") return;

    const sidePanels = document.querySelectorAll('[data-testid="side-question-panel"]');
    sidePanels.forEach((panel) => {
      const qEl = panel.querySelector('[data-testid="side-question-question"]');
      const userText = (qEl?.textContent || "").replace(/^Side Question:\s*(?:btw\s*)?/i, "").trim();
      if (!userText) return;

      const answerEl = panel.querySelector('[data-testid="side-question-answer"]');
      if (!answerEl) return;
      const clone = answerEl.cloneNode(true);
      clone.querySelectorAll('style, script, svg, [aria-label*="Thought"], [aria-label*="Thinking"], [class*="thinking"], [data-testid*="thought"], button, [role="button"], .bg-btw-card-btn-footer').forEach((el) => el.remove());
      const responseText = sanitizeCardContent(clone.textContent || "");
      if (!responseText || responseText.startsWith("Thinking...") || responseText.includes("Thinking...")) return;

      pushToRecentBtw(userText, responseText, cid);
    });
  }

  // Initialize store on script load
  timeslipCards = loadCards();
  saveCards(timeslipCards, true);
  recentBtw = loadRecentBtw();
  saveRecentBtw(recentBtw);

