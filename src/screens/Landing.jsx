import CharacterBackdrop from './CharacterBackdrop.jsx';

export default function Landing({ user, onEnterLobby, onEnterMapEditor, onLogin, onLogout }) {
  return (
    <div className="screen landing-screen">
      <div className="landing-auth">
        {user ? (
          <>
            <span className="landing-auth-name">{user.nickname}</span>
            <button type="button" className="landing-auth-button" onClick={onLogout}>
              로그아웃
            </button>
          </>
        ) : (
          <button type="button" className="landing-auth-button" onClick={onLogin}>
            로그인
          </button>
        )}
      </div>

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
