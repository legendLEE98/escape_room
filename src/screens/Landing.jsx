import CharacterBackdrop from './CharacterBackdrop.jsx';

export default function Landing({ onEnterLobby, onEnterMapEditor }) {
  return (
    <div className="screen landing-screen">
      <div className="landing-image-placeholder">
        <CharacterBackdrop />
      </div>

      <div className="landing-actions">
        <button type="button" className="landing-button" onClick={onEnterLobby}>
          게임 시작
        </button>
        <button type="button" className="landing-button" onClick={onEnterMapEditor}>
          맵 제작
        </button>
      </div>
    </div>
  );
}
