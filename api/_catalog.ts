// Voice Calling AI Agents plan catalog (mirrors data/offers.ts + data/services.ts on brandique.in).
// Pricing: a ONE-TIME setup fee of ₹1,999, then ONLY per connected minute: no monthly, per-agent or subscription fee.
// Three voice tiers (Starter / Growth / Premium), each with its own tagline and features.
// Kept here so the console, seed file and tests share one definition.

export interface VoicePlan {
  id: 'voice-starter' | 'voice-growth' | 'voice-premium';
  name: string;
  badge: string;
  ratePerMinuteInr: number;
  tagline: string;
  features: string[];
  mostPopular: boolean;
}

/** One-time setup fee for a voice calling agent (INR). Charged once, never monthly. */
export const VOICE_SETUP_FEE_INR = 1999;

export const VOICE_PLANS: VoicePlan[] = [
  {
    id: 'voice-starter', name: 'Voice Starter', badge: 'Starter', ratePerMinuteInr: 5, mostPopular: false,
    tagline: 'Budget-friendly. Mostly used for bulk calling campaigns.',
    features: ['Native Multilingual', 'Value Voices', 'Low Latency', 'Budget bulk calling'],
  },
  {
    id: 'voice-growth', name: 'Voice Growth', badge: 'Growth', ratePerMinuteInr: 8, mostPopular: true,
    tagline: 'The All-Rounder. High realism for everyday customer interactions and support.',
    features: ['Native Multilingual', 'Standard Voices', 'Low Latency', 'The All-Rounder'],
  },
  {
    id: 'voice-premium', name: 'Voice Premium', badge: 'Premium', ratePerMinuteInr: 11, mostPopular: false,
    tagline: 'Curated native speakers. The most real-like voices from our exclusive library.',
    features: ['Native Multilingual', 'Premium Voices', 'Ultra-low Latency', 'Custom integrations'],
  },
];

/** The service record stored as settings/service-voice-ai-agents (server-only; not publicly readable). */
export function voiceServiceRecord(updatedAt: string) {
  return {
    service: 'Voice Calling AI Agents',
    path: '/services/voice-ai-agents',
    currency: 'INR',
    pricingModel: 'per-connected-minute',
    monthlyFeeInr: 0,
    setupFeeInr: VOICE_SETUP_FEE_INR,
    setupFeeType: 'one-time',
    billing: 'Per second, rounded up to 30 seconds, per connected minute; ring time and unanswered calls not billed',
    plans: VOICE_PLANS.map(plan => ({ ...plan, features: [...plan.features] })),
    updatedAt,
  };
}
