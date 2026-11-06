# Partner Integration Instructions

Unigox makes it easy to offer buy & sell crypto in your app or website with just a few lines of code. We support 3 integration methods.

### Contact our team

For fast support or any questions, you can

* contact our team on the homepage
* email our support <support+integration@unigox.com>
* set up a meeting with our team through [Calendly](https://calendly.com/skyzer-unigox/30min)

### Deep Link Integration

Best for: Fastest launch, minimal development, no compliance headaches.

You create a link to the Unigox widget with prefilled parameters. When the user clicks the button (e.g., "Buy with Bank" or "Sell for Cash"), they are taken to a hosted Unigox page with the trade details already set.

```url
https://www.unigox.com/buy?amount=100&asset=USDC&currency=NGN&paymentMethod=Opay
```

Prefill Parameters

| Parameter     | Required |                                                        |
| ------------- | -------- | ------------------------------------------------------ |
| crypto        | yes      | Asset code (e.g., USDC, USDT)                          |
| fiat          | yes      | Fiat currency code (e.g., NGN, MXN, BRL)               |
| amount        | no       |                                                        |
| side          | yes      | buy or sell                                            |
| paymentMethod |          | Specific method/network if desired (e.g., M-PESA, PIX) |
| partnerId     | no       | Your assigned partner ID for tracking revenue share    |
| redirectUrl   | no       | URL to redirect after trade completion                 |

✅ Fastest way to go live – no development required

### Iframe Widget

Embed the Unigox exchange widget with the hosted loader. The example below
lets a customer buy USDC from a licensed provider and send it to their
Solana address. Replace the address placeholder with the customer's validated
Solana address before initializing the widget.

```html
<div id="unigox-widget"></div>
<script src="https://www.unigox.com/widget.js"></script>
<script>
  UnigoxWidget.init({
    container: "#unigox-widget",
    type: "buy-with-sendout",
    crypto: "USDC",
    lockCrypto: true,
    providerScope: "licensed_only",
    sendoutNetwork: "solana",
    sendoutAddress: "CUSTOMER_SOLANA_ADDRESS"
  });
</script>
```

Use the `www.unigox.com` loader URL to avoid the redirect from the apex
domain. If your site sets a Content Security Policy, merge both origins into
your existing directives.

```text
script-src https://unigox.com https://www.unigox.com;
frame-src https://unigox.com https://www.unigox.com;
```

Keep the iframe sandbox permissions set by the loader. If your page runs
inside another sandboxed iframe, that frame must also allow navigation
triggered by a user gesture for mobile wallet launches.

See the [widget integration guide](https://www.unigox.com/widget-integration.md)
for the complete configuration and host requirements.

White-labeling is available on request (remove Unigox branding).

### Key Differences: Deep Link vs. Iframe

|                               | Deep Link                | Iframe               |
| ----------------------------- | ------------------------ | -------------------- |
| Integration speed             | Fastest (minutes)        | Quick (minutes)      |
| User stays in your site       | ❌                        | ✅                    |
| Branding control              | Standard Unigox branding | Optional white-label |
| Mobile app friendly           | ✅                        | ✅                    |
| Custom payment method prefill | ✅                        | ✅                    |

### Server-to-Server API

Best for: full backend control over the trade lifecycle — your UI, our liquidity.

The Unigox Partner API gives you programmatic access to:

* **Quotes & liquidity** — real-time rates across all corridors
* **On-ramp orders** — collect local fiat, deliver crypto
* **Off-ramp orders** — accept crypto, pay out to local bank accounts and mobile wallets
* **User management & KYC** — onboard your customers under Unigox compliance
* **Webhooks** — order status updates pushed to your backend

Full API reference, authentication, and sandbox details: [developers.unigox.com](https://developers.unigox.com). SDKs are available for JavaScript, Python, and C#.

To get API credentials, [contact our team](mailto:support+integration@unigox.com).
