# Adsynk API Documentation

## 📋 개요

**Adsynk**는 AWS MediaTailor와 MediaLive를 활용한 실시간 동적 광고 삽입 시스템입니다. 
이 문서는 Adsynk에서 제공하는 모든 REST API 엔드포인트에 대한 상세한 사용법을 제공합니다.

### 기본 정보
- **Base URL**: `https://your-api-domain.com`
- **API Version**: v1
- **Content-Type**: `application/json`
- **Authentication**: 현재 버전은 인증 없음 (향후 API Key 또는 JWT 토큰 지원 예정)

---

## 🚀 시작하기

### API 테스트 환경
```bash
# 기본 API 상태 확인
curl -X GET "https://your-api-domain.com/api/ads" \
  -H "Content-Type: application/json"
```

### 응답 형식
모든 API는 다음과 같은 일관된 응답 형식을 사용합니다:

```json
{
  "success": true,
  "data": {},
  "message": "Operation completed successfully",
  "timestamp": "2025-01-15T10:30:00Z"
}
```

---

## 📺 광고 관리 API

### 1. 광고 목록 조회

**GET** `/api/ads`

전체 광고 목록을 조회합니다.

#### 요청 예시
```bash
curl -X GET "https://your-api-domain.com/api/ads" \
  -H "Content-Type: application/json"
```

#### 응답 예시
```json
{
  "ads": [
    {
      "ad_id": "ad_20250115_103000",
      "title": "Sample Advertisement",
      "advertiser": "Example Corp",
      "duration": 30,
      "video_url": "https://s3.amazonaws.com/bucket/video.mp4",
      "active": "true",
      "status": "ready",
      "created_at": "2025-01-15T10:30:00Z"
    }
  ]
}
```

#### 응답 필드
| 필드 | 타입 | 설명 |
|------|------|------|
| `ad_id` | string | 광고 고유 ID |
| `title` | string | 광고 제목 |
| `advertiser` | string | 광고주명 |
| `duration` | integer | 광고 길이 (초) |
| `video_url` | string | 광고 비디오 파일 URL |
| `active` | string | 활성 상태 ("true"/"false") |
| `status` | string | 광고 상태 (uploading/ready/error) |
| `created_at` | string | 생성 시간 (ISO 8601) |

---

### 2. 광고 생성 및 업로드

**POST** `/api/ads`

새로운 광고를 생성하고 업로드용 Presigned URL을 받습니다.

#### 요청 예시
```bash
curl -X POST "https://your-api-domain.com/api/ads" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "New Advertisement",
    "advertiser": "Example Corp",
    "duration": 30,
    "active": true
  }'
```

#### 요청 파라미터
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `title` | string | ✅ | 광고 제목 |
| `advertiser` | string | ✅ | 광고주명 |
| `duration` | integer | ✅ | 광고 길이 (초) |
| `active` | boolean | ❌ | 활성 상태 (기본값: true) |

#### 응답 예시
```json
{
  "success": true,
  "ad_id": "ad_20250115_103000",
  "upload_url": "https://s3.amazonaws.com/bucket/upload-path?X-Amz-Signature=...",
  "message": "Ad created successfully. Use upload_url to upload video file."
}
```

#### 파일 업로드 방법
Presigned URL을 사용하여 비디오 파일을 직접 S3에 업로드:

```bash
curl -X PUT "https://s3.amazonaws.com/bucket/upload-path?X-Amz-Signature=..." \
  -H "Content-Type: video/mp4" \
  --data-binary @your-video-file.mp4
```

---

### 3. 광고 활성 상태 변경

**PUT** `/api/ads/{ad_id}/status`

광고의 활성/비활성 상태를 변경합니다.

#### 요청 예시
```bash
curl -X PUT "https://your-api-domain.com/api/ads/ad_20250115_103000/status" \
  -H "Content-Type: application/json" \
  -d '{
    "active": "false"
  }'
```

#### 요청 파라미터
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `active` | string | ✅ | 활성 상태 ("true"/"false") |

#### 응답 예시
```json
{
  "success": true,
  "message": "Ad status updated successfully"
}
```

---

### 4. 광고 삭제

**DELETE** `/api/ads/{ad_id}`

광고를 삭제합니다. 활성 스케줄이 있는 광고는 삭제할 수 없습니다.

