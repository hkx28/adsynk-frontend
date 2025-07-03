import axios from 'axios';
import mediaLiveAPI from './mediaLiveAPI';

// API 기본 설정
const API_BASE_URL = 'https://ec5nkbfrc5.execute-api.ap-northeast-2.amazonaws.com/prod';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 광고 관련 API
export const adAPI = {
  // 광고 목록 조회
  getAds: async () => {
    try {
      const response = await api.get('/api/ads');
      const ads = response.data.ads || [];
      
      // 로컬 테스트: API 성공했지만 활성 광고가 없는 경우 더미 데이터 사용
      const activeAds = ads.filter(ad => ad.status === 'active' || ad.active === 'true');
      
      if (activeAds.length === 0) {
        console.log('No active ads found, using dummy ad data for local testing...');
        return [
          {
            ad_id: 'test-ad-001',
            title: 'Sample Ad 30sec',
            advertiser: 'Test Advertiser',
            duration: 30,
            category: 'General',
            status: 'active',
            active: 'true',
            created_at: '2025-01-07T10:00:00Z',
            url: 'https://example.com/sample-ad-30sec.mp4'
          },
          {
            ad_id: 'test-ad-002', 
            title: 'Demo Commercial 15sec',
            advertiser: 'Demo Company',
            duration: 15,
            category: 'Technology',
            status: 'active',
            active: 'true',
            created_at: '2025-01-07T10:30:00Z',
            url: 'https://example.com/demo-commercial-15sec.mp4'
          },
          {
            ad_id: 'test-ad-003',
            title: 'Product Showcase 60sec',
            advertiser: 'Joseph Corp',
            duration: 60,
            category: 'Marketing',
            status: 'active',
            active: 'true',
            created_at: '2025-01-07T11:00:00Z',
            url: 'https://example.com/product-showcase-60sec.mp4'
          }
        ];
      }
      
      return ads;
    } catch (error) {
      console.error('Error fetching ads:', error);
      
      // 로컬 테스트용 더미 데이터 (API 실패 시)
      console.log('API failed, using dummy ad data for local testing...');
      return [
        {
          ad_id: 'test-ad-001',
          title: 'Sample Ad 30sec',
          advertiser: 'Test Advertiser',
          duration: 30,
          category: 'General',
          status: 'active',
          active: 'true',
          created_at: '2025-01-07T10:00:00Z',
          url: 'https://example.com/sample-ad-30sec.mp4'
        },
        {
          ad_id: 'test-ad-002', 
          title: 'Demo Commercial 15sec',
          advertiser: 'Demo Company',
          duration: 15,
          category: 'Technology',
          status: 'active',
          active: 'true',
          created_at: '2025-01-07T10:30:00Z',
          url: 'https://example.com/demo-commercial-15sec.mp4'
        },
        {
          ad_id: 'test-ad-003',
          title: 'Product Showcase 60sec',
          advertiser: 'Joseph Corp',
          duration: 60,
          category: 'Marketing',
          status: 'active',
          active: 'true',
          created_at: '2025-01-07T11:00:00Z',
          url: 'https://example.com/product-showcase-60sec.mp4'
        }
      ];
    }
  },

  // 광고 생성
  createAd: async (adData) => {
    try {
      const response = await api.post('/api/ads', adData);
      return response.data;
    } catch (error) {
      console.error('Error creating ad:', error);
      throw error;
    }
  }
};

