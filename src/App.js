import React, { useState, useEffect } from 'react';
import './App.css';
import AdList from './components/AdList';
import AdScheduler from './components/AdScheduler';
import ScheduleList from './components/ScheduleList';
import Settings from './components/Settings';
import Monitoring from './components/Monitoring';
import { adAPI, scheduleAPI } from './services/api';

function App() {
  const [activeTab, setActiveTab] = useState('monitoring');
  const [ads, setAds] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // MediaLive 상태 관리
  const [mediaLiveStatus, setMediaLiveStatus] = useState({
    connected: false,
    channelId: null,
    channelName: null,
    channelState: null,
    lastUpdated: null
  });

  // 광고 목록 로드
  const loadAds = async () => {
    try {
      setLoading(true);
      const adsData = await adAPI.getAds();
      setAds(adsData);
    } catch (err) {
      setError('Failed to load ad list.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // 스케줄 목록 로드
  const loadSchedules = async () => {
    try {
      setLoading(true);
      const schedulesData = await scheduleAPI.getSchedules();
      setSchedules(schedulesData);
    } catch (err) {
      setError('Failed to load schedule list.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // MediaLive 상태 업데이트 함수
  const updateMediaLiveStatus = (status) => {
    setMediaLiveStatus({
      ...status,
      lastUpdated: new Date().toISOString()
    });
  };

  // MediaLive 상태 표시 함수
  const getMediaLiveStatusIndicator = (status) => {
    if (!status.connected) {
      return '🔴 MediaLive Offline';
    }
    
    switch (status.channelState) {
      case 'RUNNING':
        return '🟢 MediaLive Ready';
      case 'IDLE':
        return '🟡 MediaLive Idle';
      case 'STARTING':
        return '🔵 MediaLive Starting';
      case 'STOPPING':
        return '🟠 MediaLive Stopping';
      default:
        return '⚪ MediaLive Unknown';
    }
  };

  // 초기 데이터 로드
  useEffect(() => {
    loadAds();
    loadSchedules();
    
    // 저장된 MediaLive 설정 로드
    const savedConfig = localStorage.getItem('mediaLiveConfig');
    if (savedConfig) {
      try {
        const config = JSON.parse(savedConfig);
        if (config.connectionStatus === 'connected') {
          setMediaLiveStatus({
            connected: true,
            channelId: config.channelId,
            channelName: config.channelName,
            channelState: config.channelState,
            lastUpdated: config.lastTested
          });
        }
      } catch (error) {
        console.error('Failed to load MediaLive config:', error);
      }
    }
  }, []);

  // 스케줄 생성 핸들러 (Phase 3: MediaLive 통합)
  const handleScheduleCreate = async (scheduleData) => {
    try {
      const result = await scheduleAPI.createScheduleWithMediaLive(scheduleData);
      await loadSchedules(); // 스케줄 목록 새로고침
      
      // 결과에 따른 상세 피드백 반환
      return {
        success: result.success,
        dynamodbSuccess: result.dynamodbSuccess,
        mediaLiveSuccess: result.mediaLiveSuccess,
        errors: result.errors
      };
    } catch (err) {
      setError('Failed to create schedule.');
      console.error(err);
      return {
        success: false,
        dynamodbSuccess: false,
        mediaLiveSuccess: false,
        errors: [err.message]
      };
    }
  };

  // 스케줄 삭제 핸들러 (Phase 4: MediaLive 통합)
  const handleScheduleDelete = async (scheduleId, scheduleData) => {
    try {
      const result = await scheduleAPI.deleteScheduleWithMediaLive(scheduleId, scheduleData);
      await loadSchedules(); // 스케줄 목록 새로고침
      
      // 삭제 결과 피드백
      if (result.success && result.dynamodbSuccess && result.mediaLiveSuccess) {
        // 완전 삭제 성공 - 별도 메시지 없이 조용히 처리
        console.log('Schedule deleted successfully from both systems');
      } else if (result.success && result.dynamodbSuccess && !result.mediaLiveSuccess) {
        // 부분 삭제 - 경고 메시지 표시
        setError('Schedule deleted but MediaLive sync failed. ' + (result.errors?.[0] || ''));
        setTimeout(() => setError(null), 5000); // 5초 후 자동 숨김
      }
      
      return result;
    } catch (err) {
      setError('Failed to delete schedule.');
      console.error(err);
      return {
        success: false,
        dynamodbSuccess: false,
        mediaLiveSuccess: false,
        errors: [err.message]
      };
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Adsynk</h1>
        <p>Real-time Ad Scheduling Management System</p>
      </header>

      <nav className="App-nav">
        <button 
          className={activeTab === 'monitoring' ? 'active' : ''}
          onClick={() => setActiveTab('monitoring')}
        >
          Monitoring
        </button>
        <button 
          className={activeTab === 'schedule' ? 'active' : ''}
          onClick={() => setActiveTab('schedule')}
        >
          Schedule Creation
        </button>
        <button 
          className={activeTab === 'schedules' ? 'active' : ''}
          onClick={() => setActiveTab('schedules')}
        >
          Schedule List
        </button>
        <button 
          className={activeTab === 'ads' ? 'active' : ''}
          onClick={() => setActiveTab('ads')}
        >
          Ad Management
        </button>
        <button 
          className={activeTab === 'settings' ? 'active' : ''}
          onClick={() => setActiveTab('settings')}
        >
          Settings
        </button>
      </nav>

      <main className="App-main">
        {error && (
          <div className="error-message">
            ❌ {error}
            <button onClick={() => setError(null)}>Close</button>
          </div>
        )}

        {loading && <div className="loading">⏳ Loading...</div>}

        {activeTab === 'monitoring' && (
          <Monitoring />
        )}

        {activeTab === 'schedule' && (
          <AdScheduler 
            ads={ads} 
            onScheduleCreate={handleScheduleCreate}
          />
        )}

        {activeTab === 'schedules' && (
          <ScheduleList 
            schedules={schedules}
            ads={ads}
            onScheduleDelete={handleScheduleDelete}
            onRefresh={loadSchedules}
          />
        )}

        {activeTab === 'ads' && (
          <AdList 
            ads={ads}
            onRefresh={loadAds}
          />
        )}

        {activeTab === 'settings' && (
          <Settings onMediaLiveStatusUpdate={updateMediaLiveStatus} />
        )}
      </main>

      <footer className="App-footer">
        <p>Originally developed for demonstration at MEGAZONECLOUD.<br/>© 2025 Joseph. All rights reserved.</p>
        <div className="system-status">
          <span className="status-indicator active"></span>
          System Active
          <span className="medialive-status">
            {getMediaLiveStatusIndicator(mediaLiveStatus)}
          </span>
        </div>
      </footer>
    </div>
  );
}

export default App;
