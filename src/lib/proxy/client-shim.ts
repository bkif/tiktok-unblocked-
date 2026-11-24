import { ALLOWED_DOMAIN_SUFFIXES, VERCEL_PAYLOAD_LIMIT_BYTES } from "./config";

/**
 * Generates the self-contained client-side runtime shim injected into proxied
 * HTML <head> so dynamic TikTok/ByteDance requests, cross-frame postMessage
 * handshakes, modal fallback controls, and uploads stay inside the Vercel proxy tunnel.
 */
export function buildClientShimScript(): string {
  const suffixesJson = JSON.stringify(ALLOWED_DOMAIN_SUFFIXES);
  const limitBytes = VERCEL_PAYLOAD_LIMIT_BYTES;

  return `<script data-tt-gateway-shim="1">
(function () {
  if (typeof window === "undefined" || window.__TT_GATEWAY_SHIM__) return;
  window.__TT_GATEWAY_SHIM__ = true;

  var ALLOWED_SUFFIXES = ${suffixesJson};
  var UPLOAD_LIMIT_BYTES = ${limitBytes};
  var PROXY_PREFIX = "/_proxy/";
  var PILL_ID = "tt-gateway-status-pill";

  function isAllowedHost(host) {
    if (!host || typeof host !== "string") return false;
    var h = host.toLowerCase().split(":")[0];
    for (var i = 0; i < ALLOWED_SUFFIXES.length; i++) {
      var s = ALLOWED_SUFFIXES[i];
      if (h === s || h.endsWith("." + s)) return true;
    }
    return false;
  }

  function isTikTokOriginString(value) {
    if (typeof value !== "string" || !value || value === "*") return false;
    try {
      var parsed = new URL(value);
      return isAllowedHost(parsed.hostname);
    } catch (_) {
      return false;
    }
  }

  function rewriteUrl(input) {
    if (typeof input !== "string" || !input) return input;
    var trimmed = input.trim();
    if (
      trimmed.startsWith("data:") ||
      trimmed.startsWith("blob:") ||
      trimmed.startsWith("javascript:") ||
      trimmed.startsWith("about:") ||
      trimmed.startsWith("#")
    ) {
      return input;
    }
    if (trimmed.startsWith(PROXY_PREFIX)) {
      return input;
    }
    try {
      var origin = window.location.origin;
      if (trimmed.startsWith(origin + PROXY_PREFIX)) {
        return input;
      }
      var normalized = trimmed.startsWith("//") ? "https:" + trimmed : trimmed;
      if (!/^https?:\\/\\//i.test(normalized)) {
        return input;
      }
      var parsed = new URL(normalized);
      if (parsed.origin === origin) {
        return input;
      }
      if (isAllowedHost(parsed.hostname)) {
        return PROXY_PREFIX + parsed.hostname + parsed.pathname + parsed.search + parsed.hash;
      }
    } catch (_) {
      return input;
    }
    return input;
  }

  function rewriteHistoryUrl(url) {
    if (typeof url !== "string" || !url) return url;
    try {
      var normalized = url.startsWith("//") ? "https:" + url : url;
      if (!/^https?:\\/\\//i.test(normalized)) return url;
      var parsed = new URL(normalized);
      if (parsed.origin === window.location.origin) return url;
      if (isAllowedHost(parsed.hostname)) {
        var host = parsed.hostname.toLowerCase();
        if (host === "www.tiktok.com" || host === "m.tiktok.com") {
          return (parsed.pathname || "/") + parsed.search + parsed.hash;
        }
        return PROXY_PREFIX + host + parsed.pathname + parsed.search + parsed.hash;
      }
    } catch (_) {}
    return url;
  }

  function forceCloseStuckModals() {
    try {
      var selectors = [
        '[role="dialog"]',
        '[id*="login"]',
        '[class*="Modal"]',
        '[class*="modal"]',
        '[data-e2e="modal-close-inner-button"]'
      ];
      var nodes = document.querySelectorAll(selectors.join(","));
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (!el || el.id === PILL_ID || (el.closest && el.closest("#" + PILL_ID))) {
          continue;
        }
        el.remove();
      }
      var allFixed = document.querySelectorAll("div, section");
      for (var j = 0; j < allFixed.length; j++) {
        var box = allFixed[j];
        if (!box || box.id === PILL_ID) continue;
        var style = window.getComputedStyle ? window.getComputedStyle(box) : null;
        if (
          style &&
          style.position === "fixed" &&
          parseInt(style.zIndex || "0", 10) >= 1000 &&
          box.offsetWidth >= window.innerWidth * 0.8 &&
          box.offsetHeight >= window.innerHeight * 0.8
        ) {
          box.remove();
        }
      }
      if (document.body) {
        document.body.style.overflow = "auto";
        document.body.style.pointerEvents = "auto";
      }
      if (document.documentElement) {
        document.documentElement.style.overflow = "auto";
      }
    } catch (_) {}
  }

  function ensureGatewayPill(warningText) {
    try {
      if (window.top !== window) return null;
      var root = document.body || document.documentElement;
      if (!root) return null;

      var pill = document.getElementById(PILL_ID);
      if (!pill) {
        pill = document.createElement("div");
        pill.id = PILL_ID;
        pill.setAttribute("role", "status");
        pill.style.cssText = [
          "position:fixed",
          "bottom:14px",
          "right:14px",
          "z-index:2147483647",
          "max-width:440px",
          "background:rgba(18,18,22,0.92)",
          "color:#fff",
          "border:1px solid rgba(255,255,255,0.16)",
          "border-radius:9999px",
          "padding:6px 10px 6px 12px",
          "font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif",
          "font-size:11px",
          "line-height:1.35",
          "display:flex",
          "align-items:center",
          "gap:8px",
          "box-shadow:0 8px 24px rgba(0,0,0,0.35)",
          "backdrop-filter:blur(8px)"
        ].join(";");

        var textSpan = document.createElement("span");
        textSpan.id = PILL_ID + "-text";
        textSpan.textContent = "Gateway active";
        textSpan.style.cssText = "opacity:0.9;";

        var unblockBtn = document.createElement("button");
        unblockBtn.type = "button";
        unblockBtn.textContent = "Débloquer / Fermer popup";
        unblockBtn.style.cssText = [
          "background:rgba(255,255,255,0.14)",
          "color:#fff",
          "border:1px solid rgba(255,255,255,0.22)",
          "border-radius:9999px",
          "padding:3px 9px",
          "font-size:11px",
          "font-weight:600",
          "cursor:pointer",
          "flex-shrink:0"
        ].join(";");
        unblockBtn.onclick = function () {
          forceCloseStuckModals();
        };

        var closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.textContent = "×";
        closeBtn.setAttribute("aria-label", "Dismiss gateway pill");
        closeBtn.style.cssText = [
          "background:#fe2c55",
          "color:#fff",
          "border:none",
          "border-radius:9999px",
          "width:20px",
          "height:20px",
          "line-height:20px",
          "text-align:center",
          "font-size:13px",
          "font-weight:700",
          "cursor:pointer",
          "padding:0",
          "flex-shrink:0"
        ].join(";");
        closeBtn.onclick = function () {
          pill.remove();
        };

        pill.appendChild(textSpan);
        pill.appendChild(unblockBtn);
        pill.appendChild(closeBtn);
        root.appendChild(pill);
      }

      if (warningText) {
        pill.style.borderColor = "rgba(254,44,85,0.75)";
        var label = document.getElementById(PILL_ID + "-text");
        if (label) {
          label.textContent = warningText;
        }
      }
      return pill;
    } catch (_) {
      return null;
    }
  }

  function showUploadLimitWarning(fileSizeBytes, fileName) {
    var mb = (fileSizeBytes / (1024 * 1024)).toFixed(2);
    var label = fileName ? '"' + fileName + '" (' + mb + " MB)" : mb + " MB payload";
    ensureGatewayPill(
      "Upload notice: " + label + " exceeds Vercel's 4.5 MB limit."
    );
  }

  function inspectBodySize(body) {
    if (!body) return;
    try {
      if (typeof Blob !== "undefined" && body instanceof Blob) {
        if (body.size > UPLOAD_LIMIT_BYTES) {
          showUploadLimitWarning(body.size, body.name || "");
        }
        return;
      }
      if (typeof ArrayBuffer !== "undefined" && body instanceof ArrayBuffer) {
        if (body.byteLength > UPLOAD_LIMIT_BYTES) {
          showUploadLimitWarning(body.byteLength, "");
        }
        return;
      }
      if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(body)) {
        if (body.byteLength > UPLOAD_LIMIT_BYTES) {
          showUploadLimitWarning(body.byteLength, "");
        }
        return;
      }
      if (typeof FormData !== "undefined" && body instanceof FormData) {
        var total = 0;
        var largestName = "";
        body.forEach(function (val) {
          if (typeof Blob !== "undefined" && val instanceof Blob) {
            total += val.size;
            if (!largestName && val.name) largestName = val.name;
          } else if (typeof val === "string") {
            total += val.length;
          }
        });
        if (total > UPLOAD_LIMIT_BYTES) {
          showUploadLimitWarning(total, largestName);
        }
      }
    } catch (_) {}
  }

  // 1. Bridge cross-frame postMessage & MessageEvent.origin for TikTok modals
  function normalizeTargetOrigin(targetOriginOrOptions) {
    var localOrigin = window.location.origin && window.location.origin !== "null"
      ? window.location.origin
      : "*";
    if (typeof targetOriginOrOptions === "string") {
      if (isTikTokOriginString(targetOriginOrOptions)) {
        return localOrigin;
      }
      return targetOriginOrOptions;
    }
    if (
      targetOriginOrOptions &&
      typeof targetOriginOrOptions === "object" &&
      typeof targetOriginOrOptions.targetOrigin === "string" &&
      isTikTokOriginString(targetOriginOrOptions.targetOrigin)
    ) {
      var cloned = {};
      for (var k in targetOriginOrOptions) {
        if (Object.prototype.hasOwnProperty.call(targetOriginOrOptions, k)) {
          cloned[k] = targetOriginOrOptions[k];
        }
      }
      cloned.targetOrigin = localOrigin;
      return cloned;
    }
    return targetOriginOrOptions;
  }

  function wrapPostMessageFn(origFn) {
    return function (message, targetOriginOrOptions, transfer) {
      var rewrittenTarget = normalizeTargetOrigin(targetOriginOrOptions);
      if (arguments.length >= 3) {
        return origFn.call(this, message, rewrittenTarget, transfer);
      }
      if (arguments.length === 2) {
        return origFn.call(this, message, rewrittenTarget);
      }
      return origFn.call(this, message);
    };
  }

  if (typeof Window !== "undefined" && Window.prototype && typeof Window.prototype.postMessage === "function") {
    var origProtoPostMessage = Window.prototype.postMessage;
    Window.prototype.postMessage = wrapPostMessageFn(origProtoPostMessage);
  }
  if (typeof window.postMessage === "function") {
    try {
      var origWinPostMessage = window.postMessage;
      window.postMessage = wrapPostMessageFn(origWinPostMessage);
    } catch (_) {}
  }
  try {
    if (window.parent && window.parent !== window && typeof window.parent.postMessage === "function") {
      var origParentPostMessage = window.parent.postMessage;
      window.parent.postMessage = wrapPostMessageFn(origParentPostMessage);
    }
  } catch (_) {}
  try {
    if (window.top && window.top !== window && typeof window.top.postMessage === "function") {
      var origTopPostMessage = window.top.postMessage;
      window.top.postMessage = wrapPostMessageFn(origTopPostMessage);
    }
  } catch (_) {}

  if (typeof MessageEvent !== "undefined") {
    try {
      var originDesc = Object.getOwnPropertyDescriptor(MessageEvent.prototype, "origin");
      if (originDesc && originDesc.configurable && typeof originDesc.get === "function") {
        var origOriginGet = originDesc.get;
        Object.defineProperty(MessageEvent.prototype, "origin", {
          configurable: true,
          enumerable: originDesc.enumerable,
          get: function () {
            var realOrigin = origOriginGet.call(this);
            if (realOrigin === window.location.origin) {
              try {
                var srcPath = this.source && this.source.location && this.source.location.pathname;
                if (typeof srcPath === "string" && srcPath.indexOf(PROXY_PREFIX) === 0) {
                  var proxyHost = srcPath.slice(PROXY_PREFIX.length).split("/")[0];
                  if (proxyHost && isAllowedHost(proxyHost)) {
                    return "https://" + proxyHost;
                  }
                }
              } catch (_) {}
              return "https://www.tiktok.com";
            }
            return realOrigin;
          }
        });
      }
    } catch (_) {}
  }

  // 2. Patch window.fetch
  if (typeof window.fetch === "function") {
    var origFetch = window.fetch;
    window.fetch = function (input, init) {
      try {
        if (init && init.body) {
          inspectBodySize(init.body);
        }
        if (typeof input === "string") {
          input = rewriteUrl(input);
        } else if (input instanceof URL) {
          input = rewriteUrl(input.toString());
        } else if (typeof Request !== "undefined" && input instanceof Request) {
          var rewritten = rewriteUrl(input.url);
          if (rewritten !== input.url) {
            input = new Request(rewritten, input);
          }
        }
      } catch (_) {}
      return origFetch.call(this, input, init);
    };
  }

  // 3. Patch XMLHttpRequest.prototype.open & send
  if (typeof XMLHttpRequest !== "undefined") {
    var origOpen = XMLHttpRequest.prototype.open;
    var origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      var args = Array.prototype.slice.call(arguments);
      if (typeof url === "string") {
        args[1] = rewriteUrl(url);
      } else if (url && typeof url.toString === "function") {
        args[1] = rewriteUrl(url.toString());
      }
      return origOpen.apply(this, args);
    };
    XMLHttpRequest.prototype.send = function (body) {
      if (body) inspectBodySize(body);
      return origSend.apply(this, arguments);
    };
  }

  // 4. Patch navigator.sendBeacon
  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    var origBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url, data) {
      return origBeacon(rewriteUrl(String(url)), data);
    };
  }

  // 5. Patch Worker
  if (typeof window.Worker === "function") {
    var OrigWorker = window.Worker;
    window.Worker = function (scriptURL, options) {
      var target = typeof scriptURL === "string" ? rewriteUrl(scriptURL) : rewriteUrl(String(scriptURL));
      return options ? new OrigWorker(target, options) : new OrigWorker(target);
    };
    window.Worker.prototype = OrigWorker.prototype;
  }

  // 6. Patch window.open & History API
  if (typeof window.open === "function") {
    var origWindowOpen = window.open;
    window.open = function (url, target, features) {
      var nextUrl = typeof url === "string" ? rewriteUrl(url) : url;
      return origWindowOpen.call(this, nextUrl, target, features);
    };
  }

  if (typeof window.history !== "undefined") {
    if (typeof window.history.pushState === "function") {
      var origPushState = window.history.pushState;
      window.history.pushState = function (state, unused, url) {
        return origPushState.call(this, state, unused, rewriteHistoryUrl(url));
      };
    }
    if (typeof window.history.replaceState === "function") {
      var origReplaceState = window.history.replaceState;
      window.history.replaceState = function (state, unused, url) {
        return origReplaceState.call(this, state, unused, rewriteHistoryUrl(url));
      };
    }
  }

  // 7. Patch DOM src / href setters & setAttribute (and strip SRI integrity)
  function patchProp(proto, prop) {
    if (!proto) return;
    var desc = Object.getOwnPropertyDescriptor(proto, prop);
    if (!desc || !desc.set || !desc.get) return;
    Object.defineProperty(proto, prop, {
      configurable: true,
      enumerable: desc.enumerable,
      get: function () {
        return desc.get.call(this);
      },
      set: function (val) {
        return desc.set.call(this, typeof val === "string" ? rewriteUrl(val) : val);
      }
    });
  }

  if (typeof HTMLScriptElement !== "undefined") patchProp(HTMLScriptElement.prototype, "src");
  if (typeof HTMLImageElement !== "undefined") patchProp(HTMLImageElement.prototype, "src");
  if (typeof HTMLVideoElement !== "undefined") patchProp(HTMLVideoElement.prototype, "src");
  if (typeof HTMLAudioElement !== "undefined") patchProp(HTMLAudioElement.prototype, "src");
  if (typeof HTMLSourceElement !== "undefined") patchProp(HTMLSourceElement.prototype, "src");
  if (typeof HTMLIFrameElement !== "undefined") patchProp(HTMLIFrameElement.prototype, "src");
  if (typeof HTMLLinkElement !== "undefined") patchProp(HTMLLinkElement.prototype, "href");

  if (typeof Element !== "undefined" && Element.prototype.setAttribute) {
    var origSetAttr = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name, value) {
      var lower = typeof name === "string" ? name.toLowerCase() : "";
      if (lower === "integrity" || lower === "crossorigin") {
        return;
      }
      if ((lower === "src" || lower === "href") && typeof value === "string") {
        value = rewriteUrl(value);
      }
      return origSetAttr.call(this, name, value);
    };
  }

  // 8. Monitor file input selection & initialize floating gateway status pill
  if (typeof document !== "undefined") {
    document.addEventListener(
      "change",
      function (event) {
        var target = event.target;
        if (!target || target.tagName !== "INPUT" || target.type !== "file" || !target.files) {
          return;
        }
        for (var i = 0; i < target.files.length; i++) {
          var file = target.files[i];
          if (file && file.size > UPLOAD_LIMIT_BYTES) {
            showUploadLimitWarning(file.size, file.name);
            break;
          }
        }
      },
      true
    );

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        ensureGatewayPill(null);
      });
    } else {
      ensureGatewayPill(null);
    }
  }
})();
</script>`;
}
