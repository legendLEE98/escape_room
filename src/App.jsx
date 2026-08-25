import { useEffect, useRef } from 'react';
import { createScene } from './scene.js';

export default function App() {
  const canvasRef = useRef(null);

  useEffect(() => createScene(canvasRef.current), []);

  return (
    <>
      <canvas ref={canvasRef} id="scene" />

      <header className="mode-bar" aria-label="테스트 모드 선택">
        <div className="brand">
          <span className="brand-mark">ER</span>
          <div>
            <strong>Escape Room Lab</strong>
            <small>Three.js prototype</small>
          </div>
        </div>
        <nav className="mode-switch">
          <button className="mode-button is-active" data-mode="movement">
            움직임 테스트
          </button>
          <button className="mode-button" data-mode="editor">
            에디터 모드
          </button>
        </nav>
      </header>

      <aside className="panel movement-panel">
        <p className="eyebrow">MOVEMENT TEST</p>
        <h1>캐릭터 움직임</h1>
        <p id="movement-status" className="status">
          모델을 불러오는 중입니다.
        </p>

        <label htmlFor="map">테스트 맵</label>
        <select id="map" defaultValue="current">
          <option value="current">기본 테스트 공간</option>
          <option value="office">통합 사무실 맵</option>
        </select>

        <label htmlFor="animation">오징어 샘플</label>
        <select id="animation" disabled>
          <option>불러오는 중...</option>
        </select>

        <p className="help">바닥을 클릭하거나 WASD를 사용해 이동할 수 있습니다.</p>
      </aside>

      <aside className="panel editor-panel" hidden>
        <div className="editor-heading">
          <div>
            <p className="eyebrow">SCENE EDITOR</p>
            <h1>사무실 배치</h1>
          </div>
          <span id="asset-count" className="count-badge">
            0 assets
          </span>
        </div>
        <p id="editor-status" className="status">
          에셋 목록을 불러오는 중입니다.
        </p>

        <label htmlFor="asset-search">에셋 검색</label>
        <input
          id="asset-search"
          type="search"
          placeholder="chair, desk, cabinet..."
          autoComplete="off"
        />
        <select id="asset-select" size="7" aria-label="배치할 GLB 에셋" />
        <button id="add-asset" className="primary-button" disabled>
          선택한 에셋 추가
        </button>

        <div className="divider" />

        <div className="tool-row" aria-label="변형 도구">
          <button className="tool-button is-active" data-transform="translate">
            이동 <kbd>W</kbd>
          </button>
          <button className="tool-button" data-transform="rotate">
            회전 <kbd>E</kbd>
          </button>
          <button className="tool-button" data-transform="scale">
            크기 <kbd>R</kbd>
          </button>
        </div>

        <label htmlFor="placed-select">배치된 객체</label>
        <select id="placed-select" size="5" aria-label="배치된 객체 목록" />

        <div className="action-grid">
          <button id="duplicate-object">복제</button>
          <button id="delete-object" className="danger-button">
            삭제
          </button>
          <button id="save-layout">배치 저장</button>
          <button id="clear-layout">전체 비우기</button>
        </div>

        <p className="help">
          객체를 클릭해 선택하고 축 핸들을 드래그하세요. 배치는 이 브라우저에 자동 저장됩니다.
        </p>
      </aside>

      <div className="editor-hint" hidden>
        <span>좌클릭: 선택</span>
        <span>우클릭 드래그: 카메라 회전</span>
        <span>휠: 확대</span>
      </div>
    </>
  );
}
