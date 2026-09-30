// Achievements: data-driven goals checked against the game state. Counters
// for things the state does not track otherwise live in GameState.counters
// (filled in by the Achievements system from game events).

import type { LocalizedText } from '../core/i18n';
import type { GameState } from '../gameplay/GameState';
import { RECIPES } from './potions';
import { REGIONS } from './regions';
import { CUSTOMERS } from './customers';
import { FURNITURE_SLOTS } from './furniture';

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
const TURKISH = ['celeb_recep', 'celeb_burak', 'celeb_nasreddin', 'celeb_temel', 'celeb_keloglan'];
const SECRET_IDS = RECIPES.filter((r) => r.secret).map((r) => r.id);
const SCROLL_IDS = RECIPES.filter((r) => r.scroll).map((r) => r.id);

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
    description: { en: 'Visit all five gathering places.', tr: 'Beş toplama bölgesinin hepsini gez.' },
    icon: 'scroll',
    check: (s) => REGIONS.every((r) => c(s, `region_${r.id}`) > 0),
    progress: (s) => [REGIONS.filter((r) => c(s, `region_${r.id}`) > 0).length, REGIONS.length],
  },
  {
    id: 'open_world',
    name: { en: 'Beyond the Door', tr: 'Kapının Ötesi' },
    description: { en: 'Walk out into the world and come back.', tr: 'Dış dünyaya çık ve geri dön.' },
    icon: 'door',
    check: (s) => c(s, 'outings') >= 1,
  },
  {
    id: 'first_harvest',
    name: { en: 'First Harvest', tr: 'İlk Hasat' },
    description: { en: 'Harvest something you grew in the garden.', tr: 'Bahçede yetiştirdiğin bir şeyi hasat et.' },
    icon: 'sun',
    check: (s) => s.garden.harvests >= 1,
  },
  {
    id: 'green_thumb',
    name: { en: 'Green Thumb', tr: 'Yeşil Parmak' },
    description: { en: 'Harvest 20 times in the garden.', tr: 'Bahçede 20 kez hasat yap.' },
    icon: 'sun',
    check: (s) => s.garden.harvests >= 20,
    progress: (s) => [Math.min(20, s.garden.harvests), 20],
  },
  {
    id: 'wishing_well',
    name: { en: 'Make a Wish', tr: 'Dilek Tut' },
    description: { en: 'Toss a coin into the wishing well at the Moon Shrine.', tr: 'Ay Tapınağı’ndaki dilek kuyusuna para at.' },
    icon: 'moon',
    check: (s) => c(s, 'wishes') >= 1,
  },
  {
    id: 'altar_keeper',
    name: { en: 'Altar Keeper', tr: 'Sunak Bekçisi' },
    description: { en: 'Play the gathering game at 10 altars.', tr: '10 sunakta toplama oyunu oyna.' },
    icon: 'star',
    check: (s) => c(s, 'altars') >= 10,
    progress: (s) => [Math.min(10, c(s, 'altars')), 10],
  },
  {
    id: 'dragon_woke',
    name: { en: 'Let Sleeping Dragons Lie', tr: 'Uyuyan Ejderhayı Uyandırma' },
    description: { en: 'Wake the dragon in Dragon Valley.', tr: 'Ejderha Vadisi’ndeki ejderhayı uyandır.' },
    icon: 'star',
    secret: true,
    check: (s) => c(s, 'dragon_woke') >= 1,
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
    description: { en: 'Serve every famous guest the potion they came for.', tr: 'Bütün ünlü konuklara istedikleri iksiri ver.' },
    icon: 'star',
    check: (s) => CELEBS.every((id) => s.celebsServed.includes(id)),
    progress: (s) => [s.celebsServed.filter((id) => CELEBS.includes(id)).length, CELEBS.length],
  },
];

