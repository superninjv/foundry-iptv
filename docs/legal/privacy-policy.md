# Foundry IPTV -- Privacy Policy

**Last Updated:** April 12, 2026

**Effective Date:** April 12, 2026

> **NOTICE:** This document is a template for legal review. It does not constitute legal advice. Have qualified legal counsel review and adapt this document before use.

---

## 1. Introduction

This Privacy Policy describes how Synoros ("Company," "we," "us," "our") handles information in connection with the Foundry IPTV hardware appliance and software (collectively, the "Product").

We are committed to protecting your privacy. The Product is designed with a privacy-first architecture: **no telemetry is collected by default**, and no personal data leaves your device unless you explicitly choose to share it.

## 2. Information We Do NOT Collect

By default, the Product does not collect, transmit, or store any of the following on Company servers:

- Personal identification information (name, email, address, phone number).
- Viewing history or habits.
- Content source URLs, M3U playlist data, or channel lists.
- Network traffic data or IP addresses (beyond what is necessary for update checks, if enabled).
- Location data.
- Device identifiers that could be used to track individual users.
- Any data from third-party content sources you configure.

**There is no ad tracking, no behavioral profiling, and no third-party analytics embedded in the Product.**

## 3. On-Device Data Storage

### 3.1 What Is Stored Locally

The Product stores all operational data locally on the device in a PostgreSQL database. This includes:

- Channel configurations and M3U playlist data you import.
- Electronic Program Guide (EPG) data.
- User preferences and settings.
- Viewing history (if you enable this feature locally).
- Deck configurations and session data.

### 3.2 Local Data Control

All on-device data is under your sole control. The Company cannot access, view, or retrieve data stored on your device. You may delete all local data at any time through the Product settings or by resetting the device.

## 4. Managed Update Service

### 4.1 Update Check Data

If the managed update service is enabled (default on hardware appliance, optional on Docker self-install), the device periodically contacts Company update servers. During an update check, the following is transmitted:

| Data Element | Example | Purpose |
|---|---|---|
| Software version | `1.4.2` | Determine if an update is available |
| Hardware class | `appliance-v1` or `docker-amd64` | Serve the correct update package |

### 4.2 What Is NOT Transmitted

Update checks do **not** transmit:

- User identity or account information.
- Device serial numbers or unique hardware identifiers.
- Content source data, M3U URLs, or channel configurations.
- Usage statistics or viewing history.
- IP addresses are visible to the update server during the HTTPS connection but are not logged or stored beyond standard transient web server operation.

### 4.3 Disabling Updates

You may disable the managed update service at any time in the Product settings. Disabling updates stops all communication with Company servers.

## 5. Opt-In Anonymous Analytics

### 5.1 Consent

Analytics are **disabled by default**. You must explicitly opt in through the Product settings to enable anonymous usage analytics. You may opt out at any time, and previously collected data will be deleted upon request.

### 5.2 Data Collected (If Opted In)

If you choose to enable analytics, the following anonymized data may be collected:

**Feature Usage Statistics:**
- Which Product features are used (e.g., EPG browsing, deck creation, search).
- Frequency and duration of feature usage.
- UI interaction patterns (e.g., navigation paths, commonly used settings).

**Crash Reports:**
- Application error logs and stack traces.
- System state at time of crash (memory usage, active processes).
- Software version and hardware class.

**Hardware Profile:**
- Device model and hardware class.
- Memory and storage capacity (not contents).
- Operating system version.
- Network interface type (e.g., Ethernet, Wi-Fi -- not network names or passwords).

### 5.3 Data NOT Collected (Even If Opted In)

Even with analytics enabled, we never collect:

- Content source URLs or M3U playlist data.
- Channel names, viewing history, or content preferences.
- Personal identification information.
- Network traffic data or browsing history.
- IP addresses (beyond transient HTTPS connection).
- Any data that could identify specific content you access.

### 5.4 Anonymization

All analytics data is stripped of any potentially identifying information before transmission. Data is aggregated and cannot be traced back to individual users or devices.

### 5.5 Purpose of Analytics

Opted-in analytics data is used solely to:

- Identify and fix software bugs.
- Understand which features are most and least used to guide development priorities.
- Improve Product stability and performance.

Analytics data is never sold, shared with third parties, or used for advertising purposes.

## 6. Support Interactions

### 6.1 Support Data

If you contact us for support (remote or on-site consulting), we may collect:

- Contact information you provide (name, email, phone number).
- Device diagnostic information you share during the support session.
- Communication records (support tickets, emails).

### 6.2 Support Data Handling

Support interaction data is:

- Used solely for providing and improving support services.
- Stored securely with access limited to support personnel.
- Retained for three (3) years after the support interaction, then deleted.
- Never shared with third parties except as required by law.

### 6.3 On-Site Support

During on-site consulting, our technicians may interact with your device. Technicians are prohibited from:

- Copying, recording, or transmitting your content source configurations.
- Accessing your viewing history or personal data beyond what is necessary for the support task.
- Retaining any data from your device after the support session concludes.

## 7. Purchase and Payment Data

### 7.1 Hardware Purchases

Hardware purchases are processed through Stripe. We do not directly store credit card numbers or payment instrument details. Payment processing is governed by the payment processor's privacy policy.

