import json
import boto3
import csv
import io
from datetime import datetime, timedelta
from decimal import Decimal
import logging

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')
s3 = boto3.client('s3')

# Table names (will be replaced by environment variables)
AD_INVENTORY_TABLE = 'Adsynk-AdInventory'
AD_PERFORMANCE_TABLE = 'Adsynk-AdPerformance'
AD_SCHEDULE_TABLE = 'Adsynk-AdSchedule'

def lambda_handler(event, context):
    """Main Lambda handler for Ad Management API"""
    try:
        # Parse the event
        http_method = event.get('httpMethod', 'GET')
        path = event.get('path', '')
        path_parameters = event.get('pathParameters', {})
        query_parameters = event.get('queryStringParameters', {}) or {}
        
        logger.info(f"Request: {http_method} {path}")
        logger.info(f"Path parameters: {path_parameters}")
        logger.info(f"Query parameters: {query_parameters}")
        
        # Route the request
        if path.startswith('/api/ads'):
            return handle_ads_api(http_method, path, path_parameters, query_parameters)
        elif path.startswith('/api/schedule'):
            return handle_schedule_api(http_method, path, query_parameters)
        elif path.startswith('/api/analytics/export'):
            return handle_analytics_export(http_method, path, query_parameters)
        else:
            return create_response(404, {'error': 'Endpoint not found'})
            
    except Exception as e:
        logger.error(f"Error in lambda_handler: {str(e)}")
        return create_response(500, {'error': 'Internal server error'})

def handle_ads_api(http_method, path, path_parameters, query_parameters):
    """Handle ads API endpoints"""
    
    # Extract ad_id from path if present
    ad_id = path_parameters.get('ad_id') if path_parameters else None
    
    if http_method == 'GET':
        return get_ads()
    elif http_method == 'POST':
        return create_ad(query_parameters)
    elif http_method == 'PUT' and ad_id:
        # Handle PUT /api/ads/{ad_id}/status for active toggle
        if path.endswith('/status'):
            return update_ad_status(ad_id, query_parameters)
        else:
            return create_response(404, {'error': 'Endpoint not found'})
    elif http_method == 'DELETE' and ad_id:
        # Handle DELETE /api/ads/{ad_id} for ad deletion
        return delete_ad(ad_id)
    else:
        return create_response(405, {'error': 'Method not allowed'})

def handle_schedule_api(http_method, path, query_parameters):
    """Handle schedule API endpoints"""
    if http_method == 'GET':
        return get_schedules()
    elif http_method == 'POST':
        return create_schedule(query_parameters)
    else:
        return create_response(405, {'error': 'Method not allowed'})

def handle_analytics_export(http_method, path, query_parameters):
    """Handle analytics export API endpoint"""
    if http_method == 'GET':
        return export_analytics_csv(query_parameters)
    else:
        return create_response(405, {'error': 'Method not allowed'})

def get_ads():
    """Get all ads from DynamoDB"""
    try:
        table = dynamodb.Table(AD_INVENTORY_TABLE)
        response = table.scan()
        ads = response.get('Items', [])
        
        # Convert Decimal to int for JSON serialization
        for ad in ads:
            if 'duration' in ad:
                ad['duration'] = int(ad['duration'])
        
        return create_response(200, ads)
    except Exception as e:
        logger.error(f"Error getting ads: {str(e)}")
        return create_response(500, {'error': 'Failed to get ads'})

def create_ad(data):
    """Create a new ad"""
    try:
        # This is a simplified version - in real implementation, you'd validate data
        ad_id = f"ad_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        # Handle active field from frontend
        active_status = data.get('active', True)
        if isinstance(active_status, str):
            active_status = active_status.lower() == 'true'
        
        ad_data = {
            'ad_id': ad_id,
            'title': data.get('title', ''),
            'advertiser': data.get('advertiser', ''),
            'duration': int(data.get('duration', 30)),
            'active': str(active_status).lower(),  # Store as string for consistency
            'upload_status': 'PENDING',
            'created_at': datetime.now().isoformat()
        }
        
        table = dynamodb.Table(AD_INVENTORY_TABLE)
        table.put_item(Item=ad_data)
        
        return create_response(201, {'ad_id': ad_id, 'message': 'Ad created successfully'})
    except Exception as e:
        logger.error(f"Error creating ad: {str(e)}")
        return create_response(500, {'error': 'Failed to create ad'})

