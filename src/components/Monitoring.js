import React, { useState, useEffect } from 'react';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isToday, startOfYear, eachMonthOfInterval, subDays } from 'date-fns';
import { adAPI, scheduleAPI, analyticsAPI } from '../services/api';

const Monitoring = () => {
  // 광고 성과 데이터 상태
  const [adPerformanceData, setAdPerformanceData] = useState({
    totalImpressions: 0,
    totalAds: 0,
    totalAdvertisers: 0,
    successRate: 0,
    avgDuration: 0,
    topPerformingAds: [],
    advertiserStats: [],
    dailyStats: [],
    monthlyStats: []
  });

  // 필터 및 설정 상태
  const [dateRange, setDateRange] = useState({
    startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    endDate: format(endOfMonth(new Date()), 'yyyy-MM-dd')
  });

  const [viewType, setViewType] = useState('daily'); // daily, monthly
  const [selectedAdvertiser, setSelectedAdvertiser] = useState('all');
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [exporting, setExporting] = useState(false);

  // 툴팁 상태
  const [tooltip, setTooltip] = useState({ 
    show: false, 
    x: 0, 
    y: 0, 
    data: null 
  });

  // 광고 성과 데이터 로드
  const loadAdPerformanceData = async () => {
    try {
      const [adsData, schedulesData] = await Promise.all([
        adAPI.getAds(),
        scheduleAPI.getSchedules()
      ]);

      // 날짜 범위 필터링
      const startDate = new Date(dateRange.startDate);
      const endDate = new Date(dateRange.endDate + 'T23:59:59');
      
      const filteredSchedules = schedulesData.filter(schedule => {
        const scheduleDate = parseISO(schedule.schedule_time);
        return scheduleDate >= startDate && scheduleDate <= endDate;
      });

      // 광고별 성과 집계
      const adPerformanceMap = new Map();
      const advertiserMap = new Map();
      const dailyStatsMap = new Map();
      const monthlyStatsMap = new Map();

      filteredSchedules.forEach(schedule => {
        const ad = adsData.find(a => a.ad_id === schedule.ad_id);
        if (!ad) return;

        const scheduleDate = format(parseISO(schedule.schedule_time), 'yyyy-MM-dd');
        const scheduleMonth = format(parseISO(schedule.schedule_time), 'yyyy-MM');
        const isSuccess = schedule.status === 'completed';
        
        // 광고별 통계
        if (!adPerformanceMap.has(schedule.ad_id)) {
          adPerformanceMap.set(schedule.ad_id, {
            ad_id: schedule.ad_id,
            title: ad.title,
            advertiser: ad.advertiser,
            totalImpressions: 0,
            successfulImpressions: 0,
            failedImpressions: 0,
            totalDuration: 0,
            lastImpression: schedule.schedule_time
          });
        }

        const adStats = adPerformanceMap.get(schedule.ad_id);
        adStats.totalImpressions++;
        adStats.totalDuration += schedule.duration;
        
        if (isSuccess) {
          adStats.successfulImpressions++;
        } else {
          adStats.failedImpressions++;
        }

        if (parseISO(schedule.schedule_time) > parseISO(adStats.lastImpression)) {
          adStats.lastImpression = schedule.schedule_time;
        }

        // 광고주별 통계
        if (!advertiserMap.has(ad.advertiser)) {
          advertiserMap.set(ad.advertiser, {
            name: ad.advertiser,
            totalImpressions: 0,
            successfulImpressions: 0,
            totalAds: new Set(),
            totalDuration: 0
          });
        }

        const advertiserStats = advertiserMap.get(ad.advertiser);
        advertiserStats.totalImpressions++;
        advertiserStats.totalAds.add(schedule.ad_id);
        advertiserStats.totalDuration += schedule.duration;
        
        if (isSuccess) {
          advertiserStats.successfulImpressions++;
        }

        // 일별 통계 (광고주별 분리)
        const dailyKey = `${scheduleDate}-${ad.advertiser}`;
        if (!dailyStatsMap.has(dailyKey)) {
          dailyStatsMap.set(dailyKey, {
            date: scheduleDate,
            advertiser: ad.advertiser,
            totalImpressions: 0,
            successfulImpressions: 0,
            uniqueAds: new Set(),
            totalDuration: 0
          });
        }

        const dailyStats = dailyStatsMap.get(dailyKey);
        dailyStats.totalImpressions++;
        dailyStats.uniqueAds.add(schedule.ad_id);
        dailyStats.totalDuration += schedule.duration;
        
        if (isSuccess) {
          dailyStats.successfulImpressions++;
        }

        // 월별 통계 (광고주별 분리)
        const monthlyKey = `${scheduleMonth}-${ad.advertiser}`;
        if (!monthlyStatsMap.has(monthlyKey)) {
          monthlyStatsMap.set(monthlyKey, {
            month: scheduleMonth,
            advertiser: ad.advertiser,
            totalImpressions: 0,
            successfulImpressions: 0,
            uniqueAds: new Set(),
            totalDuration: 0
          });
        }

        const monthlyStats = monthlyStatsMap.get(monthlyKey);
        monthlyStats.totalImpressions++;
        monthlyStats.uniqueAds.add(schedule.ad_id);
        monthlyStats.totalDuration += schedule.duration;
        
        if (isSuccess) {
          monthlyStats.successfulImpressions++;
        }
      });

      // 상위 성과 광고 (노출 횟수 기준)
      const topPerformingAds = Array.from(adPerformanceMap.values())
        .sort((a, b) => b.totalImpressions - a.totalImpressions)
        .slice(0, 10)
        .map(ad => ({
          ...ad,
          successRate: ad.totalImpressions > 0 ? (ad.successfulImpressions / ad.totalImpressions * 100).toFixed(1) : 0
        }));

      // 광고주별 통계 정리
      const advertiserStats = Array.from(advertiserMap.values())
        .map(advertiser => ({
          ...advertiser,
          totalAds: advertiser.totalAds.size,
          successRate: advertiser.totalImpressions > 0 ? (advertiser.successfulImpressions / advertiser.totalImpressions * 100).toFixed(1) : 0,
          avgDuration: advertiser.totalImpressions > 0 ? (advertiser.totalDuration / advertiser.totalImpressions).toFixed(1) : 0
        }))
        .sort((a, b) => b.totalImpressions - a.totalImpressions);

      // 일별 통계 정리 (날짜 범위 전체를 포함)
      const dateInterval = eachDayOfInterval({ start: startDate, end: endDate });
      const dailyStats = dateInterval.map(date => {
        const dateStr = format(date, 'yyyy-MM-dd');
        
        // 전체 광고주 또는 선택된 광고주의 데이터 집계
        let totalImpressions = 0;
        let successfulImpressions = 0;
        let uniqueAds = new Set();
        let totalDuration = 0;

        if (selectedAdvertiser === 'all') {
          // 모든 광고주 데이터 합계
          for (const [key, stats] of dailyStatsMap) {
            if (key.startsWith(dateStr)) {
              totalImpressions += stats.totalImpressions;
              successfulImpressions += stats.successfulImpressions;
              stats.uniqueAds.forEach(ad => uniqueAds.add(ad));
              totalDuration += stats.totalDuration;
            }
          }
        } else {
          // 선택된 광고주만
          const key = `${dateStr}-${selectedAdvertiser}`;
          const stats = dailyStatsMap.get(key);
          if (stats) {
            totalImpressions = stats.totalImpressions;
            successfulImpressions = stats.successfulImpressions;
            uniqueAds = stats.uniqueAds;
            totalDuration = stats.totalDuration;
          }
        }
        
        return {
          date: dateStr,
          totalImpressions,
          successfulImpressions,
          uniqueAds: uniqueAds.size,
          totalDuration,
          successRate: totalImpressions > 0 ? (successfulImpressions / totalImpressions * 100).toFixed(1) : 0
        };
      });

      // 월별 통계 정리 (현재 연도 12개월)
      const currentYear = new Date().getFullYear();
      const yearStart = startOfYear(new Date());
      const monthInterval = eachMonthOfInterval({ start: yearStart, end: new Date() });
      const monthlyStats = monthInterval.map(month => {
        const monthStr = format(month, 'yyyy-MM');
        
        // 전체 광고주 또는 선택된 광고주의 데이터 집계
        let totalImpressions = 0;
        let successfulImpressions = 0;
        let uniqueAds = new Set();
        let totalDuration = 0;

        if (selectedAdvertiser === 'all') {
          // 모든 광고주 데이터 합계
          for (const [key, stats] of monthlyStatsMap) {
            if (key.startsWith(monthStr)) {
              totalImpressions += stats.totalImpressions;
              successfulImpressions += stats.successfulImpressions;
              stats.uniqueAds.forEach(ad => uniqueAds.add(ad));
              totalDuration += stats.totalDuration;
            }
          }
        } else {
          // 선택된 광고주만
          const key = `${monthStr}-${selectedAdvertiser}`;
          const stats = monthlyStatsMap.get(key);
          if (stats) {
            totalImpressions = stats.totalImpressions;
            successfulImpressions = stats.successfulImpressions;
            uniqueAds = stats.uniqueAds;
            totalDuration = stats.totalDuration;
          }
        }
        
        return {
          month: monthStr,
          monthName: format(month, 'MMM'),
          totalImpressions,
          successfulImpressions,
          uniqueAds: uniqueAds.size,
          totalDuration,
          successRate: totalImpressions > 0 ? (successfulImpressions / totalImpressions * 100).toFixed(1) : 0
        };
      });

      // 전체 통계 계산 (선택된 광고주 기준)
      let filteredSchedulesForStats = filteredSchedules;
      if (selectedAdvertiser !== 'all') {
        filteredSchedulesForStats = filteredSchedules.filter(schedule => {
          const ad = adsData.find(a => a.ad_id === schedule.ad_id);
          return ad && ad.advertiser === selectedAdvertiser;
        });
      }

      const totalImpressions = filteredSchedulesForStats.length;
      const successfulImpressions = filteredSchedulesForStats.filter(s => s.status === 'completed').length;
      const successRate = totalImpressions > 0 ? (successfulImpressions / totalImpressions * 100).toFixed(1) : 0;
      const totalDuration = filteredSchedulesForStats.reduce((sum, schedule) => sum + schedule.duration, 0);
      const avgDuration = totalImpressions > 0 ? (totalDuration / totalImpressions).toFixed(1) : 0;
      const uniqueAdvertisers = selectedAdvertiser === 'all' 
        ? new Set(adsData.map(ad => ad.advertiser)).size
        : 1;

      setAdPerformanceData({
        totalImpressions,
        totalAds: adsData.length,
        totalAdvertisers: uniqueAdvertisers,
        successRate,
        avgDuration,
        topPerformingAds,
        advertiserStats,
        dailyStats,
        monthlyStats
      });

    } catch (error) {
      console.error('Failed to load ad performance data:', error);
    }
  };

  // 데이터 새로고침
  const refreshData = async () => {
    setLoading(true);
    try {
      await loadAdPerformanceData();
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Failed to refresh data:', error);
    } finally {
      setLoading(false);
    }
  };

  // CSV 내보내기
  const handleExportCSV = async () => {
    setExporting(true);
    try {
      await analyticsAPI.exportCSV(dateRange.startDate, dateRange.endDate);
      console.log('CSV export completed successfully');
    } catch (error) {
      console.error('Failed to export CSV:', error);
      alert('Failed to export CSV. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  // 초기 데이터 로드 및 날짜 범위/광고주 변경 시 재로드
  useEffect(() => {
    refreshData();
  }, [dateRange, selectedAdvertiser]);

  // 차트 데이터 준비 (viewType에 따라 다른 데이터)
  const chartData = viewType === 'daily' 
    ? adPerformanceData.dailyStats.slice(-30) // 최근 30일
    : adPerformanceData.monthlyStats; // 월별 데이터

  // 차트 제목 동적 설정
  const getChartTitle = () => {
    const baseTitle = viewType === 'daily' 
      ? 'Daily Ad Impressions Trend' 
      : 'Monthly Ad Impressions Trend';
    
    if (selectedAdvertiser !== 'all') {
      return `${baseTitle} - ${selectedAdvertiser}`;
    }
    return baseTitle;
  };

  // 마우스 이벤트 핸들러
  const handleMouseEnter = (event, data) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    
    setTooltip({
      show: true,
      x: rect.left + scrollLeft + rect.width / 2,
      y: rect.top + scrollTop - 10,
      data
    });
  };

  const handleMouseLeave = () => {
    setTooltip({ show: false, x: 0, y: 0, data: null });
  };

  // 선 그래프 생성 (안정적인 버전)
  const createLineChart = (data) => {
    console.log('Chart data:', data); // 디버깅용

    if (!data || data.length === 0) {
      return (
        <div className="no-data-message">
          <p>No data available for the selected period.</p>
        </div>
      );
    }

    const maxImpressions = Math.max(...data.map(d => d.totalImpressions || 0), 1);
    const chartWidth = 1300;
    const chartHeight = 450;
    const padding = { top: 60, right: 100, bottom: 100, left: 100 };
    const chartAreaWidth = chartWidth - padding.left - padding.right;
    const chartAreaHeight = chartHeight - padding.top - padding.bottom;

    // 데이터 포인트 계산
    const points = data.map((item, index) => {
      const x = padding.left + (index / (data.length - 1)) * chartAreaWidth;
      const impressions = item.totalImpressions || 0;
      const y = padding.top + chartAreaHeight - (impressions / maxImpressions) * chartAreaHeight;
      return { x, y, data: item, impressions };
    });

    // 선 경로 생성
    const pathData = points.map((point, index) => 
      `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
    ).join(' ');

    return (
      <div className="line-chart-container">
        <svg width="100%" height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`} style={{ background: 'transparent', overflow: 'visible' }}>
          {/* 그리드 배경 및 그라데이션 정의 */}
          <defs>
            <pattern id="grid" width="50" height="40" patternUnits="userSpaceOnUse">
              <path d="M 50 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>
            </pattern>
            <linearGradient id="purpleGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#8B5CF6" stopOpacity="1"/>
              <stop offset="50%" stopColor="#A855F7" stopOpacity="1"/>
              <stop offset="100%" stopColor="#9333EA" stopOpacity="1"/>
            </linearGradient>
            <linearGradient id="pointGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#C084FC" stopOpacity="1"/>
              <stop offset="100%" stopColor="#8B5CF6" stopOpacity="1"/>
            </linearGradient>
          </defs>
          
          <rect 
            x={padding.left} 
            y={padding.top} 
            width={chartAreaWidth} 
            height={chartAreaHeight} 
            fill="url(#grid)" 
          />
          
          {/* Y축 라벨들 */}
          <text x={padding.left - 15} y={padding.top + 5} fill="rgba(255,255,255,0.7)" fontSize="12" textAnchor="end">
            {maxImpressions}
          </text>
          <text x={padding.left - 15} y={padding.top + chartAreaHeight / 2} fill="rgba(255,255,255,0.7)" fontSize="12" textAnchor="end">
            {Math.round(maxImpressions / 2)}
          </text>
          <text x={padding.left - 15} y={padding.top + chartAreaHeight} fill="rgba(255,255,255,0.7)" fontSize="12" textAnchor="end">
            0
          </text>
          
          {/* Y축 선 */}
          <line 
            x1={padding.left} 
            y1={padding.top} 
            x2={padding.left} 
            y2={padding.top + chartAreaHeight} 
            stroke="rgba(255,255,255,0.3)" 
            strokeWidth="2"
          />
          
          {/* X축 선 */}
          <line 
            x1={padding.left} 
            y1={padding.top + chartAreaHeight} 
            x2={padding.left + chartAreaWidth} 
            y2={padding.top + chartAreaHeight} 
            stroke="rgba(255,255,255,0.3)" 
            strokeWidth="2"
          />
          
          {/* 선 그래프 */}
          {points.length > 1 && (
            <path
              d={pathData}
              fill="none"
              stroke="url(#purpleGradient)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ filter: 'drop-shadow(0 0 8px rgba(139, 92, 246, 0.4))' }}
            />
          )}
          
          {/* 데이터 포인트 */}
          {points.map((point, index) => (
            <g key={index}>
              {/* 포인트 원 */}
              <circle
                cx={point.x}
                cy={point.y}
                r="7"
                fill="url(#pointGradient)"
                stroke="#8B5CF6"
                strokeWidth="3"
                className="chart-point"
                onMouseEnter={(e) => handleMouseEnter(e, point.data)}
                onMouseLeave={handleMouseLeave}
                style={{ 
                  cursor: 'pointer',
                  filter: 'drop-shadow(0 0 6px rgba(139, 92, 246, 0.6))'
                }}
              />
              
              {/* 수치 표시 */}
              {point.impressions > 0 && (
                <text
                  x={point.x}
                  y={point.y - 18}
                  textAnchor="middle"
                  fill="#C084FC"
                  fontSize="12"
                  fontWeight="700"
                  style={{ filter: 'drop-shadow(0 0 4px rgba(192, 132, 252, 0.8))' }}
                >
                  {point.impressions}
                </text>
              )}
            </g>
          ))}
          
          {/* X축 라벨 */}
          {points.map((point, index) => (
            <text
              key={index}
              x={point.x}
              y={padding.top + chartAreaHeight + 25}
              textAnchor="middle"
              fill="rgba(255,255,255,0.7)"
              fontSize="11"
              transform={`rotate(-45 ${point.x} ${padding.top + chartAreaHeight + 25})`}
            >
              {viewType === 'daily' 
                ? (point.data.date ? format(new Date(point.data.date), 'MM/dd') : `Day ${index + 1}`)
                : (point.data.monthName || `Month ${index + 1}`)
              }
            </text>
          ))}
        </svg>
        
        {/* 툴팁 */}
        {tooltip.show && tooltip.data && (
          <div 
            className="chart-tooltip"
            style={{
              position: 'absolute',
              left: tooltip.x - 120,
              top: tooltip.y - 140,
              zIndex: 1000,
              pointerEvents: 'none'
            }}
          >
            <div className="tooltip-content">
              <div className="tooltip-title">
                {viewType === 'daily' 
                  ? (tooltip.data.date ? format(new Date(tooltip.data.date), 'yyyy-MM-dd') : 'Date')
                  : `${tooltip.data.monthName || 'Month'} 2025`
                }
              </div>
              <div className="tooltip-item">
                📺 Total Impressions: <strong>{(tooltip.data.totalImpressions || 0).toLocaleString()}</strong>
              </div>
              <div className="tooltip-item">
                🎯 Success Rate: <strong>{tooltip.data.successRate || 0}%</strong>
              </div>
              <div className="tooltip-item">
                🏢 Unique Ads: <strong>{tooltip.data.uniqueAds || 0}</strong>
              </div>
              <div className="tooltip-item">
                ⏱️ Total Duration: <strong>{Math.round((tooltip.data.totalDuration || 0) / 60)}m</strong>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="monitoring-dashboard">
      {/* 대시보드 헤더 */}
      <div className="monitoring-header">
          <div className="header-content">
            <h2>Ad Performance Dashboard</h2>
            <div className="dashboard-controls">
              <div className="date-range-picker">
                <label>Start Date:</label>
                <input
                  type="date"
                  value={dateRange.startDate}
                  onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                />
                <label>End Date:</label>
                <input
                  type="date"
                  value={dateRange.endDate}
                  onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                />
              </div>
              <div className="view-controls">
                <select
                  value={viewType}
                  onChange={(e) => setViewType(e.target.value)}
                >
                  <option value="daily">Daily View</option>
                  <option value="monthly">Monthly View</option>
                </select>
                <select
                  value={selectedAdvertiser}
                  onChange={(e) => setSelectedAdvertiser(e.target.value)}
                >
                  <option value="all">All Advertisers</option>
                  {adPerformanceData.advertiserStats.map(advertiser => (
                    <option key={advertiser.name} value={advertiser.name}>
                      {advertiser.name}
                    </option>
                  ))}
                </select>
              </div>
              <button 
                className="btn btn-secondary"
                onClick={refreshData}
                disabled={loading}
              >
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
              <button 
                className="btn btn-primary"
                onClick={handleExportCSV}
                disabled={exporting}
              >
                {exporting ? 'Exporting...' : '📊 Export CSV'}
              </button>
              {lastRefresh && (
                <div className="last-refresh">
                  Last updated: {format(lastRefresh, 'HH:mm:ss')}
                </div>
              )}
            </div>
          </div>
        </div>

      {/* 주요 지표 카드 (순서 변경: Total → Active → Avg Daily → Avg Duration → Success) */}
      <div className="metrics-grid">
        {/* 1. Total Ad Impressions */}
        <div className="metric-card">
          <div className="metric-icon">📺</div>
          <div className="metric-content">
            <div className="metric-value">{adPerformanceData.totalImpressions.toLocaleString()}</div>
            <div className="metric-label">Total Ad Impressions</div>
            <div className="metric-detail">
              {selectedAdvertiser === 'all' ? 'in selected period' : `for ${selectedAdvertiser}`}
            </div>
          </div>
        </div>

        {/* 2. Active Advertisers */}
        <div className="metric-card">
          <div className="metric-icon">🏢</div>
          <div className="metric-content">
            <div className="metric-value">{adPerformanceData.totalAdvertisers}</div>
            <div className="metric-label">Active Advertisers</div>
            <div className="metric-detail">
              {adPerformanceData.totalAds} total ads
            </div>
          </div>
        </div>

        {/* 3. Avg Daily Impressions */}
        <div className="metric-card">
          <div className="metric-icon">📈</div>
          <div className="metric-content">
            <div className="metric-value">
              {adPerformanceData.dailyStats.length > 0 
                ? Math.round(adPerformanceData.totalImpressions / adPerformanceData.dailyStats.length)
                : 0}
            </div>
            <div className="metric-label">Avg Daily Impressions</div>
            <div className="metric-detail">
              per day average
            </div>
          </div>
        </div>

        {/* 4. Avg Ad Duration */}
        <div className="metric-card">
          <div className="metric-icon">⏱️</div>
          <div className="metric-content">
            <div className="metric-value">{adPerformanceData.avgDuration}s</div>
            <div className="metric-label">Avg Ad Duration</div>
            <div className="metric-detail">
              avg per ad
            </div>
          </div>
        </div>

        {/* 5. Success Rate */}
        <div className="metric-card">
          <div className="metric-icon">🎯</div>
          <div className="metric-content">
            <div className="metric-value">{adPerformanceData.successRate}%</div>
            <div className="metric-label">Success Rate</div>
            <div className="metric-detail">
              successful insertions
            </div>
          </div>
        </div>
      </div>

      {/* 트렌드 차트 (선 그래프) */}
      <div className="chart-section">
        <div className="card">
          <div className="card-header">
            <h3>{getChartTitle()}</h3>
          </div>
          
          <div className="chart-container">
            {createLineChart(chartData)}
          </div>
        </div>
      </div>

      {/* 상위 성과 광고 */}
      <div className="top-ads-section">
        <div className="card">
          <div className="card-header">
            <h3>Top Performing Ads</h3>
          </div>
          
          <div className="top-ads-table">
            <table className="table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Ad Title</th>
                  <th>Advertiser</th>
                  <th>Impressions</th>
                  <th>Success Rate</th>
                  <th>Avg Duration</th>
                  <th>Last Impression</th>
                </tr>
              </thead>
              <tbody>
                {adPerformanceData.topPerformingAds.map((ad, index) => (
                  <tr key={ad.ad_id}>
                    <td>
                      <div className="rank-badge">
                        {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                      </div>
                    </td>
                    <td>
                      <div className="ad-title">{ad.title}</div>
                    </td>
                    <td>
                      <div className="advertiser-name">{ad.advertiser}</div>
                    </td>
                    <td>
                      <div className="impression-count">
                        {ad.totalImpressions.toLocaleString()}
                      </div>
                    </td>
                    <td>
                      <div 
                        className="success-rate"
                        style={{ 
                          color: parseFloat(ad.successRate) >= 95 ? '#32D74B' : 
                                parseFloat(ad.successRate) >= 80 ? '#FF9500' : '#FF3B30'
                        }}
                      >
                        {ad.successRate}%
                      </div>
                    </td>
                    <td>
                      <div className="avg-duration">
                        {(ad.totalDuration / ad.totalImpressions).toFixed(1)}s
                      </div>
                    </td>
                    <td>
                      <div className="last-impression">
                        {format(parseISO(ad.lastImpression), 'MM/dd HH:mm')}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 광고주별 성과 */}
      <div className="advertiser-stats-section">
        <div className="card">
          <div className="card-header">
            <h3>Advertiser Performance</h3>
          </div>
          
          <div className="advertiser-grid">
            {adPerformanceData.advertiserStats.map(advertiser => (
              <div key={advertiser.name} className="advertiser-card">
                <div className="advertiser-header">
                  <h4>{advertiser.name}</h4>
                  <div className="advertiser-rank">
                    {advertiser.totalImpressions.toLocaleString()} impressions
                  </div>
                </div>
                <div className="advertiser-metrics">
                  <div className="advertiser-metric">
                    <span className="metric-label">Success Rate:</span>
                    <span 
                      className="metric-value"
                      style={{ 
                        color: parseFloat(advertiser.successRate) >= 95 ? '#32D74B' : 
                              parseFloat(advertiser.successRate) >= 80 ? '#FF9500' : '#FF3B30'
                      }}
                    >
                      {advertiser.successRate}%
                    </span>
                  </div>
                  <div className="advertiser-metric">
                    <span className="metric-label">Total Ads:</span>
                    <span className="metric-value">{advertiser.totalAds}</span>
                  </div>
                  <div className="advertiser-metric">
                    <span className="metric-label">Avg Duration:</span>
                    <span className="metric-value">{advertiser.avgDuration}s</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 주간 성과 상세 (1주일로 단축) */}
      <div className="weekly-stats-section">
        <div className="card">
          <div className="card-header">
            <h3>Weekly Performance</h3>
          </div>
          
          <div className="weekly-stats-table">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Total Impressions</th>
                  <th>Successful</th>
                  <th>Success Rate</th>
                  <th>Unique Ads</th>
                  <th>Total Duration</th>
                </tr>
              </thead>
              <tbody>
                {adPerformanceData.dailyStats.slice(-7).reverse().map(day => (
                  <tr key={day.date} className={isToday(new Date(day.date)) ? 'today-row' : ''}>
                    <td>
                      <div className="date-cell">
                        {format(new Date(day.date), 'yyyy-MM-dd')}
                        {isToday(new Date(day.date)) && <span className="today-badge">Today</span>}
                      </div>
                    </td>
                    <td>
                      <div className="impression-cell">
                        {day.totalImpressions.toLocaleString()}
                      </div>
                    </td>
                    <td>
                      <div className="successful-cell">
                        {day.successfulImpressions.toLocaleString()}
                      </div>
                    </td>
                    <td>
                      <div 
                        className="success-rate-cell"
                        style={{ 
                          color: parseFloat(day.successRate) >= 95 ? '#32D74B' : 
                                parseFloat(day.successRate) >= 80 ? '#FF9500' : '#FF3B30'
                        }}
                      >
                        {day.successRate}%
                      </div>
                    </td>
                    <td>
                      <div className="unique-ads-cell">
                        {day.uniqueAds}
                      </div>
                    </td>
                    <td>
                      <div className="duration-cell">
                        {Math.round(day.totalDuration / 60)}m
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

const monitoringStyles = `
  .monitoring-dashboard {
    padding: 20px;
    min-height: 100vh;
    color: white;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .monitoring-header {
    margin-bottom: 30px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 12px;
    padding: 20px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .header-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 20px;
  }

  .header-content h2 {
    margin: 0;
    font-size: 28px;
    font-weight: 700;
    color: #ffffff;
  }

  .dashboard-controls {
    display: flex;
    align-items: center;
    gap: 20px;
    flex-wrap: wrap;
  }

  .date-range-picker {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .date-range-picker label {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.8);
    font-weight: 500;
  }

  .date-range-picker input {
    padding: 8px 12px;
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.1);
    color: white;
    font-size: 14px;
  }

  .view-controls {
    display: flex;
    gap: 10px;
  }

  .view-controls select {
    padding: 8px 12px;
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.1);
    color: white;
    font-size: 14px;
  }

  .btn {
    padding: 8px 16px;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    font-size: 14px;
  }

  .btn-secondary {
    background: rgba(255, 255, 255, 0.2);
    color: white;
    border: 1px solid rgba(255, 255, 255, 0.3);
  }

  .btn-secondary:hover {
    background: rgba(255, 255, 255, 0.3);
    transform: translateY(-1px);
  }

  .btn-secondary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  .last-refresh {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 20px;
    margin-bottom: 30px;
  }

  .metric-card {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 12px;
    padding: 24px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    align-items: center;
    gap: 20px;
    transition: all 0.3s ease;
    position: relative;
    overflow: hidden;
  }

  .metric-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: rgba(255, 255, 255, 0.2);
  }

  .metric-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
    background: rgba(255, 255, 255, 0.08);
  }

  .metric-icon {
    font-size: 32px;
    width: 60px;
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    flex-shrink: 0;
  }

  .metric-content {
    flex: 1;
  }

  .metric-value {
    font-size: 32px;
    font-weight: 700;
    margin-bottom: 4px;
    color: #ffffff;
  }

  .metric-label {
    font-size: 16px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
    margin-bottom: 2px;
  }

  .metric-detail {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
  }

  .chart-section {
    margin-bottom: 30px;
  }

  .card {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    overflow: hidden;
  }

  .card-header {
    padding: 20px 24px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .card-header h3 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    color: #ffffff;
  }

  .chart-container {
    padding: 40px;
    position: relative;
    overflow: hidden;
  }

  .line-chart-container {
    position: relative;
    width: 100%;
    overflow-x: auto;
    min-height: 480px;
    padding: 20px;
  }

  .chart-point {
    /* 호버 효과 제거 */
  }

  .no-data-message {
    text-align: center;
    padding: 60px 20px;
    color: rgba(255, 255, 255, 0.6);
  }

  .no-data-message p {
    font-size: 16px;
    margin: 0;
  }

  .chart-tooltip {
    background: rgba(0, 0, 0, 0.85);
    border-radius: 8px;
    padding: 16px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.4);
    min-width: 220px;
  }

  .tooltip-content {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .tooltip-title {
    font-weight: 600;
    font-size: 14px;
    color: #ffffff;
    margin-bottom: 4px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.2);
    padding-bottom: 4px;
  }

  .tooltip-item {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.9);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .tooltip-item strong {
    color: #ffffff;
    font-weight: 600;
  }

  .top-ads-section, .advertiser-stats-section, .weekly-stats-section {
    margin-bottom: 30px;
  }

  .top-ads-table, .weekly-stats-table {
    padding: 24px;
    overflow-x: auto;
  }

  .table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }

  .table th {
    padding: 12px;
    text-align: left;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
    border-bottom: 2px solid rgba(255, 255, 255, 0.2);
  }

  .table td {
    padding: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .table tr:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .rank-badge {
    font-size: 16px;
    font-weight: 600;
  }

  .ad-title {
    font-weight: 600;
    color: #ffffff;
  }

  .advertiser-name {
    color: rgba(255, 255, 255, 0.8);
  }

  .impression-count {
    font-weight: 600;
    color: #ffffff;
  }

  .success-rate {
    font-weight: 600;
  }

  .avg-duration {
    color: rgba(255, 255, 255, 0.8);
  }

  .last-impression {
    color: rgba(255, 255, 255, 0.6);
    font-size: 12px;
  }

  .advertiser-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 20px;
    padding: 24px;
  }

  .advertiser-card {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 12px;
    padding: 20px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    transition: all 0.3s ease;
  }

  .advertiser-card:hover {
    transform: translateY(-2px);
    background: rgba(255, 255, 255, 0.08);
  }

  .advertiser-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }

  .advertiser-header h4 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: #ffffff;
  }

  .advertiser-rank {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
  }

  .advertiser-metrics {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .advertiser-metric {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 14px;
  }

  .advertiser-metric .metric-label {
    color: rgba(255, 255, 255, 0.7);
  }

  .advertiser-metric .metric-value {
    font-weight: 600;
    color: #ffffff;
  }

  .today-row {
    background: rgba(255, 255, 255, 0.08);
  }

  .date-cell {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .today-badge {
    background: rgba(255, 255, 255, 0.2);
    color: white;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
  }

  .impression-cell {
    font-weight: 600;
    color: #ffffff;
  }

  .successful-cell {
    color: #32D74B;
  }

  .success-rate-cell {
    font-weight: 600;
  }

  .unique-ads-cell {
    color: rgba(255, 255, 255, 0.8);
  }

  .duration-cell {
    color: rgba(255, 255, 255, 0.8);
  }

  /* 반응형 디자인 */
  @media (max-width: 768px) {
    .monitoring-dashboard {
      padding: 15px;
    }

    .header-content {
      flex-direction: column;
      align-items: flex-start;
    }

    .dashboard-controls {
      flex-direction: column;
      align-items: flex-start;
      width: 100%;
    }

    .date-range-picker {
      flex-wrap: wrap;
    }

    .metrics-grid {
      grid-template-columns: 1fr;
    }

    .metric-card {
      padding: 20px;
    }

    .metric-value {
      font-size: 24px;
    }

    .chart-container {
      padding: 16px;
    }

    .line-chart-container svg {
      min-width: 1100px;
    }

    .advertiser-grid {
      grid-template-columns: 1fr;
    }

    .table {
      font-size: 12px;
    }

    .table th, .table td {
      padding: 8px;
    }
  }

  @media (max-width: 480px) {
    .header-content h2 {
      font-size: 24px;
    }

    .metric-icon {
      font-size: 24px;
      width: 50px;
      height: 50px;
    }

    .metric-value {
      font-size: 20px;
    }

    .chart-tooltip {
      min-width: 180px;
      padding: 12px;
    }
  }
`;

// 스타일 주입
if (!document.getElementById('monitoring-styles')) {
  const styleSheet = document.createElement('style');
  styleSheet.id = 'monitoring-styles';
  styleSheet.textContent = monitoringStyles;
  document.head.appendChild(styleSheet);
}

export default Monitoring; 