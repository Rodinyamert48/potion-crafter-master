import { describe, expect, it } from 'vitest';
import { BrewSim } from './brewSim';
import { RECIPES } from '../src/data/potions';
import { tempZone } from '../src/gameplay/potion/BrewChemistry';

// Each test brews one recipe the way a player would and checks the outcome.
// These double as balance documentation for the recipe data.

function expectRecipe(sim: BrewSim, id: string, minTier = 1) {
  const r = sim.result();
  const msg = `${sim.describe()}\nwhy(${id}) = ${sim.why(id)}`;
  expect(r.recipeId, msg).toBe(id);
  expect(r.tier, msg).toBeGreaterThanOrEqual(minTier);
  return r;
}

describe('temperature model', () => {
  it('heats a bucket of water to a simmer and boils with the bellows', () => {
    const sim = new BrewSim().water(2).fire(1);
    sim.run(15);
    expect(sim.chem.temperature).toBeGreaterThan(60);
    sim.run(60);
    const eq = sim.chem.temperature;
    expect(eq).toBeGreaterThan(98);
    expect(eq).toBeLessThan(125);
    sim.fire(1.8);
    let peak = 0;
    for (let i = 0; i < 40; i++) {
      sim.run(0.5);
      peak = Math.max(peak, sim.chem.temperature);
    }
    expect(tempZone(peak)).toBe('danger');
  });

  it('more water means slower heating', () => {
    const a = new BrewSim().water(2).fire(1).run(10);
    const b = new BrewSim().water(6).fire(1).run(10);
    expect(a.chem.temperature).toBeGreaterThan(b.chem.temperature + 8);
  });

  it('adding cold water cools the brew', () => {
    const sim = new BrewSim().water(2).fire(1).run(40);
    const before = sim.chem.temperature;
    sim.water(2);
    expect(sim.chem.temperature).toBeLessThan(before - 20);
  });
});

