export interface IcpPreset {
  id: string;
  name: string;
  tagline: string;
  product_description: string;
  keywords: string;
  target_audience: string;
}

export const PRESETS: IcpPreset[] = [
  {
    id: "gtm-switchers",
    name: "GTM Switchers",
    tagline: "Clay / Apollo / ZoomInfo refugees — stale alerts, webhook delays",
    product_description:
      "Sygnal is buyer-intent infrastructure for RevOps teams that detects real-time public conversations where GTM operators describe missed signals, stale alerts, and broken Clay/Zapier webhook workflows, scores urgency 0-10, and delivers webhook-ready outreach payloads.",
    keywords:
      "buying intent, intent signals, missed signals, stale alerts, real-time leads, Clay, Zapier, webhook, CRM integration, RevOps, GTM workflow",
    target_audience:
      "RevOps and GTM engineering leaders at B2B SaaS 20-200 employees evaluating Clay, Apollo, ZoomInfo alternatives",
  },
  {
    id: "ai-cost",
    name: "AI Cost Refugees",
    tagline: "Teams fleeing OpenAI bills — self-hosted, SOC2, Bedrock",
    product_description:
      "Private LLM and data pipeline that cuts AI tool spend and keeps customer data SOC2/GDPR compliant versus public APIs, with self-hosted RAG on Bedrock and NVIDIA NIM.",
    keywords:
      "AWS bill too high, OpenAI cost, self-hosted LLM, Bedrock, SOC2 AI, data residency, NVIDIA NIM, private RAG",
    target_audience:
      "CTOs and AI engineers at startups handling customer data and evaluating Bedrock self-hosted options",
  },
  {
    id: "home-services",
    name: "Home Services",
    tagline: "Homeowners posting urgent need-plumber / electrician asks",
    product_description:
      "Vetted home-services marketplace connecting homeowners to same-day plumbers, electricians and cleaners from urgent public help requests.",
    keywords:
      "need plumber, looking for electrician, recommend cleaner, emergency repair, quote needed",
    target_audience: "Homeowners in US metros posting urgent help requests on Reddit and Nextdoor",
  },
];
