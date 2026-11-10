// src/index.tsx
import { createRoot } from "react-dom/client";

// src/core/inspector-protocol.ts
function toWireMode(tool, browsing = false) {
  if (tool === "off") return "off";
  return browsing ? "browse" : "feedback";
}
var UI_ATTR = "data-lasso-ui";

// src/ui/lasso-app.tsx
import { AnimatePresence as AnimatePresence3, MotionConfig } from "framer-motion";
import { useCallback as useCallback4, useEffect as useEffect3, useState as useState4 } from "react";

// src/hooks/use-feedback.ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// src/core/feedback-format.ts
var MAX_IMAGES = 5;
var MAX_REGION_ELEMENTS = 8;
function serializeFeedback(items) {
  const images = [];
  const sections = items.map((item, i) => {
    const lines = [`### ${i + 1}. "${item.comment}"`];
    if (item.target.kind === "element") {
      const m = item.target.meta;
      lines.push(
        `- Element: <${m.tag}>${m.text ? ` \u2014 "${m.text}"` : ""}`,
        m.classes.length ? `- Classes: ${m.classes.slice(0, 12).join(" ")}` : null,
        m.components.length ? `- Components: ${m.components.join(" < ")}` : null,
        `- Selector: ${m.selector}`
      );
    } else {
      const { rect, elements } = item.target;
      lines.push(`- Region: ${Math.round(rect.width)}\xD7${Math.round(rect.height)}px selection`);
      if (elements.length) {
        lines.push(
          `- Elements in region:
${elements.slice(0, MAX_REGION_ELEMENTS).map(
            (m) => `  - <${m.tag}>${m.text ? ` "${m.text.slice(0, 40)}"` : ""}${m.components[0] ? ` \u2014 ${m.components[0]}` : ""}`
          ).join("\n")}`
        );
      }
    }
    if (item.screenshot && images.length < MAX_IMAGES) {
      images.push(item.screenshot);
      lines.push(`- Screenshot: attached image #${images.length}`);
    }
    return lines.filter(Boolean).join("\n");
  });
  const message = [
    `## User visual feedback (${items.length} ${items.length === 1 ? "item" : "items"})`,
    "",
    "The user selected these elements directly in the live preview and left the comments below.",
    "Address every item. Use each Components chain to locate the JSX; confirm with the selector and text.",
    "",
    sections.join("\n\n")
  ].join("\n");
  return { message, images };
}

// src/core/marker-store.ts
var DRAFT_KEY = "__draft";
var MarkerStore = class {
  placements = /* @__PURE__ */ new Map();
  listeners = /* @__PURE__ */ new Map();
  read(id) {
    return this.placements.get(id) ?? null;
  }
  write(id, placement) {
    this.placements.set(id, placement);
    const subscribers = this.listeners.get(id);
    if (!subscribers) return;
    for (const notify of subscribers) notify(placement);
  }
  forget(id) {
    this.placements.delete(id);
  }
  subscribe(id, notify) {
    let subscribers = this.listeners.get(id);
    if (!subscribers) {
      subscribers = /* @__PURE__ */ new Set();
      this.listeners.set(id, subscribers);
    }
    subscribers.add(notify);
    return () => {
      subscribers.delete(notify);
      if (subscribers.size === 0) this.listeners.delete(id);
    };
  }
};