### 7.2 Data We Retain

For hardware purchases, we retain:

- Name and shipping address (for order fulfillment).
- Email address (for order confirmation and warranty correspondence).
- Order history and transaction records.

This data is retained for three (3) years or as required by applicable tax and commercial law.

## 8. Third-Party Services

### 8.1 Pre-Loaded Free Channels

The Product ships with configurations for free third-party streaming services (e.g., Pluto TV, Samsung TV Plus). When you access these services through the Product:

- Your device connects directly to the third-party service.
- The third-party service's own privacy policy governs their data collection.
- The Company does not intermediate, proxy, or monitor these connections.
- We recommend reviewing the privacy policies of any third-party services you use.

### 8.2 User-Configured Sources

When you configure your own M3U sources, your device connects directly to those sources. The Company has no visibility into these connections and collects no data about them.

## 9. Data Security

We implement reasonable administrative, technical, and physical security measures to protect any data we do collect, including:

- Encryption in transit (TLS/HTTPS) for all communications with Company servers.
- Encryption at rest for any stored analytics or support data.
- Access controls limiting data access to authorized personnel.
- Regular security assessments of Company infrastructure.

## 10. Children's Privacy

The Product is not directed at children under the age of 13 (or the applicable age in your jurisdiction). We do not knowingly collect personal information from children. If you believe a child has provided us with personal information, contact us at support@synoros.io and we will delete it.

## 11. International Data Transfers

If you are located outside the United States and opt in to analytics, your anonymized data may be transferred to and processed in the United States. By opting in, you consent to this transfer. We ensure appropriate safeguards are in place for any international data transfers.

## 12. Your Rights

### 12.1 General Rights

Regardless of your jurisdiction, you have the right to:

- **Opt out** of analytics at any time.
- **Disable** all communication with Company servers (managed updates).
- **Delete** all local data on your device at any time.
- **Request deletion** of any data we hold about you (support records, purchase records where legally permissible, analytics data).
- **Request access** to any personal data we hold about you.

### 12.2 European Economic Area (EEA) -- GDPR

If you are located in the EEA, you have additional rights under the General Data Protection Regulation (GDPR), including:

- **Right of access** (Article 15) -- obtain confirmation of whether we process your data and access to that data.
- **Right to rectification** (Article 16) -- correct inaccurate personal data.
- **Right to erasure** (Article 17) -- request deletion of your personal data.
- **Right to restriction of processing** (Article 18) -- restrict how we process your data.
- **Right to data portability** (Article 20) -- receive your data in a structured, machine-readable format.
- **Right to object** (Article 21) -- object to processing of your personal data.
- **Right to lodge a complaint** with a supervisory authority.

**Legal basis for processing:** Where we process personal data, we do so on the basis of:

- **Consent** -- for opt-in analytics (Article 6(1)(a)).
- **Contractual necessity** -- for purchase fulfillment and support services (Article 6(1)(b)).
- **Legitimate interest** -- for product improvement based on aggregated, anonymized data (Article 6(1)(f)).

**Data Protection Officer:** Not required under Article 37

Contact for GDPR requests: support@synoros.io

### 12.3 California -- CCPA/CPRA

If you are a California resident, you have rights under the California Consumer Privacy Act (CCPA) as amended by the California Privacy Rights Act (CPRA), including:

- **Right to know** what personal information we collect, use, and disclose.
- **Right to delete** personal information we hold about you.
- **Right to correct** inaccurate personal information.
- **Right to opt out of sale or sharing** of personal information. **We do not sell or share personal information.**
- **Right to non-discrimination** for exercising your privacy rights.

**Categories of personal information collected:** Contact information (for purchases and support only). No browsing history, geolocation, biometric, or inferred characteristics are collected.

**Categories of personal information sold or shared:** None. We do not sell or share personal information.

To exercise your CCPA/CPRA rights, contact: support@synoros.io

## 13. Data Retention

| Data Type | Retention Period |
|---|---|
| On-device data | Under your control; persists until you delete it |
| Opt-in analytics | three (3) years, then automatically deleted |
| Crash reports | three (3) years, then automatically deleted |
| Support records | three (3) years after last interaction |
| Purchase records | As required by applicable tax and commercial law |
| Update check logs | Not retained beyond transient server processing |

## 14. Changes to This Policy

We may update this Privacy Policy from time to time. Changes will be posted at https://synoros.io/foundry-iptv/privacy with a revised "Last Updated" date. If we make material changes, we will provide notice through the Product update notification and website notice.

Your continued use of the Product after changes take effect constitutes acceptance of the revised policy.

## 15. Open-Source Transparency

The Product is open-source under the AGPL-3.0 license. You may inspect the source code at any time to verify our privacy practices. The source repository is available at https://github.com/superninjv/foundry-iptv. We encourage security researchers and privacy advocates to audit our code.

## 16. Contact Information

For privacy-related questions or to exercise your rights:

Synoros
Synoros, Georgia, United States
support@synoros.io
https://synoros.io

For GDPR-specific requests: support@synoros.io
For CCPA/CPRA-specific requests: support@synoros.io

---

*This document is a template for legal review and does not constitute legal advice.*
