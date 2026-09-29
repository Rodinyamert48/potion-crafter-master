# Witch's Brew – Büyülü İksir Dükkânı

Tarayıcıda çalışan, fizik tabanlı bir fantastik iksir dükkânı simülasyonu.
Menülerden "Malzeme ekle / Karıştır / Isıt" düğmelerine basılmaz: her şey
dükkânın içinde, elle yapılır. Mantarı sepetten alırsın, tahtada bıçakla
doğrarsın, kovayla kazana su dökersin, ocağa odun atıp körüğü pompalarsın,
kepçeyle karıştırırsın, şişeyi kazana daldırıp iksiri doldurur ve tezgâhta
bekleyen müşteriye verirsin. Müşteri iksiri içer ve etkisine göre tepki verir.

![stack](https://img.shields.io/badge/TypeScript-Vite-blue) ![three](https://img.shields.io/badge/Three.js-render-black) ![babylon](https://img.shields.io/badge/Babylon.js%20%2B%20Havok-physics-orange)

## Çalıştırma

```bash
npm install
npm run dev        # geliştirme sunucusu (http://localhost:5173)
npm run build      # tip kontrolü + üretim derlemesi (dist/)
npm run preview    # derlenmiş sürümü sun
npm test           # iksir kimyası birim testleri (vitest)
npm run e2e        # tarayıcıda uçtan uca oynanış testi (önce npm run dev)
```

`npm run e2e` (tests/e2e/first-potion.mjs) oyunu gerçek fare ve klavye
girdisiyle baştan sona oynar: mantarı sepetten alıp doğrar, kovayla su döker,
ocağa odun atıp körüğü pompalar, dilimleri kazana atar, kepçeyle karıştırır,
şişeyi daldırıp iksiri tezgâha koyar, parayı alır ve kaydın sayfa
yenilemesinden sağ çıktığını kontrol eder. Playwright'ın Chromium'u gerekir
(`npx playwright install chromium`); farklı bir tarayıcı `CHROMIUM_PATH`, farklı
bir adres `GAME_URL` ile verilebilir.

Node 20+ ve WebGL2 destekli bir tarayıcı gerekir. Oyun sesleri ilk
tıklamada açılır (tarayıcı otomatik oynatma kuralı).

## Kontroller

| Girdi | Ne yapar |
| --- | --- |
| Sol tık + sürükle | Nesneyi fiziksel olarak tut ve taşı; bırakınca düşer |
| `Space` / sağ tık (tutarken) | Kova/şişeyi eğip dök · bıçak/çekiçle vur |
| Bıçağı hızla malzemenin üstünden geçir | Dilimle |
| Çekici hızla aşağı savur | Ez / kır |
| Havan tokmağını, kepçeyi daire çizerek çevir | Öğüt / karıştır |
| Körüğü aşağı yukarı pompala | Ateşi harla |
| Tutarken `Q`/`E` veya fare tekerleği | Nesneyi döndür |
| Tutarken `R` · `F` | Nesneyi yukarı kaldır · aşağı indir (dokunmatikte ▲ ▼) |
| `WASD` / oklar, sağ/orta tık ya da boş zemini sürükle | Kamerayı kaydır |
| Tekerlek / `+` `-` · `Q`/`E` | Yakınlaştır · kamerayı döndür (önünde kalan duvar alçalır) |
| `1`–`5` | Kamera: dükkân, kazan, masa, raflar, tezgâh |
| Vincin krank kolunu daire çizerek çevir | Kazanı ateşten kaldır / indir |
| Kediye, tezgâh balçığına, ustanın köpeğine sol tık · sağ tık | Sev · özelleştirme paneli |
| `B` · `C` · `I` · `M` · `K` · `H` · `Esc` | İksir kitabı · pazar · envanter · keşif haritası · başarımlar · yardım · menü |
| `"` / `` ` `` (Esc'nin altındaki tuş) | Admin menüsü (şifre: `4884`) |

**Dokunmatik (telefon, tablet, akıllı tahta):** tek parmakla eşyaları sürükle,
boş zemini sürükleyerek kamerayı kaydır, iki parmakla yakınlaştır ve çevirerek
döndür; sağ tık yerine basılı tut. Parmakla oynarken sağ altta ekran düğmeleri
çıkar: ✋ eylem (SPACE gibi döker/eğer/vurur), ▲ ▼ tutulan eşyayı kaldır/indir,
⟲ ⟳ döndür, − + yakınlaştır,
⛶ tam ekran. Dikey tutulan telefonlarda arayüz üst üste dizilir.

## Oynanış

- **Hazırlık istasyonları:** kesme tahtası + bıçak (dilimle), çekiç (ejderha
  pulunu kır), havan (öğüt), ocağın yanındaki kurutma askısı (yarasa kanadını
  doğru sıcaklıkta kurut; fazla ısıda yanar), doğrudan ateşe atma (kömürleştir).
- **Kazan:** gerçek zamanlı sıcaklık (Soğuk 0–30 · Ilık 30–70 · Sıcak 70–100 ·
  Kaynıyor 100–130 · Tehlike 130+), su seviyesi, çözünen malzeme parçaları
  (yüzen/batan fizik cisimleri), köpük, renk, buhar, ışık ve ses. Ateş odun
  ve körükle, hava kapağıyla ayarlanır; ocağın arkasındaki vinçle kazan
  zincirle ateşten kaldırılır (yükseldikçe ısı azalır), su dökmek soğutur,
  musluk boşaltır.
- **Karıştırma:** yavaş = kararlı, hızlı = güçlü, çok hızlı = kararsız.
- **Tepkimeler veriye dayalıdır:** malzeme, miktar, sıra, sıcaklık, karıştırma,
  hazırlık yöntemi ve süre sonucu belirler. Örn. *Ejderha pulu + mantar + yüksek
  ısı = Ateş Şifası*, *mantar + ejderha pulu + düşük ısı = Zayıf Yenilenme*.
- **Fiziksel başarısızlıklar:** taşma, köpük patlaması, patlama (radyal fizik
  itmesi), kara iksir, büyü girdabı; yanlış iksiri içen müşteri kurbağaya
  dönüşebilir – kurbağayı yakalayıp ustaya götürmek gerekir.
- **Müşteriler:** Cadı Hazel, Şövalye Roland, Elf Elowen, Goblin Snik, Dev
  Grumbold, Vampir Vlador ve köylüler; her birinin kişiliği, sabrı, bütçesi,
  isteği, repliği ve sesi var. Kapıdan girer, sıraya geçer, sipariş verir,
  bekler, içer, tepki verir, öder (paralar tezgâha düşer) ve gider.
- **Toplama bölgeleri:** duvardaki keşif haritasından Fısıldayan Orman,
  Yankı Mağarası, Bulanık Bataklık veya Ejderha Vadisi'ne gidilir. Her bölgenin
  kendi piksel sahnesi, malzemeleri ve tuzakları var: yürürken beliren
  malzemelere tıkla, zehirli mantar, kurt gözü, sülük, kor gibi tehlikelere
  dokunma (dokunursan sepetten bir şey düşer). Gezi saatler sürer; bu sırada
  dükkân kapalıdır, gelen müşteriler kaçar. Ay Çiçeği gece ormanda, Buz
  Kristali mağarada, Bataklık Kurbağası Gözü yalnızca bataklıkta, Anka Tüyü
  nadiren vadide bulunur. Bölgeler gün ve itibarla açılır.
- **Gün döngüsü:** sabah/öğle/akşam/gece; Ay Çiçeği yalnızca geceleri açar.
  Gece tabelayla dükkânı kapat, gün özetini gör.
- **Keşif ve tarifler:** temel iksirlerin tarifi (malzemeler, sıcaklık,
  karıştırma) baştan kitapta yazılıdır. Gizli tarifler kitapta `???` ve 🔒
  olarak durur; Gezgin Tüccar bunları birkaç iksir karşılığında öğretir
  (ör. Dev Gücü İksiri için 3 Güç + 2 Şifa İksiri) – tüccarın "Gizli tarifler"
  sekmesinden dükkândaki iksirlerle takas edilir. Ünlü konukların özel
  iksirleri sipariş verdiklerinde kitaba yazılır. Deneyerek ilk kez
  şişelenen her iksirin sayfası senin notlarınla da dolar. Kitapta iksirler,
  malzemeler, özler, deney günlüğü ve görevler bulunur.
- **Görevler:** kuzeydeki kurtlar (Gece Görüşü), şövalye turnuvası (Güç),
  goblin yarışı, devin kayası, vampir balosu – her biri yeni bir mekanik öğretir.
- **Ekonomi ve gelişim:** malzeme/şişe/odun siparişi, pirinç körük, gelişmiş ve
  büyülü kazan, fırın, öğütücü, depo, dekorlar… Otomasyon temel mekanikleri
  ortadan kaldırmaz.
- **Dükkân kedisi Duman:** pencere pervazında uyuyan tombul, gri bir British
  Shorthair. Sol tıkla sevilir; sağ tık (dokunmatikte basılı tut) özelleştirme
  panelini açar: adını değiştir, 5 tüy rengi (mavi-gri, siyah, beyaz, krem,
  tarçın) ve 5 göz rengi (bakır, altın, zümrüt, safir, ayrı renkli) arasından
  seç. Seçimler kayda girer.
- **Pazar ve Gezgin Tüccar:** malzeme, şişe, odun ve geliştirmeler duvardaki
  pazar panosundan (C) alınır. Her üç günde bir Gezgin Tüccar Baha dükkâna
  tezgâh kurar (sabahtan akşamüstüne kadar): nadir malzemeler, günün fırsatı,
  gizemli keseler; üstelik raftaki iksirleri %25 fazlasına satın alır. Ondan
  alınan nadir malzemeler raftaki kavanozlarda da açılır.
- **Ünlü konuklar:** internetin sevilen yüzleri dükkâna uğrar ve her biri
  kendine özel bir iksir ister; tarifin ipucu söylediklerinde gizli:
  IShowSpeed → *Lâ Peace İksiri* (kurutulmuş Ay Çiçeği + mantar, kıpırtısız
  karıştırma), Salt Bae → *Tuz Serpme İksiri* (önce cızırdayan ejderha pulu,
  sonra üstüne öğütülmüş buz kristali), MrBeast → *Altın Yağmuru İksiri*
  (öğütülmüş ejderha pulu + kurutulmuş mantar), The Rock → *Kaş Kaldırma
  İksiri* (ejderha pulu + ezilmemiş kurbağa gözü, sıcak), Keanu Reeves →
  *Nefes Kesici İksir* (Ay Çiçeği + buz kristali, 50°C altında). Her birinin
  girişi, bekleme şakaları ve iksiri içince kendi gösterisi var; iksirini
  alana kadar başka günlerde yeniden gelirler. Sonra gelenler: Cristiano
  Ronaldo → *SIUUU İksiri* (ejderha pulu + Ay Çiçeği, 85°C+, sert
  karıştırma; içince havada dönüp "SIUUU!"), Gordon Ramsay → *Tam Kıvamında
  İksir* (dilimlenmiş mantar + buz kristali, 60–75°C, sakin – "çiğse
  anlarım"), Recep İvedik → *Asabi Ayran İksiri* (kurutulmuş yarasa kanadı +
  buz kristali, 50°C altı), CZN Burak → *Dev Porsiyon İksiri* (en az 3 L su,
  ejderha pulu + mantar), Nasreddin Hoca → *Ya Tutarsa İksiri* (3,2 L+ su,
  ezilmiş mantar, ılık – dükkâna ters yürüyerek girer), Temel → *Hamsi
  İksiri* (kurbağa gözü + buz kristali, 60°C altı) ve Keloğlan → *Gür Saç
  Toniği* (kurutulmuş yarasa kanadı + Ay Çiçeği, 40–90°C; içince saçı çıkar).
  Bekleyen konuklar sırayla gelir; 5. günden sonra aynı gün iki ünlü de
  uğrayabilir. (Bu karakterler sevgi dolu parodi/cameo ve halk hikâyesi
  karakterleridir; gerçek kişilerle bir bağlantı ya da onay yoktur.)
- **Mobilya:** Pazar → Mobilya sekmesinden dükkândaki 6 boş yere (2 alçak
  zemin, 2 uzun zemin, 2 duvar) mobilya alınır: kadife koltuk, dev eğrelti,
  dönen kâşif küresi, ışık saçan demir şamdan, fal söyleyen kristal küre, bal
  kabağı feneri, ipucu veren kitaplık, tıngırdayan zırh, saati gösterip
  çalan dede saati, tablolar, kalkan, sihirli ayna, sancak. Kaldırınca yarı
  fiyatı geri alınır; hepsi kayda girer.
- **Evcil hayvanlar:** ustanın kucağında beyaz bir Lagotto Romagnolo (Pamuk)
  uyuklar; sevilince kuyruk sallar, müşterilere ara sıra, hırsıza her zaman
  havlar. Sağ tıkla adı, tüy rengi (beyaz, kırık beyaz, kahve, kahve kır,
  turuncu, lekeli) ve tasması değiştirilir. Tezgâh balçığı Pıtırcık'ın da adı
  ve rengi (7 renk) değiştirilebilir.
- **Cüce Nobert:** çok nadiren (4. günden sonra, günde ~%6, en az 5 gün
  arayla) kapıdan süzülen bir cüce hırsız. Rastgele bir eşya türünün hepsini
  çuvalına atar – bütün boş şişeler, bütün odunlar, bir malzemenin bütün
  stoğu ya da raftaki bütün iksirler – ve kaçar. Kaçmadan üstüne tıklarsan
  her şeyi bırakıp kaçar.
- **Başarımlar:** 38 başarım (bazıları gizli) ilerleme çubuklarıyla; açılınca
  fanfar ve bildirim çıkar, kupa panelinden (K) izlenir. Bir tanesi tamamen
  şansa bağlı: dükkândan ara sıra bir dört yapraklı yonca süzülür.
- **Admin menüsü:** Esc'nin altındaki tuş (`"` ya da `` ` ``), şifre `4884`.
  Para, itibar, gün/saat, zaman hızı, stoklar, tarifler, müşteri/ünlü/tüccar/
  Nobert çağırma, kazan suyu/sıcaklığı/ateş, iksir ve malzeme oluşturma,
  başarımlar, mobilya ve kayıt buradan ayarlanır.
- **Kolay taşıma:** taşınan eşya diğer eşyalara ve insanlara takılmaz, altında
  bir iniş işareti görünür. Doğru yere yaklaşınca mıknatıs gibi yerine çekilir,
  parlayan bir halka ve ipucu çıkar: malzemeler kazana, tahtaya ya da havana,
  odun ateşe, iksir tezgâha ya da rafa. Boş şişeyi kazana yaklaştırınca
  kendiliğinden daldırılıp doldurulur ve geri çıkar; kova kazanın üstünde
  sabit tutulunca kendiliğinden döker.
- **Kesit duvarlar:** oda dört duvarlı bir oyuncak ev gibidir. Kamera hangi
  yöne bakıyorsa o yöndeki duvarlar tam boy görünür; kamerayla oda arasında
  kalan duvarlar alçak bir taş sıraya iner. `Q`/`E` ile döndükçe yan
  duvarlar yer değiştirir.
- **Kayıt Kristali:** dükkânın arka köşesinde, parlayan bir rün çemberinin
  üstünde dönen kristal. Dokununca ilerleme kaydedilir.
- **Grafik ayarları:** Otomatik / PS1 / Düşük / Orta / Yüksek. PS1 modu 240
  satırlık çözünürlük, titreyen köşeler (vertex snapping), perspektifsiz
  kayan dokular, 15-bit renk ve dither, kısa görüş mesafesi ve hafif tarama
  çizgileriyle klasik PlayStation görünümüdür (en hafif mod). Yüksek kalite
  daha fazla piksel, 2048'lik yumuşak gölgeler ve daha geniş ışıma kullanır.
- **Dark Fantasy modu:** Ayarlar → Dark Fantasy açıkken sahne karanlık
  fantastik bir paletle (soğuk çelik gölgeler, mum ışığı altın vurgular,
  kan kırmızısı ve cadı ateşi) boyanır, oda loşlaşıp alevler öne çıkar,
  arkada kısık bir rüzgâr/uğultu sesi çalar; arayüz karartılmış demir,
  eskimiş altın ve kızıl çerçevelere, gotik piksel başlıklara (Jacquard 24)
  ve çelik eldiven imlecine bürünür. Tüm yazılar retro VT323 fontuyla
  (Türkçe karakter destekli).
- **Düşen aletler:** çekiç ya da bıçak yere, masanın altına düşerse kısa
  süre sonra kendiliğinden süzülerek masadaki yerine döner; elde taşınan
  bir eşya masa kenarına takılırsa içinden geçip imlece ulaşır. Aleti
  yerine yaklaştırınca mıknatısla yerine oturur.
- **Kayıt:** para, gün, itibar, envanter, keşifler, görevler, geliştirmeler,
  kazandaki iksir, ocak durumu ve yerdeki eşyalar LocalStorage'a otomatik
  kaydedilir; ayarlar ayrı saklanır.

## Mimari

İki motorun da gerçek bir görevi var ve aralarında ince bir soyutlama katmanı bulunuyor:

- **Three.js** – ana sahne ve görüntü: düşük çözünürlüklü HalfFloat render
  hedefi → bloom → kompozit (derinlik kenar çizgisi, renk derecelendirme,
  Bayer dither, palet niceleme) → CSS `pixelated` büyütme. Toon materyaller,
  prosedürel piksel dokular, alev/sıvı/şişe/gökyüzü shader'ları, piksel
  karakter sprite'ları ve havuzlanmış piksel parçacıkları.
- **Babylon.js** – başsız (`NullEngine`) bir sahnede **Havok** fizik dünyası:
  katı cisimler, çarpışmalar, kinematik araçlar, yüzme/batma ve girdap kuvvet
  alanları, radyal patlama itmesi, sarkaç eklemleri; ayrıca ateş/kıvılcım/
  duman için CPU `ParticleSystem` simülasyonu (parçacıklar Three.js'e aktarılır).
- `PhysicsWorld` arayüzü oyun kodunu Babylon'dan ayırır; `PhysicsSync` sabit
  adımlı (60 Hz) fiziği ara değerlemeyle (interpolation) görüntüye bağlar.

```
src/
  core/          döngü, olay yolu, girdi, i18n, zamanlayıcı, ayarlar, Game
  rendering/
    three/       renderer, piksel boru hattı, kamera, ışık, modeller, shader'lar, sprite'lar
    babylon/     Babylon çekirdeği (NullEngine + Havok), parçacık simülasyonu
  physics/       fizik soyutlaması ve senkronizasyon
  gameplay/
    potion/      BrewChemistry (saf simülasyon), değerlendirici, kazan, ocak, şişe, keşif
    ingredients/ fiziksel malzeme parçaları ve işlem kuralları
    stations/    tahta, bıçak, çekiç, havan, askı, kova, fıçı, körük, kepçe…
    customers/   müşteri durum makinesi, ekonomi, içme etkileri, kurbağa, usta
    day/ quests/ tutorial/ shop/
  world/         varlık kaydı, etkileşim (fiziksel tutma), dükkân kurulumu
  vfx/ audio/    piksel parçacıklar, enkaz; Web Audio ile sentezlenmiş ses ve uyarlanır müzik
  data/          malzemeler, iksir tarifleri, özler, müşteriler, görevler, geliştirmeler, metinler
  save/ ui/      kayıt sistemi; hafif, diegetik piksel arayüz
tests/           kimya/tarif birim testleri
```

### Yeni malzeme veya iksir eklemek

Her şey `src/data` altında veri olarak tanımlıdır:

- `ingredients.ts` – nadirlik, özler (`effects`), `temperatureResistance`,
  `grindability`, `burnability`, `liquidAffinity`, `magicalPower`, `weight`,
  model/doku ve işlem kuralları (`processes`: hangi aletle hangi hâle geçer).
- `potions.ts` – tarifler koşul olarak yazılır: öz payları, sıra, gerekli
  malzemeler, demleme ve malzeme sıcaklığı, kararlılık, karıştırma, yoğunluk,
  bayraklar, kalite kademeleri. `npm test` tariflerin gerçekten
  demlenebildiğini simülasyonla doğrular.

## Performans

Sabit zaman adımı, havuzlanmış parçacıklar (2 çizim çağrısı), paylaşılan
geometri/materyaller, kademeli gölge haritası güncellemesi ve düşük
çözünürlüklü render. Varsayılan "Otomatik" kalite yüksek başlar ve kare hızı
düşerse kendiliğinden orta/düşük seviyeye iner (telefonlarda orta
başlar); ayarlardan Otomatik, PS1, Düşük, Orta ya da Yüksek, piksel boyutu
ve Dark Fantasy modu elle de seçilebilir.

## Genişletme fikirleri

- Toplama bölgelerine yeni malzemeler ve bölgeye özel görevler
- Sepet / fener gibi toplama ekipmanı geliştirmeleri
