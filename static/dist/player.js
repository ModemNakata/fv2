// node_modules/@videojs/element/dist/dev/destroy-mixin.js
function DestroyMixin(SuperClass) {
  class DestroyableElement extends SuperClass {
    #destroyed = false;
    #trackedControllers = /* @__PURE__ */ new Set;
    get destroyed() {
      return this.#destroyed;
    }
    destroy() {
      if (this.#destroyed)
        return;
      this.#destroyed = true;
      this.destroyCallback();
    }
    destroyCallback() {
      for (const c of this.#trackedControllers)
        c.hostDestroyed?.();
    }
    addController(controller) {
      super.addController(controller);
      this.#trackedControllers.add(controller);
    }
    removeController(controller) {
      super.removeController(controller);
      this.#trackedControllers.delete(controller);
    }
    connectedCallback() {
      if (this.#destroyed)
        return;
      super.connectedCallback();
    }
    disconnectedCallback() {
      super.disconnectedCallback();
      if (!this.#destroyed && !this.hasAttribute("keep-alive"))
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (!this.isConnected)
              this.destroy();
          });
        });
    }
    performUpdate() {
      if (this.#destroyed)
        return;
      super.performUpdate();
    }
  }
  return DestroyableElement;
}

// node_modules/@videojs/element/dist/dev/reactive-element.js
var cache = /* @__PURE__ */ new WeakMap;
var propertyKeys = /* @__PURE__ */ new Map;
var ReactiveElement = class extends HTMLElement {
  static {
    this.properties = {};
  }
  static get observedAttributes() {
    return [...resolve(this).attrToProp.keys()];
  }
  #controllers;
  #changedProperties;
  #instanceProperties;
  #updatePromise;
  constructor() {
    super();
    this.#controllers = /* @__PURE__ */ new Set;
    this.#changedProperties = /* @__PURE__ */ new Map;
    this.isUpdatePending = false;
    this.hasUpdated = false;
    this.#updatePromise = new Promise((res) => this.enableUpdating = res);
    const { props } = resolve(this.constructor);
    for (const name of props.keys())
      if (Object.hasOwn(this, name)) {
        (this.#instanceProperties ??= /* @__PURE__ */ new Map).set(name, this[name]);
        delete this[name];
      }
    this.requestUpdate();
  }
  enableUpdating(_requestedUpdate) {}
  addController(controller) {
    this.#controllers.add(controller);
    if (this.isConnected)
      controller.hostConnected?.();
  }
  removeController(controller) {
    this.#controllers.delete(controller);
  }
  connectedCallback() {
    this.enableUpdating(true);
    for (const c of this.#controllers)
      c.hostConnected?.();
  }
  disconnectedCallback() {
    for (const c of this.#controllers)
      c.hostDisconnected?.();
  }
  attributeChangedCallback(attr, oldValue, newValue) {
    if (oldValue === newValue)
      return;
    const { props, attrToProp } = resolve(this.constructor);
    const propName = attrToProp.get(attr);
    if (!propName)
      return;
    const decl = props.get(propName);
    if (!decl)
      return;
    let value = newValue;
    if (decl.type === Boolean)
      value = newValue !== null;
    else if (decl.type === Number)
      value = newValue === null ? null : Number(newValue);
    this[propName] = value;
  }
  requestUpdate(name, oldValue) {
    if (name !== undefined)
      this.#changedProperties.set(name, oldValue);
    if (this.isUpdatePending)
      return;
    this.#updatePromise = this.#enqueueUpdate();
  }
  async#enqueueUpdate() {
    this.isUpdatePending = true;
    try {
      await this.#updatePromise;
    } catch (e) {
      Promise.reject(e);
    }
    const result = this.scheduleUpdate();
    if (result != null)
      await result;
    return !this.isUpdatePending;
  }
  scheduleUpdate() {
    this.performUpdate();
  }
  performUpdate() {
    if (!this.isUpdatePending)
      return;
    if (!this.hasUpdated && this.#instanceProperties) {
      for (const [name, value] of this.#instanceProperties)
        this[name] = value;
      this.#instanceProperties = undefined;
    }
    const changed = this.#changedProperties;
    this.willUpdate(changed);
    for (const c of this.#controllers)
      c.hostUpdate?.();
    this.update(changed);
    this.#changedProperties = /* @__PURE__ */ new Map;
    this.isUpdatePending = false;
    for (const c of this.#controllers)
      c.hostUpdated?.();
    if (!this.hasUpdated) {
      this.hasUpdated = true;
      this.firstUpdated(changed);
    }
    this.updated(changed);
  }
  willUpdate(_changed) {}
  update(_changed) {}
  firstUpdated(_changed) {}
  updated(_changed) {}
  get updateComplete() {
    return this.#updatePromise;
  }
};
function resolve(ctor) {
  const existing = cache.get(ctor);
  if (existing)
    return existing;
  const props = /* @__PURE__ */ new Map;
  const attrToProp = /* @__PURE__ */ new Map;
  for (const [name, decl] of Object.entries(ctor.properties)) {
    props.set(name, decl);
    attrToProp.set(decl.attribute ?? name, name);
    if (!Object.getOwnPropertyDescriptor(ctor.prototype, name)?.get) {
      let key = propertyKeys.get(name);
      if (!key) {
        key = Symbol(name);
        propertyKeys.set(name, key);
      }
      Object.defineProperty(ctor.prototype, name, {
        get() {
          return this[key];
        },
        set(value) {
          const old = this[key];
          this[key] = value;
          if (!Object.is(old, value))
            this.requestUpdate(name, old);
        },
        configurable: true,
        enumerable: true
      });
    }
  }
  const meta = {
    props,
    attrToProp
  };
  cache.set(ctor, meta);
  return meta;
}

// node_modules/@videojs/html/dist/dev/ui/media-element.js
var MediaElement = class extends DestroyMixin(ReactiveElement) {
};

// node_modules/@lit/context/development/lib/context-request-event.js
class ContextRequestEvent extends Event {
  constructor(context, contextTarget, callback, subscribe) {
    super("context-request", { bubbles: true, composed: true });
    this.context = context;
    this.contextTarget = contextTarget;
    this.callback = callback;
    this.subscribe = subscribe ?? false;
  }
}
// node_modules/@lit/context/development/lib/create-context.js
function createContext(key) {
  return key;
}
// node_modules/@lit/context/development/lib/controllers/context-consumer.js
class ContextConsumer {
  constructor(host, contextOrOptions, callback, subscribe) {
    this.subscribe = false;
    this.provided = false;
    this.value = undefined;
    this._callback = (value, unsubscribe) => {
      if (this.unsubscribe) {
        if (this.unsubscribe !== unsubscribe) {
          this.provided = false;
          this.unsubscribe();
        }
        if (!this.subscribe) {
          this.unsubscribe();
        }
      }
      this.value = value;
      this.host.requestUpdate();
      if (!this.provided || this.subscribe) {
        this.provided = true;
        if (this.callback) {
          this.callback(value, unsubscribe);
        }
      }
      this.unsubscribe = unsubscribe;
    };
    this.host = host;
    if (contextOrOptions.context !== undefined) {
      const options = contextOrOptions;
      this.context = options.context;
      this.callback = options.callback;
      this.subscribe = options.subscribe ?? false;
    } else {
      this.context = contextOrOptions;
      this.callback = callback;
      this.subscribe = subscribe ?? false;
    }
    this.host.addController(this);
  }
  hostConnected() {
    this.dispatchRequest();
  }
  hostDisconnected() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }
  }
  dispatchRequest() {
    this.host.dispatchEvent(new ContextRequestEvent(this.context, this.host, this._callback, this.subscribe));
  }
}
// node_modules/@lit/context/development/lib/value-notifier.js
class ValueNotifier {
  get value() {
    return this._value;
  }
  set value(v) {
    this.setValue(v);
  }
  setValue(v, force = false) {
    const update = force || !Object.is(v, this._value);
    this._value = v;
    if (update) {
      this.updateObservers();
    }
  }
  constructor(defaultValue) {
    this.subscriptions = new Map;
    this.updateObservers = () => {
      for (const [callback, { disposer }] of this.subscriptions) {
        callback(this._value, disposer);
      }
    };
    if (defaultValue !== undefined) {
      this.value = defaultValue;
    }
  }
  addCallback(callback, consumerHost, subscribe) {
    if (!subscribe) {
      callback(this.value);
      return;
    }
    if (!this.subscriptions.has(callback)) {
      this.subscriptions.set(callback, {
        disposer: () => {
          this.subscriptions.delete(callback);
        },
        consumerHost
      });
    }
    const { disposer } = this.subscriptions.get(callback);
    callback(this.value, disposer);
  }
  clearCallbacks() {
    this.subscriptions.clear();
  }
}

// node_modules/@lit/context/development/lib/controllers/context-provider.js
class ContextProviderEvent extends Event {
  constructor(context, contextTarget) {
    super("context-provider", { bubbles: true, composed: true });
    this.context = context;
    this.contextTarget = contextTarget;
  }
}

class ContextProvider extends ValueNotifier {
  constructor(host, contextOrOptions, initialValue) {
    super(contextOrOptions.context !== undefined ? contextOrOptions.initialValue : initialValue);
    this.onContextRequest = (ev) => {
      if (ev.context !== this.context) {
        return;
      }
      const consumerHost = ev.contextTarget ?? ev.composedPath()[0];
      if (consumerHost === this.host) {
        return;
      }
      ev.stopPropagation();
      this.addCallback(ev.callback, consumerHost, ev.subscribe);
    };
    this.onProviderRequest = (ev) => {
      if (ev.context !== this.context) {
        return;
      }
      const childProviderHost = ev.contextTarget ?? ev.composedPath()[0];
      if (childProviderHost === this.host) {
        return;
      }
      const seen = new Set;
      for (const [callback, { consumerHost }] of this.subscriptions) {
        if (seen.has(callback)) {
          continue;
        }
        seen.add(callback);
        consumerHost.dispatchEvent(new ContextRequestEvent(this.context, consumerHost, callback, true));
      }
      ev.stopPropagation();
    };
    this.host = host;
    if (contextOrOptions.context !== undefined) {
      this.context = contextOrOptions.context;
    } else {
      this.context = contextOrOptions;
    }
    this.attachListeners();
    this.host.addController?.(this);
  }
  attachListeners() {
    this.host.addEventListener("context-request", this.onContextRequest);
    this.host.addEventListener("context-provider", this.onProviderRequest);
  }
  hostConnected() {
    this.host.dispatchEvent(new ContextProviderEvent(this.context, this.host));
  }
}
// node_modules/@videojs/html/dist/dev/player/context.js
var PLAYER_CONTEXT_KEY = Symbol.for("@videojs/player");
var playerContext = createContext(PLAYER_CONTEXT_KEY);
var MEDIA_CONTEXT_KEY = Symbol.for("@videojs/media");
var mediaContext = createContext(MEDIA_CONTEXT_KEY);
var CONTAINER_CONTEXT_KEY = Symbol.for("@videojs/container");
var containerContext = createContext(CONTAINER_CONTEXT_KEY);

// node_modules/@videojs/html/dist/dev/store/container-mixin.js
function createContainerMixin(config) {
  return (BaseClass) => {
    class PlayerContainerElement extends BaseClass {
      #contextStore = null;
      #setContainer = null;
      constructor(...args) {
        super(...args);
        new ContextConsumer(this, {
          context: config.playerContext,
          callback: (value) => {
            this.#contextStore = value ?? null;
          },
          subscribe: true
        });
        new ContextConsumer(this, {
          context: config.containerContext,
          callback: (value) => {
            this.#setContainer = value?.setContainer ?? null;
            if (this.isConnected)
              this.#setContainer?.(this);
          },
          subscribe: true
        });
      }
      get store() {
        return this.#contextStore;
      }
      connectedCallback() {
        super.connectedCallback();
        this.#setContainer?.(this);
      }
      disconnectedCallback() {
        super.disconnectedCallback();
        this.#setContainer?.(null);
      }
    }
    return PlayerContainerElement;
  };
}
// node_modules/@videojs/utils/dist/dom/direction.js
function isRTL(element) {
  const dir = element.closest("[dir]")?.getAttribute("dir");
  if (dir)
    return dir.toLowerCase() === "rtl";
  return getComputedStyle(element).direction === "rtl";
}

// node_modules/@videojs/utils/dist/dom/event.js
function resolveEventTarget(event) {
  const path = event.composedPath();
  return path.length > 0 ? path[0] : event.target;
}
function onEvent(target, type, options) {
  return new Promise((resolve2, reject) => {
    const handleAbort = () => {
      reject(options?.signal?.reason ?? "Aborted");
    };
    if (options?.signal?.aborted) {
      handleAbort();
      return;
    }
    options?.signal?.addEventListener("abort", handleAbort, { once: true });
    target.addEventListener(type, (event) => {
      options?.signal?.removeEventListener("abort", handleAbort);
      resolve2(event);
    }, {
      ...options,
      once: true
    });
  });
}

// node_modules/@videojs/utils/dist/dom/supports.js
function supportsAnchorPositioning() {
  return typeof CSS !== "undefined" && CSS.supports("anchor-name: --a");
}
// node_modules/@videojs/utils/dist/dom/interactive.js
var INTERACTIVE_SELECTOR = [
  "button",
  "input",
  "select",
  "textarea",
  "a[href]",
  '[role="button"]',
  '[role="menu"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="slider"]',
  "[data-interactive]"
].join(",");
var EDITABLE_SELECTOR = [
  "textarea",
  "select",
  "input:not([type])",
  ...[
    "text",
    "search",
    "url",
    "tel",
    "email",
    "password",
    "number"
  ].map((type) => `input[type="${type}"]`),
  '[contenteditable]:not([contenteditable="false"])'
].join(",");
function isEditableElement(el) {
  return el.matches(EDITABLE_SELECTOR);
}
function isEditableTarget(event) {
  const target = resolveEventTarget(event);
  return target instanceof Element && isEditableElement(target);
}
function isInteractiveTarget(event) {
  const target = resolveEventTarget(event);
  if (!(target instanceof Element))
    return false;
  return target.closest(INTERACTIVE_SELECTOR) !== null;
}
var ACTIVATION_KEYS = new Set([" ", "Enter"]);
var ACTIVATABLE_SELECTOR = 'button,a[href],[role="slider"],[role="button"]';
function isInteractiveActivation(event) {
  if (!ACTIVATION_KEYS.has(event.key))
    return false;
  const target = resolveEventTarget(event);
  return target instanceof Element && target.matches(ACTIVATABLE_SELECTOR);
}

// node_modules/@videojs/utils/dist/dom/listen.js
function listen(target, type, listener, options) {
  target.addEventListener(type, listener, options);
  return () => target.removeEventListener(type, listener, options);
}

// node_modules/@videojs/utils/dist/dom/platform.js
function isMacOS() {
  return typeof navigator !== "undefined" && /mac/i.test(navigator.userAgent);
}

// node_modules/@videojs/utils/dist/dom/popover.js
function tryShowPopover(el) {
  try {
    el?.showPopover?.();
  } catch {}
}
function tryHidePopover(el) {
  try {
    el?.hidePopover?.();
  } catch {}
}
// node_modules/@videojs/utils/dist/dom/shadow-styles.js
function ensureGlobalStyle(id, css) {
  const doc = globalThis.document;
  if (!doc || doc.getElementById(id))
    return;
  const style = doc.createElement("style");
  style.id = id;
  style.textContent = css;
  doc.head.appendChild(style);
}
function isConstructableStyleSheet(value) {
  return typeof globalThis.CSSStyleSheet !== "undefined" && value instanceof globalThis.CSSStyleSheet;
}
function getStyleText(style) {
  if (typeof style === "string")
    return style;
  return Array.from(style.cssRules).map((rule) => rule.cssText).join(`
`);
}
function createShadowStyle(css) {
  if (typeof globalThis.CSSStyleSheet === "undefined")
    return css;
  const sheet = new globalThis.CSSStyleSheet;
  sheet.replaceSync(css);
  return sheet;
}
function applyShadowStyles(shadowRoot, styles) {
  if (styles.every(isConstructableStyleSheet) && "adoptedStyleSheets" in shadowRoot) {
    shadowRoot.adoptedStyleSheets = styles;
    return;
  }
  const doc = shadowRoot.ownerDocument;
  for (const styleText of styles.map(getStyleText)) {
    const style = doc.createElement("style");
    style.textContent = styleText;
    shadowRoot.appendChild(style);
  }
}
// node_modules/@videojs/utils/dist/string/casing.js
function kebabCase(str) {
  return str.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

// node_modules/@videojs/utils/dist/dom/style.js
function applyStyles(element, styles) {
  for (const [prop, value] of Object.entries(styles))
    if (typeof value === "string") {
      const key = prop.startsWith("--") ? prop : kebabCase(prop);
      element.style.setProperty(key, value);
    }
}
function resolveCSSLength(el, value) {
  const trimmed = value.trim();
  if (!trimmed)
    return 0;
  const parsed = Number.parseFloat(trimmed);
  if (Number.isNaN(parsed))
    return 0;
  if (/^-?\d*\.?\d+$/.test(trimmed) || trimmed.endsWith("px"))
    return parsed;
  const doc = el.ownerDocument;
  const root = doc?.documentElement;
  if (trimmed.endsWith("rem"))
    return parsed * (root ? Number.parseFloat(getComputedStyle(root).fontSize) || 16 : 16);
  if (trimmed.endsWith("em"))
    return parsed * (el instanceof HTMLElement ? Number.parseFloat(getComputedStyle(el).fontSize) || 16 : 16);
  if (!doc)
    return parsed;
  const measurementEl = doc.createElement("div");
  measurementEl.style.position = "absolute";
  measurementEl.style.visibility = "hidden";
  measurementEl.style.pointerEvents = "none";
  measurementEl.style.inlineSize = trimmed;
  measurementEl.style.blockSize = "0";
  measurementEl.style.padding = "0";
  measurementEl.style.border = "0";
  measurementEl.style.inset = "0";
  const parent = doc.body ?? doc.documentElement;
  if (!parent)
    return parsed;
  parent.appendChild(measurementEl);
  const pixels = measurementEl.getBoundingClientRect().width;
  measurementEl.remove();
  return Number.isFinite(pixels) ? pixels : parsed;
}

// node_modules/@videojs/utils/dist/dom/template.js
function createTemplate(html) {
  const doc = globalThis.document;
  if (!doc)
    return null;
  const template = doc.createElement("template");
  template.innerHTML = html;
  return template;
}
function renderTemplate(container, template) {
  container.appendChild(container.ownerDocument.importNode(template.content, true));
}

// node_modules/@videojs/utils/dist/dom/text-track.js
function findTrackElement(media, track) {
  if (!(media instanceof HTMLElement))
    return null;
  for (const el of media.querySelectorAll("track"))
    if (el.track === track)
      return el;
  return null;
}
function getTextTrackList(media, filterPred) {
  if (!media.textTracks)
    return [];
  return Array.from(media.textTracks).filter(filterPred).sort(sortByKind);
}
function sortByKind(a, b) {
  return a.kind > b.kind ? 1 : a.kind < b.kind ? -1 : 0;
}

// node_modules/@videojs/utils/dist/dom/time-ranges.js
function serializeTimeRanges(ranges) {
  const result = [];
  for (let i = 0;i < ranges.length; i++)
    result.push([ranges.start(i), ranges.end(i)]);
  return result;
}

// node_modules/@videojs/html/dist/dev/media/container-element.js
var ContainerMixin = createContainerMixin({
  playerContext,
  containerContext
});
var MediaContainerElement = class extends ContainerMixin(MediaElement) {
  static {
    this.tagName = "media-container";
  }
  #disconnect = null;
  connectedCallback() {
    super.connectedCallback();
    if (!this.hasAttribute("tabindex"))
      this.setAttribute("tabindex", "0");
    this.#disconnect = new AbortController;
    listen(this, "pointerup", this.#onPointerUp, { signal: this.#disconnect.signal });
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this.#disconnect?.abort();
    this.#disconnect = null;
  }
  #onPointerUp = () => {
    if (!this.contains(document.activeElement) || document.activeElement === document.body)
      this.focus({ preventScroll: true });
  };
};
// node_modules/@videojs/store/dist/dev/core/combine.js
function combine(...slices) {
  return {
    state: (ctx) => {
      const states = slices.map((slice) => slice.state(ctx));
      {
        const seen = /* @__PURE__ */ new Set;
        for (const state of states)
          for (const key of Object.keys(state)) {
            if (seen.has(key))
              console.warn(`[vjs-store] combine(): duplicate state key "${key}" — later slice overwrites earlier one`);
            seen.add(key);
          }
      }
      return Object.assign({}, ...states);
    },
    attach: (ctx) => {
      for (const slice of slices)
        try {
          slice.attach?.(ctx);
        } catch (err) {
          ctx.reportError(err);
        }
    }
  };
}
// node_modules/@videojs/utils/dist/events/abort.js
function anyAbortSignal(signals) {
  if ("any" in AbortSignal)
    return AbortSignal.any(signals);
  const controller = new AbortController;
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), { signal: controller.signal });
  }
  return controller.signal;
}
// node_modules/@videojs/store/dist/dev/core/abort-controller-registry.js
var AbortControllerRegistry = class {
  #base = new AbortController;
  #keys = /* @__PURE__ */ new Map;
  get base() {
    return this.#base.signal;
  }
  clear() {
    for (const controller of this.#keys.values())
      controller.abort();
    this.#keys.clear();
  }
  reset() {
    this.clear();
    this.#base.abort();
    this.#base = new AbortController;
  }
  supersede(key) {
    this.#keys.get(key)?.abort();
    const controller = new AbortController;
    this.#keys.set(key, controller);
    return anyAbortSignal([this.#base.signal, controller.signal]);
  }
};

// node_modules/@videojs/store/dist/dev/core/errors.js
var StoreError = class extends Error {
  code;
  cause;
  constructor(code, options) {
    super(options?.message ?? code);
    this.name = "StoreError";
    this.code = code;
    this.cause = options?.cause;
  }
};
function throwNoTargetError() {
  throw new StoreError("NO_TARGET");
}
function throwDestroyedError() {
  throw new StoreError("DESTROYED");
}

// node_modules/@videojs/utils/dist/predicate/predicate.js
function isString(value) {
  return typeof value === "string";
}
function isNumber(value) {
  return typeof value === "number";
}
function isFunction(value) {
  return typeof value === "function";
}
function isNull(value) {
  return value === null;
}
function isUndefined(value) {
  return typeof value === "undefined";
}
function isObject(value) {
  return value !== null && typeof value === "object";
}

// node_modules/@videojs/utils/dist/object/defaults.js
function defaults(object, defaultValues) {
  const result = { ...defaultValues };
  for (const key in object)
    if (!isUndefined(object[key]))
      result[key] = object[key];
  return result;
}
// node_modules/@videojs/utils/dist/object/pick.js
function pick(obj, keys) {
  const result = {};
  for (const key of keys)
    if (Object.hasOwn(obj, key))
      result[key] = obj[key];
  return result;
}

// node_modules/@videojs/utils/dist/object/shallow-equal.js
var hasOwn = Object.prototype.hasOwnProperty;
function shallowEqual(a, b) {
  if (Object.is(a, b))
    return true;
  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null)
    return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length)
    return false;
  for (const key of keysA)
    if (!hasOwn.call(b, key) || !Object.is(a[key], b[key]))
      return false;
  return true;
}

// node_modules/@videojs/store/dist/dev/core/selector.js
var stateContext = {
  target: throwNoTargetError,
  signals: new AbortControllerRegistry,
  get: throwNoTargetError,
  set: throwNoTargetError
};
function createSelector(slice) {
  const initialState = slice.state(stateContext);
  const keys = Object.keys(initialState);
  const firstKey = keys[0];
  if (!firstKey)
    return Object.assign(() => {
      return;
    }, { displayName: slice.name });
  return Object.assign((state) => {
    if (!(firstKey in state))
      return;
    return pick(state, keys);
  }, { displayName: slice.name });
}
// node_modules/@videojs/store/dist/dev/core/slice.js
function defineSlice() {
  return (config) => config;
}
// node_modules/@videojs/utils/dist/function/noop.js
function noop(..._args) {}

// node_modules/@videojs/utils/dist/function/throttle.js
function throttle(fn, ms, options) {
  const leading = options?.leading ?? false;
  let timerId = null;
  let latestArgs;
  let hasPending = false;
  function startCooldown() {
    timerId = setTimeout(() => {
      timerId = null;
      if (hasPending) {
        hasPending = false;
        fn(...latestArgs);
        startCooldown();
      }
    }, ms);
  }
  const throttled = (...args) => {
    latestArgs = args;
    if (leading)
      if (timerId === null) {
        fn(...latestArgs);
        startCooldown();
      } else
        hasPending = true;
    else {
      if (timerId !== null)
        return;
      timerId = setTimeout(() => {
        timerId = null;
        fn(...latestArgs);
      }, ms);
    }
  };
  throttled.cancel = () => {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
    hasPending = false;
  };
  return throttled;
}
// node_modules/@videojs/store/dist/dev/core/state.js
var isFlushScheduled = false;
function scheduleFlush() {
  if (isFlushScheduled)
    return;
  isFlushScheduled = true;
  queueMicrotask(flush);
}
var pendingContainers = /* @__PURE__ */ new Set;
function flush() {
  isFlushScheduled = false;
  for (const container of pendingContainers)
    container.flush();
  pendingContainers.clear();
}
var hasOwnProp = Object.prototype.hasOwnProperty;
var StateContainer = class {
  #current;
  #listeners = /* @__PURE__ */ new Set;
  #pending = false;
  constructor(initial) {
    this.#current = Object.freeze({ ...initial });
  }
  get current() {
    return this.#current;
  }
  patch(partial) {
    const next = { ...this.#current };
    let changed = false;
    for (const key in partial) {
      if (!hasOwnProp.call(partial, key))
        continue;
      const value = partial[key];
      if (!Object.is(this.#current[key], value)) {
        next[key] = value;
        changed = true;
      }
    }
    if (changed) {
      this.#current = Object.freeze(next);
      this.#markPending();
    }
  }
  subscribe(callback, options) {
    const signal = options?.signal;
    if (signal?.aborted)
      return noop;
    this.#listeners.add(callback);
    if (!signal)
      return () => this.#listeners.delete(callback);
    const onAbort = () => this.#listeners.delete(callback);
    signal.addEventListener("abort", onAbort, { once: true });
    return () => {
      signal.removeEventListener("abort", onAbort);
      this.#listeners.delete(callback);
    };
  }
  flush() {
    if (!this.#pending)
      return;
    this.#pending = false;
    for (const fn of this.#listeners)
      fn();
  }
  #markPending() {
    this.#pending = true;
    pendingContainers.add(this);
    scheduleFlush();
  }
};
function createState(initial) {
  return new StateContainer(initial);
}

// node_modules/@videojs/store/dist/dev/core/store.js
var STORE_SYMBOL = Symbol.for("@videojs/store");
function createStore() {
  return (slice, options = {}) => {
    let target = null;
    let destroyed = false;
    const setupAbort = new AbortController;
    const signals = new AbortControllerRegistry;
    let state;
    function validate() {
      if (destroyed)
        throwDestroyedError();
      if (!target)
        throwNoTargetError();
    }
    const initialState = slice.state({
      target: () => {
        validate();
        return target;
      },
      signals,
      get: () => state.current,
      set: (partial) => state.patch(partial)
    });
    state = createState(initialState);
    const store = {
      [STORE_SYMBOL]: true,
      get $state() {
        return state;
      },
      get target() {
        return target;
      },
      get destroyed() {
        return destroyed;
      },
      get state() {
        return state.current;
      },
      attach,
      destroy,
      subscribe
    };
    for (const key of Object.keys(initialState))
      Object.defineProperty(store, key, {
        get: () => state.current[key],
        enumerable: true
      });
    try {
      options.onSetup?.({
        store,
        signal: setupAbort.signal
      });
    } catch (error) {
      reportError(error);
    }
    return store;
    function attach(newTarget) {
      if (destroyed)
        throwDestroyedError();
      signals.reset();
      target = newTarget;
      const attachContext = {
        target: newTarget,
        signal: signals.base,
        get: () => state.current,
        set: (partial) => state.patch(partial),
        reportError,
        store: {
          get state() {
            return state.current;
          },
          subscribe
        }
      };
      try {
        slice.attach?.(attachContext);
      } catch (error) {
        reportError(error);
      }
      try {
        options.onAttach?.({
          store,
          target: newTarget,
          signal: signals.base
        });
      } catch (error) {
        reportError(error);
      }
      return detach;
    }
    function detach() {
      if (isNull(target))
        return;
      signals.reset();
      target = null;
      state.patch(initialState);
    }
    function destroy() {
      if (destroyed)
        return;
      destroyed = true;
      detach();
      setupAbort.abort();
    }
    function subscribe(callback, options2) {
      return state.subscribe(callback, options2);
    }
    function reportError(error) {
      if (options.onError)
        options.onError({
          store,
          error
        });
      else
        console.error("[vjs-store]", error);
    }
  };
}
function isStore(value) {
  return isObject(value) && STORE_SYMBOL in value;
}

// node_modules/@videojs/core/dist/dev/dom/feature.js
var definePlayerFeature = defineSlice();

// node_modules/@videojs/core/dist/dev/dom/media/predicate.js
function hasMetadata(media) {
  return media.readyState >= 1;
}
function isMediaPauseCapable(value) {
  return isObject(value) && "paused" in value && "ended" in value && isFunction(value.pause);
}
function isMediaSeekCapable(value) {
  return isObject(value) && "currentTime" in value && "duration" in value && "seeking" in value;
}
function isMediaSourceCapable(value) {
  return isObject(value) && "src" in value && "currentSrc" in value && "readyState" in value && isFunction(value.load);
}
function isMediaVolumeCapable(value) {
  return isObject(value) && "volume" in value && "muted" in value;
}
function isMediaPlaybackRateCapable(value) {
  return isObject(value) && "playbackRate" in value;
}
function isMediaBufferCapable(value) {
  return isObject(value) && "buffered" in value && "seekable" in value;
}
function isMediaErrorCapable(value) {
  return isObject(value) && "error" in value;
}
function isMediaTextTrackCapable(value) {
  return isObject(value) && "textTracks" in value;
}
function isMediaRemotePlaybackCapable(value) {
  return isObject(value) && "remote" in value && isObject(value.remote);
}
function isMediaStreamTypeCapable(value) {
  return isObject(value) && "streamType" in value;
}
function isMediaLiveCapable(value) {
  return isObject(value) && "liveEdgeStart" in value && "targetLiveWindow" in value;
}
function isQuerySelectorAllCapable(value) {
  return isObject(value) && "querySelectorAll" in value && isFunction(value.querySelectorAll);
}

// node_modules/@videojs/core/dist/dev/dom/store/features/buffer.js
var bufferFeature = definePlayerFeature({
  name: "buffer",
  state: () => ({
    buffered: [],
    seekable: []
  }),
  attach({ target, signal, set }) {
    const { media } = target;
    if (!isMediaBufferCapable(media))
      return;
    const sync = () => set({
      buffered: serializeTimeRanges(media.buffered),
      seekable: serializeTimeRanges(media.seekable)
    });
    sync();
    listen(media, "progress", sync, { signal });
    listen(media, "emptied", sync, { signal });
  }
});

// node_modules/@videojs/core/dist/dev/dom/gesture/region.js
function resolveRegion(clientX, containerRect, activeRegions) {
  if (activeRegions.size === 0)
    return null;
  const relativeX = clientX - containerRect.left;
  const width = containerRect.width;
  if (width === 0)
    return null;
  const ratio = relativeX / width;
  if (activeRegions.size === 2 && activeRegions.has("left") && activeRegions.has("right"))
    return ratio < 0.5 ? "left" : "right";
  if (activeRegions.size === 3) {
    if (ratio < 1 / 3)
      return "left";
    if (ratio < 2 / 3)
      return "center";
    return "right";
  }
  if (activeRegions.has("left") && ratio < 0.5)
    return "left";
  if (activeRegions.has("right") && ratio >= 0.5)
    return "right";
  if (activeRegions.has("center")) {
    if (activeRegions.size === 1)
      return "center";
    if (ratio >= 1 / 3 && ratio < 2 / 3)
      return "center";
  }
  return null;
}

// node_modules/@videojs/core/dist/dev/dom/gesture/coordinator.js
var TAP_THRESHOLD = 250;
var GestureCoordinator = class {
  #target;
  #bindings = [];
  #recognizers = /* @__PURE__ */ new Set;
  #disconnect = null;
  #subscribers = /* @__PURE__ */ new Set;
  constructor(target) {
    this.#target = target;
  }
  get bindings() {
    return this.#bindings;
  }
  subscribe(callback) {
    this.#subscribers.add(callback);
    return () => this.#subscribers.delete(callback);
  }
  add(binding) {
    const wrapped = {
      ...binding,
      onActivate: (event) => {
        if (this.#subscribers.size > 0) {
          const activateEvent = {
            type: binding.type,
            source: "gesture",
            action: binding.action,
            value: binding.value,
            region: binding.region,
            pointer: binding.pointer,
            event
          };
          for (const cb of this.#subscribers)
            try {
              cb(activateEvent);
            } catch (error) {
              console.warn("[vjs-gesture] subscribe callback threw:", error);
            }
        }
        binding.onActivate(event);
      }
    };
    this.#bindings.push(wrapped);
    this.#recognizers.add(wrapped.recognizer);
    this.#connect();
    let removed = false;
    return () => {
      if (removed)
        return;
      removed = true;
      const idx = this.#bindings.indexOf(wrapped);
      if (idx !== -1)
        this.#bindings.splice(idx, 1);
      this.#maybeDisconnect();
    };
  }
  #connect() {
    if (this.#disconnect)
      return;
    this.#disconnect = new AbortController;
    const { signal } = this.#disconnect;
    let pointerDownTime = 0;
    listen(this.#target, "pointerdown", (event) => {
      if (event.button !== 0)
        return;
      pointerDownTime = Date.now();
    }, { signal });
    listen(this.#target, "pointerup", (event) => {
      if (event.button !== 0)
        return;
      if (Date.now() - pointerDownTime > TAP_THRESHOLD)
        return;
      if (isInteractiveTarget(event))
        return;
      const pointerType = event.pointerType;
      const clientX = event.clientX;
      const target = this.#target;
      const bindings = this.#bindings;
      const matches = { resolve: (type) => matchBindings(bindings, type, pointerType, clientX, target) };
      for (const recognizer of this.#recognizers)
        recognizer.handleUp(matches, event);
    }, { signal });
  }
  #maybeDisconnect() {
    if (this.#bindings.length > 0)
      return;
    for (const recognizer of this.#recognizers)
      recognizer.reset();
    this.#recognizers.clear();
    this.#disconnect?.abort();
    this.#disconnect = null;
  }
};
var coordinators = /* @__PURE__ */ new WeakMap;
function findGestureCoordinator(target) {
  return coordinators.get(target);
}
function getGestureCoordinator(target) {
  let coordinator = coordinators.get(target);
  if (!coordinator) {
    coordinator = new GestureCoordinator(target);
    coordinators.set(target, coordinator);
  }
  return coordinator;
}
function matchBindings(bindings, type, pointerType, clientX, target) {
  const rect = target.getBoundingClientRect();
  const activeRegions = getActiveRegions(bindings, type, pointerType);
  const region = activeRegions.size > 0 ? resolveRegion(clientX, rect, activeRegions) : null;
  const matches = [];
  for (const binding of bindings) {
    if (binding.disabled)
      continue;
    if (binding.type !== type)
      continue;
    if (binding.pointer && binding.pointer !== pointerType)
      continue;
    if (binding.region) {
      if (binding.region !== region)
        continue;
    } else if (region !== null)
      continue;
    matches.push(binding);
  }
  return matches;
}
function getActiveRegions(bindings, type, pointerType) {
  const regions = /* @__PURE__ */ new Set;
  for (const binding of bindings) {
    if (binding.disabled)
      continue;
    if (binding.type !== type)
      continue;
    if (binding.pointer && binding.pointer !== pointerType)
      continue;
    if (binding.region)
      regions.add(binding.region);
  }
  return regions;
}

// node_modules/@videojs/core/dist/dev/dom/presentation/remote-playback.js
function resolveRemote(media) {
  const target = media;
  if (isObject(target.remote) && "state" in target.remote && "prompt" in target.remote)
    return target.remote;
}
function isRemotePlaybackConnected(media) {
  return resolveRemote(media)?.state === "connected";
}
function isRemotePlaybackConnecting(media) {
  return resolveRemote(media)?.state === "connecting";
}
async function requestRemotePlayback(media) {
  const remote = resolveRemote(media);
  if (!remote)
    throw new DOMException("Remote playback not supported", "NotSupportedError");
  return remote.prompt();
}

// node_modules/@videojs/core/dist/dev/dom/store/features/controls.js
var IDLE_DELAY = 2000;
var TAP_THRESHOLD2 = 250;
var controlsFeature = definePlayerFeature({
  name: "controls",
  state: ({ get, set }) => ({
    userActive: true,
    controlsVisible: true,
    toggleControls() {
      const next = !get().userActive;
      set({
        userActive: next,
        controlsVisible: next
      });
      return next;
    }
  }),
  attach({ target, signal, get, set }) {
    const { media, container } = target;
    if (!isMediaPauseCapable(media) || isNull(container)) {
      if (isNull(container))
        console.warn("[vjs] controlsFeature requires a container element for activity tracking.");
      return;
    }
    const computeVisible = (userActive) => {
      return userActive || media.paused || isRemotePlaybackConnected(media) || isRemotePlaybackConnecting(media);
    };
    let idleTimer;
    function clearIdle() {
      clearTimeout(idleTimer);
      idleTimer = undefined;
    }
    function scheduleIdle() {
      clearIdle();
      idleTimer = setTimeout(setInactive, IDLE_DELAY);
    }
    function setActive() {
      if (!get().userActive)
        set({
          userActive: true,
          controlsVisible: true
        });
      scheduleIdle();
    }
    function setInactive() {
      clearIdle();
      set({
        userActive: false,
        controlsVisible: computeVisible(false)
      });
    }
    set({ toggleControls() {
      if (get().controlsVisible)
        setInactive();
      else
        setActive();
      return get().controlsVisible;
    } });
    let pointerDownTime = 0;
    function onPointerDown() {
      pointerDownTime = Date.now();
    }
    function onPointerUp(event) {
      if (event.pointerType === "touch" && Date.now() - pointerDownTime < TAP_THRESHOLD2) {
        if (findGestureCoordinator(container)?.bindings.some((b) => b.type === "tap" && b.action === "toggleControls" && (!b.pointer || b.pointer === "touch")))
          return;
        const isMediaOrContainer = [media, container].includes(event.target);
        if (get().controlsVisible && isMediaOrContainer)
          setInactive();
        else
          setActive();
      } else
        setActive();
    }
    const onPlaybackChange = () => {
      const { userActive } = get();
      set({ controlsVisible: computeVisible(userActive) });
      if (!media.paused && userActive)
        scheduleIdle();
    };
    listen(container, "pointermove", setActive, { signal });
    listen(container, "pointerdown", onPointerDown, { signal });
    listen(container, "pointerup", onPointerUp, { signal });
    listen(container, "keyup", setActive, { signal });
    listen(container, "focusin", setActive, { signal });
    listen(container, "mouseleave", setInactive, { signal });
    listen(media, "play", onPlaybackChange, { signal });
    listen(media, "pause", onPlaybackChange, { signal });
    listen(media, "ended", onPlaybackChange, { signal });
    if (isMediaRemotePlaybackCapable(media)) {
      const onCastChange = () => {
        const { userActive } = get();
        set({ controlsVisible: computeVisible(userActive) });
      };
      listen(media.remote, "connect", onCastChange, { signal });
      listen(media.remote, "connecting", onCastChange, { signal });
      listen(media.remote, "disconnect", onCastChange, { signal });
    }
    signal.addEventListener("abort", clearIdle, { once: true });
    scheduleIdle();
  }
});

// node_modules/@videojs/core/dist/dev/dom/store/features/error.js
var errorFeature = definePlayerFeature({
  name: "error",
  state: ({ set }) => ({
    error: null,
    dismissError() {
      set({ error: null });
    }
  }),
  attach({ target, signal, set }) {
    const { media } = target;
    if (!isMediaErrorCapable(media))
      return;
    const syncError = () => set({ error: media.error });
    listen(media, "error", syncError, { signal });
    listen(media, "emptied", () => set({ error: null }), { signal });
  }
});

// node_modules/@videojs/core/dist/dev/dom/presentation/fullscreen.js
function isFullscreenEnabled() {
  const doc = document;
  if (doc.fullscreenEnabled || doc.webkitFullscreenEnabled)
    return true;
  return isFunction(document.createElement("video").webkitSetPresentationMode);
}
function getFullscreenElement() {
  const doc = document;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}
function matchesFullscreen(element) {
  if (!(element instanceof Element))
    return false;
  try {
    return element.matches(":fullscreen");
  } catch {
    return false;
  }
}
function isFullscreen(container, media) {
  if (media.webkitPresentationMode === "fullscreen")
    return true;
  const fullscreenElement = getFullscreenElement();
  if (fullscreenElement && (fullscreenElement === container || fullscreenElement === media))
    return true;
  if (matchesFullscreen(container) || matchesFullscreen(media))
    return true;
  return media.isFullscreen ?? false;
}
async function requestFullscreen(container, media) {
  const doc = document;
  if (container && (doc.fullscreenEnabled || doc.webkitFullscreenEnabled)) {
    const el = container;
    if (isFunction(el.requestFullscreen))
      return el.requestFullscreen();
    if (isFunction(el.webkitRequestFullscreen))
      return el.webkitRequestFullscreen();
  }
  const webkitVideo = media;
  if (isFunction(webkitVideo.webkitSetPresentationMode)) {
    webkitVideo.webkitSetPresentationMode("fullscreen");
    return;
  }
  const video = media;
  if (isFunction(video.requestFullscreen))
    return video.requestFullscreen();
}
async function exitFullscreen(media) {
  const doc = document;
  const webkitVideo = media;
  if (webkitVideo.webkitPresentationMode === "fullscreen" && isFunction(webkitVideo.webkitSetPresentationMode)) {
    webkitVideo.webkitSetPresentationMode("inline");
    return;
  }
  if (isFunction(doc.exitFullscreen))
    return doc.exitFullscreen();
  if (isFunction(doc.webkitExitFullscreen))
    return doc.webkitExitFullscreen();
  const video = media;
  if (isFunction(video.exitFullscreen))
    return video.exitFullscreen();
}

// node_modules/@videojs/core/dist/dev/dom/presentation/pip.js
function isPictureInPictureEnabled() {
  if (document.pictureInPictureEnabled) {
    const isSafari = /.*Version\/.*Safari\/.*/.test(navigator.userAgent);
    const isPWA = typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches;
    return !isSafari || !isPWA;
  }
  return isFunction(document.createElement("video").webkitSetPresentationMode);
}
function isPictureInPicture(media) {
  if (media.webkitPresentationMode === "picture-in-picture")
    return true;
  if (document.pictureInPictureElement === media)
    return true;
  return media.isPictureInPicture ?? false;
}
async function requestPictureInPicture(media) {
  const webkitVideo = media;
  if (isFunction(webkitVideo.webkitSetPresentationMode)) {
    webkitVideo.webkitSetPresentationMode("picture-in-picture");
    return;
  }
  const video = media;
  if (isFunction(video.requestPictureInPicture))
    return video.requestPictureInPicture();
}
async function exitPictureInPicture(media) {
  const webkitVideo = media;
  if (webkitVideo.webkitPresentationMode === "picture-in-picture" && isFunction(webkitVideo.webkitSetPresentationMode)) {
    webkitVideo.webkitSetPresentationMode("inline");
    return;
  }
  if (isFunction(document.exitPictureInPicture))
    return document.exitPictureInPicture();
  const video = media;
  if (isFunction(video.exitPictureInPicture))
    return video.exitPictureInPicture();
}

// node_modules/@videojs/core/dist/dev/dom/store/features/fullscreen.js
var fullscreenFeature = definePlayerFeature({
  name: "fullscreen",
  state: ({ target }) => ({
    fullscreen: false,
    fullscreenAvailability: "unavailable",
    async requestFullscreen() {
      const { media, container } = target();
      if (isPictureInPicture(media))
        await exitPictureInPicture(media);
      return requestFullscreen(container, media);
    },
    async exitFullscreen() {
      const { media } = target();
      return exitFullscreen(media);
    },
    async toggleFullscreen() {
      const { media, container } = target();
      if (isFullscreen(container, media))
        return exitFullscreen(media);
      if (isPictureInPicture(media))
        await exitPictureInPicture(media);
      return requestFullscreen(container, media);
    }
  }),
  attach({ target, signal, set }) {
    const { media, container } = target;
    set({ fullscreenAvailability: isFullscreenEnabled() ? "available" : "unsupported" });
    const sync = () => set({ fullscreen: isFullscreen(container, media) });
    sync();
    listen(document, "fullscreenchange", sync, { signal });
    listen(document, "webkitfullscreenchange", sync, { signal });
    if ("webkitPresentationMode" in media)
      listen(media, "webkitpresentationmodechanged", sync, { signal });
  }
});

// node_modules/@videojs/core/dist/dev/dom/store/features/live.js
var liveFeature = definePlayerFeature({
  name: "live",
  state: () => ({
    liveEdgeStart: NaN,
    targetLiveWindow: NaN
  }),
  attach({ target, signal, set }) {
    const { media } = target;
    if (!isMediaLiveCapable(media))
      return;
    const sync = () => set({
      liveEdgeStart: media.liveEdgeStart,
      targetLiveWindow: media.targetLiveWindow
    });
    sync();
    listen(media, "targetlivewindowchange", sync, { signal });
    listen(media, "streamtypechange", sync, { signal });
    listen(media, "loadedmetadata", sync, { signal });
    listen(media, "canplay", sync, { signal });
    listen(media, "progress", sync, { signal });
    listen(media, "durationchange", sync, { signal });
    listen(media, "timeupdate", sync, { signal });
    listen(media, "emptied", sync, { signal });
  }
});

// node_modules/@videojs/core/dist/dev/dom/store/features/pip.js
var pipFeature = definePlayerFeature({
  name: "pip",
  state: ({ target }) => ({
    pip: false,
    pipAvailability: "unavailable",
    async requestPictureInPicture() {
      const { media, container } = target();
      if (isFullscreen(container, media))
        await exitFullscreen(media);
      return requestPictureInPicture(media);
    },
    async exitPictureInPicture() {
      const { media } = target();
      return exitPictureInPicture(media);
    },
    async togglePictureInPicture() {
      const { media, container } = target();
      if (isPictureInPicture(media))
        return exitPictureInPicture(media);
      if (isFullscreen(container, media))
        await exitFullscreen(media);
      return requestPictureInPicture(media);
    }
  }),
  attach({ target, signal, set }) {
    const { media } = target;
    set({ pipAvailability: isPictureInPictureEnabled() ? "available" : "unsupported" });
    const sync = () => set({ pip: isPictureInPicture(media) });
    sync();
    listen(media, "enterpictureinpicture", sync, { signal });
    listen(media, "leavepictureinpicture", sync, { signal });
    if ("webkitPresentationMode" in media)
      listen(media, "webkitpresentationmodechanged", sync, { signal });
  }
});

// node_modules/@videojs/core/dist/dev/dom/store/features/playback.js
var playbackFeature = definePlayerFeature({
  name: "playback",
  state: ({ target }) => ({
    paused: true,
    ended: false,
    started: false,
    waiting: false,
    play() {
      return target().media.play();
    },
    pause() {
      const { media } = target();
      if (isMediaPauseCapable(media))
        media.pause();
    },
    togglePaused() {
      const media = target().media;
      if (!isMediaPauseCapable(media))
        return false;
      if (media.paused) {
        media.play();
        return true;
      }
      media.pause();
      return false;
    }
  }),
  attach({ target, signal, set }) {
    const { media } = target;
    if (!isMediaPauseCapable(media) || !isMediaSeekCapable(media) || !isMediaSourceCapable(media))
      return;
    const sync = () => set({
      paused: media.paused,
      ended: media.ended,
      started: !media.paused || media.currentTime > 0,
      waiting: media.readyState < HTMLMediaElement.HAVE_FUTURE_DATA && !media.paused
    });
    sync();
    listen(media, "emptied", sync, { signal });
    listen(media, "play", sync, { signal });
    listen(media, "pause", sync, { signal });
    listen(media, "ended", sync, { signal });
    listen(media, "playing", sync, { signal });
    listen(media, "waiting", sync, { signal });
    listen(media, "seeked", sync, { signal });
  }
});

// node_modules/@videojs/core/dist/dev/dom/store/features/playback-rate.js
var DEFAULT_RATES = [
  0.2,
  0.5,
  0.7,
  1,
  1.2,
  1.5,
  1.7,
  2
];
var playbackRateFeature = definePlayerFeature({
  name: "playbackRate",
  state: ({ target }) => ({
    playbackRates: DEFAULT_RATES,
    playbackRate: 1,
    setPlaybackRate(rate) {
      const { media } = target();
      if (isMediaPlaybackRateCapable(media))
        media.playbackRate = rate;
    }
  }),
  attach({ target, signal, set }) {
    const { media } = target;
    if (!isMediaPlaybackRateCapable(media))
      return;
    const sync = () => set({ playbackRate: media.playbackRate });
    sync();
    listen(media, "ratechange", sync, { signal });
  }
});

// node_modules/@videojs/core/dist/dev/dom/store/features/remote-playback.js
var remotePlaybackFeature = definePlayerFeature({
  name: "remotePlayback",
  state: ({ target }) => ({
    remotePlaybackState: "disconnected",
    remotePlaybackAvailability: "unsupported",
    async toggleRemotePlayback() {
      const { media, container } = target();
      if (isRemotePlaybackConnected(media))
        return requestRemotePlayback(media);
      if (isFullscreen(container, media))
        await exitFullscreen(media);
      return requestRemotePlayback(media);
    }
  }),
  attach({ target, signal, set }) {
    const { media } = target;
    if (!isMediaRemotePlaybackCapable(media))
      return;
    const syncState = () => set({ remotePlaybackState: media.remote.state });
    syncState();
    listen(media.remote, "connect", syncState, { signal });
    listen(media.remote, "connecting", syncState, { signal });
    listen(media.remote, "disconnect", syncState, { signal });
    media.remote.watchAvailability((available) => {
      set({ remotePlaybackAvailability: available ? "available" : "unavailable" });
    }).catch(() => {
      set({ remotePlaybackAvailability: "unsupported" });
    });
    signal.addEventListener("abort", () => {
      media.remote?.cancelWatchAvailability().catch(() => {});
    });
  }
});

// node_modules/@videojs/core/dist/dev/dom/store/features/source.js
var sourceFeature = definePlayerFeature({
  name: "source",
  state: ({ target, signals }) => ({
    source: null,
    canPlay: false,
    loadSource(src) {
      signals.clear();
      const { media } = target();
      if (!isMediaSourceCapable(media))
        return src;
      media.src = src;
      media.load();
      return src;
    }
  }),
  attach({ target, signal, set }) {
    const { media } = target;
    if (!isMediaSourceCapable(media))
      return;
    const sync = () => set({
      source: media.currentSrc || media.src || null,
      canPlay: media.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA
    });
    sync();
    listen(media, "canplay", sync, { signal });
    listen(media, "canplaythrough", sync, { signal });
    listen(media, "loadstart", sync, { signal });
    listen(media, "emptied", sync, { signal });
  }
});

// node_modules/@videojs/core/dist/dev/core/media/types.js
var MediaStreamTypes = {
  ON_DEMAND: "on-demand",
  LIVE: "live",
  UNKNOWN: "unknown"
};

// node_modules/@videojs/core/dist/dev/dom/store/features/stream-type.js
var streamTypeFeature = definePlayerFeature({
  name: "streamType",
  state: () => ({ streamType: MediaStreamTypes.UNKNOWN }),
  attach({ target, signal, set }) {
    const { media } = target;
    if (isMediaStreamTypeCapable(media)) {
      const sync2 = () => set({ streamType: media.streamType });
      sync2();
      listen(media, "streamtypechange", sync2, { signal });
      return;
    }
    if (!isMediaSeekCapable(media))
      return;
    const detect = () => {
      const { duration } = media;
      if (duration === Number.POSITIVE_INFINITY)
        return MediaStreamTypes.LIVE;
      if (Number.isFinite(duration) && duration > 0)
        return MediaStreamTypes.ON_DEMAND;
      return MediaStreamTypes.UNKNOWN;
    };
    const sync = () => set({ streamType: detect() });
    sync();
    listen(media, "durationchange", sync, { signal });
    listen(media, "loadedmetadata", sync, { signal });
    listen(media, "emptied", sync, { signal });
    if (isMediaBufferCapable(media))
      listen(media, "progress", sync, { signal });
  }
});

// node_modules/@videojs/core/dist/dev/dom/store/features/text-track.js
var textTrackFeature = definePlayerFeature({
  name: "textTrack",
  state: ({ target }) => ({
    chaptersCues: [],
    thumbnailCues: [],
    thumbnailTrackSrc: null,
    textTrackList: [],
    subtitlesShowing: false,
    toggleSubtitles(forceShow) {
      const { media } = target();
      if (!isMediaTextTrackCapable(media))
        return false;
      const subtitlesTracks = getTextTrackList(media, (track) => track.kind === "subtitles" || track.kind === "captions");
      if (!subtitlesTracks.length)
        return false;
      const showing = subtitlesTracks.some((track) => track.mode === "showing");
      const nextShowing = forceShow ?? !showing;
      for (const track of subtitlesTracks)
        track.mode = nextShowing ? "showing" : "disabled";
      return nextShowing;
    }
  }),
  attach({ target, signal, set }) {
    const { media } = target;
    if (!isMediaTextTrackCapable(media))
      return;
    let trackCleanup = null;
    const sync = () => {
      trackCleanup?.abort();
      trackCleanup = new AbortController;
      let chaptersTrack = null;
      let thumbnailTrack = null;
      const textTrackList = [];
      let subtitlesShowing = false;
      for (let i = 0;i < media.textTracks.length; i++) {
        const track = media.textTracks[i];
        if (!chaptersTrack && track.kind === "chapters")
          chaptersTrack = track;
        if (!thumbnailTrack && track.kind === "metadata" && track.label === "thumbnails")
          thumbnailTrack = track;
        textTrackList.push({
          kind: track.kind,
          label: track.label,
          language: track.language,
          mode: track.mode
        });
        if ((track.kind === "captions" || track.kind === "subtitles") && track.mode === "showing")
          subtitlesShowing = true;
      }
      const chaptersCues = chaptersTrack?.cues ? Array.from(chaptersTrack.cues) : [];
      const thumbnailCues = thumbnailTrack?.cues ? Array.from(thumbnailTrack.cues) : [];
      let thumbnailTrackSrc = null;
      if (thumbnailTrack)
        thumbnailTrackSrc = findTrackElement(media, thumbnailTrack)?.src ?? null;
      const tracks = isQuerySelectorAllCapable(media) && media.querySelectorAll("track") || [];
      const shadowTracks = media instanceof HTMLElement && media.shadowRoot?.querySelectorAll("track") || [];
      for (const trackEl of [...tracks, ...shadowTracks])
        if (!trackEl.track?.cues?.length)
          listen(trackEl, "load", sync, { signal: trackCleanup.signal });
      set({
        chaptersCues,
        thumbnailCues,
        thumbnailTrackSrc,
        textTrackList,
        subtitlesShowing
      });
    };
    sync();
    const textTracks = media.textTracks;
    if (textTracks instanceof EventTarget) {
      listen(textTracks, "addtrack", sync, { signal });
      listen(textTracks, "removetrack", sync, { signal });
      listen(textTracks, "change", sync, { signal });
    }
    listen(media, "loadstart", sync, { signal });
    signal.addEventListener("abort", () => trackCleanup?.abort(), { once: true });
  }
});

// node_modules/@videojs/core/dist/dev/dom/store/signal-keys.js
var signalKeys = { seek: Symbol.for("@videojs/seek") };

// node_modules/@videojs/core/dist/dev/dom/store/features/time.js
var timeFeature = definePlayerFeature({
  name: "time",
  state: ({ target, signals, set }) => ({
    currentTime: 0,
    duration: 0,
    seeking: false,
    async seek(time) {
      const { media } = target(), signal = signals.supersede(signalKeys.seek);
      if (!isMediaSeekCapable(media) || !isMediaSourceCapable(media))
        return 0;
      if (!hasMetadata(media)) {
        if (!await onEvent(media, "loadedmetadata", { signal }).catch(() => false))
          return media.currentTime;
      }
      const clampedTime = Math.max(0, Math.min(time, media.duration || Infinity));
      set({
        currentTime: clampedTime,
        seeking: true
      });
      media.currentTime = clampedTime;
      await onEvent(media, "seeked", { signal }).catch(noop);
      return media.currentTime;
    }
  }),
  attach({ target, signal, set, get }) {
    const { media } = target;
    if (!isMediaSeekCapable(media))
      return;
    const resolveDuration = () => {
      const { duration } = media;
      if (duration === Number.POSITIVE_INFINITY && isMediaBufferCapable(media)) {
        const { seekable } = media;
        return seekable.length > 0 ? seekable.end(seekable.length - 1) : 0;
      }
      return Number.isFinite(duration) ? duration : 0;
    };
    const sync = () => set({
      currentTime: media.currentTime,
      duration: resolveDuration(),
      seeking: media.seeking
    });
    const syncUnlessSeeking = () => {
      if (get().seeking)
        return;
      sync();
    };
    sync();
    listen(media, "timeupdate", syncUnlessSeeking, { signal });
    listen(media, "durationchange", sync, { signal });
    listen(media, "seeking", sync, { signal });
    listen(media, "seeked", sync, { signal });
    listen(media, "loadedmetadata", sync, { signal });
    listen(media, "emptied", sync, { signal });
    listen(media, "progress", syncUnlessSeeking, { signal });
  }
});

// node_modules/@videojs/core/dist/dev/dom/store/features/volume.js
var UNMUTE_VOLUME = 0.25;
var volumeFeature = definePlayerFeature({
  name: "volume",
  state: ({ target }) => ({
    volume: 1,
    muted: false,
    volumeAvailability: "unavailable",
    setVolume(volume) {
      const { media } = target();
      if (!isMediaVolumeCapable(media))
        return 0;
      const clamped = Math.max(0, Math.min(1, volume));
      if (clamped > 0 && media.muted)
        media.muted = false;
      media.volume = clamped;
      return media.volume;
    },
    toggleMuted() {
      const { media } = target();
      if (!isMediaVolumeCapable(media))
        return false;
      if (media.muted || media.volume === 0) {
        media.muted = false;
        if (media.volume === 0)
          media.volume = UNMUTE_VOLUME;
      } else
        media.muted = true;
      return media.muted;
    }
  }),
  attach({ target, signal, set }) {
    const { media } = target;
    if (!isMediaVolumeCapable(media))
      return;
    set({ volumeAvailability: canSetVolume() });
    const sync = () => set({
      volume: media.volume,
      muted: media.muted
    });
    sync();
    listen(media, "volumechange", sync, { signal });
  }
});
function canSetVolume() {
  const video = document.createElement("video");
  try {
    video.volume = 0.5;
    return video.volume === 0.5 ? "available" : "unsupported";
  } catch {
    return "unsupported";
  }
}

// node_modules/@videojs/core/dist/dev/dom/store/selectors.js
var selectBuffer = createSelector(bufferFeature);
var selectControls = createSelector(controlsFeature);
var selectError = createSelector(errorFeature);
var selectFullscreen = createSelector(fullscreenFeature);
var selectLive = createSelector(liveFeature);
var selectPiP = createSelector(pipFeature);
var selectPlayback = createSelector(playbackFeature);
var selectPlaybackRate = createSelector(playbackRateFeature);
var selectRemotePlayback = createSelector(remotePlaybackFeature);
var selectSource = createSelector(sourceFeature);
var selectStreamType = createSelector(streamTypeFeature);
var selectTextTrack = createSelector(textTrackFeature);
var selectTime = createSelector(timeFeature);
var selectVolume = createSelector(volumeFeature);

// node_modules/@videojs/core/dist/dev/dom/media-actions.js
var MEDIA_INPUT_ACTION_OVERRIDES = {
  seekStep({ store, value }) {
    if (isUndefined(value))
      return;
    const time = selectTime(store.state);
    if (!time)
      return;
    time.seek(time.currentTime + value);
  },
  volumeStep({ store, value }) {
    if (isUndefined(value))
      return;
    const vol = selectVolume(store.state);
    if (!vol)
      return;
    vol.setVolume(vol.volume + value);
  },
  speedUp({ store }) {
    const rate = selectPlaybackRate(store.state);
    if (!rate)
      return;
    const { playbackRates, playbackRate } = rate;
    const idx = playbackRates.indexOf(playbackRate);
    const next = idx < 0 || idx >= playbackRates.length - 1 ? 0 : idx + 1;
    rate.setPlaybackRate(playbackRates[next]);
  },
  speedDown({ store }) {
    const rate = selectPlaybackRate(store.state);
    if (!rate)
      return;
    const { playbackRates, playbackRate } = rate;
    const idx = playbackRates.indexOf(playbackRate);
    const next = idx <= 0 ? playbackRates.length - 1 : idx - 1;
    rate.setPlaybackRate(playbackRates[next]);
  }
};

// node_modules/@videojs/core/dist/dev/dom/gesture/actions.js
var GESTURE_ACTION_OVERRIDES = {
  seekStep: MEDIA_INPUT_ACTION_OVERRIDES.seekStep,
  volumeStep: MEDIA_INPUT_ACTION_OVERRIDES.volumeStep,
  speedUp: MEDIA_INPUT_ACTION_OVERRIDES.speedUp,
  speedDown: MEDIA_INPUT_ACTION_OVERRIDES.speedDown
};
function resolveGestureAction(name) {
  const override = GESTURE_ACTION_OVERRIDES[name];
  if (override)
    return override;
  return ({ store }) => {
    const method = store.state[name];
    if (isFunction(method))
      method();
    else
      console.warn(`[vjs-gesture] Unknown action: "${name}"`);
  };
}

// node_modules/@videojs/core/dist/dev/dom/gesture/tap.js
var DOUBLETAP_WINDOW = 200;
var TapRecognizer = class {
  #lastTapTime = 0;
  #tapTimer = null;
  handleUp(matches, event) {
    if (matches.resolve("doubletap").length > 0) {
      const now = Date.now();
      if (now - this.#lastTapTime < DOUBLETAP_WINDOW) {
        this.#clearTimer();
        this.#lastTapTime = 0;
        matches.resolve("doubletap")[0]?.onActivate(event);
        return;
      }
      this.#lastTapTime = now;
      this.#clearTimer();
      this.#tapTimer = setTimeout(() => {
        this.#tapTimer = null;
        this.#lastTapTime = 0;
        matches.resolve("tap")[0]?.onActivate(event);
      }, DOUBLETAP_WINDOW);
      return;
    }
    matches.resolve("tap")[0]?.onActivate(event);
  }
  #clearTimer() {
    if (this.#tapTimer !== null) {
      clearTimeout(this.#tapTimer);
      this.#tapTimer = null;
    }
  }
  reset() {
    this.#clearTimer();
    this.#lastTapTime = 0;
  }
};

// node_modules/@videojs/core/dist/dev/dom/gesture/create-tap-gesture.js
var recognizers = /* @__PURE__ */ new WeakMap;
function getRecognizer(target) {
  let recognizer = recognizers.get(target);
  if (recognizer)
    return recognizer;
  recognizer = new TapRecognizer;
  recognizers.set(target, recognizer);
  return recognizer;
}
function createTapGesture(target, onActivate, options) {
  return getGestureCoordinator(target).add({
    type: "tap",
    recognizer: getRecognizer(target),
    onActivate,
    pointer: options?.pointer,
    region: options?.region,
    disabled: options?.disabled,
    action: options?.action,
    value: options?.value
  });
}
function createDoubleTapGesture(target, onActivate, options) {
  return getGestureCoordinator(target).add({
    type: "doubletap",
    recognizer: getRecognizer(target),
    onActivate,
    pointer: options?.pointer,
    region: options?.region,
    disabled: options?.disabled,
    action: options?.action,
    value: options?.value
  });
}

// node_modules/@videojs/core/dist/dev/dom/hotkey/actions.js
function isHotkeyToggleAction(action) {
  return action.startsWith("toggle");
}
var HOTKEY_ACTIONS = {
  togglePaused({ store }) {
    const playback = selectPlayback(store.state);
    if (!playback)
      return;
    playback.paused ? playback.play() : playback.pause();
  },
  toggleMuted({ store }) {
    selectVolume(store.state)?.toggleMuted();
  },
  toggleFullscreen({ store }) {
    const fs = selectFullscreen(store.state);
    if (!fs)
      return;
    fs.fullscreen ? fs.exitFullscreen() : fs.requestFullscreen();
  },
  toggleSubtitles({ store }) {
    selectTextTrack(store.state)?.toggleSubtitles();
  },
  togglePictureInPicture({ store }) {
    const pip = selectPiP(store.state);
    if (!pip)
      return;
    pip.pip ? pip.exitPictureInPicture() : pip.requestPictureInPicture();
  },
  seekStep: MEDIA_INPUT_ACTION_OVERRIDES.seekStep,
  volumeStep: MEDIA_INPUT_ACTION_OVERRIDES.volumeStep,
  speedUp: MEDIA_INPUT_ACTION_OVERRIDES.speedUp,
  speedDown: MEDIA_INPUT_ACTION_OVERRIDES.speedDown,
  seekToPercent({ store, value, key }) {
    const time = selectTime(store.state);
    if (!time || time.duration <= 0)
      return;
    let percent;
    if (!isUndefined(value))
      percent = value;
    else if (key >= "0" && key <= "9")
      percent = Number(key) * 10;
    else
      return;
    time.seek(percent / 100 * time.duration);
  }
};
function resolveHotkeyAction(name) {
  const resolver = HOTKEY_ACTIONS[name];
  if (!resolver)
    console.warn(`[vjs-hotkey] Unknown action: "${name}"`);
  return resolver;
}
// node_modules/@videojs/core/dist/dev/dom/hotkey/aria.js
var ARIA_MODIFIER_MAP = {
  shift: "Shift",
  ctrl: "Control",
  alt: "Alt",
  meta: "Meta"
};
var MODIFIER_ORDER = [
  "ctrl",
  "shift",
  "alt",
  "meta"
];
function toAriaKeyShortcut(bindings) {
  return bindings.map((b) => {
    const parts = [];
    for (const mod of MODIFIER_ORDER)
      if (b.modifiers.has(mod))
        parts.push(ARIA_MODIFIER_MAP[mod]);
    parts.push(b.originalKey);
    return parts.join("+");
  }).join(" ");
}

// node_modules/@videojs/core/dist/dev/dom/hotkey/coordinator.js
var HotkeyCoordinator = class {
  #target;
  #bindings = [];
  #nextId = 0;
  #disconnect = null;
  #docDisconnect = null;
  #ariaRegistry = /* @__PURE__ */ new Map;
  #subscribers = /* @__PURE__ */ new Set;
  #destroyed = false;
  constructor(target) {
    this.#target = target;
  }
  subscribe(callback) {
    this.#subscribers.add(callback);
    return () => this.#subscribers.delete(callback);
  }
  add(options) {
    const parsed = parseHotkeyPattern(options.keys);
    const binding = {
      parsed,
      options,
      id: this.#nextId++
    };
    this.#bindings.push(binding);
    this.#sortBindings();
    if (options.action)
      this.#addToAriaRegistry(options.action, parsed);
    if (options.target === "document")
      this.#connectDocument();
    else
      this.#connect();
    let removed = false;
    return () => {
      if (removed)
        return;
      removed = true;
      const idx = this.#bindings.indexOf(binding);
      if (idx !== -1)
        this.#bindings.splice(idx, 1);
      if (options.action)
        this.#removeFromAriaRegistry(options.action, parsed);
      this.#maybeDisconnect();
    };
  }
  getAriaKeys(action) {
    const bindings = this.#ariaRegistry.get(action);
    if (!bindings?.length)
      return;
    return toAriaKeyShortcut(bindings);
  }
  destroy() {
    if (this.#destroyed)
      return;
    this.#destroyed = true;
    this.#disconnect?.abort();
    this.#disconnect = null;
    this.#docDisconnect?.abort();
    this.#docDisconnect = null;
    this.#bindings = [];
    this.#ariaRegistry.clear();
  }
  #sortBindings() {
    this.#bindings.sort((a, b) => {
      const specDiff = b.parsed[0].modifiers.size - a.parsed[0].modifiers.size;
      if (specDiff !== 0)
        return specDiff;
      return a.id - b.id;
    });
  }
  #connect() {
    if (this.#disconnect)
      return;
    this.#disconnect = new AbortController;
    listen(this.#target, "keydown", this.#handleEvent, { signal: this.#disconnect.signal });
  }
  #connectDocument() {
    if (this.#docDisconnect)
      return;
    this.#docDisconnect = new AbortController;
    listen(document, "keydown", this.#handleEvent, { signal: this.#docDisconnect.signal });
  }
  #maybeDisconnect() {
    const hasPlayer = this.#bindings.some((b) => b.options.target !== "document");
    const hasDoc = this.#bindings.some((b) => b.options.target === "document");
    if (!hasPlayer) {
      this.#disconnect?.abort();
      this.#disconnect = null;
    }
    if (!hasDoc) {
      this.#docDisconnect?.abort();
      this.#docDisconnect = null;
    }
  }
  #handleEvent = (event) => {
    if (event.key === "Unidentified")
      return;
    if (isInteractiveActivation(event))
      return;
    if (event.defaultPrevented)
      return;
    const editable = isEditableTarget(event);
    for (const binding of this.#bindings) {
      const { options, parsed } = binding;
      if (options.disabled)
        continue;
      if (event.repeat && options.repeatable === false)
        continue;
      if (options.target === "document" !== (event.currentTarget === document))
        continue;
      for (const p of parsed) {
        if (!matchesHotkeyEvent(p, event))
          continue;
        if (editable && p.modifiers.size === 0)
          continue;
        if (this.#subscribers.size > 0) {
          const activateEvent = {
            source: "hotkey",
            action: options.action,
            value: options.value,
            event
          };
          for (const cb of this.#subscribers)
            try {
              cb(activateEvent);
            } catch (error) {
              console.warn("[vjs-hotkey] subscribe callback threw:", error);
            }
        }
        event.preventDefault();
        options.onActivate(event, p.originalKey);
        return;
      }
    }
  };
  #addToAriaRegistry(action, bindings) {
    let existing = this.#ariaRegistry.get(action);
    if (!existing) {
      existing = [];
      this.#ariaRegistry.set(action, existing);
    }
    existing.push(...bindings);
  }
  #removeFromAriaRegistry(action, bindings) {
    const existing = this.#ariaRegistry.get(action);
    if (!existing)
      return;
    const filtered = existing.filter((b) => !bindings.includes(b));
    if (filtered.length === 0)
      this.#ariaRegistry.delete(action);
    else
      this.#ariaRegistry.set(action, filtered);
  }
};

// node_modules/@videojs/core/dist/dev/dom/hotkey/hotkey.js
var MODIFIER_KEYS = new Set([
  "shift",
  "ctrl",
  "alt",
  "meta"
]);
function parseHotkeyPattern(pattern) {
  if (pattern === "0-9")
    return Array.from({ length: 10 }, (_, i) => ({
      modifiers: /* @__PURE__ */ new Set,
      key: String(i),
      originalKey: String(i)
    }));
  const segments = pattern.split("+");
  const rawKey = segments.pop();
  const modifiers = /* @__PURE__ */ new Set;
  for (const seg of segments) {
    const lower = seg.toLowerCase();
    if (lower === "mod")
      modifiers.add(isMacOS() ? "meta" : "ctrl");
    else if (MODIFIER_KEYS.has(lower))
      modifiers.add(lower);
    else
      console.warn(`[vjs-hotkey] Unknown modifier: "${seg}" in pattern "${pattern}"`);
  }
  return [{
    modifiers,
    key: rawKey === "Space" ? " " : rawKey.toLowerCase(),
    originalKey: rawKey
  }];
}
function isImplicitModifierKey(key) {
  return key.length === 1 && !/[a-z]/i.test(key);
}
function matchesHotkeyEvent(binding, event) {
  if (event.key === "Unidentified")
    return false;
  if (event.key.toLowerCase() !== binding.key)
    return false;
  const implicit = isImplicitModifierKey(event.key);
  const shiftKey = implicit ? event.shiftKey && binding.modifiers.has("shift") : event.shiftKey;
  const altKey = implicit ? event.altKey && binding.modifiers.has("alt") : event.altKey;
  if (shiftKey !== binding.modifiers.has("shift"))
    return false;
  if (event.ctrlKey !== binding.modifiers.has("ctrl"))
    return false;
  if (altKey !== binding.modifiers.has("alt"))
    return false;
  if (event.metaKey !== binding.modifiers.has("meta"))
    return false;
  return true;
}
var coordinators2 = /* @__PURE__ */ new WeakMap;
function findHotkeyCoordinator(target) {
  return coordinators2.get(target);
}
function getHotkeyCoordinator(target) {
  let coordinator = coordinators2.get(target);
  if (!coordinator) {
    coordinator = new HotkeyCoordinator(target);
    coordinators2.set(target, coordinator);
  }
  return coordinator;
}
function createHotkey(target, options) {
  return getHotkeyCoordinator(target).add(options);
}
// node_modules/@videojs/core/dist/dev/dom/store/features/presets.js
var videoFeatures = [
  playbackFeature,
  playbackRateFeature,
  volumeFeature,
  timeFeature,
  sourceFeature,
  bufferFeature,
  fullscreenFeature,
  pipFeature,
  remotePlaybackFeature,
  controlsFeature,
  textTrackFeature,
  errorFeature
];
// node_modules/@videojs/core/dist/dev/dom/ui/dismiss-layer.js
function createDismissLayer(options) {
  const { transition } = options;
  const state = transition.state;
  const abort = new AbortController;
  let docAbort = null;
  function open() {
    if (abort.signal.aborted)
      return null;
    const { active, status } = state.current;
    if (active && status !== "ending")
      return null;
    if (status === "ending")
      transition.cancel();
    return transition.open();
  }
  function close(element) {
    const { active, status } = state.current;
    if (abort.signal.aborted || !active || status === "ending")
      return null;
    return transition.close(element);
  }
  function setupDocumentListeners() {
    cleanupDocumentListeners();
    if (typeof document === "undefined")
      return;
    docAbort = new AbortController;
    const { signal } = docAbort;
    listen(document, "keydown", handleKeydown, { signal });
    options.onDocumentActive?.(signal);
  }
  function cleanupDocumentListeners() {
    docAbort?.abort();
    docAbort = null;
  }
  function handleKeydown(event) {
    if (event.key !== "Escape")
      return;
    if (event.defaultPrevented)
      return;
    if (!state.current.active)
      return;
    if (!(options.closeOnEscape?.() ?? true))
      return;
    options.onEscapeDismiss(event);
  }
  const unsubscribe = state.subscribe(() => {
    if (state.current.active)
      setupDocumentListeners();
    else
      cleanupDocumentListeners();
  });
  abort.signal.addEventListener("abort", () => {
    unsubscribe();
    transition.destroy();
    cleanupDocumentListeners();
  });
  function destroy() {
    if (abort.signal.aborted)
      return;
    abort.abort();
  }
  return {
    input: state,
    open,
    close,
    signal: abort.signal,
    destroy
  };
}

// node_modules/@videojs/core/dist/dev/dom/ui/alert-dialog.js
function createAlertDialog(options) {
  const { onOpenChange } = options;
  let element = null;
  let previousFocus = null;
  let elementAbort = null;
  const layer = createDismissLayer({
    transition: options.transition,
    closeOnEscape: options.closeOnEscape,
    onEscapeDismiss(event) {
      event.stopPropagation();
      applyClose();
    }
  });
  const state = layer.input;
  function applyOpen() {
    previousFocus = document.activeElement;
    const opening = layer.open();
    if (!opening)
      return;
    onOpenChange(true);
    requestAnimationFrame(() => {
      if (layer.signal.aborted || !state.current.active)
        return;
      element?.focus();
    });
    opening.then(() => {
      if (layer.signal.aborted || !state.current.active)
        return;
      options.onOpenChangeComplete?.(true);
    });
  }
  function applyClose() {
    const closing = layer.close(element);
    if (!closing)
      return;
    onOpenChange(false);
    closing.then(() => {
      if (layer.signal.aborted)
        return;
      if (previousFocus) {
        previousFocus.focus();
        previousFocus = null;
      }
      options.onOpenChangeComplete?.(false);
    });
  }
  function setupElementListeners() {
    cleanupElementListeners();
    if (!element)
      return;
    elementAbort = new AbortController;
    const { signal } = elementAbort;
    listen(element, "click", handleElementClick, { signal });
  }
  function cleanupElementListeners() {
    elementAbort?.abort();
    elementAbort = null;
  }
  function handleElementClick(event) {
    if (event.target instanceof HTMLButtonElement)
      applyClose();
  }
  function setElement(el) {
    element = el;
    setupElementListeners();
  }
  layer.signal.addEventListener("abort", () => {
    cleanupElementListeners();
    element = null;
    previousFocus = null;
  });
  return {
    input: state,
    open: applyOpen,
    close: applyClose,
    setElement,
    destroy: layer.destroy
  };
}

// node_modules/@videojs/core/dist/dev/dom/ui/button.js
function createButton(options) {
  const { onActivate, isDisabled } = options;
  return {
    role: "button",
    tabIndex: 0,
    onClick(event) {
      if (isDisabled()) {
        event.preventDefault();
        return;
      }
      onActivate();
    },
    onPointerDown(event) {
      if (isDisabled())
        event.preventDefault();
    },
    onMouseDown(event) {
      if (isDisabled())
        event.preventDefault();
    },
    onKeyDown(event) {
      if (event.target !== event.currentTarget)
        return;
      if (isDisabled()) {
        if (event.key !== "Tab")
          event.preventDefault();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        onActivate();
      } else if (event.key === " ")
        event.preventDefault();
    },
    onKeyUp(event) {
      if (event.target !== event.currentTarget)
        return;
      if (isDisabled())
        return;
      if (event.key === " ")
        onActivate();
    }
  };
}

// node_modules/@videojs/core/dist/dev/core/ui/transition.js
var TransitionDataAttrs = {
  transitionStarting: "data-starting-style",
  transitionEnding: "data-ending-style"
};
function getTransitionFlags(status) {
  return {
    transitionStarting: status === "starting",
    transitionEnding: status === "ending"
  };
}
function getTransitionStyleAttrs({ transitionStarting, transitionEnding }) {
  return {
    [TransitionDataAttrs.transitionStarting]: transitionStarting ? "" : undefined,
    [TransitionDataAttrs.transitionEnding]: transitionEnding ? "" : undefined
  };
}

// node_modules/@videojs/core/dist/dev/core/ui/input-feedback/indicator-lifecycle.js
var IndicatorCloseController = class {
  #timer = null;
  #close;
  #getDelay;
  constructor(close, getDelay) {
    this.#close = close;
    this.#getDelay = getDelay;
  }
  arm() {
    this.clear();
    this.#timer = setTimeout(() => {
      this.#timer = null;
      this.#close();
    }, this.#getDelay());
  }
  clear() {
    if (this.#timer === null)
      return;
    clearTimeout(this.#timer);
    this.#timer = null;
  }
  close() {
    this.clear();
    this.#close();
  }
  destroy() {
    this.clear();
  }
};
var IndicatorVisibilityCoordinator = class {
  #handles = /* @__PURE__ */ new Set;
  register(handle) {
    this.#handles.add(handle);
    return () => this.#handles.delete(handle);
  }
  show(handle) {
    for (const nextHandle of this.#handles)
      if (nextHandle !== handle)
        nextHandle.close();
  }
};
function getIndicatorCloseDelay(props) {
  return props.closeDelay ?? 800;
}
function isIndicatorPresent(current, transition) {
  return current.open || transition.active;
}
function getRenderedIndicatorState(current, snapshot, transition) {
  const payload = current.open ? current : snapshot;
  return {
    ...payload,
    open: current.open && transition.active,
    generation: current.open ? current.generation : payload.generation,
    ...getTransitionFlags(transition.status)
  };
}

// node_modules/@videojs/core/dist/dev/dom/ui/input-action.js
function toInputActionEvent(event) {
  return {
    action: event.action,
    value: event.value,
    source: event.source,
    key: "key" in event.event ? event.event.key : undefined
  };
}
function getMediaSnapshot(store) {
  if (!store)
    return {};
  const state = store.state;
  const time = selectTime(state);
  return {
    paused: selectPlayback(state)?.paused,
    volume: selectVolume(state)?.volume,
    muted: selectVolume(state)?.muted,
    fullscreen: selectFullscreen(state)?.fullscreen,
    subtitlesShowing: selectTextTrack(state)?.subtitlesShowing,
    pip: selectPiP(state)?.pip,
    currentTime: time?.currentTime,
    duration: time?.duration
  };
}
function subscribeToInputActions(container, callback) {
  const handleEvent = (event) => callback(toInputActionEvent(event));
  const gestureUnsubscribe = getGestureCoordinator(container).subscribe(handleEvent);
  const hotkeyUnsubscribe = getHotkeyCoordinator(container).subscribe(handleEvent);
  return () => {
    gestureUnsubscribe();
    hotkeyUnsubscribe();
  };
}
var indicatorVisibilityCoordinators = /* @__PURE__ */ new WeakMap;
function getIndicatorVisibilityCoordinator(container) {
  let coordinator = indicatorVisibilityCoordinators.get(container);
  if (!coordinator) {
    coordinator = new IndicatorVisibilityCoordinator;
    indicatorVisibilityCoordinators.set(container, coordinator);
  }
  return coordinator;
}

// node_modules/@videojs/core/dist/dev/dom/ui/popover/popover.js
function createPopover(options) {
  const { onOpenChange, closeOnOutsideClick } = options;
  let triggerEl = null;
  let popupEl = null;
  let hoverTimeout = null;
  const capturedPointers = /* @__PURE__ */ new Set;
  const layer = createDismissLayer({
    transition: options.transition,
    closeOnEscape: options.closeOnEscape,
    onEscapeDismiss(event) {
      event.preventDefault();
      applyClose("escape", event);
    },
    onDocumentActive(signal) {
      listen(document, "pointerdown", handleDocumentPointerdown, {
        capture: true,
        signal
      });
    }
  });
  const state = layer.input;
  const groupMember = { close(reason) {
    applyClose(reason);
  } };
  function clearHoverTimeout() {
    if (hoverTimeout !== null) {
      clearTimeout(hoverTimeout);
      hoverTimeout = null;
    }
  }
  function canHover() {
    return globalThis.matchMedia?.("(hover: hover)")?.matches ?? false;
  }
  function canOpenOnFocus() {
    if (!canHover())
      return false;
    return globalThis.matchMedia?.("(pointer: fine)")?.matches ?? false;
  }
  function canToggleOnClick() {
    if (!options.openOnHover?.())
      return true;
    return canHover();
  }
  function applyOpen(reason, event) {
    const opening = layer.open();
    if (!opening)
      return;
    options.group?.()?.open(groupMember);
    onOpenChange(true, event ? {
      reason,
      event
    } : { reason });
    opening.then(() => {
      if (layer.signal.aborted || !state.current.active)
        return;
      options.onOpenChangeComplete?.(true);
    });
  }
  function applyClose(reason, event) {
    const closing = layer.close(popupEl);
    if (!closing)
      return;
    options.group?.()?.close(groupMember);
    onOpenChange(false, event ? {
      reason,
      event
    } : { reason });
    closing.then(() => {
      if (layer.signal.aborted)
        return;
      tryHidePopover(popupEl);
      options.onOpenChangeComplete?.(false);
    });
  }
  function open(reason = "click") {
    applyOpen(reason);
  }
  function close(reason = "click") {
    applyClose(reason);
  }
  function handleDocumentPointerdown(event) {
    if (!closeOnOutsideClick() || !state.current.active)
      return;
    const path = event.composedPath();
    if (triggerEl && path.includes(triggerEl) || popupEl && path.includes(popupEl))
      return;
    applyClose("outside-click", event);
  }
  layer.signal.addEventListener("abort", () => {
    options.group?.()?.close(groupMember);
    clearHoverTimeout();
    capturedPointers.clear();
    triggerEl = null;
    popupEl = null;
  });
  const triggerProps = {
    onClick(event) {
      if (!canToggleOnClick())
        return;
      if (state.current.active && state.current.status !== "ending")
        applyClose("click", event);
      else
        applyOpen("click", event);
    },
    onPointerEnter(_event) {
      if (!options.openOnHover?.())
        return;
      if (!canHover())
        return;
      clearHoverTimeout();
      if (state.current.active)
        return;
      const delay = options.delay?.() ?? 300;
      hoverTimeout = setTimeout(() => applyOpen("hover"), delay);
    },
    onPointerLeave(_event) {
      if (!options.openOnHover?.())
        return;
      if (!canHover())
        return;
      clearHoverTimeout();
      if (!state.current.active)
        return;
      const closeDelay = options.closeDelay?.() ?? 0;
      hoverTimeout = setTimeout(() => applyClose("hover"), closeDelay);
    },
    onFocusIn(_event) {
      if (options.openOnHover?.()) {
        if (!canOpenOnFocus())
          return;
        applyOpen("focus");
      }
    },
    onFocusOut(event) {
      const relatedTarget = event.relatedTarget;
      if (relatedTarget && (triggerEl?.contains(relatedTarget) || popupEl?.contains(relatedTarget)))
        return;
      if (options.openOnHover?.())
        applyClose("blur");
    }
  };
  const popupProps = {
    onPointerEnter(_event) {
      if (!options.openOnHover?.())
        return;
      clearHoverTimeout();
    },
    onPointerLeave(_event) {
      if (!options.openOnHover?.())
        return;
      if (capturedPointers.size > 0)
        return;
      clearHoverTimeout();
      if (!state.current.active)
        return;
      const closeDelay = options.closeDelay?.() ?? 0;
      hoverTimeout = setTimeout(() => applyClose("hover"), closeDelay);
    },
    onGotPointerCapture(event) {
      capturedPointers.add(event.pointerId);
    },
    onLostPointerCapture(event) {
      capturedPointers.delete(event.pointerId);
    },
    onFocusOut(event) {
      const relatedTarget = event.relatedTarget;
      if (relatedTarget && (triggerEl?.contains(relatedTarget) || popupEl?.contains(relatedTarget)))
        return;
      applyClose("blur");
    }
  };
  function setTriggerElement(el) {
    triggerEl = el;
  }
  function setPopupElement(el) {
    if (!el && popupEl && state.current.active)
      tryHidePopover(popupEl);
    popupEl = el;
    if (el) {
      if (state.current.active)
        tryShowPopover(el);
    }
  }
  return {
    input: state,
    triggerProps,
    popupProps,
    get triggerElement() {
      return triggerEl;
    },
    setTriggerElement,
    setPopupElement,
    open,
    close,
    destroy: layer.destroy
  };
}

// node_modules/@videojs/core/dist/dev/core/ui/menu/menu-item-data-attrs.js
var MenuItemDataAttrs = {
  item: "data-item",
  highlighted: "data-highlighted"
};

// node_modules/@videojs/core/dist/dev/dom/ui/menu/create-menu.js
function isMenuNavigationKey(event) {
  const { key } = event;
  return key === "ArrowDown" || key === "ArrowUp" || key === "ArrowLeft" || key === "ArrowRight" || key === "Home" || key === "End" || key === "Enter" || key === " " || key === "Escape" || key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey;
}
function getRootPositionOptions(side, align) {
  if (!side || !align)
    return null;
  return {
    side,
    align
  };
}
function completeMenuItemSelection(menu, parentMenu = null) {
  if (parentMenu)
    parentMenu.pop();
  else
    menu.close();
}
function createMenu(options) {
  const items = [];
  let highlightedItem = null;
  let triggerElement = null;
  let contentElement = null;
  let typeaheadBuffer = "";
  let typeaheadTimer = null;
  let openRafId = 0;
  let lastCloseReason = null;
  const navigationState = createState({
    stack: [],
    direction: "forward"
  });
  function push(menuId, triggerId) {
    const stack = navigationState.current.stack;
    if (stack[stack.length - 1]?.menuId === menuId)
      return;
    navigationState.patch({
      stack: [...stack, {
        menuId,
        triggerId
      }],
      direction: "forward"
    });
  }
  function pop() {
    const stack = navigationState.current.stack;
    if (stack.length === 0)
      return;
    navigationState.patch({
      stack: stack.slice(0, -1),
      direction: "back"
    });
  }
  function highlight(element, highlightOptions) {
    if (highlightedItem === element)
      return;
    if (highlightedItem) {
      highlightedItem.tabIndex = -1;
      highlightedItem.removeAttribute(MenuItemDataAttrs.highlighted);
    }
    highlightedItem = element;
    if (element) {
      element.tabIndex = 0;
      element.setAttribute(MenuItemDataAttrs.highlighted, "");
      if (highlightOptions?.focus !== false)
        if (highlightOptions?.preventScroll)
          element.focus({ preventScroll: true });
        else
          element.focus();
    }
    options.onHighlightChange?.(element);
  }
  function clearHighlight() {
    if (highlightedItem) {
      highlightedItem.tabIndex = -1;
      highlightedItem.removeAttribute(MenuItemDataAttrs.highlighted);
      highlightedItem = null;
      options.onHighlightChange?.(null);
    }
  }
  function highlightFirstItem(options2) {
    highlight(items[0] ?? null, options2);
  }
  function getInitialHighlightItem() {
    return items.find((item) => item.matches('[aria-checked="true"], [aria-selected="true"]')) ?? items[0] ?? null;
  }
  function clearTypeahead() {
    if (typeaheadTimer !== null) {
      clearTimeout(typeaheadTimer);
      typeaheadTimer = null;
    }
    typeaheadBuffer = "";
  }
  function scheduleInitialHighlight() {
    cancelAnimationFrame(openRafId);
    openRafId = requestAnimationFrame(() => {
      openRafId = 0;
      if (!popover.input.current.active || popover.input.current.status === "ending" || highlightedItem)
        return;
      highlight(getInitialHighlightItem());
    });
  }
  function handleTypeahead(char) {
    typeaheadBuffer = typeaheadBuffer.length === 1 && typeaheadBuffer.toLowerCase() === char.toLowerCase() ? char : typeaheadBuffer + char;
    if (typeaheadTimer !== null)
      clearTimeout(typeaheadTimer);
    typeaheadTimer = setTimeout(clearTypeahead, 500);
    const searchStart = (highlightedItem ? items.indexOf(highlightedItem) : -1) + 1;
    const candidates = [...items.slice(searchStart), ...items.slice(0, searchStart)];
    const needle = typeaheadBuffer.toLowerCase();
    const match = candidates.find((candidate) => {
      return (candidate.textContent?.trim().toLowerCase() ?? "").startsWith(needle);
    });
    if (match)
      highlight(match);
  }
  const popover = createPopover({
    transition: options.transition,
    onOpenChange(open, details) {
      lastCloseReason = open ? null : details.reason;
      options.onOpenChange(open, details);
      if (open)
        scheduleInitialHighlight();
      else {
        clearHighlight();
        clearTypeahead();
        navigationState.patch({
          stack: [],
          direction: "forward"
        });
      }
    },
    onOpenChangeComplete(open) {
      options.onOpenChangeComplete?.(open);
      if (!open && lastCloseReason !== "imperative-action" && lastCloseReason !== "group-open")
        triggerElement?.focus();
    },
    closeOnEscape: options.closeOnEscape,
    closeOnOutsideClick: options.closeOnOutsideClick,
    ...options.group ? { group: options.group } : {}
  });
  const contentProps = {
    onFocusOut: popover.popupProps.onFocusOut,
    onKeyDown(event) {
      const { key } = event;
      if (key !== "Escape" && isMenuNavigationKey(event) && !event.defaultPrevented)
        event.preventDefault();
      if (items.length === 0)
        return;
      switch (key) {
        case "ArrowDown":
          event.preventDefault();
          highlight(items[((highlightedItem ? items.indexOf(highlightedItem) : -1) + 1) % items.length] ?? null);
          break;
        case "ArrowUp": {
          event.preventDefault();
          const currentIndex = highlightedItem ? items.indexOf(highlightedItem) : 0;
          highlight(items[(currentIndex <= 0 ? items.length : currentIndex) - 1] ?? null);
          break;
        }
        case "Home":
          event.preventDefault();
          highlight(items[0] ?? null);
          break;
        case "End":
          event.preventDefault();
          highlight(items[items.length - 1] ?? null);
          break;
        case "Enter":
        case " ":
          event.preventDefault();
          highlightedItem?.click();
          break;
        default:
          if (key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey)
            handleTypeahead(key);
      }
    }
  };
  function handleTriggerKeyDown(event) {
    const input = popover.input.current;
    if (!input.active || input.status === "ending")
      return;
    if (event.key === "Escape")
      return;
    if (!isMenuNavigationKey(event))
      return;
    contentProps.onKeyDown(event);
    event.stopPropagation();
  }
  function setTriggerElement(element) {
    triggerElement = element;
    popover.setTriggerElement(element);
  }
  function setContentElement(element) {
    contentElement = element;
    popover.setPopupElement(element);
  }
  function compareItems(a, b) {
    if (a === b)
      return 0;
    const position = a.compareDocumentPosition(b);
    if (position & Node.DOCUMENT_POSITION_FOLLOWING)
      return -1;
    if (position & Node.DOCUMENT_POSITION_PRECEDING)
      return 1;
    return 0;
  }
  function registerItem(element) {
    element.tabIndex = -1;
    element.setAttribute(MenuItemDataAttrs.item, "");
    items.push(element);
    items.sort(compareItems);
    if (popover.input.current.active && popover.input.current.status !== "ending" && !highlightedItem)
      scheduleInitialHighlight();
    return () => {
      const index = items.indexOf(element);
      if (index !== -1)
        items.splice(index, 1);
      if (highlightedItem === element)
        clearHighlight();
    };
  }
  function destroy() {
    cancelAnimationFrame(openRafId);
    openRafId = 0;
    clearTypeahead();
    popover.destroy();
  }
  return {
    input: popover.input,
    navigationInput: navigationState,
    triggerProps: {
      onClick: popover.triggerProps.onClick,
      onKeyDown: handleTriggerKeyDown
    },
    contentProps,
    get triggerElement() {
      return triggerElement;
    },
    get contentElement() {
      return contentElement;
    },
    setTriggerElement,
    setContentElement,
    registerItem,
    highlight,
    highlightFirstItem,
    push,
    pop,
    open: popover.open,
    close: popover.close,
    destroy
  };
}

// node_modules/@videojs/core/dist/dev/dom/utils/layout.js
function forceLayout(element) {
  element?.getBoundingClientRect();
}
function createDOMRect(left, top, width, height) {
  const right = left + width;
  const bottom = top + height;
  return {
    x: left,
    y: top,
    width,
    height,
    top,
    right,
    bottom,
    left,
    toJSON() {
      return {
        x: left,
        y: top,
        width,
        height,
        top,
        right,
        bottom,
        left
      };
    }
  };
}
function intersectDOMRects(firstRect, secondRect) {
  const left = Math.max(firstRect.left, secondRect.left);
  const top = Math.max(firstRect.top, secondRect.top);
  const right = Math.min(firstRect.right, secondRect.right);
  const bottom = Math.min(firstRect.bottom, secondRect.bottom);
  return createDOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
}
function getPositioningBoundaryRect(boundaryElement) {
  const viewportRect = document.documentElement.getBoundingClientRect();
  return boundaryElement ? intersectDOMRects(viewportRect, boundaryElement.getBoundingClientRect()) : viewportRect;
}
function resolvePositioningBoundary(boundary, options = {}) {
  if (!boundary)
    return null;
  if (!isString(boundary))
    return boundary;
  if (boundary === "viewport")
    return null;
  if (boundary === "container")
    return options.container ?? null;
  try {
    return (options.root ?? document).querySelector(boundary);
  } catch {
    return null;
  }
}

// node_modules/@videojs/core/dist/dev/dom/ui/menu/create-menu-view-transition.js
var DEFAULT_MENU_VIEW_TRANSITION_STATE = {
  phase: "hidden",
  direction: "forward",
  triggerId: null
};
async function waitForElementAnimations(element) {
  const animations = element.getAnimations?.() ?? [];
  if (!animations.length)
    return;
  await Promise.all(animations.map((animation) => animation.finished)).catch(() => {});
}
function focusFirstMenuViewItem(element) {
  element.querySelector("[data-item]")?.focus({ preventScroll: true });
}
function getMenuViewState(phase) {
  return phase === "entering" || phase === "active" ? "active" : "inactive";
}
function getMenuViewTransitionAttrs(state) {
  return {
    "data-menu-view": "",
    "data-menu-view-state": getMenuViewState(state.phase),
    "data-direction": state.direction,
    ...getTransitionStyleAttrs({
      transitionStarting: state.phase === "entering",
      transitionEnding: state.phase === "exiting"
    }),
    "data-open": state.phase !== "hidden" ? "" : undefined,
    hidden: state.phase === "hidden"
  };
}
function createMenuViewTransition(options = {}) {
  const input = createState(DEFAULT_MENU_VIEW_TRANSITION_STATE);
  const waitForAnimations = options.waitForAnimations ?? waitForElementAnimations;
  const focusFirstItem = options.focusFirstItem ?? focusFirstMenuViewItem;
  let element = null;
  let transitionId = 0;
  let raf1 = 0;
  let raf2 = 0;
  let focusRaf = 0;
  let scheduledTransitionId = 0;
  let scheduledPhase = null;
  function cancelFrames() {
    cancelAnimationFrame(raf1);
    cancelAnimationFrame(raf2);
    cancelAnimationFrame(focusRaf);
    raf1 = 0;
    raf2 = 0;
    focusRaf = 0;
    scheduledTransitionId = 0;
    scheduledPhase = null;
  }
  function scheduleCurrentPhase() {
    const { phase } = input.current;
    if (!element || phase !== "entering" && phase !== "exiting")
      return;
    if (scheduledTransitionId === transitionId && scheduledPhase === phase)
      return;
    scheduledTransitionId = transitionId;
    scheduledPhase = phase;
    if (phase === "entering")
      scheduleEnterComplete(transitionId, element);
    else
      scheduleExitComplete(transitionId, element);
  }
  function scheduleEnterComplete(currentTransitionId, currentElement) {
    forceLayout(currentElement);
    raf1 = requestAnimationFrame(() => {
      if (currentTransitionId !== transitionId)
        return;
      raf2 = requestAnimationFrame(() => {
        if (currentTransitionId !== transitionId)
          return;
        forceLayout(currentElement);
        input.patch({ phase: "active" });
        focusRaf = requestAnimationFrame(() => {
          if (currentTransitionId !== transitionId)
            return;
          focusFirstItem(currentElement);
        });
      });
    });
  }
  function scheduleExitComplete(currentTransitionId, currentElement) {
    forceLayout(currentElement);
    raf1 = requestAnimationFrame(async () => {
      await waitForAnimations(currentElement);
      if (currentTransitionId !== transitionId)
        return;
      const { direction, triggerId } = input.current;
      input.patch({
        phase: "hidden",
        triggerId: null
      });
      if (direction === "back")
        options.restoreFocus?.(triggerId);
    });
  }
  function startEnter(direction, triggerId) {
    transitionId++;
    cancelFrames();
    input.patch({
      phase: "entering",
      direction,
      triggerId
    });
    scheduleCurrentPhase();
  }
  function startExit(direction) {
    transitionId++;
    cancelFrames();
    input.patch({
      phase: "exiting",
      direction
    });
    scheduleCurrentPhase();
  }
  function setElement(nextElement) {
    if (element === nextElement)
      return;
    element = nextElement;
    scheduleCurrentPhase();
  }
  function sync({ active, direction, triggerId = null }) {
    const { phase } = input.current;
    if (active && (phase === "hidden" || phase === "exiting"))
      startEnter(direction, triggerId);
    else if (!active && (phase === "active" || phase === "entering"))
      startExit(direction);
  }
  function destroy() {
    transitionId++;
    cancelFrames();
    element = null;
    input.patch(DEFAULT_MENU_VIEW_TRANSITION_STATE);
  }
  return {
    input,
    setElement,
    sync,
    destroy
  };
}

// node_modules/@videojs/core/dist/dev/dom/ui/menu/menu-viewport-transition.js
var DEFAULT_MENU_VIEWPORT_MIN_WIDTH = 160;
var MENU_VIEW_ATTR = "data-menu-view";
var MENU_VIEW_STATE_ATTR = "data-menu-view-state";
var MENU_VIEW_ACTIVE_STATE = "active";
var MENU_VIEW_INACTIVE_STATE = "inactive";
var MENU_ROOT_VIEW_ATTR = "data-menu-root-view";
var MENU_VIEWPORT_ATTR = "data-menu-viewport";
var MENU_WIDTH_VAR = "--media-menu-width";
var MENU_HEIGHT_VAR = "--media-menu-height";
var MENU_VIEW_MEASURE_STYLE_PROPERTIES = [
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "width",
  "height",
  "min-width",
  "max-width"
];
var viewportTransitionStates = /* @__PURE__ */ new WeakMap;
function getMenuViewportAttrs() {
  return { "data-menu-viewport": "" };
}
function getMenuRootViewAttrs() {
  return {
    "data-menu-root-view": "",
    "data-menu-view": ""
  };
}
function getViewportTransitionState(content) {
  let state = viewportTransitionStates.get(content);
  if (!state) {
    state = {
      pending: null,
      phaseKeys: /* @__PURE__ */ new WeakMap
    };
    viewportTransitionStates.set(content, state);
  }
  return state;
}
function getMenuViewportElement(content) {
  if (!content)
    return null;
  return content.querySelector(`:scope > [${MENU_VIEWPORT_ATTR}]`) ?? content;
}
function getViewportElement(content, view) {
  const viewport = getMenuViewportElement(content);
  if (viewport && viewport !== content)
    return viewport;
  if (view?.parentElement && content.contains(view.parentElement))
    return view.parentElement;
  return content;
}
function getRootViewElement(viewport) {
  return viewport.querySelector(`:scope > [${MENU_ROOT_VIEW_ATTR}]`);
}
function getActiveMenuViewElement(viewport) {
  return Array.from(viewport.children).find((child) => child instanceof HTMLElement && child.hasAttribute(MENU_VIEW_ATTR) && !child.hasAttribute(MENU_ROOT_VIEW_ATTR) && !child.hidden && !child.hasAttribute(TransitionDataAttrs.transitionEnding)) ?? null;
}
function resolveMinWidth(options) {
  return options?.minWidth ?? DEFAULT_MENU_VIEWPORT_MIN_WIDTH;
}
function snapshotInlineStyle(element) {
  return MENU_VIEW_MEASURE_STYLE_PROPERTIES.map((property) => ({
    property,
    value: element.style.getPropertyValue(property),
    priority: element.style.getPropertyPriority(property)
  }));
}
function restoreInlineStyle(element, snapshot) {
  for (const { property, value, priority } of snapshot)
    if (value)
      element.style.setProperty(property, value, priority);
    else
      element.style.removeProperty(property);
}
function measureMenuView(view, minWidth) {
  const snapshot = snapshotInlineStyle(view);
  try {
    view.style.setProperty("position", "absolute");
    view.style.setProperty("top", "0px");
    view.style.setProperty("right", "auto");
    view.style.setProperty("bottom", "auto");
    view.style.setProperty("left", "0px");
    view.style.setProperty("width", "max-content");
    view.style.setProperty("height", "auto");
    view.style.setProperty("min-width", `${minWidth}px`);
    view.style.setProperty("max-width", "none");
    forceLayout(view);
    const rect = view.getBoundingClientRect();
    return {
      width: Math.ceil(Math.max(minWidth, rect.width, view.scrollWidth)),
      height: Math.ceil(Math.max(rect.height, view.scrollHeight))
    };
  } finally {
    restoreInlineStyle(view, snapshot);
    forceLayout(view);
  }
}
function setViewportSize(content, size) {
  content.style.setProperty(MENU_WIDTH_VAR, `${size.width}px`);
  content.style.setProperty(MENU_HEIGHT_VAR, `${size.height}px`);
}
function setMenuViewState(view, state) {
  view.setAttribute(MENU_VIEW_STATE_ATTR, state);
  if (state === MENU_VIEW_ACTIVE_STATE)
    view.setAttribute("data-open", "");
  else
    view.removeAttribute("data-open");
}
function prepareEnteringMenuView(content, rootView, entering, state, options) {
  const minWidth = resolveMinWidth(options);
  const fromSize = measureMenuView(rootView, minWidth);
  state.pending = {
    entering,
    fromSize,
    toSize: measureMenuView(entering, minWidth)
  };
  setMenuViewState(rootView, MENU_VIEW_ACTIVE_STATE);
  setViewportSize(content, fromSize);
  forceLayout(content);
}
function startEnteringMenuView(content, rootView, entering, state, options) {
  const minWidth = resolveMinWidth(options);
  const current = state.pending?.entering === entering ? state.pending : {
    entering,
    fromSize: measureMenuView(rootView, minWidth),
    toSize: measureMenuView(entering, minWidth)
  };
  state.pending = null;
  setViewportSize(content, current.fromSize);
  forceLayout(rootView);
  setMenuViewState(rootView, MENU_VIEW_INACTIVE_STATE);
  forceLayout(rootView);
  setViewportSize(content, current.toSize);
}
function startExitingMenuView(content, rootView, exiting, transitionState, options) {
  transitionState.pending = null;
  const minWidth = resolveMinWidth(options);
  const fromSize = measureMenuView(exiting, minWidth);
  const toSize = measureMenuView(rootView, minWidth);
  setViewportSize(content, fromSize);
  setMenuViewState(rootView, MENU_VIEW_INACTIVE_STATE);
  forceLayout(rootView);
  setMenuViewState(rootView, MENU_VIEW_ACTIVE_STATE);
  forceLayout(rootView);
  setViewportSize(content, toSize);
}
function syncMenuViewRoot(content, hasActiveChildView, options) {
  if (!content || hasActiveChildView)
    return;
  const viewport = getViewportElement(content);
  const rootView = getRootViewElement(viewport);
  if (!rootView || getActiveMenuViewElement(viewport))
    return;
  const size = measureMenuView(rootView, resolveMinWidth(options));
  setMenuViewState(rootView, MENU_VIEW_ACTIVE_STATE);
  setViewportSize(content, size);
}
function syncMenuViewTransition(content, view, viewState, options) {
  if (!content || !view)
    return;
  const viewport = getViewportElement(content, view);
  const rootView = getRootViewElement(viewport);
  if (!rootView)
    return;
  const state = getViewportTransitionState(content);
  const phaseKey = `${viewState.phase}:${viewState.direction}`;
  if (state.phaseKeys.get(view) === phaseKey)
    return;
  state.phaseKeys.set(view, phaseKey);
  if (viewState.phase === "hidden") {
    state.phaseKeys.delete(view);
    syncMenuViewRoot(content, getActiveMenuViewElement(viewport) !== null, options);
    return;
  }
  if (viewState.phase === "entering") {
    prepareEnteringMenuView(content, rootView, view, state, options);
    return;
  }
  if (viewState.phase === "active") {
    startEnteringMenuView(content, rootView, view, state, options);
    return;
  }
  startExitingMenuView(content, rootView, view, state, options);
}

// node_modules/@videojs/core/dist/dev/core/ui/popover/popover-css-vars.js
var PopoverCSSVars = {
  sideOffset: "--media-popover-side-offset",
  alignOffset: "--media-popover-align-offset",
  boundaryOffset: "--media-popover-boundary-offset",
  anchorWidth: "--media-popover-anchor-width",
  anchorHeight: "--media-popover-anchor-height",
  availableWidth: "--media-popover-available-width",
  availableHeight: "--media-popover-available-height"
};

// node_modules/@videojs/utils/dist/number/number.js
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function roundToStep(value, step, min) {
  const nearest = Math.round((value - min) / step) * step + min;
  const dot = `${step}`.indexOf(".");
  return dot === -1 ? nearest : Number(nearest.toFixed(`${step}`.length - dot - 1));
}

// node_modules/@videojs/core/dist/dev/dom/ui/popover/popover-positioning.js
var ZERO_OFFSETS = {
  sideOffset: 0,
  alignOffset: 0,
  boundaryOffset: 0
};
var OPPOSITE_SIDE = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left"
};
function formatPixels(value) {
  return `${clamp(value, 0, Infinity)}px`;
}
function getCrossAxisAvailable(start, end, size, boundaryStart, boundaryEnd, align, alignOffset) {
  if (align === "start")
    return boundaryEnd - (start + alignOffset);
  if (align === "end")
    return end + alignOffset - boundaryStart;
  const center = start + size / 2 + alignOffset;
  return Math.min(center - boundaryStart, boundaryEnd - center) * 2;
}
function getAnchorPositionStyle(anchorName, opts, triggerRect, popupRect, boundaryRect, offsets, cssVars = PopoverCSSVars) {
  if (supportsAnchorPositioning())
    return {
      ...getAnchorPositionCSS(anchorName, opts, cssVars),
      ...triggerRect && boundaryRect ? getPositioningCSSVars(triggerRect, boundaryRect, opts, offsets, cssVars) : {}
    };
  if (triggerRect && popupRect) {
    const resolved = offsets ?? ZERO_OFFSETS;
    return {
      ...getManualPositionStyle(triggerRect, popupRect, opts, resolved),
      ...boundaryRect ? getPositioningCSSVars(triggerRect, boundaryRect, opts, resolved, cssVars) : {},
      position: "fixed",
      inset: "auto",
      margin: "0"
    };
  }
  return {};
}
function getAnchorNameStyle(anchorName) {
  if (!supportsAnchorPositioning())
    return {};
  return { anchorName: `--${anchorName}` };
}
function getAnchorPositionCSS(anchorName, opts, cssVars = PopoverCSSVars) {
  const SIDE_OFFSET_VAR = `var(${cssVars.sideOffset}, 0px)`;
  const ALIGN_OFFSET_VAR = `var(${cssVars.alignOffset}, 0px)`;
  const { side, align } = opts;
  const style = {
    positionAnchor: `--${anchorName}`,
    position: "fixed",
    inset: "auto",
    margin: "0",
    justifySelf: "normal",
    alignSelf: "normal",
    marginInlineStart: "0",
    marginBlockStart: "0"
  };
  const insetProp = OPPOSITE_SIDE[side];
  if (side === "top" || side === "bottom") {
    style[insetProp] = `calc(anchor(${side}) + ${SIDE_OFFSET_VAR})`;
    if (align === "start")
      style.left = `calc(anchor(left) + ${ALIGN_OFFSET_VAR})`;
    else if (align === "end")
      style.right = `calc(anchor(right) + ${ALIGN_OFFSET_VAR})`;
    else {
      style.justifySelf = "anchor-center";
      style.marginInlineStart = ALIGN_OFFSET_VAR;
    }
  } else {
    style[insetProp] = `calc(anchor(${side}) + ${SIDE_OFFSET_VAR})`;
    if (align === "start")
      style.top = `calc(anchor(top) + ${ALIGN_OFFSET_VAR})`;
    else if (align === "end")
      style.bottom = `calc(anchor(bottom) + ${ALIGN_OFFSET_VAR})`;
    else {
      style.alignSelf = "anchor-center";
      style.marginBlockStart = ALIGN_OFFSET_VAR;
    }
  }
  return style;
}
function getPositioningCSSVars(triggerRect, boundaryRect, opts, offsets = ZERO_OFFSETS, cssVars = PopoverCSSVars) {
  const vars = {};
  const { side, align } = opts;
  const boundaryOffset = offsets.boundaryOffset ?? 0;
  const boundaryStartX = boundaryRect.left + boundaryOffset;
  const boundaryEndX = boundaryRect.right - boundaryOffset;
  const boundaryStartY = boundaryRect.top + boundaryOffset;
  const boundaryEndY = boundaryRect.bottom - boundaryOffset;
  vars[cssVars.anchorWidth] = `${triggerRect.width}px`;
  vars[cssVars.anchorHeight] = `${triggerRect.height}px`;
  if (side === "top" || side === "bottom") {
    const sideSpace = side === "top" ? triggerRect.top - boundaryStartY : boundaryEndY - triggerRect.bottom;
    vars[cssVars.availableHeight] = formatPixels(sideSpace - offsets.sideOffset);
    vars[cssVars.availableWidth] = formatPixels(getCrossAxisAvailable(triggerRect.left, triggerRect.right, triggerRect.width, boundaryStartX, boundaryEndX, align, offsets.alignOffset));
  } else {
    const sideSpace = side === "left" ? triggerRect.left - boundaryStartX : boundaryEndX - triggerRect.right;
    vars[cssVars.availableWidth] = formatPixels(sideSpace - offsets.sideOffset);
    vars[cssVars.availableHeight] = formatPixels(getCrossAxisAvailable(triggerRect.top, triggerRect.bottom, triggerRect.height, boundaryStartY, boundaryEndY, align, offsets.alignOffset));
  }
  return vars;
}
function getManualPositionStyle(triggerRect, popupRect, opts, offsets = {
  sideOffset: 0,
  alignOffset: 0
}) {
  const { side, align } = opts;
  const { sideOffset, alignOffset } = offsets;
  let top = 0;
  let left = 0;
  if (side === "top")
    top = triggerRect.top - popupRect.height - sideOffset;
  else if (side === "bottom")
    top = triggerRect.bottom + sideOffset;
  else if (side === "left")
    left = triggerRect.left - popupRect.width - sideOffset;
  else
    left = triggerRect.right + sideOffset;
  if (side === "top" || side === "bottom")
    if (align === "start")
      left = triggerRect.left + alignOffset;
    else if (align === "end")
      left = triggerRect.right - popupRect.width + alignOffset;
    else
      left = triggerRect.left + (triggerRect.width - popupRect.width) / 2 + alignOffset;
  else if (align === "start")
    top = triggerRect.top + alignOffset;
  else if (align === "end")
    top = triggerRect.bottom - popupRect.height + alignOffset;
  else
    top = triggerRect.top + (triggerRect.height - popupRect.height) / 2 + alignOffset;
  return {
    top: `${top}px`,
    left: `${left}px`
  };
}
function resolveOffsets(el, cssVars = PopoverCSSVars) {
  const computed = getComputedStyle(el);
  return {
    sideOffset: resolveCSSLength(el, computed.getPropertyValue(cssVars.sideOffset)),
    alignOffset: resolveCSSLength(el, computed.getPropertyValue(cssVars.alignOffset)),
    boundaryOffset: resolveCSSLength(el, computed.getPropertyValue(cssVars.boundaryOffset))
  };
}
function getPopupPositionRect(el) {
  const rect = el.getBoundingClientRect();
  const width = el.offsetWidth || rect.width;
  const height = el.offsetHeight || rect.height;
  return createDOMRect(rect.left, rect.top, width, height);
}

// node_modules/@videojs/core/dist/dev/dom/ui/popover/popup-group.js
function createPopupGroup() {
  let current = null;
  return {
    open(member) {
      if (current === member)
        return;
      current?.close("group-open");
      current = member;
    },
    close(member) {
      if (current === member)
        current = null;
    }
  };
}
// node_modules/@videojs/core/dist/dev/dom/utils/pointer.js
function getPercentFromPointerEvent(event, rect, orientation, isRTL2) {
  let ratio;
  if (orientation === "vertical")
    ratio = 1 - (event.clientY - rect.top) / rect.height;
  else if (isRTL2)
    ratio = (rect.right - event.clientX) / rect.width;
  else
    ratio = (event.clientX - rect.left) / rect.width;
  if (!Number.isFinite(ratio))
    return 0;
  return clamp(ratio * 100, 0, 100);
}

// node_modules/@videojs/core/dist/dev/dom/ui/slider.js
function createSlider(options) {
  const input = createState({
    pointerPercent: 0,
    dragPercent: 0,
    dragging: false,
    pointing: false,
    focused: false
  });
  const abort = new AbortController;
  const changeThrottleMs = options.changeThrottle ?? 0;
  let isDragging = false, cachedRTL = false, cachedRect = null, capturedPointerId = null, lastDragPercent = 0, committedOnRelease = false;
  const throttledChange = changeThrottleMs > 0 ? throttle((percent) => options.onValueChange?.(percent), changeThrottleMs, { leading: true }) : null;
  function fireChange(percent, duringDrag) {
    if (duringDrag && throttledChange)
      throttledChange(percent);
    else
      options.onValueChange?.(percent);
  }
  function releaseCapture() {
    if (isNull(capturedPointerId))
      return;
    const id = capturedPointerId;
    capturedPointerId = null;
    try {
      options.getElement().releasePointerCapture(id);
    } catch {}
  }
  function endDrag() {
    if (!isDragging)
      input.patch({ pointing: false });
    else {
      if (!committedOnRelease)
        options.onValueCommit?.(lastDragPercent);
      isDragging = false;
      input.patch({
        dragging: false,
        pointing: false
      });
      options.onDragEnd?.();
    }
    committedOnRelease = false;
    cleanup();
  }
  function cleanup() {
    throttledChange?.cancel();
    capturedPointerId = null;
    cachedRect = null;
  }
  const rootProps = {
    onPointerDown(event) {
      if (options.isDisabled())
        return;
      event.stopPropagation();
      event.preventDefault();
      const el = options.getElement();
      cachedRect = el.getBoundingClientRect();
      cachedRTL = options.isRTL();
      committedOnRelease = false;
      releaseCapture();
      capturedPointerId = event.pointerId;
      el.setPointerCapture(event.pointerId);
      const percent = getPercentFromPointerEvent(event, cachedRect, options.getOrientation(), cachedRTL);
      isDragging = true;
      lastDragPercent = percent;
      input.patch({
        pointing: true,
        dragging: true,
        pointerPercent: percent,
        dragPercent: percent
      });
      options.onDragStart?.();
      options.onValueChange?.(percent);
      options.getThumbElement?.()?.focus({
        preventScroll: true,
        focusVisible: false
      });
    },
    onPointerMove(event) {
      if (options.isDisabled())
        return;
      if (!isNull(capturedPointerId)) {
        if (event.pointerType !== "touch" && event.buttons === 0) {
          endDrag();
          return;
        }
        const percent2 = getPercentFromPointerEvent(event, cachedRect, options.getOrientation(), cachedRTL);
        lastDragPercent = percent2;
        input.patch({
          dragPercent: percent2,
          pointerPercent: percent2
        });
        fireChange(percent2, true);
        return;
      }
      const percent = getPercentFromPointerEvent(event, options.getElement().getBoundingClientRect(), options.getOrientation(), options.isRTL());
      input.patch({
        pointing: true,
        pointerPercent: percent
      });
    },
    onPointerUp(event) {
      if (options.isDisabled())
        return;
      event.stopPropagation();
      if (isNull(capturedPointerId))
        return;
      const percent = getPercentFromPointerEvent(event, cachedRect, options.getOrientation(), cachedRTL);
      throttledChange?.cancel();
      options.onValueChange?.(percent);
      options.onValueCommit?.(percent);
      committedOnRelease = true;
    },
    onPointerLeave() {
      if (!isNull(capturedPointerId))
        return;
      input.patch({ pointing: false });
    },
    onLostPointerCapture() {
      endDrag();
    }
  };
  const thumbProps = {
    onKeyDown(event) {
      if (options.isDisabled()) {
        if (event.key !== "Tab")
          event.preventDefault();
        return;
      }
      const stepPercent = options.getStepPercent();
      const largeStepPercent = options.getLargeStepPercent();
      const rounded = roundToStep(options.getPercent(), stepPercent, 0);
      const horizontalSign = options.isRTL() ? -1 : 1;
      const step = event.shiftKey ? largeStepPercent : stepPercent;
      let newPercent = null;
      switch (event.key) {
        case "ArrowRight":
          newPercent = rounded + step * horizontalSign;
          break;
        case "ArrowLeft":
          newPercent = rounded - step * horizontalSign;
          break;
        case "ArrowUp":
          newPercent = rounded + step;
          break;
        case "ArrowDown":
          newPercent = rounded - step;
          break;
        case "PageUp":
          newPercent = rounded + largeStepPercent;
          break;
        case "PageDown":
          newPercent = rounded - largeStepPercent;
          break;
        case "Home":
          newPercent = 0;
          break;
        case "End":
          newPercent = 100;
          break;
        default:
          if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key >= "0" && event.key <= "9")
            newPercent = Number(event.key) * 10;
          break;
      }
      if (newPercent !== null) {
        event.preventDefault();
        newPercent = clamp(newPercent, 0, 100);
        input.patch({
          pointerPercent: newPercent,
          dragPercent: newPercent
        });
        options.onValueChange?.(newPercent);
        options.onValueCommit?.(newPercent);
      }
    },
    onFocus() {
      input.patch({ focused: true });
    },
    onBlur() {
      input.patch({ focused: false });
    }
  };
  function adjustForAlignment(state) {
    if (!options.adjustPercent || state.thumbAlignment !== "edge")
      return state;
    const rootEl = options.getElement();
    const thumbEl = options.getThumbElement?.();
    if (!thumbEl)
      return state;
    const isHorizontal = state.orientation === "horizontal";
    const thumbSize = isHorizontal ? thumbEl.offsetWidth : thumbEl.offsetHeight;
    const trackSize = isHorizontal ? rootEl.offsetWidth : rootEl.offsetHeight;
    return {
      ...state,
      fillPercent: options.adjustPercent(state.fillPercent, thumbSize, trackSize),
      pointerPercent: options.adjustPercent(state.pointerPercent, thumbSize, trackSize)
    };
  }
  let resizeObserver = null;
  if (options.onResize) {
    resizeObserver = new ResizeObserver(() => options.onResize());
    resizeObserver.observe(options.getElement());
  }
  return {
    input,
    rootProps,
    rootStyle: {
      touchAction: "none",
      userSelect: "none"
    },
    thumbProps,
    adjustForAlignment,
    destroy() {
      if (abort.signal.aborted)
        return;
      abort.abort();
      resizeObserver?.disconnect();
      releaseCapture();
      cleanup();
    }
  };
}

// node_modules/@videojs/core/dist/dev/core/ui/slider/slider-css-vars.js
var SliderCSSVars = {
  fill: "--media-slider-fill",
  pointer: "--media-slider-pointer",
  buffer: "--media-slider-buffer"
};

// node_modules/@videojs/core/dist/dev/dom/ui/slider-css-vars.js
function getSliderCSSVars(state) {
  return {
    [SliderCSSVars.fill]: `${state.fillPercent.toFixed(3)}%`,
    [SliderCSSVars.pointer]: `${state.pointerPercent.toFixed(3)}%`
  };
}
function getTimeSliderCSSVars(state) {
  return {
    ...getSliderCSSVars(state),
    [SliderCSSVars.buffer]: `${state.bufferPercent.toFixed(3)}%`
  };
}
function getSliderPreviewStyle(width, overflow) {
  const halfWidth = width / 2;
  return {
    position: "absolute",
    left: overflow === "visible" ? `calc(var(${SliderCSSVars.pointer}) - ${halfWidth}px)` : `min(max(0px, calc(var(${SliderCSSVars.pointer}) - ${halfWidth}px)), calc(100% - ${width}px))`,
    width: "max-content",
    pointerEvents: "none"
  };
}

// node_modules/@videojs/core/dist/dev/core/ui/thumbnail/thumbnail-core.js
var ThumbnailCore = class {
  findActiveThumbnail(thumbnails, time) {
    if (thumbnails.length === 0)
      return;
    let low = 0;
    let high = thumbnails.length - 1;
    let result;
    while (low <= high) {
      const mid = low + high >>> 1;
      const image = thumbnails[mid];
      if (time >= image.startTime) {
        result = image;
        low = mid + 1;
      } else
        high = mid - 1;
    }
    return result;
  }
  parseConstraints(raw) {
    const minW = parseFloat(raw.minWidth);
    const maxW = parseFloat(raw.maxWidth);
    const minH = parseFloat(raw.minHeight);
    const maxH = parseFloat(raw.maxHeight);
    return {
      minWidth: Number.isFinite(minW) ? minW : 0,
      maxWidth: Number.isFinite(maxW) ? maxW : Infinity,
      minHeight: Number.isFinite(minH) ? minH : 0,
      maxHeight: Number.isFinite(maxH) ? maxH : Infinity
    };
  }
  calculateScale(tileWidth, tileHeight, constraints) {
    const { minWidth, maxWidth, minHeight, maxHeight } = constraints;
    const maxRatio = Math.min(maxWidth / tileWidth, maxHeight / tileHeight);
    const minRatio = Math.max(minWidth / tileWidth, minHeight / tileHeight);
    if (Number.isFinite(maxRatio) && maxRatio < 1)
      return maxRatio;
    if (Number.isFinite(minRatio) && minRatio > 1)
      return minRatio;
    return 1;
  }
  resize(thumbnail, imgNaturalWidth, imgNaturalHeight, constraints) {
    const tileWidth = thumbnail.width ?? imgNaturalWidth;
    const tileHeight = thumbnail.height ?? imgNaturalHeight;
    if (!tileWidth || !tileHeight)
      return;
    const scale = this.calculateScale(tileWidth, tileHeight, constraints);
    const coordX = thumbnail.coords?.x ?? 0;
    const coordY = thumbnail.coords?.y ?? 0;
    const inset = scale !== 1 ? 1 : 0;
    return {
      scale,
      containerWidth: Math.max(0, Math.floor(tileWidth * scale) - inset * 2),
      containerHeight: Math.max(0, Math.floor(tileHeight * scale) - inset * 2),
      imageWidth: Math.ceil(imgNaturalWidth * scale),
      imageHeight: Math.ceil(imgNaturalHeight * scale),
      offsetX: Math.ceil(coordX * scale) + inset,
      offsetY: Math.ceil(coordY * scale) + inset
    };
  }
  getState(loading, error, thumbnail) {
    return {
      loading,
      error,
      hidden: !loading && !thumbnail
    };
  }
  getAttrs(_state) {
    return {
      role: "img",
      "aria-hidden": "true"
    };
  }
};

// node_modules/@videojs/core/dist/dev/dom/ui/thumbnail.js
function createThumbnail(options) {
  const { getContainer, getImg, onStateChange } = options;
  const core = new ThumbnailCore;
  const abort = new AbortController;
  const signal = abort.signal;
  let loading = false;
  let error = false;
  let naturalWidth = 0;
  let naturalHeight = 0;
  let lastSrc = "";
  let imgBound = false;
  let resizeObserver = null;
  function onImgLoad() {
    const img = getImg();
    if (img) {
      naturalWidth = img.naturalWidth;
      naturalHeight = img.naturalHeight;
    }
    loading = false;
    error = false;
    onStateChange();
  }
  function onImgError() {
    loading = false;
    error = true;
    onStateChange();
  }
  function bindImg(img) {
    listen(img, "load", onImgLoad, { signal });
    listen(img, "error", onImgError, { signal });
  }
  function ensureBindings() {
    if (!imgBound) {
      const img = getImg();
      if (img) {
        bindImg(img);
        imgBound = true;
      }
    }
    if (!resizeObserver) {
      const container = getContainer();
      if (container) {
        resizeObserver = new ResizeObserver(onStateChange);
        resizeObserver.observe(container);
      }
    }
  }
  function updateSrc(url) {
    ensureBindings();
    const src = url ?? "";
    if (src === lastSrc)
      return;
    lastSrc = src;
    if (src) {
      loading = true;
      error = false;
    } else {
      loading = false;
      error = false;
      naturalWidth = 0;
      naturalHeight = 0;
    }
  }
  function connect() {
    ensureBindings();
    const img = getImg();
    if (img?.complete && lastSrc) {
      if (img.naturalWidth > 0) {
        naturalWidth = img.naturalWidth;
        naturalHeight = img.naturalHeight;
        loading = false;
        error = false;
      } else {
        loading = false;
        error = true;
      }
      onStateChange();
    }
  }
  function destroy() {
    abort.abort();
    resizeObserver?.disconnect();
    resizeObserver = null;
  }
  return {
    get loading() {
      return loading;
    },
    get error() {
      return error;
    },
    get naturalWidth() {
      return naturalWidth;
    },
    get naturalHeight() {
      return naturalHeight;
    },
    readConstraints() {
      const el = getContainer();
      if (!el)
        return {
          minWidth: 0,
          maxWidth: Infinity,
          minHeight: 0,
          maxHeight: Infinity
        };
      return core.parseConstraints(getComputedStyle(el));
    },
    updateSrc,
    connect,
    destroy
  };
}

// node_modules/@videojs/core/dist/dev/dom/ui/tooltip/tooltip.js
var REASON_MAP = {
  hover: "hover",
  focus: "focus",
  escape: "escape",
  blur: "blur",
  "imperative-action": "imperative-action"
};
function createTooltip(options) {
  const popoverOpts = {
    transition: options.transition,
    onOpenChange(open, details) {
      const reason = REASON_MAP[details.reason];
      if (!reason)
        return;
      const group = options.group?.();
      if (open)
        group?.notifyOpen();
      else
        group?.notifyClose();
      const tooltipDetails = details.event ? {
        reason,
        event: details.event
      } : { reason };
      options.onOpenChange(open, tooltipDetails);
    },
    closeOnEscape: () => true,
    closeOnOutsideClick: () => false,
    openOnHover: () => true,
    delay: () => {
      const group = options.group?.();
      if (group?.shouldSkipDelay())
        return 0;
      return options.delay?.() ?? group?.delay ?? 600;
    },
    closeDelay: () => {
      const group = options.group?.();
      return options.closeDelay?.() ?? group?.closeDelay ?? 0;
    }
  };
  if (options.onOpenChangeComplete)
    popoverOpts.onOpenChangeComplete = options.onOpenChangeComplete;
  const popover = createPopover(popoverOpts);
  let isPointerDown = false;
  const { onClick: _, ...baseTriggerProps } = popover.triggerProps;
  const triggerProps = {
    ...baseTriggerProps,
    onPointerDown() {
      isPointerDown = true;
    },
    onPointerEnter(event) {
      if (options.disabled?.())
        return;
      if (event.pointerType === "touch")
        return;
      baseTriggerProps.onPointerEnter(event);
    },
    onFocusIn(event) {
      if (options.disabled?.())
        return;
      if (isPointerDown) {
        isPointerDown = false;
        return;
      }
      baseTriggerProps.onFocusIn(event);
    }
  };
  const popupProps = {
    ...popover.popupProps,
    onPointerEnter(event) {
      if (options.disableHoverablePopup?.())
        return;
      popover.popupProps.onPointerEnter(event);
    }
  };
  return {
    ...popover,
    triggerProps,
    popupProps,
    get triggerElement() {
      return popover.triggerElement;
    },
    open: () => popover.open("hover"),
    close: (reason = "hover") => popover.close(reason)
  };
}

// node_modules/@videojs/core/dist/dev/dom/ui/transition.js
function createTransition() {
  const state = createState({
    active: false,
    status: "idle"
  });
  let destroyed = false;
  let rafId1 = 0;
  let rafId2 = 0;
  function open() {
    cancelAnimationFrame(rafId1);
    cancelAnimationFrame(rafId2);
    rafId1 = 0;
    rafId2 = 0;
    state.patch({
      active: true,
      status: "starting"
    });
    return new Promise((resolve2) => {
      rafId1 = requestAnimationFrame(() => {
        rafId1 = 0;
        rafId2 = requestAnimationFrame(() => {
          rafId2 = 0;
          if (destroyed || !state.current.active)
            return resolve2();
          state.patch({ status: "idle" });
          resolve2();
        });
      });
    });
  }
  function close(el) {
    cancelAnimationFrame(rafId1);
    cancelAnimationFrame(rafId2);
    rafId1 = 0;
    rafId2 = 0;
    state.patch({ status: "ending" });
    return new Promise((resolve2) => {
      rafId1 = requestAnimationFrame(() => {
        rafId1 = 0;
        rafId2 = requestAnimationFrame(() => {
          rafId2 = 0;
          if (destroyed)
            return resolve2();
          waitForAnimations(el).finally(() => {
            if (destroyed || state.current.status !== "ending")
              return resolve2();
            state.patch({
              active: false,
              status: "idle"
            });
            resolve2();
          });
        });
      });
    });
  }
  function cancel() {
    cancelAnimationFrame(rafId1);
    cancelAnimationFrame(rafId2);
    rafId1 = 0;
    rafId2 = 0;
    if (state.current.status !== "idle")
      state.patch({ status: "idle" });
  }
  return {
    state,
    open,
    close,
    cancel,
    destroy() {
      if (destroyed)
        return;
      destroyed = true;
      cancel();
    }
  };
}
function waitForAnimations(el) {
  if (!el)
    return Promise.resolve();
  const animations = el.getAnimations?.() ?? [];
  if (animations.length === 0)
    return Promise.resolve();
  return Promise.all(animations.map((a) => a.finished)).then(noop, noop);
}

// node_modules/@videojs/core/dist/dev/dom/ui/wheel-step.js
function createWheelStep(options) {
  return { onWheel(event) {
    if (options.isDisabled())
      return;
    const direction = Math.sign(event.deltaY);
    if (direction === 0)
      return;
    event.preventDefault();
    const stepPercent = options.getStepPercent();
    const newPercent = clamp(options.getPercent() - direction * stepPercent, 0, 100);
    options.onValueChange?.(newPercent);
  } };
}

// node_modules/@videojs/core/dist/dev/dom/utils/element-props.js
function applyElementProps(element, props, options) {
  const signal = options?.signal;
  for (const [key, value] of Object.entries(props))
    if (isFunction(value) && key.startsWith("on"))
      listen(element, key.slice(2).toLowerCase(), value, signal ? { signal } : undefined);
    else if (isUndefined(value) || value === false)
      element.removeAttribute(key);
    else if (value === true)
      element.setAttribute(key, "");
    else
      element.setAttribute(key, String(value));
}

// node_modules/@videojs/core/dist/dev/dom/utils/event.js
function isEventWithinElement(event, element) {
  if (!element)
    return false;
  if (isFunction(event.composedPath))
    return event.composedPath().includes(element);
  const target = event.target;
  return target instanceof Node && element.contains(target);
}

// node_modules/@videojs/core/dist/dev/dom/utils/log.js
var warned = /* @__PURE__ */ new Set;
function logMissingFeature(displayName, featureName) {
  const key = `${displayName}:${featureName}`;
  if (warned.has(key))
    return;
  warned.add(key);
  console.warn(`${displayName} requires ${featureName} feature`);
}

// node_modules/@videojs/core/dist/dev/dom/utils/state-data-attrs.js
function applyStateDataAttrs(element, state, map) {
  for (const key in state) {
    if (map && !(key in map))
      continue;
    const name = map?.[key] ?? toDataAttrName(key), value = state[key];
    if (value === true)
      element.setAttribute(name, "");
    else if (value)
      element.setAttribute(name, String(value));
    else
      element.removeAttribute(name);
  }
}
function toDataAttrName(key) {
  return `data-${key.toLowerCase()}`;
}

// node_modules/@videojs/html/dist/dev/store/provider-mixin.js
function createProviderMixin(config) {
  return (BaseClass) => {
    class PlayerProviderElement extends BaseClass {
      #store = config.factory();
      #detach = null;
      #media = null;
      #container = null;
      #popupGroup = createPopupGroup();
      #fallbackQueued = false;
      #setMedia = (media) => {
        if (this.#media === media)
          return;
        this.#media = media;
        this.#mediaProvider.setValue({
          media,
          setMedia: this.#setMedia
        });
        this.#tryAttach();
      };
      #setContainer = (container) => {
        if (this.#container === container)
          return;
        this.#container = container;
        this.#containerProvider.setValue({
          container,
          setContainer: this.#setContainer,
          popupGroup: this.#popupGroup
        });
        this.#tryAttach();
      };
      #playerProvider = new ContextProvider(this, {
        context: config.playerContext,
        initialValue: this.store
      });
      #mediaProvider = new ContextProvider(this, {
        context: config.mediaContext,
        initialValue: {
          media: this.#media,
          setMedia: this.#setMedia
        }
      });
      #containerProvider = new ContextProvider(this, {
        context: config.containerContext,
        initialValue: {
          container: this.#container,
          setContainer: this.#setContainer,
          popupGroup: this.#popupGroup
        }
      });
      get store() {
        if (isNull(this.#store))
          this.#store = config.factory();
        return this.#store;
      }
      connectedCallback() {
        super.connectedCallback();
        this.#playerProvider.setValue(this.store);
        this.#mediaProvider.setValue({
          media: this.#media,
          setMedia: this.#setMedia
        });
        this.#containerProvider.setValue({
          container: this.#container,
          setContainer: this.#setContainer,
          popupGroup: this.#popupGroup
        });
        this.#tryAttach();
        this.#queueFallbackDiscovery();
      }
      disconnectedCallback() {
        super.disconnectedCallback();
        this.#detachStore();
      }
      destroyCallback() {
        this.#detachStore();
        this.#store?.destroy();
        this.#store = null;
        super.destroyCallback();
      }
      #tryAttach() {
        const store = this.#store;
        if (!store)
          return;
        if (!this.#media) {
          this.#detachStore();
          return;
        }
        const target = {
          media: this.#media,
          container: this.#container
        };
        const hasMediaChanged = store.target?.media !== target.media;
        const hasContainerChanged = store.target?.container !== target.container;
        if (hasMediaChanged || hasContainerChanged) {
          this.#detachStore();
          this.#detach = store.attach(target);
        }
      }
      #detachStore() {
        this.#detach?.();
        this.#detach = null;
      }
      #queueFallbackDiscovery() {
        if (this.#media || this.#fallbackQueued)
          return;
        this.#fallbackQueued = true;
        queueMicrotask(() => {
          this.#fallbackQueued = false;
          if (this.#media)
            return;
          const media = this.querySelector("video, audio");
          if (media)
            this.#setMedia(media);
        });
      }
    }
    return PlayerProviderElement;
  };
}

// node_modules/@videojs/store/dist/dev/html/controllers/snapshot-controller.js
var SnapshotController = class {
  #host;
  #selector;
  #state;
  #cached;
  #unsubscribe = noop;
  constructor(host, state, selector) {
    this.#host = host;
    this.#state = state;
    this.#selector = selector;
    host.addController(this);
  }
  get value() {
    if (!this.#selector)
      return this.#state.current;
    this.#cached ??= this.#selector(this.#state.current);
    return this.#cached;
  }
  track(state) {
    this.#state = state;
    this.#subscribe();
  }
  hostConnected() {
    this.#subscribe();
  }
  hostDisconnected() {
    this.#unsubscribe();
    this.#unsubscribe = noop;
    this.#cached = undefined;
  }
  #subscribe() {
    this.#unsubscribe();
    if (!this.#selector) {
      this.#unsubscribe = this.#state.subscribe(() => this.#host.requestUpdate());
      return;
    }
    const selector = this.#selector;
    this.#cached = selector(this.#state.current);
    this.#unsubscribe = this.#state.subscribe(() => {
      const next = selector(this.#state.current);
      if (!shallowEqual(this.#cached, next)) {
        this.#cached = next;
        this.#host.requestUpdate();
      }
    });
  }
};
// node_modules/@videojs/store/dist/dev/html/store-accessor.js
var StoreAccessor = class {
  #onAvailable;
  #consumer;
  #directStore;
  constructor(host, source, onAvailable) {
    this.#onAvailable = onAvailable ?? noop;
    if (isStore(source)) {
      this.#directStore = source;
      this.#consumer = null;
    } else {
      this.#directStore = null;
      this.#consumer = new ContextConsumer(host, {
        context: source,
        callback: (store) => this.#onAvailable(store),
        subscribe: false
      });
    }
    host.addController(this);
  }
  get value() {
    if (this.#consumer)
      return this.#consumer.value ?? null;
    return this.#directStore;
  }
  hostConnected() {
    if (this.#directStore)
      this.#onAvailable(this.#directStore);
  }
};

// node_modules/@videojs/store/dist/dev/html/controllers/store-controller.js
var StoreController = class {
  #host;
  #selector;
  #accessor;
  #snapshot = null;
  constructor(host, source, selector) {
    this.#host = host;
    this.#selector = selector;
    this.#accessor = new StoreAccessor(host, source, (store) => this.#connect(store));
    host.addController(this);
  }
  get value() {
    const store = this.#accessor.value;
    if (isNull(store))
      throw new Error("Store not available");
    if (isUndefined(this.#selector))
      return store;
    return this.#snapshot.value;
  }
  hostConnected() {}
  #connect(store) {
    if (isUndefined(this.#selector))
      return;
    if (!this.#snapshot)
      this.#snapshot = new SnapshotController(this.#host, store.$state, this.#selector);
    else
      this.#snapshot.track(store.$state);
  }
};
// node_modules/@videojs/html/dist/dev/player/player-controller.js
var PlayerController = class {
  #host;
  #selector;
  #consumer;
  #store = null;
  constructor(host, context, selector) {
    this.#host = host;
    this.#selector = selector;
    this.#consumer = new ContextConsumer(host, {
      context,
      callback: (ctx) => this.#connect(ctx),
      subscribe: true
    });
    host.addController(this);
  }
  get value() {
    const store = this.#consumer.value;
    if (!store)
      return;
    if (!this.#selector)
      return store;
    return this.#store?.value;
  }
  get displayName() {
    return this.#selector?.displayName;
  }
  hostConnected() {
    const store = this.#consumer.value;
    if (store)
      this.#connect(store);
  }
  hostDisconnected() {
    this.#store = null;
  }
  #connect(store) {
    if (!this.#store && this.#selector)
      this.#store = new StoreController(this.#host, store, this.#selector);
  }
};

// node_modules/@videojs/html/dist/dev/player/create-player.js
function createPlayer(config) {
  const slice = combine(...config.features);
  function create() {
    return createStore()(slice);
  }
  return {
    context: playerContext,
    create,
    PlayerController,
    ProviderMixin: createProviderMixin({
      playerContext,
      mediaContext,
      containerContext,
      factory: create
    }),
    ContainerMixin: createContainerMixin({
      playerContext,
      containerContext
    })
  };
}

// node_modules/@videojs/html/dist/dev/define/safe-define.js
function safeDefine(element) {
  const registry = globalThis.customElements;
  if (!registry || registry.get(element.tagName))
    return;
  registry.define(element.tagName, element);
}

// node_modules/@videojs/html/dist/dev/define/video/player.js
var { ProviderMixin } = createPlayer({ features: videoFeatures });
var VideoPlayerElement = class extends ProviderMixin(MediaElement) {
  static {
    this.tagName = "video-player";
  }
};
safeDefine(VideoPlayerElement);
safeDefine(MediaContainerElement);

// node_modules/@videojs/html/dist/dev/_virtual/inline-css_src/define/global.js
var global_default = `/* -------------------------------------------------------------------------- */
/* Global styles for the host document, outside of the Shadow DOM             */
/* -------------------------------------------------------------------------- */

video-player,
live-video-player {
  display: contents;
}

/*
Required to override any default video and image styles (such as
Tailwind's CSS reset) and ensure they fill the container as expected.
*/
video-player video,
video-player [slot="poster"],
live-video-player video,
live-video-player [slot="poster"] {
  display: block;
  width: 100%;
  height: 100%;
}

video-player video::-webkit-media-text-track-container,
live-video-player video::-webkit-media-text-track-container {
  z-index: 1;
  font-family: inherit;
  scale: 0.98;
  translate: 0 var(--media-caption-track-y, 0);
  transition: translate var(--media-caption-track-duration, 0) ease-out;
  transition-delay: var(--media-caption-track-delay, 0);
}
`;

// node_modules/@videojs/html/dist/dev/_virtual/inline-css_src/define/shared.js
var shared_default = `/* -------------------------------------------------------------------------- */
/* Shared styles for all HTML skins                                           */
/* -------------------------------------------------------------------------- */

media-tooltip-group {
  display: contents;
}

:host {
  /* \`display:grid\` fixes a weird issue with Safari when setting aspect-ratio */
  display: grid;
  width: 100%;
}

/* Hide volume popover when volume control is unsupported (e.g., iOS Safari). */
.media-popover--volume:has(media-volume-slider[data-availability="unsupported"]) {
  display: none;
}
`;

// node_modules/@videojs/html/dist/dev/define/skin-element.js
var STYLES_ID = "__media-styles";
var sharedSheet = createShadowStyle(shared_default);
var SkinElement = class extends ReactiveElement {
  static {
    this.shadowRootOptions = { mode: "open" };
  }
  constructor() {
    super();
    ensureGlobalStyle(STYLES_ID, global_default);
    if (!this.shadowRoot) {
      const ctor = this.constructor;
      this.attachShadow(ctor.shadowRootOptions);
      if (ctor.template)
        renderTemplate(this.shadowRoot, ctor.template);
      const sheets = [sharedSheet];
      if (ctor.styles)
        sheets.push(ctor.styles);
      applyShadowStyles(this.shadowRoot, sheets);
    }
  }
};

// node_modules/@videojs/html/dist/dev/packages/icons/dist/render/default/index.js
var icons = {
  "captions-off": `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" aria-hidden="true" viewBox="0 0 18 18"><rect width="16" height="12" x="1" y="3" stroke="currentColor" stroke-width="2" rx="3"/><rect width="3" height="2" x="3" y="8" fill="currentColor" rx="1"/><rect width="2" height="2" x="13" y="8" fill="currentColor" rx="1"/><rect width="4" height="2" x="11" y="11" fill="currentColor" rx="1"/><rect width="5" height="2" x="7" y="8" fill="currentColor" rx="1"/><rect width="7" height="2" x="3" y="11" fill="currentColor" rx="1"/></svg>`,
  "captions-on": `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" aria-hidden="true" viewBox="0 0 18 18"><path d="M15 2a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H3a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3zM4 11a1 1 0 1 0 0 2h5a1 1 0 1 0 0-2zm8 0a1 1 0 1 0 0 2h2a1 1 0 1 0 0-2zM4 8a1 1 0 0 0 0 2h1a1 1 0 0 0 0-2zm4 0a1 1 0 0 0 0 2h3a1 1 0 1 0 0-2zm6 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2"/></svg>`,
  "cast-enter": `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" aria-hidden="true" viewBox="0 0 18 18"><path fill="currentColor" d="M14.5 2A3.5 3.5 0 0 1 18 5.5v7l-.005.18a3.5 3.5 0 0 1-3.315 3.315L14.5 16h-7c0-.693-.096-1.363-.271-2H14.5a1.5 1.5 0 0 0 1.5-1.5v-7A1.5 1.5 0 0 0 14.5 4h-11A1.5 1.5 0 0 0 2 5.5v3.271A7.5 7.5 0 0 0 0 8.5v-3A3.5 3.5 0 0 1 3.5 2z"/><mask id="a" width="8" height="8" x="0" y="8" maskUnits="userSpaceOnUse" style="mask-type:alpha"><rect width="8" height="8" y="8" fill="#fff" rx=".5"/></mask><g mask="url(#a)"><circle cy="16" r="3.25" stroke="currentColor" stroke-width="1.5"/><circle cy="16" r="5.75" stroke="currentColor" stroke-width="1.5"/><circle cy="16" r="1.5" fill="currentColor"/></g></svg>`,
  "cast-exit": `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" aria-hidden="true" viewBox="0 0 18 18"><rect width="11" height="7" x="3.5" y="5.5" fill="currentColor" rx="1"/><rect width="16" height="12" x="1" y="3" stroke="currentColor" stroke-width="2" rx="2.5"/><circle cy="16" r="7.5" fill="#fff"/><mask id="a" width="8" height="8" x="0" y="8" maskUnits="userSpaceOnUse" style="mask-type:alpha"><rect width="8" height="8" y="8" fill="#fff" rx=".5"/></mask><g mask="url(#a)"><circle cy="16" r="3.25" stroke="currentColor" stroke-width="1.5"/><circle cy="16" r="5.75" stroke="currentColor" stroke-width="1.5"/><circle cy="16" r="1.5" fill="currentColor"/></g></svg>`,
  check: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" aria-hidden="true" viewBox="0 0 18 18"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 10.455 6.5 13 14 5"/></svg>`,
  chevron: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" aria-hidden="true" viewBox="0 0 18 18"><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="m11.964 9.014-4.95-4.95m0 9.9 4.95-4.95"/></svg>`,
  "fullscreen-enter": `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" aria-hidden="true" viewBox="0 0 18 18"><path d="M9.57 3.617A1 1 0 0 0 8.646 3H4c-.552 0-1 .449-1 1v4.646a.996.996 0 0 0 1.001 1 1 1 0 0 0 .706-.293l4.647-4.647a1 1 0 0 0 .216-1.089m4.812 4.812a1 1 0 0 0-1.089.217l-4.647 4.647a.998.998 0 0 0 .708 1.706H14c.552 0 1-.449 1-1V9.353a1 1 0 0 0-.618-.924"/></svg>`,
  "fullscreen-exit": `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" aria-hidden="true" viewBox="0 0 18 18"><path d="M7.883 1.93a.99.99 0 0 0-1.09.217L2.146 6.793A.998.998 0 0 0 2.853 8.5H7.5c.551 0 1-.449 1-1V2.854a1 1 0 0 0-.617-.924m7.263 7.57H10.5c-.551 0-1 .449-1 1v4.646a.996.996 0 0 0 1.001 1.001 1 1 0 0 0 .706-.293l4.646-4.646a.998.998 0 0 0-.707-1.707z"/></svg>`,
  pause: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" aria-hidden="true" viewBox="0 0 18 18"><rect width="5" height="14" x="2" y="2" rx="1.75"/><rect width="5" height="14" x="11" y="2" rx="1.75"/></svg>`,
  "pip-enter": `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" aria-hidden="true" viewBox="0 0 18 18"><path d="M13 2a4 4 0 0 1 4 4v2.036A3.5 3.5 0 0 0 16.5 8H15V6.273C15 5.018 13.96 4 12.679 4H4.32C3.04 4 2 5.018 2 6.273v5.454C2 12.982 3.04 14 4.321 14H6v1.5q0 .255.036.5H4a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4z"/><rect width="10" height="7" x="8" y="10" rx="2"/><path d="M7.129 5.547a.6.6 0 0 0-.656.13L3.677 8.473A.6.6 0 0 0 4.102 9.5h2.796c.332 0 .602-.27.602-.602V6.103a.6.6 0 0 0-.371-.556"/></svg>`,
  "pip-exit": `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" aria-hidden="true" viewBox="0 0 18 18"><path d="M13 2a4 4 0 0 1 4 4v2.036A3.5 3.5 0 0 0 16.5 8H15V6.273C15 5.018 13.96 4 12.679 4H4.32C3.04 4 2 5.018 2 6.273v5.454C2 12.982 3.04 14 4.321 14H6v1.5q0 .255.036.5H4a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4z"/><rect width="10" height="7" x="8" y="10" rx="2"/><path d="M4.871 10.454a.6.6 0 0 0 .656-.131l2.796-2.796A.6.6 0 0 0 7.898 6.5H5.102a.603.603 0 0 0-.602.602v2.795a.6.6 0 0 0 .371.556"/></svg>`,
  play: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" aria-hidden="true" viewBox="0 0 18 18"><path d="m14.051 10.723-7.985 4.964a1.98 1.98 0 0 1-2.758-.638A2.06 2.06 0 0 1 3 13.964V4.036C3 2.91 3.895 2 5 2c.377 0 .747.109 1.066.313l7.985 4.964a2.057 2.057 0 0 1 .627 2.808c-.16.257-.373.475-.627.637"/></svg>`,
  restart: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" aria-hidden="true" viewBox="0 0 18 18"><path d="M9 1a7.98 7.98 0 0 0-6.132 2.867l-1.441-1.44A.25.25 0 0 0 1 2.604V6.75c0 .138.112.25.25.25h4.146a.25.25 0 0 0 .177-.427L4.29 5.29A5.99 5.99 0 0 1 9 3a6 6 0 1 1-6 6H1a8 8 0 1 0 8-8"/><path d="m11.61 9.639-3.331 2.07a.826.826 0 0 1-1.15-.266.86.86 0 0 1-.129-.452V6.849C7 6.38 7.374 6 7.834 6c.158 0 .312.045.445.13l3.331 2.071a.858.858 0 0 1 0 1.438"/></svg>`,
  seek: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" aria-hidden="true" viewBox="0 0 18 18"><path d="M9 1a7.98 7.98 0 0 1 6.132 2.867l1.441-1.44a.25.25 0 0 1 .427.177V6.75a.25.25 0 0 1-.25.25h-4.146a.25.25 0 0 1-.177-.427L13.71 5.29A5.99 5.99 0 0 0 9 3a6 6 0 0 0-4.242 10.242l-1.415 1.415A8 8 0 0 1 9 1"/></svg>`,
  spinner: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2" aria-hidden="true" viewBox="0 0 18 18"><style>@keyframes media-spinner-fade{0%{opacity:1}to{opacity:0}}.media-spinner__segment{animation:var(--media-spinner-animation, media-spinner-fade 1s linear infinite);animation-delay:var(--media-spinner-delay)}</style><path d="M9 1.5v3" class="media-spinner__segment" opacity=".5" style="--media-spinner-delay:0s"/><path d="m14.5 3.5-2 2" class="media-spinner__segment" opacity=".45" style="--media-spinner-delay:0.125s"/><path d="M16.5 9h-3" class="media-spinner__segment" opacity=".4" style="--media-spinner-delay:0.25s"/><path d="m14.5 14.5-2-2" class="media-spinner__segment" opacity=".35" style="--media-spinner-delay:0.375s"/><path d="M9 16.5v-3" class="media-spinner__segment" opacity=".3" style="--media-spinner-delay:0.5s"/><path d="m3.5 14.5 2-2" class="media-spinner__segment" opacity=".25" style="--media-spinner-delay:0.625s"/><path d="M1.5 9h3" class="media-spinner__segment" opacity=".15" style="--media-spinner-delay:0.75s"/><path d="m3.5 3.5 2 2" class="media-spinner__segment" opacity=".1" style="--media-spinner-delay:0.875s"/></svg>`,
  "volume-high": `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" aria-hidden="true" viewBox="0 0 18 18"><path d="M15.6 3.3c-.4-.4-1-.4-1.4 0s-.4 1 0 1.4C15.4 5.9 16 7.4 16 9s-.6 3.1-1.8 4.3c-.4.4-.4 1 0 1.4.2.2.5.3.7.3.3 0 .5-.1.7-.3C17.1 13.2 18 11.2 18 9s-.9-4.2-2.4-5.7"/><path d="M.714 6.008h3.072l4.071-3.857c.5-.376 1.143 0 1.143.601V15.28c0 .602-.643.903-1.143.602l-4.071-3.858H.714c-.428 0-.714-.3-.714-.752V6.76c0-.451.286-.752.714-.752m10.568.59a.91.91 0 0 1 0-1.316.91.91 0 0 1 1.316 0c1.203 1.203 1.47 2.216 1.522 3.208q.012.255.011.51c0 1.16-.358 2.733-1.533 3.803a.7.7 0 0 1-.298.156c-.382.106-.873-.011-1.018-.156a.91.91 0 0 1 0-1.316c.57-.57.995-1.551.995-2.487 0-.944-.26-1.667-.995-2.402"/></svg>`,
  "volume-low": `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" aria-hidden="true" viewBox="0 0 18 18"><path d="M.714 6.008h3.072l4.071-3.857c.5-.376 1.143 0 1.143.601V15.28c0 .602-.643.903-1.143.602l-4.071-3.858H.714c-.428 0-.714-.3-.714-.752V6.76c0-.451.286-.752.714-.752m10.568.59a.91.91 0 0 1 0-1.316.91.91 0 0 1 1.316 0c1.203 1.203 1.47 2.216 1.522 3.208q.012.255.011.51c0 1.16-.358 2.733-1.533 3.803a.7.7 0 0 1-.298.156c-.382.106-.873-.011-1.018-.156a.91.91 0 0 1 0-1.316c.57-.57.995-1.551.995-2.487 0-.944-.26-1.667-.995-2.402"/></svg>`,
  "volume-off": `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" aria-hidden="true" viewBox="0 0 18 18"><path d="M.714 6.008h3.072l4.071-3.857c.5-.376 1.143 0 1.143.601V15.28c0 .602-.643.903-1.143.602l-4.071-3.858H.714c-.428 0-.714-.3-.714-.752V6.76c0-.451.286-.752.714-.752M14.5 7.586l-1.768-1.768a1 1 0 1 0-1.414 1.414L13.085 9l-1.767 1.768a1 1 0 0 0 1.414 1.414l1.768-1.768 1.768 1.768a1 1 0 0 0 1.414-1.414L15.914 9l1.768-1.768a1 1 0 0 0-1.414-1.414z"/></svg>`
};
function renderIcon(name, attrs) {
  const svg = icons[name];
  if (!svg)
    return "";
  if (!attrs)
    return svg;
  const attrStr = Object.entries(attrs).map(([k, v]) => ` ${k}="${v}"`).join("");
  return svg.replace("<svg", `<svg${attrStr}`);
}
// node_modules/@videojs/core/dist/dev/core/ui/alert-dialog/alert-dialog-data-attrs.js
var AlertDialogDataAttrs = {
  open: "data-open",
  ...TransitionDataAttrs
};

// node_modules/@videojs/core/dist/dev/core/ui/buffering-indicator/buffering-indicator-core.js
var BufferingIndicatorCore = class BufferingIndicatorCore2 {
  static defaultProps = { delay: 500 };
  state = createState({ visible: false });
  #props = { ...BufferingIndicatorCore2.defaultProps };
  #timer = null;
  setProps(props) {
    this.#props = defaults(props, BufferingIndicatorCore2.defaultProps);
  }
  destroy() {
    this.#clearTimer();
  }
  update(media) {
    const buffering = media.waiting && !media.paused;
    if (buffering && !this.state.current.visible && !this.#timer)
      this.#timer = setTimeout(() => {
        this.#timer = null;
        this.state.patch({ visible: true });
      }, this.#props.delay);
    else if (!buffering) {
      this.#clearTimer();
      this.state.patch({ visible: false });
    }
  }
  #clearTimer() {
    if (this.#timer !== null) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
  }
};

// node_modules/@videojs/core/dist/dev/core/ui/buffering-indicator/buffering-indicator-data-attrs.js
var BufferingIndicatorDataAttrs = { visible: "data-visible" };

// node_modules/@videojs/core/dist/dev/core/ui/captions-button/captions-button-core.js
var CaptionsButtonCore = class CaptionsButtonCore2 {
  static defaultProps = {
    label: "",
    disabled: false
  };
  state = createState({
    subtitlesShowing: false,
    availability: "unavailable",
    label: ""
  });
  #props = { ...CaptionsButtonCore2.defaultProps };
  #media = null;
  constructor(props) {
    if (props)
      this.setProps(props);
  }
  setProps(props) {
    this.#props = defaults(props, CaptionsButtonCore2.defaultProps);
  }
  getLabel(state) {
    const { label } = this.#props;
    if (isFunction(label)) {
      const customLabel = label(state);
      if (customLabel)
        return customLabel;
    } else if (label)
      return label;
    return state.subtitlesShowing ? "Disable captions" : "Enable captions";
  }
  getAttrs(state) {
    return {
      "aria-label": this.getLabel(state),
      "aria-disabled": this.#props.disabled ? "true" : undefined
    };
  }
  setMedia(media) {
    this.#media = media;
  }
  getState() {
    const media = this.#media;
    const availability = media.textTrackList.some((t) => t.kind === "captions" || t.kind === "subtitles") ? "available" : "unavailable";
    this.state.patch({
      subtitlesShowing: media.subtitlesShowing,
      availability
    });
    this.state.patch({ label: this.getLabel(this.state.current) });
    return this.state.current;
  }
  toggle(media) {
    if (this.#props.disabled)
      return;
    media.toggleSubtitles();
  }
};

// node_modules/@videojs/core/dist/dev/core/ui/captions-button/captions-button-data-attrs.js
var CaptionsButtonDataAttrs = {
  subtitlesShowing: "data-active",
  availability: "data-availability"
};

// node_modules/@videojs/core/dist/dev/core/ui/cast-button/cast-button-core.js
var CastButtonCore = class CastButtonCore2 {
  static defaultProps = {
    label: "",
    disabled: false
  };
  state = createState({
    castState: "disconnected",
    availability: "unsupported",
    label: ""
  });
  #props = { ...CastButtonCore2.defaultProps };
  #media = null;
  constructor(props) {
    if (props)
      this.setProps(props);
  }
  setProps(props) {
    this.#props = defaults(props, CastButtonCore2.defaultProps);
  }
  getLabel(state) {
    const { label } = this.#props;
    if (isFunction(label)) {
      const customLabel = label(state);
      if (customLabel)
        return customLabel;
    } else if (label)
      return label;
    if (state.castState === "connected")
      return "Stop casting";
    if (state.castState === "connecting")
      return "Connecting";
    return "Start casting";
  }
  getAttrs(state) {
    return {
      "aria-label": this.getLabel(state),
      "aria-disabled": this.#props.disabled ? "true" : undefined
    };
  }
  setMedia(media) {
    this.#media = media;
  }
  getState() {
    const media = this.#media;
    const castSupported = !!globalThis.chrome;
    this.state.patch({
      castState: media.remotePlaybackState,
      availability: castSupported ? media.remotePlaybackAvailability : "unsupported"
    });
    this.state.patch({ label: this.getLabel(this.state.current) });
    return this.state.current;
  }
  async toggle(media) {
    if (this.#props.disabled)
      return;
    if (media.remotePlaybackAvailability !== "available")
      return;
    try {
      await media.toggleRemotePlayback();
    } catch {}
  }
};

// node_modules/@videojs/core/dist/dev/core/ui/cast-button/cast-button-data-attrs.js
var CastButtonDataAttrs = {
  castState: "data-cast-state",
  availability: "data-availability"
};

// node_modules/@videojs/core/dist/dev/core/ui/controls/controls-core.js
var ControlsCore = class {
  #media = null;
  setMedia(media) {
    this.#media = media;
  }
  getState() {
    const media = this.#media;
    return {
      visible: media.controlsVisible,
      userActive: media.userActive
    };
  }
};

// node_modules/@videojs/core/dist/dev/core/ui/controls/controls-data-attrs.js
var ControlsDataAttrs = {
  visible: "data-visible",
  userActive: "data-user-active"
};

// node_modules/@videojs/core/dist/dev/core/ui/alert-dialog/alert-dialog-core.js
var AlertDialogCore = class {
  static defaultProps = {
    open: false,
    defaultOpen: false
  };
  setProps(_props) {}
  #input = null;
  #titleId = undefined;
  #descriptionId = undefined;
  setInput(input) {
    this.#input = input;
  }
  setTitleId(id) {
    this.#titleId = id;
  }
  setDescriptionId(id) {
    this.#descriptionId = id;
  }
  getState() {
    const input = this.#input;
    return {
      open: input.active,
      status: input.status,
      titleId: this.#titleId,
      descriptionId: this.#descriptionId,
      ...getTransitionFlags(input.status)
    };
  }
  getAttrs(state) {
    return {
      role: "alertdialog",
      "aria-modal": "true",
      "aria-labelledby": state.titleId,
      "aria-describedby": state.descriptionId
    };
  }
};

// node_modules/@videojs/core/dist/dev/core/ui/error-dialog/error-dialog-core.js
var ErrorDialogCore = class extends AlertDialogCore {
  setProps() {}
};

// node_modules/@videojs/core/dist/dev/core/ui/fullscreen-button/fullscreen-button-core.js
var FullscreenButtonCore = class FullscreenButtonCore2 {
  static defaultProps = {
    label: "",
    disabled: false
  };
  state = createState({
    fullscreen: false,
    availability: "available",
    label: ""
  });
  #props = { ...FullscreenButtonCore2.defaultProps };
  #media = null;
  constructor(props) {
    if (props)
      this.setProps(props);
  }
  setProps(props) {
    this.#props = defaults(props, FullscreenButtonCore2.defaultProps);
  }
  getLabel(state) {
    const { label } = this.#props;
    if (isFunction(label)) {
      const customLabel = label(state);
      if (customLabel)
        return customLabel;
    } else if (label)
      return label;
    return state.fullscreen ? "Exit fullscreen" : "Enter fullscreen";
  }
  getAttrs(state) {
    return {
      "aria-label": this.getLabel(state),
      "aria-disabled": this.#props.disabled ? "true" : undefined
    };
  }
  setMedia(media) {
    this.#media = media;
  }
  getState() {
    const media = this.#media;
    this.state.patch({
      fullscreen: media.fullscreen,
      availability: media.fullscreenAvailability
    });
    this.state.patch({ label: this.getLabel(this.state.current) });
    return this.state.current;
  }
  async toggle(media) {
    if (this.#props.disabled)
      return;
    if (media.fullscreenAvailability !== "available")
      return;
    try {
      if (media.fullscreen)
        await media.exitFullscreen();
      else
        await media.requestFullscreen();
    } catch {}
  }
};

// node_modules/@videojs/core/dist/dev/core/ui/fullscreen-button/fullscreen-button-data-attrs.js
var FullscreenButtonDataAttrs = {
  fullscreen: "data-fullscreen",
  availability: "data-availability"
};

// node_modules/@videojs/utils/dist/time/format.js
var UNIT_LABELS = [
  {
    singular: "hour",
    plural: "hours"
  },
  {
    singular: "minute",
    plural: "minutes"
  },
  {
    singular: "second",
    plural: "seconds"
  }
];
function isValidTime(value) {
  return isNumber(value) && Number.isFinite(value);
}
function toTimeUnitPhrase(value, unitIndex) {
  return `${value} ${value === 1 ? UNIT_LABELS[unitIndex]?.singular : UNIT_LABELS[unitIndex]?.plural}`;
}
function formatTime(seconds, guide) {
  if (!isValidTime(seconds))
    return "0:00";
  const negative = seconds < 0;
  const positiveSeconds = Math.abs(seconds);
  const h = Math.floor(positiveSeconds / 3600);
  const m = Math.floor(positiveSeconds / 60 % 60);
  const s = Math.floor(positiveSeconds % 60);
  const guideAbs = guide ? Math.abs(guide) : 0;
  const gh = Math.floor(guideAbs / 3600);
  const gm = Math.floor(guideAbs / 60 % 60);
  const showHours = h > 0 || gh > 0;
  const padMinutes = showHours || gm >= 10;
  const hoursStr = showHours ? `${h}:` : "";
  const minutesStr = `${padMinutes && m < 10 ? "0" : ""}${m}:`;
  const secondsStr = s < 10 ? `0${s}` : `${s}`;
  return `${negative ? "-" : ""}${hoursStr}${minutesStr}${secondsStr}`;
}
function formatTimeAsPhrase(seconds) {
  if (!isValidTime(seconds))
    return "";
  const negative = seconds < 0;
  const positiveSeconds = Math.abs(seconds);
  const h = Math.floor(positiveSeconds / 3600);
  const m = Math.floor(positiveSeconds / 60 % 60);
  const s = Math.floor(positiveSeconds % 60);
  if (positiveSeconds === 0)
    return `${toTimeUnitPhrase(0, 2)}${negative ? " remaining" : ""}`;
  return `${[
    h,
    m,
    s
  ].map((value, index) => value > 0 ? toTimeUnitPhrase(value, index) : null).filter(Boolean).join(", ")}${negative ? " remaining" : ""}`;
}
function secondsToIsoDuration(seconds) {
  if (!isValidTime(seconds))
    return "PT0S";
  const positiveSeconds = Math.abs(seconds);
  const h = Math.floor(positiveSeconds / 3600);
  const m = Math.floor(positiveSeconds / 60 % 60);
  const s = Math.floor(positiveSeconds % 60);
  let duration = "PT";
  if (h > 0)
    duration += `${h}H`;
  if (m > 0)
    duration += `${m}M`;
  if (s > 0 || duration === "PT")
    duration += `${s}S`;
  return duration;
}

// node_modules/@videojs/core/dist/dev/core/ui/input-feedback/status.js
var DEFAULT_INPUT_INDICATOR_LABELS = {
  muted: "Muted",
  volume: "Volume",
  captionsOn: "Captions on",
  captionsOff: "Captions off",
  paused: "Paused",
  playing: "Playing",
  fullscreen: "Fullscreen",
  exitFullscreen: "Exit fullscreen",
  pictureInPicture: "Picture in picture",
  exitPictureInPicture: "Exit picture in picture"
};
function isVolumeIndicatorAction(action) {
  return action === "toggleMuted" || action === "volumeStep";
}
function isSeekIndicatorAction(action) {
  return action === "seekStep" || action === "seekToPercent";
}
function deriveStatus(event, snapshot, labels = DEFAULT_INPUT_INDICATOR_LABELS) {
  switch (event.action) {
    case "togglePaused": {
      const paused = snapshot.paused !== undefined ? !snapshot.paused : true;
      return {
        status: paused ? "pause" : "play",
        label: paused ? labels.paused : labels.playing,
        value: null,
        volumeLevel: null
      };
    }
    case "toggleMuted":
    case "volumeStep":
      return deriveVolumeStatus(event, snapshot, labels);
    case "toggleSubtitles": {
      const showing = snapshot.subtitlesShowing !== undefined ? !snapshot.subtitlesShowing : true;
      return {
        status: showing ? "captions-on" : "captions-off",
        label: showing ? labels.captionsOn : labels.captionsOff,
        value: null,
        volumeLevel: null
      };
    }
    case "toggleFullscreen": {
      const fullscreen = snapshot.fullscreen !== undefined ? !snapshot.fullscreen : true;
      return {
        status: fullscreen ? "fullscreen" : "exit-fullscreen",
        label: fullscreen ? labels.fullscreen : labels.exitFullscreen,
        value: null,
        volumeLevel: null
      };
    }
    case "togglePictureInPicture": {
      const pip = snapshot.pip !== undefined ? !snapshot.pip : true;
      return {
        status: pip ? "pip" : "exit-pip",
        label: pip ? labels.pictureInPicture : labels.exitPictureInPicture,
        value: null,
        volumeLevel: null
      };
    }
    default:
      return null;
  }
}
function deriveAnnouncerLabel(event, snapshot, labels = DEFAULT_INPUT_INDICATOR_LABELS) {
  const details = deriveStatus(event, snapshot, labels);
  if (!details)
    return null;
  if (isVolumeIndicatorAction(event.action))
    return details.status === "volume-off" ? labels.muted : `${labels.volume} ${details.value}`;
  return details.label;
}
function getVolumeLevel(volume) {
  if (volume <= 0)
    return "off";
  return volume <= 0.5 ? "low" : "high";
}
function formatVolumeValue(volume) {
  return `${Math.round(clamp(volume, 0, 1) * 100)}%`;
}
function formatCurrentTime(snapshot) {
  return formatTime(snapshot.currentTime ?? 0, snapshot.duration);
}
function getStatusIndicatorDisplayValue(state) {
  return state.value ?? state.label ?? "";
}
function getVolumeIndicatorDisplayValue(state) {
  return state.value ?? "";
}
function getSeekIndicatorDisplayValue(state) {
  return state.value ?? state.currentTime;
}
function getSeekToPercent(event) {
  if (event.value !== undefined)
    return clamp(event.value, 0, 100);
  if (!event.key || event.key < "0" || event.key > "9")
    return null;
  return Number(event.key) * 10;
}
function getSeekDirection(event, snapshot) {
  if (event.action === "seekStep" && event.value !== undefined) {
    if (event.value > 0)
      return "forward";
    if (event.value < 0)
      return "backward";
  }
  if (event.action === "seekToPercent") {
    const percent = getSeekToPercent(event);
    if (percent === null || snapshot.duration === undefined || snapshot.duration <= 0)
      return null;
    const targetTime = percent / 100 * snapshot.duration;
    const currentTime = snapshot.currentTime ?? 0;
    if (targetTime > currentTime)
      return "forward";
    if (targetTime < currentTime)
      return "backward";
  }
  return null;
}
function isInputActionIncluded(action, actions) {
  if (!action)
    return false;
  return !actions || actions.includes(action);
}
function predictVolumeActionOutcome(event, snapshot) {
  const muted = snapshot.muted === true;
  const snapshotVolume = snapshot.volume ?? 0;
  if (event.action === "toggleMuted")
    return {
      snapshotVolume,
      nextMuted: !muted,
      nextVolume: snapshotVolume
    };
  if (event.action === "volumeStep") {
    const nextVolume = clamp(snapshotVolume + (event.value ?? 0), 0, 1);
    return {
      snapshotVolume,
      nextMuted: muted && nextVolume <= 0,
      nextVolume
    };
  }
  return {
    snapshotVolume,
    nextMuted: muted,
    nextVolume: snapshotVolume
  };
}
function volumePredictionToStatusDetails(prediction, labels) {
  const level = prediction.nextMuted ? "off" : getVolumeLevel(prediction.nextVolume);
  const value = prediction.nextMuted ? "0%" : formatVolumeValue(prediction.nextVolume);
  return {
    status: level === "off" ? "volume-off" : level === "low" ? "volume-low" : "volume-high",
    label: level === "off" ? labels.muted : labels.volume,
    value,
    volumeLevel: level
  };
}
function deriveVolumeStatus(event, snapshot, labels = DEFAULT_INPUT_INDICATOR_LABELS, cachedPrediction) {
  return volumePredictionToStatusDetails(cachedPrediction ?? predictVolumeActionOutcome(event, snapshot), labels);
}

// node_modules/@videojs/core/dist/dev/core/ui/input-feedback/seek-indicator-core.js
var INITIAL_STATE = {
  open: false,
  generation: 0,
  direction: null,
  count: 0,
  seekTotal: 0,
  value: null,
  currentTime: "0:00",
  transitionStarting: false,
  transitionEnding: false
};
var SeekIndicatorCore = class {
  state = createState({ ...INITIAL_STATE });
  #props = {};
  #originTime = null;
  #close = new IndicatorCloseController(() => {
    this.#originTime = null;
    this.state.patch({
      open: false,
      direction: null,
      count: 0,
      seekTotal: 0,
      value: null
    });
  }, () => getIndicatorCloseDelay(this.#props));
  setProps(props) {
    this.#props = props;
  }
  destroy() {
    this.#close.destroy();
  }
  close() {
    this.#close.close();
  }
  processEvent(event, snapshot) {
    if (!isSeekIndicatorAction(event.action))
      return false;
    const current = this.state.current;
    const direction = getSeekDirection(event, snapshot);
    const rapidRepeat = current.open && event.action === "seekStep" && current.direction === direction;
    if (!rapidRepeat)
      this.#originTime = snapshot.currentTime ?? null;
    const value = this.#getEffectiveSeekValue(event, snapshot, rapidRepeat);
    const seekTotal = rapidRepeat ? current.seekTotal + Math.abs(value) : Math.abs(value);
    this.state.patch({
      open: true,
      generation: current.generation + 1,
      direction,
      count: rapidRepeat ? current.count + 1 : 1,
      seekTotal,
      value: event.action === "seekStep" && seekTotal > 0 ? `${seekTotal}s` : null,
      currentTime: formatCurrentTime(snapshot)
    });
    this.#close.arm();
    return true;
  }
  #getEffectiveSeekValue(event, snapshot, rapidRepeat) {
    if (event.action !== "seekStep" || event.value === undefined)
      return 0;
    if (!rapidRepeat || this.#originTime === null)
      return event.value;
    const originTime = this.#originTime;
    const duration = snapshot.duration ?? Infinity;
    const currentTotal = this.state.current.seekTotal;
    const step = Math.abs(event.value);
    return (event.value < 0 ? Math.max(0, originTime - currentTotal) : Math.max(0, duration - originTime - currentTotal)) >= step ? event.value : 0;
  }
};

// node_modules/@videojs/core/dist/dev/core/ui/input-feedback/seek-indicator-data-attrs.js
var SeekIndicatorDataAttrs = {
  open: "data-open",
  direction: "data-direction",
  transitionStarting: "data-starting-style",
  transitionEnding: "data-ending-style"
};

// node_modules/@videojs/core/dist/dev/core/ui/input-feedback/status-announcer-core.js
var StatusAnnouncerCore = class {
  state = createState({ label: null });
  #props = {};
  #close = new IndicatorCloseController(() => this.state.patch({ label: null }), () => getIndicatorCloseDelay(this.#props));
  setProps(props) {
    this.#props = props;
  }
  destroy() {
    this.#close.destroy();
  }
  processEvent(event, snapshot) {
    const label = deriveAnnouncerLabel(event, snapshot, {
      ...DEFAULT_INPUT_INDICATOR_LABELS,
      ...this.#props.labels
    });
    if (!label)
      return false;
    this.state.patch({ label });
    this.#close.arm();
    return true;
  }
};

// node_modules/@videojs/core/dist/dev/core/ui/input-feedback/status-indicator-core.js
var INITIAL_STATE2 = {
  open: false,
  generation: 0,
  status: null,
  label: null,
  value: null,
  transitionStarting: false,
  transitionEnding: false
};
var StatusIndicatorCore = class {
  state = createState({ ...INITIAL_STATE2 });
  #props = {};
  #close = new IndicatorCloseController(() => this.state.patch({
    open: false,
    status: null,
    label: null,
    value: null
  }), () => getIndicatorCloseDelay(this.#props));
  setProps(props) {
    this.#props = props;
  }
  destroy() {
    this.#close.destroy();
  }
  close() {
    this.#close.close();
  }
  processEvent(event, snapshot) {
    if (!isInputActionIncluded(event.action, this.#props.actions))
      return false;
    const details = deriveStatus(event, snapshot, {
      ...DEFAULT_INPUT_INDICATOR_LABELS,
      ...this.#props.labels
    });
    if (!details)
      return false;
    this.state.patch({
      open: true,
      generation: this.state.current.generation + 1,
      status: details.status,
      label: details.label,
      value: details.value
    });
    this.#close.arm();
    return true;
  }
};

// node_modules/@videojs/core/dist/dev/core/ui/input-feedback/status-indicator-data-attrs.js
var StatusIndicatorDataAttrs = {
  open: "data-open",
  status: "data-status",
  transitionStarting: "data-starting-style",
  transitionEnding: "data-ending-style"
};

// node_modules/@videojs/core/dist/dev/core/ui/input-feedback/volume-indicator-core.js
var BOUNDARY_CLEAR_DELAY = 300;
var INITIAL_STATE3 = {
  open: false,
  generation: 0,
  level: null,
  value: null,
  fill: null,
  min: false,
  max: false,
  transitionStarting: false,
  transitionEnding: false
};
var VolumeIndicatorCore = class {
  state = createState({ ...INITIAL_STATE3 });
  #props = {};
  #boundaryTimer = null;
  #boundaryRestartTimer = null;
  #close = new IndicatorCloseController(() => this.state.patch({
    open: false,
    level: null,
    value: null,
    fill: null,
    min: false,
    max: false
  }), () => getIndicatorCloseDelay(this.#props));
  setProps(props) {
    this.#props = props;
  }
  destroy() {
    this.#close.destroy();
    this.#clearBoundaryTimers();
  }
  close() {
    this.#clearBoundaryTimers();
    this.#close.close();
  }
  processEvent(event, snapshot) {
    if (!isVolumeIndicatorAction(event.action))
      return false;
    const current = this.state.current;
    const prediction = predictVolumeActionOutcome(event, snapshot);
    const details = deriveVolumeStatus(event, snapshot, DEFAULT_INPUT_INDICATOR_LABELS, prediction);
    const boundary = getVolumeBoundary(event, prediction.snapshotVolume, prediction.nextVolume);
    const repeatedBoundary = boundary !== null && current[boundary] === true;
    if (!boundary)
      this.#clearBoundaryTimers();
    this.state.patch({
      open: true,
      generation: current.generation + 1,
      level: details.volumeLevel,
      value: details.value,
      fill: details.value,
      min: boundary === "min" && !repeatedBoundary,
      max: boundary === "max" && !repeatedBoundary
    });
    if (boundary)
      if (repeatedBoundary)
        this.#restartBoundary(boundary);
      else
        this.#scheduleBoundaryClear();
    this.#close.arm();
    return true;
  }
  #scheduleBoundaryClear() {
    this.#clearBoundaryTimer();
    this.#boundaryTimer = setTimeout(() => {
      this.#boundaryTimer = null;
      this.state.patch({
        min: false,
        max: false
      });
    }, BOUNDARY_CLEAR_DELAY);
  }
  #restartBoundary(boundary) {
    this.#clearBoundaryTimers();
    this.state.patch({
      min: false,
      max: false
    });
    this.#boundaryRestartTimer = setTimeout(() => {
      this.#boundaryRestartTimer = null;
      this.state.patch({ [boundary]: true });
      this.#scheduleBoundaryClear();
    }, 0);
  }
  #clearBoundaryTimer() {
    if (this.#boundaryTimer === null)
      return;
    clearTimeout(this.#boundaryTimer);
    this.#boundaryTimer = null;
  }
  #clearBoundaryRestartTimer() {
    if (this.#boundaryRestartTimer === null)
      return;
    clearTimeout(this.#boundaryRestartTimer);
    this.#boundaryRestartTimer = null;
  }
  #clearBoundaryTimers() {
    this.#clearBoundaryTimer();
    this.#clearBoundaryRestartTimer();
  }
};
function getVolumeBoundary(event, currentVolume, nextVolume) {
  if (event.action !== "volumeStep" || event.value === undefined || event.value === 0)
    return null;
  if (nextVolume !== currentVolume)
    return null;
  return event.value < 0 ? "min" : "max";
}

// node_modules/@videojs/core/dist/dev/core/ui/input-feedback/volume-indicator-css-vars.js
var VolumeIndicatorCSSVars = { fill: "--media-volume-fill" };

// node_modules/@videojs/core/dist/dev/core/ui/input-feedback/volume-indicator-data-attrs.js
var VolumeIndicatorDataAttrs = {
  open: "data-open",
  level: "data-level",
  min: "data-min",
  max: "data-max",
  transitionStarting: "data-starting-style",
  transitionEnding: "data-ending-style"
};

// node_modules/@videojs/core/dist/dev/core/ui/live-button/live-button-core.js
var LIVE_EDGE_OFFSET = 10;
var LIVE_EDGE_TOLERANCE = 5;
var LiveButtonCore = class LiveButtonCore2 {
  static defaultText = "Live";
  static defaultProps = {
    label: "",
    disabled: false
  };
  state = createState({
    live: false,
    liveEdge: false,
    label: ""
  });
  #props = { ...LiveButtonCore2.defaultProps };
  #media = null;
  constructor(props) {
    if (props)
      this.setProps(props);
  }
  setProps(props) {
    this.#props = defaults(props, LiveButtonCore2.defaultProps);
  }
  getLabel(state) {
    const { label } = this.#props;
    if (isFunction(label)) {
      const customLabel = label(state);
      if (customLabel)
        return customLabel;
    } else if (label)
      return label;
    if (state.liveEdge)
      return "Playing live";
    return "Seek to live edge";
  }
  getAttrs(state) {
    const inactive = this.#props.disabled || state.liveEdge;
    return {
      "aria-label": this.getLabel(state),
      "aria-disabled": inactive ? "true" : undefined
    };
  }
  setMedia(media) {
    this.#media = media;
  }
  getState() {
    const media = this.#media;
    const live = isLiveMedia(media);
    const liveEdge = live && this.#isAtLiveEdge(media);
    this.state.patch({
      live,
      liveEdge
    });
    this.state.patch({ label: this.getLabel(this.state.current) });
    return this.state.current;
  }
  async seekToLive(media) {
    if (this.#props.disabled)
      return;
    if (!isLiveMedia(media))
      return;
    if (this.#isAtLiveEdge(media))
      return;
    const target = liveEdgeTarget(media);
    if (target == null)
      return;
    await media.seek(target);
  }
  #isAtLiveEdge(media) {
    const { currentTime, liveEdgeStart } = media;
    if (Number.isFinite(liveEdgeStart))
      return currentTime >= liveEdgeStart - LIVE_EDGE_TOLERANCE;
    const target = liveEdgeTarget(media);
    if (target == null)
      return false;
    return currentTime >= target - LIVE_EDGE_OFFSET;
  }
};
function isLiveMedia(media) {
  return !Number.isNaN(media.targetLiveWindow);
}
function liveEdgeTarget(media) {
  const { seekable } = media;
  if (seekable.length === 0)
    return null;
  const end = seekable[seekable.length - 1][1];
  return Number.isFinite(end) ? end : null;
}

// node_modules/@videojs/core/dist/dev/core/ui/live-button/live-button-data-attrs.js
var LiveButtonDataAttrs = {
  live: "data-live",
  liveEdge: "data-live-edge"
};

// node_modules/@videojs/core/dist/dev/core/ui/menu/menu-core.js
var MenuCore = class MenuCore2 {
  static defaultProps = {
    side: "bottom",
    align: "start",
    open: false,
    defaultOpen: false,
    closeOnEscape: true,
    closeOnOutsideClick: true,
    isSubmenu: false
  };
  #props = { ...MenuCore2.defaultProps };
  #input = null;
  get props() {
    return this.#props;
  }
  constructor(props) {
    if (props)
      this.setProps(props);
  }
  setProps(props) {
    this.#props = defaults(props, MenuCore2.defaultProps);
  }
  setInput(input) {
    this.#input = input;
  }
  getState() {
    const input = this.#input;
    const isSubmenu = this.#props.isSubmenu;
    return {
      open: input.active,
      status: input.status,
      side: isSubmenu ? undefined : this.#props.side,
      align: isSubmenu ? undefined : this.#props.align,
      isSubmenu,
      ...getTransitionFlags(input.status)
    };
  }
  getTriggerAttrs(state, contentId) {
    return {
      "aria-haspopup": "menu",
      "aria-expanded": state.open ? "true" : "false",
      "aria-controls": contentId
    };
  }
  getContentAttrs(state) {
    return {
      role: "menu",
      tabIndex: -1,
      ...!state.isSubmenu && { popover: "manual" }
    };
  }
};
// node_modules/@videojs/core/dist/dev/core/ui/menu/menu-data-attrs.js
var MenuDataAttrs = {
  open: "data-open",
  side: "data-side",
  align: "data-align",
  isSubmenu: "data-submenu",
  ...TransitionDataAttrs
};
// node_modules/@videojs/core/dist/dev/core/ui/mute-button/mute-button-core.js
var MuteButtonCore = class MuteButtonCore2 {
  static defaultProps = {
    label: "",
    disabled: false
  };
  state = createState({
    muted: false,
    volumeLevel: "off",
    label: ""
  });
  #props = { ...MuteButtonCore2.defaultProps };
  #media = null;
  constructor(props) {
    if (props)
      this.setProps(props);
  }
  setProps(props) {
    this.#props = defaults(props, MuteButtonCore2.defaultProps);
  }
  getLabel(state) {
    const { label } = this.#props;
    if (isFunction(label)) {
      const customLabel = label(state);
      if (customLabel)
        return customLabel;
    } else if (label)
      return label;
    return state.muted ? "Unmute" : "Mute";
  }
  getAttrs(state) {
    return {
      "aria-label": this.getLabel(state),
      "aria-disabled": this.#props.disabled ? "true" : undefined
    };
  }
  setMedia(media) {
    this.#media = media;
  }
  getState() {
    const media = this.#media;
    this.state.patch({
      muted: media.muted || media.volume === 0,
      volumeLevel: getVolumeLevel2(media)
    });
    this.state.patch({ label: this.getLabel(this.state.current) });
    return this.state.current;
  }
  toggle(media) {
    if (this.#props.disabled)
      return;
    media.toggleMuted();
  }
};
function getVolumeLevel2(media) {
  if (media.muted || media.volume === 0)
    return "off";
  if (media.volume < 0.5)
    return "low";
  if (media.volume < 0.75)
    return "medium";
  return "high";
}

// node_modules/@videojs/core/dist/dev/core/ui/mute-button/mute-button-data-attrs.js
var MuteButtonDataAttrs = {
  muted: "data-muted",
  volumeLevel: "data-volume-level"
};

// node_modules/@videojs/core/dist/dev/core/ui/pip-button/pip-button-core.js
var PiPButtonCore = class PiPButtonCore2 {
  static defaultProps = {
    label: "",
    disabled: false
  };
  state = createState({
    pip: false,
    availability: "available",
    label: ""
  });
  #props = { ...PiPButtonCore2.defaultProps };
  #media = null;
  constructor(props) {
    if (props)
      this.setProps(props);
  }
  setProps(props) {
    this.#props = defaults(props, PiPButtonCore2.defaultProps);
  }
  getLabel(state) {
    const { label } = this.#props;
    if (isFunction(label)) {
      const customLabel = label(state);
      if (customLabel)
        return customLabel;
    } else if (label)
      return label;
    return state.pip ? "Exit picture-in-picture" : "Enter picture-in-picture";
  }
  getAttrs(state) {
    return {
      "aria-label": this.getLabel(state),
      "aria-disabled": this.#props.disabled ? "true" : undefined
    };
  }
  setMedia(media) {
    this.#media = media;
  }
  getState() {
    const media = this.#media;
    this.state.patch({
      pip: media.pip,
      availability: media.pipAvailability
    });
    this.state.patch({ label: this.getLabel(this.state.current) });
    return this.state.current;
  }
  async toggle(media) {
    if (this.#props.disabled)
      return;
    if (media.pipAvailability !== "available")
      return;
    try {
      if (media.pip)
        await media.exitPictureInPicture();
      else
        await media.requestPictureInPicture();
    } catch {}
  }
};

// node_modules/@videojs/core/dist/dev/core/ui/pip-button/pip-button-data-attrs.js
var PiPButtonDataAttrs = {
  pip: "data-pip",
  availability: "data-availability"
};

// node_modules/@videojs/core/dist/dev/core/ui/play-button/play-button-core.js
var PlayButtonCore = class PlayButtonCore2 {
  static defaultProps = {
    label: "",
    disabled: false
  };
  state = createState({
    paused: true,
    ended: false,
    started: false,
    label: ""
  });
  #props = { ...PlayButtonCore2.defaultProps };
  #media = null;
  constructor(props) {
    if (props)
      this.setProps(props);
  }
  setProps(props) {
    this.#props = defaults(props, PlayButtonCore2.defaultProps);
  }
  getLabel(state) {
    const { label } = this.#props;
    if (isFunction(label)) {
      const customLabel = label(state);
      if (customLabel)
        return customLabel;
    } else if (label)
      return label;
    if (state.ended)
      return "Replay";
    return state.paused ? "Play" : "Pause";
  }
  getAttrs(state) {
    return {
      "aria-label": this.getLabel(state),
      "aria-disabled": this.#props.disabled ? "true" : undefined
    };
  }
  setMedia(media) {
    this.#media = media;
  }
  getState() {
    const media = this.#media;
    this.state.patch({
      paused: media.paused,
      ended: media.ended,
      started: media.started
    });
    this.state.patch({ label: this.getLabel(this.state.current) });
    return this.state.current;
  }
  async toggle(media) {
    if (this.#props.disabled)
      return;
    if (media.paused || media.ended)
      return media.play();
    media.pause();
  }
};

// node_modules/@videojs/core/dist/dev/core/ui/play-button/play-button-data-attrs.js
var PlayButtonDataAttrs = {
  paused: "data-paused",
  ended: "data-ended",
  started: "data-started"
};

// node_modules/@videojs/core/dist/dev/core/ui/playback-rate-button/playback-rate-button-core.js
var PlaybackRateButtonCore = class PlaybackRateButtonCore2 {
  static defaultProps = {
    label: "",
    disabled: false
  };
  state = createState({
    rate: 1,
    label: ""
  });
  #props = { ...PlaybackRateButtonCore2.defaultProps };
  #media = null;
  constructor(props) {
    if (props)
      this.setProps(props);
  }
  setProps(props) {
    this.#props = defaults(props, PlaybackRateButtonCore2.defaultProps);
  }
  getLabel(state) {
    const { label } = this.#props;
    if (isFunction(label)) {
      const customLabel = label(state);
      if (customLabel)
        return customLabel;
    } else if (label)
      return label;
    return `Playback rate ${state.rate}`;
  }
  getAttrs(state) {
    return {
      "aria-label": this.getLabel(state),
      "aria-disabled": this.#props.disabled ? "true" : undefined
    };
  }
  setMedia(media) {
    this.#media = media;
  }
  getState() {
    const media = this.#media;
    this.state.patch({ rate: media.playbackRate });
    this.state.patch({ label: this.getLabel(this.state.current) });
    return this.state.current;
  }
  cycle(media) {
    if (this.#props.disabled)
      return;
    const { playbackRates, playbackRate } = media;
    if (playbackRates.length === 0)
      return;
    const idx = playbackRates.indexOf(playbackRate);
    const next = idx === -1 ? playbackRates.find((r) => r > playbackRate) ?? playbackRates[0] : playbackRates[(idx + 1) % playbackRates.length];
    media.setPlaybackRate(next);
  }
};

// node_modules/@videojs/core/dist/dev/core/ui/playback-rate-button/playback-rate-button-data-attrs.js
var PlaybackRateButtonDataAttrs = { rate: "data-rate" };

// node_modules/@videojs/core/dist/dev/core/ui/playback-rate-menu/playback-rate-menu-core.js
function formatPlaybackRate(rate) {
  return `${rate}×`;
}
var PlaybackRateMenuCore = class PlaybackRateMenuCore2 {
  static defaultProps = {
    label: "",
    formatRate: formatPlaybackRate,
    disabled: false
  };
  state = createState({
    rate: 1,
    rates: [],
    disabled: false,
    label: ""
  });
  #props = { ...PlaybackRateMenuCore2.defaultProps };
  #media = null;
  constructor(props) {
    if (props)
      this.setProps(props);
  }
  setProps(props) {
    this.#props = defaults(props, PlaybackRateMenuCore2.defaultProps);
  }
  getLabel(state) {
    const { label } = this.#props;
    if (isFunction(label)) {
      const customLabel = label(state);
      if (customLabel)
        return customLabel;
    } else if (label)
      return label;
    return `Playback rate ${state.rate}`;
  }
  getRateLabel(rate) {
    return this.#props.formatRate(rate);
  }
  getRateValue(rate) {
    return String(rate);
  }
  getAttrs(state) {
    return {
      "aria-label": this.getLabel(state),
      "aria-disabled": state.disabled ? "true" : undefined
    };
  }
  setMedia(media) {
    this.#media = media;
  }
  getState() {
    const media = this.#media;
    this.state.patch({
      rate: media.playbackRate,
      rates: media.playbackRates,
      disabled: this.#props.disabled || media.playbackRates.length === 0
    });
    this.state.patch({ label: this.getLabel(this.state.current) });
    return this.state.current;
  }
  select(media, rate) {
    if (this.#props.disabled)
      return;
    if (!media.playbackRates.includes(rate))
      return;
    media.setPlaybackRate(rate);
  }
  selectValue(media, value) {
    const rate = media.playbackRates.find((candidate) => this.getRateValue(candidate) === value);
    if (isUndefined(rate))
      return;
    this.select(media, rate);
  }
};

// node_modules/@videojs/core/dist/dev/core/ui/playback-rate-menu/playback-rate-menu-data-attrs.js
var PlaybackRateMenuDataAttrs = {
  rate: "data-rate",
  disabled: "data-disabled"
};

// node_modules/@videojs/core/dist/dev/core/ui/popover/popover-core.js
var PopoverCore = class PopoverCore2 {
  static defaultProps = {
    side: "top",
    align: "center",
    modal: false,
    closeOnEscape: true,
    closeOnOutsideClick: true,
    open: false,
    defaultOpen: false,
    openOnHover: false,
    delay: 300,
    closeDelay: 0
  };
  #props = { ...PopoverCore2.defaultProps };
  constructor(props) {
    if (props)
      this.setProps(props);
  }
  setProps(props) {
    this.#props = defaults(props, PopoverCore2.defaultProps);
  }
  #input = null;
  setInput(input) {
    this.#input = input;
  }
  getState() {
    const input = this.#input;
    return {
      open: input.active,
      status: input.status,
      side: this.#props.side,
      align: this.#props.align,
      modal: this.#props.modal,
      ...getTransitionFlags(input.status)
    };
  }
  getTriggerAttrs(state, popupId) {
    return {
      "aria-expanded": state.open ? "true" : "false",
      "aria-haspopup": "dialog",
      "aria-controls": popupId
    };
  }
  getPopupAttrs(state) {
    return {
      popover: "manual",
      role: "dialog",
      "aria-modal": state.modal === true ? "true" : undefined
    };
  }
};
// node_modules/@videojs/core/dist/dev/core/ui/popover/popover-data-attrs.js
var PopoverDataAttrs = {
  open: "data-open",
  side: "data-side",
  align: "data-align",
  ...TransitionDataAttrs
};

// node_modules/@videojs/core/dist/dev/core/ui/popover/popup-host-attr.js
var POPUP_HOST_ATTR = "data-popup";
var POPUP_HOST_SELECTOR = `[${POPUP_HOST_ATTR}]`;

// node_modules/@videojs/core/dist/dev/core/ui/poster/poster-core.js
var PosterCore = class {
  #media = null;
  setMedia(media) {
    this.#media = media;
  }
  getState() {
    return { visible: !this.#media.started };
  }
};

// node_modules/@videojs/core/dist/dev/core/ui/poster/poster-data-attrs.js
var PosterDataAttrs = { visible: "data-visible" };

// node_modules/@videojs/core/dist/dev/core/ui/seek-button/seek-button-core.js
var SeekButtonCore = class SeekButtonCore2 {
  static defaultProps = {
    seconds: 30,
    label: "",
    disabled: false
  };
  state = createState({
    seeking: false,
    direction: "forward",
    label: ""
  });
  #props = { ...SeekButtonCore2.defaultProps };
  #media = null;
  constructor(props) {
    if (props)
      this.setProps(props);
  }
  setProps(props) {
    this.#props = defaults(props, SeekButtonCore2.defaultProps);
  }
  getLabel(state) {
    const { label } = this.#props;
    if (isFunction(label)) {
      const customLabel = label(state);
      if (customLabel)
        return customLabel;
    } else if (label)
      return label;
    const abs = Math.abs(this.#props.seconds);
    return state.direction === "backward" ? `Seek backward ${abs} seconds` : `Seek forward ${abs} seconds`;
  }
  getAttrs(state) {
    return {
      "aria-label": this.getLabel(state),
      "aria-disabled": this.#props.disabled ? "true" : undefined
    };
  }
  setMedia(media) {
    this.#media = media;
  }
  getState() {
    const media = this.#media;
    const direction = this.#props.seconds < 0 ? "backward" : "forward";
    this.state.patch({
      seeking: media.seeking,
      direction
    });
    this.state.patch({ label: this.getLabel(this.state.current) });
    return this.state.current;
  }
  async seek(media) {
    if (this.#props.disabled)
      return;
    await media.seek(media.currentTime + this.#props.seconds);
  }
};

// node_modules/@videojs/core/dist/dev/core/ui/seek-button/seek-button-data-attrs.js
var SeekButtonDataAttrs = {
  seeking: "data-seeking",
  direction: "data-direction"
};

// node_modules/@videojs/core/dist/dev/core/ui/slider/slider-core.js
var SliderCore = class SliderCore2 {
  static defaultProps = {
    label: "",
    step: 1,
    largeStep: 10,
    orientation: "horizontal",
    disabled: false,
    thumbAlignment: "center",
    value: 0,
    min: 0,
    max: 100
  };
  static defaultInput = {
    pointerPercent: 0,
    dragPercent: 0,
    dragging: false,
    pointing: false,
    focused: false
  };
  #props = { ...SliderCore2.defaultProps };
  #input = { ...SliderCore2.defaultInput };
  get props() {
    return this.#props;
  }
  get input() {
    return this.#input;
  }
  constructor(props) {
    if (props)
      this.setProps(props);
  }
  setProps(props) {
    this.#props = defaults(props, SliderCore2.defaultProps);
  }
  setInput(input) {
    this.#input = input;
  }
  getSliderState(value) {
    const { orientation, disabled, thumbAlignment } = this.#props;
    const { pointerPercent, dragging, pointing, focused } = this.#input;
    return {
      value,
      fillPercent: this.percentFromValue(value),
      pointerPercent,
      dragging,
      pointing,
      interactive: dragging || pointing || focused,
      orientation,
      disabled,
      thumbAlignment
    };
  }
  getLabel(state) {
    const { label } = this.#props;
    if (isFunction(label)) {
      const customLabel = label(state);
      if (customLabel)
        return customLabel;
    } else if (label)
      return label;
    return "";
  }
  getAttrs(state) {
    return {
      role: "slider",
      tabIndex: state.disabled ? -1 : 0,
      autoComplete: "off",
      "aria-label": this.getLabel(state),
      "aria-valuemin": this.#props.min,
      "aria-valuemax": this.#props.max,
      "aria-valuenow": state.value,
      "aria-orientation": state.orientation,
      "aria-disabled": state.disabled ? "true" : undefined
    };
  }
  valueFromPercent(percent) {
    const { min, max, step } = this.#props;
    return roundToStep(clamp(min + percent / 100 * (max - min), min, max), step, min);
  }
  rawValueFromPercent(percent) {
    const { min, max } = this.#props;
    return clamp(min + percent / 100 * (max - min), min, max);
  }
  percentFromValue(value) {
    const { min, max } = this.#props;
    if (max === min)
      return 0;
    return (value - min) / (max - min) * 100;
  }
  getStepPercent() {
    const { step, min, max } = this.#props;
    const range = max - min;
    return range > 0 ? step / range * 100 : 0;
  }
  getLargeStepPercent() {
    const { largeStep, min, max } = this.#props;
    const range = max - min;
    return range > 0 ? largeStep / range * 100 : 0;
  }
  adjustPercentForAlignment(rawPercent, thumbSize, trackSize) {
    if (this.#props.thumbAlignment === "center" || trackSize === 0)
      return rawPercent;
    const thumbHalf = thumbSize / trackSize * 100 / 2;
    const minPercent = thumbHalf;
    const maxPercent = 100 - thumbHalf;
    return minPercent + rawPercent / 100 * (maxPercent - minPercent);
  }
};
// node_modules/@videojs/core/dist/dev/core/ui/slider/slider-data-attrs.js
var SliderDataAttrs = {
  dragging: "data-dragging",
  pointing: "data-pointing",
  interactive: "data-interactive",
  orientation: "data-orientation",
  disabled: "data-disabled"
};

// node_modules/@videojs/core/dist/dev/core/ui/thumbnail/thumbnail-data-attrs.js
var ThumbnailDataAttrs = {
  loading: "data-loading",
  error: "data-error",
  hidden: "data-hidden"
};

// node_modules/@videojs/core/dist/dev/core/ui/thumbnail/thumbnail-media-fragment.js
function parseMediaFragment(text, baseURL) {
  const parts = text.trim().split("#");
  const rawURL = parts[0] ?? "";
  const hash = parts[1];
  const url = baseURL ? new URL(rawURL, baseURL).href : rawURL;
  if (!hash)
    return { url };
  const eqIndex = hash.indexOf("=");
  if (eqIndex === -1)
    return { url };
  const keys = hash.slice(0, eqIndex);
  const values = hash.slice(eqIndex + 1).split(",").map(Number);
  const data = {};
  for (let i = 0;i < keys.length; i++) {
    const key = keys[i];
    const value = values[i];
    if (key && isNumber(value) && !Number.isNaN(value))
      data[key] = value;
  }
  const result = { url };
  if (isNumber(data.w))
    result.width = data.w;
  if (isNumber(data.h))
    result.height = data.h;
  if (isNumber(data.x) && isNumber(data.y))
    result.coords = {
      x: data.x,
      y: data.y
    };
  return result;
}
function mapCuesToThumbnails(cues, baseURL) {
  const images = [];
  for (const cue of cues) {
    const fragment = parseMediaFragment(cue.text, baseURL);
    const image = {
      url: fragment.url,
      startTime: cue.startTime,
      endTime: cue.endTime
    };
    if (fragment.width)
      image.width = fragment.width;
    if (fragment.height)
      image.height = fragment.height;
    if (fragment.coords)
      image.coords = fragment.coords;
    images.push(image);
  }
  return images;
}

// node_modules/@videojs/core/dist/dev/core/ui/time/time-core.js
var DEFAULT_LABELS = {
  current: "Current time",
  duration: "Duration",
  remaining: "Remaining"
};
var TimeCore = class TimeCore2 {
  static defaultProps = {
    type: "current",
    negativeSign: "-",
    label: ""
  };
  #props = { ...TimeCore2.defaultProps };
  #media = null;
  constructor(props) {
    if (props)
      this.setProps(props);
  }
  setProps(props) {
    this.#props = defaults(props, TimeCore2.defaultProps);
  }
  setMedia(media) {
    this.#media = media;
  }
  #getSeconds() {
    const media = this.#media;
    const { type } = this.#props;
    switch (type) {
      case "current":
        return media.currentTime;
      case "duration":
        return media.duration;
      case "remaining":
        return media.currentTime - media.duration;
      default:
        return 0;
    }
  }
  #getText() {
    const media = this.#media;
    const seconds = this.#getSeconds();
    return formatTime(Math.abs(seconds), media.duration);
  }
  #getPhrase() {
    const { type } = this.#props;
    const seconds = this.#getSeconds();
    if (type === "remaining")
      return formatTimeAsPhrase(seconds < 0 ? seconds : -Math.abs(seconds));
    return formatTimeAsPhrase(seconds);
  }
  #getDatetime() {
    const seconds = this.#getSeconds();
    return secondsToIsoDuration(Math.abs(seconds));
  }
  getLabel(state) {
    const { label } = this.#props;
    if (isFunction(label)) {
      const customLabel = label(state);
      if (customLabel)
        return customLabel;
    } else if (label)
      return label;
    return DEFAULT_LABELS[this.#props.type];
  }
  getAttrs(state) {
    return {
      "aria-label": this.getLabel(state),
      "aria-valuetext": state.phrase
    };
  }
  getState() {
    const seconds = this.#getSeconds();
    return {
      type: this.#props.type,
      seconds,
      negative: this.#props.type === "remaining" && seconds < 0,
      text: this.#getText(),
      phrase: this.#getPhrase(),
      datetime: this.#getDatetime()
    };
  }
};

// node_modules/@videojs/core/dist/dev/core/ui/time/time-data-attrs.js
var TimeDataAttrs = { type: "data-type" };

// node_modules/@videojs/core/dist/dev/core/ui/time-slider/time-slider-core.js
var TimeSliderCore = class TimeSliderCore2 extends SliderCore {
  static defaultProps = {
    ...SliderCore.defaultProps,
    label: "Seek",
    changeThrottle: 100
  };
  #props = { ...TimeSliderCore2.defaultProps };
  #media = null;
  constructor(props) {
    super();
    if (props)
      this.setProps(props);
  }
  setProps(props) {
    this.#props = defaults(props, TimeSliderCore2.defaultProps);
    super.setProps({
      ...props,
      min: 0
    });
  }
  setMedia(media) {
    this.#media = media;
  }
  getState() {
    const { duration, currentTime, seeking, buffered } = this.#media;
    super.setProps({
      ...this.#props,
      min: 0,
      max: duration
    });
    const base = super.getSliderState(currentTime);
    const bufferedEnd = buffered.length > 0 ? buffered[buffered.length - 1][1] : 0;
    const bufferPercent = duration > 0 ? bufferedEnd / duration * 100 : 0;
    return {
      ...base,
      currentTime,
      duration,
      seeking,
      bufferPercent
    };
  }
  getLabel(state) {
    return super.getLabel(state) || "Seek";
  }
  getAttrs(state) {
    const base = super.getAttrs(state);
    const announceValue = state.dragging ? this.rawValueFromPercent(state.pointerPercent) : state.value;
    const currentPhrase = formatTimeAsPhrase(announceValue);
    const durationPhrase = formatTimeAsPhrase(state.duration);
    const valuetext = durationPhrase ? `${currentPhrase} of ${durationPhrase}` : currentPhrase;
    return {
      ...base,
      "aria-valuenow": announceValue,
      "aria-valuetext": valuetext
    };
  }
};
// node_modules/@videojs/core/dist/dev/core/ui/time-slider/time-slider-data-attrs.js
var TimeSliderDataAttrs = {
  ...SliderDataAttrs,
  seeking: "data-seeking"
};

// node_modules/@videojs/core/dist/dev/core/ui/tooltip/tooltip-core.js
var TooltipCore = class TooltipCore2 {
  static defaultProps = {
    side: "top",
    align: "center",
    open: false,
    defaultOpen: false,
    delay: 600,
    closeDelay: 0,
    disableHoverablePopup: true,
    disabled: false
  };
  #props = { ...TooltipCore2.defaultProps };
  constructor(props) {
    if (props)
      this.setProps(props);
  }
  setProps(props) {
    this.#props = defaults(props, TooltipCore2.defaultProps);
  }
  #input = null;
  setInput(input) {
    this.#input = input;
  }
  getState() {
    const input = this.#input;
    return {
      open: input.active,
      status: input.status,
      side: this.#props.side,
      align: this.#props.align,
      ...getTransitionFlags(input.status)
    };
  }
  getPopupAttrs(_state) {
    return {
      popover: "manual",
      role: "presentation"
    };
  }
};

// node_modules/@videojs/core/dist/dev/core/ui/tooltip/tooltip-css-vars.js
var TooltipCSSVars = {
  sideOffset: "--media-tooltip-side-offset",
  alignOffset: "--media-tooltip-align-offset",
  boundaryOffset: "--media-tooltip-boundary-offset",
  anchorWidth: "--media-tooltip-anchor-width",
  anchorHeight: "--media-tooltip-anchor-height",
  availableWidth: "--media-tooltip-available-width",
  availableHeight: "--media-tooltip-available-height"
};

// node_modules/@videojs/core/dist/dev/core/ui/tooltip/tooltip-data-attrs.js
var TooltipDataAttrs = {
  open: "data-open",
  side: "data-side",
  align: "data-align",
  ...TransitionDataAttrs
};

// node_modules/@videojs/core/dist/dev/core/ui/tooltip/tooltip-group-core.js
var TooltipGroupCore = class TooltipGroupCore2 {
  static defaultProps = {
    delay: 600,
    closeDelay: 0,
    timeout: 400
  };
  #props = { ...TooltipGroupCore2.defaultProps };
  #lastCloseTime = 0;
  #isOpen = false;
  constructor(props) {
    if (props)
      this.setProps(props);
  }
  setProps(props) {
    this.#props = defaults(props, TooltipGroupCore2.defaultProps);
  }
  get delay() {
    return this.#props.delay;
  }
  get closeDelay() {
    return this.#props.closeDelay;
  }
  shouldSkipDelay() {
    if (this.#isOpen)
      return true;
    return Date.now() - this.#lastCloseTime < this.#props.timeout;
  }
  notifyOpen() {
    this.#isOpen = true;
  }
  notifyClose() {
    this.#isOpen = false;
    this.#lastCloseTime = Date.now();
  }
};

// node_modules/@videojs/core/dist/dev/core/ui/volume-slider/volume-slider-core.js
var VolumeSliderCore = class VolumeSliderCore2 extends SliderCore {
  static defaultProps = {
    ...SliderCore.defaultProps,
    label: "Volume",
    wheelStep: 5
  };
  #media = null;
  constructor(props) {
    super();
    if (props)
      this.setProps(props);
  }
  setProps(props) {
    super.setProps(defaults(props, VolumeSliderCore2.defaultProps));
  }
  setMedia(media) {
    this.#media = media;
  }
  getState() {
    const media = this.#media;
    const { volume, muted } = media;
    const effectivelyMuted = muted || volume === 0;
    const { dragging, dragPercent } = this.input;
    const volumePercent = volume * 100;
    const value = dragging ? this.valueFromPercent(dragPercent) : volumePercent;
    const base = super.getSliderState(value);
    return {
      ...base,
      fillPercent: effectivelyMuted ? 0 : base.fillPercent,
      volume,
      muted: effectivelyMuted,
      availability: media.volumeAvailability
    };
  }
  getWheelStepPercent() {
    const props = this.props;
    const range = props.max - props.min;
    return range > 0 ? props.wheelStep / range * 100 : 0;
  }
  getLabel(state) {
    return super.getLabel(state) || "Volume";
  }
  getAttrs(state) {
    const base = super.getAttrs(state);
    const valuetext = `${Math.round(state.value)} percent${state.muted ? ", muted" : ""}`;
    return {
      ...base,
      "aria-valuetext": valuetext
    };
  }
};
// node_modules/@videojs/core/dist/dev/core/ui/volume-slider/volume-slider-data-attrs.js
var VolumeSliderDataAttrs = {
  ...SliderDataAttrs,
  availability: "data-availability"
};

// node_modules/@videojs/html/dist/dev/ui/buffering-indicator/buffering-indicator-element.js
var BufferingIndicatorElement = class extends MediaElement {
  constructor(..._args) {
    super(..._args);
    this.delay = BufferingIndicatorCore.defaultProps.delay;
    this.#core = new BufferingIndicatorCore;
    this.#state = new PlayerController(this, playerContext, selectPlayback);
    this.#disconnect = null;
  }
  static {
    this.tagName = "media-buffering-indicator";
  }
  static {
    this.properties = { delay: { type: Number } };
  }
  #core;
  #state;
  #disconnect;
  connectedCallback() {
    super.connectedCallback();
    if (this.destroyed)
      return;
    this.#disconnect = new AbortController;
    this.#core.state.subscribe(() => this.requestUpdate(), { signal: this.#disconnect.signal });
    if (!this.#state.value)
      logMissingFeature(this.localName, this.#state.displayName);
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this.#disconnect?.abort();
    this.#disconnect = null;
  }
  willUpdate(changed) {
    super.willUpdate(changed);
    this.#core.setProps(this);
  }
  update(changed) {
    super.update(changed);
    const media = this.#state.value;
    if (!media)
      return;
    this.#core.update(media);
    applyStateDataAttrs(this, this.#core.state.current, BufferingIndicatorDataAttrs);
  }
};

// node_modules/@videojs/html/dist/dev/ui/hotkey/aria-key-shortcuts-controller.js
var AriaKeyShortcutsController = class {
  #action;
  #container;
  constructor(host, action) {
    this.#action = action;
    this.#container = new ContextConsumer(host, {
      context: containerContext,
      subscribe: true
    });
    host.addController(this);
  }
  get value() {
    const container = this.#container.value?.container;
    if (!container)
      return;
    return findHotkeyCoordinator(container)?.getAriaKeys(this.#action);
  }
  hostConnected() {}
  hostDisconnected() {}
};

// node_modules/@videojs/html/dist/dev/ui/media-button-element.js
var MediaButtonElement = class extends MediaElement {
  constructor(..._args) {
    super(..._args);
    this.disabled = false;
    this.label = "";
    this.hotkeyAction = undefined;
    this.#disconnect = null;
    this.#hotkeyRegistry = null;
  }
  static {
    this.properties = {
      label: { type: String },
      disabled: { type: Boolean }
    };
  }
  get $state() {
    return this.core.state;
  }
  #disconnect;
  #hotkeyRegistry;
  connectedCallback() {
    super.connectedCallback();
    if (this.destroyed)
      return;
    if (this.hotkeyAction && !this.#hotkeyRegistry)
      this.#hotkeyRegistry = new AriaKeyShortcutsController(this, this.hotkeyAction);
    this.#disconnect = new AbortController;
    const buttonProps = createButton({
      onActivate: () => this.activate(this.mediaState.value),
      isDisabled: () => this.disabled || !this.mediaState.value
    });
    applyElementProps(this, buttonProps, { signal: this.#disconnect.signal });
    if (!this.mediaState.value && this.mediaState.displayName)
      logMissingFeature(this.localName, this.mediaState.displayName);
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this.#disconnect?.abort();
    this.#disconnect = null;
  }
  getLabel() {
    return this.core.state.current.label || undefined;
  }
  willUpdate(changed) {
    super.willUpdate(changed);
    this.core.setProps?.(this);
  }
  update(changed) {
    super.update(changed);
    const media = this.mediaState.value;
    if (!media)
      return;
    this.core.setMedia(media);
    const state = this.core.getState();
    applyElementProps(this, {
      ...this.core.getAttrs?.(state),
      "aria-keyshortcuts": this.#hotkeyRegistry?.value
    });
    applyStateDataAttrs(this, state, this.stateAttrMap);
  }
};

// node_modules/@videojs/html/dist/dev/ui/captions-button/captions-button-element.js
var CaptionsButtonElement = class extends MediaButtonElement {
  constructor(..._args) {
    super(..._args);
    this.core = new CaptionsButtonCore;
    this.stateAttrMap = CaptionsButtonDataAttrs;
    this.mediaState = new PlayerController(this, playerContext, selectTextTrack);
    this.hotkeyAction = "toggleSubtitles";
  }
  static {
    this.tagName = "media-captions-button";
  }
  activate(state) {
    this.core.toggle(state);
  }
};

// node_modules/@videojs/html/dist/dev/ui/cast-button/cast-button-element.js
var CastButtonElement = class extends MediaButtonElement {
  constructor(..._args) {
    super(..._args);
    this.core = new CastButtonCore;
    this.stateAttrMap = CastButtonDataAttrs;
    this.mediaState = new PlayerController(this, playerContext, selectRemotePlayback);
  }
  static {
    this.tagName = "media-cast-button";
  }
  activate(state) {
    this.core.toggle(state);
  }
};

// node_modules/@videojs/html/dist/dev/ui/fullscreen-button/fullscreen-button-element.js
var FullscreenButtonElement = class extends MediaButtonElement {
  constructor(..._args) {
    super(..._args);
    this.core = new FullscreenButtonCore;
    this.stateAttrMap = FullscreenButtonDataAttrs;
    this.mediaState = new PlayerController(this, playerContext, selectFullscreen);
    this.hotkeyAction = "toggleFullscreen";
  }
  static {
    this.tagName = "media-fullscreen-button";
  }
  activate(state) {
    this.core.toggle(state);
  }
};

// node_modules/@videojs/html/dist/dev/ui/gesture/gesture-element.js
var GestureElement = class extends MediaElement {
  constructor(..._args) {
    super(..._args);
    this.type = "";
    this.action = "";
    this.value = undefined;
    this.pointer = undefined;
    this.region = undefined;
    this.disabled = false;
    this.#player = new PlayerController(this, playerContext);
    this.#container = new ContextConsumer(this, {
      context: containerContext,
      callback: () => this.requestUpdate(),
      subscribe: true
    });
    this.#cleanup = null;
  }
  static {
    this.tagName = "media-gesture";
  }
  static {
    this.properties = {
      type: { type: String },
      action: { type: String },
      value: { type: Number },
      pointer: { type: String },
      region: { type: String },
      disabled: { type: Boolean }
    };
  }
  #player;
  #container;
  #cleanup;
  connectedCallback() {
    super.connectedCallback();
    this.style.display = "none";
    this.#register();
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this.#unregister();
  }
  update(changed) {
    super.update(changed);
    if (this.isConnected) {
      this.#unregister();
      this.#register();
    }
  }
  #register() {
    const store = this.#player.value;
    const container = this.#container.value?.container;
    if (!this.type || !this.action || !store || !container)
      return;
    const resolver = resolveGestureAction(this.action);
    if (!resolver)
      return;
    const { value } = this;
    const onActivate = (event) => {
      resolver({
        store,
        value,
        event
      });
    };
    const options = {
      pointer: this.pointer,
      region: this.region,
      disabled: this.disabled,
      action: this.action,
      value: this.value
    };
    if (this.type === "doubletap")
      this.#cleanup = createDoubleTapGesture(container, onActivate, options);
    else
      this.#cleanup = createTapGesture(container, onActivate, options);
  }
  #unregister() {
    this.#cleanup?.();
    this.#cleanup = null;
  }
};

// node_modules/@videojs/html/dist/dev/ui/hotkey/hotkey-element.js
var HotkeyElement = class extends MediaElement {
  constructor(..._args) {
    super(..._args);
    this.keys = "";
    this.action = "";
    this.value = undefined;
    this.disabled = false;
    this.target = "player";
    this.#player = new PlayerController(this, playerContext);
    this.#container = new ContextConsumer(this, {
      context: containerContext,
      callback: () => this.requestUpdate(),
      subscribe: true
    });
    this.#cleanup = null;
  }
  static {
    this.tagName = "media-hotkey";
  }
  static {
    this.properties = {
      keys: { type: String },
      action: { type: String },
      value: { type: Number },
      disabled: { type: Boolean },
      target: { type: String }
    };
  }
  #player;
  #container;
  #cleanup;
  connectedCallback() {
    super.connectedCallback();
    this.style.display = "none";
    this.#register();
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this.#unregister();
  }
  update(changed) {
    super.update(changed);
    if (this.isConnected) {
      this.#unregister();
      this.#register();
    }
  }
  #register() {
    const store = this.#player.value;
    const container = this.#container.value?.container;
    if (!this.keys || !this.action || !store || !container)
      return;
    const resolver = resolveHotkeyAction(this.action);
    if (!resolver)
      return;
    const { value, action } = this;
    this.#cleanup = createHotkey(container, {
      keys: this.keys,
      action,
      value,
      target: this.target,
      disabled: this.disabled,
      repeatable: !isHotkeyToggleAction(action),
      onActivate: (_event, key) => {
        resolver({
          store,
          key,
          value
        });
      }
    });
  }
  #unregister() {
    this.#cleanup?.();
    this.#cleanup = null;
  }
};

// node_modules/@videojs/html/dist/dev/ui/live-button/live-button-element.js
var LiveButtonElement = class extends MediaElement {
  constructor(..._args) {
    super(..._args);
    this.disabled = false;
    this.label = "";
    this.core = new LiveButtonCore;
    this.live = new PlayerController(this, playerContext, selectLive);
    this.time = new PlayerController(this, playerContext, selectTime);
    this.buffer = new PlayerController(this, playerContext, selectBuffer);
    this.#disconnect = null;
  }
  static {
    this.tagName = "media-live-button";
  }
  static {
    this.properties = {
      label: { type: String },
      disabled: { type: Boolean }
    };
  }
  get $state() {
    return this.core.state;
  }
  #disconnect;
  connectedCallback() {
    super.connectedCallback();
    if (this.destroyed)
      return;
    if (!this.textContent?.trim())
      this.textContent = LiveButtonCore.defaultText;
    this.#disconnect = new AbortController;
    const buttonProps = createButton({
      onActivate: () => {
        const media = this.#getMedia();
        if (media)
          this.core.seekToLive(media);
      },
      isDisabled: () => this.disabled || !this.#getMedia()
    });
    applyElementProps(this, buttonProps, { signal: this.#disconnect.signal });
    if (!this.#getMedia())
      logMissingFeature(this.localName, this.live.displayName ?? "live");
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this.#disconnect?.abort();
    this.#disconnect = null;
  }
  getLabel() {
    return this.core.state.current.label || undefined;
  }
  willUpdate(changed) {
    super.willUpdate(changed);
    this.core.setProps(this);
  }
  update(changed) {
    super.update(changed);
    const media = this.#getMedia();
    if (!media)
      return;
    this.core.setMedia(media);
    const state = this.core.getState();
    applyElementProps(this, this.core.getAttrs(state));
    applyStateDataAttrs(this, state, LiveButtonDataAttrs);
  }
  #getMedia() {
    const live = this.live.value;
    const time = this.time.value;
    const buffer = this.buffer.value;
    if (!live || !time || !buffer)
      return null;
    return {
      currentTime: time.currentTime,
      seek: time.seek,
      seekable: buffer.seekable,
      liveEdgeStart: live.liveEdgeStart,
      targetLiveWindow: live.targetLiveWindow
    };
  }
};

// node_modules/@videojs/html/dist/dev/ui/mute-button/mute-button-element.js
var MuteButtonElement = class extends MediaButtonElement {
  constructor(..._args) {
    super(..._args);
    this.core = new MuteButtonCore;
    this.stateAttrMap = MuteButtonDataAttrs;
    this.mediaState = new PlayerController(this, playerContext, selectVolume);
    this.hotkeyAction = "toggleMuted";
  }
  static {
    this.tagName = "media-mute-button";
  }
  activate(state) {
    this.core.toggle(state);
  }
};

// node_modules/@videojs/html/dist/dev/ui/pip-button/pip-button-element.js
var PiPButtonElement = class extends MediaButtonElement {
  constructor(..._args) {
    super(..._args);
    this.core = new PiPButtonCore;
    this.stateAttrMap = PiPButtonDataAttrs;
    this.mediaState = new PlayerController(this, playerContext, selectPiP);
    this.hotkeyAction = "togglePictureInPicture";
  }
  static {
    this.tagName = "media-pip-button";
  }
  activate(state) {
    this.core.toggle(state);
  }
};

// node_modules/@videojs/html/dist/dev/ui/play-button/play-button-element.js
var PlayButtonElement = class extends MediaButtonElement {
  constructor(..._args) {
    super(..._args);
    this.core = new PlayButtonCore;
    this.stateAttrMap = PlayButtonDataAttrs;
    this.mediaState = new PlayerController(this, playerContext, selectPlayback);
    this.hotkeyAction = "togglePaused";
  }
  static {
    this.tagName = "media-play-button";
  }
  activate(state) {
    this.core.toggle(state);
  }
};

// node_modules/@videojs/html/dist/dev/ui/playback-rate-button/playback-rate-button-element.js
var PlaybackRateButtonElement = class extends MediaButtonElement {
  constructor(..._args) {
    super(..._args);
    this.core = new PlaybackRateButtonCore;
    this.stateAttrMap = PlaybackRateButtonDataAttrs;
    this.mediaState = new PlayerController(this, playerContext, selectPlaybackRate);
  }
  static {
    this.tagName = "media-playback-rate-button";
  }
  activate(state) {
    this.core.cycle(state);
  }
};

// node_modules/@videojs/html/dist/dev/ui/menu/context.js
var MENU_CONTEXT_KEY = Symbol("@videojs/menu");
var MENU_RADIO_GROUP_CONTEXT_KEY = Symbol("@videojs/menu-radio-group");
var menuContext = createContext(MENU_CONTEXT_KEY);
var menuRadioGroupContext = createContext(MENU_RADIO_GROUP_CONTEXT_KEY);

// node_modules/@videojs/html/dist/dev/ui/position-controller.js
var PositionController = class {
  #host;
  #abort = null;
  #frame = 0;
  #resizeObserver = null;
  #trigger = null;
  #boundary = null;
  constructor(host) {
    this.#host = host;
    host.addController(this);
  }
  findTrigger() {
    if (!this.#host.id)
      return null;
    return this.#host.getRootNode().querySelector(`[commandfor="${this.#host.id}"]`);
  }
  sync(trigger, boundary = null) {
    if (!trigger)
      return;
    if (this.#abort && this.#trigger === trigger && this.#boundary === boundary)
      return;
    this.cleanup();
    this.#abort = new AbortController;
    this.#trigger = trigger;
    this.#boundary = boundary;
    const { signal } = this.#abort;
    const reposition = (event) => {
      if (event && isEventWithinElement(event, this.#host))
        return;
      cancelAnimationFrame(this.#frame);
      this.#frame = requestAnimationFrame(() => {
        if (signal.aborted)
          return;
        this.#host.requestUpdate();
      });
    };
    window.addEventListener("scroll", reposition, {
      capture: true,
      passive: true,
      signal
    });
    window.addEventListener("resize", reposition, { signal });
    if (typeof ResizeObserver === "function") {
      this.#resizeObserver = new ResizeObserver(() => {
        reposition();
      });
      this.#resizeObserver.observe(trigger);
      this.#resizeObserver.observe(this.#host);
      if (boundary)
        this.#resizeObserver.observe(boundary);
    }
    reposition();
  }
  cleanup() {
    this.#abort?.abort();
    this.#abort = null;
    this.#trigger = null;
    this.#boundary = null;
    cancelAnimationFrame(this.#frame);
    this.#frame = 0;
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
  }
  hostDisconnected() {
    this.cleanup();
  }
  hostDestroyed() {
    this.cleanup();
  }
};

// node_modules/@videojs/html/dist/dev/ui/menu/menu-element.js
var MenuElement = class extends MediaElement {
  constructor(..._args) {
    super(..._args);
    this.open = MenuCore.defaultProps.open;
    this.defaultOpen = MenuCore.defaultProps.defaultOpen;
    this.side = MenuCore.defaultProps.side;
    this.align = MenuCore.defaultProps.align;
    this.closeOnEscape = MenuCore.defaultProps.closeOnEscape;
    this.closeOnOutsideClick = MenuCore.defaultProps.closeOnOutsideClick;
    this.boundary = "container";
    this.#core = new MenuCore;
    this.#provider = new ContextProvider(this, { context: menuContext });
    this.#position = new PositionController(this);
    this.#containerCtx = new ContextConsumer(this, {
      context: containerContext,
      subscribe: true
    });
    this.#parentCtx = new ContextConsumer(this, {
      context: menuContext,
      subscribe: true
    });
    this.#menuViewTransition = createMenuViewTransition({
      focusFirstItem: () => {
        this.#menu?.highlightFirstItem({ preventScroll: true });
      },
      restoreFocus: (triggerId) => {
        const triggerElement = triggerId ? document.getElementById(triggerId) : null;
        const fallbackTrigger = this.parentElement?.querySelector(`[data-has-submenu][commandfor="${this.id}"]`);
        (triggerElement ?? fallbackTrigger)?.focus({ preventScroll: true });
      }
    });
    this.#menu = null;
    this.#snapshot = null;
    this.#navSnapshot = null;
    this.#menuViewSnapshot = null;
    this.#navState = {
      stack: [],
      direction: "forward"
    };
    this.#disconnect = null;
    this.#triggerAbort = null;
    this.#currentTrigger = null;
    this.#handleContentKeyDown = (event) => {
      const isNavigationKey = isMenuNavigationKey(event);
      const defaultPreventedBeforeMenu = event.defaultPrevented;
      this.#menu?.contentProps.onKeyDown(event);
      const parentCtx = this.#parentCtx.value ?? null;
      if (!parentCtx) {
        if (event.key === "Escape")
          return;
        if (isNavigationKey)
          event.stopPropagation();
        return;
      }
      const stack = parentCtx.menu.navigationInput.current.stack;
      const ownsActiveSubmenu = stack[stack.length - 1]?.menuId === this.id;
      const isBackNavigationKey = event.key === "ArrowLeft" || event.key === "Escape";
      if (isBackNavigationKey && ownsActiveSubmenu && !defaultPreventedBeforeMenu) {
        event.preventDefault();
        parentCtx.menu.pop();
      }
      if (isNavigationKey && (!isBackNavigationKey || ownsActiveSubmenu))
        event.stopPropagation();
    };
    this.#handleContentFocusOut = (event) => {
      this.#menu?.contentProps.onFocusOut(event);
    };
  }
  static {
    this.tagName = "media-menu";
  }
  static {
    this.properties = {
      open: { type: Boolean },
      defaultOpen: {
        type: Boolean,
        attribute: "default-open"
      },
      side: { type: String },
      align: { type: String },
      closeOnEscape: {
        type: Boolean,
        attribute: "close-on-escape"
      },
      closeOnOutsideClick: {
        type: Boolean,
        attribute: "close-on-outside-click"
      },
      boundary: { type: String }
    };
  }
  #core;
  #provider;
  #position;
  #containerCtx;
  #parentCtx;
  #menuViewTransition;
  #menu;
  #snapshot;
  #navSnapshot;
  #menuViewSnapshot;
  #navState;
  #disconnect;
  #triggerAbort;
  #currentTrigger;
  connectedCallback() {
    super.connectedCallback();
    if (this.destroyed)
      return;
    this.setAttribute(POPUP_HOST_ATTR, "");
    this.#disconnect = new AbortController;
    this.#menu = createMenu({
      transition: createTransition(),
      onOpenChange: (nextOpen, details) => {
        this.open = nextOpen;
        this.dispatchEvent(new CustomEvent("open-change", { detail: {
          open: nextOpen,
          ...details
        } }));
      },
      closeOnEscape: () => this.closeOnEscape,
      closeOnOutsideClick: () => this.closeOnOutsideClick,
      group: () => this.#parentCtx.value ? undefined : this.#containerCtx.value?.popupGroup
    });
    this.#menu.setContentElement(this);
    applyElementProps(this, {
      onKeyDown: this.#handleContentKeyDown,
      onFocusOut: this.#handleContentFocusOut
    }, { signal: this.#disconnect.signal });
    if (this.#snapshot)
      this.#snapshot.track(this.#menu.input);
    else
      this.#snapshot = new SnapshotController(this, this.#menu.input);
    if (this.#navSnapshot)
      this.#navSnapshot.track(this.#menu.navigationInput);
    else
      this.#navSnapshot = new SnapshotController(this, this.#menu.navigationInput);
    if (this.#menuViewSnapshot)
      this.#menuViewSnapshot.track(this.#menuViewTransition.input);
    else
      this.#menuViewSnapshot = new SnapshotController(this, this.#menuViewTransition.input);
  }
  firstUpdated(changed) {
    super.firstUpdated(changed);
    if (this.defaultOpen && !this.open)
      this.#menu?.open();
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this.#cleanupTrigger();
    this.#menu?.destroy();
    this.#menu = null;
    this.#disconnect?.abort();
    this.#disconnect = null;
    this.#menuViewTransition.destroy();
  }
  close(reason = "imperative-action") {
    this.#menu?.close(reason);
  }
  willUpdate(changed) {
    super.willUpdate(changed);
    const isSubmenu = (this.#parentCtx.value ?? null) !== null;
    this.#core.setProps({
      open: this.open,
      defaultOpen: this.defaultOpen,
      side: this.side,
      align: this.align,
      closeOnEscape: this.closeOnEscape,
      closeOnOutsideClick: this.closeOnOutsideClick,
      isSubmenu
    });
    if (this.#menu && changed.has("open") && !isSubmenu) {
      const { active: interactionOpen } = this.#menu.input.current;
      if (this.open !== interactionOpen)
        if (this.open)
          this.#menu.open();
        else
          this.#menu.close();
    }
  }
  update(_changed) {
    super.update(_changed);
    if (!this.#menu)
      return;
    const parentCtx = this.#parentCtx.value ?? null;
    const isSubmenu = parentCtx !== null;
    this.#navState = this.#menu.navigationInput.current;
    const input = this.#menu.input.current;
    this.#core.setInput(input);
    const state = this.#core.getState();
    if (isSubmenu && parentCtx)
      this.#updateAsSubmenu(parentCtx);
    else
      this.#updateAsRoot(state);
    const parentMenu = parentCtx?.menu ?? null;
    this.#provider.setValue({
      menu: this.#menu,
      state,
      stateAttrMap: MenuDataAttrs,
      navigation: this.#navState,
      parentMenu
    });
  }
  #updateAsRoot(state) {
    if (!this.#menu)
      return;
    const triggerElement = this.#position.findTrigger();
    this.#syncTrigger(triggerElement);
    applyElementProps(this, {
      ...this.#core.getContentAttrs(state),
      ...getMenuViewportAttrs()
    });
    applyStateDataAttrs(this, state, MenuDataAttrs);
    if (state.open)
      tryShowPopover(this);
    else
      tryHidePopover(this);
    if (this.#currentTrigger) {
      applyElementProps(this.#currentTrigger, this.#core.getTriggerAttrs(state, this.id));
      applyStyles(this.#currentTrigger, getAnchorNameStyle(this.id));
    }
    if (!state.open) {
      this.#position.cleanup();
      return;
    }
    syncMenuViewRoot(this, this.#navState.stack.length > 0);
    const positionOptions = getRootPositionOptions(state.side, state.align);
    if (!positionOptions)
      return;
    const boundaryElement = this.#getBoundaryElement();
    const triggerRect = this.#currentTrigger?.getBoundingClientRect();
    const boundaryRect = getPositioningBoundaryRect(boundaryElement);
    const offsets = resolveOffsets(this);
    if (supportsAnchorPositioning())
      applyStyles(this, getAnchorPositionStyle(this.id, positionOptions, triggerRect, undefined, boundaryRect, offsets));
    else {
      const selfRect = getPopupPositionRect(this);
      applyStyles(this, getAnchorPositionStyle(this.id, positionOptions, triggerRect, selfRect, boundaryRect, offsets));
    }
    this.#position.sync(this.#currentTrigger, boundaryElement);
  }
  #updateAsSubmenu(parentCtx) {
    const parentNavigation = parentCtx.navigation;
    const topEntry = parentNavigation.stack[parentNavigation.stack.length - 1];
    const isActive = (topEntry?.menuId ?? null) === this.id;
    this.#menuViewTransition.setElement(this);
    this.#menuViewTransition.sync({
      active: isActive,
      direction: parentNavigation.direction,
      triggerId: topEntry?.triggerId ?? null
    });
    const transitionState = this.#menuViewTransition.input.current;
    applyElementProps(this, {
      ...getMenuViewTransitionAttrs(transitionState),
      role: "menu",
      tabIndex: -1,
      "data-submenu": ""
    });
    syncMenuViewTransition(parentCtx.menu.contentElement, this, transitionState);
  }
  #handleContentKeyDown;
  #handleContentFocusOut;
  #syncTrigger(triggerElement) {
    if (triggerElement === this.#currentTrigger)
      return;
    this.#position.cleanup();
    this.#cleanupTrigger();
    this.#currentTrigger = triggerElement;
    this.#menu?.setTriggerElement(triggerElement);
    if (triggerElement && this.#menu) {
      this.#triggerAbort = new AbortController;
      applyElementProps(triggerElement, this.#menu.triggerProps, { signal: this.#triggerAbort.signal });
    }
  }
  #cleanupTrigger() {
    if (this.#currentTrigger) {
      applyElementProps(this.#currentTrigger, {
        "aria-expanded": undefined,
        "aria-haspopup": undefined,
        "aria-controls": undefined
      });
      this.#currentTrigger.style.removeProperty("anchor-name");
    }
    this.#triggerAbort?.abort();
    this.#triggerAbort = null;
    this.#currentTrigger = null;
  }
  #getBoundaryElement() {
    return resolvePositioningBoundary(this.boundary, {
      container: this.#containerCtx.value?.container ?? null,
      root: this.getRootNode()
    });
  }
};

// node_modules/@videojs/html/dist/dev/ui/playback-rate-menu/playback-rate-menu-element.js
var PlaybackRateMenuElement = class extends MenuElement {
  constructor(..._args) {
    super(..._args);
    this.label = "";
    this.disabled = false;
    this.align = "center";
    this.formatRate = PlaybackRateMenuCore.defaultProps.formatRate;
    this.#core = new PlaybackRateMenuCore;
    this.#mediaState = new PlayerController(this, playerContext, selectPlaybackRate);
  }
  static {
    this.tagName = "media-playback-rate-menu";
  }
  static {
    this.properties = {
      ...MenuElement.properties,
      label: { type: String },
      disabled: { type: Boolean }
    };
  }
  #core;
  #mediaState;
  connectedCallback() {
    super.connectedCallback();
    if (this.destroyed)
      return;
    if (!this.#mediaState.value && this.#mediaState.displayName)
      logMissingFeature(this.localName, this.#mediaState.displayName);
  }
  update(changed) {
    super.update(changed);
    const media = this.#mediaState.value;
    if (!media)
      return;
    this.#core.setProps(this);
    this.#core.setMedia(media);
    const state = this.#core.getState();
    applyElementProps(this, this.#core.getAttrs(state));
    applyStateDataAttrs(this, state, PlaybackRateMenuDataAttrs);
  }
};

// node_modules/@videojs/html/dist/dev/ui/playback-rate-menu/playback-rate-menu-trigger-element.js
var PlaybackRateMenuTriggerElement = class extends MediaElement {
  constructor(..._args) {
    super(..._args);
    this.label = "";
    this.disabled = false;
    this.commandfor = undefined;
    this.formatRate = PlaybackRateMenuCore.defaultProps.formatRate;
    this.#core = new PlaybackRateMenuCore;
    this.#mediaState = new PlayerController(this, playerContext, selectPlaybackRate);
    this.#disconnect = null;
    this.#handleClick = (event) => {
      if (this.#mediaState.value && !this.#core.state.current.disabled)
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    this.#handleKeyDown = (event) => {
      if (event.target !== event.currentTarget)
        return;
      if (!this.#mediaState.value || this.#core.state.current.disabled) {
        if (event.key !== "Tab")
          event.preventDefault();
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        this.click();
      }
    };
  }
  static {
    this.tagName = "media-playback-rate-menu-trigger";
  }
  static {
    this.properties = {
      label: { type: String },
      disabled: { type: Boolean },
      commandfor: { type: String }
    };
  }
  #core;
  #mediaState;
  #disconnect;
  connectedCallback() {
    super.connectedCallback();
    if (this.destroyed)
      return;
    this.#disconnect = new AbortController;
    applyElementProps(this, {
      onClick: this.#handleClick,
      onKeyDown: this.#handleKeyDown
    }, { signal: this.#disconnect.signal });
    if (!this.#mediaState.value && this.#mediaState.displayName)
      logMissingFeature(this.localName, this.#mediaState.displayName);
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this.#disconnect?.abort();
    this.#disconnect = null;
  }
  getLabel() {
    return this.#core.state.current.label || undefined;
  }
  update(changed) {
    super.update(changed);
    const media = this.#mediaState.value;
    if (!media)
      return;
    this.#core.setProps(this);
    this.#core.setMedia(media);
    const state = this.#core.getState();
    applyElementProps(this, {
      role: "button",
      tabIndex: 0,
      ...this.#core.getAttrs(state)
    });
    applyStateDataAttrs(this, state, PlaybackRateMenuDataAttrs);
  }
  #handleClick;
  #handleKeyDown;
};

// node_modules/@videojs/html/dist/dev/ui/menu/menu-item-indicator-element.js
var MenuItemIndicatorElement = class extends MediaElement {
  constructor(..._args) {
    super(..._args);
    this.checked = false;
    this.forceMount = false;
  }
  static {
    this.tagName = "media-menu-item-indicator";
  }
  static {
    this.properties = {
      checked: { type: Boolean },
      forceMount: {
        type: Boolean,
        attribute: "force-mount"
      }
    };
  }
  update(_changed) {
    super.update(_changed);
    const hidden = !this.checked && !this.forceMount;
    applyElementProps(this, {
      "aria-hidden": "true",
      hidden
    });
  }
};

// node_modules/@videojs/html/dist/dev/ui/menu/menu-radio-group-element.js
var MenuRadioGroupElement = class extends MediaElement {
  constructor(..._args) {
    super(..._args);
    this.value = "";
    this.label = undefined;
    this.#menuCtx = new ContextConsumer(this, {
      context: menuContext,
      subscribe: true
    });
    this.#provider = new ContextProvider(this, { context: menuRadioGroupContext });
  }
  static {
    this.tagName = "media-menu-radio-group";
  }
  static {
    this.properties = {
      value: { type: String },
      label: { type: String }
    };
  }
  #menuCtx;
  #provider;
  update(_changed) {
    super.update(_changed);
    applyElementProps(this, {
      role: "group",
      "aria-label": this.label
    });
    const ctx = this.#menuCtx.value;
    if (ctx)
      applyStateDataAttrs(this, ctx.state, ctx.stateAttrMap);
    this.#provider.setValue({
      value: this.value,
      onValueChange: (next) => {
        this.value = next;
        this.dispatchEvent(new CustomEvent("value-change", {
          detail: { value: next },
          bubbles: true
        }));
      }
    });
  }
};

// node_modules/@videojs/html/dist/dev/ui/menu/menu-radio-item-element.js
var MenuRadioItemElement = class extends MediaElement {
  constructor(..._args) {
    super(..._args);
    this.value = "";
    this.disabled = false;
    this.#menuCtx = new ContextConsumer(this, {
      context: menuContext,
      subscribe: true
    });
    this.#groupCtx = new ContextConsumer(this, {
      context: menuRadioGroupContext,
      subscribe: true
    });
    this.#disconnect = null;
    this.#registered = false;
    this.#cleanupRegistration = null;
  }
  static {
    this.tagName = "media-menu-radio-item";
  }
  static {
    this.properties = {
      value: { type: String },
      disabled: { type: Boolean }
    };
  }
  #menuCtx;
  #groupCtx;
  #disconnect;
  #registered;
  #cleanupRegistration;
  connectedCallback() {
    super.connectedCallback();
    this.#disconnect = new AbortController;
    this.#registered = false;
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this.#cleanupRegistration?.();
    this.#cleanupRegistration = null;
    this.#disconnect?.abort();
    this.#disconnect = null;
    this.#registered = false;
  }
  update(_changed) {
    super.update(_changed);
    const menuCtx = this.#menuCtx.value;
    const groupCtx = this.#groupCtx.value;
    if (!menuCtx || !groupCtx || !this.#disconnect)
      return;
    if (!this.#registered) {
      this.#registered = true;
      this.#cleanupRegistration = menuCtx.menu.registerItem(this);
      applyElementProps(this, {
        onClick: () => {
          const currentMenuCtx = this.#menuCtx.value;
          const currentGroupCtx = this.#groupCtx.value;
          if (!currentMenuCtx || !currentGroupCtx || this.disabled)
            return;
          currentGroupCtx.onValueChange(this.value);
          completeMenuItemSelection(currentMenuCtx.menu, currentMenuCtx.parentMenu);
        },
        onPointerenter: () => {
          const currentMenuCtx = this.#menuCtx.value;
          if (!this.disabled)
            currentMenuCtx?.menu.highlight(this, { focus: false });
        }
      }, { signal: this.#disconnect.signal });
    }
    const checked = groupCtx.value === this.value;
    applyElementProps(this, {
      role: "menuitemradio",
      "aria-checked": String(checked),
      "aria-disabled": this.disabled ? "true" : undefined
    });
    applyStateDataAttrs(this, menuCtx.state, menuCtx.stateAttrMap);
  }
};

// node_modules/@videojs/html/dist/dev/ui/playback-rate-menu/playback-rate-options-element.js
var PlaybackRateOptionsElement = class extends MenuRadioGroupElement {
  constructor(..._args) {
    super(..._args);
    this.disabled = false;
    this.formatRate = PlaybackRateMenuCore.defaultProps.formatRate;
    this.#core = new PlaybackRateMenuCore;
    this.#mediaState = new PlayerController(this, playerContext, selectPlaybackRate);
    this.#ratesKey = "";
    this.#disconnect = null;
    this.#handleValueChange = (event) => {
      if (event.target !== this)
        return;
      const media = this.#mediaState.value;
      if (!media)
        return;
      const { value } = event.detail;
      this.#core.selectValue(media, value);
    };
  }
  static {
    this.tagName = "media-playback-rate-options";
  }
  static {
    this.properties = {
      ...MenuRadioGroupElement.properties,
      disabled: { type: Boolean }
    };
  }
  #core;
  #mediaState;
  #ratesKey;
  #disconnect;
  connectedCallback() {
    super.connectedCallback();
    if (this.destroyed)
      return;
    this.#disconnect = new AbortController;
    this.addEventListener("value-change", this.#handleValueChange, { signal: this.#disconnect.signal });
    if (!this.#mediaState.value && this.#mediaState.displayName)
      logMissingFeature(this.localName, this.#mediaState.displayName);
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this.#disconnect?.abort();
    this.#disconnect = null;
  }
  update(changed) {
    const media = this.#mediaState.value;
    let state = null;
    if (media) {
      this.#core.setProps({
        formatRate: this.formatRate,
        disabled: this.disabled
      });
      this.#core.setMedia(media);
      state = this.#core.getState();
      this.value = this.#core.getRateValue(state.rate);
      this.label = this.label || "Playback rate";
      this.#syncContent(state);
    }
    super.update(changed);
    if (state)
      applyStateDataAttrs(this, state, PlaybackRateMenuDataAttrs);
  }
  #syncContent(state) {
    const template = this.#getTemplate();
    const templateKey = template?.innerHTML ?? "";
    const ratesKey = `${state.rates.join("|")}::${templateKey}`;
    if (ratesKey !== this.#ratesKey) {
      this.#ratesKey = ratesKey;
      for (const child of [...this.children]) {
        if (child instanceof HTMLTemplateElement)
          continue;
        child.remove();
      }
      this.append(...state.rates.map((rate) => this.#createItem(rate, template)));
    }
    for (const item of this.querySelectorAll(MenuRadioItemElement.tagName)) {
      const checked = item.value === this.value;
      item.disabled = state.disabled;
      for (const indicator of item.querySelectorAll(MenuItemIndicatorElement.tagName))
        indicator.checked = checked;
    }
  }
  #createItem(rate, template) {
    const item = this.#createItemFromTemplate(template);
    const value = this.#core.getRateValue(rate);
    item.value = value;
    item.setAttribute("data-rate", value);
    this.#setLabel(item, this.#core.getRateLabel(rate));
    return item;
  }
  #createItemFromTemplate(template) {
    if (!template)
      return document.createElement(MenuRadioItemElement.tagName);
    const root = template.content.cloneNode(true).firstElementChild;
    if (!root || root.localName !== MenuRadioItemElement.tagName || root.nextElementSibling)
      return document.createElement(MenuRadioItemElement.tagName);
    return root;
  }
  #setLabel(item, label) {
    const labelPart = item.querySelector('[data-part~="label"]');
    if (labelPart)
      labelPart.textContent = label;
    else
      item.textContent = label;
  }
  #getTemplate() {
    for (const child of this.children)
      if (child instanceof HTMLTemplateElement)
        return child;
    return null;
  }
  #handleValueChange;
};

// node_modules/@videojs/html/dist/dev/ui/popover/popover-element.js
var PopoverElement = class extends MediaElement {
  constructor(..._args) {
    super(..._args);
    this.open = PopoverCore.defaultProps.open;
    this.defaultOpen = PopoverCore.defaultProps.defaultOpen;
    this.side = PopoverCore.defaultProps.side;
    this.align = PopoverCore.defaultProps.align;
    this.modal = PopoverCore.defaultProps.modal;
    this.closeOnEscape = PopoverCore.defaultProps.closeOnEscape;
    this.closeOnOutsideClick = PopoverCore.defaultProps.closeOnOutsideClick;
    this.openOnHover = PopoverCore.defaultProps.openOnHover;
    this.delay = PopoverCore.defaultProps.delay;
    this.closeDelay = PopoverCore.defaultProps.closeDelay;
    this.boundary = "container";
    this.#core = new PopoverCore;
    this.#containerCtx = new ContextConsumer(this, {
      context: containerContext,
      subscribe: true
    });
    this.#position = new PositionController(this);
    this.#popover = null;
    this.#snapshot = null;
    this.#disconnect = null;
    this.#triggerAbort = null;
    this.#currentTrigger = null;
  }
  static {
    this.tagName = "media-popover";
  }
  static {
    this.properties = {
      open: { type: Boolean },
      defaultOpen: {
        type: Boolean,
        attribute: "default-open"
      },
      side: { type: String },
      align: { type: String },
      modal: { type: Boolean },
      closeOnEscape: {
        type: Boolean,
        attribute: "close-on-escape"
      },
      closeOnOutsideClick: {
        type: Boolean,
        attribute: "close-on-outside-click"
      },
      openOnHover: {
        type: Boolean,
        attribute: "open-on-hover"
      },
      delay: { type: Number },
      closeDelay: {
        type: Number,
        attribute: "close-delay"
      },
      boundary: { type: String }
    };
  }
  #core;
  #containerCtx;
  #position;
  #popover;
  #snapshot;
  #disconnect;
  #triggerAbort;
  #currentTrigger;
  connectedCallback() {
    super.connectedCallback();
    if (this.destroyed)
      return;
    this.setAttribute(POPUP_HOST_ATTR, "");
    this.#disconnect = new AbortController;
    this.#popover = createPopover({
      transition: createTransition(),
      onOpenChange: (nextOpen, details) => {
        this.open = nextOpen;
        this.dispatchEvent(new CustomEvent("open-change", { detail: {
          open: nextOpen,
          ...details
        } }));
      },
      closeOnEscape: () => this.closeOnEscape,
      closeOnOutsideClick: () => this.closeOnOutsideClick,
      openOnHover: () => this.openOnHover,
      delay: () => this.delay,
      closeDelay: () => this.closeDelay,
      group: () => this.#containerCtx.value?.popupGroup
    });
    this.#popover.setPopupElement(this);
    applyElementProps(this, this.#popover.popupProps, { signal: this.#disconnect.signal });
    if (this.#snapshot)
      this.#snapshot.track(this.#popover.input);
    else
      this.#snapshot = new SnapshotController(this, this.#popover.input);
  }
  firstUpdated(changed) {
    super.firstUpdated(changed);
    if (this.defaultOpen && !this.open)
      this.#popover?.open();
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this.#disconnect?.abort();
    this.#disconnect = null;
  }
  destroyCallback() {
    this.#cleanupTrigger();
    this.#popover?.destroy();
    super.destroyCallback();
  }
  close(reason = "imperative-action") {
    this.#popover?.close(reason);
  }
  willUpdate(changed) {
    super.willUpdate(changed);
    this.#core.setProps(this);
    if (this.#popover && changed.has("open")) {
      const { active: interactionOpen } = this.#popover.input.current;
      if (this.open !== interactionOpen)
        if (this.open)
          this.#popover.open();
        else
          this.#popover.close();
    }
  }
  update(_changed) {
    super.update(_changed);
    if (!this.#popover)
      return;
    const triggerEl = this.#position.findTrigger();
    this.#syncTrigger(triggerEl);
    const input = this.#popover.input.current;
    this.#core.setInput(input);
    const state = this.#core.getState();
    applyElementProps(this, this.#core.getPopupAttrs(state));
    applyStateDataAttrs(this, state, PopoverDataAttrs);
    if (state.open)
      tryShowPopover(this);
    else
      tryHidePopover(this);
    if (this.#currentTrigger) {
      applyElementProps(this.#currentTrigger, this.#core.getTriggerAttrs(state, this.id));
      applyStyles(this.#currentTrigger, getAnchorNameStyle(this.id));
    }
    if (!state.open) {
      this.#position.cleanup();
      return;
    }
    const posOpts = {
      side: state.side,
      align: state.align
    };
    const boundaryElement = this.#getBoundaryElement();
    const triggerRect = this.#currentTrigger?.getBoundingClientRect();
    const boundaryRect = getPositioningBoundaryRect(boundaryElement);
    const offsets = resolveOffsets(this);
    if (supportsAnchorPositioning())
      applyStyles(this, getAnchorPositionStyle(this.id, posOpts, triggerRect, undefined, boundaryRect, offsets));
    else {
      const selfRect = getPopupPositionRect(this);
      applyStyles(this, getAnchorPositionStyle(this.id, posOpts, triggerRect, selfRect, boundaryRect, offsets));
    }
    this.#position.sync(this.#currentTrigger, boundaryElement);
  }
  #syncTrigger(triggerEl) {
    if (triggerEl === this.#currentTrigger)
      return;
    this.#position.cleanup();
    this.#cleanupTrigger();
    this.#currentTrigger = triggerEl;
    this.#popover?.setTriggerElement(triggerEl);
    if (triggerEl && this.#popover) {
      this.#triggerAbort = new AbortController;
      applyElementProps(triggerEl, this.#popover.triggerProps, { signal: this.#triggerAbort.signal });
    }
  }
  #cleanupTrigger() {
    if (this.#currentTrigger) {
      applyElementProps(this.#currentTrigger, {
        "aria-expanded": undefined,
        "aria-haspopup": undefined,
        "aria-controls": undefined
      });
      this.#currentTrigger.style.removeProperty("anchor-name");
    }
    this.#triggerAbort?.abort();
    this.#triggerAbort = null;
    this.#currentTrigger = null;
  }
  #getBoundaryElement() {
    return resolvePositioningBoundary(this.boundary, {
      container: this.#containerCtx.value?.container ?? null,
      root: this.getRootNode()
    });
  }
};

// node_modules/@videojs/html/dist/dev/ui/media-ui-element.js
var MediaUIElement = class extends MediaElement {
  connectedCallback() {
    super.connectedCallback();
    if (!this.mediaState.value && this.mediaState.displayName)
      logMissingFeature(this.localName, this.mediaState.displayName);
  }
  update(changed) {
    super.update(changed);
    const media = this.mediaState.value;
    if (!media)
      return;
    this.core.setMedia(media);
    const state = this.core.getState();
    applyStateDataAttrs(this, state, this.stateAttrMap);
  }
};

// node_modules/@videojs/html/dist/dev/ui/poster/poster-element.js
var PosterElement = class extends MediaUIElement {
  constructor(..._args) {
    super(..._args);
    this.core = new PosterCore;
    this.stateAttrMap = PosterDataAttrs;
    this.mediaState = new PlayerController(this, playerContext, selectPlayback);
  }
  static {
    this.tagName = "media-poster";
  }
};

// node_modules/@videojs/html/dist/dev/ui/seek-button/seek-button-element.js
var SeekButtonElement = class extends MediaButtonElement {
  constructor(..._args) {
    super(..._args);
    this.seconds = SeekButtonCore.defaultProps.seconds;
    this.core = new SeekButtonCore;
    this.stateAttrMap = SeekButtonDataAttrs;
    this.mediaState = new PlayerController(this, playerContext, selectTime);
  }
  static {
    this.tagName = "media-seek-button";
  }
  static {
    this.properties = {
      ...MediaButtonElement.properties,
      seconds: { type: Number }
    };
  }
  activate(state) {
    this.core.seek(state);
  }
};

// node_modules/@videojs/html/dist/dev/ui/tooltip/context.js
var tooltipGroupContext = createContext(Symbol("@videojs/tooltip-group"));

// node_modules/@videojs/html/dist/dev/ui/tooltip/tooltip-element.js
function isLabelTrigger(el) {
  return "$state" in el;
}
var TooltipElement = class extends MediaElement {
  constructor(..._args) {
    super(..._args);
    this.open = TooltipCore.defaultProps.open;
    this.defaultOpen = TooltipCore.defaultProps.defaultOpen;
    this.side = TooltipCore.defaultProps.side;
    this.align = TooltipCore.defaultProps.align;
    this.delay = TooltipCore.defaultProps.delay;
    this.closeDelay = TooltipCore.defaultProps.closeDelay;
    this.disableHoverablePopup = TooltipCore.defaultProps.disableHoverablePopup;
    this.disabled = TooltipCore.defaultProps.disabled;
    this.boundary = "container";
    this.#core = new TooltipCore;
    this.#groupConsumer = new ContextConsumer(this, { context: tooltipGroupContext });
    this.#containerCtx = new ContextConsumer(this, {
      context: containerContext,
      subscribe: true
    });
    this.#position = new PositionController(this);
    this.#tooltip = null;
    this.#snapshot = null;
    this.#disconnect = null;
    this.#triggerAbort = null;
    this.#currentTrigger = null;
  }
  static {
    this.tagName = "media-tooltip";
  }
  static {
    this.properties = {
      open: { type: Boolean },
      defaultOpen: {
        type: Boolean,
        attribute: "default-open"
      },
      side: { type: String },
      align: { type: String },
      delay: { type: Number },
      closeDelay: {
        type: Number,
        attribute: "close-delay"
      },
      disableHoverablePopup: {
        type: Boolean,
        attribute: "disable-hoverable-popup"
      },
      disabled: { type: Boolean },
      boundary: { type: String }
    };
  }
  #core;
  #groupConsumer;
  #containerCtx;
  #position;
  #tooltip;
  #snapshot;
  #disconnect;
  #triggerAbort;
  #currentTrigger;
  connectedCallback() {
    super.connectedCallback();
    if (this.destroyed)
      return;
    this.setAttribute(POPUP_HOST_ATTR, "");
    this.#disconnect = new AbortController;
    this.#tooltip = createTooltip({
      transition: createTransition(),
      onOpenChange: (nextOpen, details) => {
        this.open = nextOpen;
        this.dispatchEvent(new CustomEvent("open-change", { detail: {
          open: nextOpen,
          ...details
        } }));
      },
      delay: () => this.delay,
      closeDelay: () => this.closeDelay,
      disableHoverablePopup: () => this.disableHoverablePopup,
      disabled: () => this.disabled,
      group: () => this.#groupConsumer.value
    });
    this.#tooltip.setPopupElement(this);
    applyElementProps(this, this.#tooltip.popupProps, { signal: this.#disconnect.signal });
    if (this.#snapshot)
      this.#snapshot.track(this.#tooltip.input);
    else
      this.#snapshot = new SnapshotController(this, this.#tooltip.input);
  }
  firstUpdated(changed) {
    super.firstUpdated(changed);
    if (this.defaultOpen && !this.open)
      this.#tooltip?.open();
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this.#cleanupTrigger();
    this.#tooltip?.destroy();
    this.#tooltip = null;
    this.#disconnect?.abort();
    this.#disconnect = null;
  }
  close(reason = "imperative-action") {
    this.#tooltip?.close(reason);
  }
  willUpdate(changed) {
    super.willUpdate(changed);
    this.#core.setProps(this);
    if (this.#tooltip && changed.has("open")) {
      const { active: interactionOpen } = this.#tooltip.input.current;
      if (this.open !== interactionOpen)
        if (this.open)
          this.#tooltip.open();
        else
          this.#tooltip.close();
    }
  }
  update(_changed) {
    super.update(_changed);
    if (!this.#tooltip)
      return;
    const triggerEl = this.#position.findTrigger();
    this.#syncTrigger(triggerEl);
    const input = this.#tooltip.input.current;
    this.#core.setInput(input);
    const state = this.#core.getState();
    applyElementProps(this, this.#core.getPopupAttrs(state));
    applyStateDataAttrs(this, state, TooltipDataAttrs);
    if (state.open)
      tryShowPopover(this);
    else
      tryHidePopover(this);
    if (this.#currentTrigger)
      applyStyles(this.#currentTrigger, getAnchorNameStyle(this.id));
    if (!state.open) {
      this.#position.cleanup();
      return;
    }
    const posOpts = {
      side: state.side,
      align: state.align
    };
    const boundaryElement = this.#getBoundaryElement();
    const triggerRect = this.#currentTrigger?.getBoundingClientRect();
    const boundaryRect = getPositioningBoundaryRect(boundaryElement);
    const offsets = resolveOffsets(this, TooltipCSSVars);
    if (supportsAnchorPositioning())
      applyStyles(this, getAnchorPositionStyle(this.id, posOpts, triggerRect, undefined, boundaryRect, offsets, TooltipCSSVars));
    else {
      const selfRect = getPopupPositionRect(this);
      applyStyles(this, getAnchorPositionStyle(this.id, posOpts, triggerRect, selfRect, boundaryRect, offsets, TooltipCSSVars));
    }
    this.#position.sync(this.#currentTrigger, boundaryElement);
  }
  #syncTrigger(triggerEl) {
    if (triggerEl === this.#currentTrigger)
      return;
    this.#position.cleanup();
    this.#cleanupTrigger();
    this.#currentTrigger = triggerEl;
    this.#tooltip?.setTriggerElement(triggerEl);
    if (triggerEl && this.#tooltip) {
      this.#triggerAbort = new AbortController;
      applyElementProps(triggerEl, this.#tooltip.triggerProps, { signal: this.#triggerAbort.signal });
      if (isLabelTrigger(triggerEl)) {
        this.#syncContent(triggerEl);
        triggerEl.$state.subscribe(() => this.#syncContent(triggerEl), { signal: this.#triggerAbort.signal });
      }
    }
  }
  #syncContent(triggerEl) {
    this.textContent = triggerEl.getLabel() ?? "";
  }
  #cleanupTrigger() {
    if (this.#currentTrigger)
      this.#currentTrigger.style.removeProperty("anchor-name");
    this.#triggerAbort?.abort();
    this.#triggerAbort = null;
    this.#currentTrigger = null;
  }
  #getBoundaryElement() {
    return resolvePositioningBoundary(this.boundary, {
      container: this.#containerCtx.value?.container ?? null,
      root: this.getRootNode()
    });
  }
};

// node_modules/@videojs/html/dist/dev/ui/tooltip/tooltip-group-element.js
var TooltipGroupElement = class extends MediaElement {
  constructor(..._args) {
    super(..._args);
    this.delay = TooltipGroupCore.defaultProps.delay;
    this.closeDelay = TooltipGroupCore.defaultProps.closeDelay;
    this.timeout = TooltipGroupCore.defaultProps.timeout;
    this.#core = new TooltipGroupCore;
    this.#provider = new ContextProvider(this, {
      context: tooltipGroupContext,
      initialValue: this.#core
    });
  }
  static {
    this.tagName = "media-tooltip-group";
  }
  static {
    this.properties = {
      delay: { type: Number },
      closeDelay: {
        type: Number,
        attribute: "close-delay"
      },
      timeout: { type: Number }
    };
  }
  #core;
  #provider;
  update(_changed) {
    super.update(_changed);
    this.#core.setProps(this);
    this.#provider.setValue(this.#core);
  }
};

// node_modules/@videojs/html/dist/dev/ui/alert-dialog/context.js
var alertDialogContext = createContext(Symbol("@videojs/alert-dialog"));

// node_modules/@videojs/html/dist/dev/ui/alert-dialog/alert-dialog-close-element.js
var AlertDialogCloseElement = class extends MediaElement {
  constructor(..._args) {
    super(..._args);
    this.disabled = false;
    this.#ctx = new ContextConsumer(this, {
      context: alertDialogContext,
      subscribe: true
    });
    this.#disconnect = null;
  }
  static {
    this.tagName = "media-alert-dialog-close";
  }
  static {
    this.properties = { disabled: { type: Boolean } };
  }
  #ctx;
  #disconnect;
  connectedCallback() {
    super.connectedCallback();
    this.#disconnect = new AbortController;
    const buttonProps = createButton({
      onActivate: () => this.#ctx.value?.close(),
      isDisabled: () => this.disabled
    });
    applyElementProps(this, buttonProps, { signal: this.#disconnect.signal });
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this.#disconnect?.abort();
    this.#disconnect = null;
  }
  update(_changed) {
    super.update(_changed);
    const ctx = this.#ctx.value;
    if (ctx)
      applyStateDataAttrs(this, ctx.state, ctx.stateAttrMap);
  }
};

// node_modules/@videojs/html/dist/dev/ui/context-part-element.js
var ContextPartElement = class extends MediaElement {
  update(_changed) {
    super.update(_changed);
    const ctx = this.consumer.value;
    if (ctx)
      applyStateDataAttrs(this, ctx.state, ctx.stateAttrMap);
  }
};

// node_modules/@videojs/html/dist/dev/ui/alert-dialog/alert-dialog-description-element.js
var AlertDialogDescriptionElement = class extends ContextPartElement {
  constructor(..._args) {
    super(..._args);
    this.consumer = new ContextConsumer(this, {
      context: alertDialogContext,
      subscribe: true
    });
  }
  static {
    this.tagName = "media-alert-dialog-description";
  }
  update(changed) {
    super.update(changed);
    const descriptionId = this.consumer.value?.state.descriptionId;
    if (descriptionId)
      this.id = descriptionId;
  }
};

// node_modules/@videojs/html/dist/dev/ui/alert-dialog/alert-dialog-title-element.js
var AlertDialogTitleElement = class extends ContextPartElement {
  constructor(..._args) {
    super(..._args);
    this.consumer = new ContextConsumer(this, {
      context: alertDialogContext,
      subscribe: true
    });
  }
  static {
    this.tagName = "media-alert-dialog-title";
  }
  update(changed) {
    super.update(changed);
    const titleId = this.consumer.value?.state.titleId;
    if (titleId)
      this.id = titleId;
  }
};

// node_modules/@videojs/html/dist/dev/ui/controls/context.js
var controlsContext = createContext(Symbol("@videojs/controls"));

// node_modules/@videojs/html/dist/dev/ui/controls/controls-element.js
var ControlsElement = class extends MediaElement {
  static {
    this.tagName = "media-controls";
  }
  #core = new ControlsCore;
  #mediaState = new PlayerController(this, playerContext, selectControls);
  #provider = new ContextProvider(this, { context: controlsContext });
  #visible = true;
  connectedCallback() {
    super.connectedCallback();
    if (!this.#mediaState.value && this.#mediaState.displayName)
      logMissingFeature(this.localName, this.#mediaState.displayName);
  }
  update(_changed) {
    super.update(_changed);
    const media = this.#mediaState.value;
    if (!media)
      return;
    this.#core.setMedia(media);
    const state = this.#core.getState();
    applyStateDataAttrs(this, state, ControlsDataAttrs);
    this.#provider.setValue({
      state,
      stateAttrMap: ControlsDataAttrs
    });
    const wasVisible = this.#visible;
    this.#visible = state.visible;
    if (wasVisible && !state.visible)
      this.#closeOwnedOverlays();
  }
  #closeOwnedOverlays() {
    for (const element of this.querySelectorAll(POPUP_HOST_SELECTOR)) {
      const host = element;
      if (!isFunction(host.close))
        continue;
      host.close("imperative-action");
    }
  }
};

// node_modules/@videojs/html/dist/dev/ui/controls/controls-group-element.js
var ControlsGroupElement = class extends ContextPartElement {
  constructor(..._args) {
    super(..._args);
    this.consumer = new ContextConsumer(this, {
      context: controlsContext,
      subscribe: true
    });
  }
  static {
    this.tagName = "media-controls-group";
  }
  connectedCallback() {
    super.connectedCallback();
    if (this.hasAttribute("aria-label") || this.hasAttribute("aria-labelledby"))
      this.setAttribute("role", "group");
  }
};

// node_modules/@videojs/html/dist/dev/ui/error-dialog/error-dialog-element.js
var FALLBACK_MESSAGE = "An error occurred. Please try again.";
var idCounter = 0;
var ErrorDialogElement = class extends MediaElement {
  static {
    this.tagName = "media-error-dialog";
  }
  #core = new ErrorDialogCore;
  #provider = new ContextProvider(this, { context: alertDialogContext });
  #titleId = `vjs-error-dialog-title-${idCounter++}`;
  #descriptionId = `vjs-error-dialog-desc-${idCounter++}`;
  #errorState = new PlayerController(this, playerContext, selectError);
  #dialog = null;
  #snapshot = null;
  #lastErrorMessage = null;
  constructor() {
    super();
    this.#core.setTitleId(this.#titleId);
    this.#core.setDescriptionId(this.#descriptionId);
  }
  connectedCallback() {
    super.connectedCallback();
    if (this.destroyed)
      return;
    this.#dialog = createAlertDialog({
      transition: createTransition(),
      onOpenChange: (nextOpen) => {
        if (!nextOpen)
          this.#errorState.value?.dismissError();
      }
    });
    this.#dialog.setElement(this);
    if (this.#snapshot)
      this.#snapshot.track(this.#dialog.input);
    else
      this.#snapshot = new SnapshotController(this, this.#dialog.input);
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this.#dialog?.destroy();
    this.#dialog = null;
  }
  willUpdate(_changed) {
    super.willUpdate(_changed);
    if (!this.#dialog)
      return;
    const errorState = this.#errorState.value;
    const hasError = Boolean(errorState?.error);
    const { active: isOpen } = this.#dialog.input.current;
    if (errorState?.error) {
      const message = errorState.error.message?.trim();
      this.#lastErrorMessage = message || null;
    }
    const desc = this.querySelector("media-alert-dialog-description");
    if (desc)
      desc.textContent = this.#lastErrorMessage ?? FALLBACK_MESSAGE;
    if (hasError && !isOpen)
      this.#dialog.open();
    else if (!hasError && isOpen)
      this.#dialog.close();
  }
  update(_changed) {
    super.update(_changed);
    if (!this.#dialog)
      return;
    const input = this.#dialog.input.current;
    this.#core.setInput(input);
    const state = this.#core.getState();
    applyElementProps(this, this.#core.getAttrs(state));
    applyStateDataAttrs(this, state, AlertDialogDataAttrs);
    this.#provider.setValue({
      state,
      stateAttrMap: AlertDialogDataAttrs,
      close: () => this.#dialog?.close()
    });
  }
};

// node_modules/@videojs/html/dist/dev/ui/menu/menu-back-element.js
var MenuBackElement = class extends MediaElement {
  constructor(..._args) {
    super(..._args);
    this.label = "Back";
    this.#ctx = new ContextConsumer(this, {
      context: menuContext,
      subscribe: true
    });
    this.#disconnect = null;
    this.#bound = false;
  }
  static {
    this.tagName = "media-menu-back";
  }
  static {
    this.properties = { label: { type: String } };
  }
  #ctx;
  #disconnect;
  #bound;
  connectedCallback() {
    super.connectedCallback();
    this.#disconnect = new AbortController;
    this.#bound = false;
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this.#disconnect?.abort();
    this.#disconnect = null;
    this.#bound = false;
  }
  update(_changed) {
    super.update(_changed);
    const ctx = this.#ctx.value;
    if (!ctx || !this.#disconnect)
      return;
    if (!this.#bound) {
      this.#bound = true;
      applyElementProps(this, { onClick: () => {
        ctx.parentMenu?.pop();
      } }, { signal: this.#disconnect.signal });
    }
    applyElementProps(this, {
      role: "button",
      "aria-label": this.label
    });
    if (ctx)
      applyStateDataAttrs(this, ctx.state, ctx.stateAttrMap);
  }
};

// node_modules/@videojs/html/dist/dev/ui/menu/menu-checkbox-item-element.js
var MenuCheckboxItemElement = class extends MediaElement {
  constructor(..._args) {
    super(..._args);
    this.checked = false;
    this.disabled = false;
    this.#ctx = new ContextConsumer(this, {
      context: menuContext,
      subscribe: true
    });
    this.#disconnect = null;
    this.#registered = false;
    this.#cleanupRegistration = null;
  }
  static {
    this.tagName = "media-menu-checkbox-item";
  }
  static {
    this.properties = {
      checked: { type: Boolean },
      disabled: { type: Boolean }
    };
  }
  #ctx;
  #disconnect;
  #registered;
  #cleanupRegistration;
  connectedCallback() {
    super.connectedCallback();
    this.#disconnect = new AbortController;
    this.#registered = false;
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this.#cleanupRegistration?.();
    this.#cleanupRegistration = null;
    this.#disconnect?.abort();
    this.#disconnect = null;
    this.#registered = false;
  }
  update(_changed) {
    super.update(_changed);
    const ctx = this.#ctx.value;
    if (!ctx || !this.#disconnect)
      return;
    if (!this.#registered) {
      this.#registered = true;
      this.#cleanupRegistration = ctx.menu.registerItem(this);
      applyElementProps(this, {
        onClick: () => {
          if (!this.#ctx.value || this.disabled)
            return;
          this.checked = !this.checked;
          this.dispatchEvent(new CustomEvent("checked-change", {
            detail: { checked: this.checked },
            bubbles: true
          }));
        },
        onPointerenter: () => {
          const currentCtx = this.#ctx.value;
          if (!this.disabled)
            currentCtx?.menu.highlight(this, { focus: false });
        }
      }, { signal: this.#disconnect.signal });
    }
    applyElementProps(this, {
      role: "menuitemcheckbox",
      "aria-checked": String(this.checked),
      "aria-disabled": this.disabled ? "true" : undefined
    });
    applyStateDataAttrs(this, ctx.state, ctx.stateAttrMap);
  }
};

// node_modules/@videojs/html/dist/dev/ui/menu/menu-group-element.js
var MenuGroupElement = class extends MediaElement {
  constructor(..._args) {
    super(..._args);
    this.label = undefined;
    this.#ctx = new ContextConsumer(this, {
      context: menuContext,
      subscribe: true
    });
  }
  static {
    this.tagName = "media-menu-group";
  }
  static {
    this.properties = { label: { type: String } };
  }
  #ctx;
  update(_changed) {
    super.update(_changed);
    applyElementProps(this, {
      role: "group",
      "aria-label": this.label
    });
    const ctx = this.#ctx.value;
    if (ctx)
      applyStateDataAttrs(this, ctx.state, ctx.stateAttrMap);
  }
};

// node_modules/@videojs/html/dist/dev/ui/menu/menu-item-element.js
var MenuItemElement = class extends MediaElement {
  constructor(..._args) {
    super(..._args);
    this.disabled = false;
    this.commandfor = undefined;
    this.#ctx = new ContextConsumer(this, {
      context: menuContext,
      subscribe: true
    });
    this.#disconnect = null;
    this.#registered = false;
    this.#cleanupRegistration = null;
  }
  static {
    this.tagName = "media-menu-item";
  }
  static {
    this.properties = {
      disabled: { type: Boolean },
      commandfor: { type: String }
    };
  }
  #ctx;
  #disconnect;
  #registered;
  #cleanupRegistration;
  connectedCallback() {
    super.connectedCallback();
    this.#disconnect = new AbortController;
    this.#registered = false;
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this.#cleanupRegistration?.();
    this.#cleanupRegistration = null;
    this.#disconnect?.abort();
    this.#disconnect = null;
    this.#registered = false;
  }
  update(_changed) {
    super.update(_changed);
    const ctx = this.#ctx.value;
    if (!ctx || !this.#disconnect)
      return;
    if (!this.#registered) {
      this.#registered = true;
      this.#cleanupRegistration = ctx.menu.registerItem(this);
      applyElementProps(this, {
        onClick: (event) => {
          const currentCtx = this.#ctx.value;
          if (!currentCtx || this.disabled)
            return;
          const target = this.commandfor;
          if (target)
            currentCtx.menu.push(target, this.id);
          else {
            this.dispatchEvent(new CustomEvent("select", { bubbles: true }));
            completeMenuItemSelection(currentCtx.menu, currentCtx.parentMenu);
          }
          event.preventDefault();
        },
        onKeyDown: (event) => {
          const currentCtx = this.#ctx.value;
          if (!currentCtx || this.disabled || event.key !== "ArrowRight")
            return;
          const target = this.commandfor;
          if (!target)
            return;
          currentCtx.menu.push(target, this.id);
          event.preventDefault();
        },
        onPointerenter: () => {
          const currentCtx = this.#ctx.value;
          if (!this.disabled)
            currentCtx?.menu.highlight(this, { focus: false });
        }
      }, { signal: this.#disconnect.signal });
    }
    const hasSubmenu = Boolean(this.commandfor);
    const activeSubMenuId = ctx.navigation.stack[ctx.navigation.stack.length - 1]?.menuId ?? null;
    const isExpanded = hasSubmenu ? activeSubMenuId === this.commandfor : undefined;
    applyElementProps(this, {
      role: "menuitem",
      "aria-disabled": this.disabled ? "true" : undefined,
      ...hasSubmenu && {
        "aria-haspopup": "menu",
        "aria-expanded": isExpanded ? "true" : "false",
        "data-has-submenu": ""
      }
    });
    applyStateDataAttrs(this, ctx.state, ctx.stateAttrMap);
  }
};

// node_modules/@videojs/html/dist/dev/ui/menu/menu-label-element.js
var MenuLabelElement = class extends ContextPartElement {
  constructor(..._args) {
    super(..._args);
    this.consumer = new ContextConsumer(this, {
      context: menuContext,
      subscribe: true
    });
  }
  static {
    this.tagName = "media-menu-label";
  }
};

// node_modules/@videojs/html/dist/dev/ui/menu/menu-separator-element.js
var MenuSeparatorElement = class extends MediaElement {
  static {
    this.tagName = "media-menu-separator";
  }
  #ctx = new ContextConsumer(this, {
    context: menuContext,
    subscribe: true
  });
  update(_changed) {
    super.update(_changed);
    applyElementProps(this, { role: "separator" });
    const ctx = this.#ctx.value;
    if (ctx)
      applyStateDataAttrs(this, ctx.state, ctx.stateAttrMap);
  }
};

// node_modules/@videojs/html/dist/dev/ui/menu/menu-view-element.js
var MenuViewElement = class extends MediaElement {
  static {
    this.tagName = "media-menu-view";
  }
  update(changed) {
    super.update(changed);
    applyElementProps(this, getMenuRootViewAttrs());
  }
};

// node_modules/@videojs/html/dist/dev/ui/input-indicators/input-indicator-element.js
var InputIndicatorElement = class extends MediaElement {
  constructor(..._args) {
    super(..._args);
    this.player = new PlayerController(this, playerContext);
    this.container = new ContextConsumer(this, {
      context: containerContext,
      callback: () => this.#reconnect(),
      subscribe: true
    });
    this.#disconnect = null;
    this.#inputActionUnsubscribe = null;
    this.#visibilityUnsubscribe = null;
    this.#visibilityHandle = null;
    this.#lastGeneration = 0;
    this.#snapshot = null;
  }
  #disconnect;
  #inputActionUnsubscribe;
  #visibilityUnsubscribe;
  #visibilityHandle;
  #lastGeneration;
  #snapshot;
  #getVisibilityHandle() {
    return this.#visibilityHandle ??= { close: () => this.core.close() };
  }
  #payloadSnapshot() {
    return this.#snapshot ?? this.core.state.current;
  }
  connectedCallback() {
    super.connectedCallback();
    if (this.destroyed)
      return;
    this.#snapshot = this.core.state.current;
    this.#disconnect = new AbortController;
    this.core.state.subscribe(() => this.requestUpdate(), { signal: this.#disconnect.signal });
    this.transition.state.subscribe(() => this.requestUpdate(), { signal: this.#disconnect.signal });
    this.hidden = true;
    this.#reconnect();
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this.#inputActionUnsubscribe?.();
    this.#visibilityUnsubscribe?.();
    this.#inputActionUnsubscribe = null;
    this.#visibilityUnsubscribe = null;
    this.#disconnect?.abort();
    this.#disconnect = null;
  }
  destroyCallback() {
    this.#inputActionUnsubscribe?.();
    this.#visibilityUnsubscribe?.();
    this.core.destroy();
    this.transition.destroy();
    this.liveIndicator.remove();
    super.destroyCallback();
  }
  willUpdate(changed) {
    super.willUpdate(changed);
    this.syncCoreProps();
  }
  update(changed) {
    super.update(changed);
    this.#syncTransition();
    const currentState = this.core.state.current;
    const transitionState = this.transition.state.current;
    if (!isIndicatorPresent(currentState, transitionState)) {
      this.liveIndicator.remove();
      return;
    }
    const state = getRenderedIndicatorState(currentState, this.#payloadSnapshot(), transitionState);
    this.liveIndicator.render(state);
  }
  #syncTransition() {
    const currentState = this.core.state.current;
    if (currentState.open) {
      this.#snapshot = currentState;
      if (this.#lastGeneration !== currentState.generation) {
        this.#lastGeneration = currentState.generation;
        this.transition.open();
      }
      return;
    }
    const { active, status } = this.transition.state.current;
    if (active && status !== "ending")
      this.transition.close(this.liveIndicator.element);
  }
  #reconnect() {
    this.#inputActionUnsubscribe?.();
    this.#visibilityUnsubscribe?.();
    this.#inputActionUnsubscribe = null;
    this.#visibilityUnsubscribe = null;
    const container = this.container.value?.container;
    if (!container)
      return;
    const visibility = getIndicatorVisibilityCoordinator(container);
    const visibilityHandle = this.#getVisibilityHandle();
    this.#visibilityUnsubscribe = visibility.register(visibilityHandle);
    this.#inputActionUnsubscribe = subscribeToInputActions(container, (event) => {
      if (this.core.processEvent(event, getMediaSnapshot(this.player.value)))
        visibility.show(visibilityHandle);
    });
  }
};

// node_modules/@videojs/html/dist/dev/ui/input-indicators/live-indicator.js
var LiveIndicator = class {
  #host;
  #dataAttrs;
  #render;
  constructor(options) {
    this.#host = options.host;
    this.#dataAttrs = options.dataAttrs;
    this.#render = options.render;
  }
  get element() {
    return this.#host;
  }
  render(state) {
    this.#host.hidden = false;
    applyStateDataAttrs(this.#host, state, this.#dataAttrs);
    this.#render(this.#host, state);
    return this.#host;
  }
  remove() {
    this.#host.hidden = true;
    for (const key in this.#dataAttrs) {
      const name = this.#dataAttrs[key];
      if (name)
        this.#host.removeAttribute(name);
    }
  }
};

// node_modules/@videojs/html/dist/dev/ui/seek-indicator/seek-indicator-element.js
var SeekIndicatorElement = class extends InputIndicatorElement {
  static {
    this.tagName = "media-seek-indicator";
  }
  static {
    this.properties = { closeDelay: {
      type: Number,
      attribute: "close-delay"
    } };
  }
  #core = new SeekIndicatorCore;
  #transition = createTransition();
  #liveIndicator = new LiveIndicator({
    host: this,
    dataAttrs: SeekIndicatorDataAttrs,
    render: renderSeekIndicator
  });
  get core() {
    return this.#core;
  }
  get transition() {
    return this.#transition;
  }
  get liveIndicator() {
    return this.#liveIndicator;
  }
  syncCoreProps() {
    this.#core.setProps({ closeDelay: this.closeDelay });
  }
};
function renderSeekIndicator(element, state) {
  const value = element.querySelector("media-seek-indicator-value");
  if (!value)
    return;
  value.textContent = getSeekIndicatorDisplayValue(state);
}

// node_modules/@videojs/html/dist/dev/ui/seek-indicator/seek-indicator-value-element.js
var SeekIndicatorValueElement = class extends MediaElement {
  static {
    this.tagName = "media-seek-indicator-value";
  }
};

// node_modules/@videojs/html/dist/dev/ui/slider/context.js
var sliderContext = createContext(Symbol("@videojs/slider"));

// node_modules/@videojs/html/dist/dev/ui/slider/slider-buffer-element.js
var SliderBufferElement = class extends ContextPartElement {
  constructor(..._args) {
    super(..._args);
    this.consumer = new ContextConsumer(this, {
      context: sliderContext,
      subscribe: true
    });
  }
  static {
    this.tagName = "media-slider-buffer";
  }
};

// node_modules/@videojs/html/dist/dev/ui/slider/slider-fill-element.js
var SliderFillElement = class extends ContextPartElement {
  constructor(..._args) {
    super(..._args);
    this.consumer = new ContextConsumer(this, {
      context: sliderContext,
      subscribe: true
    });
  }
  static {
    this.tagName = "media-slider-fill";
  }
};

// node_modules/@videojs/html/dist/dev/ui/slider/slider-preview-element.js
var SliderPreviewElement = class extends MediaElement {
  constructor(..._args) {
    super(..._args);
    this.overflow = "clamp";
    this.#ctx = new ContextConsumer(this, {
      context: sliderContext,
      subscribe: true
    });
    this.#resizeObserver = null;
    this.#width = 0;
  }
  static {
    this.tagName = "media-slider-preview";
  }
  static {
    this.properties = { overflow: { type: String } };
  }
  #ctx;
  #resizeObserver;
  #width;
  connectedCallback() {
    super.connectedCallback();
    this.#resizeObserver = new ResizeObserver(([entry]) => {
      this.#width = entry.contentRect.width;
      this.#applyPosition();
    });
    this.#resizeObserver.observe(this);
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
  }
  #applyPosition() {
    applyStyles(this, getSliderPreviewStyle(this.#width, this.overflow));
  }
  update(_changed) {
    super.update(_changed);
    const ctx = this.#ctx.value;
    if (ctx)
      applyStateDataAttrs(this, ctx.state, ctx.stateAttrMap);
    this.#applyPosition();
  }
};

// node_modules/@videojs/html/dist/dev/ui/slider/slider-thumb-element.js
var SliderThumbElement = class extends MediaElement {
  static {
    this.tagName = "media-slider-thumb";
  }
  #ctx = new ContextConsumer(this, {
    context: sliderContext,
    subscribe: true
  });
  #disconnect = null;
  #thumbPropsApplied = false;
  connectedCallback() {
    super.connectedCallback();
    this.#disconnect = new AbortController;
    this.#thumbPropsApplied = false;
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this.#disconnect?.abort();
    this.#disconnect = null;
    this.#thumbPropsApplied = false;
  }
  update(_changed) {
    super.update(_changed);
    const ctx = this.#ctx.value;
    if (!ctx)
      return;
    if (!this.#thumbPropsApplied && this.#disconnect) {
      applyElementProps(this, ctx.thumbProps, { signal: this.#disconnect.signal });
      this.#thumbPropsApplied = true;
    }
    applyElementProps(this, ctx.thumbAttrs);
    applyStateDataAttrs(this, ctx.state, ctx.stateAttrMap);
  }
};

// node_modules/@videojs/html/dist/dev/ui/thumbnail/thumbnail-element.js
var SHADOW_CSS = `:host {
  display: inline-block;
  overflow: hidden;
}
img {
  display: block;
}`;
var ThumbnailElement = class extends MediaElement {
  static {
    this.tagName = "media-thumbnail";
  }
  static {
    this.properties = {
      time: { type: Number },
      crossOrigin: {
        type: String,
        attribute: "crossorigin"
      },
      loading: { type: String },
      fetchPriority: {
        type: String,
        attribute: "fetchpriority"
      }
    };
  }
  #core;
  #img;
  #textTracks;
  #thumbnails;
  #externalThumbnails;
  #lastTextTrack;
  #api;
  constructor() {
    super();
    this.time = 0;
    this.#core = new ThumbnailCore;
    this.#img = document.createElement("img");
    this.#textTracks = new PlayerController(this, playerContext, selectTextTrack);
    this.#thumbnails = [];
    this.#api = null;
    const shadow = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = SHADOW_CSS;
    shadow.appendChild(style);
    this.#img.alt = "";
    this.#img.setAttribute("part", "img");
    this.#img.setAttribute("aria-hidden", "true");
    this.#img.setAttribute("decoding", "async");
    shadow.appendChild(this.#img);
  }
  get thumbnails() {
    return this.#externalThumbnails;
  }
  set thumbnails(value) {
    this.#externalThumbnails = value;
    this.requestUpdate();
  }
  connectedCallback() {
    super.connectedCallback();
    if (this.destroyed)
      return;
    this.#api = createThumbnail({
      getContainer: () => this,
      getImg: () => this.#img,
      onStateChange: () => this.requestUpdate()
    });
  }
  disconnectedCallback() {
    super.disconnectedCallback();
  }
  destroyCallback() {
    this.#api?.destroy();
    super.destroyCallback();
  }
  update(changed) {
    super.update(changed);
    if (this.#externalThumbnails)
      this.#thumbnails = this.#externalThumbnails;
    else {
      const textTrack = this.#textTracks.value;
      if (textTrack !== this.#lastTextTrack) {
        this.#lastTextTrack = textTrack;
        this.#thumbnails = textTrack && textTrack.thumbnailCues.length > 0 ? mapCuesToThumbnails(textTrack.thumbnailCues, textTrack.thumbnailTrackSrc ?? undefined) : [];
      }
    }
    const thumbnail = this.#core.findActiveThumbnail(this.#thumbnails, this.time);
    applyElementProps(this.#img, {
      crossorigin: this.crossOrigin || undefined,
      loading: this.loading,
      fetchpriority: this.fetchPriority
    });
    this.#api?.updateSrc(thumbnail?.url);
    if (!thumbnail) {
      this.#img.removeAttribute("src");
      this.#resetStyles();
      const state2 = this.#core.getState(false, false, undefined);
      applyElementProps(this, this.#core.getAttrs(state2));
      applyStateDataAttrs(this, state2, ThumbnailDataAttrs);
      return;
    }
    if (this.#img.getAttribute("src") !== thumbnail.url)
      this.#img.src = thumbnail.url;
    const api = this.#api;
    const state = this.#core.getState(api?.loading ?? false, api?.error ?? false, thumbnail);
    applyElementProps(this, this.#core.getAttrs(state));
    applyStateDataAttrs(this, state, ThumbnailDataAttrs);
    if (api?.naturalWidth && api.naturalHeight) {
      const constraints = api.readConstraints();
      const result = this.#core.resize(thumbnail, api.naturalWidth, api.naturalHeight, constraints);
      if (result)
        this.#applyResize(result);
    }
  }
  #applyResize(result) {
    this.style.width = `${result.containerWidth}px`;
    this.style.height = `${result.containerHeight}px`;
    const imgStyle = this.#img.style;
    imgStyle.width = `${result.imageWidth}px`;
    imgStyle.height = `${result.imageHeight}px`;
    imgStyle.maxWidth = "none";
    imgStyle.transform = result.offsetX || result.offsetY ? `translate(-${result.offsetX}px, -${result.offsetY}px)` : "";
  }
  #resetStyles() {
    this.style.width = "";
    this.style.height = "";
    const imgStyle = this.#img.style;
    imgStyle.width = "";
    imgStyle.height = "";
    imgStyle.maxWidth = "";
    imgStyle.transform = "";
  }
};

// node_modules/@videojs/html/dist/dev/ui/slider/slider-thumbnail-element.js
var SliderThumbnailElement = class extends ThumbnailElement {
  static {
    this.tagName = "media-slider-thumbnail";
  }
  #ctx = new ContextConsumer(this, {
    context: sliderContext,
    subscribe: true
  });
  update(changed) {
    const ctx = this.#ctx.value;
    if (ctx)
      this.time = ctx.pointerValue;
    super.update(changed);
  }
};

// node_modules/@videojs/html/dist/dev/ui/slider/slider-track-element.js
var SliderTrackElement = class extends ContextPartElement {
  constructor(..._args) {
    super(..._args);
    this.consumer = new ContextConsumer(this, {
      context: sliderContext,
      subscribe: true
    });
  }
  static {
    this.tagName = "media-slider-track";
  }
};

// node_modules/@videojs/html/dist/dev/ui/slider/slider-value-element.js
var SliderValueElement = class extends MediaElement {
  constructor(..._args) {
    super(..._args);
    this.type = "current";
    this.#ctx = new ContextConsumer(this, {
      context: sliderContext,
      subscribe: true
    });
  }
  static {
    this.tagName = "media-slider-value";
  }
  static {
    this.properties = { type: { type: String } };
  }
  #ctx;
  connectedCallback() {
    super.connectedCallback();
    this.setAttribute("aria-live", "off");
  }
  update(_changed) {
    super.update(_changed);
    const ctx = this.#ctx.value;
    if (!ctx)
      return;
    const value = this.type === "pointer" ? ctx.pointerValue : ctx.state.value;
    this.textContent = ctx.formatValue ? ctx.formatValue(value, this.type) : String(Math.round(value));
    applyStateDataAttrs(this, ctx.state, ctx.stateAttrMap);
  }
};

// node_modules/@videojs/html/dist/dev/ui/status-announcer/status-announcer-element.js
var StatusAnnouncerElement = class extends MediaElement {
  static {
    this.tagName = "media-status-announcer";
  }
  static {
    this.properties = { closeDelay: {
      type: Number,
      attribute: "close-delay"
    } };
  }
  #core = new StatusAnnouncerCore;
  #player = new PlayerController(this, playerContext);
  #container = new ContextConsumer(this, {
    context: containerContext,
    callback: () => this.#reconnect(),
    subscribe: true
  });
  #disconnect = null;
  #inputActionUnsubscribe = null;
  connectedCallback() {
    super.connectedCallback();
    if (this.destroyed)
      return;
    this.setAttribute("role", "status");
    this.#disconnect = new AbortController;
    this.#core.state.subscribe(() => this.requestUpdate(), { signal: this.#disconnect.signal });
    this.#reconnect();
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this.#inputActionUnsubscribe?.();
    this.#inputActionUnsubscribe = null;
    this.#disconnect?.abort();
    this.#disconnect = null;
  }
  destroyCallback() {
    this.#inputActionUnsubscribe?.();
    this.#core.destroy();
    super.destroyCallback();
  }
  willUpdate(changed) {
    super.willUpdate(changed);
    this.#core.setProps({ closeDelay: this.closeDelay });
  }
  update(changed) {
    super.update(changed);
    const label = this.#core.state.current.label;
    if (label)
      this.setAttribute("aria-label", label);
    else
      this.removeAttribute("aria-label");
  }
  #reconnect() {
    this.#inputActionUnsubscribe?.();
    this.#inputActionUnsubscribe = null;
    const container = this.#container.value?.container;
    if (!container)
      return;
    this.#inputActionUnsubscribe = subscribeToInputActions(container, (event) => {
      this.#core.processEvent(event, getMediaSnapshot(this.#player.value));
    });
  }
};

// node_modules/@videojs/html/dist/dev/ui/status-indicator/status-indicator-element.js
var StatusIndicatorElement = class extends InputIndicatorElement {
  static {
    this.tagName = "media-status-indicator";
  }
  static {
    this.properties = {
      actions: { type: String },
      closeDelay: {
        type: Number,
        attribute: "close-delay"
      }
    };
  }
  #core = new StatusIndicatorCore;
  #transition = createTransition();
  #liveIndicator = new LiveIndicator({
    host: this,
    dataAttrs: StatusIndicatorDataAttrs,
    render: renderStatusIndicator
  });
  get core() {
    return this.#core;
  }
  get transition() {
    return this.#transition;
  }
  get liveIndicator() {
    return this.#liveIndicator;
  }
  syncCoreProps() {
    this.#core.setProps({
      actions: parseActions(this.actions),
      closeDelay: this.closeDelay
    });
  }
};
function parseActions(actions) {
  return actions?.split(/[\s,]+/).filter(Boolean);
}
function renderStatusIndicator(element, state) {
  const value = element.querySelector("media-status-indicator-value");
  if (!value)
    return;
  value.textContent = getStatusIndicatorDisplayValue(state);
}

// node_modules/@videojs/html/dist/dev/ui/status-indicator/status-indicator-value-element.js
var StatusIndicatorValueElement = class extends MediaElement {
  static {
    this.tagName = "media-status-indicator-value";
  }
};

// node_modules/@videojs/html/dist/dev/ui/time/time-element.js
var TimeElement = class extends MediaElement {
  constructor(..._args) {
    super(..._args);
    this.type = TimeCore.defaultProps.type;
    this.negativeSign = TimeCore.defaultProps.negativeSign;
    this.label = TimeCore.defaultProps.label;
    this.#core = new TimeCore;
    this.#state = new PlayerController(this, playerContext, selectTime);
    this.#signSpan = document.createElement("span");
    this.#textNode = document.createTextNode("");
  }
  static {
    this.tagName = "media-time";
  }
  static {
    this.properties = {
      type: { type: String },
      negativeSign: {
        type: String,
        attribute: "negative-sign"
      },
      label: { type: String }
    };
  }
  #core;
  #state;
  #signSpan;
  #textNode;
  connectedCallback() {
    super.connectedCallback();
    if (!this.#signSpan.parentNode) {
      this.#signSpan.setAttribute("aria-hidden", "true");
      this.#signSpan.hidden = true;
      this.appendChild(this.#signSpan);
      this.appendChild(this.#textNode);
    }
    if (!this.#state.value)
      logMissingFeature(this.localName, this.#state.displayName);
  }
  willUpdate(changed) {
    super.willUpdate(changed);
    this.#core.setProps(this);
  }
  update(changed) {
    super.update(changed);
    const media = this.#state.value;
    if (!media)
      return;
    this.#core.setMedia(media);
    const state = this.#core.getState();
    this.#signSpan.hidden = !state.negative;
    this.#signSpan.textContent = state.negative ? this.negativeSign : "";
    this.#textNode.textContent = state.text;
    applyElementProps(this, this.#core.getAttrs(state));
    applyStateDataAttrs(this, state, TimeDataAttrs);
  }
};

// node_modules/@videojs/html/dist/dev/ui/time/time-group-element.js
var TimeGroupElement = class extends MediaElement {
  static {
    this.tagName = "media-time-group";
  }
};

// node_modules/@videojs/html/dist/dev/ui/time/time-separator-element.js
var TimeSeparatorElement = class extends MediaElement {
  static {
    this.tagName = "media-time-separator";
  }
  connectedCallback() {
    super.connectedCallback();
    this.setAttribute("aria-hidden", "true");
    if (!this.textContent?.trim())
      this.textContent = "/";
  }
};

// node_modules/@videojs/html/dist/dev/ui/time-slider/time-slider-element.js
var TimeSliderElement = class extends MediaElement {
  constructor(..._args) {
    super(..._args);
    this.label = TimeSliderCore.defaultProps.label;
    this.changeThrottle = TimeSliderCore.defaultProps.changeThrottle;
    this.step = TimeSliderCore.defaultProps.step;
    this.largeStep = TimeSliderCore.defaultProps.largeStep;
    this.orientation = TimeSliderCore.defaultProps.orientation;
    this.disabled = TimeSliderCore.defaultProps.disabled;
    this.thumbAlignment = TimeSliderCore.defaultProps.thumbAlignment;
    this.#core = new TimeSliderCore;
    this.#provider = new ContextProvider(this, { context: sliderContext });
    this.#timeState = new PlayerController(this, playerContext, selectTime);
    this.#bufferState = new PlayerController(this, playerContext, selectBuffer);
    this.#slider = null;
    this.#disconnect = null;
  }
  static {
    this.tagName = "media-time-slider";
  }
  static {
    this.properties = {
      label: { type: String },
      changeThrottle: {
        type: Number,
        attribute: "change-throttle"
      },
      step: { type: Number },
      largeStep: {
        type: Number,
        attribute: "large-step"
      },
      orientation: { type: String },
      disabled: { type: Boolean },
      thumbAlignment: {
        type: String,
        attribute: "thumb-alignment"
      }
    };
  }
  #core;
  #provider;
  #timeState;
  #bufferState;
  #slider;
  #disconnect;
  connectedCallback() {
    super.connectedCallback();
    if (this.destroyed)
      return;
    this.#disconnect = new AbortController;
    const signal = this.#disconnect.signal;
    this.#slider = createSlider({
      getElement: () => this,
      getThumbElement: () => this.querySelector("media-slider-thumb"),
      getOrientation: () => this.orientation,
      isRTL: () => isRTL(this),
      isDisabled: () => this.disabled || !this.#timeState.value,
      getPercent: () => {
        const media = this.#timeState.value;
        if (!media)
          return 0;
        return this.#core.percentFromValue(media.currentTime);
      },
      getStepPercent: () => this.#core.getStepPercent(),
      getLargeStepPercent: () => this.#core.getLargeStepPercent(),
      onValueCommit: (percent) => {
        const media = this.#timeState.value;
        if (media)
          media.seek(this.#core.rawValueFromPercent(percent));
      },
      changeThrottle: this.changeThrottle,
      onDragStart: () => {
        this.dispatchEvent(new CustomEvent("drag-start", { bubbles: true }));
      },
      onDragEnd: () => {
        this.dispatchEvent(new CustomEvent("drag-end", { bubbles: true }));
      },
      adjustPercent: (raw, thumbSize, trackSize) => this.#core.adjustPercentForAlignment(raw, thumbSize, trackSize),
      onResize: () => this.requestUpdate()
    });
    applyElementProps(this, this.#slider.rootProps, { signal });
    applyStyles(this, this.#slider.rootStyle);
    this.#slider.input.subscribe(() => this.requestUpdate(), { signal });
    if (!this.#timeState.value)
      logMissingFeature(this.localName, this.#timeState.displayName);
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this.#disconnect?.abort();
    this.#disconnect = null;
  }
  destroyCallback() {
    this.#slider?.destroy();
    super.destroyCallback();
  }
  willUpdate(_changed) {
    super.willUpdate(_changed);
    this.#core.setProps(this);
  }
  update(_changed) {
    super.update(_changed);
    if (!this.#slider)
      return;
    const time = this.#timeState.value;
    const buffer = this.#bufferState.value;
    if (!time)
      return;
    this.#core.setInput(this.#slider.input.current);
    const media = {
      ...time,
      ...buffer ?? {
        buffered: [],
        seekable: []
      }
    };
    this.#core.setMedia(media);
    const state = this.#core.getState();
    const cssVars = getTimeSliderCSSVars(this.#slider.adjustForAlignment(state));
    applyStyles(this, cssVars);
    applyStateDataAttrs(this, state, TimeSliderDataAttrs);
    this.#provider.setValue({
      state,
      stateAttrMap: TimeSliderDataAttrs,
      pointerValue: this.#core.valueFromPercent(state.pointerPercent),
      thumbAttrs: this.#core.getAttrs(state),
      thumbProps: this.#slider.thumbProps,
      formatValue: (value) => formatTime(value, state.duration)
    });
  }
};

// node_modules/@videojs/html/dist/dev/ui/volume-indicator/volume-indicator-element.js
var VolumeIndicatorElement = class extends InputIndicatorElement {
  static {
    this.tagName = "media-volume-indicator";
  }
  static {
    this.properties = { closeDelay: {
      type: Number,
      attribute: "close-delay"
    } };
  }
  #core = new VolumeIndicatorCore;
  #transition = createTransition();
  #liveIndicator = new LiveIndicator({
    host: this,
    dataAttrs: VolumeIndicatorDataAttrs,
    render: renderVolumeIndicator
  });
  get core() {
    return this.#core;
  }
  get transition() {
    return this.#transition;
  }
  get liveIndicator() {
    return this.#liveIndicator;
  }
  syncCoreProps() {
    this.#core.setProps({ closeDelay: this.closeDelay });
  }
};
function renderVolumeIndicator(element, state) {
  const fill = element.querySelector("media-volume-indicator-fill");
  const value = element.querySelector("media-volume-indicator-value");
  if (state.fill)
    fill?.style.setProperty(VolumeIndicatorCSSVars.fill, state.fill);
  else
    fill?.style.removeProperty(VolumeIndicatorCSSVars.fill);
  if (value)
    value.textContent = getVolumeIndicatorDisplayValue(state);
}

// node_modules/@videojs/html/dist/dev/ui/volume-indicator/volume-indicator-fill-element.js
var VolumeIndicatorFillElement = class extends MediaElement {
  static {
    this.tagName = "media-volume-indicator-fill";
  }
};

// node_modules/@videojs/html/dist/dev/ui/volume-indicator/volume-indicator-value-element.js
var VolumeIndicatorValueElement = class extends MediaElement {
  static {
    this.tagName = "media-volume-indicator-value";
  }
};

// node_modules/@videojs/html/dist/dev/ui/volume-slider/volume-slider-element.js
var VolumeSliderElement = class extends MediaElement {
  constructor(..._args) {
    super(..._args);
    this.label = VolumeSliderCore.defaultProps.label;
    this.step = VolumeSliderCore.defaultProps.step;
    this.largeStep = VolumeSliderCore.defaultProps.largeStep;
    this.wheelStep = VolumeSliderCore.defaultProps.wheelStep;
    this.orientation = VolumeSliderCore.defaultProps.orientation;
    this.disabled = VolumeSliderCore.defaultProps.disabled;
    this.thumbAlignment = VolumeSliderCore.defaultProps.thumbAlignment;
    this.#core = new VolumeSliderCore;
    this.#provider = new ContextProvider(this, { context: sliderContext });
    this.#volumeState = new PlayerController(this, playerContext, selectVolume);
    this.#slider = null;
    this.#disconnect = null;
  }
  static {
    this.tagName = "media-volume-slider";
  }
  static {
    this.properties = {
      label: { type: String },
      step: { type: Number },
      largeStep: {
        type: Number,
        attribute: "large-step"
      },
      wheelStep: {
        type: Number,
        attribute: "wheel-step"
      },
      orientation: { type: String },
      disabled: { type: Boolean },
      thumbAlignment: {
        type: String,
        attribute: "thumb-alignment"
      }
    };
  }
  #core;
  #provider;
  #volumeState;
  #slider;
  #disconnect;
  connectedCallback() {
    super.connectedCallback();
    if (this.destroyed)
      return;
    this.#disconnect = new AbortController;
    const signal = this.#disconnect.signal;
    const isDisabled = () => this.disabled || !this.#volumeState.value;
    const getPercent = () => (this.#volumeState.value?.volume ?? 0) * 100;
    const getStepPercent = () => this.#core.getStepPercent();
    const setVolume = (percent) => this.#setVolume(percent);
    this.#slider = createSlider({
      getElement: () => this,
      getThumbElement: () => this.querySelector("media-slider-thumb"),
      getOrientation: () => this.orientation,
      isRTL: () => isRTL(this),
      isDisabled,
      getPercent,
      getStepPercent,
      getLargeStepPercent: () => this.#core.getLargeStepPercent(),
      onValueChange: setVolume,
      onValueCommit: setVolume,
      onDragStart: () => {
        this.dispatchEvent(new CustomEvent("drag-start", { bubbles: true }));
      },
      onDragEnd: () => {
        this.dispatchEvent(new CustomEvent("drag-end", { bubbles: true }));
      },
      adjustPercent: (raw, thumbSize, trackSize) => this.#core.adjustPercentForAlignment(raw, thumbSize, trackSize),
      onResize: () => this.requestUpdate()
    });
    const wheelProps = createWheelStep({
      isDisabled,
      getPercent,
      getStepPercent: () => this.#core.getWheelStepPercent(),
      onValueChange: setVolume
    });
    applyElementProps(this, this.#slider.rootProps, { signal });
    applyElementProps(this, wheelProps, { signal });
    applyStyles(this, this.#slider.rootStyle);
    this.#slider.input.subscribe(() => this.requestUpdate(), { signal });
    if (!this.#volumeState.value)
      logMissingFeature(this.localName, this.#volumeState.displayName);
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this.#disconnect?.abort();
    this.#disconnect = null;
  }
  destroyCallback() {
    this.#slider?.destroy();
    super.destroyCallback();
  }
  willUpdate(_changed) {
    super.willUpdate(_changed);
    this.#core.setProps(this);
  }
  update(_changed) {
    super.update(_changed);
    if (!this.#slider)
      return;
    const media = this.#volumeState.value;
    if (!media)
      return;
    this.#core.setInput(this.#slider.input.current);
    this.#core.setMedia(media);
    const state = this.#core.getState();
    const cssVars = getSliderCSSVars(this.#slider.adjustForAlignment(state));
    applyStyles(this, cssVars);
    applyStateDataAttrs(this, state, VolumeSliderDataAttrs);
    this.#provider.setValue({
      state,
      stateAttrMap: VolumeSliderDataAttrs,
      pointerValue: this.#core.valueFromPercent(state.pointerPercent),
      thumbAttrs: this.#core.getAttrs(state),
      thumbProps: this.#slider.thumbProps,
      formatValue: (value) => `${Math.round(value)}%`
    });
  }
  #setVolume(percent) {
    this.#volumeState.value?.setVolume(this.#core.valueFromPercent(percent) / 100);
  }
};

// node_modules/@videojs/html/dist/dev/define/ui/compounds.js
function defineMenu() {
  safeDefine(MenuElement);
  safeDefine(MenuBackElement);
  safeDefine(MenuItemElement);
  safeDefine(MenuLabelElement);
  safeDefine(MenuSeparatorElement);
  safeDefine(MenuGroupElement);
  safeDefine(MenuRadioGroupElement);
  safeDefine(MenuRadioItemElement);
  safeDefine(MenuCheckboxItemElement);
  safeDefine(MenuItemIndicatorElement);
  safeDefine(MenuViewElement);
}
function defineControls() {
  safeDefine(ControlsElement);
  safeDefine(ControlsGroupElement);
}
function defineErrorDialog() {
  safeDefine(ErrorDialogElement);
  safeDefine(AlertDialogCloseElement);
  safeDefine(AlertDialogDescriptionElement);
  safeDefine(AlertDialogTitleElement);
}
function defineInputIndicators() {
  safeDefine(StatusAnnouncerElement);
  safeDefine(StatusIndicatorElement);
  safeDefine(StatusIndicatorValueElement);
  safeDefine(VolumeIndicatorElement);
  safeDefine(VolumeIndicatorFillElement);
  safeDefine(VolumeIndicatorValueElement);
  safeDefine(SeekIndicatorElement);
  safeDefine(SeekIndicatorValueElement);
}
function defineSliderParts() {
  safeDefine(SliderFillElement);
  safeDefine(SliderPreviewElement);
  safeDefine(SliderThumbElement);
  safeDefine(SliderTrackElement);
  safeDefine(SliderValueElement);
}
function defineTime() {
  safeDefine(TimeElement);
  safeDefine(TimeGroupElement);
  safeDefine(TimeSeparatorElement);
}
function defineTimeSlider() {
  safeDefine(TimeSliderElement);
  defineSliderParts();
  safeDefine(SliderBufferElement);
  safeDefine(SliderThumbnailElement);
}
function defineVolumeSlider() {
  safeDefine(VolumeSliderElement);
  defineSliderParts();
}

// node_modules/@videojs/html/dist/dev/define/video/ui.js
safeDefine(VideoPlayerElement);
safeDefine(MediaContainerElement);
defineControls();
defineErrorDialog();
defineInputIndicators();
defineTimeSlider();
defineVolumeSlider();
defineTime();
defineMenu();
safeDefine(BufferingIndicatorElement);
safeDefine(CaptionsButtonElement);
safeDefine(CastButtonElement);
safeDefine(FullscreenButtonElement);
safeDefine(GestureElement);
safeDefine(HotkeyElement);
safeDefine(LiveButtonElement);
safeDefine(MuteButtonElement);
safeDefine(PiPButtonElement);
safeDefine(PlayButtonElement);
safeDefine(PlaybackRateButtonElement);
safeDefine(PlaybackRateOptionsElement);
safeDefine(PlaybackRateMenuTriggerElement);
safeDefine(PlaybackRateMenuElement);
safeDefine(PopoverElement);
safeDefine(PosterElement);
safeDefine(SeekButtonElement);
safeDefine(TooltipElement);
safeDefine(TooltipGroupElement);

// node_modules/@videojs/html/dist/dev/_virtual/inline-css_src/define/video/skin.js
var skin_default = `/* -------------------------------------------------------------------------- */
/* Global styles for the host document, outside of the Shadow DOM             */
/* -------------------------------------------------------------------------- */

video-player,
live-video-player {
  display: contents;
}

/*
Required to override any default video and image styles (such as
Tailwind's CSS reset) and ensure they fill the container as expected.
*/
video-player video,
video-player [slot="poster"],
live-video-player video,
live-video-player [slot="poster"] {
  display: block;
  width: 100%;
  height: 100%;
}

video-player video::-webkit-media-text-track-container,
live-video-player video::-webkit-media-text-track-container {
  z-index: 1;
  font-family: inherit;
  scale: 0.98;
  translate: 0 var(--media-caption-track-y, 0);
  transition: translate var(--media-caption-track-duration, 0) ease-out;
  transition-delay: var(--media-caption-track-delay, 0);
}

/* -------------------------------------------------------------------------- */
/* Shared styles for all HTML skins                                           */
/* -------------------------------------------------------------------------- */

media-tooltip-group {
  display: contents;
}

:host {
  /* \`display:grid\` fixes a weird issue with Safari when setting aspect-ratio */
  display: grid;
  width: 100%;
}

/* Hide volume popover when volume control is unsupported (e.g., iOS Safari). */
.media-popover--volume:has(media-volume-slider[data-availability="unsupported"]) {
  display: none;
}

/* ==========================================================================
   Reset
   ========================================================================== */

.media-default-skin *,
.media-default-skin *::before,
.media-default-skin *::after {
  box-sizing: border-box;
}
.media-default-skin img,
.media-default-skin video,
.media-default-skin svg {
  display: block;
  max-width: 100%;
}
.media-default-skin button {
  font: inherit;
}
.media-default-skin [hidden][hidden] {
  /* Keep authored templates hidden even when component classes set display. */
  display: none;
}
@media (prefers-reduced-motion: no-preference) {
  .media-default-skin {
    interpolate-size: allow-keywords;
  }
}

/* ==========================================================================
   Root Container
   ========================================================================== */

.media-default-skin {
  --media-current-shadow-color: oklch(from currentColor 0 0 0 / clamp(0, calc((l - 0.5) * 0.5), 0.15));
  --media-current-shadow-color-subtle: oklch(from var(--media-current-shadow-color) l c h / calc(alpha * 0.4));
  --media-icon-size: 18px;
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  container: media-root / inline-size;
  font-family:
    Inter Variable,
    Inter,
    ui-sans-serif,
    system-ui,
    sans-serif;
  font-size: 0.8125rem; /* 13px at 100% font size */
  -webkit-font-smoothing: auto;
  -moz-osx-font-smoothing: auto;
  line-height: 1.5;
  letter-spacing: normal;
  outline: 2px solid transparent;
  outline-offset: -4px;
  border-radius: var(--media-border-radius, 2rem);
  isolation: isolate;
  transition-timing-function: ease-out;
  transition-duration: 100ms;
  transition-property: outline-offset, outline-color;

  &:focus-visible {
    outline-color: currentColor;
    outline-offset: 2px;
  }
}

/* ==========================================================================
   Surface (shared glass effect for tooltips, popovers, controls)
   ========================================================================== */

.media-default-skin .media-surface {
  background-color: var(--media-surface-background-color);
  box-shadow:
    0 0 0 1px var(--media-surface-outer-border-color),
    0 1px 3px 0 var(--media-surface-shadow-color),
    0 1px 2px -1px var(--media-surface-shadow-color);
  backdrop-filter: var(--media-surface-backdrop-filter);

  /* Inner border ring */
  &::after {
    position: absolute;
    inset: 0;
    z-index: 10;
    pointer-events: none;
    content: "";
    border-radius: inherit;
    box-shadow: inset 0 0 0 1px var(--media-surface-inner-border-color);
  }
}

/* ==========================================================================
   Media Element
   ========================================================================== */

.media-default-skin ::slotted(video),
.media-default-skin video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: var(--media-object-fit, contain);
  object-position: var(--media-object-position, center);
}
.media-default-skin ::slotted(video) {
  border-radius: var(--media-video-border-radius);
}
.media-default-skin video {
  border-radius: inherit;
}

.media-default-skin:fullscreen ::slotted(video),
.media-default-skin:fullscreen video {
  object-fit: contain;
}

/* ==========================================================================
   Overlay / Scrim
   ========================================================================== */

.media-default-skin .media-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: linear-gradient(to top, oklch(0 0 0 / 0.5), oklch(0 0 0 / 0.3), oklch(0 0 0 / 0));
  border-radius: inherit;
  opacity: 0;
  backdrop-filter: blur(0) saturate(1);
  transition-timing-function: ease-out;
  transition-duration: var(--media-controls-transition-duration);
  transition-property: opacity, backdrop-filter;
}

.media-default-skin .media-error ~ .media-overlay {
  transition-delay: var(--media-error-dialog-transition-delay);
  transition-duration: var(--media-error-dialog-transition-duration);
}

.media-default-skin .media-controls[data-visible] ~ .media-overlay,
.media-default-skin .media-error[data-open] ~ .media-overlay {
  opacity: 1;
}

.media-default-skin .media-error[data-open] ~ .media-overlay {
  backdrop-filter: blur(16px) saturate(1.5);
}

/* ==========================================================================
   Buffering Indicator
   ========================================================================== */

.media-default-skin .media-buffering-indicator {
  position: absolute;
  inset: 0;
  display: none;
  align-items: center;
  justify-content: center;
  color: oklch(1 0 0);
  pointer-events: none;

  &:not([data-visible]) {
    --media-spinner-animation: none;
  }

  &[data-visible] {
    display: flex;
  }

  .media-surface {
    padding: 0.25rem;
    border-radius: 100%;
  }
}

/* ==========================================================================
   Error Dialog
   ========================================================================== */

.media-default-skin .media-error {
  outline: none;
}

.media-default-skin .media-error:not([data-open]) {
  display: none;
}

.media-default-skin .media-error__title {
  font-weight: 600;
  line-height: 1.25;
}

.media-default-skin .media-error__description {
  overflow-wrap: anywhere;
  opacity: 0.7;
}

.media-default-skin .media-error__actions {
  display: flex;
  gap: 0.5rem;

  & > * {
    flex: 1;
  }
}

.media-default-skin .media-error[data-open] ~ .media-controls * {
  visibility: hidden;
}

/* ==========================================================================
   Controls
   ========================================================================== */

.media-default-skin .media-controls {
  display: flex;
  column-gap: 0.075rem;
  align-items: center;
  padding: 0.375rem;
  container: media-controls / inline-size;
  text-shadow: 0 1px 0 var(--media-current-shadow-color);
  border-radius: 1.5rem;
}

/* ==========================================================================
   Time Display
   ========================================================================== */

.media-default-skin .media-time-controls {
  display: flex;
  flex: 1;
  gap: 0.75rem;
  align-items: center;
  padding-inline: 0.5rem;
  container: media-time-controls / inline-size;
}

.media-default-skin .media-time {
  font-variant-numeric: tabular-nums;
}

/* ==========================================================================
   Buttons
   ========================================================================== */

/* Base button */
.media-default-skin .media-button {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  min-height: 0;
  padding: 0.5rem 1rem;
  text-align: center;
  touch-action: manipulation;
  cursor: pointer;
  user-select: none;
  outline: 2px solid transparent;
  outline-offset: -2px;
  border: none;
  border-radius: calc(infinity * 1px);
  transition-timing-function: ease-out;
  transition-duration: 150ms;
  transition-property: background-color, outline-offset, scale;
  /* Fix weird jumping when clicking on the buttons in Safari. */
  will-change: scale;

  &:focus-visible {
    outline-color: currentColor;
    outline-offset: 2px;
  }

  &:active {
    scale: 0.98;
  }

  &[disabled] {
    cursor: not-allowed;
    opacity: 0.5;
    filter: grayscale(1);
  }

  &[data-availability="unavailable"],
  &[data-availability="unsupported"] {
    display: none;
  }
}

/* Primary button variant */
.media-default-skin .media-button--primary {
  font-weight: 500;
  color: oklch(0 0 0);
  text-shadow: none;
  background: oklch(1 0 0);
}

/* Subtle button variant */
.media-default-skin .media-button--subtle {
  color: inherit;
  text-shadow: inherit;
  background: transparent;

  &:hover,
  &:focus-visible,
  &[aria-expanded="true"] {
    text-decoration: none;
    background-color: oklch(from currentColor l c h / 0.1);
  }
}

/* Icon button variant */
.media-default-skin .media-button--icon {
  display: grid;
  width: 2.25rem;
  aspect-ratio: 1;
  padding: 0;

  &:active {
    scale: 0.9;
  }

  & .media-icon {
    grid-area: 1 / 1;
    transition-behavior: allow-discrete;
    transition-property: display, opacity;
    transition-duration: 150ms;
    transition-timing-function: ease-out;
    filter: drop-shadow(0 1px 0 var(--media-current-shadow-color));
  }
}

/* Seek button */
.media-default-skin .media-button--seek {
  & .media-icon__label {
    position: absolute;
    right: -1px;
    bottom: -3px;
    font-size: 10px;
    font-weight: 480;
    font-variant-numeric: tabular-nums;
  }

  &:has(.media-icon--flipped) .media-icon__label {
    right: unset;
    left: -1px;
  }
}

/* Playback rate button */
.media-default-skin .media-button--playback-rate {
  padding: 0;
  font-variant-numeric: tabular-nums;

  &::after {
    width: 4ch;
    content: attr(data-rate) "\\00D7";
  }

  &[data-inline-rate-label]::after {
    content: none;
  }
}

/* Live button — wide pill button with a status dot (gray → red at the live
   edge) rendered via ::before, and "LIVE" text rendered as the button's own
   text content. */
.media-default-skin .media-button--live {
  display: inline-flex;
  gap: 0.4rem;
  align-items: center;
  width: auto;
  aspect-ratio: auto;
  padding: 0.5rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1;
  text-transform: uppercase;
  letter-spacing: 0.05em;

  &::before {
    display: inline-block;
    flex-shrink: 0;
    width: 0.5rem;
    height: 0.5rem;
    content: "";
    background-color: oklch(from currentColor l c h / 0.4);
    border-radius: 50%;
    transition: background-color 150ms ease-out;
  }

  &[data-live-edge]::before {
    background-color: oklch(0.65 0.22 27);
  }
}

/* ==========================================================================
   Button Groups
   ========================================================================== */

.media-default-skin .media-button-group {
  display: flex;
  gap: 0.075rem;
  align-items: center;

  @container media-root (width > 42rem) {
    gap: 0.125rem;
  }
}

/* ==========================================================================
   Icons
   ========================================================================== */

.media-default-skin .media-icon__container {
  position: relative;
}
.media-default-skin .media-icon {
  flex-shrink: 0;
  width: var(--media-icon-size);
  height: var(--media-icon-size);
}
.media-default-skin .media-icon--flipped {
  scale: -1 1;
}

/* ==========================================================================
   Menus
   Note: Menus use \`.media-popover\` styles for positioning and transitions.
   ========================================================================== */

.media-default-skin .media-popover.media-menu {
  box-sizing: border-box;
  min-width: min(6rem, var(--media-popover-available-width, 6rem));
  max-width: var(--media-popover-available-width, none);
  max-height: var(--media-popover-available-height, none);
  padding: 0.375rem;
  overflow: auto;
  overscroll-behavior: none;
  border-radius: 1.25rem;

  &::before {
    display: none;
  }
}

.media-default-skin .media-popover.media-menu .media-menu__group {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;

  &::before {
    position: absolute;
    position-anchor: --media-menu-item-highlight-anchor;
    inset: anchor(inside);
    pointer-events: none;
    content: "";
    background-color: oklch(from currentColor l c h / 0.1);
    border-radius: calc(infinity * 1px);
    transition: inset ease-in-out 100ms;
  }

  @supports not (top: anchor(top)) {
    &::before {
      display: none;
    }
  }
}

.media-default-skin .media-popover.media-menu .media-menu__item {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  justify-content: space-between;
  min-height: 2rem;
  padding: 0 0.75rem;
  font-variant-numeric: tabular-nums;
  color: inherit;
  cursor: pointer;
  outline: 2px solid transparent;
  outline-offset: -2px;
  border-radius: calc(infinity * 1px);

  &:hover,
  &[data-highlighted] {
    anchor-name: --media-menu-item-highlight-anchor;
  }

  @supports not (top: anchor(top)) {
    &:hover,
    &[data-highlighted] {
      background-color: oklch(from currentColor l c h / 0.1);
    }
  }

  &:focus-visible {
    outline-color: currentColor;
    outline-offset: 2px;
  }

  &[aria-checked="true"] .media-menu__indicator {
    opacity: 1;
  }

  &[aria-disabled="true"] {
    pointer-events: none;
    cursor: not-allowed;
    opacity: 0.5;
  }
}

.media-default-skin .media-popover.media-menu .media-menu__indicator {
  flex-shrink: 0;
  margin-right: -0.25rem;
  opacity: 0;
}

.media-default-skin .media-popover.media-menu .media-menu__indicator .media-icon {
  filter: drop-shadow(0 1px 0 var(--media-current-shadow-color));
}

/* ==========================================================================
   Poster Image
   ========================================================================== */

.media-default-skin media-poster,
.media-default-skin > img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  transition: opacity 0.25s;
}
.media-default-skin media-poster:not([data-visible]),
.media-default-skin > img:not([data-visible]) {
  opacity: 0;
}
.media-default-skin media-poster ::slotted(img),
.media-default-skin media-poster img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: var(--media-object-fit, contain);
  object-position: var(--media-object-position, center);
  border-radius: var(--media-video-border-radius);
}
.media-default-skin > img {
  object-fit: var(--media-object-fit, contain);
  object-position: var(--media-object-position, center);
  border-radius: inherit;
}

.media-default-skin:fullscreen media-poster ::slotted(img),
.media-default-skin:fullscreen media-poster img,
.media-default-skin:fullscreen > img {
  object-fit: contain;
}

/* ==========================================================================
   Media preview
   ========================================================================== */
.media-default-skin .media-preview {
  pointer-events: none;
  background-color: oklch(0 0 0 / 0.9);
  border-radius: 0.75rem;

  & .media-preview__thumbnail {
    position: relative;
    display: block;
    overflow: clip;
    border-radius: inherit;

    &::after {
      position: absolute;
      inset: 0;
      content: "";
      background-image: linear-gradient(to top, oklch(0 0 0 / 0.8), oklch(0 0 0 / 0.3), oklch(0 0 0 / 0));
      border-radius: inherit;
    }
  }

  & .media-preview__time {
    position: absolute;
    inset-inline: 0;
    bottom: 0.5rem;
    text-align: center;
  }

  & .media-overlay {
    opacity: 1;
  }

  & .media-preview__spinner {
    position: absolute;
    top: 50%;
    left: 50%;
    opacity: 0;
    translate: -50% -50%;
  }

  & .media-preview__thumbnail,
  & .media-preview__spinner {
    transition: opacity 150ms ease-out;
  }

  &:not(:has(.media-preview__thumbnail[data-loading])) {
    & .media-preview__spinner {
      --media-spinner-animation: none;
    }
  }

  &:has(.media-preview__thumbnail[data-loading]) {
    & .media-preview__thumbnail {
      opacity: 0;
    }
    & .media-preview__spinner {
      opacity: 1;
    }
  }
}

/* ==========================================================================
   Slider
   ========================================================================== */

.media-default-skin .media-slider {
  position: relative;
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  outline: none;
  border-radius: calc(infinity * 1px);

  &[data-orientation="horizontal"] {
    width: 100%;
    min-width: 5rem;
    height: 2rem;
  }

  &[data-orientation="vertical"] {
    width: 2rem;
    height: 5rem;
  }
}

/* Track */
.media-default-skin .media-slider__track {
  position: relative;
  overflow: hidden;
  user-select: none;
  border-radius: inherit;
  isolation: isolate;

  &[data-orientation="horizontal"] {
    width: 100%;
    height: 0.25rem;
  }

  &[data-orientation="vertical"] {
    width: 0.25rem;
    height: 100%;
  }
}

/* Thumb */
.media-default-skin .media-slider__thumb {
  position: absolute;
  z-index: 10;
  width: 0.625rem;
  height: 0.625rem;
  user-select: none;
  outline: 4px solid transparent;
  outline-offset: -4px;
  background-color: currentColor;
  border-radius: calc(infinity * 1px);
  box-shadow:
    0 0 0 1px var(--media-current-shadow-color-subtle, oklch(0 0 0 / 0.1)),
    0 1px 3px 0 oklch(0 0 0 / 0.15),
    0 1px 2px -1px oklch(0 0 0 / 0.15);
  opacity: 0;
  translate: -50% -50%;
  transition-timing-function: ease-out;
  transition-duration: 150ms;
  transition-property: opacity, height, width, outline-offset;

  &[data-orientation="horizontal"] {
    top: 50%;
    left: var(--media-slider-fill);
  }

  &[data-orientation="vertical"] {
    top: calc(100% - var(--media-slider-fill));
    left: 50%;
  }

  &:hover,
  &:focus {
    outline-color: oklch(from currentColor l c h / 0.25);
    outline-offset: 0;
  }

  &::after {
    position: absolute;
    inset: -4px;
    content: "";
    border-radius: inherit;
    box-shadow: 0 0 0 2px oklch(1 0 0);
    transition-timing-function: ease-out;
    transition-duration: 150ms;
    transition-property: opacity, scale;
  }

  &:not(:focus-visible)::after {
    opacity: 0;
    scale: 0.5;
  }
}

.media-default-skin .media-slider:active .media-slider__thumb,
.media-default-skin .media-slider__thumb--persistent {
  width: 0.75rem;
  height: 0.75rem;
}

.media-default-skin .media-slider:hover .media-slider__thumb,
.media-default-skin .media-slider__thumb:focus-visible,
.media-default-skin .media-slider__thumb--persistent {
  opacity: 1;
}

/* Shared track fills */
.media-default-skin .media-slider__buffer,
.media-default-skin .media-slider__fill {
  position: absolute;
  pointer-events: none;
  border-radius: inherit;
}

.media-default-skin .media-slider__buffer[data-orientation="horizontal"],
.media-default-skin .media-slider__fill[data-orientation="horizontal"] {
  inset-block: 0;
  left: 0;
}

.media-default-skin .media-slider__buffer[data-orientation="vertical"],
.media-default-skin .media-slider__fill[data-orientation="vertical"] {
  inset-inline: 0;
  bottom: 0;
}

/* Buffer */
.media-default-skin .media-slider__buffer {
  background-color: oklch(from currentColor l c h / 0.2);
  transition-timing-function: ease-out;
  transition-duration: 0.25s;

  &[data-orientation="horizontal"] {
    width: var(--media-slider-buffer);
    transition-property: width;
  }

  &[data-orientation="vertical"] {
    height: var(--media-slider-buffer);
    transition-property: height;
  }
}

/* Fill */
.media-default-skin .media-slider__fill {
  background-color: currentColor;

  &[data-orientation="horizontal"] {
    width: var(--media-slider-fill);
  }

  &[data-orientation="vertical"] {
    height: var(--media-slider-fill);
  }
}

/* Dragging — thumb and fill follow the pointer position */
.media-default-skin .media-slider[data-dragging] .media-slider__thumb[data-orientation="horizontal"] {
  left: var(--media-slider-pointer);
}

.media-default-skin .media-slider[data-dragging] .media-slider__thumb[data-orientation="vertical"] {
  top: calc(100% - var(--media-slider-pointer));
}

.media-default-skin .media-slider[data-dragging] .media-slider__fill[data-orientation="horizontal"] {
  width: var(--media-slider-pointer);
}

.media-default-skin .media-slider[data-dragging] .media-slider__fill[data-orientation="vertical"] {
  height: var(--media-slider-pointer);
}

/* ==========================================================================
   Popups & Tooltips
   ========================================================================== */

.media-default-skin .media-popover,
.media-default-skin .media-tooltip {
  margin: 0;
  overflow: visible;
  color: inherit;
  border: 0;
  filter: blur(0px);
  transition-timing-function: var(--media-popup-transition-timing-function);
  transition-duration: var(--media-popup-transition-duration);
  transition-property: scale, opacity, filter;

  &[data-starting-style],
  &[data-ending-style] {
    opacity: 0;
    filter: blur(8px);
    scale: 0.85;
  }

  &[data-instant] {
    transition-duration: 0ms;
  }

  &[data-side="top"] {
    transform-origin: bottom;
  }
  &[data-side="bottom"] {
    transform-origin: top;
  }
  &[data-side="left"] {
    transform-origin: right;
  }
  &[data-side="right"] {
    transform-origin: left;
  }

  /* Safe area between trigger and popup */
  &::before {
    position: absolute;
    pointer-events: inherit;
    content: "";
  }

  &[data-side="top"]::before,
  &[data-side="bottom"]::before {
    inset-inline: 0;
    width: 100%;
  }
  &[data-side="top"]::before {
    top: 100%;
  }
  &[data-side="bottom"]::before {
    bottom: 100%;
  }

  &[data-side="left"]::before,
  &[data-side="right"]::before {
    inset-block: 0;
    height: 100%;
  }
  &[data-side="left"]::before {
    left: 100%;
  }
  &[data-side="right"]::before {
    right: 100%;
  }
}

.media-default-skin .media-popover {
  &[data-side="top"]::before,
  &[data-side="bottom"]::before {
    height: var(--media-popover-side-offset);
  }
  &[data-side="left"]::before,
  &[data-side="right"]::before {
    width: var(--media-popover-side-offset);
  }
}
.media-default-skin .media-popover--volume {
  padding: 0.75rem 0;
  border-radius: calc(infinity * 1px);

  &:has(media-volume-slider[data-availability="unsupported"]) {
    display: none;
  }
}

.media-default-skin .media-tooltip {
  padding: 0.25rem 0.625rem;
  font-size: 0.75rem;
  white-space: nowrap;
  border-radius: calc(infinity * 1px);

  &[data-side="top"]::before,
  &[data-side="bottom"]::before {
    height: var(--media-tooltip-side-offset);
  }
  &[data-side="left"]::before,
  &[data-side="right"]::before {
    width: var(--media-tooltip-side-offset);
  }
}

/* ==========================================================================
   Native Caption Track
   ========================================================================== */

.media-default-skin {
  --media-caption-track-duration: var(--media-controls-transition-duration);
  --media-caption-track-delay: 25ms;
  --media-caption-track-y: -0.5rem;

  &:has(.media-controls[data-visible]) {
    --media-caption-track-y: -5.5rem;
  }

  @container media-root (width > 42rem) {
    &:has(.media-controls[data-visible]) > * {
      --media-caption-track-y: -3.5rem;
    }
  }
}

.media-default-skin video::-webkit-media-text-track-container {
  z-index: 1;
  font-family: inherit;
  scale: 0.98;
  translate: 0 var(--media-caption-track-y);
  transition: translate var(--media-caption-track-duration) ease-out;
  transition-delay: var(--media-caption-track-delay);
}

/* ==========================================================================
   Input Feedback
   ========================================================================== */

.media-default-skin .media-input-feedback {
  position: absolute;
  inset-inline: 0;
  top: 0;
  bottom: 3.5rem; /* Shift up a little in smaller containers */
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  align-items: center;
  justify-items: center;
  color: var(--media-color-primary, oklch(1 0 0));
  pointer-events: none;

  @container media-root (width > 24rem) {
    bottom: 0;
  }
}

/* --- Feedback islands ------------------------------------------------------- */

.media-default-skin .media-input-feedback-island {
  --media-surface-background-color: oklch(0 0 0 / 0.25);
  position: absolute;
  top: 0.75rem;
  font-weight: 500;
  color: inherit;
  pointer-events: none;
  border-radius: calc(Infinity * 1px);
  transform-origin: top center;
  transition-timing-function: ease-out;
  transition-duration: 100ms;

  .media-input-feedback-island__content {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0.25rem 0.625rem;

    /* Increase contrast of the content */
    * {
      mix-blend-mode: difference;
    }
  }

  .media-icon {
    display: none;
    flex-shrink: 0;
  }

  .media-input-feedback-island__value {
    margin-left: auto;
  }

  @media (pointer: coarse) {
    transition-property: scale, translate, opacity;
    will-change: scale, translate, opacity;
  }

  @media (pointer: fine) and (prefers-reduced-motion: no-preference) {
    transition-property: scale, translate, filter, opacity;
    will-change: scale, translate, filter, opacity;
  }

  @media (prefers-reduced-transparency: reduce) or (prefers-contrast: more) {
    --media-surface-background-color: oklch(0 0 0);
  }

  /* Default hidden state */
  &[data-starting-style],
  &[data-ending-style] {
    opacity: 0;
    transition-timing-function: ease-in;
    transition-duration: 250ms;

    @media (pointer: fine) and (prefers-reduced-motion: no-preference) {
      filter: blur(8px);
      scale: 0.9;
    }

    @media (prefers-reduced-motion: no-preference) {
      &[data-ending-style] {
        translate: 0 -25%;
      }
    }
  }
}

.media-default-skin .media-input-feedback-island--volume {
  width: min(80%, 12rem);

  .media-input-feedback-island__content {
    --media-progress-fill: var(--media-volume-fill);
    background-image: linear-gradient(
      to right,
      currentColor 0%,
      currentColor var(--media-progress-fill),
      transparent var(--media-progress-fill),
      transparent 100%
    );
    border-radius: inherit;
    transition: --media-progress-fill 200ms linear;
  }
}

.media-default-skin .media-input-feedback-island--volume[data-level="high"] .media-icon--volume-high,
.media-default-skin .media-input-feedback-island--volume[data-level="low"] .media-icon--volume-low,
.media-default-skin .media-input-feedback-island--volume[data-level="off"] .media-icon--volume-off {
  display: block;
}

.media-default-skin .media-input-feedback-island--status[data-status="captions-on"] .media-icon--captions-on,
.media-default-skin .media-input-feedback-island--status[data-status="captions-off"] .media-icon--captions-off,
.media-default-skin .media-input-feedback-island--status[data-status="fullscreen"] .media-icon--fullscreen-enter,
.media-default-skin .media-input-feedback-island--status[data-status="exit-fullscreen"] .media-icon--fullscreen-exit,
.media-default-skin .media-input-feedback-island--status[data-status="pip"] .media-icon--pip-enter,
.media-default-skin .media-input-feedback-island--status[data-status="exit-pip"] .media-icon--pip-exit {
  display: block;
}

/* --- Boundary shake ------------------------------------------------------- */

@media (prefers-reduced-motion: no-preference) {
  .media-default-skin .media-input-feedback-island--volume[data-min],
  .media-default-skin .media-input-feedback-island--volume[data-max] {
    animation: media-shake 300ms ease-in-out;
  }
}

/* --- Bubble ---------------------------------------------------------------- */

.media-default-skin .media-input-feedback-bubble {
  display: flex;
  flex-direction: column;
  grid-row: 1;
  grid-column: 2; /* default to center for status bubbles and undirected seeks */
  align-items: center;
  justify-content: center;
  padding: 1rem;
  transition: opacity 250ms ease-out;

  @container media-root (width > 24rem) {
    padding: 2rem;
  }

  &[data-starting-style],
  &[data-ending-style] {
    opacity: 0;
    transition-timing-function: ease-in;
    transition-duration: 200ms;
  }
}

/* Direction placement — seek bubbles move to the side implied by their direction. */
.media-default-skin .media-input-feedback-bubble[data-direction="backward"] {
  grid-column: 1;
  justify-self: left;
}

.media-default-skin .media-input-feedback-bubble:not([data-direction]) {
  grid-column: 2;
  transition-timing-function:
    ease-out, linear(0, 0.12 1.5%, 1.35 9.7%, 2.2 13.9%, 3 19.9%, 2.7 21.8%, 0.62 37.5%, 0.96 50.9%, 1);
  transition-duration: 600ms;
  transition-property: opacity, scale;

  @media (prefers-reduced-motion: reduce) {
    transition: opacity 100ms ease-out;
  }

  &[data-starting-style],
  &[data-ending-style] {
    opacity: 0;
    scale: 0.8;
    transition-timing-function: ease-in;
    transition-duration: 200ms;
  }
}

.media-default-skin .media-input-feedback-bubble[data-direction="forward"] {
  grid-column: 3;
  justify-self: right;
}

/* --- Bubble icons ---------------------------------------------------------- */

.media-default-skin .media-input-feedback-bubble .media-icon {
  display: none;
  width: 36px;
  height: 36px;
}

/* seek: seek icon, flipped for backward */
.media-default-skin .media-input-feedback-bubble[data-direction] .media-icon--seek {
  display: block;
}

.media-default-skin .media-input-feedback-bubble[data-direction="backward"] .media-icon--seek {
  transform: scaleX(-1);
}

@media (prefers-reduced-motion: no-preference) {
  .media-default-skin
    .media-input-feedback-bubble[data-direction="forward"]:not([data-starting-style])
    .media-icon--seek {
    animation: media-slide-in-forward 300ms ease-in-out;
  }

  .media-default-skin
    .media-input-feedback-bubble[data-direction="backward"]:not([data-starting-style])
    .media-icon--seek {
    animation: media-slide-in-backward 300ms ease-in-out;
  }

  .media-default-skin .media-input-feedback-island--status[data-status]:not([data-starting-style]) .media-icon,
  .media-default-skin .media-input-feedback-bubble[data-status]:not([data-starting-style]) .media-icon {
    animation: media-pop-in 250ms ease-out;
  }
}

.media-default-skin .media-input-feedback-bubble[data-status="pause"] .media-icon--pause,
.media-default-skin .media-input-feedback-bubble[data-status="play"] .media-icon--play {
  display: block;
}

/* ==========================================================================
   Icon State Visibility for Video Skins

   Data-attribute-driven visibility rules for multi-state icon buttons.
   Uses :is() with both element selectors (for HTML custom element wrappers)
   and class selectors (for React rendered SVG elements).
   ========================================================================== */

/* --- All icons hidden by default --- */

.media-button--play .media-icon--restart,
.media-button--play .media-icon--play,
.media-button--play .media-icon--pause,
.media-button--mute .media-icon--volume-off,
.media-button--mute .media-icon--volume-low,
.media-button--mute .media-icon--volume-high,
.media-button--fullscreen .media-icon--fullscreen-enter,
.media-button--fullscreen .media-icon--fullscreen-exit,
.media-button--pip .media-icon--pip-enter,
.media-button--pip .media-icon--pip-exit,
.media-button--cast .media-icon--cast-enter,
.media-button--cast .media-icon--cast-exit,
.media-button--captions .media-icon--captions-off,
.media-button--captions .media-icon--captions-on {
  display: none;
  opacity: 0;
}

/* --- Active icon per state --- */

/* Play: ended → restart */
.media-button--play[data-ended] .media-icon--restart,
/* Play: paused (not ended) → play */
.media-button--play:not([data-ended])[data-paused] .media-icon--play,
/* Play: playing (not paused, not ended) → pause */
.media-button--play:not([data-paused]):not([data-ended]) .media-icon--pause,
/* Mute: muted → volume off */
.media-button--mute[data-muted] .media-icon--volume-off,
/* Mute: volume low (not muted) → volume low */
.media-button--mute:not([data-muted])[data-volume-level="low"] .media-icon--volume-low,
/* Mute: volume high (not muted, not low) → volume high */
.media-button--mute:not([data-muted]):not([data-volume-level="low"]) .media-icon--volume-high,
/* Fullscreen: not fullscreen → enter */
.media-button--fullscreen:not([data-fullscreen]) .media-icon--fullscreen-enter,
/* Fullscreen: fullscreen → exit */
.media-button--fullscreen[data-fullscreen] .media-icon--fullscreen-exit,
/* Picture-in-Picture: not active → enter */
.media-button--pip:not([data-pip]) .media-icon--pip-enter,
/* Picture-in-Picture: active → exit */
.media-button--pip[data-pip] .media-icon--pip-exit,
/* Cast: not connected → enter */
.media-button--cast:not([data-cast-state="connected"]) .media-icon--cast-enter,
/* Cast: connected → exit */
.media-button--cast[data-cast-state="connected"] .media-icon--cast-exit,
/* Captions: not active → captions off */
.media-button--captions:not([data-active]) .media-icon--captions-off,
/* Captions: active → captions on */
.media-button--captions[data-active] .media-icon--captions-on {
  display: block;
  opacity: 1;
}

/* -------------------------------------------------------------------------- */
/* Global @keyframes for all video skins (CSS & Tailwind)                     */
/* -------------------------------------------------------------------------- */

@keyframes media-shake {
  0%,
  100% {
    translate: 0 0;
  }
  20% {
    translate: -6px 0;
  }
  40% {
    translate: 4px 0;
  }
  60% {
    translate: -2px 0;
  }
  80% {
    translate: 1px 0;
  }
}

@keyframes media-slide-in-forward {
  from {
    translate: -60% 0;
    opacity: 0;
  }
}

@keyframes media-slide-in-backward {
  from {
    translate: 60% 0;
    opacity: 0;
  }
}

@keyframes media-pop-in {
  from {
    scale: 0.8;
    opacity: 0;
  }
}

/* -------------------------------------------------------------------------- */
/* Global @properties for all video skins (CSS & Tailwind)                    */
/* -------------------------------------------------------------------------- */

@property --media-progress-fill {
  syntax: "<percentage>";
  inherits: true;
  initial-value: 0%;
}


/* ==========================================================================
   Root
   ========================================================================== */

.media-default-skin--video {
  --media-spring-timing-function: linear(
    0,
    0.034 1.5%,
    0.763 9.7%,
    1.066 13.9%,
    1.198 19.9%,
    1.184 21.8%,
    0.963 37.5%,
    0.997 50.9%,
    1
  );
  --media-border-color: oklch(0 0 0 / 0.1);
  --media-surface-background-color: oklch(1 0 0 / 0.1);
  --media-surface-inner-border-color: oklch(1 0 0 / 0.05);
  --media-surface-outer-border-color: oklch(0 0 0 / 0.1);
  --media-surface-shadow-color: oklch(0 0 0 / 0.15);
  --media-surface-backdrop-filter: blur(16px) saturate(1.5);
  --media-video-border-radius: var(--media-border-radius, 2rem);
  --media-controls-transition-duration: 100ms;
  --media-controls-transition-timing-function: ease-out;
  --media-error-dialog-transition-duration: 350ms;
  --media-error-dialog-transition-delay: 100ms;
  --media-error-dialog-transition-timing-function: var(--media-spring-timing-function);
  --media-popup-transition-duration: 100ms;
  --media-popup-transition-timing-function: ease-out;
  --media-tooltip-side-offset: 0.75rem;
  --media-tooltip-boundary-offset: 0.5rem;
  --media-popover-side-offset: 0.5rem;
  --media-popover-boundary-offset: 0.5rem;
  background: oklch(0 0 0);

  @media (prefers-reduced-motion: reduce) {
    --media-error-dialog-transition-duration: 50ms;
    --media-error-dialog-transition-delay: 0ms;
    --media-error-dialog-transition-timing-function: ease-out;
    --media-popup-transition-duration: 0ms;
  }

  @media (prefers-color-scheme: dark) {
    --media-border-color: oklch(1 0 0 / 0.15);
  }

  @media (prefers-reduced-transparency: reduce) or (prefers-contrast: more) {
    --media-surface-background-color: oklch(0 0 0);
    --media-surface-inner-border-color: oklch(1 0 0 / 0.25);
    --media-surface-outer-border-color: transparent;
  }

  &:has(.media-controls:not([data-visible])) {
    /* Slight delay to hide controls on non-touch devices after interaction */
    @media (pointer: fine) {
      --media-controls-transition-duration: 300ms;
    }
    @media (pointer: coarse) {
      --media-controls-transition-duration: 150ms;
    }
    @media (prefers-reduced-motion: reduce) {
      --media-controls-transition-duration: 50ms;
    }
  }

  /* Inner border ring */
  &::after {
    position: absolute;
    inset: 0;
    z-index: 10;
    pointer-events: none;
    content: "";
    border-radius: inherit;
    box-shadow: inset 0 0 0 1px var(--media-border-color);
  }

  &:fullscreen {
    --media-border-radius: 0;
  }
}

/* ==========================================================================
   Error Dialog
   ========================================================================== */

.media-default-skin--video .media-error {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
}

.media-default-skin--video .media-error__dialog {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-width: 18rem;
  padding: 0.75rem;
  color: oklch(1 0 0);
  text-shadow: 0 1px 0 oklch(0 0 0 / 0.25);
  border-radius: 1.75rem;
  transition-delay: var(--media-error-dialog-transition-delay);
  transition-timing-function: var(--media-error-dialog-transition-timing-function);
  transition-duration: var(--media-error-dialog-transition-duration);
  transition-property: opacity, scale;
}

.media-default-skin--video .media-error[data-starting-style] .media-error__dialog,
.media-default-skin--video .media-error[data-ending-style] .media-error__dialog {
  opacity: 0;
  scale: 0.5;
}
.media-default-skin--video .media-error[data-ending-style] .media-error__dialog {
  transition-delay: 0ms;
}

.media-default-skin--video .media-error__content {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.5rem 0.5rem 0.375rem;
  text-shadow: inherit;
}

.media-default-skin--video .media-error__title {
  font-size: 1rem;
}

/* ==========================================================================
   Controls (hide/show behavior)
   ========================================================================== */

.media-default-skin--video .media-controls {
  position: absolute;
  inset-inline: 0.5rem;
  bottom: 0.5rem;
  z-index: 10;
  flex-wrap: wrap;
  max-width: 56rem;
  margin-inline: auto;
  color: var(--media-color-primary, oklch(1 0 0));
  transform-origin: bottom;
  transition-timing-function: var(--media-controls-transition-timing-function);
  transition-duration: var(--media-controls-transition-duration);

  @media (pointer: fine) {
    transition-property: scale, filter, opacity;
    will-change: scale, filter, opacity;
  }

  @media (pointer: coarse) {
    transition-property: scale, opacity;
    will-change: scale, opacity;
  }

  &:not([data-visible]) {
    pointer-events: none;
    opacity: 0;
    scale: 0.95;

    @media (pointer: fine) and (prefers-reduced-motion: no-preference) {
      filter: blur(8px);
    }

    @media (prefers-reduced-motion: reduce) {
      scale: 1;
    }
  }

  & .media-time-controls {
    flex: 0 0 100%;
    order: -1;
    padding-inline: 0.625rem;
  }

  & .media-button-group:first-child {
    flex: 1;
    text-align: left;
  }

  & .media-button-group:last-child {
    flex: 1;
    justify-content: end;
  }

  @container media-root (width > 42rem) {
    inset-inline: 0.75rem;
    bottom: 0.75rem;
    flex-wrap: nowrap;
    column-gap: 0.125rem;
    padding: 0.25rem;

    & .media-time-controls {
      flex: 1;
      order: unset;
    }

    & .media-button-group:first-child,
    & .media-button-group:last-child {
      flex: 0 0 auto;
    }
  }
}

.media-default-skin--video .media-error[data-open] ~ .media-controls {
  display: none;
}

/* Hide cursor when controls are hidden */
.media-default-skin--video:has(.media-controls:not([data-visible])) {
  cursor: none;
}

/* ==========================================================================
   Sliders
   ========================================================================== */

.media-default-skin--video .media-slider__track {
  background-color: oklch(1 0 0 / 0.2);
  box-shadow: 0 0 0 1px oklch(0 0 0 / 0.05);
}

.media-default-skin--video .media-slider__preview {
  --media-preview-max-width: 11rem;
  --media-preview-padding: -1.125rem;
  /**
    Inset is the difference between the container width and the slider (100%) width.
    Divided by 2 as we render the time on both sides.
  */
  --media-preview-inset: calc((100cqi - 100%) / 2);

  position: absolute;
  bottom: calc(100% + 1.2rem);
  left: clamp(
    calc(var(--media-preview-max-width) / 2 + var(--media-preview-padding) - var(--media-preview-inset)),
    var(--media-slider-pointer),
    calc(100% - var(--media-preview-max-width) / 2 - var(--media-preview-padding) + var(--media-preview-inset))
  );
  pointer-events: none;
  opacity: 0;
  filter: blur(8px);
  transform-origin: bottom;
  scale: 0.8;
  translate: -50%;
  transition-timing-function: ease-out;
  transition-duration: 150ms;
  transition-property: scale, opacity, filter;

  & .media-preview__thumbnail {
    max-width: var(--media-preview-max-width);
  }

  &:has(.media-preview__thumbnail[data-loading]) {
    max-height: 6rem;
  }
}
.media-default-skin--video .media-slider[data-pointing] .media-slider__preview:has([role="img"]:not([data-hidden])) {
  opacity: 1;
  filter: blur(0);
  scale: 1;
}

`;

// node_modules/@videojs/html/dist/dev/define/video/skin.js
var SEEK_TIME = 10;
function getTemplateHTML() {
  return `
    <media-container class="media-default-skin media-default-skin--video">
      <!-- @deprecated slot="media" is no longer required, use the default slot instead -->
      <slot name="media"></slot>
      <slot></slot>

      <media-poster>
        <slot name="poster"></slot>
      </media-poster>

      <media-buffering-indicator class="media-buffering-indicator">
        <div class="media-surface">
          ${renderIcon("spinner", { class: "media-icon" })}
        </div>
      </media-buffering-indicator>

      <media-error-dialog class="media-error">
        <div class="media-error__dialog media-surface">
          <div class="media-error__content">
            <media-alert-dialog-title class="media-error__title">Something went wrong.</media-alert-dialog-title>
            <media-alert-dialog-description class="media-error__description"></media-alert-dialog-description>
          </div>
          <div class="media-error__actions">
            <media-alert-dialog-close class="media-button media-button--primary">OK</media-alert-dialog-close>
          </div>
        </div>
      </media-error-dialog>

      <media-controls class="media-surface media-controls">
        <media-tooltip-group>
          <div class="media-button-group">
            <media-play-button commandfor="play-tooltip" class="media-button media-button--subtle media-button--icon media-button--play">
              ${renderIcon("restart", { class: "media-icon media-icon--restart" })}
              ${renderIcon("play", { class: "media-icon media-icon--play" })}
              ${renderIcon("pause", { class: "media-icon media-icon--pause" })}
            </media-play-button>
            <media-tooltip id="play-tooltip" side="top" class="media-surface media-tooltip"></media-tooltip>

            <media-seek-button commandfor="seek-backward-tooltip" seconds="${-SEEK_TIME}" class="media-button media-button--subtle media-button--icon media-button--seek">
              <span class="media-icon__container">
                ${renderIcon("seek", { class: "media-icon media-icon--flipped" })}
                <span class="media-icon__label">${SEEK_TIME}</span>
              </span>
            </media-seek-button>
            <media-tooltip id="seek-backward-tooltip" side="top" class="media-surface media-tooltip"></media-tooltip>

            <media-seek-button commandfor="seek-forward-tooltip" seconds="${SEEK_TIME}" class="media-button media-button--subtle media-button--icon media-button--seek">
              <span class="media-icon__container">
                ${renderIcon("seek", { class: "media-icon" })}
                <span class="media-icon__label">${SEEK_TIME}</span>
              </span>
            </media-seek-button>
            <media-tooltip id="seek-forward-tooltip" side="top" class="media-surface media-tooltip"></media-tooltip>
          </div>

          <div class="media-time-controls">
            <media-time type="current" class="media-time"></media-time>
            <media-time-slider class="media-slider">
              <media-slider-track class="media-slider__track">
                <media-slider-fill class="media-slider__fill"></media-slider-fill>
                <media-slider-buffer class="media-slider__buffer"></media-slider-buffer>
              </media-slider-track>
              <media-slider-thumb class="media-slider__thumb"></media-slider-thumb>

              <div class="media-surface media-preview media-slider__preview">
                <media-slider-thumbnail class="media-preview__thumbnail"></media-slider-thumbnail>
                <media-slider-value type="pointer" class="media-time media-preview__time"></media-slider-value>
                ${renderIcon("spinner", { class: "media-preview__spinner media-icon" })}
              </div>
            </media-time-slider>
            <media-time type="duration" class="media-time"></media-time>
          </div>

          <div class="media-button-group">
            <media-playback-rate-menu-trigger commandfor="playback-rate-menu" class="media-button media-button--subtle media-button--icon media-button--playback-rate"></media-playback-rate-menu-trigger>
            <media-playback-rate-menu id="playback-rate-menu" side="top" align="center" class="media-surface media-popover media-menu media-menu--playback-rate">
              <media-playback-rate-options class="media-menu__group">
                <template>
                  <media-menu-radio-item class="media-menu__item">
                    <span data-part="label"></span>
                    <media-menu-item-indicator force-mount class="media-menu__indicator">
                      ${renderIcon("check", { class: "media-icon" })}
                    </media-menu-item-indicator>
                  </media-menu-radio-item>
                </template>
              </media-playback-rate-options>
            </media-playback-rate-menu>

            <media-mute-button commandfor="video-volume-popover" class="media-button media-button--subtle media-button--icon media-button--mute">
              ${renderIcon("volume-off", { class: "media-icon media-icon--volume-off" })}
              ${renderIcon("volume-low", { class: "media-icon media-icon--volume-low" })}
              ${renderIcon("volume-high", { class: "media-icon media-icon--volume-high" })}
            </media-mute-button>

            <media-popover id="video-volume-popover" open-on-hover delay="200" close-delay="100" side="top" class="media-surface media-popover media-popover--volume">
              <media-volume-slider class="media-slider" orientation="vertical" thumb-alignment="edge">
                <media-slider-track class="media-slider__track">
                  <media-slider-fill class="media-slider__fill"></media-slider-fill>
                </media-slider-track>
                <media-slider-thumb class="media-slider__thumb media-slider__thumb--persistent"></media-slider-thumb>
              </media-volume-slider>
            </media-popover>

            <media-captions-button commandfor="captions-tooltip" class="media-button media-button--subtle media-button--icon media-button--captions">
              ${renderIcon("captions-off", { class: "media-icon media-icon--captions-off" })}
              ${renderIcon("captions-on", { class: "media-icon media-icon--captions-on" })}
            </media-captions-button>
            <media-tooltip id="captions-tooltip" side="top" class="media-surface media-tooltip"></media-tooltip>

            <media-cast-button commandfor="cast-tooltip" class="media-button media-button--subtle media-button--icon media-button--cast">
              ${renderIcon("cast-enter", { class: "media-icon media-icon--cast-enter" })}
              ${renderIcon("cast-exit", { class: "media-icon media-icon--cast-exit" })}
            </media-cast-button>
            <media-tooltip id="cast-tooltip" side="top" class="media-surface media-tooltip"></media-tooltip>

            <media-pip-button commandfor="pip-tooltip" class="media-button media-button--subtle media-button--icon media-button--pip">
              ${renderIcon("pip-enter", { class: "media-icon media-icon--pip-enter" })}
              ${renderIcon("pip-exit", { class: "media-icon media-icon--pip-exit" })}
            </media-pip-button>
            <media-tooltip id="pip-tooltip" side="top" class="media-surface media-tooltip"></media-tooltip>

            <media-fullscreen-button commandfor="fullscreen-tooltip" class="media-button media-button--subtle media-button--icon media-button--fullscreen">
              ${renderIcon("fullscreen-enter", { class: "media-icon media-icon--fullscreen-enter" })}
              ${renderIcon("fullscreen-exit", { class: "media-icon media-icon--fullscreen-exit" })}
            </media-fullscreen-button>
            <media-tooltip id="fullscreen-tooltip" side="top" class="media-surface media-tooltip"></media-tooltip>
          </div>
        </media-tooltip-group>
      </media-controls>

      <div class="media-overlay"></div>

      <!-- Hotkeys -->
      <media-hotkey keys="Space" action="togglePaused"></media-hotkey>
      <media-hotkey keys="k" action="togglePaused"></media-hotkey>
      <media-hotkey keys="m" action="toggleMuted"></media-hotkey>
      <media-hotkey keys="f" action="toggleFullscreen"></media-hotkey>
      <media-hotkey keys="c" action="toggleSubtitles"></media-hotkey>
      <media-hotkey keys="i" action="togglePictureInPicture"></media-hotkey>
      <media-hotkey keys="ArrowRight" action="seekStep" value="5"></media-hotkey>
      <media-hotkey keys="ArrowLeft" action="seekStep" value="-5"></media-hotkey>
      <media-hotkey keys="l" action="seekStep" value="10"></media-hotkey>
      <media-hotkey keys="j" action="seekStep" value="-10"></media-hotkey>
      <media-hotkey keys="ArrowUp" action="volumeStep" value="0.05"></media-hotkey>
      <media-hotkey keys="ArrowDown" action="volumeStep" value="-0.05"></media-hotkey>
      <media-hotkey keys="0-9" action="seekToPercent"></media-hotkey>
      <media-hotkey keys="Home" action="seekToPercent" value="0"></media-hotkey>
      <media-hotkey keys="End" action="seekToPercent" value="100"></media-hotkey>
      <media-hotkey keys=">" action="speedUp"></media-hotkey>
      <media-hotkey keys="<" action="speedDown"></media-hotkey>

      <!-- Gestures -->
      <media-gesture type="tap" action="togglePaused" pointer="mouse" region="center"></media-gesture>
      <media-gesture type="tap" action="toggleControls" pointer="touch"></media-gesture>
      <media-gesture type="doubletap" action="seekStep" value="-10" region="left"></media-gesture>
      <media-gesture type="doubletap" action="toggleFullscreen" region="center"></media-gesture>
      <media-gesture type="doubletap" action="seekStep" value="10" region="right"></media-gesture>

      <!-- Input Feedback -->
      <media-status-announcer></media-status-announcer>
      <div class="media-input-feedback">
        <media-volume-indicator hidden class="media-surface media-input-feedback-island media-input-feedback-island--volume">
          <media-volume-indicator-fill class="media-input-feedback-island__content">
            ${renderIcon("volume-high", { class: "media-icon media-icon--volume-high" })}
            ${renderIcon("volume-low", { class: "media-icon media-icon--volume-low" })}
            ${renderIcon("volume-off", { class: "media-icon media-icon--volume-off" })}
            <media-volume-indicator-value class="media-input-feedback-island__value"></media-volume-indicator-value>
          </media-volume-indicator-fill>
        </media-volume-indicator>
        <media-status-indicator
          hidden
          actions="toggleSubtitles toggleFullscreen togglePictureInPicture"
          class="media-surface media-input-feedback-island media-input-feedback-island--status"
        >
          <div class="media-input-feedback-island__content">
            ${renderIcon("captions-on", { class: "media-icon media-icon--captions-on" })}
            ${renderIcon("captions-off", { class: "media-icon media-icon--captions-off" })}
            ${renderIcon("fullscreen-enter", { class: "media-icon media-icon--fullscreen-enter" })}
            ${renderIcon("fullscreen-exit", { class: "media-icon media-icon--fullscreen-exit" })}
            ${renderIcon("pip-enter", { class: "media-icon media-icon--pip-enter" })}
            ${renderIcon("pip-exit", { class: "media-icon media-icon--pip-exit" })}
            <media-status-indicator-value class="media-input-feedback-island__value"></media-status-indicator-value>
          </div>
        </media-status-indicator>
        <media-seek-indicator hidden class="media-input-feedback-bubble">
          ${renderIcon("chevron", { class: "media-icon media-icon--seek" })}
          <media-seek-indicator-value class="media-time"></media-seek-indicator-value>
        </media-seek-indicator>
        <media-status-indicator hidden actions="togglePaused" class="media-input-feedback-bubble">
          ${renderIcon("play", { class: "media-icon media-icon--play" })}
          ${renderIcon("pause", { class: "media-icon media-icon--pause" })}
        </media-status-indicator>
      </div>
    </media-container>
  `;
}
var VideoSkinElement = class extends SkinElement {
  static {
    this.tagName = "video-skin";
  }
  static {
    this.styles = createShadowStyle(skin_default);
  }
  static {
    this.template = createTemplate(getTemplateHTML());
  }
};
safeDefine(VideoSkinElement);
