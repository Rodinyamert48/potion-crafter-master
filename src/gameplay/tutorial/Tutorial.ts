// Guided first brew. Master Mortimer walks the apprentice through the
// vertical-slice scenario: take a mushroom, slice it, fill the cauldron,
// light the fire, add the ingredient, (optionally) dragon scale, stir,
// bottle and serve. A bouncing pixel arrow points at the next object.

import * as THREE from 'three';
import type { GameContext } from '../../core/GameContext';
import type { GameSystem } from '../../core/Game';
import { Painter } from '../../rendering/three/textures/Painter';
import { configurePixelTexture } from '../../rendering/three/textures/Painter';
import type { Lang } from '../../core/i18n';
import { getLang } from '../../core/i18n';

interface Step {
  id: string;
  text: Record<Lang, string>;
  target: (ctx: GameContext) => THREE.Vector3 | null;
  /** Returns true when the step is complete. */
  done: (ctx: GameContext, tut: Tutorial) => boolean;
  preset?: 'overview' | 'cauldron' | 'table' | 'counter' | 'shelves';
}

function arrowTexture(): THREE.Texture {
  const p = new Painter(12, 14, 3);
  const rows = ['...kkkkkk...', '...kyyyyk...', '...kyyyyk...', '...kyyyyk...', '...kyyyyk...', 'kkkkyyyykkkk', 'kyyyyyyyyyyk', '.kyyyyyyyyk.', '..kyyyyyyk..', '...kyyyyk...', '....kyyk....', '.....kk.....'];
  rows.forEach((r, y) => {
    for (let x = 0; x < r.length; x++) {
      if (r[x] === 'k') p.px(x, y + 1, '#181425');
      if (r[x] === 'y') p.px(x, y + 1, y < 5 ? '#fee761' : '#feae34');
    }
  });
  return configurePixelTexture(p.texture({ mipmaps: false }), { mipmaps: false });
}

export class Tutorial implements GameSystem {
  private steps: Step[];
  private index = 0;
  private readonly marker: THREE.Mesh;
  private time = 0;
  private stirTime = 0;
  private flags = new Set<string>();
  private spokenIndex = -1;
  /** Off behind the title screen; the App enables it once play starts. */
  enabled = false;
  onChange: ((text: string | null, index: number, total: number) => void) | null = null;