describe('recipes are reachable', () => {
  it('Healing Potion: sliced mushroom, warm, gentle stir', () => {
    const sim = new BrewSim().water(2).fire(0.55).heatTo(45).addPieces('glowing_mushroom', 'sliced', 1, 3).stirAt(1.5).run(50);
    expectRecipe(sim, 'healing_potion', 2);
  });

  it('two mushrooms make a stronger Healing Potion', () => {
    const sim = new BrewSim().water(2).fire(0.55).heatTo(45).addPieces('glowing_mushroom', 'sliced', 2, 3).stirAt(1.5).run(60);
    expectRecipe(sim, 'healing_potion', 3);
  });

  it('Greater Healing: the tutorial scenario (mushroom → heat → dragon scale → stir)', () => {
    const sim = new BrewSim().water(2).addPieces('glowing_mushroom', 'sliced', 1, 3);
    sim.fire(1).heatTo(80);
    sim.add('dragon_scale', 'whole').fire(0.75).run(12).stirAt(1.6).run(40);
    const r = expectRecipe(sim, 'greater_healing', 2);
    expect(r.tier).toBeGreaterThanOrEqual(3);
  });

  it('Fire Healing: dragon scale first, then mushroom at high heat', () => {
    const sim = new BrewSim().water(2).fire(1).heatTo(90).add('dragon_scale', 'ground').run(8);
    sim.addPieces('glowing_mushroom', 'sliced', 1, 3).stirAt(1.5).run(40);
    expectRecipe(sim, 'fire_healing', 3);
  });

  it('Weak Regeneration: mushroom then dragon scale at low heat', () => {
    const sim = new BrewSim().water(2).fire(0.35).addPieces('glowing_mushroom', 'sliced', 1, 3).run(20);
    sim.add('dragon_scale', 'ground').stirAt(1.2).run(40);
    expectRecipe(sim, 'weak_regeneration');
  });

  it('Scorched Remedy: mushroom boiled hard without fire', () => {
    const sim = new BrewSim().water(2).fire(1).addPieces('glowing_mushroom', 'sliced', 1, 3).stirAt(1.2).run(70);
    expectRecipe(sim, 'scorched_remedy');
  });

  it('Strength Potion: crushed dragon scale, hot', () => {
    const sim = new BrewSim().water(2).fire(0.95).heatTo(85).add('dragon_scale', 'shards', 3, 1 / 3).stirAt(1.5).run(60);
    expectRecipe(sim, 'strength', 2);
  });

  it("Dragon's Breath: dragon scale boiled dangerously hot", () => {
    const sim = new BrewSim().water(2).fire(1.15).heatTo(117).add('dragon_scale', 'ground').stirAt(1.5).run(25);
    expectRecipe(sim, 'dragons_breath');
  });

  it('Night Vision: dried bat wing + mushroom, warm, gentle', () => {
    const sim = new BrewSim().water(2).fire(0.5).heatTo(55);
    sim.add('bat_wing', 'dried').addPieces('glowing_mushroom', 'sliced', 1, 3).stirAt(1.4).run(70);
    expectRecipe(sim, 'night_vision', 2);
  });

  it('fresh bat wings spoil Night Vision with poison', () => {
    const sim = new BrewSim().water(2).fire(0.5).heatTo(55);
    sim.add('bat_wing', 'whole').addPieces('glowing_mushroom', 'sliced', 1, 3).stirAt(1.4).run(70);
    expect(sim.result().recipeId).not.toBe('night_vision');
  });

  it('Shadow Draught: dried bat wings', () => {
    const sim = new BrewSim().water(2).fire(0.5).heatTo(50).add('bat_wing', 'ground', 2).stirAt(1.3).run(40);
    expectRecipe(sim, 'shadow_draught', 2);
  });

  it('Nightshade Poison: fresh bat wings, boiled', () => {
    const sim = new BrewSim().water(2).fire(0.9).heatTo(80).add('bat_wing', 'strips', 6, 1 / 3).stirAt(1.3).run(50);
    expectRecipe(sim, 'nightshade_poison');
  });

  it('Luminous Tonic: dried mushrooms', () => {
    const sim = new BrewSim().water(2).fire(0.5).heatTo(50).add('glowing_mushroom', 'dried', 2).stirAt(1.3).run(70);
    expectRecipe(sim, 'luminous_tonic');
  });

  it('Swiftness: fire and shadow whipped at a boil', () => {
    const sim = new BrewSim().water(2).fire(1.1).heatTo(100).add('dragon_scale', 'ground').add('bat_wing', 'ground');
    sim.stirAt(4.5).run(35).stirAt(1.4).run(12);
    expectRecipe(sim, 'swiftness');
  });

  it('Polymorph Brew: shadow first, then light, at a hard boil', () => {
    const sim = new BrewSim().water(2).fire(1.1).heatTo(100).add('bat_wing', 'ground').run(6);
    sim.addPieces('glowing_mushroom', 'sliced', 1, 3).stirAt(1.2).run(40);
    expectRecipe(sim, 'frog_brew');
  });

  it('Black Ruin: shadow poured into a bright, hot brew', () => {
    const sim = new BrewSim().water(2).fire(1.1).heatTo(100).addPieces('glowing_mushroom', 'ground', 1, 1).run(6);
    sim.add('bat_wing', 'ground').stirAt(1.2).run(40);
    expectRecipe(sim, 'black_ruin');
  });

  it('Giant Strength: lots of dragon scale, mushroom magic, hard boil and hard stir', () => {
    const sim = new BrewSim().water(3).fire(1).heatTo(98).add('dragon_scale', 'ground', 2).addPieces('glowing_mushroom', 'sliced', 1, 3);
    // Calm it first, then whip it hard at the end.
    sim.stirAt(1.5).run(25).stirAt(4.4).run(22);
    expectRecipe(sim, 'giant_strength');
  });

  it('Sanguine Tonic: healing + shadow bound by fire above 108°C', () => {
    const sim = new BrewSim().water(2.5).fire(1.05).heatTo(95).add('dragon_scale', 'ground').run(6);
    sim.add('glowing_mushroom', 'ground').add('bat_wing', 'ground', 2).heatTo(110);
    sim.stirAt(1.5).run(45);
    expectRecipe(sim, 'blood_tonic');
  });

  it('Farsight Draught: a whole bog toad eye, warm and calm', () => {
    const sim = new BrewSim().water(2).fire(0.5).heatTo(50).add('bog_toad_eye', 'whole').stirAt(1.4).run(60);
    expectRecipe(sim, 'farsight_draught', 2);
  });

  it('mashing the toad eye sets its madness free (Polymorph Brew)', () => {
    const sim = new BrewSim().water(2).fire(0.5).heatTo(50).add('bog_toad_eye', 'mashed').stirAt(1.4).run(60);
    expectRecipe(sim, 'frog_brew');
  });

  it('a toad eye turns Night Vision into a masterwork', () => {
    const sim = new BrewSim().water(2).fire(0.5).heatTo(55);
    sim.add('bog_toad_eye', 'whole').add('bat_wing', 'dried').addPieces('glowing_mushroom', 'sliced', 1, 3).stirAt(1.4).run(70);
    expectRecipe(sim, 'night_vision', 3);
  });

  it('Plain water is just water', () => {
    const sim = new BrewSim().water(2).fire(0.5).run(20);
    expectRecipe(sim, 'plain_water');
  });

  it('frantic stirring whips up a vortex', () => {
    const sim = new BrewSim().water(2).fire(0.6).heatTo(50).addPieces('glowing_mushroom', 'sliced', 1, 3).stirAt(8.5).run(6);
    expect(sim.vortexes).toBeGreaterThan(0);
  });

  it('overloading the cauldron makes it explode', () => {
    const sim = new BrewSim().water(2).fire(1).heatTo(90).add('dragon_scale', 'whole', 7).run(30);
    expect(sim.exploded).toBe(true);
  });

  it('overheating for long enough makes it explode', () => {
    const sim = new BrewSim().water(3).fire(2.2).add('glowing_mushroom', 'sliced').run(120);
    expect(sim.exploded || sim.chem.water < 0.5).toBe(true);
  });

  it('every recipe has localized names and hints', () => {
    for (const r of RECIPES) {
      expect(r.name.en.length).toBeGreaterThan(0);
      expect(r.name.tr.length).toBeGreaterThan(0);
      expect(r.hint.tr.length).toBeGreaterThan(0);
    }
  });
});

