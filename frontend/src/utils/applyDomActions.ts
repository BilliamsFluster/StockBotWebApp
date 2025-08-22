// utils/applyDomActions.ts
import type { DomAction } from "@/api/jarvisApi"; // adjust path if needed

/* ---------------- basics ---------------- */

function qs(sel: string): Element | null {
  try { return document.querySelector(sel); } catch { return null; }
}

function toKebab(s: string) {
  // turn backgroundColor -> background-color
  return s.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
}

function applyStyleProps(el: HTMLElement, style: Record<string, string>) {
  for (const [rawKey, rawVal] of Object.entries(style || {})) {
    if (rawVal == null) continue;
    const key = String(rawKey).trim();
    let val = String(rawVal).trim();

    // Replace obvious placeholders the model might emit
    if (!val || /^(new_?color|<.*?>|tbd|null|undefined)$/i.test(val)) {
      val = "magenta";
    }

    // Normalize property name to kebab-case for setProperty
    const prop = key.includes("-") ? key : toKebab(key);

    try {
      // Skip obviously invalid values when possible
      if (typeof (window as any).CSS?.supports === "function") {
        if (!(window as any).CSS.supports(prop, val)) continue;
      }
      el.style.setProperty(prop, val);
    } catch {
      // swallow; bad property/value combinations shouldn't break the whole plan
    }
  }
}

function waitForSelector(selector: string, timeoutMs = 5000): Promise<Element> {
  return new Promise((resolve, reject) => {
    try {
      const immediate = qs(selector);
      if (immediate) return resolve(immediate);

      const obs = new MutationObserver(() => {
        const el = qs(selector);
        if (el) {
          obs.disconnect();
          clearTimeout(timer);
          resolve(el);
        }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });

      const timer = window.setTimeout(() => {
        obs.disconnect();
        reject(new Error(`timeout waiting for ${selector}`));
      }, timeoutMs);
    } catch (e) {
      reject(e as any);
    }
  });
}

/* ---------- smart scroll helpers ---------- */

function getDefaultScroller(): Element & { scrollTop: number; scrollHeight: number; clientHeight: number } {
  return (document.scrollingElement || document.documentElement || document.body) as any;
}

function isScrollable(el: Element) {
  const s = getComputedStyle(el);
  return /(auto|scroll)/i.test(s.overflowY || s.overflow);
}

function getScrollContainer(start?: Element | null) {
  let el: Element | null | undefined = start || document.activeElement || null;
  while (el && el !== document.body) {
    if (isScrollable(el) && (el as any).scrollHeight > (el as any).clientHeight) return el as any;
    el = el.parentElement;
  }
  // common app shells
  const candidates = [
    document.querySelector("[data-scroll-container]"),
    document.querySelector("#__next"),
    document.querySelector("#root"),
    document.querySelector("main[role='main']"),
    document.querySelector("main"),
  ].filter(Boolean) as Element[];
  for (const c of candidates) {
    if ((c as any).scrollHeight > (c as any).clientHeight) return c as any;
  }
  return getDefaultScroller();
}

/* ---------- click & navigate helpers ---------- */

function dispatchRealClick(el: HTMLElement) {
  const opts: any = { bubbles: true, cancelable: true, composed: true, view: window, button: 0 };
  try { el.dispatchEvent(new PointerEvent("pointerdown", opts)); } catch {}
  try { el.dispatchEvent(new MouseEvent("mousedown", opts)); } catch {}
  (el as HTMLElement).focus?.();
  try { el.dispatchEvent(new MouseEvent("mouseup", opts)); } catch {}
  try { el.dispatchEvent(new MouseEvent("click", opts)); } catch {}
}

function forceNavigateIfAnchor(el: Element) {
  const a = (el.closest?.("a") as HTMLAnchorElement) || (el as HTMLAnchorElement);
  if (a && a.tagName === "A" && a.href) {
    const before = location.href;
    // give SPA router a chance; then hard navigate if nothing changed
    setTimeout(() => {
      if (location.href === before) location.assign(a.href);
    }, 120);
  }
}

function normalizePath(href: string) {
  try {
    const u = new URL(href, location.origin);
    // collapse duplicate slashes & drop trailing slash (except root)
    let p = u.pathname.replace(/\/{2,}/g, "/");
    if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
    return p + u.search + u.hash;
  } catch {
    return href;
  }
}

function findAnchorByTarget(target: string): HTMLAnchorElement | null {
  const t = target.trim();
  const tNorm = normalizePath(t);

  // 1) exact href match (attr or absolute)
  const anchors = Array.from(document.querySelectorAll("a")) as HTMLAnchorElement[];
  let el = anchors.find((x) => {
    const attr = x.getAttribute("href") || "";
    return normalizePath(attr) === tNorm || normalizePath(x.href) === tNorm;
  });
  if (el) return el;

  // 2) partial path match
  el = anchors.find((x) => normalizePath(x.getAttribute("href") || "").includes(tNorm)) || undefined;
  if (el) return el;

  // 3) text match (case-insensitive, contains)
  const lc = t.toLowerCase();
  el = anchors.find((x) => (x.textContent || "").trim().toLowerCase().includes(lc)) || undefined;
  return el || null;
}

/* ---------- safety pass ---------- */

function sanitizePlan(actions: DomAction[]): DomAction[] {
  const MAX_ACTIONS = 15;
  const safe = actions.slice(0, MAX_ACTIONS).map((a) => {
    const op = (a as any).op;
    const out: any = { ...a };

    if ("selector" in out) {
      out.selector = String(out.selector || "").slice(0, 300);
    }

    if (op === "set_style") {
      const style = { ...(out.style || {}) };
      for (const k of Object.keys(style)) {
        const v = String(style[k] ?? "");
        if (!v || /^(new_?color|<.*?>|tbd|null|undefined)$/i.test(v)) {
          style[k] = "magenta";
        }
      }
      out.style = style;
    }
    return out;
  });
  return safe;
}

