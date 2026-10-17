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
  mostPopular: boolean;
}

/** One-time setup fee for a voice calling agent (INR). Charged once. */
export const VOICE_SETUP_FEE_INR = 1999;
/** GST added at checkout on every voice price (percent). */
export const VOICE_GST_PERCENT = 18;

export const VOICE_PLANS: VoicePlan[] = [
  {
    id: 'voice-starter', name: 'Starter', tagline: 'For your first live voice agent.', priceInr: 2799, billingPeriod: 'month',
    includedMinutes: 317, effectiveRatePerMinuteInr: 8.83, teamMembers: 2, knowledgeBaseMb: 10, includes: 'Everything in Free',
    features: ['Voice cloning', 'WhatsApp', 'SIP trunking'], workflowRunsPerMonth: 0, mostPopular: false,
  },
  {
    id: 'voice-pro', name: 'Pro', tagline: 'For teams running a live pilot.', priceInr: 6999, billingPeriod: 'month',
    includedMinutes: 1000, effectiveRatePerMinuteInr: 7, teamMembers: 5, knowledgeBaseMb: 50, includes: 'Everything in Starter',
    features: ['Live call monitoring', 'Voicemail detection', 'Agent versioning', 'Workflow builder (10,000 runs/mo)'], workflowRunsPerMonth: 10000, mostPopular: true,
  },
  {
    id: 'voice-growth', name: 'Growth', tagline: 'For teams scaling past the pilot.', priceInr: 22999, billingPeriod: 'month',
    includedMinutes: 3571, effectiveRatePerMinuteInr: 6.44, teamMembers: 10, knowledgeBaseMb: 100, includes: 'Everything in Pro',
    features: ['Recording insights', 'Email channel', 'SMS channel', 'Workflow builder (100,000 runs/mo)'], workflowRunsPerMonth: 100000, mostPopular: false,
  },
];

/** Pay-as-you-go minute top-ups, available on any plan. Base voice agent features only. */
export const VOICE_PAYG = {
  ratePerMinuteInr: 8.9,
  minMinutes: 320,
  minTopUpInr: 2848,
  discountThresholdInr: 7000,
  discountRatePerMinuteInr: 8.47,
  bonusMinutesPercent: 2,
  monthlyPlanOnlyFeatures: ['Voice cloning', 'SIP trunking', 'WhatsApp', 'Voicemail detection'],
};

/** Pay-as-you-go price for a number of minutes (INR, excl. GST): ₹8.90/min, or ₹8.47/min + 2% bonus when the top-up is ₹7,000+. */
export function paygQuote(rawMinutes: number) {
  const minutes = Math.max(VOICE_PAYG.minMinutes, Math.round(rawMinutes));
  const discounted = minutes * VOICE_PAYG.discountRatePerMinuteInr >= VOICE_PAYG.discountThresholdInr;
  const rate = discounted ? VOICE_PAYG.discountRatePerMinuteInr : VOICE_PAYG.ratePerMinuteInr;
  const amountInr = Math.round(minutes * rate);
  const bonusMinutes = discounted ? Math.floor((minutes * VOICE_PAYG.bonusMinutesPercent) / 100) : 0;
  return { minutes, rate, amountInr, bonusMinutes, totalMinutes: minutes + bonusMinutes, discounted };
}

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
    plans: VOICE_PLANS.map(plan => ({ ...plan, features: [...plan.features] })),
    payAsYouGo: { ...VOICE_PAYG, monthlyPlanOnlyFeatures: [...VOICE_PAYG.monthlyPlanOnlyFeatures] },
    updatedAt,
  };
}
