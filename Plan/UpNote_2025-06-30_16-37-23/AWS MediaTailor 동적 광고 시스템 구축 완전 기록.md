# **AWS MediaTailor 동적 광고 시스템 구축 완전 기록**

## **📋 프로젝트 개요**

- **목표**: AWS MediaTailor 기반 실시간 동적 광고 삽입 시스템
- **아키텍처**: MediaLive → MediaPackage → MediaTailor → 시청자
- **핵심**: Lambda 광고 서버로 VAST XML 동적 생성

* * *

## **🏗️ 시스템 구성**

### **AWS 인프라 (CloudFormation)**

```
✅ Lambda 함수 5개
- DynamicAdServer (광고 선택 엔진)
- AdManagementAPI (광고 CRUD)
- S3EventProcessor (파일 업로드 처리)
- InitializeTestData (초기 데이터)
- S3NotificationSetup (S3 알림)

✅ DynamoDB 테이블 3개
- AdInventory (광고 인벤토리)
- AdPerformance (성과 데이터)
- TargetingRules (타겟팅 규칙)

✅ API Gateway 5개 엔드포인트
- POST /api/ads (광고 생성)
- GET /api/ads (광고 목록)
- GET /adserver (VAST XML 응답)
- OPTIONS 메서드들

✅ S3 + MediaTailor 연동
```

* * *

## **🚨 주요 실패 사례와 해결책**

### **1\. Lambda DynamoDB 예약어 충돌**

**❌ 문제**: `duration` 예약어로 쿼리 실패

```
# 실패한 코드
KeyConditionExpression='active = :active AND duration = :duration'
```

**✅ 해결**: ExpressionAttributeNames 사용

```
# 성공한 코드
KeyConditionExpression='#active = :active AND #duration = :duration',
ExpressionAttributeNames={
    '#active': 'active',
    '#duration': 'duration'
}
```

### **2\. S3 Presigned URL 리전 불일치**

**❌ 문제**: `s3.amazonaws.com` → `s3.ap-northeast-2.amazonaws.com` 불일치 **✅ 해결**: Lambda에서 리전별 URL 생성 코드 추가

### **3\. S3 403 접근 권한 문제**

**❌ 문제**: MediaTailor이 S3 파일 접근 불가 **✅ 해결**: S3 버킷 정책 추가

```
{
  "Effect": "Allow",
  "Principal": "*",
  "Action": "s3:GetObject",
  "Resource": "arn:aws:s3:::dynamic-ad-content-source/*"
}
```

### **4\. MediaLive SCTE-35 설정 누락**

**❌ 문제**: AvailBlanking = null, SCTE-35 신호 전달 안됨 **✅ 해결**: MediaLive 설정

- Avail Configuration: ENABLED
- Avail Settings: SCTE-35 splice insert
- SCTE-35 Segmentation Scope: SCTE35\_ENABLED\_OUTPUT\_GROUPS

### **5\. MediaTailor Ad Marker Passthrough**

**❌ 문제**: DISABLED로 인한 SCTE-35 마커 제거 **✅ 해결**: Ad marker passthrough = ENABLED

### **6\. Duration 불일치 - 최종 문제!**

**❌ 문제**:

```
originAvailDuration: 35.002초 (MediaLive)
transcodedAdDuration: 30.03초 (실제 광고)
→ "LEFTOVER_AVAIL_EXCEEDED_THRESHOLD"
```

**✅ 해결**: MediaLive Duration을 정확히 맞춤

```
# 30초 = 2,700,000 ticks (90kHz 기준)
"Duration": 2700000
```

* * *

## **🎯 최종 성공 구성**

### **MediaLive 설정**

- ✅ Avail Configuration: ENABLED
- ✅ Avail Settings: SCTE-35 splice insert
- ✅ SCTE-35 Segmentation Scope: SCTE35\_ENABLED\_OUTPUT\_GROUPS
- ✅ Duration: 2,700,000 ticks (정확히 30초)

### **MediaTailor 설정**

- ✅ Ad Decision Server: Lambda API 엔드포인트
- ✅ Video Content Source: MediaPackage URL
- ✅ Ad marker passthrough: ENABLED
- ✅ Ad insertion mode: STITCHED\_ONLY
- ✅ Personalization threshold: 1초

### **Lambda 광고 서버**

- ✅ DynamoDB 예약어 처리
- ✅ VAST XML 동적 생성
- ✅ 가중치 기반 광고 선택
- ✅ 오류 처리 및 로깅

* * *

## **📊 현재 API 현황**

```
POST /api/ads          # 광고 생성 + Presigned URL
GET /api/ads           # 광고 목록 조회  
GET /adserver          # VAST XML 응답 (MediaTailor용)
OPTIONS 메서드들       # CORS 처리
```

* * *

## **🚀 성공 지표**

```
"eventType": "FILLED_AVAIL"
"numAds": 1
"filledDuration": 30.03
"fillRate": 1              // 100% 성공!
"creativeAds": [...]       // 실제 광고 삽입됨
```

* * *

## **🎓 핵심 교훈**

1. **Duration 단위 중요**: MediaLive는 90kHz ticks 사용
2. **예약어 처리**: DynamoDB ExpressionAttributeNames 필수
3. **S3 권한**: MediaTailor 접근 권한 설정 중요
4. **SCTE-35 설정**: MediaLive 전체 파이프라인 설정 필요
5. **Ad marker passthrough**: MediaTailor에서 ENABLED 필수
6. **정확한 Duration 매칭**: 광고 길이와 브레이크 길이 일치 필요

* * *

**🎊 완전한 동적 광고 시스템 구축 완료!** **이제 실시간 라이브 스트림에 동적으로 광고를 삽입할 수 있습니다!**