import type { CharacterClassId } from './CharacterClasses';

/** 3 permanent branches per class. One point per node; choices are not freely reversible. */
export interface PassiveEffects {
  attack?: number;
  spell?: number;
  armor?: number;
  health?: number;
  /** Additive percentage reduction to automatic skill cooldowns (max 30%). */
  cooldownReduction?: number;
}

export interface PassiveNode {
  readonly id: string;
  readonly name: string;
  readonly branch: 'assault' | 'ward' | 'hybrid';
  readonly tier: 1 | 2 | 3 | 4;
  readonly requires: readonly string[];
  readonly effects: PassiveEffects;
  readonly description: string;
}

type ClassTree = readonly PassiveNode[];
const n = (id:string,name:string,branch:PassiveNode['branch'],tier:PassiveNode['tier'],
  requires:readonly string[],effects:PassiveEffects,description:string):PassiveNode =>
  ({id,name,branch,tier,requires,effects,description});

export const PASSIVE_TREES: Readonly<Record<CharacterClassId,ClassTree>> = {
  vanguard: [
    n('v-strike','Iron Grip','assault',1,[],{attack:3},'+3 Attack Power'),
    n('v-tempo','Measured Strikes','assault',2,['v-strike'],{attack:2,cooldownReduction:3},'+2 Attack; auto-skill cooldowns -3%'),
    n('v-edge','Fell Edge','assault',3,['v-tempo'],{attack:5},'+5 Attack Power'),
    n('v-execution','Executioner','assault',4,['v-edge'],{attack:6,cooldownReduction:4},'+6 Attack; auto-skill cooldowns -4%'),
    n('v-fortitude','Stalwart','ward',1,[],{health:6},'+6 Maximum Health'),
    n('v-plating','Reinforced Mail','ward',2,['v-fortitude'],{armor:2},'+2 Armor'),
    n('v-resolve','Last Bastion','ward',3,['v-plating'],{health:10},'+10 Maximum Health'),
    n('v-bulwark','Unbroken','ward',4,['v-resolve'],{armor:3,health:8},'+3 Armor; +8 Maximum Health'),
    n('v-embers','Smoldering Steel','hybrid',1,[],{attack:2,spell:2},'+2 Attack; +2 Spell'),
    n('v-sigil','Battle Runes','hybrid',2,['v-embers'],{spell:3,cooldownReduction:3},'+3 Spell; auto-skill cooldowns -3%'),
    n('v-conduit','Runic Momentum','hybrid',3,['v-sigil'],{attack:3,spell:3},'+3 Attack; +3 Spell'),
    n('v-synthesis','Spellforged','hybrid',4,['v-conduit'],{attack:4,spell:4,cooldownReduction:3},'+4 Attack; +4 Spell; auto-skill cooldowns -3%'),
  ],
  arcanist: [
    n('a-spark','Kindled Mind','assault',1,[],{spell:3},'+3 Spell Power'),
    n('a-focus','Clear Invocation','assault',2,['a-spark'],{spell:2,cooldownReduction:3},'+2 Spell; auto-skill cooldowns -3%'),
    n('a-intensity','High Sorcery','assault',3,['a-focus'],{spell:5},'+5 Spell Power'),
    n('a-archmage','Archmage','assault',4,['a-intensity'],{spell:6,cooldownReduction:4},'+6 Spell; auto-skill cooldowns -4%'),
    n('a-barrier','Ember Ward','ward',1,[],{health:6},'+6 Maximum Health'),
    n('a-shell','Arcane Shell','ward',2,['a-barrier'],{armor:2},'+2 Armor'),
    n('a-aegis','Warding Sigils','ward',3,['a-shell'],{health:10},'+10 Maximum Health'),
    n('a-shelter','Aegis Mastery','ward',4,['a-aegis'],{armor:3,health:8},'+3 Armor; +8 Maximum Health'),
    n('a-blade','Spellblade','hybrid',1,[],{attack:2,spell:2},'+2 Attack; +2 Spell'),
    n('a-rhythm','Battle Cant','hybrid',2,['a-blade'],{attack:3,cooldownReduction:3},'+3 Attack; auto-skill cooldowns -3%'),
    n('a-flow','Arcane Convergence','hybrid',3,['a-rhythm'],{attack:3,spell:3},'+3 Attack; +3 Spell'),
    n('a-union','Twin Disciplines','hybrid',4,['a-flow'],{attack:4,spell:4,cooldownReduction:3},'+4 Attack; +4 Spell; auto-skill cooldowns -3%'),
  ],
};

