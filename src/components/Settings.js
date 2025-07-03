import React, { useState, useEffect } from 'react';
import mediaLiveAPI from '../services/mediaLiveAPI';

const Settings = ({ onMediaLiveStatusUpdate }) => {
  const [mediaLiveConfig, setMediaLiveConfig] = useState({
    channelId: '',
    channelName: '',
    region: 'ap-northeast-2',
    channelState: null,
    connectionStatus: 'disconnected',
    lastTested: null
  });

  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  // 설정 로드
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      // TODO: API 호출로 설정 로드
      const savedConfig = localStorage.getItem('mediaLiveConfig');
      if (savedConfig) {
        setMediaLiveConfig(JSON.parse(savedConfig));
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const handleConfigChange = (e) => {
    const { name, value, type, checked } = e.target;
    setMediaLiveConfig(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const testConnection = async () => {
    if (!mediaLiveConfig.channelId) {
      setMessage({ type: 'error', text: 'Please enter a Channel ID' });
      return;
    }

    setTesting(true);
    setMessage(null);

    try {
      // 단순화된 MediaLive API 호출
      const result = await mediaLiveAPI.testConnection(
        mediaLiveConfig.channelId,
        mediaLiveConfig.region
      );

      if (result.success) {
        // 실제 API 응답 구조에 맞게 수정
        const responseData = result.data || result;
        const { channelId, channelName, channelState } = responseData;
        
        setMediaLiveConfig(prev => ({
          ...prev,
          channelName: channelName || `Channel-${channelId}`,
          channelState: channelState,
          connectionStatus: 'connected',
          lastTested: new Date().toISOString()
        }));

        // 간단한 성공 메시지만 표시
        setMessage({ 
          type: 'success', 
          text: `Successfully connected to ${channelName || 'Channel'}`
        });

        // 전역 상태 업데이트
        if (onMediaLiveStatusUpdate) {
          onMediaLiveStatusUpdate({
            connected: true,
            channelId: channelId,
            channelName: channelName,
            channelState: channelState
          });
        }

      } else {
        // 연결 실패 처리
        setMediaLiveConfig(prev => ({
          ...prev,
          connectionStatus: 'failed',
          channelState: null,
          lastTested: new Date().toISOString()
        }));

        setMessage({ 
          type: 'error', 
          text: result.error?.message || 'Connection failed. Please check Channel ID and permissions.'
        });

        // 전역 상태 업데이트 (연결 실패)
        if (onMediaLiveStatusUpdate) {
          onMediaLiveStatusUpdate({
            connected: false,
            channelId: null,
            channelName: null,
            channelState: null
          });
        }
      }
    } catch (error) {
      setMediaLiveConfig(prev => ({
        ...prev,
        connectionStatus: 'error',
        lastTested: new Date().toISOString()
      }));
      setMessage({ 
        type: 'error', 
        text: `Connection error: ${error.message}` 
      });
    } finally {
      setTesting(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    setMessage(null);

    try {
      // TODO: 실제 API 호출로 설정 저장
      localStorage.setItem('mediaLiveConfig', JSON.stringify(mediaLiveConfig));
      
      setMessage({ 
        type: 'success', 
        text: 'Settings saved successfully!' 
      });
    } catch (error) {
      setMessage({ 
        type: 'error', 
        text: `Failed to save settings: ${error.message}` 
      });
    } finally {
      setSaving(false);
    }
  };

  const resetSettings = () => {
    setMediaLiveConfig({
      channelId: '',
      channelName: '',
      region: 'ap-northeast-2',
      channelState: null,
      connectionStatus: 'disconnected',
      lastTested: null
    });
    setMessage(null);
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'connected': return '✅';
      case 'failed': return '❌';
      case 'error': return '⚠️';
      default: return '⚪';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'connected': return 'Connected';
      case 'failed': return 'Connection Failed';
      case 'error': return 'Error';
      default: return 'Not Connected';
    }
  };



  const getChannelStateStyle = (state) => {
    switch (state) {
      case 'RUNNING': return { color: '#00C851', icon: '🟢' };
      case 'IDLE': return { color: '#FF8800', icon: '🟡' };
      case 'STARTING': return { color: '#2BBBAD', icon: '🔵' };
      case 'STOPPING': return { color: '#FF4444', icon: '🟠' };
      case 'CREATING': return { color: '#AA66CC', icon: '🟣' };
      default: return { color: '#999999', icon: '⚪' };
    }
  };

  return (
    <div className="card">
      <div className="settings-header">
        <h2>Settings</h2>
        <div className="settings-controls">
          <button 
            className="btn btn-secondary"
            onClick={resetSettings}
          >
            Reset
          </button>
          <button 
            className="btn btn-primary"
            onClick={saveSettings}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>

      {message && (
        <div className={`settings-message ${message.type}`}>
          {message.type === 'success' ? '✅' : '❌'} {message.text}
        </div>
      )}

      <div className="settings-section">
        <h3>MediaLive Configuration</h3>
        <div className="medialive-config">
          <div className="config-status">
            <div className="status-indicator">
              <span className="status-icon">
                {getStatusIcon(mediaLiveConfig.connectionStatus)}
              </span>
              <span className="status-text">
                {getStatusText(mediaLiveConfig.connectionStatus)}
              </span>
            </div>
            {mediaLiveConfig.lastTested && (
              <div className="last-tested">
                Last tested: {new Date(mediaLiveConfig.lastTested).toLocaleString()}
              </div>
            )}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="channelId">MediaLive Channel ID</label>
              <input
                type="text"
                id="channelId"
                name="channelId"
                value={mediaLiveConfig.channelId}
                onChange={handleConfigChange}
                placeholder="e.g: 1234567"
                required
              />
              <small>Enter your AWS MediaLive Channel ID</small>
            </div>

            <div className="form-group">
              <label htmlFor="region">AWS Region</label>
              <select
                id="region"
                name="region"
                value={mediaLiveConfig.region}
                onChange={handleConfigChange}
              >
                <option value="ap-northeast-2">Asia Pacific (Seoul)</option>
                <option value="us-east-1">US East (N. Virginia)</option>
                <option value="us-west-2">US West (Oregon)</option>
                <option value="eu-west-1">Europe (Ireland)</option>
              </select>
            </div>
          </div>

          {mediaLiveConfig.channelName && (
            <div className="channel-info">
              <h4>Channel Information</h4>
              <div className="info-grid">
                <div className="info-item">
                  <span className="info-label">Channel Name:</span>
                  <span className="info-value">{mediaLiveConfig.channelName}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Channel State:</span>
                  <span 
                    className="info-value channel-state" 
                    style={{ color: getChannelStateStyle(mediaLiveConfig.channelState).color }}
                  >
                    {getChannelStateStyle(mediaLiveConfig.channelState).icon} {mediaLiveConfig.channelState || 'UNKNOWN'}
                  </span>
                </div>
                <div className="info-item">
                  <span className="info-label">Ad Scheduling:</span>
                  <span className="info-value">
                    {mediaLiveConfig.channelState === 'RUNNING' ? '✅ Available' : '❌ Unavailable'}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="connection-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={testConnection}
              disabled={testing || !mediaLiveConfig.channelId}
            >
              {testing ? '⏳ Testing...' : '🔍 Test Connection'}
            </button>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h3>System Information</h3>
        <div className="system-info">
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">Version:</span>
              <span className="info-value">Adsynk v1.0.0</span>
            </div>
            <div className="info-item">
              <span className="info-label">Environment:</span>
              <span className="info-value">Development</span>
            </div>
            <div className="info-item">
              <span className="info-label">Region:</span>
              <span className="info-value">{mediaLiveConfig.region}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="settings-info">
        <h3>Configuration Guide</h3>
        <ul>
          <li>Enter your MediaLive Channel ID to enable SCTE-35 integration</li>
          <li>Test the connection to verify channel accessibility</li>
          <li>SCTE-35 support is required for automatic ad scheduling</li>
          <li>Save settings to persist configuration across sessions</li>
        </ul>
      </div>
    </div>
  );
};

export default Settings; 