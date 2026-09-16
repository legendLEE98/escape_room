import { useState } from 'react';
import { listGameRooms, createGameRoom, deleteGameRoom } from '../data/gameRooms.js';
import { listMaps } from '../data/maps.js';

function GameRoomCreateModal({ maps, onCancel, onCreate }) {
  const [title, setTitle] = useState('');
  const [mapId, setMapId] = useState(maps[0]?.id ?? '');
  const selectedMap = maps.find((map) => map.id === mapId) ?? maps[0] ?? null;
  const [maxUser, setMaxUser] = useState(selectedMap?.maxUser ?? 4);

  const handleMapChange = (event) => {
    const nextMapId = event.target.value;
    setMapId(nextMapId);
    const nextMap = maps.find((map) => map.id === nextMapId);
    if (nextMap) setMaxUser(nextMap.maxUser);
  };

  const handleCreate = () => {
    if (!selectedMap) return;
    onCreate({
      title,
      mapId: selectedMap.id,
      maxUser: Math.min(selectedMap.maxUser, Math.max(selectedMap.minUser, maxUser)),
    });
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <h2>방 만들기</h2>

        {maps.length === 0 ? (
          <p className="lobby-empty-hint">먼저 맵 제작에서 맵을 하나 만들어야 방을 만들 수 있습니다.</p>
        ) : (
          <>
            <label htmlFor="game-room-title">방 이름</label>
            <input
              id="game-room-title"
              type="text"
              placeholder={selectedMap ? `${selectedMap.title} 방` : ''}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />

            <label htmlFor="game-room-map">맵 선택</label>
            <select id="game-room-map" value={mapId} onChange={handleMapChange}>
              {maps.map((map) => (
                <option key={map.id} value={map.id}>
                  {map.title}
                </option>
              ))}
            </select>

            <label htmlFor="game-room-max-user">최대 인원</label>
            <input
              id="game-room-max-user"
              type="number"
              min={selectedMap?.minUser ?? 1}
              max={selectedMap?.maxUser ?? 4}
              value={maxUser}
              onChange={(event) => setMaxUser(Number(event.target.value))}
            />
          </>
        )}

        <div className="action-grid">
          <button type="button" onClick={onCancel}>
            취소
          </button>
          <button type="button" className="primary-button" disabled={!selectedMap} onClick={handleCreate}>
            만들기
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Lobby({ onBack }) {
  const [rooms, setRooms] = useState(() => listGameRooms());
  const [maps] = useState(() => listMaps());
  const [isCreating, setIsCreating] = useState(false);

  const refresh = () => setRooms(listGameRooms());

  const handleCreate = (input) => {
    createGameRoom(input);
    refresh();
    setIsCreating(false);
  };

  const handleDelete = (id) => {
    deleteGameRoom(id);
    refresh();
  };

  const mapTitle = (mapId) => maps.find((map) => map.id === mapId)?.title ?? '알 수 없는 맵';

  return (
    <div className="screen lobby-screen">
      <div className="lobby-heading">
        <h1>게임방</h1>
        <button type="button" className="back-button" onClick={onBack}>
          뒤로가기
        </button>
      </div>

      {rooms.length === 0 ? (
        <p className="lobby-placeholder">아직 만들어진 방이 없습니다.</p>
      ) : (
        <div className="lobby-room-list">
          {rooms.map((room) => (
            <div key={room.id} className="lobby-room-card">
              <div className="lobby-room-card-main">
                <span className="lobby-room-card-title">{room.title}</span>
                <span className="lobby-room-card-map">{mapTitle(room.mapId)}</span>
              </div>
              <div className="lobby-room-card-side">
                <span className="lobby-room-card-players">
                  {room.currentUser} / {room.maxUser}
                </span>
                <button
                  type="button"
                  className="lobby-room-card-delete"
                  onClick={() => handleDelete(room.id)}
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button type="button" className="lobby-create-button" onClick={() => setIsCreating(true)}>
        + 방 만들기
      </button>

      {isCreating && (
        <GameRoomCreateModal maps={maps} onCancel={() => setIsCreating(false)} onCreate={handleCreate} />
      )}
    </div>
  );
}