ACHIEVEMENTS.push(
  {
    id: 'secret_student',
    name: { en: 'Secret Student', tr: 'Gizli Öğrenci' },
    description: { en: 'Learn a secret recipe from the wandering merchant.', tr: 'Gezgin tüccardan bir gizli tarif öğren.' },
    icon: 'book',
    check: (s) => c(s, 'recipesLearned') >= 1,
  },
  {
    id: 'old_scroll',
    name: { en: 'Scroll Finder', tr: 'Parşömen Avcısı' },
    description: { en: 'Find a recipe scroll hidden out in the world.', tr: 'Dışarıda gizlenmiş bir tarif parşömeni bul.' },
    icon: 'scroll',
    check: (s) => c(s, 'scrolls') >= 1,
  },
  {
    id: 'scroll_hunter',
    name: { en: 'Lost Knowledge', tr: 'Kayıp Bilgi' },
    description: { en: 'Find all five hidden recipe scrolls.', tr: 'Gizli beş tarif parşömeninin hepsini bul.' },
    icon: 'scroll',
    check: (s) => SCROLL_IDS.every((id) => s.knowsRecipe(id)),
    progress: (s) => [SCROLL_IDS.filter((id) => s.knowsRecipe(id)).length, SCROLL_IDS.length],
  },
  {
    id: 'wolf_day',
    name: { en: 'Dances with Wolves', tr: 'Kurtlarla Dans' },
    description: { en: 'Go outside on a day the wolves roam.', tr: 'Kurtların dolaştığı bir günde dışarı çık.' },
    icon: 'moon',
    check: (s) => c(s, 'wolfOutings') >= 1,
  },
  {
    id: 'dragon_egg',
    name: { en: 'Dragon Egg', tr: 'Ejderha Yumurtası' },
    description: { en: 'Find a dragon egg in Dragon Valley.', tr: 'Ejderha Vadisi’nde bir ejderha yumurtası bul.' },
    icon: 'egg',
    check: (s) => c(s, 'eggs') >= 1,
  },
  {
    id: 'royal_gift',
    name: { en: 'Fit for a King', tr: 'Krala Layık' },
    description: { en: 'Give the King a dragon egg.', tr: 'Krala bir ejderha yumurtası ver.' },
    icon: 'crown',
    check: (s) => c(s, 'royalGifts') >= 1,
  },
  {
    id: 'all_secrets',
    name: { en: 'Keeper of Secrets', tr: 'Sırların Bekçisi' },
    description: { en: 'Learn every secret recipe.', tr: 'Bütün gizli tarifleri öğren.' },
    icon: 'book',
    check: (s) => SECRET_IDS.every((id) => s.knowsRecipe(id)),
    progress: (s) => [SECRET_IDS.filter((id) => s.knowsRecipe(id)).length, SECRET_IDS.length],
  },
  {
    id: 'decorator',
    name: { en: 'Home Sweet Shop', tr: 'Yuva Gibi Dükkân' },
    description: { en: 'Place a piece of furniture.', tr: 'Bir mobilya yerleştir.' },
    icon: 'gear',
    check: (s) => Object.keys(s.furniture).length >= 1,
  },
  {
    id: 'interior',
    name: { en: 'Interior Wizard', tr: 'İç Mimar Büyücü' },
    description: { en: 'Fill every furniture spot in the shop.', tr: 'Dükkândaki bütün mobilya yerlerini doldur.' },
    icon: 'gear',
    check: (s) => Object.keys(s.furniture).length >= FURNITURE_SLOTS.length,
    progress: (s) => [Object.keys(s.furniture).length, FURNITURE_SLOTS.length],
  },
  {
    id: 'pet_friends',
    name: { en: 'Best Friends', tr: 'Can Dostlar' },
    description: { en: 'Pet the cat, the slime and the dog.', tr: 'Kediyi, balçığı ve köpeği sev.' },
    icon: 'heart',
    check: (s) => c(s, 'catPets') >= 1 && c(s, 'slimePets') >= 1 && c(s, 'dogPets') >= 1,
  },
  {
    id: 'dog_friend',
    name: { en: 'Good Boy!', tr: 'Aferin Oğluma!' },
    description: { en: 'Pet the master’s dog 20 times.', tr: 'Ustanın köpeğini 20 kez sev.' },
    icon: 'heart',
    check: (s) => c(s, 'dogPets') >= 20,
    progress: (s) => [c(s, 'dogPets'), 20],
  },
  {
    id: 'siuuu',
    name: { en: 'SIUUU!', tr: 'SIUUU!' },
    description: { en: 'Make Cristiano Ronaldo celebrate.', tr: 'Cristiano Ronaldo’yu sevince boğ.' },
    icon: 'star',
    secret: true,
    check: (s) => s.celebsServed.includes('celeb_ronaldo'),
  },
  {
    id: 'turkish_legends',
    name: { en: 'Legends of Anatolia', tr: 'Anadolu Efsaneleri' },
    description: { en: 'Serve Recep, Burak, the Hodja, Temel and Keloğlan.', tr: 'Recep, Burak, Hoca, Temel ve Keloğlan’a hizmet et.' },
    icon: 'star',
    check: (s) => TURKISH.every((id) => s.celebsServed.includes(id)),
    progress: (s) => [TURKISH.filter((id) => s.celebsServed.includes(id)).length, TURKISH.length],
  },
  {
    id: 'lucky_clover',
    name: { en: 'Four-Leaf Clover', tr: 'Dört Yapraklı Yonca' },
    description: { en: 'Pure luck: a lucky clover drifted through your shop.', tr: 'Tamamen şans: dükkânından bir şans yoncası süzüldü.' },
    icon: 'star',
    secret: true,
    check: (s) => c(s, 'lucky') >= 1,
  },
  {
    id: 'nobert_caught',
    name: { en: 'Stop, Thief!', tr: 'Dur, Hırsız!' },
    description: { en: 'Catch Nobert the dwarf in the act.', tr: 'Cüce Nobert’i suçüstü yakala.' },
    icon: 'bell',
    secret: true,
    check: (s) => c(s, 'nobertCaught') >= 1,
  },
  {
    id: 'nobert_robbed',
    name: { en: 'Where Did Everything Go?', tr: 'Her Şey Nereye Gitti?' },
    description: { en: 'Get robbed by Nobert.', tr: 'Nobert tarafından soyul.' },
    icon: 'bag',
    secret: true,
    check: (s) => c(s, 'nobertRobbed') >= 1,
  },
);

export const ACHIEVEMENT_MAP: Record<string, AchievementDef> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