#### 요청 예시
```bash
curl -X DELETE "https://your-api-domain.com/api/ads/ad_20250115_103000" \
  -H "Content-Type: application/json"
```

#### 응답 예시
```json
{
  "success": true,
  "message": "Ad deleted successfully"
}
```

#### 오류 응답 예시
```json
{
  "success": false,
  "error": "Cannot delete ad with active schedules",
  "statusCode": 400
}
```

---

## 📅 스케줄 관리 API

### 1. 스케줄 목록 조회

**GET** `/api/schedule`

전체 스케줄 목록을 조회합니다.

#### 요청 예시
```bash
curl -X GET "https://your-api-domain.com/api/schedule" \
  -H "Content-Type: application/json"
```

#### 응답 예시
```json
[
  {
    "schedule_id": "schedule_20250115_103000",
    "schedule_time": "2025-01-15T15:30:00Z",
    "ad_id": "ad_20250115_103000",
    "duration": 30,
    "event_name": "midroll-break-1",
    "status": "scheduled",
    "created_at": "2025-01-15T10:30:00Z",
    "ttl": 1737037800
  }
]
```

#### 응답 필드
| 필드 | 타입 | 설명 |
|------|------|------|
| `schedule_id` | string | 스케줄 고유 ID |
| `schedule_time` | string | 예약 시간 (ISO 8601) |
| `ad_id` | string | 연결된 광고 ID |
| `duration` | integer | 광고 길이 (초) |
| `event_name` | string | 이벤트 이름 |
| `status` | string | 스케줄 상태 (scheduled/active/completed) |
| `created_at` | string | 생성 시간 (ISO 8601) |
| `ttl` | integer | TTL 타임스탬프 (24시간 후 자동 삭제) |

---

### 2. 스케줄 생성

**POST** `/api/schedule`

새로운 광고 스케줄을 생성합니다. DynamoDB와 MediaLive SCTE-35에 동시에 등록됩니다.

#### 요청 예시
```bash
curl -X POST "https://your-api-domain.com/api/schedule" \
  -H "Content-Type: application/json" \
  -d '{
    "scheduleTime": "2025-01-15T15:30:00Z",
    "selectedAdId": "ad_20250115_103000",
    "duration": 30,
    "eventName": "midroll-break-1"
  }'
```

#### 요청 파라미터
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `scheduleTime` | string | ✅ | 예약 시간 (ISO 8601 형식) |
| `selectedAdId` | string | ✅ | 광고 ID |
| `duration` | integer | ✅ | 광고 길이 (초) |
| `eventName` | string | ✅ | 이벤트 이름 (MediaLive 액션명) |

#### 응답 예시
```json
{
  "success": true,
  "schedule_id": "schedule_20250115_103000",
  "message": "Schedule created successfully"
}
```

#### 시간 형식 주의사항
- **올바른 형식**: `2025-01-15T15:30:00Z` (UTC)
- **잘못된 형식**: `2025-01-15 15:30:00`, `01/15/2025 3:30 PM`

---

### 3. 스케줄 삭제

**DELETE** `/api/schedule/{schedule_id}`

스케줄을 삭제합니다. DynamoDB와 MediaLive SCTE-35에서 동시에 제거됩니다.

#### 요청 예시
```bash
curl -X DELETE "https://your-api-domain.com/api/schedule/schedule_20250115_103000" \
  -H "Content-Type: application/json"
```

#### 응답 예시
```json
{
  "success": true,
  "message": "Schedule deleted successfully"
}
```

---

## 📡 MediaLive 통합 API

### 1. 채널 연결 테스트

**GET** `/medialive/channel/{channelId}/test`

MediaLive 채널의 연결 상태와 정보를 확인합니다.

#### 요청 예시
```bash
curl -X GET "https://your-api-domain.com/medialive/channel/5119356/test?region=ap-northeast-2" \
  -H "Content-Type: application/json"
```

#### URL 파라미터
| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `channelId` | string | ✅ | MediaLive 채널 ID |
| `region` | string | ❌ | AWS 리전 (기본값: ap-northeast-2) |

#### 응답 예시
```json
{
  "success": true,
  "channelId": "5119356",
  "channelName": "test-channel",
  "channelState": "RUNNING",
  "message": "Channel connection successful"
}
```

#### 채널 상태 값
| 상태 | 설명 |
|------|------|
| `RUNNING` | 채널이 실행 중 (광고 삽입 가능) |
| `IDLE` | 채널이 유휴 상태 |
| `STARTING` | 채널 시작 중 |
| `STOPPING` | 채널 중지 중 |

