import { ENEMY_ARCHETYPES, type EnemyArchetype, type EnemyKind } from './EnemyAI';

/**
 * Every deeper floor has its own combat identity while Depth 1 keeps the
 * original brute Warden. Attack markers always use these exact per-agent
 * radii and windups; no invisible or instant boss strikes.
 */
export type WardenVariant = 'warden' | 'ash-reaver' | 'stone-sentinel';
export const WARDEN_VARIANTS: Readonly<Record<WardenVariant, {
  label: string;
  description: string;
  profile: Readonly<EnemyArchetype>;
  healthMultiplier: number;
  color: number;
}>> = {
  warden: {
    label:'Warden', description:'Heavy telegraphed close-range slam',
    profile:ENEMY_ARCHETYPES.brute, healthMultiplier:1, color:0x8c4d6b,
  },
  'ash-reaver': {
    label:'Ash Reaver', description:'Fast chase and short, punishing telegraph',
    profile:{
      ...ENEMY_ARCHETYPES.brute,
      speed:91, attackRange:80, attackRadius:53,
      windupSeconds:0.68, recoverySeconds:1.05, attackDamage:19,
    },
    healthMultiplier:1, color:0xab5539,
  },
  'stone-sentinel': {
    label:'Stone Sentinel', description:'Slow approach and broad, clearly marked slam',
    profile:{
      ...ENEMY_ARCHETYPES.brute,
      speed:51, attackRange:105, attackRadius:93,
      windupSeconds:1.35, recoverySeconds:1.85, attackDamage:29,
    },
    healthMultiplier:1.12, color:0x607e8f,
  },
} as const;

export function wardenForDepth(depth:number):WardenVariant {
  if(!Number.isSafeInteger(depth) || depth<1 || depth>497)
    throw Error('Invalid dungeon depth');
  if(depth===1) return 'warden';
  return depth % 2 === 0 ? 'ash-reaver' : 'stone-sentinel';
}

/** Elite rooms start on Depth 3; each one presents a clearly telegraphed foe. */
export function eliteCombatProfile(kind:EnemyKind):Readonly<EnemyArchetype> {
  const base=ENEMY_ARCHETYPES[kind];
  return {
    ...base,
    speed:Math.round(base.speed*1.12),
    windupSeconds:Math.max(0.35,Math.round((base.windupSeconds-0.08)*100)/100),
    attackDamage:base.attackDamage+5,
    recoverySeconds:Math.max(0.65,base.recoverySeconds-0.12),
  };
}
