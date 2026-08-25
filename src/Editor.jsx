import { useEffect, useRef } from 'react';
import { createScene } from './editor/index.js';

export default function Editor({ mapId, onBack }) {
  const canvasRef = useRef(null);

  useEffect(() => createScene(canvasRef.current, mapId), [mapId]);

  return (
    <>
      <canvas ref={canvasRef} id="scene" />

      <header className="mode-bar" aria-label="테스트 모드 선택">
        <button type="button" className="back-button" onClick={onBack}>
          ‹ 맵 목록
        </button>

        <nav className="mode-switch">
          <button className="mode-button is-active" data-mode="editor">
            에디터 모드
          </button>
          <button className="mode-button" data-mode="movement">
            움직임 테스트
          </button>
        </nav>

        <nav className="view-switch" aria-label="카메라 보기 전환">
          <button className="tool-button is-active" data-view="isometric">
            아이소메트릭
          </button>
          <button className="tool-button" data-view="top">
            탑뷰
          </button>
        </nav>
      </header>

      <aside className="sidebar sidebar-left" data-collapsed="false">
        <button
          type="button"
          id="sidebar-left-toggle"
          className="sidebar-toggle"
          aria-label="에셋 패널 접기/펼치기"
        >
          <span className="sidebar-toggle-icon">‹</span>
        </button>
        <div className="sidebar-body">
          <div className="sidebar-heading">
            <p className="eyebrow">ASSETS</p>
            <span id="asset-count" className="count-badge">
              0 assets
            </span>
          </div>

          <label htmlFor="asset-search">에셋 검색</label>
          <input
            id="asset-search"
            type="search"
            placeholder="chair, desk, cabinet..."
            autoComplete="off"
          />
          <canvas id="asset-preview" aria-label="선택한 에셋 미리보기" />
          <div
            id="asset-select"
            className="asset-grid"
            role="listbox"
            aria-label="배치할 GLB 에셋"
          />
          <button id="add-asset" className="primary-button" disabled>
            선택한 에셋 추가
          </button>

          <p id="editor-status" className="status">
            에셋 목록을 불러오는 중입니다.
          </p>
        </div>
      </aside>

      <aside className="sidebar sidebar-right" data-collapsed="false">
        <button
          type="button"
          id="sidebar-right-toggle"
          className="sidebar-toggle"
          aria-label="하이라키/인스펙터 패널 접기/펼치기"
        >
          <span className="sidebar-toggle-icon">›</span>
        </button>
        <div className="sidebar-body sidebar-right-body">
          <section className="hierarchy-panel">
            <div className="sidebar-heading">
              <p className="eyebrow">HIERARCHY</p>
            </div>
            <ul id="hierarchy-list" className="hierarchy-list" aria-label="배치된 객체 목록" />
          </section>

          <div className="sidebar-divider-h" />

          <section className="inspector-panel">
            <div className="sidebar-heading">
              <p className="eyebrow">INSPECTOR</p>
            </div>

            <p id="inspector-empty" className="help">
              오브젝트를 선택하면 속성이 여기에 표시됩니다.
            </p>

            <div id="inspector-body" hidden>
              <div className="tool-row" aria-label="변형 도구">
                <button className="tool-button is-active" data-transform="translate">
                  이동 <kbd>Q</kbd>
                </button>
                <button className="tool-button" data-transform="rotate">
                  회전 <kbd>E</kbd>
                </button>
                <button className="tool-button" data-transform="scale">
                  크기 <kbd>R</kbd>
                </button>
              </div>

              <label>위치 (X, Y, Z)</label>
              <div className="vector-row">
                <div className="vector-field">
                  <span className="vector-field-axis axis-x">X</span>
                  <input id="inspector-pos-x" type="number" step="0.1" aria-label="위치 X" />
                </div>
                <div className="vector-field">
                  <span className="vector-field-axis axis-y">Y</span>
                  <input id="inspector-pos-y" type="number" step="0.1" aria-label="위치 Y" />
                </div>
                <div className="vector-field">
                  <span className="vector-field-axis axis-z">Z</span>
                  <input id="inspector-pos-z" type="number" step="0.1" aria-label="위치 Z" />
                </div>
              </div>

              <label>회전 (도, X, Y, Z)</label>
              <div className="vector-row">
                <div className="vector-field">
                  <span className="vector-field-axis axis-x">X</span>
                  <input id="inspector-rot-x" type="number" step="1" aria-label="회전 X" />
                </div>
                <div className="vector-field">
                  <span className="vector-field-axis axis-y">Y</span>
                  <input id="inspector-rot-y" type="number" step="1" aria-label="회전 Y" />
                </div>
                <div className="vector-field">
                  <span className="vector-field-axis axis-z">Z</span>
                  <input id="inspector-rot-z" type="number" step="1" aria-label="회전 Z" />
                </div>
              </div>

              <label>크기 (X, Y, Z)</label>
              <div className="vector-row">
                <div className="vector-field">
                  <span className="vector-field-axis axis-x">X</span>
                  <input id="inspector-scale-x" type="number" step="0.1" aria-label="크기 X" />
                </div>
                <div className="vector-field">
                  <span className="vector-field-axis axis-y">Y</span>
                  <input id="inspector-scale-y" type="number" step="0.1" aria-label="크기 Y" />
                </div>
                <div className="vector-field">
                  <span className="vector-field-axis axis-z">Z</span>
                  <input id="inspector-scale-z" type="number" step="0.1" aria-label="크기 Z" />
                </div>
              </div>

              <label htmlFor="inspector-bg-image">연결할 2D 이미지 (로컬 파일)</label>
              <input id="inspector-bg-image" type="file" accept="image/*" />
              <img id="inspector-bg-preview" alt="" hidden />
            </div>

            <div className="action-grid">
              <button id="duplicate-object" disabled>
                복제
              </button>
              <button id="delete-object" className="danger-button" disabled>
                삭제
              </button>
            </div>
          </section>
        </div>
      </aside>

      <div className="editor-hint">
        <span>좌클릭: 선택</span>
        <span>우클릭 드래그: 카메라 회전</span>
        <span>휠: 확대</span>
        <span>WASD: 카메라 이동</span>
      </div>
    </>
  );
}
