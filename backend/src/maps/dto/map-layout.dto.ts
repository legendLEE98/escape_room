import { ColliderShape } from '../map-object.entity';
import { DoorLockType } from '../map-door.entity';
import { DoorSide } from '../map-door-edge.entity';
import { InteractionType, ChoiceOption } from '../map-interaction.entity';

// Mirrors the exact shape ctx.serializeLayout() produces on the frontend
// (src/editor/persistence.js) and ctx.restoreLayout() consumes. `id` values
// coming in from the editor are session-local ("room-N"/"obj-N") and only
// need to be consistent *within one request* — the save pass below
// generates real DB uuids and remaps every cross-reference. `id` values
// going out are real DB uuids directly (persistence.js treats them as
// opaque strings either way, so no "room-"/"obj-" prefix is needed).

export interface LayoutInteractionDto {
  interactionType: InteractionType;
  bgImageUrl: string | null;
  memoText: string | null;
  choiceOptions: ChoiceOption[] | null;
}

export interface LayoutObjectDto {
  id: string;
  name: string;
  glbUrl: string | null;
  transform: {
    position: number[];
    rotation: number[];
    scale: number[];
  };
  castShadow: boolean;
  receiveShadow: boolean;
  blocksMovement: boolean;
  colliderShape: ColliderShape;
  useGravity: boolean;
  isSpawnPoint: boolean;
  visible: boolean;
  parentObjectId: string | null;
  interaction: LayoutInteractionDto | null;
}

export interface LayoutDoorEdgeDto {
  x: number;
  z: number;
  side: DoorSide;
  connectedRoomId: string | null;
  doorId: string | null;
  lockType: DoorLockType;
  password: string;
  requiredButtonId: string | null;
}

// A door that leads out of the map (reaching it clears the game). Its lock
// fields are the same as a door's; `exitId` plays the role of `doorId`.
export interface LayoutExitEdgeDto {
  x: number;
  z: number;
  side: DoorSide;
  exitId: string | null;
  lockType: DoorLockType;
  password: string;
  requiredButtonId: string | null;
}

export interface LayoutRoomDto {
  id: string;
  roomName: string;
  isStartRoom: boolean;
  initialSpawnPos: number[];
  floorCells: Array<{ x: number; z: number }> | null;
  doorEdges: LayoutDoorEdgeDto[];
  exitEdges?: LayoutExitEdgeDto[]; // absent in layouts saved before exits existed
  worldOffset: { x: number; z: number };
  objects: LayoutObjectDto[];
}

export interface MapLayoutDto {
  rooms: LayoutRoomDto[];
}
