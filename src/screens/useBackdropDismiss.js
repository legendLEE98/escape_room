import { useRef } from 'react';

// Backdrop props that close a modal only when the press AND the release both
// happen on the backdrop. A plain onClick also fires when a drag starts inside
// the modal (e.g. selecting input text) and is released outside it, since the
// click lands on the common ancestor — which closed the modal mid-drag.
export function useBackdropDismiss(onDismiss) {
  const pressedOnBackdrop = useRef(false);

  return {
    onMouseDown: (event) => {
      pressedOnBackdrop.current = event.target === event.currentTarget;
    },
    onClick: (event) => {
      const shouldDismiss = pressedOnBackdrop.current && event.target === event.currentTarget;
      pressedOnBackdrop.current = false;
      if (shouldDismiss) onDismiss();
    },
  };
}
