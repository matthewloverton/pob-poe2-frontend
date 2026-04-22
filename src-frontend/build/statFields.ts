// Declarative sidebar layout. Each panel has a "headline" group (always shown
// when the panel is open) and an "expanded" group (revealed on chevron click).
// Row-level and panel-level hide rules keep the UI empty when the numbers are
// meaningless (all zero, or only present for specific archetypes).

export type Fmt =
  | "int"        // rounded, locale-grouped
  | "dec"        // 1 decimal
  | "dec2"       // 2 decimals
  | "res"        // signed % (resists)
  | "pct"        // unsigned % (already 0..100)
  | "pctFrac"    // fraction-as-% (0.52 → 52%)
  | "x"          // multiplier (1.48x)
  | "sec"        // "1.2s"
  | "plain";     // string/boolean as-is

export interface Row {
  key: string;
  label: string;
  fmt: Fmt;
  accent?: string;
  /** Hide row when value is 0/absent. Default true. */
  hideIfZero?: boolean;
  /** Hide row when value equals this exact number (for noisy constants). */
  hideIfEqual?: number;
  /** Optional second key rendered as a dim "(+N)" suffix (for overcap etc). */
  suffixKey?: string;
  suffixFmt?: Fmt;
  /** Hide the suffix when its value is 0. Default true. */
  suffixHideIfZero?: boolean;
  /** Render as "value/fractionValue" (for charges: "current/max"). Row is
   *  visible as long as either side is nonzero. */
  fractionKey?: string;
}

export interface Panel {
  id: string;
  title: string;
  /** Which column in 2-col mode. Default "left". */
  column?: "left" | "right";
  headline?: Row[];
  expanded?: Row[];
  /** Hide the whole panel when every row would hide. Default true. */
  hideIfEmpty?: boolean;
  /** Panel starts expanded. Default false. */
  defaultExpanded?: boolean;
}

const PHYS = "text-fg";
const FIRE = "text-red-400";
const COLD = "text-cyan-400";
const LIGHT = "text-yellow-400";
const CHAOS = "text-purple-500";
const LIFE = "text-red-400";
const ES = "text-cyan-400";
const MANA = "text-blue-400";
const SPIRIT = "text-yellow-400";
const EVA = "text-green-400";

