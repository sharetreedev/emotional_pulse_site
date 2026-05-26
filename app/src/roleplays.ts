export type Roleplay = {
  slug: string
  name: string
  subtitle: string
  description: string
  agentId: string
}

export const ROLEPLAYS: Roleplay[] = [
  {
    slug: 'mhfr-coach',
    name: 'MHFR Roleplay Coach',
    subtitle: 'Choose your character',
    description:
      'A coach welcomes you, lets you choose one of four colleagues (Alex, Sam, Riley, Jordan) and an intensity level, then drops you straight into the scenario. Debrief covers the full LIFT framework against 14 criteria.',
    agentId: 'agent_6801krd6b6ajfe89m736hty4kqsn',
  },
  {
    slug: 'listening-mhfr',
    name: 'Listening MHFR Program',
    subtitle: 'Randomised scenario',
    description:
      'A random colleague — Nina, Alex, Daniel, or Michael — opens up about something heavy. Practise listening, holding space, and supporting without rushing to fix. Includes a structured assessor debrief at the end.',
    agentId: 'agent_5301kk090k3qfb3a4tpbdtkavmpq',
  },
]

export function findRoleplayBySlug(slug: string | null): Roleplay {
  if (!slug) return ROLEPLAYS[0]
  return ROLEPLAYS.find((r) => r.slug === slug) ?? ROLEPLAYS[0]
}
