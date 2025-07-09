import json
import boto3
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any
from botocore.exceptions import ClientError

# 로깅 설정
logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """CloudWatch Logs Analyzer Lambda 함수 (CloudFormation 버전)"""
    
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
        
        logger.info(f"Processing {http_method} request for path: {path}")
        
        # CloudWatch Logs 클라이언트 생성
        logs_client = boto3.client('logs')
        
        # 라우팅
        if http_method == 'GET':
            if path.endswith('/realtime'):
                return get_realtime_metrics(logs_client, query_parameters, headers)
            elif path.endswith('/mediatailor'):
                return analyze_mediatailor_logs(logs_client, query_parameters, headers)
        
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
        
        # MediaTailor 로그 그룹 이름
        log_group_name = f"/aws/mediatailor/{query_params.get('config_name', 'default')}"
        
        # 실제 성공률 계산
        actual_success_rate = calculate_actual_success_rate(
            logs_client, log_group_name, start_time, end_time
        )
        
        # 스케줄 성공률 (DynamoDB에서 조회)
        schedule_success_rate = get_schedule_success_rate(start_time, end_time)
        
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
                'metrics': {
                    'actualSuccessRate': actual_success_rate,
                    'scheduleSuccessRate': schedule_success_rate,
                    'avgTranscodeTime': 0.0,  # 간소화된 버전
                    'avgFillRate': 0.0,
                    'totalFilledAvails': 0
                },
                'timestamp': datetime.now(timezone.utc).isoformat()
            })
        }
        
    except Exception as e:
        logger.error(f"Error getting realtime metrics: {str(e)}")
        return create_error_response(500, f'Failed to get realtime metrics: {str(e)}', headers)

def calculate_actual_success_rate(logs_client, log_group_name: str, start_time: datetime, end_time: datetime) -> float:
    """MediaTailor 로그에서 실제 성공률 계산"""
    try:
        query = """
        fields @timestamp, eventType
        | filter eventType = "FILLED_AVAIL" or eventType = "MAKING_ADS_REQUEST"
        | stats count() by eventType
        """
        
        response = logs_client.start_query(
            logGroupName=log_group_name,
            startTime=int(start_time.timestamp()),
            endTime=int(end_time.timestamp()),
            queryString=query
        )
        
        query_id = response['queryId']
        
        # 쿼리 결과 대기
        import time
        for _ in range(30):
            result = logs_client.get_query_results(queryId=query_id)
            if result['status'] == 'Complete':
                break
            time.sleep(1)
        
        # 결과 분석
        filled_count = 0
        request_count = 0
        
        for row in result.get('results', []):
            if len(row) >= 2:
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

def get_schedule_success_rate(start_time: datetime, end_time: datetime) -> float:
    """DynamoDB에서 스케줄 성공률 조회"""
    try:
        import os
        dynamodb = boto3.resource('dynamodb')
        table_name = os.environ.get('AD_SCHEDULE_TABLE', 'AdSchedule')
        table = dynamodb.Table(table_name)
        
        # 시간 범위 내의 스케줄 조회
        response = table.scan(
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
        hours = int(query_params.get('hours', '24'))
        end_time = datetime.now(timezone.utc)
        start_time = end_time - timedelta(hours=hours)
        
        log_group_name = f"/aws/mediatailor/{query_params.get('config_name', 'default')}"
        
        # 상세 분석 쿼리
        detailed_query = """
        fields @timestamp, eventType
        | filter eventType = "FILLED_AVAIL" or eventType = "UNFILLED_AVAIL" or eventType = "MAKING_ADS_REQUEST"
        | sort @timestamp desc
        | limit 50
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
            if len(row) >= 2:
                event = {
                    'timestamp': row[0]['value'],
                    'eventType': row[1]['value']
                }
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