// src/core/pending-store.ts
var ITEMS_KEY = "clevon-lasso:items";
var DRAFT_KEY2 = "clevon-lasso:draft";
function read(key) {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function write(key, value) {
  try {
    if (value == null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
function loadItems() {
  const items = read(ITEMS_KEY);
  return Array.isArray(items) ? items.map((item) => ({ ...item, stale: false })) : [];
}
function saveItems(items) {
  if (items.length === 0) return void write(ITEMS_KEY, null);
  if (!write(ITEMS_KEY, items)) write(ITEMS_KEY, items.map((item) => ({ ...item, screenshot: null })));
}
function loadDraft() {
  const saved = read(DRAFT_KEY2);
  return saved?.draft ? saved : null;
}
function saveDraft(saved) {
  write(DRAFT_KEY2, saved);
}

// src/hooks/use-feedback.ts
function trackingAnchor(target) {
  if (target.kind === "element") {
    return { nodeId: target.meta.nodeId, selector: target.meta.selector, rect: target.meta.rect };
  }
  if (target.anchorNodeId == null) return null;
  const anchor = target.elements.find((el) => el.nodeId === target.anchorNodeId);
  return anchor ? { nodeId: anchor.nodeId, selector: anchor.selector, rect: anchor.rect } : null;
}
function place(source, anchor) {
  return {
    pin: { x: anchor.x + source.pinOffset.dx, y: anchor.y + source.pinOffset.dy },
    rect: source.rect && source.rectOffset ? { ...source.rect, x: anchor.x + source.rectOffset.dx, y: anchor.y + source.rectOffset.dy } : source.rect
  };
}
function useFeedback(inspector) {
  const [restored] = useState(() => ({ items: loadItems(), draft: loadDraft() }));
  const [items, setItems] = useState(restored.items);
  const [draft, setDraft] = useState(restored.draft?.draft ?? null);
  const [markers] = useState(() => {
    const store = new MarkerStore();
    for (const item of restored.items) store.write(item.id, { pin: item.pin, rect: item.rect });
    const saved = restored.draft?.draft;
    if (saved) store.write(DRAFT_KEY, { pin: saved.point, rect: saved.rect });
    return store;
  });
  const draftTextRef = useRef(restored.draft?.text ?? "");
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const { connected, track, capture } = inspector;
  useEffect(() => saveItems(items), [items]);
  useEffect(() => saveDraft(draft ? { draft, text: draftTextRef.current } : null), [draft]);
  const setDraftText = useCallback((text) => {
    draftTextRef.current = text;
    const current = draftRef.current;
    if (current) saveDraft({ draft: current, text });
  }, []);
  const trackedNodes = useMemo(() => {
    const nodes = /* @__PURE__ */ new Map();
    for (const item of items) {
      const anchor = trackingAnchor(item.target);
      if (anchor) nodes.set(anchor.nodeId, anchor.selector);
    }
    if (draft) {
      const anchor = trackingAnchor(draft.target);
      if (anchor) nodes.set(anchor.nodeId, anchor.selector);
    }
    return [...nodes].map(([nodeId, selector]) => ({ nodeId, selector }));
  }, [items, draft]);
  const trackedKey = trackedNodes.map((node) => `${node.nodeId}:${node.selector}`).join("\n");
  useEffect(() => {
    if (!connected) return;
    track("feedback", trackedNodes);
  }, [trackedKey, track, connected]);
  const beginElementDraft = useCallback(
    (meta, point) => {
      const p = point ?? { x: meta.rect.x + meta.rect.width, y: meta.rect.y };
      markers.write(DRAFT_KEY, { pin: p, rect: null });
      draftTextRef.current = "";
      setDraft({
        target: { kind: "element", meta },
        point: p,
        pointOffset: { dx: p.x - meta.rect.x, dy: p.y - meta.rect.y },
        rect: null,
        rectOffset: null
      });
    },
    [markers]
  );
  const beginRegionDraft = useCallback(
    (region) => {
      const target = {
        kind: "region",
        rect: region.rect,
        elements: region.elements,
        anchorNodeId: region.elements[0]?.nodeId ?? null
      };
      const point = region.point ?? { x: region.rect.x + region.rect.width, y: region.rect.y };
      const anchor = trackingAnchor(target);
      markers.write(DRAFT_KEY, { pin: point, rect: region.rect });
      draftTextRef.current = "";
      setDraft({
        target,
        point,
        pointOffset: anchor ? { dx: point.x - anchor.rect.x, dy: point.y - anchor.rect.y } : { dx: 0, dy: 0 },
        rect: region.rect,
        rectOffset: anchor ? { dx: region.rect.x - anchor.rect.x, dy: region.rect.y - anchor.rect.y } : null
      });
    },
    [markers]
  );
  const cancelDraft = useCallback(() => {
    markers.forget(DRAFT_KEY);
    setDraft(null);
  }, [markers]);
  const saveDraft2 = useCallback(
    (comment) => {
      const current = draftRef.current;
      const trimmed = comment.trim();
      if (!current || !trimmed) return;
      const live = markers.read(DRAFT_KEY);
      const pin = live?.pin ?? current.point;
      const rect = live?.rect ?? current.rect;
      const id = crypto.randomUUID();
      markers.write(id, { pin, rect });
      markers.forget(DRAFT_KEY);
      setItems((prev) => [
        ...prev,
        {
          id,
          target: current.target,
          comment: trimmed,
          screenshot: null,
          pin,
          pinOffset: current.pointOffset,
          rect,
          rectOffset: current.rectOffset,
          stale: false
        }
      ]);
      setDraft(null);
      const captureTarget = current.target.kind === "element" ? { nodeId: current.target.meta.nodeId } : { rect: rect ?? current.target.rect };
      capture(captureTarget).then((dataUrl) => {
        if (dataUrl) {
          setItems((prev) => prev.map((it) => it.id === id ? { ...it, screenshot: dataUrl } : it));
        }
      });
    },
    [markers, capture]
  );
  const removeItem = useCallback(
    (id) => {
      markers.forget(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    },
    [markers]
  );
  const updateRects = useCallback(
    (rects) => {
      const staleFlips = /* @__PURE__ */ new Map();
      for (const item of itemsRef.current) {
        const anchor2 = trackingAnchor(item.target);
        if (!anchor2) continue;
        const rect2 = rects[anchor2.nodeId];
        if (rect2 === void 0) continue;
        if (!rect2) {
          if (!item.stale) staleFlips.set(item.id, true);
          continue;
        }
        if (item.stale) staleFlips.set(item.id, false);
        markers.write(item.id, place(item, rect2));
      }
      if (staleFlips.size > 0) {
        setItems(
          (prev) => prev.map((item) => {
            const next = staleFlips.get(item.id);
            return next === void 0 || next === item.stale ? item : { ...item, stale: next };
          })
        );
      }
      const current = draftRef.current;
      if (!current) return;
      const anchor = trackingAnchor(current.target);
      if (!anchor) return;
      const rect = rects[anchor.nodeId];
      if (!rect) return;
      markers.write(
        DRAFT_KEY,
        place(
          {
            pin: current.point,
            pinOffset: current.pointOffset,
            rect: current.rect,
            rectOffset: current.rectOffset
          },
          rect
        )
      );
    },
    [markers]
  );
  const clear = useCallback(() => {
    for (const item of itemsRef.current) markers.forget(item.id);
    markers.forget(DRAFT_KEY);
    setItems([]);
    setDraft(null);
  }, [markers]);
  const serialize = useCallback(
    () => serializeFeedback(items),
    [items]
  );
  return {
    items,
    draft,
    draftText: draftTextRef.current,
    setDraftText,
    markers,
    beginElementDraft,
    beginRegionDraft,
    cancelDraft,
    saveDraft: saveDraft2,
    removeItem,
    updateRects,
    clear,
    serialize
  };
}

// src/hooks/use-inspector.ts
import { useCallback as useCallback2, useEffect as useEffect2, useRef as useRef2, useState as useState2 } from "react";

// src/core/inspector.ts
import { getFontEmbedCSS, toCanvas } from "html-to-image";
var COMPUTED_PROPS = [
  "color",
  "backgroundColor",
  "fontSize",
  "fontWeight",
  "borderRadius",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft"
];
var MAX_CAPTURE_WIDTH = 800;
var NEXT_INTERNAL = /^__|Boundary|_boundary|HotReload|DevRoot|Router|Segment|Scroll|Handler|StateProvider|^(Inner|Outer)?Layout|^(Root|RootLayout|Html|Body|App|ServerRoot|Head)$|^RenderFromTemplateContext$/;
function inUi(target) {
  const el = target;
  return Boolean(el && typeof el.closest === "function" && el.closest(`[${UI_ATTR}]`));
}
function isEditable(target) {
  const el = target;
  if (!el || typeof el.tagName !== "string") return false;
  return el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT";
}
function skipsHoldKey(target) {
  const el = target;
  if (!el || typeof el.tagName !== "string") return false;
  return isEditable(el) || el.tagName === "BUTTON" || el.tagName === "A";
}
function createBox(bg, border) {
  const el = document.createElement("div");
  el.setAttribute(UI_ATTR, "");
  el.style.cssText = `position:fixed;display:none;pointer-events:none;z-index:2147483646;background:${bg};border:${border};border-radius:2px;`;
  return el;
}
function toRect(rect) {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}
function normalizeRect(a, b) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y)
  };
}
function componentChain(el) {
  const key = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
  let fiber = key ? el[key] : null;
  const names = [];
  const add = (name) => {
    if (typeof name === "string" && name && !NEXT_INTERNAL.test(name) && !names.includes(name)) names.push(name);
  };
  while (fiber && names.length < 6) {
    const f = fiber;
    if (typeof f.type === "function") {
      const type = f.type;
      add(type.displayName ?? type.name);
    }
    for (const info of [...f._debugInfo ?? []].reverse()) add(info?.name);
    fiber = f.return;
  }
  return names;
}
function cropCanvas(src, x, y, width, height) {
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(width));
  out.height = Math.max(1, Math.round(height));
  out.getContext("2d").drawImage(src, x, y, width, height, 0, 0, out.width, out.height);
  return out;
}
function scaleCanvas(src, ratio) {
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(src.width * ratio));
  out.height = Math.max(1, Math.round(src.height * ratio));
  out.getContext("2d").drawImage(src, 0, 0, out.width, out.height);
  return out;
}
function whenIdle(run, timeout = 500) {
  const idle = window.requestIdleCallback;
  if (idle) idle.call(window, run, { timeout });
  else setTimeout(run, 0);
}
function createInspector(callbacks) {
  let mode = "off";
  let nextNodeId = 1;
  let nodeIds = /* @__PURE__ */ new WeakMap();
  const idToNode = /* @__PURE__ */ new Map();
  const idToSelector = /* @__PURE__ */ new Map();
  const trackedIds = /* @__PURE__ */ new Set();
  const lastRects = /* @__PURE__ */ new Map();
  let modeStyle = null;
  let dragStart = null;
  let dragging = false;
  let rectsQueued = false;
  let fontEmbedCss = null;
  let fontEmbedPending = null;
  let fontFamilyKey = "";
  const regionBox = createBox("rgba(59,130,246,0.08)", "1.5px dashed rgb(59,130,246)");
  document.body.append(regionBox);
  const intercepts = () => mode === "feedback";
  function idFor(el) {
    let id = nodeIds.get(el);
    if (!id) {
      id = nextNodeId++;
      nodeIds.set(el, id);
    }
    idToNode.set(id, el);
    return id;
  }
  function resolve(nodeId) {
    const el = idToNode.get(nodeId);
    if (el?.isConnected) return el;
    const selector = idToSelector.get(nodeId);
    if (!selector) return null;
    try {
      const found = document.querySelector(selector);
      if (found) {
        nodeIds.set(found, nodeId);
        idToNode.set(nodeId, found);
        return found;
      }
    } catch {
    }
    return null;
  }
  function buildSelector(el) {
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts = [];
    let cur = el;
    while (cur && cur !== document.body && parts.length < 6) {
      if (cur.id) {
        parts.unshift(`#${CSS.escape(cur.id)}`);
        break;
      }
      let part = cur.tagName.toLowerCase();
      const classes = [...cur.classList].slice(0, 2);
      if (classes.length) part += `.${classes.map((value) => CSS.escape(value)).join(".")}`;
      const parent = cur.parentElement;
      if (parent) {
        const siblings = [...parent.children].filter((candidate) => candidate.tagName === cur.tagName);
        if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(cur) + 1})`;
      }
      parts.unshift(part);
      cur = parent;
    }
    return parts.join(" > ");
  }
  function buildMeta(el) {
    const nodeId = idFor(el);
    const selector = buildSelector(el);
    idToSelector.set(nodeId, selector);
    const style = window.getComputedStyle(el);
    const computed = {};
    for (const prop of COMPUTED_PROPS) computed[prop] = style[prop];
    const image = el instanceof HTMLImageElement;
    return {
      nodeId,
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      classes: [...el.classList],
      selector,
      components: componentChain(el),
      text: (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 80),
      rect: toRect(el.getBoundingClientRect()),
      computed,
      ...image ? { src: el.getAttribute("src") ?? void 0 } : {}
    };
  }
  function targetAt(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el || el === document.documentElement || el === document.body || inUi(el)) return null;
    return el;
  }
  function showBox(box, rect) {
    box.style.display = "block";
    box.style.left = `${rect.x}px`;
    box.style.top = `${rect.y}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
  }
  function elementsInRegion(rect) {
    const contained = [...document.body.querySelectorAll("*")].filter((el) => {
      if (inUi(el)) return false;
      const candidate = el.getBoundingClientRect();
      if (candidate.width === 0 || candidate.height === 0) return false;
      return candidate.left >= rect.x - 1 && candidate.top >= rect.y - 1 && candidate.right <= rect.x + rect.width + 1 && candidate.bottom <= rect.y + rect.height + 1;
    });
    const containedSet = new Set(contained);
    return contained.filter((el) => !el.parentElement || !containedSet.has(el.parentElement)).slice(0, 12).map(buildMeta);
  }
  function onPointerMove(event) {
    if (!intercepts()) return;
    if (dragStart && (dragging || Math.hypot(event.clientX - dragStart.x, event.clientY - dragStart.y) > 4)) {
      dragging = true;
      showBox(regionBox, normalizeRect(dragStart, { x: event.clientX, y: event.clientY }));
    }
  }
  function onPointerDown(event) {
    if (!intercepts() || event.button !== 0 || inUi(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    dragStart = { x: event.clientX, y: event.clientY };
    dragging = false;
  }
  function onPointerUp(event) {
    if (!intercepts() || !dragStart) return;
    event.preventDefault();
    event.stopPropagation();
    const start = dragStart;
    dragStart = null;
    const point = { x: event.clientX, y: event.clientY };
    if (dragging) {
      dragging = false;
      regionBox.style.display = "none";
      const rect = normalizeRect(start, point);
      if (rect.width > 8 && rect.height > 8) {
        callbacks.onRegionSelect({ rect, elements: elementsInRegion(rect), point });
        return;
      }
    }
    dragging = false;
    regionBox.style.display = "none";
    const el = targetAt(event.clientX, event.clientY);
    if (el) callbacks.onSelect(buildMeta(el), point);
  }
  function suppress(event) {
    if (!intercepts() || inUi(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
  }
  function onKeyDown(event) {
    if (mode === "off" || inUi(event.target)) return;
    if (event.key === "Escape" && mode !== "browse") {
      event.preventDefault();
      event.stopPropagation();
      callbacks.onEscape();
      return;
    }
    if (event.code !== "Space" || skipsHoldKey(event.target)) return;
    event.preventDefault();
    if (!event.repeat) callbacks.onToggleBrowse();
  }
  function reportRects() {
    if (trackedIds.size === 0) {
      lastRects.clear();
      return;
    }
    const changed = {};
    let dirty = false;
    for (const id of trackedIds) {
      const el = resolve(id);
      const rect = el ? toRect(el.getBoundingClientRect()) : null;
      const key = rect ? `${rect.x},${rect.y},${rect.width},${rect.height}` : "";
      if (lastRects.get(id) === key) continue;
      lastRects.set(id, key);
      changed[id] = rect;
      dirty = true;
    }
    for (const id of [...lastRects.keys()]) {
      if (!trackedIds.has(id)) lastRects.delete(id);
    }
    if (dirty) callbacks.onRects(changed);
  }
  function queueRects() {
    if (rectsQueued || trackedIds.size === 0) return;
    rectsQueued = true;
    requestAnimationFrame(() => {
      rectsQueued = false;
      reportRects();
    });
  }
  function fontCss() {
    const body = document.body;
    const fontNodes = /* @__PURE__ */ new Map();
    for (const node of [body, ...body.querySelectorAll("*")]) {
      if (inUi(node)) continue;
      const family = window.getComputedStyle(node).fontFamily;
      if (family && !fontNodes.has(family)) fontNodes.set(family, node);
    }
    const key = [...fontNodes.keys()].sort().join("|");
    if (key !== fontFamilyKey) {
      fontFamilyKey = key;
      fontEmbedCss = null;
      fontEmbedPending = null;
    }
    if (fontEmbedCss !== null) return Promise.resolve(fontEmbedCss);
    if (!fontEmbedPending) {
      fontEmbedPending = Promise.all([...fontNodes.values()].map((node) => getFontEmbedCSS(node).catch(() => ""))).then((styles) => [...new Set(styles)].join("\n")).then((css) => {
        if (key === fontFamilyKey) fontEmbedCss = css;
        return css;
      });
    }
    return fontEmbedPending;
  }
  function enclosingElement(rect) {
    const body = document.body;
    const start = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    let el = start instanceof HTMLElement && !inUi(start) ? start : null;
    while (el && el !== body) {
      const bounds = el.getBoundingClientRect();
      if (bounds.left <= rect.x + 1 && bounds.top <= rect.y + 1 && bounds.right >= rect.x + rect.width - 1 && bounds.bottom >= rect.y + rect.height - 1) {
        return el;
      }
      el = el.parentElement;
    }
    return body;
  }
  const uiFilter = (node) => !(node instanceof Element && node.hasAttribute?.(UI_ATTR));
  async function capture(target) {
    regionBox.style.display = "none";
    try {
      const options = { pixelRatio: 1, backgroundColor: "#ffffff", fontEmbedCSS: await fontCss(), filter: uiFilter };
      let canvas;
      if (target.nodeId != null) {
        const el = resolve(target.nodeId);
        if (!(el instanceof HTMLElement)) throw new Error("stale node");
        canvas = await toCanvas(el, options);
      } else if (target.rect) {
        const rect = target.rect;
        const source = enclosingElement(rect);
        if (!source) throw new Error("no capture source");
        const bounds = source.getBoundingClientRect();
        const full = await toCanvas(source, options);
        const scale = bounds.width > 0 ? full.width / bounds.width : 1;
        canvas = cropCanvas(
          full,
          (rect.x - bounds.x) * scale,
          (rect.y - bounds.y) * scale,
          rect.width * scale,
          rect.height * scale
        );
      } else {
        throw new Error("nodeId or rect required");
      }
      if (canvas.width > MAX_CAPTURE_WIDTH) canvas = scaleCanvas(canvas, MAX_CAPTURE_WIDTH / canvas.width);
      return canvas.toDataURL("image/jpeg", 0.8);
    } catch {
      return null;
    }
  }
  function applyModeStyle() {
    modeStyle?.remove();
    modeStyle = null;
    if (!intercepts()) return;
    modeStyle = document.createElement("style");
    modeStyle.dataset.devFeedback = "mode";
    modeStyle.textContent = `:not([${UI_ATTR}], [${UI_ATTR}] *){cursor:crosshair!important;user-select:none!important}`;
    document.head.append(modeStyle);
  }
  function setMode(next) {
    mode = next;
    dragStart = null;
    dragging = false;
    regionBox.style.display = "none";
    applyModeStyle();
  }
  function track(nodes) {
    trackedIds.clear();
    for (const { nodeId, selector } of nodes) {
      trackedIds.add(nodeId);
      idToSelector.set(nodeId, selector);
      if (nodeId >= nextNodeId) nextNodeId = nodeId + 1;
    }
    reportRects();
  }
  window.addEventListener("pointermove", onPointerMove, true);
  window.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("pointerup", onPointerUp, true);
  window.addEventListener("click", suppress, true);
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("scroll", queueRects, { capture: true, passive: true });
  window.addEventListener("resize", queueRects, { passive: true });
  const observer = new MutationObserver(queueRects);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  whenIdle(() => void fontCss(), 5e3);
  function dispose() {
    window.removeEventListener("pointermove", onPointerMove, true);
    window.removeEventListener("pointerdown", onPointerDown, true);
    window.removeEventListener("pointerup", onPointerUp, true);
    window.removeEventListener("click", suppress, true);
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("scroll", queueRects, true);
    window.removeEventListener("resize", queueRects);
    observer.disconnect();
    modeStyle?.remove();
    regionBox.remove();
    nodeIds = /* @__PURE__ */ new WeakMap();
  }
  return {
    setMode,
    track,
    capture: (target) => new Promise((done) => whenIdle(() => void capture(target).then(done))),
    dispose
  };
}

// src/hooks/use-inspector.ts
function useInspector(handlers) {
  const [connected, setConnected] = useState2(false);
  const [tool, setToolState] = useState2("feedback");
  const [browseSticky, setBrowseSticky] = useState2(false);
  const browsing = tool === "feedback" && browseSticky;
  const wireMode = toWireMode(tool, browsing);
  const handlersRef = useRef2(handlers);
  handlersRef.current = handlers;
  const inspectorRef = useRef2(null);
  const trackedScopes = useRef2(/* @__PURE__ */ new Map());
  useEffect2(() => {
    const inspector = createInspector({
      onSelect: (meta, point) => handlersRef.current.onSelect?.(meta, point),
      onRegionSelect: (region) => handlersRef.current.onRegionSelect?.(region),
      onRects: (rects) => handlersRef.current.onRects?.(rects),
      onEscape: () => handlersRef.current.onEscape?.(),
      onToggleBrowse: () => setBrowseSticky((v) => !v)
    });
    inspectorRef.current = inspector;
    setConnected(true);
    return () => {
      inspector.dispose();
      inspectorRef.current = null;
      setConnected(false);
    };
  }, []);
  const setTool = useCallback2((next) => {
    setToolState(next);
    setBrowseSticky(false);
  }, []);
  const toggleBrowse = useCallback2(() => setBrowseSticky((v) => !v), []);
  useEffect2(() => {
    inspectorRef.current?.setMode(wireMode);
  }, [wireMode, connected]);
  const track = useCallback2((scope, nodes) => {
    trackedScopes.current.set(scope, nodes);
    const combined = /* @__PURE__ */ new Map();
    for (const scopedNodes of trackedScopes.current.values()) {
      for (const node of scopedNodes) combined.set(node.nodeId, node);
    }
    inspectorRef.current?.track([...combined.values()]);
  }, []);
  const capture = useCallback2(
    (target) => inspectorRef.current?.capture(target) ?? Promise.resolve(null),
    []
  );
  return { connected, tool, setTool, browsing, toggleBrowse, track, capture };
}

// src/ui/feedback-mode-bar.tsx
import { ChatCircleDots, CursorClick } from "@phosphor-icons/react";
import { motion } from "framer-motion";

// src/core/motion.ts
var EASE = [0.22, 1, 0.36, 1];

// src/ui/feedback-mode-bar.tsx
import { jsx, jsxs } from "react/jsx-runtime";
var MODES = [
  { browse: false, label: "\uCF54\uBA58\uD2B8", Icon: ChatCircleDots },
  { browse: true, label: "\uB458\uB7EC\uBCF4\uAE30", Icon: CursorClick }
];
function FeedbackModeBar({ browsing, onToggle }) {
  return /* @__PURE__ */ jsxs(
    motion.div,
    {
      initial: { opacity: 0, y: 8 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: 8 },
      transition: { duration: 0.2, ease: EASE },
      className: "glass pointer-events-auto mx-auto mt-3 flex w-fit items-center gap-0.5 rounded-full p-1",
      children: [
        MODES.map(({ browse, label, Icon }) => {
          const active = browse === browsing;
          return /* @__PURE__ */ jsxs(
            "button",
            {
              onClick: (e) => {
                e.currentTarget.blur();
                if (!active) onToggle();
              },
              "aria-pressed": active,
              className: "relative flex h-8 items-center rounded-full px-3.5 text-[13px] font-medium focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-zinc-900",
              children: [
                active && /* @__PURE__ */ jsx(
                  motion.span,
                  {
                    layoutId: "feedback-mode-indicator",
                    transition: { type: "spring", stiffness: 460, damping: 36 },
                    className: "absolute inset-0 rounded-full bg-white shadow-[0_1px_2px_rgb(24_24_27/0.10),0_4px_12px_-4px_rgb(24_24_27/0.18)]"
                  }
                ),
                /* @__PURE__ */ jsxs(
                  "span",
                  {
                    className: `relative z-10 flex items-center gap-1.5 transition-colors ${active ? "text-zinc-900" : "text-zinc-500 hover:text-zinc-900"}`,
                    children: [
                      /* @__PURE__ */ jsx(Icon, { size: 15, weight: active ? "fill" : "regular" }),
                      label
                    ]
                  }
                )
              ]
            },
            label
          );
        }),
        /* @__PURE__ */ jsx("span", { className: "mx-2 hidden text-[11px] text-zinc-400 sm:block", children: "Space\uB85C \uC804\uD658" })
      ]
    }
  );
}

// src/ui/feedback-overlay.tsx
import { AnimatePresence, motion as motion2 } from "framer-motion";
import { memo, useCallback as useCallback3, useLayoutEffect, useRef as useRef3, useState as useState3 } from "react";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var PIN_SIZE = 18;
var DOT_SIZE = 16;
var CHIP_SIZE = 18;
var EDGE = 8;
var GAP = 8;
var POPOVER_WIDTH = 300;
function pinBand(point, size) {
  const flipped = point.y - size < EDGE;
  return {
    flipped,
    top: flipped ? point.y : point.y - size,
    bottom: flipped ? point.y + size : point.y
  };
}
function pinRadius(flipped) {
  return flipped ? "2px 50% 50% 50%" : "50% 50% 50% 2px";
}
function usePlacement(store, id, initial, apply) {
  const applyRef = useRef3(apply);
  applyRef.current = apply;
  const initialRef = useRef3(initial);
  initialRef.current = initial;
  useLayoutEffect(() => {
    applyRef.current(store.read(id) ?? initialRef.current);
  });
  useLayoutEffect(
    () => store.subscribe(id, (placement) => applyRef.current(placement)),
    [store, id]
  );
}
function FeedbackOverlayImpl({
  items,
  draft,
  markers,
  browsing,
  onSaveDraft,
  onCancelDraft,
  draftText,
  onDraftTextChange
}) {
  const [hoveredId, setHoveredId] = useState3(null);
  const hovered = browsing ? null : items.find((item) => item.id === hoveredId && !item.stale) ?? null;
  const hover = useCallback3((id, on) => {
    setHoveredId((prev) => on ? id : prev === id ? null : prev);
  }, []);
  return /* @__PURE__ */ jsxs2("div", { ...{ [UI_ATTR]: "" }, className: "pointer-events-none fixed inset-0 z-[2147483640]", children: [
    items.map((item, i) => {
      if (item.stale) return null;
      if (item.target.kind === "region" && item.rect) {
        return /* @__PURE__ */ jsx2(
          RegionMarker,
          {
            store: markers,
            item,
            index: i,
            inert: browsing,
            onHover: hover
          },
          item.id
        );
      }
      return /* @__PURE__ */ jsx2(
        PinMarker,
        {
          store: markers,
          item,
          index: i,
          inert: browsing,
          onHover: hover
        },
        item.id
      );
    }),
    /* @__PURE__ */ jsx2(AnimatePresence, { children: hovered && /* @__PURE__ */ jsx2(CommentTip, { store: markers, item: hovered }, hovered.id) }),
    /* @__PURE__ */ jsx2(AnimatePresence, { children: draft && /* @__PURE__ */ jsx2(DraftIndicator, { store: markers, draft }, "draft-indicator") }),
    /* @__PURE__ */ jsx2(AnimatePresence, { children: draft && /* @__PURE__ */ jsx2(
      DraftPopover,
      {
        store: markers,
        point: draft.point,
        initialText: draftText,
        onTextChange: onDraftTextChange,
        onSave: onSaveDraft,
        onCancel: onCancelDraft
      },
      "draft-popover"
    ) })
  ] });
}
var FeedbackOverlay = memo(FeedbackOverlayImpl);
function DraftIndicator({ store, draft }) {
  const region = draft.target.kind === "region";
  const ref = useRef3(null);
  usePlacement(store, DRAFT_KEY, { pin: draft.point, rect: draft.rect }, (placement) => {
    const node = ref.current;
    if (!node) return;
    if (region) {
      const rect = placement.rect;
      if (!rect) return;
      node.style.transform = `translate3d(${rect.x}px, ${rect.y}px, 0)`;
      node.style.width = `${rect.width}px`;
      node.style.height = `${rect.height}px`;
      return;
    }
    const band = pinBand(placement.pin, DOT_SIZE);
    node.style.transform = `translate3d(${placement.pin.x}px, ${band.top}px, 0)`;
    const dot = node.firstElementChild;
    if (dot) dot.style.borderRadius = pinRadius(band.flipped);
  });
  return /* @__PURE__ */ jsx2(
    motion2.div,
    {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0.12, ease: "easeOut" },
      className: "pointer-events-none absolute inset-0",
      children: region ? /* @__PURE__ */ jsx2(
        "div",
        {
          ref,
          className: "absolute left-0 top-0 rounded-[3px] border-[1.5px] border-blue-500/70 bg-blue-500/[0.06] will-change-transform"
        }
      ) : /* @__PURE__ */ jsx2("div", { ref, className: "absolute left-0 top-0 will-change-transform", children: /* @__PURE__ */ jsx2("div", { className: "flex size-4 items-center justify-center bg-blue-500 shadow-[0_1px_4px_rgb(24_24_27/0.25)] ring-1 ring-white", children: /* @__PURE__ */ jsx2("span", { className: "block size-1 rounded-full bg-white" }) }) })
    }
  );
}
function PinMarker({
  store,
  item,
  index,
  inert,
  onHover
}) {
  const ref = useRef3(null);
  const pinRef = useRef3(null);
  usePlacement(store, item.id, { pin: item.pin, rect: item.rect }, (placement) => {
    const node = ref.current;
    if (!node) return;
    const band = pinBand(placement.pin, PIN_SIZE);
    node.style.transform = `translate3d(${placement.pin.x}px, ${band.top}px, 0)`;
    if (pinRef.current) pinRef.current.style.borderRadius = pinRadius(band.flipped);
  });
  return /* @__PURE__ */ jsx2(
    "div",
    {
      ref,
      className: `absolute left-0 top-0 will-change-transform ${inert ? "pointer-events-none" : "pointer-events-auto"}`,
      onMouseEnter: () => onHover(item.id, true),
      onMouseLeave: () => onHover(item.id, false),
      children: /* @__PURE__ */ jsx2(
        "div",
        {
          ref: pinRef,
          className: "flex size-4.5 items-center justify-center bg-blue-500 text-[10px] font-semibold text-white shadow-[0_1px_4px_rgb(24_24_27/0.25)] ring-1 ring-white",
          children: index + 1
        }
      )
    }
  );
}
function RegionMarker({
  store,
  item,
  index,
  inert,
  onHover
}) {
  const ref = useRef3(null);
  usePlacement(store, item.id, { pin: item.pin, rect: item.rect }, (placement) => {
    const node = ref.current;
    const rect = placement.rect;
    if (!node || !rect) return;
    node.style.transform = `translate3d(${rect.x}px, ${rect.y}px, 0)`;
    node.style.width = `${rect.width}px`;
    node.style.height = `${rect.height}px`;
  });
  return /* @__PURE__ */ jsxs2("div", { ref, className: "absolute left-0 top-0 will-change-transform", children: [
    /* @__PURE__ */ jsx2("div", { className: "pointer-events-none absolute inset-0 rounded-[3px] border border-blue-500/60 bg-blue-500/[0.04]" }),
    /* @__PURE__ */ jsx2(
      "div",
      {
        className: `absolute flex size-4.5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-blue-500 text-[10px] font-semibold text-white shadow-[0_1px_4px_rgb(24_24_27/0.25)] ring-1 ring-white ${inert ? "pointer-events-none" : "pointer-events-auto"}`,
        onMouseEnter: () => onHover(item.id, true),
        onMouseLeave: () => onHover(item.id, false),
        children: index + 1
      }
    )
  ] });
}
function tipAnchor(item, placement) {
  if (item.target.kind === "region" && placement.rect) {
    const { x, y } = placement.rect;
    return { x, top: y - CHIP_SIZE / 2, bottom: y + CHIP_SIZE / 2 };
  }
  const band = pinBand(placement.pin, PIN_SIZE);
  return { x: placement.pin.x, top: band.top, bottom: band.bottom };
}
function clamp(value, min, max) {
  return Math.max(min, Math.min(value, Math.max(min, max)));
}
function placeTip(anchor, box) {
  const above = anchor.top - GAP - box.height;
  const top = above < EDGE ? anchor.bottom + GAP : above;
  return {
    left: clamp(anchor.x, EDGE, window.innerWidth - box.width - EDGE),
    top: clamp(top, EDGE, window.innerHeight - box.height - EDGE)
  };
}
function placePopover(point, box) {
  const right = point.x + 10;
  const left = right + box.width > window.innerWidth - EDGE ? point.x - box.width - 10 : right;
  return {
    left: clamp(left, EDGE, window.innerWidth - box.width - EDGE),
    top: clamp(point.y - GAP, EDGE, window.innerHeight - box.height - EDGE)
  };
}
function useBoxSize(ref, key) {
  const [box, setBox] = useState3(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const next = { width: el.offsetWidth, height: el.offsetHeight };
    setBox(
      (prev) => prev && prev.width === next.width && prev.height === next.height ? prev : next
    );
  }, [ref, key]);
  return box;
}
function CommentTip({ store, item }) {
  const ref = useRef3(null);
  const box = useBoxSize(ref, item.comment);
  usePlacement(store, item.id, { pin: item.pin, rect: item.rect }, (placement) => {
    const node = ref.current;
    if (!node || !box) return;
    const pos = placeTip(tipAnchor(item, placement), box);
    node.style.left = `${pos.left}px`;
    node.style.top = `${pos.top}px`;
    node.style.visibility = "visible";
  });
  return /* @__PURE__ */ jsxs2(
    motion2.div,
    {
      ref,
      initial: { opacity: 0, y: 4 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: 4 },
      transition: { duration: 0.12, ease: "easeOut" },
      style: { visibility: "hidden" },
      className: "pointer-events-none absolute w-max max-w-[280px] rounded-[12px] bg-zinc-900 px-3 py-2 shadow-xl",
      children: [
        /* @__PURE__ */ jsx2("p", { className: "line-clamp-6 whitespace-pre-wrap text-[12px] leading-5 text-white", children: item.comment }),
        /* @__PURE__ */ jsx2("p", { className: "mt-1 truncate text-[10px] text-zinc-400", children: targetLabel(item) })
      ]
    }
  );
}
function targetLabel(item) {
  if (item.target.kind === "element") {
    const m = item.target.meta;
    return `<${m.tag}>${m.text ? ` ${m.text.slice(0, 40)}` : ""}`;
  }
  return `\uC601\uC5ED \uC120\uD0DD \xB7 \uC694\uC18C ${item.target.elements.length}\uAC1C`;
}
function DraftPopover({
  store,
  point,
  initialText,
  onTextChange,
  onSave,
  onCancel
}) {
  const [comment, setComment] = useState3(initialText);
  const ref = useRef3(null);
  const box = useBoxSize(ref, null);
  usePlacement(store, DRAFT_KEY, { pin: point, rect: null }, (placement) => {
    const node = ref.current;
    if (!node) return;
    const pos = placePopover(placement.pin, box ?? { width: POPOVER_WIDTH, height: 0 });
    node.style.left = `${pos.left}px`;
    node.style.top = `${pos.top}px`;
  });
  const submit = useCallback3(() => {
    if (comment.trim()) onSave(comment);
  }, [comment, onSave]);
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
    if (e.key === "Escape") {
      e.stopPropagation();
      onCancel();
    }
  };
  return /* @__PURE__ */ jsxs2(
    motion2.div,
    {
      ref,
      initial: { opacity: 0, y: 4, scale: 0.98 },
      animate: { opacity: 1, y: 0, scale: 1 },
      exit: { opacity: 0, y: 4, scale: 0.98 },
      transition: { duration: 0.15, ease: "easeOut" },
      className: "glass pointer-events-auto absolute flex flex-col gap-2 rounded-[16px] p-3",
      style: { width: POPOVER_WIDTH },
      children: [
        /* @__PURE__ */ jsx2(
          "textarea",
          {
            value: comment,
            onChange: (e) => {
              setComment(e.target.value);
              onTextChange(e.target.value);
            },
            onKeyDown: handleKeyDown,
            placeholder: "\uC774 \uBD80\uBD84\uC5D0 \uB300\uD55C \uD53C\uB4DC\uBC31\uC744 \uC801\uC5B4\uC8FC\uC138\uC694\u2026",
            rows: 3,
            autoFocus: true,
            className: "w-full resize-none bg-transparent px-1 py-0.5 text-[13px] leading-5 text-zinc-900 outline-none placeholder:text-zinc-400"
          }
        ),
        /* @__PURE__ */ jsxs2("div", { className: "flex justify-end gap-1.5", children: [
          /* @__PURE__ */ jsx2(
            "button",
            {
              onClick: onCancel,
              className: "rounded-full px-3 py-1.5 text-[12px] text-zinc-500 transition-colors hover:bg-zinc-900/5 hover:text-zinc-900",
              children: "\uCDE8\uC18C"
            }
          ),
          /* @__PURE__ */ jsx2(
            "button",
            {
              onClick: submit,
              disabled: !comment.trim(),
              className: "rounded-full bg-zinc-900 px-3.5 py-1.5 text-[12px] font-medium text-white transition-transform active:scale-95 disabled:opacity-25 disabled:active:scale-100",
              children: "\uCD94\uAC00"
            }
          )
        ] })
      ]
    }
  );
}

// src/ui/feedback-tray.tsx
import { ChatCircleDots as ChatCircleDots2, PaperPlaneRight, X } from "@phosphor-icons/react";
import { AnimatePresence as AnimatePresence2, motion as motion3 } from "framer-motion";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function FeedbackTray({
  open,
  items,
  sending,
  onRemove,
  onSend,
  onClose
}) {
  return /* @__PURE__ */ jsx3(AnimatePresence2, { children: open && /* @__PURE__ */ jsxs3(
    motion3.div,
    {
      initial: { opacity: 0, y: -8, scale: 0.98 },
      animate: { opacity: 1, y: 0, scale: 1 },
      exit: { opacity: 0, y: -8, scale: 0.98 },
      transition: { duration: 0.18, ease: "easeOut" },
      ...{ [UI_ATTR]: "" },
      className: "glass fixed right-4 top-16 z-[2147483641] flex max-h-[min(440px,55dvh)] w-[min(340px,calc(100vw-2rem))] origin-top-right flex-col overflow-hidden rounded-[16px]",
      children: [
        /* @__PURE__ */ jsxs3("div", { className: "flex items-center gap-2 border-b border-zinc-900/5 px-4 py-2.5", children: [
          /* @__PURE__ */ jsx3(ChatCircleDots2, { size: 14, className: "text-zinc-400" }),
          /* @__PURE__ */ jsx3("span", { className: "text-xs font-medium text-zinc-700", children: "\uD53C\uB4DC\uBC31" }),
          /* @__PURE__ */ jsxs3("span", { className: "font-mono text-[11px] text-zinc-400", children: [
            items.length,
            "\uAC74"
          ] }),
          /* @__PURE__ */ jsx3(
            "button",
            {
              onClick: onClose,
              "aria-label": "\uD53C\uB4DC\uBC31 \uBAA8\uB4DC \uC885\uB8CC",
              className: "ml-auto flex size-6 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-900/5 hover:text-zinc-600",
              children: /* @__PURE__ */ jsx3(X, { size: 12, weight: "bold" })
            }
          )
        ] }),
        /* @__PURE__ */ jsx3("div", { className: "flex-1 overflow-y-auto px-2 py-2", children: items.map((item, i) => /* @__PURE__ */ jsxs3(
          "div",
          {
            className: "group flex items-start gap-2.5 rounded-[12px] px-2 py-2 hover:bg-zinc-900/[0.03]",
            children: [
              /* @__PURE__ */ jsx3(
                "span",
                {
                  className: `mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white ${item.stale ? "bg-zinc-400" : "bg-blue-500"}`,
                  children: i + 1
                }
              ),
              /* @__PURE__ */ jsxs3("div", { className: "min-w-0 flex-1", children: [
                /* @__PURE__ */ jsx3("p", { className: "line-clamp-2 text-[13px] leading-5 text-zinc-900", children: item.comment }),
                /* @__PURE__ */ jsx3("p", { className: "mt-0.5 truncate text-[11px] text-zinc-400", children: targetSummary(item) })
              ] }),
              /* @__PURE__ */ jsx3(
                "button",
                {
                  onClick: () => onRemove(item.id),
                  "aria-label": "\uD53C\uB4DC\uBC31 \uC0AD\uC81C",
                  className: "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-zinc-300 opacity-0 transition-all hover:bg-zinc-900/5 hover:text-zinc-600 group-hover:opacity-100",
                  children: /* @__PURE__ */ jsx3(X, { size: 11, weight: "bold" })
                }
              )
            ]
          },
          item.id
        )) }),
        /* @__PURE__ */ jsx3("div", { className: "border-t border-zinc-900/5 p-2.5", children: /* @__PURE__ */ jsxs3(
          "button",
          {
            onClick: onSend,
            disabled: items.length === 0 || sending,
            className: "flex h-9 w-full items-center justify-center gap-1.5 rounded-full bg-zinc-900 text-[13px] font-medium text-white transition-transform active:scale-[0.98] disabled:opacity-25 disabled:active:scale-100",
            children: [
              /* @__PURE__ */ jsx3(PaperPlaneRight, { size: 13, weight: "fill" }),
              items.length,
              "\uAC74 \uBCF4\uB0B4\uAE30"
            ]
          }
        ) })
      ]
    }
  ) });
}
function targetSummary(item) {
  if (item.target.kind === "element") {
    const m = item.target.meta;
    return `<${m.tag}>${m.text ? ` ${m.text.slice(0, 40)}` : ""}`;
  }
  const { rect, elements } = item.target;
  return `\uC601\uC5ED ${Math.round(rect.width)}\xD7${Math.round(rect.height)} \xB7 \uC694\uC18C ${elements.length}\uAC1C`;
}

// src/ui/lasso-app.tsx
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function LassoApp({ send }) {
  const [sending, setSending] = useState4(false);
  const inspector = useInspector({
    onSelect: (meta, point) => {
      if (inspector.tool === "feedback") feedback.beginElementDraft(meta, point);
    },
    onRegionSelect: (region) => {
      if (inspector.tool === "feedback") feedback.beginRegionDraft(region);
    },
    onRects: (rects) => feedback.updateRects(rects),
    // 툴은 늘 켜져 있으므로 Esc 는 작성 중인 코멘트만 거둔다
    onEscape: () => feedback.cancelDraft()
  });
  const feedback = useFeedback(inspector);
  useEffect3(() => {
    if (inspector.browsing) feedback.cancelDraft();
  }, [inspector.browsing, feedback.cancelDraft]);
  const handleSendFeedback = useCallback4(async () => {
    if (feedback.items.length === 0 || sending) return;
    const { message, images } = feedback.serialize();
    setSending(true);
    const ok = await send({
      message,
      images,
      page: location.pathname + location.search + location.hash,
      url: location.href,
      viewport: { width: innerWidth, height: innerHeight }
    }).catch(() => false);
    setSending(false);
    if (ok) feedback.clear();
  }, [feedback, sending, send]);
  const canSendByEnter = inspector.tool === "feedback" && !inspector.browsing && !feedback.draft && feedback.items.length > 0;
  useEffect3(() => {
    if (!canSendByEnter) return;
    const onKeyDown = (e) => {
      if (e.key !== "Enter" || e.isComposing || e.defaultPrevented || e.repeat) return;
      if (e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) return;
      const target = e.target;
      if (target instanceof Element && target.closest('input, textarea, select, button, a, [contenteditable]:not([contenteditable="false"])'))
        return;
      e.preventDefault();
      void handleSendFeedback();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canSendByEnter, handleSendFeedback]);
  return /* @__PURE__ */ jsx4(MotionConfig, { reducedMotion: "user", children: /* @__PURE__ */ jsxs4("div", { ...{ [UI_ATTR]: "" }, className: "lasso-root", children: [
    /* @__PURE__ */ jsx4(
      FeedbackOverlay,
      {
        items: feedback.items,
        draft: feedback.draft,
        markers: feedback.markers,
        browsing: inspector.browsing,
        onSaveDraft: feedback.saveDraft,
        onCancelDraft: feedback.cancelDraft,
        draftText: feedback.draftText,
        onDraftTextChange: feedback.setDraftText
      }
    ),
    /* @__PURE__ */ jsx4("div", { className: "pointer-events-none fixed inset-0 z-[2147483641] flex flex-col items-center justify-end px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]", children: /* @__PURE__ */ jsx4("div", { className: "w-[min(640px,100%)]", children: /* @__PURE__ */ jsx4(AnimatePresence3, { children: inspector.tool === "feedback" && /* @__PURE__ */ jsx4(
      FeedbackModeBar,
      {
        browsing: inspector.browsing,
        onToggle: inspector.toggleBrowse
      },
      "feedback-mode"
    ) }) }) }),
    /* @__PURE__ */ jsx4(
      FeedbackTray,
      {
        open: !inspector.browsing && feedback.items.length > 0,
        items: feedback.items,
        sending,
        onRemove: feedback.removeItem,
        onSend: () => void handleSendFeedback(),
        onClose: inspector.toggleBrowse
      }
    )
  ] }) });
}

// src/ui/styles.css
var styles_default = '/*! tailwindcss v4.3.5 | MIT License | https://tailwindcss.com */\n@layer properties{@supports (((-webkit-hyphens:none)) and (not (margin-trim:block))) or ((-moz-orient:inline) and (not (color:rgb(from red r g b)))){*,:before,:after,::backdrop{--tw-translate-x:0;--tw-translate-y:0;--tw-translate-z:0;--tw-rotate-x:initial;--tw-rotate-y:initial;--tw-rotate-z:initial;--tw-skew-x:initial;--tw-skew-y:initial;--tw-border-style:solid;--tw-leading:initial;--tw-font-weight:initial;--tw-shadow:0 0 #0000;--tw-shadow-color:initial;--tw-shadow-alpha:100%;--tw-inset-shadow:0 0 #0000;--tw-inset-shadow-color:initial;--tw-inset-shadow-alpha:100%;--tw-ring-color:initial;--tw-ring-shadow:0 0 #0000;--tw-inset-ring-color:initial;--tw-inset-ring-shadow:0 0 #0000;--tw-ring-inset:initial;--tw-ring-offset-width:0px;--tw-ring-offset-color:#fff;--tw-ring-offset-shadow:0 0 #0000;--tw-outline-style:solid;--tw-scale-x:1;--tw-scale-y:1;--tw-scale-z:1}}}@layer theme{:root,:host{--font-sans:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";--font-mono:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;--color-blue-500:oklch(62.3% .214 259.815);--color-zinc-300:oklch(87.1% .006 286.286);--color-zinc-400:oklch(70.5% .015 286.067);--color-zinc-500:oklch(55.2% .016 285.938);--color-zinc-600:oklch(44.2% .017 285.786);--color-zinc-700:oklch(37% .013 285.805);--color-zinc-900:oklch(21% .006 285.885);--color-white:#fff;--spacing:.25rem;--text-xs:.75rem;--text-xs--line-height:calc(1 / .75);--font-weight-medium:500;--font-weight-semibold:600;--default-transition-duration:.15s;--default-transition-timing-function:cubic-bezier(.4, 0, .2, 1);--default-font-family:var(--font-sans);--default-mono-font-family:var(--font-mono)}}@layer base{*,:after,:before,::backdrop{box-sizing:border-box;border:0 solid;margin:0;padding:0}::file-selector-button{box-sizing:border-box;border:0 solid;margin:0;padding:0}html,:host{-webkit-text-size-adjust:100%;tab-size:4;line-height:1.5;font-family:var(--default-font-family,-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji");font-feature-settings:var(--default-font-feature-settings,normal);font-variation-settings:var(--default-font-variation-settings,normal);-webkit-tap-highlight-color:transparent}hr{height:0;color:inherit;border-top-width:1px}abbr:where([title]){-webkit-text-decoration:underline dotted;text-decoration:underline dotted}h1,h2,h3,h4,h5,h6{font-size:inherit;font-weight:inherit}a{color:inherit;-webkit-text-decoration:inherit;-webkit-text-decoration:inherit;-webkit-text-decoration:inherit;text-decoration:inherit}b,strong{font-weight:bolder}code,kbd,samp,pre{font-family:var(--default-mono-font-family,ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace);font-feature-settings:var(--default-mono-font-feature-settings,normal);font-variation-settings:var(--default-mono-font-variation-settings,normal);font-size:1em}small{font-size:80%}sub,sup{vertical-align:baseline;font-size:75%;line-height:0;position:relative}sub{bottom:-.25em}sup{top:-.5em}table{text-indent:0;border-color:inherit;border-collapse:collapse}:-moz-focusring:where(:not(iframe)){outline:auto}progress{vertical-align:baseline}summary{display:list-item}ol,ul,menu{list-style:none}img,svg,video,canvas,audio,iframe,embed,object{vertical-align:middle;display:block}img,video{max-width:100%;height:auto}button,input,select,optgroup,textarea{font:inherit;font-feature-settings:inherit;font-variation-settings:inherit;letter-spacing:inherit;color:inherit;opacity:1;background-color:#0000;border-radius:0}::file-selector-button{font:inherit;font-feature-settings:inherit;font-variation-settings:inherit;letter-spacing:inherit;color:inherit;opacity:1;background-color:#0000;border-radius:0}:where(select:is([multiple],[size])) optgroup{font-weight:bolder}:where(select:is([multiple],[size])) optgroup option{padding-inline-start:20px}::file-selector-button{margin-inline-end:4px}::placeholder{opacity:1}@supports (not ((-webkit-appearance:-apple-pay-button))) or (contain-intrinsic-size:1px){::placeholder{color:currentColor}@supports (color:color-mix(in lab, red, red)){::placeholder{color:color-mix(in oklab, currentcolor 50%, transparent)}}}textarea{resize:vertical}::-webkit-search-decoration{-webkit-appearance:none}::-webkit-date-and-time-value{min-height:1lh;text-align:inherit}::-webkit-datetime-edit{display:inline-flex}::-webkit-datetime-edit-fields-wrapper{padding:0}::-webkit-datetime-edit{padding-block:0}::-webkit-datetime-edit-year-field{padding-block:0}::-webkit-datetime-edit-month-field{padding-block:0}::-webkit-datetime-edit-day-field{padding-block:0}::-webkit-datetime-edit-hour-field{padding-block:0}::-webkit-datetime-edit-minute-field{padding-block:0}::-webkit-datetime-edit-second-field{padding-block:0}::-webkit-datetime-edit-millisecond-field{padding-block:0}::-webkit-datetime-edit-meridiem-field{padding-block:0}::-webkit-calendar-picker-indicator{line-height:1}:-moz-ui-invalid{box-shadow:none}button,input:where([type=button],[type=reset],[type=submit]){appearance:button}::file-selector-button{appearance:button}::-webkit-inner-spin-button{height:auto}::-webkit-outer-spin-button{height:auto}[hidden]:where(:not([hidden=until-found])){display:none!important}}@layer components;@layer utilities{.pointer-events-auto{pointer-events:auto}.pointer-events-none{pointer-events:none}.visible{visibility:visible}.absolute{position:absolute}.fixed{position:fixed}.relative{position:relative}.inset-0{inset:0}.top-0{top:0}.top-16{top:calc(var(--spacing) * 16)}.right-4{right:calc(var(--spacing) * 4)}.left-0{left:0}.z-10{z-index:10}.z-\\[2147483640\\]{z-index:2147483640}.z-\\[2147483641\\]{z-index:2147483641}.mx-2{margin-inline:calc(var(--spacing) * 2)}.mx-auto{margin-inline:auto}.mt-0\\.5{margin-top:calc(var(--spacing) * .5)}.mt-1{margin-top:var(--spacing)}.mt-3{margin-top:calc(var(--spacing) * 3)}.ml-auto{margin-left:auto}.line-clamp-2{-webkit-line-clamp:2;-webkit-box-orient:vertical;display:-webkit-box;overflow:hidden}.line-clamp-6{-webkit-line-clamp:6;-webkit-box-orient:vertical;display:-webkit-box;overflow:hidden}.block{display:block}.flex{display:flex}.hidden{display:none}.size-1{width:var(--spacing);height:var(--spacing)}.size-4{width:calc(var(--spacing) * 4);height:calc(var(--spacing) * 4)}.size-4\\.5{width:calc(var(--spacing) * 4.5);height:calc(var(--spacing) * 4.5)}.size-5{width:calc(var(--spacing) * 5);height:calc(var(--spacing) * 5)}.size-6{width:calc(var(--spacing) * 6);height:calc(var(--spacing) * 6)}.h-8{height:calc(var(--spacing) * 8)}.h-9{height:calc(var(--spacing) * 9)}.max-h-\\[min\\(440px\\,55dvh\\)\\]{max-height:min(440px,55dvh)}.w-\\[min\\(340px\\,calc\\(100vw-2rem\\)\\)\\]{width:min(340px,100vw - 2rem)}.w-\\[min\\(640px\\,100\\%\\)\\]{width:min(640px,100%)}.w-fit{width:fit-content}.w-full{width:100%}.w-max{width:max-content}.max-w-\\[280px\\]{max-width:280px}.min-w-0{min-width:0}.flex-1{flex:1}.shrink-0{flex-shrink:0}.origin-top-right{transform-origin:100% 0}.-translate-x-1\\/2{--tw-translate-x:calc(calc(1 / 2 * 100%) * -1);translate:var(--tw-translate-x) var(--tw-translate-y)}.-translate-y-1\\/2{--tw-translate-y:calc(calc(1 / 2 * 100%) * -1);translate:var(--tw-translate-x) var(--tw-translate-y)}.transform{transform:var(--tw-rotate-x, ) var(--tw-rotate-y, ) var(--tw-rotate-z, ) var(--tw-skew-x, ) var(--tw-skew-y, )}.resize-none{resize:none}.flex-col{flex-direction:column}.items-center{align-items:center}.items-start{align-items:flex-start}.justify-center{justify-content:center}.justify-end{justify-content:flex-end}.gap-0\\.5{gap:calc(var(--spacing) * .5)}.gap-1\\.5{gap:calc(var(--spacing) * 1.5)}.gap-2{gap:calc(var(--spacing) * 2)}.gap-2\\.5{gap:calc(var(--spacing) * 2.5)}.truncate{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.overflow-hidden{overflow:hidden}.overflow-y-auto{overflow-y:auto}.rounded-\\[3px\\]{border-radius:3px}.rounded-\\[12px\\]{border-radius:12px}.rounded-\\[16px\\]{border-radius:16px}.rounded-full{border-radius:2147483647px}.border{border-style:var(--tw-border-style);border-width:1px}.border-\\[1\\.5px\\]{border-style:var(--tw-border-style);border-width:1.5px}.border-t{border-top-style:var(--tw-border-style);border-top-width:1px}.border-b{border-bottom-style:var(--tw-border-style);border-bottom-width:1px}.border-blue-500\\/60{border-color:#3080ff99}@supports (color:color-mix(in lab, red, red)){.border-blue-500\\/60{border-color:color-mix(in oklab, var(--color-blue-500) 60%, transparent)}}.border-blue-500\\/70{border-color:#3080ffb3}@supports (color:color-mix(in lab, red, red)){.border-blue-500\\/70{border-color:color-mix(in oklab, var(--color-blue-500) 70%, transparent)}}.border-zinc-900\\/5{border-color:#18181b0d}@supports (color:color-mix(in lab, red, red)){.border-zinc-900\\/5{border-color:color-mix(in oklab, var(--color-zinc-900) 5%, transparent)}}.bg-blue-500{background-color:var(--color-blue-500)}.bg-blue-500\\/\\[0\\.04\\]{background-color:#3080ff0a}@supports (color:color-mix(in lab, red, red)){.bg-blue-500\\/\\[0\\.04\\]{background-color:color-mix(in oklab, var(--color-blue-500) 4%, transparent)}}.bg-blue-500\\/\\[0\\.06\\]{background-color:#3080ff0f}@supports (color:color-mix(in lab, red, red)){.bg-blue-500\\/\\[0\\.06\\]{background-color:color-mix(in oklab, var(--color-blue-500) 6%, transparent)}}.bg-transparent{background-color:#0000}.bg-white{background-color:var(--color-white)}.bg-zinc-400{background-color:var(--color-zinc-400)}.bg-zinc-900{background-color:var(--color-zinc-900)}.p-1{padding:var(--spacing)}.p-2\\.5{padding:calc(var(--spacing) * 2.5)}.p-3{padding:calc(var(--spacing) * 3)}.px-1{padding-inline:var(--spacing)}.px-2{padding-inline:calc(var(--spacing) * 2)}.px-3{padding-inline:calc(var(--spacing) * 3)}.px-3\\.5{padding-inline:calc(var(--spacing) * 3.5)}.px-4{padding-inline:calc(var(--spacing) * 4)}.py-0\\.5{padding-block:calc(var(--spacing) * .5)}.py-1\\.5{padding-block:calc(var(--spacing) * 1.5)}.py-2{padding-block:calc(var(--spacing) * 2)}.py-2\\.5{padding-block:calc(var(--spacing) * 2.5)}.pb-\\[max\\(1\\.25rem\\,env\\(safe-area-inset-bottom\\)\\)\\]{padding-bottom:max(1.25rem, env(safe-area-inset-bottom))}.font-mono{font-family:var(--font-mono)}.text-xs{font-size:var(--text-xs);line-height:var(--tw-leading,var(--text-xs--line-height))}.text-\\[10px\\]{font-size:10px}.text-\\[11px\\]{font-size:11px}.text-\\[12px\\]{font-size:12px}.text-\\[13px\\]{font-size:13px}.leading-5{--tw-leading:calc(var(--spacing) * 5);line-height:calc(var(--spacing) * 5)}.font-medium{--tw-font-weight:var(--font-weight-medium);font-weight:var(--font-weight-medium)}.font-semibold{--tw-font-weight:var(--font-weight-semibold);font-weight:var(--font-weight-semibold)}.whitespace-pre-wrap{white-space:pre-wrap}.text-white{color:var(--color-white)}.text-zinc-300{color:var(--color-zinc-300)}.text-zinc-400{color:var(--color-zinc-400)}.text-zinc-500{color:var(--color-zinc-500)}.text-zinc-700{color:var(--color-zinc-700)}.text-zinc-900{color:var(--color-zinc-900)}.opacity-0{opacity:0}.shadow-\\[0_1px_2px_rgb\\(24_24_27\\/0\\.10\\)\\,0_4px_12px_-4px_rgb\\(24_24_27\\/0\\.18\\)\\]{--tw-shadow:0 1px 2px var(--tw-shadow-color,#18181b1a), 0 4px 12px -4px var(--tw-shadow-color,#18181b2e);box-shadow:var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow)}.shadow-\\[0_1px_4px_rgb\\(24_24_27\\/0\\.25\\)\\]{--tw-shadow:0 1px 4px var(--tw-shadow-color,#18181b40);box-shadow:var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow)}.shadow-xl{--tw-shadow:0 20px 25px -5px var(--tw-shadow-color,#0000001a), 0 8px 10px -6px var(--tw-shadow-color,#0000001a);box-shadow:var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow)}.ring-1{--tw-ring-shadow:var(--tw-ring-inset, ) 0 0 0 calc(1px + var(--tw-ring-offset-width)) var(--tw-ring-color,currentcolor);box-shadow:var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow)}.ring-white{--tw-ring-color:var(--color-white)}.transition{transition-property:color,background-color,border-color,outline-color,text-decoration-color,fill,stroke,--tw-gradient-from,--tw-gradient-via,--tw-gradient-to,opacity,box-shadow,transform,translate,scale,rotate,filter,-webkit-backdrop-filter,backdrop-filter,display,content-visibility,overlay,pointer-events;transition-timing-function:var(--tw-ease,var(--default-transition-timing-function));transition-duration:var(--tw-duration,var(--default-transition-duration))}.transition-all{transition-property:all;transition-timing-function:var(--tw-ease,var(--default-transition-timing-function));transition-duration:var(--tw-duration,var(--default-transition-duration))}.transition-colors{transition-property:color,background-color,border-color,outline-color,text-decoration-color,fill,stroke,--tw-gradient-from,--tw-gradient-via,--tw-gradient-to;transition-timing-function:var(--tw-ease,var(--default-transition-timing-function));transition-duration:var(--tw-duration,var(--default-transition-duration))}.transition-transform{transition-property:transform,translate,scale,rotate;transition-timing-function:var(--tw-ease,var(--default-transition-timing-function));transition-duration:var(--tw-duration,var(--default-transition-duration))}.will-change-transform{will-change:transform}.outline-none{--tw-outline-style:none;outline-style:none}@media (hover:hover){:is(:where(.group):hover .group-hover\\:opacity-100){opacity:1}}.placeholder\\:text-zinc-400::placeholder{color:var(--color-zinc-400)}@media (hover:hover){.hover\\:bg-zinc-900\\/5:hover{background-color:#18181b0d}@supports (color:color-mix(in lab, red, red)){.hover\\:bg-zinc-900\\/5:hover{background-color:color-mix(in oklab, var(--color-zinc-900) 5%, transparent)}}.hover\\:bg-zinc-900\\/\\[0\\.03\\]:hover{background-color:#18181b08}@supports (color:color-mix(in lab, red, red)){.hover\\:bg-zinc-900\\/\\[0\\.03\\]:hover{background-color:color-mix(in oklab, var(--color-zinc-900) 3%, transparent)}}.hover\\:text-zinc-600:hover{color:var(--color-zinc-600)}.hover\\:text-zinc-900:hover{color:var(--color-zinc-900)}}.focus-visible\\:outline-2:focus-visible{outline-style:var(--tw-outline-style);outline-width:2px}.focus-visible\\:outline-offset-1:focus-visible{outline-offset:1px}.focus-visible\\:outline-zinc-900:focus-visible{outline-color:var(--color-zinc-900)}.active\\:scale-95:active{--tw-scale-x:95%;--tw-scale-y:95%;--tw-scale-z:95%;scale:var(--tw-scale-x) var(--tw-scale-y)}.active\\:scale-\\[0\\.98\\]:active{scale:.98}.disabled\\:opacity-25:disabled{opacity:.25}.disabled\\:active\\:scale-100:disabled:active{--tw-scale-x:100%;--tw-scale-y:100%;--tw-scale-z:100%;scale:var(--tw-scale-x) var(--tw-scale-y)}@media (min-width:40rem){.sm\\:block{display:block}}}:host{all:initial;color-scheme:light;font-family:Geist,system-ui,-apple-system,Apple SD Gothic Neo,sans-serif}.glass{-webkit-backdrop-filter:blur(24px)saturate(1.8);background:#ffffffe0;border:1px solid #18181b14;box-shadow:inset 0 1px #ffffffb3,0 1px 2px #18181b0d,0 12px 32px -12px #18181b2e}@property --tw-translate-x{syntax:"*";inherits:false;initial-value:0}@property --tw-translate-y{syntax:"*";inherits:false;initial-value:0}@property --tw-translate-z{syntax:"*";inherits:false;initial-value:0}@property --tw-rotate-x{syntax:"*";inherits:false}@property --tw-rotate-y{syntax:"*";inherits:false}@property --tw-rotate-z{syntax:"*";inherits:false}@property --tw-skew-x{syntax:"*";inherits:false}@property --tw-skew-y{syntax:"*";inherits:false}@property --tw-border-style{syntax:"*";inherits:false;initial-value:solid}@property --tw-leading{syntax:"*";inherits:false}@property --tw-font-weight{syntax:"*";inherits:false}@property --tw-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}@property --tw-shadow-color{syntax:"*";inherits:false}@property --tw-shadow-alpha{syntax:"<percentage>";inherits:false;initial-value:100%}@property --tw-inset-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}@property --tw-inset-shadow-color{syntax:"*";inherits:false}@property --tw-inset-shadow-alpha{syntax:"<percentage>";inherits:false;initial-value:100%}@property --tw-ring-color{syntax:"*";inherits:false}@property --tw-ring-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}@property --tw-inset-ring-color{syntax:"*";inherits:false}@property --tw-inset-ring-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}@property --tw-ring-inset{syntax:"*";inherits:false}@property --tw-ring-offset-width{syntax:"<length>";inherits:false;initial-value:0}@property --tw-ring-offset-color{syntax:"*";inherits:false;initial-value:#fff}@property --tw-ring-offset-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}@property --tw-outline-style{syntax:"*";inherits:false;initial-value:solid}@property --tw-scale-x{syntax:"*";inherits:false;initial-value:1}@property --tw-scale-y{syntax:"*";inherits:false;initial-value:1}@property --tw-scale-z{syntax:"*";inherits:false;initial-value:1}';

// src/index.tsx
import { jsx as jsx5 } from "react/jsx-runtime";
var GLOBAL_KEY = "__clevonLasso";
function hoistProperties() {
  if (document.getElementById("clevon-lasso-properties")) return;
  const rules = styles_default.match(/@property[^{]+\{[^}]*\}/g);
  if (!rules) return;
  const style = document.createElement("style");
  style.id = "clevon-lasso-properties";
  style.textContent = rules.join("\n");
  document.head.append(style);
}
function mountLasso(options = {}) {
  const holder = window;
  holder[GLOBAL_KEY]?.unmount();
  const send = async (payload) => {
    if (options.onSend) return await options.onSend(payload) !== false;
    if (!options.endpoint) throw new Error("mountLasso: endpoint \uB098 onSend \uC911 \uD558\uB098\uB294 \uC788\uC5B4\uC57C \uD569\uB2C8\uB2E4.");
    const res = await fetch(options.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    return res.ok;
  };
  hoistProperties();
  const host = document.createElement("clevon-lasso");
  host.setAttribute(UI_ATTR, "");
  host.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = styles_default;
  const container = document.createElement("div");
  shadow.append(style, container);
  document.body.append(host);
  const root = createRoot(container);
  root.render(/* @__PURE__ */ jsx5(LassoApp, { send }));
  const handle = {
    unmount: () => {
      root.unmount();
      host.remove();
      if (holder[GLOBAL_KEY] === handle) delete holder[GLOBAL_KEY];
    }
  };
  holder[GLOBAL_KEY] = handle;
  return handle;
}
export {
  mountLasso
};