  constructor(private readonly ctx: GameContext) {
    this.marker = new THREE.Mesh(
      new THREE.PlaneGeometry(0.28, 0.33),
      new THREE.MeshBasicMaterial({ map: arrowTexture(), transparent: true, alphaTest: 0.5, depthTest: false, toneMapped: false }),
    );
    this.marker.renderOrder = 100;
    this.marker.visible = false;
    this.marker.userData.noPick = true;
    this.marker.raycast = () => {};
    ctx.scene.add(this.marker);

    const shop = ctx.shop;
    const mark = (id: string) => () => this.flags.add(id);
    ctx.bus.on('ingredient:taken', ({ id }) => id === 'glowing_mushroom' && this.flags.add('tookMushroom'));
    ctx.bus.on('ingredient:processed', ({ id, action }) => {
      if (id === 'glowing_mushroom' && (action === 'slice' || action === 'smash' || action === 'grind')) this.flags.add('prepped');
    });
    ctx.bus.on('ingredient:added', ({ id }) => {
      if (id === 'glowing_mushroom') this.flags.add('added');
      if (id === 'dragon_scale') this.flags.add('dragon');
    });
    ctx.bus.on('potion:bottled', mark('bottled'));
    ctx.bus.on('customer:served', mark('served'));
    ctx.bus.on('customer:ordered', ({ customerId }) => customerId === 'witch_hazel' && this.flags.add('ordered'));

    this.steps = [
      {
        id: 'welcome',
        text: {
          en: "Ah, you're awake! Welcome to my shop, apprentice. These old hands are too shaky for brewing – today YOU make the potions. Here comes our first customer…",
          tr: 'Ah, uyandın! Dükkânıma hoş geldin, çırak. Bu yaşlı eller demleme için fazla titrek – bugün iksirleri SEN yapacaksın. İşte ilk müşterimiz geliyor…',
        },
        target: () => shop.anchors.counterSpot.clone().add(new THREE.Vector3(0, 2.1, 0)),
        done: () => this.flags.has('ordered'),
        preset: 'overview',
      },
      {
        id: 'take',
        text: {
          en: 'A healing potion! Glowing Mushrooms hold healing essence. Drag one out of the basket on the cabinet.',
          tr: 'Bir şifa iksiri! Parlayan Mantarlar şifa özü taşır. Dolabın üstündeki sepetten bir tane sürükleyerek al.',
        },
        target: () => shop.sources.get('glowing_mushroom')!.object.position.clone().add(new THREE.Vector3(0, 0.55, 0)),
        done: () => this.flags.has('tookMushroom'),
        preset: 'shelves',
      },
      {
        id: 'slice',
        text: {
          en: 'Put it on the cutting board. Then grab the knife and swipe it fast across the mushroom – sliced mushrooms dissolve much faster.',
          tr: 'Onu kesme tahtasına koy. Sonra bıçağı tut ve mantarın üstünden hızla geçir – dilimlenmiş mantar çok daha hızlı çözülür.',
        },
        target: () => shop.board.object.position.clone().add(new THREE.Vector3(0, 0.35, 0)),
        done: () => this.flags.has('prepped'),
        preset: 'table',
      },
      {
        id: 'water',
        text: {
          en: 'The cauldron needs water. Take the bucket from the barrel, hold it above the cauldron and hold SPACE (or right click) to pour. Dip it in the barrel to refill.',
          tr: 'Kazanın suya ihtiyacı var. Fıçının yanındaki kovayı al, kazanın üstünde tut ve dökmek için SPACE (ya da sağ tık) basılı tut. Doldurmak için fıçıya daldır.',
        },
        target: () => (shop.cauldron.chem.water < 0.3 ? shop.bucket.object.position.clone().add(new THREE.Vector3(0, 0.45, 0)) : shop.cauldron.surfacePoint().add(new THREE.Vector3(0, 0.9, 0))),
        done: () => shop.cauldron.chem.water >= 1.6,
        preset: 'overview',
      },
      {
        id: 'fire',
        text: {
          en: 'Now the fire. Drop a log from the wood pile into the hearth opening, then pump the bellows to stoke it.',
          tr: 'Şimdi ateş. Odun yığınından bir kütüğü ocağın ağzına bırak, sonra harlamak için körüğü pompala.',
        },
        target: () => (shop.hearth.fuel < 1 ? shop.sources.get('log')!.object.position.clone().add(new THREE.Vector3(0, 0.8, 0)) : shop.bellows.object.position.clone().add(new THREE.Vector3(0, 0.55, 0))),
        done: () => shop.hearth.intensity >= 0.55,
        preset: 'cauldron',
      },
      {
        id: 'add',
        text: {
          en: 'Drop the mushroom pieces into the cauldron. Watch the colour change and the essence motes rise.',
          tr: 'Mantar parçalarını kazana bırak. Rengin değişmesini ve öz zerreciklerinin yükselmesini izle.',
        },
        target: () => shop.cauldron.surfacePoint().add(new THREE.Vector3(0, 0.95, 0)),
        done: () => this.flags.has('added'),
        preset: 'overview',
      },
      {
        id: 'heat',
        text: {
          en: "Keep it warm – the thermometer shows the heat. She wants it STRONG: once the brew is hot, some alchemists add a Dragon Scale… but never let the mushroom boil above 95°C without it! Too hot? Turn the winch to lift the pot off the fire.",
          tr: 'Sıcak tut – termometre ısıyı gösterir. GÜÇLÜ istiyor: iksir ısınınca bazı simyacılar bir Ejderha Pulu ekler… ama mantarı onsuz asla 95°C üstünde kaynatma! Çok mu ısındı? Vinci çevirip kazanı ateşten kaldır.',
        },
        target: () => shop.cauldron.surfacePoint().add(new THREE.Vector3(0.55, 0.7, 0.35)),
        done: (c) => c.shop.cauldron.chem.temperature >= 45 && c.shop.cauldron.chem.essences.healing > 0.8,
        preset: 'cauldron',
      },
      {
        id: 'stir',
        text: {
          en: 'Grab the ladle: it stirs by itself in CALM mode, which stabilises the brew. G (or right click) switches mode: Calm · Strong · Wild · By hand.',
          tr: 'Kepçeyi tut: DENGELİ modda kendisi karıştırır ve iksiri dengeler. G (ya da sağ tık) modu değiştirir: Dengeli · Güçlü · Kararsız · Elle.',
        },
        target: () => shop.ladle.object.position.clone().add(new THREE.Vector3(0, 1.0, 0)),
        done: () => this.stirTime > 3,
        preset: 'cauldron',
      },
      {
        id: 'bottle',
        text: {
          en: 'Lovely. Take an empty flask from the crate and dip it into the cauldron to bottle the potion.',
          tr: 'Güzel. Kasadan boş bir şişe al ve iksiri şişelemek için kazana daldır.',
        },
        target: () => shop.sources.get('flask')!.object.position.clone().add(new THREE.Vector3(0, 0.55, 0)),
        done: () => this.flags.has('bottled'),
        preset: 'cauldron',
      },
      {
        id: 'serve',
        text: {
          en: 'Put the potion on the counter in front of Hazel. Then we will see what she thinks…',
          tr: 'İksiri tezgâhta Hazel\'in önüne koy. Sonra ne düşündüğünü göreceğiz…',
        },
        target: () => new THREE.Vector3(3.4, 1.5, 0.85),
        done: () => this.flags.has('served'),
        preset: 'counter',
      },
      {
        id: 'done',
        text: {
          en: 'Well done, apprentice! Every brew is written in the Potion Book on the lectern. Experiment – order, heat and stirring all change the result. I will be… resting my eyes.',
          tr: 'Aferin çırak! Her demleme kürsüdeki İksir Kitabına yazılır. Deney yap – sıra, ısı ve karıştırma sonucu değiştirir. Ben de… gözlerimi dinlendireceğim.',
        },
        target: () => new THREE.Vector3(1.0, 1.6, -2.55),
        done: (_c, tut) => tut.time > 7,
      },
    ];
    this.index = ctx.state.tutorialDone ? this.steps.length : ctx.state.tutorialStep;
  }

