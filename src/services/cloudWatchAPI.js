// CloudWatch 로그 모니터링 API
const CLOUDWATCH_API_BASE = process.env.REACT_APP_CLOUDWATCH_API_BASE || '/api/cloudwatch';

export const cloudWatchAPI = {
  // 최근 로그 조회
  getRecentLogs: async (logGroupName, hours = 1) => {
    try {
      const response = await fetch(`${CLOUDWATCH_API_BASE}/logs/${logGroupName}?hours=${hours}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to fetch CloudWatch logs:', error);
      throw error;
    }
  },

  // 에러 로그만 조회
  getErrorLogs: async (logGroupName, hours = 24) => {
    try {
      const response = await fetch(`${CLOUDWATCH_API_BASE}/logs/${logGroupName}/errors?hours=${hours}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to fetch error logs:', error);
      throw error;
    }
  },

  // Lambda 함수 메트릭 조회
  getLambdaMetrics: async (functionName, hours = 1) => {
    try {
      const response = await fetch(`${CLOUDWATCH_API_BASE}/metrics/lambda/${functionName}?hours=${hours}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to fetch Lambda metrics:', error);
      throw error;
    }
  },

  // DynamoDB 메트릭 조회
  getDynamoDBMetrics: async (tableName, hours = 1) => {
    try {
      const response = await fetch(`${CLOUDWATCH_API_BASE}/metrics/dynamodb/${tableName}?hours=${hours}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to fetch DynamoDB metrics:', error);
      throw error;
    }
  },

  // MediaLive 메트릭 조회
  getMediaLiveMetrics: async (channelId, hours = 1) => {
    try {
      const response = await fetch(`${CLOUDWATCH_API_BASE}/metrics/medialive/${channelId}?hours=${hours}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to fetch MediaLive metrics:', error);
      throw error;
    }
  },

  // 시스템 알람 상태 조회
  getAlarmStatus: async () => {
    try {
      const response = await fetch(`${CLOUDWATCH_API_BASE}/alarms`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to fetch alarm status:', error);
      throw error;
    }
  }
};

// 로그 레벨별 색상 매핑
export const getLogLevelColor = (level) => {
  const colors = {
    ERROR: '#FF3B30',
    WARN: '#FF9500',
    INFO: '#007AFF',
    DEBUG: '#8E8E93',
    TRACE: '#6D6D70'
  };
  return colors[level] || colors.INFO;
};

// 로그 레벨별 아이콘 매핑
export const getLogLevelIcon = (level) => {
  const icons = {
    ERROR: '🔴',
    WARN: '🟡',
    INFO: 'ℹ️',
    DEBUG: '🔍',
    TRACE: '📝'
  };
  return icons[level] || icons.INFO;
}; 