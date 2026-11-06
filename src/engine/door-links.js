// A door is stored as two independent edge records (one per room it connects,
// each with its own x/z/side in that room's local frame). These helpers pair
// them back up.
export function initDoorLinks(ctx) {
  // The other room's edge for the same door: matched by doorId when there is
  // one, else "the edge in that room that points back at this one".
  function findMirrorEdge(room, targetRoom, edge) {
    const edges = targetRoom.doorEdges || [];
    if (edge.doorId) {
      const byId = edges.find((candidate) => candidate.doorId === edge.doorId);
      if (byId) return byId;
    }
    return edges.find((candidate) => candidate.connectedRoomInstanceId === room.instanceId) || null;
  }
  ctx.findDoorMirrorEdge = findMirrorEdge;

  // Lock state should be a single shared thing — a door isn't unlocked from
  // one side and locked from the other — so both directions resolve to the
  // same "canonical" edge (deterministically whichever room has the smaller
  // instanceId) for every lockType/password/requiredButton read or write. The
  // non-canonical edge's own copies of those fields are simply never touched.
  ctx.resolveCanonicalDoorEdge = (room, edge) => {
    const targetRoom = ctx.rooms.find((candidate) => candidate.instanceId === edge.connectedRoomInstanceId);
    if (!targetRoom || room.instanceId <= targetRoom.instanceId) return { room, edge };
    const mirror = findMirrorEdge(room, targetRoom, edge);
    return mirror ? { room: targetRoom, edge: mirror } : { room, edge };
  };
}