export const PANELS: Panel[] = [
  {
    id: "offence",
    title: "Offence",
    column: "left",
    defaultExpanded: true,
    headline: [
      { key: "TotalDPS", label: "Total DPS", fmt: "int" },
      { key: "CombinedDPS", label: "Combined DPS", fmt: "int" },
      { key: "AverageDamage", label: "Avg Damage", fmt: "dec" },
      { key: "Speed", label: "Attack/Cast Rate", fmt: "dec2" },
      { key: "HitChance", label: "Hit Chance", fmt: "pct" },
    ],
    expanded: [
      { key: "FullDPS", label: "Full DPS", fmt: "int" },
      { key: "TotalDotDPS", label: "Total DoT DPS", fmt: "int" },
      { key: "ReservationDPS", label: "Reservation DPS", fmt: "int" },
      { key: "CullingDPS", label: "Culling DPS", fmt: "int" },
      { key: "AccuracyHitChance", label: "Accuracy Hit", fmt: "pct" },
      { key: "AreaOfEffectRadiusMetres", label: "AoE Radius", fmt: "dec", accent: "text-fg-muted" },
      { key: "DurationMod", label: "Skill Duration", fmt: "x" },
      { key: "PhysicalStoredCombinedAvg", label: "Phys Avg Hit", fmt: "int" },
      { key: "FireStoredCombinedAvg", label: "Fire Avg Hit", fmt: "int", accent: FIRE },
      { key: "ColdStoredCombinedAvg", label: "Cold Avg Hit", fmt: "int", accent: COLD },
      { key: "LightningStoredCombinedAvg", label: "Lightning Avg Hit", fmt: "int", accent: LIGHT },
      { key: "ChaosStoredCombinedAvg", label: "Chaos Avg Hit", fmt: "int", accent: CHAOS },
      { key: "PhysicalEnemyPen", label: "Phys Pen", fmt: "pct" },
      { key: "FireEnemyPen", label: "Fire Pen", fmt: "pct", accent: FIRE },
      { key: "ColdEnemyPen", label: "Cold Pen", fmt: "pct", accent: COLD },
      { key: "LightningEnemyPen", label: "Lightning Pen", fmt: "pct", accent: LIGHT },
      { key: "ChaosEnemyPen", label: "Chaos Pen", fmt: "pct", accent: CHAOS },
      { key: "WithBleedDPS", label: "With Bleed", fmt: "int" },
      { key: "WithIgniteDPS", label: "With Ignite", fmt: "int", accent: FIRE },
      { key: "WithPoisonDPS", label: "With Poison", fmt: "int", accent: CHAOS },
    ],
  },

  {
    id: "crit",
    title: "Crit",
    column: "left",
    headline: [
      { key: "CritChance", label: "Crit Chance", fmt: "pct" },
      { key: "CritMultiplier", label: "Crit Multi", fmt: "x" },
    ],
    expanded: [
      { key: "PreEffectiveCritChance", label: "Base Crit", fmt: "pct" },
      { key: "PreEffectiveCritMultiplier", label: "Base Multi", fmt: "x" },
      { key: "CritEffect", label: "Crit Effect", fmt: "x" },
      { key: "CritBifurcates", label: "Crit Bifurcates", fmt: "dec" },
      { key: "IgniteChanceOnCrit", label: "Ignite/Crit", fmt: "pct", accent: FIRE },
      { key: "ShockChanceOnCrit", label: "Shock/Crit", fmt: "pct", accent: LIGHT },
    ],
  },

  {
    id: "ailments",
    title: "Ailments",
    column: "left",
    expanded: [
      { key: "IgniteChance", label: "Ignite Chance", fmt: "pct", accent: FIRE },
      { key: "IgniteDPS", label: "Ignite DPS", fmt: "int", accent: FIRE },
      { key: "IgniteDamage", label: "Ignite Dmg", fmt: "int", accent: FIRE },
      { key: "IgniteDuration", label: "Ignite Dur", fmt: "sec", accent: FIRE },
      { key: "IgniteStacksMax", label: "Ignite Stacks", fmt: "int", accent: FIRE },
      { key: "ShockChance", label: "Shock Chance", fmt: "pct", accent: LIGHT },
      { key: "ShockEffectMod", label: "Shock Magnitude", fmt: "x", accent: LIGHT },
      { key: "ShockDuration", label: "Shock Dur", fmt: "sec", accent: LIGHT },
      { key: "MaximumShock", label: "Max Shock", fmt: "pct", accent: LIGHT },
      { key: "ChillEffectMod", label: "Chill Magnitude", fmt: "x", accent: COLD },
      { key: "ChillDuration", label: "Chill Dur", fmt: "sec", accent: COLD },
      { key: "MaximumChill", label: "Max Chill", fmt: "pct", accent: COLD },
      { key: "FreezeBuildupAvg", label: "Freeze Buildup", fmt: "dec", accent: COLD },
      { key: "FreezeAvoidChance", label: "Freeze Avoid", fmt: "pct", accent: COLD },
      { key: "BleedAvoidChance", label: "Bleed Avoid", fmt: "pct" },
      { key: "HeavyStunBuildupAvg", label: "Heavy Stun", fmt: "dec" },
      { key: "StunThreshold", label: "Stun Threshold", fmt: "int" },
      { key: "StunAvoidChance", label: "Stun Avoid", fmt: "pct" },
      { key: "AilmentThreshold", label: "Ailment Thresh", fmt: "int" },
    ],
  },

  {
    id: "defence",
    title: "Defences",
    column: "right",
    defaultExpanded: true,
    headline: [
      { key: "Life", label: "Total Life", fmt: "int", accent: LIFE },
      { key: "LifeUnreserved", label: "Unreserved Life", fmt: "int", accent: LIFE },
      { key: "EnergyShield", label: "Energy Shield", fmt: "int", accent: ES },
      { key: "Ward", label: "Ward", fmt: "int" },
      { key: "Armour", label: "Armour", fmt: "int" },
      { key: "Evasion", label: "Evasion Rating", fmt: "int", accent: EVA },
    ],
    expanded: [
      { key: "LifeRegenRecovery", label: "Life Regen", fmt: "dec", accent: LIFE },
      { key: "LifeLeechRate", label: "Life Leech /s", fmt: "int", accent: LIFE },
      { key: "LifeOnHit", label: "Life on Hit", fmt: "int", accent: LIFE },
      { key: "LifeOnKill", label: "Life on Kill", fmt: "int", accent: LIFE },
      { key: "LifeRecoup", label: "Life Recoup", fmt: "pct", accent: LIFE },
      { key: "LifeFlaskRecovery", label: "Flask Recovery", fmt: "int", accent: LIFE },
      { key: "LifeReserved", label: "Life Reserved", fmt: "int", accent: LIFE },
      { key: "LifeDegen", label: "Life Degen", fmt: "int", accent: LIFE },
      { key: "EnergyShieldRegenRecovery", label: "ES Regen", fmt: "dec", accent: ES },
      { key: "EnergyShieldRecharge", label: "ES Recharge", fmt: "int", accent: ES },
      { key: "EnergyShieldRechargeDelay", label: "ES Recharge Delay", fmt: "sec", accent: ES },
      { key: "EnergyShieldLeechRate", label: "ES Leech /s", fmt: "int", accent: ES },
      { key: "EnergyShieldRecoup", label: "ES Recoup", fmt: "pct", accent: ES },
      { key: "EnergyShieldRecoveryRateMod", label: "ES Recovery Rate", fmt: "x", accent: ES },
    ],
  },

  {
    id: "mana",
    title: "Mana",
    column: "left",
    headline: [
      { key: "Mana", label: "Mana", fmt: "int", accent: MANA },
      { key: "ManaUnreserved", label: "Unreserved", fmt: "int", accent: MANA },
      { key: "ManaRegenRecovery", label: "Regen", fmt: "dec" },
    ],
    expanded: [
      { key: "ManaReserved", label: "Reserved", fmt: "int" },
      { key: "ManaLeechRate", label: "Leech /s", fmt: "int" },
      { key: "ManaCost", label: "Skill Cost", fmt: "int" },
      { key: "ManaDegen", label: "Degen", fmt: "int" },
    ],
  },

  {
    id: "spirit",
    title: "Spirit",
    column: "left",
    headline: [
      { key: "Spirit", label: "Spirit", fmt: "int", accent: SPIRIT },
      { key: "SpiritUnreserved", label: "Unreserved", fmt: "int", accent: SPIRIT },
    ],
    expanded: [
      { key: "SpiritReserved", label: "Reserved", fmt: "int" },
      { key: "SpiritReservedPercent", label: "Reserved %", fmt: "pct" },
    ],
  },

  {
    id: "rage",
    title: "Rage",
    column: "left",
    headline: [
      { key: "Rage", label: "Rage", fmt: "int" },
      { key: "MaximumRage", label: "Max Rage", fmt: "int" },
    ],
    expanded: [
      { key: "InherentRageLoss", label: "Rage Loss", fmt: "int" },
    ],
  },

  {
    id: "damage-reduction",
    title: "Damage Reduction",
    column: "right",
    defaultExpanded: true,
    headline: [
      { key: "PhysicalDamageReduction", label: "Physical", fmt: "pct" },
      { key: "FireDamageReduction", label: "Fire", fmt: "pct", accent: FIRE },
      { key: "ColdDamageReduction", label: "Cold", fmt: "pct", accent: COLD },
      { key: "LightningDamageReduction", label: "Lightning", fmt: "pct", accent: LIGHT },
      { key: "ChaosDamageReduction", label: "Chaos", fmt: "pct", accent: CHAOS },
    ],
  },

  {
    id: "avoidance",
    title: "Avoidance",
    column: "right",
    headline: [
      { key: "BlockChance", label: "Block Chance", fmt: "pct" },
      { key: "SpellBlockChance", label: "Spell Block", fmt: "pct" },
      { key: "EvadeChance", label: "Evade Chance", fmt: "pct", accent: EVA },
      { key: "ProjectileEvadeChance", label: "Projectile Evade", fmt: "pct", accent: EVA },
      { key: "SpellSuppressionChance", label: "Spell Suppression", fmt: "pct" },
      { key: "AttackDodgeChance", label: "Attack Dodge", fmt: "pct" },
      { key: "SpellDodgeChance", label: "Spell Dodge", fmt: "pct" },
    ],
  },

  {
    id: "movement",
    title: "Movement",
    column: "right",
    defaultExpanded: true,
    headline: [
      { key: "MovementSpeedMod", label: "Move Speed", fmt: "x" },
      { key: "ActionSpeedMod", label: "Action Speed", fmt: "x", hideIfEqual: 1 },
      { key: "WeaponSwapSpeedMod", label: "Weapon Swap", fmt: "x", hideIfEqual: 1 },
    ],
  },

  {
    id: "resists",
    title: "Resistances",
    column: "right",
    defaultExpanded: true,
    headline: [
      { key: "FireResistTotal", label: "Fire Resistance", fmt: "res", accent: FIRE, suffixKey: "FireResistOverCap", suffixFmt: "res" },
      { key: "ColdResistTotal", label: "Cold Resistance", fmt: "res", accent: COLD, suffixKey: "ColdResistOverCap", suffixFmt: "res" },
      { key: "LightningResistTotal", label: "Lightning Resistance", fmt: "res", accent: LIGHT, suffixKey: "LightningResistOverCap", suffixFmt: "res" },
      { key: "ChaosResistTotal", label: "Chaos Resistance", fmt: "res", accent: CHAOS, suffixKey: "ChaosResistOverCap", suffixFmt: "res" },
    ],
  },

  {
    id: "maxhit",
    title: "Max Hit Taken",
    column: "right",
    defaultExpanded: true,
    headline: [
      { key: "PhysicalMaximumHitTaken", label: "Physical", fmt: "int" },
      { key: "FireMaximumHitTaken", label: "Fire", fmt: "int", accent: FIRE },
      { key: "ColdMaximumHitTaken", label: "Cold", fmt: "int", accent: COLD },
      { key: "LightningMaximumHitTaken", label: "Lightning", fmt: "int", accent: LIGHT },
      { key: "ChaosMaximumHitTaken", label: "Chaos", fmt: "int", accent: CHAOS },
    ],
    expanded: [
      { key: "SecondMinimalMaximumHitTaken", label: "2nd Smallest", fmt: "int" },
      { key: "EHPSurvivalTime", label: "Survival Time", fmt: "sec" },
      { key: "PhysicalDotEHP", label: "Phys DoT EHP", fmt: "int" },
      { key: "FireDotEHP", label: "Fire DoT EHP", fmt: "int", accent: FIRE },
      { key: "ColdDotEHP", label: "Cold DoT EHP", fmt: "int", accent: COLD },
      { key: "LightningDotEHP", label: "Lightning DoT EHP", fmt: "int", accent: LIGHT },
      { key: "ChaosDotEHP", label: "Chaos DoT EHP", fmt: "int", accent: CHAOS },
    ],
  },

  {
    id: "charges",
    title: "Charges",
    column: "right",
    expanded: [
      { key: "EnduranceCharges", label: "Endurance", fmt: "int", fractionKey: "EnduranceChargesMax" },
      { key: "FrenzyCharges", label: "Frenzy", fmt: "int", fractionKey: "FrenzyChargesMax" },
      { key: "PowerCharges", label: "Power", fmt: "int", fractionKey: "PowerChargesMax" },
      { key: "BloodCharges", label: "Blood", fmt: "int", fractionKey: "BloodChargesMax" },
      { key: "InspirationCharges", label: "Inspiration", fmt: "int", fractionKey: "InspirationChargesMax" },
      { key: "AbsorptionCharges", label: "Absorption", fmt: "int" },
      { key: "AfflictionCharges", label: "Affliction", fmt: "int" },
      { key: "BlitzCharges", label: "Blitz", fmt: "int" },
      { key: "BrutalCharges", label: "Brutal", fmt: "int" },
      { key: "ChallengerCharges", label: "Challenger", fmt: "int" },
      { key: "SiphoningCharges", label: "Siphoning", fmt: "int" },
      { key: "SpiritCharges", label: "Spirit Charges", fmt: "int" },
      { key: "CrabBarriers", label: "Crab Barriers", fmt: "int" },
      { key: "GhostShrouds", label: "Ghost Shrouds", fmt: "int" },
      { key: "WarcryPower", label: "Warcry Power", fmt: "int" },
    ],
  },

  {
    id: "minions",
    title: "Minions & Allies",
    column: "right",
    expanded: [
      { key: "SummonedMinionsPerCast", label: "Minions/Cast", fmt: "int" },
      { key: "MinionRevivalSpeed", label: "Revival Speed", fmt: "x" },
      { key: "RallyingHitEffect", label: "Rally Effect", fmt: "x" },
      { key: "SpectreAllyDamageMitigation", label: "Spectre Mitig", fmt: "pct" },
      { key: "TotemAllyDamageMitigation", label: "Totem Mitig", fmt: "pct" },
      { key: "WolfLimit", label: "Wolf Limit", fmt: "int" },
    ],
  },

  {
    id: "misc",
    title: "Misc",
    column: "right",
    expanded: [
      { key: "EffectiveLootRarityMod", label: "Rarity", fmt: "x" },
      { key: "LightRadiusMod", label: "Light Radius", fmt: "x", hideIfEqual: 1 },
      { key: "PresenceRadiusMetres", label: "Presence", fmt: "dec" },
      { key: "GemLevel", label: "Gem Level", fmt: "int" },
      { key: "CurseEffectOnSelf", label: "Curse on Self", fmt: "pct", hideIfEqual: 100 },
    ],
  },
];

// Flat whitelist used by the Lua payload. Kept in sync with the panels above
// plus a few headline fields already consumed outside the panel system
// (hero block, attributes row, main-hit breakdown the defence snapshot reads).
export const STAT_WHITELIST: string[] = Array.from(
  new Set(
    [
      // Attributes row
      "Str", "Dex", "Int", "TotalAttr",
      // Hero block + already-wired snapshots
      "CombinedDPS", "TotalEHP",
      "PhysicalMaximumHitTaken", "FireMaximumHitTaken", "ColdMaximumHitTaken",
      "LightningMaximumHitTaken", "ChaosMaximumHitTaken",
      // Everything referenced by any panel
      ...PANELS.flatMap((p) => [...(p.headline ?? []), ...(p.expanded ?? [])].map((r) => r.key)),
    ],
  ),
);