describe('celebrity specials are reachable', () => {
  it("Lâ Peace: dried moon flower + mushroom, warm and perfectly calm", () => {
    const sim = new BrewSim().water(2).fire(0.5).heatTo(45).add('moon_flower', 'dried').addPieces('glowing_mushroom', 'sliced', 1, 3).stirAt(1.2).run(60);
    expectRecipe(sim, 'la_peace', 2);
  });

  it('…but without calm stirring there is no peace', () => {
    const sim = new BrewSim().water(2).fire(0.5).heatTo(45).add('moon_flower', 'dried').addPieces('glowing_mushroom', 'sliced', 1, 3).run(60);
    expect(sim.result().recipeId).not.toBe('la_peace');
  });

  it('Salt Sprinkle: hot dragon scale first, ground frost crystal sprinkled last', () => {
    const sim = new BrewSim().water(2).fire(1).heatTo(90).add('dragon_scale', 'ground').run(10).add('frost_crystal', 'ground').stirAt(1.5).run(30);
    expectRecipe(sim, 'salt_sprinkle', 2);
  });

  it('salt first spoils the Salt Sprinkle', () => {
    const sim = new BrewSim().water(2).fire(1).heatTo(90).add('frost_crystal', 'ground').run(5).add('dragon_scale', 'ground').stirAt(1.5).run(30);
    expect(sim.result().recipeId).not.toBe('salt_sprinkle');
  });

  it('Golden Rain: ground dragon scale + dried mushroom, hot and steady', () => {
    const sim = new BrewSim().water(2).fire(0.8).heatTo(75).add('dragon_scale', 'ground').add('glowing_mushroom', 'dried').stirAt(1.5).run(50);
    expectRecipe(sim, 'gold_rain', 2);
  });

  it('Eyebrow Raise: dragon scale + a whole bog toad eye, hot', () => {
    const sim = new BrewSim().water(2).fire(0.95).heatTo(85).add('dragon_scale', 'shards', 3, 1 / 3).add('bog_toad_eye', 'whole').stirAt(1.5).run(60);
    expectRecipe(sim, 'eyebrow_raise', 2);
  });

  it('Breathtaking: moon flower + frost crystal, kept cool', () => {
    const sim = new BrewSim().water(2).fire(0.3).heatTo(30).add('moon_flower', 'whole').add('frost_crystal', 'whole').stirAt(1.3).run(60);
    expectRecipe(sim, 'breathtaking', 2);
  });

  it('SIUUU: dragon scale + moon flower, boiling hot and stirred hard', () => {
    const sim = new BrewSim().water(2).fire(1).heatTo(90).add('dragon_scale', 'shards', 3, 1 / 3).add('moon_flower', 'whole').stirAt(2.6).run(50);
    expectRecipe(sim, 'siuuu', 2);
  });

  it('…a lazy stir is no SIUUU', () => {
    const sim = new BrewSim().water(2).fire(1).heatTo(90).add('dragon_scale', 'shards', 3, 1 / 3).add('moon_flower', 'whole').stirAt(1.5).run(50);
    expect(sim.result().recipeId).not.toBe('siuuu');
  });

  it('Perfectly Cooked: sliced mushroom + frost crystal at 60–75°C, calm', () => {
    const sim = new BrewSim().water(2).fire(0.65).heatTo(65).addPieces('glowing_mushroom', 'sliced', 1, 3).add('frost_crystal', 'whole').stirAt(1.3).run(60);
    expectRecipe(sim, 'perfect_bite', 2);
  });

  it('…raw (cold) is not perfectly cooked', () => {
    const sim = new BrewSim().water(2).fire(0.3).heatTo(30).addPieces('glowing_mushroom', 'sliced', 1, 3).add('frost_crystal', 'whole').stirAt(1.3).run(60);
    expect(sim.result().recipeId).not.toBe('perfect_bite');
  });

  it('Grumpy Ayran: dried bat wing + frost crystal, ice-cold', () => {
    const sim = new BrewSim().water(2).fire(0.3).heatTo(30).add('bat_wing', 'dried').add('frost_crystal', 'whole').stirAt(1.3).run(60);
    expectRecipe(sim, 'grumpy_ayran', 2);
  });

  it('Giant Portion: 3+ litres, dragon scale + mushroom, simmered', () => {
    const sim = new BrewSim().water(3.5).fire(0.8).heatTo(75).add('dragon_scale', 'ground').addPieces('glowing_mushroom', 'sliced', 1, 3).stirAt(1.5).run(60);
    expectRecipe(sim, 'giant_portion', 2);
  });

  it('What If It Works: lots of water and a mashed mushroom, lukewarm', () => {
    const sim = new BrewSim().water(3.5).fire(0.35).heatTo(35).add('glowing_mushroom', 'mashed').stirAt(1.3).run(60);
    expectRecipe(sim, 'ya_tutarsa', 2);
  });

  it('…a normal amount of water just makes a Healing Potion', () => {
    const sim = new BrewSim().water(2).fire(0.55).heatTo(40).add('glowing_mushroom', 'mashed').stirAt(1.3).run(60);
    expect(sim.result().recipeId).not.toBe('ya_tutarsa');
  });

  it('Anchovy Potion: bog toad eye + frost crystal, cold', () => {
    const sim = new BrewSim().water(2).fire(0.35).heatTo(35).add('bog_toad_eye', 'whole').add('frost_crystal', 'whole').stirAt(1.3).run(60);
    expectRecipe(sim, 'hamsi', 2);
  });

  it('Thick Hair Tonic: dried bat wing + moon flower, warm', () => {
    const sim = new BrewSim().water(2).fire(0.6).heatTo(55).add('bat_wing', 'dried').add('moon_flower', 'whole').stirAt(1.3).run(60);
    expectRecipe(sim, 'thick_hair', 2);
  });
});

