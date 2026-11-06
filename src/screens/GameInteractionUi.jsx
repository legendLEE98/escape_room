import { useCallback, useMemo, useRef, useState } from "react";

// The interaction UI of a running game, as the engine's `ctx.ui` contract
// (engine/interactions.js) wants it. `ui` is stable across renders so it can be
// handed to the scene once; `overlay` is what to render on top of the canvas.
export function useInteractionUi() {
  const [view, setView] = useState(null); // { type, ...props }
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);

  const ui = useMemo(
    () => ({
      hideAll: () => setView(null),
      toast: (message, ms = 1400) => {
        setToast(message);
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(""), ms);
      },
      showMemo: ({ title, text }) => setView({ type: "memo", title, text }),
      showChoice: ({ title, options }) =>
        setView({ type: "choice", title, options, result: null }),
      showPicker: ({ candidates, onPick }) =>
        setView({ type: "picker", candidates, onPick }),
      showPassword: ({ onSubmit }) => setView({ type: "password", onSubmit }),
    }),
    [],
  );

  const close = useCallback(() => setView(null), []);
  const overlay = (
    <InteractionOverlay
      view={view}
      setView={setView}
      close={close}
      toast={toast}
    />
  );
  return { ui, overlay };
}

function InteractionOverlay({ view, setView, close, toast }) {
  return (
    <>
      {toast && <div className="game-toast">{toast}</div>}
      {view && (
        <div className="game-interaction" role="dialog">
          {view.type === "memo" && (
            <>
              <h3>{view.title}</h3>
              <p className="game-interaction-text">
                {view.text || "(내용이 없습니다.)"}
              </p>
            </>
          )}
          {view.type === "choice" && (
            <>
              <h3>{view.title}</h3>
              {view.result == null ? (
                <div className="game-interaction-options">
                  {view.options.map((option, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() =>
                        setView({ ...view, result: option.resultText || "" })
                      }
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="game-interaction-text">
                  {view.result || "(아무 일도 일어나지 않았다.)"}
                </p>
              )}
            </>
          )}
          {view.type === "picker" && (
            <>
              <h3>무엇을 조사할까요?</h3>
              <div className="game-interaction-options">
                {view.candidates.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => view.onPick(candidate.id)}
                  >
                    {candidate.label}
                  </button>
                ))}
              </div>
            </>
          )}
          {view.type === "password" && (
            <PasswordForm view={view} close={close} />
          )}
          <button
            type="button"
            className="game-interaction-close"
            onClick={close}
          >
            닫기 (Esc)
          </button>
        </div>
      )}
    </>
  );
}

function PasswordForm({ view, close }) {
  const [value, setValue] = useState("");
  const [wrong, setWrong] = useState(false);
  const submit = (event) => {
    event.preventDefault();
    if (view.onSubmit(value)) close();
    else {
      setWrong(true);
      setValue("");
    }
  };
  return (
    <form onSubmit={submit}>
      <h3>잠긴 문</h3>
      <input
        autoFocus
        className="game-interaction-input"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setWrong(false);
        }}
        placeholder="비밀번호"
        autoComplete="off"
      />
      {wrong && (
        <p className="game-interaction-error">비밀번호가 맞지 않습니다.</p>
      )}
      <button type="submit" className="primary-button">
        확인
      </button>
    </form>
  );
}
