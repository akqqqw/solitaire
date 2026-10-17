import { useEffect } from 'react';
import { useGameStore } from './store/gameStore';
import { MenuScreen } from './ui/screens/MenuScreen';
import { GameScreen } from './ui/screens/GameScreen';
import { StatsScreen } from './ui/screens/StatsScreen';
import { AchievementsScreen } from './ui/screens/AchievementsScreen';
import { SettingsScreen } from './ui/screens/SettingsScreen';
import { DailyScreen } from './ui/screens/DailyScreen';
import { Notifications, Toast } from './ui/components/Notifications';
import { Brand } from './ui/components/Brand';

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-mark">
        <Brand />
      </div>
      <div className="loading-bar"><span /></div>
      <p>Раскладываем карты…</p>
    </div>
  );
}

export default function App() {
  const hydrated = useGameStore((s) => s.hydrated);
  const screen = useGameStore((s) => s.screen);
  const settings = useGameStore((s) => s.settings);

  useEffect(() => {
    void useGameStore.getState().init();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.table = settings.tableTheme;
  }, [settings.tableTheme]);

  useEffect(() => {
    const onVisibility = () => {
      const store = useGameStore.getState();
      if (document.visibilityState === 'hidden') {
        store.pauseForVisibility();
        store.flushProfile();
      } else {
        store.resumeForVisibility();
        store.refreshDate();
      }
    };
    const onPageHide = () => {
      const store = useGameStore.getState();
      store.pauseForVisibility();
      store.flushProfile();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, []);

  let content = null;
  if (!hydrated) content = <LoadingScreen />;
  else if (screen === 'game') content = <GameScreen />;
  else if (screen === 'stats') content = <StatsScreen />;
  else if (screen === 'achievements') content = <AchievementsScreen />;
  else if (screen === 'settings') content = <SettingsScreen />;
  else if (screen === 'daily') content = <DailyScreen />;
  else content = <MenuScreen />;

  return (
    <div className={`app app-${screen}`} data-table={settings.tableTheme}>
      {content}
      <Notifications />
      <Toast />
    </div>
  );
}
