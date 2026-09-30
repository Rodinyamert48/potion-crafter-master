// Composition of gameplay systems and UI on top of the Game core, plus the
// high level flow: title screen → play → day summary → next day.

import type { Game } from './core/Game';
import type { GameContext } from './core/GameContext';
import { CustomerSystem } from './gameplay/customers/CustomerSystem';
import { Mentor } from './gameplay/customers/Mentor';
import { DayCycle } from './gameplay/day/DayCycle';
import { QuestSystem } from './gameplay/quests/QuestSystem';
import { Tutorial } from './gameplay/tutorial/Tutorial';
import { Atmosphere } from './gameplay/Atmosphere';
import { CatPanel } from './ui/CatPanel';
import { MerchantPanel } from './ui/MerchantPanel';
import { AchievementsPanel } from './ui/AchievementsPanel';
import { TouchControls } from './ui/TouchControls';
import { Achievements } from './gameplay/Achievements';
import { TravelingMerchant } from './gameplay/shop/TravelingMerchant';
import { FurnitureSystem } from './gameplay/shop/Furniture';
import { MentorDog } from './gameplay/Pets';
import { PetPanel } from './ui/PetPanel';
import { AdminPanel } from './ui/AdminPanel';
import { NobertSystem } from './gameplay/Nobert';
import { KingSystem } from './gameplay/King';
import { KingPanel } from './ui/KingPanel';
import { giveDragonEgg, isWolfDay } from './gameplay/WorldEvents';
import * as THREE from 'three';
import { t } from './core/i18n';
import { ShopSystem } from './gameplay/shop/ShopSystem';
import { Discovery } from './gameplay/potion/Discovery';
import { Expedition } from './gameplay/gathering/Expedition';
import { MapPanel } from './ui/MapPanel';
import { DoorPanel } from './ui/DoorPanel';
import { MiniGamePanel } from './ui/MiniGamePanel';
import { SeedPanel } from './ui/SeedPanel';
import { OutdoorWorld } from './world/outdoor/OutdoorWorld';
import { GardenScene } from './world/garden/GardenScene';
import { absHour, advanceGarden } from './data/garden';
import { isMobileDevice } from './core/Settings';
import { SaveSystem } from './save/SaveSystem';
import { HUD } from './ui/HUD';
import { BookPanel } from './ui/BookPanel';
import { CatalogPanel } from './ui/CatalogPanel';
import { InventoryPanel, MenuPanel, SummaryPanel } from './ui/Panels';
import { TitleScreen } from './ui/TitleScreen';
import type { Settings } from './core/Settings';
import { IngredientItem } from './gameplay/ingredients/IngredientItem';
import { FlaskItem } from './gameplay/potion/FlaskItem';
import { RECIPE_MAP } from './data/potions';
import { CUSTOMERS } from './data/customers';
import type { PrepState } from './data/types';
import type { Tier } from './gameplay/potion/PotionEvaluator';

const AUTOSTART = 'witchs-brew:autostart';

export class App {
  readonly ctx: GameContext;
  readonly customers: CustomerSystem;
  readonly day: DayCycle;
  readonly quests: QuestSystem;
  readonly tutorial: Tutorial;
  readonly atmosphere: Atmosphere;
  readonly shopSystem: ShopSystem;
  readonly merchant: TravelingMerchant;
  readonly furniture: FurnitureSystem;
  readonly nobert: NobertSystem;
  readonly king: KingSystem;
  readonly achievements: Achievements;
  readonly touch: TouchControls;
  readonly save: SaveSystem;
  readonly mentor: Mentor;
  readonly dog: MentorDog;
  readonly expedition: Expedition;
  readonly outdoor: OutdoorWorld;
  readonly garden: GardenScene;
  private readonly mapPanel: MapPanel;
  readonly hud: HUD;
  readonly title: TitleScreen;
  private readonly menu: MenuPanel;
  private readonly summary: SummaryPanel;
  private loadedSave = false;

