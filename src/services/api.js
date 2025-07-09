import axios from 'axios';
import mediaLiveAPI from './mediaLiveAPI';

// API 기본 설정
const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://ec5nkbfrc5.execute-api.ap-northeast-2.amazonaws.com/prod';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: false,  // CORS 문제 해결을 위해 추가
});

// 광고 관련 API
export const adAPI = {
  // 광고 목록 조회
  getAds: async () => {
    try {
      const response = await api.get('/api/ads');
      const ads = response.data.ads || [];
      
      console.log('API Response:', response.data);
      console.log('Raw ads data:', ads);
      
      return ads;
    } catch (error) {
      console.error('Error fetching ads:', error);
      throw error;
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
  },

  // 광고 활성화 상태 토글
  toggleAdStatus: async (adId, currentActive) => {
    try {
      const newActive = currentActive === "true" ? "false" : "true";
      console.log('Toggling ad status:', { adId, currentActive, newActive });
      console.log('PUT URL:', `${API_BASE_URL}/api/ads/${adId}/status`);
      console.log('Request body:', { active: newActive });
      
      const response = await api.put(`/api/ads/${adId}/status`, {
        active: newActive
      });
      console.log('Toggle response:', response);
      return response.data;
    } catch (error) {
      console.error('Error toggling ad status:', error);
      console.error('Error response:', error.response);
      console.error('Error response data:', error.response?.data);
      console.error('Error response status:', error.response?.status);
      console.error('Error response headers:', error.response?.headers);
      
      // 백엔드에서 온 에러 메시지를 포함하여 다시 throw
      if (error.response?.data) {
        const backendError = new Error(error.response.data.error || error.response.data.message || error.message);
        backendError.response = error.response;
        throw backendError;
      }
      
      throw error;
    }
  },

  // 광고 삭제
  deleteAd: async (adId) => {
    try {
      console.log('Deleting ad with ID:', adId);
      console.log('DELETE URL:', `${API_BASE_URL}/api/ads/${adId}`);
      
      const response = await api.delete(`/api/ads/${adId}`);
      console.log('Delete response:', response);
      return response.data;
    } catch (error) {
      console.error('Error deleting ad:', error);
      console.error('Error response:', error.response);
      console.error('Error response data:', error.response?.data);
      console.error('Error response status:', error.response?.status);
      console.error('Error response headers:', error.response?.headers);
      
      // 백엔드에서 온 에러 메시지를 포함하여 다시 throw
      if (error.response?.data) {
        const backendError = new Error(error.response.data.error || error.response.data.message || error.message);
        backendError.response = error.response;
        throw backendError;
      }
      
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
      throw error;
    }
  },

  // MediaTailor 로그 데이터 조회
  getMediaTailorLogs: async (hours = 24) => {
    try {
      const response = await api.get(`/api/analytics/mediatailor-logs?hours=${hours}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching MediaTailor logs:', error);
      throw error;
    }
  }
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
      // 1. DynamoDB에 스케줄 저장 - 백엔드 API 필드명에 맞게 변환
      const apiScheduleData = {
        selectedAdId: scheduleData.ad_id,  // 백엔드가 기대하는 필드명
        scheduleTime: scheduleData.schedule_time,  // camelCase로 변환
        eventName: scheduleData.event_name,
        duration: scheduleData.duration
      };
      
      console.log('Creating DynamoDB schedule...', apiScheduleData);
      
      // CORS 문제 해결을 위해 fetch 사용
      const response = await fetch(`${API_BASE_URL}/api/schedule`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(apiScheduleData),
        mode: 'cors'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status} Error`);
      }

      dynamodbResult = { data: await response.json() };
      
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