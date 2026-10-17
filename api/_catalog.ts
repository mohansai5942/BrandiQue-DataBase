// Voice Calling AI Agents plan catalog (mirrors data/voicePricing.ts on brandique.in).
// Pricing (INR, plus 18% GST): a monthly subscription (Starter / Pro / Growth, minutes included)
// or pay-as-you-go minute top-ups, plus a ONE-TIME setup fee of ₹1,999.
// Kept here so the console, seed file and tests share one definition.

export interface VoicePlan {
  id: 'voice-starter' | 'voice-pro' | 'voice-growth';
  name: string;
  tagline: string;
  priceInr: number;
  billingPeriod: 'month';
  includedMinutes: number;
  effectiveRatePerMinuteInr: number;
  teamMembers: number;
  knowledgeBaseMb: number;
  includes: string;
  features: string[];
  workflowRunsPerMonth: number;
  /** Usage rates (INR per outgoing message) and WhatsApp broadcast allowance (0 = not included). */
  chatbotRatePerMessageInr: number;
  whatsappRatePerMessageInr: number;
  whatsappBroadcastsPerMonth: number;
  /** Support channels and first-response time in hours. */
  supportChannels: string[];
  supportResponseHours: number;
  mostPopular: boolean;
}

/** Flat message rate on every plan (INR per outgoing chatbot or WhatsApp message; incoming free). */
export const VOICE_MESSAGE_RATE_INR = 0.84;
const usage = (broadcasts: number, channels: string[], hours: number) => ({
  chatbotRatePerMessageInr: VOICE_MESSAGE_RATE_INR, whatsappRatePerMessageInr: VOICE_MESSAGE_RATE_INR,
  whatsappBroadcastsPerMonth: broadcasts, supportChannels: channels, supportResponseHours: hours,
});

/** One-time setup fee for a voice calling agent (INR). Charged once. */
export const VOICE_SETUP_FEE_INR = 1999;
/** GST added at checkout on every voice price (percent). */
export const VOICE_GST_PERCENT = 18;

export const VOICE_PLANS: VoicePlan[] = [
  {
    id: 'voice-starter', name: 'Starter', tagline: 'For your first live voice agent.', priceInr: 2799, billingPeriod: 'month',
    includedMinutes: 317, effectiveRatePerMinuteInr: 8.83, teamMembers: 2, knowledgeBaseMb: 10, includes: 'Includes',
    features: ['Voice cloning', 'WhatsApp', 'SIP trunking'], workflowRunsPerMonth: 0, ...usage(0, ['Email'], 24), mostPopular: false,
  },
  {
    id: 'voice-pro', name: 'Pro', tagline: 'For teams running a live pilot.', priceInr: 6999, billingPeriod: 'month',
    includedMinutes: 1000, effectiveRatePerMinuteInr: 7, teamMembers: 5, knowledgeBaseMb: 50, includes: 'Everything in Starter',
    features: ['Live call monitoring', 'Voicemail detection', 'Agent versioning', 'Workflow builder (10,000 runs/mo)'], workflowRunsPerMonth: 10000, ...usage(2000, ['Email'], 24), mostPopular: true,
  },
  {
    id: 'voice-growth', name: 'Growth', tagline: 'For teams scaling past the pilot.', priceInr: 22999, billingPeriod: 'month',
    includedMinutes: 3571, effectiveRatePerMinuteInr: 6.44, teamMembers: 10, knowledgeBaseMb: 100, includes: 'Everything in Pro',
    features: ['Recording insights', 'Email channel', 'SMS channel', 'Workflow builder (100,000 runs/mo)'], workflowRunsPerMonth: 100000, ...usage(10000, ['Email', 'Slack', 'WhatsApp'], 12), mostPopular: false,
  },
];

/** Pay-as-you-go minute top-ups, available on any plan. Base voice agent features only. */
export const VOICE_PAYG = {
  ratePerMinuteInr: 8.9,
  minMinutes: 320,
  /** Top-ups are sold in 10-minute steps: 320, 330, 340, … (slider to 5,000). */
  stepMinutes: 10,
  maxSliderMinutes: 5000,
  minTopUpInr: 2848,
  discountThresholdInr: 7000,
  discountRatePerMinuteInr: 8.47,
  bonusMinutesPercent: 2,
  monthlyPlanOnlyFeatures: ['Voice cloning', 'SIP trunking', 'WhatsApp', 'Voicemail detection'],
};

/** Pay-as-you-go price for a number of minutes (INR, excl. GST): ₹8.90/min, or ₹8.47/min + 2% bonus when the top-up is ₹7,000+. */
export function paygQuote(rawMinutes: number) {
  const raw = Number.isFinite(rawMinutes) ? rawMinutes : VOICE_PAYG.minMinutes;
  const minutes = Math.max(VOICE_PAYG.minMinutes, Math.round(raw / VOICE_PAYG.stepMinutes) * VOICE_PAYG.stepMinutes);
  const discounted = minutes * VOICE_PAYG.discountRatePerMinuteInr >= VOICE_PAYG.discountThresholdInr;
  const rate = discounted ? VOICE_PAYG.discountRatePerMinuteInr : VOICE_PAYG.ratePerMinuteInr;
  const amountInr = Math.round(minutes * rate);
  const bonusMinutes = discounted ? Math.floor((minutes * VOICE_PAYG.bonusMinutesPercent) / 100) : 0;
  return { minutes, rate, amountInr, bonusMinutes, totalMinutes: minutes + bonusMinutes, discounted };
}

