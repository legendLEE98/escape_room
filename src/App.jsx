import { useState } from 'react';
import Landing from './Landing.jsx';
import Lobby from './Lobby.jsx';
import MapList from './MapList.jsx';
import Editor from './Editor.jsx';

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
