# Unigox Checkout: networks, troubleshooting and changes

> **Not available yet.** This page describes Unigox Checkout ahead of its release. Until this notice is gone, `https://www.unigox.com/checkout.js`, the help pages and the link check it names can answer 404. Once released, crypto processing is in early access, turned on per business.

> **Unigox Checkout guide:** [Quickstart](https://developers.unigox.com/tutorials/crypto-checkout) · [Embed](https://developers.unigox.com/tutorials/crypto-checkout-embed) · [Confirm payments](https://developers.unigox.com/tutorials/crypto-checkout-confirm) · [Links and deposit pages from your server](https://developers.unigox.com/tutorials/crypto-checkout-links) · [Test and go live](https://developers.unigox.com/tutorials/crypto-checkout-testing) · **Reference** · [All on one page](https://www.unigox.com/checkout-integration.md)

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
| No notification reaches your server | Notifications are not available yet. Run `fulfilInvoice` against signed history to find unreported payments. `verifyTransfers` only checks transfer IDs already reported to your server. |
| A deposit is missing from the customer's page | The page lists the coins and networks it offers, sent to the customer's address on that network, and only from the time the customer's first address was reserved (`t`). A deposit in progress shows once its transfer is seen; one on hold shows as on hold. On another network the page offers, the customer can find it with **Deposit missing? Find it by its hash**. Otherwise look the address up in history by `chainType` and `depositAddress`, or in **Payments**. A deposit sent after you archived the customer is not theirs any more: it arrives as another credit. |
| A deposit was credited twice in my system | Your ledger counted one transfer twice. Count each deposit once by its transfer ID (`quoteId`), per environment, in the same database transaction that adds it to the balance, never by the transaction hash alone (one transaction can hold several deposits). Use one ledger: never mix one keyed by `quoteId` with one keyed by `intentId`. Correct the customer's balance by hand, and check the deposit in **Payments**. |
| The dialog always shows Continue to secure checkout | Your Content Security Policy blocks the frame. Allow `https://www.unigox.com` in `frame-src` (see Security), and `https://unigox.com` too if you load `checkout.js` from there. |
| `UnigoxCheckout is not defined` | `checkout.js` did not load: an ad blocker, the network, or a CSP without `script-src https://www.unigox.com`. Send the payer to the hosted page when `window.UnigoxCheckout` is missing (see the modal example). |
| `checkout.js` or the checkout is blocked on a page with `Cross-Origin-Embedder-Policy: require-corp` | `/checkout.js` sends `Cross-Origin-Resource-Policy: cross-origin` and the embed (`/pay/…?embed=1`) sends `Cross-Origin-Embedder-Policy: require-corp` plus `Cross-Origin-Resource-Policy: cross-origin`, so a require-corp page can load both. If your browser still blocks the frame, the dialog shows **Continue to secure checkout** and the hosted page takes the payment. |

## Questions

**Do I need a developer?** Not for payment links, deposit addresses or a button with a payment link you made in the portal. You need one to make links from your server for every order, or to confirm payments on your server.

**Do I have to build a notification receiver?** No. Notifications are not available yet: your server checks payments itself (step 4).

**Is there an API key?** No. Pages and the no-key confirmation need nothing secret. Making links and reading history are signed with your Unigox wallet's private key.

**Why does my server need my whole wallet's key?** Reserving a payment address is signed by the wallet that owns it, and Unigox has no key that can only reserve addresses or only read payments yet. Keep that wallet's balance low and the key in a secrets store ([What you need](https://developers.unigox.com/tutorials/crypto-checkout#what-you-need)).

**How do I know a payment arrived without notifications?** Your server checks: [Confirm without the key](https://developers.unigox.com/tutorials/crypto-checkout-confirm#confirm-without-the-key) for the transfers your page heard about, or your signed history with the key. Run it from your return page and from a periodic job. **Payments** in the portal shows every payment too.

**Can my customer pay from an exchange?** Yes, if it supports withdrawals in the selected coin and network. The customer must allow for withdrawal fees. By default, a shortfall of at most 0.5% of the amount, capped at 1.00 USD, counts as paid. A link using **Full amount only** permits no shortfall.

**What if they pay too little or too much?** Too little shows as `underpaid` and the customer can send the rest to the same address; more is credited and shows as `overpaid`. [When a payment is not exact](https://www.unigox.com/crypto-processing/help/exceptions) lists every case and what to do.

**What if they pay late or on the wrong network?** If a transfer sent after the pay-by date is needed to cover the amount, the payment is `paid_late`, and your server decides whether the order still stands. An extra sent after an on-time payment stays recorded without making that invoice late. A coin or network the page offers is usually credited; one it does not offer is not credited to the payment and not returned by itself: write to support@unigox.com with the network, the transaction hash, the coin, the amount and the receiving address. Recovery is not guaranteed.

**Can I test without money?** Yes, with the [samples](https://developers.unigox.com/tutorials/crypto-checkout-testing#test-your-page-without-money). There is no test mode for real links: a real link takes real money, so finish with one small real payment.

**Which languages does the checkout speak?** English, Spanish, French and Portuguese: it follows the payer's browser, or the `locale` you pass.

**Can I refund a payment?** You arrange refunds for funds already credited to your wallet. Confirm a receiving address and network with the payer, then send from your Unigox wallet. This is separate from Unigox returning a transfer it could not credit. See [Returning money](https://www.unigox.com/crypto-processing/help/exceptions#returning-money).

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

> **Not available yet.** Production sends your server no notification of a payment. Build nothing from this section until Unigox tells you it has turned notifications on for you; until then your server confirms payments as [4. Confirm the payment on your server](https://developers.unigox.com/tutorials/crypto-checkout-confirm#4-confirm-the-payment-on-your-server) shows. This section says what changes then.

Once notifications are on, Unigox posts a `deposit.credited` notice to the `callbackUrl` you signed when you reserved an address. It is only a reason to look: your receiver stores it and calls `fulfilInvoice()`, which decides from your history, exactly as your periodic job does. Links made in the portal carry no callback address, so they never send one.

### The `deposit.credited` webhook

Sent to the `callbackUrl` you signed when you reserved the address, and only while notifications are on in that environment: read `GET /config`, where `memoLimits.maxCallbackUrlBytes` is above 0 and `webhookKeys` lists at least one key once they are. Then sign your receiver's URL (public HTTPS on port 443) as `callbackUrl` in [option B](https://developers.unigox.com/tutorials/crypto-checkout-links#option-b-from-your-server).

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
