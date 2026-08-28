import { useState } from 'react';
import { listMaps, createMap, updateMapMeta } from '../data/maps.js';

function MapMetaModal({ map, onCancel, onSave }) {
  const [title, setTitle] = useState(map.title);
  const [difficulty, setDifficulty] = useState(map.difficulty);
  const [minUser, setMinUser] = useState(map.minUser);
  const [maxUser, setMaxUser] = useState(map.maxUser);

  const handleSave = () => {
    const nextMin = Math.max(1, minUser);
    onSave({
      title: title.trim() || '이름 없는 맵',
      difficulty: Math.min(5, Math.max(1, difficulty)),
      minUser: nextMin,
      maxUser: Math.max(nextMin, maxUser),
    });
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <h2>맵 정보 수정</h2>

        <label htmlFor="map-meta-title">맵 이름</label>
        <input
          id="map-meta-title"
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />

        <label htmlFor="map-meta-difficulty">난이도 (1~5)</label>
        <input
          id="map-meta-difficulty"
          type="number"
          min="1"
          max="5"
          value={difficulty}
          onChange={(event) => setDifficulty(Number(event.target.value))}
        />

        <label>인원 (최소 / 최대)</label>
        <div className="vector-row two-col">
          <input
            type="number"
            min="1"
            aria-label="최소 인원"
            value={minUser}
            onChange={(event) => setMinUser(Number(event.target.value))}
          />
          <input
            type="number"
            min="1"
            aria-label="최대 인원"
            value={maxUser}
            onChange={(event) => setMaxUser(Number(event.target.value))}
          />
        </div>

        <div className="action-grid">
          <button type="button" onClick={onCancel}>
            취소
          </button>
          <button type="button" className="primary-button" onClick={handleSave}>
            저장
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MapList({ onBack, onOpenEditor }) {
  const [maps, setMaps] = useState(() => listMaps());
  const [editingMap, setEditingMap] = useState(null);

  const refresh = () => setMaps(listMaps());

  const handleCreate = () => {
    const map = createMap();
    refresh();
    setEditingMap(map);
  };

  const handleSaveMeta = (patch) => {
    updateMapMeta(editingMap.id, patch);
    refresh();
    setEditingMap(null);
  };

  return (
    <div className="screen map-list-screen">
      <div className="map-list-heading">
        <h1>맵 제작</h1>
        <button type="button" className="back-button" onClick={onBack}>
          뒤로가기
        </button>
      </div>

      <div className="map-grid">
        {maps.map((map) => (
          <button
            key={map.id}
            type="button"
            className="map-card"
            onClick={() => onOpenEditor(map.id)}
          >
            <div className="map-card-thumb">평면도 (준비 중)</div>
            <div className="map-card-meta">
              <div className="map-card-title-row">
                <span className="map-card-title">{map.title}</span>
                <span
                  className="map-card-edit"
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation();
                    setEditingMap(map);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return;
                    event.stopPropagation();
                    setEditingMap(map);
                  }}
                >
                  수정
                </span>
              </div>
              <div className="map-card-stars" aria-label={`난이도 ${map.difficulty}`}>
                {'★'.repeat(map.difficulty)}
                {'☆'.repeat(5 - map.difficulty)}
              </div>
              <div className="map-card-players">
                MIN {map.minUser} / MAX {map.maxUser}
              </div>
            </div>
          </button>
        ))}

        <button type="button" className="map-card map-card-new" onClick={handleCreate}>
          + 새 맵
        </button>
      </div>

      {editingMap && (
        <MapMetaModal
          map={editingMap}
          onCancel={() => setEditingMap(null)}
          onSave={handleSaveMeta}
        />
      )}
    </div>
  );
}
