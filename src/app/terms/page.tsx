import Link from "next/link";

export const metadata = {
  title: "Terms of Service | Track Clear",
  description: "Track Clear terms of service — the rules governing use of our event forwarding platform.",
};

export default function TermsPage() {
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
            <h1 className="text-3xl font-bold tracking-wider text-foreground font-display">Terms of Service</h1>
            <p className="mt-2 text-sm text-muted-foreground">Last updated: February 21, 2026</p>
            <p className="mt-4 text-base text-muted-foreground leading-relaxed">
              These Terms of Service (&quot;Terms&quot;) govern your access to and use of the Track Clear service
              (&quot;Service&quot;), operated by Track Clear (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) at trackclear.io. By creating
              an account or using the Service, you agree to be bound by these Terms. If you do not agree,
              do not use the Service.
            </p>
          </header>

          <div className="space-y-10">
            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">1. Description of Service</h2>
              <p className="text-muted-foreground leading-relaxed">
                Track Clear is a server-side event forwarding platform for ecommerce merchants. The
                Service enables merchants to capture browser-side ecommerce events (such as page views,
                add-to-cart actions, and purchases) and forward them server-to-server to one or more
                advertising and analytics platforms, including Meta Conversions API, Google Ads Enhanced
                Conversions, TikTok Events API, Google Analytics 4 (GA4), and Klaviyo.
              </p>
              <p className="mt-3 text-muted-foreground leading-relaxed">
                Track Clear is a standalone SaaS application. It is not a Shopify application and is not
                affiliated with or endorsed by Shopify Inc. Integration with Shopify stores is achieved
                through a JavaScript snippet that merchants paste into their Shopify Custom Pixel
                configuration.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">2. Account Terms</h2>

              <h3 className="text-base font-semibold text-foreground mt-4 mb-2">2.1 Eligibility</h3>
              <p className="text-muted-foreground leading-relaxed">
                You must be at least 18 years old to create an account. By creating an account, you
                represent that you are at least 18 years of age and have the legal capacity to enter into
                a binding agreement. If you are creating an account on behalf of a business entity, you
                represent that you have authority to bind that entity to these Terms.
              </p>

              <h3 className="text-base font-semibold text-foreground mt-4 mb-2">2.2 Account Accuracy</h3>
              <p className="text-muted-foreground leading-relaxed">
                You agree to provide accurate, complete, and current information when creating your
                account and to keep that information up to date. We reserve the right to suspend or
                terminate accounts with inaccurate or misleading information.
              </p>

              <h3 className="text-base font-semibold text-foreground mt-4 mb-2">2.3 Account Security</h3>
              <p className="text-muted-foreground leading-relaxed">
                You are responsible for maintaining the confidentiality of your account credentials,
                including your password and API keys. You are responsible for all activity that occurs
                under your account. Notify us immediately at support@trackclear.io if you suspect
                unauthorized access to your account.
              </p>

              <h3 className="text-base font-semibold text-foreground mt-4 mb-2">2.4 One Account Per User</h3>
              <p className="text-muted-foreground leading-relaxed">
                Each account is for the use of a single individual or business entity. You may not share
                your account credentials with others or allow multiple individuals to use a single account,
                unless you have entered into a separate agreement with us for team or enterprise access.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">3. Billing and Payment</h2>

              <h3 className="text-base font-semibold text-foreground mt-4 mb-2">3.1 Plans and Pricing</h3>
              <p className="text-muted-foreground leading-relaxed">
                Track Clear offers a free plan and paid subscription plans. Current plan pricing and
                limits are displayed on the billing page within the dashboard. We reserve the right to
                change plan pricing with 30 days advance notice to existing subscribers.
              </p>

              <h3 className="text-base font-semibold text-foreground mt-4 mb-2">3.2 Order-Based Billing</h3>
              <p className="text-muted-foreground leading-relaxed">
                Billing limits are based on the number of Purchase events forwarded per calendar month
                across all workspaces associated with your account. Other event types (page views,
                add-to-cart, etc.) are not counted toward billing limits. Order counts reset on the first
                day of each calendar month.
              </p>

              <h3 className="text-base font-semibold text-foreground mt-4 mb-2">3.3 Payment Processing</h3>
              <p className="text-muted-foreground leading-relaxed">
                All payments are processed by Stripe, Inc. By subscribing to a paid plan, you authorize
                us to charge your payment method on a recurring monthly basis. You agree to Stripe&apos;s
                terms of service in addition to these Terms. We do not store your payment card data.
              </p>

              <h3 className="text-base font-semibold text-foreground mt-4 mb-2">3.4 Automatic Plan Upgrades</h3>
              <p className="text-muted-foreground leading-relaxed">
                On paid plans (Starter and Growth), if your monthly Purchase event count exceeds your
                plan&apos;s limit, your subscription will automatically upgrade to the next tier to maintain
                uninterrupted event forwarding. You will be billed the difference for the remainder of
                the billing period at Stripe&apos;s proration rates. You may disable auto-upgrade by
                downgrading to the Free plan, which will block Purchase forwarding once the free limit
                is reached.
              </p>

              <h3 className="text-base font-semibold text-foreground mt-4 mb-2">3.5 Refunds</h3>
              <p className="text-muted-foreground leading-relaxed">
                Subscription fees are non-refundable except where required by applicable law. If you
                believe you have been charged in error, contact support@trackclear.io within 30 days of
                the charge and we will investigate.
              </p>

              <h3 className="text-base font-semibold text-foreground mt-4 mb-2">3.6 Free Plan</h3>
              <p className="text-muted-foreground leading-relaxed">
                The free plan does not require a credit card. Purchase event forwarding is paused once
                the monthly free-plan limit is reached. Non-purchase events continue to be forwarded
                without limit.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">4. Acceptable Use</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                You agree to use the Service only for lawful purposes and in accordance with these Terms.
                You must not:
              </p>
              <ul className="list-disc pl-5 space-y-2 text-muted-foreground leading-relaxed">
                <li>Use the Service to send events relating to illegal products, services, or activities</li>
                <li>Forward personal data without appropriate legal basis (such as valid consent where required)</li>
                <li>Attempt to circumvent rate limits, access controls, or any security measures</li>
                <li>Scrape, crawl, or systematically extract data from the Service using automated means</li>
                <li>Reverse engineer, decompile, or attempt to extract the source code of the Service</li>
                <li>Resell, sublicense, or otherwise provide access to the Service to third parties without our written consent</li>
                <li>Use the Service to transmit malware, spam, or any harmful content</li>
                <li>Impersonate any person or entity or misrepresent your affiliation with any person or entity</li>
                <li>Interfere with or disrupt the integrity or performance of the Service or its infrastructure</li>
                <li>Use the Service in a way that violates the terms of service of any destination platform (Meta, Google, TikTok, GA4, Klaviyo)</li>
              </ul>
              <p className="mt-3 text-muted-foreground leading-relaxed">
                We reserve the right to suspend or terminate accounts that violate these prohibitions,
                with or without prior notice, at our sole discretion.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">5. Data Ownership and Processing</h2>

              <h3 className="text-base font-semibold text-foreground mt-4 mb-2">5.1 Your Data</h3>
              <p className="text-muted-foreground leading-relaxed">
                You retain full ownership of all event data, customer data, and configuration data that
                you provide to the Service. We do not claim any intellectual property rights over your
                data.
              </p>

              <h3 className="text-base font-semibold text-foreground mt-4 mb-2">5.2 Data Processing Role</h3>
              <p className="text-muted-foreground leading-relaxed">
                With respect to personal data relating to your end customers, you are the data controller
                and we are the data processor. We process that data only on your instructions (as
                configured in your workspace settings) and for the purposes of providing the Service.
                We do not use your end customers&apos; personal data for our own commercial purposes.
              </p>

              <h3 className="text-base font-semibold text-foreground mt-4 mb-2">5.3 Your Compliance Obligations</h3>
              <p className="text-muted-foreground leading-relaxed">
                You are responsible for ensuring that your collection, transmission, and forwarding of
                personal data through the Service complies with all applicable laws, including GDPR,
                CCPA, and any other applicable data protection laws. This includes obtaining any
                necessary consents from your end customers, providing adequate privacy notices, and
                ensuring a lawful basis for processing.
              </p>

              <h3 className="text-base font-semibold text-foreground mt-4 mb-2">5.4 License to Operate</h3>
              <p className="text-muted-foreground leading-relaxed">
                You grant us a limited, non-exclusive license to process your data solely for the purpose
                of providing and improving the Service, as described in our Privacy Policy.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">6. Service Availability</h2>
              <p className="text-muted-foreground leading-relaxed">
                We strive to maintain high availability of the Service but do not guarantee any specific
                uptime percentage. The Service is provided on a best-effort basis. We do not offer a
                Service Level Agreement (SLA) on the Free or Starter plans. Scheduled maintenance will
                be announced with reasonable advance notice where possible.
              </p>
              <p className="mt-3 text-muted-foreground leading-relaxed">
                We are not responsible for failures to deliver events caused by downtime or API changes
                at destination platforms (Meta, Google, TikTok, GA4, Klaviyo), network outages outside
                our infrastructure, or force majeure events.
              </p>
              <p className="mt-3 text-muted-foreground leading-relaxed">
                The Service includes automatic retry logic (up to 3 attempts with exponential backoff)
                and a stale event requeue mechanism to minimize data loss during brief disruptions.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">7. Intellectual Property</h2>
              <p className="text-muted-foreground leading-relaxed">
                The Service, including all software, design, documentation, and associated materials, is
                owned by Track Clear and protected by applicable intellectual property laws. These Terms
                do not grant you any rights to our trademarks, service marks, or trade names.
              </p>
              <p className="mt-3 text-muted-foreground leading-relaxed">
                Nothing in these Terms restricts our right to use aggregated, anonymized data derived
                from the operation of the Service (such as platform-level performance statistics) for
                product improvement purposes, provided that such data cannot reasonably be used to
                identify you or your end customers.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">8. Disclaimer of Warranties</h2>
              <p className="text-muted-foreground leading-relaxed">
                THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND,
                EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF
                MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT
                WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF HARMFUL
                COMPONENTS.
              </p>
              <p className="mt-3 text-muted-foreground leading-relaxed">
                We do not warrant that events forwarded through the Service will be accepted or
                attributed by destination platforms. Advertising attribution is ultimately determined by
                the destination platforms and is outside our control.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">9. Limitation of Liability</h2>
              <p className="text-muted-foreground leading-relaxed">
                TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL TRACK CLEAR BE
                LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES,
                INCLUDING LOSS OF PROFITS, LOSS OF DATA, LOSS OF GOODWILL, OR BUSINESS INTERRUPTION,
                ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF THE SERVICE, EVEN IF WE HAVE BEEN
                ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
              </p>
              <p className="mt-3 text-muted-foreground leading-relaxed">
                OUR TOTAL CUMULATIVE LIABILITY TO YOU FOR ALL CLAIMS ARISING OUT OF OR RELATING TO
                THESE TERMS OR THE SERVICE SHALL NOT EXCEED THE GREATER OF (A) THE TOTAL FEES YOU
                PAID TO US IN THE THREE MONTHS PRECEDING THE CLAIM, OR (B) ONE HUNDRED US DOLLARS
                ($100).
              </p>
              <p className="mt-3 text-muted-foreground leading-relaxed">
                Some jurisdictions do not allow the exclusion or limitation of certain warranties or
                liabilities. In such jurisdictions, our liability is limited to the greatest extent
                permitted by law.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">10. Indemnification</h2>
              <p className="text-muted-foreground leading-relaxed">
                You agree to defend, indemnify, and hold harmless Track Clear and its officers,
                directors, employees, and agents from and against any claims, damages, losses, and
                expenses (including reasonable legal fees) arising out of or relating to: (a) your use of
                the Service in violation of these Terms; (b) your violation of any applicable law or
                regulation; (c) your failure to obtain necessary consents from your end customers; or
                (d) any claim by a third party arising from your use of the Service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">11. Termination</h2>

              <h3 className="text-base font-semibold text-foreground mt-4 mb-2">11.1 Termination by You</h3>
              <p className="text-muted-foreground leading-relaxed">
                You may terminate your account at any time by deleting your account through the
                dashboard settings or by contacting support@trackclear.io. Termination takes effect
                immediately. No refunds are issued for unused portions of prepaid subscription periods,
                except where required by law.
              </p>

              <h3 className="text-base font-semibold text-foreground mt-4 mb-2">11.2 Termination by Us</h3>
              <p className="text-muted-foreground leading-relaxed">
                We may suspend or terminate your account at any time for any reason, including breach of
                these Terms, non-payment, or conduct that we reasonably determine is harmful to the
                Service or other users. For non-urgent matters, we will provide reasonable notice before
                termination.
              </p>

              <h3 className="text-base font-semibold text-foreground mt-4 mb-2">11.3 Effect of Termination</h3>
              <p className="text-muted-foreground leading-relaxed">
                Upon termination, your access to the Service ceases immediately. Event forwarding for
                your workspaces stops. We will delete or anonymize your account data within 30 days of
                termination, subject to any legal retention obligations. Sections of these Terms that by
                their nature should survive termination (including Sections 7, 8, 9, 10, and 13) will
                continue to apply.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">12. Changes to These Terms</h2>
              <p className="text-muted-foreground leading-relaxed">
                We may update these Terms from time to time. When we make material changes, we will
                notify you by email at least 30 days before the changes take effect. The updated Terms
                will be posted at trackclear.io/terms with a revised &quot;Last updated&quot; date. Your continued
                use of the Service after the effective date constitutes your acceptance of the updated
                Terms.
              </p>
              <p className="mt-3 text-muted-foreground leading-relaxed">
                If you disagree with the updated Terms, you may terminate your account before the
                effective date without penalty.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">13. Governing Law and Disputes</h2>
              <p className="text-muted-foreground leading-relaxed">
                These Terms are governed by and construed in accordance with the laws of the State of
                Delaware, United States, without regard to its conflict of law provisions. Any dispute
                arising out of or relating to these Terms or the Service that cannot be resolved
                informally shall be submitted to binding arbitration in accordance with the rules of the
                American Arbitration Association. The arbitration shall take place in Delaware.
              </p>
              <p className="mt-3 text-muted-foreground leading-relaxed">
                Notwithstanding the foregoing, either party may seek injunctive or other equitable
                relief in any court of competent jurisdiction to prevent irreparable harm. Nothing in
                these Terms limits your rights as a consumer under applicable mandatory local law.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">14. Miscellaneous</h2>
              <ul className="list-disc pl-5 space-y-2 text-muted-foreground leading-relaxed">
                <li><strong className="text-foreground">Entire Agreement:</strong> These Terms, together with our Privacy Policy, constitute the entire agreement between you and Track Clear regarding the Service.</li>
                <li><strong className="text-foreground">Severability:</strong> If any provision of these Terms is held to be invalid or unenforceable, the remaining provisions will continue in full force and effect.</li>
                <li><strong className="text-foreground">Waiver:</strong> Our failure to enforce any right or provision of these Terms will not be considered a waiver of that right or provision.</li>
                <li><strong className="text-foreground">Assignment:</strong> You may not assign these Terms or any rights hereunder without our prior written consent. We may assign these Terms in connection with a merger, acquisition, or sale of assets.</li>
                <li><strong className="text-foreground">No Third-Party Beneficiaries:</strong> These Terms do not create any third-party beneficiary rights.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">15. Contact</h2>
              <p className="text-muted-foreground leading-relaxed">
                For any questions about these Terms or the Service, please contact:
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
          <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
          <span>support@trackclear.io</span>
        </footer>
      </div>
    </div>
  );
}