---

### 2. SCTE-35 스케줄 생성

**POST** `/medialive/channel/{channelId}/schedule`

MediaLive 채널에 SCTE-35 광고 브레이크 스케줄을 생성합니다.

#### 요청 예시
```bash
curl -X POST "https://your-api-domain.com/medialive/channel/5119356/schedule" \
  -H "Content-Type: application/json" \
  -d '{
    "actionName": "midroll-break-1",
    "scheduleTime": "2025-01-15T15:30:00Z",
    "spliceEventId": 12345,
    "duration": 2700000
  }'
```

#### 요청 파라미터
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `actionName` | string | ✅ | 액션 이름 (고유해야 함) |
| `scheduleTime` | string | ✅ | 예약 시간 (ISO 8601) |
| `spliceEventId` | integer | ✅ | SCTE-35 Splice Event ID |
| `duration` | integer | ✅ | 광고 길이 (90kHz 타임베이스) |

#### 시간 변환 공식
```
90kHz 타임베이스 = 초 × 90000
예: 30초 광고 = 30 × 90000 = 2,700,000
```

#### 응답 예시
```json
{
  "success": true,
  "actionName": "midroll-break-1",
  "scheduleTime": "2025-01-15T15:30:00Z",
  "spliceEventId": 12345,
  "duration": 2700000,
  "message": "SCTE-35 schedule created successfully"
}
```

---

### 3. SCTE-35 스케줄 삭제

**DELETE** `/medialive/channel/{channelId}/schedule/{actionName}`

MediaLive 채널에서 SCTE-35 스케줄을 삭제합니다.

#### 요청 예시
```bash
curl -X DELETE "https://your-api-domain.com/medialive/channel/5119356/schedule/midroll-break-1" \
  -H "Content-Type: application/json"
```

#### URL 파라미터
| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `channelId` | string | ✅ | MediaLive 채널 ID |
| `actionName` | string | ✅ | 삭제할 액션 이름 |

#### 응답 예시
```json
{
  "success": true,
  "actionName": "midroll-break-1",
  "message": "SCTE-35 schedule deleted successfully"
}
```

---

## 📊 분석 및 모니터링 API

### 1. 성능 데이터 내보내기

**GET** `/api/analytics/export`

광고 성능 데이터를 CSV 형식으로 내보냅니다. 스케줄 데이터 기반으로 광고별 삽입 횟수, 성공률, 총 지속시간을 계산합니다.

#### 요청 예시
```bash
curl -X GET "https://your-api-domain.com/api/analytics/export?start=2025-01-01&end=2025-01-31" \
  -H "Content-Type: application/json" \
  -o "adsynk_analytics.csv"
```

#### Query 파라미터
| 파라미터 | 타입 | 필수 | 설명 | 기본값 |
|----------|------|------|------|--------|
| `start` | string | ❌ | 시작 날짜 (YYYY-MM-DD) | 30일 전 |
| `end` | string | ❌ | 종료 날짜 (YYYY-MM-DD) | 오늘 |

#### 응답 형식
```
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="ad_analytics_2025-01-01_to_2025-01-31.csv"

Ad ID,Ad Name,Advertiser,Insertions,Success,Failure,Success Rate (%),Total Duration (sec)
ad_20250115_103000,Sample Advertisement,Example Corp,5,5,0,100.0,150
ad_20250115_104000,Another Ad,Test Corp,3,2,1,66.7,90
```

#### CSV 컬럼 설명
| 컬럼 | 설명 |
|------|------|
| `Ad ID` | 광고 고유 식별자 |
| `Ad Name` | 광고 제목 |
| `Advertiser` | 광고주명 |
| `Insertions` | 총 삽입 횟수 (스케줄된 횟수) |
| `Success` | 성공한 삽입 횟수 (completed 상태) |
| `Failure` | 실패한 삽입 횟수 |
| `Success Rate (%)` | 성공률 (성공/총삽입 * 100) |
| `Total Duration (sec)` | 총 광고 지속 시간 (초) |

#### 데이터 계산 로직
- **데이터 소스**: `AdScheduleTable` (스케줄 테이블)
- **삽입 횟수**: 해당 기간 내 모든 스케줄 건수
- **성공 횟수**: `status = 'completed'` 인 스케줄 건수
- **실패 횟수**: `status` 가 'completed', 'scheduled', 'active' 이외의 값인 건수
- **성공률**: (성공 횟수 / 삽입 횟수) × 100

