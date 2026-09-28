// Headless Babylon.js host. Babylon never draws a pixel in Witch's Brew:
// it runs a NullEngine scene that owns the Havok physics world and CPU
// particle simulations. Three.js does all rendering and reads the results
// through the physics bridge / particle source abstractions.

import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Logger } from '@babylonjs/core/Misc/logger.js';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin.js';
import '@babylonjs/core/Physics/joinedPhysicsEngineComponent.js';
import '@babylonjs/core/Physics/v2/physicsEngineComponent.js';
import HavokPhysics from '@babylonjs/havok';
import havokWasmUrl from '@babylonjs/havok/lib/esm/HavokPhysics.wasm?url';

export class BabylonCore {
  readonly engine: NullEngine;
  readonly scene: Scene;
  readonly havok: HavokPlugin;

  private constructor(engine: NullEngine, scene: Scene, havok: HavokPlugin) {
    this.engine = engine;
    this.scene = scene;
    this.havok = havok;
  }

  static async create(): Promise<BabylonCore> {
    Logger.LogLevels = Logger.WarningLogLevel | Logger.ErrorLogLevel;
    const hk = await HavokPhysics({ locateFile: () => havokWasmUrl });
    const engine = new NullEngine({
      renderWidth: 2,
      renderHeight: 2,
      textureSize: 2,
      deterministicLockstep: false,
      lockstepMaxSteps: 1,
    });
    const scene = new Scene(engine);
    // Same handedness as Three.js so positions/quaternions copy 1:1.
    scene.useRightHandedSystem = true;
    const havok = new HavokPlugin(true, hk);
    scene.enablePhysics(new Vector3(0, -9.81, 0), havok);
    return new BabylonCore(engine, scene, havok);
  }
}