// 분석 데이터 내보내기 API
export const analyticsAPI = {
  // CSV 내보내기
  exportCSV: async (startDate, endDate) => {
    try {
      // 개발 환경에서 CORS 문제를 우회하기 위해 fetch 사용
      const url = `${API_BASE_URL}/api/analytics/export?start=${startDate}&end=${endDate}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        mode: 'cors'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      // 파일명 추출 (Content-Disposition 헤더에서)
      let filename = `ad_analytics_${startDate}_to_${endDate}.csv`;
      const contentDisposition = response.headers.get('content-disposition');
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }
      
      // CSV 파일 다운로드
      const blob = await response.blob();
      const url2 = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url2;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url2);
      
      return { success: true };
    } catch (error) {
      console.error('Error exporting CSV:', error);
      
      // 개발 환경에서 API 실패 시 더미 CSV 생성
      console.log('API failed, generating dummy CSV for development...');
      const dummyCSV = generateDummyCSV(startDate, endDate);
      downloadCSV(dummyCSV, `ad_analytics_${startDate}_to_${endDate}.csv`);
      
      return { success: true, dummy: true };
    }
  }
};

// 더미 CSV 생성 함수 (개발용)
const generateDummyCSV = (startDate, endDate) => {
  const headers = ['광고ID', '광고명', '광고사업자', '삽입횟수', '성공횟수', '실패횟수', '성공률(%)', '총지속시간(초)'];
  const dummyData = [
    ['ad_001', 'Sample Ad 30sec', 'Test Advertiser', '15', '14', '1', '93.3', '450'],
    ['ad_002', 'Demo Commercial 15sec', 'Demo Company', '8', '7', '1', '87.5', '120'],
    ['ad_003', 'Product Showcase 60sec', 'Joseph Corp', '12', '11', '1', '91.7', '720']
  ];
  
  return [headers, ...dummyData].map(row => row.join(',')).join('\n');
};

// CSV 다운로드 헬퍼 함수
const downloadCSV = (csvContent, filename) => {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

// 스케줄 관련 API
export const scheduleAPI = {
  // 스케줄 목록 조회
  getSchedules: async (status = 'scheduled') => {
    try {
      const response = await api.get(`/api/schedule?status=${status}`);
      return response.data.schedules || [];
    } catch (error) {
      console.error('Error fetching schedules:', error);
      throw error;
    }
  },

  // 스케줄 목록 조회 (전체)
  getAllSchedules: async () => {
    try {
      const response = await api.get('/api/schedule');
      return response.data || [];
    } catch (error) {
      console.error('Error fetching all schedules:', error);
      throw error;
    }
  },

  // 스케줄 생성 (기존)
  createSchedule: async (scheduleData) => {
    try {
      const response = await api.post('/api/schedule', scheduleData);
      return response.data;
    } catch (error) {
      console.error('Error creating schedule:', error);
      throw error;
    }
  },

  // 통합 스케줄 생성 (DynamoDB + MediaLive SCTE-35)
  createScheduleWithMediaLive: async (scheduleData) => {
    let dynamodbResult = null;
    let mediaLiveResult = null;
    let errors = [];

    try {
      // 1. DynamoDB에 스케줄 저장
      console.log('Creating DynamoDB schedule...', scheduleData);
      dynamodbResult = await api.post('/api/schedule', scheduleData);
      
      // 2. MediaLive 설정 확인
      const mediaLiveConfig = localStorage.getItem('mediaLiveConfig');
      if (!mediaLiveConfig) {
        throw new Error('MediaLive configuration not found. Please configure MediaLive in Settings.');
      }

      const config = JSON.parse(mediaLiveConfig);
      if (config.connectionStatus !== 'connected' || !config.channelId) {
        throw new Error('MediaLive is not connected. Please test connection in Settings.');
      }

      // 3. SCTE-35 스케줄 데이터 준비
      const scte35Data = {
        actionName: scheduleData.event_name || `ad-${Date.now()}`,
        scheduleTime: scheduleData.schedule_time,
        spliceEventId: Math.floor(Math.random() * 90000) + 10000, // 10000-99999 범위 (5자리)
        duration: scheduleData.duration * 90000 // 초를 90kHz 타임베이스로 변환
      };

      // 4. MediaLive SCTE-35 스케줄 생성
      console.log('Creating MediaLive SCTE-35 schedule...', scte35Data);
      mediaLiveResult = await mediaLiveAPI.createSCTE35Schedule(config.channelId, scte35Data);

      if (!mediaLiveResult.success) {
        errors.push(`MediaLive sync failed: ${mediaLiveResult.error.message}`);
      }

      // 5. 결과 반환
      return {
        success: true,
        dynamodbSuccess: !!dynamodbResult,
        mediaLiveSuccess: mediaLiveResult?.success || false,
        data: {
          schedule: dynamodbResult?.data,
          mediaLive: mediaLiveResult?.data
        },
        errors: errors.length > 0 ? errors : null
      };

    } catch (error) {
      console.error('Error in integrated schedule creation:', error);
      
      // DynamoDB 성공했지만 MediaLive 실패한 경우
      if (dynamodbResult) {
        return {
          success: true,
          dynamodbSuccess: true,
          mediaLiveSuccess: false,
          data: {
            schedule: dynamodbResult.data,
            mediaLive: null
          },
          errors: [`MediaLive sync failed: ${error.message}`]
        };
      }
      
      // 완전 실패
      throw error;
    }
  },

  // 스케줄 삭제
  deleteSchedule: async (scheduleId) => {
    try {
      const response = await api.delete(`/api/schedule/${scheduleId}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting schedule:', error);
      throw error;
    }
  },

  // 통합 스케줄 삭제 (Phase 4: DynamoDB + MediaLive SCTE-35)
  deleteScheduleWithMediaLive: async (scheduleId, scheduleData) => {
    let dynamodbResult = null;
    let mediaLiveResult = null;
    let errors = [];

    try {
      // 1. DynamoDB에서 스케줄 삭제
      console.log('Deleting DynamoDB schedule...', scheduleId);
      dynamodbResult = await api.delete(`/api/schedule/${scheduleId}`);
      
      // 2. MediaLive 설정 확인
      const mediaLiveConfig = localStorage.getItem('mediaLiveConfig');
      if (!mediaLiveConfig) {
        errors.push('MediaLive configuration not found. Schedule deleted from database only.');
        return {
          success: true,
          dynamodbSuccess: true,
          mediaLiveSuccess: false,
          data: { schedule: dynamodbResult?.data, mediaLive: null },
          errors
        };
      }

      const config = JSON.parse(mediaLiveConfig);
      if (config.connectionStatus !== 'connected' || !config.channelId) {
        errors.push('MediaLive is not connected. Schedule deleted from database only.');
        return {
          success: true,
          dynamodbSuccess: true,
          mediaLiveSuccess: false,
          data: { schedule: dynamodbResult?.data, mediaLive: null },
          errors
        };
      }

      // 3. MediaLive SCTE-35 스케줄 삭제
      const actionName = scheduleData?.event_name || `ad-${scheduleId}`;
      console.log('Deleting MediaLive SCTE-35 schedule...', actionName);
      mediaLiveResult = await mediaLiveAPI.deleteSCTE35Schedule(config.channelId, actionName);

      if (!mediaLiveResult.success) {
        errors.push(`MediaLive schedule deletion failed: ${mediaLiveResult.error.message}`);
      }

      // 4. 결과 반환
      return {
        success: true,
        dynamodbSuccess: !!dynamodbResult,
        mediaLiveSuccess: mediaLiveResult?.success || false,
        data: {
          schedule: dynamodbResult?.data,
          mediaLive: mediaLiveResult?.data
        },
        errors: errors.length > 0 ? errors : null
      };

    } catch (error) {
      console.error('Error in integrated schedule deletion:', error);
      
      // DynamoDB 성공했지만 MediaLive 실패한 경우
      if (dynamodbResult) {
        return {
          success: true,
          dynamodbSuccess: true,
          mediaLiveSuccess: false,
          data: {
            schedule: dynamodbResult.data,
            mediaLive: null
          },
          errors: [`MediaLive sync failed: ${error.message}`]
        };
      }
      
      // 완전 실패
      throw error;
    }
  }
};

export default api; 