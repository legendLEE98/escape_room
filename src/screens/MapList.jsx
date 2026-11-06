import { useEffect, useState } from 'react';
import { useBackdropDismiss } from './useBackdropDismiss.js';
import { listMaps, createMap, updateMapMeta, deleteMap, deployMap, undeployMap } from '../data/maps.js';

function MapMetaModal({ map, onCancel, onSave, onDelete, onDeploy, onUndeploy }) {
  const backdropProps = useBackdropDismiss(onCancel);
  const [deployBusy, setDeployBusy] = useState(false);
  const [deployError, setDeployError] = useState('');
  const [copied, setCopied] = useState(false);

  const runDeployAction = async (action) => {
    if (deployBusy) return;
    setDeployBusy(true);
    setDeployError('');
    try {
      await action();
    } catch (error) {
      setDeployError(error.message);
    } finally {
      setDeployBusy(false);
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(map.shareCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setDeployError('복사하지 못했습니다. 코드를 직접 선택해서 복사해 주세요.');
    }
  };
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
    <div className="modal-backdrop" {...backdropProps}>
      <div className="modal">
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

        <div className="map-deploy-section">
          <label>배포</label>
          {map.shareCode ? (
            <div className="map-deploy-code-row">
              <code className="map-deploy-code">{map.shareCode}</code>
              <button type="button" className="map-deploy-copy" onClick={copyCode}>
                {copied ? '복사됨' : '복사'}
              </button>
            </div>
          ) : null}
          <p className="map-deploy-status">
            {map.deploy
              ? `코드로 공유 중 · v${map.releaseVersion}`
              : map.shareCode
                ? `공유가 중단된 상태입니다 (마지막 v${map.releaseVersion})`
                : '아직 배포하지 않았습니다.'}
          </p>
          <p className="auth-hint">배포하면 저장된 맵 정보와 레이아웃이 새 버전으로 공개됩니다. 코드를 아는 사람만 접근할 수 있습니다.</p>
          <div className="map-deploy-actions">
            <button
              type="button"
              className="map-deploy-button"
              disabled={deployBusy}
              onClick={() => runDeployAction(onDeploy)}
            >
              {deployBusy ? '처리 중...' : map.deploy ? '새 버전 배포' : '배포하기'}
            </button>
            {map.deploy && (
              <button
                type="button"
                className="map-deploy-button"
                disabled={deployBusy}
                onClick={() => runDeployAction(onUndeploy)}
              >
                공유 중단
              </button>
            )}
          </div>
          {deployError && <p className="auth-error">{deployError}</p>}
        </div>

        <button
          type="button"
          className="map-delete-button"
          onClick={() => {
            if (window.confirm(`"${map.title}" 맵을 삭제할까요?\n방, 오브젝트, 문 설정이 모두 지워지며 되돌릴 수 없습니다.`)) {
              onDelete();
            }
          }}
        >
          맵 삭제
        </button>
      </div>
    </div>
  );
}

export default function MapList({ onBack, onOpenEditor }) {
  const [maps, setMaps] = useState([]);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [editingMap, setEditingMap] = useState(null);

  const refresh = async () => {
    try {
      setMaps(await listMaps());
      setStatus('ready');
    } catch (error) {
      console.error(error);
      setStatus('error');
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleCreate = async () => {
    try {
      const map = await createMap();
      await refresh();
      setEditingMap(map);
    } catch (error) {
      console.error(error);
      setStatus('error');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMap(editingMap.id);
      setEditingMap(null);
      await refresh();
    } catch (error) {
      console.error(error);
      setStatus('error');
    }
  };

  const handleDeploy = async () => {
    const { shareCode, version } = await deployMap(editingMap.id);
    setEditingMap((current) => ({ ...current, deploy: true, shareCode, releaseVersion: version }));
    await refresh();
  };

  const handleUndeploy = async () => {
    await undeployMap(editingMap.id);
    setEditingMap((current) => ({ ...current, deploy: false }));
    await refresh();
  };

  const handleSaveMeta = async (patch) => {
    try {
      await updateMapMeta(editingMap.id, patch);
      await refresh();
      setEditingMap(null);
    } catch (error) {
      console.error(error);
      setStatus('error');
    }
  };

  return (
    <div className="screen map-list-screen">
      <div className="map-list-heading">
        <h1>맵 제작</h1>
        <button type="button" className="back-button" onClick={onBack}>
          뒤로가기
        </button>
      </div>

      {status === 'loading' && <p className="map-list-status">맵 목록을 불러오는 중...</p>}
      {status === 'error' && (
        <p className="map-list-status map-list-status-error">
          서버에 연결하지 못했습니다. <button type="button" onClick={refresh}>다시 시도</button>
        </p>
      )}

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
              {map.shareCode && (
                <div className={`map-card-deploy ${map.deploy ? '' : 'is-paused'}`}>
                  {map.deploy ? `배포됨 v${map.releaseVersion}` : '공유 중단'} · {map.shareCode}
                </div>
              )}
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
          onDelete={handleDelete}
          onDeploy={handleDeploy}
          onUndeploy={handleUndeploy}
        />
      )}
    </div>
  );
}