def update_ad_status(ad_id, data):
    """Update ad active status"""
    try:
        table = dynamodb.Table(AD_INVENTORY_TABLE)
        
        # Get current ad data
        response = table.get_item(Key={'ad_id': ad_id})
        if 'Item' not in response:
            return create_response(404, {'error': 'Ad not found'})
        
        # Parse active status
        active_status = data.get('active', True)
        if isinstance(active_status, str):
            active_status = active_status.lower() == 'true'
        
        # Update the ad
        table.update_item(
            Key={'ad_id': ad_id},
            UpdateExpression='SET active = :active, updated_at = :updated_at',
            ExpressionAttributeValues={
                ':active': str(active_status).lower(),
                ':updated_at': datetime.now().isoformat()
            }
        )
        
        return create_response(200, {
            'ad_id': ad_id,
            'active': str(active_status).lower(),
            'message': f'Ad status updated to {"active" if active_status else "inactive"}'
        })
        
    except Exception as e:
        logger.error(f"Error updating ad status: {str(e)}")
        return create_response(500, {'error': 'Failed to update ad status'})

def delete_ad(ad_id):
    """Delete an ad"""
    try:
        # First check if ad exists
        table = dynamodb.Table(AD_INVENTORY_TABLE)
        response = table.get_item(Key={'ad_id': ad_id})
        if 'Item' not in response:
            return create_response(404, {'error': 'Ad not found'})
        
        # Check if ad is used in any active schedules
        schedule_table = dynamodb.Table(AD_SCHEDULE_TABLE)
        schedule_response = schedule_table.scan(
            FilterExpression='ad_id = :ad_id',
            ExpressionAttributeValues={':ad_id': ad_id}
        )
        
        active_schedules = [s for s in schedule_response.get('Items', []) 
                          if s.get('status') in ['scheduled', 'active']]
        
        if active_schedules:
            return create_response(400, {
                'error': 'Cannot delete ad with active schedules',
                'active_schedules': len(active_schedules)
            })
        
        # Delete the ad
        table.delete_item(Key={'ad_id': ad_id})
        
        return create_response(200, {
            'ad_id': ad_id,
            'message': 'Ad deleted successfully'
        })
        
    except Exception as e:
        logger.error(f"Error deleting ad: {str(e)}")
        return create_response(500, {'error': 'Failed to delete ad'})

def get_schedules():
    """Get all schedules from DynamoDB"""
    try:
        table = dynamodb.Table(AD_SCHEDULE_TABLE)
        response = table.scan()
        schedules = response.get('Items', [])
        
        # Convert Decimal to int for JSON serialization
        for schedule in schedules:
            if 'duration' in schedule:
                schedule['duration'] = int(schedule['duration'])
        
        return create_response(200, schedules)
    except Exception as e:
        logger.error(f"Error getting schedules: {str(e)}")
        return create_response(500, {'error': 'Failed to get schedules'})

def create_schedule(data):
    """Create a new schedule"""
    try:
        schedule_id = f"schedule_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        schedule_data = {
            'schedule_id': schedule_id,
            'ad_id': data.get('ad_id', ''),
            'schedule_time': data.get('schedule_time', ''),
            'event_name': data.get('event_name', ''),
            'duration': int(data.get('duration', 30)),
            'status': 'scheduled',
            'created_at': datetime.now().isoformat()
        }
        
        table = dynamodb.Table(AD_SCHEDULE_TABLE)
        table.put_item(Item=schedule_data)
        
        return create_response(201, {'schedule_id': schedule_id, 'message': 'Schedule created successfully'})
    except Exception as e:
        logger.error(f"Error creating schedule: {str(e)}")
        return create_response(500, {'error': 'Failed to create schedule'})

