// Achievements: data-driven goals checked against the game state. Counters
// for things the state does not track otherwise live in GameState.counters
// (filled in by the Achievements system from game events).

import type { LocalizedText } from '../core/i18n';
import type { GameState } from '../gameplay/GameState';
import { RECIPES } from './potions';
import { REGIONS } from './regions';
import { CUSTOMERS } from './customers';

export interface AchievementDef {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  /** Pixel icon name (see ui/pixelArt ICONS). */
  icon: string;
  /** Hidden until unlocked. */
  secret?: boolean;
  check: (s: GameState) => boolean;
  /** Optional [current, goal] for a progress bar. */
  progress?: (s: GameState) => [number, number];
}

const c = (s: GameState, k: string) => s.counters[k] ?? 0;
const discoveredPotions = (s: GameState) => RECIPES.filter((r) => r.kind === 'potion' && s.discovered[r.id]).length;
const ALL_POTIONS = RECIPES.filter((r) => r.kind === 'potion').length;
const CELEBS = Object.values(CUSTOMERS).filter((d) => d.celebrity).map((d) => d.id);

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first_potion',
    name: { en: 'First Drop', tr: 'İlk Damla' },
    description: { en: 'Bottle your first potion.', tr: 'İlk iksirini şişele.' },
    icon: 'flask',
    check: (s) => s.stats.brewed >= 1,
  },
  {
    id: 'first_sale',
    name: { en: 'Happy Customer', tr: 'Mutlu Müşteri' },
    description: { en: 'Make a customer happy.', tr: 'Bir müşteriyi mutlu et.' },
    icon: 'heart',
    check: (s) => s.stats.happy >= 1,
  },
  {
    id: 'brew_10',
    name: { en: 'Apprentice Brewer', tr: 'Çırak İksirci' },
    description: { en: 'Bottle 10 potions.', tr: '10 iksir şişele.' },
    icon: 'flask',
    check: (s) => s.stats.brewed >= 10,
    progress: (s) => [s.stats.brewed, 10],
  },
  {
    id: 'brew_50',
    name: { en: 'Master Brewer', tr: 'Usta İksirci' },
    description: { en: 'Bottle 50 potions.', tr: '50 iksir şişele.' },
    icon: 'flask',
    check: (s) => s.stats.brewed >= 50,
    progress: (s) => [s.stats.brewed, 50],
  },
  {
    id: 'masterwork',
    name: { en: 'Masterwork', tr: 'Ustalık Eseri' },
    description: { en: 'Bottle a ★★★★ Masterwork potion.', tr: '★★★★ Ustalık Eseri bir iksir şişele.' },
    icon: 'star',
    check: (s) => c(s, 'masterworks') >= 1,
  },
  {
    id: 'discover_5',
    name: { en: 'Explorer of Recipes', tr: 'Tarif Kâşifi' },
    description: { en: 'Discover 5 different potions.', tr: '5 farklı iksir keşfet.' },
    icon: 'book',
    check: (s) => discoveredPotions(s) >= 5,
    progress: (s) => [discoveredPotions(s), 5],
  },
  {
    id: 'discover_all',
    name: { en: 'The Great Grimoire', tr: 'Büyük Grimuar' },
    description: { en: 'Discover every potion in the book.', tr: 'Kitaptaki bütün iksirleri keşfet.' },
    icon: 'book',
    check: (s) => discoveredPotions(s) >= ALL_POTIONS,
    progress: (s) => [discoveredPotions(s), ALL_POTIONS],
  },
  {
    id: 'kaboom',
    name: { en: 'Kaboom!', tr: 'Kabuum!' },
    description: { en: 'Blow up the cauldron.', tr: 'Kazanı patlat.' },
    icon: 'sun',
    secret: true,
    check: (s) => s.stats.explosions >= 1,
  },
  {
    id: 'frog',
    name: { en: 'Not a Prince', tr: 'Prens Değil' },
    description: { en: 'Turn a customer into a frog.', tr: 'Bir müşteriyi kurbağaya çevir.' },
    icon: 'heart',
    secret: true,
    check: (s) => s.stats.frogs >= 1,
  },
  {
    id: 'frog_cured',
    name: { en: 'Frog Rescuer', tr: 'Kurbağa Kurtarıcı' },
    description: { en: 'Bring a frog back to the master to cure it.', tr: 'Bir kurbağayı ustaya götürüp iyileştir.' },
    icon: 'heart',
    check: (s) => c(s, 'cured') >= 1,
  },
  {
    id: 'gold_500',
    name: { en: 'Full Purse', tr: 'Dolu Kese' },
    description: { en: 'Have 500 gold.', tr: '500 altına sahip ol.' },
    icon: 'coin',
    check: (s) => s.money >= 500,
    progress: (s) => [s.money, 500],
  },
  {
    id: 'gold_2000',
    name: { en: 'Mountain of Gold', tr: 'Altın Dağı' },
    description: { en: 'Have 2000 gold.', tr: '2000 altına sahip ol.' },
    icon: 'coin',
    check: (s) => s.money >= 2000,
    progress: (s) => [s.money, 2000],
  },
  {
    id: 'five_stars',
    name: { en: 'Legendary Shop', tr: 'Efsanevi Dükkân' },
    description: { en: 'Reach five stars of reputation.', tr: 'Beş yıldız itibara ulaş.' },
    icon: 'star',
    check: (s) => s.reputation >= 100,
    progress: (s) => [s.reputation, 100],
  },
  {
    id: 'week',
    name: { en: 'One Week In', tr: 'Bir Hafta Oldu' },
    description: { en: 'Keep the shop running until day 7.', tr: 'Dükkânı 7. güne kadar ayakta tut.' },
    icon: 'sun',
    check: (s) => s.day >= 7,
    progress: (s) => [s.day, 7],
  },
  {
    id: 'month',
    name: { en: 'Old Hand', tr: 'Emektar' },
    description: { en: 'Reach day 30.', tr: '30. güne ulaş.' },
    icon: 'moon',
    check: (s) => s.day >= 30,
    progress: (s) => [s.day, 30],
  },
  {
    id: 'perfect_day',
    name: { en: 'Flawless Day', tr: 'Kusursuz Gün' },
    description: { en: 'End a day with at least 3 customers served, all of them happy.', tr: 'En az 3 müşteriye hizmet edip hepsini mutlu ettiğin bir günü bitir.' },
    icon: 'star',
    check: (s) => c(s, 'perfectDays') >= 1,
  },
  {
    id: 'first_trip',
    name: { en: 'On the Road', tr: 'Yola Düş' },
    description: { en: 'Go on a gathering trip.', tr: 'Bir malzeme toplama gezisine çık.' },
    icon: 'scroll',
    check: (s) => (s.stats.trips ?? 0) >= 1,
  },
  {
    id: 'all_regions',
    name: { en: 'Wanderer', tr: 'Gezgin' },
    description: { en: 'Visit all four gathering regions.', tr: 'Dört toplama bölgesinin hepsini gez.' },
    icon: 'scroll',
    check: (s) => REGIONS.every((r) => c(s, `region_${r.id}`) > 0),
    progress: (s) => [REGIONS.filter((r) => c(s, `region_${r.id}`) > 0).length, REGIONS.length],
  },
  {
    id: 'haggler',
    name: { en: 'Haggler', tr: 'Pazarlıkçı' },
    description: { en: 'Trade with the wandering merchant.', tr: 'Gezgin tüccarla alışveriş yap.' },
    icon: 'bag',
    check: (s) => c(s, 'trades') >= 1,
  },
  {
    id: 'upgrade',
    name: { en: 'Innovator', tr: 'Yenilikçi' },
    description: { en: 'Buy an upgrade or decoration at the market.', tr: 'Pazardan bir geliştirme ya da dekor al.' },
    icon: 'gear',
    check: (s) => s.upgrades.length >= 1,
  },
  {
    id: 'quest',
    name: { en: 'Hero of the Village', tr: 'Köyün Kahramanı' },
    description: { en: 'Complete a quest.', tr: 'Bir görevi tamamla.' },
    icon: 'scroll',
    check: (s) => Object.values(s.quests).some((q) => q.status === 'completed' && q.id !== 'first_brew'),
  },
  {
    id: 'cat_friend',
    name: { en: 'Cat Person', tr: 'Kedi Dostu' },
    description: { en: 'Pet the shop cat 20 times.', tr: 'Dükkân kedisini 20 kez sev.' },
    icon: 'heart',
    check: (s) => c(s, 'catPets') >= 20,
    progress: (s) => [c(s, 'catPets'), 20],
  },
  {
    id: 'cat_style',
    name: { en: 'Fashion Cat', tr: 'Moda Kedisi' },
    description: { en: 'Change the cat’s name, coat or eyes.', tr: 'Kedinin adını, tüyünü ya da gözünü değiştir.' },
    icon: 'heart',
    check: (s) => c(s, 'catStyled') >= 1,
  },
  {
    id: 'crystal',
    name: { en: 'Crystal Light', tr: 'Kristal Işığı' },
    description: { en: 'Save your progress at the crystal.', tr: 'İlerlemeni kristalde kaydet.' },
    icon: 'star',
    check: (s) => c(s, 'crystal') >= 1,
  },
  {
    id: 'celeb_first',
    name: { en: 'Fame at the Door', tr: 'Şöhret Kapıda' },
    description: { en: 'Serve a famous guest the potion they came for.', tr: 'Bir ünlü konuğa istediği iksiri ver.' },
    icon: 'star',
    check: (s) => s.celebsServed.length >= 1,
  },
  {
    id: 'la_peace',
    name: { en: 'Lâ Peace ✌️', tr: 'Lâ Peace ✌️' },
    description: { en: 'Calm IShowSpeed down with his potion.', tr: 'IShowSpeed’i kendi iksiriyle sakinleştir.' },
    icon: 'heart',
    secret: true,
    check: (s) => s.celebsServed.includes('celeb_speed'),
  },
  {
    id: 'celeb_all',
    name: { en: 'Celebrity Club', tr: 'Ünlüler Kulübü' },
    description: { en: 'Serve all five famous guests.', tr: 'Beş ünlü konuğun hepsine hizmet et.' },
    icon: 'star',
    check: (s) => CELEBS.every((id) => s.celebsServed.includes(id)),
    progress: (s) => [s.celebsServed.filter((id) => CELEBS.includes(id)).length, CELEBS.length],
  },
];

export const ACHIEVEMENT_MAP: Record<string, AchievementDef> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
