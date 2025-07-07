import json
import boto3
import logging
import time
from datetime import datetime, timezone
from botocore.exceptions import ClientError, NoCredentialsError
from typing import Dict, Any, Optional

# 로깅 설정
logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    MediaLive 연동 Lambda 함수 (Phase 3 & 4)
    
    지원하는 작업:
    - GET /medialive/channel/{channelId}/test - 채널 연결 테스트
    - POST /medialive/channel/{channelId}/schedule - SCTE-35 스케줄 생성
    - DELETE /medialive/channel/{channelId}/schedule/{actionName} - SCTE-35 스케줄 삭제
    """
    
    try:
        # CORS 헤더 (Phase 4: DELETE 메소드 추가)
        headers = {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }
        
        # OPTIONS 요청 처리 (CORS preflight)
        if event.get('httpMethod') == 'OPTIONS':
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps({'message': 'CORS preflight successful'})
            }
        
        # 요청 파라미터 추출
        http_method = event.get('httpMethod')
        path = event.get('path', '')
        path_parameters = event.get('pathParameters') or {}
        query_parameters = event.get('queryStringParameters') or {}
        body = event.get('body')
        
        # 리전 설정
        region = query_parameters.get('region', 'ap-northeast-2')
        
        logger.info(f"Processing {http_method} request for path: {path}")
        logger.info(f"Path parameters: {path_parameters}")
        
        # MediaLive 클라이언트 생성
        try:
            medialive_client = boto3.client('medialive', region_name=region)
        except NoCredentialsError:
            return create_error_response(401, 'AWS credentials not found', headers)
        except Exception as e:
            return create_error_response(500, f'Failed to create MediaLive client: {str(e)}', headers)
        
        # 라우팅
        if http_method == 'GET':
            if '/channel/' in path and path.endswith('/test'):
                # 채널 연결 테스트 (Phase 3)
                channel_id = path_parameters.get('channelId')
                return test_channel_connection(medialive_client, channel_id, headers)
                
        elif http_method == 'POST':
            if '/channel/' in path and '/schedule' in path:
                # SCTE-35 스케줄 생성 (Phase 3)
                channel_id = path_parameters.get('channelId')
                return create_scte35_schedule(medialive_client, channel_id, body, headers)
                
        elif http_method == 'DELETE':
            if '/channel/' in path and '/schedule/' in path:
                # SCTE-35 스케줄 삭제 (Phase 4)
                channel_id = path_parameters.get('channelId')
                action_name = path_parameters.get('actionName')
                return delete_scte35_schedule(medialive_client, channel_id, action_name, headers)
        
        # 지원하지 않는 경로
        return create_error_response(404, 'Not Found', headers)
        
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        return create_error_response(500, f'Internal server error: {str(e)}', headers)

def test_channel_connection(medialive_client, channel_id: str, headers: Dict[str, str]) -> Dict[str, Any]:
    """MediaLive 채널 연결 테스트 (Phase 3)"""
    if not channel_id:
        return create_error_response(400, 'Channel ID is required', headers)
    
    try:
        # 채널 정보 조회
        response = medialive_client.describe_channel(ChannelId=channel_id)
        
        # 간단한 응답 데이터
        test_data = {
            'success': True,
            'channelId': channel_id,
            'channelName': response.get('Name', 'Unknown'),
            'channelState': response.get('State', 'Unknown'),
            'message': f'Successfully connected to {response.get("Name", "Unknown")}',
            'timestamp': datetime.now(timezone.utc).isoformat()
        }
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps(test_data)
        }
        
    except ClientError as e:
        error_code = e.response['Error']['Code']
        if error_code == 'NotFoundException':
            return create_error_response(404, f'Channel {channel_id} not found', headers)
        elif error_code == 'UnauthorizedOperation':
            return create_error_response(403, 'Access denied. Check IAM permissions', headers)
        else:
            return create_error_response(500, f'AWS Error: {error_code}', headers)
    except Exception as e:
        return create_error_response(500, f'Failed to test channel connection: {str(e)}', headers)

def create_scte35_schedule(medialive_client, channel_id: str, body: str, headers: Dict[str, str]) -> Dict[str, Any]:
    """SCTE-35 스케줄 생성 (Phase 3)"""
    if not channel_id:
        return create_error_response(400, 'Channel ID is required', headers)
    
    if not body:
        return create_error_response(400, 'Request body is required', headers)
    
    try:
        schedule_data = json.loads(body)
        
        # 필수 파라미터 검증
        action_name = schedule_data.get('actionName')
        schedule_time = schedule_data.get('scheduleTime')
        splice_event_id = schedule_data.get('spliceEventId')
        duration = schedule_data.get('duration')
        
        if not all([action_name, schedule_time, splice_event_id, duration]):
            return create_error_response(400, 'Missing required parameters: actionName, scheduleTime, spliceEventId, duration', headers)
        
        # ISO 시간을 UTC로 변환
        try:
            schedule_datetime = datetime.fromisoformat(schedule_time.replace('Z', '+00:00'))
            schedule_utc = schedule_datetime.strftime('%Y-%m-%dT%H:%M:%S.%fZ')
        except ValueError as e:
            return create_error_response(400, f'Invalid schedule time format: {str(e)}', headers)
        
        # MediaLive 스케줄 생성
        response = medialive_client.batch_update_schedule(
            ChannelId=channel_id,
            Creates={
                'ScheduleActions': [
                    {
                        'ActionName': action_name,
                        'ScheduleActionStartSettings': {
                            'FixedModeScheduleActionStartSettings': {
                                'Time': schedule_utc
                            }
                        },
                        'ScheduleActionSettings': {
                            'Scte35SpliceInsertSettings': {
                                'SpliceEventId': int(splice_event_id),
                                'Duration': int(duration)  # 밀리초 단위
                            }
                        }
                    }
                ]
            }
        )
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'success': True,
                'actionName': action_name,
                'scheduleTime': schedule_utc,
                'spliceEventId': splice_event_id,
                'duration': duration,
                'message': 'SCTE-35 schedule created successfully',
                'response': response
            }, default=str)
        }
        
    except json.JSONDecodeError:
        return create_error_response(400, 'Invalid JSON in request body', headers)
    except ClientError as e:
        error_code = e.response['Error']['Code']
        error_message = e.response['Error']['Message']
        
        if error_code == 'NotFoundException':
            return create_error_response(404, f'Channel {channel_id} not found', headers)
        elif error_code == 'ConflictException':
            return create_error_response(409, f'Schedule conflict: {error_message}', headers)
        elif error_code == 'BadRequestException':
            return create_error_response(400, f'Invalid request: {error_message}', headers)
        else:
            return create_error_response(500, f'AWS Error: {error_code} - {error_message}', headers)
    except Exception as e:
        return create_error_response(500, f'Failed to create SCTE-35 schedule: {str(e)}', headers)

def delete_scte35_schedule(medialive_client, channel_id: str, action_name: str, headers: Dict[str, str]) -> Dict[str, Any]:
    """SCTE-35 스케줄 삭제 (Phase 4)"""
    if not channel_id:
        return create_error_response(400, 'Channel ID is required', headers)
    
    if not action_name:
        return create_error_response(400, 'Action name is required', headers)
    
    try:
        # MediaLive 스케줄 삭제
        response = medialive_client.batch_update_schedule(
            ChannelId=channel_id,
            Deletes={
                'ActionNames': [action_name]
            }
        )
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'success': True,
                'actionName': action_name,
                'channelId': channel_id,
                'message': 'SCTE-35 schedule deleted successfully',
                'response': response
            }, default=str)
        }
        
    except ClientError as e:
        error_code = e.response['Error']['Code']
        error_message = e.response['Error']['Message']
        
        if error_code == 'NotFoundException':
            return create_error_response(404, f'Channel {channel_id} or action {action_name} not found', headers)
        elif error_code == 'BadRequestException':
            return create_error_response(400, f'Invalid request: {error_message}', headers)
        else:
            return create_error_response(500, f'AWS Error: {error_code} - {error_message}', headers)
    except Exception as e:
        return create_error_response(500, f'Failed to delete SCTE-35 schedule: {str(e)}', headers)

def create_error_response(status_code: int, message: str, headers: Dict[str, str]) -> Dict[str, Any]:
    """표준화된 오류 응답 생성"""
    return {
        'statusCode': status_code,
        'headers': headers,
        'body': json.dumps({
            'error': True,
            'message': message,
            'statusCode': status_code
        })
    } 