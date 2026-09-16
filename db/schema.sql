-- Escape the Room — PostgreSQL schema
--
-- Mirrors the editor's save format exactly (see src/editor/persistence.js and
-- md/DATABASE_AND_JSON.md). This file is the source of truth for the schema —
-- apply it with:
--
--   docker exec -i escapetheroom-postgres psql -U escapetheroom -d escapetheroom < db/schema.sql
--
-- Safe to re-run: drops and recreates every table below. Only ever run this
-- against a DB you're OK wiping (there is no data worth preserving yet).
--
-- This is map/room/object authoring data only — durable, written by whoever
-- builds the map. Per-session play state (pressed buttons, unlocked doors,
-- inventory, player position) does NOT live here; it's volatile per-game-room
-- data that belongs in Redis instead. See md/DATABASE_AND_JSON.md's
-- "Redis — 게임방 진행 상태" section for that key layout.

BEGIN;

DROP TABLE IF EXISTS map_interaction CASCADE;
DROP TABLE IF EXISTS map_door_edge CASCADE;
DROP TABLE IF EXISTS map_door CASCADE;
DROP TABLE IF EXISTS map_object CASCADE;
DROP TABLE IF EXISTS map_room CASCADE;
DROP TABLE IF EXISTS map_info CASCADE;

-- ---------------------------------------------------------------------------
-- map_info — one row per map, shown in the map list.
-- ---------------------------------------------------------------------------
CREATE TABLE map_info (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       varchar(100) NOT NULL,
  filter      varchar(50) NOT NULL DEFAULT 'DEFAULT',
  difficulty  smallint NOT NULL DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 5),
  map_desc    text,
  min_user    smallint NOT NULL DEFAULT 1 CHECK (min_user >= 1),
  max_user    smallint NOT NULL DEFAULT 4 CHECK (max_user >= min_user),
  deploy      boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_map_info_deploy_filter ON map_info (deploy, filter);

-- ---------------------------------------------------------------------------
-- map_room — one row per room. floor_cells is the source of truth walls are
-- generated from (client-side, not stored separately). world_offset is
-- editor-only layout data, unused by actual gameplay (instant-teleport doors).
-- ---------------------------------------------------------------------------
CREATE TABLE map_room (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id             uuid NOT NULL REFERENCES map_info(id) ON DELETE CASCADE,
  room_name          varchar(100) NOT NULL,
  is_start_room      boolean NOT NULL DEFAULT false,
  initial_spawn_pos  jsonb NOT NULL DEFAULT '[0, 0, 0]'::jsonb,
  floor_cells        jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{ "x": int, "z": int }, ...]
  world_offset       jsonb NOT NULL DEFAULT '{"x": 0, "z": 0}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_map_room_map_id ON map_room (map_id);

-- ---------------------------------------------------------------------------
-- map_object — 3D objects placed in a room. position/rotation/scale are
-- [x,y,z] arrays to match Vector3/Euler.toArray() on the frontend directly.
-- ---------------------------------------------------------------------------
CREATE TABLE map_object (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id           uuid NOT NULL REFERENCES map_room(id) ON DELETE CASCADE,
  name              varchar(100) NOT NULL,
  glb_url           varchar(255), -- null = empty object (no geometry)
  position          jsonb NOT NULL DEFAULT '[0, 0, 0]'::jsonb,
  rotation          jsonb NOT NULL DEFAULT '[0, 0, 0]'::jsonb,
  scale             jsonb NOT NULL DEFAULT '[1, 1, 1]'::jsonb,
  cast_shadow       boolean NOT NULL DEFAULT true,
  receive_shadow    boolean NOT NULL DEFAULT true,
  blocks_movement   boolean NOT NULL DEFAULT true,
  collider_shape    varchar(20) NOT NULL DEFAULT 'box' CHECK (collider_shape IN ('box', 'cylinder')),
  use_gravity       boolean NOT NULL DEFAULT false,
  is_spawn_point    boolean NOT NULL DEFAULT false,
  visible           boolean NOT NULL DEFAULT true,
  parent_object_id  uuid REFERENCES map_object(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_map_object_room_id ON map_object (room_id);
CREATE INDEX idx_map_object_parent_object_id ON map_object (parent_object_id);

-- ---------------------------------------------------------------------------
-- map_door — one row per door (matches doorId in the JSON). Lock state lives
-- here exactly once, never duplicated per side, so the "locked on one side,
-- unlocked on the other" contradiction the editor's canonical-edge logic
-- guards against can't happen at the schema level at all.
-- ---------------------------------------------------------------------------
CREATE TABLE map_door (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lock_type                   varchar(20) NOT NULL DEFAULT 'none'
                               CHECK (lock_type IN ('none', 'button', 'password', 'key')),
  password                    varchar(100) NOT NULL DEFAULT '',
  required_button_object_id   uuid REFERENCES map_object(id) ON DELETE SET NULL,
  created_at                  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- map_door_edge — per-room half of a door: which wall cell/side it opens on,
-- and which room it leads to. Always exactly two rows per map_door (one per
-- side), each with its own geometry but sharing the same door_id.
-- ---------------------------------------------------------------------------
CREATE TABLE map_door_edge (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  door_id            uuid NOT NULL REFERENCES map_door(id) ON DELETE CASCADE,
  room_id            uuid NOT NULL REFERENCES map_room(id) ON DELETE CASCADE,
  x                  smallint NOT NULL,
  z                  smallint NOT NULL,
  side               varchar(1) NOT NULL CHECK (side IN ('N', 'S', 'W', 'E')),
  connected_room_id  uuid NOT NULL REFERENCES map_room(id) ON DELETE CASCADE,
  created_at         timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (door_id, room_id)
);
CREATE INDEX idx_map_door_edge_room_id ON map_door_edge (room_id);
CREATE INDEX idx_map_door_edge_door_id ON map_door_edge (door_id);

-- ---------------------------------------------------------------------------
-- map_interaction — at most one per object (1:1). Only the columns relevant
-- to interaction_type are meaningful; the rest stay null.
-- ---------------------------------------------------------------------------
CREATE TABLE map_interaction (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id         uuid NOT NULL UNIQUE REFERENCES map_object(id) ON DELETE CASCADE,
  interaction_type  varchar(20) NOT NULL CHECK (interaction_type IN ('memo', 'choice', 'image', 'button')),
  memo_text         text,                    -- interaction_type = 'memo'
  choice_options    jsonb,                   -- interaction_type = 'choice': [{ "label", "resultText" }, ...]
  bg_image_url      varchar(255),            -- interaction_type = 'image'
  created_at        timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMIT;
