# Unigox Checkout: create a payment and show it on your site

> **Not available yet.** This page describes Unigox Checkout ahead of its release. Until this notice is gone, `https://www.unigox.com/checkout.js`, the help pages and the link check it names can answer 404. Once released, crypto processing is in early access, turned on per business.

> **Unigox Checkout guide:** [Quickstart](https://developers.unigox.com/tutorials/crypto-checkout) · **Embed** · [Confirm payments](https://developers.unigox.com/tutorials/crypto-checkout-confirm) · [Links and deposit pages from your server](https://developers.unigox.com/tutorials/crypto-checkout-links) · [Test and go live](https://developers.unigox.com/tutorials/crypto-checkout-testing) · [Reference](https://developers.unigox.com/tutorials/crypto-checkout-reference) · [All on one page](https://www.unigox.com/checkout-integration.md)

## 1. Create the payment

A payment is a payment link: an amount, your reference and an address on each network. You make it in the portal (option A, below), or your server makes it ([option B](https://developers.unigox.com/tutorials/crypto-checkout-links#option-b-from-your-server), which needs your wallet's private key).

### Option A: in the portal

Open **Crypto processing → Payment links → Create payment link**, enter the reference and the amount, and copy the link. The portal creates the link and its payment addresses for you; the link is `https://www.unigox.com/pay/{token}`. The [Payment links guide](https://www.unigox.com/crypto-processing/help/payment-links) explains every option.

In **Settings**, **Support email for payers** puts your support address on every link you copy from that browser afterwards. The payer sees it on the screens that ask them to contact you, for example after an underpayment or a transfer that could not be credited.

For a customer who pays you again and again, open **Crypto processing → Deposit addresses → Add a customer** instead. The customer gets permanent addresses and one page that lists their deposits. Your own server can do the same: see [Customer deposit addresses](https://developers.unigox.com/tutorials/crypto-checkout-links#customer-deposit-addresses).

## 2. Show the checkout

### Hosted

Link to the checkout, redirect to it, or send it by email:

```html
<a href="https://www.unigox.com/pay/{token}">Pay with crypto</a>
```

For Spanish, French or Portuguese use `https://www.unigox.com/es/pay/{token}`, `/fr/…` or `/pt/…`. The page works without any script on your site, and it is the fallback for the other two ways. It needs JavaScript in the payer's browser: with JavaScript off it shows a card that says so instead of the payment.

### Modal and inline with checkout.js

Load the script once per page:

```html
<script src="https://www.unigox.com/checkout.js"></script>
```

Load it from `https://www.unigox.com`, the host that serves the checkout: `https://unigox.com` only redirects there, and a Content Security Policy that names one host then blocks the other.

**Modal:**

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

A token your server makes when the payer clicks comes from your own route. Check the answer before you read it: a failed request then reaches `onError` as `TOKEN_MISSING` instead of an error page read as a token.

```js
token: () => fetch("/orders/1042/crypto-token", { method: "POST" })
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
  .then((d) => d.token),                      // your route answers {"token": "…"}
```

Closing the dialog keeps the payment: `open()` again shows the same checkout in its current state. On a phone (640 px wide or less) the dialog is a full-screen sheet.

The dialog closes by itself when the browser goes Back or Forward to another URL or leaves the page (reason `navigation`); a jump to a fragment on the same page (a Pay link with `href="#"`) does not close it. A route change made with `history.pushState` is not one of those: in a single-page app, call `checkout.close()` (or `destroy()`) when the route changes.

**Inline:**

```html
<div id="checkout"></div>
<script>
  if (window.UnigoxCheckout) UnigoxCheckout.create({ token: "{token}", mode: "inline" }).mount("#checkout");
  // checkout.js did not load (an ad blocker, the network, your CSP): a link to the hosted page instead.
  else document.getElementById("checkout").innerHTML = '<a href="https://www.unigox.com/pay/{token}">Pay with crypto</a>';
</script>
```

The checkout takes the container's whole width, centres its payment card in it, and takes the height it needs, so your page never shows a second scrollbar. It reserves 560 px until it has drawn itself. The checkout sits in its own `<unigox-checkout>` element, so rules for `div` or `iframe` in your CSS do not reach it, but the container you give it must stay visible: a container hidden, collapsed to no height or clipped by your CSS hides the checkout with it.

**Links, without writing code:**

```html
<a data-unigox-checkout href="https://www.unigox.com/pay/{token}">Pay with crypto</a>
<a data-unigox-checkout="inline" data-target="#checkout" href="https://www.unigox.com/pay/{token}">Pay here</a>
<div id="checkout"></div>
<script>window.UnigoxCheckout && UnigoxCheckout.bind();</script>
```

These links take no callbacks: your page hears nothing about the payment, so nothing reaches your server from it. Confirm such a payment in the portal's **Payments**, from a transaction hash your customer gives you, or with your signed history ([4. Confirm the payment on your server](https://developers.unigox.com/tutorials/crypto-checkout-confirm#4-confirm-the-payment-on-your-server)). When your server should confirm from the page's events, use `UnigoxCheckout.create()` with callbacks instead.

`bind()` adds one click listener for every such link on the page, including links added later. A click with Ctrl, Cmd, Shift or Alt, or a link whose `data-target` does not exist, opens the hosted page as usual, and so does any link before the script loads. Several links for one token may ask for different things (`data-theme="dark"`, modal or inline): each click opens what its link asks for, and an inline link shows its checkout in its `data-target` even when another checkout was there.

`bind(root)` handles every `data-unigox-checkout` link inside `root`, including links your users post. Anyone who can put a link on your page (a review, a comment, a forum post) can then open a checkout for their own token, with their own addresses, in your page's dialog. On a page with user content, bind only a container that holds your own links, for example `UnigoxCheckout.bind(document.querySelector("#checkout-links"))`, never the whole document.

### Your own iframe, without checkout.js

Use the embedded URL below. The ordinary hosted URL refuses framing. Serve your page over HTTPS (or `http://localhost` or `http://127.0.0.1` during development), and keep the referrer policy shown here so the checkout can verify your page's origin. A distinct 16-character hexadecimal `instance` identifies each frame.

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

The link under the frame appears only when the frame cannot load (10 seconds without `UNIGOX_CHECKOUT_READY`, or a frame error): it opens the same payment on the hosted page. Call `setVisible(false)` when hiding the frame and `setVisible(true)` when showing it. Unlike `checkout.js`, this example does not create a modal or manage focus for you. The fourth argument, `locale`, sets the checkout's language: `"en"`, `"es"`, `"fr"` or `"pt"`. Without it, the frame follows the payer's browser like `checkout.js` (the first of the four languages the browser prefers, else English), and the frame's name and the fallback link's text follow the same language. Optional `theme=light` or `theme=dark` goes in `frameUrl`.

### React

```jsx
import { useEffect, useRef } from "react";

// Load https://www.unigox.com/checkout.js once, in your HTML or with a script tag in your app shell.
export function PayWithCrypto({ orderId }) {
  const checkout = useRef(null);
  useEffect(() => () => {
    checkout.current?.destroy();
    checkout.current = null;
  }, [orderId]);
  const pay = () => {
    checkout.current ??= window.UnigoxCheckout.create({
      // Your server creates (or finds) the payment for this order and returns its token.
      token: () => fetch(`/api/orders/${orderId}/crypto-token`, { method: "POST" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((d) => d.token),
      onComplete: () => window.location.assign(`/orders/${orderId}`), // that page asks your server
    });
    checkout.current.open();
  };
  return <button onClick={pay}>Pay with crypto</button>;
}

export function InlineCheckout({ token }) {
  const box = useRef(null);
  useEffect(() => {
    const checkout = window.UnigoxCheckout.create({ token, mode: "inline" });
    checkout.mount(box.current);
    return () => checkout.destroy();
  }, [token]);
  return <div ref={box} />;
}
```

### Next.js (App Router)

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
      <Script src="https://www.unigox.com/checkout.js" strategy="afterInteractive" onReady={() => setLoaded(true)} />
      <button
        disabled={!loaded}
        onClick={() => (checkout.current ??= window.UnigoxCheckout.create({ token })).open()}
      >
        Pay with crypto
      </button>
    </>
  );
}
```

The script only runs in the browser and does nothing until `open()` or `mount()`, so it is safe in server-rendered pages.

### Vue

```vue
<template><div ref="box" /></template>
<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
const props = defineProps({ token: String });
const box = ref(null);
let checkout;
function mountCheckout() {
  if (!box.value) return;
  checkout?.destroy();
  checkout = window.UnigoxCheckout.create({ token: props.token, mode: "inline" });
  checkout.mount(box.value);
}
onMounted(mountCheckout);
watch(() => props.token, mountCheckout, { flush: "post" });
onBeforeUnmount(() => checkout?.destroy());
</script>
```

### WordPress

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

### Options

| Option | Default | Meaning |
| --- | --- | --- |
| `token` | none | the payment token, or a function returning a promise of it (called once, on the first `open()` or `mount()`) |
| `url` | none | a full `https://www.unigox.com/…/pay/{token}` link instead of `token` |
| `mode` | `"modal"`; in a browser without `<dialog>`, `"hosted"` | `"modal"`, `"inline"` or `"hosted"` (hosted navigates to the checkout page) |
| `container` | none | inline: an element or a selector, used when `mount()` gets none |
| `theme` | light | `"light"` or `"dark"`, to match your page |
| `locale` | `"auto"` | `"en"`, `"es"`, `"fr"` or `"pt"`. `"auto"` follows the payer's browser (the first of the four it prefers, else English); anything else is English. A link with a language in its path (`/es/pay/…`) keeps it |
| `readyTimeoutMs` | `10000` | how long to wait for the checkout before offering the hosted page (at least 3000) |
| `keepAlive` | `true` | modal: retain the frame and its state while closed; payment polling pauses until it reopens |
| `zIndex` | `2147483000` | stacking order of the dialog |
| `walletNavigation` | `"checkout"` | **Planned, does nothing yet.** `"host"` will let your page open the payer's wallet app (`onOpenWallet`) instead of the checkout, for a page inside an app's WebView. Today the checkout ignores it and opens the wallet itself; [Changes](https://developers.unigox.com/tutorials/crypto-checkout-reference#changes) will say when it works |

### Methods and properties

| | |
| --- | --- |
| `UnigoxCheckout.create(options)` | Returns a checkout. Nothing is added to the page until it is used. The same token returns the same checkout. |
| `checkout.open()` | Modal: shows the dialog (again). Returns a promise that settles when the checkout is ready, falls back or fails, or when the dialog is closed before it loaded. Calling it again does not add a second checkout. |
| `checkout.close()` | Hides the dialog. The payment is not cancelled: the checkout keeps its state, pauses its checks while hidden and catches up when opened again. |
| `checkout.mount(container)` | Inline: shows the checkout in the container. A container that already holds a checkout keeps it. |
| `checkout.unmount()` | Inline: removes it. Mounting again rebuilds it from the token. |
| `checkout.destroy()` | Removes everything for good: frame, dialog, listeners. Scrolling and focus come back. |
| `checkout.state` | `idle`, `loading`, `ready`, `open`, `closed`, `fallback` or `destroyed` |
| `checkout.status` | the last payment status, e.g. `awaiting_payment` or `paid` |
| `checkout.hostedUrl` | the hosted page of this payment |
| `UnigoxCheckout.hostedUrl(token, { locale })` | the hosted page of a token |
| `UnigoxCheckout.bind(root = document)` | handles `data-unigox-checkout` links (above) |
| `UnigoxCheckout.version` | `"1.1.0"` |
| `UnigoxCheckout.protocol` | `1`, the version of the messages between the checkout and your page (the `v` of every message) |

### Callbacks and events

Callbacks update your page; they are not proof of payment. Each one runs on its own, so an error in one does not stop the checkout.

| Callback | Called |
| --- | --- |
| `onReady(payload)` | once the checkout has loaded: `{livemode, mode, environment}` |
| `onStatusChange(status, payload)` | on every status event below |
| `onPaymentDetected(payload)` | a transfer for this payment is on the network |
| `onComplete(payload)` | once, on `paid`, `overpaid` or `paid_late` |
| `onDeposit(payload)` | deposit page: a deposit was credited. Its payload is one deposit, with flat fields `chainId`, `txHash`, `logIndex`, `quoteId`, `amount` and `coin` (no `payments` list). It is sent for every credited deposit the page shows, also again each time the page opens: count each `quoteId` once on your server |
| `onReturn(payload)` | the payer chose to go back to your site; you decide what happens. Without `onReturn`, **Back to {merchant}** closes the dialog (`onClose` reason `return`) |
| `onClose({reason})` | the dialog closed: `button`, `escape`, `backdrop`, `api`, `return` (the payer chose to go back and your page has no `onReturn`), `replaced` (another checkout opened) or `navigation` (the browser went Back or Forward, or left the page) |
| `onError({code})` | the checkout could not do what you asked, or cannot read the payment right now: one of the codes below |
| `onResize({height})` | the checkout changed height (already applied) |
| `onOpenWallet({uri})` | **Planned, never called yet** (see `walletNavigation`). Once it works: open this wallet link yourself, for example with your app's own link handler. Only links with a scheme will reach it, never `javascript:` or `data:` |

No `onError` code means that a payment failed or that the payer must pay again. A transfer that was not completed arrives as the status `failed`, and only your server decides about an order.

| Code | Meaning, and what to do |
| --- | --- |
| `TOKEN_MISSING` | No token: neither `token` nor `url` was given, or your token function returned nothing or failed. Nothing is shown; call `open()` or `mount()` again once you have a token. |
| `TOKEN_INVALID` | The link is cut off, edited, or names an address that is no longer set aside for this payment by your wallet (`UNIGOX_CHECKOUT_INVALID_LINK`): the payer sees "This payment link can't be used" and is told not to pay. Copy the link again from **Payment links**, or build it again on your server. |
| `CHECKOUT_UNAVAILABLE` | **Temporary, and not a failed payment: keep the order open.** Do not cancel it or ask the payer to pay again on this code; the payment's real status follows in `onStatusChange` as soon as the checkout can read it, and only your server decides about the order. The checkout cannot reach Unigox right now (`UNIGOX_CHECKOUT_UNAVAILABLE`). What the payer sees depends on when it happens. **Before the link is checked or the coins are loaded**, the payer sees no address, only a message and **Try again**: nothing can be paid yet, so offer your own retry or `checkout.hostedUrl`. **Once the address is shown**, the checkout cannot read the payment's status for a moment: it keeps trying by itself and the payer can still pay; nothing has failed. The same code comes when the payment has no coin or network the payer can use (the payer is told to contact you). |
| `FRAME_ERROR` | Something else failed while the checkout was being set up on your page; the browser console shows it after `[UnigoxCheckout]`. Call `open()` or `mount()` again, or send the payer to `checkout.hostedUrl`. |
| `CONTAINER_NOT_FOUND` | Inline: `mount()` got no element, and `container` names none that exists. |
| `FRAME_TIMEOUT` | The checkout did not load within `readyTimeoutMs`, or your Content Security Policy blocked it: the dialog or container shows **Continue to secure checkout** (see "When the checkout cannot load"). Not final: if `onReady` follows, the checkout loaded late and replaced the fallback; treat `FRAME_TIMEOUT` as temporary, not as a failed payment. |

`status` is the status the checkout sends, or the event name in lower case. The checkout posts these events; `checkout.js` checks each one before calling you:

| Event | Meaning |
| --- | --- |
| `UNIGOX_CHECKOUT_READY` | the checkout has loaded (once per load) |
| `UNIGOX_CHECKOUT_RESIZE` | new height |
| `UNIGOX_CHECKOUT_CHOOSING` | the payer is choosing a coin and network |
| `UNIGOX_CHECKOUT_AWAITING_PAYMENT` | address and amount shown, waiting for a transfer |
| `UNIGOX_CHECKOUT_PAYMENT_DETECTED` | a transfer is seen or confirming on the network (status `confirming` while it confirms) |
| `UNIGOX_CHECKOUT_ON_HOLD` | received and under review by Unigox; it is not in your wallet until it is released. The payer is shown Unigox support's address |
| `UNIGOX_CHECKOUT_UNDERPAID` | less than the amount was credited, short by more than the tolerance (step 4); the rest can still come |
| `UNIGOX_CHECKOUT_PAID` | the credited sum covers the amount, or falls short of it by at most 0.5 % and never more than 1.00 USD |
| `UNIGOX_CHECKOUT_OVERPAID` | more than the amount was credited |
| `UNIGOX_CHECKOUT_PAID_LATE` | paid after the pay-by date (`x`) while the address still took this payment. The pay-by date lives only in the link: Unigox credits the payment like any other, and the portal and history show it as paid. Whether a late payment still fulfils the order is your server's decision, by your own order deadline. A transfer after the reservation has ended shows as `RECEIVED_WITHOUT_REFERENCE` instead |
| `UNIGOX_CHECKOUT_EXPIRED` | the pay-by date passed with nothing received |
| `UNIGOX_CHECKOUT_CANCELLED` | the payer cancelled on the page, a newer payment now uses the address, or the payment link was closed. Transfers to the address are still credited |
| `UNIGOX_CHECKOUT_FAILED` | a transfer was not completed or was returned. A refund still on its way is reported as `failed` too; the payer's page says the money is being sent back |
| `UNIGOX_CHECKOUT_RECEIVED_WITHOUT_REFERENCE` | money reached the address without this payment's reference |
| `UNIGOX_CHECKOUT_DEPOSIT_CREDITED` | deposit page: one deposit was credited (`onDeposit`); sent again for each credited deposit every time the page opens |
| `UNIGOX_CHECKOUT_RETURN` | the payer chose to go back to your site |
| `UNIGOX_CHECKOUT_CLOSE_REQUESTED` | Escape pressed inside the modal |
| `UNIGOX_CHECKOUT_INVALID_LINK` | the token cannot be read, or an address in it is not reserved by the token's wallet for its memo (the check does not prove the wallet is yours) |
| `UNIGOX_CHECKOUT_UNAVAILABLE` | the checkout cannot reach Unigox right now. Before the link has been checked it shows no address and a **Try again** button; once the address is shown, the payer can still pay while it retries. It is not a failed payment (`onError` code `CHECKOUT_UNAVAILABLE` above) |
| `UNIGOX_CHECKOUT_OPEN_WALLET` | **Planned, not sent yet.** Reserved for `walletNavigation: "host"`: the payer pressed **Open in wallet app** and `payload.uri` is the wallet link (`onOpenWallet`) |

A status payload carries these fields, each only when it applies. Money fields are decimal strings with at least two decimals.

| Field | Value |
| --- | --- |
| `status` | `choosing`, `awaiting_payment`, `detected`, `confirming`, `on_hold`, `underpaid`, `underpaid_closed`, `paid`, `overpaid`, `paid_late`, `expired`, `cancelled` (the payer cancelled on the page), `closed` (a newer payment uses the address, or the link was closed), `failed`, `unreferenced` or `unavailable` (the checkout cannot reach Unigox right now, see `CHECKOUT_UNAVAILABLE`); `underpaid_closed` is a payment that is short while its pay-by date (`x`) has passed or its link has closed: the page no longer asks for the rest, and whether the order is still due is your server's decision. `cancelled` and `closed` both arrive as `UNIGOX_CHECKOUT_CANCELLED`: tell them apart by `status`. On a deposit page `choosing`, `detected`, `confirming`, `on_hold` or `credited` |
| `mode` | `modal` or `inline` as `checkout.js` opened it, `topup` on a deposit page, `null` when the frame URL has no `mode` |
| `livemode` | `true` for a real payment link, `false` on a sample page and on a link that names no real payment (it cannot be read, or was changed: `INVALID_LINK` follows) |
| `environment` | `production` or `staging` |
| `invoiceId` | your reference text exactly as Unigox keeps it, for example `NW-20418 · 250.00 USD`. Kept under this name for compatibility |
| `reference` | your order reference from the reference text; on a deposit page, the customer reference |
| `amountDue` | the amount due |
| `currency` | `USD` |
| `coin` | the coin the payer chose |
| `chainId` | the network the payer chose, or of the transfer |
| `address` | `awaiting_payment` only: the address shown |
| `txHash` | the latest transfer's transaction hash |
| `logIndex` | which transfer of that transaction (a string), or `null` |
| `quoteId` | the API's id of that transfer (`GET /transaction/{fromChain}/{fromTx}?quoteId=`), or `null` |
| `token` | the coin of the whole amount; `null` when it came in two coins |
| `tokenAddress` | that coin's contract address on the network |
| `amount` | what was sent, credited or on its way |
| `amountReceived` | only what is credited so far |
| `amountRemaining` | `underpaid` only: what is still due |
| `amountExtra` | `overpaid` only: what was credited on top of the amount |
| `payments` | one entry per transfer the checkout follows, including ones still being checked: `chainId`, `txHash`, `logIndex`, `quoteId`, `amount`, `coin`, `tokenAddress` and `stage` (`checking`, `seen`, `detected`, `confirming`, `on_hold`, `credited`, `failed` or `refunded`). A transfer whose refund is still on its way has stage `failed` until the refund completes (`refunded`); the payer's page already says the money is being sent back |
| `incomplete` | optional boolean: `true` means the checkout could not follow every transfer, so the amounts it shows are at least what came, not the total. Your server's check gives the total |

What to expect from these events:

- Up to 200 transfers per payment are followed; past that the payer is asked to confirm the total with you, and the checkout stops reporting underpayment (`incomplete: true`).
- The same event can arrive more than once, also when the screen stays on the same step. A transfer still being checked can be in `payments` with an amount of 0 or a provisional amount; it counts toward `amountReceived` only once it is credited.
- When the checkout cannot yet tell whether a payment is short (transfers still being checked), it sends `PAYMENT_DETECTED` with `status: "detected"`, or `UNAVAILABLE` with `status: "unavailable"` when it cannot check them now, never `UNDERPAID`, and without `amountRemaining`.
- A deposit page lists the ten latest credited deposits and up to ten still in progress (including ones on hold). A deposit the customer finds by its transaction hash shows as a recent lookup.
- Only your server decides that an order is paid (step 4). React to the event name and each transfer's `stage` on your page, never by fulfilling the order.

A closed dialog that is kept alive (`keepAlive`, the default) stops checking for the payment until it is opened again, then catches up at once. If you frame the checkout yourself instead of using `checkout.js`, you can do the same: post `{source: "unigox-checkout-host", v: 1, instance, type: "UNIGOX_CHECKOUT_VISIBILITY", visible: false}` to the frame when you hide it and `visible: true` when you show it again (`instance` is the 16-hex value you put in its URL).

### When the checkout cannot load

If the checkout has not loaded after `readyTimeoutMs`, or your page's Content Security Policy blocks it, the dialog or container shows **Continue to secure checkout**. It opens the hosted page of the same payment in a new tab, with the transfers already seen. Nothing new is created, and `onError({code: "FRAME_TIMEOUT"})` is called.

`FRAME_TIMEOUT` is not final. If the checkout still loads after the timeout (a slow network), it replaces the card, `onReady` follows and every event comes as usual. Do not cancel the order, redirect the payer or mount a second checkout on `FRAME_TIMEOUT` alone.

If `checkout.js` itself does not load (an ad blocker, the network, a CSP without `script-src https://www.unigox.com`), `window.UnigoxCheckout` does not exist and none of this runs. Check for it before you call it and send the payer to the hosted page otherwise, as the modal example does. `data-unigox-checkout` links need nothing: without the script they open the hosted page.

### Security

- `checkout.js` accepts a message only from the checkout's site (`https://www.unigox.com` and `https://unigox.com`), from its own frame and with that frame's instance id, and only the event types listed above. It posts nothing but a readiness ping and, when the dialog is hidden or shown again, a visibility message, and only to that site.
- The checkout tells only the page that framed it (`origin=` checked against the browser's own record). A page it cannot identify hears only `READY`, `RESIZE`, `RETURN`, `CLOSE_REQUESTED`, `INVALID_LINK` and `UNAVAILABLE`, without payment details.
- The frame is sandboxed without top navigation: it cannot navigate your page.
- Any HTTPS site may embed the checkout (`frame-ancestors https:`), and `http://localhost` and `http://127.0.0.1` (any port) while you build. The checkout only reads: it cannot move money. The hosted page and the Unigox portal refuse to be framed.
- For a strict Content Security Policy, add:

  ```
  script-src https://www.unigox.com; frame-src https://www.unigox.com
  ```

  `checkout.js` sets its styles through the CSSOM, so no `style-src` change is needed. Your own frame (without `checkout.js`) needs only `frame-src https://www.unigox.com`.

## 3. Return to your site

- **Modal and inline:** `onReturn` is called; the checkout never navigates your page.
- **Hosted:** with `returnUrl` in the token, the page shows "Back to {merchant}", with your merchant name from the token. It is never opened automatically.

Either way, the page you return to asks your server for the order's status.

## What your customer sees

The checkout shows your customer four steps. Each sample below is the real page with a made-up merchant and no address anyone can pay ([Test your page without money](https://developers.unigox.com/tutorials/crypto-checkout-testing#test-your-page-without-money) lists every one):

1. **Choose the coin and the network** they will send on ([`/pay/demo`](https://www.unigox.com/pay/demo)). A link that offers one coin on one network skips this step.
2. **Send the amount to the address**: the address, the exact amount, a QR code, and **Copy address** and **Copy amount** ([`/pay/demo-awaiting`](https://www.unigox.com/pay/demo-awaiting)). No memo or tag is needed.
3. **Payment detected**, then **Confirming your payment**, while the transfer confirms on its network ([`/pay/demo-detected`](https://www.unigox.com/pay/demo-detected)).
4. **Payment completed** once it is credited ([`/pay/demo-paid`](https://www.unigox.com/pay/demo-paid)), with **Print receipt** on the hosted page (a checkout.js frame cannot open the print dialog), and "Back to {merchant}" when the link has a `returnUrl`.

![The checkout in a window over a shop's page, on a computer](https://www.unigox.com/crypto-processing/help/checkout-modal.png)

![The checkout shown inside the page of a shop](https://www.unigox.com/crypto-processing/help/checkout-inline.png)

![The checkout on a phone, full screen](https://www.unigox.com/crypto-processing/help/checkout-phone.png)

A customer's deposit page ([`/pay/demo-topup`](https://www.unigox.com/pay/demo-topup)) asks for no amount and lists **Your recent deposits**. Send customers who need help to [How to pay a payment link](https://www.unigox.com/crypto-processing/help/how-to-pay), or, for a deposit page, to [How to add funds with a deposit page](https://www.unigox.com/crypto-processing/help/how-to-deposit), and see [When a payment is not exact](https://www.unigox.com/crypto-processing/help/exceptions) for what they see when it is not.
