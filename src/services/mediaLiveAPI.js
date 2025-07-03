import axios from 'axios';

// MediaLive API 기본 설정
const MEDIALIVE_API_BASE = process.env.REACT_APP_API_URL || 'https://ec5nkbfrc5.execute-api.ap-northeast-2.amazonaws.com/prod';

// MediaLive API 클라이언트 (단순화된 버전)
const mediaLiveAPI = {
  /**
   * MediaLive 채널 연결 테스트 (단순화된 버전)
   * @param {string} channelId - MediaLive 채널 ID
   * @param {string} region - AWS 리전
   * @returns {Promise} 채널 연결 및 상태 정보
   */
  async testConnection(channelId, region = 'ap-northeast-2') {
    try {
      const response = await axios.get(`${MEDIALIVE_API_BASE}/medialive/channel/${channelId}/test`, {
        params: { region },
        timeout: 10000 // 10초 타임아웃
      });
      
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('MediaLive API Error:', error);
      
      if (error.response) {
        // API 응답 오류
        const { status, data } = error.response;
        return {
          success: false,
          error: {
            type: 'API_ERROR',
            status,
            message: data.message || `HTTP ${status} Error`,
            details: data
          }
        };
      } else if (error.request) {
        // 네트워크 오류
        return {
          success: false,
          error: {
            type: 'NETWORK_ERROR',
            message: 'Network connection failed. Please check your internet connection.',
            details: error.message
          }
        };
      } else {
        // 기타 오류
        return {
          success: false,
          error: {
            type: 'UNKNOWN_ERROR',
            message: 'An unexpected error occurred.',
            details: error.message
          }
        };
      }
    }
  },

  /**
   * SCTE-35 스케줄 생성 (핵심 기능)
   * @param {string} channelId - MediaLive 채널 ID
   * @param {Object} scheduleData - 스케줄 데이터
   * @param {string} region - AWS 리전
   * @returns {Promise} 스케줄 생성 결과
   */
  async createSCTE35Schedule(channelId, scheduleData, region = 'ap-northeast-2') {
    try {
      const response = await axios.post(`${MEDIALIVE_API_BASE}/medialive/channel/${channelId}/schedule`, {
        ...scheduleData
      }, {
        params: { region },
        timeout: 10000
      });
      
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return this.handleError(error);
    }
  },

  /**
   * SCTE-35 스케줄 삭제 (Phase 4 추가)
   * @param {string} channelId - MediaLive 채널 ID
   * @param {string} actionName - 삭제할 액션 이름
   * @param {string} region - AWS 리전
   * @returns {Promise} 스케줄 삭제 결과
   */
  async deleteSCTE35Schedule(channelId, actionName, region = 'ap-northeast-2') {
    try {
      const response = await axios.delete(`${MEDIALIVE_API_BASE}/medialive/channel/${channelId}/schedule/${actionName}`, {
        params: { region },
        timeout: 10000
      });
      
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return this.handleError(error);
    }
  },

  /**
   * 오류 처리 헬퍼 함수
   * @param {Error} error - 오류 객체
   * @returns {Object} 표준화된 오류 응답
   */
  handleError(error) {
    console.error('MediaLive API Error:', error);
    
    if (error.response) {
      const { status, data } = error.response;
      let message = data.message || `HTTP ${status} Error`;
      
      // 특정 오류 코드에 대한 사용자 친화적 메시지
      switch (status) {
        case 400:
          message = 'Invalid channel ID or parameters';
          break;
        case 401:
          message = 'Authentication failed. Please check your AWS credentials';
          break;
        case 403:
          message = 'Access denied. Please check your IAM permissions';
          break;
        case 404:
          message = 'Channel not found. Please verify the channel ID';
          break;
        case 429:
          message = 'Too many requests. Please try again later';
          break;
        case 500:
          message = 'AWS service error. Please try again later';
          break;
      }
      
      return {
        success: false,
        error: {
          type: 'API_ERROR',
          status,
          message,
          details: data
        }
      };
    } else if (error.request) {
      return {
        success: false,
        error: {
          type: 'NETWORK_ERROR',
          message: 'Network connection failed. Please check your internet connection.',
          details: error.message
        }
      };
    } else {
      return {
        success: false,
        error: {
          type: 'UNKNOWN_ERROR',
          message: 'An unexpected error occurred.',
          details: error.message
        }
      };
    }
  }
};

export default mediaLiveAPI; 