#### 오류 응답
```json
{
  "statusCode": 500,
  "headers": {
    "Access-Control-Allow-Origin": "*"
  },
  "body": "{\"error\": \"Failed to export analytics\"}"
}
```

#### 프론트엔드 통합 예시
```javascript
// JavaScript에서 CSV 다운로드
import { analyticsAPI } from './api';

const exportCSV = async () => {
  try {
    await analyticsAPI.exportCSV('2025-01-01', '2025-01-31');
    console.log('CSV export completed successfully');
  } catch (error) {
    console.error('Failed to export CSV:', error);
  }
};
```

---

## 🎯 동적 광고 서버 API

### 1. VAST XML 응답

**GET** `/adserver`

MediaTailor에서 호출하는 동적 광고 서버 엔드포인트입니다.

#### 요청 예시
```bash
curl -X GET "https://your-api-domain.com/adserver?avail.duration=30" \
  -H "Content-Type: application/json"
```

#### Query 파라미터
| 파라미터 | 타입 | 설명 |
|----------|------|------|
| `avail.duration` | integer | 사용 가능한 광고 시간 (초) |
| `session.id` | string | 세션 ID (선택사항) |

#### 응답 예시
```xml
<?xml version="1.0" encoding="UTF-8"?>
<VAST version="4.0">
  <Ad id="ad_20250115_103000">
    <InLine>
      <AdSystem>DynamicAdServer</AdSystem>
      <AdTitle>Sample Advertisement</AdTitle>
      <Impression>
        <![CDATA[https://your-api-domain.com/impression/track]]>
      </Impression>
      <Creatives>
        <Creative>
          <Linear>
            <Duration>00:00:30</Duration>
            <MediaFiles>
              <MediaFile delivery="progressive" type="video/mp4">
                <![CDATA[https://s3.amazonaws.com/bucket/video.mp4]]>
              </MediaFile>
            </MediaFiles>
          </Linear>
        </Creative>
      </Creatives>
    </InLine>
  </Ad>
</VAST>
```

---

## ⚠️ 오류 처리

### 공통 오류 응답 형식
```json
{
  "success": false,
  "error": "Error description",
  "statusCode": 400,
  "timestamp": "2025-01-15T10:30:00Z"
}
```

### HTTP 상태 코드
| 코드 | 의미 | 설명 |
|------|------|------|
| 200 | OK | 요청 성공 |
| 201 | Created | 리소스 생성 성공 |
| 400 | Bad Request | 잘못된 요청 파라미터 |
| 404 | Not Found | 리소스를 찾을 수 없음 |
| 409 | Conflict | 리소스 충돌 (중복 생성 등) |
| 500 | Internal Server Error | 서버 내부 오류 |

### 일반적인 오류 시나리오

#### 1. 광고 삭제 실패
```json
{
  "success": false,
  "error": "Cannot delete ad with active schedules",
  "statusCode": 400
}
```

#### 2. MediaLive 채널 없음
```json
{
  "success": false,
  "error": "Channel 5119356 not found",
  "statusCode": 404
}
```

#### 3. 잘못된 시간 형식
```json
{
  "success": false,
  "error": "Invalid schedule time format: time data '2025-01-15 15:30:00' does not match format",
  "statusCode": 400
}
```

#### 4. 필수 파라미터 누락
```json
{
  "success": false,
  "error": "Missing required field: scheduleTime",
  "statusCode": 400
}
```

---

## 🔧 개발자 가이드

### 1. 통합 워크플로우 예시

#### 광고 업로드 및 스케줄링 전체 과정
```bash
# 1. 광고 생성 및 업로드 URL 받기
RESPONSE=$(curl -s -X POST "https://your-api-domain.com/api/ads" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "New Campaign Ad",
    "advertiser": "Example Corp",
    "duration": 30,
    "active": true
  }')

AD_ID=$(echo $RESPONSE | jq -r '.ad_id')
UPLOAD_URL=$(echo $RESPONSE | jq -r '.upload_url')

# 2. 비디오 파일 업로드
curl -X PUT "$UPLOAD_URL" \
  -H "Content-Type: video/mp4" \
  --data-binary @campaign-video.mp4

# 3. 스케줄 생성
curl -X POST "https://your-api-domain.com/api/schedule" \
  -H "Content-Type: application/json" \
  -d "{
    \"scheduleTime\": \"2025-01-15T15:30:00Z\",
    \"selectedAdId\": \"$AD_ID\",
    \"duration\": 30,
    \"eventName\": \"campaign-midroll-1\"
  }"
```

