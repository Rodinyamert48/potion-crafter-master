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
```

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
| `WASD` / oklar, sağ/orta tık sürükle | Kamerayı kaydır |
| Tekerlek · `Q`/`E` | Yakınlaştır · kamerayı döndür |
| `1`–`5` | Kamera: dükkân, kazan, masa, raflar, tezgâh |
| Vincin krank kolunu daire çizerek çevir | Kazanı ateşten kaldır / indir |
| `B` · `C` · `I` · `M` · `H` · `Esc` | İksir kitabı · katalog · envanter · keşif haritası · yardım · menü |

Dokunmatik ekranda tek parmak sürükler, iki parmak yakınlaştırır/kaydırır.

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
çözünürlüklü render. Ayarlardan kalite (düşük/orta/yüksek), piksel boyutu
ve retro palet seçilebilir.

## Genişletme fikirleri

- Toplama bölgelerine yeni malzemeler ve bölgeye özel görevler
- Sepet / fener gibi toplama ekipmanı geliştirmeleri
