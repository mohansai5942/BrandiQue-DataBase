// Voice Calling AI Agents plan catalog (mirrors data/offers.ts + data/services.ts on brandique.in).
// Every plan has the same features; the plan is the voice tier, which sets voice quality and the
// per-minute rate. Kept here so the console, seed file and tests share one definition.

export const VOICE_AGENT_FEE_INR = 2099;
export const VOICE_AGENT_FEE_PERIOD_DAYS = 30;

export const VOICE_SHARED_FEATURES = [
  'One AI voice agent, live the same day',
  'Dedicated +91 calling line (DLT-registered)',
  '₹500 calling credit on every hire or renewal',
  'Bulk campaigns, up to 20 calls at a time',
  'Native Telugu, switching to English mid-call',
  'Automatic transcripts and call summaries',
  'CRM, webhook and Pabbly Connect integrations',
  'Google Calendar booking mid-call',
  'WhatsApp confirmations and follow-ups',
  '99.9% uptime SLA',
  'No setup fee, no lock-in contract',
] as const;

export interface VoicePlan {
  id: 'voice-starter' | 'voice-growth' | 'voice-premium';
  name: string;
  ratePerMinuteInr: number;
  voiceQuality: string;
  bestFor: string;
}

export const VOICE_PLANS: VoicePlan[] = [
  { id: 'voice-starter', name: 'Voice Starter', ratePerMinuteInr: 5, voiceQuality: 'Budget-friendly', bestFor: 'Day-to-day and high-volume reminder calls' },
  { id: 'voice-growth', name: 'Voice Growth', ratePerMinuteInr: 8, voiceQuality: 'Step up in naturalness', bestFor: 'Great everyday quality' },
  { id: 'voice-premium', name: 'Voice Premium', ratePerMinuteInr: 11, voiceQuality: 'Most lifelike', bestFor: 'Hot new leads, first impressions' },
];

/** The service record stored as settings/service-voice-ai-agents (server-only; not publicly readable). */
export function voiceServiceRecord(updatedAt: string) {
  return {
    service: 'Voice Calling AI Agents',
    path: '/services/voice-ai-agents',
    currency: 'INR',
    agentFee: { amount: VOICE_AGENT_FEE_INR, periodDays: VOICE_AGENT_FEE_PERIOD_DAYS, includedCreditInr: 500 },
    billing: 'Per second, rounded up to 30 seconds, per connected minute; ring time and unanswered calls not billed',
    plans: VOICE_PLANS.map(plan => ({ ...plan, features: [...VOICE_SHARED_FEATURES] })),
    updatedAt,
  };
}
