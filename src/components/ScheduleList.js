import React, { useState } from 'react';
import { format, parseISO, isPast, isWithinInterval, addMinutes } from 'date-fns';

const ScheduleList = ({ schedules, ads, onScheduleDelete, onRefresh }) => {
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('time');

  // 광고 정보 찾기
  const getAdInfo = (adId) => {
    return ads.find(ad => ad.ad_id === adId) || { title: 'Unknown', advertiser: 'Unknown' };
  };

  // 스케줄 상태 계산
  const getScheduleStatus = (schedule) => {
    const scheduleTime = parseISO(schedule.schedule_time);
    const now = new Date();
    
    if (schedule.status === 'completed') return 'completed';
    if (isPast(scheduleTime)) return 'expired';
    
    // 현재 시간이 스케줄 시간의 1분 이내인지 확인
    const isActive = isWithinInterval(now, {
      start: addMinutes(scheduleTime, -1),
      end: addMinutes(scheduleTime, 1)
    });
    
    if (isActive) return 'active';
    return 'scheduled';
  };

  // 필터링된 스케줄
  const filteredSchedules = schedules.filter(schedule => {
    if (filter === 'all') return true;
    return getScheduleStatus(schedule) === filter;
  });

  // 정렬된 스케줄
  const sortedSchedules = [...filteredSchedules].sort((a, b) => {
    if (sortBy === 'time') {
      return new Date(a.schedule_time) - new Date(b.schedule_time);
    }
    if (sortBy === 'status') {
      return getScheduleStatus(a).localeCompare(getScheduleStatus(b));
    }
    return 0;
  });

  // 스케줄 삭제 확인 (Phase 4: MediaLive 통합)
  const handleDelete = (schedule) => {
    const adInfo = getAdInfo(schedule.ad_id);
    const confirmMessage = `"${adInfo.title}" 스케줄을 삭제하시겠습니까?\n시간: ${format(parseISO(schedule.schedule_time), 'yyyy-MM-dd HH:mm')}\n\n⚠️ MediaLive SCTE-35 스케줄도 함께 삭제됩니다.`;
    
    if (window.confirm(confirmMessage)) {
      // Phase 4: 스케줄 ID와 함께 스케줄 데이터도 전달
      onScheduleDelete(schedule.schedule_id, {
        event_name: schedule.event_name,
        schedule_time: schedule.schedule_time,
        ad_id: schedule.ad_id,
        duration: schedule.duration
      });
    }
  };

  // 상태별 아이콘 렌더링 (텍스트 없이 아이콘만)
  const renderStatusIcon = (status) => {
    const icons = {
      scheduled: '⏰',
      active: '🔴', 
      completed: '✅',
      expired: '❌'
    };
    
    return (
      <span className="status-icon" title={getStatusText(status)}>
        {icons[status] || icons.scheduled}
      </span>
    );
  };

  // 상태 텍스트 반환
  const getStatusText = (status) => {
    const statusTexts = {
      scheduled: 'Scheduled',
      active: 'Active',
      completed: 'Completed', 
      expired: 'Expired'
    };
    return statusTexts[status] || 'Scheduled';
  };

  return (
    <div className="card">
      <div className="schedule-header">
        <h2>Ad Schedule List</h2>
        <div className="schedule-controls">
          <button className="btn btn-secondary" onClick={onRefresh}>
            🔄 Refresh
          </button>
        </div>
      </div>

      <div className="status-legend">
        <div className="legend-items">
          <div className="legend-item">
            <span className="status-icon">⏰</span>
            <span>Scheduled</span>
          </div>
          <div className="legend-item">
            <span className="status-icon">🔴</span>
            <span>Active</span>
          </div>
          <div className="legend-item">
            <span className="status-icon">✅</span>
            <span>Completed</span>
          </div>
          <div className="legend-item">
            <span className="status-icon">❌</span>
            <span>Expired</span>
          </div>
        </div>
      </div>

      <div className="filters">
        <div className="filter-group">
          <label>Status Filter:</label>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="scheduled">Scheduled</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="expired">Expired</option>
          </select>
        </div>
        
        <div className="filter-group">
          <label>Sort by:</label>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="time">Time</option>
            <option value="status">Status</option>
          </select>
        </div>
      </div>

      {sortedSchedules.length === 0 ? (
        <div className="no-schedules">
          {filter === 'all' 
            ? '📅 No schedules registered.' 
            : `📅 No schedules with ${filter} status.`
          }
        </div>
      ) : (
        <div className="schedule-table">
          <table className="table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Schedule Time</th>
                <th>Ad Info</th>
                <th>Event Name</th>
                <th>Length</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedSchedules.map(schedule => {
                const adInfo = getAdInfo(schedule.ad_id);
                const status = getScheduleStatus(schedule);
                const scheduleTime = parseISO(schedule.schedule_time);
                
                return (
                  <tr key={schedule.schedule_id} className={`schedule-row ${status}`}>
                    <td>
                      {renderStatusIcon(status)}
                    </td>
                    <td>
                      <div className="schedule-time">
                        <div className="date">
                          {format(scheduleTime, 'yyyy-MM-dd')}
                        </div>
                        <div className="time">
                          {format(scheduleTime, 'HH:mm:ss')}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="ad-info">
                        <div className="ad-title">{adInfo.title}</div>
                        <div className="ad-advertiser">{adInfo.advertiser}</div>
                      </div>
                    </td>
                    <td>
                      <span className="event-name">
                        {schedule.event_name || '-'}
                      </span>
                    </td>
                    <td>
                      <span className="duration">{schedule.duration}sec</span>
                    </td>
                    <td>
                      <div className="schedule-actions">
                        {status === 'scheduled' && (
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDelete(schedule)}
                            title="Delete Schedule"
                          >
                            🗑️
                          </button>
                        )}
                        {status === 'expired' && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleDelete(schedule)}
                            title="Delete Expired Schedule"
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="schedule-summary">
        <div className="summary-stats">
          <div className="stat">
            <span className="stat-label">Total Schedules:</span>
            <span className="stat-value">{schedules.length}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Scheduled:</span>
            <span className="stat-value">
              {schedules.filter(s => getScheduleStatus(s) === 'scheduled').length}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Completed:</span>
            <span className="stat-value">
              {schedules.filter(s => getScheduleStatus(s) === 'completed').length}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScheduleList; 