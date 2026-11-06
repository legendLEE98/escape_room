import { useEffect, useState } from 'react';
import Landing from './screens/Landing.jsx';
import Lobby from './screens/Lobby.jsx';
import CreateRoom from './screens/CreateRoom.jsx';
import GameRoom from './screens/GameRoom.jsx';
import MapList from './screens/MapList.jsx';
import Editor from './screens/Editor.jsx';
import AuthModal from './screens/AuthModal.jsx';
import { fetchCurrentUser, logout } from './data/auth.js';

export default function App() {
  const [screen, setScreen] = useState('landing');
  const [activeMapId, setActiveMapId] = useState(null);
  const [activeRoom, setActiveRoom] = useState(null);
  // null = not logged in (guests count as not logged in for map authoring).
  const [user, setUser] = useState(null);
  // { reason, onSuccess? } while the login modal is open.
  const [authPrompt, setAuthPrompt] = useState(null);

  useEffect(() => {
    fetchCurrentUser()
      .then((current) => setUser(current?.kind === 'user' ? current : null))
      .catch((error) => console.error(error));
  }, []);

  const openAuthPrompt = (reason, onSuccess) => setAuthPrompt({ reason, onSuccess });

  const handleAuthSuccess = (loggedInUser) => {
    const onSuccess = authPrompt?.onSuccess;
    setUser(loggedInUser);
    setAuthPrompt(null);
    onSuccess?.(loggedInUser);
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error(error);
    }
    setUser(null);
    setScreen('landing');
  };

  const enterMapEditor = () => {
    if (user) {
      setScreen('mapList');
      return;
    }
    // Continue straight into the map list once they've logged in.
    openAuthPrompt('맵 제작은 로그인이 필요합니다.', () => setScreen('mapList'));
  };

  let content;
  if (screen === 'lobby') {
    content = (
      <Lobby
        onBack={() => setScreen('landing')}
        onCreateRoom={() => setScreen('createRoom')}
        onEnterRoom={(room) => {
          setActiveRoom(room);
          setScreen('gameRoom');
        }}
      />
    );
  } else if (screen === 'gameRoom') {
    content = <GameRoom room={activeRoom} user={user} onLeave={() => setScreen('lobby')} />;
  } else if (screen === 'createRoom') {
    content = (
      <CreateRoom
        user={user}
        onBack={() => setScreen('lobby')}
        onCreated={(room) => {
          setActiveRoom(room);
          setScreen('gameRoom');
        }}
      />
    );
  } else if (screen === 'mapList') {
    content = (
      <MapList
        onBack={() => setScreen('landing')}
        onOpenEditor={(mapId) => {
          setActiveMapId(mapId);
          setScreen('editor');
        }}
      />
    );
  } else if (screen === 'editor') {
    content = <Editor mapId={activeMapId} onBack={() => setScreen('mapList')} />;
  } else {
    content = (
      <Landing
        user={user}
        onEnterLobby={() => setScreen('lobby')}
        onEnterMapEditor={enterMapEditor}
        onLogin={() => openAuthPrompt(null)}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <>
      {content}
      {authPrompt && (
        <AuthModal
          reason={authPrompt.reason}
          onClose={() => setAuthPrompt(null)}
          onSuccess={handleAuthSuccess}
        />
      )}
    </>
  );
}