def export_analytics_csv(query_parameters):
    """Export analytics data as CSV"""
    try:
        # Parse date parameters
        start_date = query_parameters.get('start', (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d'))
        end_date = query_parameters.get('end', datetime.now().strftime('%Y-%m-%d'))
        
        # Get performance data
        performance_data = get_performance_data(start_date, end_date)
        
        # Get ad inventory data for mapping
        ads_data = get_ads_inventory()
        
        # Generate CSV
        csv_data = generate_analytics_csv(performance_data, ads_data)
        
        # Return CSV as response
        return create_csv_response(csv_data, f"ad_analytics_{start_date}_to_{end_date}.csv")
        
    except Exception as e:
        logger.error(f"Error exporting analytics: {str(e)}")
        return create_response(500, {'error': 'Failed to export analytics'})

def get_performance_data(start_date, end_date):
    """Get performance data from DynamoDB"""
    try:
        table = dynamodb.Table(AD_PERFORMANCE_TABLE)
        
        # Convert dates to ISO format for DynamoDB query
        start_iso = f"{start_date}T00:00:00"
        end_iso = f"{end_date}T23:59:59"
        
        # Scan with filter (in production, use GSI for better performance)
        response = table.scan(
            FilterExpression='#ts BETWEEN :start AND :end',
            ExpressionAttributeNames={'#ts': 'timestamp'},
            ExpressionAttributeValues={
                ':start': start_iso,
                ':end': end_iso
            }
        )
        
        return response.get('Items', [])
    except Exception as e:
        logger.error(f"Error getting performance data: {str(e)}")
        return []

def get_ads_inventory():
    """Get ads inventory for mapping"""
    try:
        table = dynamodb.Table(AD_INVENTORY_TABLE)
        response = table.scan()
        ads = response.get('Items', [])
        
        # Create a mapping dictionary
        ads_map = {}
        for ad in ads:
            ads_map[ad['ad_id']] = ad
        
        return ads_map
    except Exception as e:
        logger.error(f"Error getting ads inventory: {str(e)}")
        return {}

def generate_analytics_csv(performance_data, ads_data):
    """Generate CSV data from performance and ads data"""
    # Aggregate performance data by ad_id
    ad_stats = {}
    
    for event in performance_data:
        ad_id = event.get('ad_id', 'unknown')
        event_type = event.get('event_type', 'unknown')
        
        if ad_id not in ad_stats:
            ad_stats[ad_id] = {
                'ad_id': ad_id,
                'insertions': 0,
                'success': 0,
                'failure': 0,
                'total_duration': 0
            }
        
        if event_type == 'insertion':
            ad_stats[ad_id]['insertions'] += 1
        elif event_type == 'success':
            ad_stats[ad_id]['success'] += 1
        elif event_type == 'failure':
            ad_stats[ad_id]['failure'] += 1
        
        # Add duration if available
        duration = event.get('duration', 0)
        if isinstance(duration, Decimal):
            duration = int(duration)
        ad_stats[ad_id]['total_duration'] += duration
    
    # Create CSV content
    csv_buffer = io.StringIO()
    writer = csv.writer(csv_buffer)
    
    # Write header
    writer.writerow([
        '광고ID', '광고명', '광고사업자', '삽입횟수', 
        '성공횟수', '실패횟수', '성공률(%)', '총지속시간(초)'
    ])
    
    # Write data rows
    for ad_id, stats in ad_stats.items():
        ad_info = ads_data.get(ad_id, {})
        ad_name = ad_info.get('title', 'Unknown')
        advertiser = ad_info.get('advertiser', 'Unknown')
        
        insertions = stats['insertions']
        success = stats['success']
        failure = stats['failure']
        
        # Calculate success rate
        success_rate = 0
        if insertions > 0:
            success_rate = round((success / insertions) * 100, 1)
        
        writer.writerow([
            ad_id,
            ad_name,
            advertiser,
            insertions,
            success,
            failure,
            success_rate,
            stats['total_duration']
        ])
    
    return csv_buffer.getvalue()

def create_csv_response(csv_data, filename):
    """Create CSV response with proper headers"""
    return {
        'statusCode': 200,
        'headers': {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': f'attachment; filename="{filename}"',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
            'Access-Control-Allow-Methods': 'GET,OPTIONS'
        },
        'body': csv_data
    }

def create_response(status_code, body):
    """Create a standard JSON response"""
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
            'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
        },
        'body': json.dumps(body, default=str)
    } 