  // --------------------------------------------------------------------------
  // Feature: Timeslip Context Cards - Storage, Sanitization & State Engine
  // --------------------------------------------------------------------------

  const STORAGE_CARDS_KEY = "__bg_timeslip_cards_v1";
  const LEGACY_CARDS_KEY_V1 = "__bg_voyager_cards_v1";
  const LEGACY_STORAGE_CARDS_KEY = "__bg_side_chat_cards_v1";
  const MAX_CARDS = 60;

  let timeslipCards = [];
  let attachedCards = [];
  const cardChangeListeners = new Set();

  function subscribeCardsChange(fn) {
    if (typeof fn === "function") {
      cardChangeListeners.add(fn);
      return () => cardChangeListeners.delete(fn);
    }
    return () => {};
  }

  function notifyCardsChange() {
    cardChangeListeners.forEach((fn) => {
      try {
        fn(timeslipCards, attachedCards);
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
      .replace(/---\s*\n+(?:【任务指令】|\[Task Instruction\]):\s*/gi, "") // Strip legacy separators
      .replace(/\n{3,}/g, "\n\n") // Normalize excessive blank lines
      .trim();

    clean = clean.replace(/^(?:【探讨问题】|\[Side Question\]):\s*(.*?)\n+(?:【回答要点】|\[Key Points\]):\s*/i, "Context Note: $1\n\n");
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
    attachedCards = attachedCards.filter((c) => c.id !== cardId);
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

  function attachCardToComposer(card) {
    if (!card) return;
    if (attachedCards.some((c) => c.id === card.id)) {
      showToast("Card already attached to composer", "info");
      return;
    }
    attachedCards.push(card);
    notifyCardsChange();
    showToast(`Attached "${card.title}" to composer`, "success");
  }

  function detachCardFromComposer(cardId) {
    attachedCards = attachedCards.filter((c) => c.id !== cardId);
    notifyCardsChange();
  }

  function clearAttachedCards() {
    if (attachedCards.length > 0) {
      attachedCards = [];
      notifyCardsChange();
    }
  }

  // Initialize store on script load
  timeslipCards = loadCards();
  saveCards(timeslipCards, true);
