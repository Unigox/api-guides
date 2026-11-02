// Run with: node --test scripts/*.test.mjs
//
// The crypto payments guide and its reference against what the Bridge (relay-quote) answers. Release audit r11 found
// the guide asking for a callback URL that production refuses, error keys the Bridge returns missing from the tables,
// and the status and list-cursor rules unstated. These checks keep those facts written down.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const guide = read("crypto-payments.md");
const reference = read("api-reference/payment-addresses.md");

test("the guide signs a callback URL only when GET /config has callbacks on", () => {
  assert.doesNotMatch(guide, /contains the invoice reference and HTTPS callback URL\./);
  for (const part of ["memoLimits.maxCallbackUrlBytes", "webhookKeys", '`""`', "validation_callback_url_invalid"]) assert.ok(guide.includes(part), part);
});

test("SEC-DOCS-30: the reference's allocation example and reassignment sign a callback URL only when GET /config has callbacks on", () => {
  assert.doesNotMatch(reference, /requests require a reachable public HTTPS receiver/);
  assert.doesNotMatch(reference, /lock request containing the new invoice reference and callback URL\./);
  assert.match(reference, /const \{memoLimits, webhookKeys\} = await configResponse\.json\(\);/);
  assert.match(reference, /const callbacksAvailable = memoLimits\.maxCallbackUrlBytes > 0 && webhookKeys\?\.length > 0;/);
  assert.match(reference, /callbackUrl: callbacksAvailable \? "https:\/\/merchant\.example\/webhooks\/unigox" : "",/);
  assert.doesNotMatch(reference, /^\s+callbackUrl: "https:\/\/merchant\.example\/webhooks\/unigox",$/m, "a signed message with an unconditional callback URL");
  assert.match(reference, /a `callbackUrl`: your receiver when callbacks are available, otherwise `""`\./);
});

test("the guide states the reuse rule, the failed relock gap and the precision rule", () => {
  // The portal's rule (owner decision O-08), the same in the checkout guide and the help: 7 days, not 24 hours.
  assert.match(guide, /paid in full and credited, and 7 days have passed since/);
  assert.doesNotMatch(guide, /24 hours/);
  assert.match(guide, /If reserving the address again after ending its reservation fails/);
  assert.match(guide, /`BigInt`/);
  assert.match(guide, /`memoHash` is public/);
});

test("the reference lists the error keys the Bridge returns on these routes", () => {
  for (const key of [
    "validation_callback_url_invalid", "validation_memo_too_long", "validation_memo_not_string", "validation_text_not_well_formed",
    "validation_invalid_quote_id", "validation_invalid_log_index", "from_tx_not_found", "not_fetched", "internal_error",
  ]) assert.ok(reference.includes(`| \`${key}\``) || reference.includes(`/ \`${key}\``) || reference.includes(`| \`${key}\` |`), key);
  assert.match(reference, /\| 413 \|/);
});

test("the reference gives every status and subStatus of a transaction and the list cursor rule", () => {
  for (const status of ["CREATED", "PENDING", "PROCESSING", "DONE", "FAILED", "DEFERRED", "COMPLIANCE_HOLD", "COMPLIANCE_FROZEN"]) assert.ok(reference.includes(`\`${status}\``), status);
  for (const sub of ["COMPLETED", "PARTIAL", "REFUNDED", "WAIT_SOURCE_CONFIRMATIONS", "NOT_PROCESSABLE_REFUND_NEEDED"]) assert.ok(reference.includes(`\`${sub}\``), sub);
  assert.match(reference, /A final page that is exactly full still returns a cursor/);
  assert.match(reference, /an omitted `status` includes reservations in every status/);
  // Docs review L53: the list rule speaks of address IDs and address types, not of lock IDs, memo locks or families.
  assert.match(reference, /`before` \(an address ID, the `lockId` field\)/);
  assert.match(reference, /An omitted `chainType` includes all address types/);
  assert.doesNotMatch(reference.replace(/"Unigox Bridge Memo Locks"/g, ""), /lock ID|memo lock|\bfamil(y|ies)\b|`ACTIVE` lock\b|active lock\b|closed locks?\b/i);
  // The reference speaks of the Unigox payments API and payment addresses, never of internal service names.
  assert.match(reference, /The Unigox payments API gives you payment addresses/);
  assert.doesNotMatch(reference.replace(/"Unigox Bridge (Memo Locks|History)"|name: "Unigox Bridge (Memo Locks|History)"|`BRIDGE_\w+`/g, ""), /\bBridge\b|\bXAI\b|collection address|memo association/i);
});
