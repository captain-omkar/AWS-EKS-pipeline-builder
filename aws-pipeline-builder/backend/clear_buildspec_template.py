#!/usr/bin/env python3
"""
Clear the buildspec template from DynamoDB to ensure fresh start
"""

import boto3
import json
import os

# Load configuration
CONFIG_PATH = os.environ.get('CONFIG_PATH', 'appsettings.json')

def load_app_settings():
    """Load application settings from appsettings.json"""
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, 'r') as f:
            return json.load(f)
    return {}

def get_aws_session():
    """Create AWS session with credential fallback logic"""
    app_settings = load_app_settings()
    aws_config = app_settings.get('aws', {})
    region = aws_config.get('region', 'us-east-1')
    credentials = aws_config.get('credentials', {})
    
    # Try explicit credentials first
    if credentials.get('access_key_id') and credentials.get('secret_access_key'):
        session = boto3.Session(
            aws_access_key_id=credentials['access_key_id'],
            aws_secret_access_key=credentials['secret_access_key'],
            aws_session_token=credentials.get('session_token'),
            region_name=region
        )
        print("✅ Using AWS credentials from appsettings.json")
    else:
        # Fall back to default credential chain (env vars, instance profile, etc.)
        session = boto3.Session(region_name=region)
        print("✅ Using AWS credentials from instance profile/environment")
    
    return session

def main():
    """Clear buildspec template from DynamoDB"""
    try:
        # Get DynamoDB client
        session = get_aws_session()
        dynamodb = session.resource('dynamodb')
        
        # Get table name from config
        app_settings = load_app_settings()
        dynamodb_config = app_settings.get('dynamodb', {})
        table_name = dynamodb_config.get('table_name', 'aws-pipeline-builder-metadata')
        
        table = dynamodb.Table(table_name)
        
        # Delete buildspec template
        template_key = '_TEMPLATE_buildspec'
        table.delete_item(Key={'pipeline_name': template_key})
        
        print(f"✅ Successfully cleared buildspec template from DynamoDB table: {table_name}")
        
    except Exception as e:
        print(f"❌ Error clearing buildspec template: {str(e)}")

if __name__ == "__main__":
    main()