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
import { t } from './core/i18n';
import { ShopSystem } from './gameplay/shop/ShopSystem';
import { Discovery } from './gameplay/potion/Discovery';
import { Expedition } from './gameplay/gathering/Expedition';
import { MapPanel } from './ui/MapPanel';
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
  readonly save: SaveSystem;
  readonly mentor: Mentor;
  readonly expedition: Expedition;
  readonly hud: HUD;
  readonly title: TitleScreen;
  private readonly menu: MenuPanel;
  private readonly summary: SummaryPanel;
  private loadedSave = false;

  /** Developer and playtest hooks (reachable as window.__wb.app.debug). */
  readonly debug = {
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
    this.expedition = new Expedition(ctx, this.customers);
    new Discovery(ctx);
    this.save = new SaveSystem(ctx, this.customers);
    this.mentor = ctx.world.add(new Mentor(ctx, ctx.shop.anchors.mentorSeat), ctx);
    this.customers.mentor = this.mentor;

    // Restore a saved game for the backdrop (and for "Continue").
    if (SaveSystem.hasSave()) this.loadedSave = this.save.load();
    this.shopSystem.apply();
    this.tutorial = new Tutorial(ctx);
    this.atmosphere = new Atmosphere(ctx);

    // UI
    const ui = game.ui;
    ui.registerPanel('book', new BookPanel(ctx));
    ui.registerPanel('catalog', new CatalogPanel(ctx, this.shopSystem));
    ui.registerPanel('inventory', new InventoryPanel(ctx));
    ui.registerPanel('map', new MapPanel(ctx, this.expedition));
    ui.registerPanel('cat', new CatPanel(ctx, this.atmosphere.cat));
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
    game.addSystem(this.tutorial);
    game.addSystem(this.atmosphere);
    game.addSystem({ update: (dt) => this.frame(dt), always: true });

    ctx.input.onKeyDown((code) => this.key(code));

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

  private nextDay(): void {
    const ctx = this.ctx;
    ctx.ui.openPanel(null);
    this.customers.clearAll();
    this.day.startNextDay();
    this.customers.planDay(ctx.state.day, this.quests.visitsFor(ctx.state.day));
    ctx.renderer.rig.setPreset(ctx.shop.presets.overview);
    this.save.save();
  }

  private quitToTitle(): void {
    this.save.save();
    location.reload();
  }

  private key(code: string): void {
    const ui = this.game.ui;
    if (!this.game.playing) {
      if (code === 'Escape') ui.closeAll();
      return;
    }
    if (this.summary.isOpen) return;
    if (code === 'Escape') {
      if (this.ctx.interaction.grab) {
        this.ctx.interaction.cancelGrab();
        return;
      }
      if (!ui.closeAll()) ui.openPanel('menu');
      return;
    }
    if (code === 'KeyB') ui.togglePanel('book');
    if (code === 'KeyC') ui.togglePanel('catalog');
    if (code === 'KeyI') ui.togglePanel('inventory');
    if (code === 'KeyM') ui.togglePanel('map');
    if (code === 'KeyH') {
      this.menu.fromTitle = false;
      ui.openPanel('menu');
      this.menu.showView('help');
    }
  }

  private frame(dt: number): void {
    if (this.game.playing) {
      this.hud.update();
      this.save.update(dt);
    }
  }
}
