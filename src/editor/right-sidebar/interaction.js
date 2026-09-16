const INTERACTION_LABELS = {
  memo: '메모',
  choice: '선택지',
  image: '이미지',
  button: '버튼',
};

export function initInteraction(ctx) {
  // Not a normal placed object (not in ctx.placedObjects, not selectable in
  // the 3D view yet), so it gets its own lightweight selection state instead
  // of going through ctx.selectEditorObject/transformControls: { room, edge }
  // where edge is the live doorEdge object from room.doorEdges (mutating it
  // directly is fine, it's the same reference persistence.js serializes).
  ctx.selectedDoorEdge = null;

  function renderButtonOptions(room, edge) {
    ctx.interactionLockButtonSelect.innerHTML = '';
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = '버튼 선택...';
    ctx.interactionLockButtonSelect.append(emptyOption);

    ctx.placedObjects
      .filter(
        (object) =>
          ctx.getObjectRoomInstanceId(object) === room.instanceId && object.userData.interactionType === 'button',
      )
      .forEach((object) => {
        const option = document.createElement('option');
        option.value = String(object.userData.instanceId);
        option.textContent = object.name;
        ctx.interactionLockButtonSelect.append(option);
      });

    ctx.interactionLockButtonSelect.value =
      edge.requiredButtonInstanceId != null ? String(edge.requiredButtonInstanceId) : '';
  }

  function renderDoorState({ edge, canonicalRoom, canonicalEdge }) {
    const targetRoom = ctx.rooms.find((candidate) => candidate.instanceId === edge.connectedRoomInstanceId);
    ctx.interactionDoorLabel.textContent = `문 · → ${targetRoom ? targetRoom.name : '(삭제된 방)'}`;

    // Lock state reads/writes always go through the canonical edge — a door
    // is unlocked or locked as a whole, not per direction. See
    // ctx.resolveCanonicalDoorEdge in room-links.js.
    const lockType = canonicalEdge.lockType || 'none';
    ctx.interactionLockTypeChoices.querySelectorAll('[data-lock-type]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.lockType === lockType);
    });

    ctx.interactionLockPasswordFields.hidden = lockType !== 'password';
    ctx.interactionLockButtonFields.hidden = lockType !== 'button';
    ctx.interactionLockKeyFields.hidden = lockType !== 'key';

    if (lockType === 'password') {
      ctx.interactionLockPasswordInput.value = canonicalEdge.password || '';
    } else if (lockType === 'button') {
      renderButtonOptions(canonicalRoom, canonicalEdge);
    }
  }

  // Entry point for clicking a door row in the interaction list. Mirrors the
  // relevant bits of ctx.selectEditorObject(null) (clear normal selection,
  // detach the gizmo) since a door isn't a transformable object. `room`/`edge`
  // stay in the clicked room's own perspective (for the "→ target room"
  // label); `canonicalRoom`/`canonicalEdge` is where lock data actually lives.
  ctx.selectDoorForInteraction = (room, edge) => {
    ctx.multiSelection.clear();
    ctx.selectedEditorObject = null;
    ctx.transformControls.detach();
    const canonical = ctx.resolveCanonicalDoorEdge(room, edge);
    ctx.selectedDoorEdge = { room, edge, canonicalRoom: canonical.room, canonicalEdge: canonical.edge };
    ctx.updateInspectorFromSelection();
    ctx.syncHierarchyHighlight?.();
  };

  function renderChoiceList(object) {
    ctx.interactionChoiceList.innerHTML = '';
    const options = object.userData.choiceOptions || [];
    options.forEach((option, index) => {
      const row = document.createElement('div');
      row.className = 'interaction-choice-row';

      const labelInput = document.createElement('input');
      labelInput.type = 'text';
      labelInput.placeholder = '선택지 문구 (예: 바닥을 뒤진다)';
      labelInput.value = option.label || '';
      labelInput.addEventListener('input', () => {
        option.label = labelInput.value;
        ctx.saveLayout();
      });

      const resultInput = document.createElement('input');
      resultInput.type = 'text';
      resultInput.placeholder = '결과 텍스트 (예: 낡은 열쇠를 발견했다!)';
      resultInput.value = option.resultText || '';
      resultInput.addEventListener('input', () => {
        option.resultText = resultInput.value;
        ctx.saveLayout();
      });

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.textContent = '삭제';
      removeButton.addEventListener('click', () => {
        options.splice(index, 1);
        renderChoiceList(object);
        ctx.saveLayout();
      });

      row.append(labelInput, resultInput, removeButton);
      ctx.interactionChoiceList.append(row);
    });
  }

  function renderActiveState(object) {
    const type = object.userData.interactionType;
    ctx.interactionActiveLabel.textContent = INTERACTION_LABELS[type] || type;

    ctx.interactionMemoFields.hidden = type !== 'memo';
    ctx.interactionChoiceFields.hidden = type !== 'choice';
    ctx.interactionImageFields.hidden = type !== 'image';

    if (type === 'memo') {
      ctx.interactionMemoText.value = object.userData.memoText || '';
    } else if (type === 'choice') {
      renderChoiceList(object);
    } else if (type === 'image') {
      const bgImageUrl = object.userData.bgImageUrl || '';
      ctx.inspectorBgPreview.hidden = !bgImageUrl;
      ctx.inspectorBgPreview.src = bgImageUrl;
    }
  }

  function renderInteractionList() {
    ctx.interactionList.innerHTML = '';
    const currentRoom = ctx.rooms?.find((candidate) => candidate.instanceId === ctx.currentRoomInstanceId);
    const doorItems = currentRoom?.doorEdges || [];
    const objectItems = ctx.placedObjects.filter(
      (object) =>
        ctx.getObjectRoomInstanceId(object) === ctx.currentRoomInstanceId && object.userData.interactionType,
    );
    ctx.interactionListEmpty.hidden = doorItems.length > 0 || objectItems.length > 0;

    doorItems.forEach((edge) => {
      const targetRoom = ctx.rooms.find((candidate) => candidate.instanceId === edge.connectedRoomInstanceId);
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'interaction-list-row';

      const badge = document.createElement('span');
      badge.className = 'interaction-list-badge interaction-list-badge-door';
      badge.textContent = '문';

      const label = document.createElement('span');
      label.className = 'interaction-list-row-label';
      label.textContent = `→ ${targetRoom ? targetRoom.name : '(삭제된 방)'}`;

      row.append(badge, label);
      row.addEventListener('click', () => ctx.selectDoorForInteraction(currentRoom, edge));
      ctx.interactionList.append(row);
    });

    objectItems.forEach((object) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'interaction-list-row';

      const badge = document.createElement('span');
      const type = object.userData.interactionType;
      badge.className = `interaction-list-badge interaction-list-badge-${type}`;
      badge.textContent = INTERACTION_LABELS[type] || type;

      const label = document.createElement('span');
      label.className = 'interaction-list-row-label';
      label.textContent = object.name;

      row.append(badge, label);
      row.addEventListener('click', () => ctx.selectEditorObject(object));
      ctx.interactionList.append(row);
    });
  }

  ctx.updateInteractionFromSelection = () => {
    const count = ctx.multiSelection.size;
    const doorSelection = ctx.selectedDoorEdge;

    ctx.interactionListSection.hidden = count !== 0 || Boolean(doorSelection);
    ctx.interactionBody.hidden = count === 0 && !doorSelection;

    if (doorSelection) {
      ctx.interactionNoneState.hidden = true;
      ctx.interactionActiveState.hidden = true;
      ctx.interactionDoorState.hidden = false;
      renderDoorState(doorSelection);
      return;
    }
    ctx.interactionDoorState.hidden = true;

    if (count === 0) {
      renderInteractionList();
      return;
    }

    const single = count === 1 ? ctx.selectedEditorObject : null;
    ctx.interactionTypeChoices.hidden = true;

    const canEdit = count === 1;
    ctx.interactionAddButton.disabled = !canEdit;
    ctx.interactionRemoveButton.disabled = !canEdit;

    const hasInteraction = Boolean(single?.userData.interactionType);
    ctx.interactionNoneState.hidden = hasInteraction;
    ctx.interactionActiveState.hidden = !hasInteraction;

    if (hasInteraction) renderActiveState(single);
  };

  ctx.interactionBackButton.addEventListener('click', () => {
    ctx.selectedDoorEdge = null;
    ctx.selectEditorObject(null);
  });

  ctx.interactionLockTypeChoices.querySelectorAll('[data-lock-type]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!ctx.selectedDoorEdge) return;
      // Written to the canonical edge — a door is unlocked/locked as a
      // whole, so both directions must see the same lockType.
      ctx.selectedDoorEdge.canonicalEdge.lockType = button.dataset.lockType;
      renderDoorState(ctx.selectedDoorEdge);
      ctx.saveLayout();
    });
  });

  ctx.interactionLockPasswordInput.addEventListener('input', () => {
    if (!ctx.selectedDoorEdge) return;
    ctx.selectedDoorEdge.canonicalEdge.password = ctx.interactionLockPasswordInput.value;
    ctx.saveLayout();
  });

  ctx.interactionLockButtonSelect.addEventListener('change', () => {
    if (!ctx.selectedDoorEdge) return;
    const { canonicalEdge } = ctx.selectedDoorEdge;
    const value = ctx.interactionLockButtonSelect.value;
    canonicalEdge.requiredButtonInstanceId = value ? Number(value) : null;
    // Clear the stale persisted-id fallback too — otherwise explicitly
    // unpicking a button here would still round-trip the old saved id on
    // the next save (persistence.js falls back to it when the live id is null).
    canonicalEdge.requiredButtonSavedId = null;
    ctx.saveLayout();
  });

  ctx.interactionAddButton.addEventListener('click', () => {
    ctx.interactionTypeChoices.hidden = !ctx.interactionTypeChoices.hidden;
  });

  ctx.interactionTypeChoices.querySelectorAll('[data-interaction-type]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!ctx.selectedEditorObject || ctx.multiSelection.size !== 1) return;
      const type = button.dataset.interactionType;
      ctx.selectedEditorObject.userData.interactionType = type;
      if (type === 'choice' && !ctx.selectedEditorObject.userData.choiceOptions) {
        ctx.selectedEditorObject.userData.choiceOptions = [];
      }
      ctx.interactionTypeChoices.hidden = true;
      ctx.updateInteractionFromSelection();
      ctx.saveLayout();
    });
  });

  ctx.interactionRemoveButton.addEventListener('click', () => {
    if (!ctx.selectedEditorObject || ctx.multiSelection.size !== 1) return;
    ctx.selectedEditorObject.userData.interactionType = null;
    ctx.updateInteractionFromSelection();
    ctx.saveLayout();
  });

  ctx.interactionMemoText.addEventListener('input', () => {
    if (!ctx.selectedEditorObject || ctx.multiSelection.size !== 1) return;
    ctx.selectedEditorObject.userData.memoText = ctx.interactionMemoText.value;
    ctx.saveLayout();
  });

  ctx.interactionChoiceAddButton.addEventListener('click', () => {
    if (!ctx.selectedEditorObject || ctx.multiSelection.size !== 1) return;
    const options = ctx.selectedEditorObject.userData.choiceOptions || [];
    options.push({ label: '', resultText: '' });
    ctx.selectedEditorObject.userData.choiceOptions = options;
    renderChoiceList(ctx.selectedEditorObject);
    ctx.saveLayout();
  });

  ctx.inspectorBgImage.addEventListener('change', () => {
    if (!ctx.selectedEditorObject) return;
    const file = ctx.inspectorBgImage.files[0];
    if (!file) return;

    const previousUrl = ctx.selectedEditorObject.userData.bgImageUrl;
    if (previousUrl?.startsWith('blob:')) URL.revokeObjectURL(previousUrl);

    const objectUrl = URL.createObjectURL(file);
    ctx.selectedEditorObject.userData.bgImageUrl = objectUrl;
    ctx.inspectorBgPreview.hidden = false;
    ctx.inspectorBgPreview.src = objectUrl;
  });
}
