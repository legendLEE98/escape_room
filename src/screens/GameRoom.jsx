import { useEffect, useRef, useState } from "react";
import { createGameScene } from "../game/createGameScene.js";
import { LOBBY_LAYOUT } from "../game/lobby-layout.js";
import { resolvePlayerIdentity } from "../data/auth.js";
import { connectToRoom } from "../data/gameRoomSocket.js";
import { getRoomLayout } from "../data/gameRooms.js";
import { useInteractionUi } from "./GameInteractionUi.jsx";

// A game room: the 3D scene on the left, who is in it on the right. Everyone in
// the room is connected to the server, which relays who is where, so you see
// the others walking around and they see you.
//
// Two phases share one socket connection: the waiting lobby, and — once the
// host starts the game — the room's pinned map, where doors, buttons and
// interactions work and what players press/unlock is shared through the server.
function formatElapsed(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}분 ${String(seconds).padStart(2, "0")}초`;
}

export default function GameRoom({ room, user, onLeave }) {
  const canvasRef = useRef(null);
  const connectionRef = useRef(null);
  // Registered users are known already; anyone else gets a guest identity.
  const [me, setMe] = useState(user?.kind === "user" ? user : null);
  const [status, setStatus] = useState("loading"); // 'loading' | 'ready' | 'error'
  const [errorMessage, setErrorMessage] = useState("");
  const [roomInfo, setRoomInfo] = useState(room);
  const [players, setPlayers] = useState([]);
  const [hostId, setHostId] = useState(null);
  const [notice, setNotice] = useState("");
  const [phase, setPhase] = useState("lobby"); // 'lobby' | 'playing'
  const [connected, setConnected] = useState(false);
  const [layout, setLayout] = useState(null); // the map's layout, once playing
  const [sceneReady, setSceneReady] = useState(false);
  const [cleared, setCleared] = useState(null); // { elapsedMs, by } once someone reaches the exit
  const { ui, overlay } = useInteractionUi();

  // Server-pushed facts live in refs as well as state: the scene is rebuilt on
  // the lobby -> map switch and has to be filled from what we already know.
  const sceneRef = useRef(null);
  const playersRef = useRef(new Map());
  const positionsRef = useRef(new Map());
  const playRef = useRef({ pressed: [], unlocked: [] });

  useEffect(() => {
    if (me) return undefined;
    let cancelled = false;
    resolvePlayerIdentity()
      .then((identity) => !cancelled && setMe(identity))
      .catch((error) => {
        console.error(error);
        if (!cancelled) {
          setErrorMessage("서버에 연결하지 못했습니다.");
          setStatus("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [me]);

  const fail = (message) => {
    setErrorMessage(message);
    setStatus("error");
  };

  // The connection: opened once per room, kept through the lobby -> map switch.
  useEffect(() => {
    if (!me) return undefined;
    let cancelled = false;
    const failIfLive = (message) => !cancelled && fail(message);
    const players = playersRef.current;
    const positions = positionsRef.current;

    const connection = connectToRoom(room.id, {
      onPlayerJoined: (player) => {
        players.set(player.id, player);
        setPlayers([...players.values()]);
        if (player.id !== me.id) sceneRef.current?.remotePlayers.add(player);
      },
      onPlayerLeft: (id) => {
        players.delete(id);
        positions.delete(id);
        setPlayers([...players.values()]);
        sceneRef.current?.remotePlayers.remove(id);
      },
      onPlayerMoved: (move) => {
        positions.set(move.id, move);
        sceneRef.current?.remotePlayers.move(move.id, move);
      },
      onHost: ({ hostId: nextHost }) => setHostId(nextHost),
      onStarted: (started) => {
        setRoomInfo(started);
        positions.clear(); // where people stood in the lobby means nothing in the map
        setPhase("playing");
      },
      onCleared: ({ room: clearedRoom, byNickname }) => {
        setRoomInfo(clearedRoom);
        setCleared({
          elapsedMs: clearedRoom.clearedAt - clearedRoom.startedAt,
          by: byNickname,
        });
      },
      onPlayState: ({ kind, key }) => {
        const play = playRef.current;
        (kind === "button" ? play.pressed : play.unlocked).push(key);
        sceneRef.current?.ctx.playState?.applyRemote(kind, key);
      },
      onClosed: () => failIfLive("방장이 방을 닫았습니다."),
      onReplaced: () =>
        failIfLive("다른 창에서 이 방에 접속해서 이 화면은 종료되었습니다."),
      onDisconnected: () => failIfLive("서버와의 연결이 끊어졌습니다."),
    });
    connectionRef.current = connection;

    connection.ready
      .then((ack) => {
        if (cancelled) return;
        setRoomInfo(ack.room);
        setHostId(ack.room.hostId);
        ack.players.forEach((player) => players.set(player.id, player));
        setPlayers([...players.values()]);
        Object.entries(ack.positions).forEach(([id, move]) =>
          positions.set(id, { id, ...move }),
        );
        playRef.current = {
          pressed: ack.play?.pressed ?? [],
          unlocked: ack.play?.unlocked ?? [],
        };
        setPhase(ack.room.status === "waiting" ? "lobby" : "playing");
        if (ack.room.status === "cleared") {
          setCleared({
            elapsedMs: ack.room.clearedAt - ack.room.startedAt,
            by: null,
          });
        }
        setConnected(true);
      })
      .catch((error) => {
        console.error(error);
        failIfLive(error.code ? error.message : "방에 입장하지 못했습니다.");
      });

    return () => {
      cancelled = true;
      connection.disconnect();
      connectionRef.current = null;
      players.clear();
      positions.clear();
    };
  }, [me, room.id]);

  // Entering the map: fetch the room's pinned layout.
  useEffect(() => {
    if (!connected || phase !== "playing" || layout) return undefined;
    let cancelled = false;
    getRoomLayout(room.id)
      .then((result) => !cancelled && setLayout(result.layout))
      .catch((error) => {
        console.error(error);
        if (!cancelled) fail(error.message || "맵을 불러오지 못했습니다.");
      });
    return () => {
      cancelled = true;
    };
  }, [connected, phase, layout, room.id]);

  // The 3D scene: the lobby, then (rebuilt, on a fresh canvas) the map.
  useEffect(() => {
    if (!me || !connected) return undefined;
    if (phase === "playing" && !layout) return undefined;
    let cancelled = false;
    setSceneReady(false);

    const game = createGameScene(canvasRef.current, {
      layout: phase === "playing" ? layout : LOBBY_LAYOUT,
      playerName: me.nickname,
      onLocalState: (state) => connectionRef.current?.sendMove(state),
      mapPlay:
        phase === "playing"
          ? {
              ui,
              snapshot: playRef.current,
              onPlayChange: (kind, key) =>
                connectionRef.current?.playAction(kind, key),
              onExit: () => connectionRef.current?.clear(),
            }
          : null,
    });

    game.ready
      .then(() => {
        if (cancelled) return;
        sceneRef.current = game;
        playersRef.current.forEach((player) => {
          if (player.id === me.id) return;
          game.remotePlayers.add(player);
          const move = positionsRef.current.get(player.id);
          if (move) game.remotePlayers.move(player.id, move);
        });
        setSceneReady(true);
        setStatus("ready");
        game.sendLocalState(); // tell everyone where we spawned
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) fail("화면을 불러오지 못했습니다.");
      });

    return () => {
      cancelled = true;
      sceneRef.current = null;
      game.dispose();
    };
  }, [me, connected, phase, layout, ui]);

  const started = phase === "playing";
  const isHost = Boolean(me) && hostId === me.id;

  const handleStart = async () => {
    setNotice("");
    const result = await connectionRef.current?.start();
    if (result && !result.ok) setNotice(result.error);
    // On success the server tells everyone (including us) via onStarted.
  };

  const handleLeave = async () => {
    await connectionRef.current?.leave().catch(() => {});
    onLeave();
  };

  return (
    <div className={`game-room${started ? " is-playing" : ""}`}>
      <div className="game-stage">
        <canvas key={phase} ref={canvasRef} className="game-canvas" />
        {sceneReady && overlay}

        {cleared && (
          <div className="game-ending" role="dialog" aria-label="클리어">
            <div className="game-ending-card">
              <p className="game-ending-eyebrow">탈출 성공</p>
              <h2>{roomInfo.map?.title ?? "맵"} 클리어!</h2>
              {cleared.by && (
                <p className="game-ending-by">
                  {cleared.by}님이 탈출구에 도착했습니다.
                </p>
              )}
              {cleared.elapsedMs > 0 && (
                <p className="game-ending-time">
                  걸린 시간 {formatElapsed(cleared.elapsedMs)}
                </p>
              )}
              <button
                type="button"
                className="primary-button"
                onClick={handleLeave}
              >
                방 목록으로
              </button>
            </div>
          </div>
        )}

        <header className="game-hud">
          {!started && (
            <button type="button" className="back-button" onClick={handleLeave}>
              ‹ 방 나가기
            </button>
          )}
          <div className="game-hud-room">
            <span className="game-hud-title">{roomInfo.title}</span>
            <span className="game-hud-meta">{roomInfo.map?.title ?? ""}</span>
          </div>
        </header>

        {started && (
          <ul className="game-hud-players" aria-label="접속 중인 플레이어">
            {players.map((player) => (
              <li key={player.id} className="game-hud-player">
                {player.nickname}
                {me && player.id === me.id && " (나)"}
              </li>
            ))}
          </ul>
        )}

        {started && (
          <aside className="game-keyguide" aria-label="조작 방법">
            <h3>조작 방법</h3>
            <dl>
              <dt><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></dt>
              <dd>이동</dd>
              <dt><kbd>마우스 클릭</kbd></dt>
              <dd>클릭한 곳으로 이동</dd>
              <dt><kbd>G</kbd></dt>
              <dd>가까운 물건·문 조사</dd>
              <dt><kbd>휠</kbd></dt>
              <dd>화면 확대·축소</dd>
              <dt><kbd>Esc</kbd></dt>
              <dd>창 닫기</dd>
            </dl>
          </aside>
        )}

        {(status !== "ready" || !sceneReady) && (
          <div className="game-stage-overlay">
            {status === "error" ? null : (
              <div className="editor-loading-spinner" />
            )}
            <p className="editor-loading-text">
              {status === "error"
                ? errorMessage
                : phase === "playing"
                  ? "맵을 불러오는 중..."
                  : "대기실에 입장하는 중..."}
            </p>
            {status === "error" && (
              <button
                type="button"
                className="editor-loading-retry"
                onClick={onLeave}
              >
                방 목록으로
              </button>
            )}
          </div>
        )}
      </div>

      {!started && (
        <aside className="game-sidebar">
          <div className="game-sidebar-heading">
            <h2>{started ? "플레이어" : "대기자"}</h2>
            <span className="game-sidebar-count">
              {players.length} / {roomInfo.maxUser}
            </span>
          </div>
          <ul className="waiting-list">
            {players.map((player) => (
              <li key={player.id} className="waiting-item">
                <span className="waiting-name">{player.nickname}</span>
                {me && player.id === me.id && (
                  <span className="waiting-badge">나</span>
                )}
                {player.id === hostId && (
                  <span className="waiting-badge is-host">방장</span>
                )}
              </li>
            ))}
          </ul>
          <p className="game-sidebar-hint">
            {started
              ? "WASD로 이동하고, 물건이나 잠긴 문 앞에서 G를 눌러 조사하세요. (Esc: 닫기)"
              : "WASD 또는 클릭으로 대기실을 돌아다닐 수 있습니다."}
          </p>

          {notice && <p className="game-start-notice">{notice}</p>}
          {!started && (
            <button
              type="button"
              className="primary-button game-start-button"
              disabled={!isHost || status !== "ready" || started}
              title={isHost ? undefined : "방장만 게임을 시작할 수 있습니다."}
              onClick={handleStart}
            >
              게임 시작
            </button>
          )}
        </aside>
      )}
    </div>
  );
}
