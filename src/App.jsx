import { useState } from 'react';
import Landing from './screens/Landing.jsx';
import Lobby from './screens/Lobby.jsx';
import MapList from './screens/MapList.jsx';
import Editor from './screens/Editor.jsx';

export default function App() {
  const [screen, setScreen] = useState('landing');
  const [activeMapId, setActiveMapId] = useState(null);

  if (screen === 'lobby') {
    return <Lobby onBack={() => setScreen('landing')} />;
  }

  if (screen === 'mapList') {
    return (
      <MapList
        onBack={() => setScreen('landing')}
        onOpenEditor={(mapId) => {
          setActiveMapId(mapId);
          setScreen('editor');
        }}
      />
    );
  }

  if (screen === 'editor') {
    return <Editor mapId={activeMapId} onBack={() => setScreen('mapList')} />;
  }

  return (
    <Landing
      onEnterLobby={() => setScreen('lobby')}
      onEnterMapEditor={() => setScreen('mapList')}
    />
  );
}
