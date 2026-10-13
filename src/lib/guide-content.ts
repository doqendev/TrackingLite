export interface GuideStep {
  titleKey: string;
  descriptionKey: string;
  image?: string;
}

export const PLATFORM_GUIDES: Record<string, GuideStep[]> = {
  meta: [
    { titleKey: "metaGuideStep1Title", descriptionKey: "metaGuideStep1Desc", image: "/guides/meta-step-1.png" },
    { titleKey: "metaGuideStep2Title", descriptionKey: "metaGuideStep2Desc", image: "/guides/meta-step-2.png" },
    { titleKey: "metaGuideStep3Title", descriptionKey: "metaGuideStep3Desc", image: "/guides/meta-step-3.png" },
  ],
  tiktok: [
    { titleKey: "tiktokGuideStep1Title", descriptionKey: "tiktokGuideStep1Desc", image: "/guides/tiktok-step-1.png" },
    { titleKey: "tiktokGuideStep2Title", descriptionKey: "tiktokGuideStep2Desc", image: "/guides/tiktok-step-2.png" },
    { titleKey: "tiktokGuideStep3Title", descriptionKey: "tiktokGuideStep3Desc", image: "/guides/tiktok-step-3.png" },
  ],
  ga4: [
    { titleKey: "ga4GuideStep1Title", descriptionKey: "ga4GuideStep1Desc", image: "/guides/ga4-step-1.png" },
    { titleKey: "ga4GuideStep2Title", descriptionKey: "ga4GuideStep2Desc", image: "/guides/ga4-step-2.png" },
    { titleKey: "ga4GuideStep3Title", descriptionKey: "ga4GuideStep3Desc", image: "/guides/ga4-step-3.png" },
  ],
  klaviyo: [
    { titleKey: "klaviyoGuideStep1Title", descriptionKey: "klaviyoGuideStep1Desc", image: "/guides/klaviyo-step-1.png" },
    { titleKey: "klaviyoGuideStep2Title", descriptionKey: "klaviyoGuideStep2Desc", image: "/guides/klaviyo-step-2.png" },
    { titleKey: "klaviyoGuideStep3Title", descriptionKey: "klaviyoGuideStep3Desc", image: "/guides/klaviyo-step-3.png" },
  ],
  reddit: [
    { titleKey: "redditGuideStep1Title", descriptionKey: "redditGuideStep1Desc", image: "/guides/reddit-step-1.png" },
    { titleKey: "redditGuideStep2Title", descriptionKey: "redditGuideStep2Desc", image: "/guides/reddit-step-2.png" },
    { titleKey: "redditGuideStep3Title", descriptionKey: "redditGuideStep3Desc", image: "/guides/reddit-step-3.png" },
  ],
  pinterest: [
    { titleKey: "pinterestGuideStep1Title", descriptionKey: "pinterestGuideStep1Desc", image: "/guides/pinterest-step-1.png" },
    { titleKey: "pinterestGuideStep2Title", descriptionKey: "pinterestGuideStep2Desc", image: "/guides/pinterest-step-2.png" },
    { titleKey: "pinterestGuideStep3Title", descriptionKey: "pinterestGuideStep3Desc", image: "/guides/pinterest-step-3.png" },
  ],
  shopifyWebhook: [
    { titleKey: "webhookGuideStep1Title", descriptionKey: "webhookGuideStep1Desc" },
    { titleKey: "webhookGuideStep2Title", descriptionKey: "webhookGuideStep2Desc" },
    { titleKey: "webhookGuideStep3Title", descriptionKey: "webhookGuideStep3Desc" },
  ],
};
