# Crypto processing: add checkout to your website

> **Not available yet.** This page describes crypto processing ahead of its release. Until this notice is gone, `https://www.unigox.com/checkout.js`, the help pages and the link check it names can answer 404. Once released, crypto processing is in early access, turned on per business.

> **Crypto processing guide:** [Get started](https://developers.unigox.com/tutorials/crypto-checkout) · **Website checkout** · [Confirm payments](https://developers.unigox.com/tutorials/crypto-checkout-confirm) · [Links from your server](https://developers.unigox.com/tutorials/crypto-checkout-links) · [Test and go live](https://developers.unigox.com/tutorials/crypto-checkout-testing) · [Reference](https://developers.unigox.com/tutorials/crypto-checkout-reference)

Show the payment of an order on your website: in a window over your page, inside your page, or on a Unigox payment page. The checkout shows the amount, lets the payer choose a coin and a network, shows the address and follows the transfer. Your page gets a message at each step.

## Choose how customers pay

| Way | What the payer sees | What you add |
| --- | --- | --- |
| **Payment button** | The checkout opens in a window over your page | `checkout.js` and a button |
| **Embedded checkout** | The checkout inside your page | `checkout.js` and an empty element |
| **Payment page** | A Unigox page with the payment, in the same tab | A link |
| **Your own frame** | The checkout in an iframe you control | An iframe and a message listener |

Use the payment button or embedded checkout unless you have a reason not to: they handle sizing, phones, loading problems and messages for you. Use the payment page for email, chat and any page where you cannot add a script. Use your own frame only when you cannot load a script from Unigox.

## 1. Create the payment

Each checkout shows one payment link. Create it in the portal (**Payment links → Create payment link**) or on your server ([Links from your server](https://developers.unigox.com/tutorials/crypto-checkout-links)). One link is one order: for a cart whose total changes, or for many customers, your server creates a link for each order.

## 2. Show the checkout

### Get the code from the portal

1. Open **Crypto processing → Checkout** and pick **Payment button**, **Embedded checkout** or **Payment page**. The fourth tile, **Connect your store**, is for a shop whose server creates a link for each order: it opens **Developers** ([Links from your server](https://developers.unigox.com/tutorials/crypto-checkout-links)).
2. Under **1. Choose how customers pay**, check the way. **Your own frame** is here too.
3. Under **2. Choose an order**, choose a payment link, press **Create payment link**, or **Paste a payment link** you made elsewhere.
4. Under **3. Add checkout to your site**, check the preview of what your customer sees, then press **Copy code** and paste the code into your page.
5. **4. Check the payment** reminds you to confirm each payment before you fulfil the order.

<figure><img src="assets/crypto-processing/website-checkout.gif" alt="Website checkout setup in the portal: choose the way, choose an order, copy the code"><figcaption><p>Setting up the payment button in the portal (sample data).</p></figcaption></figure>

The copied code has your order's link in it. Under the code, **Add to your Content-Security-Policy** gives the one line a strict policy needs, and **Callbacks** and **Error codes** list what your page can react to.

### Payment page

Link to the payment, redirect to it, or send it by email:

```html
<a href="https://www.unigox.com/pay/{token}">Pay with crypto</a>
```

For a language, put `/es`, `/fr` or `/pt` before `/pay` (`https://www.unigox.com/es/pay/{token}`). Without one, the page follows the payer's browser.

### Payment button

Load `checkout.js` once on the page, from `https://www.unigox.com`:

```html
<script src="https://www.unigox.com/checkout.js"></script>
```

Then open the checkout from your button:

```html
<button type="button" id="pay-with-crypto">Pay with crypto</button>
<script>
  let checkout;
  document.getElementById("pay-with-crypto").addEventListener("click", () => {
    // checkout.js did not load (an ad blocker, the network, your CSP): the hosted page takes the payment.
    if (!window.UnigoxCheckout) return location.assign("https://www.unigox.com/pay/{token}");
    checkout ??= UnigoxCheckout.create({
      token: "{token}", // or async () => token, called on the first open
      mode: "modal",
      onComplete(payload) { /* update your page; only your server confirms the payment */ },
    });
    checkout.open();
  });
</script>
```

When your server makes the link at the moment the payer clicks, pass a function that returns the token. Check the answer before you read it, so a failed request reaches `onError` as `TOKEN_MISSING`:

```js
token: () => fetch("/orders/1042/crypto-token", { method: "POST" })
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
  .then((d) => d.token),                      // your route answers {"token": "…"}
```

Closing the window keeps the payment: `open()` again shows the same checkout. On a phone the window is a full-screen sheet. The window closes when the browser goes Back or leaves the page; in a single-page app, call `checkout.close()` when your route changes.

### Embedded checkout

```html
<div id="checkout"></div>
<script>
  if (window.UnigoxCheckout) UnigoxCheckout.create({ token: "{token}", mode: "inline" }).mount("#checkout");
  // checkout.js did not load (an ad blocker, the network, your CSP): a link to the hosted page instead.
  else document.getElementById("checkout").innerHTML = '<a href="https://www.unigox.com/pay/{token}">Pay with crypto</a>';
</script>
```

The checkout takes the element's full width and the height it needs, so your page never shows a second scrollbar. Keep the element visible: a hidden or zero-height element hides the checkout.

### Links you already have

Mark existing links with `data-unigox-checkout` and the checkout opens over your page instead of on a new one:

```html
<a data-unigox-checkout href="https://www.unigox.com/pay/{token}">Pay with crypto</a>
<a data-unigox-checkout="inline" data-target="#checkout" href="https://www.unigox.com/pay/{token}">Pay here</a>
<div id="checkout"></div>
<script>window.UnigoxCheckout && UnigoxCheckout.bind();</script>
```

These links give your page no callbacks. Confirm their payments in **Payments**, or from your server with your payment history. On a page where users can post links (reviews, comments), bind only the container that holds your own links: `UnigoxCheckout.bind(document.querySelector("#checkout-links"))`.

### Invoices

An invoice made in **Payment links → Create invoice** is a payment link with the invoice document after `#invoice=` in the link. Pass the full link as `url`, not just the token, so the payer can open the invoice:

```js
// invoicePaymentUrl is the complete link copied from the portal, including #invoice=…
let checkout;
document.querySelector("#pay").addEventListener("click", () => {
  if (!window.UnigoxCheckout) return window.location.assign(invoicePaymentUrl);
  checkout ??= UnigoxCheckout.create({ url: invoicePaymentUrl, mode: "modal" });
  checkout.open();
});
```

The document is stored only in the link and in the browser that made it. Anyone who has the full link can read it: keep it out of analytics and logs.

### Your own frame

Use this only if you cannot load `checkout.js`. Serve your page over HTTPS (or `http://localhost` while you build), keep the referrer policy shown, and give each frame its own 16-character hexadecimal `instance`:

```html
<div id="checkout"></div>
<a id="checkout-fallback" target="_blank" rel="noopener noreferrer" hidden></a>
<script>
  // locale: "en", "es", "fr" or "pt". Leave it out to follow the payer's browser, as checkout.js does.
  function mountCheckoutFrame(container, token, fallback, locale) {
    const checkoutOrigin = "https://www.unigox.com";
    const languages = ["en", "es", "fr", "pt"];
    const lang = languages.includes(locale) ? locale
      : (navigator.languages || [navigator.language]).map((l) => String(l).slice(0, 2).toLowerCase()).find((l) => languages.includes(l)) || "en";
    // The frame's name and the fallback link's text, in the checkout's language.
    const words = {
      en: ["Pay with crypto", "Continue to secure checkout"],
      es: ["Pagar con cripto", "Continuar al checkout seguro"],
      fr: ["Payer en crypto", "Continuer vers le checkout sécurisé"],
      pt: ["Pagar com cripto", "Continuar para o checkout seguro"],
    }[lang];
    const hostedUrl = new URL((lang === "en" ? "" : "/" + lang) + "/pay/" + encodeURIComponent(token), checkoutOrigin);
    const instance = Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, "0")).join("");
    const frameUrl = new URL(hostedUrl);
    frameUrl.search = new URLSearchParams({ embed: "1", mode: "inline", v: "1", instance, origin: location.origin });
    const frame = document.createElement("iframe");
    frame.title = words[0];
    frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-to-custom-protocols");
    frame.allow = "clipboard-write";
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    frame.style.cssText = "width:100%;max-width:480px;height:560px;border:0;color-scheme:normal";
    let visible = true;
    // The link to the hosted page shows only while the frame cannot: 10 seconds without READY, or a frame that fails.
    if (fallback) {
      fallback.href = hostedUrl.href;
      fallback.textContent = words[1];
    }
    const showFallback = (show) => { if (fallback) fallback.hidden = !show; };
    const fallbackTimer = setTimeout(() => showFallback(true), 10000);
    const send = (type, fields = {}) => frame.contentWindow?.postMessage({
      source: "unigox-checkout-host", v: 1, instance, type, ...fields,
    }, checkoutOrigin);
    function onMessage(event) {
      if (event.origin !== checkoutOrigin || event.source !== frame.contentWindow) return;
      const msg = event.data;
      if (!msg || msg.source !== "unigox-checkout" || msg.v !== 1 || msg.instance !== instance) return;
      if (msg.type === "UNIGOX_CHECKOUT_READY") {
        clearTimeout(fallbackTimer);
        showFallback(false);
        // Repeat after READY: a visibility message sent before load may have been missed.
        send("UNIGOX_CHECKOUT_VISIBILITY", { visible });
      } else if (msg.type === "UNIGOX_CHECKOUT_RESIZE") {
        const height = msg.payload?.height;
        // The heights checkout.js takes too: more than 0, at most 10000 px. A long checkout on a phone is taller than
        // 2000 px; a lower cap would give it a scrollbar inside the frame.
        if (typeof height === "number" && height > 0 && height <= 10000) {
          frame.style.height = Math.max(160, height) + "px";
        }
      }
      // Payment events may update your screen. Only your server can fulfil the order.
    }
    window.addEventListener("message", onMessage);
    frame.addEventListener("load", () => send("UNIGOX_CHECKOUT_PING"));
    frame.addEventListener("error", () => showFallback(true));
    frame.src = frameUrl.href;
    container.append(frame);
    return {
      hostedUrl: hostedUrl.href,
      setVisible(value) {
        visible = Boolean(value);
        frame.hidden = !visible;
        send("UNIGOX_CHECKOUT_VISIBILITY", { visible });
      },
      destroy() {
        clearTimeout(fallbackTimer);
        window.removeEventListener("message", onMessage);
        frame.remove();
      },
    };
  }
  const frameCheckout = mountCheckoutFrame(document.getElementById("checkout"), "{token}", document.getElementById("checkout-fallback"));
  // In Spanish, for example: mountCheckoutFrame(container, token, fallback, "es").
  // Call frameCheckout.destroy() when this view unmounts; remount when its token changes.
</script>
```

The ordinary payment page refuses to be framed; only the URL with `embed=1` can be.

### React, Next.js, Vue and WordPress

React:

```jsx
import { useEffect, useRef, useState } from "react";

export function PayWithCrypto({ orderId, payUrl }) {
  const checkout = useRef(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
    return () => { checkout.current?.destroy(); checkout.current = null; };
  }, [orderId, payUrl]);
  const pay = (event) => {
    if (!window.UnigoxCheckout || failed) return; // follow the real href
    event.preventDefault();
    checkout.current ??= window.UnigoxCheckout.create({
      token: () => fetch(`/api/orders/${orderId}/crypto-token`, { method: "POST" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((d) => d.token),
      onError: () => setFailed(true), // next click uses the hosted page, never a dead button
      onComplete: () => window.location.assign(`/orders/${orderId}`),
    });
    checkout.current.open();
  };
  return <a href={payUrl} onClick={pay}>Pay with crypto</a>;
}

export function InlineCheckout({ token }) {
  const box = useRef(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    if (!window.UnigoxCheckout) return;
    const checkout = window.UnigoxCheckout.create({ token, mode: "inline", onReady: () => setReady(true), onError: () => setReady(false) });
    checkout.mount(box.current);
    return () => checkout.destroy();
  }, [token]);
  return <><div ref={box} />{!ready && <a href={`https://www.unigox.com/pay/${encodeURIComponent(token)}`}>Open checkout</a>}</>;
}
```

Next.js (App Router):

```jsx
// app/orders/[id]/pay-button.jsx
"use client";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";

export default function PayButton({ token }) {
  const [loaded, setLoaded] = useState(false);
  const checkout = useRef(null);
  useEffect(() => () => {
    checkout.current?.destroy();
    checkout.current = null;
  }, [token]);
  return (
    <>
      <Script src="https://www.unigox.com/checkout.js" strategy="afterInteractive" onReady={() => setLoaded(true)} onError={() => setLoaded(false)} />
      <a href={`https://www.unigox.com/pay/${encodeURIComponent(token)}`} onClick={(event) => {
        if (!loaded || !window.UnigoxCheckout) return;
        event.preventDefault();
        (checkout.current ??= window.UnigoxCheckout.create({ token, onError: () => setLoaded(false) })).open();
      }}>Pay with crypto</a>
    </>
  );
}
```

Vue:

```vue
<template><div ref="box" /><a v-if="!ready" :href="`https://www.unigox.com/pay/${encodeURIComponent(props.token)}`">Open checkout</a></template>
<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
const props = defineProps({ token: String });
const box = ref(null);
const ready = ref(false);
let checkout;
function mountCheckout() {
  if (!box.value) return;
  checkout?.destroy();
  ready.value = false;
  if (!window.UnigoxCheckout) return;
  checkout = window.UnigoxCheckout.create({ token: props.token, mode: "inline", onReady: () => { ready.value = true; }, onError: () => { ready.value = false; } });
  checkout.mount(box.value);
}
onMounted(mountCheckout);
watch(() => props.token, mountCheckout, { flush: "post" });
onBeforeUnmount(() => checkout?.destroy());
</script>
```

WordPress (a shortcode in your theme's `functions.php`):

```php
// [unigox_checkout token="…"] prints a Pay with crypto link. A click shows the checkout inline, in the box above
// the link; without JavaScript, or before checkout.js has loaded, the link opens the hosted page.
add_shortcode('unigox_checkout', function ($atts) {
  $token = preg_replace('/[^A-Za-z0-9_-]/', '', $atts['token'] ?? '');
  wp_enqueue_script('unigox-checkout', 'https://www.unigox.com/checkout.js', [], null, true);
  wp_add_inline_script('unigox-checkout', 'window.UnigoxCheckout && UnigoxCheckout.bind();');
  return '<div id="unigox-checkout-' . esc_attr($token) . '"></div>'
    . '<a data-unigox-checkout="inline" data-target="#unigox-checkout-' . esc_attr($token) . '" href="https://www.unigox.com/pay/' . esc_attr($token) . '">Pay with crypto</a>';
});
```

## 3. React to the checkout

### Options

| Option | Default | What it does |
| --- | --- | --- |
| `token` | none | The payment token, or a function that returns it or a promise of it. Called on the first `open()` or `mount()`, and again after an error or a timeout. |
| `url` | none | The full link instead of `token`. Keeps an invoice attached after `#invoice=`. |
| `mode` | `"modal"` | `"modal"`, `"inline"` or `"hosted"`. A browser without `<dialog>` gets `"hosted"`. |
| `container` | none | Embedded: the element or a selector, used when `mount()` gets none. |
| `theme` | light | `"light"` or `"dark"`. |
| `locale` | `"auto"` | `"en"`, `"es"`, `"fr"` or `"pt"`. `"auto"` follows the payer's browser. |
| `readyTimeoutMs` | `10000` | How long to wait for your token function and for the checkout to load, 3,000 to 120,000 ms. |
| `keepAlive` | `true` | Window: keep the checkout while it is closed. `false` removes it on close. |
| `zIndex` | `2147483000` | Stacking order of the window. |

### Methods

| Method | What it does |
| --- | --- |
| `UnigoxCheckout.create(options)` | Returns a checkout. Nothing is added to the page until you open or mount it. |
| `checkout.open()` | Shows the window, or mounts the embedded checkout. Returns a promise that settles when the checkout is ready, falls back or fails. |
| `checkout.close()` | Hides the window. The payment is kept and its checks pause until it opens again. |
| `checkout.mount(container)` | Embedded: shows the checkout in the element. |
| `checkout.unmount()` | Embedded: removes it. |
| `checkout.destroy()` | Removes everything for good. |
| `checkout.state` | `idle`, `loading`, `ready`, `open`, `closed`, `fallback` or `destroyed` |
| `checkout.status` | The last payment status, for example `awaiting_payment` or `paid` |
| `checkout.hostedUrl` | The payment page of this payment |
| `UnigoxCheckout.hostedUrl(token, { locale })` | The payment page of a token |
| `UnigoxCheckout.bind(root = document)` | Handles `data-unigox-checkout` links inside `root` |

The types are at `https://www.unigox.com/checkout.d.ts`.

### Callbacks

Callbacks update your page. They are not proof of payment: only your server's check is ([Confirm payments](https://developers.unigox.com/tutorials/crypto-checkout-confirm)).

| Callback | When |
| --- | --- |
| `onReady(payload)` | The checkout has loaded. `payload` has `livemode`, `mode` and `environment`. |
| `onStatusChange(status, payload)` | At every status below |
| `onPaymentDetected(payload)` | A transfer is on its network |
| `onComplete(payload)` | Once, on `paid`, `overpaid` or `paid_late` |
| `onDeposit(payload)` | Deposit page: a deposit was credited. Sent again for each credited deposit every time the page opens: count each `quoteId` once. |
| `onReturn(payload)` | The payer pressed **Back to {merchant}**. Without it, the window closes. |
| `onClose({reason})` | The window closed: `button`, `escape`, `backdrop`, `api`, `return`, `replaced` or `navigation` |
| `onError({code})` | See below |
| `onResize({height})` | The checkout changed height (already applied) |

Post `payload.payments` to your server from `onStatusChange` and `onComplete`: your server checks those transfers with Unigox.

| Error code | What it means and what to do |
| --- | --- |
| `TOKEN_MISSING` | No token: none given, or your token function failed. Call `open()` again once you have one. |
| `TOKEN_TIMEOUT` | Your token function took longer than `readyTimeoutMs`. Let the payer retry; keep the same order on your server so a retry makes no second payment. |
| `TOKEN_INVALID` | The link is cut off, edited or no longer reserved for this payment. The payer is told not to pay. Copy the link again or make a new one. |
| `CHECKOUT_UNAVAILABLE` | Unigox cannot be reached right now. Temporary, not a failed payment: keep the order open. |
| `FRAME_TIMEOUT` | The checkout did not load in time, or your Content Security Policy blocked it. The payer sees **Continue to secure checkout**. Temporary: if `onReady` follows, the checkout loaded late. |
| `FRAME_ERROR` | Anything else went wrong while setting up the checkout; the browser console says what after `[UnigoxCheckout]`. Try again, or send the payer to `checkout.hostedUrl`. |
| `CONTAINER_NOT_FOUND` | Embedded: no element was found to mount into. |
| `CONTAINER_OCCUPIED` | Embedded: another checkout already uses this element. |

No error code means a payment failed or that the payer must pay again.

### Payment statuses

| Status | What it means | What your page does |
| --- | --- | --- |
| `choosing` | The payer is choosing a coin and network | Nothing |
| `awaiting_payment` | The address and amount are shown | Nothing |
| `detected`, `confirming` | A transfer is on its network, not credited yet | Show "payment received, confirming" |
| `paid` | Credited in full, or short by at most 0.5 % and never more than 1.00 USD | Ask your server to confirm |
| `overpaid` | Credited, more than the amount | Ask your server to confirm |
| `paid_late` | Credited, but a transfer after the pay-by date was needed | Ask your server; your policy decides |
| `underpaid` | Credited, short by more than the allowance; the rest can still come | Wait, or ask for the rest |
| `underpaid_closed` | Short, and the pay-by date passed or the link closed | Your server decides |
| `on_hold` | Received, being reviewed by Unigox; not in your wallet yet | Wait |
| `failed` | Not credited, or being sent back | Do not fulfil |
| `expired` | The pay-by date passed and nothing came | Make a new link if the order stands |
| `cancelled`, `closed` | The payer cancelled, or the link was closed | Nothing; money sent later still reaches your wallet |
| `unreferenced` | Money reached the address without this payment's reference | Check it in **Payments** |
| `unavailable` | The checkout cannot reach Unigox right now | Nothing; it keeps trying |

### The payload

Each callback gets the same fields, each only when it applies. Money is a decimal string.

| Field | Value |
| --- | --- |
| `status` | One of the statuses above |
| `mode` | `modal`, `inline`, `topup` on a deposit page, or `null` |
| `livemode` | `true` for a real payment, `false` on a sample page |
| `environment` | `production` or `staging` |
| `reference` | Your order reference |
| `invoiceId` | The full reference text, for example `NW-20418 · 250.00 USD` |
| `amountDue`, `currency` | The amount due, in `USD` |
| `coin`, `chainId` | The coin and network the payer chose |
| `address` | The address shown (`awaiting_payment` only) |
| `txHash`, `logIndex`, `quoteId` | The latest transfer: its transaction hash, which transfer of that transaction, and its Unigox ID |
| `token`, `tokenAddress` | The coin of the whole amount and its contract address |
| `amount` | What was sent, credited or on its way |
| `amountReceived` | What is credited so far |
| `amountRemaining` | `underpaid` only: what is still due |
| `amountExtra` | `overpaid` only: what came on top |
| `payments` | Every transfer the checkout follows: `chainId`, `txHash`, `logIndex`, `quoteId`, `amount`, `coin`, `tokenAddress` and `stage` (`checking`, `seen`, `detected`, `confirming`, `on_hold`, `credited`, `failed` or `refunded`) |
| `incomplete` | `true` when the checkout could not follow every transfer (over 200): amounts are a floor |

The same status can arrive more than once. A transfer still being checked can be in `payments` with amount 0.

### Messages to your own frame

Your own frame posts the same statuses as messages to your page. Each message is `{source: "unigox-checkout", v: 1, instance, type, payload}`, where `type` is one of:

`UNIGOX_CHECKOUT_READY`, `UNIGOX_CHECKOUT_RESIZE` (`payload.height`), `UNIGOX_CHECKOUT_CHOOSING`, `UNIGOX_CHECKOUT_AWAITING_PAYMENT`, `UNIGOX_CHECKOUT_PAYMENT_DETECTED`, `UNIGOX_CHECKOUT_ON_HOLD`, `UNIGOX_CHECKOUT_UNDERPAID`, `UNIGOX_CHECKOUT_PAID`, `UNIGOX_CHECKOUT_OVERPAID`, `UNIGOX_CHECKOUT_PAID_LATE`, `UNIGOX_CHECKOUT_EXPIRED`, `UNIGOX_CHECKOUT_CANCELLED`, `UNIGOX_CHECKOUT_FAILED`, `UNIGOX_CHECKOUT_RECEIVED_WITHOUT_REFERENCE`, `UNIGOX_CHECKOUT_DEPOSIT_CREDITED`, `UNIGOX_CHECKOUT_RETURN`, `UNIGOX_CHECKOUT_CLOSE_REQUESTED`, `UNIGOX_CHECKOUT_INVALID_LINK` and `UNIGOX_CHECKOUT_UNAVAILABLE`.

Accept a message only when `event.origin` is `https://www.unigox.com`, `event.source` is your frame, `source` is `"unigox-checkout"`, `v` is `1` and `instance` is your frame's. Your page can send two messages to the frame, with `source: "unigox-checkout-host"`, `v: 1` and the `instance`: `UNIGOX_CHECKOUT_PING` (send `READY` again) and `UNIGOX_CHECKOUT_VISIBILITY` with `visible: true` or `false` (pause checking while hidden). Nothing your page sends changes the payment.

### When the checkout cannot load

If the checkout does not load within `readyTimeoutMs`, or your Content Security Policy blocks it, the window or element shows **Continue to secure checkout**. It opens the payment page of the same payment in a new tab, with the transfers already seen, and `onError` gets `FRAME_TIMEOUT`. If the checkout loads late, it replaces the card and `onReady` follows.

If `checkout.js` itself does not load (an ad blocker, the network, your policy), `window.UnigoxCheckout` does not exist. Check for it and send the payer to the payment page, as the button example does. `data-unigox-checkout` links open the payment page by themselves.

### Content Security Policy

For a strict policy, add:

```
script-src https://www.unigox.com; frame-src https://www.unigox.com
```

`checkout.js` needs no `style-src` change. Your own frame needs only `frame-src https://www.unigox.com`.

The checkout only reads: it cannot move money. It runs in a sandboxed frame that cannot navigate your page, and it posts payment details only to the page that framed it.

## 4. Return to your site

- **Payment button and embedded checkout:** `onReturn` is called; the checkout never navigates your page.
- **Payment page:** with **Return to your site** set in **Settings** (or `returnUrl` in a token your server makes), the page shows **Back to {your site}**. It never redirects by itself.

The page you return to asks your server for the order's status.

## What your customer sees

<figure><img src="assets/crypto-processing/payer-checkout.gif" alt="The payer chooses a coin and network, sees the address and amount, then the payment is confirmed"><figcaption><p>The checkout as your customer sees it (sample page, no real payment).</p></figcaption></figure>

1. **Choose a coin and network.** Coins and networks you did not accept are not offered.
2. **Pay.** The amount and the address with copy buttons, a QR code (on a phone, behind **Show QR**), and the pay-by date when the link has one.
3. **Confirming.** The transfer is seen and confirming on its network.
4. **Payment completed.** The payment is in your Unigox wallet. On the payment page the payer can **Print receipt**.

A payer who already sent the money can press **Already sent? Find my payment** and enter the transaction hash.
