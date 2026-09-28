// The assembled shop: references to every station plus navigation anchors
// for customers and camera presets. Built by ShopBuilder.

import type * as THREE from 'three';
import type { Cauldron } from '../gameplay/potion/Cauldron';
import type { Hearth } from '../gameplay/potion/Hearth';
import type { Ladle, DrainTap } from '../gameplay/stations/CauldronTools';
import type { Bellows, Damper } from '../gameplay/stations/FireControls';
import type { CuttingBoard, DryingRack, Mortar, Knife, Hammer } from '../gameplay/stations/PrepStations';
import type { Bucket, WaterBarrel } from '../gameplay/stations/Water';
import type { Door, PotionShelf, SupplySource } from '../gameplay/stations/ShopFixtures';
import type { CameraPreset } from '../rendering/three/CameraRig';

export interface ShopAnchors {
  doorOutside: THREE.Vector3;
  doorInside: THREE.Vector3;
  counterSpot: THREE.Vector3;
  queue: THREE.Vector3[];
  browse: THREE.Vector3[];
  mentorSeat: THREE.Vector3;
  serveZone: { minX: number; maxX: number; minZ: number; maxZ: number; y: number };
  coinDrop: THREE.Vector3;
  cashBox: THREE.Vector3;
  frogCure: THREE.Vector3;
}

export interface Shop {
  cauldron: Cauldron;
  hearth: Hearth;
  ladle: Ladle;
  tap: DrainTap;
  bellows: Bellows;
  damper: Damper;
  board: CuttingBoard;
  knife: Knife;
  hammer: Hammer;
  mortar: Mortar;
  rack: DryingRack;
  barrel: WaterBarrel;
  bucket: Bucket;
  shelf: PotionShelf;
  door: Door;
  sources: Map<string, SupplySource>;
  anchors: ShopAnchors;
  presets: Record<'overview' | 'cauldron' | 'table' | 'counter' | 'shelves', CameraPreset>;
  /** Objects shown only when an upgrade is owned. */
  upgradeProps: Map<string, THREE.Object3D>;
  sky: THREE.ShaderMaterial;
  lightShafts: THREE.Mesh[];
  flames: THREE.Mesh[];
}
