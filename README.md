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
| `WASD` / oklar, sağ/orta tık ya da boş zemini sürükle | Kamerayı kaydır |
| Tekerlek / `+` `-` · `Q`/`E` | Yakınlaştır · kamerayı döndür (önünde kalan duvar alçalır) |
| `1`–`5` | Kamera: dükkân, kazan, masa, raflar, tezgâh |
| Vincin krank kolunu daire çizerek çevir | Kazanı ateşten kaldır / indir |
| Kediye sol tık · sağ tık | Sev · özelleştirme paneli |
| `B` · `C` · `I` · `M` · `K` · `H` · `Esc` | İksir kitabı · pazar · envanter · keşif haritası · başarımlar · yardım · menü |

**Dokunmatik (telefon, tablet, akıllı tahta):** tek parmakla eşyaları sürükle,
boş zemini sürükleyerek kamerayı kaydır, iki parmakla yakınlaştır ve çevirerek
döndür; sağ tık yerine basılı tut. Parmakla oynarken sağ altta ekran düğmeleri
çıkar: ✋ eylem (SPACE gibi döker/eğer/vurur), ⟲ ⟳ döndür, − + yakınlaştır,
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
- **Keşif:** bilinmeyen iksirler kitapta `???` olarak durur; ilk kez
  şişelenince sayfası senin notlarınla dolar. Kitapta iksirler, malzemeler,
  özler, deney günlüğü ve görevler bulunur.
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
  alana kadar başka günlerde yeniden gelirler. (Bu karakterler sevgi dolu
  parodi/cameo niteliğindedir; kişilerle bir bağlantı ya da onay yoktur.)
- **Başarımlar:** 27 başarım (bazıları gizli) ilerleme çubuklarıyla; açılınca
  fanfar ve bildirim çıkar, kupa panelinden (K) izlenir.
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
- **PS1 Korku grafik modu:** Ayarlar → Grafik: Otomatik / PS1 Korku / Yüksek.
  PS1 modu 240 satırlık çözünürlük, titreyen köşeler (vertex snapping),
  perspektifsiz kayan dokular, 15-bit renk ve dither, karanlık sis, gren,
  tarama çizgileri, titreyen lambalar ve tekinsiz bir ortam sesiyle oynar;
  aynı zamanda en hafif grafik modudur.
- **Retro mod:** Ayarlar → Retro palet açıkken sahne 16-bit fantastik RPG
  paletine (indigo gölgeler, titreşimli/dither renk geçişleri) geçer; arayüz
  mavi gradyanlı, beyaz çerçeveli pencerelere ve beyaz eldiven imlecine
  bürünür. Tüm yazılar retro VT323 fontuyla (Türkçe karakter destekli).
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
başlar); ayarlardan Otomatik, PS1 Korku ya da Yüksek, piksel boyutu ve retro
mod elle de seçilebilir.

## Genişletme fikirleri

- Toplama bölgelerine yeni malzemeler ve bölgeye özel görevler
- Sepet / fener gibi toplama ekipmanı geliştirmeleri
