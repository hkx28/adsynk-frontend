import json
import boto3
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional
from botocore.exceptions import ClientError

# 로깅 설정
logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    CloudWatch Logs Analyzer Lambda 함수
    
    MediaTailor 로그를 분석하여 실제 광고 삽입 성공률을 계산
    
    지원하는 작업:
    - GET /api/analytics/realtime - 실시간 메트릭 조회
    - GET /api/analytics/mediatailor - MediaTailor 로그 분석
    - POST /api/analytics/query - 커스텀 로그 쿼리 실행
    """
    
    try:
        # CORS 헤더
        headers = {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }
        
        # OPTIONS 요청 처리
        if event.get('httpMethod') == 'OPTIONS':
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps({'message': 'CORS preflight successful'})
            }
        
        # 요청 파라미터 추출
        http_method = event.get('httpMethod')
        path = event.get('path', '')
        query_parameters = event.get('queryStringParameters') or {}
        body = event.get('body')
        
        logger.info(f"Processing {http_method} request for path: {path}")
        
        # CloudWatch Logs 클라이언트 생성
        logs_client = boto3.client('logs')
        
        # 라우팅
        if http_method == 'GET':
            if path.endswith('/realtime'):
                # 실시간 메트릭 조회
                return get_realtime_metrics(logs_client, query_parameters, headers)
            elif path.endswith('/mediatailor'):
                # MediaTailor 로그 분석
                return analyze_mediatailor_logs(logs_client, query_parameters, headers)
                
        elif http_method == 'POST':
            if path.endswith('/query'):
                # 커스텀 로그 쿼리 실행
                return execute_custom_query(logs_client, body, headers)
        
        return create_error_response(404, 'Not Found', headers)
        
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        return create_error_response(500, f'Internal server error: {str(e)}', headers)

def get_realtime_metrics(logs_client, query_params: Dict[str, str], headers: Dict[str, str]) -> Dict[str, Any]:
    """실시간 메트릭 조회"""
    try:
        # 시간 범위 설정 (기본: 최근 1시간)
        hours = int(query_params.get('hours', '1'))
        end_time = datetime.now(timezone.utc)
        start_time = end_time - timedelta(hours=hours)
        
        # MediaTailor 로그 그룹 이름 (환경변수에서 가져오기)
        log_group_name = f"/aws/mediatailor/{query_params.get('config_name', 'default')}"
        
        # 병렬로 여러 메트릭 수집
        metrics = {}
        
        # 1. 실제 성공률 계산
        actual_success_rate = calculate_actual_success_rate(
            logs_client, log_group_name, start_time, end_time
        )
        metrics['actualSuccessRate'] = actual_success_rate
        
        # 2. 평균 트랜스코딩 시간
        avg_transcode_time = calculate_avg_transcode_time(
            logs_client, log_group_name, start_time, end_time
        )
        metrics['avgTranscodeTime'] = avg_transcode_time
        
        # 3. Fill Rate 분석
        fill_rate_stats = calculate_fill_rate_stats(
            logs_client, log_group_name, start_time, end_time
        )
        metrics.update(fill_rate_stats)
        
        # 4. 스케줄 성공률 (DynamoDB에서 조회)
        schedule_success_rate = get_schedule_success_rate(start_time, end_time)
        metrics['scheduleSuccessRate'] = schedule_success_rate
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'success': True,
                'timeRange': {
                    'startTime': start_time.isoformat(),
                    'endTime': end_time.isoformat(),
                    'hours': hours
                },
                'metrics': metrics,
                'timestamp': datetime.now(timezone.utc).isoformat()
            })
        }
        
    except Exception as e:
        logger.error(f"Error getting realtime metrics: {str(e)}")
        return create_error_response(500, f'Failed to get realtime metrics: {str(e)}', headers)

def calculate_actual_success_rate(logs_client, log_group_name: str, start_time: datetime, end_time: datetime) -> float:
    """MediaTailor 로그에서 실제 성공률 계산"""
    try:
        # CloudWatch Logs Insights 쿼리
        query = """
        fields @timestamp, eventType, numAds, fillRate
        | filter eventType = "FILLED_AVAIL" or eventType = "MAKING_ADS_REQUEST"
        | stats count() by eventType
        | sort eventType
        """
        
        # 쿼리 실행
        response = logs_client.start_query(
            logGroupName=log_group_name,
            startTime=int(start_time.timestamp()),
            endTime=int(end_time.timestamp()),
            queryString=query
        )
        
        query_id = response['queryId']
        
        # 쿼리 결과 대기 (최대 30초)
        import time
        for _ in range(30):
            result = logs_client.get_query_results(queryId=query_id)
            if result['status'] == 'Complete':
                break
            time.sleep(1)
        
        if result['status'] != 'Complete':
            logger.warning("Query timeout - using partial results")
        
        # 결과 분석
        filled_count = 0
        request_count = 0
        
        for row in result.get('results', []):
            event_type = row[0]['value']
            count = int(row[1]['value'])
            
            if event_type == 'FILLED_AVAIL':
                filled_count = count
            elif event_type == 'MAKING_ADS_REQUEST':
                request_count = count
        
        # 성공률 계산
        if request_count > 0:
            success_rate = (filled_count / request_count) * 100
            return round(success_rate, 1)
        
        return 0.0
        
    except ClientError as e:
        if e.response['Error']['Code'] == 'ResourceNotFoundException':
            logger.warning(f"Log group {log_group_name} not found")
            return 0.0
        raise
    except Exception as e:
        logger.error(f"Error calculating actual success rate: {str(e)}")
        return 0.0

def calculate_avg_transcode_time(logs_client, log_group_name: str, start_time: datetime, end_time: datetime) -> float:
    """평균 트랜스코딩 시간 계산"""
    try:
        query = """
        fields @timestamp, eventType, transcodeDuration
        | filter eventType = "FILLED_AVAIL" and ispresent(transcodeDuration)
        | stats avg(transcodeDuration) as avgTranscode
        """
        
        response = logs_client.start_query(
            logGroupName=log_group_name,
            startTime=int(start_time.timestamp()),
            endTime=int(end_time.timestamp()),
            queryString=query
        )
        
        # 결과 대기 및 처리
        import time
        query_id = response['queryId']
        
        for _ in range(30):
            result = logs_client.get_query_results(queryId=query_id)
            if result['status'] == 'Complete':
                break
            time.sleep(1)
        
        if result.get('results') and len(result['results']) > 0:
            avg_time = float(result['results'][0][0]['value'])
            return round(avg_time / 1000, 2)  # 밀리초를 초로 변환
        
        return 0.0
        
    except Exception as e:
        logger.error(f"Error calculating avg transcode time: {str(e)}")
        return 0.0

def calculate_fill_rate_stats(logs_client, log_group_name: str, start_time: datetime, end_time: datetime) -> Dict[str, float]:
    """Fill Rate 통계 계산"""
    try:
        query = """
        fields @timestamp, eventType, fillRate
        | filter eventType = "FILLED_AVAIL" and ispresent(fillRate)
        | stats avg(fillRate) as avgFillRate, min(fillRate) as minFillRate, max(fillRate) as maxFillRate, count() as totalFilled
        """
        
        response = logs_client.start_query(
            logGroupName=log_group_name,
            startTime=int(start_time.timestamp()),
            endTime=int(end_time.timestamp()),
            queryString=query
        )
        
        # 결과 대기 및 처리
        import time
        query_id = response['queryId']
        
        for _ in range(30):
            result = logs_client.get_query_results(queryId=query_id)
            if result['status'] == 'Complete':
                break
            time.sleep(1)
        
        if result.get('results') and len(result['results']) > 0:
            row = result['results'][0]
            return {
                'avgFillRate': round(float(row[0]['value']), 3),
                'minFillRate': round(float(row[1]['value']), 3),
                'maxFillRate': round(float(row[2]['value']), 3),
                'totalFilledAvails': int(row[3]['value'])
            }
        
        return {
            'avgFillRate': 0.0,
            'minFillRate': 0.0,
            'maxFillRate': 0.0,
            'totalFilledAvails': 0
        }
        
    except Exception as e:
        logger.error(f"Error calculating fill rate stats: {str(e)}")
        return {
            'avgFillRate': 0.0,
            'minFillRate': 0.0,
            'maxFillRate': 0.0,
            'totalFilledAvails': 0
        }

def get_schedule_success_rate(start_time: datetime, end_time: datetime) -> float:
    """DynamoDB에서 스케줄 성공률 조회"""
    try:
        dynamodb = boto3.resource('dynamodb')
        schedule_table = dynamodb.Table('SpaceAds-AdSchedule')  # 환경변수로 변경 필요
        
        # 시간 범위 내의 스케줄 조회
        response = schedule_table.scan(
            FilterExpression='schedule_time BETWEEN :start_time AND :end_time',
            ExpressionAttributeValues={
                ':start_time': start_time.isoformat(),
                ':end_time': end_time.isoformat()
            }
        )
        
        schedules = response.get('Items', [])
        
        if not schedules:
            return 0.0
        
        completed_count = sum(1 for s in schedules if s.get('status') == 'completed')
        total_count = len(schedules)
        
        return round((completed_count / total_count) * 100, 1)
        
    except Exception as e:
        logger.error(f"Error getting schedule success rate: {str(e)}")
        return 0.0

def analyze_mediatailor_logs(logs_client, query_params: Dict[str, str], headers: Dict[str, str]) -> Dict[str, Any]:
    """MediaTailor 로그 상세 분석"""
    try:
        # 시간 범위 설정
        hours = int(query_params.get('hours', '24'))
        end_time = datetime.now(timezone.utc)
        start_time = end_time - timedelta(hours=hours)
        
        log_group_name = f"/aws/mediatailor/{query_params.get('config_name', 'default')}"
        
        # 상세 분석 쿼리
        detailed_query = """
        fields @timestamp, eventType, numAds, fillRate, filledDuration, originAvailDuration, transcodeDuration
        | filter eventType = "FILLED_AVAIL" or eventType = "UNFILLED_AVAIL" or eventType = "MAKING_ADS_REQUEST"
        | sort @timestamp desc
        | limit 100
        """
        
        response = logs_client.start_query(
            logGroupName=log_group_name,
            startTime=int(start_time.timestamp()),
            endTime=int(end_time.timestamp()),
            queryString=detailed_query
        )
        
        # 결과 대기
        import time
        query_id = response['queryId']
        
        for _ in range(30):
            result = logs_client.get_query_results(queryId=query_id)
            if result['status'] == 'Complete':
                break
            time.sleep(1)
        
        # 결과 처리
        events = []
        for row in result.get('results', []):
            event = {}
            for i, field in enumerate(['timestamp', 'eventType', 'numAds', 'fillRate', 'filledDuration', 'originAvailDuration', 'transcodeDuration']):
                if i < len(row):
                    event[field] = row[i]['value']
            events.append(event)
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'success': True,
                'timeRange': {
                    'startTime': start_time.isoformat(),
                    'endTime': end_time.isoformat(),
                    'hours': hours
                },
                'events': events,
                'summary': {
                    'totalEvents': len(events),
                    'logGroupName': log_group_name
                }
            })
        }
        
    except Exception as e:
        logger.error(f"Error analyzing MediaTailor logs: {str(e)}")
        return create_error_response(500, f'Failed to analyze logs: {str(e)}', headers)

def execute_custom_query(logs_client, body: str, headers: Dict[str, str]) -> Dict[str, Any]:
    """커스텀 로그 쿼리 실행"""
    try:
        if not body:
            return create_error_response(400, 'Request body is required', headers)
        
        query_data = json.loads(body)
        
        log_group_name = query_data.get('logGroupName')
        query_string = query_data.get('queryString')
        hours = query_data.get('hours', 1)
        
        if not log_group_name or not query_string:
            return create_error_response(400, 'logGroupName and queryString are required', headers)
        
        # 시간 범위 설정
        end_time = datetime.now(timezone.utc)
        start_time = end_time - timedelta(hours=hours)
        
        # 쿼리 실행
        response = logs_client.start_query(
            logGroupName=log_group_name,
            startTime=int(start_time.timestamp()),
            endTime=int(end_time.timestamp()),
            queryString=query_string
        )
        
        # 결과 대기
        import time
        query_id = response['queryId']
        
        for _ in range(60):  # 커스텀 쿼리는 더 오래 기다림
            result = logs_client.get_query_results(queryId=query_id)
            if result['status'] == 'Complete':
                break
            time.sleep(1)
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'success': True,
                'queryId': query_id,
                'status': result['status'],
                'results': result.get('results', []),
                'statistics': result.get('statistics', {})
            })
        }
        
    except json.JSONDecodeError:
        return create_error_response(400, 'Invalid JSON in request body', headers)
    except Exception as e:
        logger.error(f"Error executing custom query: {str(e)}")
        return create_error_response(500, f'Failed to execute query: {str(e)}', headers)

def create_error_response(status_code: int, message: str, headers: Dict[str, str]) -> Dict[str, Any]:
    """표준화된 오류 응답 생성"""
    return {
        'statusCode': status_code,
        'headers': headers,
        'body': json.dumps({
            'success': False,
            'error': message,
            'timestamp': datetime.now(timezone.utc).isoformat()
        })
    } 