export default function Lobby({ onBack }) {
  return (
    <div className="screen lobby-screen">
      <button type="button" className="back-button" onClick={onBack}>
        ‹ 뒤로가기
      </button>
      <p className="lobby-placeholder">게임방 목록 (준비 중)</p>
    </div>
  );
}
