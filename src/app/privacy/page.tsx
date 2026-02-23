import Link from "next/link";

export const metadata = {
  title: "Privacy Policy | Track Clear",
  description: "Track Clear privacy policy — how we collect, process, and protect your data.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-6 py-16">
        {/* Nav */}
        <div className="mb-10">
          <Link
            href="/"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            &larr; Back to Track Clear
          </Link>
        </div>

        <article>
          <header className="mb-10 border-b border-border pb-8">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Privacy Policy</h1>
            <p className="mt-2 text-sm text-muted-foreground">Last updated: February 21, 2026</p>
            <p className="mt-4 text-base text-muted-foreground leading-relaxed">
              Track Clear (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) operates the Track Clear service
              (&quot;Service&quot;), accessible at trackclear.io. This Privacy Policy explains what information we
              collect, how we use it, who we share it with, and what rights you have regarding your data.
            </p>
          </header>

          <div className="space-y-10">
            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">1. Who This Policy Applies To</h2>
              <p className="text-muted-foreground leading-relaxed">
                This policy applies to two categories of people: (a) <strong className="text-foreground">merchants</strong> who
                create Track Clear accounts and use our dashboard to configure event forwarding, and
                (b) <strong className="text-foreground">end customers</strong> of those merchants whose behavioral
                data (such as page views and purchase events) is transmitted through our infrastructure.
              </p>
              <p className="mt-3 text-muted-foreground leading-relaxed">
                If you are an end customer of a merchant using Track Clear, you should also review that
                merchant&apos;s own privacy policy, as they determine the purposes for which your data is
                collected.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">2. Data We Collect</h2>

              <h3 className="text-base font-semibold text-foreground mt-4 mb-2">2.1 Account Data (Merchants)</h3>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground leading-relaxed">
                <li>Name and email address provided during registration</li>
                <li>Hashed password (bcrypt) or Google OAuth identifier</li>
                <li>Billing information managed by Stripe (we do not store raw card data)</li>
                <li>Display currency and language preferences</li>
                <li>Alert notification preferences</li>
              </ul>

              <h3 className="text-base font-semibold text-foreground mt-4 mb-2">2.2 Workspace Configuration Data</h3>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground leading-relaxed">
                <li>API keys and access tokens for advertising platforms (Meta, Google Ads, TikTok, GA4, Klaviyo)</li>
                <li>All credentials are encrypted at rest using AES-256-GCM before storage in our database</li>
                <li>Pixel IDs and measurement IDs for destination platforms</li>
              </ul>

              <h3 className="text-base font-semibold text-foreground mt-4 mb-2">2.3 Event Data (End Customers)</h3>
              <p className="text-muted-foreground leading-relaxed mb-2">
                When a merchant&apos;s store visitor triggers an ecommerce event (such as viewing a product,
                adding to cart, or completing a purchase), our JavaScript snippet transmits the following
                data to our servers:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground leading-relaxed">
                <li>Event name and timestamp</li>
                <li>Page URL and referrer URL</li>
                <li>Browser cookies: <code className="text-sm bg-muted px-1 py-0.5 rounded">_fbp</code> (Meta browser pixel cookie) and <code className="text-sm bg-muted px-1 py-0.5 rounded">_fbc</code> (Meta click ID cookie)</li>
                <li>TikTok click ID (<code className="text-sm bg-muted px-1 py-0.5 rounded">ttclid</code>) and Google click ID (<code className="text-sm bg-muted px-1 py-0.5 rounded">gclid</code>) from URL parameters</li>
                <li>UTM attribution parameters (source, medium, campaign, content, term)</li>
                <li>Customer user data: email address, phone number, first name, last name, city, state, postal code, and country code — when provided by the merchant&apos;s store</li>
                <li>Order data: value, currency, number of items, order ID</li>
                <li>Consent signals passed by the merchant&apos;s consent management platform</li>
              </ul>

              <h3 className="text-base font-semibold text-foreground mt-4 mb-2">2.4 Technical and Usage Data</h3>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground leading-relaxed">
                <li>IP address of incoming requests (stored temporarily in event logs for debugging and fraud prevention; automatically anonymized after 48 hours)</li>
                <li>User agent strings (stored temporarily in event logs for bot detection; automatically anonymized after 48 hours)</li>
                <li>API request logs for security monitoring</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">3. How We Process Personal Data</h2>

              <h3 className="text-base font-semibold text-foreground mt-4 mb-2">3.1 PII Hashing Before Forwarding</h3>
              <p className="text-muted-foreground leading-relaxed">
                Before forwarding event data to advertising platforms, we apply SHA-256 hashing to all
                personally identifiable information (PII) fields, including email address, phone number,
                first name, last name, city, state, postal code, and country code. This is consistent
                with the requirements and recommendations of Meta Conversions API, Google Ads Enhanced
                Conversions, and TikTok Events API.
              </p>
              <p className="mt-3 text-muted-foreground leading-relaxed">
                <strong className="text-foreground">Exception:</strong> Klaviyo requires unhashed email addresses for
                customer profile matching. When a merchant has Klaviyo enabled, the raw email address
                is transmitted to Klaviyo&apos;s servers.
              </p>

              <h3 className="text-base font-semibold text-foreground mt-4 mb-2">3.2 Phone Number Normalization</h3>
              <p className="text-muted-foreground leading-relaxed">
                Phone numbers are normalized to E.164 international format (e.g., +15551234567) using
                the customer&apos;s billing country to infer the correct country code, before SHA-256 hashing
                and transmission to advertising platforms.
              </p>

              <h3 className="text-base font-semibold text-foreground mt-4 mb-2">3.3 Server-Side Event Forwarding</h3>
              <p className="text-muted-foreground leading-relaxed">
                Our primary purpose is server-to-server event forwarding. We receive event data from the
                merchant&apos;s store, perform any necessary normalization and hashing, and transmit it to the
                advertising or analytics platforms that the merchant has configured. We act as a data
                processor on behalf of the merchant for this purpose.
              </p>

              <h3 className="text-base font-semibold text-foreground mt-4 mb-2">3.4 Consent Enforcement</h3>
              <p className="text-muted-foreground leading-relaxed">
                Merchants can configure our service to operate in either STRICT or LAX consent mode.
                In STRICT mode, we only forward events to advertising platforms when the end customer
                has affirmatively consented to marketing tracking. Merchants are responsible for
                implementing a compliant consent management solution on their storefront.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">4. Sub-Processors</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                We share data with the following third-party service providers to operate the Service.
                Merchants who enable a given destination platform authorize us to transmit data to that
                platform on their behalf.
              </p>
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-4 py-3 text-left font-semibold text-foreground">Sub-Processor</th>
                      <th className="px-4 py-3 text-left font-semibold text-foreground">Purpose</th>
                      <th className="px-4 py-3 text-left font-semibold text-foreground">Location</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    <tr>
                      <td className="px-4 py-3 text-foreground font-medium">Meta Platforms, Inc.</td>
                      <td className="px-4 py-3 text-muted-foreground">Meta Conversions API event forwarding</td>
                      <td className="px-4 py-3 text-muted-foreground">United States</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-foreground font-medium">Google LLC</td>
                      <td className="px-4 py-3 text-muted-foreground">Google Ads enhanced conversions and GA4 Measurement Protocol</td>
                      <td className="px-4 py-3 text-muted-foreground">United States</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-foreground font-medium">ByteDance Ltd. (TikTok)</td>
                      <td className="px-4 py-3 text-muted-foreground">TikTok Events API event forwarding</td>
                      <td className="px-4 py-3 text-muted-foreground">United States / Singapore</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-foreground font-medium">Klaviyo, Inc.</td>
                      <td className="px-4 py-3 text-muted-foreground">Email marketing event synchronization</td>
                      <td className="px-4 py-3 text-muted-foreground">United States</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-foreground font-medium">Stripe, Inc.</td>
                      <td className="px-4 py-3 text-muted-foreground">Payment processing and subscription management</td>
                      <td className="px-4 py-3 text-muted-foreground">United States</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-foreground font-medium">Resend</td>
                      <td className="px-4 py-3 text-muted-foreground">Transactional email delivery (account notifications, alerts)</td>
                      <td className="px-4 py-3 text-muted-foreground">United States</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">5. Data Retention</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                Event logs (records of individual forwarding operations) are retained according to the
                merchant&apos;s subscription plan:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground leading-relaxed">
                <li><strong className="text-foreground">Free and Starter plans:</strong> 7 days</li>
                <li><strong className="text-foreground">Growth and Scale plans:</strong> 30 days</li>
              </ul>
              <p className="mt-3 text-muted-foreground leading-relaxed">
                IP addresses and browser information collected during event processing are automatically
                anonymized after 48 hours and permanently deleted according to your plan&apos;s retention
                period (7-30 days).
              </p>
              <p className="mt-3 text-muted-foreground leading-relaxed">
                Merchant account data (profile, workspace configuration) is retained for the duration of
                the account. Following account deletion or termination, we will delete or anonymize all
                associated data within 30 days, except where we are required to retain records for legal
                or regulatory compliance purposes (such as billing records, which may be retained for up
                to 7 years).
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">6. Cookies</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                Our JavaScript snippet reads the following cookies from the end customer&apos;s browser to
                support advertising platform attribution. The snippet does not set any cookies itself.
              </p>
              <ul className="list-disc pl-5 space-y-2 text-muted-foreground leading-relaxed">
                <li>
                  <strong className="text-foreground">_fbp</strong> — Set by Meta&apos;s browser pixel. Used to identify browsers for Meta Conversions API deduplication.
                </li>
                <li>
                  <strong className="text-foreground">_fbc</strong> — Set by Meta&apos;s browser pixel when a visitor arrives via a Facebook ad. Used for attribution.
                </li>
              </ul>
              <p className="mt-3 text-muted-foreground leading-relaxed">
                Our web application (trackclear.io dashboard) uses a <code className="text-sm bg-muted px-1 py-0.5 rounded">locale</code> cookie to remember
                your preferred display language. This cookie does not track any personal data and expires
                with your browser session.
              </p>
              <p className="mt-3 text-muted-foreground leading-relaxed">
                Session management for authenticated merchants uses HTTP-only cookies containing a
                signed JWT token. These are essential for the operation of the Service and cannot be
                disabled.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">7. International Data Transfers</h2>
              <p className="text-muted-foreground leading-relaxed">
                Our infrastructure is hosted in the United States. If you are located in the European
                Economic Area (EEA), United Kingdom, or Switzerland, your personal data will be
                transferred to and processed in the United States. We rely on Standard Contractual
                Clauses (SCCs) approved by the European Commission as the legal mechanism for such
                transfers where applicable.
              </p>
              <p className="mt-3 text-muted-foreground leading-relaxed">
                Merchants who enable advertising platform integrations authorize the transfer of hashed
                end-customer data to those platforms, which may be located in various jurisdictions.
                Each platform operates under its own data transfer mechanisms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">8. Your Rights (GDPR and Similar Laws)</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                If you are a merchant located in the EEA, UK, or another jurisdiction with applicable
                data protection law, you have the following rights regarding your personal data:
              </p>
              <ul className="list-disc pl-5 space-y-2 text-muted-foreground leading-relaxed">
                <li><strong className="text-foreground">Right of access:</strong> Request a copy of the personal data we hold about you.</li>
                <li><strong className="text-foreground">Right to rectification:</strong> Request correction of inaccurate personal data.</li>
                <li><strong className="text-foreground">Right to erasure:</strong> Request deletion of your personal data, subject to legal retention obligations.</li>
                <li><strong className="text-foreground">Right to data portability:</strong> Receive your personal data in a structured, machine-readable format.</li>
                <li><strong className="text-foreground">Right to object:</strong> Object to processing of your personal data for direct marketing purposes.</li>
                <li><strong className="text-foreground">Right to restrict processing:</strong> Request that we limit how we use your data in certain circumstances.</li>
                <li><strong className="text-foreground">Right to withdraw consent:</strong> Where processing is based on consent, withdraw that consent at any time.</li>
              </ul>
              <p className="mt-3 text-muted-foreground leading-relaxed">
                For end customers of merchants using Track Clear, you should exercise these rights
                directly with the merchant. As a data processor, we will assist merchants in responding
                to such requests.
              </p>
              <p className="mt-3 text-muted-foreground leading-relaxed">
                To exercise any of the above rights as a merchant, contact us at{" "}
                <a href="mailto:support@trackclear.io" className="text-foreground underline hover:no-underline">
                  support@trackclear.io
                </a>
                . We will respond within 30 days.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">9. Data Deletion Requests</h2>
              <p className="text-muted-foreground leading-relaxed">
                To request deletion of your account and all associated data, you may either use the
                &quot;Delete Workspace&quot; and account deletion options in the dashboard settings, or send an
                email to{" "}
                <a href="mailto:support@trackclear.io" className="text-foreground underline hover:no-underline">
                  support@trackclear.io
                </a>{" "}
                with the subject line &quot;Data Deletion Request&quot;. We will complete the deletion within 30 days
                and confirm via email.
              </p>
              <p className="mt-3 text-muted-foreground leading-relaxed">
                Note that deleting your account does not automatically remove data that has already been
                forwarded to advertising platforms (Meta, Google, TikTok, GA4, Klaviyo). To request
                deletion of data from those platforms, you must contact them directly under their
                respective privacy policies.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">10. Security</h2>
              <p className="text-muted-foreground leading-relaxed">
                We implement industry-standard technical and organizational measures to protect your data:
              </p>
              <ul className="list-disc pl-5 space-y-1 mt-2 text-muted-foreground leading-relaxed">
                <li>All credentials and API tokens are encrypted at rest using AES-256-GCM</li>
                <li>All data in transit is protected by TLS 1.2 or higher</li>
                <li>Passwords are hashed using bcrypt with an appropriate cost factor</li>
                <li>Access to production systems is restricted and logged</li>
                <li>Rate limiting is applied to all public API endpoints</li>
              </ul>
              <p className="mt-3 text-muted-foreground leading-relaxed">
                No method of transmission or storage is 100% secure. If you discover a security
                vulnerability, please report it responsibly to{" "}
                <a href="mailto:support@trackclear.io" className="text-foreground underline hover:no-underline">
                  support@trackclear.io
                </a>
                .
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">11. Children&apos;s Privacy</h2>
              <p className="text-muted-foreground leading-relaxed">
                The Service is intended for use by businesses and individuals aged 18 and over. We do not
                knowingly collect personal data from children under the age of 18. If you believe we have
                inadvertently collected such data, please contact us immediately.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">12. Changes to This Policy</h2>
              <p className="text-muted-foreground leading-relaxed">
                We may update this Privacy Policy from time to time. When we make material changes, we
                will notify merchants by email at least 30 days before the changes take effect. Continued
                use of the Service after the effective date constitutes acceptance of the updated policy.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">13. Contact</h2>
              <p className="text-muted-foreground leading-relaxed">
                For any privacy-related questions, requests, or concerns, please contact:
              </p>
              <address className="mt-3 not-italic text-muted-foreground leading-relaxed">
                Track Clear<br />
                <a href="mailto:support@trackclear.io" className="text-foreground underline hover:no-underline">
                  support@trackclear.io
                </a>
              </address>
            </section>
          </div>
        </article>

        <footer className="mt-16 border-t border-border pt-8 flex flex-wrap gap-4 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
          <Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
          <span>support@trackclear.io</span>
        </footer>
      </div>
    </div>
  );
}