  /** Developer and playtest hooks (reachable as window.__wb.app.debug). */
  readonly debug = {
    /** Step outside (open world) with these pets, or into the garden. */
    goOutside: (pets: Array<'cat' | 'dog' | 'slime'> = []) => this.outdoor.enter(pets),
    goGarden: () => this.garden.enter(),
    /** Schedule a visit right now (e.g. 'celeb_speed'). */
    visit: (customerId: string) => {
      const def = CUSTOMERS[customerId];
      this.customers.addVisit({ hour: this.ctx.state.hour, customerId, requestId: def?.requests[0]?.id });
    },
    spawnIngredient: (id: string, state: PrepState = 'whole', at: { x: number; y: number; z: number }) => this.ctx.world.add(new IngredientItem(this.ctx, id, state, 1, at), this.ctx),
    spawnPotion: (recipeId: string, tier: Tier, at: { x: number; y: number; z: number }) => {
      const r = RECIPE_MAP[recipeId];
      const potion = { recipeId, tier, potency: 1 + tier, color: r.color, color2: r.color2, tags: r.tags, price: r.price, stability: 0.7, ingredients: [], brewTemp: 60 };
      return this.ctx.world.add(new FlaskItem(this.ctx, at, potion), this.ctx);
    },
  };

  constructor(readonly game: Game) {
    const ctx = game.ctx;
    this.ctx = ctx;
    this.customers = new CustomerSystem(ctx);
    this.day = new DayCycle(ctx);
    this.quests = new QuestSystem(ctx, this.customers);
    this.shopSystem = new ShopSystem(ctx);
    this.merchant = new TravelingMerchant(ctx, this.shopSystem);
    this.furniture = new FurnitureSystem(ctx);
    this.nobert = new NobertSystem(ctx);
    this.king = new KingSystem(ctx);
    this.achievements = new Achievements(ctx);
    this.expedition = new Expedition(ctx, this.customers);
    new Discovery(ctx);
    this.save = new SaveSystem(ctx, this.customers);
    this.mentor = ctx.world.add(new Mentor(ctx, ctx.shop.anchors.mentorSeat), ctx);
    this.customers.mentor = this.mentor;
    // The dog naps in the master's lap, a little in front of him.
    this.dog = ctx.world.add(new MentorDog(ctx, ctx.shop.anchors.mentorSeat.clone().add(new THREE.Vector3(-0.12, 0.36, 0.16))), ctx);

    // Restore a saved game for the backdrop (and for "Continue").
    if (SaveSystem.hasSave()) this.loadedSave = this.save.load();
    this.shopSystem.apply();
    this.furniture.sync();
    this.tutorial = new Tutorial(ctx);
    this.atmosphere = new Atmosphere(ctx);

    // UI
    const ui = game.ui;
    ui.registerPanel('book', new BookPanel(ctx));
    ui.registerPanel('catalog', new CatalogPanel(ctx, this.shopSystem, this.furniture));
    ui.registerPanel('inventory', new InventoryPanel(ctx));
    this.mapPanel = new MapPanel(ctx, this.expedition);
    ui.registerPanel('map', this.mapPanel);
    const minigame = new MiniGamePanel(ctx);
    ui.registerPanel('minigame', minigame);
    const seeds = new SeedPanel(ctx);
    ui.registerPanel('seeds', seeds);
    this.outdoor = new OutdoorWorld(ctx, {
      core: game.core,
      expedition: this.expedition,
      minigame,
      setMode: (m, h) => game.setMode(m, h),
      onEnter: () => {
        this.hud.visible = false;
      },
      onExit: (toGarden) => {
        this.hud.visible = true;
        if (toGarden) this.garden.enter();
      },
      openMenu: () => {
        this.menu.fromTitle = false;
        ui.openPanel('menu');
      },
    });
    ui.registerPanel('outpause', this.outdoor.pause);
    this.garden = new GardenScene(ctx, {
      expedition: this.expedition,
      seeds,
      setMode: (m, h) => game.setMode(m, h),
      onEnter: () => this.hud.setMode('garden'),
      onExit: () => this.hud.setMode('shop'),
    });
    ui.registerPanel(
      'door',
      new DoorPanel(ctx, {
        leaveBlocker: () => this.expedition.leaveBlocker(),
        gardenBlocker: () => (!ctx.state.tutorialDone ? t('trip.tutorial') : ctx.interaction.grab ? t('trip.holding') : null),
        openWorld: () => this.openWorld,
        goOutside: (pets) => {
          ui.openPanel(null);
          if (this.openWorld) this.outdoor.enter(pets);
          else {
            this.mapPanel.pets = pets;
            ui.openPanel('map');
          }
        },
        goGarden: () => {
          ui.openPanel(null);
          this.garden.enter();
        },
      }),
    );
    ui.registerPanel('cat', new CatPanel(ctx, this.atmosphere.cat));
    ui.registerPanel('merchant', new MerchantPanel(ctx, this.merchant));
    ui.registerPanel('king', new KingPanel(ctx, this.king));
    ui.registerPanel('achievements', new AchievementsPanel(ctx));
    ui.registerPanel(
      'admin',
      new AdminPanel(ctx, {
        day: this.day,
        visit: (id) => this.debug.visit(id),
        summonMerchant: () => {
          this.merchant.forceDay = ctx.state.day;
          ui.openPanel(null);
        },
        summonNobert: () => {
          const ok = this.nobert.summon();
          if (ok) ui.openPanel(null);
          return ok;
        },
        summonKing: () => {
          if (ctx.mode !== 'shop') return false;
          const ok = this.king.summon();
          if (ok) ui.openPanel(null);
          return ok;
        },
        giveEgg: () => giveDragonEgg(ctx),
        luck: () => {
          ui.openPanel(null);
          this.achievements.luck();
        },
        save: () => this.save.save(),
        spawnPotion: (id, tier) => this.debug.spawnPotion(id, tier, { x: 2.6 + Math.random() * 0.6, y: 1.25, z: 0.95 }),
        spawnIngredient: (id, state) => this.debug.spawnIngredient(id, state, { x: -3.0 + Math.random() * 0.5, y: 1.1, z: 0.8 }),
        syncFurniture: () => this.furniture.sync(),
        endDay: () => this.day.endDay(),
      }),
    );
    ui.registerPanel('pet', new PetPanel(ctx, (kind) => (kind === 'dog' ? this.dog.object : (ctx.world.ofKind('slime')[0]?.object ?? null))));
    ctx.bus.on('crystal:touched', () => {
      if (this.game.playing && this.save.save()) ctx.bus.emit('toast', { text: t('crystal.saved'), kind: 'good' });
    });
    this.menu = new MenuPanel(ctx, {
      save: () => this.save.save(),
      quit: () => this.quitToTitle(),
      applySettings: (s: Settings) => game.applySettings(s),
      eraseSave: () => {
        this.save.enabled = false;
        SaveSystem.erase();
        location.reload();
      },
    });
    ui.registerPanel('menu', this.menu);
    this.summary = new SummaryPanel(ctx);
    this.summary.onContinue = () => this.nextDay();
    ui.registerPanel('summary', this.summary);
    this.hud = new HUD(ctx, ui, this.customers, this.day, this.quests, this.tutorial);
    this.hud.visible = false;
    this.touch = new TouchControls(ctx);
    ui.root.append(this.touch.el, this.touch.portraitEl);
    this.title = new TitleScreen(ctx, {
      newGame: () => this.newGame(),
      continueGame: () => this.startPlaying(),
      settings: () => {
        this.menu.fromTitle = true;
        ui.openPanel('menu');
      },
      hasSave: () => this.loadedSave,
    });
    ui.root.appendChild(this.title.el);

    this.day.onDayEnd = () => {
      this.save.save();
      ui.openPanel('summary');
    };

    game.addSystem(this.day);
    game.addSystem(this.customers);
    game.addSystem(this.merchant);
    game.addSystem(this.nobert);
    game.addSystem(this.king);
    game.addSystem(this.achievements);
    game.addSystem(this.tutorial);
    game.addSystem(this.atmosphere);
    game.addSystem({ update: (dt) => this.frame(dt), always: true });

    ctx.input.onKeyDown((code, e) => this.key(code, e));
    // Wolf days: the master warns you in the morning.
    ctx.bus.on('day:start', ({ day }) => {
      if (isWolfDay(day)) ctx.later(2.5, () => ctx.bus.emit('mentor:say', { text: t('mentor.wolfDay'), priority: 2, mood: 'worried' }));
    });

    if (sessionStorage.getItem(AUTOSTART) === 'new') {
      sessionStorage.removeItem(AUTOSTART);
      this.startPlaying(true);
    } else this.showTitle();
  }

