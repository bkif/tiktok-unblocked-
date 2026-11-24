import { ALLOWED_DOMAIN_SUFFIXES, VERCEL_PAYLOAD_LIMIT_BYTES } from "./config";

/**
 * Generates the self-contained client-side runtime shim injected into proxied
 * HTML <head> so dynamic TikTok/ByteDance requests and uploads stay inside the
 * Vercel proxy tunnel.
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

  function isAllowedHost(host) {
    if (!host || typeof host !== "string") return false;
    var h = host.toLowerCase().split(":")[0];
    for (var i = 0; i < ALLOWED_SUFFIXES.length; i++) {
      var s = ALLOWED_SUFFIXES[i];
      if (h === s || h.endsWith("." + s)) return true;
    }
    return false;
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

  function showUploadLimitWarning(fileSizeBytes, fileName) {
    try {
      var existing = document.getElementById("tt-gateway-upload-pill");
      if (existing) existing.remove();

      var mb = (fileSizeBytes / (1024 * 1024)).toFixed(2);
      var pill = document.createElement("div");
      pill.id = "tt-gateway-upload-pill";
      pill.setAttribute("role", "status");
      pill.style.cssText = [
        "position:fixed",
        "bottom:16px",
        "right:16px",
        "z-index:2147483647",
        "max-width:360px",
        "background:rgba(18,18,22,0.94)",
        "color:#fff",
        "border:1px solid rgba(254,44,85,0.55)",
        "border-radius:9999px",
        "padding:10px 16px",
        "font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif",
        "font-size:12px",
        "line-height:1.4",
        "display:flex",
        "align-items:center",
        "gap:10px",
        "box-shadow:0 8px 24px rgba(0,0,0,0.35)",
        "backdrop-filter:blur(8px)"
      ].join(";");

      var text = document.createElement("span");
      var label = fileName ? '"' + fileName + '" (' + mb + " MB)" : mb + " MB payload";
      text.textContent =
        "Gateway notice: " +
        label +
        " exceeds Vercel's 4.5 MB serverless body limit and may fail during proxied upload.";

      var closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.textContent = "Dismiss";
      closeBtn.style.cssText = [
        "background:#fe2c55",
        "color:#fff",
        "border:none",
        "border-radius:9999px",
        "padding:4px 10px",
        "font-size:11px",
        "font-weight:600",
        "cursor:pointer",
        "flex-shrink:0"
      ].join(";");
      closeBtn.onclick = function () {
        pill.remove();
      };

      pill.appendChild(text);
      pill.appendChild(closeBtn);
      (document.body || document.documentElement).appendChild(pill);
    } catch (_) {}
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

  // 1. Patch window.fetch
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

  // 2. Patch XMLHttpRequest.prototype.open & send
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

  // 3. Patch navigator.sendBeacon
  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    var origBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url, data) {
      return origBeacon(rewriteUrl(String(url)), data);
    };
  }

  // 4. Patch Worker
  if (typeof window.Worker === "function") {
    var OrigWorker = window.Worker;
    window.Worker = function (scriptURL, options) {
      var target = typeof scriptURL === "string" ? rewriteUrl(scriptURL) : rewriteUrl(String(scriptURL));
      return options ? new OrigWorker(target, options) : new OrigWorker(target);
    };
    window.Worker.prototype = OrigWorker.prototype;
  }

  // 5. Patch window.open
  if (typeof window.open === "function") {
    var origWindowOpen = window.open;
    window.open = function (url, target, features) {
      var nextUrl = typeof url === "string" ? rewriteUrl(url) : url;
      return origWindowOpen.call(this, nextUrl, target, features);
    };
  }

  // 6. Patch DOM src / href setters & setAttribute
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
      if ((lower === "src" || lower === "href") && typeof value === "string") {
        value = rewriteUrl(value);
      }
      return origSetAttr.call(this, name, value);
    };
  }

  // 7. Monitor file input selection for > 4.5 MB video files
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
  }
})();
</script>`;
}
