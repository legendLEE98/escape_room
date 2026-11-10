import * as THREE from 'three';
import { CHARACTER_RADIUS } from '../../engine/player-controller.js';
import { INTERACTION_RADIUS } from '../../engine/interactions.js';

// What the editor's play-test shows on screen: the debug rings and the DOM
// modals behind `ctx.ui` (the contract the engine's interaction rules talk to).
// The rules themselves — doors, interactions — live in engine/.
export function initEditorPlayUi(ctx) {
  const characterCollisionRing = new THREE.Mesh(
    new THREE.RingGeometry(Math.max(CHARACTER_RADIUS - 0.03, 0.01), CHARACTER_RADIUS, 32),
    new THREE.MeshBasicMaterial({
      color: '#ff6b6b',
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthTest: false,
    }),
  );
  characterCollisionRing.rotation.x = -Math.PI / 2;
  characterCollisionRing.renderOrder = 5;
  characterCollisionRing.visible = false;
  ctx.scene.add(characterCollisionRing);

  const interactionRangeRing = new THREE.Mesh(
    new THREE.RingGeometry(Math.max(INTERACTION_RADIUS - 0.03, 0.01), INTERACTION_RADIUS, 48),
    new THREE.MeshBasicMaterial({
      color: '#8fc5ff',
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      depthTest: false,
    }),
  );
  interactionRangeRing.rotation.x = -Math.PI / 2;
  interactionRangeRing.renderOrder = 4;
  interactionRangeRing.visible = false;
  ctx.scene.add(interactionRangeRing);

  ctx.updateCharacterCollisionDebug = () => {
    const visible = ctx.currentMode === 'movement';
    characterCollisionRing.visible = visible;
    interactionRangeRing.visible = visible;
    if (visible) {
      characterCollisionRing.position.set(ctx.character.position.x, 0.03, ctx.character.position.z);
      interactionRangeRing.position.set(ctx.character.position.x, 0.025, ctx.character.position.z);
    }
  };

  // The password prompt's current "is this code right?" callback, if open.
  let passwordSubmit = null;

  function hideAll() {
    ctx.interactionPicker.hidden = true;
    ctx.interactionPickerList.innerHTML = '';
    ctx.memoModal.hidden = true;
    ctx.imageModal.hidden = true;
    ctx.imageModalImg.removeAttribute('src');
    ctx.choiceModal.hidden = true;
    ctx.choiceModalOptions.hidden = false;
    ctx.choiceModalOptions.innerHTML = '';
    ctx.choiceModalResult.hidden = true;
    ctx.choiceModalResult.textContent = '';
    ctx.passwordModal.hidden = true;
    ctx.passwordModalError.hidden = true;
    ctx.passwordModalInput.value = '';
    passwordSubmit = null;
  }

  // Play test has no server to clear; just say it worked.
  ctx.onExitReached = () => ctx.showCenterToast?.('탈출구에 도착했습니다! (실제 게임이라면 여기서 클리어)', 3200);

  ctx.ui = {
    hideAll,
    toast: (message, ms) => ctx.showCenterToast?.(message, ms),
    status: (text) => {
      ctx.editorStatus.textContent = text;
    },

    showMemo({ text }) {
      ctx.memoModalText.textContent = text;
      ctx.memoModal.hidden = false;
    },

    showImage({ url }) {
      ctx.imageModalImg.hidden = !url;
      ctx.imageModalEmpty.hidden = Boolean(url);
      if (url) ctx.imageModalImg.src = url;
      ctx.imageModal.hidden = false;
    },

    showChoice({ options }) {
      ctx.choiceModalOptions.innerHTML = '';
      options.forEach((option) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = option.label || '(제목 없음)';
        button.addEventListener('click', () => {
          ctx.choiceModalOptions.hidden = true;
          ctx.choiceModalResult.hidden = false;
          ctx.choiceModalResult.textContent = option.resultText || '';
        });
        ctx.choiceModalOptions.append(button);
      });
      ctx.choiceModal.hidden = false;
    },

    showPicker({ candidates, onPick }) {
      ctx.interactionPickerList.innerHTML = '';
      candidates.forEach((candidate) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = candidate.label;
        button.addEventListener('click', () => onPick(candidate.id));
        ctx.interactionPickerList.append(button);
      });
      ctx.interactionPicker.hidden = false;
    },

    showPassword({ onSubmit }) {
      passwordSubmit = onSubmit;
      ctx.passwordModalError.hidden = true;
      ctx.passwordModalInput.value = '';
      ctx.passwordModal.hidden = false;
      ctx.passwordModalInput.focus();
    },
  };

  function submitPasswordModal() {
    if (!passwordSubmit) return;
    if (passwordSubmit(ctx.passwordModalInput.value)) {
      hideAll();
    } else {
      ctx.passwordModalError.hidden = false;
      ctx.passwordModalInput.select();
    }
  }

  ctx.memoModalClose.addEventListener('click', ctx.cancelInteractionPicker);
  ctx.imageModalClose.addEventListener('click', ctx.cancelInteractionPicker);
  ctx.choiceModalClose.addEventListener('click', ctx.cancelInteractionPicker);
  ctx.passwordModalClose.addEventListener('click', ctx.cancelInteractionPicker);
  ctx.passwordModalConfirm.addEventListener('click', submitPasswordModal);
  ctx.passwordModalInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') submitPasswordModal();
  });
}
