export default function Landing({ onEnterLobby, onEnterMapEditor }) {
  return (
    <div className="screen landing-screen">
      <div className="landing-image-placeholder">
        게임 이미지
        <br />
        (차후 추가)
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
