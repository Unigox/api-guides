# Crypto processing: get started

> **Not available yet.** This page describes crypto processing ahead of its release. Until this notice is gone, `https://www.unigox.com/checkout.js`, the help pages and the link check it names can answer 404. Once released, crypto processing is in early access, turned on per business.

> **Crypto processing guide:** **Get started** · [Website checkout](https://developers.unigox.com/tutorials/crypto-checkout-embed) · [Confirm payments](https://developers.unigox.com/tutorials/crypto-checkout-confirm) · [Links from your server](https://developers.unigox.com/tutorials/crypto-checkout-links) · [Test and go live](https://developers.unigox.com/tutorials/crypto-checkout-testing) · [Reference](https://developers.unigox.com/tutorials/crypto-checkout-reference)

Crypto processing lets your customers pay you in USDT, USDC, USDG and USDT0 on 13 networks. Each payment is added to your Unigox wallet. Unigox shows the payer the amount, the address and the progress of the transfer, so you do not build a payment page.

This guide is for the person who connects crypto processing to a website or a back office. Each page starts from a task and ends when the task works.

## Pick your task

| What you want to do | Code | Where |
| --- | --- | --- |
| Send a customer a link to pay an order | None | [Your first payment link](#your-first-payment-link) |
| Send an invoice with a PDF | None | Portal: **Payment links → Create invoice** |
| Give a customer permanent addresses to top up a balance | None | Portal: **Deposit addresses → Add a customer** |
| Add a **Pay with crypto** button to your website | A few lines of HTML | [Website checkout](https://developers.unigox.com/tutorials/crypto-checkout-embed) |
| Mark orders paid on your server | Server code, no key | [Confirm payments](https://developers.unigox.com/tutorials/crypto-checkout-confirm) |
| Create a link for every order automatically | Server code and your wallet's key | [Links from your server](https://developers.unigox.com/tutorials/crypto-checkout-links) |
| Build your own payment page | Server and page code, and your wallet's key | [Your own payment page](https://developers.unigox.com/tutorials/crypto-payments) |
| Check your integration before real customers pay | None | [Test and go live](https://developers.unigox.com/tutorials/crypto-checkout-testing) |

## How a payment works

1. You create a payment link: in the portal, or from your server. A link is `https://www.unigox.com/pay/{token}`. The token holds the amount, your order reference and the addresses that take the payment.
2. The customer opens the link, on its own page or in a checkout on your site, and picks a coin and a network.
3. The customer sends the amount from any wallet or exchange. No memo or tag is needed: each order has its own address.
4. Unigox credits the payment to your Unigox wallet, one for one in the coin that was sent. The portal's **Payments** shows it as **Completed**.
5. Your server checks the payment with Unigox and fulfils the order.

Creating a link and opening a checkout move no money. The checkout's messages to your page update your interface; they never prove a payment. Only a check from your server does.

## Open crypto processing

1. On `https://www.unigox.com/crypto-processing`, press **Start business onboarding**. Sign in or create an account if you have none.
2. Answer **Your business** and **Your volume**, and under **Your products** pick **Crypto processing**.
3. Answer **Before you start accepting crypto**: who you accept payments for (yourself, or a company and its name), your website and industry, how you plan to accept payments, whose goods or services customers pay for, where your customers are, the largest single payment you expect, and whether you can link payments to your customers. No documents are needed now.
4. Press **Finish and open my portal**. **Crypto processing** opens in your business portal.

<figure><img src="assets/crypto-processing/onboarding.gif" alt="Business onboarding: Crypto processing, then the questions of Before you start accepting crypto, filled in for a sample company"><figcaption><p>The crypto processing questions in business onboarding (sample answers).</p></figcaption></figure>

Until your business is verified you can receive up to 1,000 USD in all. The **Overview** shows how much of it you have received, with **Verify business**. At 1,000 USD, new payment links, invoices and deposit addresses wait until your business is verified; payments to the ones you already made still arrive.

## What you need

- **Crypto processing in your business portal** ([Open crypto processing](#open-crypto-processing)).
- **Your Unigox wallet address.** It receives every payment. **Developers → Environment** shows it as **Your Unigox wallet**.
- **The API address**, for server code. **Developers → Environment** shows it as **API address**. Keep it in your configuration, not in your code: it can change. The examples call it `UNIGOX_PAYMENTS_API`.
- **Your wallet's private key**, only to create links or read your payment history from your server. There is no separate API key: those requests are signed with the wallet's key. Unigox exports it on request (**Developers → Confirm payments on your server → Ask for the key**). The key can move your whole balance. Keep it in a secrets store on the server that signs, never in browser code or a repository, keep the wallet's balance low and move collected money out regularly.

Unigox does not send payment notifications to your server yet. Your server checks each payment's status itself, from your return page and from a periodic job.

## The portal

Everything for crypto processing is under **Crypto processing** in your business portal:

| Tab | What it is for |
| --- | --- |
| **Overview** | Money received, the limit before verification, recent payments and shortcuts |
| **Payments** | Every payment, its status and its transactions; **Export CSV** |
| **Payment links** | Create links and invoices, follow them, close them; **Export CSV** |
| **Checkout** | Set up the checkout on your website and copy its code |
| **Deposit addresses** | Customers with permanent addresses and deposit pages |
| **Developers** | Code for your website and server, test pages, the API address and your wallet |

<figure><img src="assets/crypto-processing/portal-overview.png" alt="The Crypto processing Overview: the tabs, how much was received before verification with Verify business, and the totals"><figcaption><p>The Overview before your business is verified (test account).</p></figcaption></figure>

**Settings** holds what payers see. It has no tab: open `https://www.unigox.com/portal/crypto/settings`, or the **Settings** link that a link form shows when your business name is missing.

- **Shown to the payer as**: your business name on payment pages.
- **Return to your site (optional)**: an `https://` page the payer can go back to.
- **Support email for payers (optional)**: shown when a payer has to contact you.

They are saved in this browser only, and go into every link you copy from it afterwards. Links already sent keep what they carried.

## Your first payment link

1. Open **Crypto processing → Payment links**. On the **Payment link** tile, press **Create payment link**.
2. Enter **Amount (USD)**, at least 1.00. Add an **Order ID** to find the payment later, or leave it empty and the portal makes one.
3. Under **Accepted payments**, leave every coin and network ticked, or untick the ones you do not take.
4. Press **Create link**.
5. Press **Copy link** and send it to your customer, or **Open checkout** to see what they see.

<figure><img src="assets/crypto-processing/create-payment-link.gif" alt="Creating a payment link in the portal: amount, order ID, accepted payments, Create link"><figcaption><p>Creating a payment link (sample data).</p></figcaption></figure>

The link is ready when its networks are ready, usually within a minute. Until then **Copy link** waits and says which networks are still getting ready.

When the customer pays, the link shows **Payment detected**, then **Paid**, and the payment appears in **Payments**. A payment short by at most 0.5 % of the amount, and never more than 1.00 USD, counts as paid; an invoice takes the full amount only.

## Send an invoice

An invoice is a payment link with an invoice document: your customer gets the link and a PDF, and pays the total in full.

1. Open **Crypto processing → Payment links** and press **Create invoice**.
2. Under **Customer**, choose a customer or add one.
3. Under **Items**, enter what you charge for: **Description**, **Qty** and **Unit price (USD)**. **Add item** and **Add tax** add lines.
4. Check **Number and dates** and **Your business**, and add **Terms and notes** if you need them. **Invoice preview** shows the document as your customer gets it.
5. Press **Review invoice**, check the coins and networks under **Accepted payments**, then press **Create invoice & payment link**.
6. Under **Invoice created**, press **Copy link** to send the link, or **Download invoice PDF** to attach the invoice to an email.

<figure><img src="assets/crypto-processing/create-invoice.gif" alt="Creating an invoice in the portal: customer, items, review, Create invoice and payment link, Download invoice PDF"><figcaption><p>Creating an invoice (test account, nothing is created).</p></figcaption></figure>

## Give a customer deposit addresses

For customers who keep a balance with you: each gets permanent addresses of their own and can top up any amount, any time. Each deposit appears in **Payments** under that customer.

1. Open **Crypto processing → Deposit addresses** and press **Add a customer**.
2. Enter the **Customer or company name**: the customer sees it on their deposit page. **Tax ID**, **Email** and **Billing address** are optional.
3. Under **Networks**, keep every network or choose the ones you accept, then press **Create addresses**.
4. Under **Deposit addresses ready**, press **Copy link** and send the customer their deposit page, or show the addresses in your own product.

<figure><img src="assets/crypto-processing/add-customer.gif" alt="Adding a customer in the portal: customer name, networks, Create addresses, Copy link of the deposit page"><figcaption><p>Adding a customer with deposit addresses (test account, nothing is created).</p></figcaption></figure>

The customer opens the deposit page, picks a coin and a network and copies their address. Their deposits are listed on the same page.

<figure><img src="assets/crypto-processing/deposit-page.gif" alt="The customer's deposit page: choose a coin and a network, copy the address, see earlier deposits"><figcaption><p>The deposit page as your customer sees it (sample page).</p></figcaption></figure>

Add each deposit to the customer's balance in your own system once: by hand from **Payments**, or from your server ([Links from your server](https://developers.unigox.com/tutorials/crypto-checkout-links#create-a-deposit-page-for-a-customer)).

Next: put the checkout on your website ([Website checkout](https://developers.unigox.com/tutorials/crypto-checkout-embed)), or mark orders paid on your server ([Confirm payments](https://developers.unigox.com/tutorials/crypto-checkout-confirm)).
