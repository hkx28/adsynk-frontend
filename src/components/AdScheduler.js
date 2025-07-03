import React, { useState } from 'react';
import { format, addMinutes } from 'date-fns';

const AdScheduler = ({ ads, onScheduleCreate }) => {
  const [formData, setFormData] = useState({
    ad_id: '',
    schedule_time: '',
    event_name: '',
    duration: 30
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // 통합 결과 상태



  // 폼 데이터 변경 핸들러
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // 광고 선택 시 자동으로 duration 설정
    if (name === 'ad_id' && value) {
      const selectedAd = ads.find(ad => ad.ad_id === value);
      if (selectedAd) {
        setFormData(prev => ({
          ...prev,
          duration: selectedAd.duration
        }));
      }
    }
  };

  // 스케줄 생성 핸들러
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.ad_id || !formData.schedule_time) {
      alert('Please select an ad and time.');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      // ISO 형식으로 변환
      const scheduleTime = new Date(formData.schedule_time).toISOString();
      
      const scheduleData = {
        ad_id: formData.ad_id,
        schedule_time: scheduleTime,
        event_name: formData.event_name || `auto-${Date.now()}`,
        duration: parseInt(formData.duration)
      };

      const createResult = await onScheduleCreate(scheduleData);
      setResult(createResult);
      
      if (createResult.success) {
        // 폼 리셋
        setFormData({
          ad_id: '',
          schedule_time: '',
          event_name: '',
          duration: 30
        });
        
        // 결과 메시지 자동 숨김
        setTimeout(() => setResult(null), 5000);
      }
    } catch (error) {
      console.error('Schedule creation error:', error);
    } finally {
      setLoading(false);
    }
  };

  // 빠른 시간 설정 버튼들
  const quickTimeButtons = [
    { label: 'Custom', minutes: null },
    { label: 'Now', minutes: 0 },
    { label: '5min', minutes: 5 },
    { label: '10min', minutes: 10 },
    { label: '30min', minutes: 30 }
  ];

  const setQuickTime = (minutes) => {
    if (minutes === null) {
      // Custom - 현재 시간으로 설정하여 사용자가 수정할 수 있도록
      const now = new Date();
      setFormData(prev => ({
        ...prev,
        schedule_time: format(now, "yyyy-MM-dd'T'HH:mm")
      }));
    } else {
      const futureTime = addMinutes(new Date(), minutes);
      setFormData(prev => ({
        ...prev,
        schedule_time: format(futureTime, "yyyy-MM-dd'T'HH:mm")
      }));
    }
  };

  return (
    <div className="card">
      <h2>Ad Schedule Creation</h2>
      
      {result && (
        <div className={`result-message ${result.success ? 'success' : 'warning'}`}>
          {result.success && result.dynamodbSuccess && result.mediaLiveSuccess && (
            <div>✅ Schedule created and synced with MediaLive successfully!</div>
          )}
          {result.success && result.dynamodbSuccess && !result.mediaLiveSuccess && (
            <div>⚠️ Schedule created but MediaLive sync failed</div>
          )}
          {!result.success && (
            <div>❌ Failed to create schedule</div>
          )}
          {result.errors && result.errors.length > 0 && (
            <div className="error-details">
              {result.errors.map((error, index) => (
                <div key={index} style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
                  • {error}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="ad_id">Ad Selection</label>
          <select
            id="ad_id"
            name="ad_id"
            value={formData.ad_id}
            onChange={handleChange}
            required
          >
            <option value="">Please select an ad</option>
            {ads.filter(ad => ad.active === "true").map(ad => (
              <option key={ad.ad_id} value={ad.ad_id}>
                {ad.title} ({ad.duration}sec) - {ad.advertiser}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="schedule_time">Schedule Time</label>
          <input
            type="datetime-local"
            id="schedule_time"
            name="schedule_time"
            value={formData.schedule_time}
            onChange={handleChange}
            min={format(new Date(), "yyyy-MM-dd'T'HH:mm")}
            required
          />
          <div className="quick-time-buttons">
            {quickTimeButtons.map(({ label, minutes }, index) => (
              <button
                key={index}
                type="button"
                className={`btn ${minutes === null ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setQuickTime(minutes)}
                style={{ margin: '0.25rem' }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="event_name">Event Name (Optional)</label>
          <input
            type="text"
            id="event_name"
            name="event_name"
            value={formData.event_name}
            onChange={handleChange}
            placeholder="e.g: lunch-time-promotion"
          />
        </div>

        <div className="form-group">
          <label htmlFor="duration">Ad Length (sec)</label>
          <input
            type="number"
            id="duration"
            name="duration"
            value={formData.duration}
            onChange={handleChange}
            min="1"
            max="300"
            required
          />
          <small style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.9rem' }}>
            * Must match the actual length of the selected ad
          </small>
        </div>

        <div className="form-actions">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading || !formData.ad_id || !formData.schedule_time}
          >
            {loading ? '⏳ Creating...' : 'Create Schedule'}
          </button>
        </div>
      </form>

      <div className="scheduler-info">
        <h3>📋 Scheduling Guide</h3>
        <ul style={{ textAlign: 'left', color: 'rgba(255, 255, 255, 0.8)' }}>
          <li>Schedules run precisely on a minute-by-minute basis</li>
          <li>MediaLive SCTE-35 schedule must also be created together</li>
          <li>Ad length must match MediaLive settings</li>
          <li>Cannot create schedules for past times</li>
        </ul>
      </div>

      {ads.length === 0 && (
        <div className="no-ads-warning">
          ⚠️ No active ads available. Please upload and activate ads first.
        </div>
      )}
    </div>
  );
};

export default AdScheduler; 