// The ladle's stirring modes stir at fixed speeds (see CauldronTools).
const CALM = 1.6;
const STRONG = 4.8;
const WILD = 7.6;

describe('stirring modes give the potions the hints promise', () => {
  it('Calm: Healing Potion', () => {
    const sim = new BrewSim().water(2).fire(0.55).heatTo(45).addPieces('glowing_mushroom', 'sliced', 1, 3).stirAt(CALM).run(50);
    expectRecipe(sim, 'healing_potion', 2);
  });

  it('Calm: Night Vision', () => {
    const sim = new BrewSim().water(2).fire(0.5).heatTo(55).add('bat_wing', 'dried').addPieces('glowing_mushroom', 'sliced', 1, 3).stirAt(CALM).run(70);
    expectRecipe(sim, 'night_vision', 2);
  });

  it('Calm: Lâ Peace stays perfectly still', () => {
    const sim = new BrewSim().water(2).fire(0.5).heatTo(45).add('moon_flower', 'dried').addPieces('glowing_mushroom', 'sliced', 1, 3).stirAt(CALM).run(70);
    expectRecipe(sim, 'la_peace', 2);
  });

  it('Strong: SIUUU', () => {
    const sim = new BrewSim().water(2).fire(1).heatTo(90).add('dragon_scale', 'shards', 3, 1 / 3).add('moon_flower', 'whole').stirAt(STRONG).run(50);
    expectRecipe(sim, 'siuuu', 2);
  });

  it('Strong then Calm: Swiftness', () => {
    const sim = new BrewSim().water(2).fire(1.1).heatTo(100).add('dragon_scale', 'ground').add('bat_wing', 'ground');
    sim.stirAt(STRONG).run(35).stirAt(CALM).run(12);
    expectRecipe(sim, 'swiftness');
  });

  it('Calm then Strong: Giant Strength', () => {
    const sim = new BrewSim().water(3).fire(1).heatTo(98).add('dragon_scale', 'ground', 2).addPieces('glowing_mushroom', 'sliced', 1, 3);
    sim.stirAt(CALM).run(25).stirAt(STRONG).run(25);
    expectRecipe(sim, 'giant_strength');
  });

  it('Strong stirring for a long time does not make a brew unstable', () => {
    const sim = new BrewSim().water(2).fire(0.95).heatTo(85).add('dragon_scale', 'shards', 3, 1 / 3).stirAt(STRONG).run(90);
    expectRecipe(sim, 'strength', 2);
  });

  it('Wild stirring makes it unstable', () => {
    const sim = new BrewSim().water(2).fire(0.55).heatTo(45).addPieces('glowing_mushroom', 'sliced', 1, 3).stirAt(WILD).run(20);
    expect(sim.chem.stability).toBeLessThan(0.3);
  });
});