  get active(): boolean {
    return !this.ctx.state.tutorialDone && this.index < this.steps.length;
  }

  get currentText(): string | null {
    if (!this.active) return null;
    return this.steps[this.index].text[getLang()];
  }

  skip(): void {
    this.index = this.steps.length;
    this.finish();
  }

  private finish(): void {
    const s = this.ctx.state;
    s.tutorialDone = true;
    s.tutorialStep = this.steps.length;
    this.marker.visible = false;
    this.onChange?.(null, this.index, this.steps.length);
    this.ctx.bus.emit('tutorial:step', { step: 'done' });
  }

  private inView(p: THREE.Vector3 | null): boolean {
    if (!p) return true;
    const v = p.clone().project(this.ctx.renderer.rig.camera);
    return v.z < 1 && Math.abs(v.x) < 0.8 && Math.abs(v.y) < 0.75;
  }

  update(dt: number): void {
    const ctx = this.ctx;
    if (!this.active || !this.enabled) {
      this.marker.visible = false;
      return;
    }
    if (ctx.paused) return;
    this.time += dt;
    const step = this.steps[this.index];
    if (this.spokenIndex !== this.index) {
      this.spokenIndex = this.index;
      this.time = 0;
      ctx.bus.emit('mentor:say', { text: step.text[getLang()], priority: 9, mood: 'neutral', card: true });
      this.onChange?.(step.text[getLang()], this.index, this.steps.length);
      // Only move the camera when the thing to look at is out of view.
      if (step.preset && this.index > 0 && !this.inView(step.target(ctx))) ctx.renderer.rig.setPreset(ctx.shop.presets[step.preset]);
      ctx.bus.emit('tutorial:step', { step: step.id });
    }
    if (step.id === 'stir') {
      const s = Math.abs(ctx.shop.cauldron.stirSpeed);
      if (s > 0.5 && s < 4) this.stirTime += dt;
    }
    const target = step.target(ctx);
    if (target) {
      this.marker.visible = true;
      this.marker.position.copy(target);
      this.marker.position.y += Math.abs(Math.sin(this.time * 4)) * 0.12;
      this.marker.quaternion.copy(ctx.renderer.rig.camera.quaternion);
    } else this.marker.visible = false;
    if (step.done(ctx, this) && this.time > 1.2) {
      this.index++;
      ctx.state.tutorialStep = this.index;
      ctx.audio.play('chime', { volume: 0.5 });
      if (this.index >= this.steps.length) this.finish();
    }
  }
}
