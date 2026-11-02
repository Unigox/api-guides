# Unigox Checkout: make payment links and deposit pages on your server

> **Not available yet.** This page describes Unigox Checkout ahead of its release. Until this notice is gone, `https://www.unigox.com/checkout.js`, the help pages and the link check it names can answer 404. Once released, crypto processing is in early access, turned on per business.

> **Unigox Checkout guide:** [Quickstart](https://developers.unigox.com/tutorials/crypto-checkout) · [Embed](https://developers.unigox.com/tutorials/crypto-checkout-embed) · [Confirm payments](https://developers.unigox.com/tutorials/crypto-checkout-confirm) · **Links and deposit pages from your server** · [Test and go live](https://developers.unigox.com/tutorials/crypto-checkout-testing) · [Reference](https://developers.unigox.com/tutorials/crypto-checkout-reference) · [All on one page](https://www.unigox.com/checkout-integration.md)

## Make payment links on your server

Without code you make each order's link in the portal (option A). To make a link for every order automatically, your server reserves the payment addresses itself and builds the link. That needs your Unigox wallet's private key, which Unigox exports on request: whoever holds it can move the wallet's money ([What you need](https://developers.unigox.com/tutorials/crypto-checkout#what-you-need)).

### Option B: from your server

> **Is this for you?** What you gain: a payment link made for every order automatically, with nobody copying links from the portal. What it costs: a developer; your Unigox wallet's private key on your server, a key that can move every balance in that wallet; and a job that checks your open orders every few minutes. The alternative: make each link in the portal (**Payment links → Create payment link**) and paste it into your button or email. That needs no key and no code beyond the button. [Server integration in one page](#server-integration-in-one-page) shows the whole path in one file.

Your server makes the link of each order itself, in seven steps. Here a payment is your memo (the reference text, see [Words used in this guide](https://developers.unigox.com/tutorials/crypto-checkout#words-used-in-this-guide)) reserved on one payment address for each address type you accept (`evm` for every Ethereum-style network, `tvm` for TRON, `ton`, `svm` for Solana), and a link that tells the checkout what to show. Each step ends with what you should see; the cases you meet less often are under "If something goes wrong". A complete example for one customer's deposit page is under [Customer deposit addresses](#customer-deposit-addresses).

1. **Ask Unigox for your wallet key.** Your server signs every request with the private key of your Unigox wallet ([What you need](https://developers.unigox.com/tutorials/crypto-checkout#what-you-need) explains how to get it and how to keep it). What you should see: your server signs with the wallet address the **Developers** page shows.

2. **Get an address for the order.** One request makes a new payment address and reserves it for the order's memo. Each request is EIP-712 typed data signed by your wallet, with a fresh 32-byte nonce and a deadline taken from `GET /config`. Your server keeps the answer with the order: the address, its address ID and the networks that are ready. Call it once for each address type you accept. Type the request path and the signing domain's name exactly as the code has them.

   - **What it does:** asks Unigox for a new payment address and sets it aside for this order's reference text, signed with your wallet's key.
   - **What you keep:** the address, its address ID and its `monitoring` (which networks are ready), with the order.
   - **What can go wrong:** a lost answer or a refused request; see "If something goes wrong" below. Never sign a second request for the same order before you know the first failed.

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
   };
   const nonce = () => "0x" + Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");

   // A new payment address of one address type ("evm", "tvm", "ton" or "svm"), reserved for this memo.
   export async function reserveAddress(chainType, memo) {
     const { memoLimits } = await (await fetch(`${UNIGOX_PAYMENTS_API}/config`, { cache: "no-store" })).json();
     const message = {
       action: "allocate_and_lock", wallet: WALLET, environment: ENVIRONMENT, chainType, memo,
       expiresAt: "0",  // no end: the memo stays on the address until you end the reservation
       callbackUrl: "", // callbacks are off in production: confirm through step 6
       nonce: nonce(),
       deadline: String(Number(memoLimits.serverTimeSeconds) + Number(memoLimits.maxWriteDeadlineSeconds)),
     };
     const signature = await walletClient.signTypedData({ account, domain, types, primaryType: "AllocateAndLock", message });
     const response = await fetch(`${UNIGOX_PAYMENTS_API}/memo-locks/allocate`, {
       method: "POST", headers: { "Content-Type": "application/json" },
       body: JSON.stringify({ chainId: domain.chainId, message, signature }),
     });
     const result = await response.json();
     const made = result.data?.allocated?.[0];
     if (!response.ok || made?.lock?.status !== "ACTIVE") throw new Error(result.details ?? result.status ?? `HTTP ${response.status}`);
     // Keep these with the order: step 4 builds the link from them, step 6 confirms with them.
     return { address: made.address, addressId: made.lock.lockId, monitoring: made.monitoring };
   }

   const memo = `${order.reference} · ${order.amount} USD`; // e.g. "NW-20418 · 250.00 USD"
   const evm = await reserveAddress("evm", memo);
   ```

   Write the memo as `<your order reference> · <amount> USD`, for example `NW-20418 · 250.00 USD`: the reference, a space, a middle dot (`·`, U+00B7), a space, the amount (up to 12 digits, a point and up to two decimals), a space and `USD`. The whole memo is at most 256 UTF-8 bytes. The portal reads that format back, and the checkout refuses a link whose amount differs from the amount in the memo. A memo in any other form (another separator, a comma in the amount, another currency) is taken as a memo without an amount: the checkout then has nothing to check the link's amount against, and shows whatever amount the link says.

   The memo text stays private (only your wallet reads it back), but its fingerprint is public in transaction status. Anyone who can guess a memo, for example an order number and its amount, can tell which public transfer paid it. And anyone who holds one of your links knows your wallet, so they can ask Unigox's public link check ([Headless](#headless-your-own-payment-page) gives its address) whether a guessed memo is reserved, and learn its address and state. Keep personal data out of the reference, and add a random part to it, for example `NW-20418-k3f9q2`.

   What you should see: HTTP 200 `memo_locked` (or 202 `addresses_preparing`, step 3) and an address with an address ID.

   **Callback address.** Getting an address and reserving one both sign a `callbackUrl`. Notifications to your server are not available yet, so sign `callbackUrl: ""` and confirm payments as [4. Confirm the payment on your server](https://developers.unigox.com/tutorials/crypto-checkout-confirm#4-confirm-the-payment-on-your-server) shows. Any other value is refused with 400 `validation_callback_url_invalid` and nothing is reserved. [Notifications to your server (not available yet)](https://developers.unigox.com/tutorials/crypto-checkout-reference#notifications-to-your-server-not-available-yet) says what changes once Unigox turns them on for you.

   **If something goes wrong:**
   - **An answer is lost** (a timeout, a dropped connection, a 5xx). Do not sign a new request for the same order. To get an address, send the same signed body again, with the same nonce, also after its deadline: it answers with the address and reservation it made the first time. If the deadline passed before the memo was reserved, it answers 401 `memo_lock_signature_expired` with that address in `data.allocated`: reserve it with a new signed `Lock`. A new nonce makes a second address. To reserve or end a reservation of an address you already have (`POST /memo-locks/lock`, signed `Lock`, or `POST /memo-locks/unlock`, signed `Unlock`), a resend answers 409 `memo_lock_nonce_used`, also when the first one took effect. Read the address's newest reservation with a signed `POST /memo-locks/list` (`{"chainType", "address", "limit": "1"}`): if it shows your memo (reserve) or is closed (end), the request went through; if not, sign a new one with a fresh nonce and deadline.
   - **Environment and chain id.** `environment` is `"production"` against the production API address and `"staging"` against staging's, as the Developers page shows. A wrong one is refused with 400 `validation_environment_mismatch`. The request body's `chainId` must equal the domain's `chainId`. This chain id only names the chain your signature is made for; it has nothing to do with the networks your customers pay on. An ordinary wallet (EOA) may sign on any chain id: the examples use 42161, and the portal signs with 660279. A contract wallet (ERC-1271) must sign on a chain Unigox has enabled for contract wallets: ask Unigox which one.
   - **Reusing an address.** A new address is the safe choice. Reuse an address only when its last payment was paid in full and credited, and its reservation ended at least 7 days ago. Until the new memo is reserved, a second transfer from the same payer (a double send, an exchange retrying a withdrawal) carries no reference; once it is reserved, that transfer is credited to the new payment. The portal works this way: it takes a new address while an address type holds less than 80 % of its limit of 1,000 addresses, and only past that reuses the address of a link that was paid in full and closed at least 7 days ago, longest idle first. It never takes the address of an open link (paid or not), of a partly paid or unpaid link, or of a customer's deposit page. At the limit, write to support@unigox.com to raise it. Never use your main deposit address (address index 0): your own top-ups there would count as this payment. Never reuse an address whose payment is unpaid, part paid or closed unpaid: a late payment for it would count toward the next payment on the address.
   - **To reuse an address**, first end its earlier payment's reservation with `POST /memo-locks/unlock` (signed `Unlock`), then reserve the new memo with `POST /memo-locks/lock` (signed `Lock`, `expiresAt: "0"`): the address keeps its text and the new reservation gets a new address ID. The earlier payment's link names the ended reservation, so it now opens as closed. It shows the payment it received only in the browser that followed it; elsewhere the customer sees a closed link with no payment, so keep your own order page as the customer's receipt. Never send the old link again, and build every new payment's link from its new reservation.
   - **The signing domain.** Each request is signed under the `domain` of the code above, with a fresh 32-byte nonce and a deadline taken from `GET /config` (`memoLimits.serverTimeSeconds + memoLimits.maxWriteDeadlineSeconds`). The [API reference: payment addresses](https://developers.unigox.com/api-reference/payment-addresses) has the exact types of `Lock`, `Unlock` and `ListLocks` and a complete example. No API key or account token is used.

3. **Wait for the networks to be ready.** An EVM or TRON address can answer `202 addresses_preparing`. Only networks with `confirmed: true` in `monitoring` take payments yet. Show the checkout once the networks you want are confirmed, or show it now: the checkout offers only the networks the link lists as ready, and that list does not update by itself. If you send the link before every network is ready, build the link again once they are (a signed `POST /memo-locks/list` with `{"chainType", "address", "limit": "1"}` returns the reservation's current `monitoring`), and send the new link. What you should see: `confirmed: true` for each network you offer.

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

5. **Add the button.** Put the link into your page with the code of [2. Show the checkout](https://developers.unigox.com/tutorials/crypto-checkout-embed#2-show-the-checkout). What you should see: the button opens your order's checkout.

6. **Confirm on your server.** Mark the order paid only from your server, as [4. Confirm the payment on your server](https://developers.unigox.com/tutorials/crypto-checkout-confirm#4-confirm-the-payment-on-your-server) shows. What you should see: a small real payment marks its order paid once.

7. **Test and go live.** Follow [Test before you go live](https://developers.unigox.com/tutorials/crypto-checkout-testing#test-before-you-go-live) and [Going live](https://developers.unigox.com/tutorials/crypto-checkout-testing#going-live).

### Server integration in one page

The whole path of one order, from "order created" to "order paid", in two files: `unigox.mjs` holds the blocks of this guide, pasted once; `server.mjs` is your shop. It keeps orders in memory to stay short: use your own database.

- **What it does:** when the payer presses **Pay with crypto**, your server reserves an address for the order and returns its link; the checkout shows it; your page reports each transfer; your server checks it with Unigox and marks the order paid once. A job checks every open order each minute, so a payment is found even when the payer closed the page.
- **What you keep:** with each order, its reference text, its address IDs and the transfer IDs you counted.
- **What can go wrong:** written next to each step in the code.

**`unigox.mjs`**: paste, in this order: step 2's block of [Option B](#option-b-from-your-server) without its last two lines (they are an example call), the two builders of [The token builders](#the-token-builders) (`paymentToken()` and its helpers is enough), and `verifyTransfers()` and `isPaid()` of [Confirm without the key](https://developers.unigox.com/tutorials/crypto-checkout-confirm#confirm-without-the-key). Keep one `UNIGOX_PAYMENTS_API` line and move the `import` lines to the top. Then add your key and the exports:

```js
// At the top of unigox.mjs. npm install viem. The key comes from your secrets store, never from code.
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrum } from "viem/chains";
const account = privateKeyToAccount(process.env.UNIGOX_WALLET_KEY);
const walletClient = createWalletClient({ account, chain: arbitrum, transport: http() });

// …the pasted blocks…

// At the end of unigox.mjs:
export { paymentToken, WALLET };
```

**`server.mjs`**:

```js
// Node 20+. UNIGOX_PAYMENTS_API and UNIGOX_WALLET_KEY in the environment; run: node server.mjs
import { createServer } from "node:http";
import { isPaid, paymentToken, reserveAddress, verifyTransfers, WALLET } from "./unigox.mjs";

const shop = new Map([["NW-20418", "250.00"]]); // your orders and their amounts in USD
const orders = new Map();                         // what this example keeps per order
const counted = new Set();                        // transfer IDs (quoteId) already added, each once

// 1. Order created, the payer pressed Pay: reserve an address and build the link, once per order.
async function linkFor(id) {
  if (orders.has(id)) return orders.get(id).token;
  const amount = shop.get(id);
  if (!amount) throw new Error(`no order ${id}`);
  // A random part keeps the reference text from being guessed (see step 2).
  const memo = `${id}-${Math.random().toString(36).slice(2, 8)} · ${amount} USD`;
  const evm = await reserveAddress("evm", memo);  // can throw: the button reports TOKEN_MISSING, the payer tries again
  const token = paymentToken({
    merchant: "Northwind", memo, amount, wallet: WALLET, expiresAt: null, openedAt: Date.now(),
    addresses: { evm: { address: evm.address, lockId: evm.addressId, monitoring: evm.monitoring } },
  });
  orders.set(id, { id, token, memo, amount, wallet: WALLET, tolerance: "default", lockIds: [String(evm.addressId)], reported: [], micros: 0n, status: "open" });
  console.log(`${id}: link https://www.unigox.com/pay/${token.slice(0, 12)}…`);
  return token;
}

// 2. A transfer was reported, or the job runs: ask Unigox, add each proven credit once, mark the order paid once.
async function check(order) {
  for (const credit of await verifyTransfers(order, order.reported)) {
    if (counted.has(credit.id)) continue;
    counted.add(credit.id);
    order.micros += credit.micros;
    console.log(`${order.id}: credited ${Number(credit.micros) / 1e6} USD`);
  }
  if (order.status === "open" && isPaid(order, order.micros)) {
    order.status = "paid";
    console.log(`${order.id}: paid`);           // ship the order here, once
  }
}

const json = (res, code, body) => res.writeHead(code, { "Content-Type": "application/json" }).end(JSON.stringify(body));

createServer(async (req, res) => {
  try {
    let body = "";
    for await (const chunk of req) body += chunk;
    const [, id, action] = /^\/orders\/([\w-]+)\/(crypto-token|payments|status)$/.exec(req.url) ?? [];
    if (action === "crypto-token" && req.method === "POST") return json(res, 200, { token: await linkFor(id) });
    const order = orders.get(id);
    if (!order) return json(res, 404, { error: "no such order" });
    if (action === "payments" && req.method === "POST") {
      // What the page reported is only a hint: check() reads every transfer again from Unigox.
      for (const p of JSON.parse(body || "{}").payments ?? []) {
        const known = order.reported.some((r) => r.chainId === p.chainId && r.txHash === p.txHash && r.logIndex === p.logIndex);
        if (!known && order.reported.length < 200) order.reported.push({ chainId: p.chainId, txHash: p.txHash, logIndex: p.logIndex ?? null, quoteId: p.quoteId ?? null });
      }
      await check(order);
    }
    return json(res, 200, { status: order.status });
  } catch (error) {
    console.error(error);                          // Unigox could not be read: the job tries again
    return json(res, 503, { error: "try again" });
  }
}).listen(3000, () => console.log("shop on http://localhost:3000"));

// 3. The job: every open order, every minute, also when the payer closed the page.
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
NW-20418: link https://www.unigox.com/pay/eyJ2IjoxLCJt…   ← the payer pressed Pay with crypto
NW-20418: credited 250 USD                                 ← the transfer was credited to your Unigox wallet
NW-20418: paid                                             ← once, even if the page reports the payment again
```

Between the first and second line the checkout shows the address and the amount, then **Payment detected** while the transfer confirms. A payment that comes short shows `credited` without `paid` until the rest arrives. Run it on staging first ([Test before you go live](https://developers.unigox.com/tutorials/crypto-checkout-testing#test-before-you-go-live)).

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
  if (terms) {
    const centsOf = (s) => { const [whole, fraction = ""] = s.split("."); return BigInt(whole + fraction.padEnd(2, "0")); };
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
4. **Share the page, or show it on your site.** Send `https://www.unigox.com/pay/{token}`, or show it with `checkout.js` as you would an invoice ([2. Show the checkout](https://developers.unigox.com/tutorials/crypto-checkout-embed#2-show-the-checkout)). On a deposit page the checkout calls `onDeposit` (event `UNIGOX_CHECKOUT_DEPOSIT_CREDITED`, `mode: "topup"`) for each credited deposit it shows, again each time the page opens: post `payload.chainId` and `payload.txHash` to your server and count each `payload.quoteId` once.
5. **Credit each deposit in your system**, as shown below.
6. **Archive or restore.**
   - **Archive:** stop each of the customer's addresses with `POST /memo-locks/unlock` (signed `Unlock`), which tells Unigox the address no longer carries this customer's reference. Transfers still arrive and are credited to your wallet, without the customer's memo, and the customer's page opens as closed.
   - **Restore:** give the same addresses this customer's reference again with `POST /memo-locks/lock` (signed `Lock`, the same memo, `expiresAt: "0"`). First check with a signed `POST /memo-locks/list` (`{"chainType", "address", "limit": "1"}`) that nobody else's reference is on them. Restoring gives the addresses new address IDs, and the page link contains the address IDs, so the link the customer already has stays closed: build a new link with `topUpToken()` and send it to the customer.

- **What it does:** gets a new address of each address type for one customer, sets them aside for that customer for good, and builds the link of the customer's deposit page.
- **What you keep:** the customer's reference text and every address ID, old and new, with the customer.
- **What can go wrong:** the same as step 2 of Option B. A network that is not ready yet is left out of the page until you build the link again.

A complete example, from a new customer to the link of their deposit page, with `reserveAddress()` of [Option B](#option-b-from-your-server) and `topUpToken()` of [The token builders](#the-token-builders) in the same file:

```js
// Node 20+. Your server holds your wallet's key (reserveAddress signs with it). db is your own database.
import { randomInt } from "node:crypto";

const TAG_LETTERS = "abcdefghijklmnopqrstuvwxyz234567";
const newTag = () => Array.from({ length: 10 }, () => TAG_LETTERS[randomInt(TAG_LETTERS.length)]).join("");

// customerId: your own ID for the customer (shown on their page, so no personal data), up to 64 characters.
export async function createDepositPage(customerId) {
  const memo = `Top-up · ${customerId} · ${newTag()}`;        // keep this memo for the customer's lifetime
  const openedAt = Date.now();
  const addresses = {};
  for (const type of ["evm", "tvm", "ton", "svm"]) {            // every address type you accept
    const made = await reserveAddress(type, memo);              // a new address, reserved for this customer
    addresses[type] = { address: made.address, lockId: made.addressId, monitoring: made.monitoring };
  }
  // Keep the memo and every address ID with the customer: crediting deposits needs all of them.
  await db.saveCustomer({ id: customerId, memo, openedAt, lockIds: Object.values(addresses).map((a) => String(a.lockId)) });
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

**Without the key.** Run `verifyTransfers()` of [Confirm without the key](https://developers.unigox.com/tutorials/crypto-checkout-confirm#confirm-without-the-key) with the customer's memo and every address ID the customer ever had, and skip `isPaid`: a deposit has no amount due. The transfers to check come from `onDeposit` (or `UNIGOX_CHECKOUT_DEPOSIT_CREDITED` in your own frame) on a deposit page shown on your site, or from a transaction hash the customer gives you. The page sends the same deposit again each time it opens: `creditDeposits` counts each `quoteId` once, so a repeat adds nothing.

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

**With the key.** From a periodic job, read your signed history for each of the customer's addresses (`POST /transactions/history` with `chainType` and `depositAddress`, see [History for everything else](https://developers.unigox.com/tutorials/crypto-checkout-confirm#history-for-everything-else)), and count each credited transfer (`settled`, on `UNIGOX_BALANCE_CHAIN_ID`, to your wallet) once by its `quoteId`, the same id `creditDeposits` uses, so the two ways share one ledger. Never mix ledgers keyed by `quoteId` and by `intentId`: the same deposit would be added twice. With `includeMemo: true` the history returns your memos, so you can tell which customer each transfer belongs to.

**After you archive a customer**, transfers to their addresses arrive without their memo, as other credits: `verifyTransfers()` does not count them for the customer, because their memo fingerprint differs. Look them up in history by address and decide yourself.

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
