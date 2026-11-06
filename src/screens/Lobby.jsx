import { useEffect, useRef, useState } from 'react';
import { listGameRooms } from '../data/gameRooms.js';

const STATUS_LABEL = { waiting: '대기 중', playing: '진행 중', cleared: '클리어' };

const roomMapTitle = (room) => room.map?.title ?? '알 수 없는 맵';
const REFRESH_INTERVAL_MS = 4000;
const SEARCH_DEBOUNCE_MS = 250;

function RoomInfo({ room, onEnter }) {
  if (!room) {
    return <p className="split-side-empty">방을 선택하면 맵 정보가 여기에 표시됩니다.</p>;
  }

  const map = room.map;
  return (
    <div className="room-info">
      <div className="room-info-header">
        <h2>{room.title}</h2>
        <span className="room-info-status">{STATUS_LABEL[room.status] ?? room.status}</span>
      </div>

      <dl className="room-info-list">
        <div>
          <dt>맵</dt>
          <dd>{roomMapTitle(room)}</dd>
        </div>
        {map && (
          <>
            <div>
              <dt>난이도</dt>
              <dd className="room-info-stars">
                {'★'.repeat(map.difficulty)}
                {'☆'.repeat(5 - map.difficulty)}
              </dd>
            </div>
            <div>
              <dt>제작자</dt>
              <dd>{map.ownerNickname}</dd>
            </div>
            <div>
              <dt>버전</dt>
              <dd>v{map.version}</dd>
            </div>
          </>
        )}
        <div>
          <dt>방장</dt>
          <dd>{room.hostNickname}</dd>
        </div>
        <div>
          <dt>인원</dt>
          <dd>
            {room.currentUser} / {room.maxUser}명
          </dd>
        </div>
      </dl>

      {map && (
        <div className="room-info-concept">
          <h3>컨셉</h3>
          <p>{map.mapDesc || '제작자가 등록한 설명이 없습니다.'}</p>
        </div>
      )}

      <div className="room-info-actions">
        <button
          type="button"
          className="primary-button"
          disabled={room.status !== 'waiting' || room.currentUser >= room.maxUser}
          onClick={() => onEnter(room)}
        >
          {room.status !== 'waiting' ? '게임 진행 중' : room.currentUser >= room.maxUser ? '가득 찬 방' : '입장하기'}
        </button>
      </div>
    </div>
  );
}

export default function Lobby({ onBack, onCreateRoom, onEnterRoom }) {
  const [rooms, setRooms] = useState([]);
  const [loadState, setLoadState] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const queryRef = useRef(query);
  queryRef.current = query;

  // Rooms are opened and closed by other people all the time, so the list is
  // re-fetched on a timer (and right away, debounced, when the search changes).
  useEffect(() => {
    let cancelled = false;
    const refresh = () =>
      listGameRooms(queryRef.current)
        .then((list) => {
          if (cancelled) return;
          setRooms(list);
          setLoadState('ready');
        })
        .catch((error) => {
          console.error(error);
          if (!cancelled) setLoadState('error');
        });

    const debounce = setTimeout(refresh, SEARCH_DEBOUNCE_MS);
    const interval = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(debounce);
      clearInterval(interval);
    };
  }, [query]);

  const selectedRoom = rooms.find((room) => room.id === selectedId) ?? null;

  return (
    <div className="screen split-page">
      <div className="split-main">
        <div className="split-toolbar">
          <input
            type="search"
            className="room-search-input"
            placeholder="방 검색"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button type="button" className="toolbar-primary-button" onClick={onCreateRoom}>
            + 방 만들기
          </button>
          <button type="button" className="back-button split-toolbar-back" onClick={onBack}>
            뒤로가기
          </button>
        </div>

        {loadState === 'error' ? (
          <p className="lobby-placeholder">방 목록을 불러오지 못했습니다. 잠시 후 다시 시도합니다.</p>
        ) : loadState === 'loading' ? (
          <p className="lobby-placeholder">방 목록을 불러오는 중...</p>
        ) : rooms.length === 0 ? (
          <p className="lobby-placeholder">
            {query.trim() ? `"${query.trim()}"에 해당하는 방이 없습니다.` : '열려 있는 방이 없습니다. 방 만들기로 첫 방을 열어 보세요.'}
          </p>
        ) : (
          <div className="lobby-room-list">
            {rooms.map((room) => (
              <button
                key={room.id}
                type="button"
                className={`lobby-room-card ${room.id === selectedId ? 'is-selected' : ''}`}
                onClick={() => setSelectedId(room.id)}
              >
                <div className="lobby-room-card-main">
                  <span className="lobby-room-card-title">{room.title}</span>
                  <span className="lobby-room-card-map">{roomMapTitle(room)}</span>
                </div>
                <span className="lobby-room-card-players">
                  {room.currentUser} / {room.maxUser}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <aside className="split-side">
        <RoomInfo room={selectedRoom} onEnter={onEnterRoom} />
      </aside>
    </div>
  );
}
