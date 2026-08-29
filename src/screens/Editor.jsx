import { useEffect, useRef } from 'react';
import { createScene } from '../editor/index.js';

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
          <button className="mode-button" data-mode="roomBuilder">
            방 수정
          </button>
          <button className="mode-button" data-mode="movement">
            플레이 테스트
          </button>
        </nav>

        <nav className="view-switch" aria-label="카메라 보기 전환">
          <button className="tool-button" data-view="isometric">
            아이소메트릭 뷰
          </button>
          <button className="tool-button" data-view="top">
            탑 뷰
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
          <nav className="right-tabs" aria-label="사이드바 탭">
            <button type="button" className="right-tab is-active" data-tab="objects">
              오브젝트
            </button>
            <button type="button" className="right-tab" data-tab="properties">
              속성
            </button>
            <button type="button" className="right-tab" data-tab="interaction">
              상호작용
            </button>
          </nav>

          <section className="right-tab-panel" data-tab-panel="objects">
            <div id="hierarchy-header" className="hierarchy-header">
              <select id="hierarchy-room-select" className="hierarchy-room-select" aria-label="현재 방 선택" />
              <button
                type="button"
                id="hierarchy-room-rename"
                className="hierarchy-room-icon-button"
                aria-label="방 이름 변경"
                title="방 이름 변경"
              />
              <button
                type="button"
                id="hierarchy-room-delete"
                className="hierarchy-room-icon-button"
                aria-label="방 삭제"
                title="방 삭제"
              />
            </div>
            <ul id="hierarchy-list" className="hierarchy-list" aria-label="배치된 객체 목록" />
            <div id="hierarchy-footer" className="hierarchy-footer">
              <button
                type="button"
                id="add-room"
                className="hierarchy-toolbar-icon"
                aria-label="방 추가"
                title="새 방 추가"
              />
              <button
                type="button"
                id="add-empty-object"
                className="hierarchy-toolbar-icon"
                aria-label="빈 오브젝트 추가"
                title="빈 오브젝트 추가"
              />
            </div>
          </section>

          <section className="right-tab-panel" data-tab-panel="properties" hidden>
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

              <label className="checkbox-row" htmlFor="inspector-blocks-movement">
                <input id="inspector-blocks-movement" type="checkbox" />
                이동 차단 (캐릭터가 못 지나감)
              </label>

              <label htmlFor="inspector-collider-shape">충돌 모양</label>
              <select id="inspector-collider-shape">
                <option value="box">상자</option>
                <option value="cylinder">원기둥</option>
              </select>

              <label className="checkbox-row" htmlFor="inspector-use-gravity">
                <input id="inspector-use-gravity" type="checkbox" />
                중력 적용 (바닥/다른 오브젝트 위에 자동으로 놓기)
              </label>
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

          <section className="right-tab-panel" data-tab-panel="interaction" hidden>
            <p id="interaction-empty" className="help">
              오브젝트를 선택하면 상호작용 설정이 여기에 표시됩니다.
            </p>

            <div id="interaction-body" hidden>
              <div id="interaction-none-state">
                <button type="button" id="interaction-add-button">
                  + 상호작용 추가
                </button>
                <div id="interaction-type-choices" hidden>
                  <button type="button" data-interaction-type="memo">
                    메모
                  </button>
                  <button type="button" data-interaction-type="choice">
                    선택지
                  </button>
                  <button type="button" data-interaction-type="image">
                    이미지
                  </button>
                </div>
              </div>

              <div id="interaction-active-state" hidden>
                <div className="interaction-active-header">
                  <span id="interaction-active-label" />
                  <button type="button" id="interaction-remove-button">
                    상호작용 삭제
                  </button>
                </div>

                <div id="interaction-memo-fields" hidden>
                  <label htmlFor="interaction-memo-text">메모 내용</label>
                  <textarea id="interaction-memo-text" rows={4} />
                </div>

                <div id="interaction-choice-fields" hidden>
                  <div id="interaction-choice-list" />
                  <button type="button" id="interaction-choice-add-button">
                    + 선택지 추가
                  </button>
                </div>

                <div id="interaction-image-fields" hidden>
                  <label htmlFor="inspector-bg-image">2D 이미지 (로컬 파일)</label>
                  <input id="inspector-bg-image" type="file" accept="image/*" />
                  <img id="inspector-bg-preview" alt="" hidden />
                </div>
              </div>
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

      <div id="interaction-picker" className="interaction-picker" hidden>
        <p className="interaction-picker-title">조사할 곳을 선택하세요</p>
        <div id="interaction-picker-list" className="interaction-picker-list" />
      </div>

      <div id="memo-modal" className="memo-modal-overlay" hidden>
        <div className="memo-modal">
          <button type="button" id="memo-modal-close" className="memo-modal-close" aria-label="닫기">
            ×
          </button>
          <p id="memo-modal-text" className="memo-modal-text" />
        </div>
      </div>

      <div id="choice-modal" className="choice-modal-overlay" hidden>
        <div className="choice-modal">
          <button type="button" id="choice-modal-close" className="choice-modal-close" aria-label="닫기">
            ×
          </button>
          <div id="choice-modal-options" className="choice-modal-options" />
          <p id="choice-modal-result" className="choice-modal-result" hidden />
        </div>
      </div>

      <div id="room-builder-name-panel" className="room-builder-name-panel" hidden>
        <label htmlFor="room-builder-name">방 이름</label>
        <input id="room-builder-name" type="text" />
      </div>

      <div id="room-builder-panel" className="room-builder-panel" hidden>
        <p id="room-builder-status" className="room-builder-status" hidden>
          탑뷰에서 드래그해서 바닥 사각형을 그려주세요.
        </p>
        <div className="room-builder-actions">
          <button type="button" id="room-builder-cancel">
            취소
          </button>
          <button type="button" id="room-builder-finish" className="primary-button" disabled>
            적용
          </button>
        </div>
      </div>
    </>
  );
}
