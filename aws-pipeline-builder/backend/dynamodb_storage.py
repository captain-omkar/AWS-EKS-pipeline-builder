"""
DynamoDB storage for pipeline metadata
"""
import boto3
from boto3.dynamodb.conditions import Key
from datetime import datetime
from typing import Dict, List, Optional, Any


class DynamoDBStorage:
    def __init__(self, config: Dict[str, Any], session: boto3.Session):
        """
        Initialize DynamoDB storage
        
        Args:
            config: DynamoDB configuration from appsettings
            session: boto3 session with credentials and region
        """
        self.config = config
        self.table_name = config.get('table_name', 'aws-pipeline-builder-metadata')
        self.dynamodb = session.resource('dynamodb')
        self.table = None
        self._ensure_table_exists()
    
    def _ensure_table_exists(self):
        """Create table if it doesn't exist"""
        try:
            self.table = self.dynamodb.Table(self.table_name)
            self.table.load()
            print(f"✅ Using DynamoDB table: {self.table_name}")
        except self.dynamodb.meta.client.exceptions.ResourceNotFoundException:
            print(f"📦 Creating DynamoDB table: {self.table_name}")
            self._create_table()
    
    def _create_table(self):
        """Create the DynamoDB table"""
        try:
            # Build tags from config
            tags = []
            config_tags = self.config.get('tags', {})
            for key, value in config_tags.items():
                tags.append({'Key': key, 'Value': value})
            
            # Create table
            create_params = {
                'TableName': self.table_name,
                'KeySchema': [
                    {
                        'AttributeName': 'pipeline_name',
                        'KeyType': 'HASH'  # Partition key
                    }
                ],
                'AttributeDefinitions': [
                    {
                        'AttributeName': 'pipeline_name',
                        'AttributeType': 'S'
                    }
                ],
                'BillingMode': self.config.get('billing_mode', 'PAY_PER_REQUEST')
            }
            
            if tags:
                create_params['Tags'] = tags
                
            self.table = self.dynamodb.create_table(**create_params)
            
            # Wait for table to be created
            self.table.wait_until_exists()
            print(f"✅ DynamoDB table created: {self.table_name}")
            
        except Exception as e:
            print(f"❌ Error creating DynamoDB table: {str(e)}")
            raise
    
    def save_pipeline(self, pipeline_data: Dict[str, Any]) -> bool:
        """Save or update pipeline metadata"""
        try:
            if 'name' not in pipeline_data:
                raise ValueError("Pipeline name is required")
            
            # Prepare item for DynamoDB
            item = {
                'pipeline_name': pipeline_data['name'],
                'lastUpdated': datetime.now().isoformat()
            }
            
            # Copy all other fields
            for key, value in pipeline_data.items():
                if key != 'name':
                    item[key] = value
            
            # If createdAt doesn't exist, set it
            if 'createdAt' not in item:
                item['createdAt'] = item['lastUpdated']
            
            # Put item in DynamoDB
            self.table.put_item(Item=item)
            return True
            
        except Exception as e:
            print(f"❌ Error saving pipeline: {str(e)}")
            return False
    
    def get_pipeline(self, pipeline_name: str) -> Optional[Dict[str, Any]]:
        """Get pipeline metadata by name"""
        try:
            response = self.table.get_item(
                Key={'pipeline_name': pipeline_name}
            )
            
            if 'Item' in response:
                # Convert pipeline_name back to name for compatibility
                item = response['Item']
                item['name'] = item.pop('pipeline_name', pipeline_name)
                return item
            return None
            
        except Exception as e:
            print(f"❌ Error getting pipeline: {str(e)}")
            return None
    
    def list_pipelines(self) -> List[Dict[str, Any]]:
        """List all pipelines"""
        try:
            pipelines = []
            
            # Scan all items
            response = self.table.scan()
            pipelines.extend(response.get('Items', []))
            
            # Handle pagination
            while 'LastEvaluatedKey' in response:
                response = self.table.scan(
                    ExclusiveStartKey=response['LastEvaluatedKey']
                )
                pipelines.extend(response.get('Items', []))
            
            # Convert pipeline_name back to name for compatibility
            for pipeline in pipelines:
                pipeline['name'] = pipeline.pop('pipeline_name', '')
            
            # Sort by lastUpdated descending
            pipelines.sort(
                key=lambda x: x.get('lastUpdated', ''),
                reverse=True
            )
            
            return pipelines
            
        except Exception as e:
            print(f"❌ Error listing pipelines: {str(e)}")
            return []
    
    def delete_pipeline(self, pipeline_name: str) -> bool:
        """Delete pipeline metadata"""
        try:
            self.table.delete_item(
                Key={'pipeline_name': pipeline_name}
            )
            return True
            
        except Exception as e:
            print(f"❌ Error deleting pipeline: {str(e)}")
            return False
    
    def get_settings(self, setting_type: str) -> Optional[Dict[str, Any]]:
        """
        Get settings from DynamoDB
        
        Args:
            setting_type: Type of settings ('pipeline_settings' or 'env_suggestions')
            
        Returns:
            Settings dict or None if not found
        """
        try:
            # Use special key format for settings
            settings_key = f"_SETTINGS_{setting_type}"
            
            response = self.table.get_item(
                Key={'pipeline_name': settings_key}
            )
            
            if 'Item' in response:
                # Return the settings data without the key
                item = response['Item']
                return item.get('settings_data', {})
            return None
            
        except Exception as e:
            print(f"❌ Error getting settings: {str(e)}")
            return None
    
    def save_settings(self, setting_type: str, settings_data: Dict[str, Any]) -> bool:
        """
        Save settings to DynamoDB
        
        Args:
            setting_type: Type of settings ('pipeline_settings' or 'env_suggestions')
            settings_data: The settings data to save
            
        Returns:
            True if successful, False otherwise
        """
        try:
            # Use special key format for settings
            settings_key = f"_SETTINGS_{setting_type}"
            
            item = {
                'pipeline_name': settings_key,
                'settings_data': settings_data,
                'setting_type': setting_type,
                'lastUpdated': datetime.now().isoformat()
            }
            
            # Put item in DynamoDB
            self.table.put_item(Item=item)
            print(f"✅ Saved {setting_type} to DynamoDB")
            return True
            
        except Exception as e:
            print(f"❌ Error saving settings: {str(e)}")
            return False