  private showTitle(): void {
    this.game.playing = false;
    this.hud.visible = false;
    this.title.show();
    this.ctx.renderer.rig.drift = true;
    this.ctx.renderer.rig.setPreset(this.ctx.shop.presets.overview, true);
  }

  private newGame(): void {
    if (this.loadedSave) {
      // A clean slate is simplest from a fresh page.
      this.save.enabled = false;
      SaveSystem.erase();
      sessionStorage.setItem(AUTOSTART, 'new');
      location.reload();
      return;
    }
    this.startPlaying(true);
  }

  private startPlaying(fresh = false): void {
    const ctx = this.ctx;
    ctx.audio.unlock();
    this.title.hide();
    this.hud.visible = true;
    this.menu.fromTitle = false;
    ctx.renderer.rig.drift = false;
    ctx.renderer.rig.setPreset(ctx.shop.presets.overview);
    this.game.playing = true;
    this.save.active = true;
    this.tutorial.enabled = true;
    this.king.planDay(ctx.state.day);
    if (fresh || !this.loadedSave) {
      this.customers.planDay(ctx.state.day, this.quests.visitsFor(ctx.state.day));
      this.quests.startTutorialQuest();
      this.save.save();
    } else {
      // Resuming: rebuild the rest of today's schedule if it was empty.
      if (this.customers.pendingVisits.length === 0 && ctx.state.hour < 21) {
        this.customers.planDay(ctx.state.day, this.quests.visitsFor(ctx.state.day));
        for (const v of this.customers.pendingVisits) if (v.hour < ctx.state.hour) v.spawned = true;
      }
    }
  }

