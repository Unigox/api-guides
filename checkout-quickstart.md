# Crypto processing: get started

> **Not available yet.** This page describes crypto processing ahead of its release. Until this notice is gone, `https://www.unigox.com/checkout.js`, the help pages and the link check it names can answer 404. Once released, crypto processing is in early access, turned on per business.

> **Crypto processing guide:** **Get started** · [Website checkout](https://developers.unigox.com/tutorials/crypto-checkout-embed) · [Confirm payments](https://developers.unigox.com/tutorials/crypto-checkout-confirm) · [Deposit pages and signed links](https://developers.unigox.com/tutorials/crypto-checkout-links) · [Test and go live](https://developers.unigox.com/tutorials/crypto-checkout-testing) · [Reference](https://developers.unigox.com/tutorials/crypto-checkout-reference)

Crypto processing lets your customers pay you in USDT, USDC, USDG and USDT0 on 13 networks. Unigox shows the payer the amount, the address and the progress of the transfer, so you do not build a payment page. Each payment arrives in your Unigox wallet (your balance at Unigox) in the coin the customer sent: Unigox does not convert it.

This page shows how to open crypto processing for your business, the shortest way to take payments on your website, and how to create a payment link, an invoice and a customer's deposit addresses in the portal, which needs no code. The other pages give the developer of your website every detail. The guide uses each of its terms in one meaning: [Words this guide uses](https://developers.unigox.com/tutorials/crypto-checkout-reference#words-this-guide-uses).

## Pick your task

| What you want to do | Code | Where |
| --- | --- | --- |
| Send a customer a link to pay an order | None | [Your first payment link](#your-first-payment-link) |
| Send an invoice with a PDF | None | [Send an invoice](#send-an-invoice) |
| Give a customer permanent addresses to top up a balance | None | [Give a customer deposit addresses](#give-a-customer-deposit-addresses) |
| Take payments on your website: a **Pay with crypto** button, the checkout inside your page, or a payment page | A few lines on your page and one request on your server, with your API key | [Your website in four steps](#your-website-in-four-steps), then [Website checkout](https://developers.unigox.com/tutorials/crypto-checkout-embed) |
| Mark orders paid on your server | One request with your API key | [Confirm payments](https://developers.unigox.com/tutorials/crypto-checkout-confirm) |
| Create deposit pages, or payment links that stay open longer than 7 days, from your server | Server code and your wallet's key | [Deposit pages and signed links](https://developers.unigox.com/tutorials/crypto-checkout-links) |
| Build your own payment page | Server and page code, and your wallet's key | [Your own payment page](https://developers.unigox.com/tutorials/crypto-payments) |
| Check your integration before real customers pay | None | [Test and go live](https://developers.unigox.com/tutorials/crypto-checkout-testing) |

## How a payment works

1. A payment starts as an order or as a payment link. On your website, your server creates a new order for each payment, with your API key. A payment link is one you create in the portal and send to one customer. Both open at `https://www.unigox.com/pay/{token}`.
2. The customer opens the checkout, on a Unigox page or on your site, and picks a coin and a network.
3. The customer sends the amount from any wallet or exchange. Each order and each link has its own addresses, so the customer adds no memo or tag.
4. Unigox adds the payment to your Unigox wallet, in the same coin and the same amount. The portal's **Payments** shows it as **Completed**.
5. You fulfil the order once your server reads it as paid, or once you see the payment in **Payments**.

Creating an order or a link and opening a checkout move no money. A message the checkout sends to your web page is not proof of payment: anyone can produce one in their own browser. Proof is the payment in **Payments**, or your server's check ([Confirm payments](https://developers.unigox.com/tutorials/crypto-checkout-confirm)).

## Open crypto processing

1. On `https://www.unigox.com/crypto-processing`, press **Start business onboarding**. Sign in or create an account if you have none.
2. Answer **Your business** and **Your volume**, and under **Your products** pick **Crypto processing**.
3. Answer the questions under **Before you start accepting crypto**. You upload no documents at this step. By finishing, you confirm that you take no payments from sanctioned countries and regions, as the Terms of Service require. The questions are:
   - who you accept payments for: yourself, or a company (then its name);
   - your website and your industry;
   - how you plan to accept payments;
   - whose goods or services your customers pay for;
   - where your customers are: pick countries, or **Worldwide**;
   - the largest single payment you expect.
4. Press **Finish and open my portal**. **Crypto processing** opens in your business portal, and you can create your first payment link at once.

<figure><img src="assets/crypto-processing/onboarding.gif" alt="Business onboarding: Crypto processing, then the questions of Before you start accepting crypto, filled in for a sample company"><figcaption><p>The crypto processing questions in business onboarding (sample answers).</p></figcaption></figure>

Until your business is verified, you can receive up to 1,000 USD in total. A band at the top of every **Crypto processing** page shows how much of it you have received, with the **Verify business** button. Once you reach 1,000 USD, you cannot create orders, payment links, invoices or deposit addresses until your business is verified. Payments to the ones you already created still arrive.

## What you need

To take payments from the portal you need only **Crypto processing in your business portal** ([Open crypto processing](#open-crypto-processing)). A developer who connects your website also needs:

- **Your partner API key.** Your server sends it in the `X-API-Key` header to create and read orders, at `https://api.unigox.com`. Step 1 of [Your website in four steps](#your-website-in-four-steps) shows where to get it. Keep it on your server, never in a web page or a repository.
- **The portal open now and then.** Each order takes payment addresses that the portal reserves while you are signed in with **Crypto processing** open ([Limits](https://developers.unigox.com/tutorials/crypto-checkout-reference#limits)).

Deposit pages, links your server signs and your payment history need two more things:

- **The API address**, which **Developers → Environment** shows as **API address**. It can change, so keep it in your configuration, not in your code. The examples call it `UNIGOX_PAYMENTS_API`.
- **Your wallet's private key**, to sign those requests. Unigox gives you the key on request (**Developers → Confirm payments on your server → Ask for the key**). This key can move your whole balance. Keep it in a secrets store on the server that signs, never in browser code or a repository. Keep the wallet's balance low: move the money you collect out regularly. **Developers → Environment** shows your wallet's address as **Your Unigox wallet**.

Unigox does not send payment notifications (webhooks) to your server yet. Your server reads each order itself: when the customer returns to your site, and from a job that runs every few minutes.

## The portal

Everything for crypto processing is under **Crypto processing** in your business portal:

| Tab | What it is for |
| --- | --- |
| **Overview** | Money received, recent payments and shortcuts to the three ways to get paid |
| **Payments** | Every payment, its status and its transactions; **Export CSV** |
| **Payment links** | Create links and invoices, follow them, close them; **Export CSV** |
| **Checkout** | Set up the checkout on your website and copy its code |
| **Deposit addresses** | Customers with permanent addresses and deposit pages |
| **Developers** | Code for your website and server, test pages, the API address and your wallet |

<figure><img src="assets/crypto-processing/portal-overview.png" alt="The Crypto processing Overview: the tabs, how much was received before verification with Verify business, and the totals"><figcaption><p>The Overview before your business is verified (test account).</p></figcaption></figure>

**Settings** is where you set what payers see. It has no tab: open `https://www.unigox.com/portal/crypto/settings`, or follow the **Settings** link that the link form shows when your business name is missing.

- **Shown to the payer as**: your business name on payment pages.
- **Return to your site (optional)**: an `https://` page the payer can go back to.
- **Support email for payers (optional)**: shown when a payer has to contact you.

These settings are stored in your browser, not in your account. They go into every link you create or copy in this browser from then on. A link you already sent keeps what it had, and a link made in another browser does not have them. Orders do not use them: your server sends the name and the return page with each order (`merchantName`, `returnUrl`).

## Your website in four steps

You add this once. Every payment is then a new order that your server creates.

**1. Get your API key.** Open **Crypto processing → Checkout** and pick **Payment button**. Under **3. Create the order on your server**, press **Get your API key**. On the page that opens, press **Generate** next to **API key** and copy the key: it is shown only once. Keep it on your server as `UNIGOX_API_KEY`. Leave **Crypto processing** open for a few minutes the first time: the portal reserves the addresses your orders will take.

**2. Put the checkout on your page.** The button asks your server for an order on its first press and opens the checkout over your page:

```html
<script src="https://www.unigox.com/checkout.js"></script>
<button type="button" id="pay-with-crypto">Pay with crypto</button>
<script>
  // Your server's route of step 3: it creates the order and answers { token, payUrl }.
  const newOrder = () => fetch("/your-server/crypto-order", { method: "POST" })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))));
  let checkout;
  document.getElementById("pay-with-crypto").addEventListener("click", () => {
    // checkout.js did not load (an ad blocker, the network, your CSP): the order's payment page takes the payment.
    if (!window.UnigoxCheckout) return newOrder().then((o) => location.assign(o.payUrl));
    checkout ??= UnigoxCheckout.create({
      token: () => newOrder().then((o) => o.token), // called on the first open: your server creates the order
      mode: "modal",
      onComplete(payload) { /* update your page; only your server confirms the payment */ },
    });
    checkout.open();
  });
</script>
```

**3. Create the order on your server.** One request with your order number and total:

```bash
curl -X POST https://api.unigox.com/api/v1/partner/crypto/orders \
  -H "X-API-Key: $UNIGOX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"merchantName": "Northwind", "reference": "A-1001", "amount": "25.00"}'
```

The answer is `{"status": "order_created", "code": 201, "data": {"id": "ord_…", "token": "o_…", "payUrl": "https://www.unigox.com/pay/o_…", …}}`. The same request as the route your page calls, in Node.js:

```js
// Node 18+ with express (npm install express). UNIGOX_API_KEY stays on your server, never in the page.
import express from "express";

const app = express();

app.post("/your-server/crypto-order", async (req, res) => {
  const cart = await yourCart(req); // your own order, e.g. { id: "A-1001", total: "25.00" }
  const response = await fetch("https://api.unigox.com/api/v1/partner/crypto/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": process.env.UNIGOX_API_KEY },
    body: JSON.stringify({ merchantName: "Northwind", reference: cart.id, amount: cart.total }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) return res.status(502).end();
  await saveUnigoxOrderId(cart.id, body.data.id); // step 4 reads the order by this id
  res.json({ token: body.data.token, payUrl: body.data.payUrl });
});

app.listen(3000);
```

`yourCart()` and `saveUnigoxOrderId()` stand for your own code. The same `reference` sent again returns the same order, so a second press never makes a second order.

**4. Read the order to confirm.** Ship when the order reads `paid` or `overpaid`. Read it when the payer returns to your site, and from a job every few minutes:

```js
const unigoxOrderId = await yourUnigoxOrderId(cartId); // the id you saved in step 3, never one from the browser
const response = await fetch(`https://api.unigox.com/api/v1/partner/crypto/orders/${encodeURIComponent(unigoxOrderId)}`, {
  headers: { "X-API-Key": process.env.UNIGOX_API_KEY },
});
if (!response.ok) throw new Error(`Unigox: HTTP ${response.status}`); // try again on the next pass
const { data: order } = await response.json();
if (order.status === "paid" || order.status === "overpaid") { /* mark your order paid, once, and ship */ }
```

[Website checkout](https://developers.unigox.com/tutorials/crypto-checkout-embed) has the other ways to show the checkout, and [Confirm payments](https://developers.unigox.com/tutorials/crypto-checkout-confirm) every status and the job.

## Your first payment link

1. Open **Crypto processing → Payment links**. On the **Payment link** tile, press **Create payment link**.
2. Enter **Amount (USD)**, at least 1.00. Add an **Order ID** to find the payment later, or leave it empty and the portal makes one.
3. Under **Accepted payments**, leave every coin and network ticked, or untick the ones you do not take.
4. Press **Create link**.
5. Press **Copy link** and send it to your customer, or **Open checkout** to see what they see.

<figure><img src="assets/crypto-processing/create-payment-link.gif" alt="Creating a payment link in the portal: amount, order ID, accepted payments, Create link"><figcaption><p>Creating a payment link (sample data).</p></figcaption></figure>

Creating the link takes up to a minute, while its networks get ready. If a network is still getting ready after that, the link says which one, and payers can already use the others.

When the customer pays, the link shows **Payment detected**, then **Paid**, and the payment appears in **Payments**. A payment that is short by at most 0.5 % of the amount, and by no more than 1.00 USD, still counts as paid. This covers an exchange that takes its withdrawal fee out of the amount it sends. An invoice must be paid in full.

## Send an invoice

An invoice is a payment link with an invoice document. Your customer gets the link and a PDF, and pays the total in full.

1. Open **Crypto processing → Payment links** and press **Create invoice**.
2. Under **Customer**, choose a customer or add one.
3. Under **Items**, enter what you charge for: **Description**, **Qty** and **Unit price (USD)**. **Add item** and **Add tax** add lines.
4. Check **Number and dates** and **Your business**, and add **Terms and notes** if you need them. **Invoice preview** shows the document as your customer gets it.
5. Press **Review invoice**, check the coins and networks under **Accepted payments**, then press **Create invoice & payment link**.
6. Under **Invoice created**, press **Copy link** to send the link, or **Download invoice PDF** to attach the invoice to an email.

<figure><img src="assets/crypto-processing/create-invoice.gif" alt="Creating an invoice in the portal: customer, items, review, Create invoice and payment link, Download invoice PDF"><figcaption><p>Creating an invoice (test account, nothing is created).</p></figcaption></figure>

## Give a customer deposit addresses

Use this for a customer who keeps a balance with you. The customer gets permanent addresses of their own and can send any amount at any time. Each deposit appears in **Payments** under that customer.

1. Open **Crypto processing → Deposit addresses** and press **Add a customer**.
2. Enter the **Customer or company name**: the customer sees it on their deposit page. **Tax ID**, **Email** and **Billing address** are optional.
3. Under **Networks**, keep every network or choose the ones you accept, then press **Create addresses**.
4. Under **Deposit addresses ready**, press **Copy link** and send the customer the link to their deposit page. You can also show the addresses in your own product.

<figure><img src="assets/crypto-processing/add-customer.gif" alt="Adding a customer in the portal: customer name, networks, Create addresses, Copy link of the deposit page"><figcaption><p>Adding a customer with deposit addresses (test account, nothing is created).</p></figcaption></figure>

The customer opens the deposit page, picks a coin and a network and copies their address. Their deposits are listed on the same page.

<figure><img src="assets/crypto-processing/deposit-page.gif" alt="The customer's deposit page: choose a coin and a network, copy the address, see earlier deposits"><figcaption><p>The deposit page as your customer sees it (sample page).</p></figcaption></figure>

Unigox does not keep your customers' balances. Add each deposit to the customer's balance in your own system, once: by hand from **Payments**, or from your server ([Deposit pages and signed links](https://developers.unigox.com/tutorials/crypto-checkout-links#create-a-deposit-page-for-a-customer)).

Next: put the checkout on your website ([Website checkout](https://developers.unigox.com/tutorials/crypto-checkout-embed)), or mark orders paid on your server ([Confirm payments](https://developers.unigox.com/tutorials/crypto-checkout-confirm)).
