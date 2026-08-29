const INTERACTION_LABELS = {
  memo: '메모',
  choice: '선택지',
  image: '이미지',
};

export function initInteraction(ctx) {
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

  ctx.updateInteractionFromSelection = () => {
    const count = ctx.multiSelection.size;
    ctx.interactionBody.hidden = count === 0;
    ctx.interactionEmpty.hidden = count > 0;
    if (count === 0) return;

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