export type PassiveAllocationLedger = Partial<Record<CharacterClassId,string[]>>;
export type PassiveAllocationResult = 'allocated' | 'unknown' | 'already-allocated' |
  'prerequisite' | 'no-points';

export function isValidPassiveAllocation(
  classId: CharacterClassId, selected: unknown, earned: number,
): selected is string[] {
  if (!Array.isArray(selected) || selected.length > PASSIVE_TREES[classId].length ||
      selected.length > earned || new Set(selected).size !== selected.length) return false;
  const acquired = new Set<string>();
  const tree = PASSIVE_TREES[classId];
  // Stored order is the historical purchase order; no backwards prerequisite grants.
  for (const id of selected) {
    if (typeof id !== 'string') return false;
    const node = tree.find(item => item.id === id);
    if (!node || node.requires.some(required => !acquired.has(required))) return false;
    acquired.add(id);
  }
  return true;
}

export function validAllocationLedger(
  input: unknown, milestones: Partial<Record<CharacterClassId,number[]>>,
): input is PassiveAllocationLedger {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return false;
  const data = input as Record<string,unknown>;
  if (Object.keys(data).some(k => k !== 'vanguard' && k !== 'arcanist')) return false;
  return Object.entries(data).every(([key,selected]) =>
    isValidPassiveAllocation(key as CharacterClassId,selected,milestones[key as CharacterClassId]?.length ?? 0));
}

export function cloneAllocations(ledger: PassiveAllocationLedger): PassiveAllocationLedger {
  return {
    ...(ledger.vanguard ? {vanguard:[...ledger.vanguard]} : {}),
    ...(ledger.arcanist ? {arcanist:[...ledger.arcanist]} : {}),
  };
}

/** Bonuses are applied separately from equipment, so future rebalances do not alter saved items. */
export function passiveEffects(classId:CharacterClassId, ids:readonly string[]):Required<PassiveEffects> {
  const result:Required<PassiveEffects>={attack:0,spell:0,armor:0,health:0,cooldownReduction:0};
  for(const id of ids){
    const node=PASSIVE_TREES[classId].find(x=>x.id===id);
    if(!node)continue;
    result.attack+=node.effects.attack ?? 0;
    result.spell+=node.effects.spell ?? 0;
    result.armor+=node.effects.armor ?? 0;
    result.health+=node.effects.health ?? 0;
    result.cooldownReduction+=node.effects.cooldownReduction ?? 0;
  }
  result.cooldownReduction=Math.min(30,result.cooldownReduction);
  return result;
}

export class PassiveTreeProgress {
  private classId: CharacterClassId;
  private selected: string[];
  private earned: number;

  constructor(classId:CharacterClassId,selected:readonly string[],earned:number){
    if(!isValidPassiveAllocation(classId,[...selected],earned))throw Error('Invalid passive allocation');
    this.classId=classId;this.selected=[...selected];this.earned=earned;
  }
  get characterClass():CharacterClassId{return this.classId;}
  get allocations():readonly string[]{return [...this.selected];}
  get spent():number{return this.selected.length;}
  get available():number{return this.earned-this.spent;}
  get effects():Required<PassiveEffects>{return passiveEffects(this.classId,this.selected);}

  /** Only secured Warden milestones count toward the spendable balance. */
  selectClass(classId:CharacterClassId,selected:readonly string[],earned:number):void{
    if(!isValidPassiveAllocation(classId,[...selected],earned))throw Error('Invalid class passive allocation');
    this.classId=classId;this.selected=[...selected];this.earned=earned;
  }
  tryAllocate(id:string):PassiveAllocationResult{
    const node=PASSIVE_TREES[this.classId].find(n=>n.id===id);
    if(!node)return 'unknown';
    if(this.selected.includes(id))return 'already-allocated';
    if(node.requires.some(required=>!this.selected.includes(required)))return 'prerequisite';
    if(this.available<1)return 'no-points';
    this.selected.push(id);
    return 'allocated';
  }
}