  /** The open world is for PC (mouse + keyboard); phones and tablets get the region list. */
  get openWorld(): boolean {
    const coarse = window.matchMedia?.('(pointer: coarse)').matches && !window.matchMedia?.('(pointer: fine)').matches;
    return !isMobileDevice() && !coarse && !document.documentElement.classList.contains('touch');
  }

  private nextDay(): void {
    const ctx = this.ctx;
    this.garden.exit();
    this.outdoor.exit(false);
    ctx.ui.openPanel(null);
    this.customers.clearAll();
    this.nobert.dismiss();
    this.king.dismiss();
    this.day.startNextDay();
    this.customers.planDay(ctx.state.day, this.quests.visitsFor(ctx.state.day));
    ctx.renderer.rig.setPreset(ctx.shop.presets.overview);
    this.save.save();
  }

  private quitToTitle(): void {
    this.save.save();
    location.reload();
  }

  private key(code: string, e?: KeyboardEvent): void {
    const ui = this.game.ui;
    if (!this.game.playing) {
      if (code === 'Escape') ui.closeAll();
      return;
    }
    if (this.summary.isOpen) return;
    // The key under Esc (` on US, " on Turkish Q keyboards): admin menu.
    if (code === 'Backquote' || e?.key === '"' || e?.key === '`' || e?.key === 'é') {
      e?.preventDefault();
      ui.togglePanel('admin');
      return;
    }
    const mode = this.ctx.mode;
    if (code === 'Escape') {
      if (mode === 'outside') {
        // Esc also drops the mouse capture; the pause card may already be up.
        if (this.outdoor.pauseJustOpened) return;
        if (!ui.closeAll()) this.outdoor.openPause();
        return;
      }
      if (this.ctx.interaction.grab) {
        this.ctx.interaction.cancelGrab();
        return;
      }
      if (!ui.closeAll()) ui.openPanel('menu');
      return;
    }
    if (code === 'KeyB') ui.togglePanel('book');
    if (code === 'KeyC' && mode === 'shop') ui.togglePanel('catalog');
    if (code === 'KeyI') ui.togglePanel('inventory');
    if (code === 'KeyO' && mode === 'shop') ui.togglePanel('door');
    if (code === 'KeyK') ui.togglePanel('achievements');
    if (code === 'KeyH') {
      this.menu.fromTitle = false;
      ui.openPanel('menu');
      this.menu.showView('help');
    }
  }

  private frame(dt: number): void {
    const ctx = this.ctx;
    this.touch.update(this.game.playing && !ctx.ui.panelOpen && ctx.mode === 'shop');
    // The garden grows with the clock, wherever the apprentice is.
    if (this.game.playing) advanceGarden(ctx.state.garden, absHour(ctx.state.day, ctx.state.hour));
    if (this.game.playing) {
      this.hud.update();
      this.save.update(dt);
    }
  }
}