/* ---------- executor ---------- */

export async function applyDomActions(actions: DomAction[]) {
  const results: Array<{ op: string; ok: boolean; error?: string }> = [];
  const plan = sanitizePlan(actions);

  for (const a of plan) {
    const op = (a as any).op;
    try {
      switch (op) {
        case "wait_for": {
          await waitForSelector((a as any).selector, (a as any).timeout_ms ?? 5000);
          results.push({ op, ok: true });
          break;
        }

        case "click": {
          const el = qs((a as any).selector) as HTMLElement | null;
          if (!el) throw new Error("selector not found");
          dispatchRealClick(el);
          forceNavigateIfAnchor(el);
          results.push({ op, ok: true });
          break;
        }

        case "navigate": {
          const sel = (a as any).selector;
          const to = (a as any).to?.trim?.();
          let anchor: HTMLAnchorElement | null = null;
          let targetUrl: string | null = null;

          if (sel) {
            const el = qs(sel) as HTMLElement | null;
            if (!el) throw new Error("selector not found");
            anchor = (el.closest("a") as HTMLAnchorElement) || null;
          }

          // If we have an anchor, use its href; else if we have `to`, use that; else try text lookup
          if (anchor?.href) {
            targetUrl = anchor.getAttribute("href") || anchor.href;
          } else if (to) {
            targetUrl = to;
          }

          if (!targetUrl) {
            // optional: try finding by link text or href
            const found = (document.querySelector(`a[href='${to}']`) ||
                          Array.from(document.querySelectorAll("a"))
                            .find(a => (a.textContent || "").trim().toLowerCase()
                              .includes((to || "").toLowerCase()))) as HTMLAnchorElement | undefined;
            if (found) targetUrl = found.getAttribute("href") || found.href;
          }

          if (!targetUrl) throw new Error("no target to navigate");

          // 1) SPA-first: use Next router if bridge exists (no full reload)
          const pushed = (window as any).__jarvisNavPush?.(targetUrl);
          if (pushed) {
            results.push({ op, ok: true });
            break;
          }

          // 2) Otherwise try a real click on the anchor (if we have one)
          if (anchor) {
            // real click may still be ignored by SPA (isTrusted=false), but try it
            anchor.click();
            results.push({ op, ok: true });
            break;
          }

          // 3) Final fallback: hard navigate (causes page refresh)
          location.assign(targetUrl);
          results.push({ op, ok: true });
          break;
        }

        case "fill": {
          const el = qs((a as any).selector) as HTMLInputElement | HTMLTextAreaElement | null;
          if (!el) throw new Error("selector not found");
          el.focus();
          el.value = (a as any).value ?? "";
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          if ((a as any).submit && (el as any).form?.submit) (el as any).form.submit();
          results.push({ op, ok: true });
          break;
        }

        case "type": {
          const el = qs((a as any).selector) as HTMLInputElement | HTMLTextAreaElement | null;
          if (!el) throw new Error("selector not found");
          el.focus();
          el.value = (el.value || "") + ((a as any).text ?? "");
          el.dispatchEvent(new Event("input", { bubbles: true }));
          results.push({ op, ok: true });
          break;
        }

        case "press": {
          const el = qs((a as any).selector) as HTMLElement | null;
          if (!el) throw new Error("selector not found");
          const key = (a as any).keys || "Enter";
          el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
          el.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
          results.push({ op, ok: true });
          break;
        }

        case "set_style": {
          const el = qs((a as any).selector) as HTMLElement | null;
          if (!el) throw new Error("selector not found");
          applyStyleProps(el, (a as any).style || {});
          results.push({ op, ok: true });
          break;
        }

        case "set_text": {
          const el = qs((a as any).selector) as HTMLElement | null;
          if (!el) throw new Error("selector not found");
          el.textContent = (a as any).text ?? "";
          results.push({ op, ok: true });
          break;
        }

        case "select": {
          const el = qs((a as any).selector) as HTMLSelectElement | null;
          if (!el) throw new Error("selector not found");
          const vals = Array.isArray((a as any).value) ? (a as any).value : [(a as any).value];
          el.value = vals[0] ?? "";
          el.dispatchEvent(new Event("change", { bubbles: true }));
          results.push({ op, ok: true });
          break;
        }

        case "scroll": {
          // If selector present, prefer its nearest scrollable container; otherwise use the default app scroller.
          const target = (a as any).selector ? qs((a as any).selector) : null;
          const scroller = getScrollContainer(target || null) as any;
          if (!scroller) throw new Error("no scroller");

          const dest =
            (a as any).to === "top"
              ? 0
              : (a as any).to === "bottom"
              ? scroller.scrollHeight
              : scroller.scrollTop + ((a as any).y ?? 0);

          if (typeof scroller.scrollTo === "function") {
            scroller.scrollTo({ top: dest, behavior: "auto" });
          } else {
            scroller.scrollTop = dest;
          }
          results.push({ op, ok: true });
          break;
        }

        case "scroll_into_view": {
          const el = qs((a as any).selector) as HTMLElement | null;
          if (!el) throw new Error("selector not found");
          el.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
          results.push({ op, ok: true });
          break;
        }

        default:
          results.push({ op, ok: false, error: "unsupported op" });
      }
    } catch (e: any) {
      results.push({ op, ok: false, error: String(e?.message || e) });
    }
  }
  return results;
}
