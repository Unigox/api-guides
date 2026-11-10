# Accept crypto payments with Unigox Checkout on your website

> **Not available yet.** This page describes Unigox Checkout ahead of its release. Until this notice is gone, `https://www.unigox.com/checkout.js`, the help pages and the link check it names can answer 404. Once released, crypto processing is in early access, turned on per business.

> **Release status.** Crypto processing is in early access. Unigox turns it on for your business; then payment links, deposit addresses and the checkout appear in your business portal. Not available yet: notifications to your server (callbacks are off in production), a test mode, a server key that can only read payments, a published confirmation depth for each network, and screening of incoming payments on every network. This guide says where each of these matters and what to do instead.

> **Not a developer?** You need no code to take payments. The [crypto processing help](https://www.unigox.com/crypto-processing/help) explains payment links, deposit addresses and the checkout for your site in plain words, and [How to pay a payment link](https://www.unigox.com/crypto-processing/help/how-to-pay) is the page to send your customers.

Unigox Checkout is the page your customer pays on: it shows who is paid and how much, lets the customer pick a dollar stablecoin (USDT, USDC, or another one the network offers, such as USDG or USDT0) and a network, and gives an address, the exact amount and a QR code. It follows the payment until it is credited to your Unigox wallet. In this guide the **checkout** is that page shown on your site, and the **payment page** is the same page at `https://www.unigox.com/pay/…`.

Every payment link is `https://www.unigox.com/pay/{token}`, where `{token}` is the code at the end of the link: it carries the amount, your reference and the payment addresses. You can show a payment three ways, and they all show the same payment in the same state:

- **Hosted:** a link or a redirect to the checkout page.
- **Modal:** a dialog over your page, opened by `checkout.js`.
- **Inline:** the checkout inside a container on your page, mounted by `checkout.js`.

Nothing in the browser decides whether a payment arrived. Your server confirms it by reading the payment's status from Unigox (step 4): without any key, by checking each transfer the checkout reports ([Confirm without the key](#confirm-without-the-key)); with your wallet's key, from your wallet's signed history. Opening the checkout does not create a payment: a payment exists only once coins arrive.

## Words used in this guide

Each word in code font is a name you type in requests and code; the guide explains it once here.

| Word | Meaning |
| --- | --- |
| Reference | Your order number, shown to the payer. Keep personal data out of it. |
| Reference text (`memo`) | The text Unigox keeps with a payment address: `<reference> · <amount> USD`, followed by the link's terms for a link made in the portal ([memo v2](#memo-v2-the-links-terms-in-the-memo)). Requests and answers call it `memo`. Only your wallet reads the text back. |
| Payment address | An address of your wallet that payers send to. A payment has one for each address type it accepts. |
| Address type (`chainType`: `evm`, `tvm`, `ton`, `svm`) | One address serves all Ethereum-style networks (`evm`); TRON (`tvm`), TON (`ton`) and Solana (`svm`) have one each. |
| Reserve an address (a reservation) | The address is set aside for this payment: your reference text is put on it, and while it is reserved, every transfer to it counts for this payment. Ending the reservation takes the reference text off; transfers still reach your wallet, without it. "Get a new address" makes a new address and reserves it in one request. |
| `/memo-locks/…`, `AllocateAndLock`, `Lock`, `Unlock`, `ListLocks` | The names of the requests that get and reserve an address, reserve one you have, end a reservation, and list an address's reservations. They are fixed names: type them exactly as the code shows. |
| `"Unigox Bridge Memo Locks"`, `"Unigox Bridge History"` | Fixed signing labels: the names your server puts in each signature. Type them exactly. Their wording is historic: they do not name a product you use or sign up for. |
| Address ID (`lockId`, `memoLockId`) | The number of one reserved address. The portal shows it as **Address ID**; requests and answers name the field `lockId`, history and events `memoLockId`. |
| Reference fingerprint (`memoHash`) | keccak256 of the reference text's UTF-8 bytes. Public transfer records carry the fingerprint, never the text. |
| Payment link code (`token`) | The last part of a payment link: the reference text, the amount and the addresses. It is not signed; see [Link format](#link-format-advanced). |
| Your Unigox wallet | Where Unigox credits every payment. "Balance" in this guide is only ever an amount in it. |
| `UNIGOX_BALANCE_CHAIN_ID` (`660279`) | A fixed number Unigox uses to mark a payment as credited to your wallet. Copy it as is. |
| Transfer ID (`quoteId`) | Unigox's ID for one incoming transfer, as the API gives it. Use it to count each payment or deposit once on your server. It is not the **Payment ID** of the portal and its exports: that one is `<network>:<transaction>:<number>` (`payment_key` in the developer export). |
| Pay-by date (`x`) | The deadline your customer sees. It lives only in the link: a payment after it is still credited, as paid late. |
| Deposit page (`p: "topup"`, `mode: "topup"`) | A customer's own page with their deposit addresses, for any amount, any number of times. `topup` is its code in the link and in events. |

## Choose how you start

| You want to | Who does the work | You need | Start at |
| --- | --- | --- | --- |
| Send a customer an invoice to pay | No code | Crypto processing turned on for your business account | [Payment links](https://www.unigox.com/crypto-processing/help/payment-links) |
| Give a repeat customer a permanent deposit address | No code in the portal, or a developer for your own server | Crypto processing turned on | [Deposit addresses](https://www.unigox.com/crypto-processing/help/deposit-addresses) (portal) or [Customer deposit addresses](#customer-deposit-addresses) (server) |
| Show the checkout on your site: a button, a window or part of your page | Copy and paste | A payment link and a few lines of HTML | [2. Show the checkout](#2-show-the-checkout) |
| Confirm each payment on your server, without a key | A developer | The link's reference text and address IDs (shown on the portal's **Developers** page), Node.js | [Confirm without the key](#confirm-without-the-key) |
| Make a payment link for every order from your server | A developer | Your wallet's private key, which Unigox exports on request | [Option B: from your server](#option-b-from-your-server) |

Without the key, the checkout on your site shows payment links you make in the portal: one link per order, made by hand, pasted into the button code. With the key, your server makes each order's link itself.

## Quickstart: your first payment without code

1. In the business portal, open **Crypto processing → Payment links → Create payment link**, enter your order reference and the amount in USD, and create the link.
2. Copy the link and send it to your customer, or open it yourself to see what your customer sees.
3. Your customer picks a coin and a network and sends the amount to the address the page shows. The page follows the transfer until it is credited.
4. Open **Crypto processing → Payments**: the payment is there with your reference, the amount received and its status.

That is all you need to take payments. The [Payment links guide](https://www.unigox.com/crypto-processing/help/payment-links) explains every option, every status and the exports. To put the checkout on your own site, take this link to [step 2](#2-show-the-checkout). To try your page first, use the [samples](#test-your-page-without-money): they need no money.

## Quickstart: the checkout on your site

The payment on your own page, in six steps. Steps 1 to 3 are copy and paste; steps 4 and 5 are for a developer.

1. Create a link in **Crypto processing → Payment links → Create payment link**.
2. Open **Crypto processing → Developers**, paste the link under **Show the checkout on your site**, choose **Button** and copy the code into your page.
3. Test it without money: in the code, put `demo-awaiting` in place of the link's code (the part after `/pay/`), open your page, press the button, then **Send the payment (sample)** in the checkout. Your page receives `READY`, `AWAITING_PAYMENT`, `PAYMENT_DETECTED` and `PAID`, every one with `livemode: false` ([Test your page without money](#test-your-page-without-money)).
4. In `onComplete` (and `onStatusChange`), post `payload.payments` to your server with your order's ID.
5. Your server checks each reported transfer with Unigox, with `verifyTransfers()` and `isPaid()` of [Confirm without the key](#confirm-without-the-key), and marks the order paid from its own order record, never from the browser.
6. Put the real link back and make one small real payment ([Test before you go live](#test-before-you-go-live)).

To make each order's link on your server instead of in the portal, see [Option B: from your server](#option-b-from-your-server).

## What you need

- Crypto processing turned on for your business account. Unigox turns it on; the **Crypto processing** section then appears in your business portal.
- Your Unigox wallet address. It owns your payment addresses and receives every payment. The portal's **Developers** page shows it.
- The address of the Unigox payments API, `UNIGOX_PAYMENTS_API` in the code below. Copy it from **Crypto processing → Developers**, where **Environment** shows it as **API address**, and keep it in your configuration, not in code: it can change. Staging has its own address, which Unigox gives you with staging access (see "Test before you go live").
- To make payment links from your own server, or to read your payment history there: that wallet's private key. There is no separate API key: reserving addresses and reading history are both signed with the wallet's key. Unigox exports it only on request: write to support@unigox.com (the portal's **Developers** page has an **Ask for the key** button that fills in your wallet). Once Unigox has turned export on, the settings of your Unigox account (the gear) show **Export Private Key**: the key opens in a secure window for you to copy. Unigox never sends the key by email or chat, and never asks you for it. Without it, create payment links in the portal (step 1, option A), follow their payments in the portal's **Payments** view, and confirm them on your server with the public status read ([Confirm without the key](#confirm-without-the-key)).
- Guard that key like the money itself: it is the key of your whole Unigox wallet: whoever holds it can move every balance the wallet collects, and every other balance in that wallet too. A server that holds it is a hot wallet. Keep it in a secrets manager, KMS or HSM on the server that signs (never in browser code, a repository or a log), keep that wallet's balance low and move collected balances out of it regularly. To keep collections apart from your other money, ask Unigox support about a separate Unigox login that only collects payments.
- No notifications to your server yet, and you do not need to build a receiver: production callbacks are off (`GET /config` answers `memoLimits.maxCallbackUrlBytes: 0` and an empty `webhookKeys`). Your server finds out about a payment by reading its status (step 4), from your return page and from a periodic job.
- The low-level reference, for exact types and complete examples: [Payment addresses for your own payment page](https://developers.unigox.com/tutorials/crypto-payments) and the [API reference: payment addresses](https://developers.unigox.com/api-reference/payment-addresses). Endpoint paths below are relative to `UNIGOX_PAYMENTS_API`.

## 1. Create the payment

A payment is a payment link: an amount, your reference and an address on each network. You make it in the portal (option A, below), or your server makes it ([option B](#option-b-from-your-server), which needs your wallet's private key).

### Option A: in the portal

Open **Crypto processing → Payment links → Create payment link**, enter the reference and the amount, and copy the link. The portal creates the link and its payment addresses for you; the link is `https://www.unigox.com/pay/{token}`. The [Payment links guide](https://www.unigox.com/crypto-processing/help/payment-links) explains every option.

In **Settings**, **Support email for payers** puts your support address on every link you copy from that browser afterwards. The payer sees it on the screens that ask them to contact you, for example after an underpayment or a transfer that could not be credited.

For a customer who pays you again and again, open **Crypto processing → Deposit addresses → Add a customer** instead. The customer gets permanent addresses and one page that lists their deposits. Your own server can do the same: see [Customer deposit addresses](#customer-deposit-addresses).

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

These links take no callbacks: your page hears nothing about the payment, so nothing reaches your server from it. Confirm such a payment in the portal's **Payments**, from a transaction hash your customer gives you, or with your signed history ([4. Confirm the payment on your server](#4-confirm-the-payment-on-your-server)). When your server should confirm from the page's events, use `UnigoxCheckout.create()` with callbacks instead.

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
| `walletNavigation` | `"checkout"` | **Planned, does nothing yet.** `"host"` will let your page open the payer's wallet app (`onOpenWallet`) instead of the checkout, for a page inside an app's WebView. Today the checkout ignores it and opens the wallet itself; [Changes](#changes) will say when it works |

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

The checkout shows your customer four steps. Each sample below is the real page with a made-up merchant and no address anyone can pay ([Test your page without money](#test-your-page-without-money) lists every one):

1. **Choose the coin and the network** they will send on ([`/pay/demo`](https://www.unigox.com/pay/demo)). A link that offers one coin on one network skips this step.
2. **Send the amount to the address**: the address, the exact amount, a QR code, and **Copy address** and **Copy amount** ([`/pay/demo-awaiting`](https://www.unigox.com/pay/demo-awaiting)). No memo or tag is needed.
3. **Payment detected**, then **Confirming your payment**, while the transfer confirms on its network ([`/pay/demo-detected`](https://www.unigox.com/pay/demo-detected)).
4. **Payment completed** once it is credited ([`/pay/demo-paid`](https://www.unigox.com/pay/demo-paid)), with **Print receipt** on the hosted page (a checkout.js frame cannot open the print dialog), and "Back to {merchant}" when the link has a `returnUrl`.

![The checkout in a window over a shop's page, on a computer](https://www.unigox.com/crypto-processing/help/checkout-modal.png)

![The checkout shown inside the page of a shop](https://www.unigox.com/crypto-processing/help/checkout-inline.png)

![The checkout on a phone, full screen](https://www.unigox.com/crypto-processing/help/checkout-phone.png)

A customer's deposit page ([`/pay/demo-topup`](https://www.unigox.com/pay/demo-topup)) asks for no amount and lists **Your recent deposits**. Send customers who need help to [How to pay a payment link](https://www.unigox.com/crypto-processing/help/how-to-pay), or, for a deposit page, to [How to add funds with a deposit page](https://www.unigox.com/crypto-processing/help/how-to-deposit), and see [When a payment is not exact](https://www.unigox.com/crypto-processing/help/exceptions) for what they see when it is not.

## 4. Confirm the payment on your server

Fulfil an order only when your server has seen the payment credited. There are two ways to see it. Both read the payment's status from Unigox and apply the same rule:

| Way | Needs | Sees |
| --- | --- | --- |
| [Confirm without the key](#confirm-without-the-key) | Nothing secret: the link's memo, its address IDs and your wallet address | The transfers your page reports, and any transfer whose hash you are given |
| [History](#fulfilinvoicememolockid), `fulfilInvoice` | Your wallet's private key | Every payment to the link's address IDs |

Unigox does not notify your server of a payment yet: run your check from your return page and from a periodic job for every open order. You do not need to build a notification receiver. [Notifications to your server (not available yet)](#notifications-to-your-server-not-available-yet) says what changes once Unigox turns them on for you.

The statuses a payment goes through, with the event your page receives for each:

```
choosing ─▶ awaiting_payment ─▶ detected ─▶ confirming ─▶ paid           UNIGOX_CHECKOUT_PAID (onComplete)
  CHOOSING    AWAITING_PAYMENT    PAYMENT_DETECTED         ├─▶ overpaid   UNIGOX_CHECKOUT_OVERPAID (onComplete)
                                                           ├─▶ underpaid  UNIGOX_CHECKOUT_UNDERPAID: the rest can still come, then paid
                                                           ├─▶ on_hold    UNIGOX_CHECKOUT_ON_HOLD: under review, then paid or failed
                                                           └─▶ failed     UNIGOX_CHECKOUT_FAILED: not credited, or being returned
awaiting_payment ─▶ expired      the pay-by date passed with nothing received   UNIGOX_CHECKOUT_EXPIRED
credited after the pay-by date ─▶ paid_late                                      UNIGOX_CHECKOUT_PAID_LATE (onComplete)
```

| Status | What it means | What your server does |
| --- | --- | --- |
| `choosing`, `awaiting_payment` | The payer is choosing, or the address and amount are shown | Nothing yet |
| `detected`, `confirming` | A transfer is on its network, not credited | Nothing yet: it can still fail |
| `paid` | Credited in full, or short by at most 0.5 % and never more than 1.00 USD | Check it with Unigox, then fulfil |
| `overpaid` | Credited, more than the amount | Fulfil; keep the extra or send it back |
| `underpaid` | Credited, short by more than the tolerance | Wait for the rest, or decide to fulfil anyway |
| `paid_late` | Credited after the pay-by date | Your own deadline decides |
| `on_hold` | Received, under review by Unigox; not in your wallet | Wait |
| `failed` | Not credited, or being returned | Do not fulfil; see [When a payment is not exact](https://www.unigox.com/crypto-processing/help/exceptions) |
| `expired` | The pay-by date passed and nothing came | Make a new link if the order still stands |

### Confirm without the key

Every transfer has a public status: `GET /transaction/{fromChain}/{fromTx}` answers without a signature, with the address ID (`memoLockId`) and memo fingerprint (`memoHash`) the transfer was paid under, the wallet it was credited to, and whether it was credited. So your server can check each transfer your page heard about, and count only what it proved itself. This works for payment links made in the portal: keep the link's memo, its address IDs and your wallet address with your order (the portal's **Developers** page shows them for a link you paste there).

Your page posts the `payments` of a checkout event to your server (from `onStatusChange` or `onComplete`, or `payload.payments` of a message your own frame received); your server runs the code below.

- **What it does:** asks Unigox about each transfer the page reported, and keeps only the ones credited to your wallet under this link's reference text and address IDs.
- **What you keep:** the link's reference text, its address IDs and your wallet address with the order, and each transfer ID you counted.
- **What can go wrong:** a transfer that is not indexed yet, or a moment when Unigox cannot be read, is skipped this time: run the check again on the next event and from a periodic job.

An answer of `GET /transaction/{fromChain}/{fromTx}?quoteId=…` for a credited payment looks like this (the fields `verifyTransfers()` reads, and the ones around them; values shortened, and other fields can appear):

```json
{
  "status": "found",
  "code": 200,
  "data": {
    "quoteId": "<transfer ID>",
    "fromChain": "42161",
    "fromTx": "0x5f2c…9a41",
    "fromToken": "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
    "fromAmount": "250000000",
    "toChain": "660279",
    "toToken": "<the coin's address on UNIGOX_BALANCE_CHAIN_ID, from GET /config>",
    "toAmount": "250000000",
    "actualToAmount": "250000000",
    "recipientAddress": "<your wallet address>",
    "toTx": "0x81d0…c3e7",
    "status": "DONE",
    "subStatus": "COMPLETED",
    "refund": null,
    "memo": null,
    "memoLockId": "27",
    "memoHash": "<keccak256 of the link's reference text>",
    "depositAddress": "<the link's payment address>"
  }
}
```

`memo` is `null`: the public status never returns your reference text, only its fingerprint `memoHash`. Amounts are whole numbers in the coin's smallest unit: for a coin with 6 decimals in `GET /config`, `250000000` is 250.00.

```js
// Node 18+ with viem (for keccak256). No key and no signature: every read is the public GET /transaction.
import { keccak256, toBytes } from "viem";

const UNIGOX_PAYMENTS_API = process.env.UNIGOX_PAYMENTS_API; // the API address on the Developers page
const UNIGOX_BALANCE_CHAIN_ID = 660279;                    // fixed: marks a payment credited to your Unigox wallet; copy as is

// One read of the Unigox payments API, at most 10 seconds: its JSON when the answer is ok and its status is `want`, else an error.
async function unigoxGet(path, want) {
  const response = await fetch(`${UNIGOX_PAYMENTS_API}${path}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.status !== want) throw new Error(`Unigox ${path}: HTTP ${response.status}, ${body?.status ?? "no JSON"}`);
  return body;
}

// Credited, the way the checkout reads it: DONE and completed, nothing refunded.
const settled = (tx) => tx.status === "DONE" && (tx.subStatus === "COMPLETED" || (!tx.subStatus && tx.toTx)) && !tx.refund;

// order: your own record of the link, e.g. { wallet: "0x…", memo: "NW-20418 · 250.00 USD · v2", lockIds: ["27", "28"],
//   amount: "250.00", tolerance: "default" }. reported: the `payments` your page received; never trusted, each one is
//   read again here. Returns the credits it proved, one per transfer: [{ id, micros }].
export async function verifyTransfers(order, reported) {
  const memoHash = keccak256(toBytes(order.memo));
  const config = await unigoxGet("/config", "fetched");
  const settlement = config.data.find((c) => Number(c.chainId) === UNIGOX_BALANCE_CHAIN_ID)?.tokens.filter((t) => t.active && !t.native && /^USD/.test(t.symbol)) ?? [];
  const credits = new Map();
  for (const p of (Array.isArray(reported) ? reported : []).slice(0, 200)) {
    if (!Number.isSafeInteger(p?.chainId) || typeof p.txHash !== "string" || !/^[\w-]{8,128}$/.test(p.txHash)) continue;
    const pick = typeof p.quoteId === "string" ? `?quoteId=${encodeURIComponent(p.quoteId)}`
      : typeof p.logIndex === "string" ? `?logIndex=${encodeURIComponent(p.logIndex)}` : "";
    let tx;
    try {
      tx = (await unigoxGet(`/transaction/${p.chainId}/${encodeURIComponent(p.txHash)}${pick}`, "found")).data;
    } catch {
      continue;                                            // not indexed yet, or Unigox cannot be read: ask again later
    }
    if (!order.lockIds.includes(String(tx.memoLockId))) continue;                    // one of this link's address IDs
    if (tx.memoHash?.toLowerCase() !== memoHash) continue;                            // under this link's memo
    if (tx.recipientAddress?.toLowerCase() !== order.wallet.toLowerCase()) continue;  // credited to your wallet
    if (Number(tx.toChain) !== UNIGOX_BALANCE_CHAIN_ID || !settled(tx)) continue;
    const token = settlement.find((t) => t.address.toLowerCase() === tx.toToken?.toLowerCase());
    if (!token) continue;
    // Amounts are integer strings in base units: to micro-USD with the token's decimals, in BigInt.
    const units = BigInt(tx.actualToAmount ?? tx.toAmount);
    const decimals = Number(token.decimals);
    const micros = decimals >= 6 ? units / 10n ** BigInt(decimals - 6) : units * 10n ** BigInt(6 - decimals);
    credits.set(tx.quoteId, { id: tx.quoteId, micros });  // the same transfer reported twice counts once
  }
  return [...credits.values()];
}

// Paid as the checkout grades it: short by at most 0.5 % of the amount and never more than 1.00 USD, or nothing short
// for a link made with "full amount only" (tolerance "none").
export function isPaid(order, creditedMicros) {
  const [whole, fraction = ""] = order.amount.split(".");
  const due = BigInt(whole + fraction.padEnd(6, "0"));
  const allowed = order.tolerance === "none" ? 0n : due / 200n < 1_000_000n ? due / 200n : 1_000_000n;
  return creditedMicros >= due - allowed;
}
```

Then, in one database transaction, count each credit `id` (the transfer's `quoteId`) once per environment, add it to the order, and mark the order paid with one conditional update when `isPaid` holds, exactly as `fulfilInvoice` below does. A transfer that is not credited yet (`PENDING`, `PROCESSING`, on hold) is simply not counted: run `verifyTransfers` again on the next event, from your return page and from a periodic job while the order is open.

What it cannot see: a transfer your page never heard about. A customer who pays from another device, or closes the page before your page posted the event, or pays from a link you sent by email (the hosted page reports to no page of yours), is not seen. For those, look the payment up in the portal's **Payments**, or ask the customer for the transaction hash and pass `{ chainId, txHash }` to `verifyTransfers`. History (below) sees every payment, and needs the key.

### `fulfilInvoice(memoLockId)`

Call it from your return page and from a periodic job that runs it every few minutes for each open order (with any of its address IDs). It reads the payment's records from your wallet's history, so it gives the same answer whichever source triggered it. When Unigox cannot be read or a payment is not in history yet, it throws or leaves the order open, and the next pass tries again: nothing is dropped. It marks each order paid once, also when the return page and the periodic job run it at the same moment.

- **What it does:** reads every payment to the order's address IDs from your signed history and marks the order paid once they cover the amount.
- **What you keep:** the order's amount, tolerance, addresses and address IDs, and each payment you counted.
- **What can go wrong:** when Unigox cannot be read, it throws and the order stays open; the next pass pays it.

```js
// Node 20+. Your server holds your wallet's key: signHistory() returns { chainId, authorization, signature }, the History
// type signed with your wallet and reused until it expires. The API reference has the signing code; its domain name is a
// fixed signature label ("Unigox Bridge History"): type it exactly.
// UNIGOX_PAYMENTS_API: the API address on the Developers page, as in "Confirm without the key".
const ENVIRONMENT = "production";                         // one ledger per environment
const WALLET = "0x…";                                      // your wallet

// One read of the Unigox payments API, at most 10 seconds: its JSON when the answer is ok and its status is `want`, else an error.
export async function unigoxCall(path, want, init = {}) {
  const response = await fetch(`${UNIGOX_PAYMENTS_API}${path}`, { cache: "no-store", ...init, signal: AbortSignal.timeout(10_000) });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.status !== want) throw new Error(`Unigox ${path}: HTTP ${response.status}, ${body?.status ?? "no JSON"}`);
  return body;
}

async function readHistory(query) {
  const { data } = await unigoxCall("/transactions/history", "history_retrieved", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(await signHistory()), query }),
  });
  if (!Array.isArray(data?.transactions)) throw new Error("Unigox /transactions/history: no transactions");
  return data;
}

const UNIGOX_BALANCE_CHAIN_ID = 660279;                    // fixed: marks a payment credited to your Unigox wallet; copy as is

// Credited, the way the checkout reads it: DONE and completed, nothing refunded.
const settled = (tx) => tx.status === "DONE" && (tx.subStatus === "COMPLETED" || (!tx.subStatus && tx.toTx)) && !tx.refund;

export async function fulfilInvoice(memoLockId) {
  const order = await db.orderByLockId(memoLockId);        // your own record: amount, tolerance, addresses, address IDs, status
  if (!order || order.status === "paid") return;
  const config = await unigoxCall("/config", "fetched");   // throws when Unigox cannot be read: the next pass retries
  if (!Array.isArray(config.data)) throw new Error("Unigox /config: no chains");
  const settlement = config.data.find((c) => Number(c.chainId) === UNIGOX_BALANCE_CHAIN_ID)?.tokens.filter((t) => t.active && !t.native && /^USD/.test(t.symbol)) ?? [];

  // An order paid on several networks has one address ID per address type: read each.
  const payments = [];
  for (const lockId of order.lockIds) {
    let before;
    do {
      const { transactions, nextBefore } = await readHistory({ memoLockId: lockId, limit: 100, ...(before ? { before } : {}) });
      for (const tx of transactions) {
        const token = settlement.find((t) => t.address.toLowerCase() === tx.toToken?.toLowerCase());
        if (!settled(tx) || !token || Number(tx.toChain) !== UNIGOX_BALANCE_CHAIN_ID) continue;
        if (tx.recipientAddress?.toLowerCase() !== WALLET.toLowerCase()) continue;
        // One of this order's collection addresses (EVM in any letter case, the others exactly).
        if (!order.addresses.some((a) => a === tx.depositAddress || (a.startsWith("0x") && a.toLowerCase() === tx.depositAddress?.toLowerCase()))) continue;
        // Amounts are integer strings in base units: keep them in BigInt.
        const units = BigInt(tx.actualToAmount ?? tx.toAmount);
        const micros = token.decimals >= 6 ? units / 10n ** BigInt(token.decimals - 6) : units * 10n ** BigInt(6 - token.decimals);
        payments.push({ intentId: tx.intentId, micros });
      }
      before = nextBefore;
    } while (before);
  }

  // One database transaction: each (environment, intentId) counts once, and the order changes with it.
  await db.transaction(async (q) => {
    for (const p of payments) if (await q.claimIntentOnce(ENVIRONMENT, p.intentId, order.id)) await q.addCredited(order.id, p.micros);
    // The checkout's tolerance: short by at most 0.5 % of the amount, never more than 1.00 USD (1_000_000 micro-USD),
    // or nothing short for a link made with "Full amount only" (tolerance "none", kept in your order record).
    const due = BigInt(order.amountMicroUsd);
    const allowed = order.tolerance === "none" ? 0n : (due / 200n < 1_000_000n ? due / 200n : 1_000_000n);
    // markPaid is one conditional update, UPDATE orders SET status = 'paid' WHERE id = $1 AND status <> 'paid', and
    // returns whether it changed the row: of passes running at the same moment, only one queues the shipment.
    if (BigInt(await q.creditedTotal(order.id)) >= due - allowed && await q.markPaid(order.id)) await q.queueShipment(order.id);
  });
}
```

- Count each `(environment, intentId)` once, in the same database transaction as the order update. One source transaction can hold several payments, each with its own `intentId`.
- Keep one ledger per order. `verifyTransfers()` counts a payment by its `quoteId` and `fulfilInvoice()` by its `intentId`: never let both add to the same order, or one payment counts twice. To use both, key both by `quoteId`, which history records carry too.
- Mark the order paid with one conditional update and ship only when that update changed the row. Checking `order.status` before the transaction is not enough: two passes that start together both see the order open.
- Compare with your order's amount, not with the token or anything the browser said.
- The checkout counts a payment short by at most 0.5 % of the amount, and never more than 1.00 USD, as paid: it shows Payment completed and sends `UNIGOX_CHECKOUT_PAID`. The code above applies the same rule, so your server and the payer's screen agree. Keep the link's tolerance with your order: `"none"` for a link made with **Full amount only** (in the portal) or with `tol: "none"` in its token, `"default"` otherwise. For such a link the checkout itself asks the payer for the rest of any shortfall, and the code above allows none.
- A larger shortfall leaves the order open: the customer can send the rest to the same address. More than the amount is credited as received.
- A record's `status` is `CREATED`, `PENDING`, `PROCESSING`, `DONE`, `FAILED`, `DEFERRED`, `COMPLIANCE_HOLD` or `COMPLIANCE_FROZEN`. A `DONE` record's `subStatus` is `COMPLETED`, `PARTIAL` or `REFUNDED`. Only `DONE` with `COMPLETED` and no `refund` is a credit (an older record can be `DONE` without a `subStatus`: it is a credit when it has a `toTx`, as `settled` reads it and the checkout shows it); `PENDING`, `PROCESSING`, `DEFERRED` and the two compliance states can still become one.
- Records can be pending and settle later without a new id. A periodic pass starts again without `before`.
- A payment's `quoteId` and `fromTx` also let you read one transfer with `GET /transaction/{fromChain}/{fromTx}?quoteId=`. That answer is not final either: 404 `from_tx_not_found` means the transfer is not indexed yet, `status: "not_fetched"` that Unigox could not read it, and a credit without `fromTx` cannot be looked up there at all. Leave such an order to the periodic pass; never mark the event done and forget the order.

### History for everything else

`POST /transactions/history` covers every payment, including payments after an address was reused. Filter by `memoLockId` for one payment, or by `chainType` and `depositAddress` for everything an address received, including a deposit-address customer across every address ID. With `includeMemo: true` your own memos come back, so you can group deposits by memo.

### The portal's CSV exports

The portal writes three files, with English column names in every language so that a script can read them, and times in the zone you choose (UTC unless you choose your own) with a `timezone` column:

- **Payments → Export CSV** asks which columns: **Readable**, for people (named in the [Payments help](https://www.unigox.com/crypto-processing/help/payments#export-csv)), in `crypto-payments-<from>-<to>.csv`, or **For developers**, the columns and codes below, in `crypto-payments-dev-<from>-<to>.csv`. `<from>` is `all` and `<to>` today when no period is set. The developer columns are `reference`, `status`, `amount_due_usd`, `received`, `expected`, `coin`, `source_coin`, `source_amount`, `source_network`, `source_tx`, `transfer`, `credit_tx`, `seen_at`, `credited_at`, `sender`, `address_id`, `deposit_address`, `payment_key`, `source`, `amount_check`, `link_received_usd`, `link_gap_usd`, `credited_amount`, `credited_coin`, `refund_tx`, `sent_at_recorded_by`, `timezone`, `environment`, `date_basis` and `date`. `address_id` is the receiving address's ID; `transfer` numbers the transfers of one source transaction; `payment_key` is the **Payment ID** of the readable file; `source` is `payment_link`, `deposit_address` or `other_credit`.
- **Payment links → Export CSV** writes `crypto-payment-links-<open|paid|closed|all>-<YYYY-MM-DD>.csv`, one row per link. Its developer columns are `reference`, `amount_usd`, `received_usd`, `remaining_usd`, `status`, `paid_late` (`yes` or `no`), `pay_by`, `tolerance` (`default`, `none`, or `not_recorded` for a link whose terms were not saved), `description`, `created_at`, `closed_at`, `payments` (how many), `address_ids` (the link's payment address IDs, separated by spaces), `timezone`, `coins` and `networks` (separated by `;`, or `all`), and `payment_link` (the link itself). Its `status` is one of the link statuses `awaiting`, `detected`, `hold`, `failed`, `refunding`, `paid`, `underpaid`, `overpaid` and `unknown` (its payments were not loaded), or `closed_unpaid` (closed before it was paid) or `closing_unfinished` (closing stopped part way: open the link and press **Finish closing**).
- **Deposit addresses → Export CSV** asks the same: **Readable** columns (named in the [Payments help](https://www.unigox.com/crypto-processing/help/payments#export-deposit-addresses)) in `crypto-deposit-addresses-<YYYY-MM-DD>.csv`, or **For developers** in `crypto-deposit-addresses-dev-<YYYY-MM-DD>.csv`, one row per customer and address type. The developer columns are `customer`, `reference_text`, `status`, `created_at`, `archived_at`, `address_type`, `address`, `address_id`, `address_status`, `customer_total_deposits`, `customer_total_credited_usd`, `customer_total_credited_by_coin`, `customer_total_in_progress`, `customer_total_on_hold`, `last_deposit_at`, `history_complete` and `timezone`, with the codes below. The `customer_total_*` columns and `last_deposit_at` are written on the customer's first row only, so a column sum counts each customer once.

| Column | Code | Meaning |
| --- | --- | --- |
| `status` (payments) | `paid` | Credited, and the payments under its reference cover the amount due, or fall short by at most 0.5 % and never more than 1.00 USD |
| | `underpaid` | Credited, but the payments under its reference are short of the amount due by more than that |
| | `overpaid` | Credited, and the payments under its reference add up to more than the amount due |
| | `credited` | Credited, with no amount to compare: a top-up, a transfer without one of your payment references, or a link whose earlier payments are older than the loaded history |
| | `detected` | Seen on its network, not credited yet |
| | `crediting` | Being credited to your wallet |
| | `hold` | Under review: Unigox is reviewing the transfer. It is not in your wallet until it is released. How long a review takes depends on the case, and Unigox support can tell you where it stands; Unigox may contact you for details about the payment. If the money is not released, Unigox support tells you what happens to it |
| | `failed` | Not credited, and not being sent back: contact Unigox support with the source transaction |
| | `refunding` | Not credited, and being returned. If the payer sent from an exchange, the return can reach the exchange's own wallet rather than the payer's account: ask the payer for an address they control and tell Unigox support |
| | `refunded` | Not credited: it was returned. A payer who sent from an exchange gives the return's transaction hash to the exchange's support |
| `status` (deposit addresses) | `active`, `archived` | The customer's deposit addresses are in use, or were archived |
| `address_type` | `evm`, `tvm`, `ton`, `svm` | The address type: Ethereum-style networks, TRON, TON, Solana |
| `address_status` | `active` | The address takes this customer's deposits |
| | `archived` | You archived the address: a transfer to it now carries no reference |
| | `ended_by_unigox` | Unigox ended the address's reservation (the portal shows **No longer in use**). Transfers to it still reach your wallet, without this customer's reference: use **Add network** on the customer to give them a new address there, and send the customer their new page |
| `history_complete` | `yes`, `no` | `no`: the customer's deposits may go back further than the history the portal loaded, so `customer_total_deposits` is a floor and `customer_total_credited_usd` is empty |

## Make payment links on your server

Without code you make each order's link in the portal (option A). To make a link for every order automatically, your server reserves the payment addresses itself and builds the link. That needs your Unigox wallet's private key, which Unigox exports on request: whoever holds it can move the wallet's money ([What you need](#what-you-need)).

### Option B: from your server

> **Is this for you?** What you gain: a payment link made for every order automatically, with nobody copying links from the portal. What it costs: a developer; your Unigox wallet's private key on your server, a key that can move every balance in that wallet; and a job that checks your open orders every few minutes. The alternative: make each link in the portal (**Payment links → Create payment link**) and paste it into your button or email. That needs no key and no code beyond the button. [Server integration in one page](#server-integration-in-one-page) shows the whole path in one file.

Your server makes the link of each order itself, in seven steps. Here a payment is your memo (the reference text, see [Words used in this guide](#words-used-in-this-guide)) reserved on one payment address for each address type you accept (`evm` for every Ethereum-style network, `tvm` for TRON, `ton`, `svm` for Solana), and a link that tells the checkout what to show. Each step ends with what you should see; the cases you meet less often are under "If something goes wrong". A complete example for one customer's deposit page is under [Customer deposit addresses](#customer-deposit-addresses).

1. **Ask Unigox for your wallet key.** Your server signs every request with the private key of your Unigox wallet ([What you need](#what-you-need) explains how to get it and how to keep it). What you should see: your server signs with the wallet address the **Developers** page shows.

2. **Get an address for the order.** One request makes a new payment address and reserves it for the order's memo. Each request is EIP-712 typed data signed by your wallet, with a fresh 32-byte nonce and a deadline taken from `GET /config`. Your server keeps the signed request with the order before it sends it, and then the answer: the address, its address ID and the networks that are ready. Call it once for each address type you accept. Type the request path and the signing domain's name exactly as the code has them.

   - **What it does:** asks Unigox for a new payment address and sets it aside for this order's reference text, signed with your wallet's key.
   - **What you keep:** the signed request, from before you send it; then the address, its address ID and its `monitoring` (which networks are ready), with the order. An address that came back without its reservation (401 `memo_lock_signature_expired` below): keep it too, before you reserve its memo.
   - **What can go wrong:** a lost answer or a refused request; see "If something goes wrong" below. After a lost answer send the request you kept again (`reserveAddress(chainType, memo, signed)`): never sign a second request for the same order before you know the first failed. Once it did fail for good (401 `memo_lock_signature_expired`), the kept request is spent: reserve the address it names with `reserveMemo()`, or sign a new request when it names none.

   ```js
   // Node 20+ with viem: walletClient and account are your wallet's (viem's signTypedData). Your server holds the key.
   const UNIGOX_PAYMENTS_API = process.env.UNIGOX_PAYMENTS_API; // the API address on the Developers page
   const WALLET = "0x…";                                         // your Unigox wallet address
   const ENVIRONMENT = "production";                             // or "staging", as the Developers page shows
   // Fixed signature label: type this name exactly. It identifies the signing scheme; nothing else in your integration uses it.
   const domain = { name: "Unigox Bridge Memo Locks", version: "1", chainId: 42161 };
   const types = {
     AllocateAndLock: [
       { name: "action", type: "string" }, { name: "wallet", type: "address" },
       { name: "environment", type: "string" }, { name: "chainType", type: "string" },
       { name: "memo", type: "string" }, { name: "expiresAt", type: "uint64" },
       { name: "callbackUrl", type: "string" }, { name: "nonce", type: "bytes32" },
       { name: "deadline", type: "uint64" },
     ],
     Lock: [ // reserves a memo on an address you already have: the same fields, plus the address after chainType
       { name: "action", type: "string" }, { name: "wallet", type: "address" },
       { name: "environment", type: "string" }, { name: "chainType", type: "string" },
       { name: "depositAddress", type: "string" }, { name: "memo", type: "string" },
       { name: "expiresAt", type: "uint64" }, { name: "callbackUrl", type: "string" },
       { name: "nonce", type: "bytes32" }, { name: "deadline", type: "uint64" },
     ],
   };
   const nonce = () => "0x" + Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");

   // The signed request for a new payment address of one address type ("evm", "tvm", "ton" or "svm"), reserved for this
   // memo. Keep it with the order before reserveAddress() sends it: after a lost answer the same request is sent again,
   // and no second request is ever signed for an order that may already have its address.
   export async function allocationRequest(chainType, memo) {
     const { memoLimits } = await (await fetch(`${UNIGOX_PAYMENTS_API}/config`, { cache: "no-store" })).json();
     const message = {
       action: "allocate_and_lock", wallet: WALLET, environment: ENVIRONMENT, chainType, memo,
       expiresAt: "0",  // no end: the memo stays on the address until you end the reservation
       callbackUrl: "", // callbacks are off in production: confirm through step 6
       nonce: nonce(),  // fresh here and only here: the kept request carries it through every resend
       // 30 s inside the limit: a server whose clock runs a second ahead would refuse a deadline right at the edge.
       deadline: String(Number(memoLimits.serverTimeSeconds) + Number(memoLimits.maxWriteDeadlineSeconds) - 30),
     };
     const signature = await walletClient.signTypedData({ account, domain, types, primaryType: "AllocateAndLock", message });
     return { chainId: domain.chainId, message, signature };    // the request body, exactly as it is sent
   }

   // A new payment address, reserved for the memo. `signed` is the request you kept: sent again as it is, also after its
   // deadline, Unigox answers with the address and reservation it made the first time. Without `signed` it signs a new
   // request itself, so a lost answer cannot be sent again and a second call makes a second address: pass the request
   // you kept whenever your server keeps the order's state (server.mjs below does).
   export async function reserveAddress(chainType, memo, signed = null) {
     signed ??= await allocationRequest(chainType, memo);
     const response = await fetch(`${UNIGOX_PAYMENTS_API}/memo-locks/allocate`, {
       method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(signed),
     });
     const result = await response.json();
     const made = result.data?.allocated?.[0];
     if (!response.ok || made?.lock?.status !== "ACTIVE") {
       // The error carries the answer: `code` is Unigox's reason, `allocated` the address the request made when the answer
       // names one. After 401 memo_lock_signature_expired the kept request is spent: with `allocated`, the deadline passed
       // before the memo was reserved, so reserve it with reserveMemo(); without, the request never took effect, so sign
       // a new one (its nonce was never used: no second address).
       const code = result.details ?? result.status ?? `HTTP ${response.status}`;
       throw Object.assign(new Error(code), { code, allocated: made ? { address: made.address, monitoring: made.monitoring } : null });
     }
     // Keep these with the order: step 4 builds the link from them, step 6 confirms with them.
     return { address: made.address, addressId: made.lock.lockId, monitoring: made.monitoring };
   }

   // Reserves the memo on an address you already have (signed `Lock`, a fresh nonce each time): the address a 401
   // memo_lock_signature_expired answer named, or one you reuse (see "If something goes wrong"). Returns what
   // reserveAddress() returns. A lost answer here cannot be resent (409 memo_lock_nonce_used): read the address's newest
   // reservation (newestReservation() in step 3) before you sign another; one that shows your memo went through.
   export async function reserveMemo(chainType, address, memo) {
     const { memoLimits } = await (await fetch(`${UNIGOX_PAYMENTS_API}/config`, { cache: "no-store" })).json();
     const message = {
       action: "lock", wallet: WALLET, environment: ENVIRONMENT, chainType, depositAddress: address, memo,
       expiresAt: "0", callbackUrl: "", nonce: nonce(),
       deadline: String(Number(memoLimits.serverTimeSeconds) + Number(memoLimits.maxWriteDeadlineSeconds) - 30),
     };
     const signature = await walletClient.signTypedData({ account, domain, types, primaryType: "Lock", message });
     const response = await fetch(`${UNIGOX_PAYMENTS_API}/memo-locks/lock`, {
       method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chainId: domain.chainId, message, signature }),
     });
     const result = await response.json();
     const lock = result.data?.lock;
     if (!response.ok || lock?.status !== "ACTIVE") throw new Error(result.details ?? result.status ?? `HTTP ${response.status}`);
     return { address, addressId: lock.lockId, monitoring: result.data.monitoring };
   }

   const memo = `${order.reference} · ${order.amount} USD`; // e.g. "NW-20418 · 250.00 USD"
   const signed = await allocationRequest("evm", memo);
   await db.keepAllocationRequest(order.id, "evm", signed);  // before it is sent: a lost answer is resumed from here
   const evm = await reserveAddress("evm", memo, signed);
   ```

   Write the memo as `<your order reference> · <amount> USD`, for example `NW-20418 · 250.00 USD`: the reference, a space, a middle dot (`·`, U+00B7), a space, the amount (up to 12 digits, a point and up to two decimals), a space and `USD`. The whole memo is at most 256 UTF-8 bytes. The portal reads that format back, and the checkout refuses a link whose amount differs from the amount in the memo. A memo in any other form (another separator, a comma in the amount, another currency) is taken as a memo without an amount: the checkout then has nothing to check the link's amount against, and shows whatever amount the link says.

   The memo text stays private (only your wallet reads it back), but its fingerprint is public in transaction status. Anyone who can guess a memo, for example an order number and its amount, can tell which public transfer paid it. And anyone who holds one of your links knows your wallet, so they can ask Unigox's public link check ([Headless](#headless-your-own-payment-page) gives its address) whether a guessed memo is reserved, and learn its address and state. Keep personal data out of the reference, and add a random part to it, for example `NW-20418-k3f9q2`.

   What you should see: HTTP 200 `memo_locked` (or 202 `addresses_preparing`, step 3) and an address with an address ID.

   **Callback address.** Getting an address and reserving one both sign a `callbackUrl`. Notifications to your server are not available yet, so sign `callbackUrl: ""` and confirm payments as [4. Confirm the payment on your server](#4-confirm-the-payment-on-your-server) shows. Any other value is refused with 400 `validation_callback_url_invalid` and nothing is reserved. [Notifications to your server (not available yet)](#notifications-to-your-server-not-available-yet) says what changes once Unigox turns them on for you.

   **If something goes wrong:**
   - **An answer is lost** (a timeout, a dropped connection, a 5xx). Do not sign a new request for the same order. To get an address, send the same signed body again, with the same nonce, also after its deadline (`reserveAddress(chainType, memo, signed)` with the request you kept): it answers with the address and reservation it made the first time. Once the deadline has passed, the kept request can no longer reserve anything, and its answer tells you what it did: 401 `memo_lock_signature_expired` with the address in `data.allocated` means the address was made but its memo was not reserved; keep that address with the order, then reserve its memo with a new signed `Lock` (`reserveMemo(chainType, address, memo)` above). The same 401 with no address means the request never took effect (a connection refused, an outage): sign a new request; its predecessor's nonce was never used, so this makes no second address. A new nonce after a request that did take effect makes a second address. To reserve or end a reservation of an address you already have (`POST /memo-locks/lock`, signed `Lock`, or `POST /memo-locks/unlock`, signed `Unlock`), a resend answers 409 `memo_lock_nonce_used`, also when the first one took effect. Read the address's newest reservation with a signed `POST /memo-locks/list` (`{"chainType", "address", "limit": "1"}`; `newestReservation(chainType, address)` in step 3): if it shows your memo (reserve) or is closed (end), the request went through; if not, sign a new one with a fresh nonce and deadline. A new `Lock` on an address whose earlier `Lock` took effect answers 409 `deposit_address_already_locked` every time, so read first and sign again only when the read shows no open reservation.
   - **Environment and chain id.** `environment` is `"production"` against the production API address and `"staging"` against staging's, as the Developers page shows. A wrong one is refused with 400 `validation_environment_mismatch`. The request body's `chainId` must equal the domain's `chainId`. This chain id only names the chain your signature is made for; it has nothing to do with the networks your customers pay on. An ordinary wallet (EOA) may sign on any chain id: the examples use 42161, and the portal signs with 660279. A contract wallet (ERC-1271) must sign on a chain Unigox has enabled for contract wallets: ask Unigox which one.
   - **Reusing an address.** A new address is the safe choice. Reuse an address only when its last payment was paid in full and credited, and its reservation ended at least 7 days ago. Until the new memo is reserved, a second transfer from the same payer (a double send, an exchange retrying a withdrawal) carries no reference; once it is reserved, that transfer is credited to the new payment. The portal works this way: it takes a new address while an address type holds less than 80 % of its limit of 1,000 addresses, and only past that reuses the address of a link that was paid in full and closed at least 7 days ago, longest idle first. It never takes the address of an open link (paid or not), of a partly paid or unpaid link, or of a customer's deposit page. At the limit, write to support@unigox.com to raise it. Never use your main deposit address (address index 0): your own top-ups there would count as this payment. Never reuse an address whose payment is unpaid, part paid or closed unpaid: a late payment for it would count toward the next payment on the address.
   - **To reuse an address**, first end its earlier payment's reservation with `POST /memo-locks/unlock` (signed `Unlock`), then reserve the new memo with `POST /memo-locks/lock` (signed `Lock`, `expiresAt: "0"`): the address keeps its text and the new reservation gets a new address ID. The earlier payment's link names the ended reservation, so it now opens as closed. It shows the payment it received only in the browser that followed it; elsewhere the customer sees a closed link with no payment, so keep your own order page as the customer's receipt. Never send the old link again, and build every new payment's link from its new reservation.
   - **The signing domain.** Each request is signed under the `domain` of the code above, with a fresh 32-byte nonce and a deadline taken from `GET /config` (`memoLimits.serverTimeSeconds + memoLimits.maxWriteDeadlineSeconds`, less a margin of about 30 seconds). The [API reference: payment addresses](https://developers.unigox.com/api-reference/payment-addresses) has the exact types of `Lock`, `Unlock` and `ListLocks` and a complete example. No API key or account token is used.

3. **Wait for the networks to be ready.** A new EVM or TRON address answers `202 addresses_preparing` and takes payments only once its networks are confirmed, which can take a few minutes. Only networks with `confirmed: true` in `monitoring` take payments. The link carries the readiness it was built with and does not update by itself: a link built too early shows the payer "This payment can't be made right now". So build the link only after `waitUntilReady()` below says the address is ready, and make the order's link when the order is placed, not when the payer presses Pay. What you should see: `confirmed: true` for each network you offer.

   - **What it does:** reads the address's newest reservation with a signed `POST /memo-locks/list`, every 10 seconds, until every network is ready (`watched: true`).
   - **What you keep:** the `monitoring` it returns, for step 4.
   - **What can go wrong:** at `maxMs` it returns the networks ready by then (the link offers only those), or `null` when none is: keep the order without a link and try again later.

   ```js
   // A read signature (ListLocks, no nonce) is reused until it expires: one signature an hour, not one per read.
   const readTypes = {
     ListLocks: [
       { name: "action", type: "string" }, { name: "wallet", type: "address" },
       { name: "environment", type: "string" }, { name: "issuedAt", type: "uint64" },
       { name: "expiresAt", type: "uint64" },
     ],
   };
   let readGrant = null;
   async function readSignature() {
     const { memoLimits } = await (await fetch(`${UNIGOX_PAYMENTS_API}/config`, { cache: "no-store" })).json();
     const now = Number(memoLimits.serverTimeSeconds);
     if (readGrant && Number(readGrant.authorization.expiresAt) > now + 60) return readGrant;
     const authorization = { action: "list", wallet: WALLET, environment: ENVIRONMENT, issuedAt: String(now), expiresAt: String(now + 3600) };
     const signature = await walletClient.signTypedData({ account, domain, types: readTypes, primaryType: "ListLocks", message: authorization });
     return (readGrant = { authorization, signature });
   }

   // The address's newest reservation, from a signed POST /memo-locks/list: { lockId, wallet, memo, status, monitoring, … }
   // as the API reference lists it, or null when the address never had one. It throws when Unigox cannot be read, so a
   // caller never takes "no answer" for "no reservation". Step 2's "An answer is lost" and server.mjs read it after a
   // Lock whose answer was lost: one that shows your wallet and memo, still ACTIVE, is the reservation that Lock made.
   export async function newestReservation(chainType, address) {
     const { authorization, signature } = await readSignature();
     const response = await fetch(`${UNIGOX_PAYMENTS_API}/memo-locks/list`, {
       method: "POST", headers: { "Content-Type": "application/json" },
       body: JSON.stringify({ chainId: domain.chainId, authorization, signature, query: { chainType, address, limit: "1" } }),
     });
     const body = await response.json().catch(() => null);
     if (!response.ok || !Array.isArray(body?.data?.locks)) throw new Error(body?.details ?? body?.status ?? `HTTP ${response.status}`);
     return body.data.locks[0] ?? null;
   }

   // Waits until the address takes payments on every network (watched), at most maxMs. Returns its monitoring for
   // paymentToken(): at maxMs, the networks ready by then, or null when none is.
   export async function waitUntilReady(chainType, address, maxMs = 300_000) {
     const until = Date.now() + maxMs;
     for (;;) {
       const { authorization, signature } = await readSignature();
       const response = await fetch(`${UNIGOX_PAYMENTS_API}/memo-locks/list`, {
         method: "POST", headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ chainId: domain.chainId, authorization, signature, query: { chainType, address, limit: "1" } }),
       });
       const monitoring = (await response.json()).data?.locks?.[0]?.monitoring;
       if (monitoring?.watched) return monitoring;                         // every network is ready
       if (Date.now() > until) return monitoring?.chains?.some((c) => c.confirmed) ? monitoring : null;
       await new Promise((resolve) => setTimeout(resolve, 10_000));
     }
   }
   ```

4. **Build the payment link.** `paymentToken()` (and `topUpToken()` for deposit addresses) builds exactly the code the checkout reads; their Node.js source is under [The token builders](#the-token-builders). The portal's **Developers** page shows the same code filled in with your wallet once Unigox has exported your key. Call it with what step 2 returned:

   - **What it does:** turns the order and its reserved addresses into the code at the end of the payment link. Nothing is sent to Unigox.
   - **What you keep:** the link (`payUrl`) with the order, to show or send it again.
   - **What can go wrong:** it throws when something would make the checkout refuse the link (an amount with more than two decimals, a name that is too long, terms that differ from a v2 reference text), so the order fails on your server, not on the payer's screen.

   ```js
   const token = paymentToken({
     merchant: "Northwind",                 // the name your customer sees
     memo,                                  // the exact memo you reserved
     amount: "250.00",                      // amount due in USD
     wallet: WALLET,                        // your wallet, owner of the addresses
     expiresAt: null,                       // or your payment deadline as ISO time with its zone ("2026-11-02T12:00:00Z", "…+02:00") or a Date, before the reservation's own end
     openedAt: Date.now(),                  // milliseconds; transfers are watched from here
     description: "Order NW-20418",         // optional, one line
     returnUrl: "https://shop.example/orders/20418", // optional, https only
     supportEmail: "billing@shop.example", // optional, shown when the payer must contact you
     addresses: {
       evm: { address: evm.address, lockId: evm.addressId, monitoring: evm.monitoring },
       tvm: { address: tron.address, lockId: tron.addressId, monitoring: tron.monitoring },
     },
   });
   const payUrl = `https://www.unigox.com/pay/${token}`;
   ```

   What you should see: `payUrl` opens the checkout with your amount and reference. Before it shows an address, the page checks with Unigox that each address in the token is an open Unigox reservation of the token's wallet (`w`) with the token's memo (`r`): a link whose address is not refuses to open (`UNIGOX_CHECKOUT_INVALID_LINK`), and one whose reservation has ended opens as closed. The check is Unigox's public link check (see [Headless](#headless-your-own-payment-page)), so the reservation must exist and stay open while the payment is due: keep `w` the lowercase wallet that signed it, `r` the memo byte for byte, and each address type's `k` that address's ID. The check does not prove who owns the wallet: anyone who can change a link can put in another wallet with addresses that wallet reserved, including the addresses the payer is told to pay, and the link passes with whatever merchant name its token carries. Give payers links only through your own site, emails and messages, never accept a token from the payer, and fulfil orders from your own order record, never from the token, the page or a browser callback.

5. **Add the button.** Put the link into your page with the code of [2. Show the checkout](#2-show-the-checkout). What you should see: the button opens your order's checkout.

6. **Confirm on your server.** Mark the order paid only from your server, as [4. Confirm the payment on your server](#4-confirm-the-payment-on-your-server) shows. What you should see: a small real payment marks its order paid once.

7. **Test and go live.** Follow [Test before you go live](#test-before-you-go-live) and [Going live](#going-live).

### Server integration in one page

The whole path of one order, from "order created" to "order paid", in two files: `unigox.mjs` holds the blocks of this guide, pasted once; `server.mjs` is your shop. It keeps orders in memory to stay short: use your own database.

- **What it does:** when an order is placed, your server reserves an address for it and builds its link once the address is ready (a few minutes); when the payer presses **Pay with crypto**, the checkout shows that link; your page reports each transfer; your server checks it with Unigox and marks the order paid once. A job checks every reported transfer of every open order each minute, so one that was still pending when the payer closed the page is credited later. A transfer no page reported to your server (the payer closed the page before it posted, or paid from another device) is not among those hints and this job cannot find it: `fulfilInvoice()` of [Confirm](#4-confirm-the-payment-on-your-server) finds it in your signed history (count both by `quoteId`, so a payment seen both ways counts once), or look it up in the portal's **Payments**.
- **What you keep:** with each order, its reference text, the signed request for its address and then the address, whether a `Lock` for its memo was sent, its address IDs, the transfer hints still to prove and the transfer IDs you counted. Each is written before the next step starts, so an attempt that fails is resumed, never redone.
- **What can go wrong:** written next to each step in the code.

**`unigox.mjs`**: paste, in this order: step 2's block of [Option B](#option-b-from-your-server) without its last four lines (they are an example call), step 3's block (`waitUntilReady()`), the two builders of [The token builders](#the-token-builders) (`paymentToken()` and its helpers is enough), and the whole block of [Confirm without the key](#confirm-without-the-key) (`unigoxGet()`, `verifyTransfers()` and `isPaid()`: the server reads its transfer hints with `unigoxGet()` too). Keep one `UNIGOX_PAYMENTS_API` line and move the `import` lines to the top. Then add your key and the exports:

```js
// At the top of unigox.mjs. npm install viem. The key comes from your secrets store, never from code.
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrum } from "viem/chains";
const account = privateKeyToAccount(process.env.UNIGOX_WALLET_KEY);
const walletClient = createWalletClient({ account, chain: arbitrum, transport: http() });

// …the pasted blocks…

// At the end of unigox.mjs: the names server.mjs imports that the pasted blocks do not export themselves.
export { paymentToken, unigoxGet, WALLET };
```

**`server.mjs`**:

```js
// Node 20+. UNIGOX_PAYMENTS_API and UNIGOX_WALLET_KEY in the environment; run: node server.mjs
import { createServer } from "node:http";
import { allocationRequest, isPaid, newestReservation, paymentToken, reserveAddress, reserveMemo, unigoxGet, verifyTransfers, waitUntilReady, WALLET } from "./unigox.mjs";

const shop = new Map([["NW-20418", "250.00"]]); // your orders and their amounts in USD
const orders = new Map();                         // what this example keeps per order: in your shop, a database row
const counted = new Set();                        // transfer IDs (quoteId) already added, each once
const HINTS_MAX = 200;                            // reported transfers waiting to be proved, per order (verifyTransfers reads that many)

// 1. Order placed: reserve an address and build the link once it is ready, once per order. Started when the order is
//    placed, because a new address takes a few minutes to be ready; Pay with crypto then gets the finished link.
//    Each step is written to the order before the next one starts, so an attempt that fails is resumed, never redone:
//    the signed request is kept before it is sent and sent again as it is after a lost answer (same nonce, so Unigox
//    answers with the address it made the first time); once it is spent (401 memo_lock_signature_expired) the address
//    it made, if any, is kept and its memo reserved, else a new request is signed; and the address is kept before its
//    networks are awaited.
const making = new Map();                         // order ID -> the attempt under way
const linkFor = (id) => {
  if (!making.has(id)) making.set(id, makeLink(id).catch((error) => { making.delete(id); throw error; }));
  return making.get(id);
};
async function makeLink(id) {
  const amount = shop.get(id);
  if (!amount) throw new Error(`no order ${id}`);
  let order = orders.get(id);
  if (!order) {
    // A random part keeps the reference text from being guessed (see step 2).
    const memo = `${id}-${Math.random().toString(36).slice(2, 8)} · ${amount} USD`;
    order = { id, memo, amount, wallet: WALLET, tolerance: "default", request: null, address: null, lockSent: false, evm: null, token: null, lockIds: [], reported: [], micros: 0n, status: "open" };
    orders.set(id, order);
  }
  if (order.token) return order.token;
  if (!order.evm && !order.address) {
    order.request ??= await allocationRequest("evm", order.memo);    // signed and kept before it is sent
    try {
      // Can throw (a lost answer): the button reports TOKEN_MISSING, the payer tries again, and the same request is sent again.
      order.evm = await reserveAddress("evm", order.memo, order.request);
      order.request = null;                                           // spent: the order has its address
    } catch (error) {
      if (error.code !== "memo_lock_signature_expired") throw error;
      // The deadline passed before the memo was reserved: the kept request is spent either way. An answer that names the
      // address it made: keep it, its memo is reserved below. One that names none: the request never took effect, and
      // the next attempt signs a new one (its nonce was never used, so this makes no second address).
      order.request = null;
      order.address = error.allocated?.address ?? null;
      if (!order.address) throw error;
    }
  }
  if (!order.evm) {
    // An address without its memo: reserve it with a signed Lock, a fresh nonce each attempt (step 2). A Lock whose
    // answer was lost may have taken effect, and every later Lock on the address then answers 409
    // deposit_address_already_locked, so the order records that a Lock was sent before it goes out, and the attempt
    // after one first reads the address's newest reservation (step 2, "An answer is lost"). This order's own (your
    // wallet, this memo, still active) is the reservation that Lock made: its address ID is taken as it is. Another
    // active reservation on the address is another payment's: the order fails here for you to look at, and no further
    // Lock is signed. A closed one, or none, means the Lock never took effect: a new one is signed.
    const found = order.lockSent ? await newestReservation("evm", order.address) : null; // throws while Unigox cannot be read: the next attempt reads again
    if (found?.status === "ACTIVE") {
      if (found.wallet?.toLowerCase() !== WALLET.toLowerCase() || found.memo !== order.memo) throw new Error(`${id}: ${order.address} is reserved for another payment (address ID ${found.lockId})`);
      order.evm = { address: order.address, addressId: found.lockId, monitoring: found.monitoring };
    } else {
      order.lockSent = true;                                            // written before the Lock is sent
      order.evm = await reserveMemo("evm", order.address, order.memo);
    }
  }
  order.lockIds = [String(order.evm.addressId)];
  const monitoring = await waitUntilReady("evm", order.evm.address); // step 3: a link built earlier offers no network
  if (!monitoring) throw new Error(`${id}: the address is not ready yet`); // the address stays with the order: the next attempt waits again
  order.token = paymentToken({
    merchant: "Northwind", memo: order.memo, amount, wallet: WALLET, expiresAt: null, openedAt: Date.now(),
    addresses: { evm: { address: order.evm.address, lockId: order.evm.addressId, monitoring } },
  });
  console.log(`${id}: link https://www.unigox.com/pay/${order.token.slice(0, 12)}…`);
  return order.token;
}

// 2. A transfer was reported, or the job runs: ask Unigox, add each proven credit once, mark the order paid once.
async function check(order) {
  for (const credit of await verifyTransfers(order, order.reported)) {
    order.reported = order.reported.filter((r) => r.quoteId !== credit.id); // proven: out of the hint queue, into counted
    if (counted.has(credit.id)) continue;
    counted.add(credit.id);
    order.micros += credit.micros;
    console.log(`${order.id}: credited ${Number(credit.micros) / 1e6} USD`);
  }
  // A hint Unigox knows as a transfer of this order (pending, not credited yet) is kept until it is credited; the
  // others (not indexed yet, or made up) are the ones a full queue lets go, oldest first. A hint that named only the
  // transaction (no quoteId) is read again here, so it leaves the queue once its transfer was counted above.
  for (const r of order.reported) {
    if (r.known && r.quoteId) continue;           // leaves through the credits loop above once Unigox credits it
    const tx = await hintTransfer(order, r);
    r.known = tx !== null;
    r.proven = tx !== null && counted.has(tx.quoteId);
  }
  order.reported = order.reported.filter((r) => !r.proven);
  if (order.status === "open" && isPaid(order, order.micros)) {
    order.status = "paid";
    console.log(`${order.id}: paid`);           // ship the order here, once
  }
}
// One hint is one transfer: its quoteId once the page knows it, before that its place in the transaction (chainId,
// txHash, logIndex). A report that adds the quoteId is a new hint, not a repeat of the earlier one.
const sameHint = (a, b) => a.chainId === b.chainId && a.txHash === b.txHash && (a.quoteId || b.quoteId ? a.quoteId === b.quoteId : a.logIndex === b.logIndex);
// The transfer Unigox knows under the hint, when it is one to this order's address IDs; null for a transfer not indexed
// yet, a made-up one, another order's, or while Unigox cannot be read (asked again on the next check).
async function hintTransfer(order, hint) {
  const pick = hint.quoteId ? `?quoteId=${encodeURIComponent(hint.quoteId)}` : hint.logIndex != null ? `?logIndex=${encodeURIComponent(hint.logIndex)}` : "";
  try {
    const tx = (await unigoxGet(`/transaction/${hint.chainId}/${encodeURIComponent(hint.txHash)}${pick}`, "found")).data;
    return order.lockIds.includes(String(tx.memoLockId)) ? tx : null;
  } catch {
    return null;
  }
}

const json = (res, code, body) => res.writeHead(code, { "Content-Type": "application/json" }).end(JSON.stringify(body));

createServer(async (req, res) => {
  try {
    let body = "";
    for await (const chunk of req) if ((body += chunk).length > 65_536) return json(res, 413, { error: "too large" });
    const [, id, action] = /^\/orders\/([\w-]+)\/(crypto-token|payments|status)$/.exec(req.url) ?? [];
    if (action === "crypto-token" && req.method === "POST") return json(res, 200, { token: await linkFor(id) });
    const order = orders.get(id);
    if (!order) return json(res, 404, { error: "no such order" });
    if (action === "payments" && req.method === "POST") {
      // What the page reported is only a hint: check() reads every transfer again from Unigox, so a made-up hint credits
      // nothing. Hints wait in a queue of HINTS_MAX until a check proves them. When it is full, a check first marks the
      // hints Unigox knows as this order's transfers (kept until credited), then the oldest hint Unigox does not know
      // makes room: a flood of made-up hints never pushes out a transfer that is on its way, and a real transfer not
      // indexed yet comes back with the page's next report. A report of hundreds of hints costs that many reads, so
      // serve this route only to the session that owns the order, as your shop does for its other order routes.
      for (const p of JSON.parse(body || "{}").payments ?? []) {
        if (!Number.isSafeInteger(p?.chainId) || typeof p.txHash !== "string" || !/^[\w-]{8,128}$/.test(p.txHash)) continue;
        const hint = { chainId: p.chainId, txHash: p.txHash, logIndex: p.logIndex ?? null, quoteId: typeof p.quoteId === "string" ? p.quoteId : null, known: false };
        if ((hint.quoteId && counted.has(hint.quoteId)) || order.reported.some((r) => sameHint(r, hint))) continue;
        if (order.reported.length >= HINTS_MAX) {
          await check(order);                       // proves what it can, marks the hints Unigox knows
          const oldest = order.reported.findIndex((r) => !r.known);
          if (oldest < 0) continue;                 // every queued hint is a transfer of this order: none makes room
          order.reported.splice(oldest, 1);         // the oldest hint Unigox does not know goes
        }
        order.reported.push(hint);
      }
      await check(order);
    }
    return json(res, 200, { status: order.status });
  } catch (error) {
    console.error(error);                          // Unigox could not be read: the job tries again
    return json(res, 503, { error: "try again" });
  }
}).listen(3000, () => console.log("shop on http://localhost:3000"));

// Your shop places its orders: start making each order's link now, so it is ready when the payer presses Pay.
for (const id of shop.keys()) linkFor(id).catch(console.error);

// 3. The job: every open order's reported transfers, every minute, also when the payer closed the page. A transfer no
//    page reported needs your signed history (fulfilInvoice() in "Confirm") or the portal's Payments: it is not here.
setInterval(() => {
  for (const order of orders.values()) if (order.status === "open") check(order).catch(console.error);
}, 60_000);
```

Your order page, served by the same shop:

```html
<script src="https://www.unigox.com/checkout.js"></script>
<button type="button" id="pay">Pay with crypto</button>
<script>
  const orderId = "NW-20418";
  const post = (path, body) => fetch(`/orders/${orderId}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const report = (payload) => post("payments", { payments: payload.payments ?? [] });
  let checkout;
  document.getElementById("pay").addEventListener("click", () => {
    checkout ??= UnigoxCheckout.create({
      token: () => post("crypto-token", {}).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))).then((d) => d.token),
      onStatusChange: (status, payload) => report(payload),
      onComplete: (payload) => report(payload),    // update your page; your server has the last word
    });
    checkout.open();
  });
</script>
```

What you should see in the server's log, step by step:

```text
shop on http://localhost:3000
NW-20418: link https://www.unigox.com/pay/eyJ2IjoxLCJt…   ← a few minutes after start: the address is ready
NW-20418: credited 250 USD                                 ← the transfer was credited to your Unigox wallet
NW-20418: paid                                             ← once, even if the page reports the payment again
```

Between the first and second line the payer presses **Pay with crypto**, and the checkout shows the address and the amount, then **Payment detected** while the transfer confirms. A payment that comes short shows `credited` without `paid` until the rest arrives. Run it on staging first ([Test before you go live](#test-before-you-go-live)).

### Link format (advanced)

You need this section only to read or check a link yourself. The builders below write it for you.

#### Token fields (invoice)

| Key | Field | Value |
| --- | --- | --- |
| `v` | version | always `1` |
| `m` | merchant | the name the payer sees, up to 64 characters |
| `r` | memo | the exact memo on the reserved addresses, up to 256 UTF-8 bytes |
| `a` | amount | amount due in USD, up to 12 digits and two decimals. The checkout takes any amount above 0; the portal creates links from 1.00 USD, because below that a network fee can cost the payer more than the payment. Use at least 1.00 USD |
| `c` | currency | always `USD`; each dollar stablecoin the checkout offers (USDT, USDC, USDG, USDT0) counts 1:1. Your balance is credited in the matching coin, so a USDG payment arrives as USDG |
| `w` | wallet | your wallet, lowercase `0x` address |
| `x` | expiresAt | `null`, or the payment deadline the payer sees, as ISO time with its zone (`Z` or an offset such as `+02:00`); only the page reads it. Keep the reservation open past it (reserve with `expiresAt: "0"` and end it later): a transfer after the reservation has ended carries no reference and shows as received without reference, not as paid late |
| `t` | openedAt | creation time in whole Unix seconds (`paymentToken()` takes milliseconds and converts them); transfers are watched from then |
| `d` | description | optional: one line of plain text, up to 140 characters |
| `u` | returnUrl | optional: an https page of your site, up to 2048 bytes, no user name or password; shown as "Back to {merchant}" (the token's merchant name), never opened automatically |
| `e` | supportEmail | optional: an email address the payer can write to about this payment, up to 254 characters; shown on the screens that ask the payer to contact you |
| `l` | addresses | per address type: `a` address, `k` address ID, `n` network ids confirmed (EVM, TRON), `s: 1` when watched (TON, Solana) |
| `tol` | tolerance | optional: `"none"` when the full amount is due (`paymentToken()` writes it for `tolerance: "none"`). Without it, a payment short by at most 0.5 % of the amount, and never more than 1.00 USD, counts as paid. In a memo of the first form the token alone states it, unsigned: a payer who edits the link can drop it, so your server's own rule decides (step 4 of "Confirm") |

#### Memo v2: the link's terms in the memo

A link made in the portal writes its terms into the memo, so the memo fingerprint of its reservation covers them and a link edited to other terms refuses to open:

```
<reference> · <amount> USD · v2 [· <tag>] [· by <UTC deadline>] [· no tolerance] [· coins <coins>] [· networks <network ids>] [· note <description>]
```

For example `NW-1042 · 250.00 USD · v2 · d6ppalq2 · by 2026-11-02T12:00Z · no tolerance · coins USDT,USDC · networks 42161,728126428 · note Order 1042`. `<tag>` is 8 characters of `a-z` and `2-7`, random for each link the portal makes: it keeps a guessed reference and amount from matching the public fingerprint. The parts always come in this order and only when they differ from the default (no deadline, the default tolerance, every coin, every network, no description); `v2` is always there, and every link the portal makes now has a tag. The whole memo is still at most 256 UTF-8 bytes. The portal writes the short form of the token for these links; it carries the same terms, and the page rebuilds the memo from them before it checks the reservation. To confirm such a payment on your server, use the memo exactly as the portal wrote it: the portal's **Developers** page shows it for a link you paste there.

Your server may keep writing the first form, `<reference> · <amount> USD`. If you write a v2 memo yourself, your link must state the same terms (`expiresAt`, `description`, `tolerance` and the amount): `paymentToken()` reads them from the memo and throws when they differ, so the order fails on your server, not on the payer's screen.

#### The token builders

- **What they do:** `paymentToken()` builds the code of an order's payment link, `topUpToken()` the code of a customer's deposit page. They only build text: nothing is sent to Unigox.
- **What you keep:** nothing new: they read the order or customer record you already keep.
- **What can go wrong:** they throw with a message that names the field to fix.

Node.js 20+, no dependencies. They check what the checkout would refuse, so a bad order fails on your server, not on the payer's screen; for a v2 memo that includes its terms. Each block is complete on its own; both end with the same helpers (`oneLine`, `returnPage`, `walletAndAddresses`, `supportMailbox`), so keep one copy of them if you use both.

```js
function paymentToken(link) {
  // Checked here so a bad order fails on your server, not on the payer's screen.
  const unsafe = /[\u0000-\u001F\u007F-\u009F\u061C\u200B-\u200F\u2028-\u202E\u2066-\u2069\uFEFF]/;
  if (typeof link.merchant !== "string" || !link.merchant || link.merchant.length > 64 || unsafe.test(link.merchant)) throw new Error("merchant: 1 to 64 characters, no control or text-direction characters");
  if (typeof link.memo !== "string" || !link.memo || Buffer.byteLength(link.memo, "utf8") > 256 || unsafe.test(link.memo)) throw new Error("memo: the exact memo you reserved in step 2, up to 256 bytes");
  // Amount due in USD: a decimal string with at most two decimals ("250.00"); a number is taken when it has no more than cents.
  const cents = typeof link.amount === "number" && Number.isFinite(link.amount) && Math.abs(link.amount * 100 - Math.round(link.amount * 100)) < 1e-6;
  const amount = cents ? link.amount.toFixed(2) : String(link.amount ?? "");
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(amount)) throw new Error("amount: a decimal string with at most two decimals, e.g. 250.00");
  if (!/[1-9]/.test(amount)) throw new Error("amount: more than 0");
  const description = oneLine(link.description, unsafe);
  const returnUrl = returnPage(link.returnUrl);
  const supportEmail = supportMailbox(link.supportEmail, unsafe);
  // "none" when the full amount is due (the portal's "Full amount only"); anything else is the default tolerance.
  const tolerance = link.tolerance === "none" ? "none" : "default";
  // The payment deadline: a Date, or ISO time with its zone ("2026-11-02T12:00:00Z", "…+02:00"). Text without a zone
  // would be read in each payer's own time zone, so the link would end at a different hour on every device.
  const zoned = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?([Zz]|[+-]\d{2}:?\d{2})$/;
  const deadline = link.expiresAt == null ? null : new Date(typeof link.expiresAt === "string" && !zoned.test(link.expiresAt) ? NaN : link.expiresAt);
  if (deadline !== null && (Number.isNaN(deadline.getTime()) || !/^\d{4}-/.test(deadline.toISOString()))) throw new Error("expiresAt: null, or ISO time with its zone, e.g. 2026-11-02T12:00:00Z");
  // A v2 memo ("<reference> · <amount> USD · v2 …", what the portal writes) states the link's terms itself: the link must
  // state exactly the same ones, or the checkout refuses it ("This payment link can't be used").
  const terms = linkTerms(link.memo);
  const centsOf = (s) => { const [whole, fraction = ""] = s.split("."); return BigInt(whole + fraction.padEnd(2, "0")); };
  const legacyAmount = / · (\d{1,12}(?:\.\d{1,2})?) USD$/.exec(link.memo)?.[1];
  if (!terms && legacyAmount && centsOf(legacyAmount) !== centsOf(amount)) throw new Error(`amount: the memo says ${legacyAmount} USD`);
  if (terms) {
    if (centsOf(terms.amount) !== centsOf(amount)) throw new Error(`amount: the memo says ${terms.amount} USD`);
    // Whole seconds, as the payment page compares them: a sub-second time (Go writes nine digits) is the same deadline.
    const by = terms.expiresAt === null ? null : Math.floor(Date.parse(terms.expiresAt) / 1000);
    const given = link.expiresAt == null ? null : Math.floor(Date.parse(link.expiresAt) / 1000);
    if (by !== given) throw new Error(`expiresAt: the memo says ${terms.expiresAt ?? "no deadline"}`);
    if ((terms.description ?? "") !== description) throw new Error(`description: the memo says "${terms.description ?? ""}"`);
    if (terms.tolerance !== tolerance) throw new Error(`tolerance: the memo says "${terms.tolerance}"`);
  }
  // One entry per address type: a = address, k = address ID, then readiness from the reservation's monitoring:
  // n = network ids it confirmed (EVM, Tron), s = 1 when the address is watched (TON, Solana).
  const addresses = {};
  for (const [type, entry] of walletAndAddresses(link)) {
    const m = entry.monitoring;
    const n = ((m && m.chains) || []).filter((c) => c.confirmed).map((c) => c.chainId);
    addresses[type] = { a: entry.address, k: String(entry.lockId), ...(n.length ? { n } : {}), ...(m && m.watched ? { s: 1 } : {}) };
  }
  const wire = {
    v: 1,                                        // token version
    m: link.merchant,                            // merchant name the payer sees
    r: link.memo,                                // the exact memo text on the reserved addresses
    a: amount,                                   // amount due, e.g. "250.00"
    c: "USD",
    w: link.wallet.toLowerCase(),                // your wallet, owner of the addresses
    x: terms ? terms.expiresAt : deadline === null ? null : deadline.toISOString(), // null, or the payment deadline the payer sees, before the reservation ends (ISO time, UTC); only the payer's page reads it
    t: Math.floor((link.openedAt ?? Date.now()) / 1000), // creation time: transfers are watched from here
    ...(description ? { d: description } : {}), // optional: what is being paid for
    ...(returnUrl ? { u: returnUrl } : {}),      // optional: the page of your site the payer may go back to
    ...(supportEmail ? { e: supportEmail } : {}), // optional: where the payer can write to you about this payment
    ...(tolerance === "none" ? { tol: "none" } : {}), // optional: the full amount is due
    l: addresses,
  };
  return Buffer.from(JSON.stringify(wire), "utf8").toString("base64url");
}

// The terms of a v2 memo: <reference> · <amount> USD · v2 [· <tag>] [· by <UTC>] [· no tolerance] [· coins …]
// [· networks …] [· note <description>]; null for any other memo. Coins and networks are the payer page's to read.
function linkTerms(memo) {
  const at = memo.indexOf(" USD · v2");
  if (at < 0) return null;
  const terms = { amount: memo.slice(0, at).split(" · ").pop(), expiresAt: null, description: null, tolerance: "default" };
  let rest = memo.slice(at + " USD · v2".length).replace(/^ · [a-z2-7]{8}(?= · |$)/, "");
  while (rest.startsWith(" · ")) {
    rest = rest.slice(3);
    if (rest.startsWith("note ")) { terms.description = rest.slice(5); rest = ""; break; }
    const end = rest.indexOf(" · ");
    const part = end < 0 ? rest : rest.slice(0, end);
    rest = end < 0 ? "" : rest.slice(end);
    const by = /^by (\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(:\d{2})?Z$/.exec(part);
    if (by) terms.expiresAt = `${by[1]}${by[2] ?? ":00"}Z`;
    else if (part === "no tolerance") terms.tolerance = "none";
    else if (!/^(coins|networks) [\w,]+$/.test(part)) throw new Error(`memo: "${part}" is not a term of a v2 memo`);
  }
  if (rest) throw new Error("memo: not a v2 memo");
  return terms;
}

// One line of plain text: control and direction characters become spaces, a broken character becomes U+FFFD
// (the UTF-8 round trip replaces it), cut at 140 characters without splitting one.
function oneLine(text, unsafe) {
  const clean = String(text ?? "").replace(new RegExp(unsafe.source, "g"), " ").trim();
  return Array.from(Buffer.from(clean, "utf8").toString("utf8")).slice(0, 140).join("");
}

// Optional return page: https only, no user name or password, at most 2048 bytes.
function returnPage(value) {
  if (value == null || String(value).trim() === "") return null;
  let url = null;
  try { url = new URL(String(value).trim()); } catch {}
  if (!url || url.protocol !== "https:" || url.username || url.password || !url.hostname || Buffer.byteLength(url.href, "utf8") > 2048) throw new Error("returnUrl: an https address up to 2048 bytes, without a user name or password");
  return url.href;
}

// Your wallet (the owner of the addresses) and at least one address entry, each a payment address and its numeric address ID.
function walletAndAddresses(link) {
  if (typeof link.wallet !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(link.wallet)) throw new Error("wallet: your wallet address, 0x and 40 hexadecimal characters");
  const entries = Object.entries(link.addresses || {}).filter(([type]) => ["evm", "tvm", "ton", "svm"].includes(type));
  if (!entries.length) throw new Error("addresses: at least one of evm, tvm, ton, svm, each a payment address you reserved");
  for (const [type, entry] of entries) {
    if (!entry || typeof entry.address !== "string" || !entry.address.trim()) throw new Error(`addresses.${type}.address: the payment address you reserved`);
    if (!/^\d+$/.test(String(entry.lockId))) throw new Error(`addresses.${type}.lockId: the address ID of the address you reserved, digits only`);
  }
  return entries;
}

// Optional support email: a plain mailbox, at most 254 characters.
function supportMailbox(value, unsafe) {
  if (value == null || String(value).trim() === "") return null;
  const email = String(value).trim();
  if (email.length > 254 || unsafe.test(email) || !/^[^\s@<>()",;:\\[\]]{1,64}@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(email)) throw new Error("supportEmail: a plain email address up to 254 characters");
  return email;
}
```

```js
function topUpToken(link) {
  // Checked here so a bad customer fails on your server, not on the payer's screen.
  const unsafe = /[\u0000-\u001F\u007F-\u009F\u061C\u200B-\u200F\u2028-\u202E\u2066-\u2069\uFEFF]/;
  if (typeof link.merchant !== "string" || !link.merchant || link.merchant.length > 64 || unsafe.test(link.merchant)) throw new Error("merchant: 1 to 64 characters, no control or text-direction characters");
  // The customer's memo: "Top-up · <customer reference> · <tag>", the tag 10 characters of a-z and 2-7 kept for the customer's lifetime.
  const shape = /^Top-up · (.+) · ([a-z2-7]{10})$/u;
  const m = typeof link.memo === "string" ? shape.exec(link.memo) : null;
  if (!m || m[1] !== m[1].trim() || Array.from(m[1]).length > 64 || Buffer.byteLength(link.memo, "utf8") > 256 || unsafe.test(link.memo)) throw new Error("memo: Top-up · <customer reference> · <tag>, up to 256 bytes");
  if (!Number.isFinite(link.openedAt) || link.openedAt < 1000) throw new Error("openedAt: when the customer's first address was reserved, in milliseconds");
  const description = oneLine(link.description, unsafe);
  const returnUrl = returnPage(link.returnUrl);
  const supportEmail = supportMailbox(link.supportEmail, unsafe);
  const addresses = {};
  for (const [type, entry] of walletAndAddresses(link)) {
    const mon = entry.monitoring;
    const n = ((mon && mon.chains) || []).filter((c) => c.confirmed).map((c) => c.chainId);
    addresses[type] = { a: entry.address, k: String(entry.lockId), ...(n.length ? { n } : {}), ...(mon && mon.watched ? { s: 1 } : {}) };
  }
  const wire = {
    v: 1,
    p: "topup",                                  // a customer top-up page: no amount, currency or window
    m: link.merchant,
    r: link.memo,
    w: link.wallet.toLowerCase(),
    t: Math.floor(link.openedAt / 1000),         // transfers are watched from here
    ...(description ? { d: description } : {}),
    ...(returnUrl ? { u: returnUrl } : {}),
    ...(supportEmail ? { e: supportEmail } : {}),
    l: addresses,
  };
  return Buffer.from(JSON.stringify(wire), "utf8").toString("base64url");
}

// One line of plain text: control and direction characters become spaces, a broken character becomes U+FFFD
// (the UTF-8 round trip replaces it), cut at 140 characters without splitting one.
function oneLine(text, unsafe) {
  const clean = String(text ?? "").replace(new RegExp(unsafe.source, "g"), " ").trim();
  return Array.from(Buffer.from(clean, "utf8").toString("utf8")).slice(0, 140).join("");
}

// Optional return page: https only, no user name or password, at most 2048 bytes.
function returnPage(value) {
  if (value == null || String(value).trim() === "") return null;
  let url = null;
  try { url = new URL(String(value).trim()); } catch {}
  if (!url || url.protocol !== "https:" || url.username || url.password || !url.hostname || Buffer.byteLength(url.href, "utf8") > 2048) throw new Error("returnUrl: an https address up to 2048 bytes, without a user name or password");
  return url.href;
}

// Your wallet (the owner of the addresses) and at least one address entry, each a payment address and its numeric address ID.
function walletAndAddresses(link) {
  if (typeof link.wallet !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(link.wallet)) throw new Error("wallet: your wallet address, 0x and 40 hexadecimal characters");
  const entries = Object.entries(link.addresses || {}).filter(([type]) => ["evm", "tvm", "ton", "svm"].includes(type));
  if (!entries.length) throw new Error("addresses: at least one of evm, tvm, ton, svm, each a payment address you reserved");
  for (const [type, entry] of entries) {
    if (!entry || typeof entry.address !== "string" || !entry.address.trim()) throw new Error(`addresses.${type}.address: the payment address you reserved`);
    if (!/^\d+$/.test(String(entry.lockId))) throw new Error(`addresses.${type}.lockId: the address ID of the address you reserved, digits only`);
  }
  return entries;
}

// Optional support email: a plain mailbox, at most 254 characters.
function supportMailbox(value, unsafe) {
  if (value == null || String(value).trim() === "") return null;
  const email = String(value).trim();
  if (email.length > 254 || unsafe.test(email) || !/^[^\s@<>()",;:\\[\]]{1,64}@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(email)) throw new Error("supportEmail: a plain email address up to 254 characters");
  return email;
}
```

## Customer deposit addresses

A deposit address belongs to one customer for good: every transfer to it is that customer's deposit, there is no amount and no "paid" state. The customer gets a deposit page with their addresses, for any amount, any number of times. The portal makes them under **Deposit addresses** (see the [Deposit addresses help](https://www.unigox.com/crypto-processing/help/deposit-addresses)); your server can make them too, with your wallet's private key. In this section, `quoteId` is Unigox's ID for one incoming transfer: use it to count each deposit once.

1. **Get one new address for each address type** with the customer's memo, `Top-up · <customer reference> · <tag>`, with `reserveAddress()` of [Option B](#option-b-from-your-server). The tag is 10 random characters of `a-z` and `2-7` that you make once and keep for the customer's lifetime. Use your customer ID as the reference, never personal data: the customer sees it. Never use these addresses for anything else, even after the customer leaves.
2. **Keep every address ID** with the customer, old and new: crediting deposits needs all of them.
3. **Build the customer's page link** with `topUpToken()` ([The token builders](#the-token-builders)). It has `p: "topup"` and no `a`, `c` or `x`; `t` is when the customer's first address was reserved. `d`, `u` and `e` work as on an invoice.
4. **Share the page, or show it on your site.** Send `https://www.unigox.com/pay/{token}`, or show it with `checkout.js` as you would an invoice ([2. Show the checkout](#2-show-the-checkout)). On a deposit page the checkout calls `onDeposit` (event `UNIGOX_CHECKOUT_DEPOSIT_CREDITED`, `mode: "topup"`) for each credited deposit it shows, again each time the page opens: post `payload.chainId` and `payload.txHash` to your server and count each `payload.quoteId` once.
5. **Credit each deposit in your system**, as shown below.
6. **Archive or restore.**
   - **Archive:** stop each of the customer's addresses with `POST /memo-locks/unlock` (signed `Unlock`), which tells Unigox the address no longer carries this customer's reference. Transfers still arrive and are credited to your wallet, without the customer's memo, and the customer's page opens as closed.
   - **Restore:** give the same addresses this customer's reference again with `POST /memo-locks/lock` (signed `Lock`, the same memo, `expiresAt: "0"`). First check with a signed `POST /memo-locks/list` (`{"chainType", "address", "limit": "1"}`) that nobody else's reference is on them. Restoring gives the addresses new address IDs, and the page link contains the address IDs, so the link the customer already has stays closed: build a new link with `topUpToken()` and send it to the customer.

- **What it does:** gets a new address of each address type for one customer, sets them aside for that customer for good, and builds the link of the customer's deposit page.
- **What you keep:** the customer's reference text and every address ID, old and new, with the customer.
- **What can go wrong:** the same as step 2 of Option B. A network that is not ready yet is left out of the page until you build the link again.

A complete example, from a new customer to the link of their deposit page, with `reserveAddress()` and `waitUntilReady()` of [Option B](#option-b-from-your-server) and `topUpToken()` of [The token builders](#the-token-builders) in the same file:

```js
// Node 20+. Your server holds your wallet's key (reserveAddress signs with it). db is your own database.
import { randomInt } from "node:crypto";

const TAG_LETTERS = "abcdefghijklmnopqrstuvwxyz234567";
const newTag = () => Array.from({ length: 10 }, () => TAG_LETTERS[randomInt(TAG_LETTERS.length)]).join("");

// customerId: your own ID for the customer (shown on their page, so no personal data), up to 64 characters.
export async function createDepositPage(customerId) {
  // A run that stopped part way (a lost answer, a refused request) left its memo and addresses: carry on with them,
  // so calling this again never gives the customer a second set of addresses.
  const saved = await db.customer(customerId);
  const memo = saved?.memo ?? `Top-up · ${customerId} · ${newTag()}`; // keep this memo for the customer's lifetime
  const openedAt = saved?.openedAt ?? Date.now();
  const addresses = { ...saved?.addresses };
  // Keep the memo and every address ID with the customer, from before the first address: crediting needs all of them.
  const save = () => db.saveCustomer({ id: customerId, memo, openedAt, addresses, lockIds: Object.values(addresses).map((a) => String(a.lockId)) });
  await save();
  for (const type of ["evm", "tvm", "ton", "svm"]) {            // every address type you accept
    if (addresses[type]) continue;                              // reserved by an earlier run
    const made = await reserveAddress(type, memo);              // a new address, reserved for this customer
    addresses[type] = { address: made.address, lockId: made.addressId, monitoring: made.monitoring };
    await save();                                               // persist before a readiness read can fail
    // Step 3 of Option B: wait until it takes payments, or the page offers no network for it yet.
    addresses[type].monitoring = (await waitUntilReady(type, made.address)) ?? made.monitoring;
    await save();
  }
  const token = topUpToken({
    merchant: "Northwind",                     // the name your customer sees
    memo, wallet: WALLET, openedAt, addresses,
    supportEmail: "billing@shop.example",      // optional: where the customer can write to you
  });
  return `https://www.unigox.com/pay/${token}`; // the customer's deposit page
}
```

If an address type answers `addresses_preparing`, the page already works on the networks that are ready; build the link again once every network is confirmed (step 3 of [Option B](#option-b-from-your-server)).

A deposit address has no amount due: nothing is underpaid, overpaid or late, and every transfer is credited for what arrives. Where a coin has a smallest amount that can be credited on its network, the deposit page shows it as the minimum per transfer: a smaller transfer is neither credited nor returned.

### Credit customer deposits in your system

Production sends your server no notification of a deposit, so your server asks Unigox. Add each credited transfer to the customer's balance once, keyed by its `quoteId`, so a repeated event or a second check adds nothing.

| Way | What it sees | What it misses |
| --- | --- | --- |
| Without the key | Deposits that `onDeposit` reports while your page with the deposit page is open, and transaction hashes your customers give you | Every other deposit: one sent from the shared link, from another device, or after the customer closed your page. You find those only in the portal's **Payments** |
| With the key | Every deposit, from a periodic job that reads your signed history | Nothing, once the job has run |

A standing deposit address is paid mostly when your page is not open. For deposits at scale you need the key, or a person who credits deposits from **Payments** (see the [Deposit addresses help](https://www.unigox.com/crypto-processing/help/deposit-addresses)).

**Without the key.** Run `verifyTransfers()` of [Confirm without the key](#confirm-without-the-key) with the customer's memo and every address ID the customer ever had, and skip `isPaid`: a deposit has no amount due. The transfers to check come from `onDeposit` (or `UNIGOX_CHECKOUT_DEPOSIT_CREDITED` in your own frame) on a deposit page shown on your site, or from a transaction hash the customer gives you. The page sends the same deposit again each time it opens: `creditDeposits` counts each `quoteId` once, so a repeat adds nothing.

- **What it does:** checks each deposit your page reported with Unigox and adds the ones Unigox proves were credited to the customer's balance.
- **What you keep:** every transfer ID (`quoteId`) you counted, once per environment.
- **What can go wrong:** a deposit that is not credited yet, or not found yet, is not counted: report it again later. A deposit your page never heard about is not seen at all (see the table above).

```js
// Node 18+, with verifyTransfers() of "Confirm without the key" in the same file. No key and no signature.
const ENVIRONMENT = "production"; // one ledger per environment

// customer: your record, e.g. { id: "CUST-7", wallet: "0x…", memo: "Top-up · CUST-7 · abcdefghij", lockIds: ["31", "32", "57"] },
//   with every address ID the customer ever had (a restore adds new ones). reported: [{ chainId: payload.chainId,
//   txHash: payload.txHash, quoteId: payload.quoteId }] from an onDeposit payload (one deposit per payload, no payments
//   list), or [{ chainId, txHash }] for a hash the customer gave you. Returns how many new credits it added.
export async function creditDeposits(customer, reported) {
  const credits = await verifyTransfers(customer, reported); // each one proven by Unigox, never taken from the browser
  let added = 0;
  // One database transaction: each (environment, transfer id) counts once.
  await db.transaction(async (q) => {
    for (const c of credits) {
      if (await q.claimTransferOnce(ENVIRONMENT, c.id, customer.id)) {
        await q.addToBalance(customer.id, c.micros); // micro-USD, as a BigInt
        added += 1;
      }
    }
  });
  return added;
}
```

**With the key.** From a periodic job, read your signed history for each of the customer's addresses (`POST /transactions/history` with `chainType` and `depositAddress`, see [History for everything else](#history-for-everything-else)), and count each credited transfer (`settled`, on `UNIGOX_BALANCE_CHAIN_ID`, to your wallet) once by its `quoteId`, the same id `creditDeposits` uses, so the two ways share one ledger. Never mix ledgers keyed by `quoteId` and by `intentId`: the same deposit would be added twice. With `includeMemo: true` the history returns your memos, so you can tell which customer each transfer belongs to.

**After you archive a customer**, transfers to their addresses arrive without their memo, as other credits: `verifyTransfers()` does not count them for the customer, because their memo fingerprint differs. Look them up in history by address and decide yourself.

## Networks and coins

Each network takes its own coins. This is the list at the time of writing; `GET /config` is always the current one (a network or coin Unigox turns off disappears from the checkout at once). "Credited in about" is the network's confirmations times its block time, plus Unigox's processing time, as `GET /config` states them (`requiredConfirmations`, `blockTimeMs`, `processingTimeMs`).

<!-- networks:start -->
| Network | Chain id | Coins | Credited in about |
| --- | --- | --- | --- |
| Ethereum | `1` | USDT, USDC, USDG | 4 min |
| Base | `8453` | USDC | 1 min |
| Arbitrum | `42161` | USDT, USDC, USDG | 1 min |
| Polygon | `137` | USDT, USDC | 6 min |
| Optimism | `10` | USDT, USDC, USDT0 | 1 min |
| BNB Smart Chain | `56` | USDT, USDC | 1 min |
| Avalanche | `43114` | USDC | 1 min |
| Unichain | `130` | USDT, USDC | 1 min |
| HyperEVM | `999` | USDT, USDC | 1 min |
| Robinhood Chain | `4663` | USDG | 1 min |
| TRON | `728126428` | USDT | 1 min |
| TON | `69696969420` | USDT | 1 min |
| Solana | `1151111081099710` | USDT, USDC, USDG | 1 min |
<!-- networks:end -->

These times are estimates, not a promise of finality. Unigox has not yet published a confirmation depth it commits to for each network, and incoming payments are not yet screened on every network: both are why the release is early access. Count a payment only once Unigox has credited it to your wallet (`DONE` / `COMPLETED`, as your server reads it in step 4), never when the checkout shows a transfer as seen or confirming.

Native coins (ETH, TRX, TON, SOL and the like) are not taken. A coin or network that the payment page offers is usually credited, even when the payer chose another one on the page: the payer can enter the transaction hash in **Already sent? Find my payment**. A coin or network that the page does not offer is not credited to the payment and not returned by itself: the payer contacts you, and you write to support@unigox.com with the network, the transaction hash, the coin, the amount and the receiving address. Recovery is not guaranteed. There is no minimum of your own per transfer, but a transfer too small to be credited on its network (a tiny fraction of a cent) is neither credited nor returned. Each coin is credited 1:1 to your Unigox wallet in the matching coin: a USDG payment arrives as USDG.

## Headless: your own payment page

> **For special cases.** Use the checkout unless you cannot: a page of your own has to do everything below itself, and keep doing it as networks, coins and rules change. Without it you lose the checks Unigox keeps up to date for you: every network of each address type and its readiness, late, unreferenced and returned payments, the tolerance rule, the link check that stops an edited link, new coins, four languages and accessibility.

The checkout uses only public endpoints. To build your own page instead:

- Options: `GET /config`. Offer a token on a network only if the network is active, the token is active and not native, it has exactly one matching coin on `UNIGOX_BALANCE_CHAIN_ID`, and your address is confirmed for that network (API reference, "Supported payment assets").
- Link check: before you show an address from a link, read `GET {UNIGOX_LINK_CHECK_API}/crypto-checkout/memo-locks/{lockId}?wallet=<your wallet, lowercase>&memoHash=<keccak256 of the memo>` and show it only when the reservation is `ACTIVE` and its wallet, address and memo fingerprint are yours. This is what keeps an edited link from showing someone else's address. `UNIGOX_LINK_CHECK_API` is the **Link check address** the portal's **Developers** page shows, without its `/crypto-checkout/memo-locks/{lockId}` end. No signature, no body.
  - 200 `memo_lock_retrieved`: `data.lock` has `lockId`, `wallet`, `chainType`, `address`, `memoHash`, `expiresAt` and `status` (`ACTIVE`, `UNLOCKED`, `EXPIRED`); never the memo text or the callback URL. Check every field yourself. Other fields may appear in `data`: ignore them.
  - 404 `memo_lock_not_found`: no open or closed reservation with this address ID, wallet and memo fingerprint. An unknown ID and a reservation of another wallet or memo get the same answer, so ids cannot be walked.
  - 400 `validation_memo_lock_request_invalid`: `wallet` or `memoHash` is missing, malformed or given twice.
  - 503 `memo_lock_unavailable` or 500: Unigox cannot check right now. Show no address; ask again later.
  - 429: more than 120 checks a minute from one IP address (many payers behind one office or mobile network share one). Wait and ask again.
- Instructions: the address of the address type, the exact amount, the token and the network. No memo or tag is sent on chain.
- Status of one transfer: `GET /transaction/{fromChain}/{fromTx}` with `?logIndex=` or `?quoteId=`. It needs the transaction hash.
- Confirmation: exactly as in step 4.

Unigox does not create invoices, amounts or sessions for you: the amount lives in your order and in the memo you reserve.

## Test your page without money

There is no test mode for payments: a real link takes real money. To build and test the page that embeds the checkout, use the samples. Each is a checkout of a made-up merchant in one state, with no address anyone can pay: open `https://www.unigox.com/pay/<id>` as a link, or pass the id as the `token` of `checkout.js` (`UnigoxCheckout.create({ token: "demo-awaiting" })`). Every sample says it is a sample on the page, and every event it sends carries `livemode: false`: in production, refuse to act on an event whose `livemode` is not `true`. On every sample that waits for the payment (`demo-awaiting`, `demo-preset`, `demo-unavailable`), **Send the payment (sample)** plays the payment through to the end, and on the underpaid ones (`demo-underpaid`, `demo-underpaid-60`) **Send the rest (sample)** does, so you see every event of a paid checkout.

<!-- samples:start -->
| Id | Shows | Events your page receives |
| --- | --- | --- |
| `demo` | Start: the payer picks a coin and a network | `READY`, `CHOOSING` |
| `demo-link` | A payment link: no order number | `READY`, `CHOOSING` |
| `demo-awaiting` | The address and the amount to send (a sample address that nobody can pay) | `READY`, `AWAITING_PAYMENT`; after **Send the payment (sample)**: `PAYMENT_DETECTED`, then `PAID` (`onComplete`) |
| `demo-detected` | A transfer seen on the network | `READY`, `PAYMENT_DETECTED` |
| `demo-paid` | Payment completed | `READY`, `PAID` (`onComplete`) |
| `demo-underpaid` | Less than the amount: what came and what remains | `READY`, `UNDERPAID`; after **Send the rest (sample)**: `PAYMENT_DETECTED`, then `PAID` (`onComplete`) |
| `demo-overpaid` | More than the amount | `READY`, `OVERPAID` (`onComplete`) |
| `demo-expired` | The pay-by time passed with nothing received | `READY`, `EXPIRED` |
| `demo-late` | Paid after the pay-by time | `READY`, `PAID_LATE` (`onComplete`) |
| `demo-hold` | Received, under review by Unigox | `READY`, `ON_HOLD` |
| `demo-confirming` | A transfer confirming on the network | `READY`, `PAYMENT_DETECTED` with `status: "confirming"` |
| `demo-tolerance` | Paid within the tolerance: 249.10 of 250.00 USD | `READY`, `PAID` (`onComplete`) |
| `demo-parts` | Paid in two transfers | `READY`, `PAID` (`onComplete`) |
| `demo-incomplete` | Less than the amount, and the pay-by time has passed | `READY`, `UNDERPAID` with `status: "underpaid_closed"` |
| `demo-failed` | A transfer that was not completed | `READY`, `FAILED` |
| `demo-too-small` | A transfer below the network's minimum: not credited | `READY`, `FAILED` |
| `demo-refunding` | A transfer that Unigox support is sending back | `READY`, `FAILED` |
| `demo-refunded` | A transfer that was sent back | `READY`, `FAILED` |
| `demo-frozen` | Received and on hold after a review: not in the balance | `READY`, `ON_HOLD` |
| `demo-unreferenced` | Money that reached the address after the link closed | `READY`, `RECEIVED_WITHOUT_REFERENCE` |
| `demo-closed` | A link that was closed: a newer payment uses the address | `READY`, `CANCELLED` with `status: "closed"` |
| `demo-cancelled` | The payer cancelled on the page | `READY`, `CANCELLED` with `status: "cancelled"` |
| `demo-unavailable` | The checkout cannot reach Unigox right now: the address stays, the status waits | `READY`, `AWAITING_PAYMENT`, `UNAVAILABLE` (`onError` `CHECKOUT_UNAVAILABLE`); after **Send the payment (sample)**: `PAYMENT_DETECTED`, then `PAID` (`onComplete`) |
| `demo-preset` | A link that offers one coin on one network: the address straight away | `READY`, `AWAITING_PAYMENT`; after **Send the payment (sample)**: `PAYMENT_DETECTED`, then `PAID` (`onComplete`) |
| `demo-preset-coin` | A link that offers one coin: the payer picks only the network | `READY`, `CHOOSING` |
| `demo-detected-expired` | A transfer seen before the pay-by time, which has passed since | `READY`, `PAYMENT_DETECTED` |
| `demo-underpaid-60` | 60.00 of a 100.00 USD payment received | `READY`, `UNDERPAID`; after **Send the rest (sample)**: `PAYMENT_DETECTED`, then `PAID` (`onComplete`) |
| `demo-repeat` | Paid, then sent again: both transfers and the extra | `READY`, `OVERPAID` (`onComplete`) |
| `demo-topup` | A customer's top-up page | `READY`, `CHOOSING`, both with `mode: "topup"`; once a network is chosen, after **Send a deposit (sample)**: `PAYMENT_DETECTED`, then `DEPOSIT_CREDITED` (`onDeposit`), with `mode: "topup"` and `livemode: false` |
| `embed-demo` | A shop's order page with a Pay with crypto button, its code and every callback it receives | |
<!-- samples:end -->

Any other id is not a sample: the page treats it as a payment link it cannot read (`INVALID_LINK`, `onError` `TOKEN_INVALID`). The samples are served where Unigox has turned them on for the site. If `https://www.unigox.com/pay/demo` answers "page not found", write to support@unigox.com.

## Test before you go live

Write to support@unigox.com for staging access (the portal's **Developers** page has an **Ask for staging access** button that fills in your wallet). Staging has its own API address and its own portal, whose Developers page shows that address. It also has its own site that serves `checkout.js` and `/pay`, which Unigox names with the access: a staging link opens only there, and a production link only on `https://www.unigox.com`, so use the staging site in place of `https://www.unigox.com` in every example while you test. Sign `environment: "staging"` there, sign `callbackUrl: ""`, and ask Unigox which networks and test coins staging accepts before you send anything. Then pay small amounts:

1. Pay exactly the amount: the page shows Payment completed, your check (`verifyTransfers` or `fulfilInvoice`) finds the payment, and the order is paid once.
2. Pay less, then the rest from another network: the page shows how much was received of the amount and what remains, then Payment completed.
3. Pay more: Payment completed with the extra amount shown.
4. Two transfers that together make the amount.
5. A payment after the pay-by date, on a link whose `x` is earlier than the reservation's end: Payment arrived after the deadline.
6. Close the modal in the middle, pay, and open it again: the same state.
7. Close your page before the payment is credited, then pay: your periodic pass finds the payment (`fulfilInvoice` in history with the key; without the key, `verifyTransfers` with the transaction hash).
8. Block the checkout with your CSP (`frame-src 'none'`): Continue to secure checkout opens the same payment.
9. Your periodic pass when Unigox cannot be read: with `UNIGOX_PAYMENTS_API` pointing at an address that answers 502, broken JSON or nothing, the pass logs the error, keeps running and pays the order on the next pass once Unigox answers.
10. Run `fulfilInvoice` for one paid order from two places at once: the order is marked paid and shipped once.

If you give customers deposit addresses ([Customer deposit addresses](#customer-deposit-addresses)), test them too:

11. Create one customer's deposit page on staging and send two small deposits on two networks: the page and **Payments** show two credited deposits, and `creditDeposits` (or your history job) adds two credits to the customer.
12. Open the deposit page again: `onDeposit` repeats both deposits, and `creditDeposits` adds nothing.
13. Archive the customer, then send a deposit to one of their addresses: it is credited to your wallet as another credit, without the customer's reference text, and is not added to the customer.

## Going live

- Crypto processing is on for your production business account, and its **Developers** page shows **Environment** Production.
- Your server signs `environment: "production"` against the production API address, with `callbackUrl: ""`.
- Every network you offer shows `confirmed: true` for your addresses.
- Your periodic check (`verifyTransfers` or `fulfilInvoice`) runs for every open order, passed tests 9 and 10 on staging, and one small real payment passes tests 1 and 7.
- With deposit addresses: your periodic deposit job (with the key), or the person who credits deposits from **Payments**, runs at least as often as customers expect their balance to update, and passed tests 11 to 13 on staging.
- Only if Unigox turned notifications on for you: your receiver passed [its tests](#tests-for-your-receiver) and its production URL is not staging's.
- Your server confirms payments by one of the ways of step 4. If Unigox exported your wallet's private key, it is only in your secrets store.
- Your page ignores events whose `livemode` is not `true`.
- Every token carries your support email (`e`), so a payer with a problem can reach you.
- A link built on production opens on `https://www.unigox.com/pay/…` and shows its address (not "We couldn't check this payment link" or "This payment link can't be used"), and `checkout.js` and your Content-Security-Policy name `https://www.unigox.com`.

## Troubleshooting

| What you see | Why, and what to do |
| --- | --- |
| 400 `validation_callback_url_invalid` when you get or reserve an address | Callbacks are off in this environment, or the URL is not HTTPS on port 443, has a user name, password or `#` fragment, or is longer than `memoLimits.maxCallbackUrlBytes`. When callbacks are off, sign `callbackUrl: ""`. |
| 400 `validation_callback_url_not_public` | The callback host does not resolve to public addresses. Use a public HTTPS host. |
| 400 `validation_environment_mismatch` | The signed `environment` is not this API address's. Sign `"production"` or `"staging"` to match. |
| 401 `memo_lock_signature_invalid` | The signature does not recover your wallet: check the domain, the types and their field order, and that the body's `chainId` equals the domain's. |
| 400 `validation_deadline_invalid` | The deadline is not after the server's time or is further ahead than `memoLimits.maxWriteDeadlineSeconds`. Take it from a fresh `GET /config`, not from your own clock. |
| 400 `validation_memo_too_long`, `validation_memo_not_string` or `validation_text_not_well_formed` | The memo is longer than 256 UTF-8 bytes, not a string, or holds a NUL or broken Unicode. Shorten or fix the reference and sign again. |
| 401 `memo_lock_signature_expired` | The deadline has passed. Take a fresh one from `GET /config` for every new request. To retry getting an address whose answer was lost, send the same signed body again (step 2, option B); after this answer it is spent: with an address in `data.allocated`, reserve that address with a signed `Lock` (`reserveMemo()`); with none, sign a new request. |
| 409 `memo_lock_nonce_used` | This nonce was used before. After a lost answer to a reserve or end request, read the address's newest reservation with a signed `POST /memo-locks/list` to see whether it went through; sign a new request only if it did not. |
| 409 `deposit_address_already_locked` | The address still has an active reservation. After a `Lock` whose answer was lost, read the address's newest reservation first (`newestReservation()`, step 3): one with your wallet and memo is the reservation that `Lock` made, so take its address ID instead of signing another. Otherwise get a new address; reuse this one only once its payment was paid in full and credited, and its reservation ended at least 7 days ago. |
| 429 `deposit_addresses_cap_exceeded` | You reached your address limit (1,000 addresses per address type unless Unigox raised it). Reuse addresses whose last payment was paid in full and whose reservation ended at least 7 days ago, longest idle first, or write to support@unigox.com to raise the limit. |
| 429 `rate_limited` | Too many requests from your server or wallet, or memo writes are not open in this environment yet. Wait and send the same request again; if it persists, contact Unigox. |
| 503 `deposit_address_not_watched` | The address is not watched yet (Solana, TON). When you get a new address, the saved address is in `data.allocated`: send the same signed body again later. When you reserve an address after ending its reservation, the address has no memo until the reservation succeeds, and a transfer in between arrives without reference. |
| 503 `signature_verification_unavailable` | Unigox cannot check signatures right now. Nothing was written: send the same request again later. |
| 202 `addresses_preparing` | The address is not watched on every network yet. Offer only networks with `confirmed: true`, or wait. |
| `GET /transaction/…`: 404 `from_tx_not_found` | The transfer is not indexed yet, or the chain or hash is wrong. Ask again later; history is the authority. |
| `GET /transaction/…`: 400 `validation_invalid_quote_id` or `validation_invalid_log_index` | `quoteId` must be a quote id from the API, and `logIndex` a whole number without a sign or leading zero. |
| The payer sent money but the checkout shows nothing | The checkout counts only the coins and networks it offered, sent to the address it showed. Look the address up in history by `chainType` and `depositAddress`. For a transfer that is not there, send Unigox support the network and transaction hash. |
| The payer sees "This payment link doesn't work" | The token cannot be read: the link was cut off or edited. Send the whole link again. |
| The payer sees "This payment link can't be used" (`UNIGOX_CHECKOUT_INVALID_LINK`, `onError` `TOKEN_INVALID`) | Unigox's link check (`GET {UNIGOX_LINK_CHECK_API}/crypto-checkout/memo-locks/{lockId}`) did not find an open reservation that matches the link: `w` is not the lowercase wallet that signed it, `r` is not the memo you reserved byte for byte, an address type's `k` is another address's ID, or the reservation was ended or has expired. Build the link again from the answers of step 2 (step 1, option B). |
| The payer sees "We couldn't check this payment link" (`UNIGOX_CHECKOUT_UNAVAILABLE`, `onError` `CHECKOUT_UNAVAILABLE`) | Unigox did not answer the link check, or limited the requests coming from the payer's network (429, more than 120 a minute per IP address: many payers behind one office or mobile network share it). Nothing is wrong with the link: the payer presses **Try again**. If it lasts, write to support@unigox.com. |
| The payer sees "This payment request is closed" | The address's reservation was ended or has expired, or a newer payment uses the address. Make a new payment and send its link. |
| "Received without reference" | The address's reservation ended or changed before the transfer. The money is credited to your wallet without this payment's reference: match it in history by `depositAddress`. |
| No notification reaches your server | Notifications are not available yet. Your periodic `verifyTransfers` or `fulfilInvoice` pass finds the payment. |
| A deposit is missing from the customer's page | The page lists the coins and networks it offers, sent to the customer's address on that network, and only from the time the customer's first address was reserved (`t`). A deposit in progress shows once its transfer is seen; one on hold shows as on hold. On another network the page offers, the customer can find it with **Deposit missing? Find it by its hash**. Otherwise look the address up in history by `chainType` and `depositAddress`, or in **Payments**. A deposit sent after you archived the customer is not theirs any more: it arrives as another credit. |
| A deposit was credited twice in my system | Your ledger counted one transfer twice. Count each deposit once by its transfer ID (`quoteId`), per environment, in the same database transaction that adds it to the balance, never by the transaction hash alone (one transaction can hold several deposits). Use one ledger: never mix one keyed by `quoteId` with one keyed by `intentId`. Correct the customer's balance by hand, and check the deposit in **Payments**. |
| The dialog always shows Continue to secure checkout | Your Content Security Policy blocks the frame. Allow `https://www.unigox.com` in `frame-src` (see Security), and `https://unigox.com` too if you load `checkout.js` from there. |
| `UnigoxCheckout is not defined` | `checkout.js` did not load: an ad blocker, the network, or a CSP without `script-src https://www.unigox.com`. Send the payer to the hosted page when `window.UnigoxCheckout` is missing (see the modal example). |
| `checkout.js` or the checkout is blocked on a page with `Cross-Origin-Embedder-Policy: require-corp` | `/checkout.js` sends `Cross-Origin-Resource-Policy: cross-origin` and the embed (`/pay/…?embed=1`) sends `Cross-Origin-Embedder-Policy: require-corp` plus `Cross-Origin-Resource-Policy: cross-origin`, so a require-corp page can load both. If your browser still blocks the frame, the dialog shows **Continue to secure checkout** and the hosted page takes the payment. |

## Questions

**Do I need a developer?** Not for payment links, deposit addresses or a button with a payment link you made in the portal. You need one to make links from your server for every order, or to confirm payments on your server.

**Do I have to build a notification receiver?** No. Notifications are not available yet: your server checks payments itself (step 4).

**Is there an API key?** No. Pages and the no-key confirmation need nothing secret. Making links and reading history are signed with your Unigox wallet's private key.

**Why does my server need my whole wallet's key?** Reserving a payment address is signed by the wallet that owns it, and Unigox has no key that can only reserve addresses or only read payments yet. Keep that wallet's balance low and the key in a secrets store ([What you need](#what-you-need)).

**How do I know a payment arrived without notifications?** Your server checks: [Confirm without the key](#confirm-without-the-key) for the transfers your page heard about, or your signed history with the key. Run it from your return page and from a periodic job. **Payments** in the portal shows every payment too.

**Can my customer pay from an exchange?** Yes, if the exchange can withdraw the coin on the network the page shows. Exchanges often keep a fee: a shortfall of at most 0.5 % of the amount, and never more than 1.00 USD, counts as paid.

**What if they pay too little or too much?** Too little shows as `underpaid` and the customer can send the rest to the same address; more is credited and shows as `overpaid`. [When a payment is not exact](https://www.unigox.com/crypto-processing/help/exceptions) lists every case and what to do.

**What if they pay late or on the wrong network?** After the pay-by date the payment still arrives, as `paid_late`, and your server decides. A coin or network the page offers is usually credited; one it does not offer is not credited to the payment and not returned by itself: write to support@unigox.com with the network, the transaction hash, the coin, the amount and the receiving address. Recovery is not guaranteed.

**Can I test without money?** Yes, with the [samples](#test-your-page-without-money). There is no test mode for real links: a real link takes real money, so finish with one small real payment.

**Which languages does the checkout speak?** English, Spanish, French and Portuguese: it follows the payer's browser, or the `locale` you pass.

**Can I refund a payment?** Unigox does not send money back for you. Ask the payer for an address they control and send from your Unigox wallet.

**Where do I see payments made on my site?** In **Crypto processing → Payments**, with the link's reference, exactly like payments to links you sent yourself.

**What does it cost?** Ask Unigox: write to support@unigox.com.

## Types

`https://www.unigox.com/checkout.d.ts` declares `window.UnigoxCheckout` for TypeScript: every option, method, callback, event, status, payment field and error code above. Copy it into your project (or list it in `files` of your `tsconfig.json`); it is generated from the same source as the checkout's messages, so it names exactly what the checkout sends.

## Versions and compatibility

`https://www.unigox.com/checkout.js` is version 1. It updates in place, and every update stays compatible with the options, methods, callbacks and events above. A change that is not compatible ships as a new file (`checkout.v2.js`), and version 1 keeps working for at least 90 days after it.

Within version 1, Unigox may add events, statuses, payload fields, options and error codes. Write your page so that it ignores what it does not know: an unknown event, status or field is never a reason to fail an order. Unigox never removes or renames one of them, never changes a field's type, and never changes what `livemode`, `paid` or `onComplete` mean without a new major version.

The API address and the link check address on the Developers page are hosting addresses and can change: keep them in your configuration. The public endpoints this guide uses (`GET /config` and `GET /transaction/…` of the Unigox payments API, and the link check `GET {UNIGOX_LINK_CHECK_API}/crypto-checkout/memo-locks/{lockId}`) keep their fields; new fields can appear.

## Changes

Each entry says whether it changes how money is counted ("Money").

- **2026-11-02 · types:** `checkout.d.ts` lists the `onClose` reason `return`, which `checkout.js` sends when the payer chooses Back and your page has no `onReturn`. `checkout.js` itself is unchanged. Money: no change.
- **2026-10-30 · 1.1.0:** the checkout speaks the payer's browser language by default (`locale: "auto"`); TypeScript types at `/checkout.d.ts`. The loader accepts `walletNavigation` and `onOpenWallet` ahead of time, but they do nothing yet (planned). Money: no change.
- **2026-10-29 · 1.0.1:** a dialog kept alive stops checking for the payment while it is closed (the `UNIGOX_CHECKOUT_VISIBILITY` host message); nothing changes for your page. Money: no change.
- **2026-10-27 · 1.0.0:** first version: modal, inline and hosted modes, `bind()`, the events above, and the hosted fallback.

None of these is in production yet: the first public release is early access (see the top of this guide).

## Notifications to your server (not available yet)

> **Not available yet.** Production sends your server no notification of a payment. Build nothing from this section until Unigox tells you it has turned notifications on for you; until then your server confirms payments as [4. Confirm the payment on your server](#4-confirm-the-payment-on-your-server) shows. This section says what changes then.

Once notifications are on, Unigox posts a `deposit.credited` notice to the `callbackUrl` you signed when you reserved an address. It is only a reason to look: your receiver stores it and calls `fulfilInvoice()`, which decides from your history, exactly as your periodic job does. Links made in the portal carry no callback address, so they never send one.

### The `deposit.credited` webhook

Sent to the `callbackUrl` you signed when you reserved the address, and only while notifications are on in that environment: read `GET /config`, where `memoLimits.maxCallbackUrlBytes` is above 0 and `webhookKeys` lists at least one key once they are. Then sign your receiver's URL (public HTTPS on port 443) as `callbackUrl` in [option B](#option-b-from-your-server).

This is not the partner API's webhook. Partner API events such as `order.status.changed` carry an HMAC (`sha256=<hex>`, keyed by your webhook secret) in the same `X-Unigox-Signature` header. `deposit.credited` is signed with Ed25519 and always comes with `X-Unigox-Key-Id`.

Verify every delivery before you trust it. The receiver below runs on Node 20+ with Express 4 or 5:

```js
// app.post("/webhooks/unigox/production", express.raw({ type: "application/json" }), receiver);
import { createPublicKey, verify } from "node:crypto";
import { keccak256, toBytes } from "viem";

// In the same file as fulfilInvoice() of step 4, whose ENVIRONMENT, WALLET and unigoxCall() it uses.
// One receiver URL per environment.
const CALLBACK_URL = "https://shop.example/webhooks/unigox/production";
const KEY_ID = /^[A-Za-z0-9._-]{1,64}$/;                   // the form every Unigox key id has
const KEYS_MAX_AGE = 600_000;                              // keys are read again once they are ten minutes old
let keys = new Map();                                      // keyId -> KeyObject, from GET /config
let keysAttemptAt = 0; // rate-limit attempts independently of successful reads
let keysReadAt = 0;                                        // when keys were last successfully read
let keysFailed = false;                                    // whether that read failed
let keysReading = null;                                    // the read in progress, shared by every request

// At most one GET /config a minute, and one at a time, so unknown key ids cannot flood Unigox from your server.
// A read replaces every key, so a key Unigox withdrew is gone; a failed read never extends their ten-minute lifetime.
function refreshKeys() {
  if (keysReading || Date.now() - keysAttemptAt < 60_000) return keysReading;
  keysAttemptAt = Date.now();
  keysReading = unigoxCall("/config", "fetched").then((config) => {
    if (!Array.isArray(config.webhookKeys)) throw new Error("Unigox /config: no webhookKeys");
    keys = new Map(config.webhookKeys
      .filter((k) => k.algorithm === "ed25519" && (k.status === "active" || k.status === "retiring"))
      .map((k) => [k.keyId, createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: Buffer.from(k.publicKey, "base64").toString("base64url") }, format: "jwk" })]));
    keysReadAt = Date.now();
    keysFailed = false;
  }).catch((error) => {
    keysFailed = true;
    throw error;
  }).finally(() => { keysReading = null; });
  return keysReading;
}

async function handler(req, res) {
  const rawBody = req.body;                                // the exact bytes received
  if (!Buffer.isBuffer(rawBody) || !rawBody.length) return res.sendStatus(400); // no application/json body
  const timestamp = req.get("X-Unigox-Timestamp");
  const keyId = req.get("X-Unigox-Key-Id") ?? "";
  const signature = Buffer.from(req.get("X-Unigox-Signature") ?? "", "base64");
  if (!/^\d+$/.test(timestamp ?? "") || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return res.sendStatus(401);
  if (!KEY_ID.test(keyId)) return res.sendStatus(401);     // not a key id: no /config read for it
  // Never trust a key sent in the request. A key id not known yet, or keys ten minutes old: read GET /config again.
  if (!keys.has(keyId) || Date.now() - keysReadAt >= KEYS_MAX_AGE) {
    try {
      await refreshKeys();
    } catch (error) {
      console.error("GET /config", error);
      return res.sendStatus(503);    // Unigox cannot be read: it delivers again later
    }
    if (keysFailed || Date.now() - keysReadAt >= KEYS_MAX_AGE) return res.sendStatus(503);
  }
  const key = keys.get(keyId);
  const signed = Buffer.concat([Buffer.from(`${timestamp}.`, "utf8"), rawBody]);
  if (!key || !verify(null, signed, key, signature)) return res.sendStatus(401);

  const event = JSON.parse(rawBody.toString("utf8"));
  if (event?.type !== "deposit.credited" || event.apiVersion !== "1" || event.data?.status !== "DONE") return res.sendStatus(400);
  if (event.data.callbackUrlHash?.toLowerCase() !== keccak256(toBytes(CALLBACK_URL))) return res.sendStatus(400);
  if (event.data.wallet?.toLowerCase() !== WALLET.toLowerCase()) return res.sendStatus(400); // your wallet, any letter case

  // Store the event under (environment, type, id) before answering; a repeat delivery is answered 2xx too.
  await events.saveOnce(ENVIRONMENT, event.type, event.id, rawBody);
  res.sendStatus(200);
  // Fulfil after the answer, outside this request. When it fails (Unigox cannot be read, the payment is not in
  // history yet), the order stays open and your periodic fulfilInvoice pass pays it later: log the error, never throw it.
  fulfilInvoice(event.data.memoLockId).catch((error) => console.error("fulfilInvoice", event.data.memoLockId, error));
}

// Express 4 does not catch a rejected async handler, and Node then stops the whole process. This passes the error
// to Express, which answers 500, and Unigox delivers again later. Express 5 does the same by itself.
export const receiver = (req, res, next) => handler(req, res).catch(next);
```

Retries keep the same event `id` with a new timestamp and signature. `X-Unigox-Key-Id` alone does not tell you the environment: use one receiver URL per environment, as above.

What the receiver answers:

- **400** when the body is empty or not `application/json` (Express then leaves `req.body` unread), or the event is not yours.
- **401** for a timestamp more than five minutes off, something that is not a key id, an unknown key or a wrong signature. An unknown key id makes it read `GET /config` once, and again at most once a minute; a delivery signed with a key Unigox published within that minute is answered 401 once and delivered again later. The keys are also read again once they are ten minutes old, so a key Unigox has withdrawn from `GET /config` stops being accepted.
- **503** while `GET /config` cannot be read: an error page, a broken answer, no answer within 10 seconds or `status: "not_fetched"`. Cached keys remain usable only within ten minutes of the last successful read; a failed refresh does not extend that lifetime.
- **500** when anything else throws, for example your database. Unigox delivers again later.
- **200** once the event is stored, before fulfilment runs.

`deposit.credited` is sent when a deposit reaches status `DONE`, whatever its `subStatus`: a refunded deposit (`DONE` / `REFUNDED`) and a partly settled one (`DONE` / `PARTIAL`) send it too, and its body carries neither `subStatus` nor `refund`. Treat it as a reason to look, never as the credit: `fulfilInvoice` decides.

### Tests for your receiver

On staging, once Unigox has turned notifications on there: give staging its own receiver URL (callbacks reach only public HTTPS addresses on port 443; while you build, use an HTTPS tunnel), then check that:

1. A paid order's notice arrives, and the order is paid once.
2. With your receiver off, a payment is still found by the periodic `fulfilInvoice` pass once you turn it back on.
3. A `text/plain` body and an empty body get 400; 50 requests with made-up key ids read `GET /config` at most once; with `UNIGOX_PAYMENTS_API` pointing at an address that answers 502, broken JSON or nothing, an unknown key id gets 503 and the process keeps running; a valid delivery while history cannot be read gets 200, the error is logged, and the next periodic pass pays the order.

In production, your receiver URL is not staging's.
