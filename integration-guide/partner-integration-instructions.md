# Widget and API integration

Embed Unigox's buy and sell screens in your website, or use the Partner API for a server-to-server integration. Customers complete the widget's sign-in, verification and exchange flow with Unigox.

## Embed the widget

Use the hosted loader to create the iframe and its browser permissions:

```html
<div id="unigox-widget"></div>
<script src="https://www.unigox.com/widget.js"></script>
<script>
  UnigoxWidget.init({
    container: "#unigox-widget",
    type: "buy",
    crypto: "USDC",
    theme: "light"
  });
</script>
```

A public widget key attributes exchanges to its configured publisher. Add it as `widgetKey` when you have one. A widget key is safe to include in your page; never include a secret Partner API key in browser code.

Existing company widget keys remain managed in the partner dashboard. For the upcoming personal option, see [Personal widget settings](#personal-widget-settings).

## Personal widget settings

> **Not available yet.** Personal widget fees are awaiting release. The instructions below describe the upcoming flow; existing company widgets and Partner API integrations continue using their current settings.

A personal widget belongs to your Unigox user account. You do not need a partner account or company onboarding to configure it and receive its exchange fees.

1. Sign in to Unigox and open **Widget settings** at `/widget-settings`.
2. Under **Fee settings**, set **Your fee** between **0% and 10%**. Zero means no personal widget fee.
3. Enter a **Receiving address (optional)**, or leave it empty to use your supported Unigox wallet. Check the displayed receiving address before saving.
4. Turn on **Accept new exchanges** and save the settings.
5. Under **Install on your website**, copy the generated embed code into your website.

Fees are paid on **XAI**, in the **token used for the exchange**. A USDC exchange pays the fee in USDC on XAI; it does not pay the fee in native XAI or automatically convert it into another asset. Use a nonzero EVM address you control, and confirm that its wallet supports the exchange token on XAI. A wallet connected only for sign-in is not automatically the default receiving wallet.

### Use your personal key

A personal public key starts with `uw1_`. Copy the complete key from Widget settings into `widgetKey`:

```html
<div id="unigox-widget"></div>
<script src="https://www.unigox.com/widget.js"></script>
<script>
  UnigoxWidget.init({
    container: "#unigox-widget",
    widgetKey: "YOUR_PERSONAL_WIDGET_KEY",
    type: "buy",
    crypto: "USDC"
  });
</script>
```

Replace the placeholder with your saved key, including its `uw1_` prefix. The key identifies your widget's fee settings. It gives no access to your account, wallet, Partner API credentials or partner order records.

Do not add a fee or receiving address to the embed code. Unigox resolves them from the key. Options such as `fee_pct`, `partner_fee_pct`, `markup` or a fee-wallet address cannot override those settings. The optional `partner` label and signup referral `ref` do not set an exchange fee.

### Quotes and completed exchanges

Customers review the final exchange amounts in the widget. The amount they choose to fix determines how the fee is included:

| Customer's fixed amount | How the personal fee is included |
| --- | --- |
| BUY: fiat to pay | The fiat amount stays fixed. The existing gross crypto amount is split between the customer's net crypto and the publisher fee. |
| BUY: crypto to receive | The requested net crypto stays fixed. The quote increases the gross amount needed to cover the publisher fee. |
| SELL: fiat to receive | The fiat payout stays fixed. The crypto funding amount includes the publisher fee in addition to the exchange's base funding. |
| SELL: crypto to deposit | The deposit stays fixed. The quote fits the fees inside it and recalculates the fiat payout. |

For a fiat-anchored BUY with a gross amount of 100 USDC and a 1% personal fee, the split is 99 USDC for the customer and 1 USDC for the publisher. This example excludes other exchange fees and any separately quoted sendout costs. Always use the widget's quoted amounts; do not calculate another fee in host code.

The receiving address and fee are fixed when an exchange is accepted. Later settings changes apply to new exchanges. If settings change after a quote but before acceptance, the widget refreshes the quote and asks the customer to review it again.

The fee is collected during successful escrow settlement. A quote or browser callback alone is not proof that a fee was paid. Cancelled or refunded exchanges do not earn a personal widget fee. This release does not add a personal earnings dashboard.

### Change, disable or replace a key

| Action in Widget settings | Effect on new exchanges | Effect on accepted exchanges |
| --- | --- | --- |
| Change the fee or receiving address | The updated settings apply; an older quote needs review. | The original fee and receiving address remain. |
| Turn off **Accept new exchanges** | New exchanges through that key are disabled. | Existing exchanges retain their original settings. |
| **Replace public key** | The previous key stops accepting new exchanges. Update every embed with the new key. | Existing exchanges retain their original settings. |

Save any settings edits before replacing the key. If another session changed the settings, reload the latest version before saving again.

### Personal widgets and company integrations

Personal settings do not change a company's existing widget key, company widget fee, API key, API fee wallet or crypto custody. Existing company widgets are not automatically converted to personal widgets. If you manage both, use the intended public key in each embed.

For Partner API orders, the fee remains explicit: send `partner_fee_pct` in the API estimate or quote request when you want to charge it. Omitting that field means no partner markup. Setting a personal widget fee does not add a fee to API orders.

Personal widgets do not support Partner API third-party fiat recipient payouts (`recipient_payout`). Use the supported customer exchange flow; a personal widget key does not authorize partner operations.

## Host integration requirements

Use `https://www.unigox.com/widget.js` to avoid the redirect from the apex domain. If your site sends a Content Security Policy, merge these origins into its existing directives:

```text
script-src https://unigox.com https://www.unigox.com;
frame-src https://unigox.com https://www.unigox.com;
```

Keep the iframe sandbox permissions supplied by the loader. A surrounding sandboxed frame must also permit navigation triggered by a user gesture for mobile wallet launches. Consult the [hosted loader guide](https://www.unigox.com/widget-integration.md) for configuration options and storage and permissions requirements.

### Trade events and optional sendout

`onTradeStarted` and `onTradeCompleted` expose `tradeId` for correlating widget events. An `orderId`, when present for a company widget, refers to its Partner API order. Do not assume that a personal widget produces a Partner API order or webhook. Existing company widget orders remain notify-only; a public widget key does not grant authority to move customer funds through partner action endpoints.

Treat host callbacks as UI events, not payment authorization or proof of delivery. For sendout, use the server-reported net crypto amount. **Do not subtract the personal widget fee again.** Sendout has its own network support, minimums, fees and destination validation; completing an exchange does not by itself prove destination delivery.

## Server-to-server Partner API

Use the Partner API when your backend needs control over the supported order lifecycle. Its integration and company settings remain separate from personal widgets:

- **Quotes and liquidity** — rates and supported corridors.
- **On-ramp orders** — collect local fiat and deliver crypto.
- **Off-ramp orders** — accept crypto and pay to supported bank accounts and mobile wallets.
- **User management and KYC** — onboard your customers under Unigox verification requirements.
- **Webhooks** — order status updates delivered to your backend.

See [Getting started](../getting-started.md) for authentication and [API Reference](../api-reference/README.md) for supported operations. See [Third-party payouts](../api-reference/third-party-payouts.md) for the separate Partner API recipient flow.

For integration support, contact <support+integration@unigox.com>.