### 2. MediaLive 연동 체크리스트

#### 사전 준비사항
- ✅ MediaLive 채널이 RUNNING 상태
- ✅ 채널 ID 확인
- ✅ AWS 리전 설정 확인
- ✅ IAM 권한 설정 완료

#### 연결 테스트
```bash
# 채널 상태 확인
curl -X GET "https://your-api-domain.com/medialive/channel/YOUR_CHANNEL_ID/test" \
  -H "Content-Type: application/json"
```

### 3. 시간대 처리 가이드

#### UTC 시간 사용 권장
```javascript
// JavaScript에서 올바른 시간 형식 생성
const scheduleTime = new Date().toISOString(); // "2025-01-15T15:30:00.000Z"

// 특정 시간 설정
const specificTime = new Date('2025-01-15T15:30:00Z').toISOString();
```

#### Python에서 시간 처리
```python
from datetime import datetime, timezone

# UTC 시간 생성
schedule_time = datetime.now(timezone.utc).isoformat()

# 특정 시간 설정
specific_time = datetime(2025, 1, 15, 15, 30, 0, tzinfo=timezone.utc).isoformat()
```

### 4. 성능 최적화 팁

#### 1. 배치 처리
여러 스케줄을 생성할 때는 순차적으로 처리:
```bash
# 동시 요청보다는 순차 처리 권장
for schedule in schedules; do
  curl -X POST "https://your-api-domain.com/api/schedule" -d "$schedule"
  sleep 0.1  # 100ms 간격
done
```

#### 2. 캐싱 활용
광고 목록은 자주 변경되지 않으므로 클라이언트 캐싱 권장:
```javascript
// 5분간 캐싱
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
```

#### 3. 오류 재시도
네트워크 오류 시 지수 백오프 재시도 구현:
```javascript
async function retryRequest(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
    }
  }
}
```

---

## 📞 지원 및 문의

### 기술 지원
- **이메일**: support@adsynk.com
- **문서**: [https://docs.adsynk.com](https://docs.adsynk.com)
- **GitHub**: [https://github.com/adsynk/api-examples](https://github.com/adsynk/api-examples)

### 버전 정보
- **현재 버전**: 1.0.0
- **마지막 업데이트**: 2025년 1월 16일 (Phase 16 - CSV 다운로드 시스템 개선)
- **호환성**: AWS MediaLive, MediaTailor

### 최근 업데이트 (Phase 16)
#### CSV 다운로드 시스템 개선
- ✅ **데이터 소스 통합**: `AdPerformanceTable` → `AdScheduleTable` 변경
- ✅ **컬럼명 영문화**: 국제화 지원을 위한 영문 헤더 적용
- ✅ **데이터 일관성**: 모니터링 페이지와 CSV 내보내기 동일한 데이터 소스 사용
- ✅ **성능 계산 로직**: 스케줄 상태 기반 성공/실패 계산
- ✅ **오류 해결**: `handle_analytics_export` 함수 정의 누락 문제 해결

#### 변경된 CSV 형식
```csv
# 이전 (한글 헤더)
광고ID,광고명,광고사업자,삽입횟수,성공횟수,실패횟수,성공률(%),총지속시간(초)

# 현재 (영문 헤더)
Ad ID,Ad Name,Advertiser,Insertions,Success,Failure,Success Rate (%),Total Duration (sec)
```

#### 개선된 데이터 정확성
- **실제 스케줄 데이터 반영**: 더이상 빈 데이터가 아닌 실제 광고 삽입 이력 제공
- **상태 기반 계산**: `completed` 상태를 성공으로, 기타 상태를 실패로 분류
- **모니터링 일치**: 웹 인터페이스와 CSV 데이터 완전 일치

### 라이센스
본 API는 상업적 라이센스 하에 제공됩니다. 자세한 내용은 라이센스 문서를 참조하세요.

---

**© 2025 Adsynk. All rights reserved.**  
**Originally developed for demonstration at MEGAZONECLOUD.** 