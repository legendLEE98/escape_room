import { useEffect, useState } from 'react';
import { listMaps } from '../data/maps.js';
import { createGameRoom } from '../data/gameRooms.js';
import { resolvePlayerIdentity } from '../data/auth.js';
import {
  addRecentMapByCode,
  listRecentMaps,
  recordRecentMap,
  removeRecentMap,
} from '../data/mapLibrary.js';

const TABS = [
  { id: 'mine', label: '내 게임' },
  { id: 'recent', label: '최근 플레이 게임' },
];

export default function CreateRoom({ user, onBack, onCreated }) {
  const isRegistered = user?.kind === 'user';
  const [tab, setTab] = useState('mine');
  const [myMaps, setMyMaps] = useState([]);
  const [recentMaps, setRecentMaps] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [selectedCode, setSelectedCode] = useState(null);

  const [title, setTitle] = useState('');
  const [maxUser, setMaxUser] = useState(4);

  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState('');
  const [codeBusy, setCodeBusy] = useState(false);
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  const refreshRecent = () =>
    listRecentMaps()
      .then(setRecentMaps)
      .catch((error) => {
        console.error(error);
        setLoadError('최근 플레이한 맵을 불러오지 못했습니다.');
      });

  useEffect(() => {
    refreshRecent();
    if (!isRegistered) return;
    // Only maps that are currently shared can be played.
    listMaps()
      .then((maps) =>
        setMyMaps(
          maps
            .filter((map) => map.deploy && map.shareCode)
            .map((map) => ({
              code: map.shareCode,
              title: map.title,
              difficulty: map.difficulty,
              minUser: map.minUser,
              maxUser: map.maxUser,
              mapDesc: map.mapDesc,
              ownerNickname: user.nickname,
              version: map.releaseVersion,
              available: true,
            })),
        ),
      )
      .catch((error) => {
        console.error(error);
        setLoadError('내 게임을 불러오지 못했습니다.');
      });
  }, [isRegistered]);

  const visibleMaps = tab === 'mine' ? myMaps : recentMaps;
  const selectedMap = visibleMaps.find((map) => map.code === selectedCode && map.available) ?? null;

  const selectMap = (map) => {
    setSelectedCode(map.code);
    setMaxUser(map.maxUser);
    setTitle('');
  };

  const switchTab = (nextTab) => {
    setTab(nextTab);
    setSelectedCode(null);
  };

  const handleAddCode = async (event) => {
    event.preventDefault();
    if (!codeInput.trim() || codeBusy) return;
    setCodeBusy(true);
    setCodeError('');
    try {
      const map = await addRecentMapByCode(codeInput);
      setCodeInput('');
      await refreshRecent();
      selectMap(map);
    } catch (error) {
      setCodeError(error.message);
    } finally {
      setCodeBusy(false);
    }
  };

  const handleRemoveRecent = async (code) => {
    removeRecentMap(code);
    if (selectedCode === code) setSelectedCode(null);
    await refreshRecent();
  };

  const handleCreate = async () => {
    // 맵 생성 중일 때 / 맵을 고르지 않았을 때
    if (!selectedMap || creating) return;
    // 방 생성 대기 중
    setCreating(true);
    setCreateError('');
    try {
      // 사용자 체크
      await resolvePlayerIdentity();
      const room = await createGameRoom({
        title: title || `${selectedMap.title} 방`,
        mapCode: selectedMap.code,
        maxUser,
      });
      recordRecentMap(selectedMap.code);
      onCreated(room);
    } catch (error) {
      setCreateError(error.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="screen split-page">
      <div className="split-main">
        <div className="split-toolbar">
          <h1 className="split-title">방 만들기</h1>
          <button type="button" className="back-button split-toolbar-back" onClick={onBack}>
            뒤로가기
          </button>
        </div>

        <div className="page-tabs" role="tablist">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`page-tab ${tab === id ? 'is-active' : ''}`}
              onClick={() => switchTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'recent' && (
          <>
            <form className="map-code-form" onSubmit={handleAddCode}>
              <input
                type="text"
                className="map-code-input"
                placeholder="맵 코드로 추가 (예: K7M2QX4P)"
                maxLength={8}
                autoComplete="off"
                spellCheck={false}
                value={codeInput}
                onChange={(event) => setCodeInput(event.target.value.toUpperCase())}
              />
              <button type="submit" className="map-code-submit" disabled={codeBusy || !codeInput.trim()}>
                {codeBusy ? '확인 중...' : '추가'}
              </button>
            </form>
            {codeError && <p className="map-code-error">{codeError}</p>}
          </>
        )}
        {loadError && <p className="map-code-error">{loadError}</p>}

        {tab === 'mine' && !isRegistered ? (
          <p className="lobby-placeholder">로그인하면 내가 만든 게임이 여기에 표시됩니다.</p>
        ) : visibleMaps.length === 0 ? (
          <p className="lobby-placeholder">
            {tab === 'mine'
              ? '배포한 맵이 없습니다. 맵 제작에서 맵을 배포하면 여기에 나타납니다.'
              : '최근 플레이한 맵이 없습니다. 맵 코드를 입력해 추가해 보세요.'}
          </p>
        ) : (
          <ul className="map-pick-list">
            {visibleMaps.map((map) => (
              <li key={map.code}>
                <button
                  type="button"
                  disabled={!map.available}
                  className={`map-pick-item ${map.code === selectedCode ? 'is-selected' : ''} ${
                    map.available ? '' : 'is-unavailable'
                  }`}
                  onClick={() => selectMap(map)}
                >
                  <span className="map-pick-main">
                    <span className="map-pick-title">{map.title}</span>
                    <span className="map-pick-meta">
                      {map.available
                        ? `${'★'.repeat(map.difficulty)} · ${map.minUser}~${map.maxUser}명 · ${map.ownerNickname}`
                        : '공유가 중단되었거나 삭제된 맵입니다'}
                    </span>
                  </span>
                  <span className="map-pick-code">{map.code}</span>
                </button>
                {tab === 'recent' && (
                  <button
                    type="button"
                    className="map-pick-remove"
                    aria-label={`${map.title} 목록에서 제거`}
                    onClick={() => handleRemoveRecent(map.code)}
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <aside className="split-side">
        {selectedMap ? (
          <div className="room-info">
            <div className="room-info-header">
              <h2>{selectedMap.title}</h2>
              <span className="room-info-status">v{selectedMap.version}</span>
            </div>
            <dl className="room-info-list">
              <div>
                <dt>난이도</dt>
                <dd className="room-info-stars">
                  {'★'.repeat(selectedMap.difficulty)}
                  {'☆'.repeat(5 - selectedMap.difficulty)}
                </dd>
              </div>
              <div>
                <dt>제작자</dt>
                <dd>{selectedMap.ownerNickname}</dd>
              </div>
              <div>
                <dt>권장 인원</dt>
                <dd>
                  {selectedMap.minUser}~{selectedMap.maxUser}명
                </dd>
              </div>
            </dl>
            <div className="room-info-concept">
              <h3>컨셉</h3>
              <p>{selectedMap.mapDesc || '제작자가 등록한 설명이 없습니다.'}</p>
            </div>

            <div className="room-form">
              <label htmlFor="room-title">방 이름</label>
              <input
                id="room-title"
                type="text"
                maxLength={40}
                placeholder={`${selectedMap.title} 방`}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
              <label htmlFor="room-max-user">최대 인원</label>
              <input
                id="room-max-user"
                type="number"
                min={selectedMap.minUser}
                max={selectedMap.maxUser}
                value={maxUser}
                onChange={(event) => setMaxUser(Number(event.target.value))}
              />
              {createError && <p className="map-code-error">{createError}</p>}
              <button type="button" className="primary-button room-form-submit" disabled={creating} onClick={handleCreate}>
                {creating ? '만드는 중...' : '방 만들기'}
              </button>
            </div>
          </div>
        ) : (
          <p className="split-side-empty">플레이할 맵을 선택하면 정보와 방 설정이 여기에 표시됩니다.</p>
        )}
      </aside>
    </div>
  );
}