/** Comparison-table features by plan (Starter, Pro, Growth), as on the website's Compare plans table. */
export const VOICE_PLAN_FEATURES: Record<string, [boolean, boolean, boolean]> = {
  'Voice AI agents': [true, true, true], 'Call logs': [true, true, true], 'Integrations': [true, true, true],
  'Voice cloning': [true, true, true], 'WhatsApp': [true, true, true], 'SIP trunking': [true, true, true],
  'Live call monitoring': [false, true, true], 'Voicemail detection': [false, true, true], 'Agent versioning': [false, true, true],
  'Recording insights': [false, false, true], 'Knowledge base': [true, true, true], 'Email channel': [false, false, true], 'SMS channel': [false, false, true],
};

/** Voice pricing & billing FAQs (same questions as the website). */
export const VOICE_FAQS: { q: string; a: string }[] = [
  { q: 'Can I change my plan anytime?', a: 'Yes. Upgrade or downgrade between Starter, Pro and Growth at any time, or move to pay as you go. Changes are prorated and take effect immediately.' },
  { q: 'What happens if I exceed my limits?', a: 'Calls continue from your top-up balance at ₹8.90/min (₹8.47/min + 2% bonus on ₹7,000+ top-ups), or move to a higher plan for a lower rate (Pro ₹7.00/min, Growth ₹6.44/min).' },
  { q: 'Is there a free trial?', a: 'No free trial; we give a free demo call before you pay.' },
  { q: 'Do you offer enterprise discounts?', a: 'No separate Enterprise plan. For volume above Growth, custom volume pricing on request.' },
  { q: 'What kind of support do you provide?', a: 'Starter and Pro: email, 24-hour response. Growth: email, Slack and WhatsApp, 12-hour response.' },
  { q: 'Can I integrate with my existing systems?', a: 'Yes: CRM, webhooks, Pabbly Connect, Google Calendar, WhatsApp and SIP trunking.' },
  { q: 'How do plan credits and top-ups work?', a: 'The monthly price is prepaid balance for minutes and messages; the plan decides features; top-ups add balance (₹8.47/min + 2% bonus on ₹7,000+) but do not unlock features.' },
  { q: 'Can I use BrandiQue Voice AI without a subscription?', a: 'Yes: pay as you go at ₹8.90/min from 320 minutes (₹2,848) in 10-minute steps; balance carries over.' },
  { q: 'Is there a prompt limit?', a: 'Keep agent prompts under about 10,000–13,000 characters (~3,500 tokens).' },
  { q: 'What additional fees should I expect?', a: '₹1,999 one-time setup, 18% GST, ₹0.84 per chatbot/WhatsApp message, Meta template charges billed by Meta; extras such as more numbers or concurrency quoted before approval.' },
  { q: 'How is WhatsApp messaging billed?', a: 'Every outgoing message ₹0.84 flat (agent reply or campaign); incoming free. Broadcasts: Pro 2,000/month, Growth 10,000/month.' },
  { q: 'Do marketing WhatsApp messages cost more than support or utility messages?', a: 'No, the same ₹0.84 for every outgoing message; Meta bills its own template charges separately by category and country.' },
  { q: 'Is GST added to WhatsApp message charges?', a: 'Not per message; 18% GST is charged on the plan or top-up invoice.' },
  { q: 'Are there any other charges for WhatsApp?', a: 'WhatsApp calls use the plan voice rate; outgoing messages ₹0.84; incoming free; no WhatsApp setup or monthly fee beyond the one-time ₹1,999 agent setup.' },
];

/** The service record stored as settings/service-voice-ai-agents (server-only; not publicly readable). */
export function voiceServiceRecord(updatedAt: string) {
  return {
    service: 'Voice Calling AI Agents',
    path: '/services/voice-ai-agents',
    currency: 'INR',
    pricingModel: 'monthly-subscription-or-pay-as-you-go',
    gstPercent: VOICE_GST_PERCENT,
    setupFeeInr: VOICE_SETUP_FEE_INR,
    setupFeeType: 'one-time',
    billing: 'Per second, rounded up to 30 seconds, from plan minutes and top-ups; ring time and unanswered calls not billed',
    plans: VOICE_PLANS.map(plan => ({ ...plan, features: [...plan.features], supportChannels: [...plan.supportChannels] })),
    payAsYouGo: { ...VOICE_PAYG, monthlyPlanOnlyFeatures: [...VOICE_PAYG.monthlyPlanOnlyFeatures] },
    planFeatures: Object.fromEntries(Object.entries(VOICE_PLAN_FEATURES).map(([k, v]) => [k, [...v]])),
    faqs: VOICE_FAQS.map(f => ({ ...f })),
    updatedAt,
  };
}

/**
 * BrandiQue's four core services (mirrors the website's services, nav and enquiry form).
 * Stored as settings/services-catalog; names match CORE_SERVICES used for lead/enquiry filters.
 */
export const SERVICES_CATALOG = [
  { id: 'web', service: 'Web Development', path: '/web-development', startingFrom: '₹9,000' },
  { id: 'ai', service: 'AI Agents & Automations', path: '/services/ai-automation', startingFrom: '₹12,000' },
  { id: 'design', service: 'Graphic Design', path: '/services/graphic-design', startingFrom: '₹4,500' },
  { id: 'voice', service: 'Voice Calling AI Agents', path: '/services/voice-ai-agents', startingFrom: '₹2,799/month (317 mins) or pay as you go from ₹2,848; ₹1,999 one-time setup; + 18% GST' },
] as const;

export function servicesCatalogRecord(updatedAt: string) {
  return { services: SERVICES_CATALOG.map(s => ({ ...s })), count: SERVICES_CATALOG.length, updatedAt };
}
